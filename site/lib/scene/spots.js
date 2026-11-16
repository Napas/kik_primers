// One model per spot kind. Origin at floor level, front faces +z. Sizes in metres.
// Pick spheres (pickY, pickRadius) stay under half the layout's row gap, so neighbours' spheres never overlap.
import { textTexture } from "./labels.js";
import { yearsText } from "../text.js";
import { cssColor, EXHIBIT, LABEL, poolLevel, SCENE } from "../theme.js";

const PORTRAIT = { w: 0.5, h: 0.66 };
const FRAME = { w: 0.64, h: 0.8, d: 0.05, tilt: 0.08 };
const PLAQUE = { h: 0.07, maxW: 0.4, y: 0.82 };
const SIGN = { h: 0.16, maxW: 0.58 }; // the name on a signpost's board
const RISER = { w: 1.3, d: 1.1 }; // the stone step under a raised spot

/** A spot id's stable pick from `list`, so the same spot always gets the same binding colour. */
function pickFor(id, list) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return list[h % list.length];
}

/** Shows `texture` on a person's portrait in place of the placeholder, cropped to fill the frame (top kept). */
export function setPhoto(spotObj, texture) {
  const m = spotObj.userData.portrait?.material;
  if (!m) return;
  const { width, height } = texture.image ?? {};
  if (width && height) {
    const img = width / height, frame = PORTRAIT.w / PORTRAIT.h;
    if (img > frame) {
      texture.repeat.set(frame / img, 1);
      texture.offset.set((1 - frame / img) / 2, 0);
    } else {
      texture.repeat.set(1, img / frame);
      texture.offset.set(0, 1 - img / frame);
    }
  }
  if (m.map !== texture) m.map?.dispose();
  m.map = m.emissiveMap = texture;
  m.needsUpdate = true;
}

const YEARS_CLEAR = 16; // px between the name block and the years line's centre on a placeholder

/** A dark panel with the name engraved one word per line and the years below: a person without a photo. */
function placeholderTexture(THREE, name, years) {
  const [W, H, PAD] = [256, 338, 22];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = EXHIBIT.panel;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = cssColor(EXHIBIT.brass);
  g.lineWidth = 3;
  g.strokeRect(PAD / 2, PAD / 2, W - PAD, H - PAD);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const yearsY = H - 3 * PAD;
  // Many words get shorter lines and a smaller font, so the name block ends YEARS_CLEAR above the years.
  const lineH = Math.min(44, Math.floor((2 * (yearsY - YEARS_CLEAR - H / 2)) / Math.max(1, words.length)));
  const top = H / 2 - (words.length * lineH) / 2;
  g.fillStyle = cssColor(EXHIBIT.brass);
  words.forEach((word, i) => {
    let px = Math.min(34, lineH - 10);
    g.font = `600 ${px}px ${LABEL.font}`;
    const w = g.measureText(word).width;
    if (w > W - 3 * PAD) px = Math.floor((px * (W - 3 * PAD)) / w); // a long word shrinks to fit
    g.font = `600 ${px}px ${LABEL.font}`;
    g.fillText(word, W / 2, top + lineH * (i + 0.5));
  });
  const span = yearsText(years);
  if (span) {
    g.fillStyle = EXHIBIT.panelInk;
    g.font = `400 24px ${LABEL.font}`;
    g.fillText(span, W / 2, yearsY);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A lit material showing `map` that also glows with it a little, so text and photos stay readable in the dark. */
function pictureMat(THREE, map) {
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: EXHIBIT.pictureGlow, roughness: 0.9 });
}

const MATS = new WeakMap(); // THREE -> materials

/** The plain exhibit materials (EXHIBIT colours), one set per THREE instance, shared by every spot. */
function sharedMats(THREE) {
  let m = MATS.get(THREE);
  if (!m) {
    // A faint glow in each material's own colour: exhibits read as lit against the darker room.
    const mat = (color, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: color, emissiveIntensity: EXHIBIT.glow, ...extra });
    m = {
      brass: mat(EXHIBIT.brass, { metalness: 0.5, roughness: 0.45 }),
      stone: mat(EXHIBIT.stone),
      stoneDark: mat(EXHIBIT.stoneDark),
      granite: mat(EXHIBIT.granite, { roughness: 0.7 }),
      paper: mat(EXHIBIT.paper, { roughness: 0.95 }),
      wood: mat(EXHIBIT.wood, { roughness: 0.75 }),
      cloth: mat(EXHIBIT.cloth, { side: THREE.DoubleSide, roughness: 0.95 }),
      glass: mat(EXHIBIT.glass, { transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }),
      bindings: EXHIBIT.bindings.map((c) => mat(c, { roughness: 0.7 })),
    };
    MATS.set(THREE, m);
  }
  return m;
}

// Model parts on the shared materials; text planes and plates get their own material, as each has its own map.
function parts(THREE) {
  const mats = sharedMats(THREE);
  const mesh = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  };
  const textPlane = (text, w, h, opts) => {
    const map = textTexture(THREE, text, opts);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), pictureMat(THREE, map));
  };
  // A plinth `h` tall and `w` wide: a dark base, a pale shaft and a cap. Its front face is at z = w / 2.
  const plinth = (h, w = 0.44) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.08, w + 0.12), mats.stoneDark, 0, 0.04, 0));
    g.add(mesh(new THREE.BoxGeometry(w, h - 0.14, w), mats.stone, 0, 0.08 + (h - 0.14) / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.08, 0.06, w + 0.08), mats.stoneDark, 0, h - 0.03, 0));
    return g;
  };
  // `text` on a plate `size.h` tall, narrower when it would pass `size.maxW`; named "plaque".
  const namePlate = (text, size, bg, fg) => {
    const map = textTexture(THREE, text, { px: 40, bg, fg });
    const { width, height } = map.image;
    const w = Math.min(size.maxW, (size.h * width) / height);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * height) / width), pictureMat(THREE, map));
    p.name = "plaque";
    return p;
  };
  const plaque = (name, z, y = PLAQUE.y) => {
    const p = namePlate(name, PLAQUE, cssColor(EXHIBIT.brass), EXHIBIT.ink);
    p.position.set(0, y, z + 0.002);
    return p;
  };
  return { ...mats, mesh, textPlane, plinth, namePlate, plaque };
}

const MODELS = {
  person(THREE, spot) {
    const { brass, mesh, plinth, plaque } = parts(THREE);
    const g = new THREE.Group();
    g.add(plinth(1.05), plaque(spot.name, 0.22));
    const frame = new THREE.Group();
    frame.add(mesh(new THREE.BoxGeometry(FRAME.w, FRAME.h, FRAME.d), brass, 0, 0, 0));
    const portrait = new THREE.Mesh(
      new THREE.PlaneGeometry(PORTRAIT.w, PORTRAIT.h),
      pictureMat(THREE, placeholderTexture(THREE, spot.name, spot.years)),
    );
    portrait.position.z = FRAME.d / 2 + 0.002;
    frame.add(portrait);
    frame.position.set(0, 1.05 + FRAME.h / 2, -0.04);
    frame.rotation.x = -FRAME.tilt;
    g.add(frame);
    g.userData.portrait = portrait;
    return { g, labelY: 2.15, pickY: 1.3, pickRadius: 0.65 };
  },
  work(THREE, spot) {
    const { bindings, paper, wood, mesh, plinth, plaque } = parts(THREE);
    const g = new THREE.Group();
    g.add(plinth(0.95), plaque(spot.name, 0.22, 0.74));
    const rest = new THREE.Group(); // a slanted reading stand with the book on it
    rest.add(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.36), wood, 0, 0, 0));
    rest.add(mesh(new THREE.BoxGeometry(0.46, 0.04, 0.03), wood, 0, 0.03, 0.17));
    const book = new THREE.Group();
    book.add(mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), pickFor(spot.id, bindings), 0, 0, 0));
    book.add(mesh(new THREE.BoxGeometry(0.32, 0.045, 0.245), paper, 0.012, 0, 0));
    book.position.set(0, 0.05, -0.01);
    rest.add(book);
    rest.position.set(0, 1.0, 0);
    rest.rotation.x = 0.5;
    g.add(rest);
    return { g, labelY: 1.7, pickY: 0.9, pickRadius: 0.6 };
  },
  group(THREE, spot) {
    const { brass, cloth, mesh, plinth, plaque } = parts(THREE);
    const g = new THREE.Group();
    g.add(plinth(0.5, 0.9), plaque(spot.name, 0.45, 0.3));
    for (const x of [-0.4, 0.4]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 8), brass, x, 1.45, 0));
    const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), brass, 0, 2.35, 0);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    g.add(mesh(new THREE.PlaneGeometry(0.72, 1.1), cloth, 0, 1.75, 0.01));
    return { g, labelY: 2.6, pickY: 1.5, pickRadius: 0.65 };
  },
  event(THREE, spot, C) {
    const { granite, stoneDark, mesh, textPlane } = parts(THREE);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.1, 0.36), stoneDark, 0, 0.05, 0));
    const stele = mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.0, 4, 1), granite, 0, 0.6, 0);
    stele.rotation.y = Math.PI / 4;
    stele.scale.set(1, 1, 0.42);
    g.add(stele);
    const year = spot.at ?? spot.years?.[0];
    if (year !== undefined) {
      const plate = textPlane(String(year), 0.3, 0.13, { px: 80, w: 256, h: 112, bg: cssColor(EXHIBIT.granite), fg: cssColor(C.gold) });
      plate.position.set(0, 0.85, 0.081);
      g.add(plate);
    }
    return { g, labelY: 1.5, pickY: 0.6, pickRadius: 0.6 };
  },
  place(THREE, spot) {
    const { wood, stoneDark, mesh, namePlate } = parts(THREE);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), stoneDark, 0, 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 2, 0.08), wood, 0, 1, 0));
    const arrow = new THREE.Shape([[0, 0], [0.62, 0], [0.8, 0.12], [0.62, 0.24], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)));
    const board = new THREE.Mesh(new THREE.ExtrudeGeometry(arrow, { depth: 0.03, bevelEnabled: false }), wood);
    board.position.set(-0.08, 1.55, 0.04);
    g.add(board);
    const sign = namePlate(spot.name, SIGN, cssColor(EXHIBIT.wood), EXHIBIT.signInk);
    sign.position.set(-0.08 + 0.31, 1.67, 0.071);
    g.add(sign);
    return { g, labelY: 2.25, pickY: 1.3, pickRadius: 0.65 };
  },
  thing(THREE, spot) {
    const { brass, glass, paper, mesh, plinth, plaque } = parts(THREE);
    const g = new THREE.Group();
    g.add(plinth(0.95, 0.5), plaque(spot.name, 0.25, 0.74));
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.4, 0.46), glass, 0, 1.15, 0));
    g.add(mesh(new THREE.BoxGeometry(0.48, 0.02, 0.48), brass, 0, 1.36, 0));
    const leaf = mesh(new THREE.BoxGeometry(0.26, 0.01, 0.2), paper, 0, 0.99, 0);
    leaf.rotation.y = 0.3;
    g.add(leaf);
    return { g, labelY: 1.7, pickY: 0.8, pickRadius: 0.6 };
  },
};

const SHARED = new WeakMap();

/** One pool geometry and canvas texture per THREE instance, shared by every spot; materials per level. */
function poolParts(THREE) {
  let p = SHARED.get(THREE);
  if (p) return p;
  const { color, size, opacity } = SCENE.pool;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  p = {
    geo: new THREE.PlaneGeometry(size, size),
    mat: new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false }),
    levels: new Map(),
  };
  SHARED.set(THREE, p);
  return p;
}

/** The pool material at `level` (0 to 1), shared by every spot at that level. */
function poolMat(THREE, level) {
  const p = poolParts(THREE);
  if (level >= 1) return p.mat;
  let m = p.levels.get(level);
  if (!m) {
    m = p.mat.clone();
    m.opacity *= level;
    p.levels.set(level, m);
  }
  return m;
}

/** A warm pool of light drawn on the floor under the spot, at `level` strength; no real light. */
function floorPool(THREE, level) {
  const pool = new THREE.Mesh(poolParts(THREE).geo, poolMat(THREE, level));
  pool.name = "spot-pool";
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.035, 0.15);
  pool.raycast = () => {};
  const g = new THREE.Group();
  g.name = "pool";
  g.add(pool);
  return g;
}

/**
 * The model for `spot.kind` (the thing model for unknown kinds), tagged with spotId, kind and its label/pick sizes.
 * opts.band: the LIGHT_BANDS entry lighting the spot, which sets its floor pool's strength (full without one).
 * opts.lift: metres of stone riser under the model, so rows further back show over the rows in front.
 * opts.scale: size of the model (named "model") on its riser; front rows stand smaller.
 */
export function makeSpot(THREE, spot, COLORS, { band, lift = 0, scale = 1 } = {}) {
  const build = MODELS[spot.kind] ?? MODELS.thing;
  const { g: model, labelY, pickY, pickRadius } = build(THREE, spot, COLORS);
  model.name = "model";
  model.scale.setScalar(scale);
  model.position.y = lift;
  const pool = floorPool(THREE, band ? poolLevel(band) : 1);
  pool.position.y = lift;
  const g = new THREE.Group();
  g.add(model, pool);
  if (lift > 0) {
    const riser = new THREE.Mesh(new THREE.BoxGeometry(RISER.w, lift, RISER.d), sharedMats(THREE).stoneDark);
    riser.name = "riser";
    riser.position.y = lift / 2;
    g.add(riser);
  }
  Object.assign(g.userData, model.userData, {
    spotId: spot.id,
    kind: spot.kind,
    labelY: labelY * scale + lift,
    pickY: pickY * scale + lift,
    pickRadius: pickRadius * scale,
  });
  g.name = spot.id;
  return g;
}
