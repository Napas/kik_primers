// Usage: deno run -A tools/shoot.ts <base-url> <slug> <out-dir> [width] [height]
// Screenshots a topic's world in headless Chrome: the start view, then one spot per room (opened through
// its #id link), to <out-dir>/<name>.png. For reviewing the look; needs a server for site/ at <base-url>.
import { headlessArgs, runChrome } from "./chrome.ts";

type Pack = { rooms: { n: number }[]; spots: { id: string; room: number; kind: string }[] };

/** The start view, then per room its first person (else its first spot); rooms without spots are skipped. */
export function shotList(pack: Pack): { name: string; hash: string }[] {
  const shots = [{ name: "start", hash: "" }];
  for (const r of pack.rooms) {
    const inRoom = pack.spots.filter((s) => s.room === r.n);
    const spot = inRoom.find((s) => s.kind === "person") ?? inRoom[0];
    if (spot) shots.push({ name: `room-${r.n}`, hash: `#${spot.id}` });
  }
  return shots;
}

async function shoot(url: string, file: string, w: number, h: number) {
  const { code, stderr } = await runChrome((profile) =>
    headlessArgs({ w, h, profile, extra: ["--virtual-time-budget=10000", "--hide-scrollbars", `--screenshot=${file}`, url] })
  );
  if (code !== 0) throw new Error(`chrome exited ${code}: ${stderr.slice(-400)}`);
}

if (import.meta.main) {
  const [base, slug, out, w = "1400", h = "840"] = Deno.args;
  if (!base || !slug || !out) {
    console.error("usage: shoot.ts <base-url> <slug> <out-dir> [width] [height]");
    Deno.exit(2);
  }
  const root = base.replace(/\/+$/, "");
  const pack = await (await fetch(`${root}/topics/${slug}/topic.json`)).json();
  await Deno.mkdir(out, { recursive: true });
  for (const { name, hash } of shotList(pack)) {
    const file = `${out}/${name}.png`;
    await shoot(`${root}/world.html?topic=${encodeURIComponent(slug)}${hash}`, file, Number(w), Number(h));
    console.log(file);
  }
}
