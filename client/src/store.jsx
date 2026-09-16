import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useLiveEvents } from './hooks/useLiveEvents.js';
import { useGeolocation, metresBetween } from './hooks/useGeolocation.js';

const Ctx = createContext(null);
export const WELCOME_KEY = 'spoton.welcomed';
export const ARRIVAL_RADIUS_M = 250;

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
  const [hold, setHold] = useState(null);
  const [session, setSession] = useState(null);
  const [serverFee, setServerFee] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [welcomed, setWelcomed] = useState(readWelcomed);
  const live = useLiveEvents();
  const position = useGeolocation();
  const holdRef = useRef(null);
  holdRef.current = hold;
  const arrivedFor = useRef(null);

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

  const setWalletBalance = useCallback((balance) => {
    if (typeof balance !== 'number') return;
    setUser((u) => (u ? { ...u, walletBalance: balance } : u));
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([api.activeHold(), api.activeSession()]);
      setHold(h?.hold ?? null);
      setSession(s?.session ?? null);
      setServerFee(s?.session ? { feeNow: s.feeNow ?? 0, dueNow: s.dueNow ?? 0, holdCredit: s.holdCredit ?? 0, elapsedMinutes: s.elapsedMinutes ?? 0, at: Date.now() } : null);
      if (typeof s?.walletBalance === 'number') setWalletBalance(s.walletBalance);
    } catch {
      /* keep whatever we have; screens surface their own errors */
    }
  }, [setWalletBalance]);

  useEffect(() => {
    refreshUser();
    refreshActive();
  }, [refreshUser, refreshActive]);

  useEffect(
    () =>
      live.subscribe((type, data) => {
        if (type !== 'hold') return;
        const h = holdRef.current;
        if (!h || data.id !== h.id) return;
        if (data.status && data.status !== 'active') {
          setHold(null);
          if (data.status === 'expired') toast(`Your hold on ${h.slotCode} at ${h.venueName} expired. The spot is open again.`, { kind: 'warn', duration: 6000 });
        }
      }),
    [live, toast]
  );

  useEffect(() => {
    if (!hold?.expiresAt) return undefined;
    const ms = new Date(hold.expiresAt).getTime() - Date.now();
    const id = window.setTimeout(() => refreshActive(), Math.max(800, ms + 1500));
    return () => window.clearTimeout(id);
  }, [hold, refreshActive]);

  const distanceToHoldM = hold && position.source === 'gps' && hold.venueLat != null ? metresBetween(position, { lat: hold.venueLat, lng: hold.venueLng }) : null;
  const arrived = distanceToHoldM != null && distanceToHoldM <= ARRIVAL_RADIUS_M;

  useEffect(() => {
    if (!arrived || !hold) return;
    if (arrivedFor.current === hold.id) return;
    arrivedFor.current = hold.id;
    toast(`You're at ${hold.venueName}. Head to ${hold.slotCode} and tap "I've parked".`, { kind: 'success', duration: 7000 });
  }, [arrived, hold, toast]);

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
      user, setUser, userError, refreshUser, setWalletBalance,
      hold, setHold, session, setSession, serverFee, setServerFee, refreshActive,
      distanceToHoldM, arrived,
      toasts, toast, dismissToast, live, position, welcomed, finishWelcome,
    }),
    [user, userError, refreshUser, setWalletBalance, hold, session, serverFee, refreshActive, distanceToHoldM, arrived, toasts, toast, dismissToast, live, position, welcomed, finishWelcome]
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
