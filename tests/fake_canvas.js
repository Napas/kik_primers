// Minimal DOM stand-in so scene builders can draw canvas textures under Deno.
// Records fillText calls on each canvas as `texts` (the strings) and `fills` ({text, x, y}). Other context
// methods are no-ops; they return a gradient stub so drawing code can call addColorStop on it.
export function installFakeCanvas() {
  const gradient = { addColorStop: () => {} };
  const make = () => {
    const canvas = { width: 300, height: 150, texts: [], fills: [] };
    const ctx = new Proxy({
      measureText: (s) => ({ width: String(s).length * 10 }),
      fillText: (s, x, y) => {
        canvas.texts.push(String(s));
        canvas.fills.push({ text: String(s), x, y });
      },
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
