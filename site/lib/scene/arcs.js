// What a selected spot draws in the world: gold arcs to the spots it links to, and a person's lifespan
// on the year markers of their lane. The shapes come from styles.js; this module places them and removes them again.
import { COLORS } from "../theme.js";
import { lifespanBar, linkArc, yearLineZ } from "./styles.js";

const MIN_BAR = 0.3; // metres; a lifespan of one known year still shows

/** Arcs from fromPos to each of toPositions ({x, y, z}), added to scene as one Group. */
export function drawLinks(THREE, scene, fromPos, toPositions) {
  const group = new THREE.Group();
  group.name = "links";
  for (const to of toPositions) group.add(linkArc(THREE, fromPos, to, COLORS));
  scene.add(group);
  return group;
}

/**
 * The x extent of a life on the time axis, or null without years. years: [y], [from, to] or [from, null]
 * (still living: the bar reaches `now`). Years beyond the layout's ends are clamped by xOfYear.
 */
export function lifespanRange(layout, years, now) {
  if (!years?.length || typeof years[0] !== "number") return null;
  const x0 = layout.xOfYear(years[0]);
  const end = years.length === 1 ? years[0] : years[1] ?? now;
  return { x0, x1: Math.max(layout.xOfYear(end), x0 + MIN_BAR) };
}

/**
 * A bar over the life's years on the year-marker line of room `n`'s lane (lane 0 for an unknown room),
 * added to scene; null without years.
 */
export function drawLifespan(THREE, scene, layout, years, n) {
  const range = lifespanRange(layout, years, new Date().getFullYear());
  const room = layout.rooms.find((r) => r.n === n) ?? layout.rooms.find((r) => r.lane === 0);
  if (!range || !room) return null;
  const bar = lifespanBar(THREE, range.x0, range.x1, yearLineZ(room), COLORS);
  bar.name = "lifespan";
  scene.add(bar);
  return bar;
}

/** Takes obj out of scene and frees its geometries and materials. */
export function removeDrawn(scene, obj) {
  scene.remove(obj);
  obj.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) m?.dispose();
  });
}
