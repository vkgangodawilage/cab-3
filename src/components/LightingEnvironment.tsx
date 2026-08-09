"use client";

import { Suspense } from "react";
import * as THREE from "three";
import { Environment, Lightformer, SpotLight, useTexture } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";

/**
 * Photorealistic studio lighting rig:
 *  - Warm overhead fill + cool bounce
 *  - Recessed ceiling spotlights (warm CCT)
 *  - Under-cabinet warm LED fill strips
 *  - HDR probe via Drei Environment for polished reflections
 */
export function LightingEnvironment() {
  const mode = useDesigner((s) => s.cameraMode);

  return (
    <>
      {/* Primary soft key light – simulates a large skylight */}
      <directionalLight
        castShadow
        position={[6, 22, 10]}
        intensity={1.8}
        color="#fffef5"
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-bias={-0.0003}
        shadow-radius={3}
      />

      {/* Secondary fill – cool blue bounce from window side */}
      <directionalLight
        position={[-12, 10, -5]}
        intensity={0.55}
        color="#c8d8f0"
      />

      {/* Warm ambient — mimics painted wall bounce */}
      <ambientLight intensity={0.45} color="#fff8f0" />
      <hemisphereLight intensity={0.35} color="#fff6e8" groundColor="#d4ccc0" />

      {/* Recessed ceiling spot – center island / countertop warm highlight */}
      <pointLight position={[0, 2.7, 0]} intensity={40} color="#ffe4b0" distance={7} decay={2} castShadow />
      <pointLight position={[2.5, 2.7, 2.5]} intensity={28} color="#ffd99a" distance={5} decay={2} />
      <pointLight position={[-2.5, 2.7, 2.5]} intensity={28} color="#ffd99a" distance={5} decay={2} />
      <pointLight position={[2.5, 2.7, -2.5]} intensity={28} color="#ffd99a" distance={5} decay={2} />
      <pointLight position={[-2.5, 2.7, -2.5]} intensity={28} color="#ffd99a" distance={5} decay={2} />

      {/* Under-cabinet LED warm strip (y ≈ 1.48 – just below wall cabinets at 1.50) */}
      <pointLight position={[0, 1.48, 1.8]} intensity={18} color="#ffe0a0" distance={4} decay={2} />
      <pointLight position={[0, 1.48, -1.8]} intensity={18} color="#ffe0a0" distance={4} decay={2} />
      <pointLight position={[1.8, 1.48, 0]} intensity={18} color="#ffe0a0" distance={4} decay={2} />
      <pointLight position={[-1.8, 1.48, 0]} intensity={18} color="#ffe0a0" distance={4} decay={2} />

      {/* Background color & depth fog */}
      <color attach="background" args={["#f5f2ec"]} />
      {mode === "3d" && <fog attach="fog" args={["#f5f2ec", 50, 150]} />}

      {/* HDR IBL probe – gives metallic surfaces crisp reflections */}
      <Suspense fallback={null}>
        <Environment resolution={512} frames={1}>
          <group rotation={[-Math.PI / 4, 0, 0]}>
            {/* Large top fill — neutral daylight */}
            <Lightformer
              form="rect"
              intensity={5}
              position={[0, 8, -10]}
              scale={[20, 8, 1]}
              color="#fff9f0"
            />
            {/* Warm left fill — sunset bounce */}
            <Lightformer
              form="rect"
              intensity={2.2}
              position={[-8, 2, -2]}
              rotation-y={Math.PI / 2}
              scale={[8, 4, 1]}
              color="#ffd4a0"
            />
            {/* Cool right fill — sky bounce */}
            <Lightformer
              form="rect"
              intensity={1.8}
              position={[8, 2, -2]}
              rotation-y={-Math.PI / 2}
              scale={[8, 4, 1]}
              color="#b8d8f8"
            />
            {/* Overhead ring — polish highlight */}
            <Lightformer
              form="ring"
              intensity={3.5}
              position={[0, 10, 0]}
              scale={[6, 6, 1]}
              color="#ffffff"
            />
            {/* Countertop specular strip */}
            <Lightformer
              form="rect"
              intensity={2.5}
              position={[0, 4, 6]}
              rotation-x={-Math.PI / 4}
              scale={[12, 2, 1]}
              color="#fffef8"
            />
          </group>
        </Environment>
      </Suspense>
    </>
  );
}
