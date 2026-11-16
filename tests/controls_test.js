import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { clampPitch, ease, floorHit, moveDuration, MAX_PITCH, MAX_MOVE, pickRay, yawPitchTo } from "../site/lib/scene/controls.js";

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

Deno.test("floorHit meets the floor only in front of the camera", () => {
  const p = floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: -1, z: 0 }, 0);
  assertEquals(p, { x: 2, y: 0, z: 0 });
  assertEquals(floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: 1, z: 0 }, 0), null);
  assertEquals(floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 0), null);
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
  assertEquals(pickRay(origin, dir, targets, 0).id, "near");
  const down = { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 };
  const floor = pickRay(origin, down, [], 0);
  assertEquals(floor.id, null);
  assertAlmostEquals(floor.point.x, 1);
  assertEquals(pickRay(origin, { x: 0, y: 1, z: 0 }, [], 0), null);
});

Deno.test("yawPitchTo faces +x along the floor and tilts up to higher points", () => {
  const { yaw, pitch } = yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 });
  assertAlmostEquals(yaw, -Math.PI / 2);
  assertAlmostEquals(pitch, 0);
  assert(yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }).pitch > 0);
  assertEquals(yawPitchTo({ x: 0, y: 1, z: 0 }, { x: 1, y: 9, z: 0 }).pitch, MAX_PITCH);
});
