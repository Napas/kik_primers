// Minimal DOM stand-in so scene builders can draw canvas textures under Deno.
// Records fillText calls on each canvas as `texts`.
export function installFakeCanvas() {
  const make = () => {
    const canvas = { width: 300, height: 150, texts: [] };
    const ctx = new Proxy({
      measureText: (s) => ({ width: String(s).length * 10 }),
      fillText: (s) => canvas.texts.push(String(s)),
    }, {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: () => true,
    });
    canvas.getContext = () => ctx;
    return canvas;
  };
  globalThis.document = { createElement: () => make() };
  return () => delete globalThis.document;
}
