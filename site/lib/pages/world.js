// World page: the 3D world for ?topic=, or the text view with ?view=text, a layout other than time, or
// without WebGL. In the world, picking a spot (or #<spot-id> / #spot-<spot-id> on load) walks to it and opens
// its panel with link arcs and, for a person, the lifespan; entering a room opens the room's panel once per visit.
import { imgUrl, plotExplainer, textView } from "../render.js";
import { layoutTime } from "../layout.js";
import { SCENE } from "../theme.js";
import { buildWorld, configureRenderer } from "../scene/world.js";
import { pathZ } from "../scene/lanes.js";
import { makeControls } from "../scene/controls.js";
import { loadNearPhotos, standPoint } from "../scene/nearby.js";
import { updateLabels } from "../scene/declutter.js";
import { overview, roomAt, roomCounts } from "./overview.js";
import { makeSelection, roomVisit } from "./selection.js";
import { focusReturn, hashSpot, loadIndex, loadPack, markReady, pageProgress, run, showError, textAnchor, textOnly, topicFromUrl, viewShift } from "./common.js";

const MAX_DT = 0.1; // seconds; longer frame gaps (hidden tab) don't jump the camera

function hasWebGL() {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe's context
  return Boolean(gl);
}

// The text arrives after load, when the browser has already tried to scroll to the hash, so scroll again.
function showText(pack) {
  document.getElementById("app").innerHTML = textView(pack);
  document.getElementById(textAnchor(location.hash))?.scrollIntoView();
  markReady("text", { rooms: pack.rooms.length, spots: pack.spots.length });
}

run(main);

async function main() {
  const index = await loadIndex();
  const url = new URL(location.href);
  const t = topicFromUrl(url, index);
  if (t.error) return showError(t.error);
  const pack = await loadPack(t.slug);
  document.title = pack.title;
  if (textOnly(url, pack) || !hasWebGL()) return showText(pack);

  const THREE = await import("three");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return showText(pack);
  }
  // The 3D layer stays hidden until the world is built and wired; if the scene fails, the text view takes its
  // place; if the wiring fails, the layer and the overview go away so the error shows.
  const host = document.getElementById("world");
  const overviewEl = document.getElementById("overview");
  const teardown = () => {
    renderer.dispose();
    host.replaceChildren();
    host.hidden = true;
    if (overviewEl) overviewEl.hidden = true;
  };
  const layout = layoutTime(pack);
  let world;
  try {
    world = buildScene(THREE, renderer, pack, layout);
    host.append(renderer.domElement);
    renderer.render(world.scene, world.camera);
  } catch (e) {
    teardown();
    console.error(e);
    return showText(pack);
  }
  let ui;
  try {
    ui = interact(THREE, world, pack, layout, renderer.domElement, pageProgress(url));
    const start = hashSpot(location.hash, (id) => world.spotMeshes.has(id));
    if (start) ui.goTo(start, { instant: true }); // a link to a spot arrives there, without the walk
  } catch (e) {
    ui?.controls.dispose();
    teardown();
    throw e;
  }
  host.hidden = false;
  const link = document.getElementById("text-link");
  link.href = `world.html?topic=${encodeURIComponent(t.slug)}&view=text`;
  link.hidden = false;
  markReady("world", { rooms: world.roomGroups.size, spots: world.spotMeshes.size });

  addEventListener("resize", () => sizeTo(renderer, world.camera));

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), MAX_DT);
    ui.controls.update(dt);
    world.update(dt);
    ui.frame();
    renderer.render(world.scene, world.camera);
  });
}

// Controls, the side panel, the overview and progress. Returns {controls, goTo(id, {instant}), frame()}.
function interact(THREE, world, pack, layout, canvas, progress) {
  const root = document.documentElement;
  const panel = document.getElementById("panel");
  const body = document.getElementById("panel-body");
  const spotsAt = [...world.spotMeshes].map(([id, o]) => ({ id, x: o.position.x, z: o.position.z }));
  let room = { visit: null, quiet: false }; // roomVisit state; quiet while walking to a chosen spot or room
  let hovered = null;
  let keyboard = false; // the last input was a key, not a pointer
  addEventListener("keydown", () => (keyboard = true), true);
  addEventListener("pointerdown", () => (keyboard = false), true);
  const opener = focusReturn();

  const counts = () => roomCounts(pack, progress.opened(pack.slug));
  const overviewEl = document.getElementById("overview");
  const map = overview(overviewEl, layout, { rooms: pack.rooms, counts: counts(), onJump: jumpTo });
  const selection = makeSelection(THREE, {
    world,
    pack,
    layout,
    progress,
    view: {
      show(html, focus) {
        if (focus) opener.opened(document.activeElement, keyboard, panel.contains(document.activeElement));
        body.innerHTML = html;
        panel.classList.add("is-open");
        panel.inert = false;
        if (focus) panel.focus({ preventScroll: true });
      },
      hide() {
        panel.classList.remove("is-open");
        if (panel.contains(document.activeElement)) document.activeElement.blur();
        panel.inert = true;
        opener.closed();
      },
      opened(id) {
        if (id === null) delete root.dataset.open;
        else root.dataset.open = id;
        map.setCounts(counts());
      },
    },
  });
  const controls = makeControls(world.camera, canvas, {
    floorY: 0,
    targets: world.spotMeshes,
    occluders: world.walls,
    bounds: world.bounds,
    // Keys pressed in the panel or the overview belong to them (scrolling, buttons), not to walking.
    ignore: (el) => el instanceof Node && (panel.contains(el) || overviewEl.contains(el)),
    onPick: (id, point) => (id === null ? controls.walkTo(point) : goTo(id)),
    onHover(id) {
      hovered = id;
      canvas.style.cursor = id ? "pointer" : "";
    },
  });

  const roomOf = (n) => layout.rooms.find((r) => r.n === n);

  function goTo(id, move = {}) {
    if (!world.spotMeshes.has(id)) return;
    const obj = world.spotMeshes.get(id);
    const p = obj.position;
    const r = roomOf(pack.spots.find((s) => s.id === id)?.room);
    const line = r ? { minZ: pathZ(r), maxZ: pathZ(r) } : {}; // on the path: in front of the rows and the lamps
    const at = standPoint(p, spotsAt.filter((s) => s.id !== id), line);
    controls.walkTo({ x: at.x, y: 0, z: at.z }, move);
    controls.lookAt({ x: p.x, y: p.y + obj.userData.pickY, z: p.z }, move);
    room.quiet = true;
    selection.openSpot(id);
  }

  function jumpTo(n) {
    const r = roomOf(n);
    const x = (r.x0 + r.x1) / 2;
    controls.walkTo({ x, z: pathZ(r) });
    controls.lookAt({ x, y: SCENE.eye - 0.6, z: (r.z0 + r.z1) / 2 });
    room.quiet = true;
    selection.openRoom(n, true);
  }

  function reveal(key) {
    selection.reveal(key);
    (body.querySelector("[data-reveal]") ?? panel).focus({ preventScroll: true });
  }

  // Redraws the plot explainer at the button's step; focus stays on the same side's button while it is enabled.
  function step(button) {
    const plot = selection.spot?.plot;
    if (!plot) return;
    const section = button.closest(".plot");
    const side = [...section.querySelectorAll("[data-step]")].indexOf(button);
    section.outerHTML = plotExplainer(plot, { step: Number(button.dataset.step) });
    const buttons = body.querySelectorAll(".plot [data-step]");
    (buttons[side]?.disabled ? buttons[1 - side] : buttons[side])?.focus();
  }

  // The spot panel's root carries data-spot too, so only links and buttons count as spot targets.
  panel.addEventListener("click", (e) => {
    const el = e.target.closest("[data-close], [data-reveal], [data-step], a[data-spot], button[data-spot]");
    if (!el) return;
    if (el.tagName === "A") e.preventDefault();
    const d = el.dataset;
    if ("close" in d) selection.close();
    else if ("spot" in d) goTo(d.spot);
    else if ("reveal" in d) reveal(d.reveal);
    else if ("step" in d) step(el);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) selection.close();
  });

  // Screen areas the page draws over the world, in pixels: labels keep out of them.
  const chrome = [document.querySelector(".bar"), overviewEl, panel];
  function covered() {
    return chrome.filter((el) => el && !el.hidden && (el !== panel || panel.classList.contains("is-open")))
      .map((el) => el.getBoundingClientRect())
      .map((b) => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }));
  }

  // Layout reads (panel and chrome rects) come before the DOM writes below, so the browser lays out once a frame.
  function frame() {
    const view = { width: innerWidth, height: innerHeight };
    const blockers = covered();
    const shift = viewShift(panel.getBoundingClientRect(), view);
    if (shift.x || shift.y) world.camera.setViewOffset(view.width, view.height, shift.x, shift.y, view.width, view.height);
    else if (world.camera.view?.enabled) world.camera.clearViewOffset();
    const eye = world.camera.position;
    const n = roomAt(layout, eye.x, eye.z);
    room = roomVisit(room.visit, n, room.quiet, controls.moving());
    if (room.open) selection.openRoom(n, false);
    map.mark(eye.x, n);
    loadNearPhotos(world.spotMeshes, eye);
    updateLabels(world, world.camera, view, { hovered, selected: selection.spot?.id ?? null, room: n, blockers });
  }

  return { controls, goTo, frame };
}

// The canvas fills the window (#world is fixed to the viewport), so size from the window, not the hidden host.
function sizeTo(renderer, camera) {
  const w = innerWidth, h = Math.max(1, innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function buildScene(THREE, renderer, pack, layout) {
  const loader = new THREE.TextureLoader();
  const world = buildWorld(THREE, pack, layout, {
    loadPhoto: (file, apply) =>
      loader.load(imgUrl(pack, file), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        apply(tex);
      }, undefined, () => {}), // a missing photo keeps the placeholder
  });
  configureRenderer(THREE, renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  sizeTo(renderer, world.camera);
  return world;
}
