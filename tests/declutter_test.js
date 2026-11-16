import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import * as THREE from "../site/lib/three/three.module.min.js";
import {
  behindWall,
  declutter,
  LABEL_NEAR,
  LABEL_RANGE,
  labelFit,
  labelScale,
  MAX_LABELS,
  placeLabels,
  rankLabels,
  screenRect,
  sizeLabels,
  updateLabels,
} from "../site/lib/scene/declutter.js";
import { makeLabel } from "../site/lib/scene/labels.js";
import { buildWorld } from "../site/lib/scene/world.js";
import { layoutTime } from "../site/lib/layout.js";
import { LABEL, SCENE } from "../site/lib/theme.js";
import { installFakeCanvas } from "./fake_canvas.js";

const root = new URL("../", import.meta.url).pathname;
const MINI = JSON.parse(await Deno.readTextFile(`${root}tests/fixtures/mini/topic.json`));
const r = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

/** Runs fn with the fake canvas installed. */
function withCanvas(fn) {
  const restore = installFakeCanvas();
  try {
    return fn();
  } finally {
    restore();
  }
}

Deno.test("declutter keeps items in order and drops any that overlap a kept one or a blocker", () => {
  const items = [
    { id: "a", rect: r(0, 0, 100, 20) },
    { id: "b", rect: r(50, 10, 150, 30) }, // overlaps a
    { id: "c", rect: r(0, 30, 100, 50) },
    { id: "d", rect: r(300, 0, 400, 20) }, // under the blocker
  ];
  assertEquals([...declutter(items, [r(290, 0, 500, 100)])], ["a", "c"]);
});

Deno.test("declutter keeps at most `max` items and counts touching edges as clear", () => {
  const items = [0, 1, 2, 3].map((i) => ({ id: i, rect: r(i * 10, 0, i * 10 + 10, 10) }));
  assertEquals([...declutter(items)], [0, 1, 2, 3]);
  assertEquals([...declutter(items, [], 2)], [0, 1]);
});

function scene() {
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 1.7, 5);
  camera.lookAt(0, 1.7, 0);
  camera.updateMatrixWorld();
  const label = (text, x, z) => {
    const s = makeLabel(THREE, text);
    s.position.set(x, 2, z);
    s.updateMatrixWorld();
    return s;
  };
  return { camera, label };
}

const VIEW = { width: 1000, height: 500 };

Deno.test("screenRect places a label in pixels around its projected centre, and is null behind the camera", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const front = screenRect(label("Ąžuolas", 0, 0), camera, VIEW);
    assert(front.x0 < 500 && front.x1 > 500, "centred horizontally");
    assert(front.y1 < 250, "above the eye line");
    assert(front.x1 - front.x0 > front.y1 - front.y0, "wider than tall");
    assertEquals(screenRect(label("Ąžuolas", 0, 10), camera, VIEW), null);
  });
});

Deno.test("placeLabels keeps the first-ranked of two overlapping labels", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const [a, b, c] = [label("Pirmas vardas", 0, 0), label("Antras vardas", 0.05, -0.2), label("Trečias", 3, 0)];
    assertEquals(placeLabels([a, b, c], camera, VIEW), new Set([a, c]));
    assertEquals(placeLabels([b, a, c], camera, VIEW), new Set([b, c]), "rank decides who stays");
  });
});

Deno.test("placeLabels keeps clear of blockers", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const shown = label("Rodomas", 0, 0);
    assertEquals(placeLabels([shown], camera, VIEW), new Set([shown]));
    assertEquals(placeLabels([shown], camera, VIEW, [r(0, 0, 1000, 500)]).size, 0, "a label under a blocker hides");
  });
});

Deno.test("placeLabels keeps exactly MAX_LABELS when more would fit", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const many = Array.from({ length: MAX_LABELS + 4 }, (_, i) => label(`L${i}`, -9 + i * 1.5, -20));
    const items = many.map((s) => ({ id: s, rect: screenRect(s, camera, VIEW) }));
    assert(declutter(items).size > MAX_LABELS, "without the cap more than MAX_LABELS fit");
    const kept = placeLabels(many, camera, VIEW);
    assertEquals(kept.size, MAX_LABELS);
    assertEquals([...kept], many.slice(0, MAX_LABELS), "the first-ranked ones");
  });
});

Deno.test("placeLabels drops a label that does not fit inside the view", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const edge = label("Labai ilgas vardas prie krašto", -5.2, 0); // the view reaches x = ±5.77 here
    assertEquals(placeLabels([edge], camera, VIEW).size, 0);
  });
});

Deno.test("placeLabels drops a label past the fog, where it cannot be seen", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const beyond = label("Toli", 0, 5 - SCENE.fog.far - 10);
    const within = label("Arčiau", 0, 5 - SCENE.fog.far + 10);
    assert(screenRect(beyond, camera, VIEW) !== null, "on screen");
    assertEquals(placeLabels([beyond, within], camera, VIEW), new Set([within]));
  });
});

Deno.test("placeLabels drops a label behind a wall", () => {
  withCanvas(() => {
    const { camera, label } = scene();
    const s = label("Už sienos", 0, -2);
    const wall = { min: { x: -3, y: 0, z: -1.1 }, max: { x: 3, y: 4, z: -1 } };
    assertEquals(placeLabels([s], camera, VIEW, [], [wall]).size, 0);
    assertEquals(placeLabels([s], camera, VIEW, [], []).size, 1);
  });
});

Deno.test("behindWall: a label is hidden when a wall box lies between the eye and it", () => {
  const wall = { min: { x: 4, y: 0, z: -5 }, max: { x: 4.2, y: 3, z: 5 } };
  const eye = { x: 0, y: 1.7, z: 0 };
  assertEquals(behindWall(eye, { x: 8, y: 2, z: 0 }, [wall]), true);
  assertEquals(behindWall(eye, { x: 3, y: 2, z: 0 }, [wall]), false, "in front of the wall");
  assertEquals(behindWall(eye, { x: 8, y: 2, z: 0 }, []), false);
  assertEquals(behindWall(eye, { x: 8, y: 6, z: 0 }, [wall]), false, "the line passes over the wall");
});

Deno.test("behindWall: an eye inside a wall box is not behind it, so walking through a wall keeps the labels", () => {
  const wall = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } };
  assertEquals(behindWall({ x: 0, y: 1.7, z: 0 }, { x: 8, y: 2, z: 0 }, [wall]), false);
});

// Spots on the x axis (eye at the origin): close is nearer than LABEL_NEAR, far is in range only on a wide
// view, hov is out of range; titles of rooms 1 (here) and 2 (there), and one year marker.
function rankFixture() {
  const spot = (x) => {
    const o = new THREE.Object3D();
    o.position.set(x, 0, 0);
    o.userData.label = makeLabel(THREE, `s${x}`);
    return o;
  };
  const spots = new Map([["close", spot(1)], ["near", spot(3)], ["sel", spot(5)], ["far", spot(9)], ["hov", spot(20)]]);
  const [here, there, mark] = ["here", "there", "1900"].map((t) => makeLabel(THREE, t));
  const labels = [
    { sprite: mark, x: 0, z: 0, kind: "marker" },
    { sprite: there, x: 50, z: 0, kind: "title", room: 2 },
    { sprite: here, x: 2, z: 0, kind: "title", room: 1 },
  ];
  const names = (s) => [...spots].find(([, o]) => o.userData.label === s)?.[0] ?? (s === mark ? "mark" : s === here ? "here" : "there");
  const rank = (opts) => rankLabels(spots, labels, { x: 0, z: 0 }, opts).map(names);
  return { spots, labels, rank };
}

Deno.test("rankLabels orders hovered, titles, spots, markers, nearest first, without the current room's title", () => {
  withCanvas(() => {
    const { rank } = rankFixture();
    assertEquals(rank({ hovered: "hov", room: 1 }), ["hov", "there", "near", "sel", "far", "mark"]);
    assertEquals(rank({ room: 2 }), ["here", "near", "sel", "far", "mark"]);
  });
});

Deno.test("rankLabels leaves spot labels out beyond LABEL_RANGE x labelFit, or nearer than LABEL_NEAR even when hovered", () => {
  withCanvas(() => {
    const { rank } = rankFixture();
    assertEquals([LABEL_RANGE, LABEL_NEAR], [12, 2]);
    assert(9 > LABEL_RANGE * labelFit(0.46), "far is out of range on a narrow view");
    assertEquals(rank({ room: 1, aspect: 0.46 }), ["there", "near", "sel", "mark"]);
    assertEquals(rank({ hovered: "close", room: 1 }), ["there", "near", "sel", "far", "mark"]);
  });
});

Deno.test("rankLabels with a selected spot keeps only the hovered label and room titles", () => {
  withCanvas(() => {
    const { rank } = rankFixture();
    assertEquals(rank({ hovered: "hov", selected: "sel", room: 1 }), ["hov", "there"]);
  });
});

Deno.test("rankLabels leaves out the selected spot's label even while it is hovered", () => {
  withCanvas(() => {
    const { rank } = rankFixture();
    assertEquals(rank({ hovered: "sel", selected: "sel", room: 1 }), ["there"]);
  });
});

Deno.test("rankLabels does not touch labels' visibility", () => {
  withCanvas(() => {
    const { spots, labels } = rankFixture();
    const all = [...[...spots.values()].map((o) => o.userData.label), ...labels.map((l) => l.sprite)];
    for (const s of all) s.visible = false;
    rankLabels(spots, labels, { x: 0, z: 0 }, { room: 1 });
    assert(all.every((s) => s.visible === false));
  });
});

Deno.test("labelScale keeps a near label at LABEL.maxView of the view height and a far one at full size", () => {
  const viewAt = (d) => 2 * d * Math.tan((SCENE.fov * Math.PI) / 360);
  for (const d of [1, 2.5, 5]) assertAlmostEquals((LABEL.height * labelScale(d)) / viewAt(d), LABEL.maxView, 1e-9);
  assertEquals(labelScale(LABEL_RANGE), 1);
  assertEquals(labelScale(40), 1);
});

Deno.test("labelFit narrows labels on screens narrower than LABEL.refAspect", () => {
  assertEquals([labelFit(1.75), labelFit(LABEL.refAspect)], [1, 1]);
  assertAlmostEquals(labelFit(390 / 844), 390 / 844 / LABEL.refAspect, 1e-9);
  const viewAt = (d) => 2 * d * Math.tan((SCENE.fov * Math.PI) / 360);
  const phone = 390 / 844;
  for (const d of [2.5, 8, 12]) {
    assertAlmostEquals((LABEL.height * labelScale(d, phone)) / viewAt(d), LABEL.maxView * labelFit(phone), 1e-9);
  }
  assertEquals(labelScale(5, 1.75), labelScale(5));
});

Deno.test("buildWorld lists room titles and year markers, and sizeLabels fits them like spot labels", () => {
  withCanvas(() => {
    const layout = layoutTime(MINI);
    const w = buildWorld(THREE, MINI, layout);
    assertEquals(w.labels.length, MINI.rooms.length + layout.ticks.length);
    const first = w.labels[0];
    const y = first.sprite.scale.y;
    const eye = { x: first.x - 3, y: 1.7, z: first.z };
    sizeLabels(w.labels, eye, 0.46);
    sizeLabels(w.labels, eye, 0.46);
    assertAlmostEquals(first.sprite.scale.y, y * labelScale(3, 0.46), 1e-9);
  });
});

/** MINI's world and a camera `d` metres in front of jonas-rastas, looking at it (matrices not updated). */
function miniView(d = 5, aspect = 1.6) {
  const w = buildWorld(THREE, MINI, layoutTime(MINI));
  const jonas = w.spotMeshes.get("jonas-rastas");
  const camera = new THREE.PerspectiveCamera(SCENE.fov, aspect, 0.1, SCENE.far);
  const p = jonas.position;
  camera.position.set(p.x, SCENE.eye, p.z + d);
  camera.rotation.set(0, 0, 0);
  const view = { width: Math.round(800 * aspect), height: 800 };
  return { w, jonas, camera, view, label: jonas.userData.label };
}

Deno.test("updateLabels shows a hovered spot's label in view and hides it once the spot is selected", () => {
  withCanvas(() => {
    const { w, camera, view, label } = miniView();
    updateLabels(w, camera, view, { hovered: "jonas-rastas", room: 1 });
    assertEquals(label.visible, true);
    updateLabels(w, camera, view, { hovered: "jonas-rastas", selected: "jonas-rastas", room: 1 });
    assertEquals(label.visible, false, "the selected spot is named by its plaque and the panel");
  });
});

Deno.test("updateLabels culls with the camera's current pose", () => {
  withCanvas(() => {
    const { w, camera, view, label } = miniView();
    camera.position.x += 40;
    camera.updateMatrixWorld();
    camera.position.x -= 40; // moved back without updating its matrices, as controls do between renders
    updateLabels(w, camera, view, { hovered: "jonas-rastas", room: 1 });
    assertEquals(label.visible, true);
  });
});

Deno.test("updateLabels sets every label's visibility exactly once per call", () => {
  withCanvas(() => {
    const { w, camera, view } = miniView();
    const sprites = [...[...w.spotMeshes.values()].map((o) => o.userData.label), ...w.labels.map((l) => l.sprite)];
    const sets = new Map(sprites.map((s) => [s, 0]));
    for (const s of sprites) {
      let v = s.visible;
      Object.defineProperty(s, "visible", {
        get: () => v,
        set: (x) => {
          v = x;
          sets.set(s, sets.get(s) + 1);
        },
      });
    }
    updateLabels(w, camera, view, { hovered: "jonas-rastas", selected: "pirma-knyga", room: 1 });
    assertEquals([...sets.values()], sprites.map(() => 1));
  });
});

Deno.test("updateLabels sizes each spot label by its distance without compounding", () => {
  withCanvas(() => {
    const { w, camera, view, label } = miniView(3);
    const [x, y] = [label.scale.x, label.scale.y];
    updateLabels(w, camera, view, {});
    updateLabels(w, camera, view, {});
    assertAlmostEquals(label.scale.y, y * labelScale(3, camera.aspect), 1e-9);
    assertAlmostEquals(label.scale.x, x * labelScale(3, camera.aspect), 1e-9);
    camera.position.z += 8;
    updateLabels(w, camera, view, {});
    assertAlmostEquals(label.scale.y, y * labelScale(11, camera.aspect), 1e-9);
  });
});

Deno.test("updateLabels hides the label of a spot right next to the eye, even when hovered", () => {
  withCanvas(() => {
    const { w, camera, view, label } = miniView(LABEL_NEAR / 2);
    updateLabels(w, camera, view, { hovered: "jonas-rastas", room: 1 });
    assertEquals(label.visible, false);
  });
});
