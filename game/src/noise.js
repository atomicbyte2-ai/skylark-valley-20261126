// SPDX-License-Identifier: MIT
// Seeded random numbers and 2D value noise used to shape the world deterministically.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashLattice(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothFade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise2D(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothFade(x - ix);
  const fy = smoothFade(y - iy);
  const a = hashLattice(ix, iy, seed);
  const b = hashLattice(ix + 1, iy, seed);
  const c = hashLattice(ix, iy + 1, seed);
  const d = hashLattice(ix + 1, iy + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/** Gradient (Perlin-style) noise in roughly -1..1, free of the grid look of value noise. */
export function gradientNoise2D(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = smoothFade(fx);
  const v = smoothFade(fy);
  const g = (cx, cy, dx, dy) => {
    const a = hashLattice(cx, cy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = g(ix, iy, fx, fy);
  const n10 = g(ix + 1, iy, fx - 1, fy);
  const n01 = g(ix, iy + 1, fx, fy - 1);
  const n11 = g(ix + 1, iy + 1, fx - 1, fy - 1);
  const top = n00 + (n10 - n00) * u;
  const bottom = n01 + (n11 - n01) * u;
  return (top + (bottom - top) * v) * 1.41;
}

// Each octave is rotated so features never line up with the lattice.
const OCTAVE_COS = Math.cos(0.62);
const OCTAVE_SIN = Math.sin(0.62);

export function fractalNoise(x, y, octaves, seed = 0) {
  let sum = 0;
  let amplitude = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * gradientNoise2D(px, py, seed + i * 17);
    norm += amplitude;
    amplitude *= 0.5;
    const nx = (px * OCTAVE_COS - py * OCTAVE_SIN) * 2.03 + 5.3;
    py = (px * OCTAVE_SIN + py * OCTAVE_COS) * 2.03 - 1.7;
    px = nx;
  }
  return sum / norm;
}

/** Sharp-crested ridges (0..1) for mountain ranges. */
export function ridgedNoise(x, y, octaves, seed = 0) {
  let sum = 0;
  let amplitude = 0.5;
  let weight = 1;
  let norm = 0;
  let px = x + 0.35 * gradientNoise2D(x * 0.5, y * 0.5, seed + 99);
  let py = y + 0.35 * gradientNoise2D(x * 0.5 + 7, y * 0.5, seed + 98);
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(gradientNoise2D(px, py, seed + i * 31));
    n *= n;
    sum += n * amplitude * weight;
    weight = Math.min(1, n * 1.8);
    norm += amplitude;
    amplitude *= 0.5;
    const nx = (px * OCTAVE_COS - py * OCTAVE_SIN) * 2.1 + 3.1;
    py = (px * OCTAVE_SIN + py * OCTAVE_COS) * 2.1 + 8.4;
    px = nx;
  }
  return sum / norm;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
