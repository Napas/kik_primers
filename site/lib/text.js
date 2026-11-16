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

/** True for an http(s) URL; false for other schemes and missing values. */
export const isHttp = (u) => /^https?:\/\//i.test(u ?? "");

/** A spot's years as text: "1845", "1845–1921", or "1950–" while still living; "" without years. */
export function yearsText(years) {
  if (!years?.length) return "";
  if (years.length === 1) return String(years[0]);
  return `${years[0]}–${years[1] ?? ""}`;
}
