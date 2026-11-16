// Pure time layout: places rooms along x (time) and lanes (z), spots inside rooms.
const DEFAULTS = {
  perSpot: 2.2,
  minRoom: 10,
  gap: 1.6,
  rows: 3,
  rowGap: 1.4,
  laneGap: 7,
  annexGap: 4,
  gapLen: 3,
};
const MAX_ROUNDS = 8;
const GROWTH = 1.25;
const TICK_STEP = 50;
const EPS = 1e-9;

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Lowest lane whose last room ends at or before the room's start.
function assignLanes(spanned) {
  const sorted = [...spanned].sort((a, b) => a.span[0] - b.span[0] || a.n - b.n);
  const laneEnds = [];
  const lanes = new Map();
  for (const r of sorted) {
    let k = laneEnds.findIndex((end) => end <= r.span[0]);
    if (k < 0) k = laneEnds.length;
    laneEnds[k] = r.span[1];
    lanes.set(r.n, k);
  }
  return lanes;
}

// Piecewise-linear year -> x over segments between span ends, clamped at the ends.
function buildScale(spanned, targets, gapLen) {
  const years = [...new Set(spanned.flatMap((r) => r.span))].sort((a, b) => a - b);
  const segs = [];
  let x = 0;
  for (let i = 1; i < years.length; i++) {
    const [y0, y1] = [years[i - 1], years[i]];
    let w = 0;
    let covered = false;
    for (const r of spanned) {
      if (r.span[0] <= y0 && r.span[1] >= y1) {
        covered = true;
        w = Math.max(w, targets.get(r.n) * (y1 - y0) / (r.span[1] - r.span[0]));
      }
    }
    if (!covered) w = gapLen;
    segs.push({ y0, y1, x0: x, x1: x + w });
    x += w;
  }
  const xOfYear = (y) => {
    if (!segs.length || y <= segs[0].y0) return 0;
    const last = segs[segs.length - 1];
    if (y >= last.y1) return last.x1;
    const s = segs.find((s) => y <= s.y1);
    return s.x0 + (s.x1 - s.x0) * (y - s.y0) / (s.y1 - s.y0);
  };
  return { xOfYear, end: x };
}

// Each spot goes to the row whose last x is smallest, no closer than `gap` to its predecessor.
// A backward pass then pulls each spot back so its row's later spots still fit before x1.
// `needed` is the width the fullest row requires.
function placeSpots(spots, xOfYear, x1, o) {
  const lastX = Array(o.rows).fill(-Infinity);
  const rows = Array.from({ length: o.rows }, () => []);
  const placed = [...spots].sort((a, b) => a.at - b.at || byId(a, b)).map((s) => {
    let row = 0;
    for (let i = 1; i < o.rows; i++) if (lastX[i] < lastX[row]) row = i;
    const x = Math.max(xOfYear(s.at), lastX[row] + o.gap);
    lastX[row] = x;
    const p = { id: s.id, x, row };
    rows[row].push(p);
    return p;
  });
  let needed = 0;
  for (const list of rows) {
    needed = Math.max(needed, (list.length - 1) * o.gap);
    let cap = x1;
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].x = Math.min(list[i].x, cap);
      cap = list[i].x - o.gap;
    }
  }
  return { placed, needed };
}

export function layoutTime(pack, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const spotsOf = new Map(pack.rooms.map((r) => [r.n, []]));
  for (const s of pack.spots) spotsOf.get(s.room)?.push(s);

  const baseLen = (r) => Math.max(o.minRoom, o.perSpot * spotsOf.get(r.n).length / o.rows);
  const spanned = pack.rooms.filter((r) => r.span);
  const annexes = pack.rooms.filter((r) => !r.span).sort((a, b) => a.n - b.n);
  const lanes = assignLanes(spanned);

  const targets = new Map(spanned.map((r) => [r.n, baseLen(r)]));
  let scale;
  let placed;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    scale = buildScale(spanned, targets, o.gapLen);
    placed = new Map();
    let grew = false;
    for (const r of spanned) {
      const x0 = scale.xOfYear(r.span[0]);
      const x1 = scale.xOfYear(r.span[1]);
      const { placed: ps, needed } = placeSpots(spotsOf.get(r.n), scale.xOfYear, x1, o);
      placed.set(r.n, ps);
      if (needed > x1 - x0 + EPS) {
        targets.set(r.n, targets.get(r.n) * Math.max(GROWTH, needed / Math.max(x1 - x0, EPS)));
        grew = true;
      }
    }
    if (!grew) break;
  }

  const laneZ = (k) => -k * o.laneGap;
  const half = o.rows * o.rowGap / 2;
  const rowZ = (k, row) => laneZ(k) + (row - (o.rows - 1) / 2) * o.rowGap;
  const roomsOut = new Map();
  const spotsOut = new Map();

  for (const r of spanned) {
    const k = lanes.get(r.n);
    roomsOut.set(r.n, {
      n: r.n,
      x0: scale.xOfYear(r.span[0]),
      x1: scale.xOfYear(r.span[1]),
      lane: k,
      z0: laneZ(k) - half,
      z1: laneZ(k) + half,
    });
    for (const p of placed.get(r.n)) spotsOut.set(p.id, { id: p.id, x: p.x, z: rowZ(k, p.row), row: p.row });
  }

  let cursor = spanned.length ? scale.end + o.annexGap : 0;
  for (const r of annexes) {
    const list = [...spotsOf.get(r.n)].sort(byId);
    const w = baseLen(r);
    roomsOut.set(r.n, { n: r.n, x0: cursor, x1: cursor + w, lane: 0, z0: laneZ(0) - half, z1: laneZ(0) + half });
    list.forEach((s, i) => {
      const row = i % o.rows;
      spotsOut.set(s.id, { id: s.id, x: cursor + (i + 0.5) * w / list.length, z: rowZ(0, row), row });
    });
    cursor += w + o.annexGap;
  }

  const ticks = [];
  if (spanned.length) {
    const first = Math.floor(Math.min(...spanned.map((r) => r.span[0])) / TICK_STEP) * TICK_STEP;
    const last = Math.max(...spanned.map((r) => r.span[1]));
    for (let year = first; year <= last; year += TICK_STEP) ticks.push({ year, x: scale.xOfYear(year) });
  }

  const rooms = pack.rooms.map((r) => roomsOut.get(r.n));
  return {
    xOfYear: scale.xOfYear,
    rooms,
    spots: pack.spots.filter((s) => spotsOut.has(s.id)).map((s) => spotsOut.get(s.id)),
    ticks,
    length: Math.max(0, ...rooms.map((r) => r.x1)),
  };
}
