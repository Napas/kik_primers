// Pure helpers for turning Wikimedia Commons metadata into pack credits.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text of an HTML fragment; hidden elements are dropped. */
export function stripHtml(html) {
  return String(html ?? "")
    .replace(/<(\w+)[^>]*display:\s*none[^>]*>.*?<\/\1>/gis, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(n);
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** True for public domain and CC0 licence names: the only ones that may go without a known author. */
export const isFreeLicense = (license) => /^(public domain|pd\b|cc0)/i.test(String(license ?? "").trim());

// Author fields that name no one: unknown-author phrases, a wiki's name, our own placeholder.
const NO_AUTHOR = /^(?:unknown(?: author| photographer)?|author unknown|anonymous|anonym|неизвестно|неизвестный|н\.|ne[žz]inomas|[a-z]{2,3}wiki)$/i;

/** An author field without Commons boilerplate (rights prefix, uploader and user-page notes); "" when it names no one. */
export function cleanAuthor(raw) {
  const a = String(raw ?? "")
    .trim()
    .replace(/^rights:\s*/i, "")
    .replace(/^the original uploader was\s+(.+?)\s+at\s.*$/i, "$1")
    .replace(/,?\s*uploaded by\b.*$/i, "")
    .replace(/^[^\s:]+\.(?:jpe?g|png|gif|tiff?|svg):\s*/i, "") // a derivative's source file name
    .replace(/\s*\(talk\)/gi, "")
    .replace(/^(?:[a-z-]{2,12}:)?user:/i, "")
    .replace(/\s+derivative work:\s+/i, ", ")
    .trim();
  return NO_AUTHOR.test(a) ? "" : a;
}

/** The author to credit: cleanAuthor(raw), else nežinomas on a public domain or CC0 licence, else null. */
export function authorFor(raw, license) {
  return cleanAuthor(raw) || (isFreeLicense(license) ? "nežinomas" : null);
}

/** `{author, license, license_url?}` from Commons `extmetadata`, or null when unusable. */
export function creditsFrom(ext) {
  const license = stripHtml(ext?.LicenseShortName?.value);
  if (!license) return null;
  const author = authorFor(stripHtml(ext?.Artist?.value), license);
  if (!author) return null;
  const credits = { author, license };
  const url = stripHtml(ext?.LicenseUrl?.value);
  if (url) credits.license_url = url;
  return credits;
}

/** Commons API URL for one file's metadata. */
export function infoUrl(commonsName) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.searchParams.set("action", "query");
  u.searchParams.set("format", "json");
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "extmetadata|url");
  u.searchParams.set("titles", `File:${commonsName}`);
  return u.toString();
}

/** `{descriptionurl, extmetadata}` from a Commons API response, or null. */
export function imageinfoOf(response) {
  const page = Object.values(response?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0] ?? null;
}

/** The pack `photo` object for a spot, or null when credits are missing. */
export function photoFor(spotId, ext, info) {
  const credits = creditsFrom(info?.extmetadata);
  if (!credits || !info.descriptionurl) return null;
  return { file: `img/${spotId}.${ext}`, ...credits, source_url: info.descriptionurl };
}

/** Why `photoFor` would return null for this imageinfo, or null when credits are usable. */
export function dropReason(info) {
  if (!info) return "file not found";
  const ext = info.extmetadata;
  const license = stripHtml(ext?.LicenseShortName?.value);
  if (!license) return "no licence";
  if (!creditsFrom(ext)) return `no author, licence ${license}`;
  if (!info.descriptionurl) return "no source url";
  return null;
}

const MIN_WAIT_MS = 1000;
const MAX_WAIT_MS = 120000;
const clampWait = (ms) => Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, ms));

/** Milliseconds to wait before retry number `attempt` (0-based): Retry-After (seconds or HTTP date) if valid, else 5 s doubling; always within 1-120 s. */
export function retryDelayMs(retryAfter, attempt, now = Date.now()) {
  const h = String(retryAfter ?? "").trim();
  if (/^\d+$/.test(h)) return clampWait(Number(h) * 1000);
  if (/GMT$/.test(h)) {
    const date = Date.parse(h);
    if (!Number.isNaN(date)) return clampWait(date - now);
  }
  return clampWait(5000 * 2 ** attempt);
}
