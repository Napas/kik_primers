import { assertAlmostEquals, assertEquals } from "@std/assert";
import { floorHit, rayBox, raySphere } from "../site/lib/scene/rays.js";

Deno.test("floorHit meets the floor only in front of the camera", () => {
  const p = floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: -1, z: 0 }, 0);
  assertEquals(p, { x: 2, y: 0, z: 0 });
  assertEquals(floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: 1, z: 0 }, 0), null);
  assertEquals(floorHit({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 0), null);
});

Deno.test("raySphere gives the distance to the near surface, null when the ray passes beside or it lies behind", () => {
  const o = { x: 0, y: 1, z: 0 };
  const d = { x: 1, y: 0, z: 0 };
  assertAlmostEquals(raySphere(o, d, { x: 5, y: 1, z: 0 }, 0.5), 4.5);
  assertAlmostEquals(raySphere(o, d, { x: 5, y: 1, z: 0.3 }, 0.5), 4.6);
  assertEquals(raySphere(o, d, { x: 5, y: 1, z: 2 }, 0.5), null);
  assertEquals(raySphere(o, d, { x: -5, y: 1, z: 0 }, 0.5), null);
});

Deno.test("rayBox gives the distance to the first face, 0 from inside, null on a miss or behind", () => {
  const box = { min: { x: 4, y: 0, z: -1 }, max: { x: 5, y: 3, z: 1 } };
  const o = { x: 0, y: 1, z: 0 };
  assertAlmostEquals(rayBox(o, { x: 1, y: 0, z: 0 }, box), 4);
  assertEquals(rayBox(o, { x: -1, y: 0, z: 0 }, box), null);
  assertEquals(rayBox(o, { x: 0, y: 0, z: 1 }, box), null);
  assertEquals(rayBox({ x: 0, y: 4, z: 0 }, { x: 1, y: 0, z: 0 }, box), null);
  assertEquals(rayBox({ x: 4.5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, box), 0);
});
