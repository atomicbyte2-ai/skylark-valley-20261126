// SPDX-License-Identifier: MIT
// Terrain mesh for the Ondine basin: a height grid sampled from the world map, painted per vertex
// (lake bed, beach, fields, forest, rock, snow) and lit with baked sun shadows for the time of day.

import * as THREE from 'three';
import { terrainHeightAt, forestDensityAt, fieldPatchAt, WORLD_HALF_SIZE, WATER_LEVEL } from './world-map.js';
import { fractalNoise, ridgedNoise, smoothstep, lerp, clamp } from './noise.js';

export const TERRAIN_SEGMENTS = 384;

export function sampleHeightGrid(segments = TERRAIN_SEGMENTS) {
  const n = segments + 1;
  const heights = new Float32Array(n * n);
  const cell = (WORLD_HALF_SIZE * 2) / segments;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      heights[j * n + i] = terrainHeightAt(-WORLD_HALF_SIZE + i * cell, -WORLD_HALF_SIZE + j * cell);
    }
  }
  return { heights, n, cell, segments };
}

export function gridHeight(grid, x, z) {
  const gx = clamp((x + WORLD_HALF_SIZE) / grid.cell, 0, grid.segments - 0.001);
  const gz = clamp((z + WORLD_HALF_SIZE) / grid.cell, 0, grid.segments - 0.001);
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const h = grid.heights;
  const n = grid.n;
  const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * fx;
  const b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * fx;
  return a + (b - a) * fz;
}

const PALETTE = {
  lakeBedDeep: [0.05, 0.16, 0.2],
  lakeBedShallow: [0.38, 0.55, 0.47],
  sand: [0.83, 0.76, 0.58],
  meadow: [0.5, 0.64, 0.28],
  meadowDry: [0.7, 0.66, 0.36],
  fieldGold: [0.84, 0.7, 0.32],
  fieldGreen: [0.42, 0.6, 0.22],
  fieldRust: [0.66, 0.46, 0.26],
  forest: [0.19, 0.33, 0.15],
  alpine: [0.44, 0.47, 0.3],
  rock: [0.55, 0.5, 0.45],
  rockDark: [0.38, 0.35, 0.33],
  snow: [0.95, 0.96, 0.99],
};

function mix3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Paint one vertex from its height, slope and position (sRGB, before lighting). */
function paintSurface(x, z, h, slope) {
  if (h < WATER_LEVEL + 0.5) {
    return mix3(PALETTE.lakeBedShallow, PALETTE.lakeBedDeep, smoothstep(0, 45, WATER_LEVEL - h));
  }
  const grain = fractalNoise(x / 230, z / 230, 3, 41);
  let c = mix3(PALETTE.meadow, PALETTE.meadowDry, smoothstep(-0.2, 0.5, grain));

  // Farm patchwork on the gentle southern plain.
  const plain = smoothstep(130, 60, h) * smoothstep(0.1, 0.03, slope) * smoothstep(-800, 600, z);
  if (plain > 0) {
    const p = fieldPatchAt(x, z);
    const field = p < 0.33 ? PALETTE.fieldGold : p < 0.66 ? PALETTE.fieldGreen : PALETTE.fieldRust;
    c = mix3(c, mix3(field, PALETTE.meadow, p * 0.4), plain * 0.85);
  }

  const forest = forestDensityAt(x, z) * smoothstep(0.75, 0.45, slope) * smoothstep(950, 600, h) * smoothstep(8, 30, h);
  c = mix3(c, PALETTE.forest, forest * 0.85);
  c = mix3(c, PALETTE.alpine, smoothstep(450, 750, h) * 0.6);

  const rockiness = clamp(smoothstep(0.42, 0.75, slope) + smoothstep(700, 1000, h) * 0.5, 0, 1);
  const rock = mix3(PALETTE.rock, PALETTE.rockDark, smoothstep(-0.3, 0.4, ridgedNoise(x / 300, z / 300, 2, 3) - 0.5));
  c = mix3(c, rock, rockiness);

  const snowLine = 820 + 120 * fractalNoise(x / 900, z / 900, 3, 77);
  const snow = smoothstep(snowLine, snowLine + 130, h) * smoothstep(0.95, 0.6, slope);
  c = mix3(c, PALETTE.snow, snow);

  const beach = smoothstep(7, 1.5, h) * smoothstep(0.35, 0.15, slope);
  c = mix3(c, PALETTE.sand, beach);
  return c;
}

function srgbToLinear(v) {
  return Math.pow(v, 2.2);
}

export class TerrainSurface {
  constructor(scene) {
    this.grid = sampleHeightGrid();
    const { n, cell, heights } = this.grid;
    const geometry = new THREE.PlaneGeometry(WORLD_HALF_SIZE * 2, WORLD_HALF_SIZE * 2, n - 1, n - 1);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let k = 0; k < position.count; k++) position.setY(k, heights[k]);
    geometry.computeVertexNormals();
    this.geometry = geometry;
    this.baseColors = new Float32Array(position.count * 3);
    this.cavity = new Float32Array(position.count);
    const normals = geometry.attributes.normal;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = position.getX(k);
        const z = position.getZ(k);
        const slope = 1 - normals.getY(k);
        const c = paintSurface(x, z, heights[k], slope * 2.2);
        this.baseColors[k * 3] = c[0];
        this.baseColors[k * 3 + 1] = c[1];
        this.baseColors[k * 3 + 2] = c[2];
        // Cavity: valleys a little darker, crests a little brighter.
        if (i > 0 && j > 0 && i < n - 1 && j < n - 1) {
          const avg = (heights[k - 1] + heights[k + 1] + heights[k - n] + heights[k + n]) / 4;
          this.cavity[k] = clamp((heights[k] - avg) / (cell * 0.6), -0.35, 0.35);
        }
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  /** Bake shadows cast by the mountains for a sun direction (unit vector pointing at the sun). */
  bakeSunlight(sunDirection, shadowTint) {
    const { n, cell, heights } = this.grid;
    const colors = this.geometry.attributes.color;
    const position = this.geometry.attributes.position;
    const horizontal = Math.hypot(sunDirection.x, sunDirection.z) || 1e-6;
    const stepX = (sunDirection.x / horizontal) * cell * 0.75;
    const stepZ = (sunDirection.z / horizontal) * cell * 0.75;
    const rise = (sunDirection.y / horizontal) * cell * 0.75;
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k);
      const z = position.getZ(k);
      const h0 = heights[k];
      let lit = 1;
      if (h0 > WATER_LEVEL - 30) {
        let px = x;
        let pz = z;
        let ray = h0 + 2;
        for (let s = 0; s < 90; s++) {
          px += stepX;
          pz += stepZ;
          ray += rise;
          if (ray > 1600) break;
          if (Math.abs(px) > WORLD_HALF_SIZE || Math.abs(pz) > WORLD_HALF_SIZE) break;
          const g = gridHeight(this.grid, px, pz);
          if (g > ray) {
            lit = Math.max(0, lit - clamp((g - ray) / 25, 0, 1));
            if (lit <= 0) break;
          }
        }
      }
      const cav = 1 + this.cavity[k] * 0.9;
      for (let c = 0; c < 3; c++) {
        const base = this.baseColors[k * 3 + c] * cav;
        const shaded = lerp(base * shadowTint[c], base, lit);
        colors.array[k * 3 + c] = srgbToLinear(clamp(shaded, 0, 1));
      }
      this.sunVisibility ??= new Float32Array(position.count);
      this.sunVisibility[k] = lit;
    }
    colors.needsUpdate = true;
  }

  heightAt(x, z) {
    return gridHeight(this.grid, x, z);
  }
}

/** Far ranges beyond the playable map, fading into haze; the east stays open to the sea horizon. */
export function buildDistantRanges(scene) {
  const angular = 220;
  const radial = 10;
  const inner = 9500;
  const outer = 26000;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let r = 0; r <= radial; r++) {
    const t = r / radial;
    const radius = lerp(inner, outer, t);
    for (let a = 0; a <= angular; a++) {
      const ang = (a / angular) * Math.PI * 2;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const eastOpen = smoothstep(0.15, 0.55, Math.cos(ang));
      const ridge = ridgedNoise(Math.cos(ang) * 6 + t * 1.3, Math.sin(ang) * 6 + t * 0.7, 4, 61);
      const profile = Math.sin(t * Math.PI) * (0.55 + 0.45 * t);
      const h = (Math.pow(ridge, 1.4) * 2600 * profile + 60) * (1 - eastOpen) - 220 * eastOpen;
      positions.push(x, h, z);
      const snow = smoothstep(1100, 1700, h);
      const base = lerp(0.24, 0.85, snow);
      colors.push(srgbToLinear(base * 0.8), srgbToLinear(base * 0.86), srgbToLinear(base * 0.95));
    }
  }
  const row = angular + 1;
  for (let r = 0; r < radial; r++) {
    for (let a = 0; a < angular; a++) {
      const i0 = r * row + a;
      indices.push(i0, i0 + row, i0 + 1, i0 + 1, i0 + row, i0 + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(mesh);
  return mesh;
}
