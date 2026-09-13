import { mulberry32, hashStr } from './util.js';

const BAND_H = 8;
const CELL_M = 2.5;
const key = (x, y) => `${x},${y}`;

export function generateFloor({ venueKey, floorName, level, target }) {
  const rng = mulberry32(hashStr(`${venueKey}:${floorName}`));
  const lanes = target >= 160 ? 4 : target >= 130 ? 3 : 2;
  const rows = lanes * 2;
  const perRowEst = Math.ceil(target / rows);
  const liftCount = perRowEst >= 22 ? 2 : 1;
  const perRow = Math.ceil((target + 2 * liftCount) / rows);
  const colsEst = perRow + Math.floor((perRow - 1) / 9) + 3;
  const cx = Math.max(4, Math.floor(colsEst / 2) - 1);

  const columns = [];
  let x = 1;
  let placed = 0;
  let sinceGap = 0;
  while (placed < perRow) {
    if (x >= cx && x < cx + 3) columns.push({ x, kind: 'conn' });
    else if (sinceGap === 9) { columns.push({ x, kind: 'gap' }); sinceGap = 0; }
    else { columns.push({ x, kind: 'slot' }); placed++; sinceGap++; }
    x++;
  }
  const width = x + 1;
  const height = lanes * BAND_H;
  const laneY = (b) => b * BAND_H + 2;

  const lifts = [{ id: 'L1', label: 'Lift A', x: cx + 3, y: 0, w: 2, h: 2 }];
  if (liftCount === 2) lifts.push({ id: 'L2', label: 'Lift B', x: width - 4, y: 0, w: 2, h: 2 });
  const liftCols = new Set(lifts.flatMap((l) => [l.x, l.x + 1]));

  const gate = level === 0 ? 'Gate' : 'Ramp';
  const entrances = [{ id: 'E1', label: `${gate} 1 (Main)`, x: 0, y: laneY(0), w: 1, h: 3 }];
  const twoEntrances = width >= 26;
  if (twoEntrances) entrances.push({ id: 'E2', label: `${gate} 2 (South)`, x: cx, y: height - 1, w: 3, h: 1 });

  const laneRects = [];
  for (let b = 0; b < lanes; b++) laneRects.push({ x: 1, y: laneY(b), w: width - 2, h: 3 });
  const connBottom = twoEntrances ? height - 1 : laneY(lanes - 1) + 3;
  laneRects.push({ x: cx, y: laneY(0), w: 3, h: connBottom - laneY(0) });

  const pillars = [];
  const zones = [];
  const slots = [];
  const gapCols = columns.filter((c) => c.kind === 'gap').map((c) => c.x);
  for (let b = 0; b < lanes; b++) {
    zones.push({ label: String.fromCharCode(65 + b), x: 1, y: b * BAND_H, w: width - 2, h: 7 });
    for (const side of ['top', 'bottom']) {
      const rowY = side === 'top' ? laneY(b) - 2 : laneY(b) + 3;
      for (const c of columns) {
        const underLift = b === 0 && side === 'top' && liftCols.has(c.x);
        if (c.kind === 'gap' && !underLift) pillars.push({ x: c.x, y: rowY }, { x: c.x, y: rowY + 1 });
        if (c.kind === 'slot' && !underLift) slots.push({ x: c.x, y: rowY, w: 1, h: 2, side });
      }
    }
    if (b < lanes - 1) for (const gx of gapCols) pillars.push({ x: gx, y: b * BAND_H + 7 });
  }
  slots.splice(target);

  const layout = { width, height, entrances, lifts, lanes: laneRects, pillars, zones };
  const graph = buildGraph(layout);
  for (const s of slots) s.distToEntrance = (graph.dist.get(key(s.x, slotLaneY(s))) ?? 0) + 2;

  const evCount = Math.round(slots.length * (0.06 + rng() * 0.04));
  const liftCentres = lifts.map((l) => ({ x: l.x + 1, y: l.y + 1 }));
  const byLift = slots.map((s) => ({ s, d: Math.min(...liftCentres.map((c) => Math.hypot(s.x + 0.5 - c.x, s.y + 1 - c.y))) }))
    .sort((a, b) => a.d - b.d);
  for (let i = 0; i < evCount; i++) byLift[i].s.type = 'ev';
  const accCount = Math.round(slots.length * (0.03 + rng() * 0.01));
  const byEntrance = slots.filter((s) => !s.type).sort((a, b) => a.distToEntrance - b.distToEntrance);
  for (let i = 0; i < accCount; i++) byEntrance[i].type = 'accessible';

  const lower = floorName.toLowerCase();
  const out = slots.map((s, i) => {
    const idx = String(i + 1).padStart(3, '0');
    return { id: `s_${venueKey}_${lower}_${idx}`, code: `${floorName}-${idx}`, x: s.x, y: s.y, w: 1, h: 2, type: s.type || 'standard', distToEntrance: s.distToEntrance };
  });
  return { layout, slots: out };
}

const slotLaneY = (s) => (s.side === 'top' ? s.y + 3 : s.y - 2);

function laneAdjacentCell(layout, slot) {
  for (const c of [{ x: slot.x, y: slot.y + slot.h }, { x: slot.x, y: slot.y - 1 }]) {
    const lane = layout.lanes.find((l) => c.x >= l.x && c.x < l.x + l.w && c.y >= l.y && c.y < l.y + l.h);
    if (lane) return lane.w >= lane.h ? { x: c.x, y: lane.y + Math.floor(lane.h / 2) } : { x: lane.x + Math.floor(lane.w / 2), y: c.y };
  }
  return null;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function buildGraph(layout) {
  const cells = new Set();
  for (const l of layout.lanes) {
    if (l.w >= l.h) { const y = l.y + Math.floor(l.h / 2); for (let x = l.x; x < l.x + l.w; x++) cells.add(key(x, y)); }
    else { const x = l.x + Math.floor(l.w / 2); for (let y = l.y; y < l.y + l.h; y++) cells.add(key(x, y)); }
  }
  const entries = layout.entrances.map((e) => ({ entrance: e, ...entryCell(e, cells) })).filter((e) => e.cell);
  const dist = bfs(cells, entries.map((e) => e.cell));
  return { cells, entries, dist };
}

function entryCell(e, cells) {
  const candidates = [];
  for (let x = e.x - 1; x <= e.x + e.w; x++) candidates.push({ x, y: e.y - 1, dir: [0, -1] }, { x, y: e.y + e.h, dir: [0, 1] });
  for (let y = e.y; y < e.y + e.h; y++) candidates.push({ x: e.x - 1, y, dir: [-1, 0] }, { x: e.x + e.w, y, dir: [1, 0] });
  const hit = candidates.find((c) => cells.has(key(c.x, c.y)));
  return hit ? { cell: { x: hit.x, y: hit.y }, dir: hit.dir } : { cell: null };
}

function bfs(cells, sources, target) {
  const dist = new Map();
  const prev = new Map();
  const queue = [];
  for (const s of sources) { dist.set(key(s.x, s.y), 0); queue.push(s); }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const k = key(c.x, c.y);
    if (target && c.x === target.x && c.y === target.y) break;
    const d = dist.get(k);
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      const nk = key(n.x, n.y);
      if (!cells.has(nk) || dist.has(nk)) continue;
      dist.set(nk, d + 1);
      prev.set(nk, k);
      queue.push(n);
    }
  }
  return target ? { dist, prev } : dist;
}

export function buildRoute(layout, slot) {
  const graph = buildGraph(layout);
  const goal = laneAdjacentCell(layout, slot);
  if (!goal || graph.entries.length === 0) return null;
  let best = null;
  for (const entry of graph.entries) {
    const { dist, prev } = bfs(graph.cells, [entry.cell], goal);
    const d = dist.get(key(goal.x, goal.y));
    if (d === undefined || (best && d >= best.d)) continue;
    const path = [];
    for (let k = key(goal.x, goal.y); k; k = prev.get(k)) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); }
    best = { entry, d, path };
  }
  if (!best) return null;

  const { entry, path } = best;
  const e = entry.entrance;
  const centre = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
  const segments = [];
  let dir = entry.dir;
  let len = 1;
  for (let i = 1; i < path.length; i++) {
    const d = [Math.sign(path[i].x - path[i - 1].x), Math.sign(path[i].y - path[i - 1].y)];
    if (d[0] === dir[0] && d[1] === dir[1]) len++;
    else { segments.push({ dir, len, corner: path[i - 1] }); dir = d; len = 1; }
  }
  segments.push({ dir, len, corner: path[path.length - 1] });

  const slotAbove = slot.y < goal.y;
  const mouth = { x: slot.x + 0.5, y: slotAbove ? slot.y + slot.h : slot.y };
  const points = [{ x: e.x + e.w / 2, y: e.y + e.h / 2 }, ...segments.map((s) => centre(s.corner)), mouth];

  const steps = [`Enter via ${e.label}`];
  segments.forEach((s, i) => {
    steps.push(`Go straight for ${metres(s.len)} m`);
    const next = segments[i + 1];
    if (next) steps.push(`Turn ${turnWord(s.dir, next.dir)} ${landmark(layout, s.corner, next.dir)}`);
  });
  const last = segments[segments.length - 1].dir;
  steps.push(`Slot ${slot.code} is on your ${turnWord(last, [0, slotAbove ? -1 : 1])}`);

  const distanceM = Math.round((path.length + 1) * CELL_M);
  return { entranceId: e.id, points, steps, distanceM, walkSeconds: Math.round(distanceM / 1.2), driveSeconds: Math.round(distanceM / 3.5) };
}

const metres = (cells) => Math.max(5, Math.round((cells * CELL_M) / 5) * 5);

function turnWord(from, to) {
  const cross = from[0] * to[1] - from[1] * to[0];
  return cross > 0 ? 'right' : 'left';
}

function landmark(layout, cell, nextDir) {
  if (nextDir[1] !== 0) return 'into the cross aisle';
  const lift = layout.lifts.find((l) => Math.abs(l.x + 1 - cell.x) <= 3 && Math.abs(l.y + 1 - cell.y) <= 3);
  if (lift) return `at ${lift.label}`;
  const zone = layout.zones.find((z) => cell.x >= z.x && cell.x < z.x + z.w && cell.y >= z.y && cell.y < z.y + z.h);
  const label = zone ? zone.label : '';
  const pillar = layout.pillars.find((p) => Math.abs(p.x - cell.x) <= 1);
  return pillar ? `at pillar row ${label}`.trim() : `at zone ${label}`.trim();
}
