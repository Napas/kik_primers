// Headless Chrome smoke tests. Run only with PRIMER_CHROME=1 (needs Chrome and a local port).
import { assert, assertEquals } from "@std/assert";

const root = new URL("../", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ignore = !Deno.env.get("PRIMER_CHROME");
const MINI = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/mini/topic.json`));
const STYLED = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/styles/topic.json`));

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
};

async function copyDir(from, to, skip = new Set()) {
  await Deno.mkdir(to, { recursive: true });
  for await (const e of Deno.readDir(from)) {
    if (skip.has(e.name)) continue;
    if (e.isDirectory) await copyDir(`${from}/${e.name}`, `${to}/${e.name}`);
    else if (e.isFile) await Deno.copyFile(`${from}/${e.name}`, `${to}/${e.name}`);
  }
}

function serveDir(dir) {
  return Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.includes("..")) return new Response("bad path", { status: 400 });
    const file = path.endsWith("/") ? `${path}index.html` : path;
    try {
      const body = await Deno.readFile(`${dir}${file}`);
      const type = TYPES[file.split(".").pop()] ?? "application/octet-stream";
      return new Response(body, { headers: { "content-type": type } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

/** Copies site/ (without its topics) to a temp dir with `packs` as topics/<slug>/topic.json and an index listing them, serves it, runs fn(baseUrl). */
export async function withSite(packs, fn) {
  const dir = await Deno.makeTempDir();
  await copyDir(`${root}site`, dir, new Set(["topics"]));
  const topics = [];
  for (const p of packs) {
    await Deno.mkdir(`${dir}/topics/${p.slug}`, { recursive: true });
    await Deno.writeTextFile(`${dir}/topics/${p.slug}/topic.json`, JSON.stringify(p));
    topics.push({ slug: p.slug, title: p.title, spots: p.spots.length });
  }
  await Deno.writeTextFile(`${dir}/topics/index.json`, JSON.stringify({ topics }));
  const server = serveDir(dir);
  try {
    await fn(`http://127.0.0.1:${server.addr.port}/`);
  } finally {
    await server.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
}

/** Chrome's DOM of `url` after the virtual time budget, in a fresh profile. */
export async function dumpDom(url, { w = 1280, h = 800 } = {}) {
  const profile = await Deno.makeTempDir();
  try {
    const out = await new Deno.Command(CHROME, {
      args: [
        "--headless=new",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--virtual-time-budget=8000",
        `--window-size=${w},${h}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--dump-dom",
        url,
      ],
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(60_000),
    }).output();
    return new TextDecoder().decode(out.stdout);
  } finally {
    await Deno.remove(profile, { recursive: true });
  }
}

const attrsOf = (tag = "") => Object.fromEntries([...tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? ""]));

/** Attributes of the opening <html> tag. */
export const htmlAttrs = (dom) => attrsOf(dom.match(/<html\b[^>]*>/i)?.[0]);

/** Attributes of the element with `id`, or null when there is none. */
export function elementAttrs(dom, id) {
  const tag = dom.match(new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`, "i"))?.[0];
  return tag ? attrsOf(tag) : null;
}

Deno.test({
  name: "pages reach their ready state in headless Chrome",
  ignore,
  fn: async (t) => {
    // A listed pack without rooms passes the topic check, then fails while the world is built.
    const BROKEN = { slug: "broken", title: "Sugadinta", spots: [] };
    await withSite([MINI, STYLED, BROKEN], async (base) => {
      const page = async (path, size) => htmlAttrs(await dumpDom(base + path, size));

      await t.step("world renders both rooms and all spots", async () => {
        const a = await page("world.html?topic=mini-test");
        assertEquals(a["data-error"], undefined);
        assertEquals([a["data-ready"], a["data-rooms"], a["data-spots"]], ["world", "2", "3"]);
      });
      await t.step("world renders a pack that uses all nine room styles", async () => {
        const a = await page("world.html?topic=styles-test");
        assertEquals(a["data-error"], undefined);
        assertEquals([a["data-ready"], a["data-rooms"], a["data-spots"]], ["world", "9", "9"]);
      });
      await t.step("world on a phone-sized window", async () => {
        const a = await page("world.html?topic=mini-test", { w: 390, h: 844 });
        assertEquals(a["data-error"], undefined);
        assertEquals(a["data-ready"], "world");
      });
      await t.step("text view", async () => {
        const a = await page("world.html?topic=mini-test&view=text");
        assertEquals(a["data-error"], undefined);
        assertEquals(a["data-ready"], "text");
      });
      await t.step("test page", async () => {
        const a = await page("test.html?topic=mini-test");
        assertEquals(a["data-error"], undefined);
        assertEquals(a["data-ready"], "test");
      });
      await t.step("index page", async () => {
        const a = await page("index.html");
        assertEquals(a["data-error"], undefined);
        assertEquals(a["data-ready"], "index");
      });
      await t.step("a failure while building the world leaves the error visible", async () => {
        const dom = await dumpDom(`${base}world.html?topic=broken`);
        assert(htmlAttrs(dom)["data-error"], "no data-error");
        assertEquals(htmlAttrs(dom)["data-ready"], undefined);
        assert("hidden" in elementAttrs(dom, "world"), "the 3D layer covers the error");
        assert(!/<canvas/i.test(dom), "the canvas stays in the page");
      });
      for (const p of ["world", "test"]) {
        await t.step(`${p} with an unknown topic shows an error`, async () => {
          const a = await page(`${p}.html?topic=nope`);
          assert(a["data-error"], `no data-error on ${p}`);
          assertEquals(a["data-ready"], undefined);
        });
      }
    });
  },
});
