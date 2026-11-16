// The look of rooms, path lamps and the ground they stand on. Builders take THREE and COLORS as arguments;
// nothing here imports Three.js or draws at module load. Every room builder tags exactly its three wall
// boxes with userData.wall, so picks stop at walls; all other parts are decoration.
//
// A room style is a shell (back wall, two half-depth end walls, floor) plus three parts over and in it:
// the signature shape over the back wall, the window light, and one landmark standing in the strip
// between the back wall and the first spot row. Nothing reaches behind the back wall's rear face,
// because a parallel lane's path runs right behind it. A room with a parallel lane's room behind it gets a
// low back wall (layout room `low: true`): a lintel between the end walls carries the signature, the
// opening stays clear so the far lane shows through, and only the floor pools of the window light stay.
import { cssColor } from "../theme.js";
import { makeLabel } from "./labels.js";
import { MARGIN, WALL_T } from "./lanes.js";

const WALL_H = 3.2;
const LOW_WALL_H = 1.1; // a back wall with a parallel lane behind it
const LINTEL_H = 0.3;
const PATH_W = 1.4;
const LANDMARK_D = 0.8; // depth of the strip behind the first spot row
const WINDOW_GAP = 2.4; // windows keep this far from the room centre, where the landmark stands
const MARKER_H = LOW_WALL_H; // year marker post height
const MARKER_R = 0.03; // year marker post radius; landmarks keep at least 0.035 m off the back wall
const MARKER_LABEL = { y: MARKER_H + 0.3, out: 0.15 }; // the year above its post, in front of the wall face
const ARC = { r: 0.035, lift: 0.8, perMetre: 0.25, maxLift: 6, segments: 40, opacity: 0.9 };
const LIFESPAN = { h: 0.08, d: 0.06 }; // as deep as a year marker post

// ---------- shared part helpers ----------

/** Deterministic pseudo-random numbers in [0, 1), so textures look the same on every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Repeating canvas texture of `w`×`h` px drawn by draw(ctx, w, h); `tile` is its size in metres. */
function canvasTex(THREE, w, h, draw, tile = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData.tile = tile;
  return tex;
}

/** A copy of `tex` repeated to cover `w`×`h` metres. */
function tiled(tex, w, h) {
  const t = tex.clone();
  t.repeat.set(w / tex.userData.tile, h / tex.userData.tile);
  t.needsUpdate = true;
  return t;
}

const TEX = {
  // Rows of blocks in a running bond: bricks, stone, logs seen end-on are all variations.
  blocks(THREE, { mortar, faces, rows = 4, cols = 3, seed = 1, tile = 1 }) {
    return canvasTex(THREE, 128, 128, (g, w, h) => {
      const r = rng(seed);
      g.fillStyle = cssColor(mortar);
      g.fillRect(0, 0, w, h);
      const bh = h / rows, bw = w / cols;
      for (let y = 0; y < rows; y++) {
        for (let x = -1; x <= cols; x++) {
          g.fillStyle = cssColor(faces[Math.floor(r() * faces.length)]);
          g.fillRect(x * bw + (y % 2) * bw / 2 + 2, y * bh + 2, bw - 4, bh - 4);
        }
      }
    }, tile);
  },
  // Parallel boards or logs; `vertical` turns them upright. `round` shades each one like a log.
  boards(THREE, { faces, n = 6, vertical = false, round = false, seed = 2, tile = 1 }) {
    return canvasTex(THREE, 128, 128, (g, w, h) => {
      const r = rng(seed);
      const step = (vertical ? w : h) / n;
      for (let i = 0; i < n; i++) {
        const c = cssColor(faces[Math.floor(r() * faces.length)]);
        const [x, y, bw, bh] = vertical ? [i * step, 0, step - 2, h] : [0, i * step, w, step - 2];
        if (round) {
          const grad = vertical ? g.createLinearGradient(x, 0, x + bw, 0) : g.createLinearGradient(0, y, 0, y + bh);
          grad.addColorStop(0, "#1a120c");
          grad.addColorStop(0.5, c);
          grad.addColorStop(1, "#1a120c");
          g.fillStyle = grad;
        } else g.fillStyle = c;
        g.fillRect(x, y, bw, bh);
      }
      g.fillStyle = "rgba(0,0,0,0.6)";
      for (let i = 0; i <= n; i++) g.fillRect(vertical ? i * step - 2 : 0, vertical ? 0 : i * step - 2, vertical ? 2 : w, vertical ? h : 2);
    }, tile);
  },
  // A flat surface with soft blotches: whitewash, plaster, concrete, thatch.
  wash(THREE, { base, spots, n = 30, seams = 0, seed = 3, tile = 1 }) {
    return canvasTex(THREE, 128, 128, (g, w, h) => {
      const r = rng(seed);
      g.fillStyle = cssColor(base);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        g.fillStyle = cssColor(spots[i % spots.length]);
        g.globalAlpha = 0.15 + r() * 0.2;
        g.beginPath();
        g.arc(r() * w, r() * h, 4 + r() * 14, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (seams) {
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.fillRect(0, 0, w, 3);
        g.fillRect(0, 0, 3, h);
      }
    }, tile);
  },
  // A white disc fading to clear: light pools on the floor.
  pool(THREE) {
    return canvasTex(THREE, 64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  },
  // Book spines of random widths and colours on a dark shelf.
  spines(THREE, { seed = 4 }) {
    return canvasTex(THREE, 256, 64, (g, w, h) => {
      const r = rng(seed);
      g.fillStyle = "#1b140e";
      g.fillRect(0, 0, w, h);
      const colours = ["#7a2e22", "#284a6b", "#3d5a2a", "#c9a24a", "#5b3a5e", "#a8603a", "#d8d0bc"];
      for (let x = 2; x < w - 6;) {
        const bw = 6 + Math.floor(r() * 10);
        const top = 6 + Math.floor(r() * 14);
        g.fillStyle = colours[Math.floor(r() * colours.length)];
        g.fillRect(x, top, bw - 1, h - top);
        x += bw;
      }
    });
  },
};

/** Builds meshes with shared conventions: box sizes in metres, positions of the centre. */
function kit(THREE) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const glow = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
  const at = (o, x, y, z) => (o.position.set(x, y, z), o);
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
  const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) =>
    at(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z);
  const group = (...kids) => {
    const g = new THREE.Group();
    if (kids.length) g.add(...kids);
    return g;
  };
  const shape = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  // A flat outline in the wall plane, `depth` thick, centred on z; x relative to its centre, y from its base.
  const slab = (pts, depth, mat) => {
    const geo = new THREE.ExtrudeGeometry(shape(pts), { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, mat);
  };
  // A flat glowing outline facing +z.
  const pane = (pts, mat) => new THREE.Mesh(new THREE.ShapeGeometry(shape(pts)), mat);
  // A w×d rectangle lying flat, facing up, centred on (x, y, z).
  const flat = (w, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    return at(m, x, y, z);
  };
  return { std, glow, at, box, cyl, group, slab, pane, flat };
}

/** Points of a w×h rectangle standing on y=0, centred on x=0. */
const rectPts = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];

/** Points of an arch: a rectangle w×h topped by a half circle (round) or a pointed arch (lancet). */
function archPts(w, h, pointed = false, n = 8) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h]];
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    const dx = (Math.cos(a) * w) / 2;
    const dy = Math.sin(a) * (pointed ? w * 1.1 : w / 2) * (pointed ? 1 - Math.abs(Math.cos(a)) * 0.35 : 1);
    pts.push([dx, h + dy]);
  }
  pts.push([-w / 2, h]);
  return pts;
}

/** x positions of `n` windows spread over the back wall on both sides of the centre. */
function windowXs({ x0, x1 }, perMetre = 0.25, edge = 1) {
  const cx = (x0 + x1) / 2;
  const side = cx - WINDOW_GAP - (x0 + edge);
  if (side < 0.5) return [];
  const each = Math.max(1, Math.round(side * perMetre));
  const xs = [];
  for (let i = 0; i < each; i++) {
    const t = (i + 0.5) / each;
    xs.push(x0 + edge + t * side, x1 - edge - t * side);
  }
  return xs;
}

/** Room frame: centre, width, depth, the back wall's centre, front face and height. */
function frame({ x0, x1, z0, z1, low = false }) {
  const zb = z0 - MARGIN;
  return {
    x0, x1, z0, z1, low,
    w: x1 - x0, cx: (x0 + x1) / 2, d: z1 - z0 + 2 * MARGIN, zc: (z0 + z1) / 2, zb, zf: zb + WALL_T / 2,
    backH: low ? LOW_WALL_H : WALL_H,
  };
}

/**
 * The shell every style shares: floor, back wall, two end walls over the back half (so the room stays
 * visible from the path); over a low back wall, a lintel between the end walls (decoration, not a wall).
 * `wall(w, h)` and `floor(w, d)` return materials sized to the surface.
 */
function shell(THREE, f, { wall, floor }) {
  const { box, flat } = kit(THREE);
  const g = new THREE.Group();
  g.add(part(flat(f.w, f.d, floor(f.w, f.d), f.cx, 0.01, f.zc), "floor"));
  const tag = (m) => ((m.userData.wall = true), m);
  g.add(tag(box(f.w, f.backH, WALL_T, wall(f.w, f.backH), f.cx, f.backH / 2, f.zb)));
  if (f.low) g.add(part(box(f.w, LINTEL_H, WALL_T, wall(f.w, LINTEL_H), f.cx, WALL_H - LINTEL_H / 2, f.zb), "lintel"));
  const endD = f.d / 2;
  for (const x of [f.x0, f.x1]) g.add(tag(box(WALL_T, WALL_H, endD, wall(endD, WALL_H), x, WALL_H / 2, f.zb + endD / 2)));
  return g;
}

/** Material factory for shell surfaces: a canvas texture tiled to each surface, or a plain colour. */
const surface = (THREE, tex, extra = {}) => (w, h) =>
  new THREE.MeshStandardMaterial({ roughness: 0.9, ...extra, ...(tex ? { map: tiled(tex, w, h) } : {}) });

/** A floor pool of light in `color`, `w`×`d` metres, centred on (x, z). */
export function lightPool(THREE, tex, color, opacity, w, d, x, z) {
  const mat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false });
  const m = kit(THREE).flat(w, d, mat, x, 0.03, z);
  m.userData.pool = true;
  return m;
}

/** Shared pool texture; one per world or room. */
export const poolTexture = (THREE) => TEX.pool(THREE);

/** Tags `obj` as a room part ("signature", "window", "landmark") and returns it. */
const part = (obj, name) => ((obj.userData.part = name), obj);

/** Puts a landmark (built around x=0, z=0, depth ≤ LANDMARK_D) in the strip at the back-wall centre. */
const placeLandmark = (f, lm) => {
  lm.position.set(f.cx, 0, f.zf + LANDMARK_D / 2 + 0.02);
  return part(lm, "landmark");
};

/** Puts a signature (built around x=0 from y=0) on top of the back wall. */
const placeSignature = (f, sig) => {
  sig.position.set(f.cx, WALL_H, f.zb);
  return part(sig, "signature");
};

/** An oil lantern centred on its glass: glowing panes between a dark base and a pointed cap. */
function lantern(THREE, color) {
  const { std, glow, box, cyl, group } = kit(THREE);
  const iron = std(0x1a1a1a, { metalness: 0.5 });
  const cap = cyl(0, 0.13, 0.12, iron, 0, 0.16, 0, 4);
  cap.rotation.y = Math.PI / 4;
  return group(box(0.13, 0.2, 0.13, glow(color)), box(0.17, 0.03, 0.17, iron, 0, -0.11, 0), cap);
}

// ---------- landmarks: built around x=0, z=0, floor at y=0, front facing +z ----------

const LANDMARKS = {
  printingPress(THREE) {
    const { std, box, cyl, group } = kit(THREE);
    const wood = std(0x5a3d26), iron = std(0x2b2b30, { metalness: 0.6, roughness: 0.5 });
    const g = group(
      box(0.14, 2.0, 0.14, wood, -0.45, 1.0, -0.15),
      box(0.14, 2.0, 0.14, wood, 0.45, 1.0, -0.15),
      box(1.1, 0.2, 0.22, wood, 0, 1.95, -0.15),
      box(1.1, 0.16, 0.22, wood, 0, 1.45, -0.15),
      cyl(0.05, 0.05, 0.4, iron, 0, 1.2, -0.15),
      box(0.6, 0.08, 0.4, iron, 0, 0.98, -0.1),
      box(1.2, 0.1, 0.7, wood, 0, 0.82, 0),
      box(0.42, 0.01, 0.3, std(0xe8e0c8), 0, 0.88, 0.12),
    );
    const bar = cyl(0.025, 0.025, 0.8, iron, 0.3, 1.3, 0.1);
    bar.rotation.set(0, 0, Math.PI / 2 - 0.3);
    g.add(bar);
    for (const x of [-0.5, 0.5]) for (const z of [-0.28, 0.28]) g.add(box(0.08, 0.78, 0.08, wood, x, 0.39, z));
    return g;
  },
  pulpit(THREE, C) {
    const { std, box, cyl, group } = kit(THREE);
    const wood = std(0x4a2c1c), gold = std(C.gold, { metalness: 0.6, roughness: 0.35 });
    return group(
      cyl(0.1, 0.14, 1.1, wood, 0, 0.55, 0),
      cyl(0.38, 0.3, 0.75, wood, 0, 1.47, 0, 6),
      cyl(0.39, 0.39, 0.05, gold, 0, 1.86, 0, 6),
      box(0.3, 1.2, 0.06, wood, 0, 2.3, -0.36),
      cyl(0.4, 0.4, 0.08, wood, 0, 2.92, 0, 6),
      cyl(0.04, 0.04, 0.2, gold, 0, 3.06, 0),
      box(0.4, 0.2, 0.3, wood, -0.65, 0.1, 0.1),
      box(0.4, 0.2, 0.3, wood, -0.65, 0.3, -0.1),
    );
  },
  shrinePillar(THREE, C) {
    const { std, box, cyl, group } = kit(THREE);
    const wood = std(0x6a4c36), dark = std(0x3a2a1f), gold = std(C.gold, { metalness: 0.6, roughness: 0.35 });
    const roof = cyl(0, 0.45, 0.45, dark, 0, 3.1, 0, 4);
    roof.rotation.y = Math.PI / 4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 6, 20), gold);
    ring.position.set(0, 3.62, 0);
    return group(
      box(0.2, 2.6, 0.2, wood, 0, 1.3, 0),
      box(0.55, 0.55, 0.42, wood, 0, 2.85, 0),
      box(0.3, 0.32, 0.02, std(0x14100c), 0, 2.85, 0.22),
      box(0.08, 0.2, 0.04, gold, 0, 2.82, 0.22),
      roof,
      box(0.04, 0.5, 0.04, gold, 0, 3.55, 0),
      box(0.26, 0.04, 0.04, gold, 0, 3.62, 0),
      ring,
    );
  },
  smugglersCart(THREE) {
    const { std, box, cyl, group } = kit(THREE);
    const wood = std(0x4f3a28), hay = std(0xb89a4a, { roughness: 1 });
    const g = group(box(1.4, 0.3, 0.62, wood, 0, 0.62, 0), box(1.3, 0.22, 0.56, hay, 0.05, 0.86, 0));
    for (const x of [-0.45, 0.45]) {
      for (const z of [-0.36, 0.36]) {
        const wheel = cyl(0.36, 0.36, 0.05, wood, x, 0.36, z, 16);
        wheel.rotation.x = Math.PI / 2;
        g.add(wheel);
      }
    }
    for (const z of [-0.2, 0.2]) {
      const shaft = box(1.3, 0.05, 0.05, wood, -1.25, 0.55, z);
      shaft.rotation.z = -0.15;
      g.add(shaft);
    }
    // Books show only where the hay is pushed aside.
    ["#7a2e22", "#284a6b", "#c9a24a"].forEach((c, i) => g.add(box(0.06, 0.22, 0.16, std(new THREE.Color(c).getHex()), 0.5 + i * 0.07, 0.95, 0.15)));
    return g;
  },
  wellSweep(THREE) {
    const { std, box, cyl, group } = kit(THREE);
    const wood = std(0x5b4430), dark = std(0x3b2c1f);
    const pivot = [-0.8, 2.6], angle = 0.45, long = 3, short = 1.2;
    const beam = box(long + short, 0.08, 0.08, wood, 0, 0, 0);
    beam.position.set(pivot[0] + Math.cos(angle) * (long - short) / 2, pivot[1] + Math.sin(angle) * (long - short) / 2, 0);
    beam.rotation.z = angle;
    const tip = [pivot[0] + Math.cos(angle) * long, pivot[1] + Math.sin(angle) * long];
    const poleLen = tip[1] - 1.0;
    return group(
      box(0.16, 2.6, 0.16, wood, pivot[0], 1.3, 0),
      beam,
      box(0.25, 0.25, 0.2, dark, pivot[0] - Math.cos(angle) * short, pivot[1] - Math.sin(angle) * short, 0),
      box(0.03, poleLen, 0.03, wood, tip[0], 1.0 + poleLen / 2, 0),
      cyl(0.12, 0.1, 0.22, dark, tip[0], 0.9, 0),
      box(0.8, 0.6, 0.7, dark, tip[0], 0.3, 0),
    );
  },
  radio(THREE, C) {
    const { std, glow, box, cyl, group } = kit(THREE);
    const wood = std(0x6b4026, { roughness: 0.5 }), cloth = std(0x2a2018);
    const top = cyl(0.35, 0.35, 0.4, wood, 0, 0.95, 0, 20);
    top.rotation.x = Math.PI / 2;
    top.scale.set(1, 1, 0.55);
    return group(
      box(0.7, 0.95, 0.4, wood, 0, 0.475, 0),
      top,
      box(0.46, 0.4, 0.01, cloth, 0, 0.62, 0.205),
      box(0.03, 0.4, 0.015, std(C.gold, { metalness: 0.6 }), 0, 0.62, 0.21),
      box(0.3, 0.08, 0.01, glow(0xffd28a), 0, 0.9, 0.205),
      box(0.62, 0.05, 0.36, std(0x2f1d12), 0, 0.02, 0),
    );
  },
  suitcases(THREE, C) {
    const { std, box, group } = kit(THREE);
    const g = group();
    const cases = [
      [1.0, 0.45, 0.6, 0x4a3322, 0, 0],
      [0.8, 0.22, 0.5, 0x6b4a2e, 0.05, 0.08],
      [0.7, 0.2, 0.45, 0x3d3f2a, -0.1, -0.12],
      [0.55, 0.18, 0.38, 0x7a5a3a, 0.08, 0.2],
      [0.45, 0.3, 0.3, 0x2d2a26, 0.7, 0],
    ];
    let y = 0;
    cases.forEach(([w, h, d, c, x, rot], i) => {
      const onFloor = i === cases.length - 1;
      const b = box(w, h, d, std(c), x, (onFloor ? 0 : y) + h / 2, 0);
      b.rotation.y = rot;
      g.add(b);
      if (!onFloor) y += h;
    });
    g.add(box(0.12, 0.03, 0.03, std(C.gold, { metalness: 0.6 }), 0.05, y + 0.015, 0));
    return g;
  },
  typewriter(THREE) {
    const { std, box, cyl, group } = kit(THREE);
    const desk = std(0x5a5a52), metal = std(0x1f2226, { metalness: 0.4, roughness: 0.5 });
    const keys = box(0.42, 0.04, 0.16, metal, 0, 0.83, 0.12);
    keys.rotation.x = 0.25;
    const platen = cyl(0.035, 0.035, 0.5, std(0x111111), 0, 0.92, -0.08);
    platen.rotation.z = Math.PI / 2;
    const paper = box(0.22, 0.28, 0.005, std(0xece6d6), 0, 1.05, -0.1);
    paper.rotation.x = -0.15;
    const g = group(box(1.1, 0.05, 0.6, desk, 0, 0.74, 0), box(0.45, 0.12, 0.3, metal, 0, 0.82, -0.02), keys, platen, paper);
    for (const x of [-0.5, 0.5]) g.add(box(0.05, 0.72, 0.55, desk, x, 0.36, 0));
    return g;
  },
  bookshelf(THREE) {
    const { std, box, group } = kit(THREE);
    const timber = std(0xc8a57a, { roughness: 0.7 });
    const spines = TEX.spines(THREE, {});
    const g = group(box(2.0, 2.2, 0.04, timber, 0, 1.1, -0.18));
    for (const x of [-0.98, 0.98]) g.add(box(0.04, 2.2, 0.4, timber, x, 1.1, 0));
    for (let i = 0; i < 5; i++) {
      g.add(box(1.96, 0.03, 0.4, timber, 0, 0.1 + i * 0.5, 0));
      if (i < 4) {
        const row = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.42), new THREE.MeshStandardMaterial({ map: spines, roughness: 0.8 }));
        row.position.set(0, 0.33 + i * 0.5, 0.1);
        g.add(row);
      }
    }
    return g;
  },
};

// ---------- the nine styles ----------

/**
 * Glowing windows on the back wall: each from `pts` (built from y=0), at height y; `bars` are [w, h, dx, dy]
 * glazing bars in `barMat` over each window.
 */
function windows(THREE, f, xs, pts, y, color, { bars = [], barMat, opacity = 1 } = {}) {
  const { glow, pane, box, group } = kit(THREE);
  const mat = glow(color, { transparent: opacity < 1, opacity });
  const g = group();
  for (const x of xs) {
    const p = pane(pts, mat);
    p.position.set(x, y, f.zf + 0.01);
    g.add(p);
    for (const [w, h, dx, dy] of bars) g.add(box(w, h, 0.03, barMat, x + dx, y + dy, f.zf + 0.02));
  }
  return g;
}

/** Pool of window light on the floor in front of the back wall, stretched along it. */
function windowPool(THREE, f, color, opacity) {
  return lightPool(THREE, poolTexture(THREE), color, opacity, Math.max(4, f.w * 0.8), 2.4, f.cx, f.zf + 1.2);
}

/** `light` with only its floor pools left: over a low back wall there is no wall to hang windows on. */
function poolsOnly(light) {
  const drop = [];
  light.traverse((o) => o.isMesh && !o.userData.pool && drop.push(o));
  for (const o of drop) o.removeFromParent();
  return light;
}

/** Builds one style: the shell plus signature, window light and landmark; tags the group with its name. */
function room(THREE, r, name, { wall, floor, signature, windowLight, landmark, extra }) {
  const f = frame(r);
  const g = shell(THREE, f, { wall, floor });
  const light = f.low ? poolsOnly(windowLight(f)) : windowLight(f);
  g.add(placeSignature(f, signature(f)), part(light, "window"), placeLandmark(f, landmark));
  if (extra) g.add(extra(f));
  g.userData.style = name;
  return g;
}

/** Room builders by style name: (THREE, {x0, x1, z0, z1}, COLORS) → Group. */
export const STYLES = {
  // Vaulted stone hall of an early print shop: a row of vault arches, small round-arched windows, candlelight.
  "print-shop"(THREE, r) {
    const { std, slab, group } = kit(THREE);
    const stone = TEX.blocks(THREE, { mortar: 0x2a2a2e, faces: [0x5d5b58, 0x666360, 0x55524e], rows: 4, cols: 2, tile: 1.4 });
    return room(THREE, r, "print-shop", {
      wall: surface(THREE, stone),
      floor: surface(THREE, TEX.blocks(THREE, { mortar: 0x1d1d20, faces: [0x3d3b38, 0x45423e], rows: 3, cols: 3, seed: 7, tile: 1.8 })),
      signature: (f) => {
        const bays = Math.max(1, Math.round(f.w / 5));
        const bw = f.w / bays, h = Math.min(1.4, bw * 0.3);
        const mat = std(0xffffff, { map: tiled(stone, 1, 1) });
        const g = group();
        for (let i = 0; i < bays; i++) {
          const pts = [];
          for (let k = 0; k <= 12; k++) {
            const a = Math.PI * (k / 12);
            pts.push([-Math.cos(a) * bw / 2, Math.sin(a) * h]);
          }
          const arch = slab(pts, WALL_T * 0.9, mat);
          arch.position.x = -f.w / 2 + bw * (i + 0.5);
          g.add(arch);
        }
        return g;
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.2), archPts(0.5, 0.6), 1.7, 0xffb36b), windowPool(THREE, f, 0xffb36b, 0.18)),
      landmark: LANDMARKS.printingPress(THREE),
    });
  },
  // Red-brick Lutheran hall: stepped gable, warm lancet windows, a pulpit.
  "brick-church"(THREE, r, C) {
    const { std, box, group } = kit(THREE);
    const brick = TEX.blocks(THREE, { mortar: 0x3a1d17, faces: [0x8a3a28, 0x7a3122, 0x933f2b], rows: 8, cols: 4, seed: 11, tile: 1.2 });
    return room(THREE, r, "brick-church", {
      wall: surface(THREE, brick),
      floor: surface(THREE, TEX.blocks(THREE, { mortar: 0x2a1612, faces: [0x5a2e24, 0x4e281f], rows: 6, cols: 3, seed: 12, tile: 1.6 })),
      signature: (f) => {
        const gw = Math.min(f.w * 0.6, 9), steps = 5;
        const g = group();
        for (let i = 0; i < steps; i++) {
          const w = gw * (1 - i / steps);
          g.add(box(w, 0.5, WALL_T * 0.9, std(0xffffff, { map: tiled(brick, w, 0.5) }), 0, 0.25 + i * 0.5, 0));
        }
        return g;
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.3), archPts(0.45, 1.3, true), 0.9, 0xffb060), windowPool(THREE, f, 0xffa040, 0.2)),
      landmark: LANDMARKS.pulpit(THREE, C),
    });
  },
  // Samogitian log chapel: log walls, steep gable with a small cross, cool moonlight.
  "log-chapel"(THREE, r, C) {
    const { std, slab, box, group } = kit(THREE);
    const logs = TEX.boards(THREE, { faces: [0x5a4030, 0x634633, 0x523a2a], n: 4, round: true, tile: 1.6 });
    return room(THREE, r, "log-chapel", {
      wall: surface(THREE, logs),
      floor: surface(THREE, TEX.boards(THREE, { faces: [0x3f2c1f, 0x46311f, 0x3a281b], n: 6, vertical: true, seed: 5, tile: 1.5 })),
      signature: (f) => {
        const gw = Math.min(f.w * 0.5, 7), h = gw * 0.55;
        const gold = std(C.gold, { metalness: 0.6, roughness: 0.35 });
        return group(
          slab([[-gw / 2, 0], [gw / 2, 0], [0, h]], WALL_T * 0.9, std(0xffffff, { map: tiled(logs, 1, 1) })),
          box(0.06, 0.7, 0.06, gold, 0, h + 0.35, 0),
          box(0.36, 0.06, 0.06, gold, 0, h + 0.5, 0),
        );
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.2), rectPts(0.7, 0.55), 1.5, 0x9fc4ff), windowPool(THREE, f, 0x9fc4ff, 0.32)),
      landmark: LANDMARKS.shrinePillar(THREE, C),
    });
  },
  // Farm barn at night: upright planks, gambrel roofline with a hay door, lanterns, the book smugglers' cart.
  barn(THREE, r) {
    const { std, slab, box, group, at } = kit(THREE);
    const planks = TEX.boards(THREE, { faces: [0x4a3424, 0x3f2c1f, 0x523a28], n: 6, vertical: true, seed: 9, tile: 1.4 });
    return room(THREE, r, "barn", {
      wall: surface(THREE, planks),
      floor: surface(THREE, TEX.wash(THREE, { base: 0x3a2e20, spots: [0x5a4a2a, 0x2a2016], n: 40, seed: 13, tile: 2 })),
      signature: (f) => {
        const a = Math.min(f.w * 0.7, 10) / 2, h = a * 0.8;
        return group(
          slab([[-a, 0], [a, 0], [a * 0.72, h * 0.6], [0, h], [-a * 0.72, h * 0.6]], WALL_T * 0.9, std(0xffffff, { map: tiled(planks, 1, 1) })),
          box(0.9, 1.0, 0.04, std(0x15100b), 0, h * 0.45, WALL_T / 2 + 0.02),
        );
      },
      windowLight: (f) => {
        const g = group();
        for (const x of [f.cx - 2, f.cx + 2]) {
          g.add(
            box(0.04, 0.04, 0.3, std(0x222222), x, 2.25, f.zf + 0.15),
            at(lantern(THREE, 0xffc77a), x, 2.0, f.zf + 0.3),
            lightPool(THREE, poolTexture(THREE), 0xffc77a, 0.28, 3, 1.8, x, f.zf + 0.9),
          );
        }
        return g;
      },
      landmark: LANDMARKS.smugglersCart(THREE),
    });
  },
  // Village farmstead room: whitewashed walls, thatched hip roof with crossed horse-head boards, small warm windows.
  farmstead(THREE, r) {
    const { std, slab, box, group } = kit(THREE);
    const frameMat = std(0x3b2a1c);
    const bars = [[0.04, 0.6, 0, 0.3], [0.5, 0.04, 0, 0.3]];
    return room(THREE, r, "farmstead", {
      wall: surface(THREE, TEX.wash(THREE, { base: 0xb9b3a4, spots: [0xd8d2c2, 0x8f897c], n: 40, seed: 17, tile: 2 })),
      floor: surface(THREE, TEX.boards(THREE, { faces: [0x5a4632, 0x4f3d2b, 0x614b35], n: 4, vertical: true, seed: 18, tile: 1.6 })),
      signature: (f) => {
        const a = Math.min(f.w * 0.8, 12) / 2, h = 1.6;
        const thatch = TEX.boards(THREE, { faces: [0x8a7238, 0x7a6430, 0x957b3e], n: 16, vertical: true, seed: 19, tile: 1 });
        const g = group(slab([[-a, 0], [a, 0], [a * 0.45, h], [-a * 0.45, h]], WALL_T * 0.9, std(0xffffff, { map: tiled(thatch, 1, 1) })));
        for (const s of [-1, 1]) {
          const horse = box(0.08, 0.9, 0.06, frameMat, s * 0.15, h + 0.3, 0);
          horse.rotation.z = s * 0.5;
          g.add(horse);
        }
        return g;
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.3), rectPts(0.5, 0.6), 1.4, 0xffc77a, { bars, barMat: frameMat }), windowPool(THREE, f, 0xffc77a, 0.16)),
      landmark: LANDMARKS.wellSweep(THREE),
    });
  },
  // Interwar Kaunas modernism: smooth plaster, rounded corners, a rounded stair tower, tall glass, a radio set.
  "kaunas-modern"(THREE, r, C) {
    const { std, glow, box, group, at } = kit(THREE);
    const plaster = TEX.wash(THREE, { base: 0x9c8f78, spots: [0xb0a38a, 0x857a66], n: 20, seed: 23, tile: 3 });
    const wall = surface(THREE, plaster);
    // Front half of a cylinder: the tower and the corners stay in front of the back wall.
    const halfCyl = (radius, h, mat, start, len) =>
      new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 20, 1, false, start, len), mat);
    return room(THREE, r, "kaunas-modern", {
      wall,
      floor: surface(THREE, TEX.blocks(THREE, { mortar: 0x2a2018, faces: [0x6b4a2e, 0x5e4128, 0x77543a], rows: 8, cols: 2, seed: 24, tile: 1.2 })),
      signature: (f) => {
        const tower = Math.min(1.1, f.w * 0.08);
        return group(
          box(f.w, 0.22, WALL_T * 0.9, std(0xc9bda4), 0, 0.11, 0),
          at(halfCyl(tower, 2.2, wall(2, 2.2), -Math.PI / 2, Math.PI), f.w / 2 - tower - 0.6, 1.1, 0),
          box(0.18, 1.8, 0.02, glow(0xfff0c8), f.w / 2 - tower - 0.6, 1.1, tower + 0.015),
        );
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.35), rectPts(0.6, 2.3), 0.5, 0xfff0c8, { opacity: 0.9 }), windowPool(THREE, f, 0xfff0c8, 0.14)),
      landmark: LANDMARKS.radio(THREE, C),
      extra: (f) => {
        const g = group();
        // Seen from inside the room: the inner face of a quarter cylinder filling each back corner.
        const rad = 0.7, mat = wall(2, WALL_H);
        mat.side = THREE.BackSide;
        g.add(at(halfCyl(rad, WALL_H, mat, Math.PI, Math.PI / 2), f.x0 + WALL_T / 2 + rad, WALL_H / 2, f.zf + rad));
        g.add(at(halfCyl(rad, WALL_H, mat, Math.PI / 2, Math.PI / 2), f.x1 - WALL_T / 2 - rad, WALL_H / 2, f.zf + rad));
        return g;
      },
    });
  },
  // Wooden displaced-persons barrack: weatherboards, low tar-paper roof with a stovepipe, small dim windows, suitcases.
  "dp-barrack"(THREE, r, C) {
    const { std, slab, cyl, group } = kit(THREE);
    const boards = TEX.boards(THREE, { faces: [0x4d473c, 0x575043, 0x443f35], n: 8, seed: 29, tile: 1.2 });
    const bars = [[0.03, 0.5, 0, 0.25], [0.5, 0.03, 0, 0.25]];
    return room(THREE, r, "dp-barrack", {
      wall: surface(THREE, boards),
      floor: surface(THREE, TEX.boards(THREE, { faces: [0x3a352c, 0x332e26], n: 8, vertical: true, seed: 30, tile: 1.4 })),
      signature: (f) => {
        const a = Math.min(f.w * 0.9, 14) / 2, h = 0.9;
        return group(
          slab([[-a, 0], [a, 0], [0, h]], WALL_T * 0.9, std(0x23211f, { roughness: 1 })),
          cyl(0.06, 0.06, 1.0, std(0x3a3a3a, { metalness: 0.5 }), a * 0.4, 0.8, 0.01),
        );
      },
      windowLight: (f) => group(windows(THREE, f, windowXs(f, 0.2), rectPts(0.5, 0.5), 1.6, 0xe8d8a8, { bars, barMat: std(0x2a2620), opacity: 0.85 }), windowPool(THREE, f, 0xfff0c8, 0.1)),
      landmark: LANDMARKS.suitcases(THREE, C),
    });
  },
  // Soviet-era grey concrete panels: a block-of-flats roofline with a few lit windows, fluorescent tubes, a typewriter.
  concrete(THREE, r) {
    const { std, glow, box, group } = kit(THREE);
    const panels = TEX.wash(THREE, { base: 0x6e6f6c, spots: [0x5a5b58, 0x7f807c], n: 25, seams: true, seed: 31, tile: 1.6 });
    return room(THREE, r, "concrete", {
      wall: surface(THREE, panels),
      floor: surface(THREE, TEX.blocks(THREE, { mortar: 0x2e302e, faces: [0x4a4c48, 0x3f413e], rows: 2, cols: 2, seed: 32, tile: 1 })),
      signature: (f) => {
        const bw = Math.min(f.w * 0.7, 12), h = 1.5;
        const g = group(box(bw, h, WALL_T * 0.9, std(0xffffff, { map: tiled(panels, bw, h) }), 0, h / 2, 0));
        const lit = rng(37);
        const cols = Math.floor(bw / 1.2);
        for (let row = 0; row < 2; row++) {
          for (let c = 0; c < cols; c++) {
            const on = lit() < 0.3;
            g.add(box(0.5, 0.4, 0.02, on ? glow(0xd8f0ff) : std(0x1c1e22), -bw / 2 + 1.2 * (c + 0.5) + (bw - cols * 1.2) / 2, 0.45 + row * 0.65, WALL_T * 0.45 + 0.01));
          }
        }
        return g;
      },
      windowLight: (f) => {
        const g = group(windowPool(THREE, f, 0xd8f0ff, 0.16));
        for (const x of windowXs(f, 0.4, 0.8)) g.add(box(1.2, 0.05, 0.05, glow(0xe8f6ff), x, 2.85, f.zf + 0.05), box(1.3, 0.04, 0.12, std(0x8a8c8a), x, 2.9, f.zf + 0.06));
        return g;
      },
      landmark: LANDMARKS.typewriter(THREE),
    });
  },
  // After 1990: glass walls in light timber frames, a sloped glass roofline, daylight blue, a bookshop shelf.
  glass(THREE, r) {
    const { std, slab, box, group } = kit(THREE);
    const timber = std(0xc8a57a, { roughness: 0.7 });
    return room(THREE, r, "glass", {
      wall: surface(THREE, null, { color: 0x6f8ea6, transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.1 }),
      floor: surface(THREE, TEX.boards(THREE, { faces: [0xb08a5e, 0xa47f55, 0xbb956a], n: 8, seed: 41, tile: 1.6 })),
      signature: (f) => {
        const a = Math.min(f.w * 0.8, 12) / 2;
        const g = group(slab([[-a, 0], [a, 0], [a, 1.8], [-a, 0.4]], WALL_T * 0.6, std(0x9fc0d8, { transparent: true, opacity: 0.5, roughness: 0.2 })));
        const edge = box(Math.hypot(2 * a, 1.4), 0.1, WALL_T * 0.9, timber, 0, 1.1, 0);
        edge.rotation.z = Math.atan2(1.4, 2 * a);
        g.add(edge);
        return g;
      },
      windowLight: (f) => {
        const g = group(windowPool(THREE, f, 0xcfe4ff, 0.2));
        g.add(windows(THREE, f, windowXs(f, 0.4, 0.6), rectPts(1.2, 2.6), 0.3, 0xcfe4ff, { opacity: 0.35 }));
        for (let x = f.x0 + 1.5; x < f.x1 - 0.5; x += 1.5) g.add(box(0.08, WALL_H, 0.08, timber, x, WALL_H / 2, f.zf + 0.05));
        return g;
      },
      landmark: LANDMARKS.bookshelf(THREE),
    });
  },
};

export const STYLE_KEYS = Object.keys(STYLES);

/** Plain walled room in world coordinates: floor, back wall, two short end walls; open to the path (+z). */
export function plainRoom(THREE, r, C) {
  return shell(THREE, frame(r), { wall: surface(THREE, null, { color: C.path }), floor: surface(THREE, null, { color: C.floor, roughness: 1 }) });
}

// ---------- path lamps: one model per light band kind ----------

/** A lamp on a post beside the path, its light in the band's colour; userData.headY is the light's height. */
export function pathLamp(THREE, band, C) {
  const { std, glow, box, cyl, group, at } = kit(THREE);
  const post = std(C.path, { metalness: 0.3 });
  const lit = glow(band.color);
  const heads = {
    candle: () => [cyl(0.03, 0.05, 1.1, post, 0, 0.55, 0), cyl(0.09, 0.09, 0.02, post, 0, 1.1, 0), cyl(0.025, 0.025, 0.15, std(0xe8e0cc), 0, 1.19, 0), cyl(0, 0.022, 0.07, lit, 0, 1.3, 0, 8), 1.3],
    lantern: () => [cyl(0.035, 0.04, 1.9, post, 0, 0.95, 0), at(lantern(THREE, band.color), 0, 2.03, 0), 2.03],
    bulb: () => [cyl(0.03, 0.035, 2.4, post, 0, 1.2, 0), box(0.04, 0.04, 0.4, post, 0, 2.4, -0.2), cyl(0.12, 0.02, 0.1, post, 0, 2.33, -0.38), new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lit).translateY(2.25).translateZ(-0.38), 2.25],
    fluorescent: () => {
      const tube = cyl(0.025, 0.025, 0.9, lit, 0, 2.55, 0, 8);
      tube.rotation.z = Math.PI / 2;
      return [cyl(0.03, 0.035, 2.6, post, 0, 1.3, 0), box(1.0, 0.04, 0.1, post, 0, 2.62, 0), tube, 2.55];
    },
    daylight: () => [box(0.12, 2.4, 0.12, std(0xd8d4cc, { roughness: 0.4 }), 0, 1.2, 0), box(0.06, 1.4, 0.02, lit, 0, 1.4, 0.065), 1.8],
  };
  const parts = (heads[band.kind] ?? heads.bulb)();
  const headY = parts.pop();
  const g = group(...parts);
  g.userData = { lamp: band.kind, headY };
  return g;
}

/** Walking path strip from x0 to x1, centred on z. */
export function path(THREE, { x0, x1, z }, C) {
  return kit(THREE).flat(x1 - x0, PATH_W, new THREE.MeshStandardMaterial({ color: C.path, roughness: 1 }), (x0 + x1) / 2, 0.02, z);
}

/** Ground under the whole world. */
export function ground(THREE, { x0, x1, z0, z1 }, C) {
  const mat = new THREE.MeshStandardMaterial({ color: C.bg, roughness: 1 });
  return kit(THREE).flat(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, 0, (z0 + z1) / 2);
}

/** Gold tube arcing from `a` to `b` ({x, y, z}); longer links arc higher. */
export function linkArc(THREE, a, b, C) {
  const [p0, p2] = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
  const lift = Math.min(ARC.maxLift, ARC.lift + ARC.perMetre * p0.distanceTo(p2));
  const p1 = p0.clone().add(p2).multiplyScalar(0.5);
  p1.y = Math.max(p0.y, p2.y) + lift;
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), ARC.segments, ARC.r, 6, false);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: ARC.opacity }));
}

/** Gold bar from x0 to x1 lying on the tops of the year markers at z. */
export function lifespanBar(THREE, x0, x1, z, C) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, LIFESPAN.h, LIFESPAN.d), new THREE.MeshBasicMaterial({ color: C.gold }));
  m.position.set((x0 + x1) / 2, MARKER_H, z);
  return m;
}

/** Year marker: a short gold post with the year above it (userData.label); origin at its foot. */
export function yearMarker(THREE, year, C) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(MARKER_R, MARKER_R, MARKER_H, 8),
    new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.5, roughness: 0.4 }),
  );
  post.position.y = MARKER_H / 2;
  const label = makeLabel(THREE, String(year));
  label.position.set(0, MARKER_LABEL.y, MARKER_LABEL.out);
  g.add(post, label);
  g.userData.label = label;
  return g;
}
