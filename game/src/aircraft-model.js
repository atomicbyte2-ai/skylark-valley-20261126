// SPDX-License-Identifier: MIT
// The Merrow M-2 Skylark, built from geometry: lathe fuselage with a painted livery, tapered
// dihedral wings, moving control surfaces, bubble canopy, prop blur disc, retractable gear.
// Local axes: forward is -Z, up is +Y, right is +X. Units are metres.

import * as THREE from 'three';

const LIVERY = { body: '#f4f1ea', navy: '#1c2b4a', red: '#d8432f', gold: '#f2b632' };

function paintFuselageLivery() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; // around the fuselage: 0 top, 0.25 right, 0.5 belly, 0.75 left
  canvas.height = 512; // along: canvas top is the nose, bottom the tail (texture flipY)
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = LIVERY.body;
  ctx.fillRect(0, 0, 512, 512);
  // Navy belly sweeping up toward the tail.
  ctx.fillStyle = LIVERY.navy;
  ctx.beginPath();
  ctx.moveTo(150, 0);
  ctx.bezierCurveTo(170, 200, 190, 380, 200, 512);
  ctx.lineTo(312, 512);
  ctx.bezierCurveTo(322, 380, 342, 200, 362, 0);
  ctx.closePath();
  ctx.fill();
  // Red cheatlines with a gold pinstripe on both sides.
  for (const side of [1, -1]) {
    const cx = side > 0 ? 128 : 384;
    ctx.fillStyle = LIVERY.red;
    ctx.beginPath();
    ctx.moveTo(cx - 24 * side, 0);
    ctx.bezierCurveTo(cx - 10 * side, 220, cx + 2 * side, 380, cx + 8 * side, 512);
    ctx.lineTo(cx + 34 * side, 512);
    ctx.bezierCurveTo(cx + 26 * side, 380, cx + 16 * side, 220, cx + 4 * side, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = LIVERY.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 12 * side, 0);
    ctx.bezierCurveTo(cx + 24 * side, 220, cx + 36 * side, 380, cx + 44 * side, 512);
    ctx.stroke();
    // Registration near the tail, written along the fuselage.
    ctx.save();
    ctx.translate(cx + (side > 0 ? -58 : 58), 372);
    ctx.rotate(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = LIVERY.navy;
    ctx.font = 'bold 44px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SK-M2', 0, 0);
    ctx.restore();
  }
  // Anti-glare panel ahead of the canopy.
  ctx.fillStyle = '#20242b';
  ctx.beginPath();
  ctx.ellipse(0, 135, 38, 48, 0, 0, Math.PI * 2);
  ctx.ellipse(512, 135, 38, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paintPropBlur() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  g.addColorStop(0, 'rgba(40,40,45,0.0)');
  g.addColorStop(0.25, 'rgba(50,50,55,0.22)');
  g.addColorStop(0.85, 'rgba(60,60,66,0.16)');
  g.addColorStop(0.93, 'rgba(242,182,50,0.45)');
  g.addColorStop(1, 'rgba(242,182,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A tapered wing-like planform extruded to a thin section; side +1 builds right, -1 left. */
function buildPlanform({ rootX, tipX, rootLead, rootTrail, tipLead, tipTrail, thickness, side }) {
  const s = side;
  const shape = new THREE.Shape();
  shape.moveTo(s * rootX, rootTrail);
  shape.lineTo(s * rootX, rootLead);
  shape.lineTo(s * (tipX - 0.25), tipLead);
  shape.quadraticCurveTo(s * (tipX + 0.05), (tipLead + tipTrail) / 2 + 0.15, s * (tipX - 0.15), tipTrail);
  shape.lineTo(s * rootX, rootTrail);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.45,
    bevelSize: thickness * 0.4,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateX(-Math.PI / 2); // shape +y (leading edge) points forward (-Z), thickness up
  geometry.computeVertexNormals();
  return geometry;
}

export class AircraftModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Merrow M-2 Skylark';
    const paint = new THREE.MeshStandardMaterial({ map: paintFuselageLivery(), roughness: 0.38, metalness: 0.05 });
    const white = new THREE.MeshStandardMaterial({ color: LIVERY.body, roughness: 0.4, metalness: 0.05 });
    const red = new THREE.MeshStandardMaterial({ color: LIVERY.red, roughness: 0.42 });
    const navy = new THREE.MeshStandardMaterial({ color: LIVERY.navy, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.3 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.25, metalness: 0.8 });
    const glass = new THREE.MeshPhongMaterial({ color: 0x1b3450, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.82 });
    this.materials = { paint, white, red, navy, dark, glass };

    // Fuselage: lathe profile from tail (-4.3) to cowling (+3.3) along the lathe axis.
    const profile = [
      [0.0, -4.35], [0.14, -4.3], [0.24, -3.6], [0.36, -2.6], [0.5, -1.4], [0.6, -0.3],
      [0.64, 0.6], [0.63, 1.6], [0.58, 2.5], [0.5, 3.1], [0.42, 3.35], [0.0, 3.36],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const fuselageGeometry = new THREE.LatheGeometry(profile, 36);
    fuselageGeometry.rotateX(-Math.PI / 2);
    fuselageGeometry.scale(0.92, 1.02, 1);
    const fuselage = new THREE.Mesh(fuselageGeometry, paint);
    this.root.add(fuselage);

    // Spinner and propeller.
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 24), red);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = -3.72;
    this.root.add(spinner);
    this.propeller = new THREE.Group();
    this.propeller.position.z = -3.62;
    const bladeGeometry = new THREE.BoxGeometry(0.16, 1.05, 0.05);
    bladeGeometry.translate(0, 0.55, 0);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(bladeGeometry, dark);
      blade.rotation.z = (i * Math.PI * 2) / 3;
      blade.rotation.y = 0.35;
      this.propeller.add(blade);
    }
    this.root.add(this.propeller);
    this.propDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 40),
      new THREE.MeshBasicMaterial({ map: paintPropBlur(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.propDisc.position.z = -3.6;
    this.root.add(this.propDisc);

    // Cowling intake and exhaust stubs.
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 24), chrome);
    intake.position.z = -3.32;
    this.root.add(intake);
    for (const side of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8), chrome);
      stub.rotation.x = Math.PI / 2.4;
      stub.position.set(side * 0.5, -0.18, -2.4);
      this.root.add(stub);
    }

    // Bubble canopy with a frame bow.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(0.5, 0.52, 1.45);
    canopy.position.set(0, 0.42, -0.1);
    this.root.add(canopy);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 24, Math.PI), navy);
    bow.position.set(0, 0.42, -0.35);
    bow.scale.set(1, 1.04, 1);
    this.root.add(bow);
    this.canopy = canopy;

    // Wings with dihedral, red tips and ailerons.
    this.ailerons = [];
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      wing.position.set(0, -0.34, -0.25);
      wing.rotation.z = side * THREE.MathUtils.degToRad(5.5);
      const panel = new THREE.Mesh(buildPlanform({ rootX: 0.35, tipX: 5.4, rootLead: 0.95, rootTrail: -0.85, tipLead: 0.5, tipTrail: -0.45, thickness: 0.16, side }), white);
      wing.add(panel);
      const tip = new THREE.Mesh(buildPlanform({ rootX: 4.65, tipX: 5.42, rootLead: 0.58, rootTrail: -0.52, tipLead: 0.51, tipTrail: -0.46, thickness: 0.17, side }), red);
      wing.add(tip);
      const aileron = new THREE.Group();
      aileron.position.set(side * 3.7, 0, 0.5);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.32), navy);
      flap.position.z = 0.16;
      aileron.add(flap);
      wing.add(aileron);
      this.ailerons.push({ pivot: aileron, side });
      const flapPanel = new THREE.Group();
      flapPanel.position.set(side * 1.6, 0, 0.62);
      const flapMesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.3), white);
      flapMesh.position.z = 0.15;
      flapPanel.add(flapMesh);
      wing.add(flapPanel);
      (this.flapPanels ??= []).push(flapPanel);
      const navLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ color: side > 0 ? 0x33ff66 : 0xff3344 }),
      );
      navLight.position.set(side * 5.38, 0.02, 0.0);
      wing.add(navLight);
      this.root.add(wing);
    }

    // Horizontal stabiliser with elevator.
    for (const side of [1, -1]) {
      const stab = new THREE.Mesh(buildPlanform({ rootX: 0.1, tipX: 2.05, rootLead: 0.45, rootTrail: -0.35, tipLead: 0.18, tipTrail: -0.28, thickness: 0.09, side }), white);
      stab.position.set(0, 0.12, 3.65);
      this.root.add(stab);
    }
    this.elevator = new THREE.Group();
    this.elevator.position.set(0, 0.12, 4.0);
    const elevatorMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.36), red);
    elevatorMesh.position.z = 0.18;
    this.elevator.add(elevatorMesh);
    this.root.add(this.elevator);

    // Vertical fin with a navy rudder and gold flash.
    const finShape = new THREE.Shape();
    finShape.moveTo(-2.75, 0.2);
    finShape.lineTo(-3.85, 1.75);
    finShape.quadraticCurveTo(-4.1, 1.85, -4.25, 1.7);
    finShape.lineTo(-4.3, 0.2);
    finShape.closePath();
    const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    finGeometry.translate(0, 0, -0.05);
    finGeometry.rotateY(Math.PI / 2);
    finGeometry.computeVertexNormals();
    const fin = new THREE.Mesh(finGeometry, white);
    this.root.add(fin);
    this.rudder = new THREE.Group();
    this.rudder.position.set(0, 0, 4.28);
    const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.42), navy);
    rudderMesh.position.set(0, 0.98, 0.18);
    this.rudder.add(rudderMesh);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.44), new THREE.MeshStandardMaterial({ color: LIVERY.gold, roughness: 0.4 }));
    flash.position.set(0, 1.45, 0.18);
    this.rudder.add(flash);
    this.root.add(this.rudder);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    beacon.position.set(0, 0.12, 4.42);
    this.root.add(beacon);
    this.beacon = beacon;

    // Retractable tricycle gear.
    this.gear = new THREE.Group();
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 18);
    wheelGeometry.rotateZ(Math.PI / 2);
    const strutGeometry = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
    const addLeg = (x, z, length) => {
      const strut = new THREE.Mesh(strutGeometry, chrome);
      strut.scale.y = length;
      strut.position.set(x, -0.45 - length / 2, z);
      this.gear.add(strut);
      const wheel = new THREE.Mesh(wheelGeometry, dark);
      wheel.position.set(x, -0.45 - length, z);
      this.gear.add(wheel);
    };
    addLeg(1.45, 0.05, 0.75);
    addLeg(-1.45, 0.05, 0.75);
    addLeg(0, -2.55, 0.72);
    this.root.add(this.gear);
    this.gearHeight = 1.5; // from the aircraft origin down to the bottom of the wheels

    this.root.traverse((object) => {
      if (object.isMesh && object !== this.propDisc) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.propAngle = 0;
  }

  /** Animate the propeller, control surfaces, gear and beacon from the flight state. */
  animate(dt, state, elapsed) {
    const rpm = state.engineRunning ? 0.25 + state.throttle * 0.75 : 0;
    this.propAngle += dt * rpm * 60;
    this.propeller.rotation.z = this.propAngle;
    this.propDisc.visible = rpm > 0.05;
    this.propDisc.material.opacity = Math.min(1, rpm * 1.3);
    this.propeller.visible = rpm < 0.6;
    for (const a of this.ailerons) a.pivot.rotation.x = a.side * state.controlRoll * 0.35;
    this.elevator.rotation.x = -state.controlPitch * 0.35;
    this.rudder.rotation.y = -state.controlYaw * 0.4;
    for (const f of this.flapPanels) f.rotation.x = state.flaps * 0.45;
    const g = state.gearPosition;
    this.gear.visible = g > 0.02;
    this.gear.scale.y = 0.15 + 0.85 * g;
    this.gear.position.y = (1 - g) * 0.35;
    this.beacon.material.color.setScalar(Math.sin(elapsed * 9) > 0.7 ? 1 : 0.15);
  }
}
