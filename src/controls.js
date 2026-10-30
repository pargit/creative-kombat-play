// Player-editable controls: which key / gamepad button does what. Saved per device.
import { sfx } from './audio.js';

export const BINDABLE = [
  ['left', 'Walk left'], ['right', 'Walk right'], ['up', 'Jump'], ['down', 'Block'],
  ['punch', 'Punch'], ['kick', 'Kick'], ['special', 'Special'],
];

const DEFAULTS = {
  p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], punch: ['KeyF', 'KeyJ'], kick: ['KeyG', 'KeyK'], special: ['KeyH', 'KeyL'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], punch: ['Numpad1', 'Comma'], kick: ['Numpad2', 'Period'], special: ['Numpad3', 'Slash'] },
  // Standard gamepad layout. Movement also always works on the left stick.
  pad: { left: [14], right: [15], up: [12], down: [4, 5, 6, 7, 13], punch: [2], kick: [0], special: [1, 3] },
  touchSwap: false,
};

// Menu keys never change, so nobody can lock themselves out of the menus.
const FIXED = {
  p1: { confirm: ['Enter', 'Space'], back: ['Escape', 'Backspace'], start: ['Escape', 'KeyP'] },
  p2: { confirm: ['NumpadEnter'], back: ['Numpad0'], start: [] },
  pad: { confirm: [0], back: [1], start: [9] },
};

const STORE = 'fk-controls';
const clone = (o) => JSON.parse(JSON.stringify(o));

function load() {
  const b = clone(DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) {
      for (const dev of ['p1', 'p2', 'pad']) {
        for (const [action] of BINDABLE) {
          const v = saved[dev]?.[action];
          if (Array.isArray(v)) b[dev][action] = v;
        }
      }
      b.touchSwap = !!saved.touchSwap;
    }
  } catch { /* storage blocked or corrupt: use defaults */ }
  return b;
}

export const bindings = load();

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(bindings)); } catch { /* ignore */ }
}

export function resetBindings() {
  Object.assign(bindings, clone(DEFAULTS));
  save();
}

// Give `action` on `device` exactly this key/button, taking it away from anything else that used it.
export function bind(device, action, code) {
  const devices = device === 'pad' ? ['pad'] : ['p1', 'p2'];
  for (const d of devices) {
    for (const [a] of BINDABLE) bindings[d][a] = bindings[d][a].filter((c) => c !== code);
  }
  bindings[device][action] = [code];
  save();
}

export function setTouchSwap(v) { bindings.touchSwap = v; save(); }

export function keymap(player) {
  const b = bindings[player];
  return { ...b, ...FIXED[player], confirm: [...FIXED[player].confirm, ...b.punch] };
}

export function padmap() {
  return { ...bindings.pad, ...FIXED.pad, confirm: [...FIXED.pad.confirm, ...bindings.pad.punch] };
}

const KEY_NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Tab: 'Tab', CapsLock: 'Caps',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', MetaLeft: 'L-Cmd', MetaRight: 'R-Cmd', NumpadEnter: 'Num Enter',
};
export function keyLabel(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

const PAD_NAMES = ['✕/A', '○/B', '□/X', '△/Y', 'L1/LB', 'R1/RB', 'L2/LT', 'R2/RT',
  'Share', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
export function padLabel(b) { return PAD_NAMES[b] ?? `Button ${b}`; }

export function bindingLabel(device, action) {
  const list = bindings[device][action];
  if (!list.length) return '—';
  return list.map((c) => (device === 'pad' ? padLabel(c) : keyLabel(c))).join(device === 'pad' ? ', ' : ' or ');
}

// ── the controls screen ──────────────────────────────────────────────────────
const COLS = ['p1', 'p2', 'pad'];

export class ControlsScreen {
  constructor(root, hub, { onClose, onChange, onEditTouch }) {
    this.root = root;
    this.onEditTouch = onEditTouch;
    this.hub = hub;
    this.onClose = onClose;
    this.onChange = onChange;
    this.body = root.querySelector('#ctl-body');
    this.hint = root.querySelector('#ctl-hint');
    this.foot = [...root.querySelectorAll('.ctl-foot [data-ctl]')];
    this.ask = root.querySelector('#ctl-ask');
    this.askBtns = [...this.ask.querySelectorAll('[data-ask]')];
    this.confirming = null;
    this.askBtns.forEach((b, i) => b.addEventListener('click', () => this.closeAsk(b.dataset.ask === 'reset')));
    this.r = 0;
    this.c = 0;
    this.listening = null; // { device, action }
    this.cool = 0;
    this.build();
    this.foot.forEach((btn, i) => {
      btn.addEventListener('click', () => { this.r = BINDABLE.length; this.c = i; this.activate(); });
    });
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  build() {
    this.body.innerHTML = '';
    BINDABLE.forEach(([action, name], r) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = name;
      tr.appendChild(th);
      COLS.forEach((device, c) => {
        const td = document.createElement('td');
        const b = document.createElement('button');
        b.className = 'cell';
        b.addEventListener('click', () => { this.r = r; this.c = c; this.activate(); });
        td.appendChild(b);
        tr.appendChild(td);
      });
      this.body.appendChild(tr);
    });
    this.render();
  }

  open() {
    if (this.confirming != null) this.closeAsk(false);
    this.r = 0;
    this.c = 0;
    this.listening = null;
    this.cool = 8;
    this.render();
  }

  cellAt(r, c) { return this.body.rows[r]?.cells[c + 1]?.firstChild; }

  render() {
    BINDABLE.forEach(([action], r) => {
      COLS.forEach((device, c) => {
        const b = this.cellAt(r, c);
        const listening = this.listening && this.listening.device === device && this.listening.action === action;
        b.textContent = listening ? (device === 'pad' ? 'Press a button…' : 'Press a key…') : bindingLabel(device, action);
        b.classList.toggle('listening', !!listening);
        b.classList.toggle('focus', !this.listening && this.r === r && this.c === c);
      });
    });
    this.foot.forEach((btn, i) => btn.classList.toggle('focus', !this.listening && this.r === BINDABLE.length && this.c === i));
    this.hint.textContent = this.listening
      ? 'Press the new key or button. Esc cancels.'
      : 'Pick a box, then press the new key or button. Changes are saved on this device.';
  }

  activate() {
    if (this.r < BINDABLE.length) {
      this.listening = { device: COLS[this.c], action: BINDABLE[this.r][0], armed: false };
      sfx.select();
    } else {
      const which = this.foot[this.c]?.dataset.ctl;
      if (which === 'touch') { this.onEditTouch?.(); return; }
      if (which === 'reset') { this.askReset(); return; } // asks first: "are you sure?"
      sfx.confirm();
      if (which === 'done') { this.onClose(); return; }
    }
    this.render();
  }

  // the "are you sure?" popup for RESET ALL: RESET / CANCEL (◀ ▶ and confirm, or back to cancel)
  askReset() {
    this.confirming = 1; // 0 = RESET, 1 = CANCEL (the safe one is picked first)
    this.ask.hidden = false;
    this.renderAsk();
    sfx.select();
  }
  renderAsk() { this.askBtns.forEach((b, i) => b.classList.toggle('focus', i === this.confirming)); }
  closeAsk(reset) {
    this.confirming = null;
    this.ask.hidden = true;
    if (reset) { resetBindings(); this.onChange?.(); sfx.confirm(); }
    this.cool = 6;
    this.render();
  }

  finish(code) {
    if (code !== null) {
      bind(this.listening.device, this.listening.action, code);
      sfx.confirm();
      this.onChange?.();
    }
    this.listening = null;
    this.cool = 10; // ignore the key that was just pressed
    this.render();
  }

  onKey(e) {
    if (!this.listening || this.root.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') return this.finish(null);
    if (this.listening.device === 'pad') return; // keyboard can only cancel a controller binding
    this.finish(e.code);
  }

  // called every frame while the screen is open
  handle(ctrl) {
    if (this.cool > 0) { this.cool--; ctrl.flush(); this.hub.endFrame(); return; }
    if (this.listening) {
      if (this.listening.device === 'pad') {
        const pressed = [];
        for (const pad of this.hub.pads) pad.buttons.forEach((b, i) => { if (b.pressed) pressed.push(i); });
        if (!this.listening.armed) { if (!pressed.length) this.listening.armed = true; }
        else if (pressed.length) this.finish(pressed[0]);
      }
      ctrl.flush();
      return;
    }
    if (this.confirming != null) {
      if (ctrl.pressed.left || ctrl.pressed.right) { this.confirming = 1 - this.confirming; sfx.move(); this.renderAsk(); }
      if (ctrl.pressed.confirm) this.closeAsk(this.confirming === 0);
      else if (ctrl.pressed.back) this.closeAsk(false);
      return;
    }
    const rows = BINDABLE.length + 1;
    const colsIn = (r) => (r < BINDABLE.length ? COLS.length : this.foot.length);
    let moved = false;
    if (ctrl.pressed.up) { this.r = (this.r + rows - 1) % rows; moved = true; }
    if (ctrl.pressed.down) { this.r = (this.r + 1) % rows; moved = true; }
    if (ctrl.pressed.left) { this.c = (this.c + colsIn(this.r) - 1) % colsIn(this.r); moved = true; }
    if (ctrl.pressed.right) { this.c = (this.c + 1) % colsIn(this.r); moved = true; }
    this.c = Math.min(this.c, colsIn(this.r) - 1);
    if (moved) { sfx.move(); this.render(); }
    if (ctrl.pressed.confirm) this.activate();
    else if (ctrl.pressed.back) this.onClose();
  }
}
