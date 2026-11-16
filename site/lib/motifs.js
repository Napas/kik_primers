// Line-art motifs: SVG inner markup on a 64x64 viewBox, stroke only, currentColor.
export const MOTIFS = {
  forest: `<path d="M16 40 L16 56 M16 40 L6 40 L16 22 L10 22 L16 8 L22 22 L16 22 L26 40 Z"/><path d="M46 44 L46 58 M46 44 L34 44 L46 26 L38 26 L46 10 L54 26 L46 26 L58 44 Z"/>`,
  seasons: `<circle cx="32" cy="32" r="22"/><line x1="32" y1="10" x2="32" y2="54"/><line x1="10" y1="32" x2="54" y2="32"/><circle cx="32" cy="32" r="6"/>`,
  sea: `<path d="M4 24 Q12 16 20 24 T36 24 T52 24 T62 24"/><path d="M4 38 Q12 30 20 38 T36 38 T52 38 T62 38"/><path d="M4 52 Q12 44 20 52 T36 52 T52 52 T62 52"/>`,
  fence: `<path d="M10 54 V22 L16 14 L22 22 V54 M26 54 V22 L32 14 L38 22 V54 M42 54 V22 L48 14 L54 22 V54"/><line x1="6" y1="30" x2="58" y2="30"/><line x1="6" y1="44" x2="58" y2="44"/>`,
  city: `<path d="M8 56 V28 H22 V56 M22 56 V12 H38 V56 M38 56 V32 H56 V56"/><line x1="4" y1="56" x2="60" y2="56"/><path d="M28 22 H32 M28 32 H32 M28 42 H32"/>`,
  church: `<path d="M14 56 V30 L32 12 L50 30 V56 Z"/><line x1="32" y1="2" x2="32" y2="12"/><line x1="27" y1="6" x2="37" y2="6"/><path d="M26 56 V42 Q32 34 38 42 V56"/>`,
  ship: `<path d="M6 40 H58 L50 54 H14 Z"/><line x1="32" y1="40" x2="32" y2="8"/><path d="M32 10 L52 34 H32 M32 16 L16 34 H32"/>`,
  village: `<path d="M6 54 V34 L16 24 L26 34 V54 Z"/><path d="M34 54 V30 L46 18 L58 30 V54 Z"/><line x1="2" y1="54" x2="62" y2="54"/><path d="M42 54 V42 H50 V54"/>`,
  book: `<path d="M32 16 Q20 10 8 14 V50 Q20 46 32 52 Q44 46 56 50 V14 Q44 10 32 16 Z"/><line x1="32" y1="16" x2="32" y2="52"/>`,
  pen: `<path d="M44 8 L56 20 L22 54 L8 56 L10 42 Z"/><line x1="38" y1="14" x2="50" y2="26"/><line x1="10" y1="42" x2="22" y2="54"/>`,
  mountains: `<path d="M2 54 L22 18 L34 38 L42 26 L62 54 Z"/><path d="M16 29 L22 36 L28 29"/>`,
  river: `<path d="M20 4 Q34 16 22 28 T30 50 T36 62"/><path d="M34 4 Q48 16 36 28 T44 50 T50 62"/>`,
};

/** A standalone SVG for the motif at `size` px. */
export function motifSvg(name, size = 48) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MOTIFS[name] ?? ""}</svg>`;
}
