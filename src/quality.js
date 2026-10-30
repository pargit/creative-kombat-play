// Graphics settings: a quality preset plus individual settings, each of which can follow the
// preset (AUTO) or be set by hand. Saved on the device.
//   preset AUTO: the level is guessed from the device (only a strong dedicated graphics card starts
//     at HIGH) and steps down by itself (remembered) when a fight runs slow or keeps hitching; a
//     remembered step-down gets one level back after a few days
//   preset LOW / MEDIUM / HIGH: fixed, never changed by itself
// Levels: 0 LOW (1× resolution, light shadows), 1 MEDIUM (up to 1.25×, full shadows), 2 HIGH (up to
// 1.75×, full shadows). Glow (bloom) and HD models are separate: off unless set ON.
// ?q=low|med|high in the address forces a preset (for testing).

const KEY = 'fk-quality', GFX = 'fk-gfx';
const NAMES = ['low', 'med', 'high'];
const RETRY_MS = 3 * 24 * 3600 * 1000;

// the graphics chip, read once the renderer exists (quality.init): only a strong dedicated GPU
// starts at HIGH; built-in laptop graphics, phones, tablets and anything unknown start at MEDIUM
let gpu = '';
function guess() {
  const mem = navigator.deviceMemory || 8;
  const touch = matchMedia?.('(pointer: coarse)').matches;
  if (mem <= 2 || /swiftshader|llvmpipe|software|microsoft basic/i.test(gpu)) return 0;
  if (touch || mem <= 4) return 1;
  if (/nvidia|geforce|rtx|gtx|radeon(?!.*vega [0-9]\b)|apple m\d|apple m[0-9]/i.test(gpu) && !/intel|mali|adreno|powervr/i.test(gpu)) return 2;
  return 1;
}
function autoLevel() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* private mode */ }
  const g = guess();
  if (saved && typeof saved.level === 'number') return Math.min(g, Date.now() - (saved.at || 0) > RETRY_MS ? saved.level + 1 : saved.level);
  return g;
}
const DEFAULTS = { preset: 'auto', res: 'auto', shadows: 'auto', bloom: 'off', hd: 'off', fps: 'off', cap: 'off' };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(GFX) || '{}') || {}; } catch { /* ignore */ }
  const out = { ...DEFAULTS, ...s };
  for (const k of ['bloom', 'hd']) if (!CHOICES[k].includes(out[k])) out[k] = 'off'; // (saved by an older version: 'auto')
  const forced = NAMES.indexOf(new URLSearchParams(location.search).get('q'));
  if (forced >= 0) out.preset = forced;
  return out;
}

// the choices for each setting, in the order the menu cycles through them
export const CHOICES = {
  preset: ['auto', 0, 1, 2],
  res: ['auto', 0.75, 1, 1.5, 2],
  shadows: ['auto', 'off', 'low', 'high'],
  // glow and HD models: never automatic (a lot of cost for a small difference), only when set ON
  bloom: ['off', 'on'],
  hd: ['off', 'on'],
  fps: ['off', 'on'],
  cap: ['off', 60, 30], // frame-rate limit (saves battery; the game itself runs at the same speed)
};

export const quality = {
  settings: loadSettings(),
  auto: 1,
  // called once with the renderer: reads the graphics chip and makes the first guess
  init(renderer) {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch { /* unknown */ }
    this.auto = autoLevel();
    this.hdModels = this.hdWanted;
  },
  get gpu() { return gpu; },
  // the level the preset gives (AUTO: the automatic one)
  get level() { return this.settings.preset === 'auto' ? this.auto : this.settings.preset; },
  get pixelRatio() { const r = this.settings.res; return Math.min(devicePixelRatio, r === 'auto' ? [1, 1.25, 1.75][this.level] : r); },
  get shadows() { const s = this.settings.shadows; return s === 'auto' ? (this.level === 0 ? 'low' : 'high') : s; },
  get bloom() { return this.settings.bloom === 'on'; },
  get showFps() { return this.settings.fps === 'on'; },
  get frameCap() { return this.settings.cap === 'off' ? 0 : this.settings.cap; },
  // HD models are picked when the game starts (models already loaded can't be swapped)
  hdModels: false,
  get hdWanted() { return this.settings.hd === 'on'; },
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  changed() { for (const fn of this.listeners) fn(); },
  // the menu: next choice for a setting
  cycle(key) {
    const list = CHOICES[key], i = list.indexOf(this.settings[key]);
    this.settings[key] = list[(i + 1) % list.length];
    try { localStorage.setItem(GFX, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.changed();
  },
  // AUTO only: watch the frame rate during fights and step down if it can't keep up
  win: { t: 0, n: 0, maxGap: 0, slow: 0 },
  sample(rawDt, busy) {
    const w = this.win;
    w.fpsT = (w.fpsT || 0) + rawDt; w.fpsN = (w.fpsN || 0) + 1;
    if (w.fpsT >= 0.5) { this.fps = w.fpsN / w.fpsT; w.fpsT = w.fpsN = 0; }
    if (this.settings.preset !== 'auto' || this.auto === 0) return;
    if (!busy) { w.t = w.n = w.long = w.inFight = 0; w.slow = 0; return; }
    w.inFight = (w.inFight || 0) + rawDt;
    if (w.inFight < 3) return; // the first seconds of a fight: models and effects still loading
    if (rawDt > 0.3) { w.t = w.n = w.long = 0; return; } // a hidden tab or a one-off load isn't the GPU's fault
    const target = this.frameCap || 60;
    w.t += rawDt; w.n++;
    if (rawDt > 1.6 / target) w.long = (w.long || 0) + 1; // a hitch: a frame that took over 1.6 frames
    if (w.t < 1.5) return;
    // laggy: a low frame rate, or a lot of hitches (that feels laggy even when the average is fine)
    const bad = w.n / w.t < 0.85 * target || (w.long || 0) / w.n > 0.12;
    w.t = w.n = w.long = 0;
    w.slow = bad ? w.slow + 1 : 0;
    if (w.slow >= 2) {
      w.slow = 0;
      this.auto--;
      try { localStorage.setItem(KEY, JSON.stringify({ level: this.auto, at: Date.now() })); } catch { /* ignore */ }
      this.changed();
    }
  },
  fps: 0,
};

// the HD file for a character model (models/x.glb -> models/hd/x.glb), when HD is on
const HD = new Set(['guy_cohen', 'linoy', 'ziv', 'karina', 'yali', 'ido', 'snir', 'asis', 'ori', 'yahli', 'ofek', 'noa', 'netanel', 'haim',
  'orhaim', 'oron', 'oron-france', 'roni', 'michael', 'minibar', 'zohar', 'shaylee', 'shirley', 'talel', 'talel-terrorist']);
export function modelUrl(url) {
  const m = /^models\/([^/]+)\.glb$/.exec(url);
  return quality.hdModels && m && HD.has(m[1]) ? `models/hd/${m[1]}.glb` : url;
}
