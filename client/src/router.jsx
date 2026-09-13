import { useSyncExternalStore } from 'react';

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to, { replace = false } = {}) {
  if (to === snapshot() && !replace) return;
  window.history[replace ? 'replaceState' : 'pushState']({ spoton: true }, '', to);
  emit();
}

export function goBack(fallback = '/') {
  if (window.history.state?.spoton) window.history.back();
  else navigate(fallback, { replace: true });
}

export function useLocation() {
  return useSyncExternalStore(subscribe, snapshot);
}

const ROUTES = [
  ['explore', /^\/$/],
  ['venue', /^\/venue\/([^/]+)$/],
  ['floor', /^\/floor\/([^/]+)$/],
  ['car', /^\/car$/],
  ['profile', /^\/profile$/],
];

export function useRoute() {
  const loc = useLocation();
  const [pathname, search = ''] = loc.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  for (const [name, re] of ROUTES) {
    const m = pathname.match(re);
    if (m) return { name, params: { id: m[1] ? decodeURIComponent(m[1]) : undefined }, query, pathname };
  }
  return { name: 'notfound', params: {}, query, pathname };
}

export function Link({ to, replace, onClick, children, ...rest }) {
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
