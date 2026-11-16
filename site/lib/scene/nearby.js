// Where the visitor stands and what that changes: photo loading, and where to stand to see a spot.
export const PHOTO_RANGE = 30; // metres; nearer spots start loading their photo

/**
 * Stand point search: `front` metres in front (+z) of a spot by default; no other spot closer than `point`
 * to the stand point or `sight` to the line of sight; spots farther than `reach` from the target are ignored.
 */
export const STAND = { front: 3.5, point: 2.2, sight: 0.8, reach: 8 };
const steps = (from, to, by) => Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => +(from + i * by).toFixed(2));
const DX = steps(-3, 3, 0.2);
const DZ = steps(2, 6, 0.25);
// Candidate offsets, nearest to the default first.
const OFFSETS = DZ.flatMap((dz) => DX.map((dx) => ({ dx, dz })))
  .sort((a, b) => Math.hypot(a.dx, a.dz - STAND.front) - Math.hypot(b.dx, b.dz - STAND.front));

function toSegment(p, a, b) {
  const [vx, vz] = [b.x - a.x, b.z - a.z];
  const len2 = vx * vx + vz * vz;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}

/** Nearest of `others` ({x, z}) to the stand point (`point`) and to the sight segment stand-target (`sight`). */
export function clearance(stand, target, others) {
  let point = Infinity, sight = Infinity;
  for (const o of others) {
    point = Math.min(point, Math.hypot(o.x - stand.x, o.z - stand.z));
    sight = Math.min(sight, toSegment(o, stand, target));
  }
  return { point, sight };
}

/**
 * Where to stand to look at `target` ({x, z}) past `others` (every other spot): the first candidate in front
 * of it with STAND clearance, nearest to the default first; in a crowd, the candidate with the most clearance.
 * Each candidate's z is clamped into [minZ, maxZ]: the world page passes its path line for both, so the
 * visitor stands on the path, in front of the rows and of the path lamps.
 */
export function standPoint(target, others, { minZ = -Infinity, maxZ = Infinity } = {}) {
  const near = others.filter((o) => Math.hypot(o.x - target.x, o.z - target.z) <= STAND.reach);
  let best = null, bestScore = -Infinity;
  for (const { dx, dz } of OFFSETS) {
    const p = { x: target.x + dx, z: Math.min(maxZ, Math.max(minZ, target.z + dz)) };
    const c = clearance(p, target, near);
    const score = Math.min(c.point / STAND.point, c.sight / STAND.sight);
    if (score >= 1) return p;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best;
}

/** spotMeshes: Map<id, Object3D> from buildWorld; eye: the camera position. Runs each spot's photo loader once, within PHOTO_RANGE. */
export function loadNearPhotos(spotMeshes, eye) {
  for (const obj of spotMeshes.values()) {
    const { loadPhoto } = obj.userData;
    if (loadPhoto && Math.hypot(obj.position.x - eye.x, obj.position.z - eye.z) <= PHOTO_RANGE) {
      delete obj.userData.loadPhoto;
      loadPhoto();
    }
  }
}
