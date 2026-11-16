// Overview of the path: a strip of rooms with a "you are here" marker, and a list of rooms to jump to,
// each with how many of its spots were opened. Pure helpers first, DOM wiring last.
import { esc } from "../text.js";
import { pathZ } from "../scene/styles.js";

const pct = (f) => `${+(Math.min(1, Math.max(0, f)) * 100).toFixed(2)}%`;
const countText = (c) => `atidaryta ${c?.opened ?? 0}/${c?.total ?? 0}`;
const extent = (layout) => ({ x0: Math.min(0, ...layout.rooms.map((r) => r.x0)), x1: layout.length });

/**
 * The room at floor point (x, z), or null: one whose x-range holds x, on the lane nearest z.
 * A lane reaches from its rooms' back (z0) to its path, so parallel lanes don't overlap.
 */
export function roomAt(layout, x, z) {
  let best = null, bestD = Infinity;
  for (const r of layout.rooms) {
    if (x < r.x0 || x > r.x1) continue;
    const d = Math.max(0, r.z0 - z, z - pathZ(r));
    if (d < bestD) [best, bestD] = [r.n, d];
  }
  return best;
}

/** Map<room n, {opened, total}>: spots per room and how many of them are in `opened`. */
export function roomCounts(pack, opened) {
  const counts = new Map(pack.rooms.map((r) => [r.n, { opened: 0, total: 0 }]));
  for (const s of pack.spots) {
    const c = counts.get(s.room);
    if (!c) continue;
    c.total++;
    if (opened.has(s.id)) c.opened++;
  }
  return counts;
}

/** Where x falls along the strip, as a CSS percentage. */
export function markerLeft(layout, x) {
  const { x0, x1 } = extent(layout);
  return pct(x1 > x0 ? (x - x0) / (x1 - x0) : 0);
}

/** The strip (one segment per room, lanes stacked) and the room list (buttons, in time order). */
export function overviewHtml(layout, rooms, counts) {
  const { x0, x1 } = extent(layout);
  const w = Math.max(x1 - x0, 1e-9);
  const lanes = Math.max(1, ...layout.rooms.map((r) => r.lane + 1));
  const title = new Map(rooms.map((r) => [r.n, r.title]));
  const ordered = [...layout.rooms].sort((a, b) => a.x0 - b.x0 || a.n - b.n);
  const segs = ordered.map((r) =>
    `<span class="seg" data-room="${esc(r.n)}" style="left:${pct((r.x0 - x0) / w)};width:${pct((r.x1 - r.x0) / w)};` +
    `top:${pct(r.lane / lanes)};height:${pct(1 / lanes)}"></span>`
  ).join("");
  const items = ordered.map((r) =>
    `<li><button type="button" data-room="${esc(r.n)}"><span class="title">${esc(title.get(r.n) ?? "")}</span> ` +
    `<span class="count" data-count="${esc(r.n)}">${countText(counts.get(r.n))}</span></button></li>`
  ).join("");
  return `<div class="strip" aria-hidden="true">${segs}<span class="you" style="left:0%"></span></div>` +
    `<details class="rooms"><summary>Salės</summary><ol>${items}</ol></details>`;
}

/**
 * Fills `dom` with the overview. opts: onJump(n) when a room is chosen; rooms: the pack's rooms (titles);
 * counts: roomCounts() at the start. Returns {mark(x, n) the visitor's x and room, setCounts(counts)}.
 */
export function overview(dom, layout, { onJump, rooms, counts = new Map() }) {
  dom.innerHTML = overviewHtml(layout, rooms, counts);
  dom.hidden = false;
  const list = dom.querySelector("details");
  dom.addEventListener("click", (e) => {
    const el = e.target.closest("[data-room]");
    if (!el) return;
    list.open = false;
    onJump(Number(el.dataset.room));
  });
  const you = dom.querySelector(".you");
  let left = null, here = null;
  return {
    mark(x, n) {
      const l = markerLeft(layout, x);
      if (l !== left) you.style.left = left = l;
      if (n === here) return;
      here = n;
      for (const b of dom.querySelectorAll("button[data-room]")) {
        if (Number(b.dataset.room) === n) b.setAttribute("aria-current", "location");
        else b.removeAttribute("aria-current");
      }
    },
    setCounts(next) {
      for (const [n, c] of next) {
        const el = dom.querySelector(`[data-count="${n}"]`);
        if (el) el.textContent = countText(c);
      }
    },
  };
}
