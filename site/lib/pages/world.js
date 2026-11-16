// World page: the 3D world for ?topic=, or the text view with ?view=text or without WebGL.
// In the world, picking a spot (or #<spot-id> on load) walks to it and opens its panel with link arcs and,
// for a person, the lifespan; entering a room opens the room's panel once per visit.
import { imgUrl, plotExplainer, textView } from "../render.js";
import { layoutTime } from "../layout.js";
import { SCENE } from "../theme.js";
import { makeStore } from "../storage.js";
import { makeProgress } from "../progress.js";
import { buildWorld, pathZ } from "../scene/world.js";
import { makeControls } from "../scene/controls.js";
import { sizeLabels, standPoint, updateNearby } from "../scene/nearby.js";
import { overview, roomAt, roomCounts } from "./overview.js";
import { makeSelection, roomVisit } from "./selection.js";
import { focusReturn, hashId, loadIndex, loadPack, markReady, run, showError, storageBackend, textAnchor, topicFromUrl } from "./common.js";

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
  if (url.searchParams.get("view") === "text" || !hasWebGL()) return showText(pack);

  const THREE = await import("three");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return showText(pack);
  }
  // The 3D layer stays hidden until its first frame renders, so a failure leaves the error in #app visible.
  const host = document.getElementById("world");
  const layout = layoutTime(pack);
  let world;
  try {
    world = buildScene(THREE, renderer, pack, layout);
    host.append(renderer.domElement);
    renderer.render(world.scene, world.camera);
  } catch (e) {
    renderer.dispose();
    host.replaceChildren();
    throw e;
  }
  host.hidden = false;
  const link = document.getElementById("text-link");
  link.href = `world.html?topic=${encodeURIComponent(t.slug)}&view=text`;
  link.hidden = false;
  markReady("world", { rooms: world.roomGroups.size, spots: world.spotMeshes.size });

  addEventListener("resize", () => sizeTo(renderer, world.camera));
  const ui = interact(THREE, world, pack, layout, renderer.domElement, makeProgress(makeStore(storageBackend(url))));
  const start = hashId(location.hash);
  if (world.spotMeshes.has(start)) ui.goTo(start);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), MAX_DT);
    ui.controls.update(dt);
    world.update(dt);
    ui.frame();
    renderer.render(world.scene, world.camera);
  });
}

// Controls, the side panel, the overview and progress. Returns {controls, goTo(id), frame()}.
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
  const map = overview(document.getElementById("overview"), layout, { rooms: pack.rooms, counts: counts(), onJump: jumpTo });
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
    onPick: (id, point) => (id === null ? controls.walkTo(point) : goTo(id)),
    onHover(id) {
      hovered = id;
      canvas.style.cursor = id ? "pointer" : "";
    },
  });

  function goTo(id) {
    if (!world.spotMeshes.has(id)) return;
    const obj = world.spotMeshes.get(id);
    const p = obj.position;
    const at = standPoint(p, spotsAt.filter((s) => s.id !== id));
    controls.walkTo({ x: at.x, y: 0, z: at.z });
    controls.lookAt({ x: p.x, y: p.y + obj.userData.pickY, z: p.z });
    room.quiet = true;
    selection.openSpot(id);
  }

  function jumpTo(n) {
    const r = layout.rooms.find((l) => l.n === n);
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

  function frame() {
    const eye = world.camera.position;
    const n = roomAt(layout, eye.x, eye.z);
    room = roomVisit(room.visit, n, room.quiet, controls.moving());
    if (room.open) selection.openRoom(n, false);
    map.mark(eye.x, n);
    updateNearby(world.spotMeshes, eye, hovered, selection.spot?.id ?? null, world.camera.aspect);
    sizeLabels(world.labels, eye, world.camera.aspect);
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
      }, undefined, () => {}), // a missing photo keeps the initials
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  sizeTo(renderer, world.camera);
  return world;
}
