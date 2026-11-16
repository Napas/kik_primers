// Helpers shared by the page scripts. Pure parts first, DOM wiring last.
import { esc, isSlug } from "../text.js";

const BACK = '<a href="index.html">Temų sąrašas</a>';

/** The listed topic named by ?topic=, or {error}. */
export function topicFromUrl(url, index) {
  const slug = url.searchParams.get("topic");
  if (!slug) return { error: "Nenurodyta tema." };
  if (!isSlug(slug) || !Array.isArray(index?.topics) || !index.topics.some((t) => t.slug === slug)) {
    return { error: "Tokios temos nėra." };
  }
  return { slug };
}

/** "right/total" of the newest session, or null. */
export function lastScore(sessions) {
  const s = sessions.at(-1);
  return s ? `${s.right}/${s.total}` : null;
}

const BLOCKED = new Proxy({}, {
  get() {
    throw new Error("storage blocked");
  },
});

/** Backend for makeStore: undefined (localStorage), or with ?nostore=1 one that throws on every call. */
export function storageBackend(url) {
  return url.searchParams.get("nostore") === "1" ? BLOCKED : undefined;
}

/** The id named by a location hash, decoded; "" when absent or badly escaped. */
export function hashId(hash) {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

/** The text view's element id for a location hash: `spot-<id>` for a bare spot id; "" without one. */
export function textAnchor(hash) {
  const id = hashId(hash);
  return !id || id.startsWith("spot-") ? id : `spot-${id}`;
}

/**
 * Gives focus back to whatever opened a panel by keyboard. opened(active, keyboard, inPanel) when the panel
 * opens with focus (an opener inside the panel keeps the earlier one); closed() after it is hidden.
 */
export function focusReturn() {
  let opener = null;
  return {
    opened(active, keyboard, inPanel) {
      if (!inPanel) opener = keyboard ? active : null;
    },
    closed() {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    },
  };
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function loadIndex() {
  const index = await fetchJson("topics/index.json");
  if (!Array.isArray(index?.topics)) throw new Error("topics/index.json: no topics");
  return index;
}

export function loadPack(slug) {
  if (!isSlug(slug)) throw new Error(`bad slug ${slug}`);
  return fetchJson(`topics/${slug}/topic.json`);
}

/** Marks the page ready for tests; counts become data-* attributes. */
export function markReady(kind, counts = {}) {
  const d = document.documentElement.dataset;
  for (const [k, v] of Object.entries(counts)) d[k] = String(v);
  d.ready = kind;
}

export function showError(msg) {
  document.documentElement.dataset.error = msg;
  const app = document.getElementById("app");
  if (app) app.innerHTML = `<p class="error">${esc(msg)} ${BACK}</p>`;
}

/** Runs a page's main; any failure becomes a visible error message. */
export async function run(main) {
  try {
    await main();
  } catch (e) {
    console.error(e);
    showError("Nepavyko įkelti turinio.");
  }
}
