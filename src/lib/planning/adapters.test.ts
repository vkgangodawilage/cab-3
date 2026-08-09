import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wallSegments,
  cutoutsToSegmentIntervals,
  blockedIntervalsForRunSegment,
  runBlockedSegments,
  runBlockedSegmentsForLayers,
} from "./adapters.ts";
import type { WallLike, Point2, CutoutLike } from "./adapters.ts";

const wallA: WallLike = {
  id: "w1",
  points: [
    { x: 0, z: 0 },
    { x: 3, z: 0 },
  ],
  closed: false,
};

test("wallSegments matches app segment indexing", () => {
  const segs = wallSegments(wallA);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].key, "w1#0");
});

test("wallSegments: closed loop adds closing segment with last index", () => {
  const closed: WallLike = {
    id: "w2",
    points: [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 3 },
    ],
    closed: true,
  };
  const segs = wallSegments(closed);
  assert.equal(segs.length, 3);
  assert.equal(segs[2].key, "w2#2");
  assert.deepEqual(segs[2].a, { x: 3, z: 3 });
  assert.deepEqual(segs[2].b, { x: 0, z: 0 });
});

test("cutoutsToSegmentIntervals: maps a cutout to a mm interval", () => {
  const seg = wallSegments(wallA)[0];
  const cutout: CutoutLike = { wallId: "w1#0", positionOnWall: 1.5, width: 0.6 };
  const intervals = cutoutsToSegmentIntervals(seg, [cutout]);
  assert.deepEqual(intervals, [{ start: 1200, end: 1800 }]);
});

test("cutoutsToSegmentIntervals: ignores cutouts on other segments", () => {
  const seg = wallSegments(wallA)[0];
  const intervals = cutoutsToSegmentIntervals(seg, [
    { wallId: "w1#3", positionOnWall: 1.5, width: 0.6 },
  ]);
  assert.deepEqual(intervals, []);
});

test("blockedIntervalsForRunSegment: run along wall picks up its cutouts", () => {
  const cutout: CutoutLike = { wallId: "w1#0", positionOnWall: 1.5, width: 0.6 };
  // Run segment runs parallel to the wall, slightly offset.
  const a: Point2 = { x: 0, z: 0.1 };
  const b: Point2 = { x: 3, z: 0.1 };
  const intervals = blockedIntervalsForRunSegment(a, b, [wallA], [cutout]);
  assert.deepEqual(intervals, [{ start: 1200, end: 1800 }]);
});

test("blockedIntervalsForRunSegment: non-parallel run gets no blocked intervals", () => {
  const cutout: CutoutLike = { wallId: "w1#0", positionOnWall: 1.5, width: 0.6 };
  const a: Point2 = { x: 0, z: 0 };
  const b: Point2 = { x: 0, z: 3 }; // perpendicular
  const intervals = blockedIntervalsForRunSegment(a, b, [wallA], [cutout]);
  assert.deepEqual(intervals, []);
});

test("blockedIntervalsForRunSegment: run too far from wall gets no intervals", () => {
  const cutout: CutoutLike = { wallId: "w1#0", positionOnWall: 1.5, width: 0.6 };
  const a: Point2 = { x: 0, z: 5 };
  const b: Point2 = { x: 3, z: 5 };
  const intervals = blockedIntervalsForRunSegment(a, b, [wallA], [cutout]);
  assert.deepEqual(intervals, []);
});

test("runBlockedSegments: returns one entry per run segment", () => {
  const cutout: CutoutLike = { wallId: "w1#0", positionOnWall: 1.5, width: 0.6 };
  const points: Point2[] = [
    { x: 0, z: 0.1 },
    { x: 3, z: 0.1 },
    { x: 6, z: 0.1 },
  ];
  const perSegment = runBlockedSegments(points, [wallA], [cutout]);
  assert.equal(perSegment.length, 2);
  // Segment 0 overlaps the wall; segment 1 is beyond the wall length.
  assert.deepEqual(perSegment[0], [{ start: 1200, end: 1800 }]);
  assert.deepEqual(perSegment[1], []);
});

test("runBlockedSegmentsForLayers: windows block top but not base", () => {
  const window: CutoutLike = {
    wallId: "w1#0",
    positionOnWall: 1.5,
    width: 1.0,
    type: "window",
  };
  const door: CutoutLike = {
    wallId: "w1#0",
    positionOnWall: 0.5,
    width: 0.9,
    type: "door",
  };
  const points: Point2[] = [
    { x: 0, z: 0.1 },
    { x: 3, z: 0.1 },
  ];
  const layers = runBlockedSegmentsForLayers(points, [wallA], [window, door]);
  // Base: only the door blocks (window is ignored).
  assert.deepEqual(layers.base[0], [{ start: 50, end: 950 }]);
  // Top: both the door and the window block.
  assert.deepEqual(layers.top[0], [
    { start: 50, end: 950 },
    { start: 1000, end: 2000 },
  ]);
});

test("blockedIntervalsForRunSegment: base layer ignores windows", () => {
  const window: CutoutLike = {
    wallId: "w1#0",
    positionOnWall: 1.5,
    width: 1.0,
    type: "window",
  };
  const a: Point2 = { x: 0, z: 0.1 };
  const b: Point2 = { x: 3, z: 0.1 };
  const baseIntervals = blockedIntervalsForRunSegment(a, b, [wallA], [window], {
    layer: "base",
  });
  assert.deepEqual(baseIntervals, []);
  const topIntervals = blockedIntervalsForRunSegment(a, b, [wallA], [window], {
    layer: "top",
  });
  assert.deepEqual(topIntervals, [{ start: 1000, end: 2000 }]);
});
