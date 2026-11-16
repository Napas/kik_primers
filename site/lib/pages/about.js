// About page: photo credits from every pack and the Three.js licence.
import { esc, isHttp } from "../text.js";
import { licenseHtml } from "../render.js";
import { loadIndex, loadPack, markReady, run } from "./common.js";

const AI_NOTE = "Turinys parengtas padedant dirbtiniam intelektui; jame gali būti klaidų.";

/** Credit rows for every spot with a photo. */
function creditsOf(pack) {
  return pack.spots.filter((s) => s.photo).map((s) => ({ name: s.name, ...s.photo }));
}

function creditItem(c) {
  const src = isHttp(c.source_url) ? `<a href="${esc(c.source_url)}" rel="noopener">šaltinis</a>` : "";
  return `<li>${esc(c.name)}: ${esc(c.author)}, ${licenseHtml(c)} ${src}</li>`;
}

/**
 * The page body from Promise.allSettled results: `packs` (one per topic, in order) and the Three.js `licence`
 * text. Lists what loaded and names what did not. Returns {html, credits: number of credit rows}.
 */
export function aboutHtml(topics, packs, licence) {
  const credits = packs.flatMap((r) => (r.status === "fulfilled" ? creditsOf(r.value) : []));
  const failed = topics.filter((_, i) => packs[i]?.status !== "fulfilled").map((t) => t.title);
  const html = `
    <p>${esc(AI_NOTE)}</p>
    <h2>Nuotraukos</h2>
    ${failed.length ? `<p class="error">Nepavyko įkelti temų: ${esc(failed.join(", "))}.</p>` : ""}
    <ul class="credits">${credits.map(creditItem).join("")}</ul>
    <h2>Three.js</h2>
    ${licence.status === "fulfilled" ? `<pre class="licence">${esc(licence.value)}</pre>` : '<p class="error">Three.js licencijos įkelti nepavyko.</p>'}`;
  return { html, credits: credits.length };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

async function main() {
  const { topics } = await loadIndex();
  const [licence, ...packs] = await Promise.allSettled([fetchText("lib/three/LICENSE"), ...topics.map((t) => loadPack(t.slug))]);
  for (const r of [licence, ...packs]) if (r.status === "rejected") console.error(r.reason);
  const { html, credits } = aboutHtml(topics, packs, licence);
  document.getElementById("app").innerHTML = html;
  markReady("about", { credits });
}

if (globalThis.document) run(main);
