import { assertEquals } from "@std/assert";
import { HttpError, importPhotos } from "../tools/import-photos.ts";

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
  assertEquals(log.some((l) => l.startsWith("b: drop,")), true);
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

Deno.test("dry-run reports drop reason and summary", async () => {
  const { kit, topic } = await setup();
  const log = [];
  await importPhotos(kit, topic, { dryRun: true, deps: deps(log) });
  assertEquals(log.includes("b: would drop, no author, licence CC BY-SA 3.0"), true);
  assertEquals(log.at(-1), "would set 1, would drop 1, no portrait 1");
});

Deno.test("a failing request does not stop the run", async () => {
  const { kit, topic } = await setup();
  const log = [];
  const d = deps(log);
  const ok = d.fetchJson;
  d.fetchJson = (url) =>
    new URL(url).searchParams.get("titles") === "File:B.jpg"
      ? Promise.reject(new Error("503"))
      : ok(url);
  await importPhotos(kit, topic, { deps: d });
  const pack = JSON.parse(await Deno.readTextFile(`${topic}/topic.json`));
  assertEquals(pack.spots[0].photo.file, "img/a.jpg");
  assertEquals(log.includes("b: error 503"), true);
  assertEquals(log.at(-1), "set 1, dropped 1, no portrait 1");
});

// A fetch that answers `statuses` in turn (with optional Retry-After), then the normal body.
function flaky(statuses, retryAfter = null) {
  const ok = deps([]).fetchJson;
  let i = 0;
  return (url) =>
    i < statuses.length ? Promise.reject(new HttpError(statuses[i++], url, retryAfter)) : ok(url);
}

async function runWith(fetchJson) {
  const { kit, topic } = await setup();
  const log = [];
  const sleeps = [];
  const d = { fetchJson, sleep: (ms) => (sleeps.push(ms), Promise.resolve()), log: (l) => log.push(l) };
  await importPhotos(kit, topic, { deps: d });
  return { log, sleeps, pack: JSON.parse(await Deno.readTextFile(`${topic}/topic.json`)) };
}

Deno.test("429 twice then 200 sets the photo after 5 s and 10 s backoff", async () => {
  const { log, sleeps, pack } = await runWith(flaky([429, 429]));
  assertEquals(pack.spots[0].photo.file, "img/a.jpg");
  assertEquals(sleeps.slice(0, 2), [5000, 10000]);
  assertEquals(log.some((l) => l.startsWith("a: error")), false);
});

Deno.test("503 is retried like 429", async () => {
  const { sleeps, pack } = await runWith(flaky([503]));
  assertEquals(pack.spots[0].photo.file, "img/a.jpg");
  assertEquals(sleeps[0], 5000);
});

Deno.test("Retry-After in seconds is honoured", async () => {
  const { sleeps } = await runWith(flaky([429], "7"));
  assertEquals(sleeps[0], 7000);
});

Deno.test("six 429s drop the photo with 'request failed (429)'", async () => {
  const { log, sleeps, pack } = await runWith(flaky([429, 429, 429, 429, 429, 429]));
  assertEquals(sleeps.slice(0, 5), [5000, 10000, 20000, 40000, 80000]);
  assertEquals(log.includes("a: error request failed (429)"), true);
  assertEquals(pack.spots[0].photo, { file: "old" }); // a failed request leaves the pack as it was
  assertEquals(log.at(-1), "set 0, dropped 2, no portrait 1");
});
