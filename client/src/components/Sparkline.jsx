import { useId } from 'react';

export function Sparkline({ points = [], total, height = 72, tone = 'green' }) {
  const id = useId();
  const w = 320;
  const h = height;
  const padY = 6;
  const values = points.map((p) => Number(p.free) || 0);
  if (values.length < 2) return <div className="spark spark-empty">No history yet</div>;
  const max = Math.max(1, total || Math.max(...values));
  const step = w / (values.length - 1);
  const yFor = (v) => padY + (h - padY * 2) * (1 - v / max);
  const line = values.map((v, i) => `${(i * step).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  const area = `M0,${h} L${line.split(' ').join(' L')} L${w},${h} Z`;
  const last = values[values.length - 1];
  const lx = w;
  const ly = yFor(last);
  return (
    <div className={`spark tone-${tone}`} role="img" aria-label={`Free spots over the last 24 hours, now ${last} of ${max}`}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="spark-stop-a" />
            <stop offset="1" className="spark-stop-b" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id}-g)`} />
        <polyline points={line} className="spark-line" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={w} y1={h - 0.5} y2={h - 0.5} className="spark-base" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="spark-dot" style={{ left: `${(lx / w) * 100}%`, top: `${(ly / h) * 100}%` }} aria-hidden="true" />
    </div>
  );
}
