import { assert, assertEquals } from "@std/assert";
import { makeStore } from "../site/lib/storage.js";
import { makeProgress } from "../site/lib/progress.js";

const fakeStorage = () => {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
  };
};
const throwing = () => ({
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
});

Deno.test("store round-trips JSON values", () => {
  const s = makeStore(fakeStorage());
  s.set("a", { x: [1, 2] });
  assertEquals(s.get("a", null), { x: [1, 2] });
  assertEquals(s.get("missing", 7), 7);
});

Deno.test("store keys are prefixed pw:", () => {
  const b = fakeStorage();
  makeStore(b).set("a", 1);
  assertEquals([...b.m.keys()], ["pw:a"]);
});

Deno.test("store survives a throwing backend and remembers in memory", () => {
  const s = makeStore(throwing());
  assertEquals(s.get("a", "fb"), "fb");
  s.set("a", 5);
  assertEquals(s.get("a", "fb"), 5);
});

Deno.test("store with null backend is memory only", () => {
  const s = makeStore(null);
  s.set("a", 1);
  assertEquals(s.get("a", 0), 1);
});

Deno.test("store falls back to memory once the backend has failed", () => {
  const b = fakeStorage();
  let fail = false;
  const flaky = {
    getItem: (k) => {
      if (fail) throw new Error("x");
      return b.getItem(k);
    },
    setItem: (k, v) => {
      if (fail) throw new Error("x");
      b.setItem(k, v);
    },
  };
  const s = makeStore(flaky);
  s.set("a", 1);
  fail = true;
  assertEquals(s.get("a", 0), 1);
  s.set("a", 2);
  fail = false;
  assertEquals(s.get("a", 0), 2);
});

Deno.test("store ignores corrupt JSON", () => {
  const b = fakeStorage();
  b.m.set("pw:a", "{oops");
  assertEquals(makeStore(b).get("a", "fb"), "fb");
});

Deno.test("store default backend never throws", () => {
  const s = makeStore();
  s.set("a", 1);
  assertEquals(s.get("a", 0), 1);
});

Deno.test("opening the same spot twice counts once", () => {
  const p = makeProgress(makeStore(fakeStorage()));
  p.openSpot("t", "s1");
  p.openSpot("t", "s1");
  p.openSpot("t", "s2");
  assertEquals(p.opened("t"), new Set(["s1", "s2"]));
  assertEquals(p.opened("other"), new Set());
});

Deno.test("revealWhy records room:i keys per topic", () => {
  const p = makeProgress(makeStore(fakeStorage()));
  p.revealWhy("t", "r1", 0);
  p.revealWhy("t", "r1", 0);
  p.revealWhy("t", "r2", 3);
  assertEquals(p.revealed("t"), new Set(["r1:0", "r2:3"]));
});

Deno.test("answers keep the latest result per question", () => {
  const p = makeProgress(makeStore(fakeStorage()));
  p.answer("t", "q1", false);
  p.answer("t", "q2", true);
  p.answer("t", "q1", true);
  assertEquals(p.lastAnswers("t"), { q1: true, q2: true });
});

Deno.test("sessions keep the 20 newest, oldest first", () => {
  const p = makeProgress(makeStore(fakeStorage()));
  for (let i = 0; i < 25; i++) p.session("t", { scope: "all", right: i, total: 30 });
  const s = p.sessions("t");
  assertEquals(s.length, 20);
  assertEquals(s[0].right, 5);
  assertEquals(s[19].right, 24);
  assertEquals(Object.keys(s[0]).sort(), ["at", "right", "scope", "total"]);
  assert(!Number.isNaN(Date.parse(s[0].at)));
});

Deno.test("progress works over a throwing backend", () => {
  const p = makeProgress(makeStore(throwing()));
  p.openSpot("t", "s1");
  p.session("t", { scope: "x", right: 1, total: 2 });
  assertEquals(p.opened("t"), new Set(["s1"]));
  assertEquals(p.sessions("t").length, 1);
});
