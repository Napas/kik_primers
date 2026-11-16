// Topic list page.
import { esc } from "../text.js";
import { lastScore, loadIndex, markReady, pageProgress, run, visitedCount } from "./common.js";

run(async () => {
  const { topics } = await loadIndex();
  const progress = pageProgress(new URL(location.href));
  const rows = topics.map((t) => {
    const score = lastScore(progress.sessions(t.slug));
    const q = encodeURIComponent(t.slug);
    return `<li class="topic">
      <h2>${esc(t.title)}</h2>
      <p class="muted">Aplankyta ${visitedCount(progress.opened(t.slug), t)}/${t.spots}${score ? ` · Paskutinis testas: ${esc(score)}` : ""}</p>
      <p><a href="world.html?topic=${q}">Keliauti</a> · <a href="test.html?topic=${q}">Testas</a></p>
    </li>`;
  });
  document.getElementById("app").innerHTML = `<ul class="topics">${rows.join("")}</ul>`;
  markReady("index", { topics: topics.length });
});
