// Light that follows the year: lamps beside each lane's path, every ~6 m, in the colour and strength of
// lightFor(year at that x). Overlapping lanes cover the same years, so they share their light. Every lamp
// glows and casts a pool on the floor; only MAX_REAL_LIGHTS of them, spread along the lanes, are real
// lights, since each real light adds shader cost to every lit pixel. No path light casts shadows.
import { COLORS, lightFor, SCENE } from "../theme.js";
import { lightPool, pathLamp, pathLanes, poolTexture } from "./styles.js";

const LAMP_STEP = 6; // metres between lamps, about
const LAMP_INSET = 1.05; // lamps stand this far from the path centre, towards the rooms
const POOL = { w: 4.4, d: 2.0, back: 0.2 }; // floor pool size, shifted towards the rooms
const YEAR_RANGE = [-10000, 10000];
const BISECT_STEPS = 60;

/** Real lights in the whole world, at most. */
export const MAX_REAL_LIGHTS = 8;

// Smallest year in [lo, hi] for which test(year) holds; test must be monotonic.
function firstYear(test, lo, hi) {
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The year at x on the time axis: the inverse of layout.xOfYear, clamped to the first and last span years. */
export function yearAt(layout, x) {
  const f = layout.xOfYear;
  const [lo, hi] = YEAR_RANGE;
  const end = f(hi);
  const first = firstYear((y) => f(y) > 0, lo, hi);
  const last = firstYear((y) => f(y) >= end, lo, hi);
  if (x <= 0) return first;
  if (x >= end) return last;
  return firstYear((y) => f(y) >= x, first, last);
}

/** Lamp positions: per lane, evenly spread at about LAMP_STEP over its rooms' extent. Each {x, z, lane, year, band}. */
export function pathLamps(layout) {
  const out = [];
  for (const lane of pathLanes(layout)) {
    const n = Math.max(1, Math.round((lane.x1 - lane.x0) / LAMP_STEP));
    const step = (lane.x1 - lane.x0) / n;
    for (let i = 0; i < n; i++) {
      const x = lane.x0 + step * (i + 0.5);
      const year = yearAt(layout, x);
      out.push({ x, z: lane.z - LAMP_INSET, lane: lane.lane, year, band: lightFor(year) });
    }
  }
  return out;
}

/** Adds the path lamps, their floor pools and the real lights to `scene`. */
export function addPathLights(THREE, scene, layout) {
  const lamps = pathLamps(layout);
  const group = new THREE.Group();
  group.name = "path-lights";
  const tex = poolTexture(THREE);
  const real = new Set();
  for (let k = 0; k < Math.min(MAX_REAL_LIGHTS, lamps.length); k++) {
    real.add(Math.floor(((k + 0.5) * lamps.length) / Math.min(MAX_REAL_LIGHTS, lamps.length)));
  }
  lamps.forEach(({ x, z, band }, i) => {
    const lamp = pathLamp(THREE, band, COLORS);
    lamp.position.set(x, 0, z);
    group.add(lamp, lightPool(THREE, tex, band.color, SCENE.lamp.pool * band.intensity, POOL.w, POOL.d, x, z - POOL.back));
    if (real.has(i)) {
      const light = new THREE.PointLight(band.color, SCENE.lamp.power * band.intensity, SCENE.lamp.distance, 2);
      light.position.set(x, lamp.userData.headY, z);
      group.add(light);
    }
  });
  scene.add(group);
}
