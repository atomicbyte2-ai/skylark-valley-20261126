// SPDX-License-Identifier: MIT
// Head-up display drawn on a 2D canvas over the 3D view: heading tape, airspeed and altitude tapes,
// vertical speed, attitude indicator, throttle/fuel/damage gauges, gear/flaps/brake annunciators,
// mission panel, minimap and toast messages. Laid out for 1280x800 and scaled to the window.

import { MS_TO_KNOTS, M_TO_FEET } from './flight-model.js';
import { WORLD_HALF_SIZE, RUNWAYS, runwayFrame, terrainHeightAt } from './world-map.js';
import { drawCockpitPanel } from './cockpit-panel.js';

export const HUD_COLORS = {
  panel: 'rgba(8,14,26,0.62)',
  panelEdge: 'rgba(255,255,255,0.16)',
  text: '#f7f3ea',
  dim: 'rgba(247,243,234,0.62)',
  amber: '#f2b632',
  green: '#5ff08f',
  red: '#ff5a45',
  cyan: '#62d8ff',
  sky: '#3a7fd0',
  ground: '#8a5a2e',
};
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

export function font(size, weight = 700) {
  return `${weight} ${size}px ${FONT}`;
}

export function roundedPanel(ctx, x, y, w, h, r = 12, fill = HUD_COLORS.panel) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = HUD_COLORS.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Round attitude indicator: sky over ground, pitch ladder, bank scale and the aircraft symbol. */
export function drawAttitudeIndicator(ctx, cx, cy, r, pitchDeg, bankDeg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-bankDeg * Math.PI) / 180);
  const pxPerDeg = r / 32;
  const horizon = pitchDeg * pxPerDeg;
  const sky = ctx.createLinearGradient(0, -r * 2, 0, horizon);
  sky.addColorStop(0, '#1f4f9a');
  sky.addColorStop(1, '#5aa2e8');
  ctx.fillStyle = sky;
  ctx.fillRect(-r * 2, -r * 3, r * 4, r * 3 + horizon);
  const ground = ctx.createLinearGradient(0, horizon, 0, r * 2);
  ground.addColorStop(0, '#9a6232');
  ground.addColorStop(1, '#5a3618');
  ctx.fillStyle = ground;
  ctx.fillRect(-r * 2, horizon, r * 4, r * 3);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 2, horizon);
  ctx.lineTo(r * 2, horizon);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.fillStyle = '#fff';
  ctx.font = font(Math.max(10, r * 0.15));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let p = -30; p <= 30; p += 10) {
    if (p === 0) continue;
    const y = horizon - p * pxPerDeg;
    const w = r * (Math.abs(p) % 20 === 0 ? 0.42 : 0.3);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(String(Math.abs(p)), -w - r * 0.14, y);
    ctx.fillText(String(Math.abs(p)), w + r * 0.14, y);
  }
  for (let p = -25; p <= 25; p += 10) {
    const y = horizon - p * pxPerDeg;
    ctx.beginPath();
    ctx.moveTo(-r * 0.14, y);
    ctx.lineTo(r * 0.14, y);
    ctx.stroke();
  }
  ctx.restore();
  // Bank scale (fixed) and pointer (rotating).
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = ((b - 90) * Math.PI) / 180;
    const inner = b % 30 === 0 ? r * 0.8 : r * 0.87;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
    ctx.stroke();
  }
  ctx.rotate((-bankDeg * Math.PI) / 180);
  ctx.fillStyle = HUD_COLORS.amber;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.79);
  ctx.lineTo(-r * 0.08, -r * 0.66);
  ctx.lineTo(r * 0.08, -r * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Aircraft symbol.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = HUD_COLORS.amber;
  ctx.fillStyle = HUD_COLORS.amber;
  ctx.lineWidth = Math.max(3, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.18, 0);
  ctx.lineTo(-r * 0.09, r * 0.1);
  ctx.moveTo(r * 0.55, 0);
  ctx.lineTo(r * 0.18, 0);
  ctx.lineTo(r * 0.09, r * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(20,24,30,0.95)';
  ctx.lineWidth = Math.max(4, r * 0.07);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.04, 0, Math.PI * 2);
  ctx.stroke();
}

function buildMinimapImage() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const cell = (WORLD_HALF_SIZE * 2) / size;
  const heights = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) heights[j * size + i] = terrainHeightAt(-WORLD_HALF_SIZE + (i + 0.5) * cell, -WORLD_HALF_SIZE + (j + 0.5) * cell);
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const h = heights[j * size + i];
      const k = (j * size + i) * 4;
      let c;
      if (h < 0) c = [38, 92, 140];
      else if (h > 820) c = [232, 234, 240];
      else if (h > 420) c = [128, 116, 98];
      else if (h > 140) c = [92, 118, 66];
      else c = [110, 140, 74];
      const left = heights[j * size + Math.max(0, i - 1)];
      const up = heights[Math.max(0, j - 1) * size + i];
      const shade = h < 0 ? 1 : Math.max(0.55, Math.min(1.35, 1 + ((left - h) + (up - h)) / 90));
      image.data[k] = Math.min(255, c[0] * shade);
      image.data[k + 1] = Math.min(255, c[1] * shade);
      image.data[k + 2] = Math.min(255, c[2] * shade);
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class FlightHud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = buildMinimapImage();
    this.toasts = [];
    this.resize();
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth || 1280;
    this.height = window.innerHeight || 800;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ratio = ratio;
  }

  toast(text, color = HUD_COLORS.amber, seconds = 2.4) {
    this.toasts.push({ text, color, until: performance.now() + seconds * 1000 });
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Draw everything for one frame. `view` holds the flight, mission status and camera mode. */
  draw(view) {
    this.clear();
    const ctx = this.ctx;
    const scale = Math.min(this.width / 1280, this.height / 800);
    ctx.setTransform(this.ratio * scale, 0, 0, this.ratio * scale, 0, 0);
    const W = this.width / scale;
    const H = this.height / scale;
    const flight = view.flight;
    const att = flight.attitude;
    if (view.cameraMode === 'cockpit') {
      drawCockpitPanel(ctx, W, H, flight, view);
    } else {
      this.drawHeadingTape(ctx, W / 2, 22, att.heading, view.targetBearing);
      this.drawSpeedTape(ctx, W / 2 - 470, H / 2 - 128, flight);
      this.drawAltitudeTape(ctx, W / 2 + 380, H / 2 - 128, flight);
      roundedPanel(ctx, 18, H - 214, 196, 196, 98, 'rgba(8,14,26,0.5)');
      drawAttitudeIndicator(ctx, 116, H - 116, 86, att.pitch, att.bank);
      this.drawSystems(ctx, W - 268, H - 214, flight);
      this.drawAnnunciators(ctx, W / 2, H - 50, flight, view);
    }
    this.drawMissionPanel(ctx, 18, 18, view.mission);
    this.drawMinimap(ctx, W - 118, 118, 100, flight, view);
    this.drawToasts(ctx, W / 2, H * 0.3);
  }

  drawHeadingTape(ctx, cx, y, heading, targetBearing) {
    const w = 540;
    const h = 54;
    roundedPanel(ctx, cx - w / 2, y, w, h, 10);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w / 2 + 4, y, w - 8, h);
    ctx.clip();
    const pxPerDeg = 4.2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = HUD_COLORS.text;
    ctx.fillStyle = HUD_COLORS.text;
    for (let d = Math.floor(heading - 70); d <= heading + 70; d++) {
      if (d % 5 !== 0) continue;
      const x = cx + (d - heading) * pxPerDeg;
      const deg = ((d % 360) + 360) % 360;
      const major = deg % 30 === 0;
      ctx.lineWidth = major ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h - (major ? 16 : deg % 10 === 0 ? 11 : 6));
      ctx.stroke();
      if (major) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] ?? String(deg / 10).padStart(2, '0');
        ctx.font = font(label.length === 1 ? 22 : 19);
        ctx.fillStyle = label.length === 1 ? HUD_COLORS.amber : HUD_COLORS.text;
        ctx.fillText(label, x, y + 18);
      }
    }
    if (targetBearing !== null && targetBearing !== undefined) {
      let diff = ((targetBearing - heading + 540) % 360) - 180;
      diff = Math.max(-62, Math.min(62, diff));
      const x = cx + diff * pxPerDeg;
      ctx.fillStyle = HUD_COLORS.cyan;
      ctx.beginPath();
      ctx.moveTo(x, y + h - 2);
      ctx.lineTo(x - 9, y + h - 16);
      ctx.lineTo(x + 9, y + h - 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Current heading box.
    ctx.fillStyle = '#0b1220';
    ctx.strokeStyle = HUD_COLORS.amber;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - 38, y + h - 4, 76, 34, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(24, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(heading) % 360).padStart(3, '0') + '°', cx, y + h + 13);
  }

  drawTape(ctx, x, y, w, h, value, step, labelEvery, pxPerUnit, bands, label, unit) {
    roundedPanel(ctx, x, y, w, h, 10);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + 2, w, h - 4);
    ctx.clip();
    const mid = y + h / 2;
    for (const band of bands) {
      const y0 = mid - (band.to - value) * pxPerUnit;
      const y1 = mid - (band.from - value) * pxPerUnit;
      ctx.fillStyle = band.color;
      ctx.fillRect(band.side === 'left' ? x + 2 : x + w - 9, y0, 7, y1 - y0);
    }
    ctx.strokeStyle = HUD_COLORS.text;
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(18);
    ctx.textBaseline = 'middle';
    const start = Math.floor((value - h / 2 / pxPerUnit) / step) * step;
    for (let v = start; v <= value + h / 2 / pxPerUnit; v += step) {
      if (v < 0) continue;
      const yy = mid - (v - value) * pxPerUnit;
      const major = Math.round(v) % labelEvery === 0;
      ctx.lineWidth = major ? 2.5 : 1.5;
      ctx.beginPath();
      if (bands[0]?.side === 'left') {
        ctx.moveTo(x + w, yy);
        ctx.lineTo(x + w - (major ? 16 : 9), yy);
      } else {
        ctx.moveTo(x, yy);
        ctx.lineTo(x + (major ? 16 : 9), yy);
      }
      ctx.stroke();
      if (major) {
        ctx.textAlign = bands[0]?.side === 'left' ? 'right' : 'left';
        ctx.fillText(String(Math.round(v)), bands[0]?.side === 'left' ? x + w - 22 : x + 22, yy);
      }
    }
    ctx.restore();
    // Readout box.
    ctx.fillStyle = '#0b1220';
    ctx.strokeStyle = HUD_COLORS.amber;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - 6, mid - 22, w + 12, 44, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(28, 800);
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), x + w / 2, mid + 1);
    ctx.font = font(15);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.fillText(label, x + w / 2, y - 14);
    ctx.fillStyle = HUD_COLORS.dim;
    ctx.fillText(unit, x + w / 2, y + h + 14);
  }

  drawSpeedTape(ctx, x, y, flight) {
    const kt = flight.airspeed * MS_TO_KNOTS;
    this.drawTape(ctx, x, y, 92, 300, kt, 5, 20, 3.2, [
      { from: 0, to: 55, color: HUD_COLORS.red, side: 'left' },
      { from: 55, to: 100, color: '#f7f3ea', side: 'left' },
      { from: 62, to: 160, color: HUD_COLORS.green, side: 'left' },
      { from: 160, to: 180, color: HUD_COLORS.amber, side: 'left' },
      { from: 180, to: 260, color: HUD_COLORS.red, side: 'left' },
    ], 'SPEED', 'KNOTS');
  }

  drawAltitudeTape(ctx, x, y, flight) {
    const ft = flight.position.y * M_TO_FEET;
    this.drawTape(ctx, x, y, 98, 300, ft, 50, 200, 0.32, [], 'ALTITUDE', 'FEET');
    // Vertical speed scale beside the altitude tape.
    const vx = x + 110;
    roundedPanel(ctx, vx, y + 30, 44, 240, 8);
    const fpm = flight.verticalSpeed * 196.85;
    const clampFpm = Math.max(-2000, Math.min(2000, fpm));
    const mid = y + 150;
    ctx.strokeStyle = HUD_COLORS.dim;
    ctx.fillStyle = HUD_COLORS.dim;
    ctx.font = font(12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const v of [-2000, -1000, -500, 0, 500, 1000, 2000]) {
      const yy = mid - (Math.sign(v) * Math.sqrt(Math.abs(v) / 2000) * 110);
      ctx.beginPath();
      ctx.moveTo(vx + 4, yy);
      ctx.lineTo(vx + 12, yy);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (Math.abs(v) >= 1000) ctx.fillText(String(Math.abs(v) / 1000), vx + 16, yy);
    }
    const py = mid - Math.sign(clampFpm) * Math.sqrt(Math.abs(clampFpm) / 2000) * 110;
    ctx.strokeStyle = fpm < -900 ? HUD_COLORS.red : HUD_COLORS.green;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(vx + 40, mid);
    ctx.lineTo(vx + 8, py);
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(15);
    ctx.textAlign = 'center';
    ctx.fillText('VS', vx + 22, y + 18);
    ctx.font = font(16, 800);
    ctx.fillStyle = fpm < -900 ? HUD_COLORS.red : HUD_COLORS.text;
    ctx.fillText(`${fpm >= 0 ? '+' : ''}${Math.round(fpm / 10) * 10}`, vx + 22, y + 284);
  }

  drawGaugeBar(ctx, x, y, w, label, fraction, color, text) {
    ctx.fillStyle = HUD_COLORS.dim;
    ctx.font = font(14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(16, 800);
    ctx.fillText(text, x + w, y);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(x, y + 12, w, 12, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y + 12, Math.max(6, w * Math.max(0, Math.min(1, fraction))), 12, 6);
    ctx.fill();
  }

  drawSystems(ctx, x, y, flight) {
    roundedPanel(ctx, x, y, 250, 196, 12);
    // Throttle quadrant.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(x + 18, y + 30, 26, 140, 8);
    ctx.fill();
    const t = flight.throttle;
    const grad = ctx.createLinearGradient(0, y + 170, 0, y + 30);
    grad.addColorStop(0, HUD_COLORS.green);
    grad.addColorStop(1, HUD_COLORS.amber);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + 18, y + 30 + 140 * (1 - t), 26, 140 * t + 0.01, 8);
    ctx.fill();
    ctx.fillStyle = HUD_COLORS.text;
    ctx.fillRect(x + 12, y + 30 + 140 * (1 - t) - 2, 38, 5);
    ctx.font = font(14);
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.fillText('THR', x + 31, y + 16);
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(15, 800);
    ctx.fillText(`${Math.round(t * 100)}%`, x + 31, y + 184);
    const rpm = Math.round(flight.rpm * 2700);
    this.drawGaugeBar(ctx, x + 66, y + 22, 166, 'ENGINE RPM', flight.rpm, flight.engineRunning ? HUD_COLORS.green : HUD_COLORS.red, flight.engineRunning ? String(rpm) : 'OFF');
    const fuelColor = flight.fuel < 0.15 ? HUD_COLORS.red : flight.fuel < 0.3 ? HUD_COLORS.amber : HUD_COLORS.cyan;
    this.drawGaugeBar(ctx, x + 66, y + 72, 166, 'FUEL', flight.fuel, fuelColor, `${Math.round(flight.fuel * 120)} L`);
    const hull = 1 - flight.damage / 100;
    const hullColor = hull < 0.35 ? HUD_COLORS.red : hull < 0.7 ? HUD_COLORS.amber : HUD_COLORS.green;
    this.drawGaugeBar(ctx, x + 66, y + 122, 166, 'AIRFRAME', hull, hullColor, `${Math.round(hull * 100)}%`);
    ctx.fillStyle = HUD_COLORS.dim;
    ctx.font = font(14);
    ctx.textAlign = 'left';
    ctx.fillText(`G ${flight.gLoad.toFixed(1)}`, x + 66, y + 172);
    ctx.textAlign = 'right';
    ctx.fillText(`AOA ${(flight.alpha * 57.3).toFixed(0)}°`, x + 232, y + 172);
  }

  drawAnnunciators(ctx, cx, y, flight, view) {
    const items = [];
    const gearState = flight.gearPosition > 0.98 ? 'GEAR DOWN' : flight.gearPosition < 0.02 ? 'GEAR UP' : 'GEAR TRANSIT';
    items.push({ text: gearState, color: flight.gearPosition > 0.98 ? HUD_COLORS.green : flight.gearPosition < 0.02 ? HUD_COLORS.dim : HUD_COLORS.amber });
    items.push({ text: `FLAPS ${[0, 15, 30][flight.flapStage]}`, color: flight.flapStage ? HUD_COLORS.cyan : HUD_COLORS.dim });
    items.push({ text: 'BRAKE', color: flight.brakes ? HUD_COLORS.amber : 'rgba(247,243,234,0.3)' });
    if (view.wind) items.push({ text: view.wind, color: HUD_COLORS.text });
    const blink = Math.floor(performance.now() / 280) % 2 === 0;
    if (flight.stallWarning) items.push({ text: 'STALL', color: blink ? HUD_COLORS.red : '#fff', alert: true });
    if (!flight.engineRunning && !flight.crashed) items.push({ text: 'ENGINE OUT', color: HUD_COLORS.red, alert: true });
    else if (flight.fuel < 0.12) items.push({ text: 'LOW FUEL', color: blink ? HUD_COLORS.amber : '#fff', alert: true });
    if (view.glideHint) items.push({ text: view.glideHint, color: HUD_COLORS.text });
    ctx.font = font(17, 800);
    const widths = items.map((i) => ctx.measureText(i.text).width + 30);
    const total = widths.reduce((a, b) => a + b, 0) + (items.length - 1) * 10;
    let x = cx - total / 2;
    items.forEach((item, index) => {
      const w = widths[index];
      ctx.beginPath();
      ctx.roundRect(x, y - 19, w, 38, 8);
      ctx.fillStyle = item.alert ? 'rgba(90,10,6,0.78)' : 'rgba(8,14,26,0.66)';
      ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = item.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, x + w / 2, y + 1);
      x += w + 10;
    });
  }

  drawMissionPanel(ctx, x, y, mission) {
    if (!mission) return;
    const lines = mission.lines ?? [];
    const h = 74 + lines.length * 26;
    roundedPanel(ctx, x, y, 330, h, 12);
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.font = font(13);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(mission.kicker ?? 'MISSION', x + 18, y + 20);
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(22, 800);
    ctx.fillText(mission.title, x + 18, y + 46);
    if (mission.counter) {
      ctx.textAlign = 'right';
      ctx.fillStyle = HUD_COLORS.amber;
      ctx.font = font(26, 800);
      ctx.fillText(mission.counter, x + 312, y + 44);
      ctx.textAlign = 'left';
    }
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color ?? HUD_COLORS.dim;
      ctx.font = font(17, line.bold ? 800 : 600);
      ctx.fillText(line.text, x + 18, y + 80 + i * 26);
    });
  }

  drawMinimap(ctx, cx, cy, r, flight, view) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1220';
    ctx.fill();
    ctx.clip();
    const heading = flight.attitude.heading;
    const metresShown = 5200;
    const pxPerMetre = r / (metresShown / 2);
    ctx.translate(cx, cy);
    ctx.rotate((-heading * Math.PI) / 180);
    const mapPx = (WORLD_HALF_SIZE * 2) * pxPerMetre;
    const ox = -(flight.position.x + WORLD_HALF_SIZE) * pxPerMetre;
    const oz = -(flight.position.z + WORLD_HALF_SIZE) * pxPerMetre;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.minimap, ox, oz, mapPx, mapPx);
    ctx.globalAlpha = 1;
    const toMap = (x, z) => [(x - flight.position.x) * pxPerMetre, (z - flight.position.z) * pxPerMetre];
    for (const runway of RUNWAYS) {
      const f = runwayFrame(runway);
      const [ax, az] = toMap(runway.x - f.fx * runway.length / 2, runway.z - f.fz * runway.length / 2);
      const [bx, bz] = toMap(runway.x + f.fx * runway.length / 2, runway.z + f.fz * runway.length / 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ax, az);
      ctx.lineTo(bx, bz);
      ctx.stroke();
    }
    if (view.mapRings) {
      view.mapRings.forEach((p, i) => {
        const [mx, mz] = toMap(p.x, p.z);
        ctx.fillStyle = i === 0 ? HUD_COLORS.amber : 'rgba(242,182,50,0.55)';
        ctx.beginPath();
        ctx.arc(mx, mz, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (view.mapTarget) {
      const [tx, tz] = toMap(view.mapTarget.x, view.mapTarget.z);
      ctx.strokeStyle = HUD_COLORS.cyan;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, tz);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // Own aircraft, always pointing up.
    ctx.fillStyle = HUD_COLORS.amber;
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 9, cy + 9);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 9, cy + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = HUD_COLORS.text;
    ctx.font = font(14, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + Math.sin((-heading * Math.PI) / 180) * (r - 12), cy - Math.cos((-heading * Math.PI) / 180) * (r - 12));
    if (view.targetDistance !== null && view.targetDistance !== undefined) {
      ctx.fillStyle = HUD_COLORS.panel;
      ctx.beginPath();
      ctx.roundRect(cx - 54, cy + r + 8, 108, 28, 8);
      ctx.fill();
      ctx.fillStyle = HUD_COLORS.cyan;
      ctx.font = font(16, 800);
      ctx.fillText(`${(view.targetDistance / 1852).toFixed(1)} NM`, cx, cy + r + 22);
    }
  }

  drawToasts(ctx, cx, y) {
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => t.until > now);
    this.toasts.slice(-2).forEach((t, i) => {
      ctx.font = font(30, 800);
      const w = ctx.measureText(t.text).width + 48;
      ctx.globalAlpha = Math.min(1, (t.until - now) / 400);
      ctx.fillStyle = 'rgba(8,14,26,0.7)';
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, y + i * 56 - 24, w, 48, 10);
      ctx.fill();
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, cx, y + i * 56 + 1);
      ctx.globalAlpha = 1;
    });
  }
}
