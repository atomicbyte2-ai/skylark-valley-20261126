// SPDX-License-Identifier: MIT
// ?shot=<name> mode: stages one fixed, deterministic scene (no clock, no input, no randomness) and
// renders a single still frame for the store screenshots. Optional URL numbers nudge the framing:
// cy (camera yaw, rad), cp (camera pitch, rad), cd (chase distance, m), ch (chase height, m), b (bank, deg).

import * as THREE from 'three';
import { MISSIONS } from './missions.js';
import { RUNWAYS, fromRunwayLocal } from './world-map.js';

export const SHOT_NAMES = ['cover', 'approach', 'cockpit', 'menu'];

const number = (params, key, fallback) => (params.has(key) ? Number(params.get(key)) : fallback);

/** Skimming Lake Ondine toward the sunset, banking toward the second ring of the Valley Gauntlet. */
function stageCover(game, params) {
  const def = MISSIONS.find((m) => m.id === 'gauntlet');
  game.beginRun(def);
  const run = game.run;
  const passed = number(params, 'ring', 1);
  for (let i = 0; i < passed; i++) {
    run.rings.rings[i].passed = true;
    run.rings.rings[i].holder.visible = false;
  }
  run.rings.nextIndex = passed;
  run.ringsPassed = passed;
  run.elapsed = 41.6;
  const ring = run.rings.rings[passed];
  const back = number(params, 'back', 140);
  const position = ring.centre.clone().addScaledVector(ring.normal, -back);
  position.y += number(params, 'dy', 6);
  position.x += number(params, 'dx', -8);
  const toRing = ring.centre.clone().sub(position);
  const heading = (Math.atan2(toRing.x, -toRing.z) * 180) / Math.PI + number(params, 'hd', 4);
  game.flight.placeAirborne(position, heading, 52, 2, number(params, 'b', -22));
  game.flight.throttle = 0.86;
  game.flight.rpm = 0.88;
  game.flight.controlRoll = -0.35;
  game.flight.airspeed = 52;
  game.flight.verticalSpeed = 0.8;
  game.flight.fuel = 0.83;
  game.rig.mode = 'chase';
  // An explicit cover camera in the aircraft's heading frame (metres): right, up, back; and how far
  // ahead it aims and how far it turns toward the sun, so plane, ring, lake and sun share the frame.
  const camera = {
    right: number(params, 'cr', 6), up: number(params, 'cu', 4.5), back: number(params, 'cb', 18),
    ahead: number(params, 'ca', 300), lift: number(params, 'cl', 12), yaw: number(params, 'cyaw', -10),
  };
  return { camera };
}

/** Final approach to Vessel Field at dusk: lights on, gear and flaps down, on the glidepath. */
function stageApproach(game, params) {
  const def = MISSIONS.find((m) => m.id === 'crosswind');
  game.beginRun(def);
  const runway = RUNWAYS.find((r) => r.id === 'vessel');
  const out = number(params, 'out', 380);
  const p = fromRunwayLocal(runway, -runway.length / 2 - out, number(params, 'across', -4));
  const y = runway.elevation + out * Math.tan((3 * Math.PI) / 180) + 1.5;
  game.flight.placeAirborne(new THREE.Vector3(p.x, y, p.z), runway.headingDeg - 3, 33, 1.5, number(params, 'b', -3));
  game.flight.gearDown = true;
  game.flight.gearPosition = 1;
  game.flight.flapStage = 2;
  game.flight.flaps = 1;
  game.flight.throttle = 0.3;
  game.flight.rpm = 0.43;
  game.flight.airspeed = 33;
  game.flight.verticalSpeed = -1.7;
  game.run.elapsed = 74;
  game.rig.mode = 'chase';
  // Camera behind and above, aimed down the approach just past the threshold.
  const camera = {
    right: number(params, 'cr', -2.5), up: number(params, 'cu', 7.5), back: number(params, 'cb', 24),
    ahead: out + number(params, 'past', 150), lift: runway.elevation - y + number(params, 'cl', 2), yaw: number(params, 'cyaw', 3),
  };
  return { camera };
}

/** Cockpit view on the supply run, climbing over the lake toward the Corran Peaks. */
function stageCockpit(game, params) {
  const def = MISSIONS.find((m) => m.id === 'supply');
  game.beginRun(def);
  const position = new THREE.Vector3(number(params, 'x', -900), number(params, 'y', 420), number(params, 'z', 1200));
  game.flight.placeAirborne(position, number(params, 'h', 340), 44, 3, number(params, 'b', -6));
  game.flight.throttle = 0.78;
  game.flight.rpm = 0.82;
  game.flight.airspeed = 44;
  game.flight.verticalSpeed = 2.3;
  game.flight.fuel = 0.31;
  game.run.elapsed = 95;
  game.rig.mode = 'cockpit';
  return { lookYaw: number(params, 'cy', 0), lookPitch: number(params, 'cp', 0) };
}

export function stageShot(game, name, params) {
  if (name === 'cover') return stageCover(game, params);
  if (name === 'approach') return stageApproach(game, params);
  if (name === 'cockpit') return stageCockpit(game, params);
  // menu
  game.showTitle();
  return { title: true };
}
