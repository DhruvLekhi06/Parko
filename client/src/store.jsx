import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useLiveEvents } from './hooks/useLiveEvents.js';
import { useGeolocation } from './hooks/useGeolocation.js';

const Ctx = createContext(null);
export const WELCOME_KEY = 'spoton.welcomed';

function readWelcomed() {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userError, setUserError] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [session, setSession] = useState(null);
  const [serverFee, setServerFee] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [welcomed, setWelcomed] = useState(readWelcomed);
  const live = useLiveEvents();
  const position = useGeolocation();
  const reservationRef = useRef(null);
  reservationRef.current = reservation;

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-2), { id, message, kind: opts.kind || 'info' }]);
      window.setTimeout(() => dismissToast(id), opts.duration || 4200);
      return id;
    },
    [dismissToast]
  );

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
      setUserError(null);
      return u;
    } catch (e) {
      setUserError(e);
      return null;
    }
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.activeReservation(), api.activeSession()]);
      setReservation(r?.reservation ?? null);
      setSession(s?.session ?? null);
      setServerFee(s?.session ? { feeNow: s.feeNow ?? 0, elapsedMinutes: s.elapsedMinutes ?? 0, at: Date.now() } : null);
    } catch {
      /* keep whatever we have; screens surface their own errors */
    }
  }, []);

  useEffect(() => {
    refreshUser();
    refreshActive();
  }, [refreshUser, refreshActive]);

  useEffect(
    () =>
      live.subscribe((type, data) => {
        if (type !== 'reservation') return;
        const r = reservationRef.current;
        if (!r || data.id !== r.id) return;
        if (data.status && data.status !== 'active') {
          setReservation(null);
          if (data.status === 'expired') toast(`Your hold on ${r.slotCode} expired. The spot is open again.`, { kind: 'warn', duration: 6000 });
        }
      }),
    [live, toast]
  );

  useEffect(() => {
    if (!reservation?.expiresAt) return undefined;
    const ms = new Date(reservation.expiresAt).getTime() - Date.now();
    const id = window.setTimeout(() => refreshActive(), Math.max(800, ms + 1500));
    return () => window.clearTimeout(id);
  }, [reservation, refreshActive]);

  const finishWelcome = useCallback(() => {
    try {
      window.localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* private mode */
    }
    setWelcomed(true);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      userError,
      refreshUser,
      reservation,
      setReservation,
      session,
      setSession,
      serverFee,
      setServerFee,
      refreshActive,
      toasts,
      toast,
      dismissToast,
      live,
      position,
      welcomed,
      finishWelcome,
    }),
    [user, userError, refreshUser, reservation, session, serverFee, refreshActive, toasts, toast, dismissToast, live, position, welcomed, finishWelcome]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useLiveEvent(handler, deps = []) {
  const { live } = useApp();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => live.subscribe((type, data) => ref.current(type, data)), [live, ...deps]);
}
