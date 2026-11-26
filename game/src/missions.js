// SPDX-License-Identifier: MIT
// The missions: Valley Gauntlet (ring course), Hawthorn Supply Run (fuel-limited cross-country to a
// mountain strip), Dusk Crosswind (precision landing in gusts) and Free Flight. Each mission sets the
// scene, tracks its objective, grades touchdowns and returns a result with a score and stars.

import * as THREE from 'three';
import { RUNWAYS, fromRunwayLocal, toRunwayLocal } from './world-map.js';
import { layoutGorgeCourse, RingCourse } from './rings.js';
import { MS_TO_KNOTS } from './flight-model.js';

const runwayById = (id) => RUNWAYS.find((r) => r.id === id);

/** Bearing in degrees (0 = north, 90 = east) from a position to a point. */
export function bearingTo(from, x, z) {
  return ((Math.atan2(x - from.x, -(z - from.z)) * 180) / Math.PI + 360) % 360;
}

/**
 * Grade a landing from its touchdown and where the aircraft came to rest.
 * Sink rate (gentler is better), distance from the centreline and stopping on the paved runway.
 */
export function gradeLanding(touchdown, rest, runway) {
  const lines = [];
  let score = 0;
  const fpm = Math.round(touchdown.sinkRate * 196.85);
  const sinkPoints = touchdown.sinkRate < 0.9 ? 400 : touchdown.sinkRate < 1.6 ? 340 : touchdown.sinkRate < 2.6 ? 230 : 90;
  const sinkWord = touchdown.sinkRate < 0.9 ? 'Butter' : touchdown.sinkRate < 1.6 ? 'Smooth' : touchdown.sinkRate < 2.6 ? 'Firm' : 'Hard';
  score += sinkPoints;
  lines.push({ label: `Touchdown ${fpm} ft/min · ${sinkWord}`, points: sinkPoints });
  const across = touchdown.runway && touchdown.runway.runway.id === runway.id ? Math.abs(touchdown.runway.across) : null;
  const centrePoints = across === null ? 0 : Math.round(Math.max(0, 300 - across * 19));
  score += centrePoints;
  lines.push({ label: across === null ? 'Touched down off the runway' : `Centreline offset ${across.toFixed(1)} m`, points: centrePoints });
  const local = toRunwayLocal(runway, rest.x, rest.z);
  const onRunway = Math.abs(local.along) <= runway.length / 2 && Math.abs(local.across) <= runway.width / 2;
  const stopPoints = onRunway ? 300 : 0;
  score += stopPoints;
  lines.push({ label: onRunway ? `Stopped on the runway, ${Math.round(runway.length / 2 - local.along)} m to spare` : 'Rolled off the paved runway', points: stopPoints });
  return { score, lines, onRunway, touchedOnRunway: across !== null, fpm };
}

export function starsFor(score, thresholds) {
  return score >= thresholds[2] ? 3 : score >= thresholds[1] ? 2 : score >= thresholds[0] ? 1 : 0;
}

export const MISSIONS = [
  {
    id: 'gauntlet',
    title: 'Valley Gauntlet',
    kicker: 'MISSION 1 · RINGS',
    place: 'Lake Ondine · Kestrel Gorge',
    card: 'Twelve rings: two skimming the lake, ten up the winding gorge. Beat the clock.',
    blurb: 'Skim two rings low across Lake Ondine into the sunset, then thread ten more up the winding gorge before the clock runs out.',
    timeOfDay: 'golden',
    wind: { x: 1.5, z: 0.5, gust: 0.6 },
    timeLimit: 230,
    setup(run) {
      const rings = layoutGorgeCourse(10);
      run.rings = new RingCourse(run.world.scene, rings);
      // Start out over the lake, lined up behind the first ring.
      const away = rings[0].clone().sub(rings[1]).setY(0).normalize();
      const start = rings[0].clone().addScaledVector(away, 520);
      start.y = 70;
      const toFirst = bearingTo(start, rings[0].x, rings[0].z);
      run.flight.placeAirborne(start, toFirst, 47, -1, 0);
      run.flight.throttle = 0.72;
      run.flight.rpm = 0.77;
    },
    update(run) {
      const { flight, rings } = run;
      if (rings.checkPass(run.previousPosition, flight.position)) {
        run.ringsPassed++;
        run.events.push({ type: 'ring', index: rings.nextIndex });
        run.hud?.toast(`RING ${run.ringsPassed}`, '#f2b632', 1.2);
      } else if (rings.checkMissed(flight.position)) {
        run.events.push({ type: 'miss' });
        run.hud?.toast('MISSED RING', '#ff5a45', 1.4);
      }
      const left = Math.max(0, this.timeLimit - run.elapsed);
      if (!rings.nextRing) return run.finish(true, 'Course complete');
      if (left <= 0) return run.finish(false, 'Out of time: the clock ran down before the last ring.');
      return null;
    },
    status(run) {
      const next = run.rings.nextRing;
      const left = Math.max(0, this.timeLimit - run.elapsed);
      return {
        counter: `${run.ringsPassed}/${run.rings.total}`,
        lines: [
          { text: `Time left ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, color: left < 20 ? '#ff5a45' : '#f7f3ea', bold: true },
          { text: next ? `Next ring ${Math.round(next.centre.distanceTo(run.flight.position))} m` : 'Course complete' },
        ],
        target: next ? next.centre : null,
        mapRings: run.rings.rings.filter((r, i) => i >= run.rings.nextIndex).map((r) => r.centre),
      };
    },
    score(run, success) {
      const ringPoints = run.ringsPassed * 90;
      const timeBonus = success ? Math.round(Math.max(0, this.timeLimit - run.elapsed) * 3) : 0;
      const hull = Math.round((1 - run.flight.damage / 100) * 100);
      const lines = [
        { label: `Rings threaded ${run.ringsPassed} of ${run.rings.total}`, points: ringPoints },
        { label: `Time bonus (${Math.round(run.elapsed)} s flown)`, points: timeBonus },
        { label: `Airframe intact ${hull}%`, points: hull },
      ];
      const score = ringPoints + timeBonus + hull;
      return { score, lines, stars: success ? starsFor(score, [800, 1100, 1300]) : 0 };
    },
  },
  {
    id: 'supply',
    title: 'Hawthorn Supply Run',
    kicker: 'MISSION 2 · CROSS-COUNTRY',
    place: 'To Hawthorn Strip',
    card: 'Half a tank, 4.2 NM and 1,400 ft up to a short mountain strip. Land it.',
    blurb: 'Medical supplies for the mountain strip, 4.2 nautical miles north-west and 1,400 ft up. The tank is under half full: climb efficiently, fly direct and land short.',
    timeOfDay: 'morning',
    wind: { x: 2.5, z: 2.0, gust: 1.0 },
    setup(run) {
      run.flight.placeOnRunway(runwayById('vessel'), -520);
      run.flight.fuel = 0.4;
      run.flight.fuelBurnScale = 1.0;
      run.targetRunway = runwayById('hawthorn');
    },
    update(run) {
      return run.checkLanding(this);
    },
    status(run) {
      const target = run.targetRunway;
      const threshold = fromRunwayLocal(target, -target.length / 2, 0);
      const dist = Math.hypot(threshold.x - run.flight.position.x, threshold.z - run.flight.position.z);
      return {
        counter: `${Math.round(run.flight.fuel * 120)} L`,
        lines: [
          { text: `Hawthorn Strip ${(dist / 1852).toFixed(1)} NM · runway 06`, bold: true, color: '#f7f3ea' },
          { text: `Field elevation ${Math.round(target.elevation * 3.28)} ft` },
        ],
        target: new THREE.Vector3(threshold.x, target.elevation, threshold.z),
      };
    },
    score(run, success) {
      if (!success || !run.landing) return { score: 0, lines: [], stars: 0 };
      const fuelPoints = Math.round(run.flight.fuel * 120 * 6);
      const lines = [...run.landing.lines, { label: `Fuel left ${Math.round(run.flight.fuel * 120)} L`, points: fuelPoints }];
      const score = run.landing.score + fuelPoints;
      return { score, lines, stars: starsFor(score, [450, 750, 950]) };
    },
  },
  {
    id: 'crosswind',
    title: 'Dusk Crosswind',
    kicker: 'MISSION 3 · PRECISION LANDING',
    place: 'Vessel Field · Runway 36',
    card: 'Two-mile final at last light in a gusting crosswind. Kiss the centreline.',
    blurb: 'Last light, a gusting crosswind off the western peaks and the runway lights coming on. You are on a two-mile final: hold the centreline and keep the wheels kissing the paint.',
    timeOfDay: 'dusk',
    wind: { x: 7.5, z: -1.0, gust: 3.2 },
    setup(run) {
      const runway = runwayById('vessel');
      run.targetRunway = runway;
      const start = fromRunwayLocal(runway, -runway.length / 2 - 3000, -60);
      const y = runway.elevation + 3000 * Math.tan((3 * Math.PI) / 180) + 2;
      run.flight.placeAirborne(new THREE.Vector3(start.x, y, start.z), runway.headingDeg + 1, 36, -1, 0);
      run.flight.throttle = 0.32;
      run.flight.rpm = 0.44;
      run.flight.gearDown = true;
      run.flight.gearPosition = 1;
      run.flight.flapStage = 2;
      run.flight.flaps = 1;
    },
    update(run) {
      return run.checkLanding(this);
    },
    status(run) {
      const runway = run.targetRunway;
      const local = toRunwayLocal(runway, run.flight.position.x, run.flight.position.z);
      const toThreshold = -runway.length / 2 - local.along;
      const glide = toThreshold > 30 ? (Math.atan2(run.flight.position.y - runway.elevation, toThreshold) * 180) / Math.PI : null;
      return {
        counter: 'RWY 36',
        lines: [
          { text: toThreshold > 0 ? `Threshold ${Math.round(toThreshold)} m · glide ${glide !== null ? glide.toFixed(1) + '°' : '–'}` : 'Over the runway', bold: true, color: '#f7f3ea' },
          { text: `Centreline ${local.across >= 0 ? 'R' : 'L'} ${Math.abs(local.across).toFixed(0)} m · aim 3.0°` },
        ],
        target: new THREE.Vector3(runway.x, runway.elevation, runway.z),
      };
    },
    score(run, success) {
      if (!success || !run.landing) return { score: 0, lines: [], stars: 0 };
      const lines = [...run.landing.lines];
      let score = run.landing.score;
      if (run.flight.damage < 1) {
        lines.push({ label: 'No damage', points: 150 });
        score += 150;
      }
      return { score, lines, stars: starsFor(score, [550, 850, 1050]) };
    },
  },
  {
    id: 'free',
    title: 'Free Flight',
    kicker: 'SANDBOX',
    place: 'Lake Ondine basin',
    card: 'Full tank, no clock. Tour the valley, then land at either field.',
    blurb: 'Full tank, calm golden evening, no clock. Tour the lake, the Corran Peaks and the gorge, then land at either field for a graded touchdown.',
    timeOfDay: 'golden',
    wind: { x: 1.0, z: 0.5, gust: 0.4 },
    setup(run) {
      run.flight.placeOnRunway(runwayById('vessel'), -520);
      run.targetRunway = null;
    },
    update(run) {
      return run.checkLanding(this);
    },
    status(run) {
      const p = run.flight.position;
      const nearest = RUNWAYS.map((r) => ({ r, d: Math.hypot(r.x - p.x, r.z - p.z) })).sort((a, b) => a.d - b.d)[0];
      return {
        counter: '',
        lines: [
          { text: `Nearest field ${nearest.r.name}`, bold: true, color: '#f7f3ea' },
          { text: `${(nearest.d / 1852).toFixed(1)} NM · ${Math.round(run.elapsed / 60)} min aloft` },
        ],
        target: new THREE.Vector3(nearest.r.x, nearest.r.elevation, nearest.r.z),
      };
    },
    score(run, success) {
      if (!success || !run.landing) return { score: 0, lines: [], stars: 0 };
      return { score: run.landing.score, lines: run.landing.lines, stars: starsFor(run.landing.score, [450, 750, 950]) };
    },
  },
];

/** One attempt at a mission: owns objective state and the final result. */
export class MissionRun {
  constructor(definition, flight, world, hud) {
    this.def = definition;
    this.flight = flight;
    this.world = world;
    this.hud = hud;
    this.elapsed = 0;
    this.ringsPassed = 0;
    this.rings = null;
    this.events = [];
    this.result = null;
    this.landing = null;
    this.hasFlown = false;
    this.lastTouchdown = null;
    this.previousPosition = new THREE.Vector3();
    flight.reset();
    const w = definition.wind;
    flight.setWind(w.x, w.z, w.gust);
    const knots = Math.round(Math.hypot(w.x, w.z) * MS_TO_KNOTS);
    const from = Math.round(((Math.atan2(-w.x, w.z) * 180) / Math.PI + 360) % 360 / 10) * 10;
    this.windLabel = `${String(from || 360).padStart(3, '0')}/${knots}`;
    definition.setup(this);
    this.previousPosition.copy(flight.position);
    this.offTouchdown = flight.on('touchdown', (t) => {
      this.lastTouchdown = t;
    });
  }

  get status() {
    return this.def.status(this);
  }

  /** Mission 2-4: succeed by stopping on a runway after flying; fail by stopping anywhere else. */
  checkLanding(def) {
    const f = this.flight;
    if (!f.onGround) this.hasFlown = this.hasFlown || f.altitudeAboveGround > 15;
    if (!this.hasFlown || !f.onGround || f.velocity.length() > 0.8 || !this.lastTouchdown) return null;
    const rest = f.position;
    const candidates = this.targetRunway ? [this.targetRunway] : RUNWAYS;
    for (const runway of candidates) {
      const local = toRunwayLocal(runway, rest.x, rest.z);
      if (Math.abs(local.along) < runway.length / 2 + 300 && Math.abs(local.across) < 200) {
        this.landing = gradeLanding(this.lastTouchdown, rest, runway);
        if (!this.landing.onRunway) return this.finish(false, 'Rolled off the runway before stopping.');
        return this.finish(true, `Landed at ${runway.name}`);
      }
    }
    const wrong = RUNWAYS.find((r) => {
      const l = toRunwayLocal(r, rest.x, rest.z);
      return Math.abs(l.along) < r.length / 2 && Math.abs(l.across) < r.width;
    });
    return this.finish(false, wrong ? `Landed at ${wrong.name}, not ${this.targetRunway.name}.` : 'Came to a stop off-airport.');
  }

  update(dt) {
    if (this.result) return this.result;
    this.elapsed += dt;
    if (this.flight.crashed) return this.finish(false, this.flight.crashReason);
    const outcome = this.def.update(this);
    this.previousPosition.copy(this.flight.position);
    return outcome;
  }

  finish(success, reason) {
    if (this.result) return this.result;
    const scored = this.def.score(this, success);
    this.result = { success, reason, missionId: this.def.id, title: this.def.title, elapsed: this.elapsed, crashed: this.flight.crashed, ...scored };
    return this.result;
  }

  dispose() {
    this.rings?.dispose();
    this.offTouchdown?.();
  }
}
