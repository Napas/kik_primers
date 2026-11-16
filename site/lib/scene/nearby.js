// Where the visitor stands and what that changes: spot labels, photo loading, and where to stand to see a spot.

export const LABEL_RANGE = 12; // metres; nearer spots show their name label
export const LABEL_NEAR = 2; // metres; nearer spots hide their label (it would fill the view), unless selected
export const PHOTO_RANGE = 30; // metres; nearer spots start loading their photo

/**
 * Stand point search: `front` metres in front (+z) of a spot by default; no other spot closer than `point`
 * to the stand point or `sight` to the line of sight; spots farther than `reach` from the target are ignored.
 */
export const STAND = { front: 2.5, point: 1, sight: 0.6, reach: 8 };
const steps = (from, to, by) => Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => +(from + i * by).toFixed(2));
const DX = steps(-3, 3, 0.2);
const DZ = steps(2, 6, 0.25);
// Candidate offsets, nearest to the default first.
const OFFSETS = DZ.flatMap((dz) => DX.map((dx) => ({ dx, dz })))
  .sort((a, b) => Math.hypot(a.dx, a.dz - STAND.front) - Math.hypot(b.dx, b.dz - STAND.front));

// Floor distance from p to the segment a-b.
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
 */
export function standPoint(target, others) {
  const near = others.filter((o) => Math.hypot(o.x - target.x, o.z - target.z) <= STAND.reach);
  let best = null, bestScore = -Infinity;
  for (const { dx, dz } of OFFSETS) {
    const p = { x: target.x + dx, z: target.z + dz };
    const c = clearance(p, target, near);
    const score = Math.min(c.point / STAND.point, c.sight / STAND.sight);
    if (score >= 1) return p;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best;
}

/**
 * spotMeshes: Map<id, Object3D> from buildWorld; eye: the camera position; hovered, selected: spot ids or null.
 * A label shows within LABEL_RANGE (floor distance), while hovered or while selected, but not nearer than
 * LABEL_NEAR unless selected. A photo loader runs once within PHOTO_RANGE.
 */
export function updateNearby(spotMeshes, eye, hovered, selected) {
  for (const [id, obj] of spotMeshes) {
    const d = Math.hypot(obj.position.x - eye.x, obj.position.z - eye.z);
    const { label, loadPhoto } = obj.userData;
    if (label) {
      label.visible = id === selected || (d >= LABEL_NEAR && (d <= LABEL_RANGE || id === hovered));
    }
    if (loadPhoto && d <= PHOTO_RANGE) {
      delete obj.userData.loadPhoto;
      loadPhoto();
    }
  }
}
