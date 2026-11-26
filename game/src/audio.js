// SPDX-License-Identifier: MIT
// WebAudio sound, all synthesised: a piston engine (detuned saws through a low-pass, pulsing with the
// propeller), wind rush that rises with airspeed, a stall horn, ring chimes, tyre chirps and a crash.
// Nothing plays until the first key press or click, as browsers require.

export class FlightAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
  }

  start() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws and a sub-square, low-passed, amplitude-pulsed by a propeller LFO.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOscillators = [
      { type: 'sawtooth', detune: -8, level: 0.5 },
      { type: 'sawtooth', detune: 9, level: 0.45 },
      { type: 'square', detune: 0, level: 0.25, octave: 0.5 },
    ].map((spec) => {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.detune.value = spec.detune;
      const gain = ctx.createGain();
      gain.gain.value = spec.level;
      osc.connect(gain);
      gain.connect(this.engineFilter);
      osc.start();
      return { osc, octave: spec.octave ?? 1 };
    });
    this.propLfo = ctx.createOscillator();
    this.propLfo.type = 'sine';
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    this.propLfo.connect(lfoDepth);
    lfoDepth.connect(this.engineGain.gain);
    this.propLfo.start();

    // Wind: looping noise through a band-pass whose centre follows airspeed.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 8;
    }
    this.noiseBuffer = noise;
    const windSource = ctx.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSource.start();

    // Stall horn.
    this.hornOsc = ctx.createOscillator();
    this.hornOsc.type = 'square';
    this.hornOsc.frequency.value = 880;
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.value = 1800;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    this.hornOsc.connect(hornFilter);
    hornFilter.connect(this.hornGain);
    this.hornGain.connect(this.master);
    this.hornOsc.start();
  }

  /** Called every frame with the aircraft state. */
  update(flight, paused) {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const running = flight.engineRunning && !paused && !flight.crashed;
    const rpm = running ? flight.rpm : 0;
    const base = 28 + rpm * 70; // firing frequency in Hz
    for (const { osc, octave } of this.engineOscillators) osc.frequency.setTargetAtTime(base * octave, now, 0.08);
    this.propLfo.frequency.setTargetAtTime(base / 2, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(260 + rpm * 1400, now, 0.1);
    this.engineGain.gain.setTargetAtTime(running ? 0.08 + rpm * 0.17 : 0, now, 0.15);
    const speed = paused ? 0 : flight.airspeed;
    this.windFilter.frequency.setTargetAtTime(250 + speed * 22, now, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.5, (speed / 70) ** 2 * 0.5), now, 0.25);
    this.hornGain.gain.setTargetAtTime(flight.stallWarning && !paused && !flight.crashed ? 0.07 : 0, now, 0.03);
  }

  tone(frequency, duration, { type = 'sine', gain = 0.2, delay = 0, slide = 0 } = {}) {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  burst(duration, { gain = 0.5, frequency = 800, q = 0.8, delay = 0 } = {}) {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  ringChime(index) {
    const root = 523.25 * 2 ** ((index % 5) * 2 / 12);
    this.tone(root, 0.5, { type: 'triangle', gain: 0.2 });
    this.tone(root * 1.5, 0.6, { type: 'sine', gain: 0.12, delay: 0.07 });
  }

  missedRing() {
    this.tone(220, 0.35, { type: 'square', gain: 0.07, slide: 0.7 });
  }

  click() {
    this.tone(1400, 0.05, { type: 'square', gain: 0.05 });
  }

  gearMotor() {
    this.tone(140, 1.2, { type: 'sawtooth', gain: 0.04, slide: 1.3 });
  }

  touchdown(sinkRate) {
    this.burst(0.25 + Math.min(0.4, sinkRate * 0.08), { gain: 0.25 + Math.min(0.5, sinkRate * 0.12), frequency: 1800, q: 1.6 });
    if (sinkRate > 2.5) this.tone(70, 0.4, { type: 'sine', gain: 0.4, slide: 0.6 });
  }

  crash() {
    this.burst(1.8, { gain: 0.9, frequency: 300, q: 0.5 });
    this.tone(55, 1.2, { type: 'sine', gain: 0.6, slide: 0.5 });
    this.burst(0.9, { gain: 0.4, frequency: 2400, q: 0.6, delay: 0.15 });
  }

  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.7, { type: 'triangle', gain: 0.16, delay: i * 0.11 }));
  }

  failure() {
    [392, 311.13].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', gain: 0.14, delay: i * 0.18 }));
  }
}
