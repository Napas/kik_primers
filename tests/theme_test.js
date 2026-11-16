import { assert, assertEquals } from "@std/assert";
import { COLORS, LIGHT_BANDS, lightFor, STYLE_NAMES } from "../site/lib/theme.js";
import { MOTIFS, motifSvg } from "../site/lib/motifs.js";
import { BASEMAP, project } from "../site/lib/basemap.js";

Deno.test("lightFor picks the band by year", () => {
  assertEquals(lightFor(1547).kind, "candle");
  assertEquals(lightFor(1800).kind, "lantern");
  assertEquals(lightFor(1944).kind, "bulb");
  assertEquals(lightFor(1945).kind, "fluorescent");
  assertEquals(lightFor(1990).kind, "daylight");
});

Deno.test("theme data is complete", () => {
  assertEquals(COLORS.gold, 0xd9b25f);
  assertEquals(STYLE_NAMES.length, 9);
  assertEquals(LIGHT_BANDS.length, 5);
});

Deno.test("every motif is stroke-only SVG content", () => {
  const names = "forest seasons sea fence city church ship village book pen mountains river".split(" ");
  assertEquals(Object.keys(MOTIFS).sort(), names.sort());
  for (const [name, svg] of Object.entries(MOTIFS)) {
    assert(/<(path|circle|line)/.test(svg), name);
    assert(!/<script/i.test(svg), name);
    assert(!/fill="(?!none)/.test(svg), `${name} has a fill`);
  }
});

Deno.test("motifSvg wraps a motif at the given size", () => {
  const s = motifSvg("book", 32);
  assert(s.startsWith("<svg"));
  assert(s.includes('viewBox="0 0 64 64"') && s.includes('width="32"'));
  assert(s.includes("currentColor"));
});

Deno.test("project places Vilnius inside and New York outside", () => {
  const v = project(54.69, 25.28);
  assert(v.inside && v.x > 0 && v.x < BASEMAP.width && v.y > 0 && v.y < BASEMAP.height);
  assertEquals(project(40.71, -74.0).inside, false);
});

Deno.test("basemap path is non-trivial", () => {
  assert(BASEMAP.path.startsWith("M") && BASEMAP.path.length > 2000);
});
