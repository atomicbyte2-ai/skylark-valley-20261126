// SPDX-License-Identifier: MIT
// Instanced conifer forests scattered by the world's forest mask, below the tree line.

import * as THREE from 'three';
import { forestDensityAt, runwayUnder, RUNWAYS, toRunwayLocal, WORLD_HALF_SIZE, WATER_LEVEL } from './world-map.js';
import { gridHeight } from './terrain.js';
import { createRandom } from './noise.js';

function buildConiferGeometry() {
  const crownLow = new THREE.ConeGeometry(0.5, 0.62, 7);
  crownLow.translate(0, 0.42, 0);
  const crownHigh = new THREE.ConeGeometry(0.36, 0.5, 7);
  crownHigh.translate(0, 0.74, 0);
  const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 5);
  trunk.translate(0, 0.1, 0);
  const parts = [crownLow, crownHigh, trunk];
  const shades = [1, 1.12, 0.45];
  const positions = [];
  const normals = [];
  const colors = [];
  parts.forEach((g, index) => {
    const ng = g.toNonIndexed();
    positions.push(...ng.attributes.position.array);
    normals.push(...ng.attributes.normal.array);
    for (let i = 0; i < ng.attributes.position.count; i++) {
      const s = shades[index];
      if (index === 2) colors.push(0.2 * s, 0.12 * s, 0.07 * s);
      else colors.push(s, s, s);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function plantForests(scene, terrain, count = 7000) {
  const random = createRandom(99);
  const geometry = buildConiferGeometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 12) {
    attempts++;
    const x = (random() * 2 - 1) * WORLD_HALF_SIZE * 0.98;
    const z = (random() * 2 - 1) * WORLD_HALF_SIZE * 0.98;
    const density = forestDensityAt(x, z);
    if (random() > density * 0.95) continue;
    const h = gridHeight(terrain.grid, x, z);
    if (h < WATER_LEVEL + 6 || h > 900 - random() * 200) continue;
    const slope = Math.abs(gridHeight(terrain.grid, x + 30, z) - h) + Math.abs(gridHeight(terrain.grid, x, z + 30) - h);
    if (slope > 34) continue;
    if (runwayUnder(x, z) || nearAnyRunway(x, z)) continue;
    const height = 13 + random() * 15;
    position.set(x, h - 1, z);
    quaternion.setFromAxisAngle(up, random() * Math.PI * 2);
    scale.set(height * (0.8 + random() * 0.3), height, height * (0.8 + random() * 0.3));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(placed, matrix);
    const g = 0.75 + random() * 0.35;
    tint.setRGB(0.16 * g, 0.3 * g, 0.15 * g, THREE.SRGBColorSpace);
    if (h > 550) tint.offsetHSL(0.02, -0.08, -0.02);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function nearAnyRunway(x, z) {
  for (const runway of RUNWAYS) {
    const { along, across } = toRunwayLocal(runway, x, z);
    if (Math.abs(along) < runway.length / 2 + 700 && Math.abs(across) < 160) return true;
  }
  return false;
}
