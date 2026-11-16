import { assert, assertEquals } from "@std/assert";
import { esc, fold, isHttp, isSlug, yearsText } from "../site/lib/text.js";

Deno.test("fold strips Lithuanian diacritics and case", () =>
  assertEquals(fold("  Žemaitė  ĄČĘĖĮŠŲŪŽ "), "zemaite aceeisuuz"));
Deno.test("esc escapes markup and quotes", () =>
  assertEquals(esc(`<a href="x">&'„Metai“`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;„Metai“"));
Deno.test("esc of null is empty", () => assertEquals(esc(null), ""));
Deno.test("isSlug", () => {
  assert(isSlug("lietuviu-literatura"));
  assert(!isSlug("../x"));
  assert(!isSlug("A"));
});
Deno.test("isHttp: only http(s) URLs, any case; missing values are not", () => {
  assert(isHttp("https://commons.wikimedia.org/x") && isHttp("HTTP://e.com"));
  for (const u of ["javascript:alert(1)", "//e.com", "ftp://e.com", "", null, undefined]) assert(!isHttp(u), String(u));
});

Deno.test("yearsText: one year, a span, or an open span", () => {
  assertEquals([yearsText([1845]), yearsText([1845, 1921]), yearsText([1950, null]), yearsText([]), yearsText()], ["1845", "1845–1921", "1950–", "", ""]);
});
