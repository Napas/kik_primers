// Topic list page.
import { makeStore } from "../storage.js";
import { makeProgress } from "../progress.js";
import { esc } from "../text.js";
import { lastScore, loadIndex, markReady, run, storageBackend } from "./common.js";

run(async () => {
  const { topics } = await loadIndex();
  const progress = makeProgress(makeStore(storageBackend(new URL(location.href))));
  const rows = topics.map((t) => {
    const score = lastScore(progress.sessions(t.slug));
    const q = encodeURIComponent(t.slug);
    return `<li class="topic">
      <h2>${esc(t.title)}</h2>
      <p class="muted">Aplankyta ${progress.opened(t.slug).size}/${t.spots}${score ? ` · Paskutinis testas: ${esc(score)}` : ""}</p>
      <p><a href="world.html?topic=${q}">Keliauti</a> · <a href="test.html?topic=${q}">Testas</a></p>
    </li>`;
  });
  document.getElementById("app").innerHTML = `<ul class="topics">${rows.join("")}</ul>`;
  markReady("index", { topics: topics.length });
});
