import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const MAX_KM_FROM_CENTER = 120;

function kmBetween(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useGeolocation() {
  const [state, setState] = useState({ ...DEFAULT_CENTER, source: 'pending', reason: null });

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ ...DEFAULT_CENTER, source: 'default', reason: 'unsupported' });
      return;
    }
    setState((s) => ({ ...s, source: 'pending' }));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (kmBetween(here, DEFAULT_CENTER) > MAX_KM_FROM_CENTER) {
          setState({ ...DEFAULT_CENTER, source: 'default', reason: 'far', actual: here });
        } else {
          setState({ ...here, source: 'gps', reason: null });
        }
      },
      (err) => {
        setState({ ...DEFAULT_CENTER, source: 'default', reason: err.code === 1 ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  return { ...state, locate };
}
