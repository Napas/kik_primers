import { assertEquals } from "@std/assert";
import { importPhotos } from "../tools/import-photos.ts";

const info = (n) => ({
  query: { pages: { 1: { imageinfo: [JSON.parse(
    Deno.readTextFileSync(new URL(`./fixtures/commons/${n}.json`, import.meta.url)),
  )] } } },
});

async function setup() {
  const kit = await Deno.makeTempDir();
  const topic = await Deno.makeTempDir();
  await Deno.mkdir(`${kit}/people`);
  await Deno.writeTextFile(`${kit}/people/faces.json`, JSON.stringify({
    Q1: { commons: "A.jpg", file: "Q1.jpg" },
    Q2: { commons: "B.jpg", file: "Q2.jpg" },
    Q3: { commons: null, file: null },
  }));
  await Deno.writeTextFile(`${kit}/people/Q1.jpg`, "one");
  await Deno.writeTextFile(`${kit}/people/Q2.jpg`, "two");
  const pack = {
    slug: "t",
    spots: [
      { id: "a", name: "A", wikidata: "Q1", photo: { file: "old" }, text: "x" },
      { id: "b", name: "B", wikidata: "Q2", text: "x" },
      { id: "c", name: "C", wikidata: "Q3", text: "x" },
      { id: "d", name: "D", text: "x" },
    ],
  };
  await Deno.writeTextFile(`${topic}/topic.json`, JSON.stringify(pack, null, 2) + "\n");
  return { kit, topic };
}

const deps = (log) => ({
  fetchJson: (url) =>
    Promise.resolve(info(new URL(url).searchParams.get("titles") === "File:A.jpg"
      ? "cc-by-sa-html-author"
      : "cc-by-sa-no-author")),
  sleep: () => Promise.resolve(),
  log: (l) => log.push(l),
});

Deno.test("import sets credits, copies files, drops uncredited photos", async () => {
  const { kit, topic } = await setup();
  const log = [];
  await importPhotos(kit, topic, { deps: deps(log) });
  const pack = JSON.parse(await Deno.readTextFile(`${topic}/topic.json`));
  const [a, b, c, d] = pack.spots;
  assertEquals(a.photo.file, "img/a.jpg");
  assertEquals(a.photo.author, "Melancolicsphere");
  assertEquals(a.photo.source_url, "https://commons.wikimedia.org/wiki/File:Steponas.JPG");
  assertEquals(await Deno.readTextFile(`${topic}/img/a.jpg`), "one");
  assertEquals("photo" in b, false);
  assertEquals("photo" in c, false);
  assertEquals("photo" in d, false);
  assertEquals(log.some((l) => l.startsWith("b: dropped")), true);
  assertEquals(log.includes("c: no portrait"), true);
  assertEquals(Object.keys(a), ["id", "name", "wikidata", "photo", "text"]);
});

Deno.test("--dry-run writes nothing and reports", async () => {
  const { kit, topic } = await setup();
  const before = await Deno.readTextFile(`${topic}/topic.json`);
  const log = [];
  await importPhotos(kit, topic, { dryRun: true, deps: deps(log) });
  assertEquals(await Deno.readTextFile(`${topic}/topic.json`), before);
  assertEquals([...Deno.readDirSync(topic)].map((e) => e.name), ["topic.json"]);
  assertEquals(log[0], "a: would set Melancolicsphere / CC BY-SA 3.0");
});
