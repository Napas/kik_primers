import { assertEquals } from "@std/assert";
import { creditsFrom, dropReason, photoFor, stripHtml, infoUrl, retryDelayMs } from "../tools/commons.js";

const sample = (n) =>
  JSON.parse(Deno.readTextFileSync(new URL(`./fixtures/commons/${n}.json`, import.meta.url)));
const meta = (n) => sample(n).extmetadata;

Deno.test("CC BY-SA with HTML author link", () => {
  assertEquals(creditsFrom(meta("cc-by-sa-html-author")), {
    author: "Melancolicsphere",
    license: "CC BY-SA 3.0",
    license_url: "https://creativecommons.org/licenses/by-sa/3.0",
  });
});

Deno.test("public domain without LicenseUrl omits license_url", () => {
  assertEquals(creditsFrom(meta("pd-no-license-url")), {
    author: "Edward Mateusz Jan Römer",
    license: "Public domain",
  });
});

Deno.test("public domain without Artist is nežinomas", () => {
  assertEquals(creditsFrom(meta("pd-no-author")), { author: "nežinomas", license: "Public domain" });
});

Deno.test("CC BY-SA without Artist gives null", () => {
  assertEquals(creditsFrom(meta("cc-by-sa-no-author")), null);
});

Deno.test("no licence gives null", () => {
  assertEquals(creditsFrom({ Artist: { value: "X" } }), null);
  assertEquals(creditsFrom(undefined), null);
});

Deno.test("CC0 without Artist is nežinomas", () => {
  assertEquals(creditsFrom({ LicenseShortName: { value: "CC0" } }), {
    author: "nežinomas",
    license: "CC0",
  });
});

Deno.test("stripHtml drops hidden spans, tags and entities", () => {
  assertEquals(stripHtml(meta("pd-hidden-span-author").Artist.value), "Unknown author");
  assertEquals(stripHtml('<a href="x">A &amp; B</a>\n <b>C</b>'), "A & B C");
});

Deno.test("photoFor builds the pack photo object", () => {
  assertEquals(photoFor("mini-person", "jpg", sample("cc-by-sa-html-author")), {
    file: "img/mini-person.jpg",
    author: "Melancolicsphere",
    license: "CC BY-SA 3.0",
    license_url: "https://creativecommons.org/licenses/by-sa/3.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Steponas.JPG",
  });
  assertEquals(photoFor("x", "jpg", sample("cc-by-sa-no-author")), null);
});

Deno.test("infoUrl encodes the Commons title", () => {
  const u = new URL(infoUrl("Jonas Biliunas.jpg"));
  assertEquals(u.origin, "https://commons.wikimedia.org");
  assertEquals(u.searchParams.get("titles"), "File:Jonas Biliunas.jpg");
  assertEquals(u.searchParams.get("iiprop"), "extmetadata|url");
});

Deno.test("dropReason names why credits are unusable", () => {
  assertEquals(dropReason(null), "file not found");
  assertEquals(dropReason({ descriptionurl: "u", extmetadata: {} }), "no licence");
  assertEquals(dropReason(sample("cc-by-sa-no-author")), "no author, licence CC BY-SA 3.0");
  assertEquals(
    dropReason({ extmetadata: meta("cc-by-sa-html-author") }),
    "no source url",
  );
  assertEquals(dropReason(sample("cc-by-sa-html-author")), null);
});

Deno.test("retryDelayMs: Retry-After seconds, HTTP date, else 5 s doubling", () => {
  assertEquals(retryDelayMs("7", 0), 7000);
  const now = Date.parse("2026-11-16T10:00:00Z");
  assertEquals(retryDelayMs("Mon, 16 Nov 2026 10:00:30 GMT", 0, now), 30000);
  assertEquals(retryDelayMs("Mon, 16 Nov 2026 09:00:00 GMT", 0, now), 0);
  assertEquals([null, undefined, "junk"].map((h) => retryDelayMs(h, 2)), [20000, 20000, 20000]);
  assertEquals([0, 1, 2, 3, 4].map((n) => retryDelayMs(null, n)), [5000, 10000, 20000, 40000, 80000]);
});
