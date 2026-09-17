import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'spoton.install.dismissed';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
const isSafari = () => /safari/i.test(window.navigator.userAgent) && !/crios|fxios|edgios|chrome/i.test(window.navigator.userAgent);

function readDismissed() {
  try {
    const t = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return t && Date.now() - t < 7 * 86400000;
  } catch {
    return false;
  }
}

let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function useInstall() {
  const [, bump] = useState(0);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const fn = () => {
      setInstalled(isStandalone());
      bump((n) => n + 1);
    };
    listeners.add(fn);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', fn);
    return () => {
      listeners.delete(fn);
      mq.removeEventListener('change', fn);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return 'unavailable';
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (choice?.outcome === 'accepted') {
      deferred = null;
      setInstalled(true);
      return 'accepted';
    }
    return 'dismissed';
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const canPrompt = !!deferred;
  const ios = isIos() && isSafari();
  const mode = installed ? 'installed' : canPrompt ? 'prompt' : ios ? 'ios' : 'none';
  return { mode, installed, canPrompt, ios, dismissed, install, dismiss };
}
