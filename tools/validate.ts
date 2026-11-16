// Usage: deno run -A tools/validate.ts site [--primer <slug>=<path>]...
// With --primer, skip entries for <slug> also come from the private <site>/../coverage/<slug>.json
// ({"skipped": [{span, reason}]}), if it exists; it holds the masked spans that may not be public.
import { checkCoverage, checkPack, checkSkipped, scanSite } from "./rules.js";

const join = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|ogg|mp4|webm|pdf)$/i;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory) yield* walk(p);
    else if (e.isFile) yield p;
  }
}

const args = Deno.args;
const root = args[0];
if (!root) {
  console.error("usage: validate.ts <site-dir> [--primer <slug>=<path>]...");
  Deno.exit(2);
}
const primers = new Map<string, string>();
for (let i = 1; i < args.length; i++) {
  if (args[i] !== "--primer" || !args[i + 1]?.includes("=")) {
    console.error(`bad argument: ${args[i]}`);
    Deno.exit(2);
  }
  const [slug, ...rest] = args[++i].split("=");
  primers.set(slug, rest.join("="));
}

const problems: string[] = [];
const packs = new Map<string, unknown>();
const topics = join(root, "topics");
try {
  for await (const e of Deno.readDir(topics)) {
    if (!e.isDirectory) continue;
    const file = join(topics, e.name, "topic.json");
    try {
      const pack = JSON.parse(await Deno.readTextFile(file));
      packs.set(e.name, pack);
      for (const m of checkPack(pack)) problems.push(`${file}: ${m}`);
      if (pack?.slug !== e.name) problems.push(`${file}: slug ${pack?.slug} must equal folder name ${e.name}`);
    } catch (err) {
      problems.push(`${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
} catch (err) {
  if (!(err instanceof Deno.errors.NotFound)) throw err;
}

for (const [slug, path] of primers) {
  const pack = packs.get(slug);
  if (!pack) {
    problems.push(`--primer ${slug}: no pack at ${join(topics, slug)}`);
    continue;
  }
  const md = await Deno.readTextFile(path);
  for (const m of checkCoverage(pack, md, await privateSkips(slug))) problems.push(`${slug}: ${m}`);
}

/** Skip entries from the private coverage file for `slug`; [] when there is none. Problems go to `problems`. */
async function privateSkips(slug: string): Promise<unknown[]> {
  const file = join(root, "..", "coverage", `${slug}.json`);
  let data;
  try {
    data = JSON.parse(await Deno.readTextFile(file));
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    problems.push(`${file}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
  const found = checkSkipped(data?.skipped);
  for (const m of found) problems.push(`${file}: ${m}`);
  return found.length ? [] : data.skipped;
}

const files: { path: string; text: string }[] = [];
for await (const p of walk(root)) {
  const path = p.slice(root.replace(/\/+$/, "").length + 1);
  let text = "";
  if (!BINARY.test(p)) {
    try {
      text = await Deno.readTextFile(p);
    } catch (err) {
      problems.push(`${path}: cannot read: ${err instanceof Error ? err.message : err}`);
    }
  }
  files.push({ path, text });
}
problems.push(...scanSite(files));

for (const m of problems) console.error(m);
console.log(problems.length ? `${problems.length} problem(s)` : "ok");
Deno.exit(problems.length ? 1 : 0);
