import { assertEquals } from "@std/assert";
import { lastScore, topicFromUrl } from "../site/lib/pages/common.js";
import { move, orderRight, summarize } from "../site/lib/pages/test.js";

const root = new URL("../", import.meta.url).pathname;
const idx = { topics: [{ slug: "mini-test" }, { slug: "kita" }] };
const url = (q) => new URL(`x:/test.html${q}`);

Deno.test("topicFromUrl accepts a listed slug", () => {
  assertEquals(topicFromUrl(url("?topic=mini-test"), idx), { slug: "mini-test" });
});

Deno.test("topicFromUrl rejects traversal, unknown, missing and unlisted input", () => {
  for (const q of ["?topic=../etc", "?topic=nera-tokios", "", "?topic=", "?topic=Mini-Test"]) {
    const r = topicFromUrl(url(q), idx);
    assertEquals(typeof r.error, "string", q);
    assertEquals(r.slug, undefined, q);
  }
  assertEquals(typeof topicFromUrl(url("?topic=mini-test"), null).error, "string");
  assertEquals(typeof topicFromUrl(url("?topic=mini-test"), {}).error, "string");
});

Deno.test("lastScore formats the newest session or returns null", () => {
  assertEquals(lastScore([]), null);
  assertEquals(lastScore([{ right: 3, total: 5 }, { right: 12, total: 20 }]), "12/20");
});

Deno.test("move reorders without mutating", () => {
  const a = [1, 2, 3];
  assertEquals(move(a, 0, 2), [2, 3, 1]);
  assertEquals(move(a, 2, 0), [3, 1, 2]);
  assertEquals(move(a, 1, -1), [1, 2, 3]);
  assertEquals(move(a, 1, 3), [1, 2, 3]);
  assertEquals(a, [1, 2, 3]);
});

Deno.test("orderRight compares sequences", () => {
  assertEquals(orderRight(["a", "b"], ["a", "b"]), true);
  assertEquals(orderRight(["b", "a"], ["a", "b"]), false);
});

Deno.test("summarize counts right answers and lists wrong with their spots", () => {
  const results = [
    { item: { type: "recall", q: "K?", a: "A", spot: "s1" }, right: true },
    { item: { type: "recall", q: "K2?", a: "B", spot: "s2" }, right: false },
    { item: { type: "recall", q: "K3?", a: "C" }, right: false },
    { item: { type: "order", answer: ["s3", "s4"] }, right: false },
    { item: { type: "era", spot: "s5" }, right: false },
    { item: { type: "face", spot: "s6" }, right: false },
  ];
  const s = summarize(results);
  assertEquals([s.right, s.total], [1, 6]);
  assertEquals(s.wrong.map((m) => m.spots), [["s2"], [], ["s3", "s4"], ["s5"], ["s6"]]);
});

Deno.test("build-index writes counts for each pack", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${dir}/topics/mini-test`, { recursive: true });
    await Deno.copyFile(`${root}tests/fixtures/mini/topic.json`, `${dir}/topics/mini-test/topic.json`);
    const out = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "tools/build-index.ts", dir],
      cwd: root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
    const index = JSON.parse(await Deno.readTextFile(`${dir}/topics/index.json`));
    assertEquals(index, {
      topics: [{ slug: "mini-test", title: "Mažas bandymas", layout: "time", rooms: 2, spots: 3, questions: 2 }],
    });
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("build-index fails when there is no topics folder", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const out = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "tools/build-index.ts", dir],
      cwd: root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(out.code, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
