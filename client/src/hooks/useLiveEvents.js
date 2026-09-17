import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiUrl } from '../api.js';

const EVENTS = ['slot', 'venue', 'hold', 'reservation'];
const POLL_MS = 8000;
const FORCE_POLL = import.meta.env.VITE_LIVE === 'poll';

export function useLiveEvents() {
  const [status, setStatus] = useState('connecting');
  const listeners = useRef(new Set());
  const watches = useRef(new Map());
  const slotSnap = useRef(new Map());
  const holdSnap = useRef(null);
  const mode = useRef(FORCE_POLL ? 'poll' : 'sse');

  const emit = useCallback((type, data) => {
    listeners.current.forEach((fn) => {
      try {
        fn(type, data);
      } catch (err) {
        console.error(err);
      }
    });
  }, []);

  const poll = useCallback(async () => {
    const venues = new Set();
    let floor = '';
    watches.current.forEach((w) => {
      (w.venues || []).forEach((v) => venues.add(v));
      if (w.floor) floor = w.floor;
    });
    try {
      const d = await api.live({ venues: [...venues].slice(0, 100).join(','), floor });
      setStatus('open');
      (d.venues || []).forEach((v) => emit('venue', v));
      if (floor) {
        const prev = slotSnap.current.get(floor) || new Map();
        const next = new Map();
        (d.slots || []).forEach((s) => {
          next.set(s.id, s.status);
          if (prev.size && prev.get(s.id) !== s.status) emit('slot', { slotId: s.id, floorId: floor, status: s.status });
        });
        slotSnap.current.set(floor, next);
      }
      const h = d.hold || null;
      if (holdSnap.current && (!h || h.id !== holdSnap.current)) emit('hold', { id: holdSnap.current, status: 'expired' });
      holdSnap.current = h ? h.id : null;
    } catch {
      setStatus('reconnecting');
    }
  }, [emit]);

  useEffect(() => {
    let es;
    let alive = true;
    let timer = 0;
    let failures = 0;
    const startPolling = () => {
      if (mode.current === 'poll' && timer) return;
      mode.current = 'poll';
      es?.close();
      poll();
      timer = window.setInterval(poll, POLL_MS);
    };
    if (mode.current === 'poll') startPolling();
    else {
      try {
        es = new EventSource(apiUrl('/api/events'));
        const relay = (type) => (e) => {
          let data;
          try {
            data = JSON.parse(e.data);
          } catch {
            return;
          }
          emit(type, data);
        };
        EVENTS.forEach((t) => es.addEventListener(t, relay(t)));
        es.onopen = () => {
          if (!alive) return;
          failures = 0;
          setStatus('open');
        };
        es.onerror = () => {
          if (!alive) return;
          failures++;
          if (es.readyState === EventSource.CLOSED || failures >= 2) startPolling();
          else setStatus('reconnecting');
        };
      } catch {
        startPolling();
      }
    }
    return () => {
      alive = false;
      es?.close();
      if (timer) window.clearInterval(timer);
    };
  }, [emit, poll]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const watch = useCallback((key, spec) => {
    if (spec) watches.current.set(key, spec);
    else watches.current.delete(key);
  }, []);

  return { status, connected: status === 'open', subscribe, watch, mode: mode.current };
}
