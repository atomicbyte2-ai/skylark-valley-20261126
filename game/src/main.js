// SPDX-License-Identifier: MIT
// Skylark Valley: boot and frame loop. Wires the world, the flight model, the aircraft model, the
// camera rig, the HUD, sound and menus together and runs the title -> mission -> result cycle.

import { WorldScene } from './world-scene.js';
import { AircraftModel } from './aircraft-model.js';
import { FlightModel } from './flight-model.js';
import { FlightControls } from './controls.js';
import { CameraRig } from './camera-rig.js';
import { FlightHud } from './hud.js';
import { FlightAudio } from './audio.js';
import { MenuScreens, saveBestResult } from './menu.js';
import { MISSIONS, MissionRun, bearingTo } from './missions.js';
import { stageShot } from './shot-mode.js';
import { RUNWAYS, toRunwayLocal, LAKE } from './world-map.js';

const GLIDE_LOW = 2.4;
const GLIDE_HIGH = 3.6;

class SkylarkGame {
  constructor() {
    this.world = new WorldScene(document.getElementById('world-canvas'));
    this.flight = new FlightModel();
    this.model = new AircraftModel();
    this.world.scene.add(this.model.root);
    this.rig = new CameraRig(this.world.camera);
    this.hud = new FlightHud(document.getElementById('hud-canvas'));
    this.menu = new MenuScreens(document.getElementById('menu-layer'));
    this.audio = new FlightAudio();
    this.controls = new FlightControls(document.getElementById('menu-layer'));
    this.controls.firstInput = () => this.audio.start();
    this.state = 'title';
    this.missionIndex = 0;
    this.run = null;
    this.elapsed = 0;
    this.resultShown = null;
    this.menu.onPick = (index) => this.startMission(index);
    this.flight.on('gear', () => this.audio.gearMotor());
    this.flight.on('flaps', () => this.audio.click());
    this.flight.on('touchdown', (t) => {
      this.audio.touchdown(t.sinkRate);
      if (this.state === 'flying') {
        const color = t.sinkRate < 1.6 ? '#5ff08f' : t.sinkRate < 2.6 ? '#f2b632' : '#ff5a45';
        this.hud.toast(`TOUCHDOWN ${Math.round(t.sinkRate * 196.85)} FT/MIN`, color, 2.2);
      }
    });
    this.flight.on('crash', () => this.audio.crash());
    window.addEventListener('resize', () => {
      this.world.resize();
      this.hud.resize();
    });
  }

  /** Set up a mission attempt without changing screens (used by play and by screenshot mode). */
  beginRun(def) {
    this.run?.dispose();
    this.world.setTimeOfDay(def.timeOfDay);
    this.run = new MissionRun(def, this.flight, this.world, this.hud);
    this.rig.snap();
    this.hud.toasts = [];
  }

  startMission(index) {
    this.missionIndex = (index + MISSIONS.length) % MISSIONS.length;
    this.beginRun(MISSIONS[this.missionIndex]);
    this.menu.clear();
    this.controls.clearTaps();
    this.resultShown = null;
    this.state = 'flying';
    this.audio.start();
  }

  showTitle() {
    this.run?.dispose();
    this.run = null;
    this.state = 'title';
    this.world.setTimeOfDay('golden');
    this.flight.reset();
    this.rig.mode = 'chase';
    this.rig.snap();
    this.menu.showTitle(MISSIONS);
  }

  handleKeys() {
    const c = this.controls;
    if (this.state === 'title') {
      for (let i = 0; i < MISSIONS.length; i++) if (c.tapped(`Digit${i + 1}`)) return this.startMission(i);
      if (c.tapped('ArrowDown') || c.tapped('ArrowRight')) this.menu.select(this.menu.selected + 1);
      if (c.tapped('ArrowUp') || c.tapped('ArrowLeft')) this.menu.select(this.menu.selected - 1);
      if (c.tapped('Enter') || c.tapped('Space')) return this.startMission(this.menu.selected);
      c.clearTaps();
      return;
    }
    if (c.tapped('KeyM')) return this.showTitle();
    if (c.tapped('KeyR')) return this.startMission(this.missionIndex);
    if (this.state === 'result') {
      if (c.tapped('KeyN') && this.resultShown?.success) return this.startMission(this.missionIndex + 1);
      if (c.tapped('Enter')) return this.startMission(this.missionIndex);
      c.clearTaps();
      return;
    }
    if (c.tapped('Escape') || c.tapped('KeyP')) {
      if (this.state === 'paused') {
        this.state = 'flying';
        this.menu.clear();
      } else {
        this.state = 'paused';
        this.menu.showPause();
      }
      return;
    }
    if (this.state !== 'flying') return c.clearTaps();
    if (c.tapped('KeyG')) this.flight.toggleGear();
    if (c.tapped('KeyF')) this.flight.cycleFlaps();
    if (c.tapped('KeyC')) this.rig.toggleMode();
    c.clearTaps();
  }

  /** Mission panel, target bearing, wind and glidepath hint for the HUD. */
  hudView() {
    const status = this.run.status;
    const f = this.flight;
    const view = {
      flight: f,
      cameraMode: this.rig.mode,
      mission: { title: this.run.def.title, kicker: this.run.def.kicker, counter: status.counter, lines: status.lines },
      targetBearing: status.target ? bearingTo(f.position, status.target.x, status.target.z) : null,
      targetDistance: status.target ? Math.hypot(status.target.x - f.position.x, status.target.z - f.position.z) : null,
      mapTarget: status.target,
      mapRings: status.mapRings,
      wind: `WIND ${this.run.windLabel} KT`,
      glideHint: null,
    };
    // Glidepath advice when lined up within 4 km of a runway threshold with the gear down.
    for (const runway of RUNWAYS) {
      const local = toRunwayLocal(runway, f.position.x, f.position.z);
      const toThreshold = -runway.length / 2 - local.along;
      if (toThreshold > 60 && toThreshold < 4000 && Math.abs(local.across) < toThreshold * 0.2 + 60 && f.gearPosition > 0.5) {
        const angle = (Math.atan2(f.position.y - runway.elevation, toThreshold) * 180) / Math.PI;
        view.glideHint = angle < GLIDE_LOW ? `LOW ${angle.toFixed(1)}°` : angle > GLIDE_HIGH ? `HIGH ${angle.toFixed(1)}°` : `ON GLIDEPATH ${angle.toFixed(1)}°`;
      }
    }
    return view;
  }

  syncModel(dt) {
    const f = this.flight;
    this.model.root.position.copy(f.position);
    this.model.root.quaternion.copy(f.quaternion);
    this.model.animate(dt, {
      engineRunning: f.engineRunning && !f.crashed,
      throttle: f.rpm,
      controlRoll: f.controlRoll,
      controlPitch: f.controlPitch,
      controlYaw: f.controlYaw,
      flaps: f.flaps,
      gearPosition: f.gearPosition,
    }, this.elapsed);
    this.model.root.visible = !(this.rig.mode === 'cockpit' && (this.state === 'flying' || this.state === 'paused'));
  }

  /** Behind the title screen the Skylark circles Lake Ondine on rails. */
  titleFlyby() {
    const a = this.elapsed * 0.045;
    const r = 1500;
    const f = this.flight;
    f.position.set(LAKE.x + Math.cos(a) * r, 240, LAKE.z + Math.sin(a) * r);
    const heading = ((Math.atan2(-Math.sin(a), Math.cos(a)) * 180) / Math.PI + 360) % 360;
    f.setAttitude(heading, 2, 14);
    f.rpm = 0.75;
    f.engineRunning = true;
    f.gearPosition = 0;
  }

  frame(dt) {
    this.elapsed += dt;
    this.handleKeys();
    const input = this.controls.sample(dt);
    if (this.state === 'flying') {
      this.flight.step(dt, input);
      const result = this.run.update(dt);
      for (const e of this.run.events.splice(0)) {
        if (e.type === 'ring') this.audio.ringChime(e.index);
        if (e.type === 'miss') this.audio.missedRing();
      }
      if (result) {
        this.state = 'result';
        this.resultShown = result;
        saveBestResult(result);
        if (result.success) this.audio.success();
        else this.audio.failure();
        setTimeout(() => {
          if (this.state === 'result' && this.resultShown === result) this.menu.showResult(result, this.missionIndex, MISSIONS.length);
        }, result.crashed ? 1600 : 700);
      }
    } else if (this.state === 'result' && !this.flight.crashed) {
      this.flight.step(dt, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, throttleSet: 0, brakes: true });
    } else if (this.state === 'title') {
      this.titleFlyby();
    }
    this.syncModel(dt);
    if (this.state === 'result' && this.flight.crashed) this.rig.crashView(this.elapsed, this.flight.position);
    else if (this.state === 'title') this.rig.titleView(this.flight);
    else if (this.state !== 'paused') this.rig.update(dt, this.flight, this.controls);
    this.world.update(this.elapsed, this.flight.position, this.flight.wind);
    this.run?.rings?.update(this.elapsed, this.world.camera);
    this.world.render();
    if (this.state === 'flying' || this.state === 'paused') this.hud.draw(this.hudView());
    else this.hud.clear();
    this.audio.update(this.flight, this.state !== 'flying');
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** A hand-placed camera in the aircraft's heading frame, for the cover screenshot. */
  placeShotCamera({ right, up, back, ahead, lift, yaw = 0 }) {
    const h = (this.flight.attitude.heading * Math.PI) / 180;
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const p = this.flight.position;
    const cam = this.world.camera;
    cam.position.set(p.x - fz * right - fx * back, p.y + up, p.z + fx * right - fz * back);
    cam.up.set(0, 1, 0);
    const lookHeading = h + (yaw * Math.PI) / 180;
    cam.lookAt(cam.position.x + Math.sin(lookHeading) * ahead, p.y + lift, cam.position.z - Math.cos(lookHeading) * ahead);
  }

  /** Screenshot mode: stage the named scene, render exactly one frame and stop. */
  renderShot(name, params) {
    const staged = stageShot(this, name, params);
    this.elapsed = 12.4;
    if (staged.title) {
      this.titleFlyby();
      this.syncModel(0);
      this.rig.titleView(this.flight, Number(params.get('ta') ?? 26), Number(params.get('ts') ?? 15), Number(params.get('th') ?? 3.5), Number(params.get('tshift') ?? 0.34));
    } else {
      this.syncModel(0);
      this.model.root.visible = this.rig.mode !== 'cockpit';
      this.rig.update(0, this.flight, staged);
      if (staged.camera) this.placeShotCamera(staged.camera);
      this.run.rings?.update(this.elapsed, this.world.camera);
      if (staged.toast) this.hud.toast(staged.toast, '#f2b632', 30);
    }
    this.world.update(this.elapsed, this.flight.position, this.flight.wind);
    this.world.render();
    if (!staged.title) {
      this.state = 'flying';
      this.hud.draw(this.hudView());
    }
    document.title = 'ready';
  }
}

const params = new URLSearchParams(location.search);
const game = new SkylarkGame();
window.skylark = game;
if (params.has('shot')) game.renderShot(params.get('shot'), params);
else {
  game.showTitle();
  game.start();
}
