// Builds the 3D world from a pack and its time layout: rooms along x, a path in front of each lane,
// year markers on the first lane, one model and label per spot. Builders take THREE as an argument.
import { COLORS, SCENE } from "../theme.js";
import { makeSpot, setPhoto } from "./spots.js";
import { makeLabel } from "./labels.js";

const WALL_H = 3.2;
const WALL_T = 0.15;
const MARGIN = 0.6; // floor beyond the outer spot rows
const PATH_W = 1.4;
const PATH_OFFSET = 1.4; // path centre in front of a room's z1
const START_BACK = 5; // camera start before the first room
const START_LOOK = 10; // the start view aims this far along the path, at the room front
const ROOM_TITLE_Y = 2.9;

/** z of the walking path along the lane of `room` (a layout room). */
export const pathZ = (room) => room.z1 + PATH_OFFSET;

// Plain walled room in world coordinates: floor, back wall, two short end walls; open to the path.
function plainRoom(THREE, { x0, x1, z0, z1 }, C) {
  const g = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ color: C.floor, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: C.path, roughness: 0.9 });
  const w = x1 - x0;
  const d = z1 - z0 + 2 * MARGIN;
  const zMid = (z0 + z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x0 + w / 2, 0.01, zMid);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, WALL_T), wallMat);
  back.position.set(x0 + w / 2, WALL_H / 2, z0 - MARGIN);
  g.add(floor, back);
  // End walls cover the back half only, so the room stays visible from the path.
  const endD = d / 2;
  for (const x of [x0, x1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H, endD), wallMat);
    end.position.set(x, WALL_H / 2, z0 - MARGIN + endD / 2);
    g.add(end);
  }
  return g;
}

function strip(THREE, x0, x1, z, width, y, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, width), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, z);
  return m;
}

function yearMarker(THREE, year, x, z) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.5, roughness: 0.4 }),
  );
  post.position.y = 0.25;
  const label = makeLabel(THREE, String(year));
  label.position.y = 0.8;
  g.add(post, label);
  g.position.set(x, 0, z);
  return g;
}

/**
 * opts: aspect (camera); loadPhoto(file, apply(texture)) to fetch a person's photo, initials stay until apply.
 * Returns {scene, camera, spotMeshes: Map<id, Object3D>, roomGroups: Map<n, Group>, update(dt)}.
 */
export function buildWorld(THREE, pack, layout, { aspect = 1, loadPhoto } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, SCENE.fog.near, SCENE.fog.far);
  scene.add(new THREE.HemisphereLight(SCENE.ambient.sky, SCENE.ambient.ground, SCENE.ambient.intensity));
  const fill = new THREE.DirectionalLight(SCENE.fill.color, SCENE.fill.intensity);
  fill.position.set(-2, 8, 6);
  scene.add(fill);

  const first = layout.rooms.reduce((a, r) => (r.x0 < a.x0 ? r : a), layout.rooms[0] ?? { x0: 0, x1: 0, z0: 0, z1: 0, lane: 0 });
  const startX = first.x0 - START_BACK;

  const zs = layout.rooms.flatMap((r) => [r.z0, pathZ(r)]);
  const [zMin, zMax] = [Math.min(0, ...zs), Math.max(0, ...zs)];
  scene.add(strip(THREE, startX - 20, layout.length + 20, (zMin + zMax) / 2, zMax - zMin + 40, 0, COLORS.bg));

  const lanes = new Map();
  for (const r of layout.rooms) {
    const l = lanes.get(r.lane) ?? { x0: Infinity, x1: -Infinity, z: pathZ(r) };
    lanes.set(r.lane, { ...l, x0: Math.min(l.x0, r.x0), x1: Math.max(l.x1, r.x1) });
  }
  for (const [lane, l] of lanes) {
    scene.add(strip(THREE, lane === 0 ? startX : l.x0 - 2, l.x1 + 2, l.z, PATH_W, 0.02, COLORS.path));
  }
  const tickZ = pathZ(first) + PATH_W / 2 + 0.2;
  for (const t of layout.ticks) scene.add(yearMarker(THREE, t.year, t.x, tickZ));

  const roomGroups = new Map();
  for (const r of layout.rooms) {
    const room = pack.rooms.find((p) => p.n === r.n);
    const group = new THREE.Group();
    group.name = `room-${r.n}`;
    group.add(plainRoom(THREE, r, COLORS));
    const label = makeLabel(THREE, room.title);
    label.position.set(r.x0 + Math.min(2, (r.x1 - r.x0) / 2), ROOM_TITLE_Y, r.z1 + MARGIN);
    group.add(label);
    group.userData = { n: r.n, label };
    scene.add(group);
    roomGroups.set(r.n, group);
  }

  const spotMeshes = new Map();
  const byId = new Map(pack.spots.map((s) => [s.id, s]));
  for (const p of layout.spots) {
    const spot = byId.get(p.id);
    const obj = makeSpot(THREE, spot, COLORS);
    obj.position.set(p.x, 0, p.z);
    const label = makeLabel(THREE, spot.name);
    label.position.y = obj.userData.labelY;
    obj.add(label);
    obj.userData.label = label;
    if (spot.photo?.file && loadPhoto) loadPhoto(spot.photo.file, (tex) => setPhoto(obj, tex));
    scene.add(obj);
    spotMeshes.set(p.id, obj);
  }

  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
  camera.position.set(startX, SCENE.eye, pathZ(first));
  camera.lookAt(first.x0 + START_LOOK, SCENE.eye - 0.6, first.z1);

  // Per-frame scene changes; the plain world has none.
  const update = () => {};

  return { scene, camera, spotMeshes, roomGroups, update };
}
