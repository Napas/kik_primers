// Builds the 3D world from a pack and its time layout: rooms along x, a path in front of each lane,
// year markers on the first lane, one model and label per spot. Only placement lives here;
// the look comes from styles.js and spots.js. Builders take THREE as an argument.
import { COLORS, SCENE } from "../theme.js";
import { makeSpot, setPhoto } from "./spots.js";
import { makeLabel } from "./labels.js";
import { ground, path, plainRoom, yearMarker } from "./styles.js";

const PATH_OFFSET = 1.4; // path centre in front of a room's z1
const TICK_SIDE = 0.9; // year markers stand this far beyond the path centre
const TITLE_FRONT = 0.6; // room title in front of a room's z1
const ROOM_TITLE_Y = 2.9;
const START_BACK = 5; // camera start before the first room
const START_LOOK = 10; // the start view aims this far along the path, at the room front
const BOUNDS_PAD = 2; // paths and the walkable area reach this far beyond the rooms
const GROUND_PAD = 20;

/** z of the walking path along the lane of `room` (a layout room). */
export const pathZ = (room) => room.z1 + PATH_OFFSET;

/**
 * opts: aspect (camera); loadPhoto(file, apply(texture)) to fetch a person's photo, initials stay until apply.
 * Returns {scene, camera, spotMeshes: Map<id, Object3D>, roomGroups: Map<n, Group>, update(dt),
 * walls: Box3[] (picks stop at them), bounds: {x0, x1, z0, z1} (walkable area)}.
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
  const bounds = { x0: startX - BOUNDS_PAD, x1: layout.length + BOUNDS_PAD, z0: zMin - BOUNDS_PAD, z1: zMax + BOUNDS_PAD };
  scene.add(ground(THREE, { x0: startX - GROUND_PAD, x1: layout.length + GROUND_PAD, z0: zMin - GROUND_PAD, z1: zMax + GROUND_PAD }, COLORS));

  const lanes = new Map();
  for (const r of layout.rooms) {
    const l = lanes.get(r.lane) ?? { x0: Infinity, x1: -Infinity, z: pathZ(r) };
    lanes.set(r.lane, { ...l, x0: Math.min(l.x0, r.x0), x1: Math.max(l.x1, r.x1) });
  }
  for (const [lane, l] of lanes) {
    scene.add(path(THREE, { x0: lane === 0 ? startX : l.x0 - BOUNDS_PAD, x1: l.x1 + BOUNDS_PAD, z: l.z }, COLORS));
  }
  for (const t of layout.ticks) {
    const marker = yearMarker(THREE, t.year, COLORS);
    marker.position.set(t.x, 0, pathZ(first) + TICK_SIDE);
    scene.add(marker);
  }

  const roomGroups = new Map();
  for (const r of layout.rooms) {
    const room = pack.rooms.find((p) => p.n === r.n);
    const group = new THREE.Group();
    group.name = `room-${r.n}`;
    group.add(plainRoom(THREE, r, COLORS));
    const label = makeLabel(THREE, room.title);
    label.position.set(r.x0 + Math.min(2, (r.x1 - r.x0) / 2), ROOM_TITLE_Y, r.z1 + TITLE_FRONT);
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

  scene.updateMatrixWorld();
  const walls = [];
  for (const g of roomGroups.values()) g.traverse((o) => o.userData.wall && walls.push(new THREE.Box3().setFromObject(o)));

  // Per-frame scene changes; the plain world has none.
  const update = () => {};

  return { scene, camera, spotMeshes, roomGroups, update, walls, bounds };
}
