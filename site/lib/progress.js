// Visitor progress per topic, kept in a store from storage.js. Stored values of the wrong shape read as empty.
const MAX_SESSIONS = 20;

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function makeProgress(store) {
  const list = (kind, slug) => {
    const v = store.get(`${kind}:${slug}`, []);
    return Array.isArray(v) ? v : [];
  };
  const answers = (slug) => {
    const v = store.get(`answers:${slug}`, {});
    return isPlain(v) ? v : {};
  };
  const addToSet = (kind, slug, item) => {
    const items = list(kind, slug);
    if (!items.includes(item)) store.set(`${kind}:${slug}`, [...items, item]);
  };

  return {
    openSpot: (slug, id) => addToSet("opened", slug, id),
    opened: (slug) => new Set(list("opened", slug)),
    revealWhy: (slug, room, i) => addToSet("revealed", slug, `${room}:${i}`),
    revealed: (slug) => new Set(list("revealed", slug)),
    answer(slug, qid, right) {
      store.set(`answers:${slug}`, { ...answers(slug), [qid]: right });
    },
    lastAnswers: answers,
    session(slug, { scope, right, total }) {
      const entry = { scope, right, total, at: new Date().toISOString() };
      store.set(`sessions:${slug}`, [...list("sessions", slug), entry].slice(-MAX_SESSIONS));
    },
    sessions: (slug) => list("sessions", slug),
  };
}
