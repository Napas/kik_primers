// Visitor progress per topic, kept in a store from storage.js.
const MAX_SESSIONS = 20;

export function makeProgress(store) {
  const list = (kind, slug) => store.get(`${kind}:${slug}`, []);
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
      store.set(`answers:${slug}`, { ...store.get(`answers:${slug}`, {}), [qid]: right });
    },
    lastAnswers: (slug) => store.get(`answers:${slug}`, {}),
    session(slug, { scope, right, total }) {
      const entry = { scope, right, total, at: new Date().toISOString() };
      store.set(`sessions:${slug}`, [...list("sessions", slug), entry].slice(-MAX_SESSIONS));
    },
    sessions: (slug) => list("sessions", slug),
  };
}
