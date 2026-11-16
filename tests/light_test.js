import { assert, assertEquals } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import { lightFor } from "../site/lib/theme.js";
import { layoutTime } from "../site/lib/layout.js";
import { addPathLights, MAX_REAL_LIGHTS, pathLamps, yearAt } from "../site/lib/scene/light.js";
import { buildWorld } from "../site/lib/scene/world.js";
import { MARGIN, pathZ, WALL_T } from "../site/lib/scene/lanes.js";
import { installFakeCanvas } from "./fake_canvas.js";

const root = new URL("../", import.meta.url).pathname;
const STYLED = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/styles/topic.json`));

/** A pack of `rooms` rooms with `perRoom` spots each: 40-year spans from 1500, room 7 stretched to overlap room 8. */
function bigPack(rooms = 9, perRoom = 25) {
  const span = (n) => (n === 7 ? [1750, 1820] : [1500 + 40 * (n - 1), 1500 + 40 * n]);
  const out = { rooms: [], spots: [] };
  for (let n = 1; n <= rooms; n++) {
    const [a, b] = span(n);
    out.rooms.push({ n, title: `Salė ${n}`, span: [a, b], style: "glass" });
    for (let i = 0; i < perRoom; i++) {
      out.spots.push({ id: `s${n}-${i}`, room: n, kind: "thing", name: `Daiktas ${i}`, at: a + ((b - a) * i) / perRoom });
    }
  }
  return out;
}

Deno.test("yearAt inverts the layout's year scale", () => {
  const layout = layoutTime(STYLED);
  for (const y of [1540, 1600, 1700, 1789.5, 1864, 1930, 1944, 1966, 1990, 2020]) {
    assert(Math.abs(yearAt(layout, layout.xOfYear(y)) - y) < 0.01, `${y}`);
  }
  assert(Math.abs(yearAt(layout, -100) - 1540) < 0.01, "clamped before the first room");
  assert(Math.abs(yearAt(layout, layout.length + 100) - 2020) < 0.01, "clamped after the last room");
});

Deno.test("pathLamps stand about 6 m apart along every lane, on the visitor's side of its path, coloured by their year", () => {
  for (const layout of [layoutTime(STYLED), layoutTime(bigPack())]) {
    const lanes = new Set(layout.rooms.map((r) => r.lane));
    const lamps = pathLamps(layout);
    assertEquals(new Set(lamps.map((l) => l.lane)), lanes);
    for (const lane of lanes) {
      const own = lamps.filter((l) => l.lane === lane).sort((a, b) => a.x - b.x);
      const rooms = layout.rooms.filter((r) => r.lane === lane);
      const [x0, x1] = [Math.min(...rooms.map((r) => r.x0)), Math.max(...rooms.map((r) => r.x1))];
      for (let i = 1; i < own.length; i++) {
        const gap = own[i].x - own[i - 1].x;
        assert(gap >= 4.5 && gap <= 7.5, `lane ${lane}: lamps ${gap.toFixed(2)} m apart`);
      }
      assert(own[0].x - x0 <= 4 && x1 - own.at(-1).x <= 4, `lane ${lane}: lamps do not cover the lane`);
      const path = pathZ(rooms[0]);
      for (const l of own) assert(l.z > path + 0.7 && l.z < path + 1.4, `lane ${lane}: lamp not on the visitor's side of the path`);
    }
    for (const l of lamps) {
      for (const r of layout.rooms) {
        const overX = l.x > r.x0 && l.x < r.x1;
        const behindWall = r.z0 - MARGIN - WALL_T - 0.3;
        assert(!overX || l.z < behindWall || l.z > r.z1, `lamp at ${l.x.toFixed(1)}, ${l.z.toFixed(2)} inside room ${r.n}`);
      }
    }
    for (const l of lamps) {
      assertEquals(l.year, yearAt(layout, l.x));
      assertEquals(l.band, lightFor(l.year));
    }
  }
});

Deno.test("overlapping rooms share their years' light", () => {
  const layout = layoutTime(STYLED);
  const lamps = pathLamps(layout);
  const second = lamps.filter((l) => l.lane === 1);
  assert(second.length > 0);
  for (const l of second) assertEquals(l.band, lightFor(yearAt(layout, l.x)));
  assertEquals(new Set(second.map((l) => l.band.kind)), new Set(["fluorescent"]));
});

Deno.test("addPathLights adds one lamp per position, at most MAX_REAL_LIGHTS - 1 real lights and no shadows", () => {
  const restore = installFakeCanvas();
  try {
    for (const layout of [layoutTime(STYLED), layoutTime(bigPack())]) {
      const scene = new THREE.Scene();
      addPathLights(THREE, scene, layout);
      const lamps = [], lights = [];
      scene.traverse((o) => {
        if (o.userData.lamp) lamps.push(o);
        if (o.isLight) lights.push(o);
      });
      const expected = pathLamps(layout);
      assertEquals(lamps.length, expected.length);
      assert(lights.length > 0 && lights.length <= MAX_REAL_LIGHTS - 1, `${lights.length} real lights`);
      for (const light of lights) {
        assertEquals(light.castShadow, false);
        assertEquals(light.color.getHex(), new THREE.Color(lightFor(yearAt(layout, light.position.x)).color).getHex());
      }
    }
  } finally {
    restore();
  }
});

Deno.test("the whole world stays within MAX_REAL_LIGHTS point and spot lights, the focus light included", () => {
  const restore = installFakeCanvas();
  try {
    const pack = bigPack();
    const layout = layoutTime(pack);
    assert(pathLamps(layout).length >= MAX_REAL_LIGHTS, "more lamps than real lights");
    const lights = [];
    buildWorld(THREE, pack, layout).scene.traverse((o) => (o.isPointLight || o.isSpotLight) && lights.push(o));
    assert(lights.filter((l) => l.isSpotLight).length === 1, "one focus spotlight");
    assert(lights.length <= MAX_REAL_LIGHTS, `${lights.length} real lights`);
  } finally {
    restore();
  }
});
