"use client";

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { createPanelWithHolesGeo, calculateNailHolePositions } from '@/lib/proceduralGeometry';

interface ProceduralWallCarcassProps {
  width: number;
  height: number;
  depth: number;
  bodyMat: THREE.Material;
}

export function ProceduralWallCarcass({ width, height, depth, bodyMat }: ProceduralWallCarcassProps) {
  // Typical material thicknesses
  const panelThickness = 0.018; // 18mm
  const backPanelThickness = 0.006; // 6mm

  // Carcass dimensions
  const innerHeight = height;
  const innerWidth = width;
  const innerDepth = depth;
  const nailHoleDiameter = 0.005; // 5mm
  const nailHoleDepth = 0.005;

  const nailHolePositions = useMemo(() => {
    const technicalR = nailHoleDiameter / 2;
    const positions: { y: number, z: number, r: number, through?: boolean }[] = [];
    
    // Top panel connection
    const topY = innerHeight / 2 - panelThickness / 2;
    calculateNailHolePositions(innerDepth).forEach(offset => {
      positions.push({ y: topY, z: offset, r: technicalR, through: true });
    });

    // Bottom panel connection
    const bottomY = -innerHeight / 2 + panelThickness / 2;
    calculateNailHolePositions(innerDepth).forEach(offset => {
      positions.push({ y: bottomY, z: offset, r: technicalR, through: true });
    });

    return positions;
  }, [innerDepth, innerHeight, panelThickness, nailHoleDiameter]);

  const leftPanelGeo = useMemo(() => {
    const sidePanelHeight = innerHeight - panelThickness * 2;
    const backPanelGrooveStart = -innerDepth / 2 + panelThickness;
    const backPanelGrooveEnd = -innerDepth / 2 + panelThickness + backPanelThickness;
    const grooveDepth = 0.005;

    return createPanelWithHolesGeo(
      panelThickness, sidePanelHeight, innerDepth,
      backPanelGrooveStart, backPanelGrooveEnd,
      grooveDepth, 'px',
      nailHolePositions,
      nailHoleDepth,
      panelThickness - grooveDepth, 0,
      []
    );
  }, [panelThickness, innerHeight, innerDepth, backPanelThickness, nailHolePositions, nailHoleDepth]);

  const rightPanelGeo = useMemo(() => {
    const sidePanelHeight = innerHeight - panelThickness * 2;
    const backPanelGrooveStart = -innerDepth / 2 + panelThickness;
    const backPanelGrooveEnd = -innerDepth / 2 + panelThickness + backPanelThickness;
    const grooveDepth = 0.005;

    return createPanelWithHolesGeo(
      panelThickness, sidePanelHeight, innerDepth,
      backPanelGrooveStart, backPanelGrooveEnd,
      grooveDepth, 'nx',
      nailHolePositions,
      nailHoleDepth,
      panelThickness - grooveDepth, 0,
      []
    );
  }, [panelThickness, innerHeight, innerDepth, backPanelThickness, nailHolePositions, nailHoleDepth]);

  const bottomPanelHoles = useMemo(() => {
    const technicalR = nailHoleDiameter / 2;
    const vLeft = -innerWidth / 2 + panelThickness / 2;
    const vRight = innerWidth / 2 - panelThickness / 2;
    const positions: { y: number, z: number, r: number, through?: boolean }[] = [];

    calculateNailHolePositions(innerDepth).forEach(offset => {
      positions.push({ y: vLeft, z: offset, r: technicalR, through: true });
      positions.push({ y: vRight, z: offset, r: technicalR, through: true });
    });

    // Wall cabinets usually don't have back stretchers, just the back panel in a groove.
    return positions;
  }, [innerWidth, innerDepth, panelThickness, nailHoleDiameter]);

  const bottomPanelGeo = useMemo(() => {
    const grooveDepth = 0.005;
    return createPanelWithHolesGeo(
      panelThickness, innerWidth, innerDepth,
      -innerDepth / 2 + panelThickness,
      -innerDepth / 2 + panelThickness + backPanelThickness,
      grooveDepth, 'py',
      bottomPanelHoles,
      nailHoleDepth,
      panelThickness, panelThickness
    );
  }, [innerWidth, panelThickness, innerDepth, backPanelThickness, bottomPanelHoles, nailHoleDepth]);

  const topPanelGeo = useMemo(() => {
    const grooveDepth = 0.005;
    return createPanelWithHolesGeo(
      panelThickness, innerWidth, innerDepth,
      -innerDepth / 2 + panelThickness,
      -innerDepth / 2 + panelThickness + backPanelThickness,
      grooveDepth, 'ny',
      bottomPanelHoles,
      nailHoleDepth,
      panelThickness, panelThickness
    );
  }, [innerWidth, panelThickness, innerDepth, backPanelThickness, bottomPanelHoles, nailHoleDepth]);


  // ShakerCabinetModel position bounds center at origin, top at height/2
  return (
    <group position={[0, 0, 0]}>
      {/* Bottom Panel */}
      <mesh position={[0, -innerHeight / 2 + panelThickness / 2, 0]} castShadow receiveShadow>
        <primitive object={bottomPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Top Panel */}
      <mesh position={[0, innerHeight / 2 - panelThickness / 2, 0]} castShadow receiveShadow>
        <primitive object={topPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Left Panel */}
      <mesh position={[-innerWidth / 2 + panelThickness / 2, 0, 0]} castShadow receiveShadow>
        <primitive object={leftPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Right Panel */}
      <mesh position={[innerWidth / 2 - panelThickness / 2, 0, 0]} castShadow receiveShadow>
        <primitive object={rightPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Back Panel */}
      <mesh position={[0, 0, -innerDepth / 2 + panelThickness + backPanelThickness / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerWidth - panelThickness * 2 + 0.010, innerHeight - panelThickness * 2 + 0.010, backPanelThickness]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
    </group>
  );
}
