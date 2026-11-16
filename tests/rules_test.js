import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { boldSpans, checkCoverage, checkPack, packText, scanSite } from "../tools/rules.js";

const mini = () => JSON.parse(Deno.readTextFileSync(new URL("./fixtures/mini/topic.json", import.meta.url)));
const edit = (f) => {
  const p = mini();
  f(p);
  return p;
};
const withDupSpot = () => edit((p) => p.spots.push({ ...p.spots[2] }));
const withAt = (at) => edit((p) => (p.spots[0].at = at));
const withLink = (to) => edit((p) => (p.spots[0].links = [{ to, label: "x" }]));
const withStyle = (style) => edit((p) => (p.rooms[0].style = style));
const withBeats = (n) => edit((p) => (p.spots[1].plot.beats = p.spots[1].plot.beats.slice(0, n)));
const withPhoto = (o) => edit((p) => Object.assign(p.spots[0].photo, o));
const packWithText = (t) => edit((p) => (p.spots[2].text = t));
const withSkipped = (span) => edit((p) => p.skipped.push({ span, reason: "ne tema" }));
const problems = (p) => checkPack(p).join("\n");

// The show's name, built in the test so no source file spells it out.
const SHOW = ["Kas", "ir", "kodėl"];

Deno.test("mini pack is valid", () => assertEquals(checkPack(mini()), []));
Deno.test("styles fixture pack is valid", () =>
  assertEquals(checkPack(JSON.parse(Deno.readTextFileSync(new URL("./fixtures/styles/topic.json", import.meta.url)))), []));
Deno.test("duplicate spot id", () => assertMatch(problems(withDupSpot()), /duplicate spot id/));
Deno.test("at outside room span", () => assertMatch(problems(withAt(1650)), /at 1650 outside room 1/));
Deno.test("link to unknown spot", () => assertMatch(problems(withLink("nope")), /unknown spot nope/));
Deno.test("link to itself", () => assertMatch(problems(withLink("jonas-rastas")), /itself/));
Deno.test("unknown style", () => assertMatch(problems(withStyle("castle")), /style castle/));
Deno.test("plot with 3 beats", () => assertMatch(problems(withBeats(3)), /4–8 beats/));
Deno.test("photo without licence", () => assertMatch(problems(withPhoto({ license: "" })), /photo/));
Deno.test("unknown author needs public domain", () => {
  assertMatch(problems(withPhoto({ author: "nežinomas" })), /nežinomas/);
  assertEquals(checkPack(withPhoto({ author: "nežinomas", license: "Public domain" })), []);
});
Deno.test("unknown-author placeholders need public domain like nežinomas", () => {
  for (const author of ["Unknown author", "Anonymous", "н.", "ltwiki"]) {
    assertMatch(problems(withPhoto({ author, license: "CC BY-SA 4.0" })), /nežinomas/, author);
    assertEquals(checkPack(withPhoto({ author, license: "CC0" })), [], author);
  }
});
Deno.test("beat naming an unknown character", () =>
  assertMatch(problems(edit((p) => (p.spots[1].plot.beats[0].characters = ["Vėjas"]))), /unknown character Vėjas/));
Deno.test("unknown motif", () => assertMatch(problems(edit((p) => (p.spots[0].motif = "nope"))), /motif nope/));
Deno.test("life years must ascend", () =>
  assertMatch(problems(edit((p) => p.spots[0].life.reverse())), /ascend/));
Deno.test("room without span needs no at", () =>
  assertEquals(checkPack(edit((p) => {
    p.rooms[1].span = null;
    delete p.spots[2].at;
  })), []));
Deno.test("by must be a person", () =>
  assertMatch(problems(edit((p) => (p.spots[1].by = "didysis-sukilimas"))), /not a person/));
Deno.test("question with unknown room", () =>
  assertMatch(problems(edit((p) => (p.questions[0].room = 9))), /room 9 does not exist/));

Deno.test("coverage finds missing bold span", () =>
  assertEquals(checkCoverage(mini(), "## 1. A\n**Nėra tokio**"), ["not in pack: Nėra tokio"]));
Deno.test("coverage folds case and diacritics", () =>
  assertEquals(checkCoverage(packWithText("Žemaitė"), "**ZEMAITE**"), []));
Deno.test("skipped span passes coverage", () => assertEquals(checkCoverage(withSkipped("X"), "**X**"), []));
const FORBIDDEN_SPAN = "**Kodėl laidoje klausiama apie X**";
const withMaskedSkip = (span) => edit((p) => p.skipped.push({ span, reason: "r" }));
Deno.test("forbidden-term span passes via a masked skip entry", () =>
  assertEquals(checkCoverage(withMaskedSkip("Kodėl … klausiama apie X"), FORBIDDEN_SPAN), []));
Deno.test("forbidden-term span without a masked skip is reported", () =>
  assertEquals(checkCoverage(mini(), FORBIDDEN_SPAN), ["not in pack: Kodėl laidoje klausiama apie X"]));
Deno.test("forbidden-term span passes via a masked private skip entry", () =>
  assertEquals(checkCoverage(mini(), FORBIDDEN_SPAN, [{ span: "Kodėl … klausiama apie X", reason: "r" }]), []));
Deno.test("a private skip entry covers a plain span", () =>
  assertEquals(checkCoverage(mini(), "**Nėra tokio**", [{ span: "Nėra tokio", reason: "r" }]), []));
Deno.test("an unmasked skip entry does not cover a forbidden-term span", () =>
  assertEquals(checkCoverage(withMaskedSkip("Kodėl laidoje klausiama apie X"), FORBIDDEN_SPAN), ["not in pack: Kodėl laidoje klausiama apie X"]));
Deno.test("mini primer is fully covered", () =>
  assertEquals(checkCoverage(mini(), Deno.readTextFileSync(new URL("./fixtures/mini/primer.md", import.meta.url))), []));
Deno.test("boldSpans strips trailing punctuation", () =>
  assertEquals(boldSpans("**A.** x **B, ** **C?**"), ["A", "B", "C"]));
Deno.test("packText folds every string", () => assertMatch(packText(mini()), /jonas rasytojas/));

Deno.test("scan flags each forbidden term", () => {
  for (const t of ["kik", "Kikas", "laidoje", "LAIDOS", "LRT", "lrt", "missed", "1234567890:12.34"]) {
    assertNotEquals(scanSite([{ path: "a.html", text: `x ${t} y` }]), [], t);
  }
  assertNotEquals(scanSite([{ path: "kik.png", text: "" }]), []);
});
Deno.test("scan passes ordinary words", () =>
  assertEquals(scanSite([{ path: "a.html", text: "palaidotas perlaidoti leidimai dismissed" }]), []));
Deno.test("scan flags the show's name in three spellings", () => {
  for (const t of [SHOW.join(" "), SHOW.join(" ").normalize("NFD").replace(/[̀-ͯ]/g, ""), SHOW.join("  ").toUpperCase()]) {
    assertNotEquals(scanSite([{ path: "a.html", text: `x ${t} y` }]), [], t);
  }
});

Deno.test("scan treats - and _ as separators", () => {
  const hit = (path, text = "") => assertNotEquals(scanSite([{ path, text }]), [], path + text);
  hit(SHOW.join("-").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + ".png");
  hit(SHOW.join("_") + ".png");
  hit("laidos_1.png");
  hit("a.html", "x_lrt_y");
  hit("a.html", "x_missed_y");
  hit("a.html", "x_1234567890:12.34_y");
  assertEquals(scanSite([{ path: "palaidotas_perlaidoti.png", text: "dismissed_lrtx" }]), []);
});
Deno.test("places approx must be a boolean", () => {
  assertEquals(checkPack(edit((p) => (p.spots[0].places[0].approx = true))), []);
  assertMatch(problems(edit((p) => (p.spots[0].places[0].approx = "taip"))), /approx/);
});
