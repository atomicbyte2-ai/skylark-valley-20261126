// SPDX-License-Identifier: MIT
// Builds the whole Ondine basin once: renderer, scene, terrain, distant ranges, forests, water,
// sky and the airfields; and re-lights it when a mission changes the time of day.

import * as THREE from 'three';
import { TerrainSurface, buildDistantRanges } from './terrain.js';
import { plantForests } from './forest.js';
import { Atmosphere } from './sky.js';
import { WaterSurface } from './water.js';
import { buildRunwayFields } from './runway.js';

export class WorldScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.3, 42000);
    this.terrain = new TerrainSurface(this.scene);
    this.ranges = buildDistantRanges(this.scene);
    this.forest = plantForests(this.scene, this.terrain);
    this.atmosphere = new Atmosphere(this.scene, this.renderer);
    this.water = new WaterSurface(this.scene);
    this.fields = buildRunwayFields(this.scene);
    this.timeOfDay = null;
    this.resize();
  }

  setTimeOfDay(name) {
    if (this.timeOfDay === name) return;
    this.timeOfDay = name;
    const preset = this.atmosphere.setTimeOfDay(name);
    this.terrain.bakeSunlight(this.atmosphere.sunDirection, preset.shadowTint);
    this.water.matchAtmosphere(this.atmosphere);
    const lightStrength = name === 'dusk' ? 1 : 0.55;
    for (const field of this.fields) field.setLightStrength(lightStrength);
  }

  fieldFor(runwayId) {
    return this.fields.find((f) => f.runway.id === runwayId);
  }

  resize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 800;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(elapsed, focus, wind) {
    this.water.update(elapsed);
    this.atmosphere.follow(this.camera, focus);
    for (const field of this.fields) field.update(elapsed, focus, wind);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
