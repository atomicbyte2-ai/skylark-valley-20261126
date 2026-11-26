// SPDX-License-Identifier: MIT
// Arcade-but-credible flight model for the Merrow M-2 Skylark: lift from airspeed squared and angle
// of attack with a stall, induced and parasitic drag, spooling engine, fuel burn, wind, ground
// roll with brakes and steering, and touchdown / crash classification.

import * as THREE from 'three';
import { contactHeightAt, surfaceAt, runwayUnder, WATER_LEVEL } from './world-map.js';
import { clamp } from './noise.js';

const GRAVITY = 9.81;
const LIFT_FACTOR = 0.0082;
const STALL_ALPHA = 0.26; // rad, about 15 degrees clean
const MAX_THRUST = 5.6; // m/s^2 at full power and low speed
const GEAR_CLEARANCE = 1.5;
const BELLY_CLEARANCE = 0.62;
export const MS_TO_KNOTS = 1.94384;
export const M_TO_FEET = 3.28084;

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _air = new THREE.Vector3();
const _force = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.wind = new THREE.Vector3();
    this.gustSeed = 0;
    this.gustStrength = 0;
    this.listeners = {};
    this.reset();
  }

  reset() {
    this.throttle = 0;
    this.rpm = 0;
    this.fuel = 1;
    this.fuelBurnScale = 1;
    this.damage = 0;
    this.flapStage = 0;
    this.flaps = 0;
    this.gearDown = true;
    this.gearPosition = 1;
    this.brakes = false;
    this.onGround = false;
    this.engineRunning = true;
    this.stalling = false;
    this.stallWarning = false;
    this.crashed = false;
    this.crashReason = '';
    this.controlPitch = 0;
    this.controlRoll = 0;
    this.controlYaw = 0;
    this.alpha = 0;
    this.airspeed = 0;
    this.verticalSpeed = 0;
    this.gLoad = 1;
    this.time = 0;
    this.lastTouchdown = null;
    this.maxClimbAltitude = 0;
  }

  on(event, handler) {
    (this.listeners[event] ??= []).push(handler);
    return () => {
      this.listeners[event] = (this.listeners[event] ?? []).filter((h) => h !== handler);
    };
  }

  emit(event, payload) {
    for (const handler of this.listeners[event] ?? []) handler(payload);
  }

  /** Put the aircraft on a runway, lined up, engine idling, brakes set. */
  placeOnRunway(runway, along, headingOffsetDeg = 0) {
    const heading = THREE.MathUtils.degToRad(runway.headingDeg + headingOffsetDeg);
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const x = runway.x + fx * along;
    const z = runway.z + fz * along;
    this.position.set(x, contactHeightAt(x, z) + GEAR_CLEARANCE, z);
    this.velocity.set(0, 0, 0);
    this.setAttitude(runway.headingDeg + headingOffsetDeg, 0, 0);
    this.onGround = true;
    this.brakes = true;
    this.throttle = 0;
    this.rpm = 0.2;
  }

  /** Put the aircraft in the air at a heading (deg), pitch and bank (deg), speed (m/s). */
  placeAirborne(position, headingDeg, speed, pitchDeg = 0, bankDeg = 0) {
    this.position.copy(position);
    this.setAttitude(headingDeg, pitchDeg, bankDeg);
    this.velocity.set(0, 0, -speed).applyQuaternion(this.quaternion);
    this.onGround = false;
    this.brakes = false;
    this.gearDown = false;
    this.gearPosition = 0;
  }

  setAttitude(headingDeg, pitchDeg, bankDeg) {
    _euler.set(THREE.MathUtils.degToRad(pitchDeg), -THREE.MathUtils.degToRad(headingDeg), -THREE.MathUtils.degToRad(bankDeg), 'YXZ');
    this.quaternion.setFromEuler(_euler);
  }

  /** Heading (deg, 0 = north, clockwise), pitch and bank (deg, right wing down positive). */
  get attitude() {
    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    let heading = -THREE.MathUtils.radToDeg(_euler.y);
    heading = ((heading % 360) + 360) % 360;
    return { heading, pitch: THREE.MathUtils.radToDeg(_euler.x), bank: -THREE.MathUtils.radToDeg(_euler.z) };
  }

  get groundTrackDeg() {
    const deg = THREE.MathUtils.radToDeg(Math.atan2(this.velocity.x, -this.velocity.z));
    return (deg + 360) % 360;
  }

  get altitudeAboveGround() {
    return this.position.y - contactHeightAt(this.position.x, this.position.z) - (this.gearPosition > 0.5 ? GEAR_CLEARANCE : BELLY_CLEARANCE);
  }

  toggleGear() {
    if (this.onGround && this.gearDown) return; // squat switch
    this.gearDown = !this.gearDown;
    this.emit('gear', this.gearDown);
  }

  cycleFlaps() {
    this.flapStage = (this.flapStage + 1) % 3;
    this.emit('flaps', this.flapStage);
  }

  setWind(x, z, gust = 0) {
    this.baseWind = new THREE.Vector3(x, 0, z);
    this.gustStrength = gust;
    this.wind.copy(this.baseWind);
  }

  step(dt, input) {
    if (this.crashed) return;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub && !this.crashed; i++) this.integrate(h, input);
  }

  integrate(dt, input) {
    this.time += dt;
    // Smooth control inputs so the aircraft answers firmly but never snaps.
    const follow = 1 - Math.exp(-dt * 7);
    this.controlPitch += (input.pitch - this.controlPitch) * follow;
    this.controlRoll += (input.roll - this.controlRoll) * follow;
    this.controlYaw += (input.yaw - this.controlYaw) * follow;
    this.throttle = clamp(this.throttle + input.throttleDelta * dt * 0.6, 0, 1);
    if (input.throttleSet !== undefined && input.throttleSet !== null) this.throttle = input.throttleSet;
    this.brakes = input.brakes || (this.onGround && this.throttle < 0.02 && this.velocity.length() < 0.5);

    // Engine spools toward the throttle, starves without fuel.
    if (this.fuel <= 0) this.engineRunning = false;
    const targetRpm = this.engineRunning ? 0.18 + 0.82 * this.throttle : 0;
    this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-dt * 1.6));
    if (this.engineRunning) this.fuel = Math.max(0, this.fuel - dt * (0.00035 + 0.0029 * this.rpm * this.rpm) * this.fuelBurnScale);

    this.flaps += ((this.flapStage / 2) - this.flaps) * (1 - Math.exp(-dt * 1.5));
    this.gearPosition = clamp(this.gearPosition + (this.gearDown ? dt : -dt) * 0.4, 0, 1);

    // Gusting wind.
    if (this.baseWind) {
      const t = this.time;
      const gust = this.gustStrength * (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9 + 1.3) * 0.4);
      this.wind.copy(this.baseWind).multiplyScalar(1 + gust / Math.max(1, this.baseWind.length()));
      this.wind.y = this.gustStrength * 0.25 * Math.sin(t * 1.3 + 0.4);
    }

    _forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    _up.set(0, 1, 0).applyQuaternion(this.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.quaternion);
    _air.copy(this.velocity).sub(this.wind);
    const V = _air.length();
    const airDir = V > 0.01 ? _tmp.copy(_air).divideScalar(V) : _tmp.copy(_forward);
    const alpha = V > 1 ? Math.atan2(-_air.dot(_up), _air.dot(_forward)) : 0;
    const beta = V > 1 ? Math.atan2(_air.dot(_right), _air.dot(_forward)) : 0;
    this.alpha = alpha;
    this.airspeed = V;

    // Lift coefficient with a stall break; flaps add lift and lower the stall angle a touch.
    const stallAlpha = STALL_ALPHA - this.flaps * 0.03;
    const clMax = 0.35 + 5.2 * stallAlpha + this.flaps * 0.5;
    let cl = 0.35 + 5.2 * alpha + this.flaps * 0.5;
    this.stalling = alpha > stallAlpha;
    if (this.stalling) cl = Math.max(0.45, clMax * (1 - (alpha - stallAlpha) * 3.2));
    if (alpha < -0.25) cl = Math.min(cl, -0.6);
    this.stallWarning = !this.onGround && alpha > stallAlpha - 0.05 && V > 3;

    const groundEffect = 1 + 0.25 * clamp(1 - this.altitudeAboveGround / 12, 0, 1);
    const q = V * V;
    _force.set(0, -GRAVITY, 0);
    // Lift perpendicular to the airflow, in the wings' plane of symmetry.
    const liftDir = new THREE.Vector3().crossVectors(_right, airDir).normalize();
    _force.addScaledVector(liftDir, LIFT_FACTOR * q * cl * groundEffect);
    const cd = 0.00052 + 0.00042 * cl * cl * (this.stalling ? 2.2 : 1) + this.flaps * 0.0006 + this.gearPosition * 0.00025;
    _force.addScaledVector(airDir, -cd * q);
    const power = Math.max(0, (this.rpm - 0.18) / 0.82);
    const thrust = this.engineRunning ? MAX_THRUST * (0.04 + 0.96 * power) * clamp(1 - V / 115, 0, 1) : 0;
    _force.addScaledVector(_forward, thrust);
    // Side force removes sideslip.
    _force.addScaledVector(_right, -_air.dot(_right) * Math.min(V, 60) * 0.03);
    this.velocity.addScaledVector(_force, dt);

    // Rotation from control rates, with weathervane and pitch stability.
    const authority = clamp(V / 38, 0.08, 1.25);
    let pitchRate = this.controlPitch * 1.05 * authority;
    let rollRate = this.controlRoll * 1.55 * authority;
    let yawRate = -this.controlYaw * 0.5 * authority;
    if (!this.onGround) {
      pitchRate -= (alpha - 0.04) * 1.7 * authority;
      yawRate -= beta * 1.6 * authority;
      // Dihedral: with the stick centred the wings drift back toward level.
      const bankRad = Math.atan2(-_right.y, _up.y);
      rollRate -= bankRad * (0.55 - 0.4 * Math.abs(this.controlRoll)) * authority;
      if (this.stalling) {
        pitchRate -= 0.5; // the nose drops in a stall
        rollRate += Math.sin(this.time * 2.3) * 0.5; // and a wing wants to go
      }
    }
    _q.setFromEuler(new THREE.Euler(pitchRate * dt, yawRate * dt, -rollRate * dt, 'YXZ'));
    this.quaternion.multiply(_q).normalize();

    this.position.addScaledVector(this.velocity, dt);
    this.verticalSpeed = this.velocity.y;
    this.gLoad = _force.dot(_up) / GRAVITY + 1;
    this.resolveGround(dt);

    if (V > 92) this.applyDamage(dt * (V - 92) * 3, 'Overspeed: the airframe came apart past 180 knots.');
  }

  resolveGround(dt) {
    const clearance = this.gearPosition > 0.5 ? GEAR_CLEARANCE : BELLY_CLEARANCE;
    const groundY = contactHeightAt(this.position.x, this.position.z);
    const bottom = this.position.y - clearance;
    if (bottom > groundY + 0.02) {
      if (this.onGround) this.emit('liftoff', {});
      this.onGround = false;
      return;
    }
    const { heading, pitch, bank } = this.attitude;
    const surface = surfaceAt(this.position.x, this.position.z);
    const speed = this.velocity.length();
    if (!this.onGround) {
      const sinkRate = -this.velocity.y;
      const touchdown = { sinkRate, speed, pitch, bank, heading, surface, gear: this.gearPosition > 0.5, runway: runwayUnder(this.position.x, this.position.z) };
      this.lastTouchdown = touchdown;
      if (surface === 'water' && groundY <= WATER_LEVEL + 0.01) {
        return this.crash(`Ditched in the water at ${Math.round(speed * MS_TO_KNOTS)} knots.`);
      }
      if (sinkRate > 7.5) return this.crash(`Flew into the ground descending ${Math.round(sinkRate * 196.85)} ft/min.`);
      if (Math.abs(bank) > 28) return this.crash(`Caught a wingtip: touched down banked ${Math.round(Math.abs(bank))}°.`);
      if (pitch < -10) return this.crash(`Nosed in: hit the ground ${Math.round(-pitch)}° nose-down.`);
      if (surface === 'ground') {
        const slope = Math.abs(contactHeightAt(this.position.x + 8, this.position.z) - groundY) + Math.abs(contactHeightAt(this.position.x, this.position.z + 8) - groundY);
        if (slope > 2.5) return this.crash('Struck rising terrain on the mountainside.');
      }
      if (!touchdown.gear) this.applyDamage(45 + sinkRate * 8, 'Belly landing broke the airframe.');
      if (sinkRate > 2.6) this.applyDamage((sinkRate - 2.6) * 19, 'Hard landing collapsed the gear.');
      this.onGround = true;
      this.emit('touchdown', touchdown);
      if (this.crashed) return;
    }
    this.onGround = true;
    this.position.y = groundY + clearance;
    if (this.velocity.y < 0) this.velocity.y = 0;

    // Wheels: keep wings level, nose between nosewheel and tail-strike, steer with rudder.
    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    const steer = (this.controlYaw + this.controlRoll * 0.4) * 0.55 * clamp(speed / 6, 0, 1) * clamp(1.4 - speed / 45, 0.25, 1);
    _euler.y -= steer * dt;
    _euler.z *= Math.exp(-dt * 8);
    _euler.x = clamp(_euler.x, -0.01, 0.24);
    this.quaternion.setFromEuler(_euler);
    _forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.quaternion);
    // Tyre grip removes sideways skid; rolling resistance and brakes slow the roll.
    const sideways = this.velocity.dot(_right);
    this.velocity.addScaledVector(_right, -sideways * Math.min(1, dt * 6));
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > 0.01) {
      let decel = this.gearPosition > 0.5 ? 0.25 : 4.5;
      if (this.brakes && this.gearPosition > 0.5) decel += 3.6;
      if (surface === 'ground') decel += 0.9;
      const k = Math.max(0, 1 - (decel * dt) / horizontal);
      this.velocity.x *= k;
      this.velocity.z *= k;
    }
    if (surface === 'ground' && horizontal > 12) this.applyDamage(dt * horizontal * 0.18, 'Rough field: the gear tore off on the rocks.');
    if (surface === 'water') this.crash('Ran off the end and into the water.');
  }

  applyDamage(amount, reason) {
    if (this.crashed || amount <= 0) return;
    this.damage = Math.min(100, this.damage + amount);
    this.emit('damage', { amount, total: this.damage });
    if (this.damage >= 100) this.crash(reason);
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    this.engineRunning = false;
    this.emit('crash', { reason, speed: this.velocity.length(), position: this.position.clone() });
  }
}
