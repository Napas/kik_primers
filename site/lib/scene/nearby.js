// Where the visitor stands and what that changes: spot labels, photo loading, and where to stand to see a spot.
import { LABEL, SCENE } from "../theme.js";

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

/** Share (at most 1) of the usual label size and range on a view of `aspect` (width / height): less when narrow. */
export const labelFit = (aspect) => Math.min(1, aspect / LABEL.refAspect);

/**
 * Factor (at most 1) on a label's size so it fills at most LABEL.maxView × labelFit(aspect) of the view
 * height `d` metres away.
 */
export function labelScale(d, aspect = 1) {
  const view = 2 * d * Math.tan((SCENE.fov * Math.PI) / 360);
  return Math.min(1, (LABEL.maxView * labelFit(aspect) * view) / LABEL.height);
}

// Sizes `label` by labelScale from its size at creation.
function fit(label, d, aspect) {
  const base = (label.userData.baseScale ??= label.scale.clone());
  const k = labelScale(d, aspect);
  label.scale.set(base.x * k, base.y * k, 1);
}

/** labels: [{sprite, x, z}] from buildWorld (room titles, year markers); sizes each like a spot label. */
export function sizeLabels(labels, eye, aspect = 1) {
  for (const { sprite, x, z } of labels) fit(sprite, Math.hypot(x - eye.x, z - eye.z), aspect);
}

/**
 * spotMeshes: Map<id, Object3D> from buildWorld; eye: the camera position; hovered, selected: spot ids or null;
 * aspect: the view's width / height. A label shows within LABEL_RANGE × labelFit(aspect) (floor distance),
 * while hovered or while selected, but not nearer than LABEL_NEAR unless selected; labelScale sizes it.
 * A photo loader runs once within PHOTO_RANGE.
 */
export function updateNearby(spotMeshes, eye, hovered, selected, aspect = 1) {
  const range = LABEL_RANGE * labelFit(aspect);
  for (const [id, obj] of spotMeshes) {
    const d = Math.hypot(obj.position.x - eye.x, obj.position.z - eye.z);
    const { label, loadPhoto } = obj.userData;
    if (label) {
      label.visible = id === selected || (d >= LABEL_NEAR && (d <= range || id === hovered));
      fit(label, d, aspect);
    }
    if (loadPhoto && d <= PHOTO_RANGE) {
      delete obj.userData.loadPhoto;
      loadPhoto();
    }
  }
}
