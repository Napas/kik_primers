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
  return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
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
  const link = document.getElementById("text-link");
  link.href = `world.html?topic=${encodeURIComponent(t.slug)}&view=text`;
  link.hidden = false;

  const host = document.getElementById("world");
  host.hidden = false;
  const loader = new THREE.TextureLoader();
  const world = buildWorld(THREE, pack, layoutTime(pack), {
    aspect: host.clientWidth / Math.max(1, host.clientHeight),
    loadPhoto: (file, apply) =>
      loader.load(imgUrl(pack, file), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        apply(tex);
      }, undefined, () => {}), // a missing photo keeps the initials
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const resize = () => {
    const w = host.clientWidth, h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  const controls = makeControls(world.camera, renderer.domElement, {
    floorY: 0,
    targets: world.spotMeshes,
    onPick(id, point) {
      if (id === null) return controls.walkTo(point);
      const obj = world.spotMeshes.get(id);
      const p = obj.position;
      controls.walkTo({ x: p.x, y: 0, z: p.z + STAND_OFF });
      controls.lookAt({ x: p.x, y: p.y + obj.userData.pickY, z: p.z });
    },
  });

  const clock = new THREE.Clock();
  const frame = () => {
    const dt = Math.min(clock.getDelta(), MAX_DT);
    controls.update(dt);
    world.update(dt);
    renderer.render(world.scene, world.camera);
  };
  frame();
  markReady("world", { rooms: world.roomGroups.size, spots: world.spotMeshes.size });
  renderer.setAnimationLoop(frame);
}
