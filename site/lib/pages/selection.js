// What the world page has open: one spot (its panel, link arcs and, for a person, the lifespan), one room
// (its panel), or nothing. The panel itself is a `view` the page passes in, so this runs without a DOM.
import { roomPanel, spotPanel } from "../render.js";
import { drawLifespan, drawLinks, removeDrawn } from "../scene/arcs.js";

/**
 * One frame of room tracking. prev: the room the visitor was in; n: the room now (or null); quiet: a walk to
 * a chosen spot or room is running; moving: the camera is still gliding.
 * Returns {visit: n, open: whether to open n's panel, quiet: whether the walk is still running}.
 * A room opens when entered, once per visit, unless entered on the way of a chosen walk.
 */
export function roomVisit(prev, n, quiet, moving) {
  return { visit: n, open: n !== prev && n !== null && !quiet, quiet: quiet && moving };
}

/**
 * world: buildWorld's result; progress: makeProgress(); view: {show(html, focus), hide(), opened(id | null)}.
 * Returns {openSpot(id), openRoom(n, focus), reveal("n:i"), close(), spot (the open spot or null)}.
 */
export function makeSelection(THREE, { world, pack, layout, progress, view }) {
  const { slug } = pack;
  const spots = new Map(pack.spots.map((s) => [s.id, s]));
  const rooms = new Map(pack.rooms.map((r) => [r.n, r]));
  let selected = null; // {spot, drawn: Object3D[]}
  const top = (o) => ({ x: o.position.x, y: o.userData.pickY + o.userData.pickRadius, z: o.position.z });

  function deselect() {
    if (!selected) return;
    for (const o of selected.drawn) removeDrawn(world.scene, o);
    world.focus(null);
    selected = null;
    view.opened(null);
  }

  function openSpot(id) {
    const spot = spots.get(id);
    const obj = world.spotMeshes.get(id);
    deselect();
    view.show(spotPanel(spot, pack), true);
    const ends = (spot.links ?? []).map((l) => world.spotMeshes.get(l.to)).filter((o) => o && o !== obj).map(top);
    const drawn = [drawLinks(THREE, world.scene, top(obj), ends)];
    if (spot.kind === "person") drawn.push(drawLifespan(THREE, world.scene, layout, spot.years, spot.room));
    selected = { spot, drawn: drawn.filter(Boolean) };
    world.focus(obj);
    view.opened(id);
    progress.openSpot(slug, id);
  }

  function openRoom(n, focus) {
    deselect();
    view.show(roomPanel(rooms.get(n), pack, progress.revealed(slug)), focus);
  }

  function reveal(key) {
    const [n, i] = key.split(":").map(Number);
    progress.revealWhy(slug, n, i);
    openRoom(n, false);
  }

  function close() {
    deselect();
    view.hide();
  }

  return {
    openSpot,
    openRoom,
    reveal,
    close,
    get spot() {
      return selected?.spot ?? null;
    },
  };
}
