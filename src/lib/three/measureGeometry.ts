/**
 * Phase 3 — Three.js measurement adapter (client-side).
 *
 * Measures an actual cabinet/module group. World-space bounds come from
 * `THREE.Box3.setFromObject`; per-axis W/D/H are computed in the object's
 * LOCAL frame by transforming each mesh's geometry bounding-box corners by
 * (mesh.matrixWorld → inverse group.matrixWorld). This is exact even when the
 * cabinet is rotated on a diagonal wall — unlike transforming the world AABB,
 * whose corners are not real object points (the reference explicitly called
 * world bbox "approximate for rotated walls").
 *
 * The result is a plain, serializable object; centres are world-space in mm.
 */

import * as THREE from "three";

export interface Box3Measurement {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  rotationY: number;
}

const M = 1000;

export function measureObject(obj: THREE.Object3D): Box3Measurement {
  obj.updateWorldMatrix(true, true);
  const worldBox = new THREE.Box3().setFromObject(obj);

  if (worldBox.isEmpty()) {
    return {
      widthMm: 0,
      heightMm: 0,
      depthMm: 0,
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
      centerX: 0,
      centerY: 0,
      centerZ: 0,
      rotationY: obj.rotation.y,
    };
  }

  // Local frame: inverse of this group's world matrix.
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const v = new THREE.Vector3();
  const localMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const localMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const g = mesh.geometry.boundingBox;
    if (!g) return;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? g.max.x : g.min.x, i & 2 ? g.max.y : g.min.y, i & 4 ? g.max.z : g.min.z)
        .applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(inv);
      localMin.min(v);
      localMax.max(v);
    }
  });

  const size = new THREE.Vector3().subVectors(localMax, localMin);
  const center = worldBox.getCenter(new THREE.Vector3());

  return {
    widthMm: size.x * M,
    heightMm: size.y * M,
    depthMm: size.z * M,
    minX: worldBox.min.x * M,
    minY: worldBox.min.y * M,
    minZ: worldBox.min.z * M,
    maxX: worldBox.max.x * M,
    maxY: worldBox.max.y * M,
    maxZ: worldBox.max.z * M,
    centerX: center.x * M,
    centerY: center.y * M,
    centerZ: center.z * M,
    rotationY: obj.rotation.y,
  };
}
