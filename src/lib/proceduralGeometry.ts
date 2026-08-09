import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';

export const calculateNailHolePositions = (length: number): number[] => {
  if (length < 300) {
    return [-length / 4, length / 4];
  } else {
    return [-length / 2 + 50, 0, length / 2 - 50];
  }
};

export const createPanelWithHolesGeo = (
  sizeX: number, // thickness
  sizeY: number, // height
  sizeZ: number, // depth
  grooveLocalZMin: number,
  grooveLocalZMax: number,
  grooveDepth: number,
  grooveFace: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz' | 'none',
  holes: { y: number, z: number, r: number, through?: boolean }[],
  holeDepth: number,
  grooveStartOffset: number = 0,
  grooveEndOffset: number = 0,
  notches: { u: number, v: number, width: number, height: number, alignV: 'top' | 'bottom' | 'center', side?: 'uMax' | 'uMin' }[] = []
) => {
  const uMin = -sizeZ / 2;
  const uMax = sizeZ / 2;
  const vMin = -sizeY / 2;
  const vMax = sizeY / 2;

  const createBaseShape = (includeGroove: boolean, includePartialHoles: boolean, includeThroughHoles: boolean) => {
    const shape = new THREE.Shape();
    const tol = 0.001;
    
    // Notches processing
    const uMaxNotches = notches.filter(n => !n.side || n.side === 'uMax')
      .map(n => {
        const nVMinRaw = n.alignV === 'top' ? n.v - n.height : (n.alignV === 'center' ? n.v - n.height/2 : n.v);
        const nVMaxRaw = nVMinRaw + n.height;
        return {
          ...n,
          nVMin: Math.max(vMin, nVMinRaw),
          nVMax: Math.min(vMax, nVMaxRaw),
          width: Math.min(sizeZ, n.width)
        };
      })
      .filter(n => n.nVMax > n.nVMin + tol)
      .sort((a, b) => a.nVMin - b.nVMin);

    const uMinNotches = notches.filter(n => n.side === 'uMin')
      .map(n => {
        const nVMinRaw = n.alignV === 'top' ? n.v - n.height : (n.alignV === 'center' ? n.v - n.height/2 : n.v);
        const nVMaxRaw = nVMinRaw + n.height;
        return {
          ...n,
          nVMin: Math.max(vMin, nVMinRaw),
          nVMax: Math.min(vMax, nVMaxRaw),
          width: Math.min(sizeZ, n.width)
        };
      })
      .filter(n => n.nVMax > n.nVMin + tol)
      .sort((a, b) => a.nVMin - b.nVMin);
    
    let currentV = vMin;
    if (uMinNotches.length > 0 && Math.abs(uMinNotches[0].nVMin - vMin) < tol) {
      const n = uMinNotches[0];
      shape.moveTo(uMin + n.width, vMin);
      currentV = vMin;
    } else {
      shape.moveTo(uMin, vMin);
    }

    if (uMaxNotches.length > 0 && Math.abs(uMaxNotches[0].nVMin - vMin) < tol) {
       const first = uMaxNotches[0];
       shape.lineTo(uMax - first.width, vMin);
       shape.lineTo(uMax - first.width, first.nVMax);
       currentV = first.nVMax;
       if (currentV < vMax - tol) {
         shape.lineTo(uMax, currentV);
       }
       uMaxNotches.shift();
    } else {
       shape.lineTo(uMax, vMin);
    }
    
    uMaxNotches.forEach(n => {
      const nVMin = n.nVMin;
      const nVMax = n.nVMax;
      if (nVMin > currentV + tol) shape.lineTo(uMax, nVMin);
      shape.lineTo(uMax - n.width, nVMin);
      shape.lineTo(uMax - n.width, nVMax);
      if (nVMax < vMax - tol) {
        shape.lineTo(uMax, nVMax);
        currentV = nVMax;
      } else {
        currentV = vMax;
      }
    });
    if (currentV < vMax - tol) shape.lineTo(uMax, vMax);

    currentV = vMax;
    if (uMinNotches.length > 0 && Math.abs(uMinNotches[uMinNotches.length-1].nVMax - vMax) < tol) {
      const last = uMinNotches[uMinNotches.length-1];
      shape.lineTo(uMin + last.width, vMax);
    } else {
      shape.lineTo(uMin, vMax);
    }

    const uMinNotchesRev = [...uMinNotches].reverse();
    currentV = vMax;
    uMinNotchesRev.forEach(n => {
      const nVMax = n.nVMax;
      const nVMin = n.nVMin;
      
      if (nVMax < currentV - tol) shape.lineTo(uMin, nVMax);
      shape.lineTo(uMin + n.width, nVMax);
      shape.lineTo(uMin + n.width, nVMin);
      if (nVMin > vMin + tol) {
        shape.lineTo(uMin, nVMin);
        currentV = nVMin;
      } else {
        currentV = vMin;
      }
    });
    if (currentV > vMin + tol) shape.lineTo(uMin, vMin);

    shape.closePath();

    holes.forEach(h => {
      const shouldInclude = (h.through && includeThroughHoles) || (!h.through && includePartialHoles);
      if (shouldInclude) {
        const isInsideNotch = notches.some(n => {
          const nVMin = n.alignV === 'top' ? n.v - n.height : (n.alignV === 'center' ? n.v - n.height/2 : n.v);
          const nVMax = nVMin + n.height;
          const nUMin = n.side === 'uMin' ? uMin : uMax - n.width;
          const nUMax = n.side === 'uMin' ? uMin + n.width : uMax;
          return h.y >= nVMin - tol && h.y <= nVMax + tol && h.z >= nUMin - tol && h.z <= nUMax + tol;
        });

        if (!isInsideNotch) {
          const path = new THREE.Path();
          path.absarc(h.z, h.y, h.r, 0, Math.PI * 2, true);
          shape.holes.push(path);
        }
      }
    });

    if (includeGroove) {
      const gZMin = grooveLocalZMin;
      const gZMax = grooveLocalZMax;
      const gYMin = vMin + grooveEndOffset;
      const gYMax = vMax - grooveStartOffset;
      
      const gPath = new THREE.Path();
      gPath.moveTo(gZMin, gYMin);
      gPath.lineTo(gZMax, gYMin);
      gPath.lineTo(gZMax, gYMax);
      gPath.lineTo(gZMin, gYMax);
      gPath.closePath();
      shape.holes.push(gPath);
    }
    
    return shape;
  };

  const layers: THREE.BufferGeometry[] = [];
  const hDepth = Math.min(holeDepth, sizeX);
  const gDepth = Math.min(grooveDepth, sizeX);
  
  const maxD = Math.max(hDepth, gDepth);
  const backThickness = sizeX - maxD;
  
  if (backThickness > 0) {
    layers.push(new THREE.ExtrudeGeometry(createBaseShape(false, false, true), { depth: backThickness, bevelEnabled: false, curveSegments: 6 }));
  }
  
  if (hDepth > gDepth) {
    const midThickness = hDepth - gDepth;
    const midGeo = new THREE.ExtrudeGeometry(createBaseShape(false, true, true), { depth: midThickness, bevelEnabled: false, curveSegments: 6 });
    midGeo.translate(0, 0, backThickness);
    layers.push(midGeo);
    
    if (gDepth > 0) {
      const innerGeo = new THREE.ExtrudeGeometry(createBaseShape(true, true, true), { depth: gDepth, bevelEnabled: false, curveSegments: 6 });
      innerGeo.translate(0, 0, backThickness + midThickness);
      layers.push(innerGeo);
    }
  } else if (gDepth > hDepth) {
    const midThickness = gDepth - hDepth;
    const midGeo = new THREE.ExtrudeGeometry(createBaseShape(true, false, true), { depth: midThickness, bevelEnabled: false, curveSegments: 6 });
    midGeo.translate(0, 0, backThickness);
    layers.push(midGeo);
    
    if (hDepth > 0) {
      const innerGeo = new THREE.ExtrudeGeometry(createBaseShape(true, true, true), { depth: hDepth, bevelEnabled: false, curveSegments: 6 });
      innerGeo.translate(0, 0, backThickness + midThickness);
      layers.push(innerGeo);
    }
  } else {
    if (hDepth > 0) {
      const innerGeo = new THREE.ExtrudeGeometry(createBaseShape(true, true, true), { depth: hDepth, bevelEnabled: false, curveSegments: 6 });
      innerGeo.translate(0, 0, backThickness);
      layers.push(innerGeo);
    }
  }

  let mergedGeo = layers.length > 1 
    ?     mergeBufferGeometries(layers)! 
    : layers[0];
  
  const positions = mergedGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const depthVal = positions.getX(i);
    const heightVal = positions.getY(i);
    const thicknessVal = positions.getZ(i) - sizeX / 2;

    if (grooveFace === 'px') {
      positions.setXYZ(i, thicknessVal, heightVal, depthVal);
    } else if (grooveFace === 'nx') {
      positions.setXYZ(i, -thicknessVal, heightVal, depthVal);
    } else if (grooveFace === 'py') {
      positions.setXYZ(i, heightVal, thicknessVal, depthVal);
    } else if (grooveFace === 'ny') {
      positions.setXYZ(i, heightVal, -thicknessVal, depthVal);
    } else if (grooveFace === 'pz') {
      positions.setXYZ(i, depthVal, heightVal, thicknessVal);
    } else if (grooveFace === 'nz') {
      positions.setXYZ(i, depthVal, heightVal, -thicknessVal);
    } else if (grooveFace === 'none') {
      positions.setXYZ(i, depthVal, heightVal, thicknessVal);
    }
  }
  
  mergedGeo.computeVertexNormals();
  mergedGeo.computeBoundingBox();
  
  const bbox = mergedGeo.boundingBox;
  if (!bbox) return mergedGeo;
  
  const newPositions = mergedGeo.attributes.position;
  const normals = mergedGeo.attributes.normal;
  const uvs = new Float32Array(newPositions.count * 2);
  for (let i = 0; i < newPositions.count; i++) {
    const x = newPositions.getX(i) - bbox.min.x;
    const y = newPositions.getY(i) - bbox.min.y;
    const z = newPositions.getZ(i) - bbox.min.z;
    const nx = Math.abs(normals.getX(i));
    const ny = Math.abs(normals.getY(i));
    const nz = Math.abs(normals.getZ(i));

    if (nx > ny && nx > nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else if (ny > nx && ny > nz) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }
  mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  return mergedGeo;
};

export const createGroovedPanelGeo = (
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  grooveLocalZMin: number,
  grooveLocalZMax: number,
  grooveDepth: number,
  grooveFace: 'px' | 'nx' | 'py' | 'ny',
  grooveStartOffset: number = 0,
  grooveEndOffset: number = 0
) => {
  let shapeWidth, shapeHeight, totalLength;
  
  if (grooveFace === 'px' || grooveFace === 'nx') {
    shapeWidth = sizeZ;
    shapeHeight = sizeX;
    totalLength = sizeY;
  } else {
    shapeWidth = sizeZ;
    shapeHeight = sizeY;
    totalLength = sizeX;
  }
  
  const uMin = -shapeWidth / 2;
  const uMax = shapeWidth / 2;
  const vMin = -shapeHeight / 2;
  const vMax = shapeHeight / 2;

  const getShape = (withGroove: boolean) => {
    const shape = new THREE.Shape();
    if (withGroove) {
      if (grooveFace === 'px' || grooveFace === 'py') {
        shape.moveTo(uMin, vMin);
        shape.lineTo(uMax, vMin);
        shape.lineTo(uMax, vMax);
        shape.lineTo(grooveLocalZMax, vMax);
        shape.lineTo(grooveLocalZMax, vMax - grooveDepth);
        shape.lineTo(grooveLocalZMin, vMax - grooveDepth);
        shape.lineTo(grooveLocalZMin, vMax);
        shape.lineTo(uMin, vMax);
        shape.lineTo(uMin, vMin);
      } else {
        shape.moveTo(uMin, vMax);
        shape.lineTo(uMin, vMin);
        shape.lineTo(grooveLocalZMin, vMin);
        shape.lineTo(grooveLocalZMin, vMin + grooveDepth);
        shape.lineTo(grooveLocalZMax, vMin + grooveDepth);
        shape.lineTo(grooveLocalZMax, vMin);
        shape.lineTo(uMax, vMin);
        shape.lineTo(uMax, vMax);
        shape.lineTo(uMin, vMax);
      }
    } else {
      shape.moveTo(uMin, vMin);
      shape.lineTo(uMax, vMin);
      shape.lineTo(uMax, vMax);
      shape.lineTo(uMin, vMax);
      shape.lineTo(uMin, vMin);
    }
    return shape;
  };

  const segments: THREE.BufferGeometry[] = [];
  let currentZ = 0;

  if (grooveStartOffset > 0) {
    const geo = new THREE.ExtrudeGeometry(getShape(false), { depth: grooveStartOffset, bevelEnabled: false, curveSegments: 6 });
    segments.push(geo);
    currentZ += grooveStartOffset;
  }

  const mainLength = totalLength - grooveStartOffset - grooveEndOffset;
  if (mainLength > 0) {
    const geo = new THREE.ExtrudeGeometry(getShape(true), { depth: mainLength, bevelEnabled: false, curveSegments: 6 });
    if (currentZ > 0) geo.translate(0, 0, currentZ);
    segments.push(geo);
    currentZ += mainLength;
  }

  if (grooveEndOffset > 0) {
    const geo = new THREE.ExtrudeGeometry(getShape(false), { depth: grooveEndOffset, bevelEnabled: false, curveSegments: 6 });
    if (currentZ > 0) geo.translate(0, 0, currentZ);
    segments.push(geo);
  }

  let finalGeo = segments.length > 1 
    ?     mergeBufferGeometries(segments)! 
    : segments[0];

  const positions = finalGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i);
    const v = positions.getY(i);
    const w = positions.getZ(i) - totalLength / 2;

    if (grooveFace === 'px' || grooveFace === 'nx') {
      positions.setXYZ(i, v, w, u);
    } else {
      positions.setXYZ(i, w, v, u);
    }
  }

  finalGeo.computeVertexNormals();
  finalGeo.computeBoundingBox();
  
  const bbox = finalGeo.boundingBox;
  if (!bbox) return finalGeo;
  
  const newPositions = finalGeo.attributes.position;
  const normals = finalGeo.attributes.normal;
  const uvs = new Float32Array(newPositions.count * 2);
  for (let i = 0; i < newPositions.count; i++) {
    const x = newPositions.getX(i) - bbox.min.x;
    const y = newPositions.getY(i) - bbox.min.y;
    const z = newPositions.getZ(i) - bbox.min.z;
    const nx = Math.abs(normals.getX(i));
    const ny = Math.abs(normals.getY(i));
    const nz = Math.abs(normals.getZ(i));

    if (nx > ny && nx > nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else if (ny > nx && ny > nz) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }
  finalGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  return finalGeo;
};

// Global Geometry Cache for Performance Optimization
const geometryCache = new Map<string, THREE.BufferGeometry>();

export const clearGeometryCache = () => {
  geometryCache.forEach(geo => geo.dispose());
  geometryCache.clear();
};

export const getCachedGeometry = (type: string, params: any, creator: () => THREE.BufferGeometry) => {
  const key = `${type}-${JSON.stringify(params)}`;
  if (geometryCache.has(key)) {
    return geometryCache.get(key)!;
  }
  const geo = creator();
  geometryCache.set(key, geo);
  return geo;
};
