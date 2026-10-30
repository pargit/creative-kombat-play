// Keyboard, gamepad and touch, merged into simple per-player controllers.
// Every controller exposes .held[action] and .pressed[action] (true for one frame).
import { keymap, padmap } from './controls.js';

export const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'special', 'confirm', 'back', 'start'];

// Key and button assignments live in controls.js so players can change them.
export class InputHub {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since the last frame, so quick taps are never missed
    // how many times each key / touch button has been pressed: a release and re-press between
    // two game ticks (a quick double-tap on a slow frame) still counts as two presses
    this.keyCounts = new Map();
    this.touchCounts = {};
    this.touch = {};
    this.pads = [];
    this.anyPressedListeners = [];
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target?.closest?.('input, textarea')) return; // typing a name or code
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.keyCounts.set(e.code, (this.keyCounts.get(e.code) || 0) + 1);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('gamepadconnected', () => { this.lastDevice = 'gamepad'; this.onPadsChanged?.(); });
    addEventListener('gamepaddisconnected', () => this.onPadsChanged?.());
  }

  bindTouch(root) {
    for (const btn of root.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      const ids = new Set();
      const sync = () => { this.touch[action] = ids.size > 0; btn.classList.toggle('down', ids.size > 0); };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { btn.setPointerCapture?.(e.pointerId); } catch { /* not a real pointer */ }
        ids.add(e.pointerId); sync();
        this.touchCounts[action] = (this.touchCounts[action] || 0) + 1;
        this.lastDevice = 'touch';
        navigator.vibrate?.(8);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        btn.addEventListener(ev, (e) => { ids.delete(e.pointerId); sync(); });
      }
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  poll() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    this.pads = list.filter((p) => p.connected);
  }

  padCount() { return this.pads.length; }

  readPad(index) {
    const pad = this.pads[index];
    const out = {};
    if (!pad) return out;
    for (const [action, buttons] of Object.entries(padmap())) {
      out[action] = buttons.some((b) => pad.buttons[b]?.pressed);
    }
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    if (ax < -0.5) out.left = true;
    if (ax > 0.5) out.right = true;
    if (ay < -0.6) out.up = true;
    if (ay > 0.6) out.down = true;
    if (Object.values(out).some(Boolean)) this.lastDevice = 'gamepad';
    return out;
  }

  readKeys(map) {
    const out = {};
    for (const [action, codes] of Object.entries(map)) out[action] = codes.some((c) => this.keys.has(c) || this.tapped.has(c));
    return out;
  }

  countKeys(codes) { let n = 0; for (const c of codes) n += this.keyCounts.get(c) || 0; return n; }

  endFrame() { this.tapped.clear(); }
}

export class Controller {
  constructor(hub, sources) {
    this.hub = hub;
    this.sources = sources; // e.g. [{ keys: 'p1' }, { pad: 0 }, { touch: true }]
    this.held = {};
    this.pressed = {};
    this.prev = {};
    this.virtual = null; // AI writes here
    this.seen = {};      // press counts already turned into 'pressed'
  }

  pressCount(action) {
    let n = 0;
    for (const src of this.sources) {
      if (src.keys) n += this.hub.countKeys(keymap(src.keys)[action] || []);
      else if (src.touch) n += this.hub.touchCounts[action] || 0;
    }
    return n;
  }

  update() {
    const merged = {};
    for (const a of ACTIONS) merged[a] = false;
    for (const src of this.sources) {
      let part = {};
      if (src.keys) part = this.hub.readKeys(keymap(src.keys));
      else if (src.pad !== undefined) part = this.hub.readPad(src.pad);
      else if (src.touch) part = this.hub.touch;
      for (const a of ACTIONS) merged[a] ||= !!part[a];
    }
    if (this.virtual) for (const a of ACTIONS) merged[a] ||= !!this.virtual[a];
    // presses only count if this controller was read moments ago (a menu that wasn't being
    // read during a fight mustn't replay the fight's button presses)
    const now = performance.now(), recent = now - (this.lastRead ?? -1e9) < 1000;
    this.lastRead = now;
    for (const a of ACTIONS) {
      const n = this.pressCount(a), fresh = recent && this.seen[a] !== undefined && n > this.seen[a];
      this.seen[a] = n;
      this.pressed[a] = (merged[a] && !this.prev[a]) || fresh;
      if (fresh) merged[a] = true; // a tap that came and went between ticks still counts as held for a tick
      this.held[a] = merged[a];
      this.prev[a] = merged[a];
    }
  }

  // swallow buttons that are still held from the previous screen
  flush() {
    for (const a of ACTIONS) { this.prev[a] = true; this.pressed[a] = false; this.seen[a] = this.pressCount(a); }
  }
}
