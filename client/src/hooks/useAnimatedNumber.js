import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useMedia.js';

export function useAnimatedNumber(target, ms = 450) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(target) || 0;
    if (reduce || from === to || !Number.isFinite(from)) {
      fromRef.current = to;
      setValue(to);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return value;
}
