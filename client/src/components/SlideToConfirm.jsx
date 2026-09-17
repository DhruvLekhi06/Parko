import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

const KNOB = 52;
const PAD = 4;

export function SlideToConfirm({ label, onConfirm, disabled = false, loading = false, icon = 'chevron', delay = 520, className = '' }) {
  const trackRef = useRef(null);
  const knobRef = useRef(null);
  const fillRef = useRef(null);
  const labelRef = useRef(null);
  const d = useRef({ on: false, startX: 0, x: 0, max: 0, raf: 0, pid: null });
  const [done, setDone] = useState(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const max = () => {
    const el = trackRef.current;
    d.current.max = el ? Math.max(0, el.clientWidth - KNOB - PAD * 2) : 0;
    return d.current.max;
  };

  const paint = useCallback(() => {
    d.current.raf = 0;
    const { x, max: m } = d.current;
    if (knobRef.current) knobRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    if (fillRef.current) fillRef.current.style.width = `${x + KNOB + PAD}px`;
    if (labelRef.current) labelRef.current.style.opacity = String(Math.max(0, 1 - (m ? x / m : 0) * 1.6));
  }, []);
  const schedule = useCallback(() => {
    if (!d.current.raf) d.current.raf = requestAnimationFrame(paint);
  }, [paint]);

  const complete = useCallback(() => {
    if (done) return;
    max();
    d.current.on = false;
    d.current.x = d.current.max;
    trackRef.current?.classList.remove('is-drag');
    trackRef.current?.style.setProperty('--max', `${d.current.max}px`);
    paint();
    setDone(true);
    try {
      navigator.vibrate?.(14);
    } catch {
      /* no haptics */
    }
    window.setTimeout(() => onConfirmRef.current?.(), delay);
  }, [done, paint, delay]);

  const onDown = (e) => {
    if (disabled || loading || done || e.button > 0) return;
    max();
    const rect = trackRef.current.getBoundingClientRect();
    const knobLeft = rect.left + PAD + d.current.x;
    if (e.clientX < knobLeft - 24 || e.clientX > knobLeft + KNOB + 24) return;
    d.current.on = true;
    d.current.pid = e.pointerId;
    d.current.startX = e.clientX - d.current.x;
    trackRef.current.classList.add('is-drag');
    trackRef.current.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!d.current.on) return;
    d.current.x = Math.max(0, Math.min(d.current.max, e.clientX - d.current.startX));
    schedule();
  };
  const onUp = () => {
    if (!d.current.on) return;
    d.current.on = false;
    trackRef.current?.classList.remove('is-drag');
    if (d.current.x >= d.current.max * 0.8) complete();
    else {
      d.current.x = 0;
      paint();
    }
  };
  const onKey = (e) => {
    if (disabled || loading || done) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'End') {
      e.preventDefault();
      complete();
    }
  };

  useEffect(() => {
    if (!loading && !disabled && done) {
      setDone(false);
      d.current.x = 0;
      paint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, disabled]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      max();
      if (done) {
        d.current.x = d.current.max;
        paint();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [done, paint]);

  return (
    <div
      ref={trackRef}
      className={`slide ${done ? 'is-done' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={onKey}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      <div ref={fillRef} className="slide-fill" aria-hidden="true" />
      <div ref={labelRef} className="slide-label">
        {loading ? 'Working' : label}
      </div>
      <div ref={knobRef} className="slide-knob" aria-hidden="true">
        {loading ? <span className="spinner" /> : <Icon name={icon} size={22} />}
      </div>
      <div className="slide-check" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="44" height="44">
          <circle cx="24" cy="24" r="22" />
          <path d="M14 25l7 7 13-14" />
        </svg>
      </div>
    </div>
  );
}
