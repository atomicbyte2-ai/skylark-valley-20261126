// SPDX-License-Identifier: MIT
// Camera rig: a smoothed chase camera that follows the flight path and leans a little with the bank,
// a cockpit eye point, free mouse-look in both, an orbit for the title screen and a crash camera.

import * as THREE from 'three';
import { contactHeightAt } from './world-map.js';

const _offset = new THREE.Vector3();
const _target = new THREE.Vector3();
const _up = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export const CAMERA_MODES = ['chase', 'cockpit'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.smoothedPosition = new THREE.Vector3();
    this.smoothedUp = new THREE.Vector3(0, 1, 0);
    this.initialised = false;
    this.chaseDistance = 17;
    this.chaseHeight = 4.2;
  }

  toggleMode() {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    this.initialised = false;
  }

  snap() {
    this.initialised = false;
  }

  /** Chase: behind the aircraft along its heading, lifted, looking ahead of the nose. */
  chasePose(flight, lookYaw, lookPitch, outPosition, outTarget, outUp) {
    const { heading, pitch, bank } = flight.attitude;
    const yaw = -THREE.MathUtils.degToRad(heading) + lookYaw;
    const pitchRad = THREE.MathUtils.degToRad(pitch) * 0.7 + lookPitch * 0.6;
    _euler.set(pitchRad, yaw, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    _offset.set(0, this.chaseHeight, this.chaseDistance).applyQuaternion(_quat);
    outPosition.copy(flight.position).add(_offset);
    _target.set(0, 1.4, -30).applyQuaternion(_quat).add(flight.position);
    outTarget.copy(_target);
    // Lean a third of the bank so turns read without the horizon spinning.
    const lean = THREE.MathUtils.degToRad(bank) * 0.33;
    outUp.set(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, -1).applyQuaternion(_quat), lean);
  }

  update(dt, flight, controls) {
    const lookYaw = controls?.lookYaw ?? 0;
    const lookPitch = controls?.lookPitch ?? 0;
    if (this.mode === 'cockpit') {
      const eye = new THREE.Vector3(0, 0.98, 0.15).applyQuaternion(flight.quaternion).add(flight.position);
      this.camera.position.copy(eye);
      this.camera.quaternion.copy(flight.quaternion);
      _quat.setFromEuler(new THREE.Euler(lookPitch - 0.05, lookYaw, 0, 'YXZ'));
      this.camera.quaternion.multiply(_quat);
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
      return;
    }
    const desired = new THREE.Vector3();
    const target = new THREE.Vector3();
    this.chasePose(flight, lookYaw, lookPitch, desired, target, _up);
    if (!this.initialised) {
      this.smoothedPosition.copy(desired);
      this.smoothedUp.copy(_up);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-dt * 6);
      this.smoothedPosition.lerp(desired, k);
      this.smoothedUp.lerp(_up, 1 - Math.exp(-dt * 3)).normalize();
    }
    // Never let the camera dip below the ground.
    const floor = contactHeightAt(this.smoothedPosition.x, this.smoothedPosition.z) + 2;
    if (this.smoothedPosition.y < floor) this.smoothedPosition.y = floor;
    this.camera.position.copy(this.smoothedPosition);
    this.camera.up.copy(this.smoothedUp);
    this.camera.lookAt(target);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  /** Title screen: front-left of the circling aircraft, aimed past it so it sits in the right third. */
  titleView(flight, ahead = 26, side = 15, height = 3.5, shift = 0.34) {
    const h = THREE.MathUtils.degToRad(flight.attitude.heading);
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const p = flight.position;
    // Right of the heading is (-fz, fx); the camera sits ahead and to the left.
    this.camera.position.set(p.x + fx * ahead + fz * side, p.y + height, p.z + fz * ahead - fx * side);
    const toPlane = new THREE.Vector3().subVectors(p, this.camera.position);
    const distance = toPlane.length();
    const left = new THREE.Vector3(0, 1, 0).cross(toPlane).normalize();
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_target.copy(p).addScaledVector(left, distance * shift).add(new THREE.Vector3(0, distance * 0.05, 0)));
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  /** A slow orbit around a point, used behind the title screen. */
  orbit(elapsed, centre, radius, height) {
    const a = elapsed * 0.05;
    this.camera.position.set(centre.x + Math.cos(a) * radius, centre.y + height, centre.z + Math.sin(a) * radius);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(centre);
  }

  /** After a crash, pull back and watch the wreck. */
  crashView(elapsed, wreck) {
    const a = elapsed * 0.25;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(wreck.x + Math.cos(a) * 60, wreck.y + 25, wreck.z + Math.sin(a) * 60);
    this.camera.lookAt(wreck);
  }
}
