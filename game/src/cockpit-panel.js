// SPDX-License-Identifier: MIT
// Cockpit view: canopy frame, glareshield and a lit instrument panel of round gauges (airspeed,
// attitude, altimeter, heading, vertical speed, fuel/RPM), drawn over the 3D windscreen view.

import { MS_TO_KNOTS, M_TO_FEET } from './flight-model.js';
import { HUD_COLORS, font, drawAttitudeIndicator } from './hud.js';

function gaugeFace(ctx, cx, cy, r, title) {
  const bezel = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.12);
  bezel.addColorStop(0, '#5b6068');
  bezel.addColorStop(1, '#16181c');
  ctx.fillStyle = bezel;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.fill();
  const face = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#20242b');
  face.addColorStop(1, '#090b0e');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (title) {
    ctx.fillStyle = 'rgba(255,240,210,0.75)';
    ctx.font = font(Math.round(r * 0.15));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, cx, cy + r * 0.42);
  }
}

function needle(ctx, cx, cy, r, angle, color = '#fff', width = 4, length = 0.82) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.15);
  ctx.lineTo(0, -r * length);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function glassGlare(ctx, cx, cy, r) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.2);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function scaleTicks(ctx, cx, cy, r, from, to, startAngle, sweep, step, labelEvery, labeler, arcs = []) {
  for (const arc of arcs) {
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    const a0 = startAngle + ((arc.from - from) / (to - from)) * sweep - Math.PI / 2;
    const a1 = startAngle + ((arc.to - from) / (to - from)) * sweep - Math.PI / 2;
    ctx.arc(cx, cy, r * 0.86, a0, a1);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f2ede2';
  ctx.fillStyle = '#f2ede2';
  ctx.font = font(Math.round(r * 0.17));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let v = from; v <= to + 0.001; v += step) {
    const a = startAngle + ((v - from) / (to - from)) * sweep;
    const major = Math.abs(v / labelEvery - Math.round(v / labelEvery)) < 0.001;
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r * (major ? 0.74 : 0.8), cy - Math.cos(a) * r * (major ? 0.74 : 0.8));
    ctx.lineTo(cx + Math.sin(a) * r * 0.93, cy - Math.cos(a) * r * 0.93);
    ctx.stroke();
    if (major && labeler) ctx.fillText(labeler(v), cx + Math.sin(a) * r * 0.58, cy - Math.cos(a) * r * 0.58);
  }
}

function airspeedGauge(ctx, cx, cy, r, kt) {
  gaugeFace(ctx, cx, cy, r, 'KNOTS');
  const start = -2.4;
  const sweep = 4.8;
  scaleTicks(ctx, cx, cy, r, 0, 200, start, sweep, 10, 40, (v) => String(v), [
    { from: 48, to: 100, color: '#f2f2f2' },
    { from: 58, to: 160, color: '#3fbf5f' },
    { from: 160, to: 182, color: '#e8b52a' },
  ]);
  needle(ctx, cx, cy, r, start + (Math.min(200, kt) / 200) * sweep);
  digital(ctx, cx, cy + r * 0.2, r, String(Math.round(kt)));
  glassGlare(ctx, cx, cy, r);
}

function digital(ctx, cx, cy, r, text) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.32, cy - r * 0.13, r * 0.64, r * 0.26, r * 0.05);
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.font = font(Math.round(r * 0.2), 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

function altimeterGauge(ctx, cx, cy, r, feet) {
  gaugeFace(ctx, cx, cy, r, 'ALT FT');
  scaleTicks(ctx, cx, cy, r, 0, 1000, 0, Math.PI * 2 - 0.001, 20, 100, (v) => (v === 1000 ? '' : String(v / 100)));
  needle(ctx, cx, cy, r, ((feet % 10000) / 10000) * Math.PI * 2, '#ffd27a', 7, 0.5);
  needle(ctx, cx, cy, r, ((feet % 1000) / 1000) * Math.PI * 2, '#fff', 4, 0.84);
  digital(ctx, cx, cy + r * 0.2, r, String(Math.round(feet / 10) * 10));
  glassGlare(ctx, cx, cy, r);
}

function verticalSpeedGauge(ctx, cx, cy, r, fpm) {
  gaugeFace(ctx, cx, cy, r, 'VSI ×100');
  // Zero at nine o'clock; climb sweeps up, descent sweeps down.
  const sweep = 2.7;
  scaleTicks(ctx, cx, cy, r, -20, 20, -Math.PI / 2 - sweep, sweep * 2, 2.5, 5, (v) => String(Math.abs(v)));
  const v = Math.max(-20, Math.min(20, fpm / 100));
  needle(ctx, cx, cy, r, -Math.PI / 2 + (v / 20) * sweep, fpm < -900 ? '#ff6b55' : '#fff');
  ctx.fillStyle = 'rgba(255,240,210,0.6)';
  ctx.font = font(Math.round(r * 0.13));
  ctx.textAlign = 'center';
  ctx.fillText('UP', cx - r * 0.2, cy - r * 0.42);
  ctx.fillText('DN', cx - r * 0.2, cy + r * 0.25);
  glassGlare(ctx, cx, cy, r);
}

function headingGauge(ctx, cx, cy, r, heading, bug) {
  gaugeFace(ctx, cx, cy, r, null);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);
  ctx.strokeStyle = '#f2ede2';
  ctx.fillStyle = '#f2ede2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180;
    const major = d % 30 === 0;
    ctx.lineWidth = major ? 3 : 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r * (major ? 0.76 : d % 10 === 0 ? 0.82 : 0.87), -Math.cos(a) * r * (major ? 0.76 : 0.82));
    ctx.lineTo(Math.sin(a) * r * 0.94, -Math.cos(a) * r * 0.94);
    ctx.stroke();
    if (major) {
      ctx.save();
      ctx.translate(Math.sin(a) * r * 0.6, -Math.cos(a) * r * 0.6);
      ctx.rotate(a);
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      ctx.font = font(Math.round(r * (label.length === 1 && isNaN(label) ? 0.22 : 0.16)));
      ctx.fillStyle = label === 'N' ? '#ffb340' : '#f2ede2';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  if (bug !== null && bug !== undefined) {
    const a = (bug * Math.PI) / 180;
    ctx.fillStyle = HUD_COLORS.cyan;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-r * 0.07, -r * 0.99, r * 0.14, r * 0.1);
    ctx.restore();
  }
  ctx.restore();
  // Fixed aircraft silhouette.
  ctx.fillStyle = '#ffb340';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.34);
  ctx.lineTo(cx + r * 0.05, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.3, cy + r * 0.05);
  ctx.lineTo(cx + r * 0.05, cy + r * 0.07);
  ctx.lineTo(cx + r * 0.03, cy + r * 0.24);
  ctx.lineTo(cx + r * 0.12, cy + r * 0.3);
  ctx.lineTo(cx - r * 0.12, cy + r * 0.3);
  ctx.lineTo(cx - r * 0.03, cy + r * 0.24);
  ctx.lineTo(cx - r * 0.05, cy + r * 0.07);
  ctx.lineTo(cx - r * 0.3, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.05, cy - r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb340';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.0);
  ctx.lineTo(cx - r * 0.07, cy - r * 0.88);
  ctx.lineTo(cx + r * 0.07, cy - r * 0.88);
  ctx.fill();
  glassGlare(ctx, cx, cy, r);
}

function engineGauge(ctx, cx, cy, r, flight) {
  gaugeFace(ctx, cx, cy, r, null);
  // Tachometer on the upper arc, fuel quantity as a lit bar below it.
  scaleTicks(ctx, cx, cy, r, 0, 30, -2.2, 4.4, 2.5, 10, (v) => String(v), [{ from: 21, to: 27, color: '#3fbf5f' }, { from: 27, to: 30, color: '#d9402e' }]);
  needle(ctx, cx, cy, r, -2.2 + ((flight.rpm * 27) / 30) * 4.4, '#fff', 4, 0.8);
  ctx.fillStyle = 'rgba(255,240,210,0.75)';
  ctx.font = font(Math.round(r * 0.14));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RPM ×100', cx, cy - r * 0.3);
  const barW = r * 1.0;
  const barY = cy + r * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(cx - barW / 2, barY, barW, r * 0.12);
  ctx.fillStyle = flight.fuel < 0.12 ? '#ff5a45' : '#62d8ff';
  ctx.fillRect(cx - barW / 2, barY, barW * Math.max(0, Math.min(1, flight.fuel)), r * 0.12);
  ctx.fillStyle = 'rgba(255,240,210,0.75)';
  ctx.fillText(`FUEL ${Math.round(flight.fuel * 120)} L`, cx, cy + r * 0.8);
  glassGlare(ctx, cx, cy, r);
}

function switchLamp(ctx, x, y, label, on, color) {
  ctx.fillStyle = on ? color : '#23262b';
  ctx.shadowColor = on ? color : 'transparent';
  ctx.shadowBlur = on ? 12 : 0;
  ctx.beginPath();
  ctx.roundRect(x, y, 86, 26, 5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = on ? '#0b0d10' : '#7c8088';
  ctx.font = font(14, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 43, y + 13);
}

export function drawCockpitPanel(ctx, W, H, flight, view) {
  const att = flight.attitude;
  const panelTop = H * 0.6;
  // Canopy frame posts and top bow.
  ctx.fillStyle = '#1a1d22';
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 10);
  ctx.lineTo(0, 0);
  ctx.lineTo(70, 0);
  ctx.quadraticCurveTo(W * 0.1, H * 0.3, W * 0.17, panelTop - 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, panelTop + 10);
  ctx.lineTo(W, 0);
  ctx.lineTo(W - 70, 0);
  ctx.quadraticCurveTo(W * 0.9, H * 0.3, W * 0.83, panelTop - 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = '#2a2e35';
  ctx.fillRect(W / 2 - 60, 26, 120, 16); // compass/mirror mount
  // Glareshield.
  const shield = ctx.createLinearGradient(0, panelTop - 40, 0, panelTop + 20);
  shield.addColorStop(0, '#2b2f36');
  shield.addColorStop(1, '#121417');
  ctx.fillStyle = shield;
  ctx.beginPath();
  ctx.moveTo(W * 0.12, panelTop + 20);
  ctx.quadraticCurveTo(W * 0.5, panelTop - 70, W * 0.88, panelTop + 20);
  ctx.lineTo(W, panelTop + 20);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.lineTo(0, panelTop + 20);
  ctx.closePath();
  ctx.fill();
  // Panel face with a soft spot of instrument light.
  const face = ctx.createLinearGradient(0, panelTop, 0, H);
  face.addColorStop(0, '#3a3f47');
  face.addColorStop(1, '#22252b');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.roundRect(W * 0.06, panelTop + 8, W * 0.88, H - panelTop + 20, 26);
  ctx.fill();
  const glow = ctx.createRadialGradient(W / 2, panelTop + 40, 20, W / 2, panelTop + 80, W * 0.5);
  glow.addColorStop(0, 'rgba(255,200,120,0.14)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, panelTop, W, H - panelTop);
  // Screws.
  ctx.fillStyle = '#5c616a';
  for (const [x, y] of [[W * 0.08, panelTop + 26], [W * 0.92, panelTop + 26], [W * 0.08, H - 22], [W * 0.92, H - 22]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Six-pack plus engine gauge.
  const r = Math.min(68, (H - panelTop) * 0.23);
  const rowY = panelTop + 26 + r * 1.15;
  const gap = r * 2.55;
  const x0 = W / 2 - gap * 2.5;
  const kt = flight.airspeed * MS_TO_KNOTS;
  airspeedGauge(ctx, x0, rowY, r, kt);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x0 + gap, rowY, r * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = '#16181c';
  ctx.fill();
  ctx.restore();
  drawAttitudeIndicator(ctx, x0 + gap, rowY, r, att.pitch, att.bank);
  altimeterGauge(ctx, x0 + gap * 2, rowY, r, flight.position.y * M_TO_FEET);
  headingGauge(ctx, x0 + gap * 3, rowY, r, att.heading, view.targetBearing);
  verticalSpeedGauge(ctx, x0 + gap * 4, rowY, r, flight.verticalSpeed * 196.85);
  engineGauge(ctx, x0 + gap * 5, rowY, r, flight);
  // Annunciator lamps and switches.
  const ly = rowY + r * 1.35;
  const lamps = [
    ['GEAR', flight.gearPosition > 0.98, '#5ff08f'],
    ['FLAPS ' + [0, 15, 30][flight.flapStage], flight.flapStage > 0, '#62d8ff'],
    ['BRAKE', flight.brakes, '#f2b632'],
    ['STALL', flight.stallWarning && Math.floor(performance.now() / 250) % 2 === 0, '#ff5a45'],
    ['LOW FUEL', flight.fuel < 0.12, '#f2b632'],
    ['ENGINE', flight.engineRunning, '#5ff08f'],
  ];
  const lx0 = W / 2 - (lamps.length * 96) / 2;
  lamps.forEach(([label, on, color], i) => switchLamp(ctx, lx0 + i * 96 + 5, ly, label, on, color));
  // Throttle lever on the right.
  const tx = W * 0.95;
  ctx.fillStyle = '#121417';
  ctx.beginPath();
  ctx.roundRect(tx - 14, panelTop + 40, 28, H - panelTop - 70, 10);
  ctx.fill();
  const knobY = panelTop + 50 + (1 - flight.throttle) * (H - panelTop - 110);
  ctx.fillStyle = '#1c1f24';
  ctx.beginPath();
  ctx.arc(tx, knobY + 18, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b8892e';
  ctx.beginPath();
  ctx.roundRect(tx - 22, knobY, 44, 36, 10);
  ctx.fill();
  ctx.fillStyle = '#16181c';
  ctx.font = font(13, 800);
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(flight.throttle * 100)}%`, tx, knobY + 19);
  ctx.fillStyle = 'rgba(255,240,210,0.6)';
  ctx.fillText('THROTTLE', tx - 4, panelTop + 30);
}
