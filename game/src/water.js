// SPDX-License-Identifier: MIT
// Lake Ondine and the sea: one large surface with wave normals, sky reflection, sun glitter and haze.

import * as THREE from 'three';
import { WATER_LEVEL } from './world-map.js';

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uDeep;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;

  vec2 waveSlope(vec2 p, vec2 dir, float freq, float speed, float amp) {
    float phase = dot(p, dir) * freq + uTime * speed;
    return dir * cos(phase) * amp * freq;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 s = vec2(0.0);
    s += waveSlope(p, normalize(vec2(1.0, 0.3)), 0.021, 1.1, 1.1);
    s += waveSlope(p, normalize(vec2(-0.4, 1.0)), 0.047, 1.7, 0.5);
    s += waveSlope(p, normalize(vec2(0.8, -0.7)), 0.113, 2.4, 0.16);
    s += waveSlope(p, normalize(vec2(-1.0, -0.2)), 0.29, 3.3, 0.05);
    s += waveSlope(p, normalize(vec2(0.3, -1.0)), 0.71, 4.1, 0.016);
    vec3 toCamera = cameraPosition - vWorld;
    float dist = length(toCamera);
    vec3 view = toCamera / dist;
    // Waves flatten with distance so the far water reads as a mirror of the sky.
    float detail = clamp(1.0 - dist / 9000.0, 0.15, 1.0);
    vec3 normal = normalize(vec3(-s.x * detail, 1.0, -s.y * detail));
    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(normal, view), 0.0), 5.0);
    vec3 reflected = reflect(-view, normal);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(reflected.y, 0.0, 1.0), 0.35)) * 0.92;
    vec3 color = mix(uDeep, sky, fresnel);
    float glint = pow(max(dot(reflected, uSunDirection), 0.0), 260.0) * 6.0
                + pow(max(dot(reflected, uSunDirection), 0.0), 18.0) * 0.25;
    color += uSunColor * glint;
    float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
    color = mix(color, uFogColor, fog);
    float alpha = mix(0.82, 1.0, clamp(fresnel * 1.5 + dist / 2500.0, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WaterSurface {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uZenith: { value: new THREE.Color(0x3060b0) },
      uHorizon: { value: new THREE.Color(0xc0d0e0) },
      uDeep: { value: new THREE.Color(0x0b2a3a) },
      uFogColor: { value: new THREE.Color(0xffffff) },
      uFogDensity: { value: 0.0001 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
    });
    const geometry = new THREE.PlaneGeometry(64000, 64000, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  matchAtmosphere(atmosphere) {
    const preset = atmosphere.preset;
    this.uniforms.uSunDirection.value.copy(atmosphere.sunDirection);
    this.uniforms.uSunColor.value.set(preset.sunColor);
    this.uniforms.uZenith.value.set(preset.zenith);
    this.uniforms.uHorizon.value.set(preset.horizon);
    this.uniforms.uFogColor.value.set(preset.haze);
    this.uniforms.uFogDensity.value = preset.fogDensity;
    this.uniforms.uDeep.value.set(atmosphere.timeOfDayName === 'dusk' ? 0x0b2236 : 0x0b3a52);
  }

  update(elapsedSeconds) {
    this.uniforms.uTime.value = elapsedSeconds;
  }
}
