// SPDX-License-Identifier: MIT
// Ring gates for the course missions: glowing torus gates, the next one pulsing, pass detection
// through the ring plane, and the course layout along Kestrel Gorge.

import * as THREE from 'three';
import { gorgeCentreX, terrainHeightAt } from './world-map.js';

function makeHaloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,200,90,0)');
  g.addColorStop(0.62, 'rgba(255,190,80,0.0)');
  g.addColorStop(0.8, 'rgba(255,190,80,0.55)');
  g.addColorStop(0.9, 'rgba(255,170,60,0.25)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** Two low rings skimming Lake Ondine toward the sunset, then ring centres up Kestrel Gorge. */
export const LAKE_RINGS = [
  new THREE.Vector3(2300, 38, 1500),
  new THREE.Vector3(1500, 46, 800),
];

export function layoutGorgeCourse(count = 10) {
  const points = LAKE_RINGS.map((p) => p.clone());
  for (let i = 0; i < count; i++) {
    const z = 600 - i * 620;
    const x = gorgeCentreX(z) + Math.sin(i * 1.7) * 90;
    let floor = 0;
    for (const dz of [-150, 0, 150]) floor = Math.max(floor, terrainHeightAt(x, z + dz), terrainHeightAt(x + 60, z + dz), terrainHeightAt(x - 60, z + dz));
    points.push(new THREE.Vector3(x, floor + 70 + (i % 3) * 25, z));
  }
  return points;
}

export class RingCourse {
  constructor(scene, centres, radius = 26) {
    this.scene = scene;
    this.radius = radius;
    this.group = new THREE.Group();
    this.halo = makeHaloTexture();
    this.rings = centres.map((centre, index) => {
      const next = centres[index + 1] ?? centre.clone().add(centre.clone().sub(centres[index - 1] ?? centre).setY(0));
      const holder = new THREE.Group();
      holder.position.copy(centre);
      holder.lookAt(next.x, centre.y, next.z);
      const material = new THREE.MeshBasicMaterial({ color: 0xffb53d, transparent: true, opacity: 1, fog: true });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.6, 12, 64), material);
      holder.add(torus);
      const innerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const inner = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.45, 8, 64), innerMaterial);
      holder.add(inner);
      const haloMaterial = new THREE.SpriteMaterial({ map: this.halo, color: 0xffc060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const halo = new THREE.Sprite(haloMaterial);
      halo.scale.setScalar(radius * 3.3);
      holder.add(halo);
      // Chevrons on the ring pointing the way through.
      for (let k = 0; k < 4; k++) {
        const chevron = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 3), innerMaterial);
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        chevron.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        chevron.rotation.x = Math.PI / 2;
        holder.add(chevron);
      }
      this.group.add(holder);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.quaternion);
      return { centre: centre.clone(), normal, holder, material, innerMaterial, haloMaterial, passed: false };
    });
    this.nextIndex = 0;
    scene.add(this.group);
  }

  get total() {
    return this.rings.length;
  }

  get nextRing() {
    return this.rings[this.nextIndex] ?? null;
  }

  /** Check whether the segment previous->current crossed the next ring inside its radius. */
  checkPass(previous, current) {
    const ring = this.nextRing;
    if (!ring) return false;
    const a = previous.clone().sub(ring.centre).dot(ring.normal);
    const b = current.clone().sub(ring.centre).dot(ring.normal);
    if (a < 0 && b >= 0) {
      const t = a / (a - b);
      const hit = previous.clone().lerp(current, t);
      if (hit.distanceTo(ring.centre) <= this.radius + 2) {
        ring.passed = true;
        ring.holder.visible = false;
        this.nextIndex++;
        return true;
      }
    }
    return false;
  }

  /** Missed rings are skipped once the aircraft is well past them. */
  checkMissed(current) {
    const ring = this.nextRing;
    if (!ring) return false;
    const ahead = current.clone().sub(ring.centre).dot(ring.normal);
    if (ahead > 160) {
      ring.holder.visible = false;
      this.nextIndex++;
      return true;
    }
    return false;
  }

  update(elapsed, camera) {
    this.rings.forEach((ring, index) => {
      if (ring.passed) return;
      const isNext = index === this.nextIndex;
      const later = index - this.nextIndex;
      const pulse = 0.75 + 0.25 * Math.sin(elapsed * 5);
      ring.material.color.set(isNext ? 0xffb53d : 0xe9c27a);
      ring.material.opacity = isNext ? 1 : Math.max(0.25, 0.75 - later * 0.12);
      ring.innerMaterial.opacity = isNext ? 0.95 * pulse : 0.3;
      ring.haloMaterial.opacity = isNext ? pulse : 0.15;
      ring.holder.visible = later >= 0;
    });
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
