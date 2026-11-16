// Text helpers shared by the site and the tools.

/** Lowercase, strip diacritics, collapse whitespace (for matching typed answers). */
export function fold(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML-escape any value; null and undefined become an empty string. */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** True for lowercase ASCII words joined by single hyphens. */
export function isSlug(s) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}
