// World page: the 3D world for ?topic=, or the text view with ?view=text or without WebGL.
import { imgUrl, textView } from "../render.js";
import { layoutTime } from "../layout.js";
import { buildWorld } from "../scene/world.js";
import { makeControls } from "../scene/controls.js";
import { loadIndex, loadPack, markReady, run, showError, topicFromUrl } from "./common.js";

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
  let world;
  try {
    world = buildScene(THREE, renderer, pack);
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

  const resize = () => sizeTo(renderer, world.camera);
  addEventListener("resize", resize);
  const controls = makeControls(world.camera, renderer.domElement, {
    floorY: 0,
    targets: world.spotMeshes,
    occluders: world.walls,
    bounds: world.bounds,
    onPick(id, point) {
      if (id === null) return controls.walkTo(point);
      const obj = world.spotMeshes.get(id);
      const p = obj.position;
      controls.walkTo({ x: p.x, y: 0, z: p.z + STAND_OFF });
      controls.lookAt({ x: p.x, y: p.y + obj.userData.pickY, z: p.z });
    },
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), MAX_DT);
    controls.update(dt);
    world.update(dt);
    renderer.render(world.scene, world.camera);
  });
}

// The canvas fills the window (#world is fixed to the viewport), so size from the window, not the hidden host.
function sizeTo(renderer, camera) {
  const w = innerWidth, h = Math.max(1, innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function buildScene(THREE, renderer, pack) {
  const loader = new THREE.TextureLoader();
  const world = buildWorld(THREE, pack, layoutTime(pack), {
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
