// Usage: deno run -A tools/build-index.ts <site-dir>
// Writes <site-dir>/topics/index.json from every <site-dir>/topics/*/topic.json.
const dir = Deno.args[0];
if (!dir) {
  console.error("usage: build-index.ts <site-dir>");
  Deno.exit(2);
}
const topics = `${dir.replace(/\/+$/, "")}/topics`;
const entries = [];
try {
  for await (const e of Deno.readDir(topics)) {
    if (!e.isDirectory) continue;
    const pack = JSON.parse(await Deno.readTextFile(`${topics}/${e.name}/topic.json`));
    entries.push({
      slug: pack.slug,
      title: pack.title,
      layout: pack.layout,
      rooms: pack.rooms.length,
      spots: pack.spots.length,
      questions: pack.questions.length,
    });
  }
} catch (err) {
  console.error(`cannot read ${topics}: ${err instanceof Error ? err.message : err}`);
  Deno.exit(1);
}
entries.sort((a, b) => a.slug.localeCompare(b.slug));
await Deno.writeTextFile(`${topics}/index.json`, JSON.stringify({ topics: entries }, null, 2) + "\n");
console.log(`${entries.length} topic(s)`);
