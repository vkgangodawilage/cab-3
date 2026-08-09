"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";
import type { Wall } from "@/store/useStore";
import { getWallSegment } from "@/lib/placement";

/** 2D top-down orthographic target pose. */
const TARGET_2D = {
  pos: new THREE.Vector3(0, 20, 0),
  look: new THREE.Vector3(0, 0, 0),
  up: new THREE.Vector3(0, 0, -1),
};

const EYE_HEIGHT = 1.6; // human eye level
const LOOK_HEIGHT = 1.4; // orbit target at eye level
const SPEED = 5; // damping speed (higher = faster transition)

/** Centroid (plan XZ) of every committed wall endpoint. */
function computeCenter(walls: Wall[]): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const w of walls) {
    for (const p of w.points) {
      sx += p.x;
      sz += p.z;
      n += 1;
    }
  }
  return n > 0 ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
}

/**
 * Ultra-smooth 2D ⇄ 3D camera controller with close-up wall inspection.
 *
 * Features:
 *  - minDistance set to 0.05m (5 cm) so camera can zoom directly up to any wall.
 *  - Auto-focus: clicking a wall smoothly animates camera focus to that wall.
 *  - Keyboard Arrow keys (Up/Down/Left/Right): walk/pan camera around walls in 3D.
 */
export function CameraController() {
  const mode = useDesigner((s) => s.cameraMode);
  const walls = useDesigner((s) => s.walls);
  const selectedWallId = useDesigner((s) => s.selectedWallId);
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);

  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const controlsRef = useRef<any>(null);

  const center = useMemo(() => computeCenter(walls), [walls]);
  const target3D = useMemo(
    () => ({
      pos: new THREE.Vector3(center.x, EYE_HEIGHT, center.z + 2.5),
      look: new THREE.Vector3(center.x, LOOK_HEIGHT, center.z),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [center]
  );

  const pos = useRef(new THREE.Vector3(0, EYE_HEIGHT, 2.5));
  const look = useRef(new THREE.Vector3(0, LOOK_HEIGHT, 0));
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const transitioning = useRef(false);
  const prevMode = useRef(mode);
  const initialized = useRef(false);
  const prevSelectedWall = useRef<string | null>(null);

  // Smooth wall selection focus
  useEffect(() => {
    if (mode !== "3d" || !selectedWallId) return;
    if (prevSelectedWall.current === selectedWallId) return;
    prevSelectedWall.current = selectedWallId;

    const seg = getWallSegment(walls, selectedWallId);
    if (!seg) return;

    const cx = (seg.a.x + seg.b.x) / 2;
    const cz = (seg.a.z + seg.b.z) / 2;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const len = Math.hypot(dx, dz);

    if (controlsRef.current && len > 1e-4) {
      const nx = -dz / len;
      const nz = dx / len;

      const targetLook = new THREE.Vector3(cx, LOOK_HEIGHT, cz);
      const targetPos = new THREE.Vector3(cx + nx * 2.2, EYE_HEIGHT, cz + nz * 2.2);

      const startTarget = controlsRef.current.target.clone();
      const startPos = perspRef.current ? perspRef.current.position.clone() : pos.current.clone();

      let progress = 0;
      const animateWallFocus = () => {
        progress += 0.08;
        if (progress > 1) progress = 1;
        const ease = 1 - Math.pow(1 - progress, 3);

        const curTarget = startTarget.clone().lerp(targetLook, ease);
        const curPos = startPos.clone().lerp(targetPos, ease);

        if (controlsRef.current) {
          controlsRef.current.target.copy(curTarget);
        }
        if (perspRef.current) {
          perspRef.current.position.copy(curPos);
          perspRef.current.lookAt(curTarget);
        }
        if (progress < 1) requestAnimationFrame(animateWallFocus);
      };
      requestAnimationFrame(animateWallFocus);
    }
  }, [selectedWallId, walls, mode]);

  useEffect(() => {
    const persp = perspRef.current;
    const ortho = orthoRef.current;
    if (!persp || !ortho) return;

    persp.aspect = size.width / size.height;
    persp.updateProjectionMatrix();

    ortho.left = -size.width / 2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = -size.height / 2;
    ortho.zoom = 30;
    ortho.updateProjectionMatrix();

    if (!initialized.current) {
      initialized.current = true;
      const t = mode === "2d" ? TARGET_2D : target3D;
      pos.current.copy(t.pos);
      look.current.copy(t.look);
      up.current.copy(t.up);
    } else if (prevMode.current !== mode) {
      const from = prevMode.current === "2d" ? ortho : persp;
      pos.current.copy(from.position);
      const dir = new THREE.Vector3();
      from.getWorldDirection(dir);
      look.current.copy(from.position).addScaledVector(dir, 5);
      up.current.copy(from.up);
      transitioning.current = true;
      if (controlsRef.current) controlsRef.current.enabled = false;
      prevMode.current = mode;
    }

    const cam = mode === "2d" ? ortho : persp;
    cam.position.copy(pos.current);
    cam.up.copy(up.current);
    cam.lookAt(look.current);
    set({ camera: cam });
  }, [mode, size, set, target3D]);

  useFrame((_, delta) => {
    if (!transitioning.current) return;
    const target = mode === "2d" ? TARGET_2D : target3D;
    const k = 1 - Math.exp(-delta * SPEED);
    pos.current.lerp(target.pos, k);
    look.current.lerp(target.look, k);
    up.current.lerp(target.up, k);

    const cam = mode === "2d" ? orthoRef.current : perspRef.current;
    if (!cam) return;
    cam.position.copy(pos.current);
    cam.up.copy(up.current);
    cam.lookAt(look.current);

    if (
      pos.current.distanceTo(target.pos) < 0.05 &&
      up.current.distanceTo(target.up) < 0.05
    ) {
      transitioning.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
    }
  });

  // Arrow key pan navigation in 3D mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== "3d" || !controlsRef.current) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const step = 0.35;
      const controls = controlsRef.current;
      const cam = perspRef.current;
      if (!controls || !cam) return;

      const forward = new THREE.Vector3();
      cam.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const sideVector = new THREE.Vector3().crossVectors(cam.up, forward).normalize();

      if (e.key === "ArrowUp") {
        e.preventDefault();
        controls.target.addScaledVector(forward, step);
        cam.position.addScaledVector(forward, step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        controls.target.addScaledVector(forward, -step);
        cam.position.addScaledVector(forward, -step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        controls.target.addScaledVector(sideVector, step);
        cam.position.addScaledVector(sideVector, step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        controls.target.addScaledVector(sideVector, -step);
        cam.position.addScaledVector(sideVector, -step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  return (
    <>
      <perspectiveCamera ref={perspRef} fov={60} near={0.02} far={500} />
      <orthographicCamera ref={orthoRef} near={0.02} far={500} />
      <OrbitControls
        ref={controlsRef}
        key={mode}
        makeDefault
        enableRotate={mode === "3d"}
        enableZoom
        enablePan
        screenSpacePanning
        zoomToCursor={mode === "2d"}
        enableDamping={mode === "3d"}
        dampingFactor={0.05}
        rotateSpeed={0.8}
        zoomSpeed={1.2}
        panSpeed={1.0}
        target={mode === "2d" ? [0, 0, 0] : [center.x, LOOK_HEIGHT, center.z]}
        minDistance={mode === "2d" ? 0 : 0.05}
        maxDistance={mode === "2d" ? undefined : 60}
        maxPolarAngle={mode === "3d" ? Math.PI / 2 - 0.001 : undefined}
      />
    </>
  );
}
