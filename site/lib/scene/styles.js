// The look of rooms and the ground they stand on. Builders take THREE and COLORS as arguments;
// nothing here imports Three.js. Every room builder tags its wall meshes with userData.wall,
// so picks stop at walls.
import { makeLabel } from "./labels.js";

const WALL_H = 3.2;
const WALL_T = 0.15;
const MARGIN = 0.6; // floor beyond the outer spot rows
const PATH_W = 1.4;

const flat = (THREE, w, d, color, x, y, z) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

/** Plain walled room in world coordinates: floor, back wall, two short end walls; open to the path (+z). */
export function plainRoom(THREE, { x0, x1, z0, z1 }, C) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: C.path, roughness: 0.9 });
  const w = x1 - x0;
  const d = z1 - z0 + 2 * MARGIN;
  const wall = (geo, x, z) => {
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(x, WALL_H / 2, z);
    m.userData.wall = true;
    return m;
  };
  g.add(flat(THREE, w, d, C.floor, x0 + w / 2, 0.01, (z0 + z1) / 2));
  g.add(wall(new THREE.BoxGeometry(w, WALL_H, WALL_T), x0 + w / 2, z0 - MARGIN));
  // End walls cover the back half only, so the room stays visible from the path.
  const endD = d / 2;
  for (const x of [x0, x1]) g.add(wall(new THREE.BoxGeometry(WALL_T, WALL_H, endD), x, z0 - MARGIN + endD / 2));
  return g;
}

/** Walking path strip from x0 to x1, centred on z. */
export function path(THREE, { x0, x1, z }, C) {
  return flat(THREE, x1 - x0, PATH_W, C.path, (x0 + x1) / 2, 0.02, z);
}

/** Ground under the whole world. */
export function ground(THREE, { x0, x1, z0, z1 }, C) {
  return flat(THREE, x1 - x0, z1 - z0, C.bg, (x0 + x1) / 2, 0, (z0 + z1) / 2);
}

/** Year marker: a short gold post with the year above it; origin at its foot. */
export function yearMarker(THREE, year, C) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.5, roughness: 0.4 }),
  );
  post.position.y = 0.25;
  const label = makeLabel(THREE, String(year));
  label.position.y = 0.8;
  g.add(post, label);
  return g;
}
