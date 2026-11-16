// Minimal DOM stand-in so scene builders can draw canvas textures under Deno.
// Records fillText calls on each canvas as `texts`. Other context methods are no-ops; they return a
// gradient stub so drawing code can call addColorStop on it.
export function installFakeCanvas() {
  const gradient = { addColorStop: () => {} };
  const make = () => {
    const canvas = { width: 300, height: 150, texts: [] };
    const ctx = new Proxy({
      measureText: (s) => ({ width: String(s).length * 10 }),
      fillText: (s) => canvas.texts.push(String(s)),
    }, {
      get: (target, key) => (key in target ? target[key] : () => gradient),
      set: () => true,
    });
    canvas.getContext = () => ctx;
    return canvas;
  };
  globalThis.document = { createElement: () => make() };
  return () => delete globalThis.document;
}
