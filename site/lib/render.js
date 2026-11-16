// Pure HTML-string renderers for the spot panel, room panel and text view.
// Every pack string goes through esc(). Clicks are wired by the page code via data-* attributes.
import { esc, isHttp, yearsText } from "./text.js";
import { motifSvg } from "./motifs.js";
import { BASEMAP, project } from "./basemap.js";

const byAtThenId = (a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** URL of a pack file (path relative to the topic folder); "" for anything that could leave it. */
export const imgUrl = (pack, file) => {
  const parts = typeof file === "string" ? file.split("/") : [];
  if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || p.includes(":") || p.includes("\\"))) return "";
  return `topics/${encodeURIComponent(pack.slug)}/${parts.map(encodeURIComponent).join("/")}`;
};
const safeUrl = (u) => (isHttp(u) ? u : "#");
const pct = (f) => `${+(f * 100).toFixed(2)}%`;
const extLink = (url, text) => `<a href="${esc(url)}" rel="noopener" target="_blank">${text}</a>`;

/** A photo's licence name, linked to its `license_url` when that is http(s). */
export const licenseHtml = (photo) => (isHttp(photo.license_url) ? extLink(photo.license_url, esc(photo.license)) : esc(photo.license));

/** Works by `personId`, ordered by `at`. */
export function worksOf(pack, personId) {
  return pack.spots.filter((s) => s.kind === "work" && s.by === personId).sort(byAtThenId);
}

/**
 * Characters on a circle with their roles listed below, relations as labelled lines, the current beat's
 * characters lit, and step buttons. With `all`, every beat as a list and no buttons (the text view).
 */
export function plotExplainer(plot, { step = 0, all = false } = {}) {
  const last = plot.beats.length - 1;
  const i = Math.min(Math.max(step, 0), last);
  const beat = plot.beats[i];
  const lit = new Set(all ? [] : beat.characters);
  const [cx, cy, r] = [160, 120, 90];
  const pos = new Map(plot.characters.map((c, k) => {
    const t = (2 * Math.PI * k) / plot.characters.length - Math.PI / 2;
    return [c.name, { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }];
  }));
  // Relation lines on the map; their labels go in a list under it, where they cannot cover names.
  const rels = (plot.relations ?? []).filter((l) => pos.has(l.a) && pos.has(l.b));
  const lines = rels.map((l) => {
    const a = pos.get(l.a), b = pos.get(l.b);
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }).join("");
  const relList = rels.length
    ? `<ul class="relations">` + rels.map((l) =>
      `<li${lit.has(l.a) && lit.has(l.b) ? ' class="on"' : ""}>${esc(l.a)} – ${esc(l.b)}: ${esc(l.label)}</li>`).join("") + `</ul>`
    : "";
  const nodes = plot.characters.map((c) => {
    const p = pos.get(c.name);
    return `<g data-char="${esc(c.name)}" class="node${lit.has(c.name) ? " on" : ""}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9"/>` +
      `<text x="${p.x.toFixed(1)}" y="${(p.y + 22).toFixed(1)}" text-anchor="middle">${esc(c.name)}</text></g>`;
  }).join("");
  const roles = `<ul class="roles">` + plot.characters.map((c) => `<li><b>${esc(c.name)}</b> – ${esc(c.role)}</li>`).join("") + `</ul>`;
  const sources = plot.sources.map((u, k) => extLink(safeUrl(u), `šaltinis ${k + 1}`)).join(" ");
  const beats = all
    ? `<ol class="beats">${plot.beats.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ol>`
    : `<p class="beat">${esc(beat.text)}</p>` +
      `<div class="plot-nav"><button type="button" data-step="${i - 1}"${i === 0 ? " disabled" : ""}>Atgal</button>` +
      `<span>${i + 1} / ${last + 1}</span>` +
      `<button type="button" data-step="${i + 1}"${i === last ? " disabled" : ""}>Toliau</button></div>`;
  return `<section class="plot"><h3>Siužetas</h3>` +
    `<svg class="plot-map" viewBox="0 0 320 250" role="img" aria-label="Veikėjų ryšiai">${lines}${nodes}</svg>` + roles + relList +
    beats + `<p class="sources">${sources}</p></section>`;
}

/**
 * Life events on a track, a basemap with the person's places, and a shelf of their works: buttons that the
 * world page wires, or with `text` anchors to the works' text-view sections.
 */
export function lifeStrip(spot, pack, { text = false } = {}) {
  const life = spot.life ?? [];
  const places = spot.places ?? [];
  const works = worksOf(pack, spot.id);
  if (!life.length && !places.length && !works.length) return "";
  const style = pack.rooms.find((r) => r.n === spot.room)?.style;
  let html = `<section class="life${style ? ` style-${esc(style)}` : ""}">`;
  if (spot.motif) html += `<span class="motif">${motifSvg(spot.motif, 40)}</span>`;
  if (life.length) {
    const first = life[0].year, span = life[life.length - 1].year - first;
    // Dots stand on the track by year; the text goes in a list below, so close events never collide.
    const dots = life.map((e) => {
      const f = span ? (e.year - first) / span : 0.5;
      return `<li class="event" style="left:${pct(f)}" title="${esc(e.year)}: ${esc(e.label)}"></li>`;
    }).join("");
    const events = life.map((e) =>
      `<li><b>${esc(e.year)}</b> <span class="lbl">${esc(e.label)}</span>${e.place ? ` <i>${esc(e.place)}</i>` : ""}</li>`
    ).join("");
    html += `<h3>Gyvenimas</h3><ol class="track" aria-hidden="true">${dots}</ol><ol class="events">${events}</ol>`;
  }
  if (places.length) {
    const pts = places.map((p) => ({ ...p, ...project(p.lat, p.lon) }));
    const dots = pts.filter((p) => p.inside)
      .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"><title>${esc(p.name)}</title></circle>`).join("");
    const outside = pts.filter((p) => !p.inside).map((p) => esc(p.name));
    if (dots) {
      html += `<svg class="basemap" viewBox="0 0 ${BASEMAP.width} ${BASEMAP.height}" role="img" aria-label="Žemėlapis">` +
        `<path d="${BASEMAP.path}"/>${dots}</svg>`;
    }
    if (outside.length) html += `<p class="outside">Toliau: ${outside.join(", ")}</p>`;
  }
  if (works.length) {
    html += `<h3>Kūriniai</h3><ul class="spines">` +
      works.map((w) => `<li>${text
        ? `<a class="spine" href="#spot-${esc(w.id)}">${esc(w.name)}</a>`
        : `<button type="button" class="spine" data-spot="${esc(w.id)}">${esc(w.name)}</button>`}</li>`).join("") + `</ul>`;
  }
  return html + `</section>`;
}

/** The panel for one spot. Sections without data are left out. `text`: as part of the text view. */
export function spotPanel(spot, pack, { text = false } = {}) {
  const years = yearsText(spot.years);
  let html = `<article class="panel" data-spot="${esc(spot.id)}" id="spot-${esc(spot.id)}">`;
  html += `<h2>${esc(spot.name)}</h2>`;
  if (years) html += `<p class="years">${esc(years)}</p>`;
  if (spot.aliases?.length) html += `<p class="aliases">Dar: ${spot.aliases.map(esc).join(", ")}</p>`;
  const ph = spot.photo;
  if (ph) {
    html += `<figure><img src="${esc(imgUrl(pack, ph.file))}" alt="${esc(spot.name)}" loading="lazy">` +
      `<figcaption>Nuotrauka: ${extLink(safeUrl(ph.source_url), esc(ph.author))}, ${licenseHtml(ph)}</figcaption></figure>`;
  }
  if (spot.illustration?.approved) {
    html += `<figure><img src="${esc(imgUrl(pack, spot.illustration.file))}" alt="${esc(spot.name)}" loading="lazy"></figure>`;
  }
  html += String(spot.text ?? "").split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  if (spot.kind === "person") html += lifeStrip(spot, pack, { text });
  if (spot.kind === "work" && spot.plot) html += plotExplainer(spot.plot, { all: text });
  if (spot.links?.length) {
    html += `<h3>Ryšiai</h3><ul class="links">` +
      spot.links.map((l) => `<li><a href="#spot-${esc(l.to)}" data-spot="${esc(l.to)}">${esc(l.label)}</a></li>`).join("") + `</ul>`;
  }
  return html + `</article>`;
}

/**
 * The panel for one room: intro, a link to a test of the room (when it has questions), its spots, and its
 * why questions (answers hidden until revealed).
 */
export function roomPanel(room, pack, revealed) {
  const spots = pack.spots.filter((s) => s.room === room.n).sort(byAtThenId);
  const why = room.why ?? [];
  let html = `<article class="panel room" data-room="${esc(room.n)}"><h2>${esc(room.title)}</h2><p>${esc(room.intro)}</p>`;
  if (pack.questions?.some((q) => q.room === room.n)) {
    html += `<p><a href="${esc(`test.html?topic=${encodeURIComponent(pack.slug)}&room=${room.n}`)}">Testas šiai salei</a></p>`;
  }
  if (spots.length) {
    html += `<ul class="spots">` + spots.map((s) => `<li><button type="button" data-spot="${esc(s.id)}">${esc(s.name)}</button></li>`).join("") + `</ul>`;
  }
  if (why.length) {
    html += `<h3>Kodėl?</h3><ul class="questions">` + why.map((w, i) => {
      const key = `${room.n}:${i}`;
      return `<li><p>${esc(w.q)}</p>` + (revealed.has(key)
        ? `<p class="answer">${esc(w.a)}</p>`
        : `<button type="button" data-reveal="${esc(key)}">Rodyti atsakymą</button>`) + `</li>`;
    }).join("") + `</ul>`;
  }
  return html + `</article>`;
}

/** The whole topic as plain HTML, for browsers without WebGL. */
export function textView(pack) {
  const first = (r) => r.span ? r.span[0] : Infinity;
  const rooms = [...pack.rooms].sort((a, b) => first(a) - first(b) || a.n - b.n);
  let html = `<h1>${esc(pack.title)}</h1><p>${esc(pack.intro)}</p>`;
  for (const room of rooms) {
    html += `<section class="room-text" data-room="${esc(room.n)}"><h2>${esc(room.title)}</h2><p>${esc(room.intro)}</p>`;
    for (const w of room.why ?? []) html += `<details><summary>${esc(w.q)}</summary><p>${esc(w.a)}</p></details>`;
    html += pack.spots.filter((s) => s.room === room.n).sort(byAtThenId).map((s) => spotPanel(s, pack, { text: true })).join("");
    html += `</section>`;
  }
  return html;
}
