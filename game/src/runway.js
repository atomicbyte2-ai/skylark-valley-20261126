// SPDX-License-Identifier: MIT
// Runways: painted asphalt, edge/threshold/approach lights, a PAPI that reads the aircraft's glide
// path, and the buildings of each field (hangar, tower, fuel tanks, windsock).

import * as THREE from 'three';
import { RUNWAYS, fromRunwayLocal, toRunwayLocal } from './world-map.js';
import { createRandom } from './noise.js';

function runwayNumber(headingDeg) {
  const n = Math.round(headingDeg / 10) % 36 || 36;
  return String(n).padStart(2, '0');
}

function paintRunwayMarkings(runway) {
  const canvas = document.createElement('canvas');
  const pxPerMetre = 2.4;
  canvas.width = Math.round(runway.width * 8);
  canvas.height = Math.min(4096, Math.round(runway.length * pxPerMetre));
  const ctx = canvas.getContext('2d');
  const random = createRandom(runway.length);
  const w = canvas.width;
  const h = canvas.height;
  const m = h / runway.length; // pixels per metre along
  const mw = w / runway.width;
  ctx.fillStyle = '#3b3d40';
  ctx.fillRect(0, 0, w, h);
  // Worn asphalt texture.
  for (let i = 0; i < 2600; i++) {
    const shade = 50 + Math.floor(random() * 22);
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 3},0.35)`;
    ctx.fillRect(random() * w, random() * h, 2 + random() * 5, 2 + random() * 9);
  }
  // Tyre marks in the touchdown zones.
  ctx.fillStyle = 'rgba(18,18,20,0.45)';
  for (const end of [0, 1]) {
    for (let i = 0; i < 40; i++) {
      const y = end === 0 ? h - (100 + random() * 330) * m : (100 + random() * 330) * m;
      ctx.fillRect(w / 2 + (random() - 0.5) * 6 * mw - 3, y, 6, 40 + random() * 120);
    }
  }
  ctx.fillStyle = '#f3f1ea';
  // Edge lines.
  ctx.fillRect(0.6 * mw, 0, 0.9 * mw, h);
  ctx.fillRect(w - 1.5 * mw, 0, 0.9 * mw, h);
  // Centre line dashes.
  for (let y = 80 * m; y < h - 80 * m; y += 50 * m) ctx.fillRect(w / 2 - 0.45 * mw, y, 0.9 * mw, 30 * m);
  const drawEnd = (atBottom, label) => {
    ctx.save();
    if (!atBottom) {
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
    }
    // Threshold piano keys.
    const keys = 8;
    const keyW = (runway.width - 6) / (keys * 2);
    for (let k = 0; k < keys; k++) {
      const x = (3 + keyW * (2 * k + 0.5)) * mw;
      ctx.fillRect(x, h - 36 * m, keyW * mw, 30 * m);
      if (k === keys / 2 - 1) k++;
    }
    // Runway number.
    ctx.save();
    ctx.translate(w / 2, h - 62 * m);
    ctx.font = `bold ${Math.round(18 * m * 1.4)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.scale(mw / (m * 1.4), 1);
    ctx.fillText(label, 0, 0);
    ctx.restore();
    // Aiming point bars and touchdown zone marks.
    ctx.fillRect(w / 2 - 9 * mw, h - 330 * m, 4 * mw, 45 * m);
    ctx.fillRect(w / 2 + 5 * mw, h - 330 * m, 4 * mw, 45 * m);
    for (const d of [150, 450]) {
      ctx.fillRect(w / 2 - 9 * mw, h - d * m, 1.6 * mw, 22 * m);
      ctx.fillRect(w / 2 - 6.4 * mw, h - d * m, 1.6 * mw, 22 * m);
      ctx.fillRect(w / 2 + 4.8 * mw, h - d * m, 1.6 * mw, 22 * m);
      ctx.fillRect(w / 2 + 7.4 * mw, h - d * m, 1.6 * mw, 22 * m);
    }
    ctx.restore();
  };
  drawEnd(true, runwayNumber(runway.headingDeg));
  drawEnd(false, runwayNumber(runway.headingDeg + 180));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const GLOW = { texture: null };
function glowTexture() {
  GLOW.texture ??= makeGlowTexture();
  return GLOW.texture;
}

function lightPoints(points, size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.r, p.g, p.b]), 3));
  const material = new THREE.PointsMaterial({
    size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  return new THREE.Points(geometry, material);
}

class RunwayField {
  constructor(scene, runway) {
    this.runway = runway;
    this.group = new THREE.Group();
    const y = runway.elevation;
    const geometry = new THREE.PlaneGeometry(runway.width, runway.length);
    geometry.rotateX(-Math.PI / 2);
    const asphalt = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: paintRunwayMarkings(runway) }));
    asphalt.position.set(runway.x, y + 0.12, runway.z);
    asphalt.rotation.y = -THREE.MathUtils.degToRad(runway.headingDeg);
    asphalt.receiveShadow = true;
    this.group.add(asphalt);
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(runway.width + 22, runway.length + 70).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x8c8a66 }));
    shoulder.position.set(runway.x, y + 0.05, runway.z);
    shoulder.rotation.y = asphalt.rotation.y;
    shoulder.receiveShadow = true;
    this.group.add(shoulder);

    const half = runway.length / 2;
    const at = (along, across, height = 0.6) => {
      const p = fromRunwayLocal(runway, along, across);
      return new THREE.Vector3(p.x, y + height, p.z);
    };
    const lights = [];
    const push = (v, color) => lights.push({ x: v.x, y: v.y, z: v.z, r: color[0], g: color[1], b: color[2] });
    for (let a = -half; a <= half + 0.1; a += 55) {
      const amber = Math.abs(a) > half - 400 ? [1.0, 0.8, 0.45] : [1, 0.97, 0.9];
      push(at(a, -runway.width / 2 - 1.5), amber);
      push(at(a, runway.width / 2 + 1.5), amber);
    }
    for (let c = -runway.width / 2; c <= runway.width / 2; c += 3) {
      push(at(-half - 2, c), [0.25, 1, 0.45]);
      push(at(half + 2, c), [1, 0.25, 0.2]);
    }
    this.edgeLights = lightPoints(lights, 7);
    this.group.add(this.edgeLights);

    // Approach lighting: a centre row with crossbars, and a sequenced "rabbit" strobe.
    const approach = [];
    this.rabbit = [];
    for (let d = 30; d <= 420; d += 30) {
      const p = at(-half - d, 0, 1.2);
      approach.push({ x: p.x, y: p.y, z: p.z, r: 1, g: 0.95, b: 0.85 });
      this.rabbit.push(p);
      if (d % 150 === 0 || d === 300) {
        for (const c of [-12, -8, -4, 4, 8, 12]) {
          const q = at(-half - d, c, 1.2);
          approach.push({ x: q.x, y: q.y, z: q.z, r: 1, g: 0.95, b: 0.85 });
        }
      }
    }
    this.approachLights = lightPoints(approach, 9);
    this.group.add(this.approachLights);
    const stand = new THREE.MeshLambertMaterial({ color: 0x555a60 });
    for (const p of this.rabbit) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 5), stand);
      pole.position.set(p.x, p.y - 0.6, p.z);
      this.group.add(pole);
    }
    const rabbitGeometry = new THREE.BufferGeometry();
    rabbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.rabbitPoint = new THREE.Points(rabbitGeometry, new THREE.PointsMaterial({
      size: 22, map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.group.add(this.rabbitPoint);

    // PAPI: four boxes left of the runway, 300 m past the threshold.
    this.papiAlong = -half + 300;
    this.papiColors = new Float32Array(12);
    const papi = [];
    for (let i = 0; i < 4; i++) {
      const p = at(this.papiAlong, -runway.width / 2 - 12 - i * 9, 1.0);
      papi.push(p.x, p.y, p.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), stand);
      box.position.set(p.x, p.y - 0.4, p.z);
      box.rotation.y = asphalt.rotation.y;
      this.group.add(box);
    }
    const papiGeometry = new THREE.BufferGeometry();
    papiGeometry.setAttribute('position', new THREE.Float32BufferAttribute(papi, 3));
    papiGeometry.setAttribute('color', new THREE.BufferAttribute(this.papiColors, 3));
    this.papiLights = new THREE.Points(papiGeometry, new THREE.PointsMaterial({
      size: 14, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.group.add(this.papiLights);

    this.buildFieldBuildings(at, asphalt.rotation.y);
    scene.add(this.group);
  }

  buildFieldBuildings(at, yaw) {
    const r = this.runway;
    const placeBox = (along, across, w, hgt, d, color) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshLambertMaterial({ color }));
      const p = at(along, across, hgt / 2);
      mesh.position.copy(p);
      mesh.rotation.y = yaw;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const big = r.id === 'vessel';
    // Hangar with a barrel roof.
    const hangarAlong = big ? 120 : 60;
    const hangarAcross = r.width / 2 + (big ? 95 : 55);
    const hw = big ? 46 : 22;
    const hd = big ? 34 : 18;
    placeBox(hangarAlong, hangarAcross, hw, 9, hd, 0xb9b2a2);
    const roofGeometry = new THREE.CylinderGeometry(hd / 2, hd / 2, hw, 20, 1, false, 0, Math.PI);
    roofGeometry.rotateZ(Math.PI / 2); // arc faces up, barrel axis along the hangar's width
    roofGeometry.scale(1, 0.42, 1);
    const roof = new THREE.Mesh(roofGeometry, new THREE.MeshLambertMaterial({ color: 0x9a3b2e }));
    roof.rotation.y = yaw;
    roof.position.copy(at(hangarAlong, hangarAcross, 9));
    roof.castShadow = true;
    this.group.add(roof);
    if (big) {
      placeBox(-60, r.width / 2 + 80, 22, 6, 16, 0xdad3c2);
      placeBox(-100, r.width / 2 + 82, 14, 5, 12, 0x6b7f8c);
      // Control tower.
      const towerBase = at(-10, r.width / 2 + 120, 0);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 20, 12), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
      shaft.position.set(towerBase.x, towerBase.y + 10, towerBase.z);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.2, 4.2, 8), new THREE.MeshPhongMaterial({ color: 0x24425e, specular: 0xffffff, shininess: 90 }));
      cab.position.set(towerBase.x, towerBase.y + 22, towerBase.z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0x9a3b2e }));
      cap.position.set(towerBase.x, towerBase.y + 24.4, towerBase.z);
      for (const m of [shaft, cab, cap]) { m.castShadow = true; this.group.add(m); }
      // Fuel tanks.
      for (const k of [0, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7, 16), new THREE.MeshLambertMaterial({ color: 0xf0ede4 }));
        tank.position.copy(at(-160 - k * 11, r.width / 2 + 70, 3.5));
        tank.castShadow = true;
        this.group.add(tank);
      }
    }
    // Windsock.
    const sockBase = at(-r.length / 2 + 220, r.width / 2 + 40, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(sockBase.x, sockBase.y + 4, sockBase.z);
    this.group.add(pole);
    this.windsock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.2, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1f, side: THREE.DoubleSide }));
    this.windsock.geometry.rotateX(Math.PI / 2);
    this.windsock.geometry.translate(0, 0, 2.1);
    this.windsock.position.set(sockBase.x, sockBase.y + 7.6, sockBase.z);
    this.group.add(this.windsock);
  }

  /** Update PAPI colours from the aircraft's glide angle, the rabbit strobe and the windsock. */
  update(elapsed, aircraftPosition, wind) {
    const r = this.runway;
    const local = toRunwayLocal(r, aircraftPosition.x, aircraftPosition.z);
    const distance = Math.max(1, this.papiAlong - local.along);
    const angle = THREE.MathUtils.radToDeg(Math.atan2(aircraftPosition.y - r.elevation, distance));
    const thresholds = [3.5, 3.17, 2.83, 2.5];
    for (let i = 0; i < 4; i++) {
      const white = angle > thresholds[i];
      this.papiColors[i * 3] = 1;
      this.papiColors[i * 3 + 1] = white ? 1 : 0.18;
      this.papiColors[i * 3 + 2] = white ? 1 : 0.12;
    }
    this.papiLights.geometry.attributes.color.needsUpdate = true;
    this.glideAngle = angle;
    const step = Math.floor(elapsed * 14) % (this.rabbit.length + 6);
    const target = this.rabbit[this.rabbit.length - 1 - Math.min(step, this.rabbit.length - 1)];
    this.rabbitPoint.visible = step < this.rabbit.length;
    this.rabbitPoint.geometry.attributes.position.setXYZ(0, target.x, target.y + 0.3, target.z);
    this.rabbitPoint.geometry.attributes.position.needsUpdate = true;
    if (wind) {
      const speed = Math.hypot(wind.x, wind.z);
      this.windsock.rotation.y = Math.atan2(wind.x, wind.z);
      this.windsock.rotation.x = THREE.MathUtils.lerp(1.2, 0.05, Math.min(1, speed / 9));
    }
  }

  /** Night/dusk visibility of the lights. */
  setLightStrength(strength) {
    for (const points of [this.edgeLights, this.approachLights, this.papiLights, this.rabbitPoint]) {
      points.material.opacity = strength;
    }
  }
}

export function buildRunwayFields(scene) {
  return RUNWAYS.map((runway) => new RunwayField(scene, runway));
}
