import { assert, assertAlmostEquals, assertEquals, assertMatch } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import { layoutTime } from "../site/lib/layout.js";
import { buildWorld } from "../site/lib/scene/world.js";
import { drawLifespan, drawLinks, lifespanRange, removeDrawn } from "../site/lib/scene/arcs.js";
import { clearance, LABEL_NEAR, LABEL_RANGE, labelFit, labelScale, PHOTO_RANGE, sizeLabels, STAND, standPoint, updateNearby } from "../site/lib/scene/nearby.js";
import { LABEL, SCENE } from "../site/lib/theme.js";
import { yearLineZ } from "../site/lib/scene/lanes.js";
import { markerLeft, overviewHtml, roomAt, roomCounts } from "../site/lib/pages/overview.js";
import { makeSelection, roomVisit } from "../site/lib/pages/selection.js";
import { makeStore } from "../site/lib/storage.js";
import { makeProgress } from "../site/lib/progress.js";
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

Deno.test("drawLifespan lays a bar on the year line of the person's own lane, over the life's years", () => {
  const layout = layoutTime(LANES);
  const scene = new THREE.Scene();
  const zOf = (bar) => {
    const box = new THREE.Box3().setFromObject(bar);
    return (box.min.z + box.max.z) / 2;
  };
  const bar = drawLifespan(THREE, scene, layout, [1941, 1985], 2);
  assertEquals(bar.parent, scene);
  const box = new THREE.Box3().setFromObject(bar);
  assertAlmostEquals(box.min.x, layout.xOfYear(1941), 1e-6);
  assertAlmostEquals(box.max.x, layout.xOfYear(1985), 1e-6);
  const room = (n) => layout.rooms.find((r) => r.n === n);
  assertEquals(room(2).lane, 1);
  assertAlmostEquals(zOf(bar), yearLineZ(room(2)), 1e-6);
  assertAlmostEquals(zOf(drawLifespan(THREE, scene, layout, [1941, 1985], 1)), yearLineZ(room(1)), 1e-6);
  assertAlmostEquals(zOf(drawLifespan(THREE, scene, layout, [1941, 1985], 99)), yearLineZ(room(1)), 1e-6, "unknown room: lane 0");
  assertEquals(drawLifespan(THREE, scene, layout, null, 1), null);
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

Deno.test("roomAt: a room's x-range is half-open, so a spot on a shared border belongs to the later room", () => {
  const pack = { slug: "adj", rooms: [{ n: 1, title: "A", span: [1500, 1600] }, { n: 2, title: "B", span: [1600, 1700] }], spots: [] };
  const layout = layoutTime(pack);
  const [r1, r2] = layout.rooms;
  assertEquals(r1.x1, r2.x0);
  const z = r1.z1 + 1.4;
  assertEquals(roomAt(layout, r1.x0, z), 1);
  assertEquals(roomAt(layout, r2.x0, z), 2, "the border goes to the room that starts there");
  assertEquals(roomAt(layout, r2.x1, z), 2, "the last room's end is inside it");
  assertEquals(roomAt(layout, r2.x1 + 0.01, z), null);
});

Deno.test("roomVisit opens a room once per visit, never for rooms passed on a chosen walk", () => {
  let s = { visit: null, quiet: false };
  const frame = (n, moving = false) => {
    s = roomVisit(s.visit, n, s.quiet, moving);
    return s.open;
  };
  assertEquals(frame(null), false, "before the first room");
  assertEquals(frame(1), true, "entering opens");
  assertEquals(frame(1), false, "staying (also after Esc closed the panel) does not reopen");
  assertEquals(frame(null), false);
  assertEquals(frame(1), true, "re-entering opens again");
  s.quiet = true; // a walk to a chosen spot starts
  assertEquals(frame(2, true), false, "a room passed on the way stays closed");
  assertEquals(frame(null, true), false);
  assertEquals(frame(3, false), false, "arriving in the chosen spot's room keeps the spot panel");
  assertEquals(s.quiet, false, "quiet ends when the walk ends");
  assertEquals(frame(3), false, "still the same visit");
  assertEquals(frame(2), true, "walking on into another room opens it");
});

Deno.test("standPoint keeps the default 2.5 m in front when clear, else finds a point with clearance", () => {
  const t = { x: 10, z: 0 };
  assertEquals(standPoint(t, []), { x: 10, z: STAND.front });
  const blocked = [{ x: 10, z: 1.2 }, { x: 10, z: 2.5 }];
  const p = standPoint(t, blocked);
  const c = clearance(p, t, blocked);
  assert(c.point >= STAND.point && c.sight >= STAND.sight, JSON.stringify({ p, c }));
  const far = [{ x: 30, z: 0 }];
  assertEquals(standPoint(t, far), { x: 10, z: STAND.front }, "far spots don't matter");
});

Deno.test("standPoint in a crowd returns the candidate with the most clearance", () => {
  const t = { x: 0, z: 0 };
  const crowd = [];
  for (let x = -6; x <= 6; x += 0.8) for (let z = -1; z <= 6; z += 0.8) if (Math.hypot(x, z) > 0.5) crowd.push({ x, z });
  const p = standPoint(t, crowd);
  assert(Number.isFinite(p.x) && Number.isFinite(p.z));
  assert(p.z > t.z, "stays in front of the spot");
});

Deno.test("clearance measures distances to the stand point and to the sight segment", () => {
  const c = clearance({ x: 0, z: 2 }, { x: 0, z: 0 }, [{ x: 0.3, z: 1 }, { x: 0, z: 3 }]);
  assertAlmostEquals(c.sight, 0.3, 1e-9, "beside the segment");
  assertAlmostEquals(c.point, 1, 1e-9, "the spot behind the stand point is off the segment but 1 m from the point");
  assertEquals(clearance({ x: 0, z: 2 }, { x: 0, z: 0 }, []), { point: Infinity, sight: Infinity });
});

Deno.test("labelScale keeps a near label at LABEL.maxView of the view height and a far one at full size", () => {
  const viewAt = (d) => 2 * d * Math.tan((SCENE.fov * Math.PI) / 360);
  for (const d of [1, 2.5, 5]) assertAlmostEquals((LABEL.height * labelScale(d)) / viewAt(d), LABEL.maxView, 1e-9);
  assertEquals(labelScale(LABEL_RANGE), 1);
  assertEquals(labelScale(40), 1);
});

Deno.test("labelFit narrows labels on screens narrower than LABEL.refAspect", () => {
  assertEquals([labelFit(1.75), labelFit(LABEL.refAspect)], [1, 1]);
  assertAlmostEquals(labelFit(390 / 844), 390 / 844 / LABEL.refAspect, 1e-9);
  const viewAt = (d) => 2 * d * Math.tan((SCENE.fov * Math.PI) / 360);
  const phone = 390 / 844;
  for (const d of [2.5, 8, 12]) {
    assertAlmostEquals((LABEL.height * labelScale(d, phone)) / viewAt(d), LABEL.maxView * labelFit(phone), 1e-9);
  }
  assertEquals(labelScale(5, 1.75), labelScale(5));
});

Deno.test("updateNearby shows labels over a shorter range on a narrow screen", () => {
  const restore = installFakeCanvas();
  try {
    const w = buildWorld(THREE, MINI, layoutTime(MINI));
    const jonas = w.spotMeshes.get("jonas-rastas");
    const d = (LABEL_RANGE * (1 + labelFit(0.46))) / 2; // inside the wide range, outside the narrow one
    const eye = { x: jonas.position.x - d, y: 1.7, z: jonas.position.z };
    updateNearby(w.spotMeshes, eye, null, null, 1.75);
    assertEquals(jonas.userData.label.visible, true);
    updateNearby(w.spotMeshes, eye, null, null, 0.46);
    assertEquals(jonas.userData.label.visible, false);
    assertAlmostEquals(jonas.userData.label.scale.y, LABEL.height * labelScale(d, 0.46), 1e-9);
  } finally {
    restore();
  }
});

Deno.test("buildWorld lists room titles and year markers, and sizeLabels fits them like spot labels", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(MINI);
    const w = buildWorld(THREE, MINI, layout);
    assertEquals(w.labels.length, MINI.rooms.length + layout.ticks.length);
    const first = w.labels[0];
    const y = first.sprite.scale.y;
    const eye = { x: first.x - 3, y: 1.7, z: first.z };
    sizeLabels(w.labels, eye, 0.46);
    sizeLabels(w.labels, eye, 0.46);
    assertAlmostEquals(first.sprite.scale.y, y * labelScale(3, 0.46), 1e-9);
  } finally {
    restore();
  }
});

Deno.test("updateNearby sizes each label by its distance without compounding", () => {
  const restore = installFakeCanvas();
  try {
    const w = buildWorld(THREE, MINI, layoutTime(MINI));
    const label = w.spotMeshes.get("jonas-rastas").userData.label;
    const [x, y] = [label.scale.x, label.scale.y];
    const jonas = w.spotMeshes.get("jonas-rastas").position;
    const eye = { x: jonas.x - 3, y: 1.7, z: jonas.z };
    updateNearby(w.spotMeshes, eye, null, null);
    updateNearby(w.spotMeshes, eye, null, null);
    assertAlmostEquals(label.scale.y, y * labelScale(3), 1e-9);
    assertAlmostEquals(label.scale.x, x * labelScale(3), 1e-9);
    updateNearby(w.spotMeshes, { x: jonas.x - 11, y: 1.7, z: jonas.z }, null, null);
    assertAlmostEquals(label.scale.y, y * labelScale(11), 1e-9);
  } finally {
    restore();
  }
});

Deno.test("updateNearby hides labels of spots right next to the eye, except the selected one", () => {
  const restore = installFakeCanvas();
  try {
    const w = buildWorld(THREE, MINI, layoutTime(MINI));
    const jonas = w.spotMeshes.get("jonas-rastas");
    const eye = { x: jonas.position.x + LABEL_NEAR / 2, y: 1.7, z: jonas.position.z };
    updateNearby(w.spotMeshes, eye, null, null);
    assertEquals(jonas.userData.label.visible, false);
    updateNearby(w.spotMeshes, eye, "jonas-rastas", null);
    assertEquals(jonas.userData.label.visible, false, "hover does not bring back a label in the face");
    updateNearby(w.spotMeshes, eye, null, "jonas-rastas");
    assertEquals(jonas.userData.label.visible, true);
  } finally {
    restore();
  }
});

Deno.test("makeSelection: one open thing at a time; reopening and closing leave no drawings behind", () => {
  const restore = installFakeCanvas();
  try {
    const layout = layoutTime(MINI);
    const world = buildWorld(THREE, MINI, layout);
    const progress = makeProgress(makeStore(null));
    const calls = [];
    let open = null; // what the page would put in data-open
    const view = {
      show: (html, focus) => calls.push(["show", focus, html]),
      hide: () => calls.push(["hide"]),
      opened: (id) => (open = id),
    };
    const sel = makeSelection(THREE, { world, pack: MINI, layout, progress, view });
    const base = world.scene.children.length;
    sel.openSpot("jonas-rastas");
    assertEquals(world.scene.children.length, base + 2, "link arcs and lifespan");
    assertEquals([sel.spot.id, open], ["jonas-rastas", "jonas-rastas"]);
    assertEquals(calls.at(-1)[1], true, "an explicit open takes focus");
    sel.openSpot("jonas-rastas");
    assertEquals(world.scene.children.length, base + 2, "re-picking replaces, not adds");
    sel.openSpot("pirma-knyga");
    assertEquals(world.scene.children.length, base + 1, "a work has arcs, no lifespan");
    sel.openRoom(1, false);
    assertEquals(world.scene.children.length, base, "entering a room deselects the spot");
    assertEquals([sel.spot, open], [null, null]);
    assertEquals(calls.at(-1)[1], false);
    assertMatch(calls.at(-1)[2], /data-room="1"/);
    sel.reveal("1:0");
    assert(progress.revealed("mini-test").has("1:0"));
    assertMatch(calls.at(-1)[2], /Nes tai pradžia\./);
    sel.openSpot("jonas-rastas");
    sel.close();
    assertEquals(world.scene.children.length, base);
    assertEquals(calls.at(-1), ["hide"]);
    assertEquals(open, null);
    assertEquals([...progress.opened("mini-test")].sort(), ["jonas-rastas", "pirma-knyga"]);
  } finally {
    restore();
  }
});
