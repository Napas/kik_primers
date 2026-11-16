import { assert, assertEquals } from "@std/assert";
import { buildSession, mulberry32, pickOrder } from "../site/lib/quiz.js";

const ROOMS = [1, 2, 3, 4].map((n) => ({ n, span: [1000 + n * 100, 1099 + n * 100] }));
ROOMS.push({ n: 5, span: null });

function pack({ photos = true, questions = 20 } = {}) {
  const spots = [];
  for (const r of ROOMS) {
    for (let i = 0; i < 6; i++) {
      const year = r.span ? r.span[0] + i * 10 : null;
      spots.push({
        id: `s${r.n}-${i}`,
        room: r.n,
        kind: i % 2 ? "work" : "person",
        name: `Spot ${r.n}-${i}`,
        years: year === null ? null : [year],
        ...(photos && i % 2 === 0 ? { photo: { file: "x.jpg" } } : {}),
      });
    }
  }
  const qs = Array.from({ length: questions }, (_, i) => ({
    id: `q${i}`,
    q: `Q${i}?`,
    a: `A${i}`,
    room: (i % 4) + 1,
    ...(i % 3 === 0 ? { spot: `s${(i % 4) + 1}-0` } : {}),
  }));
  return { rooms: ROOMS, spots, questions: qs };
}

const count = (items, type) => items.filter((i) => i.type === type).length;
const rng = () => mulberry32(42);

Deno.test("same seed gives the same session", () => {
  const p = pack();
  assertEquals(buildSession(p, { rng: rng() }), buildSession(p, { rng: rng() }));
});

Deno.test("size 20 mixes 12 recall, 4 face, 4 order/era", () => {
  const s = buildSession(pack(), { rng: rng() });
  assertEquals(s.length, 20);
  assertEquals(count(s, "recall"), 12);
  assertEquals(count(s, "face"), 4);
  assertEquals(count(s, "order"), 2);
  assertEquals(count(s, "era"), 2);
});

Deno.test("a pack without photos has no face items; recall takes the share", () => {
  const s = buildSession(pack({ photos: false }), { rng: rng() });
  assertEquals(count(s, "face"), 0);
  assertEquals(count(s, "recall"), 16);
});

Deno.test("never more items than candidates", () => {
  const s = buildSession(pack({ photos: false, questions: 3 }), { rng: rng() });
  assertEquals(count(s, "recall"), 3);
  assert(s.length <= 3 + 8);
});

Deno.test("no repeats in one session", () => {
  const s = buildSession(pack(), { rng: rng() });
  const keys = s.map((i) =>
    i.type === "recall" ? `r${i.qid}` : i.type === "face" ? `f${i.spot}` : i.type === "era" ? `e${i.spot}` : null
  ).filter(Boolean);
  assertEquals(new Set(keys).size, keys.length);
  const ordered = s.filter((i) => i.type === "order").flatMap((i) => i.answer);
  assertEquals(new Set(ordered).size, ordered.length);
});

Deno.test("recall items carry the pack question id and spot", () => {
  const p = pack();
  const s = buildSession(p, { rng: rng() });
  for (const i of s.filter((x) => x.type === "recall")) {
    const q = p.questions.find((x) => x.id === i.qid);
    assertEquals([i.q, i.a, i.spot], [q.q, q.a, q.spot]);
  }
});

Deno.test("face items are people with a photo", () => {
  const p = pack();
  for (const i of buildSession(p, { rng: rng() }).filter((x) => x.type === "face")) {
    const sp = p.spots.find((x) => x.id === i.spot);
    assertEquals(sp.kind, "person");
    assert(sp.photo);
  }
});

Deno.test("pickOrder: strictly increasing years, gaps >= 5", () => {
  const spots = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, years: [1900 + i * 2] }));
  const year = (id) => spots.find((s) => s.id === id).years[0];
  for (let seed = 1; seed < 30; seed++) {
    const ids = pickOrder(spots, { n: 4, by: "year" }, mulberry32(seed));
    assertEquals(ids.length, 4);
    for (let k = 1; k < ids.length; k++) assert(year(ids[k]) - year(ids[k - 1]) >= 5);
  }
});

Deno.test("pickOrder: null for 3 spots in one year", () => {
  const spots = [1, 2, 3].map((i) => ({ id: `b${i}`, years: [1900] }));
  assertEquals(pickOrder(spots, { n: 3, by: "year" }, mulberry32(1)), null);
});

Deno.test("pickOrder finds a chain when random picks would clash", () => {
  const ys = [1900, 1903, 1906, 1909, 1912, 1915, 1918, 1921];
  const spots = ys.map((y, i) => ({ id: `c${i}`, years: [y] }));
  assert(pickOrder(spots, { n: 4, by: "year" }, mulberry32(7)) !== null);
});

Deno.test("order items: answer is chronological, spots are a shuffle of it", () => {
  const p = pack();
  const year = (id) => p.spots.find((s) => s.id === id).years[0];
  const orders = buildSession(p, { rng: rng() }).filter((i) => i.type === "order");
  assert(orders.length > 0);
  for (const o of orders) {
    assertEquals(o.answer.length, 4);
    for (let k = 1; k < 4; k++) assert(year(o.answer[k]) > year(o.answer[k - 1]));
    assertEquals([...o.spots].sort(), [...o.answer].sort());
    assert(o.spots.join() !== o.answer.join());
  }
});

Deno.test("by: 'born' uses years[0] of people, 'year' for the rest", () => {
  const p = {
    rooms: [{ n: 1, span: [1800, 1900] }],
    spots: [
      ...[1810, 1830, 1850, 1870].map((y, i) => ({
        id: `p${i}`, room: 1, kind: "person", years: [y, y + 60], at: 1880 - i,
      })),
    ],
    questions: [],
  };
  const o = buildSession(p, { size: 5, rng: rng() }).find((i) => i.type === "order");
  assertEquals(o.by, "born");
  assertEquals(o.answer, ["p0", "p1", "p2", "p3"]);
  const w = {
    ...p,
    spots: p.spots.map((s) => ({ ...s, kind: "work", years: [s.years[0]], at: 1999 - s.years[0] })),
  };
  const o2 = buildSession(w, { size: 5, rng: rng() }).find((i) => i.type === "order");
  assertEquals(o2.by, "year");
  assertEquals(o2.answer, ["p0", "p1", "p2", "p3"]);
});

Deno.test("aside and year-less spots never appear in order or era items", () => {
  const p = pack();
  for (const s of p.spots) if (s.id.endsWith("-1")) s.aside = true;
  const bad = new Set(p.spots.filter((s) => s.aside || !s.years).map((s) => s.id));
  for (let seed = 1; seed < 20; seed++) {
    for (const i of buildSession(p, { rng: mulberry32(seed) })) {
      if (i.type === "order") for (const id of i.answer) assert(!bad.has(id), id);
      if (i.type === "era") assert(!bad.has(i.spot), i.spot);
    }
  }
});

Deno.test("era items: 3-4 span rooms including the answer", () => {
  const p = pack();
  const eras = buildSession(p, { rng: rng() }).filter((i) => i.type === "era");
  assert(eras.length > 0);
  for (const e of eras) {
    assertEquals(e.answer, p.spots.find((s) => s.id === e.spot).room);
    assert(e.rooms.length >= 3 && e.rooms.length <= 4);
    assert(e.rooms.includes(e.answer));
    assertEquals(new Set(e.rooms).size, e.rooms.length);
    assert(!e.rooms.includes(5));
  }
});

Deno.test("room scope: only that room's items, no era", () => {
  const p = pack();
  const s = buildSession(p, { room: 2, size: 10, rng: rng() });
  assert(s.length > 0);
  for (const i of s) {
    assert(i.type !== "era");
    if (i.type === "recall") assertEquals(p.questions.find((q) => q.id === i.qid).room, 2);
    if (i.type === "face") assertEquals(p.spots.find((x) => x.id === i.spot).room, 2);
    if (i.type === "order") for (const id of i.answer) assertEquals(p.spots.find((x) => x.id === id).room, 2);
  }
});
