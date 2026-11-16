import { assert, assertAlmostEquals, assertEquals, assertMatch } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import { layoutTime } from "../site/lib/layout.js";
import { buildWorld } from "../site/lib/scene/world.js";
import { drawLifespan, drawLinks, lifespanRange, removeDrawn } from "../site/lib/scene/arcs.js";
import { LABEL_RANGE, PHOTO_RANGE, updateNearby } from "../site/lib/scene/nearby.js";
import { yearLineZ } from "../site/lib/scene/styles.js";
import { markerLeft, overviewHtml, roomAt, roomCounts } from "../site/lib/pages/overview.js";
import { installFakeCanvas } from "./fake_canvas.js";

const root = new URL("../", import.meta.url).pathname;
const MINI = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/mini/topic.json`));

// Two parallel lanes over 1944-1990 and a gap before a third room.
const LANES = {
  slug: "lanes",
  rooms: [
    { n: 1, title: "Karas", span: [1940, 1990] },
    { n: 2, title: "Sovietmetis", span: [1944, 1990] },
    { n: 3, title: "Po 1990", span: [2000, 2020] },
  ],
  spots: [],
};

Deno.test("roomAt picks the room whose x-range holds x, on the lane nearest z", () => {
  const layout = layoutTime(LANES);
  const [r1, r2, r3] = [1, 2, 3].map((n) => layout.rooms.find((r) => r.n === n));
  assertEquals([r1.lane, r2.lane], [0, 1]);
  const mid = (r1.x0 + r1.x1) / 2;
  assertEquals(roomAt(layout, mid, r1.z1 + 1.4), 1, "on the lane-0 path");
  assertEquals(roomAt(layout, mid, r1.z1 + 3), 1, "beyond the year markers");
  assertEquals(roomAt(layout, mid, r2.z1 + 1.4), 2, "on the lane-1 path, behind lane 0");
  assertEquals(roomAt(layout, mid, (r2.z0 + r2.z1) / 2), 2, "inside the lane-1 room");
  assertEquals(roomAt(layout, (r1.x1 + r3.x0) / 2, r1.z1 + 1.4), null, "in the gap between rooms");
  assertEquals(roomAt(layout, r1.x0 - 3, r1.z1 + 1.4), null, "before the first room");
  assertEquals(roomAt(layout, (r3.x0 + r3.x1) / 2, r2.z1 + 1.4), 3, "the only room at that x");
});

Deno.test("roomCounts counts opened and all spots per room", () => {
  const counts = roomCounts(MINI, new Set(["pirma-knyga", "elsewhere"]));
  assertEquals(counts.get(1), { opened: 1, total: 2 });
  assertEquals(counts.get(2), { opened: 0, total: 1 });
});

Deno.test("overviewHtml: a strip segment and a list button per room, in time order, titles escaped", () => {
  const pack = { ...LANES, rooms: LANES.rooms.map((r) => (r.n === 3 ? { ...r, title: "<b>Po</b> 1990" } : r)) };
  const layout = layoutTime(pack);
  const html = overviewHtml(layout, pack.rooms, roomCounts(MINI, new Set()));
  const buttons = [...html.matchAll(/<button type="button" data-room="(\d+)"/g)].map((m) => m[1]);
  assertEquals(buttons, ["1", "2", "3"]);
  assertEquals([...html.matchAll(/class="seg" data-room="(\d+)"/g)].length, 3);
  assertMatch(html, /&lt;b&gt;Po&lt;\/b&gt; 1990/);
  assert(!html.includes("<b>"));
  assertMatch(html, /data-count="1">atidaryta 0\/2</);
  assertMatch(html, /data-count="3">atidaryta 0\/0</);
  assertMatch(html, /class="strip" aria-hidden="true"/);
  assertMatch(html, /class="you"/);
});

Deno.test("markerLeft maps x onto the strip, clamped to 0-100%", () => {
  const layout = layoutTime(MINI);
  assertEquals(markerLeft(layout, -10), "0%");
  assertEquals(markerLeft(layout, layout.length + 10), "100%");
  assertEquals(markerLeft(layout, layout.length / 2), "50%");
});

Deno.test("lifespanRange covers [from, to], reaches now for the living, and is short for one year", () => {
  const layout = layoutTime(MINI);
  const x = layout.xOfYear;
  assertEquals(lifespanRange(layout, [1520, 1580], 2026), { x0: x(1520), x1: x(1580) });
  assertEquals(lifespanRange(layout, [1520, null], 2026), { x0: x(1520), x1: x(2026) });
  const one = lifespanRange(layout, [1547], 2026);
  assertAlmostEquals(one.x0, x(1547));
  assert(one.x1 > one.x0, "a single year still draws a short bar");
  assertEquals(lifespanRange(layout, null, 2026), null);
  assertEquals(lifespanRange(layout, [], 2026), null);
});

Deno.test("drawLinks adds one gold arc per target, rising above both ends; removeDrawn takes it out", () => {
  const scene = new THREE.Scene();
  const from = { x: 0, y: 1, z: 0 };
  const g = drawLinks(THREE, scene, from, [{ x: 6, y: 1, z: 0 }, { x: -3, y: 1.2, z: -7 }]);
  assert(g.isGroup);
  assertEquals(g.parent, scene);
  assertEquals(g.children.length, 2);
  for (const m of g.children) {
    assert(m.isMesh);
    m.geometry.computeBoundingBox();
    assert(m.geometry.boundingBox.max.y > 1.5, "arc rises above its ends");
  }
  let disposed = 0;
  for (const m of g.children) m.geometry.addEventListener("dispose", () => disposed++);
  removeDrawn(scene, g);
  assertEquals(g.parent, null);
  assertEquals(disposed, 2);
  assertEquals(drawLinks(THREE, scene, from, []).children.length, 0);
});

Deno.test("drawLifespan lays a bar on the year-marker line of lane 0, over the life's years", () => {
  const layout = layoutTime(LANES);
  const scene = new THREE.Scene();
  const bar = drawLifespan(THREE, scene, layout, [1941, 1985]);
  assertEquals(bar.parent, scene);
  const box = new THREE.Box3().setFromObject(bar);
  assertAlmostEquals(box.min.x, layout.xOfYear(1941), 1e-6);
  assertAlmostEquals(box.max.x, layout.xOfYear(1985), 1e-6);
  const lane0 = layout.rooms.find((r) => r.lane === 0);
  assertAlmostEquals((box.min.z + box.max.z) / 2, yearLineZ(lane0), 1e-6);
  assertEquals(drawLifespan(THREE, scene, layout, null), null);
});

Deno.test("updateNearby shows labels within 12 m or on hover and loads each photo once within 30 m", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(MINI);
    const loads = [];
    const w = buildWorld(THREE, MINI, layout, { loadPhoto: (file) => loads.push(file) });
    assertEquals(loads, [], "photos wait until the visitor comes near");
    assertEquals([LABEL_RANGE, PHOTO_RANGE], [12, 30]);
    const jonas = w.spotMeshes.get("jonas-rastas");
    const event = w.spotMeshes.get("didysis-sukilimas");
    const far = { x: jonas.position.x - 40, y: 1.7, z: jonas.position.z };
    updateNearby(w.spotMeshes, far, null);
    assertEquals(loads, []);
    assertEquals(jonas.userData.label.visible, false);
    updateNearby(w.spotMeshes, far, "jonas-rastas");
    assertEquals(jonas.userData.label.visible, true, "a hovered spot shows its label");
    const near = { x: jonas.position.x - 20, y: 1.7, z: jonas.position.z };
    updateNearby(w.spotMeshes, near, null);
    updateNearby(w.spotMeshes, near, null);
    assertEquals(loads, ["img/jonas.jpg"], "loaded once");
    assertEquals(jonas.userData.label.visible, false);
    const close = { x: jonas.position.x - 5, y: 1.7, z: jonas.position.z };
    updateNearby(w.spotMeshes, close, null);
    assertEquals(jonas.userData.label.visible, true);
    assertEquals(event.userData.label.visible, Math.hypot(event.position.x - close.x, event.position.z - close.z) <= 12);
  } finally {
    restore();
  }
});
