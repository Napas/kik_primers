// Usage: deno run -A tools/import-photos.ts [--dry-run] <kik-topic-dir> <site/topics/slug>
// Copies portraits for spots with a `wikidata` id and sets `photo` from Commons credits.
import { imageinfoOf, infoUrl, photoFor } from "./commons.js";

const USER_AGENT = "primer-world/1.0 (static site build)";
const DELAY_MS = 1000;

export type Deps = {
  fetchJson: (url: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

export const realDeps: Deps = {
  async fetchJson(url) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (line) => console.log(line),
};

// deno-lint-ignore no-explicit-any
type Json = any;

export async function importPhotos(
  kitDir: string,
  topicDir: string,
  { dryRun = false, deps = realDeps }: { dryRun?: boolean; deps?: Deps } = {},
) {
  const faces: Json = JSON.parse(await Deno.readTextFile(`${kitDir}/people/faces.json`));
  const topicPath = `${topicDir}/topic.json`;
  const pack: Json = JSON.parse(await Deno.readTextFile(topicPath));
  const verb = dryRun ? "would set" : "set";
  let requests = 0;

  for (const spot of pack.spots) {
    if (!spot.wikidata) continue;
    const face = faces[spot.wikidata];
    if (!face?.file || !face.commons) {
      deps.log(`${spot.id}: no portrait`);
      continue;
    }
    if (requests++) await deps.sleep(DELAY_MS);
    const info = imageinfoOf(await deps.fetchJson(infoUrl(face.commons)));
    const ext = face.file.split(".").pop().toLowerCase();
    const photo = photoFor(spot.id, ext, info);
    if (!photo) {
      delete spot.photo;
      deps.log(`${spot.id}: dropped, no usable credits for ${face.commons}`);
      continue;
    }
    deps.log(`${spot.id}: ${verb} ${photo.author} / ${photo.license}`);
    if (dryRun) continue;
    await Deno.mkdir(`${topicDir}/img`, { recursive: true });
    await Deno.copyFile(`${kitDir}/people/${face.file}`, `${topicDir}/${photo.file}`);
    spot.photo = photo;
  }

  if (!dryRun) await Deno.writeTextFile(topicPath, JSON.stringify(pack, null, 2) + "\n");
  return pack;
}

if (import.meta.main) {
  const args = Deno.args.filter((a) => a !== "--dry-run");
  if (args.length !== 2) {
    console.error("usage: import-photos.ts [--dry-run] <kik-topic-dir> <site/topics/slug>");
    Deno.exit(2);
  }
  await importPhotos(args[0], args[1], { dryRun: Deno.args.includes("--dry-run") });
}
