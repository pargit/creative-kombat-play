// Sliders and colour pickers on a phone held upright. The game is turned sideways in software
// (viewport.js), but the phone's own slider and colour picker don't know that: a slider only jumps
// when tapped (dragging along it is "up and down" to the phone), and the colour picker opens
// sideways. So while turned: sliders are dragged here, along the game's own direction, and colour
// inputs open a picker drawn in the game (swatches + hue + light).

import { vp } from './viewport.js';

// (on every phone, turned or not: the same feel either way)
const phone = matchMedia('(pointer: coarse)').matches;
const ours = () => vp.rotated || phone;

// ── sliders ────────────────────────────────────────────────────────────────────
let drag = null;
function setFromTouch(input, t) {
  const r = input.getBoundingClientRect();
  // turned a quarter turn clockwise: the game's left→right runs down the screen
  const k = vp.rotated ? (t.clientY - r.top) / r.height : (t.clientX - r.left) / r.width;
  const min = +input.min || 0, max = input.max === '' ? 100 : +input.max, step = input.step === 'any' ? 0 : +input.step || 1;
  let v = min + Math.min(1, Math.max(0, k)) * (max - min);
  if (step) v = min + Math.round((v - min) / step) * step;
  v = +v.toFixed(6);
  if (+input.value === v) return;
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('touchstart', (e) => {
  const input = e.target.closest?.('input[type=range]');
  if (!input || !ours() || input.disabled) return;
  e.preventDefault(); // (the phone's own slider would fight us)
  drag = { input, id: e.changedTouches[0].identifier };
  setFromTouch(input, e.changedTouches[0]);
}, { passive: false, capture: true });
document.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const t = [...e.changedTouches].find((x) => x.identifier === drag.id);
  if (!t) return;
  e.preventDefault();
  setFromTouch(drag.input, t);
}, { passive: false, capture: true });
const endDrag = (e) => {
  if (!drag || ![...e.changedTouches].some((x) => x.identifier === drag.id)) return;
  drag.input.dispatchEvent(new Event('change', { bubbles: true }));
  drag = null;
};
document.addEventListener('touchend', endDrag, { capture: true });
document.addEventListener('touchcancel', endDrag, { capture: true });

// ── colour picker ──────────────────────────────────────────────────────────────
const SWATCHES = ['#ffffff', '#c9ced6', '#7a7f87', '#2b2b30', '#111111', '#f4d7b8', '#d9a97e', '#a8714a', '#6b4226', '#3b2416',
  '#ff3b3b', '#ff8a2a', '#ffd23f', '#9be33a', '#22c55e', '#2fe0ff', '#2f7fff', '#3b3bd6', '#9b4dff', '#ff4fa8'];
const CSS = `
.cpick { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
.cpick .pan { background: #1d1416; border: 1px solid rgba(244,197,66,.5); border-radius: 8px; padding: 12px; width: min(340px, 92%); color: #ddd; font: 13px system-ui, sans-serif; }
.cpick .sw { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
.cpick .sw button { aspect-ratio: 1; border-radius: 4px; border: 2px solid rgba(255,255,255,.15); padding: 0; cursor: pointer; }
.cpick .sw button.on { border-color: #fff; }
.cpick label { display: block; margin-top: 10px; }
.cpick input[type=range] { width: 100%; height: 22px; margin: 4px 0 0; appearance: none; border-radius: 11px; }
.cpick input[type=range]::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid #000; }
.cpick .hue { background: linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.cpick .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.cpick .now { width: 44px; height: 32px; border-radius: 4px; border: 1px solid rgba(255,255,255,.3); }
.cpick .row button.ok { flex: 1; font: 700 15px system-ui, sans-serif; padding: 8px; border-radius: 4px; border: 0; background: #f4c542; color: #1a0f08; }`;
const hex = (h, s, l) => {
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
function toHsl(c) {
  const n = parseInt(c.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
function openPicker(input) {
  if (!document.getElementById('cpick-css')) { const st = document.createElement('style'); st.id = 'cpick-css'; st.textContent = CSS; document.head.appendChild(st); }
  const wrap = document.createElement('div');
  wrap.className = 'cpick';
  wrap.innerHTML = `<div class="pan"><div class="sw">${SWATCHES.map((c) => `<button style="background:${c}" data-c="${c}"></button>`).join('')}</div>
    <label>Colour<input type="range" class="hue" min="0" max="359" step="1"></label>
    <label>Light<input type="range" class="lit" min="5" max="95" step="1"></label>
    <div class="row"><span class="now"></span><button class="ok">OK</button></div></div>`;
  document.body.appendChild(wrap);
  const hue = wrap.querySelector('.hue'), lit = wrap.querySelector('.lit'), now = wrap.querySelector('.now');
  let c = /^#[0-9a-f]{6}$/i.test(input.value) ? input.value : '#ff8a2a', sat = 0.9;
  const show = (fromSliders) => {
    if (fromSliders) c = hex(+hue.value, sat, +lit.value / 100);
    else { const h = toHsl(c); hue.value = Math.round(h.h); lit.value = Math.round(h.l * 100); sat = h.s > 0.05 ? h.s : 0.9; }
    lit.style.background = `linear-gradient(90deg, #000, ${hex(+hue.value, sat, 0.5)}, #fff)`;
    now.style.background = c;
    for (const b of wrap.querySelectorAll('.sw button')) b.classList.toggle('on', b.dataset.c === c);
    if (input.value !== c) { input.value = c; input.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  hue.oninput = () => { if (sat < 0.05) sat = 0.9; show(true); };
  lit.oninput = () => show(true);
  wrap.querySelector('.sw').onclick = (e) => { if (e.target.dataset.c) { c = e.target.dataset.c; show(false); } };
  const close = () => { wrap.remove(); input.dispatchEvent(new Event('change', { bubbles: true })); };
  wrap.querySelector('.ok').onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  show(false);
}
document.addEventListener('click', (e) => {
  const input = e.target.closest?.('input[type=color]');
  if (!input || !ours()) return;
  e.preventDefault(); // (not the phone's own, sideways picker)
  openPicker(input);
}, { capture: true });
