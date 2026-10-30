import { vp } from './viewport.js';
// Phone button layout: every on-screen button can be dragged anywhere and resized, then saved
// on this device (like the control editor in Brawl Stars). Positions are stored as fractions
// of the screen so they survive rotation; until someone saves a layout, the default one is
// anchored to the screen corners.

const STORE = 'fk-touch-layout';
const ACTIONS = ['up', 'left', 'down', 'right', 'special', 'punch', 'kick'];
const PILL = 2.15; // the special button is a pill this many times wider than tall
const MIN = 40, MAX = 120;
const PAD = ['up', 'left', 'down', 'right']; // the movement pad

let saved = null; // { [action]: { x, y, s } } x/y = centre as a fraction of the screen, s = px
try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }

function defaults(W, H) {
  const m = 14, g = 8, d = H <= 520 ? 52 : 58, a = H <= 520 ? 58 : 64;
  const by = H - m - d / 2, ay = H - m - a / 2;
  const L = {
    left: { x: m + d / 2, y: by, s: d },
    down: { x: m + d * 1.5 + g, y: by, s: d },
    right: { x: m + d * 2.5 + 2 * g, y: by, s: d },
    up: { x: m + d * 1.5 + g, y: by - d - g, s: d },
    kick: { x: W - m - a / 2, y: ay, s: a },
    punch: { x: W - m - a * 1.5 - g, y: ay, s: a },
    special: { x: W - m - a - g / 2, y: ay - a - g, s: a },
  };
  for (const k of ACTIONS) { L[k].x /= W; L[k].y /= H; }
  return L;
}

export function currentLayout() {
  const W = vp.w, H = vp.h, base = defaults(W, H);
  if (!saved) return base;
  const out = {};
  for (const k of ACTIONS) out[k] = saved[k] ? { ...saved[k] } : base[k];
  return out;
}

// position the real buttons inside #touch
export function applyLayout(root, layout = currentLayout()) {
  const W = vp.w, H = vp.h;
  for (const btn of root.querySelectorAll('[data-action]')) {
    const L = layout[btn.dataset.action];
    if (!L) continue;
    const w = btn.dataset.action === 'special' ? L.s * PILL : L.s, h = L.s;
    const x = Math.min(W - w / 2, Math.max(w / 2, L.x * W)), y = Math.min(H - h / 2, Math.max(h / 2, L.y * H));
    Object.assign(btn.style, { left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px`, fontSize: `${Math.round(h * 0.22)}px` });
  }
}

// The editor: drag buttons, tap one and use the slider for its size, RESET / SAVE / CANCEL.
export class TouchEditor {
  constructor(touchRoot, panel, { onClose }) {
    this.touch = touchRoot;
    this.panel = panel;
    this.onClose = onClose;
    this.slider = panel.querySelector('#te-size');
    this.selected = 'punch';
    this.together = false; // MOVEMENT PAD: TOGETHER moves and resizes the four arrows as one
    this.pct = panel.querySelector('#te-pct');
    panel.querySelector('[data-te=group]').addEventListener('click', () => { this.together = !this.together; this.render(); });
    // capture phase: while editing, presses move buttons instead of reaching the game
    touchRoot.addEventListener('pointerdown', (e) => this.down(e), true);
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', () => { this.drag = null; });
    addEventListener('pointercancel', () => { this.drag = null; });
    this.slider.addEventListener('input', () => {
      const L = this.layout, sel = this.selected, want = Number(this.slider.value);
      if (this.group()) {
        // the whole pad: every arrow bigger / smaller by the same amount, spread out from its middle
        let f = want / L[sel].s;
        for (const k of PAD) f = Math.min(f, MAX / L[k].s); for (const k of PAD) f = Math.max(f, MIN / L[k].s);
        const W = vp.w, H = vp.h, cx = PAD.reduce((t, k) => t + L[k].x * W, 0) / 4, cy = PAD.reduce((t, k) => t + L[k].y * H, 0) / 4;
        for (const k of PAD) { L[k].s *= f; L[k].x = (cx + (L[k].x * W - cx) * f) / W; L[k].y = (cy + (L[k].y * H - cy) * f) / H; }
      } else L[sel].s = want;
      this.render();
    });
    panel.querySelector('[data-te=reset]').addEventListener('click', () => { this.layout = defaults(vp.w, vp.h); this.render(); });
    panel.querySelector('[data-te=save]').addEventListener('click', () => this.close(true));
    panel.querySelector('[data-te=cancel]').addEventListener('click', () => this.close(false));
    addEventListener('resize', () => { if (this.editing) this.render(); else applyLayout(this.touch); });
  }

  open() {
    this.editing = true;
    this.layout = currentLayout();
    this.touch.hidden = false;
    this.touch.classList.add('editing');
    this.panel.hidden = false;
    this.render();
  }

  close(keep) {
    if (keep) {
      // a layout identical to the default stays "default" so it keeps adapting to the screen
      const base = defaults(vp.w, vp.h);
      const same = ACTIONS.every((k) => ['x', 'y', 's'].every((f) => Math.abs(base[k][f] - this.layout[k][f]) < 1e-6));
      saved = same ? null : this.layout;
      try { saved ? localStorage.setItem(STORE, JSON.stringify(saved)) : localStorage.removeItem(STORE); } catch { /* ignore */ }
    }
    this.editing = false;
    this.drag = null;
    this.touch.classList.remove('editing');
    for (const b of this.touch.querySelectorAll('[data-action]')) b.classList.remove('selected', 'grouped'); // (the editor's outlines don't stay on in the fight)
    this.panel.hidden = true;
    applyLayout(this.touch);
    this.onClose();
  }

  // the selected button is part of the movement pad, and the pad goes together
  group() { return this.together && PAD.includes(this.selected); }

  render() {
    applyLayout(this.touch, this.layout);
    const g = this.group();
    for (const b of this.touch.querySelectorAll('[data-action]')) {
      const on = b.dataset.action === this.selected || (g && PAD.includes(b.dataset.action));
      b.classList.toggle('selected', on);
      b.classList.toggle('grouped', on && g);
    }
    this.slider.min = MIN; this.slider.max = MAX;
    this.slider.value = this.layout[this.selected].s;
    // size as a % of the button's normal size
    const base = defaults(vp.w, vp.h)[this.selected].s;
    this.pct.textContent = `${Math.round((this.layout[this.selected].s / base) * 100)}%`;
    this.panel.querySelector('#te-group-val').textContent = this.together ? 'TOGETHER' : 'SEPARATE';
  }

  down(e) {
    if (!this.editing) return;
    e.preventDefault();
    e.stopPropagation(); // don't punch / jump while arranging
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    this.selected = btn.dataset.action;
    const L = this.layout[this.selected];
    const p = vp.local(e);
    this.drag = { id: e.pointerId, dx: L.x * vp.w - p.x, dy: L.y * vp.h - p.y, from: Object.fromEntries(PAD.map((k) => [k, { x: this.layout[k].x, y: this.layout[k].y }])), sx: L.x, sy: L.y };
    this.render();
  }

  move(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const L = this.layout[this.selected];
    const p = vp.local(e);
    L.x = Math.min(1, Math.max(0, (p.x + this.drag.dx) / vp.w));
    L.y = Math.min(1, Math.max(0, (p.y + this.drag.dy) / vp.h));
    if (this.group()) { // the rest of the pad comes along
      const mx = L.x - this.drag.sx, my = L.y - this.drag.sy;
      for (const k of PAD) if (k !== this.selected) { this.layout[k].x = Math.min(1, Math.max(0, this.drag.from[k].x + mx)); this.layout[k].y = Math.min(1, Math.max(0, this.drag.from[k].y + my)); }
    }
    this.render();
  }
}
