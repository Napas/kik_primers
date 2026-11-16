// Theme data: colours, building styles and light bands by era. No Three.js here.
export const COLORS = {
  bg: 0x0e1726,
  floor: 0x141e33,
  path: 0x26355a,
  gold: 0xd9b25f,
  text: "#e9e4d8",
  panel: "#0b1220",
};

/** Exhibit materials: plinth stone, brass fittings, paper, wood, glass, and book bindings and banner cloth. */
export const EXHIBIT = {
  stone: 0x9a9286,
  stoneDark: 0x6e675d,
  brass: 0xb8914a,
  ink: "#2a1f12", // plaque text
  signInk: "#efe3c8", // signpost text
  paper: 0xe6dcc3,
  panel: "#25201a", // placeholder portrait: dark panel, name in brass, years in panelInk
  panelInk: "#a8987c",
  wood: 0x5b3e27,
  glass: 0xbfd6e6,
  granite: 0x7a746c,
  bindings: [0x6b2a22, 0x2f4a3a, 0x283a5c, 0x5a4022, 0x4a2a44],
  cloth: 0x7a2630,
  glow: 0.22, // emissive share of each exhibit colour
  pictureGlow: 0.3, // emissive share of portraits, plaques and signs
};

/** A colour number (0xRRGGBB) as a CSS hex string, for canvas drawing. */
export const cssColor = (n) => `#${n.toString(16).padStart(6, "0")}`;

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
  toneMapping: "ACESFilmic", // renderer operator: THREE.<name>ToneMapping
  exposure: 1.35, // tone mapping exposure
  rowLift: 0.35, // metres each spot row stands above the row in front of it
  frontScale: 0.8, // size of front-row exhibits, so they don't hide or outsize the rows behind
  fov: 50, // degrees
  fog: { near: 16, far: 55 },
  far: 65, // camera far plane: a little past the fog, which hides everything beyond it
  ambient: { sky: 0xc8d4f0, ground: 0x141e33, intensity: 0.85 },
  fill: { color: 0xfff0d8, intensity: 0.6 },
  lamp: { power: 6, distance: 10, pool: 0.25 },
  // The chosen spot's spotlight: colour, strength, cone angle (rad), soft edge, reach (m), how far above its
  // pick point and in front of it (m); the room's base light dims to `dim` meanwhile, easing at `rate` per second.
  focus: { color: 0xffe2b0, intensity: 22, angle: 0.35, penumbra: 0.7, distance: 12, up: 2.2, out: 2.2, dim: 0.5, rate: 4 },
  // Floor pool drawn under each spot (no real light): warm colour, diameter (m) and opacity; full
  // strength up to band intensity `ref`, then fading with (ref / intensity) ** falloff.
  pool: { color: 0xffd58a, size: 1.5, opacity: 0.3, ref: 1, falloff: 3 },
};

/**
 * Strength (0 to 1) of the floor pools in a room lit by LIGHT_BANDS `band`: fainter in brighter bands,
 * where many pools would wash the floor out.
 */
export function poolLevel(band) {
  const { ref, falloff } = SCENE.pool;
  return Math.min(1, (ref / band.intensity) ** falloff);
}

/**
 * Typography of canvas-drawn labels: font stack, pixel size on the canvas, height in metres, sprite opacity,
 * the largest share of the view height a label may fill up close, and the narrowest view aspect (width /
 * height) that keeps that share and the full label range.
 */
export const LABEL = {
  font: 'Georgia, "Times New Roman", serif',
  px: 48,
  weight: 600,
  height: 0.36,
  opacity: 0.92,
  maxView: 0.035,
  refAspect: 0.75,
};
