import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { measureObject } from "./measureGeometry.ts";

test("measures a translated box in world space (local dims + world center)", () => {
  const group = new THREE.Group();
  group.position.set(1, 0, 2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.62));
  mesh.position.set(0, 0.43, 0);
  group.add(mesh);
  group.updateMatrixWorld(true);

  const m = measureObject(group);
  assert.equal(Math.round(m.widthMm), 600);
  assert.equal(Math.round(m.heightMm), 860);
  assert.equal(Math.round(m.depthMm), 620);
  assert.equal(Math.round(m.centerX), 1000);
  assert.equal(Math.round(m.centerY), 430);
  assert.equal(Math.round(m.centerZ), 2000);
});

test("rotated box keeps LOCAL dimensions (not world-diagonal)", () => {
  const group = new THREE.Group();
  group.rotation.y = Math.PI / 4;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.35));
  mesh.position.set(0, 0.35, 0);
  group.add(mesh);
  group.updateMatrixWorld(true);

  const m = measureObject(group);
  assert.equal(Math.round(m.widthMm), 800);
  assert.equal(Math.round(m.heightMm), 700);
  assert.equal(Math.round(m.depthMm), 350);
  assert.ok(Math.abs(m.rotationY - Math.PI / 4) < 1e-6);
});

test("translated + rotated box: center and rotation are correct", () => {
  const group = new THREE.Group();
  group.position.set(3, 1, -2);
  group.rotation.y = Math.PI / 2;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.62));
  mesh.position.set(0, 0.43, 0);
  group.add(mesh);
  group.updateMatrixWorld(true);

  const m = measureObject(group);
  assert.equal(Math.round(m.centerX), 3000);
  assert.equal(Math.round(m.centerY), 1430);
  assert.equal(Math.round(m.centerZ), -2000);
  assert.equal(Math.round(m.widthMm), 600);
});

test("empty group returns zeros without throwing", () => {
  const group = new THREE.Group();
  group.updateMatrixWorld(true);
  const m = measureObject(group);
  assert.equal(m.widthMm, 0);
  assert.equal(m.heightMm, 0);
});

test("GLB-like: X-scale on an inner node measured through an outer wrapper", () => {
  // Mirrors the placed-item structure: an outer group carries position +
  // rotation; a wrapper group surrounds the GLB (whose Clone applies the X
  // width scale). The wrapper's local frame keeps the scale, so the measured
  // width reflects the custom width.
  const outer = new THREE.Group();
  outer.position.set(1, 0, 2);
  outer.rotation.y = Math.PI / 2;

  const wrapper = new THREE.Group();
  wrapper.scale.set(1.5, 1, 1); // e.g. custom width / standard width
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.1, 0.6));
  mesh.position.set(0, 1.05, 0);
  wrapper.add(mesh);
  outer.add(wrapper);
  outer.updateMatrixWorld(true);

  const m = measureObject(outer);
  assert.equal(Math.round(m.widthMm), 1200); // 0.8 * 1.5
  assert.equal(Math.round(m.heightMm), 2100);
  assert.equal(Math.round(m.depthMm), 600);
  assert.equal(Math.round(m.centerX), 1000);
});
