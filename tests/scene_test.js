import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import { COLORS, LIGHT_BANDS, poolLevel, SCENE } from "../site/lib/theme.js";
import { DEFAULTS, layoutTime } from "../site/lib/layout.js";
import { makeSpot, setPhoto } from "../site/lib/scene/spots.js";
import { makeLabel } from "../site/lib/scene/labels.js";
import { buildWorld, configureRenderer } from "../site/lib/scene/world.js";
import { ground, lifespanBar, path, plainRoom, STYLES, yearMarker } from "../site/lib/scene/styles.js";
import { lowBackWalls, pathLanes, pathZ, yearLineZ, yearMarks } from "../site/lib/scene/lanes.js";
import { STYLE_NAMES } from "../site/lib/theme.js";
import { installFakeCanvas } from "./fake_canvas.js";

const root = new URL("../", import.meta.url).pathname;
const MINI = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/mini/topic.json`));
const STYLED = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/styles/topic.json`));
const KINDS = ["person", "work", "group", "event", "place", "thing"];
const spot = (kind, extra = {}) => ({ id: `s-${kind}`, kind, name: "Žemaitė Ąžuolė", years: [1845], at: 1845, ...extra });
const canvases = (obj) => {
  const out = [];
  obj.traverse((o) => {
    for (const m of [o.material].flat()) if (m?.map?.image?.texts) out.push(m.map.image);
  });
  return out;
};

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

Deno.test("labels draw after the floor pools and over the scene", () => {
  const restore = installFakeCanvas();
  try {
    const label = makeLabel(THREE, "Ąž");
    const spot = makeSpot(THREE, { id: "a", kind: "person", name: "A B" }, COLORS);
    assert(label.renderOrder > spot.getObjectByName("spot-pool").renderOrder);
    assertEquals(label.material.depthTest, false);
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
      assert(obj.userData.pickRadius > 0 && obj.userData.pickRadius < DEFAULTS.rowGap / 2, `${kind}: pick sphere overlaps neighbours`);
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

Deno.test("a spot's pool fades by its light band; spots in the same band share materials", () => {
  const restore = installFakeCanvas();
  try {
    const pool = (o) => o.getObjectByName("spot-pool").material;
    const [candle, , , , daylight] = LIGHT_BANDS;
    const p1 = pool(makeSpot(THREE, spot("person"), COLORS, { band: candle }));
    const p2 = pool(makeSpot(THREE, spot("work"), COLORS, { band: candle }));
    const p3 = pool(makeSpot(THREE, spot("person"), COLORS, { band: daylight }));
    assert(p1 === p2, "same band, same material");
    const k = poolLevel(daylight);
    assertEquals([p1.opacity, p3.opacity], [SCENE.pool.opacity, SCENE.pool.opacity * k]);
    assert(pool(makeSpot(THREE, spot("person"), COLORS)) === p1, "without a band a spot gets the full pool");
  } finally {
    restore();
  }
});

Deno.test("every spot gets a floor pool that shares one texture and material, with no real lights", () => {
  const restore = installFakeCanvas();
  try {
    const lit = (obj) => {
      const found = { lights: 0, pools: [] };
      obj.traverse((o) => {
        if (o.isLight) found.lights++;
        if (o.name === "spot-pool") found.pools.push(o);
      });
      return found;
    };
    const all = KINDS.map((k) => makeSpot(THREE, spot(k), COLORS));
    const [a, b] = [lit(all[0]), lit(all[1])];
    for (const obj of all) {
      const f = lit(obj);
      assertEquals(f.lights, 0);
      assertEquals(f.pools.length, 1);
      assertEquals(obj.userData.wall, undefined);
      assertEquals(f.pools[0].userData.wall, undefined);
      assertEquals(f.pools[0].material.depthWrite, false);
      assertEquals(f.pools[0].castShadow, false);
    }
    assert(a.pools[0].material === b.pools[0].material, "pool material is shared");
    assert(a.pools[0].material.map === b.pools[0].material.map, "pool texture is shared");
    assert(a.pools[0].geometry === b.pools[0].geometry, "pool geometry is shared");
    // The hit sphere is set from the model alone.
    assert(all.every((o) => o.userData.pickRadius < DEFAULTS.rowGap / 2));
  } finally {
    restore();
  }
});

Deno.test("spots share their plain materials; each portrait, plaque and year plate keeps its own", () => {
  const restore = installFakeCanvas();
  try {
    const plain = (obj) => {
      const out = new Set();
      obj.traverse((o) => {
        if (o.isMesh && o.name !== "spot-pool" && !o.material.map) out.add(o.material);
      });
      return out;
    };
    const a = KINDS.map((k) => plain(makeSpot(THREE, spot(k), COLORS)));
    const b = KINDS.map((k) => plain(makeSpot(THREE, spot(k), COLORS)));
    a.forEach((mats, i) => {
      assert(mats.size > 0, KINDS[i]);
      for (const m of mats) assert(b[i].has(m), `${KINDS[i]}: ${m.type} not shared`);
    });
    const [p1, p2] = [makeSpot(THREE, spot("person"), COLORS), makeSpot(THREE, spot("person"), COLORS)];
    assert(p1.userData.portrait.material !== p2.userData.portrait.material, "portraits get their own material");
    const plaque = (o) => o.getObjectByName("plaque").material;
    assert(plaque(p1) !== plaque(p2), "plaques get their own material");
  } finally {
    restore();
  }
});

Deno.test("a long name on a placeholder portrait keeps its lines clear of the years", () => {
  const restore = installFakeCanvas();
  try {
    const person = makeSpot(THREE, spot("person", { name: "Jonas Petras Antanas Kazys Juozas Vincas", years: [1845, 1921] }), COLORS);
    const fills = person.userData.portrait.material.map.image.fills;
    const years = fills.find((f) => f.text === "1845–1921");
    const names = fills.filter((f) => f !== years).map((f) => f.y);
    assertEquals(names.length, 6);
    const lineH = names[1] - names[0];
    assert(names.at(-1) + lineH / 2 < years.y, `last name line at ${names.at(-1)}, line ${lineH}, years at ${years.y}`);
  } finally {
    restore();
  }
});

Deno.test("a person shows a placeholder with the name and years until a photo is set; an event shows its year", () => {
  const restore = installFakeCanvas();
  try {
    const person = makeSpot(THREE, spot("person", { years: [1845, 1921] }), COLORS);
    const placeholder = person.userData.portrait.material.map.image.texts;
    assertEquals(placeholder, ["Žemaitė", "Ąžuolė", "1845–1921"]);
    const tex = new THREE.Texture({ width: 100, height: 100 });
    let disposed = false;
    person.userData.portrait.material.map.addEventListener("dispose", () => (disposed = true));
    setPhoto(person, tex);
    assert(disposed, "the placeholder texture is released");
    assertEquals(person.userData.portrait.material.map, tex);
    assertEquals(person.userData.portrait.material.emissiveMap, tex, "the photo glows a little, so it stays readable in a dim room");
    assert(person.userData.portrait.material.isMeshStandardMaterial, "the portrait takes the room's light");
    // A square photo on the taller frame is cropped at the sides, centred.
    assertEquals(tex.repeat.y, 1);
    assert(Math.abs(tex.repeat.x - 0.5 / 0.66) < 1e-9);
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
    assertEquals(w.camera.far, SCENE.far);
    assert(w.camera.position.x < layout.rooms[0].x0, "camera starts before the first room");
    assertEquals(photos, [], "buildWorld leaves photo loading to the caller");
    const jonas = w.spotMeshes.get("jonas-rastas");
    assertEquals(w.spotMeshes.get("pirma-knyga").userData.loadPhoto, undefined, "no photo, no loader");
    jonas.userData.loadPhoto();
    assertEquals(photos.map(([f]) => f), ["img/jonas.jpg"]);
    const tex = new THREE.Texture({ width: 66, height: 86 });
    photos[0][1](tex);
    assertEquals(jonas.userData.portrait.material.map, tex, "the loaded photo goes on the portrait");
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
    assert(m.userData.label.position.z >= 0.1, "the year sits in front of the wall face its post stands in");
  } finally {
    restore();
  }
});

const boxOf = (o) => new THREE.Box3().setFromObject(o, true); // precise: rotated parts measured by their vertices
const partsOf = (room) => {
  const out = { walls: [], meshes: [] };
  room.updateMatrixWorld(true);
  room.traverse((o) => {
    if (o.userData.wall) out.walls.push(o);
    if (o.isMesh) out.meshes.push(o);
    if (o.userData.part) out[o.userData.part] = o;
  });
  return out;
};

Deno.test("every style builds walls, floor, signature, window light and a landmark inside its footprint", () => {
  const restore = installFakeCanvas();
  try {
    // A minimum-size room on the second lane: nothing may reach the first lane's path behind it.
    const r = { x0: 30, x1: 40, z0: -9.1, z1: -4.9 };
    const backFace = r.z0 - 0.6 + 0.075; // front face of the back wall (MARGIN 0.6, WALL_T 0.15)
    for (const name of STYLE_NAMES) {
      const room = STYLES[name](THREE, r, COLORS);
      const p = partsOf(room);
      assertEquals(p.walls.length, 3, `${name}: back wall and two end walls`);
      for (const w of p.walls) assertEquals(w.geometry.type, "BoxGeometry", `${name}: walls stay simple boxes`);
      const wallTop = Math.max(...p.walls.map((w) => boxOf(w).max.y));
      for (const part of ["floor", "signature", "window", "landmark"]) assert(p[part], `${name}: no ${part}`);
      assert(boxOf(p.signature).max.y > wallTop + 0.3, `${name}: signature does not rise over the back wall`);
      const lm = boxOf(p.landmark);
      assert(lm.min.x >= r.x0 && lm.max.x <= r.x1, `${name}: landmark outside the room's x range`);
      assert(lm.min.z >= backFace - 1e-6 && lm.max.z <= r.z0 + 0.35, `${name}: landmark leaves the strip behind the spots`);
      let glows = false;
      p.window.traverse((o) => (glows ||= o.material?.emissive?.getHex() > 0 || o.material?.isMeshBasicMaterial));
      assert(glows, `${name}: window light does not glow`);
      for (const m of p.meshes) {
        const b = boxOf(m);
        assert(b.min.z >= r.z0 - 0.6 - 0.075 - 1e-6, `${name}: ${m.name || m.geometry.type} sticks out behind the back wall`);
        assert(b.max.z <= r.z1 + 0.6 + 1e-6, `${name}: ${m.name || m.geometry.type} sticks out in front of the floor`);
        for (const mat of [m.material].flat()) {
          if (mat.map) assertEquals(typeof mat.map.image.getContext, "function", `${name}: textures are drawn on canvases`);
        }
      }
    }
  } finally {
    restore();
  }
});

Deno.test("buildWorld gives each room its named style", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(STYLED);
    const w = buildWorld(THREE, STYLED, layout);
    assertEquals(w.roomGroups.size, 9);
    for (const room of STYLED.rooms) {
      let style;
      w.roomGroups.get(room.n).traverse((o) => (style ??= o.userData.style));
      assertEquals(style, room.style, `room ${room.n}`);
    }
    assertEquals(w.walls.length, 3 * layout.rooms.length);
  } finally {
    restore();
  }
});

Deno.test("buildWorld dims each spot's pool by the light band at its place", () => {
  const restore = installFakeCanvas();
  try {
    const w = buildWorld(THREE, STYLED, layoutTime(STYLED));
    const pool = (id) => w.spotMeshes.get(id).getObjectByName("spot-pool").material.opacity;
    const full = SCENE.pool.opacity;
    assertEquals(pool("s1"), full, "a 1547 spot is in candle light");
    assertEquals(pool("s9"), full * poolLevel(LIGHT_BANDS[4]), "a 2000 spot is in daylight");
  } finally {
    restore();
  }
});

Deno.test("lanes.js is pure placement: it imports nothing", () => {
  const src = Deno.readTextFileSync(`${root}site/lib/scene/lanes.js`);
  assert(!/^\s*import\b/m.test(src));
});

Deno.test("pathLanes: one entry per lane with its rooms' x extent and its path's z", () => {
  const r = (n, lane, x0, x1, z1) => ({ n, lane, x0, x1, z0: z1 - 4, z1 });
  const rooms = [r(1, 1, 5, 15, -5), r(2, 0, 0, 10, 2), r(3, 0, 10, 20, 2)];
  assertEquals(pathLanes({ rooms }), [
    { lane: 0, x0: 0, x1: 20, z: pathZ(rooms[1]) },
    { lane: 1, x0: 5, x1: 15, z: pathZ(rooms[0]) },
  ]);
  assertEquals(pathZ(rooms[1]), 2 + 1.4);
});

Deno.test("lowBackWalls: a back wall is low where the next lane has a room behind it, overlapping in x", () => {
  const r = (n, lane, x0, x1) => ({ n, lane, x0, x1 });
  const rooms = [
    r(1, 0, 0, 10), r(2, 0, 10, 24), r(3, 1, 18, 32), r(4, 0, 31, 58), r(5, 1, 55, 67.6),
    r(6, 0, 67.6, 100), r(7, 0, 100, 134), r(8, 1, 102, 134), r(9, 0, 134, 154), r(10, 2, 120, 125),
  ];
  // 6 and 9 only touch a lane-1 room at one x; 3 has nothing on lane 2 behind it.
  assertEquals([...lowBackWalls(rooms)].sort((a, b) => a - b), [2, 4, 7, 8]);
  assertEquals(lowBackWalls([]).size, 0);
});

Deno.test("year markers and the lifespan bar stand on the back wall's front face, clear of every landmark", () => {
  const restore = installFakeCanvas();
  try {
    const r = { x0: 0, x1: 10, z0: -2.1, z1: 2.1 };
    assertAlmostEquals(yearLineZ(r), r.z0 - 0.6 + 0.075, 1e-9);
    const z = yearLineZ(r);
    const post = yearMarker(THREE, 1800, COLORS);
    post.position.set(5, 0, z); // at the room centre, where the landmark stands
    const bar = lifespanBar(THREE, 0, 10, z, COLORS);
    const solid = [];
    for (const o of [post, bar]) {
      o.updateMatrixWorld(true);
      o.traverse((m) => m.isMesh && solid.push(boxOf(m)));
    }
    for (const name of STYLE_NAMES) {
      const p = partsOf(STYLES[name](THREE, r, COLORS));
      p.landmark.traverse((m) => {
        if (!m.isMesh) return;
        for (const b of solid) assert(!boxOf(m).intersectsBox(b), `${name}: ${m.geometry.type} cuts the year line`);
      });
    }
  } finally {
    restore();
  }
});

Deno.test("yearMarks: each lane's ticks over its extent on its own year line, moved off end walls", () => {
  const lane0 = { n: 1, lane: 0, x0: 0, x1: 10, z0: -2.1, z1: 2.1 };
  const layout = {
    rooms: [lane0, { n: 2, lane: 0, x0: 10, x1: 20, z0: -2.1, z1: 2.1 }, { n: 3, lane: 1, x0: 5, x1: 15, z0: -9.1, z1: -4.9 }],
    ticks: [{ year: 1500, x: 0 }, { year: 1550, x: 5.1 }, { year: 1600, x: 10 }, { year: 1650, x: 17 }, { year: 1700, x: 20 }],
  };
  const lane1 = layout.rooms[2];
  const marks = yearMarks(layout).map((m) => [m.year, +m.x.toFixed(6), m.z]);
  assertEquals(marks, [
    [1500, 0.3, yearLineZ(lane0)],
    [1550, 5.1, yearLineZ(lane0)],
    [1600, 10.3, yearLineZ(lane0)],
    [1650, 17, yearLineZ(lane0)],
    [1700, 20.3, yearLineZ(lane0)],
    [1550, 5.3, yearLineZ(lane1)],
    [1600, 10, yearLineZ(lane1)],
  ]);
});

Deno.test("a low back wall: 1.1 m, still one of three wall boxes, a lintel carries the signature, window light only on the floor", () => {
  const restore = installFakeCanvas();
  try {
    const r = { x0: 30, x1: 42, z0: -2.1, z1: 2.1, low: true };
    const backFace = r.z0 - 0.6 + 0.075;
    const builders = [...STYLE_NAMES.map((name) => [name, STYLES[name]]), ["plain", plainRoom]];
    for (const [name, build] of builders) {
      const p = partsOf(build(THREE, r, COLORS));
      assertEquals(p.walls.length, 3, name);
      const back = p.walls.find((w) => boxOf(w).max.x - boxOf(w).min.x >= r.x1 - r.x0 - 1e-6);
      assertAlmostEquals(boxOf(back).max.y, 1.1, 1e-6, `${name}: back wall height`);
      for (const w of p.walls.filter((w) => w !== back)) assertAlmostEquals(boxOf(w).max.y, 3.2, 1e-6, `${name}: end walls stay full height`);
      assert(p.lintel, `${name}: no lintel`);
      const lintel = boxOf(p.lintel);
      assert(lintel.min.x <= r.x0 + 1e-6 && lintel.max.x >= r.x1 - 1e-6, `${name}: lintel spans the room`);
      assert(lintel.min.y >= 2.8 && Math.abs(lintel.max.y - 3.2) < 1e-6, `${name}: lintel at the top`);
      assert(!p.lintel.userData.wall, `${name}: the lintel is decoration`);
      if (name === "plain") continue;
      assert(boxOf(p.signature).min.y >= 3.2 - 1e-6, `${name}: signature sits on the lintel`);
      p.window.traverse((o) => o.isMesh && assert(boxOf(o).max.y < 0.1, `${name}: window light hangs in the opening`));
      // Nothing but the landmark fills the opening between the low wall and the lintel.
      for (const m of p.meshes) {
        if (m.userData.wall || p.landmark.getObjectById(m.id)) continue;
        const b = boxOf(m);
        const inOpening = b.max.y > 1.2 && b.min.y < 2.8 && b.min.z < backFace + 0.5 && b.max.x > r.x0 + 1.6 && b.min.x < r.x1 - 1.6;
        assert(!inOpening, `${name}: ${m.name || m.geometry.type} fills the opening`);
      }
    }
  } finally {
    restore();
  }
});

Deno.test("buildWorld lowers the back wall in front of a parallel lane and puts year markers on every lane", () => {
  const restore = installFakeCanvas();
  try {
    const pack = {
      slug: "lanes",
      rooms: [
        { n: 1, title: "Karas", span: [1940, 1990], style: "dp-barrack" },
        { n: 2, title: "Sovietmetis", span: [1944, 1990], style: "concrete" },
        { n: 3, title: "Po 1990", span: [2000, 2020], style: "glass" },
      ],
      spots: [],
    };
    const layout = layoutTime(pack);
    const w = buildWorld(THREE, pack, layout);
    const backTop = (n) => {
      const walls = [];
      w.roomGroups.get(n).traverse((o) => o.userData.wall && walls.push(boxOf(o)));
      return walls.reduce((a, b) => (b.max.x - b.min.x > a.max.x - a.min.x ? b : a)).max.y;
    };
    assertAlmostEquals(backTop(1), 1.1, 1e-6, "room 1 has lane-1 room 2 behind it");
    assertAlmostEquals(backTop(2), 3.2, 1e-6);
    assertAlmostEquals(backTop(3), 3.2, 1e-6);
    assert(w.walls.some((b) => Math.abs(b.max.y - 1.1) < 1e-6), "the low wall is an occluder at its real height");
    const marks = yearMarks(layout);
    assertEquals(new Set(marks.map((m) => m.z)).size, 2, "a year line on each lane");
    assertEquals(w.labels.length, pack.rooms.length + marks.length);
  } finally {
    restore();
  }
});

Deno.test("every kind but place and event carries its name on a plaque; place shows it on its sign", () => {
  const restore = installFakeCanvas();
  try {
    for (const kind of KINDS) {
      const obj = makeSpot(THREE, spot(kind), COLORS);
      if (kind === "event") continue;
      const plaque = obj.getObjectByName("plaque");
      assert(plaque, kind);
      assert(plaque.material.map.image.texts.includes("Žemaitė Ąžuolė"), kind);
    }
  } finally {
    restore();
  }
});

Deno.test("a lifted spot stands on a riser: model, pool, label and pick heights all move up by the lift", () => {
  const restore = installFakeCanvas();
  try {
    const flat = makeSpot(THREE, spot("person"), COLORS);
    const raised = makeSpot(THREE, spot("person"), COLORS, { lift: 0.35 });
    assertEquals(flat.getObjectByName("riser"), undefined);
    const riser = raised.getObjectByName("riser");
    assertAlmostEquals(riser.position.y, 0.175, 1e-9);
    assertAlmostEquals(raised.userData.labelY - flat.userData.labelY, 0.35, 1e-9);
    assertAlmostEquals(raised.userData.pickY - flat.userData.pickY, 0.35, 1e-9);
    assertAlmostEquals(raised.getObjectByName("pool").position.y, 0.35, 1e-9);
  } finally {
    restore();
  }
});

Deno.test("a scaled spot shrinks its model, label and pick heights, but not its riser", () => {
  const restore = installFakeCanvas();
  try {
    const full = makeSpot(THREE, spot("person"), COLORS);
    const small = makeSpot(THREE, spot("person"), COLORS, { scale: 0.8 });
    assertAlmostEquals(small.userData.labelY, full.userData.labelY * 0.8, 1e-9);
    assertAlmostEquals(small.userData.pickY, full.userData.pickY * 0.8, 1e-9);
    assertAlmostEquals(small.userData.pickRadius, full.userData.pickRadius * 0.8, 1e-9);
    const box = (o) => new THREE.Box3().setFromObject(o.getObjectByName("plaque").parent);
    assert(box(small).max.y < box(full).max.y);
    const both = makeSpot(THREE, spot("person"), COLORS, { scale: 0.8, lift: 0.35 });
    assertAlmostEquals(both.getObjectByName("riser").geometry.parameters.height, 0.35, 1e-9);
    assertAlmostEquals(both.userData.pickY, full.userData.pickY * 0.8 + 0.35, 1e-9);
  } finally {
    restore();
  }
});

Deno.test("buildWorld raises the back row by SCENE.rowLift and leaves the front row on the floor", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(STYLED);
    const w = buildWorld(THREE, STYLED, layout);
    for (const p of layout.spots) {
      const riser = w.spotMeshes.get(p.id).getObjectByName("riser");
      const lift = SCENE.rowLift * (layout.rows - 1 - p.row);
      if (lift === 0) assertEquals(riser, undefined, p.id);
      else assertAlmostEquals(riser.geometry.parameters.height, lift, 1e-9, p.id);
      const front = p.row === layout.rows - 1;
      assertEquals(w.spotMeshes.get(p.id).getObjectByName("model").scale.x, front ? SCENE.frontScale : 1, p.id);
    }
  } finally {
    restore();
  }
});

Deno.test("buildWorld tags each label entry as a room title with its room number, or a year marker", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(MINI);
    const w = buildWorld(THREE, MINI, layout);
    const titles = w.labels.filter((l) => l.kind === "title");
    assertEquals(titles.map((l) => l.room).sort(), MINI.rooms.map((r) => r.n).sort());
    for (const t of titles) assertEquals(t.sprite, w.roomGroups.get(t.room).userData.label);
    const markers = w.labels.filter((l) => l.kind === "marker");
    assertEquals(markers.length, layout.ticks.length);
    assert(markers.every((m) => m.room === undefined));
  } finally {
    restore();
  }
});

Deno.test("world.focus lights the chosen spot with a spotlight and dims the room; focus(null) restores the light", () => {
  const restore = installFakeCanvas();
  try {
    const w = buildWorld(THREE, MINI, layoutTime(MINI));
    const lights = [];
    w.scene.traverse((o) => o.isLight && lights.push(o));
    const spot = lights.find((l) => l.isSpotLight);
    const hemi = lights.find((l) => l.isHemisphereLight);
    assertEquals(spot.intensity, 0, "no spotlight until something is chosen");
    const jonas = w.spotMeshes.get("jonas-rastas");
    w.focus(jonas);
    w.update(10);
    assertAlmostEquals(spot.intensity, SCENE.focus.intensity, 1e-6);
    assertAlmostEquals(hemi.intensity, SCENE.ambient.intensity * SCENE.focus.dim, 1e-6);
    assertAlmostEquals(spot.target.position.x, jonas.position.x, 1e-9);
    assert(spot.position.y > jonas.userData.pickY + 1, "shines from above");
    assert(spot.position.z > jonas.position.z, "and from the visitor's side");
    w.focus(null);
    w.update(10);
    assertAlmostEquals(spot.intensity, 0, 1e-6);
    assertAlmostEquals(hemi.intensity, SCENE.ambient.intensity, 1e-6);
  } finally {
    restore();
  }
});

Deno.test("configureRenderer applies the look's tone mapping operator and exposure", () => {
  assert(THREE[`${SCENE.toneMapping}ToneMapping`] !== undefined, `no THREE.${SCENE.toneMapping}ToneMapping`);
  const renderer = {};
  configureRenderer(THREE, renderer);
  assertEquals(renderer.toneMapping, THREE[`${SCENE.toneMapping}ToneMapping`]);
  assertEquals(renderer.toneMappingExposure, SCENE.exposure);
});
