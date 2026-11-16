import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import {
  clampPitch,
  clampToBounds,
  ease,
  makeControls,
  MAX_FLOOR,
  MAX_MOVE,
  MAX_PITCH,
  moveDuration,
  pickRay,
  yawPitchTo,
} from "../site/lib/scene/controls.js";

const deg = (r) => (r * 180) / Math.PI;

Deno.test("pitch is clamped to ±35°", () => {
  assertAlmostEquals(deg(MAX_PITCH), 35);
  assertEquals(clampPitch(1), MAX_PITCH);
  assertEquals(clampPitch(-1), -MAX_PITCH);
  assertEquals(clampPitch(0.1), 0.1);
});

Deno.test("moves take at most 1.5 s and longer walks never take less time", () => {
  assertEquals(MAX_MOVE, 1.5);
  assertEquals(moveDuration(0), 0);
  assert(moveDuration(1) > 0);
  assert(moveDuration(2) >= moveDuration(1));
  assertEquals(moveDuration(1000), 1.5);
});

Deno.test("ease runs 0 -> 1 smoothly and clamps", () => {
  assertEquals(ease(0), 0);
  assertEquals(ease(1), 1);
  assertAlmostEquals(ease(0.5), 0.5);
  assertEquals(ease(-1), 0);
  assertEquals(ease(2), 1);
  assert(ease(0.25) < 0.25 && ease(0.75) > 0.75);
});

Deno.test("pickRay takes the nearest target the ray passes through, else the floor", () => {
  const origin = { x: 0, y: 1, z: 0 };
  const dir = { x: 1, y: 0, z: 0 };
  const targets = [
    { id: "far", center: { x: 10, y: 1, z: 0 }, r: 0.5 },
    { id: "near", center: { x: 4, y: 1.2, z: 0.3 }, r: 0.5 },
    { id: "aside", center: { x: 2, y: 1, z: 3 }, r: 0.5 },
    { id: "behind", center: { x: -2, y: 1, z: 0 }, r: 0.5 },
  ];
  assertEquals(pickRay(origin, dir, { targets, floorY: 0 }).id, "near");
  const down = { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 };
  const floor = pickRay(origin, down, { floorY: 0 });
  assertEquals(floor.id, null);
  assertAlmostEquals(floor.point.x, 1);
  assertEquals(pickRay(origin, { x: 0, y: 1, z: 0 }, { floorY: 0 }), null);
});

Deno.test("yawPitchTo faces +x along the floor and tilts up to higher points", () => {
  const { yaw, pitch } = yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 });
  assertAlmostEquals(yaw, -Math.PI / 2);
  assertAlmostEquals(pitch, 0);
  assert(yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }).pitch > 0);
  assertEquals(yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 1, y: 9, z: 0 }).pitch, MAX_PITCH);
});

Deno.test("a far floor tap is clamped to MAX_FLOOR metres, then into the bounds", () => {
  const origin = { x: 0, y: 1.7, z: 0 };
  const nearHorizon = { x: 1, y: -Math.tan(Math.PI / 180), z: 0 }; // 1° below the horizon, ~97 m out
  const hit = pickRay(origin, nearHorizon, { floorY: 0 });
  assertEquals(hit.id, null);
  assertAlmostEquals(hit.point.x, MAX_FLOOR);
  assert(MAX_FLOOR >= 15 && MAX_FLOOR <= 20);
  const bounds = { x0: -5, x1: 10, z0: -3, z1: 3 };
  assertEquals(pickRay(origin, nearHorizon, { floorY: 0, bounds }).point.x, 10);
  assertEquals(clampToBounds({ x: -9, z: 7 }, bounds), { x: -5, z: 3 });
  assertEquals(clampToBounds({ x: 1, z: 2 }, bounds), { x: 1, z: 2 });
  assertEquals(clampToBounds({ x: 1, z: 2 }, undefined), { x: 1, z: 2 });
});

// A camera at the origin looking down -z, a dom stand-in 100×100 px, one spot straight ahead.
function rig(opts = {}) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1.7, 0);
  const dom = new EventTarget();
  dom.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const spot = new THREE.Object3D();
  spot.position.set(0, 0, -5);
  spot.userData = { pickY: 1.7, pickRadius: 0.5 };
  const targets = new Map([["s", spot]]);
  const controls = makeControls(camera, dom, { targets, ...opts });
  const pointer = (type, x, y) => dom.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, clientX: x, clientY: y }));
  return { camera, controls, pointer, targets, spot };
}

Deno.test("hovering reports the spot under the pointer, then null when it leaves", () => {
  const hovers = [];
  const { controls, pointer } = rig({ onHover: (id) => hovers.push(id) });
  try {
    pointer("pointermove", 50, 50);
    pointer("pointermove", 51, 50); // same spot: no repeat
    pointer("pointermove", 50, 95);
    pointer("pointermove", 50, 50);
    pointer("pointerleave", 50, 50);
    assertEquals(hovers, ["s", null, "s", null]);
  } finally {
    controls.dispose();
  }
});

Deno.test("moving() is true while an eased walk runs", () => {
  const { controls } = rig();
  try {
    assertEquals(controls.moving(), false);
    controls.walkTo({ x: 0, z: -3 });
    assertEquals(controls.moving(), true);
    controls.update(MAX_MOVE + 0.1);
    assertEquals(controls.moving(), false);
  } finally {
    controls.dispose();
  }
});

Deno.test("a wall in front blocks spots and floor behind it", () => {
  const origin = { x: 0, y: 1, z: 0 };
  const wall = { min: { x: 3, y: 0, z: -2 }, max: { x: 3.2, y: 3, z: 2 } };
  const behind = [{ id: "behind", center: { x: 5, y: 1, z: 0 }, r: 0.5 }];
  assertEquals(pickRay(origin, { x: 1, y: 0, z: 0 }, { targets: behind, floorY: 0, occluders: [wall] }), null);
  assertEquals(pickRay(origin, { x: 1, y: -0.1, z: 0 }, { floorY: 0, occluders: [wall] }), null); // floor at x=10
  const before = [{ id: "before", center: { x: 2, y: 1, z: 0 }, r: 0.5 }];
  assertEquals(pickRay(origin, { x: 1, y: 0, z: 0 }, { targets: before, floorY: 0, occluders: [wall] }).id, "before");
  assertAlmostEquals(pickRay(origin, { x: 1, y: -0.5, z: 0 }, { floorY: 0, occluders: [wall] }).point.x, 2); // floor before the wall
});

// A walk key pressed with `target` as the event's target, dispatched on the window as a bubbling key would be.
function key(type, code, target) {
  const e = Object.assign(new Event(type, { cancelable: true }), { code });
  if (target) Object.defineProperty(e, "target", { value: target });
  globalThis.dispatchEvent(e);
  return e;
}

Deno.test("walk keys move the camera unless their target is one the page ignores", () => {
  const panel = { id: "panel" };
  const { camera, controls } = rig({ ignore: (el) => el === panel });
  try {
    const inPanel = key("keydown", "ArrowUp", panel);
    controls.update(1);
    assertEquals(inPanel.defaultPrevented, false, "the panel keeps its arrow keys");
    assertEquals([camera.position.x, camera.position.z], [0, 0]);
    key("keyup", "ArrowUp", panel);
    const onCanvas = key("keydown", "ArrowUp");
    controls.update(1);
    assertEquals(onCanvas.defaultPrevented, true);
    assert(camera.position.z < 0, "walks forward");
    key("keyup", "ArrowUp", panel); // released anywhere, the key stops
    const z = camera.position.z;
    controls.update(1);
    assertEquals(camera.position.z, z);
  } finally {
    controls.dispose();
  }
});

Deno.test("pick targets are measured once, and again only when the target map changes", () => {
  const hovers = [];
  const { controls, pointer, targets, spot } = rig({ onHover: (id) => hovers.push(id) });
  try {
    let measured = 0;
    const measure = spot.getWorldPosition.bind(spot);
    spot.getWorldPosition = (v) => (measured++, measure(v));
    pointer("pointermove", 50, 50);
    pointer("pointermove", 52, 50);
    pointer("pointermove", 50, 95);
    assertEquals([hovers, measured], [["s", null], 1]);
    const other = new THREE.Object3D();
    other.position.set(2, 0, -5);
    other.userData = { pickY: 1.7, pickRadius: 0.5 };
    targets.set("t", other);
    pointer("pointermove", 85, 50);
    assertEquals([hovers, measured], [["s", null, "t"], 2]);
    targets.delete("t");
    targets.set("t", spot); // same size, other object
    pointer("pointermove", 50, 50);
    assertEquals([hovers, measured], [["s", null, "t", "s"], 4], "the map's entries changed: measured again");
  } finally {
    controls.dispose();
  }
});

Deno.test("walkTo and lookAt with instant: true arrive at once, with no eased move", () => {
  const { camera, controls } = rig();
  try {
    controls.walkTo({ x: 30, z: 4 }, { instant: true });
    assertEquals(controls.moving(), false);
    assertEquals([camera.position.x, camera.position.z], [30, 4]);
    assertAlmostEquals(camera.rotation.y, 0, 1e-9, "faces -z");
    controls.lookAt({ x: 35, y: 1.7, z: 4 }, { instant: true });
    assertAlmostEquals(camera.rotation.y, -Math.PI / 2, 1e-9, "turns to face +x at once, without update()");
  } finally {
    controls.dispose();
  }
});
