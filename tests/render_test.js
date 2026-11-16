import { assert, assertEquals, assertMatch } from "@std/assert";
import { lifeStrip, plotExplainer, roomPanel, spotPanel, textView, worksOf } from "../site/lib/render.js";
import { COLORS } from "../site/lib/theme.js";

const bare = (kind, extra = {}) => ({ id: "x", room: 1, kind, name: "Vardas", aliases: [], years: null, text: "Tekstas.", links: [], ...extra });
const person = (extra = {}) => bare("person", extra);
const work = (extra = {}) => bare("work", extra);
const spotWith = (extra) => bare("thing", extra);
const mkPlot = () => ({
  characters: [{ name: "Katrė", role: "dukra" }, { name: "Jonas", role: "tėvas" }, { name: "Petras", role: "kaimynas" }],
  relations: [{ a: "Katrė", b: "Jonas", label: "tėvas" }],
  beats: [
    { text: "Pradžia.", characters: ["Jonas"] },
    { text: "Vidurys.", characters: ["Katrė", "Petras"] },
    { text: "Pabaiga.", characters: ["Katrė"] },
    { text: "Epilogas.", characters: ["Jonas"] },
  ],
  sources: ["https://example.org/a"],
});
const pack = (extra = {}) => ({
  slug: "mini", title: "Mini", intro: "Įvadas.",
  rooms: [
    { n: 1, title: "Žemaičiai", intro: "Pirmas.", why: [], span: [1700, 1800], style: "barn" },
    { n: 2, title: "Mažoji Lietuva", intro: "Antras.", why: [{ q: "Kodėl?", a: "Todėl." }], span: [1500, 1600], style: "print-shop" },
    { n: 3, title: "Be laiko", intro: "Trečias.", why: [], span: null, style: "glass" },
  ],
  spots: [], questions: [{ id: "q1", q: "Klausimas?", a: "Atsakymas", room: 1 }], ...extra,
});

Deno.test("pack text is escaped everywhere", () => {
  const h = spotPanel(spotWith({ name: `<b>X</b> & „Y“`, text: "<script>1</script>" }), pack());
  assert(!h.includes("<b>X") && !h.includes("<script>"));
  assert(h.includes("&lt;b&gt;X&lt;/b&gt; &amp; „Y“"));
});
Deno.test("bare person has no empty sections", () => {
  const h = spotPanel(bare("person"), pack());
  for (const w of ["Nuotrauka", "Ryšiai", "Kūriniai", "Gyvenimas"]) assert(!h.includes(w), w);
});
Deno.test("unapproved illustration is not shown", () => {
  assert(!spotPanel(work({ illustration: { file: "x.png", approved: false } }), pack()).includes("x.png"));
  assert(spotPanel(work({ illustration: { file: "x.png", approved: true } }), pack()).includes("x.png"));
});
Deno.test("photo credit links the source", () => {
  const h = spotPanel(person({ photo: { file: "p.jpg", author: "Jonas", license: "CC0", source_url: "https://commons.example/p" } }), pack());
  assertMatch(h, /<a [^>]*href="https:\/\/commons\.example\/p"[^>]*>Nuotrauka: Jonas, CC0<\/a>/);
});
Deno.test("unsafe photo source url is not linked", () => {
  const h = spotPanel(person({ photo: { file: "p.jpg", author: "A", license: "CC0", source_url: "javascript:alert(1)" } }), pack());
  assert(!h.includes("javascript:"));
});
Deno.test("years and aliases and links", () => {
  const h = spotPanel(person({ years: [1714, 1780], aliases: ["Kristijonas"], links: [{ to: "metai", label: "Metai" }] }), pack());
  assert(h.includes("1714–1780") && h.includes("Kristijonas"));
  assertMatch(h, /data-spot="metai"/);
});
Deno.test("opened flag marks the panel", () => {
  assert(spotPanel(person(), pack(), { opened: true }).includes("is-open"));
  assert(!spotPanel(person(), pack()).includes("is-open"));
});
Deno.test("life strip lists places outside the map", () => {
  assertMatch(lifeStrip(person({ places: [{ name: "Niujorkas", lat: 40.7, lon: -74 }] }), pack()), /Toliau: Niujorkas/);
});
Deno.test("life strip draws a dot for places on the map", () => {
  const h = lifeStrip(person({ places: [{ name: "Vilnius", lat: 54.7, lon: 25.3 }] }), pack());
  assertMatch(h, /<circle/);
  assert(!h.includes("Toliau"));
});
Deno.test("life strip places events by year", () => {
  const h = lifeStrip(person({ life: [{ year: 1700, label: "A" }, { year: 1750, label: "B" }, { year: 1800, label: "C" }] }), pack());
  assert(h.includes("left:0%") && h.includes("left:50%") && h.includes("left:100%"));
});
Deno.test("life strip shows the motif", () => {
  assertMatch(lifeStrip(person({ motif: "book", life: [{ year: 1, label: "A" }] }), pack()), /<svg[^>]*viewBox="0 0 64 64"/);
});
Deno.test("plot step highlights that beat's characters", () => {
  const h = plotExplainer(mkPlot(), { step: 1 });
  assertMatch(h, /data-char="Katrė"[^>]*class="[^"]*on/);
  assert(!/data-char="Jonas"[^>]*class="[^"]*\bon\b/.test(h));
  assert(h.includes("Vidurys.") && h.includes("Atgal") && h.includes("Toliau"));
  assertMatch(h, /data-step="0"/);
  assertMatch(h, /data-step="2"/);
  assertMatch(h, /href="https:\/\/example\.org\/a"/);
});
Deno.test("plot step is clamped", () => {
  assert(plotExplainer(mkPlot(), { step: 99 }).includes("Epilogas."));
  assert(plotExplainer(mkPlot(), { step: -3 }).includes("Pradžia."));
});
Deno.test("works shelf links to work spots", () => {
  const don = person({ id: "donelaitis" });
  const p = pack({ spots: [don, work({ id: "metai", by: "donelaitis", at: 1765 }), work({ id: "kita", by: "kitas", at: 1 })] });
  const h = lifeStrip(don, p);
  assertMatch(h, /data-spot="metai"/);
  assert(!h.includes('data-spot="kita"'));
  assertEquals(worksOf(p, "donelaitis").map((s) => s.id), ["metai"]);
});
Deno.test("worksOf orders by at", () => {
  const p = pack({ spots: [work({ id: "b", by: "p", at: 5 }), work({ id: "a", by: "p", at: 9 }), work({ id: "c", by: "p", at: 1 })] });
  assertEquals(worksOf(p, "p").map((s) => s.id), ["c", "b", "a"]);
});
Deno.test("work with a plot shows the explainer, without one it does not", () => {
  assert(spotPanel(work({ plot: mkPlot() }), pack()).includes("data-char"));
  assert(!spotPanel(work(), pack()).includes("data-char"));
});
Deno.test("room panel reveals answers only when revealed", () => {
  const room = pack().rooms[0];
  const hidden = roomPanel(room, pack(), new Set());
  assertMatch(hidden, /data-reveal="1:0"/);
  assert(hidden.includes("Klausimas?") && !hidden.includes("Atsakymas"));
  assert(roomPanel(room, pack(), new Set(["1:0"])).includes("Atsakymas"));
});
Deno.test("room panel lists the room's spots", () => {
  const p = pack({ spots: [bare("person", { id: "s1", room: 1 }), bare("person", { id: "s2", room: 2 })] });
  const h = roomPanel(p.rooms[0], p, new Set());
  assert(h.includes('data-spot="s1"') && !h.includes('data-spot="s2"'));
});
Deno.test("text view keeps layout order of rooms", () => {
  const h = textView(pack());
  assert(h.indexOf("Mažoji Lietuva") < h.indexOf("Žemaičiai"));
  assert(h.indexOf("Žemaičiai") < h.indexOf("Be laiko"));
  assertMatch(h, /<details>[\s\S]*Kodėl\?[\s\S]*Todėl\./);
  assert(h.includes("Įvadas."));
});
Deno.test("text view orders spots by at then id, no-at last", () => {
  const sp = (id, at) => bare("thing", { id, room: 1, name: `N-${id}`, ...(at === undefined ? {} : { at }) });
  const p = pack({ spots: [sp("z"), sp("b", 1710), sp("a", 1710), sp("c", 1705)] });
  const h = textView(p);
  const order = ["c", "a", "b", "z"].map((id) => h.indexOf(`N-${id}`));
  assertEquals(order, [...order].sort((x, y) => x - y));
  assert(order.every((i) => i > 0));
});
Deno.test("site.css defines the theme colours", async () => {
  const css = await Deno.readTextFile(new URL("../site/lib/site.css", import.meta.url));
  const hex = (n) => typeof n === "number" ? "#" + n.toString(16).padStart(6, "0") : n;
  for (const [k, v] of Object.entries(COLORS)) assert(css.includes(`--${k}: ${hex(v)}`), k);
});
