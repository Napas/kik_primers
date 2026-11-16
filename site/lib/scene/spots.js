// One model per spot kind. Origin at floor level, front faces +z. Sizes in metres.
// Pick spheres (pickY, pickRadius) stay under half the layout's 1.4 m row gap, so neighbours' spheres never overlap.
import { textTexture } from "./labels.js";
import { SCENE } from "../theme.js";

const css = (n) => `#${n.toString(16).padStart(6, "0")}`;

/** First letters of the first and last word, upper case; "?" for an empty name. */
export function initials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words.at(-1)[0] : "";
  return (first + last).toLocaleUpperCase("lt");
}

const PORTRAIT = { w: 0.66, h: 0.86 };

/** Shows `texture` on a person's portrait in place of the initials, cropped to fill the frame (top kept). */
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
  m.map = texture;
  m.needsUpdate = true;
}

function parts(THREE, C) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const gold = mat(C.gold, { metalness: 0.6, roughness: 0.35 });
  const stone = mat(C.path);
  const mesh = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  };
  const textPlane = (text, w, h, opts) => {
    const map = textTexture(THREE, text, opts);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
  };
  return { mat, gold, stone, mesh, textPlane };
}

const MODELS = {
  person(THREE, spot, C) {
    const { gold, stone, mesh, textPlane } = parts(THREE, C);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.6, 1, 0.6), stone, 0, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 1, 0.06), gold, 0, 1.6, 0));
    const portrait = textPlane(initials(spot.name), PORTRAIT.w, PORTRAIT.h, { px: 150, w: 256, h: 334, fg: css(C.gold) });
    portrait.position.set(0, 1.6, 0.031);
    g.add(portrait);
    g.userData.portrait = portrait;
    return { g, labelY: 2.4, pickY: 1.4, pickRadius: 0.65 };
  },
  work(THREE, spot, C) {
    const { gold, stone, mesh } = parts(THREE, C);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 16), stone, 0, 0.45, 0));
    const book = mesh(new THREE.BoxGeometry(0.5, 0.7, 0.12), gold, 0, 1.15, 0);
    book.rotation.x = -0.35;
    g.add(book);
    return { g, labelY: 1.9, pickY: 0.9, pickRadius: 0.6 };
  },
  group(THREE, spot, C) {
    const { mat, gold, mesh } = parts(THREE, C);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 8), gold, -0.45, 1.2, 0));
    const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), gold, 0, 2.3, 0);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    g.add(mesh(new THREE.PlaneGeometry(0.9, 1.2), mat(C.gold, { side: THREE.DoubleSide, roughness: 0.9 }), 0, 1.65, 0.01));
    return { g, labelY: 2.7, pickY: 1.5, pickRadius: 0.65 };
  },
  event(THREE, spot, C) {
    const { stone, mesh, textPlane } = parts(THREE, C);
    const g = new THREE.Group();
    const rock = mesh(new THREE.DodecahedronGeometry(0.45), stone, 0, 0.5, 0);
    rock.scale.set(1, 1.3, 0.8);
    g.add(rock);
    const year = spot.at ?? spot.years?.[0];
    if (year !== undefined) {
      const plate = textPlane(String(year), 0.5, 0.22, { px: 80, w: 256, h: 112, fg: css(C.gold) });
      plate.position.set(0, 0.6, 0.38);
      g.add(plate);
    }
    return { g, labelY: 1.6, pickY: 0.6, pickRadius: 0.6 };
  },
  place(THREE, spot, C) {
    const { gold, stone, mesh } = parts(THREE, C);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), stone, 0, 1, 0));
    const arrow = new THREE.Shape([[0, 0], [0.7, 0], [0.9, 0.15], [0.7, 0.3], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
    const board = new THREE.Mesh(new THREE.ExtrudeGeometry(arrow, { depth: 0.04, bevelEnabled: false }), gold);
    board.position.set(-0.1, 1.55, -0.02);
    g.add(board);
    return { g, labelY: 2.3, pickY: 1.3, pickRadius: 0.65 };
  },
  thing(THREE, spot, C) {
    const { gold, stone, mesh } = parts(THREE, C);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), stone, 0, 0.45, 0));
    const plate = mesh(new THREE.BoxGeometry(0.6, 0.4, 0.03), gold, 0, 0.98, 0.05);
    plate.rotation.x = -0.6;
    g.add(plate);
    return { g, labelY: 1.6, pickY: 0.7, pickRadius: 0.6 };
  },
};

const SHARED = new WeakMap();

/** One pool/cone geometry, material and canvas texture per THREE instance, shared by every spot. */
function spotlightParts(THREE) {
  let p = SHARED.get(THREE);
  if (p) return p;
  const { color, pool, cone } = SCENE.spotlight;
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
  // The open cone is a ring of vertices at the apex (bright) and one at the floor (black, so additive
  // blending adds nothing there): the beam fades out towards the floor.
  const coneGeo = new THREE.CylinderGeometry(0.05, cone.radius, cone.height, 24, 1, true);
  const c = new THREE.Color(color).multiplyScalar(cone.top);
  const colors = [];
  const pos = coneGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) > 0 ? 1 : 0;
    colors.push(c.r * k, c.g * k, c.b * k);
  }
  coneGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  p = {
    poolGeo: new THREE.PlaneGeometry(pool.size, pool.size),
    poolMat: new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: pool.opacity, depthWrite: false }),
    coneGeo,
    coneMat: new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  };
  SHARED.set(THREE, p);
  return p;
}

/** A warm floor pool and a faint light cone over the spot: cheap stand-ins for a spotlight. */
function spotlight(THREE) {
  const { poolGeo, poolMat, coneGeo, coneMat } = spotlightParts(THREE);
  const g = new THREE.Group();
  g.name = "spotlight";
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.name = "spot-pool";
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.035, 0.15);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.name = "spot-cone";
  cone.position.y = SCENE.spotlight.cone.height / 2;
  cone.raycast = () => {};
  pool.raycast = () => {};
  g.add(pool, cone);
  return g;
}

/** The model for `spot.kind` (a plaque for unknown kinds), tagged with spotId, kind and its label/pick sizes. */
export function makeSpot(THREE, spot, COLORS) {
  const build = MODELS[spot.kind] ?? MODELS.thing;
  const { g, labelY, pickY, pickRadius } = build(THREE, spot, COLORS);
  g.add(spotlight(THREE));
  Object.assign(g.userData, { spotId: spot.id, kind: spot.kind, labelY, pickY, pickRadius });
  g.name = spot.id;
  return g;
}
