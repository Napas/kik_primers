import { assert, assertEquals, assertMatch } from "@std/assert";

const root = new URL("../", import.meta.url).pathname;
const validate = async (dir, ...extra) => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "tools/validate.ts", dir, ...extra],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: out.code, err: new TextDecoder().decode(out.stderr) };
};

Deno.test("validate passes on the real site/", async () => {
  const { code, err } = await validate("site");
  assertEquals(code, 0, err);
});

Deno.test("validate fails on a forbidden file name and a slug that differs from its folder", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${dir}/topics/other`, { recursive: true });
    await Deno.copyFile(`${root}tests/fixtures/mini/topic.json`, `${dir}/topics/other/topic.json`);
    await Deno.writeTextFile(`${dir}/kik.txt`, "x");
    const { code, err } = await validate(dir);
    assertEquals(code, 1);
    assertMatch(err, /slug mini-test must equal folder name other/);
    assertMatch(err, /kik\.txt: forbidden term/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate reports an unreadable file", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/a.html`, "x");
    await Deno.chmod(`${dir}/a.html`, 0o000);
    const { code, err } = await validate(dir);
    assertEquals(code, 1);
    assertMatch(err, /a\.html: cannot read/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// A primer span with a forbidden word, built from parts so this file passes the scan.
const MASKED_SPAN = `Kodėl ${"laid" + "oje"} klausiama apie X`;

Deno.test("validate --primer takes masked skips from the private coverage/<slug>.json beside the site", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${dir}/site/topics/mini-test`, { recursive: true });
    await Deno.copyFile(`${root}tests/fixtures/mini/topic.json`, `${dir}/site/topics/mini-test/topic.json`);
    const primer = Deno.readTextFileSync(`${root}tests/fixtures/mini/primer.md`) + `\n**${MASKED_SPAN}**\n`;
    await Deno.writeTextFile(`${dir}/primer.md`, primer);
    const run = () => validate(`${dir}/site`, "--primer", `mini-test=${dir}/primer.md`);
    let r = await run();
    assertEquals(r.code, 1, "no coverage file: the masked span is missing");
    assertMatch(r.err, /not in pack: Kodėl/);
    await Deno.mkdir(`${dir}/coverage`);
    await Deno.writeTextFile(`${dir}/coverage/mini-test.json`, JSON.stringify({ skipped: [{ span: "Kodėl … klausiama apie X", reason: "r" }] }));
    r = await run();
    assertEquals(r.code, 0, r.err);
    await Deno.writeTextFile(`${dir}/coverage/mini-test.json`, JSON.stringify({ skipped: [{ span: "" }] }));
    r = await run();
    assertEquals(r.code, 1);
    assertMatch(r.err, /coverage\/mini-test\.json: skipped #0: needs span and reason/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("public packs keep masked skip entries out of site/", async () => {
  for await (const e of Deno.readDir(`${root}site/topics`)) {
    if (!e.isDirectory) continue;
    const pack = JSON.parse(await Deno.readTextFile(`${root}site/topics/${e.name}/topic.json`));
    for (const k of pack.skipped) assert(!k.span.includes("…"), `${e.name}: ${k.span}`);
  }
});

Deno.test("every page's header links the about page", async () => {
  for (const page of ["index", "world", "test", "about"]) {
    const html = await Deno.readTextFile(`${root}site/${page}.html`);
    const header = html.match(/<header class="bar">([\s\S]*?)<\/header>/)?.[1] ?? "";
    assertMatch(header, /<a href="about\.html"[^>]*>Apie<\/a>/, page);
  }
});

Deno.test("a room panel's test link opens a non-empty session for every real room", async () => {
  const { roomPanel } = await import("../site/lib/render.js");
  const { buildSession } = await import("../site/lib/quiz.js");
  for await (const e of Deno.readDir(`${root}site/topics`)) {
    if (!e.isDirectory) continue;
    const pack = JSON.parse(await Deno.readTextFile(`${root}site/topics/${e.name}/topic.json`));
    for (const room of pack.rooms) {
      if (!roomPanel(room, pack, new Set()).includes("test.html")) continue;
      assert(buildSession(pack, { room: room.n }).length > 0, `${e.name} room ${room.n}`);
    }
  }
});

Deno.test("site/topics/index.json lists every pack with its slug, title, layout and counts", async () => {
  const index = JSON.parse(await Deno.readTextFile(`${root}site/topics/index.json`));
  const packs = [];
  for await (const e of Deno.readDir(`${root}site/topics`)) {
    if (e.isDirectory) packs.push(JSON.parse(await Deno.readTextFile(`${root}site/topics/${e.name}/topic.json`)));
  }
  const entry = (p) => ({
    slug: p.slug, title: p.title, layout: p.layout, rooms: p.rooms.length, spots: p.spots.length, questions: p.questions.length,
  });
  assertEquals(index.topics, packs.map(entry).sort((a, b) => a.slug.localeCompare(b.slug)));
});
