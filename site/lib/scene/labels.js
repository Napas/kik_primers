// Text drawn on canvases: name labels (sprites) and text textures for models.
import { COLORS, LABEL } from "../theme.js";

/**
 * Canvas texture with `text` centred. Without `w`/`h` the canvas fits the text.
 * opts: {px, w, h, bg, fg, weight}.
 */
export function textTexture(THREE, text, opts = {}) {
  const { px = LABEL.px, bg = COLORS.panel, fg = COLORS.text, weight = LABEL.weight } = opts;
  const font = `${weight} ${px}px ${LABEL.font}`;
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  ctx.font = font;
  const pad = px * 0.5;
  canvas.width = opts.w ?? Math.ceil(ctx.measureText(text).width + 2 * pad);
  canvas.height = opts.h ?? Math.ceil(px * 1.6);
  ctx = canvas.getContext("2d"); // resizing resets the context state
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Name label that always faces the camera; LABEL.height tall, width from the text. */
export function makeLabel(THREE, text) {
  const map = textTexture(THREE, text);
  const material = new THREE.SpriteMaterial({ map, transparent: true, opacity: LABEL.opacity, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1; // after the spotlights' additive cones and pools (0), so their light stays off the text
  const { width, height } = map.image;
  sprite.scale.set((LABEL.height * width) / height, LABEL.height, 1);
  return sprite;
}
