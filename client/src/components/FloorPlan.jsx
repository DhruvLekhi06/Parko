import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { useReducedMotion } from '../hooks/useMedia.js';

export const U = 24;
const MIN_K = 0.7;
const MAX_K = 7;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const EV_PATH = 'M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z';
const ACC_PATHS = ['M12 4.5m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', 'M10.5 8v6.5H16l2.5 5', 'M10.5 10.5h5', 'M8.2 11.4a5 5 0 1 0 6.7 6.6'];

function entranceDir(e, floor) {
  if (e.x <= 0) return 'right';
  if (e.x + e.w >= floor.width) return 'left';
  if (e.y <= 0) return 'down';
  return 'up';
}

const ARROW = {
  right: 'M-5 -5 L1 0 L-5 5 M1 0 L-9 0',
  left: 'M5 -5 L-1 0 L5 5 M-1 0 L9 0',
  down: 'M-5 -5 L0 1 L5 -5 M0 1 L0 -9',
  up: 'M-5 5 L0 -1 L5 5 M0 -1 L0 9',
};

const SlotGlyph = memo(function SlotGlyph({ type, cx, cy, size }) {
  const r = size / 2;
  const k = (size * 0.72) / 24;
  return (
    <g className={`glyph glyph-${type}`} transform={`translate(${cx} ${cy})`}>
      <circle r={r} className="glyph-bg" />
      <g transform={`translate(${-12 * k} ${-12 * k}) scale(${k})`} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {type === 'ev' ? <path d={EV_PATH} fill="#fff" stroke="none" /> : ACC_PATHS.map((d) => <path key={d} d={d} />)}
      </g>
    </g>
  );
});

const Slot = memo(function Slot({ s, status, isMine, isSelected, isBest, showLabels, onActivate }) {
  const x = s.x * U + 1.5;
  const y = s.y * U + 1.5;
  const w = s.w * U - 3;
  const h = s.h * U - 3;
  const vertical = h >= w;
  const code = (s.code || '').split('-').pop();
  const typeLabel = s.type === 'ev' ? 'EV' : s.type === 'accessible' ? 'accessible' : 'standard';
  const statusLabel = isMine ? 'your spot' : status;
  const focusable = status === 'free' || isMine;
  const glyphSize = Math.min(w, h) * 0.66;
  return (
    <g
      className={`slot slot-${status} type-${s.type} ${isMine ? 'is-mine' : ''} ${isSelected ? 'is-selected' : ''} ${isBest ? 'is-best' : ''}`}
      data-slot={s.id}
      tabIndex={focusable ? 0 : -1}
      role="button"
      aria-label={`${s.code}, ${typeLabel}, ${statusLabel}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(s.id);
        }
      }}
    >
      {isMine ? <rect className="slot-ring" x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={7} /> : null}
      <rect className="slot-body" x={x} y={y} width={w} height={h} rx={4} />
      {s.type !== 'standard' ? (
        <SlotGlyph type={s.type} cx={vertical ? x + w / 2 : x + w - glyphSize / 2 - 3} cy={vertical ? (showLabels ? y + h - glyphSize / 2 - 3 : y + h / 2) : y + h / 2} size={glyphSize} />
      ) : null}
      {showLabels ? (
        <text className="slot-code" x={vertical ? x + w / 2 : x + 5} y={vertical ? y + 4 : y + h / 2} textAnchor={vertical ? 'middle' : 'start'} dominantBaseline={vertical ? 'hanging' : 'central'}>
          {code}
        </text>
      ) : null}
    </g>
  );
});

function partialPolyline(pts, t) {
  if (t >= 1 || pts.length < 2) return pts;
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let target = total * t;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const l = lens[i - 1];
    if (target >= l) {
      out.push(pts[i]);
      target -= l;
    } else {
      const k = l ? target / l : 0;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k });
      break;
    }
  }
  return out;
}

const RoutePath = memo(function RoutePath({ points }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      setT(1);
      return undefined;
    }
    let raf;
    const start = performance.now() + 120;
    const D = 1100;
    const tick = (now) => {
      const p = Math.max(0, Math.min(1, (now - start) / D));
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  const world = useMemo(() => points.map((p) => ({ x: p.x * U, y: p.y * U })), [points]);
  const shown = useMemo(() => partialPolyline(world, t), [world, t]);
  const pts = shown.map((p) => `${p.x},${p.y}`).join(' ');
  const start = world[0];
  const end = world[world.length - 1];
  return (
    <g className="route">
      <polyline className="route-under" points={pts} />
      <polyline className="route-dash" points={pts} />
      <circle className="route-start" cx={start.x} cy={start.y} r={U * 0.32} />
      {t >= 1 ? <circle className="route-end" cx={end.x} cy={end.y} r={U * 0.3} /> : null}
    </g>
  );
});

const Layers = memo(function Layers({ floor, slots, mySlotId, recommendedId, selectedId, showLabels, route, routeKey, entranceId, onActivate }) {
  const W = floor.width * U;
  const H = floor.height * U;
  return (
    <g className="floor-layers">
      <rect className="floor-slab" x={0} y={0} width={W} height={H} rx={10} />
      {(floor.zones || []).map((z) => {
        const fs = Math.min(z.w, z.h) * U * 0.7;
        return (
          <text key={`z-${z.label}-${z.x}-${z.y}`} className="zone-letter" x={(z.x + z.w / 2) * U} y={(z.y + z.h / 2) * U} textAnchor="middle" dominantBaseline="central" style={{ fontSize: Math.min(fs, 6 * U) }}>
            {z.label}
          </text>
        );
      })}
      {(floor.lanes || []).map((l, i) => {
        const horizontal = l.w >= l.h;
        return (
          <g key={`l-${i}`} className="lane">
            <rect x={l.x * U} y={l.y * U} width={l.w * U} height={l.h * U} />
            {horizontal ? (
              <line x1={l.x * U + U * 0.6} x2={(l.x + l.w) * U - U * 0.6} y1={(l.y + l.h / 2) * U} y2={(l.y + l.h / 2) * U} />
            ) : (
              <line y1={l.y * U + U * 0.6} y2={(l.y + l.h) * U - U * 0.6} x1={(l.x + l.w / 2) * U} x2={(l.x + l.w / 2) * U} />
            )}
          </g>
        );
      })}
      {(floor.pillars || []).map((p, i) => (
        <circle key={`p-${i}`} className="pillar" cx={(p.x + 0.5) * U} cy={(p.y + 0.5) * U} r={U * 0.2} />
      ))}
      {slots.map((s) => (
        <Slot key={s.id} s={s} status={s.status} isMine={s.id === mySlotId} isSelected={s.id === selectedId} isBest={!mySlotId && s.id === recommendedId && s.status === 'free'} showLabels={showLabels} onActivate={onActivate} />
      ))}
      {(floor.lifts || []).map((l) => (
        <g key={l.id} className="lift">
          <rect x={l.x * U + 1} y={l.y * U + 1} width={l.w * U - 2} height={l.h * U - 2} rx={5} />
          <g transform={`translate(${(l.x + l.w / 2) * U} ${(l.y + l.h / 2) * U})`}>
            <path d="M-7 -1 L-3.5 -6 L0 -1 M3.5 1 L7 6 L10.5 1" transform="translate(-1.5 0)" />
          </g>
        </g>
      ))}
      {(floor.entrances || []).map((e) => {
        const dir = entranceDir(e, floor);
        const active = e.id === entranceId;
        return (
          <g key={e.id} className={`entrance ${active ? 'is-active' : ''}`}>
            <rect x={e.x * U + 0.5} y={e.y * U + 0.5} width={e.w * U - 1} height={e.h * U - 1} rx={4} />
            <path d={ARROW[dir]} transform={`translate(${(e.x + e.w / 2) * U} ${(e.y + e.h / 2) * U}) scale(${U / 22})`} />
          </g>
        );
      })}
      {route?.points?.length ? <RoutePath key={routeKey} points={route.points} /> : null}
    </g>
  );
});

function Label({ x, y, text, tone = 'ink', anchor = 'start', pointer = null }) {
  const padX = 8;
  const w = Math.round(text.length * 6.4 + padX * 2);
  const h = 22;
  const lx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g className={`hud-label tone-${tone}`} transform={`translate(${Math.round(lx)} ${Math.round(y - h / 2)})`}>
      {pointer === 'down' ? <path className="hud-pointer" d={`M${w / 2 - 5} ${h} l5 5 l5 -5z`} /> : null}
      <rect width={w} height={h} rx={h / 2} />
      <text x={padX} y={h / 2} dominantBaseline="central">
        {text}
      </text>
    </g>
  );
}

export function FloorPlan({ floor, slots, selectedId, onSelectSlot, mySlotId, recommendedId, route, routeKey, entranceId, focusSlotId, focusKey, className = '' }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);
  const [gesturing, setGesturing] = useState(false);
  const ptrs = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const rectRef = useRef(null);
  const reduce = useReducedMotion();

  const W = floor.width * U;
  const H = floor.height * U;

  const fitView = useCallback(
    (sz) => {
      const pad = 20;
      const s = Math.min((sz.w - pad * 2) / W, (sz.h - pad * 2) / H);
      return { s, x: (sz.w - W * s) / 2, y: (sz.h - H * s) / 2 };
    },
    [W, H]
  );
  const baseS = size.w && size.h ? fitView(size).s : 1;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampView = useCallback(
    (v) => {
      const minX = size.w * 0.5 - W * v.s;
      const maxX = size.w * 0.5;
      const minY = size.h * 0.5 - H * v.s;
      const maxY = size.h * 0.5;
      return { s: v.s, x: clamp(v.x, minX, maxX), y: clamp(v.y, minY, maxY) };
    },
    [size, W, H]
  );

  useEffect(() => {
    if (!size.w || !size.h) return;
    const fit = fitView(size);
    const targetId = mySlotId || recommendedId;
    const t = fit.s * U < 18 && targetId ? slots.find((x) => x.id === targetId) : null;
    if (!t) {
      setView(fit);
      return;
    }
    const s = clamp(26 / U, fit.s * MIN_K, fit.s * MAX_K);
    setView(clampView({ s, x: size.w / 2 - (t.x + t.w / 2) * U * s, y: size.h * 0.42 - (t.y + t.h / 2) * U * s }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.id, size.w, size.h]);

  const zoomAt = useCallback(
    (px, py, f) => {
      setView((v) => {
        if (!v) return v;
        const s = clamp(v.s * f, baseS * MIN_K, baseS * MAX_K);
        const f2 = s / v.s;
        return clampView({ s, x: px - (px - v.x) * f2, y: py - (py - v.y) * f2 });
      });
    },
    [baseS, clampView]
  );

  const panBy = useCallback((dx, dy) => setView((v) => (v ? clampView({ ...v, x: v.x + dx, y: v.y + dy }) : v)), [clampView]);

  useEffect(() => {
    if (!focusSlotId || !size.w || !size.h) return;
    const s = slots.find((x) => x.id === focusSlotId);
    if (!s) return;
    const target = clamp(Math.min(baseS * 2.6, 34 / U), baseS * MIN_K, baseS * MAX_K);
    const cx = (s.x + s.w / 2) * U;
    const cy = (s.y + s.h / 2) * U;
    setView(clampView({ s: target, x: size.w / 2 - cx * target, y: size.h * 0.42 - cy * target }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSlotId, focusKey, size.w, size.h, floor.id]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
      const f = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0022));
      zoomAt(px, py, f);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const activate = useCallback((id) => onSelectSlot?.(id), [onSelectSlot]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = wrapRef.current;
    rectRef.current = el.getBoundingClientRect();
    const x = e.clientX - rectRef.current.left;
    const y = e.clientY - rectRef.current.top;
    ptrs.current.set(e.pointerId, { x, y });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    if (ptrs.current.size === 1) {
      gesture.current = { moved: false, x0: x, y0: y, t0: performance.now(), lastX: x, lastY: y, slot: e.target.closest?.('[data-slot]')?.dataset.slot || null };
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { moved: true, pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      setGesturing(true);
    }
  };

  const onPointerMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const r = rectRef.current || wrapRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ptrs.current.set(e.pointerId, { x, y });
    const g = gesture.current;
    if (!g) return;
    if (ptrs.current.size >= 2 && g.pinch) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const f = g.d ? d / g.d : 1;
      setView((v) => {
        if (!v) return v;
        const s = clamp(v.s * f, baseS * MIN_K, baseS * MAX_K);
        const f2 = s / v.s;
        return clampView({ s, x: mx - (g.mx - v.x) * f2, y: my - (g.my - v.y) * f2 });
      });
      g.d = d;
      g.mx = mx;
      g.my = my;
      return;
    }
    if (!g.moved) {
      if (Math.hypot(x - g.x0, y - g.y0) < 6) return;
      g.moved = true;
      setGesturing(true);
    }
    panBy(x - g.lastX, y - g.lastY);
    g.lastX = x;
    g.lastY = y;
  };

  const onPointerUp = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (ptrs.current.size === 1 && g?.pinch) {
      const [p] = [...ptrs.current.values()];
      gesture.current = { moved: true, lastX: p.x, lastY: p.y };
      return;
    }
    if (ptrs.current.size > 0) return;
    gesture.current = null;
    setGesturing(false);
    if (!g || g.moved || e.type === 'pointercancel') return;
    const now = performance.now();
    if (now - g.t0 > 450) return;
    const r = rectRef.current;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const lt = lastTap.current;
    if (lt && now - lt.t < 320 && Math.hypot(x - lt.x, y - lt.y) < 24) {
      lastTap.current = null;
      zoomAt(x, y, 1.9);
      return;
    }
    lastTap.current = { t: now, x, y };
    if (g.slot) activate(g.slot);
    else onSelectSlot?.(null);
  };

  const onKeyDown = (e) => {
    if (e.target !== wrapRef.current) return;
    const step = 60;
    if (e.key === 'ArrowLeft') panBy(step, 0);
    else if (e.key === 'ArrowRight') panBy(-step, 0);
    else if (e.key === 'ArrowUp') panBy(0, step);
    else if (e.key === 'ArrowDown') panBy(0, -step);
    else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 1.3);
    else if (e.key === '-') zoomAt(size.w / 2, size.h / 2, 1 / 1.3);
    else return;
    e.preventDefault();
  };

  const v = view || { s: baseS, x: 0, y: 0 };
  const showLabels = v.s * 9 >= 7.5;
  const toScreen = (ux, uy) => [ux * U * v.s + v.x, uy * U * v.s + v.y];

  const hud = useMemo(() => {
    if (!view) return null;
    const items = [];
    (floor.entrances || []).forEach((e) => {
      const dir = entranceDir(e, floor);
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      let x = 0;
      let y = 0;
      let anchor = 'start';
      if (dir === 'right') [x, y] = toScreen(e.x + e.w + 0.35, cy);
      else if (dir === 'left') {
        [x, y] = toScreen(e.x - 0.35, cy);
        anchor = 'end';
      } else if (cx < floor.width / 2) {
        [x, y] = toScreen(e.x + e.w + 0.35, cy);
      } else {
        [x, y] = toScreen(e.x - 0.35, cy);
        anchor = 'end';
      }
      items.push(<Label key={`e-${e.id}`} x={x} y={y} text={e.label || e.id} tone={e.id === entranceId ? 'green' : 'ink'} anchor={anchor} />);
    });
    if (view.s * U >= 12) {
      (floor.lifts || []).forEach((l) => {
        const [x, y] = toScreen(l.x + l.w / 2, l.y + l.h + 0.7);
        items.push(<Label key={`l-${l.id}`} x={x} y={y} text={l.label || l.id} tone="muted" anchor="middle" />);
      });
    }
    const best = recommendedId && !mySlotId ? slots.find((s) => s.id === recommendedId && s.status === 'free') : null;
    if (best) {
      const [x, y] = toScreen(best.x + best.w / 2, best.y - 0.15);
      items.push(<Label key="best" x={x} y={y - 16} text="Best for you" tone="green" anchor="middle" pointer="down" />);
    }
    const mine = mySlotId ? slots.find((s) => s.id === mySlotId) : null;
    if (mine) {
      const [x, y] = toScreen(mine.x + mine.w / 2, mine.y - 0.15);
      items.push(<Label key="mine" x={x} y={y - 16} text={`Your spot ${mine.code}`} tone="ink" anchor="middle" pointer="down" />);
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, floor, slots, recommendedId, mySlotId, entranceId]);

  return (
    <div
      ref={wrapRef}
      className={`floorplan ${gesturing ? 'is-gesturing' : ''} ${className}`}
      tabIndex={0}
      aria-label={`Floor plan ${floor.name}. Use arrow keys to pan, plus and minus to zoom.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <svg className="floorplan-svg" width="100%" height="100%" aria-hidden={false}>
        <g className={`world ${reduce ? 'no-anim' : ''}`} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }}>
          <Layers floor={floor} slots={slots} mySlotId={mySlotId} recommendedId={recommendedId} selectedId={selectedId} showLabels={showLabels} route={route} routeKey={routeKey} entranceId={entranceId} onActivate={activate} />
        </g>
        <g className="hud" aria-hidden="true">
          {hud}
        </g>
      </svg>
      <div className="floorplan-controls">
        <button type="button" className="mapbtn" aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.4)}>
          <Icon name="plus" size={18} />
        </button>
        <button type="button" className="mapbtn" aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.4)}>
          <Icon name="minus" size={18} />
        </button>
        <button type="button" className="mapbtn" aria-label="Fit floor to screen" onClick={() => setView(fitView(size))}>
          <Icon name="fit" size={18} />
        </button>
      </div>
    </div>
  );
}

export function Legend({ compact = false }) {
  const items = [
    ['free', 'Free'],
    ['occupied', 'Occupied'],
    ['reserved', 'Reserved'],
    ['mine', 'Yours'],
    ['ev', 'EV'],
    ['accessible', 'Accessible'],
  ];
  return (
    <ul className={`legend ${compact ? 'is-compact' : ''}`} aria-label="Legend">
      {items.map(([k, label]) => (
        <li key={k} className={`legend-item legend-${k}`}>
          <span className="legend-swatch" aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
