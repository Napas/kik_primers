import { assertEquals, assertMatch, assertThrows } from "@std/assert";
import { focusReturn, hashId, lastScore, pageProgress, storageBackend, textAnchor, topicFromUrl } from "../site/lib/pages/common.js";
import { makeStore } from "../site/lib/storage.js";
import { facePrompt, move, orderRight, shift, summarize } from "../site/lib/pages/test.js";

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

Deno.test("pageProgress: progress over the page's storage, kept in memory with ?nostore=1", () => {
  const p = pageProgress(url("?topic=mini-test&nostore=1"));
  p.openSpot("mini-test", "s1");
  assertEquals(p.opened("mini-test"), new Set(["s1"]));
});

Deno.test("storageBackend: the default storage, or with ?nostore=1 one that throws on every call", () => {
  assertEquals(storageBackend(url("?topic=mini-test")), undefined, "undefined lets makeStore pick localStorage");
  const be = storageBackend(url("?topic=mini-test&nostore=1"));
  assertThrows(() => be.getItem("pw:x"));
  assertThrows(() => be.setItem("pw:x", "1"));
  assertThrows(() => be.removeItem("pw:x"));
  const store = makeStore(be);
  store.set("k", [1]);
  assertEquals(store.get("k", []), [1], "the store keeps working in memory");
});

Deno.test("hashId decodes the hash without its #; bad escapes give an empty id", () => {
  assertEquals(hashId("#jonas-rastas"), "jonas-rastas");
  assertEquals(hashId("#%C5%BE"), "ž");
  assertEquals(hashId(""), "");
  assertEquals(hashId("#%E0%A4%A"), "");
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

Deno.test("shift moves the item with the given id by its current position", () => {
  const a = ["x", "y", "z"];
  assertEquals(shift(a, "z", -1), ["x", "z", "y"]);
  assertEquals(shift(a, "x", 1), ["y", "x", "z"]);
  assertEquals(shift(a, "x", -1), ["x", "y", "z"]);
  assertEquals(shift(a, "nera", 1), ["x", "y", "z"]);
});

Deno.test("facePrompt asks who it is above the photo", () => {
  const h = facePrompt({ slug: "mini-test" }, { name: "Jonas", photo: { file: "img/jonas.jpg" } });
  assertMatch(h, /^<p>Kas tai\?<\/p><img src="topics\/mini-test\/img\/jonas\.jpg" alt="">$/);
});

Deno.test("textAnchor names the text view's element for a hash: spot-<id> for a bare spot id", () => {
  assertEquals(textAnchor("#jonas-rastas"), "spot-jonas-rastas");
  assertEquals(textAnchor("#spot-jonas-rastas"), "spot-jonas-rastas");
  assertEquals(textAnchor(""), "");
  assertEquals(textAnchor("#%E0%A4%A"), "");
});

Deno.test("focusReturn gives focus back to a keyboard opener that is still in the page", () => {
  const el = (isConnected = true) => ({ isConnected, focused: 0, focus() { this.focused++; } });
  const r = focusReturn();
  const button = el();
  r.opened(button, true, false);
  r.opened(el(), true, true); // a link inside the panel keeps the first opener
  r.closed();
  assertEquals(button.focused, 1);
  r.closed();
  assertEquals(button.focused, 1, "once per open");
  const clicked = el();
  r.opened(clicked, false, false);
  r.closed();
  assertEquals(clicked.focused, 0, "pointer opens leave focus alone");
  const gone = el(false);
  r.opened(gone, true, false);
  r.closed();
  assertEquals(gone.focused, 0, "a removed opener is skipped");
});
