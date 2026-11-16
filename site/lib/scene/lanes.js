// Where things stand along each lane of rooms: the walking path, the back walls' year line and the year
// markers on it. Pure numbers from layout rooms ({n, lane, x0, x1, z0, z1}); styles.js builds the look on them.

export const WALL_T = 0.15; // wall thickness
export const MARGIN = 0.6; // floor beyond the outer spot rows
const PATH_OFFSET = 1.4; // path centre in front of a room's z1
const MARKER_EDGE = 0.3; // year markers keep this far from end walls

/** z of the walking path along the lane of `room` (a layout room). */
export const pathZ = (room) => room.z1 + PATH_OFFSET;

/**
 * z of the year-marker line of `room`'s lane: the back walls' front face, in front of a camera that looks at
 * a spot from in front of it. Posts and the lifespan bar stand half in the wall, behind every landmark.
 */
export const yearLineZ = (room) => room.z0 - MARGIN + WALL_T / 2;

/** One entry per lane: its rooms' x extent and its path's z. */
export function pathLanes(layout) {
  const lanes = new Map();
  for (const r of layout.rooms) {
    const l = lanes.get(r.lane) ?? { lane: r.lane, x0: Infinity, x1: -Infinity, z: pathZ(r) };
    lanes.set(r.lane, { ...l, x0: Math.min(l.x0, r.x0), x1: Math.max(l.x1, r.x1) });
  }
  return [...lanes.values()].sort((a, b) => a.lane - b.lane);
}

/** Numbers of rooms whose back wall is low: a room on the next lane overlaps their x range. */
export function lowBackWalls(rooms) {
  const low = new Set();
  for (const r of rooms) {
    if (rooms.some((b) => b.lane === r.lane + 1 && b.x0 < r.x1 && b.x1 > r.x0)) low.add(r.n);
  }
  return low;
}

/**
 * Year markers, one per tick on every lane whose extent holds it: {year, x, z} on the lane's year line,
 * moved MARKER_EDGE off any end wall of that lane (to the later side of a wall the tick stands on).
 */
export function yearMarks(layout) {
  const out = [];
  for (const lane of pathLanes(layout)) {
    const rooms = layout.rooms.filter((r) => r.lane === lane.lane);
    const edges = rooms.flatMap((r) => [r.x0, r.x1]);
    const z = yearLineZ(rooms[0]);
    for (const t of layout.ticks) {
      if (t.x < lane.x0 || t.x > lane.x1) continue;
      const e = edges.find((e) => Math.abs(t.x - e) < MARKER_EDGE);
      const x = e === undefined ? t.x : t.x >= e ? e + MARKER_EDGE : e - MARKER_EDGE;
      out.push({ year: t.year, x, z });
    }
  }
  return out;
}
