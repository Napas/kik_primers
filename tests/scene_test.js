import { assert, assertEquals } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import { COLORS } from "../site/lib/theme.js";
import { layoutTime } from "../site/lib/layout.js";
import { initials, makeSpot, setPhoto } from "../site/lib/scene/spots.js";
import { makeLabel } from "../site/lib/scene/labels.js";
import { buildWorld } from "../site/lib/scene/world.js";
import { ground, path, plainRoom, yearMarker } from "../site/lib/scene/styles.js";
import { installFakeCanvas } from "./fake_canvas.js";

const root = new URL("../", import.meta.url).pathname;
const MINI = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/mini/topic.json`));
const KINDS = ["person", "work", "group", "event", "place", "thing"];
const spot = (kind, extra = {}) => ({ id: `s-${kind}`, kind, name: "Žemaitė Ąžuolė", years: [1845], at: 1845, ...extra });
const canvases = (obj) => {
  const out = [];
  obj.traverse((o) => {
    for (const m of [o.material].flat()) if (m?.map?.image?.texts) out.push(m.map.image);
  });
  return out;
};

Deno.test("initials take the first letters of the first and last name", () => {
  assertEquals(initials("Jonas Rašytojas"), "JR");
  assertEquals(initials("Žemaitė"), "Ž");
  assertEquals(initials("vyskupas Motiejus Valančius"), "VV");
  assertEquals(initials("  "), "?");
});

Deno.test("makeLabel draws the text, diacritics kept, on a sprite sized by its width", () => {
  const restore = installFakeCanvas();
  try {
    const short = makeLabel(THREE, "Ąž");
    const long = makeLabel(THREE, "Bažnyčia ir šventoriaus vartai");
    assert(short.isSprite);
    assertEquals(short.material.map.image.texts, ["Ąž"]);
    assert(long.scale.x > short.scale.x);
    assertEquals(long.scale.y, short.scale.y);
  } finally {
    restore();
  }
});

Deno.test("makeSpot builds one tagged model per kind", () => {
  const restore = installFakeCanvas();
  try {
    const shapes = new Set();
    for (const kind of KINDS) {
      const obj = makeSpot(THREE, spot(kind), COLORS);
      assert(obj.isObject3D, kind);
      assertEquals(obj.userData.spotId, `s-${kind}`);
      assertEquals(obj.userData.kind, kind);
      assert(obj.userData.pickRadius > 0 && obj.userData.pickRadius < 0.7, `${kind}: pick sphere overlaps neighbours`);
      assert(obj.userData.labelY > 0, kind);
      const geos = [];
      obj.traverse((o) => o.isMesh && geos.push(o.geometry.type));
      assert(geos.length > 0, kind);
      shapes.add(geos.sort().join(","));
    }
    assertEquals(shapes.size, KINDS.length);
  } finally {
    restore();
  }
});

Deno.test("a person shows initials until a photo is set; an event shows its year", () => {
  const restore = installFakeCanvas();
  try {
    const person = makeSpot(THREE, spot("person"), COLORS);
    assert(canvases(person).some((c) => c.texts.includes("ŽĄ")));
    const tex = new THREE.Texture({ width: 100, height: 100 });
    let disposed = false;
    person.userData.portrait.material.map.addEventListener("dispose", () => (disposed = true));
    setPhoto(person, tex);
    assert(disposed, "the initials texture is released");
    assertEquals(person.userData.portrait.material.map, tex);
    // A square photo on the taller frame is cropped at the sides, centred.
    assertEquals(tex.repeat.y, 1);
    assert(Math.abs(tex.repeat.x - 0.66 / 0.86) < 1e-9);
    assert(Math.abs(tex.offset.x - (1 - tex.repeat.x) / 2) < 1e-9);
    // A tall photo is cropped at the bottom, keeping the face at the top.
    const tall = new THREE.Texture({ width: 100, height: 300 });
    setPhoto(person, tall);
    assertEquals(tall.repeat.x, 1);
    assert(Math.abs(tall.offset.y + tall.repeat.y - 1) < 1e-9);
    const event = makeSpot(THREE, spot("event", { at: 1794 }), COLORS);
    assert(canvases(event).some((c) => c.texts.includes("1794")));
  } finally {
    restore();
  }
});

Deno.test("buildWorld places every room and spot from the layout", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(MINI);
    const photos = [];
    const w = buildWorld(THREE, MINI, layout, { aspect: 1.5, loadPhoto: (file, apply) => photos.push([file, apply]) });
    assertEquals([...w.roomGroups.keys()], [1, 2]);
    assertEquals([...w.spotMeshes.keys()], ["jonas-rastas", "pirma-knyga", "didysis-sukilimas"]);
    for (const s of layout.spots) {
      const p = w.spotMeshes.get(s.id).position;
      assertEquals([p.x, p.z], [s.x, s.z]);
      assert(w.scene.getObjectById(w.spotMeshes.get(s.id).id));
    }
    assert(w.camera.isPerspectiveCamera);
    assertEquals(w.camera.aspect, 1.5);
    assert(w.camera.position.x < layout.rooms[0].x0, "camera starts before the first room");
    assertEquals(photos.map(([f]) => f), ["img/jonas.jpg"]);
    assertEquals(w.walls.length, 3 * layout.rooms.length, "back wall and two end walls per room");
    for (const b of w.walls) assert(b.min.x <= b.max.x && b.min.y < b.max.y && b.min.z <= b.max.z);
    const inside = (p) => p.x >= w.bounds.x0 && p.x <= w.bounds.x1 && p.z >= w.bounds.z0 && p.z <= w.bounds.z1;
    assert(inside(w.camera.position), "camera starts inside the bounds");
    for (const s of layout.spots) assert(inside(s), s.id);
    w.update(0.016);
  } finally {
    restore();
  }
});

Deno.test("styles.js builds the plain look: walls tagged as occluders, path, ground, year markers", () => {
  const restore = installFakeCanvas();
  try {
    const room = plainRoom(THREE, { x0: 0, x1: 10, z0: -2, z1: 2 }, COLORS);
    const walls = [];
    room.traverse((o) => o.userData.wall && walls.push(o));
    assertEquals(walls.length, 3);
    assert(path(THREE, { x0: 0, x1: 10, z: 3 }, COLORS).isMesh);
    assert(ground(THREE, { x0: -5, x1: 15, z0: -10, z1: 10 }, COLORS).isMesh);
    const m = yearMarker(THREE, 1550, COLORS);
    const texts = [];
    m.traverse((o) => o.material?.map?.image?.texts && texts.push(...o.material.map.image.texts));
    assertEquals(texts, ["1550"]);
  } finally {
    restore();
  }
});
