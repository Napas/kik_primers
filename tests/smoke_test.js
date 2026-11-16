// Headless Chrome smoke tests. Run only with PRIMER_CHROME=1 (needs Chrome and a local port).
import { assert, assertEquals } from "@std/assert";
import { imgUrl } from "../site/lib/render.js";

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
      await t.step("a spot id in the hash opens that spot", async () => {
        const a = await page("world.html?topic=mini-test#jonas-rastas");
        assertEquals(a["data-error"], undefined);
        assertEquals([a["data-ready"], a["data-open"]], ["world", "jonas-rastas"]);
      });
      await t.step("an unknown spot id in the hash stays at the start", async () => {
        const a = await page("world.html?topic=mini-test#no-such");
        assertEquals(a["data-error"], undefined);
        assertEquals([a["data-ready"], a["data-open"]], ["world", undefined]);
      });
      await t.step("world works when storage throws on every call", async () => {
        const a = await page("world.html?topic=mini-test&nostore=1#jonas-rastas");
        assertEquals(a["data-error"], undefined);
        assertEquals([a["data-ready"], a["data-open"]], ["world", "jonas-rastas"]);
      });
      for (const [p, ready] of [["test.html?topic=mini-test&nostore=1", "test"], ["index.html?nostore=1", "index"]]) {
        await t.step(`${ready} page works when storage throws on every call`, async () => {
          const a = await page(p);
          assertEquals(a["data-error"], undefined);
          assertEquals(a["data-ready"], ready);
        });
      }
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

/** Opens `url` in headless Chrome (w×h, reduced motion) and runs fn({ev, sleep, errors}) over the DevTools protocol. */
async function withPage(url, fn, { w = 1280, h = 800 } = {}) {
  const profile = await Deno.makeTempDir();
  const chrome = new Deno.Command(CHROME, {
    args: [
      "--headless=new",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--force-prefers-reduced-motion",
      "--remote-debugging-port=0",
      `--window-size=${w},${h}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    stdout: "null",
    stderr: "null",
  }).spawn();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ws;
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      port = await Deno.readTextFile(`${profile}/DevToolsActivePort`).then((t) => t.split("\n")[0]).catch(() => null);
      if (!port) await sleep(100);
    }
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
    let seq = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      pending.get(d.id)?.(d);
      if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description);
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        pending.set(++seq, r);
        ws.send(JSON.stringify({ id: seq, method, params }));
      });
    const ev = async (expression) =>
      (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await send("Runtime.enable");
    // Headless windows have a minimum width (500 px); the override gives the exact viewport.
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 100 && (await ev("document.documentElement.dataset.ready")) === undefined; i++) await sleep(100);
    await fn({ ev, sleep, errors });
  } finally {
    ws?.close();
    chrome.kill();
    await chrome.status;
    await Deno.remove(profile, { recursive: true }).catch(() => {});
  }
}

Deno.test({
  name: "world panel: room list, Esc, reveal, panel links and close in headless Chrome",
  ignore,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await withSite([MINI], async (base) => {
      await withPage(`${base}world.html?topic=mini-test&nostore=1`, async ({ ev, sleep, errors }) => {
        const state = async () =>
          JSON.parse(
            await ev(`JSON.stringify({
              open: document.documentElement.dataset.open ?? null,
              shown: panel.classList.contains("is-open"),
              inert: panel.inert,
              room: document.querySelector("#panel-body article[data-room]")?.dataset.room ?? null,
              spot: document.querySelector("#panel-body article[data-spot]")?.dataset.spot ?? null,
              answer: document.querySelector("#panel .answer")?.textContent ?? null,
              hash: location.hash,
            })`),
          );
        const act = async (js) => {
          await ev(js);
          await sleep(400); // a few frames
          return state();
        };
        assertEquals(await ev("document.documentElement.dataset.ready"), "world");
        let s = await act(`document.querySelector('#overview button[data-room="2"]').click()`);
        assertEquals([s.shown, s.room], [true, "2"], "the room list opens a room");
        s = await act(`dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))`);
        assertEquals([s.shown, s.inert], [false, true], "Esc closes");
        await sleep(400);
        assertEquals((await state()).shown, false, "standing in the room does not reopen it");
        await act(`document.querySelector('#overview button[data-room="1"]').click()`);
        s = await act(`document.querySelector('#panel [data-reveal="1:0"]').click()`);
        assertEquals(s.answer, "Nes tai pradžia.", "reveal shows the answer");
        s = await act(`document.querySelector('#panel button[data-spot="jonas-rastas"]').click()`);
        assertEquals([s.open, s.spot], ["jonas-rastas", "jonas-rastas"], "a room's spot button opens the spot");
        await ev(`document.querySelector('#panel article').dataset.mark = "kept"`);
        await act(`document.querySelector('#panel article p').click()`);
        assertEquals(await ev(`document.querySelector('#panel article').dataset.mark`), "kept", "a click on panel text is not a spot link");
        s = await act(`document.querySelector('#panel a[data-spot="pirma-knyga"]').click()`);
        assertEquals([s.open, s.hash], ["pirma-knyga", ""], "a panel link opens its spot without following the href");
        s = await act(`document.querySelector('#panel [data-close]').click()`);
        assertEquals([s.open, s.shown, s.inert], [null, false, true], "the close button closes");
        assertEquals(errors, []);
      });
    });
  },
});

Deno.test({
  name: "the real packs in site/ render in headless Chrome",
  ignore,
  fn: async (t) => {
    const site = `${root}site`;
    const index = JSON.parse(await Deno.readTextFile(`${site}/topics/index.json`));
    const server = serveDir(site);
    const base = `http://127.0.0.1:${server.addr.port}/`;
    try {
      await t.step("index page", async () => {
        const a = htmlAttrs(await dumpDom(`${base}index.html`));
        assertEquals([a["data-error"], a["data-ready"]], [undefined, "index"]);
      });
      for (const { slug } of index.topics) {
        const pack = JSON.parse(await Deno.readTextFile(`${site}/topics/${slug}/topic.json`));
        // The 390×844 phone run is the CDP test below: headless windows are at least 500 px wide.
        await t.step(`${slug}: world at 1400×800 builds every room and spot`, async () => {
          const a = htmlAttrs(await dumpDom(`${base}world.html?topic=${slug}`, { w: 1400, h: 800 }));
          assertEquals(a["data-error"], undefined);
          assertEquals([a["data-ready"], a["data-rooms"], a["data-spots"]], ["world", `${pack.rooms.length}`, `${pack.spots.length}`]);
        });
        await t.step(`${slug}: test page`, async () => {
          const a = htmlAttrs(await dumpDom(`${base}test.html?topic=${slug}`));
          assertEquals([a["data-error"], a["data-ready"]], [undefined, "test"]);
        });
        const withPhoto = pack.spots.filter((s) => s.photo);
        await t.step(`${slug}: every photo is served at its imgUrl`, async () => {
          for (const s of withPhoto) {
            const res = await fetch(base + imgUrl(pack, s.photo.file));
            await res.body?.cancel();
            assertEquals(res.status, 200, `${s.id}: ${s.photo.file}`);
            assert(res.headers.get("content-type").startsWith("image/"), `${s.id}: not an image`);
          }
        });
        const person = withPhoto.find((s) => s.kind === "person");
        if (!person) continue;
        await t.step(`${slug}: #${person.id} opens its panel with the photo`, async () => {
          const dom = await dumpDom(`${base}world.html?topic=${slug}#${person.id}`);
          assertEquals(htmlAttrs(dom)["data-open"], person.id);
          assert(dom.includes(`src="${imgUrl(pack, person.photo.file)}"`), "no photo in the panel");
        });
      }
    } finally {
      await server.shutdown();
    }
  },
});

Deno.test({
  name: "real pack on a 390×844 phone: every room and spot built, close button stays in view, photo leaves room for text",
  ignore,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const site = `${root}site`;
    const { slug } = JSON.parse(await Deno.readTextFile(`${site}/topics/index.json`)).topics[0];
    const pack = JSON.parse(await Deno.readTextFile(`${site}/topics/${slug}/topic.json`));
    const person = pack.spots.find((s) => s.kind === "person" && s.photo);
    const server = serveDir(site);
    try {
      const url = `http://127.0.0.1:${server.addr.port}/world.html?topic=${slug}&nostore=1#${person.id}`;
      await withPage(url, async ({ ev, sleep, errors }) => {
        assertEquals(await ev("innerWidth"), 390);
        const built = JSON.parse(await ev(`JSON.stringify(document.documentElement.dataset)`));
        assertEquals(built.error, undefined);
        assertEquals([built.ready, built.rooms, built.spots], ["world", `${pack.rooms.length}`, `${pack.spots.length}`]);
        const loaded = `document.documentElement.dataset.open === "${person.id}" && panel.querySelector("figure img")?.naturalHeight > 0`;
        for (let i = 0; i < 100 && !(await ev(loaded)); i++) await sleep(100);
        assert(await ev(loaded), "the panel opens with its photo loaded");
        const r = JSON.parse(await ev(`(() => {
          panel.scrollTop = panel.scrollHeight;
          const c = panel.querySelector("[data-close]").getBoundingClientRect();
          const p = panel.getBoundingClientRect();
          const img = panel.querySelector("figure img").getBoundingClientRect();
          return JSON.stringify({ scrolled: panel.scrollTop, close: [c.top, c.bottom], panel: [p.top, p.bottom], img: img.height, h: innerHeight });
        })()`));
        assert(r.scrolled > 0, "the panel scrolls");
        assert(r.close[0] >= r.panel[0] && r.close[1] <= r.panel[1], `close button out of view: ${JSON.stringify(r)}`);
        assert(r.img <= 0.3 * r.h + 1, `photo ${r.img}px tall in a ${r.h}px view`);
        assertEquals(errors, []);
      }, { w: 390, h: 844 });
    } finally {
      await server.shutdown();
    }
  },
});
