// Content-pack rules, primer coverage check and the public-site scan.
import { fold, isSlug } from "../site/lib/text.js";
import { STYLE_NAMES } from "../site/lib/theme.js";
import { MOTIFS } from "../site/lib/motifs.js";

const LAYOUTS = ["time", "map"];
const KINDS = ["person", "work", "group", "event", "place", "thing"];
const isInt = Number.isInteger;
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const inRange = (v, lo, hi) => typeof v === "number" && v >= lo && v <= hi;

function checkRoom(r, i, p) {
  const w = `room ${r?.n ?? "#" + i}`;
  if (!isObj(r)) return p.push(`room #${i}: not an object`);
  if (!isInt(r.n)) p.push(`${w}: n must be an integer`);
  for (const k of ["title", "intro"]) if (!isStr(r[k])) p.push(`${w}: ${k} missing`);
  if (!Array.isArray(r.why) || r.why.some((x) => !isObj(x) || !isStr(x.q) || !isStr(x.a))) {
    p.push(`${w}: why must be a list of {q, a}`);
  }
  const s = r.span;
  if (s !== null && !(Array.isArray(s) && s.length === 2 && s.every(isInt) && s[0] <= s[1])) {
    p.push(`${w}: span must be null or [from, to] with from <= to`);
  }
  if (!STYLE_NAMES.includes(r.style)) p.push(`${w}: style ${r.style} is not a known style`);
}

function checkPhoto(ph, w, p) {
  if (!isObj(ph) || !["file", "author", "license", "source_url"].every((k) => isStr(ph[k]))) {
    return p.push(`${w}: photo needs file, author, license, source_url`);
  }
  if (fold(ph.author) === "nezinomas" && !/public domain|^cc0/i.test(ph.license.trim())) {
    p.push(`${w}: photo author nežinomas needs a public domain or CC0 licence`);
  }
}

function checkPlot(plot, w, p) {
  if (!isObj(plot)) return p.push(`${w}: plot must be an object`);
  const chars = Array.isArray(plot.characters) ? plot.characters : [];
  if (!Array.isArray(plot.characters) || chars.some((c) => !isObj(c) || !isStr(c.name) || !isStr(c.role))) {
    p.push(`${w}: plot characters must be {name, role}`);
  }
  const names = new Set(chars.map((c) => c?.name));
  const known = (n, what) => {
    if (!names.has(n)) p.push(`${w}: plot ${what} names unknown character ${n}`);
  };
  for (const r of plot.relations ?? []) {
    if (!isObj(r) || !isStr(r.label)) p.push(`${w}: plot relation needs a label`);
    known(r?.a, "relation");
    known(r?.b, "relation");
  }
  const beats = plot.beats;
  if (!Array.isArray(beats) || beats.length < 4 || beats.length > 8) {
    p.push(`${w}: plot needs 4–8 beats`);
  }
  for (const b of Array.isArray(beats) ? beats : []) {
    if (!isObj(b) || !isStr(b.text)) p.push(`${w}: plot beat needs text`);
    for (const c of b?.characters ?? []) known(c, "beat");
  }
  if (plot.image !== undefined && !isStr(plot.image)) p.push(`${w}: plot image must be a file name`);
  if (!Array.isArray(plot.sources) || plot.sources.length < 1 || !plot.sources.every((u) => typeof u === "string" && u.startsWith("https://"))) {
    p.push(`${w}: plot needs at least one https:// source`);
  }
}

function checkPerson(s, w, p) {
  if (s.life !== undefined) {
    const ok = Array.isArray(s.life) && s.life.every((l) => isObj(l) && isInt(l.year) && isStr(l.label) && (l.place === undefined || isStr(l.place)));
    if (!ok) p.push(`${w}: life must be a list of {year, label, place?}`);
    else if (s.life.some((l, i) => i > 0 && l.year < s.life[i - 1].year)) p.push(`${w}: life years must ascend`);
  }
  if (s.places !== undefined) {
    const ok = Array.isArray(s.places) && s.places.every((x) => isObj(x) && isStr(x.name) && inRange(x.lat, -90, 90) && inRange(x.lon, -180, 180));
    if (!ok) p.push(`${w}: places must be {name, lat, lon} in range`);
    else if (s.places.some((x) => x.approx !== undefined && typeof x.approx !== "boolean")) p.push(`${w}: places approx must be a boolean`);
  }
  if (s.motif !== undefined && !Object.hasOwn(MOTIFS, s.motif)) p.push(`${w}: motif ${s.motif} is not a known motif`);
}

function checkSpot(s, i, rooms, ids, p) {
  if (!isObj(s)) return p.push(`spot #${i}: not an object`);
  const w = `spot ${s.id ?? "#" + i}`;
  if (typeof s.id !== "string" || !isSlug(s.id)) p.push(`${w}: id must be an ASCII slug`);
  const room = rooms.get(s.room);
  if (!room) p.push(`${w}: room ${s.room} does not exist`);
  if (!KINDS.includes(s.kind)) p.push(`${w}: kind ${s.kind} is not a known kind`);
  if (!isStr(s.name)) p.push(`${w}: name missing`);
  if (!isStr(s.text)) p.push(`${w}: text missing`);
  if (!Array.isArray(s.aliases) || !s.aliases.every(isStr)) p.push(`${w}: aliases must be a list of strings`);
  const y = s.years;
  const yearsOk = y === null || (Array.isArray(y) && ((y.length === 1 && isInt(y[0])) || (y.length === 2 && isInt(y[0]) && (y[1] === null || isInt(y[1])))));
  if (!yearsOk) p.push(`${w}: years must be null, [y] or [from, to|null]`);
  if (s.at !== undefined && !isInt(s.at)) p.push(`${w}: at must be an integer`);
  if (room?.span) {
    if (!isInt(s.at)) p.push(`${w}: at required because room ${room.n} has a span`);
    else if (s.at < room.span[0] || s.at > room.span[1]) p.push(`${w}: at ${s.at} outside room ${room.n} span [${room.span[0]}, ${room.span[1]}]`);
  }
  if (s.aside !== undefined && s.aside !== true) p.push(`${w}: aside must be true when present`);
  if (s.wikidata !== undefined && !/^Q\d+$/.test(s.wikidata)) p.push(`${w}: wikidata must look like Q123`);
  if (s.photo !== undefined) checkPhoto(s.photo, w, p);
  if (!Array.isArray(s.links)) p.push(`${w}: links must be a list`);
  for (const l of Array.isArray(s.links) ? s.links : []) {
    if (!isObj(l) || !isStr(l.label)) p.push(`${w}: link needs a label`);
    else if (l.to === s.id) p.push(`${w}: link to itself`);
    else if (!ids.has(l.to)) p.push(`${w}: link to unknown spot ${l.to}`);
  }
  if (s.by !== undefined) {
    if (s.kind !== "work") p.push(`${w}: by is for works only`);
    else if (ids.get(s.by)?.kind !== "person") p.push(`${w}: by ${s.by} is not a person spot`);
  }
  const only = (kind, keys) => {
    for (const k of keys) if (s[k] !== undefined && s.kind !== kind) p.push(`${w}: ${k} is for ${kind} spots only`);
  };
  only("person", ["life", "places", "motif"]);
  only("work", ["illustration", "plot"]);
  if (s.kind === "person") checkPerson(s, w, p);
  if (s.illustration !== undefined && !(isObj(s.illustration) && isStr(s.illustration.file) && typeof s.illustration.approved === "boolean")) {
    p.push(`${w}: illustration needs file and approved`);
  }
  if (s.plot !== undefined && s.kind === "work") checkPlot(s.plot, w, p);
}

/** Returns the list of problems in a pack (empty when valid). */
export function checkPack(pack) {
  const p = [];
  if (!isObj(pack)) return ["pack is not an object"];
  if (pack.version !== 1) p.push("version must be 1");
  if (typeof pack.slug !== "string" || !isSlug(pack.slug)) p.push("slug must be an ASCII slug");
  for (const k of ["title", "intro"]) if (!isStr(pack[k])) p.push(`${k} missing`);
  if (!LAYOUTS.includes(pack.layout)) p.push(`layout ${pack.layout} must be time or map`);
  for (const k of ["rooms", "spots", "questions", "skipped"]) if (!Array.isArray(pack[k])) p.push(`${k} must be a list`);
  if (p.length && ["rooms", "spots", "questions", "skipped"].some((k) => !Array.isArray(pack[k]))) return p;

  const rooms = new Map();
  pack.rooms.forEach((r, i) => {
    checkRoom(r, i, p);
    if (isObj(r) && isInt(r.n)) {
      if (rooms.has(r.n)) p.push(`duplicate room n ${r.n}`);
      rooms.set(r.n, r);
    }
  });

  const ids = new Map();
  for (const s of pack.spots) {
    if (!isObj(s) || typeof s.id !== "string") continue;
    if (ids.has(s.id)) p.push(`duplicate spot id ${s.id}`);
    ids.set(s.id, s);
  }
  pack.spots.forEach((s, i) => checkSpot(s, i, rooms, ids, p));

  const qids = new Set();
  pack.questions.forEach((q, i) => {
    const w = `question ${q?.id ?? "#" + i}`;
    if (!isObj(q)) return p.push(`${w}: not an object`);
    if (typeof q.id !== "string" || !isSlug(q.id)) p.push(`${w}: id must be a slug`);
    else if (qids.has(q.id)) p.push(`duplicate question id ${q.id}`);
    qids.add(q.id);
    for (const k of ["q", "a"]) if (!isStr(q[k])) p.push(`${w}: ${k} missing`);
    if (!rooms.has(q.room)) p.push(`${w}: room ${q.room} does not exist`);
    if (q.spot !== undefined && !ids.has(q.spot)) p.push(`${w}: unknown spot ${q.spot}`);
  });

  p.push(...checkSkipped(pack.skipped));
  return p;
}

/** Problems in a list of skip entries ({span, reason}): a pack's `skipped` or a private coverage file's. */
export function checkSkipped(list) {
  if (!Array.isArray(list)) return ["skipped must be a list"];
  return list.flatMap((s, i) => (isObj(s) && isStr(s.span) && isStr(s.reason) ? [] : [`skipped #${i}: needs span and reason`]));
}

/** Every string value in the pack, folded, joined with newlines. */
export function packText(pack) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(fold(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(pack);
  return out.join("\n");
}

/** Contents of **…** spans, trailing .,:;?! removed. */
export function boldSpans(md) {
  return [...md.matchAll(/\*\*(.+?)\*\*/gs)]
    .map((m) => m[1].trim().replace(/[.,:;?!]+$/, "").trim())
    .filter((s) => s !== "");
}

/**
 * Bold spans of the primer that are not covered. Skip entries are the pack's `skipped` plus
 * `privateSkips` (kept outside the public site). A span with a forbidden term can't be copied into
 * the pack, so it is covered only by a skip entry whose span equals it with each forbidden match
 * replaced by "…" (compared folded). Any other span is covered when it appears in the pack text or
 * in a skip entry.
 */
export function checkCoverage(pack, primerMd, privateSkips = []) {
  const skips = [...(Array.isArray(pack.skipped) ? pack.skipped : []), ...privateSkips].map((k) => fold(String(k?.span ?? "")));
  const text = [packText(pack), ...skips].join("\n");
  const masked = new Set(skips);
  return boldSpans(primerMd)
    .filter((s) => {
      const f = fold(s);
      const m = maskForbidden(f);
      return m === f ? !text.includes(f) : !masked.has(m);
    })
    .map((s) => `not in pack: ${s}`);
}

// Terms that must never appear on the public site, matched on folded text.
// The show's name is built from parts so this file can be scanned like any other.
const SHOW = ["kas", "ir", "kodel"].join("[^a-z0-9]+");
// Word edges are "not a letter or digit", so "_" and "-" count as separators.
const word = (src) => new RegExp(`(?<![a-z0-9])(?:${src})(?![a-z0-9])`);
const FORBIDDEN = [
  ["kik", /kik/],
  ["laida", word("laid(?:a|as|os|oje|ai|u|ose|oms|omis)")],
  ["lrt", word("lrt")],
  ["show name", word(SHOW)],
  ["archive id", word("\\d{9,10}:\\d+(?:\\.\\d+)?")],
  ["missed", word("missed")],
];

/** Folded text with every forbidden-term match replaced by "…". */
function maskForbidden(folded) {
  return FORBIDDEN.reduce((t, [, re]) => t.replace(new RegExp(re.source, "g"), "…"), folded);
}

/** Problems for forbidden terms in file paths and (text) contents. */
export function scanSite(files) {
  const p = [];
  for (const { path, text } of files) {
    for (const [where, s] of [["name", path], ["text", text ?? ""]]) {
      const f = fold(s);
      for (const [label, re] of FORBIDDEN) if (re.test(f)) p.push(`${path}: forbidden term (${label}) in ${where}`);
    }
  }
  return p;
}
