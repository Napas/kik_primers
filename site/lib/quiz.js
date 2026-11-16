// Test session builder: pure functions, no DOM.

const ORDER_SIZE = 4;
const MIN_GAP = 5;

/** Small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const year = (spot) => spot.years[0];

/**
 * Picks `n` spots whose first years are at least `minGap` apart.
 * Returns their ids in ascending year order, or null when no such set exists.
 */
export function pickOrder(spots, { n, minGap = MIN_GAP } = {}, rng = Math.random) {
  const chain = (list) => {
    const out = [];
    for (const s of list) {
      if (out.every((c) => Math.abs(year(c) - year(s)) >= minGap)) out.push(s);
    }
    return out;
  };
  const byYear = [...spots].sort((a, b) => year(a) - year(b));
  // Earliest-first greedy yields the largest possible set.
  const best = chain(byYear);
  if (best.length < n) return null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const picked = chain(shuffle(spots, rng)).slice(0, n);
    if (picked.length === n) return picked.sort((a, b) => year(a) - year(b)).map((s) => s.id);
  }
  return best.slice(0, n).map((s) => s.id);
}

// Order items: people by birth year, everything else by its first year.
function orderItem(spots, rng) {
  const groups = [
    { by: "born", list: spots.filter((s) => s.kind === "person") },
    { by: "year", list: spots.filter((s) => s.kind !== "person") },
  ];
  for (const { by, list } of shuffle(groups, rng)) {
    const answer = pickOrder(list, { n: ORDER_SIZE, by }, rng);
    if (!answer) continue;
    let order = shuffle(answer, rng);
    for (let i = 0; i < 10 && order.join() === answer.join(); i++) order = shuffle(answer, rng);
    return { type: "order", spots: order, answer, by };
  }
  return null;
}

function eraItem(spot, eraRooms, rng) {
  const others = shuffle(eraRooms.filter((n) => n !== spot.room), rng);
  if (others.length < 2) return null;
  const rooms = [spot.room, ...others.slice(0, rng() < 0.5 ? 2 : 3)].sort((a, b) => a - b);
  return { type: "era", spot: spot.id, rooms, answer: spot.room };
}

/**
 * Builds a test session. Mix: 60% recall, 20% face, 20% order/era
 * (alternating). Shares without candidates go to recall.
 */
export function buildSession(pack, { room, size = 20, rng = Math.random } = {}) {
  const inRoom = (x) => room === undefined || x.room === room;
  const spots = pack.spots.filter(inRoom);
  const questions = pack.questions.filter(inRoom);
  const dated = spots.filter((s) => s.years && !s.aside);
  const spanRooms = new Set(pack.rooms.filter((r) => r.span).map((r) => r.n));

  const faceCount = Math.round(size * 0.2);
  const mixCount = Math.round(size * 0.2);

  const faces = shuffle(spots.filter((s) => s.kind === "person" && s.photo), rng)
    .slice(0, faceCount)
    .map((s) => ({ type: "face", spot: s.id }));

  const mixed = [];
  const orderPool = [...dated];
  const eraPool = room === undefined ? shuffle(dated.filter((s) => spanRooms.has(s.room)), rng) : [];
  const eraRooms = [...spanRooms];
  for (let i = 0; i < mixCount; i++) {
    let item = null;
    if (i % 2 === 0) {
      item = orderItem(orderPool, rng);
      if (item) for (const id of item.answer) orderPool.splice(orderPool.findIndex((s) => s.id === id), 1);
    } else {
      while (!item && eraPool.length) item = eraItem(eraPool.pop(), eraRooms, rng);
    }
    if (item) mixed.push(item);
  }

  const recallCount = Math.min(questions.length, size - faces.length - mixed.length);
  const recall = shuffle(questions, rng).slice(0, recallCount).map((q) => ({
    type: "recall", q: q.q, a: q.a, qid: q.id, ...(q.spot ? { spot: q.spot } : {}),
  }));

  return shuffle([...recall, ...faces, ...mixed], rng);
}
