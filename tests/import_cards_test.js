import { assert, assertEquals } from "@std/assert";
import { cardsToQuestions, importCards } from "../tools/import-cards.ts";

const rooms = [
  { n: 1, title: "Spaustuvė", intro: "Pirmosios knygos.", why: [] },
  { n: 2, title: "Bažnyčia", intro: "Vėlesni laikai.", why: [{ q: "Kodėl?", a: "Čia minimas Jonas Kitas." }] },
];
const spots = [
  { id: "jonas", room: 1, name: "Jonas Rašytojas", aliases: ["Rastas"], text: "x" },
  { id: "knyga", room: 2, name: "„Pirma knyga“", aliases: [], text: "Pirmoji knyga." },
];
const card = (id, kind, subject, front, back) => ({ id, kind, subject, front, back, sources: "s", qid: "1234567890:12.34" });
const cards = [
  card("fact-1", "fact", "Rastas", "Kas parašė pirmą knygą?", "Jonas Rašytojas"),
  card("why-1", "why", "Pirma knyga", "Kodėl ji pirma?", "Nes anksčiausia."),
  card("missed:1234567890:12.34", "missed", "Jonas Kitas", "Kas yra Jonas Kitas?", "Kitas autorius"),
];

Deno.test("one question per card, new ids, text unchanged, no origin copied", () => {
  const { questions } = cardsToQuestions(cards, spots, rooms);
  assertEquals(questions.length, 3);
  for (const [i, q] of questions.entries()) {
    assertEquals(q.q, cards[i].front);
    assertEquals(q.a, cards[i].back);
    assert(!/missed|\d+:\d/.test(q.id), q.id);
    assertEquals(Object.keys(q).sort(), q.spot ? ["a", "id", "q", "room", "spot"] : ["a", "id", "q", "room"]);
  }
  assertEquals(questions.map((q) => q.id), ["jonas-1", "knyga-1", "room-2-1"]);
});

Deno.test("subject matches a spot alias, or a name without quote marks", () => {
  const { questions } = cardsToQuestions(cards, spots, rooms);
  assertEquals([questions[0].spot, questions[0].room], ["jonas", 1]);
  assertEquals([questions[1].spot, questions[1].room], ["knyga", 2]);
});

Deno.test("unknown subject is listed and placed in the room whose text names it", () => {
  const { questions, unmatched } = cardsToQuestions(cards, spots, rooms);
  assertEquals(unmatched, ["Jonas Kitas"]);
  assertEquals(questions[2].spot, undefined);
  assertEquals(questions[2].room, 2);
});

Deno.test("subject named nowhere falls back to the first room", () => {
  const { questions, unmatched } = cardsToQuestions([card("f", "fact", "Niekas", "Kas?", "Niekas")], spots, rooms);
  assertEquals(unmatched, ["Niekas"]);
  assertEquals(questions[0].room, 1);
  assertEquals(questions[0].id, "room-1-1");
});

Deno.test("order is by room, spot id, room-only last, then front, whatever the card order", () => {
  const more = [
    card("a", "missed", "Rastas", "Žodis b?", "x"),
    card("b", "fact", "Niekas", "Kas niekas?", "x"),
    card("c", "fact", "Jonas Kitas", "Antras kitas?", "x"),
    card("d", "fact", "Rastas", "Ąžuolas a?", "x"),
    ...cards,
  ];
  const { questions } = cardsToQuestions(more, spots, rooms);
  assertEquals(questions.map((q) => [q.id, q.q]), [
    ["jonas-1", "Ąžuolas a?"],
    ["jonas-2", "Kas parašė pirmą knygą?"],
    ["jonas-3", "Žodis b?"],
    ["room-1-1", "Kas niekas?"],
    ["knyga-1", "Kodėl ji pirma?"],
    ["room-2-1", "Antras kitas?"],
    ["room-2-2", "Kas yra Jonas Kitas?"],
  ]);
  for (const seed of [1, 2, 3, 4, 5]) {
    const shuffled = [...more];
    let s = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    assertEquals(cardsToQuestions(shuffled, spots, rooms), cardsToQuestions(more, spots, rooms));
  }
});

Deno.test("importCards writes questions into the pack and logs count and unmatched", async () => {
  const kit = await Deno.makeTempDir();
  const topic = await Deno.makeTempDir();
  await Deno.writeTextFile(`${kit}/cards.json`, JSON.stringify({ cards }));
  await Deno.writeTextFile(`${topic}/topic.json`, JSON.stringify({ slug: "t", rooms, spots, questions: [{ id: "old" }] }));
  const log = [];
  await importCards(kit, topic, { log: (l) => log.push(l) });
  const pack = JSON.parse(await Deno.readTextFile(`${topic}/topic.json`));
  assertEquals(pack.questions.length, 3);
  assertEquals(pack.questions[0].id, "jonas-1");
  assertEquals(log, ["3 questions", "unmatched (1): Jonas Kitas"]);
});
