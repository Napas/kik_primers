// Usage: deno run -A tools/import-cards.ts <kik-topic-dir> <site/topics/slug>
// Turns the kit's cards into the pack's `questions`, keeping only front and back.
import { fold } from "../site/lib/text.js";

// deno-lint-ignore no-explicit-any
type Json = any;
type Question = { id: string; q: string; a: string; room: number; spot?: string };

/** Folded text without quote marks, for matching a card subject to a spot name. */
const key = (s: string) => fold(s.replace(/[„“”"‘’'«»]/g, ""));

const count = (hay: string, needle: string) => needle ? hay.split(needle).length - 1 : 0;

/** Folded text of each room: its title, intro, why and its spots. */
function roomTexts(spots: Json[], rooms: Json[]) {
  return rooms.map((r) => {
    const parts = [r.title, r.intro, ...(r.why ?? []).flatMap((w: Json) => [w.q, w.a])];
    for (const s of spots) if (s.room === r.n) parts.push(s.name, ...(s.aliases ?? []), s.text);
    return { n: r.n, text: key(parts.filter(Boolean).join("\n")) };
  });
}

/**
 * One question per card. A subject matching a spot name or alias (folded, quotes ignored)
 * gives the spot and its room; otherwise the question goes to the room whose text names
 * the subject most often (first room when none does) and the subject is listed in `unmatched`.
 * Questions are ordered and numbered in a neutral order, so the card order leaves no trace.
 */
export function cardsToQuestions(cards: Json[], spots: Json[], rooms: Json[]) {
  const bySubject = new Map<string, Json>();
  for (const s of spots) {
    for (const name of [s.name, ...(s.aliases ?? [])]) {
      if (!bySubject.has(key(name))) bySubject.set(key(name), s);
    }
  }
  const texts = roomTexts(spots, rooms);
  const seen = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (seen.get(prefix) ?? 0) + 1;
    seen.set(prefix, n);
    return `${prefix}-${n}`;
  };
  const placed = cards.map((c) => {
    const spot = bySubject.get(key(c.subject));
    if (spot) return { c, room: spot.room, spot: spot.id as string | undefined };
    const k = key(c.subject);
    let best = texts[0];
    for (const t of texts) if (count(t.text, k) > count(best.text, k)) best = t;
    return { c, room: best.n, spot: undefined };
  });
  // Neutral order, independent of the card order: room, spot id (room-only last), folded front, folded back.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  placed.sort((x, y) =>
    x.room - y.room ||
    Number(!x.spot) - Number(!y.spot) ||
    cmp(x.spot ?? "", y.spot ?? "") ||
    cmp(fold(x.c.front), fold(y.c.front)) ||
    cmp(fold(x.c.back), fold(y.c.back))
  );
  const unmatched: string[] = [];
  const questions: Question[] = placed.map(({ c, room, spot }) => {
    if (spot) return { id: nextId(spot), q: c.front, a: c.back, room, spot };
    if (!unmatched.includes(c.subject)) unmatched.push(c.subject);
    return { id: nextId(`room-${room}`), q: c.front, a: c.back, room };
  });
  return { questions, unmatched };
}

export async function importCards(
  kitDir: string,
  topicDir: string,
  { log = (line: string) => console.log(line) } = {},
) {
  const { cards } = JSON.parse(await Deno.readTextFile(`${kitDir}/cards.json`));
  const topicPath = `${topicDir}/topic.json`;
  const pack: Json = JSON.parse(await Deno.readTextFile(topicPath));
  const { questions, unmatched } = cardsToQuestions(cards, pack.spots, pack.rooms);
  pack.questions = questions;
  await Deno.writeTextFile(topicPath, JSON.stringify(pack, null, 2) + "\n");
  log(`${questions.length} questions`);
  log(`unmatched (${unmatched.length}): ${unmatched.join("; ")}`);
  return pack;
}

if (import.meta.main) {
  if (Deno.args.length !== 2) {
    console.error("usage: import-cards.ts <kik-topic-dir> <site/topics/slug>");
    Deno.exit(2);
  }
  await importCards(Deno.args[0], Deno.args[1]);
}
