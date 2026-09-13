import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const ORDER = ['peek', 'half', 'full'];

export function BottomSheet({ snap, onSnap, peek = 156, halfRatio = 0.5, header, children, className = '', bodyRef }) {
  const rootRef = useRef(null);
  const innerBody = useRef(null);
  const [height, setHeight] = useState(0);
  const [dragOffset, setDragOffset] = useState(null);
  const drag = useRef(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleFor = useCallback(
    (s) => (s === 'full' ? height : s === 'half' ? Math.round(height * halfRatio) : Math.min(peek, height)),
    [height, halfRatio, peek]
  );
  const offsetFor = useCallback((s) => Math.max(0, height - visibleFor(s)), [height, visibleFor]);
  const restOffset = offsetFor(snap);

  useEffect(() => {
    if (bodyRef) bodyRef.current = innerBody.current;
  });

  useEffect(() => {
    if (snap !== 'full' && innerBody.current) innerBody.current.scrollTop = 0;
  }, [snap]);

  const settle = useCallback(
    (offset, velocity) => {
      const projected = offset + velocity * 140;
      let best = snap;
      let bestD = Infinity;
      ORDER.forEach((s) => {
        const d = Math.abs(offsetFor(s) - projected);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      });
      onSnap(best);
    },
    [offsetFor, onSnap, snap]
  );

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag.current) return;
    const fromBody = !!e.target.closest('.bsheet-body');
    const scrollable = snap === 'full' && fromBody;
    if (scrollable && innerBody.current && innerBody.current.scrollTop > 0) return;
    if (e.target.closest('button, a, input, select, textarea') && !fromBody) return;
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startOffset: restOffset,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
      moved: false,
      scrollable,
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      if (d.scrollable && dy < 0) {
        drag.current = null;
        return;
      }
      d.moved = true;
      try {
        rootRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = d.v * 0.4 + ((e.clientY - d.lastY) / dt) * 0.6;
    d.lastY = e.clientY;
    d.lastT = now;
    const maxOffset = offsetFor('peek');
    let next = d.startOffset + dy;
    if (next < 0) next *= 0.18;
    else if (next > maxOffset) next = maxOffset + (next - maxOffset) * 0.18;
    setDragOffset(next);
    e.preventDefault();
  };

  const endDrag = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const dy = e.clientY - d.startY;
    setDragOffset(null);
    settle(d.startOffset + dy, d.v);
  };

  const cycle = () => {
    const i = ORDER.indexOf(snap);
    onSnap(ORDER[(i + 1) % ORDER.length]);
  };

  const dragging = dragOffset != null;
  const offset = dragging ? dragOffset : restOffset;

  return (
    <section
      ref={rootRef}
      className={`bsheet snap-${snap} ${dragging ? 'is-dragging' : ''} ${className}`}
      style={{ transform: `translate3d(0, ${offset}px, 0)`, visibility: height ? 'visible' : 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Nearby parking"
    >
      <div className="bsheet-grip">
        <button type="button" className="bsheet-handle" aria-label={snap === 'full' ? 'Collapse list' : 'Expand list'} onClick={cycle}>
          <span />
        </button>
      </div>
      {header ? <div className="bsheet-head">{header}</div> : null}
      <div ref={innerBody} className="bsheet-body" style={{ overflowY: snap === 'full' && !dragging ? 'auto' : 'hidden', touchAction: snap === 'full' ? 'pan-y' : 'none' }}>
        {children}
      </div>
    </section>
  );
}
