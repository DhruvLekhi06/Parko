import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };

export function metresBetween(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

const OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 };

export function useGeolocation() {
  const [state, setState] = useState({ ...DEFAULT_CENTER, source: 'pending', reason: null, accuracy: null, heading: null, speed: null, updatedAt: null });
  const watchRef = useRef(null);
  const lastRef = useRef(null);

  const apply = useCallback((p) => {
    const here = { lat: p.coords.latitude, lng: p.coords.longitude };
    const last = lastRef.current;
    if (last && Date.now() - last.t < 3000 && metresBetween(last, here) < 8) return;
    lastRef.current = { ...here, t: Date.now() };
    setState({ ...here, source: 'gps', reason: null, accuracy: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speed: p.coords.speed ?? null, updatedAt: Date.now() });
  }, []);

  const fail = useCallback((err) => {
    setState((s) => (s.source === 'gps' ? s : { ...DEFAULT_CENTER, source: 'default', reason: err?.code === 1 ? 'denied' : 'unavailable', accuracy: null, heading: null, speed: null, updatedAt: null }));
  }, []);

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ ...DEFAULT_CENTER, source: 'default', reason: 'unsupported', accuracy: null, heading: null, speed: null, updatedAt: null });
      return;
    }
    setState((s) => (s.source === 'gps' ? s : { ...s, source: 'pending' }));
    navigator.geolocation.getCurrentPosition(apply, fail, OPTS);
    if (watchRef.current == null) watchRef.current = navigator.geolocation.watchPosition(apply, fail, OPTS);
  }, [apply, fail]);

  useEffect(() => {
    locate();
    return () => {
      if (watchRef.current != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [locate]);

  return { ...state, locate };
}
