import { assert, assertEquals } from "@std/assert";
import { esc, fold, isSlug } from "../site/lib/text.js";

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
