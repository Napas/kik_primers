// JSON key-value store over localStorage with an in-memory fallback.
// Any backend error switches the store to memory for the rest of the page's life.
const PREFIX = "pw:";

function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function makeStore(backend) {
  const be = backend === undefined ? defaultBackend() : backend;
  const mem = new Map();
  let failed = be === null;

  const fail = () => {
    failed = true;
  };

  return {
    get(key, fallback) {
      if (!failed) {
        try {
          const raw = be.getItem(PREFIX + key);
          if (raw === null || raw === undefined) return mem.has(key) ? mem.get(key) : fallback;
          return JSON.parse(raw);
        } catch (e) {
          if (!(e instanceof SyntaxError)) fail();
          else return fallback;
        }
      }
      return mem.has(key) ? mem.get(key) : fallback;
    },
    set(key, value) {
      mem.set(key, value);
      if (failed) return;
      try {
        be.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        fail();
      }
    },
  };
}
