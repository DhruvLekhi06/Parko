import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

export function SlideToConfirm({ label, onConfirm, disabled = false, loading = false, icon = 'chevron', className = '' }) {
  const trackRef = useRef(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef(0);
  const maxRef = useRef(0);

  const measure = () => {
    const el = trackRef.current;
    if (!el) return 0;
    maxRef.current = el.clientWidth - 56 - 8;
    return maxRef.current;
  };

  useEffect(() => {
    if (!loading && !disabled) setDone(false);
  }, [loading, disabled]);

  const fire = useCallback(() => {
    setDone(true);
    setX(maxRef.current);
    onConfirm?.();
  }, [onConfirm]);

  const onDown = (e) => {
    if (disabled || loading || done) return;
    measure();
    startRef.current = e.clientX - x;
    setDrag(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    const nx = Math.max(0, Math.min(maxRef.current, e.clientX - startRef.current));
    setX(nx);
  };
  const onUp = () => {
    if (!drag) return;
    setDrag(false);
    if (x >= maxRef.current * 0.85) fire();
    else setX(0);
  };
  const onKey = (e) => {
    if (disabled || loading || done) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'End') {
      e.preventDefault();
      measure();
      fire();
    }
  };

  const pct = maxRef.current ? x / maxRef.current : 0;
  return (
    <div ref={trackRef} className={`slide ${drag ? 'is-drag' : ''} ${done || loading ? 'is-done' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled} onKeyDown={onKey}>
      <div className="slide-fill" style={{ width: `calc(${x}px + 60px)` }} aria-hidden="true" />
      <div className="slide-label" style={{ opacity: 1 - pct * 1.4 }}>
        {loading ? 'Working' : label}
      </div>
      <div className="slide-knob" style={{ transform: `translateX(${x}px)` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name={done ? 'check' : icon} size={22} />}
      </div>
    </div>
  );
}
