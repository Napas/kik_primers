// Builds the 3D world from a pack and its time layout: rooms along x, a path in front of each lane,
// year markers along each lane's back walls, one model and label per spot. Only placement lives here and
// in lanes.js; the look comes from styles.js and spots.js, the light from light.js.
// Builders take THREE as an argument.
import { COLORS, lightFor, SCENE } from "../theme.js";
import { makeSpot, setPhoto } from "./spots.js";
import { makeLabel } from "./labels.js";
import { ground, path, plainRoom, STYLES, yearMarker } from "./styles.js";
import { lowBackWalls, pathLanes, pathZ, yearMarks } from "./lanes.js";
import { addBaseLights, addPathLights, yearAt } from "./light.js";

const TITLE_FRONT = 0.6; // room title in front of a room's z1
const ROOM_TITLE_Y = 2.9;
const START = { back: 1, out: 1.8, look: 5, lookY: 1.2 }; // start: before the first room and off its path, looking into it
const BOUNDS_PAD = 2; // paths and the walkable area reach this far beyond the rooms
const GROUND_PAD = 20;

/**
 * opts: aspect (camera); loadPhoto(file, apply(texture)) to fetch a person's photo, the placeholder stays until apply.
 * Photos are not fetched here: a spot with a photo gets userData.loadPhoto(), which the caller runs when it wants.
 * Returns {scene, camera, spotMeshes: Map<id, Object3D>, roomGroups: Map<n, Group>, update(dt), focus(obj | null),
 * walls: Box3[] (picks stop at them), bounds: {x0, x1, z0, z1} (walkable area),
 * labels: [{sprite, x, z, kind: "title" | "marker", room}] (room titles with their room number, and year markers)}.
 */
export function buildWorld(THREE, pack, layout, { aspect = 1, loadPhoto } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, SCENE.fog.near, SCENE.fog.far);
  const lights = addBaseLights(THREE, scene);

  const first = layout.rooms.reduce((a, r) => (r.x0 < a.x0 ? r : a), layout.rooms[0] ?? { x0: 0, x1: 0, z0: 0, z1: 0, lane: 0 });
  const startX = first.x0 - START.back;

  const zs = layout.rooms.flatMap((r) => [r.z0, pathZ(r)]);
  const [zMin, zMax] = [Math.min(0, ...zs), Math.max(0, ...zs)];
  const bounds = { x0: startX - BOUNDS_PAD, x1: layout.length + BOUNDS_PAD, z0: zMin - BOUNDS_PAD, z1: zMax + BOUNDS_PAD };
  scene.add(ground(THREE, { x0: startX - GROUND_PAD, x1: layout.length + GROUND_PAD, z0: zMin - GROUND_PAD, z1: zMax + GROUND_PAD }, COLORS));

  for (const l of pathLanes(layout)) {
    scene.add(path(THREE, { x0: l.lane === 0 ? startX : l.x0 - BOUNDS_PAD, x1: l.x1 + BOUNDS_PAD, z: l.z }, COLORS));
  }
  addPathLights(THREE, scene, layout);
  const labels = []; // room titles and year markers: {sprite, x, z, kind, room}
  for (const m of yearMarks(layout)) {
    const marker = yearMarker(THREE, m.year, COLORS);
    marker.position.set(m.x, 0, m.z);
    scene.add(marker);
    labels.push({ sprite: marker.userData.label, x: m.x, z: m.z, kind: "marker" });
  }

  const roomGroups = new Map();
  const low = lowBackWalls(layout.rooms);
  for (const r of layout.rooms) {
    const room = pack.rooms.find((p) => p.n === r.n);
    const group = new THREE.Group();
    group.name = `room-${r.n}`;
    group.add((STYLES[room.style] ?? plainRoom)(THREE, { ...r, low: low.has(r.n) }, COLORS));
    const label = makeLabel(THREE, room.title);
    label.position.set(r.x0 + Math.min(2, (r.x1 - r.x0) / 2), ROOM_TITLE_Y, r.z1 + TITLE_FRONT);
    group.add(label);
    group.userData = { n: r.n, label };
    labels.push({ sprite: label, x: label.position.x, z: label.position.z, kind: "title", room: r.n });
    scene.add(group);
    roomGroups.set(r.n, group);
  }

  const spotMeshes = new Map();
  const byId = new Map(pack.spots.map((s) => [s.id, s]));
  for (const p of layout.spots) {
    const spot = byId.get(p.id);
    const lift = SCENE.rowLift * (layout.rows - 1 - p.row); // row 0 is the back row
    const scale = p.row === layout.rows - 1 ? SCENE.frontScale : 1;
    const obj = makeSpot(THREE, spot, COLORS, { band: lightFor(yearAt(layout, p.x)), lift, scale }); // the band of the path lamps there
    obj.position.set(p.x, 0, p.z);
    const label = makeLabel(THREE, spot.name);
    label.position.y = obj.userData.labelY;
    obj.add(label);
    obj.userData.label = label;
    if (spot.photo?.file && loadPhoto) obj.userData.loadPhoto = () => loadPhoto(spot.photo.file, (tex) => setPhoto(obj, tex));
    scene.add(obj);
    spotMeshes.set(p.id, obj);
  }

  const camera = new THREE.PerspectiveCamera(SCENE.fov, aspect, 0.1, SCENE.far);
  camera.position.set(startX, SCENE.eye, pathZ(first) + START.out);
  camera.lookAt(first.x0 + START.look, START.lookY, (first.z0 + first.z1) / 2);

  scene.updateMatrixWorld();
  const walls = [];
  for (const g of roomGroups.values()) g.traverse((o) => o.userData.wall && walls.push(new THREE.Box3().setFromObject(o)));

  return { scene, camera, spotMeshes, roomGroups, update: lights.update, focus: lights.focus, walls, bounds, labels };
}

/** Sets `renderer`'s tone mapping operator (THREE.<SCENE.toneMapping>ToneMapping) and exposure from the look. */
export function configureRenderer(THREE, renderer) {
  renderer.toneMapping = THREE[`${SCENE.toneMapping}ToneMapping`];
  renderer.toneMappingExposure = SCENE.exposure;
}
