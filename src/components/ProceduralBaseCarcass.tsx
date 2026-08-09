"use client";

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { createPanelWithHolesGeo, calculateNailHolePositions } from '@/lib/proceduralGeometry';

interface ProceduralBaseCarcassProps {
  width: number;
  height: number;
  depth: number;
  bodyMat: THREE.Material;
}

export function ProceduralBaseCarcass({ width, height, depth, bodyMat }: ProceduralBaseCarcassProps) {
  // Typical material thicknesses
  const panelThickness = 0.018; // 18mm
  const backPanelThickness = 0.006; // 6mm
  const toeKickHeight = 0.100; // 100mm
  const topStretcherWidth = 0.100; // 100mm

  // Carcass dimensions
  const innerHeight = height - toeKickHeight;
  const innerWidth = width;
  const innerDepth = depth;
  const nailHoleDiameter = 0.005; // 5mm
  const nailHoleDepth = 0.005;

  const nailHolePositions = useMemo(() => {
    const technicalR = nailHoleDiameter / 2;
    const zBack = -innerDepth / 2 + panelThickness / 2;
    const positions: { y: number, z: number, r: number, through?: boolean }[] = [];
    
    // Top stretcher connections
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
    const sidePanelHeight = innerHeight - panelThickness;
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
    const sidePanelHeight = innerHeight - panelThickness;
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
    
    // Toe kick holes
    const zToeKick = innerDepth / 2 - 0.050 - panelThickness / 2;
    calculateNailHolePositions(innerWidth).forEach(offset => {
      positions.push({ y: offset, z: zToeKick, r: technicalR, through: true });
    });

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

  const topStretcherBackHoles = useMemo(() => {
    const length = innerWidth - panelThickness * 2;
    const technicalR = nailHoleDiameter / 2;
    const z = -topStretcherWidth / 2 + panelThickness / 2;
    return calculateNailHolePositions(length).map(offset => ({
      y: offset, z, r: technicalR, through: true
    }));
  }, [innerWidth, panelThickness, nailHoleDiameter, topStretcherWidth]);

  const topStretcherBackGeo = useMemo(() => {
    const grooveDepth = 0.005;
    return createPanelWithHolesGeo(
      panelThickness, innerWidth - panelThickness * 2, topStretcherWidth,
      panelThickness - topStretcherWidth / 2, panelThickness + backPanelThickness - topStretcherWidth / 2,
      grooveDepth, 'ny',
      topStretcherBackHoles,
      panelThickness
    );
  }, [innerWidth, panelThickness, topStretcherWidth, backPanelThickness, topStretcherBackHoles]);

  // Adjust Y so the overall box bounds [0, height] vertically with its origin at the center like boxGeometry
  // Actually, ShakerCabinetModel uses <group position={[0, 0, 0]}> and a box geometry which puts the center at y=0.
  // The user's code uses boxGeometry args={[width, height, depth]}, which is centered at [0,0,0].
  // So the top of the cabinet is at height/2, bottom at -height/2, front at depth/2, back at -depth/2.
  
  return (
    <group position={[0, toeKickHeight / 2, 0]}>
      {/* Bottom Panel */}
      <mesh position={[0, -innerHeight / 2 + panelThickness / 2, 0]} castShadow receiveShadow>
        <primitive object={bottomPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Left Panel */}
      <mesh position={[-innerWidth / 2 + panelThickness / 2, panelThickness / 2, 0]} castShadow receiveShadow>
        <primitive object={leftPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Right Panel */}
      <mesh position={[innerWidth / 2 - panelThickness / 2, panelThickness / 2, 0]} castShadow receiveShadow>
        <primitive object={rightPanelGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Back Panel */}
      <mesh position={[0, 0, -innerDepth / 2 + panelThickness + backPanelThickness / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerWidth - panelThickness * 2, innerHeight, backPanelThickness]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Top Stretchers */}
      <mesh position={[0, innerHeight / 2 - panelThickness / 2, innerDepth / 2 - topStretcherWidth / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerWidth - panelThickness * 2, panelThickness, topStretcherWidth]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, innerHeight / 2 - panelThickness / 2, -innerDepth / 2 + topStretcherWidth / 2]} castShadow receiveShadow>
        <primitive object={topStretcherBackGeo} attach="geometry" />
        <primitive object={bodyMat} attach="material" />
      </mesh>

      {/* Toe Kick */}
      <mesh position={[0, -innerHeight / 2 - toeKickHeight / 2, innerDepth / 2 - 0.050 - panelThickness / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerWidth, toeKickHeight, panelThickness]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
    </group>
  );
}
