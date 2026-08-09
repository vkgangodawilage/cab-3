/**
 * Phase 3 — Runtime registry of committed cabinet/module roots.
 *
 * Object3D references are kept OUT of Zustand (Part 17) — they are transient,
 * component-lifetime references. Components register on mount and are
 * auto-unregistered when R3F calls the ref with `null` on unmount.
 */

import * as THREE from "three";

const registry = new Map<string, THREE.Object3D>();

export function registerObject(id: string, obj: THREE.Object3D | null): void {
  if (obj) registry.set(id, obj);
  else registry.delete(id);
}

export function unregisterObject(id: string): void {
  registry.delete(id);
}

export function getRegisteredObject(id: string): THREE.Object3D | undefined {
  return registry.get(id);
}

export function getAllRegistered(): Map<string, THREE.Object3D> {
  return registry;
}

export function clearRegistry(): void {
  registry.clear();
}
