// Which labels show each frame, and how big. rankLabels picks candidates by distance, hover and selection;
// placeLabels keeps the important ones that are in sight and clear of each other.
import { LABEL, SCENE } from "../theme.js";
import { rayBox } from "./rays.js";

export const LABEL_RANGE = 12; // metres; nearer spots show their name label
export const LABEL_NEAR = 2; // metres; nearer spots hide their label (it would fill the view)

export const MAX_LABELS = 8;
const LABEL_PAD = 4; // px kept clear around each label

/** View height in metres at distance `d` for a vertical field of view `fov` (degrees). */
const viewHeight = (d, fov) => 2 * d * Math.tan((fov * Math.PI) / 360);

/** Share (at most 1) of the usual label size and range on a view of `aspect` (width / height): less when narrow. */
export const labelFit = (aspect) => Math.min(1, aspect / LABEL.refAspect);

/**
 * Factor (at most 1) on a label's size so it fills at most LABEL.maxView × labelFit(aspect) of the view
 * height `d` metres away.
 */
export function labelScale(d, aspect = 1) {
  return Math.min(1, (LABEL.maxView * labelFit(aspect) * viewHeight(d, SCENE.fov)) / LABEL.height);
}

function fit(label, d, aspect) {
  const base = (label.userData.baseScale ??= label.scale.clone());
  const k = labelScale(d, aspect);
  label.scale.set(base.x * k, base.y * k, 1);
}

/** Scales each label by labelScale at its floor distance from `eye`. */
export function sizeLabels(labels, eye, aspect = 1) {
  for (const { sprite, x, z } of labels) fit(sprite, Math.hypot(x - eye.x, z - eye.z), aspect);
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const worldPosition = (o) => o.getWorldPosition(new o.position.constructor());

/** Greedy culling: keeps items ({id, rect}) in priority order unless they overlap a kept item or a `blockers` rect; stops at `max`. */
export function declutter(items, blockers = [], max = Infinity) {
  const kept = new Set();
  const taken = [...blockers];
  for (const { id, rect } of items) {
    if (kept.size >= max) break;
    if (taken.some((t) => overlaps(t, rect))) continue;
    kept.add(id);
    taken.push(rect);
  }
  return kept;
}

/** `sprite`'s box in pixels on a `view` ({width, height}) seen by `camera`, padded; null behind the camera. */
export function screenRect(sprite, camera, view) {
  const p = worldPosition(sprite);
  const s = sprite.getWorldScale(new sprite.position.constructor());
  p.applyMatrix4(camera.matrixWorldInverse);
  const depth = -p.z;
  if (depth <= camera.near) return null;
  p.applyMatrix4(camera.projectionMatrix);
  const cx = ((p.x + 1) / 2) * view.width;
  const cy = ((1 - p.y) / 2) * view.height;
  const perMetre = view.height / viewHeight(depth, camera.fov);
  const hw = (s.x * perMetre) / 2 + LABEL_PAD, hh = (s.y * perMetre) / 2 + LABEL_PAD;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/** Whether any of `walls` (boxes {min, max}) stands between `eye` and `p` (both {x, y, z}). */
export function behindWall(eye, p, walls) {
  const d = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  return walls.some((w) => {
    const t = rayBox(eye, d, w);
    return t !== null && t > 0 && t < 1; // t <= 0: the eye is inside the box
  });
}

/**
 * The `ranked` sprites (most important first) to show: inside the fog range and the view, not behind
 * `walls`, clear of better ones and of `blockers` (page areas, px), at most MAX_LABELS. Uses the camera's
 * current matrices.
 */
export function placeLabels(ranked, camera, view, blockers = [], walls = []) {
  const items = [];
  for (const sprite of ranked) {
    const p = worldPosition(sprite);
    if (p.distanceTo(camera.position) > SCENE.fog.far) continue;
    const rect = screenRect(sprite, camera, view);
    if (!rect || rect.x0 < 0 || rect.y0 < 0 || rect.x1 > view.width || rect.y1 > view.height) continue;
    if (behindWall(camera.position, p, walls)) continue;
    items.push({ id: sprite, rect });
  }
  return declutter(items, blockers, MAX_LABELS);
}

/**
 * Label candidates in display order: the hovered spot, room titles, other spot labels, then year markers,
 * each group nearest first. labels: [{sprite, x, z, kind: "title" | "marker", room}] from buildWorld.
 * A spot label is a candidate between LABEL_NEAR and LABEL_RANGE × labelFit(aspect) (floor distance), or
 * hovered beyond that range. Room titles are candidates except the title of `room` (where the visitor stands).
 * While a spot is selected, its own label (its plaque and the panel name it), other spot labels but the
 * hovered one, and year markers are not. Reads no visibility and sets none.
 */
export function rankLabels(spotMeshes, labels, eye, { hovered = null, selected = null, room = null, aspect = 1 } = {}) {
  const d = (x, z) => Math.hypot(x - eye.x, z - eye.z);
  const range = LABEL_RANGE * labelFit(aspect);
  const [hover, titles, others, markers] = [[], [], [], []];
  for (const [id, obj] of spotMeshes) {
    const sprite = obj.userData.label;
    const dist = d(obj.position.x, obj.position.z);
    if (!sprite || id === selected || dist < LABEL_NEAR) continue;
    if (id === hovered) hover.push({ sprite, d: 0 });
    else if (selected === null && dist <= range) others.push({ sprite, d: dist });
  }
  for (const { sprite, x, z, kind, room: n } of labels) {
    if (kind === "title" && n !== room) titles.push({ sprite, d: d(x, z) });
    else if (kind === "marker" && selected === null) markers.push({ sprite, d: d(x, z) });
  }
  return [hover, titles, others, markers].flatMap((g) => g.sort((a, b) => a.d - b.d).map((e) => e.sprite));
}

/** Sizes every label of `world` (from buildWorld) and sets its `visible` once. `room` is the visitor's room; `blockers` are page areas in px. */
export function updateLabels(world, camera, view, { hovered = null, selected = null, room = null, blockers = [] } = {}) {
  camera.updateMatrixWorld();
  const eye = camera.position;
  const spotLabels = [];
  for (const obj of world.spotMeshes.values()) {
    if (obj.userData.label) spotLabels.push({ sprite: obj.userData.label, x: obj.position.x, z: obj.position.z });
  }
  sizeLabels(spotLabels, eye, camera.aspect);
  sizeLabels(world.labels, eye, camera.aspect);
  const ranked = rankLabels(world.spotMeshes, world.labels, eye, { hovered, selected, room, aspect: camera.aspect });
  const kept = placeLabels(ranked, camera, view, blockers, world.walls);
  for (const { sprite } of spotLabels) sprite.visible = kept.has(sprite);
  for (const { sprite } of world.labels) sprite.visible = kept.has(sprite);
}
