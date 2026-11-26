// SPDX-License-Identifier: MIT
// Keyboard and mouse input: stick (pitch/roll), rudder, throttle, flaps, gear, brakes, camera,
// pause and restart, turned into one input sample per frame.

export const CONTROL_HELP = [
  ['W / S', 'Nose down / up'],
  ['A / D', 'Roll left / right'],
  ['Q / E', 'Rudder'],
  ['Shift / Ctrl', 'Throttle up / down'],
  ['F', 'Flaps 0 / 15 / 30'],
  ['G', 'Gear up / down'],
  ['B', 'Brakes'],
  ['C', 'Chase / cockpit view'],
  ['Mouse', 'Drag to look around'],
  ['Esc / P', 'Pause'],
  ['R', 'Restart mission'],
  ['M', 'Mission menu'],
];

export class FlightControls {
  constructor(target) {
    this.keys = new Set();
    this.pressedOnce = new Set();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragging = false;
    this.firstInput = null;
    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (!this.keys.has(code)) this.pressedOnce.add(code);
      this.keys.add(code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
      this.firstInput?.();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousedown', () => {
      this.dragging = true;
      this.firstInput?.();
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - event.movementX * 0.006));
      this.lookPitch = Math.max(-0.8, Math.min(0.8, this.lookPitch - event.movementY * 0.004));
    });
  }

  held(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True once per key press. */
  tapped(code) {
    if (this.pressedOnce.has(code)) {
      this.pressedOnce.delete(code);
      return true;
    }
    return false;
  }

  clearTaps() {
    this.pressedOnce.clear();
  }

  sample(dt) {
    const pitch = (this.held('KeyS', 'ArrowDown') ? 1 : 0) - (this.held('KeyW', 'ArrowUp') ? 1 : 0);
    const roll = (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
    const yaw = (this.held('KeyE') ? 1 : 0) - (this.held('KeyQ') ? 1 : 0);
    const throttleDelta = (this.held('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd') ? 1 : 0) - (this.held('ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract') ? 1 : 0);
    // The view drifts back to centre when the mouse is released.
    if (!this.dragging) {
      const k = Math.exp(-dt * 2.5);
      this.lookYaw *= k;
      this.lookPitch *= k;
    }
    return { pitch, roll, yaw, throttleDelta, throttleSet: null, brakes: this.held('KeyB', 'Space') };
  }
}
