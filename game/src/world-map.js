// SPDX-License-Identifier: MIT
// The geography of the Ondine basin: one analytic height function shared by the terrain mesh,
// the flight model's ground contact, the minimap and the mission planner.

import { fractalNoise, ridgedNoise, smoothstep, lerp } from './noise.js';

export const WORLD_HALF_SIZE = 8000;
export const WATER_LEVEL = 0;
const SEED = 7;

// Runways: centre, heading (deg true, direction of the "low" numbered end -> high), length, width, elevation.
export const RUNWAYS = [
  { id: 'vessel', name: 'Vessel Field', x: -300, z: 2700, headingDeg: 0, length: 1150, width: 32, elevation: 26 },
  { id: 'hawthorn', name: 'Hawthorn Strip', x: -2900, z: -4700, headingDeg: 62, length: 720, width: 24, elevation: 430 },
];

export const LAKE = { x: 2700, z: 600, radius: 2300 };

/** Centre line of Kestrel Gorge, the valley that cuts north through the Corran Peaks. */
export function gorgeCentreX(z) {
  return 700 * Math.sin((z + 400) / 1250) - 0.06 * (z + 400);
}

export function runwayFrame(runway) {
  const h = (runway.headingDeg * Math.PI) / 180;
  // forward = direction of travel when departing toward the heading; north is -Z, east is +X
  return { fx: Math.sin(h), fz: -Math.cos(h), rx: Math.cos(h), rz: Math.sin(h) };
}

/** Local runway coordinates: along (m, + toward heading) and across (m, + to the right). */
export function toRunwayLocal(runway, x, z) {
  const f = runwayFrame(runway);
  const dx = x - runway.x;
  const dz = z - runway.z;
  return { along: dx * f.fx + dz * f.fz, across: dx * f.rx + dz * f.rz };
}

export function fromRunwayLocal(runway, along, across) {
  const f = runwayFrame(runway);
  return { x: runway.x + f.fx * along + f.rx * across, z: runway.z + f.fz * along + f.rz * across };
}

function naturalHeightAt(x, z) {
  const rolling = 30 + 38 * fractalNoise(x / 1600, z / 1600, 4, SEED);
  const hills = 140 * Math.max(0, fractalNoise(x / 2600 + 3.1, z / 2600, 3, SEED + 3)) * smoothstep(1500, -1500, x);
  const northMask = smoothstep(200, -2600, z + 600 * fractalNoise(x / 3000, 0.5, 2, SEED + 9));
  const westMask = smoothstep(-2500, -6500, x) * 0.7;
  const mountainMask = Math.min(1, northMask + westMask);
  const ridge = ridgedNoise(x / 2700, z / 2700, 5, SEED + 5);
  let peaks = Math.pow(ridge, 1.55) * 1500 * mountainMask;

  // Kestrel Gorge carves a winding valley through the range.
  if (z < 600) {
    const d = Math.abs(x - gorgeCentreX(z));
    const carve = smoothstep(160, 1250, d);
    peaks *= lerp(0.04, 1, carve);
  }

  let h = rolling + hills + peaks;

  // Lake Ondine: an irregular basin east of the field.
  const lx = x - LAKE.x;
  const lz = (z - LAKE.z) * 1.25;
  const wobble = 420 * fractalNoise(x / 900, z / 900, 3, SEED + 11);
  const lakeDist = Math.sqrt(lx * lx + lz * lz) + wobble;
  h -= (1 - smoothstep(LAKE.radius * 0.55, LAKE.radius * 1.15, lakeDist)) * 110;

  // The open sea beyond the eastern shore.
  const seaEdge = x + 500 * fractalNoise(z / 1400, 1.7, 3, SEED + 13);
  h -= smoothstep(4300, 6800, seaEdge) * 170;

  return h;
}

function runwayFlattenWeight(runway, x, z) {
  const { along, across } = toRunwayLocal(runway, x, z);
  const outA = Math.max(0, Math.abs(along) - runway.length / 2 - 120);
  const outC = Math.max(0, Math.abs(across) - runway.width / 2 - 70);
  const dist = Math.sqrt(outA * outA + outC * outC);
  return 1 - smoothstep(0, 340, dist);
}

export function terrainHeightAt(x, z) {
  let h = naturalHeightAt(x, z);
  for (const runway of RUNWAYS) {
    const w = runwayFlattenWeight(runway, x, z);
    if (w > 0) h = lerp(h, runway.elevation, w);
  }
  return h;
}

/** Which runway (if any) is under a point, with its local coordinates. */
export function runwayUnder(x, z) {
  for (const runway of RUNWAYS) {
    const local = toRunwayLocal(runway, x, z);
    if (Math.abs(local.along) <= runway.length / 2 && Math.abs(local.across) <= runway.width / 2) {
      return { runway, ...local };
    }
  }
  return null;
}

export function surfaceAt(x, z) {
  if (runwayUnder(x, z)) return 'runway';
  return terrainHeightAt(x, z) < WATER_LEVEL ? 'water' : 'ground';
}

/** Ground or water height the aircraft can touch. */
export function contactHeightAt(x, z) {
  return Math.max(WATER_LEVEL, terrainHeightAt(x, z));
}

/** A forest density mask (0..1) used for tree placement and terrain tint. */
export function forestDensityAt(x, z) {
  return smoothstep(0.05, 0.4, fractalNoise(x / 700 + 9.2, z / 700 - 4.4, 4, SEED + 21));
}

/** Farm field patchwork on the low southern plain. */
export function fieldPatchAt(x, z) {
  const cell = 260;
  const ix = Math.floor((x + 40 * Math.sin(z / 300)) / cell);
  const iz = Math.floor((z + 40 * Math.sin(x / 340)) / (cell * 0.7));
  const h = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
