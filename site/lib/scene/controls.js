// First-person controls: keys walk and turn, drag looks, click/tap picks a spot or a floor point.
// Eased moves jump when the user prefers reduced motion. Pure helpers are exported for tests.

export const MAX_PITCH = (35 * Math.PI) / 180;
export const MAX_MOVE = 1.5; // seconds, longest eased move or turn
export const MAX_FLOOR = 18; // metres, farthest floor point a tap walks to
const WALK_SPEED = 3.5; // m/s while a key is held
const GLIDE_SPEED = 8; // m/s for eased moves, before the MAX_MOVE cap
const TURN_SPEED = 1.6; // rad/s for the left/right arrows
const LOOK_PER_PX = 0.004; // rad per dragged pixel
const CLICK_PX = 6; // a press that moves less than this is a click, not a drag

const FORWARD = new Set(["KeyW", "ArrowUp"]);
const BACK = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA"]);
const RIGHT = new Set(["KeyD"]);
const TURN_LEFT = new Set(["ArrowLeft"]);
const TURN_RIGHT = new Set(["ArrowRight"]);
const HANDLED = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, ...TURN_LEFT, ...TURN_RIGHT]);

export const clampPitch = (p) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));

/** Cubic ease-in-out on [0, 1], clamped. */
export function ease(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Seconds an eased walk of `dist` metres takes: grows with distance, at most MAX_MOVE. */
export function moveDuration(dist) {
  return dist <= 0 ? 0 : Math.min(MAX_MOVE, 0.4 + dist / GLIDE_SPEED);
}

/** Where the ray meets the plane y = floorY in front of the origin, or null. */
export function floorHit(o, d, floorY) {
  if (d.y >= 0) return null;
  const t = (floorY - o.y) / d.y;
  if (t <= 0) return null;
  return { x: o.x + d.x * t, y: floorY, z: o.z + d.z * t };
}

// Distance along unit ray d to the sphere's surface, or null if it misses or lies behind.
function raySphere(o, d, c, r) {
  const oc = { x: c.x - o.x, y: c.y - o.y, z: c.z - o.z };
  const along = oc.x * d.x + oc.y * d.y + oc.z * d.z;
  if (along < 0) return null;
  const off2 = oc.x ** 2 + oc.y ** 2 + oc.z ** 2 - along ** 2;
  if (off2 > r * r) return null;
  return along - Math.sqrt(r * r - off2);
}

/** Distance along ray d to the first face of the axis-aligned box {min, max}; 0 from inside; null on a miss. */
export function rayBox(o, d, { min, max }) {
  let near = 0, far = Infinity;
  for (const a of ["x", "y", "z"]) {
    if (d[a] === 0) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    const t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}

/** p's x/z clamped into bounds {x0, x1, z0, z1}; p unchanged without bounds. */
export function clampToBounds(p, bounds) {
  if (!bounds) return { x: p.x, z: p.z };
  return { x: Math.min(bounds.x1, Math.max(bounds.x0, p.x)), z: Math.min(bounds.z1, Math.max(bounds.z0, p.z)) };
}

/**
 * Nearest spot the ray passes through -> {id, point}; else the floor -> {id: null, point}; else null.
 * targets: [{id, center, r}]; occluders: [{min, max}] boxes that hide whatever lies behind them.
 * A floor point is pulled back to MAX_FLOOR metres (horizontal) and then into bounds.
 */
export function pickRay(origin, dir, { targets = [], floorY = 0, occluders = [], bounds } = {}) {
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const at = (k) => ({ x: origin.x + d.x * k, y: origin.y + d.y * k, z: origin.z + d.z * k });
  let wall = Infinity;
  for (const b of occluders) wall = Math.min(wall, rayBox(origin, d, b) ?? Infinity);
  let best = null;
  for (const t of targets) {
    const dist = raySphere(origin, d, t.center, t.r);
    if (dist !== null && dist < wall && (!best || dist < best.dist)) best = { id: t.id, dist };
  }
  if (best) return { id: best.id, point: at(best.dist) };
  const floor = floorHit(origin, d, floorY);
  if (!floor || Math.hypot(floor.x - origin.x, floor.y - origin.y, floor.z - origin.z) >= wall) return null;
  const flat = Math.hypot(floor.x - origin.x, floor.z - origin.z);
  const k = flat > MAX_FLOOR ? MAX_FLOOR / flat : 1;
  const { x, z } = clampToBounds({ x: origin.x + (floor.x - origin.x) * k, z: origin.z + (floor.z - origin.z) * k }, bounds);
  return { id: null, point: { x, y: floorY, z } };
}

/** Yaw (0 faces -z) and clamped pitch that point a camera at `from` towards `to`. */
export function yawPitchTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: clampPitch(Math.atan2(dy, Math.hypot(dx, dz))) };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const isTyping = (el) => el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "");

/**
 * Drives `camera` from pointer events on `dom` and keys on the window.
 * opts: floorY; onPick(id | null, point) on click/tap; onHover(id | null) when the spot under a mouse
 * pointer changes; targets: Map<id, Object3D> of pickable spots
 * (each with userData.pickY and userData.pickRadius, as makeSpot sets them); occluders: [{min, max}]
 * wall boxes that block picks; bounds: {x0, x1, z0, z1} the camera stays inside.
 * Returns {walkTo, lookAt, update(dt), moving() (an eased walk is running), dispose}.
 */
export function makeControls(camera, dom, { floorY = 0, onPick = () => {}, onHover = () => {}, targets = new Map(), occluders = [], bounds } = {}) {
  camera.rotation.reorder("YXZ");
  let yaw = camera.rotation.y;
  let pitch = clampPitch(camera.rotation.x);
  const eye = camera.position.y - floorY;
  const keys = new Set();
  let glide = null; // {from, to, t, dur} on x/z
  let turn = null; // {yaw0, pitch0, dyaw, dpitch, t, dur}
  let press = null; // {id, x, y, moved}
  let hovered = null;
  const reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const held = (set) => [...set].some((k) => keys.has(k));
  const apply = () => camera.rotation.set(pitch, yaw, 0);

  // What the pointer at e points at: {id, point} or null, as pickRay returns it.
  function hitAt(e) {
    const rect = dom.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    camera.updateMatrixWorld();
    const origin = camera.position.clone();
    const dir = origin.clone().set(nx, ny, 0.5).unproject(camera).sub(origin);
    const list = [...targets].map(([id, obj]) => {
      const center = obj.getWorldPosition(origin.clone());
      center.y += obj.userData.pickY ?? 1;
      return { id, center, r: obj.userData.pickRadius ?? 0.8 };
    });
    return pickRay(origin, dir, { targets: list, floorY, occluders, bounds });
  }

  function pick(e) {
    const hit = hitAt(e);
    if (hit) onPick(hit.id, hit.point);
  }

  function hover(id) {
    if (id === hovered) return;
    hovered = id;
    onHover(id);
  }

  const onDown = (e) => {
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    dom.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!press) return hover(hitAt(e)?.id ?? null);
    if (e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_PX) press.moved = true;
    if (!press.moved) return;
    yaw -= (e.clientX - press.lastX) * LOOK_PER_PX;
    pitch = clampPitch(pitch - (e.clientY - press.lastY) * LOOK_PER_PX);
    press.lastX = e.clientX;
    press.lastY = e.clientY;
    turn = null;
    apply();
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const wasClick = !press.moved;
    press = null;
    if (wasClick && e.type === "pointerup") pick(e);
  };
  const onKeyDown = (e) => {
    if (!HANDLED.has(e.code) || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  const onLeave = () => hover(null);

  dom.addEventListener("pointerdown", onDown);
  dom.addEventListener("pointermove", onMove);
  dom.addEventListener("pointerup", onUp);
  dom.addEventListener("pointercancel", onUp);
  dom.addEventListener("pointerleave", onLeave);
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
  globalThis.addEventListener("blur", onBlur);

  function walkTo(v) {
    const from = { x: camera.position.x, z: camera.position.z };
    const to = clampToBounds(v, bounds);
    const dur = moveDuration(Math.hypot(to.x - from.x, to.z - from.z));
    camera.position.y = floorY + eye;
    if (reduceMotion() || dur === 0) {
      glide = null;
      camera.position.x = to.x;
      camera.position.z = to.z;
    } else {
      glide = { from, to, t: 0, dur };
    }
  }

  // Aims from where a running walk ends, so walkTo then lookAt faces v on arrival.
  function lookAt(v) {
    const from = glide ? { x: glide.to.x, y: camera.position.y, z: glide.to.z } : camera.position;
    const want = yawPitchTo(from, v);
    const dyaw = wrapAngle(want.yaw - yaw);
    const dur = Math.min(MAX_MOVE, 0.3 + Math.abs(dyaw) / Math.PI);
    if (reduceMotion()) {
      turn = null;
      yaw = want.yaw;
      pitch = want.pitch;
      apply();
    } else {
      turn = { yaw0: yaw, pitch0: pitch, dyaw, dpitch: want.pitch - pitch, t: 0, dur };
    }
  }

  function update(dt) {
    const fwd = held(FORWARD) - held(BACK);
    const side = held(RIGHT) - held(LEFT);
    const spin = held(TURN_LEFT) - held(TURN_RIGHT);
    if (spin) {
      yaw += spin * TURN_SPEED * dt;
      turn = null;
    }
    if (fwd || side) {
      glide = null;
      const step = WALK_SPEED * dt;
      const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
      const p = clampToBounds({
        x: camera.position.x + (-s * fwd + c * side) * step,
        z: camera.position.z + (-c * fwd - s * side) * step,
      }, bounds);
      camera.position.x = p.x;
      camera.position.z = p.z;
    }
    if (glide) {
      glide.t += dt;
      const k = ease(glide.t / glide.dur);
      camera.position.x = glide.from.x + (glide.to.x - glide.from.x) * k;
      camera.position.z = glide.from.z + (glide.to.z - glide.from.z) * k;
      if (glide.t >= glide.dur) glide = null;
    }
    if (turn) {
      turn.t += dt;
      const k = ease(turn.t / turn.dur);
      yaw = turn.yaw0 + turn.dyaw * k;
      pitch = clampPitch(turn.pitch0 + turn.dpitch * k);
      if (turn.t >= turn.dur) turn = null;
    }
    apply();
  }

  function dispose() {
    dom.removeEventListener("pointerdown", onDown);
    dom.removeEventListener("pointermove", onMove);
    dom.removeEventListener("pointerup", onUp);
    dom.removeEventListener("pointercancel", onUp);
    dom.removeEventListener("pointerleave", onLeave);
    globalThis.removeEventListener("keydown", onKeyDown);
    globalThis.removeEventListener("keyup", onKeyUp);
    globalThis.removeEventListener("blur", onBlur);
  }

  return { walkTo, lookAt, update, moving: () => glide !== null, dispose };
}
