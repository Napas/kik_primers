// Theme data: colours, building styles and light bands by era. No Three.js here.
export const COLORS = {
  bg: 0x0e1726,
  floor: 0x141e33,
  path: 0x26355a,
  gold: 0xd9b25f,
  text: "#e9e4d8",
  panel: "#0b1220",
};

export const STYLE_NAMES = [
  "print-shop",
  "brick-church",
  "log-chapel",
  "barn",
  "farmstead",
  "kaunas-modern",
  "dp-barrack",
  "concrete",
  "glass",
];

export const LIGHT_BANDS = [
  { until: 1799, kind: "candle", color: 0xffb36b, intensity: 0.8 },
  { until: 1899, kind: "lantern", color: 0xffc77a, intensity: 1.0 },
  { until: 1944, kind: "bulb", color: 0xfff0c8, intensity: 1.2 },
  { until: 1989, kind: "fluorescent", color: 0xd8f0ff, intensity: 1.3 },
  { until: Infinity, kind: "daylight", color: 0xcfe4ff, intensity: 1.6 },
];

/** The light band that covers `year`. */
export function lightFor(year) {
  return LIGHT_BANDS.find((b) => year <= b.until);
}

/**
 * Scene-only settings: eye height (m), fog distances (m), the base light under the room lights, and path
 * lamps: real light strength per LIGHT_BANDS intensity unit, its reach (m), floor pool opacity per unit.
 */
export const SCENE = {
  eye: 1.7,
  fog: { near: 16, far: 55 },
  ambient: { sky: 0xc8d4f0, ground: 0x141e33, intensity: 0.85 },
  fill: { color: 0xfff0d8, intensity: 0.6 },
  lamp: { power: 6, distance: 10, pool: 0.25 },
};

/** Typography of canvas-drawn labels: font stack, pixel size on the canvas, height in metres, sprite opacity. */
export const LABEL = {
  font: 'Georgia, "Times New Roman", serif',
  px: 48,
  weight: 600,
  height: 0.36,
  opacity: 0.92,
};
