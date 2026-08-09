/**
 * Generates minimal, valid GLB placeholder models for the kitchen cabinets.
 *
 * The generated boxes are authored at *intrinsic* standard dimensions so the
 * runtime X-scale `targetWidth / standardWidth` maps 1:1 onto the model:
 *   - base_cabinet : 0.8 x 0.85 x 0.6  (w x h x d)
 *   - wall_cabinet : 0.8 x 0.70 x 0.35
 *   - filler_piece : 0.1 x 0.85 x 0.6
 *
 * Swap these files for real artist-authored cabinets later - the loader in
 * src/components/CabinetModel.tsx only requires matching intrinsic sizes.
 *
 * Usage: node scripts/generate-models.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "models");

function boxMeshGLB({ name, color, width, height, depth }) {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  const faces = [
    { n: [0, 0, 1], verts: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
    { n: [0, 0, -1], verts: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    { n: [1, 0, 0], verts: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
    { n: [-1, 0, 0], verts: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
    { n: [0, 1, 0], verts: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]] },
    { n: [0, -1, 0], verts: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]] },
  ];

  const positions = [];
  const normals = [];
  const indices = [];

  for (const face of faces) {
    const start = positions.length / 3;
    for (const v of face.verts) {
      positions.push(...v);
      normals.push(...face.n);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  const posBytes = positions.length * 4;
  const normalBytes = normals.length * 4;
  const indexBytes = indices.length * 2;
  const byteLength = posBytes + normalBytes + indexBytes;

  const json = {
    asset: { version: "2.0", generator: "procedural-box" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
        name,
      },
    ],
    materials: [
      {
        name,
        pbrMetallicRoughness: {
          baseColorFactor: color,
          metallicFactor: 0.05,
          roughnessFactor: 0.9,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [-hw, -hh, -hd],
        max: [hw, hh, hd],
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normalBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normalBytes, byteLength: indexBytes, target: 34963 },
    ],
    buffers: [{ byteLength }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(json));
  const padJson = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (byteLength % 4)) % 4;
  const totalLen = 12 + 8 + jsonBuf.length + padJson + 8 + byteLength + binPad;

  const buf = Buffer.alloc(totalLen);
  buf.writeUInt32LE(0x46546c67, 0); // 'glTF'
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(totalLen, 8);

  const jsonChunkLength = jsonBuf.length + padJson;
  buf.writeUInt32LE(jsonChunkLength, 12);
  buf.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBuf.copy(buf, 20);
  for (let i = jsonBuf.length; i < jsonChunkLength; i++) {
    buf[i + 20] = 0x20;
  }

  buf.writeUInt32LE(byteLength, 20 + jsonChunkLength);
  buf.writeUInt32LE(0x004e4942, 24 + jsonChunkLength); // 'BIN\0'

  let off = 28 + jsonChunkLength;
  for (const v of positions) {
    buf.writeFloatLE(v, off);
    off += 4;
  }
  for (const n of normals) {
    buf.writeFloatLE(n, off);
    off += 4;
  }
  for (const i of indices) {
    buf.writeUInt16LE(i, off);
    off += 2;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${name}.glb`);
  fs.writeFileSync(out, buf);
  console.log(`wrote ${out} (${totalLen} bytes)`);
}

boxMeshGLB({
  name: "base_cabinet",
  color: [0.42, 0.3, 0.22, 1],
  width: 0.8,
  height: 0.85,
  depth: 0.6,
});
boxMeshGLB({
  name: "wall_cabinet",
  color: [0.95, 0.95, 0.97, 1],
  width: 0.8,
  height: 0.7,
  depth: 0.35,
});
boxMeshGLB({
  name: "filler_piece",
  color: [0.36, 0.26, 0.19, 1],
  width: 0.1,
  height: 0.85,
  depth: 0.6,
});

// ---- Wall-anchored placement catalog models --------------------------------
boxMeshGLB({
  name: "pantry_tower",
  color: [0.95, 0.93, 0.9, 1],
  width: 0.8,
  height: 2.1,
  depth: 0.6,
});
boxMeshGLB({
  name: "appliance_tower",
  color: [0.78, 0.82, 0.86, 1],
  width: 1.0,
  height: 2.0,
  depth: 0.7,
});
boxMeshGLB({
  name: "wall_unit",
  color: [0.96, 0.96, 0.98, 1],
  width: 0.8,
  height: 0.7,
  depth: 0.35,
});
boxMeshGLB({
  name: "corner_unit",
  color: [0.45, 0.32, 0.24, 1],
  width: 0.9,
  height: 0.85,
  depth: 0.9,
});

// ---- Wall cutout frame models (doors / windows) ----------------------------
boxMeshGLB({
  name: "door_frame",
  color: [0.93, 0.9, 0.85, 1],
  width: 0.9,
  height: 2.1,
  depth: 0.15,
});
boxMeshGLB({
  name: "sliding_door",
  color: [0.94, 0.92, 0.88, 1],
  width: 1.8,
  height: 2.1,
  depth: 0.15,
});
boxMeshGLB({
  name: "window_frame",
  color: [0.96, 0.95, 0.93, 1],
  width: 1.0,
  height: 1.2,
  depth: 0.15,
});
