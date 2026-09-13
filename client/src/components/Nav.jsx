import { Icon } from './Icons.jsx';
import { LogoMark, Wordmark } from './Logo.jsx';
import { Link, useRoute } from '../router.jsx';
import { useApp } from '../store.jsx';

const ITEMS = [
  { to: '/', name: 'explore', icon: 'compass', label: 'Explore', match: (r) => r === 'explore' || r === 'venue' || r === 'floor' },
  { to: '/car', name: 'car', icon: 'car', label: 'My Car', match: (r) => r === 'car' },
  { to: '/profile', name: 'profile', icon: 'user', label: 'Profile', match: (r) => r === 'profile' },
];

export function BottomNav() {
  const route = useRoute();
  const { session, reservation } = useApp();
  const liveDot = !!(session || reservation);
  return (
    <nav className="bottomnav" aria-label="Primary">
      {ITEMS.map((it) => {
        const active = it.match(route.name);
        return (
          <Link key={it.name} to={it.to} className={`bottomnav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="bottomnav-icon">
              <Icon name={it.icon} size={22} />
              {it.name === 'car' && liveDot ? <span className="livedot" aria-label="Active parking" /> : null}
            </span>
            <span className="bottomnav-label">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Rail() {
  const route = useRoute();
  const { session, reservation, live } = useApp();
  const liveDot = !!(session || reservation);
  const status = live.status === 'open' ? 'Live' : live.status === 'connecting' ? 'Connecting' : 'Reconnecting';
  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-logo" aria-label="SpotOn home">
        <LogoMark size={30} />
      </Link>
      <div className="rail-items">
        {ITEMS.map((it) => {
          const active = it.match(route.name);
          return (
            <Link key={it.name} to={it.to} className={`rail-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <span className="rail-icon">
                <Icon name={it.icon} size={22} />
                {it.name === 'car' && liveDot ? <span className="livedot" aria-label="Active parking" /> : null}
              </span>
              <span className="rail-label">{it.label}</span>
            </Link>
          );
        })}
      </div>
      <div className={`rail-status status-${live.status}`} title={`Live updates: ${status}`}>
        <span className="rail-status-dot" aria-hidden="true" />
        <span className="rail-status-label">{status}</span>
      </div>
    </nav>
  );
}

export function Brand({ size = 18 }) {
  return (
    <div className="brand">
      <LogoMark size={size + 6} />
      <Wordmark size={size} />
    </div>
  );
}
