import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEndPanels } from "./endPanels.ts";
import type { EndPanelPlan, RunLike, WallLike } from "./endPanels.ts";

function run(id: string, pts: [number, number][], extra: Partial<RunLike> = {}): RunLike {
  return { id, points: pts.map(([x, z]) => ({ x, z })), closed: false, ...extra };
}
function wall(id: string, pts: [number, number][]): WallLike {
  return { id, points: pts.map(([x, z]) => ({ x, z })), closed: false };
}
const exposed = (ps: EndPanelPlan[]) => ps.filter((p) => p.reason === "exposed");
const base = (ps: EndPanelPlan[]) => exposed(ps).filter((p) => p.layer === "base");
const wallLayer = (ps: EndPanelPlan[]) => exposed(ps).filter((p) => p.layer === "wall");

test("Test 1 — straight run, exposed start (end wall-closed) -> panel generated", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], [wall("w1", [[3, 0], [3, 2]])]);
  assert.ok(base(panels).some((p) => p.runId === "r1" && p.side === "start"));
  assert.equal(exposed(panels).filter((p) => p.runId === "r1" && p.side === "end").length, 0);
});

test("Test 2 — straight run, exposed end (start wall-closed) -> panel generated", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], [wall("w1", [[0, 0], [0, 2]])]);
  assert.ok(base(panels).some((p) => p.runId === "r1" && p.side === "end"));
  assert.equal(exposed(panels).filter((p) => p.runId === "r1" && p.side === "start").length, 0);
});

test("Test 3 — both ends exposed -> two panels (island, base only)", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  assert.equal(exposed(panels).length, 2);
  assert.equal(base(panels).length, 2);
  assert.equal(wallLayer(panels).length, 0);
});

test("Test 4 — wall-closed end -> no panel", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], [wall("w1", [[3, 0], [3, 2]])]);
  assert.equal(exposed(panels).filter((p) => p.runId === "r1" && p.side === "end").length, 0);
});

test("Test 5 — run-to-run connection -> no duplicate panel at the junction", () => {
  const panels = deriveEndPanels(
    [run("r1", [[0, 0], [3, 0]]), run("r2", [[3, 0], [6, 0]])],
    []
  );
  assert.ok(!exposed(panels).some((p) => p.runId === "r1" && p.side === "end"));
  assert.ok(!exposed(panels).some((p) => p.runId === "r2" && p.side === "start"));
  assert.ok(exposed(panels).some((p) => p.runId === "r1" && p.side === "start"));
  assert.ok(exposed(panels).some((p) => p.runId === "r2" && p.side === "end"));
});

test("Test 6 — L-corner ownership -> no panel at the corner ends", () => {
  const panels = deriveEndPanels(
    [run("r1", [[0, 0], [3, 0]]), run("r2", [[3, 0], [3, 3]])],
    []
  );
  assert.equal(exposed(panels).length, 2);
  assert.ok(exposed(panels).some((p) => p.runId === "r1" && p.side === "start"));
  assert.ok(exposed(panels).some((p) => p.runId === "r2" && p.side === "end"));
  assert.ok(!exposed(panels).some((p) => p.runId === "r1" && p.side === "end"));
  assert.ok(!exposed(panels).some((p) => p.runId === "r2" && p.side === "start"));
});

test("Test 7 — U-kitchen -> correct panel count (two outer free ends)", () => {
  const panels = deriveEndPanels(
    [
      run("rB", [[0, 0], [3, 0]]),
      run("rL", [[0, 0], [0, 3]]),
      run("rR", [[3, 0], [3, 3]]),
    ],
    []
  );
  assert.equal(exposed(panels).length, 2);
  assert.ok(exposed(panels).some((p) => p.runId === "rL" && p.side === "end"));
  assert.ok(exposed(panels).some((p) => p.runId === "rR" && p.side === "end"));
  assert.ok(!exposed(panels).some((p) => p.runId === "rB"));
});

test("Test 8 — island/free-polyline run -> base panels only, both ends", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  assert.equal(base(panels).length, 2);
  assert.equal(wallLayer(panels).length, 0);
});

test("Test 9 — base run dimensions -> correct panel dimensions", () => {
  const p = base(deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []))[0];
  assert.equal(p.thicknessM, 0.018);
  assert.equal(p.depthM, 0.6);
  assert.equal(p.heightM, 0.86);
});

test("Test 10 — wall run dimensions -> correct depth/height/elevation", () => {
  const panels = deriveEndPanels(
    [run("r1", [[0, 0], [3, 0]], { wallHeight: 0.7 })],
    [wall("w1", [[3, 0], [3, 2]])]
  );
  const wp = wallLayer(panels)[0];
  assert.equal(wp.depthM, 0.35);
  assert.equal(wp.heightM, 0.7);
  assert.ok(Math.abs(wp.position[1] - (1.5 + 0.35)) < 1e-9);
});

test("Test 11 — tall/pantry runs: no tall layer in the run model", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  assert.ok(exposed(panels).every((p) => p.layer === "base" || p.layer === "wall"));
});

test("Test 12 — determinism -> deep-equal output", () => {
  const runs = [run("r1", [[0, 0], [3, 0]]), run("r2", [[3, 0], [3, 3]])];
  const walls = [wall("w1", [[3, 3], [5, 3]])];
  assert.deepEqual(deriveEndPanels(runs, walls), deriveEndPanels(runs, walls));
});

test("Test 13 — delete/undo: panels disappear when the source run disappears", () => {
  const both = deriveEndPanels([run("r1", [[0, 0], [3, 0]]), run("r2", [[0, 0], [0, 3]])], []);
  const one = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  assert.ok(both.some((p) => p.runId === "r2"));
  assert.ok(!one.some((p) => p.runId === "r2"));
});

test("Test 14 — material inheritance", () => {
  const custom = base(
    deriveEndPanels([run("c", [[0, 0], [3, 0]], { customMaterialId: "x" })], [])
  )[0];
  assert.equal(custom.material, "panel");

  const plain = deriveEndPanels([run("r", [[0, 0], [3, 0]])], [wall("w1", [[3, 0], [3, 2]])]);
  assert.equal(base(plain)[0].material, "door");
  assert.equal(wallLayer(plain)[0].material, "wallDoor");
});

test("Test 15 — obstacle/cutout conflict -> skipped with diagnostic, not rendered", () => {
  const panels = deriveEndPanels(
    [run("r1", [[0, 0], [1, 2]])],
    [wall("w1", [[0, 2], [3, 2]])],
    { cutouts: [{ wallId: "w1#0", positionOnWall: 1.0, width: 0.9, type: "door" }] }
  );
  assert.ok(
    panels.some((p) => p.reason === "skipped" && p.runId === "r1" && p.side === "end")
  );
  assert.ok(!exposed(panels).some((p) => p.runId === "r1" && p.side === "end"));
  assert.ok(exposed(panels).some((p) => p.runId === "r1" && p.side === "start"));
});

test("Test 16 — duplicate-panel prevention: one panel per end + layer, unique ids", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  const ids = panels.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(base(panels).filter((p) => p.runId === "r1" && p.side === "start").length, 1);
  assert.equal(base(panels).filter((p) => p.runId === "r1" && p.side === "end").length, 1);
});

test("Closed run produces no panels", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0], [3, 3], [0, 3]], { closed: true })], []);
  assert.equal(panels.length, 0);
});

test("Panels sit beyond the run end (outward direction)", () => {
  const panels = base(deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []));
  const s = panels.find((p) => p.side === "start")!;
  const e = panels.find((p) => p.side === "end")!;
  assert.ok(s.position[0] < 0);
  assert.ok(e.position[0] > 3);
});
