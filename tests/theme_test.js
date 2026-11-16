import { assert, assertEquals } from "@std/assert";
import { COLORS, cssColor, LIGHT_BANDS, lightFor, SCENE, spotlightLevel, STYLE_NAMES } from "../site/lib/theme.js";
import { MOTIFS, motifSvg } from "../site/lib/motifs.js";
import { BASEMAP, project } from "../site/lib/basemap.js";
import { STYLE_KEYS } from "../site/lib/scene/styles.js";

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
  assert(SCENE.eye > 1 && SCENE.fog.near < SCENE.fog.far);
});

Deno.test("cssColor writes a colour number as a 6-digit CSS hex", () => {
  assertEquals(cssColor(0xd9b25f), "#d9b25f");
  assertEquals(cssColor(0x0000ff), "#0000ff");
});

Deno.test("styles.js builds exactly the theme's style names", () => {
  assertEquals(STYLE_KEYS, STYLE_NAMES);
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

Deno.test("basemap has the fixed box and stays inside it", () => {
  assertEquals(BASEMAP.width, 550);
  assertEquals(BASEMAP.height, 360);
  assertEquals(BASEMAP.box, { lonMin: -10, lonMax: 45, latMin: 35, latMax: 71 });
  // Path is M<x> <y>l<dx> <dy>...z per ring; accumulate the relative deltas.
  const eps = 0.5; // rounding drift
  let count = 0;
  for (const ring of BASEMAP.path.split("z").filter(Boolean)) {
    const [m, rel] = ring.slice(1).split("l");
    const nums = (s) => s.match(/-?\d+(\.\d+)?/g).map(Number);
    let [x, y] = nums(m);
    const d = nums(rel);
    for (let i = -2; i < d.length; i += 2) {
      if (i >= 0) { x += d[i]; y += d[i + 1]; }
      assert(x >= -eps && x <= BASEMAP.width + eps && y >= -eps && y <= BASEMAP.height + eps, `${x},${y}`);
      count++;
    }
  }
  assert(count > 500);
});

Deno.test("spotlightLevel: full spot cones in dim bands, fainter as the band gets brighter", () => {
  const levels = LIGHT_BANDS.map(spotlightLevel);
  assertEquals(levels.slice(0, 2), [1, 1], "candle and lantern rooms keep full cones");
  for (let i = 1; i < levels.length; i++) assert(levels[i] <= levels[i - 1], `band ${i} is no stronger than band ${i - 1}`);
  assert(spotlightLevel(lightFor(1960)) <= 0.5, "fluorescent rooms at most half");
  assert(levels.every((l) => l > 0));
});

Deno.test("the camera sees a little past the fog, no farther", () => {
  assert(SCENE.far > SCENE.fog.far && SCENE.far <= SCENE.fog.far + 15, String(SCENE.far));
});
