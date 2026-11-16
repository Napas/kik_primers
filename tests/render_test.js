import { assert, assertEquals, assertMatch } from "@std/assert";
import { imgUrl, licenseHtml, lifeStrip, plotExplainer, roomPanel, spotPanel, textView, worksOf } from "../site/lib/render.js";
import { COLORS, STYLE_NAMES } from "../site/lib/theme.js";

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
  assertMatch(h, /Nuotrauka: <a [^>]*href="https:\/\/commons\.example\/p"[^>]*>Jonas<\/a>, CC0</);
});
Deno.test("photo credit links the licence name to its licence_url", () => {
  const photo = {
    file: "p.jpg", author: "Jonas", license: "CC BY-SA 4.0", source_url: "https://commons.example/p",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0",
  };
  const h = spotPanel(person({ photo }), pack());
  assertMatch(h, /<a [^>]*href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0"[^>]*>CC BY-SA 4\.0<\/a>/);
  assert(!/<a [^>]*>[^<]*<a /.test(h), "links are not nested");
});
Deno.test("licenseHtml links only http(s) licence urls and escapes the name", () => {
  assertEquals(licenseHtml({ license: "CC0" }), "CC0");
  assertEquals(licenseHtml({ license: "A&B", license_url: "javascript:alert(1)" }), "A&amp;B");
  assertMatch(licenseHtml({ license: "<x>", license_url: "https://e.org/l?a=1&b=2" }), /^<a href="https:\/\/e\.org\/l\?a=1&amp;b=2" [^>]*>&lt;x&gt;<\/a>$/);
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
Deno.test("plot relations are listed under the map, not drawn on it, lit when both ends are lit", () => {
  const plot = mkPlot();
  plot.relations.push({ a: "Petras", b: "Katrė", label: "<kaimynas>" });
  const h = plotExplainer(plot, { step: 1 });
  const svg = h.match(/<svg[\s\S]*<\/svg>/)[0];
  assertEquals((svg.match(/<line /g) ?? []).length, 2, "each relation keeps its line");
  assert(!svg.includes("tėvas") && !svg.includes("kaimynas"), "no relation text on the map");
  const list = h.match(/<ul class="relations">([\s\S]*?)<\/ul>/)?.[1] ?? "";
  assertEquals(list.match(/<li[^>]*>/g), ["<li>", '<li class="on">']);
  assert(list.includes("Katrė – Jonas: tėvas"));
  assert(list.includes("Petras – Katrė: &lt;kaimynas&gt;"));
});
Deno.test("a plot without relations has no relation list", () => {
  const plot = mkPlot();
  plot.relations = [];
  assert(!plotExplainer(plot).includes("relations"));
  delete plot.relations;
  assert(!plotExplainer(plot).includes("relations"), "relations may be left out");
});
Deno.test("plot lists each character with their role, escaped", () => {
  const plot = mkPlot();
  plot.characters[0].role = "<dukra>";
  const list = plotExplainer(plot).match(/<ul class="roles">([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const t of ["<b>Katrė</b> – &lt;dukra&gt;", "<b>Jonas</b> – tėvas", "<b>Petras</b> – kaimynas"]) assert(list.includes(t), t);
});
Deno.test("text view lists every plot beat and links works by anchor, with no step or spot buttons", () => {
  const p = pack({ spots: [person({ id: "donelaitis", at: 1750 }), work({ id: "metai", by: "donelaitis", at: 1765, plot: mkPlot() })] });
  const h = textView(p);
  const beats = h.match(/<ol class="beats">([\s\S]*?)<\/ol>/)?.[1] ?? "";
  for (const t of ["Pradžia.", "Vidurys.", "Pabaiga.", "Epilogas."]) assert(beats.includes(t), t);
  assert(!h.includes("data-step") && !h.includes("<button"), "no controls that only the 3D page wires");
  assertMatch(h, /<a class="spine" href="#spot-metai">/);
  assertMatch(h, /id="spot-metai"/);
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
Deno.test("room panel shows why questions, answers only when revealed", () => {
  const room = pack().rooms[1];
  const hidden = roomPanel(room, pack(), new Set());
  assertMatch(hidden, /data-reveal="2:0"/);
  assert(hidden.includes("Kodėl?") && !hidden.includes("Todėl."));
  assert(!hidden.includes("Klausimas?"));
  const shown = roomPanel(room, pack(), new Set(["2:0"]));
  assert(shown.includes("Todėl.") && !shown.includes("data-reveal"));
});
Deno.test("life event label has its own element", () => {
  const h = lifeStrip(person({ life: [{ year: 1700, label: "Gimė" }, { year: 1750, label: "Mirė" }] }), pack());
  assertMatch(h, /<span class="lbl">Gimė<\/span>/);
  assertMatch(h, /<span class="lbl">Mirė<\/span>/);
});
Deno.test("life strip: dots on the track by year, the events' text in a list below it", () => {
  const life = [{ year: 1700, label: "Gimė", place: "Vilnius" }, { year: 1798, label: "Išvyko" }, { year: 1800, label: "<b>Mirė</b>" }];
  const h = lifeStrip(person({ life }), pack());
  assertMatch(h, /<ol class="track" aria-hidden="true">/);
  const dots = [...h.matchAll(/<li class="event" style="left:([^"]+)" title="([^"]*)"><\/li>/g)].map((m) => [m[1], m[2]]);
  assertEquals(dots, [["0%", "1700: Gimė"], ["98%", "1798: Išvyko"], ["100%", "1800: &lt;b&gt;Mirė&lt;/b&gt;"]]);
  assertMatch(h, /<ol class="events"><li><b>1700<\/b> <span class="lbl">Gimė<\/span> <i>Vilnius<\/i><\/li><li><b>1798<\/b> <span class="lbl">Išvyko<\/span><\/li>/);
  assert(!h.includes("<b>Mirė</b>"), "labels are escaped");
});
Deno.test("life strip carries the room's style class", () => {
  const h = lifeStrip(person({ room: 2, life: [{ year: 1, label: "A" }] }), pack());
  assertMatch(h, /class="life style-print-shop"/);
});
Deno.test("site.css has an accent for every style", async () => {
  const css = await Deno.readTextFile(new URL("../site/lib/site.css", import.meta.url));
  for (const n of STYLE_NAMES) assert(css.includes(`.style-${n}`), n);
});
Deno.test("room panel links a test of that room when it has questions", () => {
  const p = pack();
  assertMatch(roomPanel(p.rooms[0], p, new Set()), /<a href="test\.html\?topic=mini&amp;room=1">Testas šiai salei<\/a>/);
  assert(!roomPanel(p.rooms[1], p, new Set()).includes("test.html"), "room 2 has no questions");
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

Deno.test("imgUrl: pack-relative path, segments encoded, slashes kept", () => {
  assertEquals(imgUrl({ slug: "mini" }, "img/a b.jpg"), "topics/mini/img/a%20b.jpg");
  assertEquals(imgUrl({ slug: "mini" }, "img/works/x.png"), "topics/mini/img/works/x.png");
});

Deno.test("imgUrl: rejects traversal, absolute paths and schemes", () => {
  for (const f of ["../x.jpg", "img/../../x.jpg", "/x.jpg", "https://e.com/x.jpg", "javascript:alert(1)", "", undefined]) {
    assertEquals(imgUrl({ slug: "mini" }, f), "", String(f));
  }
});
