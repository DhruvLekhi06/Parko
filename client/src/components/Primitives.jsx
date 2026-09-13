import { Component, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { useApp } from '../store.jsx';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';
import { goBack, navigate } from '../router.jsx';

export function Count({ value, className = '' }) {
  const v = useAnimatedNumber(Number(value) || 0);
  return (
    <span className={`num ${className}`}>
      {v.toLocaleString('en-IN')}
    </span>
  );
}

export function FillBar({ value = 0, tone = 'green', className = '', style }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`fill ${className}`} style={style} aria-hidden="true">
      <div className={`fill-bar tone-${tone}`} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

export function Skeleton({ w = '100%', h = 14, r = 8, className = '', style }) {
  return <div className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function Chip({ active, onClick, icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`chip ${active ? 'is-active' : ''} ${className}`} aria-pressed={!!active} onClick={onClick} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Pill({ tone = 'neutral', children, className = '', dot = false }) {
  return (
    <span className={`pill tone-${tone} ${className}`}>
      {dot ? <span className="pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Button({ variant = 'primary', size = 'md', block = false, loading = false, icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${loading ? 'is-loading' : ''} ${className}`} disabled={rest.disabled || loading} {...rest}>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ name, label, size = 'md', className = '', ...rest }) {
  return (
    <button type="button" className={`iconbtn iconbtn-${size} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={name} size={20} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, id }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </span>
    </label>
  );
}

export function ScreenHeader({ title, subtitle, back = true, fallback = '/', right, children, className = '', titleAs: T = 'h1' }) {
  return (
    <header className={`screen-head ${className}`}>
      {back ? <IconButton name="back" label="Back" onClick={() => goBack(fallback)} className="screen-back" /> : null}
      <div className="screen-head-text">
        {title ? <T className="screen-title">{title}</T> : null}
        {subtitle ? <div className="screen-sub">{subtitle}</div> : null}
        {children}
      </div>
      {right ? <div className="screen-head-right">{right}</div> : null}
    </header>
  );
}

export function EmptyState({ icon = 'info', title, body, action, onAction, tone = 'neutral' }) {
  return (
    <div className={`empty tone-${tone}`}>
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h2 className="empty-title">{title}</h2>
      {body ? <p className="empty-body">{body}</p> : null}
      {action ? (
        <Button variant="secondary" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const msg = error?.message || "Can't reach SpotOn right now.";
  return (
    <div className={`empty tone-red ${compact ? 'is-compact' : ''}`} role="alert">
      <div className="empty-icon">
        <Icon name="alert" size={24} />
      </div>
      <h2 className="empty-title">{msg}</h2>
      {error?.code === 'NETWORK' ? <p className="empty-body">Check that the SpotOn server is running, then try again.</p> : null}
      {onRetry ? (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.kind}`}>
          <Icon name={t.kind === 'success' ? 'check' : t.kind === 'warn' || t.kind === 'error' ? 'alert' : 'info'} size={18} />
          <span className="toast-msg">{t.message}</span>
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function LivePill() {
  const { live } = useApp();
  const show = useDelayedFlag(live.status !== 'open', 2500);
  if (!show) return null;
  const label = live.status === 'connecting' ? 'Connecting' : 'Reconnecting';
  return (
    <div className="livepill" role="status">
      <span className="livepill-dot" aria-hidden="true" />
      {label}
    </div>
  );
}

function useDelayedFlag(flag, ms) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!flag) {
      setOn(false);
      return undefined;
    }
    const id = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(id);
  }, [flag, ms]);
  return on && flag;
}

export function Sheet({ open, onClose, title, children, className = '', dismissible = true, desktopCenter = false, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
    first?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);
  if (!open) return null;
  return (
    <div className={`sheet-root ${desktopCenter ? 'is-center' : ''}`}>
      <div className="sheet-backdrop" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div ref={ref} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function GoExplore({ children = 'Find a spot', ...rest }) {
  return (
    <Button icon="compass" onClick={() => navigate('/')} {...rest}>
      {children}
    </Button>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="empty tone-red" role="alert">
            <div className="empty-icon">
              <Icon name="alert" size={24} />
            </div>
            <h2 className="empty-title">Something broke on this screen</h2>
            <p className="empty-body">Reload to pick up where you left off.</p>
            <Button variant="secondary" icon="refresh" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
