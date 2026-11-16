// World page: the 3D world for ?topic=, or the text view with ?view=text or without WebGL.
// In the world, picking a spot (or #<spot-id> on load) walks to it and opens its panel with link arcs and,
// for a person, the lifespan; entering a room opens the room's panel once per visit.
import { imgUrl, plotExplainer, roomPanel, spotPanel, textView } from "../render.js";
import { layoutTime } from "../layout.js";
import { SCENE } from "../theme.js";
import { makeStore } from "../storage.js";
import { makeProgress } from "../progress.js";
import { buildWorld, pathZ } from "../scene/world.js";
import { makeControls } from "../scene/controls.js";
import { drawLifespan, drawLinks, removeDrawn } from "../scene/arcs.js";
import { updateNearby } from "../scene/nearby.js";
import { overview, roomAt, roomCounts } from "./overview.js";
import { hashId, loadIndex, loadPack, markReady, run, showError, storageBackend, topicFromUrl } from "./common.js";

const STAND_OFF = 2.5; // metres in front of a picked spot
const MAX_DT = 0.1; // seconds; longer frame gaps (hidden tab) don't jump the camera

function hasWebGL() {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe's context
  return Boolean(gl);
}

function showText(pack) {
  document.getElementById("app").innerHTML = textView(pack);
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
  const { slug } = pack;
  const spots = new Map(pack.spots.map((s) => [s.id, s]));
  const rooms = new Map(pack.rooms.map((r) => [r.n, r]));
  const root = document.documentElement;
  const panel = document.getElementById("panel");
  const body = document.getElementById("panel-body");
  let selected = null; // {spot, drawn: Object3D[]} while a spot's panel is open
  let visit = null; // room the visitor stands in
  let quiet = false; // while walking to a chosen spot or room, rooms on the way don't open
  let hovered = null;

  const counts = () => roomCounts(pack, progress.opened(slug));
  const map = overview(document.getElementById("overview"), layout, { rooms: pack.rooms, counts: counts(), onJump: jumpTo });
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

  function deselect() {
    for (const o of selected?.drawn ?? []) removeDrawn(world.scene, o);
    selected = null;
    delete root.dataset.open;
  }

  function show(html, focus) {
    body.innerHTML = html;
    panel.classList.add("is-open");
    panel.inert = false;
    if (focus) panel.focus({ preventScroll: true });
  }

  function close() {
    deselect();
    panel.classList.remove("is-open");
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    panel.inert = true;
  }

  const top = (o) => ({ x: o.position.x, y: o.userData.pickY + o.userData.pickRadius, z: o.position.z });

  function openSpot(id) {
    const spot = spots.get(id);
    const obj = world.spotMeshes.get(id);
    deselect();
    show(spotPanel(spot, pack), true);
    const ends = (spot.links ?? []).map((l) => world.spotMeshes.get(l.to)).filter((o) => o && o !== obj).map(top);
    const drawn = [drawLinks(THREE, world.scene, top(obj), ends)];
    if (spot.kind === "person") drawn.push(drawLifespan(THREE, world.scene, layout, spot.years));
    selected = { spot, drawn: drawn.filter(Boolean) };
    root.dataset.open = id;
    progress.openSpot(slug, id);
    map.setCounts(counts());
  }

  function goTo(id) {
    if (!world.spotMeshes.has(id)) return;
    const obj = world.spotMeshes.get(id);
    const p = obj.position;
    controls.walkTo({ x: p.x, y: 0, z: p.z + STAND_OFF });
    controls.lookAt({ x: p.x, y: p.y + obj.userData.pickY, z: p.z });
    quiet = true;
    openSpot(id);
  }

  function openRoom(n, focus) {
    deselect();
    show(roomPanel(rooms.get(n), pack, progress.revealed(slug)), focus);
  }

  function jumpTo(n) {
    const r = layout.rooms.find((l) => l.n === n);
    const x = (r.x0 + r.x1) / 2;
    controls.walkTo({ x, z: pathZ(r) });
    controls.lookAt({ x, y: SCENE.eye - 0.6, z: (r.z0 + r.z1) / 2 });
    quiet = true;
    openRoom(n, true);
  }

  function reveal(key) {
    const [n, i] = key.split(":").map(Number);
    progress.revealWhy(slug, n, i);
    openRoom(n, false);
    (body.querySelector("[data-reveal]") ?? panel).focus({ preventScroll: true });
  }

  // Redraws the plot explainer at the button's step; focus stays on the same side's button while it is enabled.
  function step(button) {
    if (!selected?.spot.plot) return;
    const section = button.closest(".plot");
    const side = [...section.querySelectorAll("[data-step]")].indexOf(button);
    section.outerHTML = plotExplainer(selected.spot.plot, { step: Number(button.dataset.step) });
    const buttons = body.querySelectorAll(".plot [data-step]");
    (buttons[side]?.disabled ? buttons[1 - side] : buttons[side])?.focus();
  }

  // The spot panel's root carries data-spot too, so only links and buttons count as spot targets.
  panel.addEventListener("click", (e) => {
    const el = e.target.closest("[data-close], [data-reveal], [data-step], a[data-spot], button[data-spot]");
    if (!el) return;
    if (el.tagName === "A") e.preventDefault();
    const d = el.dataset;
    if ("close" in d) close();
    else if ("spot" in d) goTo(d.spot);
    else if ("reveal" in d) reveal(d.reveal);
    else if ("step" in d) step(el);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) close();
  });

  function frame() {
    const eye = world.camera.position;
    const n = roomAt(layout, eye.x, eye.z);
    if (n !== visit) {
      visit = n;
      if (n !== null && !quiet) openRoom(n, false);
    }
    if (quiet && !controls.moving()) quiet = false;
    map.mark(eye.x, n);
    updateNearby(world.spotMeshes, eye, hovered);
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
