import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import { layoutTime } from "../site/lib/layout.js";

const room = (n, span) => ({ n, title: `R${n}`, span, style: "plain" });
const spot = (id, r, at) => ({ id, room: r, at, kind: "book" });
const pack = (rooms, spots = []) => ({ rooms, spots });

const fx2Rooms = () => pack([room(1, [1500, 1600]), room(2, [1700, 1800])]);
const fxTouching = (y) => pack([room(1, [1800, y]), room(2, [y, 2000])]);
const fxExileSoviet = () =>
  pack(
    [room(1, [1944, 1990]), room(2, [1944, 1991])],
    [spot("exile-1960", 1, 1960), spot("soviet-1960", 2, 1960)],
  );
const fxOneSpot = (y) => pack([room(1, [1700, 1800])], [spot("a", 1, y)]);
const fxCrowd = (k, y) =>
  pack([room(1, [1900, 2000])], Array.from({ length: k }, (_, i) => spot(`s${i}`, 1, y)));
const fxSparseThenDense = () =>
  pack(
    [room(1, [1500, 1600]), room(2, [1600, 1700])],
    [spot("a", 1, 1550), ...Array.from({ length: 30 }, (_, i) => spot(`d${i}`, 2, 1650 + (i % 5)))],
  );
const fxAnnex = () =>
  pack(
    [room(1, [1500, 1600]), room(2, [1600, 1700]), room(3, null)],
    [spot("a", 1, 1550), spot("x1", 3, undefined), spot("x2", 3, undefined)],
  );

const roomOf = (L, n) => L.rooms.find((r) => r.n === n);
const spotX = (L, id) => L.spots.find((s) => s.id === id).x;
const len = (L, n) => roomOf(L, n).x1 - roomOf(L, n).x0;
const EPS = 1e-9;

function noOverlap(L, gap) {
  const byRow = new Map();
  for (const s of L.spots) {
    const k = `${s.z}`;
    if (!byRow.has(k)) byRow.set(k, []);
    byRow.get(k).push(s.x);
  }
  for (const xs of byRow.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert(xs[i] - xs[i - 1] >= gap - EPS);
  }
}
function allInside(L, p) {
  const roomN = new Map(p.spots.map((s) => [s.id, s.room]));
  for (const s of L.spots) {
    const r = roomOf(L, roomN.get(s.id));
    assert(s.x >= r.x0 - EPS && s.x <= r.x1 + EPS, `${s.id} outside room ${r.n}`);
  }
}

Deno.test("non-overlapping rooms share lane 0 and keep order", () => {
  const L = layoutTime(fx2Rooms());
  assertEquals(L.rooms.map((r) => r.lane), [0, 0]);
  assert(L.rooms[0].x1 <= L.rooms[1].x0);
});
Deno.test("rooms sharing a boundary year stay in one lane", () =>
  assertEquals(layoutTime(fxTouching(1918)).rooms.map((r) => r.lane), [0, 0]));
Deno.test("an uncovered gap gets gapLen", () => {
  const L = layoutTime(fx2Rooms());
  assertAlmostEquals(L.xOfYear(1700) - L.xOfYear(1600), 3);
});
Deno.test("overlapping spans run in parallel lanes, aligned by year", () => {
  const L = layoutTime(fxExileSoviet());
  assertNotEquals(L.rooms[0].lane, L.rooms[1].lane);
  assertAlmostEquals(spotX(L, "exile-1960"), spotX(L, "soviet-1960"));
  assertAlmostEquals(L.rooms[0].x0, L.rooms[1].x0);
});
Deno.test("an uncrowded spot stands exactly at its year", () => {
  const L = layoutTime(fxOneSpot(1743));
  assertAlmostEquals(spotX(L, "a"), L.xOfYear(1743));
});
Deno.test("crowded spots never overlap within a row and stay inside the room", () => {
  const p = fxCrowd(30, 1950);
  const L = layoutTime(p);
  assertEquals(L.spots.length, 30);
  noOverlap(L, 1.6);
  allInside(L, p);
});
for (const k of [4, 12]) {
  Deno.test(`${k} spots at the end year stay inside the room`, () => {
    const p = fxCrowd(k, 2000);
    const L = layoutTime(p);
    noOverlap(L, 1.6);
    allInside(L, p);
  });
}
Deno.test("end-of-room clusters inside parallel lanes stay inside their rooms", () => {
  const spots = [
    ...Array.from({ length: 12 }, (_, i) => spot(`e${i}`, 1, 1990)),
    ...Array.from({ length: 12 }, (_, i) => spot(`s${i}`, 2, 1991)),
  ];
  const p = pack([room(1, [1944, 1990]), room(2, [1944, 1991])], spots);
  const L = layoutTime(p);
  noOverlap(L, 1.6);
  allInside(L, p);
});
Deno.test("a sparse century is not longer than a crowded one", () => {
  const L = layoutTime(fxSparseThenDense());
  assert(len(L, 1) < len(L, 2));
});
Deno.test("annex comes after the last room", () => {
  const L = layoutTime(fxAnnex());
  assert(roomOf(L, 3).x0 > roomOf(L, 2).x1);
  assertEquals(L.length, roomOf(L, 3).x1);
  const [a, b] = ["x1", "x2"].map((id) => spotX(L, id));
  assert(a > roomOf(L, 3).x0 && b > a && b < roomOf(L, 3).x1);
});
Deno.test("ticks every 50 years, none stacked", () => {
  const t = layoutTime(fx2Rooms()).ticks;
  assertEquals(t.map((t) => t.year), [1500, 1550, 1600, 1650, 1700, 1750, 1800]);
  for (let i = 1; i < t.length; i++) assert(t[i].x > t[i - 1].x);
});
Deno.test("rooms keep pack order and carry n", () => {
  const L = layoutTime(pack([room(5, [1700, 1800]), room(2, [1500, 1600])]));
  assertEquals(L.rooms.map((r) => r.n), [5, 2]);
  assertEquals(L.rooms.map((r) => r.lane), [0, 0]);
  assert(roomOf(L, 2).x1 <= roomOf(L, 5).x0);
});
Deno.test("xOfYear is clamped at the ends", () => {
  const L = layoutTime(fx2Rooms());
  assertEquals(L.xOfYear(1000), 0);
  assertEquals(L.xOfYear(3000), L.xOfYear(1800));
});
