// About page: photo credits from every pack and the Three.js licence.
import { esc } from "../text.js";
import { licenseHtml } from "../render.js";
import { loadIndex, loadPack, markReady, run } from "./common.js";

const AI_NOTE = "Turinys parengtas padedant dirbtiniam intelektui; jame gali būti klaidų.";

/** Credit rows for every spot with a photo. */
function creditsOf(pack) {
  return pack.spots.filter((s) => s.photo).map((s) => ({ name: s.name, ...s.photo }));
}

const isHttp = (u) => /^https?:\/\//i.test(u);

function creditItem(c) {
  const src = isHttp(c.source_url) ? `<a href="${esc(c.source_url)}" rel="noopener">šaltinis</a>` : "";
  return `<li>${esc(c.name)}: ${esc(c.author)}, ${licenseHtml(c)} ${src}</li>`;
}

run(async () => {
  const { topics } = await loadIndex();
  const packs = await Promise.all(topics.map((t) => loadPack(t.slug)));
  const credits = packs.flatMap(creditsOf);
  const licence = await fetch("lib/three/LICENSE").then((r) => (r.ok ? r.text() : ""));
  document.getElementById("app").innerHTML = `
    <p>${esc(AI_NOTE)}</p>
    <h2>Nuotraukos</h2>
    <ul class="credits">${credits.map(creditItem).join("")}</ul>
    <h2>Three.js</h2>
    <pre class="licence">${esc(licence)}</pre>`;
  markReady("about", { credits: credits.length });
});
