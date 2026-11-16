// Test page: one question at a time, then a score with links to spots to revisit.
import { makeStore } from "../storage.js";
import { makeProgress } from "../progress.js";
import { buildSession } from "../quiz.js";
import { esc } from "../text.js";
import { imgUrl } from "../render.js";
import { loadIndex, loadPack, markReady, run, showError, storageBackend, topicFromUrl } from "./common.js";

/** Copy of arr with the item at `from` moved to `to`; out-of-range moves change nothing. */
export function move(arr, from, to) {
  if (to < 0 || to >= arr.length || from < 0 || from >= arr.length) return [...arr];
  const out = [...arr];
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

/** Moves the item with `id` by `delta` places from where it currently is; unknown ids change nothing. */
export function shift(arr, id, delta) {
  const from = arr.indexOf(id);
  return from < 0 ? [...arr] : move(arr, from, from + delta);
}

export const orderRight = (given, answer) => given.join("\n") === answer.join("\n");

/** results: [{item, right}] -> {right, total, wrong: [{text, spots}]}. */
export function summarize(results) {
  const wrong = [];
  for (const { item, right } of results) {
    if (right) continue;
    if (item.type === "recall") wrong.push({ text: `${item.q} — ${item.a}`, spots: item.spot ? [item.spot] : [] });
    else if (item.type === "order") wrong.push({ text: "Eilės tvarka", spots: [...item.answer] });
    else wrong.push({ text: "", spots: [item.spot] });
  }
  return { right: results.filter((r) => r.right).length, total: results.length, wrong };
}

if (globalThis.document) run(main);

async function main() {
  const index = await loadIndex();
  const url = new URL(location.href);
  const t = topicFromUrl(url, index);
  if (t.error) return showError(t.error);
  const pack = await loadPack(t.slug);
  const roomParam = url.searchParams.get("room");
  const room = roomParam === null ? undefined : Number(roomParam);
  if (room !== undefined && !pack.rooms.some((r) => r.n === room)) return showError("Tokios salės nėra.");
  const items = buildSession(pack, { room });
  if (!items.length) return showError("Šioje temoje nėra klausimų.");

  const progress = makeProgress(makeStore(storageBackend(url)));
  const spotName = (id) => pack.spots.find((s) => s.id === id)?.name ?? id;
  const app = document.getElementById("app");
  const results = [];
  let i = 0;

  const html = (s) => {
    app.innerHTML = s;
  };
  const header = () => `<p class="muted">${i + 1}/${items.length}</p>`;
  const next = (item, right) => {
    results.push({ item, right });
    i++;
    show();
  };

  function flip(item, prompt, answer) {
    html(`${header()}<div class="card">${prompt}</div><p><button id="reveal">Rodyti atsakymą</button></p>`);
    document.getElementById("reveal").onclick = () => {
      html(`${header()}<div class="card">${prompt}<p class="answer">${answer}</p></div>
        <p><button id="yes">Žinojau</button> <button id="no">Nežinojau</button></p>`);
      const mark = (right) => {
        if (item.qid) progress.answer(t.slug, item.qid, right);
        next(item, right);
      };
      document.getElementById("yes").onclick = () => mark(true);
      document.getElementById("no").onclick = () => mark(false);
    };
  }

  function showOrder(item) {
    let order = [...item.spots];
    const by = item.by === "born" ? "gimimo metus" : "metus";
    // Dragging a grip over another row moves its row to that position.
    const dragWire = (list) => {
      for (const li of list.children) {
        const grip = li.querySelector(".grip");
        grip.onpointerdown = (e) => {
          e.preventDefault();
          grip.setPointerCapture(e.pointerId);
          grip.onpointermove = (ev) => {
            const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("li");
            if (!over || !list.contains(over) || over === li) return;
            const rows = [...list.children];
            const from = rows.indexOf(li);
            const to = rows.indexOf(over);
            order = move(order, from, to);
            list.insertBefore(li, to > from ? over.nextSibling : over);
          };
          const stop = () => {
            grip.onpointermove = null;
          };
          grip.onpointerup = stop;
          grip.onpointercancel = stop;
        };
      }
    };
    const draw = () => {
      html(`${header()}<div class="card"><p>Išdėstyk nuo seniausio pagal ${by}:</p>
        <ol class="order">${order.map((id) => `<li data-id="${esc(id)}"><span class="grip" aria-hidden="true">⠿</span> ${esc(spotName(id))}
          <button data-step="-1" aria-label="Aukštyn">↑</button><button data-step="1" aria-label="Žemyn">↓</button></li>`).join("")}</ol></div>
        <p><button id="check">Tikrinti</button></p>`);
      const list = app.querySelector("ol");
      for (const b of list.querySelectorAll("[data-step]")) {
        b.onclick = () => {
          order = shift(order, b.closest("li").dataset.id, +b.dataset.step);
          draw();
        };
      }
      dragWire(list);
      document.getElementById("check").onclick = () => next(item, orderRight(order, item.answer));
    };
    draw();
  }

  function showEra(item) {
    const roomOf = (n) => pack.rooms.find((r) => r.n === n);
    html(`${header()}<div class="card"><p>Kuriai salei priklauso: ${esc(spotName(item.spot))}?</p></div>
      <p class="choices">${item.rooms.map((n) => `<button data-room="${n}">${esc(roomOf(n)?.title ?? n)}</button>`).join(" ")}</p>`);
    for (const b of app.querySelectorAll("[data-room]")) b.onclick = () => next(item, +b.dataset.room === item.answer);
  }

  function finish() {
    const s = summarize(results);
    progress.session(t.slug, { scope: room === undefined ? "all" : String(room), right: s.right, total: s.total });
    const slug = encodeURIComponent(t.slug);
    const wrongRows = s.wrong.map((m) => {
      const links = m.spots.map((id) => `<a href="world.html?topic=${slug}#${encodeURIComponent(id)}">${esc(spotName(id))}</a>`);
      return `<li>${esc(m.text)} ${links.join(", ")}</li>`;
    });
    html(`<h2>Rezultatas: ${s.right}/${s.total}</h2>
      ${wrongRows.length ? `<h3>Klaidos</h3><ul class="wrong">${wrongRows.join("")}</ul>` : ""}
      <p><a href="test.html?topic=${slug}${room === undefined ? "" : `&room=${room}`}">Dar kartą</a> · <a href="index.html">Temų sąrašas</a></p>`);
    markReady("test-done", { right: s.right, total: s.total });
  }

  function show() {
    if (i >= items.length) return finish();
    const item = items[i];
    if (item.type === "recall") flip(item, esc(item.q), esc(item.a));
    else if (item.type === "face") {
      const spot = pack.spots.find((s) => s.id === item.spot);
      flip(item, `<img src="${esc(imgUrl(pack, spot.photo.file))}" alt="">`, esc(spot.name));
    } else if (item.type === "order") showOrder(item);
    else showEra(item);
  }

  show();
  markReady("test", { items: items.length });
}
