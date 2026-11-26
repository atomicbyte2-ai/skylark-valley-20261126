// SPDX-License-Identifier: MIT
// Sky dome, sun, clouds, haze and lights, set from a time-of-day preset.

import * as THREE from 'three';
import { createRandom } from './noise.js';

export const TIME_OF_DAY = {
  golden: {
    sunAzimuthDeg: 292, sunElevationDeg: 13,
    zenith: 0x2a5cb4, horizon: 0xf7c38a, haze: 0xd8bc9c, sunColor: 0xffcf98,
    sunIntensity: 3.8, hemiSky: 0xc4d8ff, hemiGround: 0x6a5a3c, hemiIntensity: 1.95,
    shadowTint: [0.64, 0.66, 0.82], cloudTint: 0xffe6cc, fogDensity: 0.000068, exposure: 1.12,
  },
  dusk: {
    sunAzimuthDeg: 262, sunElevationDeg: 2.2,
    zenith: 0x1d2a5e, horizon: 0xff8a4c, haze: 0xb77562, sunColor: 0xff9455,
    sunIntensity: 2.6, hemiSky: 0x8a8ed6, hemiGround: 0x5a4436, hemiIntensity: 1.9,
    shadowTint: [0.5, 0.48, 0.72], cloudTint: 0xff9f86, fogDensity: 0.00009, exposure: 1.3,
  },
  morning: {
    sunAzimuthDeg: 120, sunElevationDeg: 32,
    zenith: 0x3b78d4, horizon: 0xcfe1f2, haze: 0xb9cde0, sunColor: 0xfff3e0,
    sunIntensity: 3.2, hemiSky: 0xcfe2ff, hemiGround: 0x4f5a3a, hemiIntensity: 1.35,
    shadowTint: [0.5, 0.56, 0.72], cloudTint: 0xffffff, fogDensity: 0.00006, exposure: 1.0,
  },
};

export function sunDirectionFor(preset) {
  const az = (preset.sunAzimuthDeg * Math.PI) / 180;
  const el = (preset.sunElevationDeg * Math.PI) / 180;
  // Compass azimuth: 0 = north (-Z), 90 = east (+X).
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  varying vec3 vDirection;
  void main() {
    vec3 dir = normalize(vDirection);
    float up = clamp(dir.y, -1.0, 1.0);
    vec3 mid = mix(uZenith, vec3(0.78, 0.86, 0.95), 0.5);
    vec3 color = mix(uHorizon, mid, smoothstep(0.0, 0.16, up));
    color = mix(color, uZenith, smoothstep(0.12, 0.75, up));
    color = mix(color, uHaze, smoothstep(0.02, -0.08, up));
    float sunDot = max(dot(dir, uSunDirection), 0.0);
    float glow = pow(sunDot, 6.0) * 0.55 + pow(sunDot, 48.0) * 0.6;
    float horizonBand = exp(-abs(up) * 9.0);
    color += uSunColor * glow * (0.55 + horizonBand);
    float disc = smoothstep(0.99955, 0.99975, sunDot);
    color = mix(color, vec3(1.0, 0.97, 0.9) * 1.6, disc);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeCloudTexture(seed) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');
  const random = createRandom(seed);
  for (let i = 0; i < 26; i++) {
    const x = size * (0.18 + 0.64 * random());
    const y = size * 0.5 * (0.35 + 0.35 * random());
    const r = size * (0.07 + 0.11 * random());
    const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(250,250,252,0.25)');
    g.addColorStop(1, 'rgba(240,242,248,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Flat, slightly shaded base like a fair-weather cumulus.
  const base = ctx.createLinearGradient(0, size * 0.25, 0, size * 0.5);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(120,120,140,0.0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.skyUniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial);
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0001);

    this.clouds = this.buildClouds();
    this.sunDirection = new THREE.Vector3();
    this.preset = null;
  }

  buildClouds() {
    const group = new THREE.Group();
    const random = createRandom(2026);
    const textures = [makeCloudTexture(1), makeCloudTexture(2), makeCloudTexture(3)];
    this.cloudMaterials = textures.map((map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true }));
    for (let c = 0; c < 46; c++) {
      const angle = random() * Math.PI * 2;
      const dist = 2500 + random() * 15000;
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist - 2000;
      const cy = 1650 + random() * 700;
      const puffs = 3 + Math.floor(random() * 4);
      for (let p = 0; p < puffs; p++) {
        const sprite = new THREE.Sprite(this.cloudMaterials[Math.floor(random() * 3)]);
        const w = 900 + random() * 1300;
        sprite.scale.set(w, w * 0.5, 1);
        sprite.position.set(cx + (random() - 0.5) * 1400, cy + (random() - 0.5) * 160, cz + (random() - 0.5) * 900);
        group.add(sprite);
      }
    }
    this.scene.add(group);
    return group;
  }

  setTimeOfDay(name) {
    const preset = TIME_OF_DAY[name];
    this.preset = preset;
    this.timeOfDayName = name;
    this.sunDirection.copy(sunDirectionFor(preset));
    this.skyUniforms.uZenith.value.set(preset.zenith);
    this.skyUniforms.uHorizon.value.set(preset.horizon);
    this.skyUniforms.uHaze.value.set(preset.haze);
    this.skyUniforms.uSunColor.value.set(preset.sunColor);
    this.skyUniforms.uSunDirection.value.copy(this.sunDirection);
    this.sun.color.set(preset.sunColor);
    this.sun.intensity = preset.sunIntensity;
    this.hemi.color.set(preset.hemiSky);
    this.hemi.groundColor.set(preset.hemiGround);
    this.hemi.intensity = preset.hemiIntensity;
    this.scene.fog.color.set(preset.haze);
    this.scene.fog.density = preset.fogDensity;
    for (const m of this.cloudMaterials) m.color.set(preset.cloudTint);
    this.renderer.toneMappingExposure = preset.exposure;
    return preset;
  }

  /** Keep the dome and the shadow camera centred on what the player sees. */
  follow(camera, focus) {
    this.skyDome.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDirection, 300);
    this.sun.target.position.copy(focus);
  }
}
