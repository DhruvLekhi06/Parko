import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api.js';

const EVENTS = ['slot', 'venue', 'hold', 'reservation'];

export function useLiveEvents() {
  const [status, setStatus] = useState('connecting');
  const listeners = useRef(new Set());

  useEffect(() => {
    let es;
    let alive = true;
    const relay = (type) => (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      listeners.current.forEach((fn) => {
        try {
          fn(type, data);
        } catch (err) {
          console.error(err);
        }
      });
    };
    try {
      es = new EventSource(apiUrl('/api/events'));
    } catch {
      setStatus('closed');
      return undefined;
    }
    EVENTS.forEach((t) => es.addEventListener(t, relay(t)));
    es.onopen = () => alive && setStatus('open');
    es.onerror = () => alive && setStatus(es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
    return () => {
      alive = false;
      es.close();
    };
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { status, connected: status === 'open', subscribe };
}
