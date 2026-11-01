// The game's own "AI": a library of things built from simple shapes. Words in, a special out.
// No AI service is used, so it is free, instant, never "busy", the same on every phone and unlimited.
// A thing is a rigged list of parts: each part has a shape, a size, a place, and (for moving things) a joint
// (the layer it hangs from and how it turns), so legs bend at the knee, arms at the elbow, tails and capes flow.
// Sizes are in metres (a fighter is about 1.8 tall); x is forwards, y is up, z is towards the camera.

const RAD = Math.PI / 180;
const P = (shape, color, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) => ({ shape, color, sx, sy, sz, offX: x, offY: y, offZ: z, ...o });
// a part along a limb: from (x, y), leaning `ang` degrees forwards from straight up (180 = hanging down), `len` long, `th` thick
const limb = (shape, color, len, th, x, y, ang, z = 0, o = {}) => P(shape, color, th, len, th, x + Math.sin(ang * RAD) * len / 2, y + Math.cos(ang * RAD) * len / 2, z, { rotZ: ang, ...o });
const tip = (x, y, ang, len) => [x + Math.sin(ang * RAD) * len, y + Math.cos(ang * RAD) * len];
const B = (id, par, shape, color, sx, sy, sz, x, y, z = 0, o = {}) => P(shape, color, sx, sy, sz, x, y, z, { id, par, ...o });
const S = (id, par, shape, color, len, th, x, y, ang, z = 0, o = {}) => ({ ...limb(shape, color, len, th, x, y, ang, z, o), id, par });
const shade = (c, f) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('');
const EYE = '#151515', WHITE = '#f4f1ea', SKIN = '#efc09a', GOLD = '#e0b030';
// parent ids -> layer numbers (a parent must come before its children)
function rig(parts) {
  const at = {}; parts.forEach((p, i) => { if (p.id) at[p.id] = i; });
  return parts.map((p, i) => ({ ...p, par: typeof p.par === 'string' && at[p.par] !== undefined && at[p.par] < i ? at[p.par] : -1, parName: p.par }));
}

// ── four-legged animals ──────────────────────────────────────────────────────────
function quad(c, c2, o = {}) {
  const L = o.L || 1.9, H = o.H || 0.8, W = o.W || 0.75, leg = o.leg || 0.75, T = o.T || 0.2, neck = o.neck ?? 0.7, hd = o.head || 0.6, nang = o.nang ?? 35;
  const by = leg + H * 0.35, top = by + H * 0.5, fx = L * 0.38, hoof = o.hoof || '#2a2018', dk = shade(c, 0.78);
  const parts = [B('body', null, 'sphere', c, L, H, W, 0, by, 0, { pv: H * 0.3, swing: 2.5 })];
  // four legs: upper leg, lower leg (bends), hoof; the diagonal pairs move together
  const hipF = by - H * 0.12, hipH = by - H * 0.08, hl = 0.07;
  for (const [id, x, z, ph, hip] of [['FN', fx * 0.85, W * 0.3, 0, hipF], ['FF', fx * 0.85, -W * 0.3, Math.PI, hipF], ['HN', -L * 0.36, W * 0.3, Math.PI, hipH], ['HF', -L * 0.36, -W * 0.3, 0, hipH]]) {
    const upper = (hip - hl) * 0.5, lower = (hip - hl) * 0.5, col = z > 0 ? c : dk;
    parts.push(
      S(id + 'u', null, 'cylinder', col, upper, T * 1.35, x, hip, 180, z, { swing: 30, swingPhase: ph }),
      S(id + 'l', id + 'u', 'cylinder', col, lower, T * 0.8, x, hip - upper, 180, z, { swing: 58, swingMode: 'flex', swingPhase: ph + 0.4 }),
      B(id + 'h', id + 'l', 'cylinder', hoof, T * 0.95, hl, T * 0.95, x, hip - upper - lower - hl / 2, z, { rotZ: 180, pv: hl / 2, swing: -18, swingPhase: ph }),
    );
  }
  // neck, head
  let hx = fx, hy = top - 0.1;
  if (neck > 0) { parts.push(S('neck', 'body', 'sphere', c, neck, neck * 0.55, hx, hy, nang, 0, { swing: 4, swingPhase: 0.6 })); [hx, hy] = tip(hx, hy, nang, neck); }
  const cx = hx + hd * 0.3;
  parts.push(
    B('head', neck > 0 ? 'neck' : 'body', 'sphere', c, hd, hd * 0.55, hd * 0.5, cx, hy, 0, { rotZ: o.hang ?? 20, swing: 5, swingPhase: 1.1 }),
    ...(o.snout !== false ? [B('snout', 'head', 'sphere', o.snoutC || c2, hd * 0.42, hd * 0.38, hd * 0.4, cx + hd * 0.42, hy - hd * 0.16, 0)] : []),
    B('eyeW', 'head', 'sphere', WHITE, hd * 0.14, hd * 0.12, hd * 0.05, cx + hd * 0.12, hy + hd * 0.1, hd * 0.24), B('eye', 'head', 'sphere', EYE, hd * 0.08, hd * 0.09, hd * 0.05, cx + hd * 0.14, hy + hd * 0.1, hd * 0.26),
    B('nostril', 'head', 'sphere', '#3a2a24', hd * 0.06, hd * 0.06, hd * 0.05, cx + hd * 0.6, hy - hd * 0.08, hd * 0.12),
  );
  if (o.jaw) parts.push(S('jaw', 'head', 'sphere', shade(c, 0.7), hd * 0.62, hd * 0.2, cx - hd * 0.12, hy - hd * 0.1, 90 + (o.hang ?? 20), 0, { sz: hd * 0.3 }));
  if (o.ears !== false) parts.push(B('ear', 'head', 'cone', c, hd * 0.2, hd * 0.45, hd * 0.15, cx - hd * 0.12, hy + hd * 0.38, 0, { rotZ: -10, swing: 8, swingPhase: 2 }));
  // tail: two segments that flow
  const tl = o.tail ?? 0.8;
  if (tl > 0) {
    const tx = -L * 0.48, ty = by + H * 0.15, n = o.tailSeg || 2, seg = tl / n;
    let px = tx, py = ty, par = 'body';
    for (let i = 0; i < n; i++) {
      parts.push(S('tl' + i, par, 'sphere', i === n - 1 ? (o.tailC || c) : c, seg, 0.17 * (1 - i * 0.12), px, py, 195, 0, { swing: 12 + i * 5, swingPhase: 0.5 + i * 0.8, swingBias: i ? 4 : 0 }));
      [px, py] = tip(px, py, 195, seg); par = 'tl' + i;
    }
  }
  const k = { L, H, W, leg, by, top, fx, hx, hy, hd, cx, neck, nang };
  if (o.extra) parts.push(...o.extra(k));
  return { parts: rig(parts), back: top, kind: 'quad', gait: o.gait || 0.5, ctx: k };
}
const maneOf = (c2) => (k) => [0, 1, 2, 3].map((i) => { const [x, y] = tip(k.fx - 0.1, k.top - 0.05, k.nang - 6, k.neck * (0.15 + i * 0.25)); return B('mane' + i, 'neck', 'sphere', c2, 0.22, 0.3, 0.12, x - 0.06, y, 0, { rotZ: 190, swing: 10, swingPhase: i * 0.7 }); });
const stripes = (n, color) => (k) => Array.from({ length: n }, (_, i) => B('st' + i, 'body', 'box', color, 0.1, k.H * 0.8, 0.05, (i / (n - 1) - 0.5) * k.L * 0.7, k.by, k.W * 0.44 + 0.02));
const spots = (color) => (k) => [[-0.4, 0.15], [0.25, -0.1], [0.55, 0.2]].map(([x, y], i) => B('sp' + i, 'body', 'sphere', color, 0.35, 0.28, 0.1, x * k.L * 0.8, k.by + y * k.H, k.W * 0.45));
const hornsOf = (color, len = 0.45) => (k) => [0.1, -0.1].map((z, i) => B('horn' + i, 'head', 'cone', color, 0.13, len, 0.13, k.cx - 0.05, k.hy + k.hd * 0.25 + len / 2, z, { rotZ: -20 }));

const ANIMALS = {
  horse: (c) => quad(c || '#8b5a2b', '#6a4222', { L: 2.1, H: 0.85, leg: 0.85, neck: 0.8, head: 0.7, tail: 1.0, tailSeg: 3, tailC: '#2a1a10', gait: 0.55,
    extra: (k) => [...maneOf('#2a1a10')(k), B('fore', 'head', 'sphere', '#2a1a10', 0.14, 0.22, 0.1, k.cx - 0.08, k.hy + 0.28, 0), B('blaze', 'head', 'sphere', WHITE, 0.07, 0.3, 0.04, k.cx + 0.15, k.hy + 0.04, 0.22), B('sock1', 'FNl', 'cylinder', WHITE, 0.2, 0.18, 0.2, k.fx * 0.85, 0.2, 0.22)] }),
  unicorn: (c) => quad(c || '#f6f3ff', '#e8e2fb', { L: 2.1, H: 0.85, leg: 0.85, neck: 0.8, head: 0.7, tail: 1.0, tailSeg: 3, tailC: '#ff7bd0', gait: 0.55, hoof: '#c9a23a',
    extra: (k) => [...maneOf('#ff7bd0')(k), B('uhorn', 'head', 'cone', '#ffd23f', 0.12, 0.6, 0.12, k.cx + k.hd * 0.18, k.hy + 0.5, 0, { rotZ: 40 }), B('glow', 'head', 'sphere', '#fff2a0', 0.2, 0.2, 0.2, k.cx + k.hd * 0.4, k.hy + 0.82, 0, { glow: true, opacity: 0.6 })] }),
  cow: (c) => quad(c || WHITE, '#f0b6b0', { L: 2.0, H: 0.9, leg: 0.6, neck: 0.3, head: 0.55, nang: 50, tail: 0.8, gait: 0.4, extra: (k) => [...spots('#1c1c1c')(k), ...hornsOf('#e8e0c8', 0.25)(k), B('bell', 'neck', 'sphere', GOLD, 0.16, 0.16, 0.16, k.fx + 0.1, k.top - 0.2, 0.2)] }),
  bull: (c) => quad(c || '#4a2c1a', '#2e1a10', { L: 2.0, H: 1.0, leg: 0.6, neck: 0.3, head: 0.6, nang: 50, tail: 0.8, gait: 0.5, extra: (k) => [...hornsOf('#f0e8d0', 0.5)(k), B('hump', 'body', 'sphere', '#4a2c1a', 0.6, 0.5, 0.6, k.fx * 0.6, k.top + 0.05, 0), B('ring', 'snout', 'torus', GOLD, 0.2, 0.2, 0.2, k.cx + k.hd * 0.6, k.hy - 0.28, 0)] }),
  pig: (c) => quad(c || '#f3a6b4', '#ee8a9c', { L: 1.4, H: 0.7, leg: 0.35, T: 0.18, neck: 0, head: 0.5, tail: 0.3, gait: 0.6 }),
  sheep: (c) => quad(c || '#f3f0e8', '#2a2a2a', { L: 1.4, H: 0.8, leg: 0.5, T: 0.14, neck: 0.2, head: 0.4, nang: 40, snoutC: '#2a2a2a', tail: 0.2, gait: 0.6 }),
  dog: (c) => quad(c || '#b98a52', '#8a6234', { jaw: true, L: 1.1, H: 0.5, W: 0.45, leg: 0.5, T: 0.12, neck: 0.25, head: 0.4, nang: 40, tail: 0.5, gait: 0.7, extra: (k) => [B('collar', 'neck', 'torus', '#d8322a', 0.3, 0.3, 0.3, k.fx + 0.1, k.top - 0.05, 0, { rotZ: 35 })] }),
  wolf: (c) => quad(c || '#7d8590', '#5c636c', { jaw: true, L: 1.5, H: 0.6, W: 0.5, leg: 0.7, T: 0.14, neck: 0.3, head: 0.5, nang: 45, tail: 0.8, gait: 0.65, extra: (k) => [B('ear2', 'head', 'cone', '#6a717a', 0.15, 0.3, 0.12, k.cx - 0.2, k.hy + 0.28, 0), B('ruff', 'neck', 'sphere', '#a4acb5', 0.5, 0.45, 0.5, k.fx + 0.05, k.top - 0.1, 0)] }),
  fox: (c) => quad(c || '#e0782c', WHITE, { L: 1.2, H: 0.5, W: 0.4, leg: 0.5, T: 0.11, neck: 0.25, head: 0.4, nang: 40, tail: 0.95, tailSeg: 3, tailC: '#e0782c', gait: 0.7 }),
  cat: (c) => quad(c || '#d89a4a', '#f0d2a0', { jaw: true, L: 0.9, H: 0.4, W: 0.38, leg: 0.4, T: 0.1, neck: 0.15, head: 0.32, nang: 40, tail: 0.8, tailSeg: 3, gait: 0.7, extra: stripes(4, '#a9702a') }),
  lion: (c) => quad(c || '#d9a441', '#c28a2e', { jaw: true, L: 1.9, H: 0.75, W: 0.6, leg: 0.75, T: 0.2, neck: 0.4, head: 0.5, nang: 40, tail: 0.95, tailSeg: 3, gait: 0.55, extra: (k) => [B('lmane', 'head', 'sphere', '#7a4a1a', k.hd * 1.5, k.hd * 1.5, k.hd * 0.9, k.cx - k.hd * 0.1, k.hy, -0.05)] }),
  tiger: (c) => quad(c || '#e8892a', '#f4e6cf', { jaw: true, L: 1.9, H: 0.75, W: 0.6, leg: 0.75, T: 0.2, neck: 0.35, head: 0.55, nang: 40, tail: 1.0, tailSeg: 3, gait: 0.55, extra: (k) => [...stripes(6, '#1a1a1a')(k), B('hs', 'head', 'box', '#1a1a1a', 0.05, 0.14, 0.05, k.cx - 0.02, k.hy + 0.15, 0.2), B('fang', 'head', 'cone', WHITE, 0.05, 0.12, 0.05, k.cx + k.hd * 0.5, k.hy - 0.28, 0.1, { rotZ: 180 })] }),
  bear: (c) => quad(c || '#6b4423', '#4a2c14', { jaw: true, L: 1.8, H: 1.1, W: 0.9, leg: 0.7, T: 0.3, neck: 0.15, head: 0.6, nang: 30, tail: 0.15, gait: 0.4, extra: (k) => [B('bear', 'head', 'sphere', '#6b4423', 0.2, 0.2, 0.15, k.cx - 0.12, k.hy + 0.26, 0.1)] }),
  elephant: (c) => quad(c || '#8a8f98', '#767b84', { L: 2.8, H: 1.7, W: 1.2, leg: 1.1, T: 0.45, neck: 0.3, head: 1.0, nang: 30, hang: 0, tail: 0.7, gait: 0.28, snout: false,
    extra: (k) => [S('trunk0', 'head', 'sphere', '#8a8f98', 0.65, 0.3, k.cx + k.hd * 0.4, k.hy + 0.15, 170, 0, { swing: 8, swingPhase: 0.2 }), S('trunk1', 'trunk0', 'sphere', '#8a8f98', 0.6, 0.24, k.cx + k.hd * 0.4 + 0.11, k.hy - 0.5, 160, 0, { swing: 14, swingPhase: 1.0 }),
      B('earE', 'head', 'sphere', '#767b84', 0.2, 0.9, 0.7, k.cx - 0.1, k.hy, 0.05, { rotZ: 180, pv: 0.3, swing: 10, swingPhase: 1.5 }), S('tuskN', 'head', 'cone', WHITE, 0.8, 0.12, k.cx + k.hd * 0.35, k.hy - 0.15, 120, 0.22), S('tuskF', 'head', 'cone', WHITE, 0.8, 0.12, k.cx + k.hd * 0.35, k.hy - 0.15, 120, -0.22)] }),
  rhino: (c) => quad(c || '#8c8c8c', '#767676', { L: 2.4, H: 1.2, W: 1.0, leg: 0.6, T: 0.34, neck: 0.1, head: 0.8, nang: 20, hang: 10, tail: 0.5, gait: 0.4, extra: (k) => [B('rhorn', 'head', 'cone', '#e8e0c8', 0.2, 0.55, 0.2, k.cx + k.hd * 0.35, k.hy + 0.3, 0, { rotZ: 20 }), B('rhorn2', 'head', 'cone', '#e8e0c8', 0.14, 0.3, 0.14, k.cx + k.hd * 0.1, k.hy + 0.28, 0, { rotZ: 10 })] }),
  deer: (c) => quad(c || '#a8743a', '#e8d4b0', { L: 1.5, H: 0.6, W: 0.45, leg: 0.9, T: 0.1, neck: 0.6, head: 0.45, nang: 30, tail: 0.2, gait: 0.6, extra: (k) => [S('ant0', 'head', 'cylinder', '#6a4a22', 0.7, 0.05, k.cx - 0.1, k.hy + 0.2, -20, 0.1), S('ant1', 'ant0', 'cylinder', '#6a4a22', 0.45, 0.05, k.cx - 0.1 - 0.24, k.hy + 0.2 + 0.66, 25, 0.1), S('ant2', 'ant0', 'cylinder', '#6a4a22', 0.4, 0.05, k.cx - 0.1 - 0.12, k.hy + 0.2 + 0.33, 30, 0.1)] }),
  giraffe: (c) => quad(c || '#e3b04b', '#c98a2a', { L: 1.8, H: 0.8, W: 0.6, leg: 1.5, T: 0.15, neck: 1.9, head: 0.55, nang: 12, tail: 0.7, gait: 0.35, extra: (k) => [...spots('#7a4a1a')(k), ...hornsOf('#7a4a1a', 0.2)(k)] }),
  camel: (c) => quad(c || '#c9a063', '#a9803f', { L: 2.1, H: 0.9, W: 0.7, leg: 1.1, T: 0.18, neck: 1.0, head: 0.5, nang: 25, tail: 0.5, gait: 0.4, extra: (k) => [B('hump', 'body', 'sphere', c || '#c9a063', 0.6, 0.6, 0.5, 0.1, k.top + 0.2, 0)] }),
  crocodile: (c) => quad(c || '#4f7a3a', '#6a9a50', { jaw: true, L: 2.8, H: 0.45, W: 0.7, leg: 0.28, T: 0.2, neck: 0, head: 1.0, hang: 0, tail: 1.8, tailSeg: 4, snout: true, ears: false, gait: 0.5, extra: (k) => [B('teeth', 'head', 'box', WHITE, 0.7, 0.05, 0.3, k.cx + k.hd * 0.4, k.hy - 0.12, 0), ...[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => B('scute' + i, 'body', 'cone', '#3a5a2a', 0.2, 0.18, 0.18, x, k.top + 0.04, 0))] }),
  lizard: (c) => quad(c || '#6aa84f', '#4f8a3a', { jaw: true, L: 0.9, H: 0.25, W: 0.35, leg: 0.15, T: 0.07, neck: 0, head: 0.3, hang: 0, tail: 1.1, tailSeg: 4, ears: false, gait: 0.8 }),
  turtle: (c) => quad(c || '#4f8a3a', '#a7b46a', { jaw: true, L: 1.1, H: 0.7, W: 0.9, leg: 0.15, T: 0.2, neck: 0.1, head: 0.3, tail: 0.1, ears: false, gait: 0.3, extra: (k) => [B('shell', 'body', 'sphere', '#6a8a3a', k.L * 1.1, k.H * 1.1, k.W * 1.05, 0, k.by + 0.1, 0)] }),
};

// ── birds: every species has its own shape ───────────────────────────────────────
function bird(c, c2, o = {}) {
  const s = o.s || 1, ground = !!o.ground, legLen = (o.legLen || 0.5) * s, by = ground ? legLen + 0.32 * s : (o.y ?? 1.5);
  const bl = o.bl || 1.0, bh = o.bh || 0.55, bw = o.bw || 0.5, wing = o.wing || {}, wc = o.wingC || c, wtip = o.wingTip || shade(wc, 0.7), dk = (x) => shade(x, 0.8);
  const parts = [B('body', null, 'sphere', c, bl * s, bh * s, bw * s, 0, by, 0, { bob: ground ? 0 : 0.12 * s, pv: 0.2 * s, swing: 4 })];
  if (o.belly) parts.push(B('belly', 'body', 'sphere', o.belly, bl * s * 0.8, bh * s * 0.6, bw * s * 0.92, 0.06 * s, by - bh * s * 0.2, 0));
  const l1 = (wing.l1 || 0.7) * s, t1 = (wing.t1 || 0.3) * s, l2 = (wing.l2 || 0.9) * s, t2 = (wing.t2 || 0.9) * s, sw = ground ? (o.flap ?? 5) : (wing.sw || 38), bias = ground ? (o.fold ?? 20) : 18;
  [['N', 0.28, 0, wc, wtip], ['F', -0.28, 0.25, dk(wc), dk(wtip)]].forEach(([sd, z, ph, col, tcol]) => {
    const [tx, ty] = tip(0.05 * s, by + 0.15 * s, -14, l1);
    parts.push(
      S('wu' + sd, 'body', 'sphere', col, l1, t1, 0.05 * s, by + 0.15 * s, -14, z * s, { sz: 0.1 * s, swing: sw, swingPhase: ph, swingBias: bias }),
      S('wo' + sd, 'wu' + sd, 'cone', tcol, l2, t2, tx, ty, -22, z * s, { sz: 0.06 * s, swing: sw * 0.9, swingPhase: ph + 0.7, glow: !!o.glowWing }),
    );
    const [ex, ey] = tip(tx, ty, -22, l2 * 0.7);
    for (let i = 0; i < (wing.fingers || 0); i++) parts.push(S('fg' + i + sd, 'wo' + sd, 'cone', tcol, 0.55 * s, 0.13 * s, ex, ey, -22 - 10 - i * 14, z * s, { sz: 0.04 * s, glow: !!o.glowWing }));
  });
  // neck (a few segments: a swan has a long S), head, beak, eyes
  let nx = 0.42 * s, ny = by + 0.15 * s, parent = 'body';
  (o.neck === undefined ? [[0.3, 25]] : o.neck).forEach(([len, ang], i) => { parts.push(S('n' + i, parent, 'sphere', o.neckC || c, len * s, 0.26 * s * (o.neckT || 1), nx, ny, ang, 0, { swing: 6 + i * 3, swingPhase: 0.8 + i * 0.5 })); [nx, ny] = tip(nx, ny, ang, len * s); parent = 'n' + i; });
  const hs = (o.head || 0.38) * s, hx = nx + hs * 0.3, hy = ny + hs * 0.12, bk = o.beak || { kind: 'cone', len: 0.25 }, bl2 = bk.len * s, bx = hx + hs * 0.5;
  parts.push(B('head', parent, 'sphere', o.headC || c, hs, hs, hs * 0.9, hx, hy, 0, { swing: 4, swingPhase: 1.2 }));
  if (bk.kind === 'flat') parts.push(B('beak', 'head', 'box', c2, bl2, 0.08 * s, 0.2 * s, bx + bl2 / 2, hy - 0.04 * s, 0), B('knob', 'head', 'sphere', '#1c1c20', 0.1 * s, 0.1 * s, 0.1 * s, bx - 0.02 * s, hy + 0.08 * s, 0));
  else {
    parts.push(B('beak', 'head', 'cone', c2, (bk.th || 0.16) * s, bl2, (bk.th || 0.16) * s * 0.9, bx + bl2 / 2, hy - 0.02 * s, 0, { rotZ: bk.kind === 'curved' ? 108 : 96 }));
    if (bk.kind === 'hook' || bk.kind === 'curved') parts.push(B('hook', 'beak', 'cone', shade(c2, 0.7), 0.08 * s, 0.16 * s, 0.07 * s, bx + bl2 - 0.02 * s, hy - 0.12 * s, 0, { rotZ: 175 }));
    if (bk.kind === 'toucan') parts.push(B('btip', 'beak', 'cone', '#1c1c20', (bk.th || 0.16) * s * 0.55, bl2 * 0.35, (bk.th || 0.16) * s * 0.5, bx + bl2 * 0.95, hy - 0.04 * s, 0, { rotZ: 96 }), B('bstripe', 'beak', 'box', '#d8322a', 0.04 * s, (bk.th || 0.16) * s * 0.9, (bk.th || 0.16) * s * 0.9, bx + bl2 * 0.5, hy - 0.02 * s, 0));
  }
  const es = (o.eye || 0.12) * s;
  parts.push(B('eyeW', 'head', 'sphere', o.eyeC || WHITE, es, es, es * 0.4, hx + hs * 0.25, hy + hs * 0.12, hs * 0.45), B('eye', 'head', 'sphere', EYE, es * 0.55, es * 0.55, es * 0.4, hx + hs * 0.3, hy + hs * 0.12, hs * 0.48));
  // tail feathers
  const tl = (o.tailLen || 0.5) * s, angs = o.tailAngs || (o.tail === 'fork' ? [235, 285] : o.tail === 'long' ? [248, 262, 276] : o.tail === 'short' ? [262] : [244, 258, 272, 286]);
  angs.forEach((a, i) => parts.push(S('tail' + i, 'body', 'cone', i % 2 && o.tailBand ? o.tailBand : (o.tailC || c), tl * (o.tail === 'long' ? 1.8 : 1), 0.16 * s, -0.42 * s, by - 0.02 * s, a, 0, { sz: 0.05 * s, swing: 6 + i * 2, swingPhase: 1.5 + i * 0.4, glow: !!o.glowTail })));
  // legs: walkers have two jointed legs, flyers tuck their talons
  if (ground) [['N', 0.12, 0], ['F', -0.12, Math.PI]].forEach(([sd, z, ph]) => parts.push(
    S('leg' + sd, null, 'cylinder', o.legC || c2, legLen * 0.55, 0.07 * s, 0, by - 0.2 * s, 180, z * s, { swing: 34, swingPhase: ph }),
    S('shin' + sd, 'leg' + sd, 'cylinder', o.legC || c2, legLen * 0.5, 0.06 * s, 0, by - 0.2 * s - legLen * 0.55, 180, z * s, { swing: 40, swingMode: 'flex', swingPhase: ph + 0.4 }),
    B('foot' + sd, 'shin' + sd, 'box', o.legC || c2, 0.28 * s, 0.05 * s, 0.14 * s, 0.1 * s, 0.03 * s, z * s, { rotZ: 180, pv: -0.02 * s, swing: -20, swingPhase: ph }),
  ));
  else [['N', 0.12, 0], ['F', -0.12, 1.2]].forEach(([sd, z, ph]) => {
    const ly = by - 0.22 * s - 0.4 * s, tc = o.talonC || c2;
    parts.push(S('leg' + sd, 'body', 'cylinder', o.legC || c2, 0.4 * s, 0.07 * s, 0.02 * s, by - 0.22 * s, 180, z * s, { swing: 10, swingPhase: ph, swingBias: 25 }));
    [0.07, 0.0, -0.06].forEach((dx, i) => parts.push(B('tal' + i + sd, 'leg' + sd, 'cone', tc, 0.06 * s, (o.talon || 0.16) * s, 0.05 * s, 0.02 * s + dx * s, ly - 0.06 * s, z * s, { rotZ: 180 + dx * 300 })));
  });
  const ctx = { s, by, hx, hy, hs, bx, bl2 };
  if (o.extra) parts.push(...o.extra(ctx));
  return { parts: rig(parts), back: by + 0.3, kind: 'bird', fly: !ground, gait: o.gait || 0.32, ground, ctx };
}
function bat(c) {
  const by = 1.8, dark = '#2a1f33', mem = '#4a3560';
  const parts = [B('body', null, 'sphere', c, 0.55, 0.45, 0.4, 0, by, 0, { bob: 0.12, pv: 0.2, swing: 5 })];
  [['N', 0.25, 0, mem], ['F', -0.25, 0.3, shade(mem, 0.75)]].forEach(([sd, z, ph, col]) => {
    const [tx, ty] = tip(0.0, by + 0.1, -35, 0.9);
    parts.push(S('wu' + sd, 'body', 'cylinder', dark, 0.9, 0.06, 0, by + 0.1, -35, z, { swing: 42, swingPhase: ph, swingBias: 20 }),
      S('wo' + sd, 'wu' + sd, 'cone', col, 1.7, 1.9, tx, ty, -55, z, { sz: 0.03, swing: 34, swingPhase: ph + 0.6 }));
    [-30, -55, -80].forEach((a, i) => parts.push(S('fg' + i + sd, 'wu' + sd, 'cylinder', dark, 1.5 - i * 0.2, 0.045, tx, ty, a - 20, z, {})));
  });
  parts.push(S('n0', 'body', 'sphere', c, 0.25, 0.26, 0.28, by + 0.1, 30, 0, { swing: 5, swingPhase: 1 }),
    B('head', 'n0', 'sphere', c, 0.36, 0.32, 0.32, 0.4, by + 0.2, 0, { swing: 6, swingPhase: 1.4 }),
    B('snout', 'head', 'sphere', shade(c, 1.2), 0.16, 0.12, 0.14, 0.58, by + 0.15, 0),
    B('earN', 'head', 'cone', c, 0.13, 0.4, 0.06, 0.34, by + 0.5, 0.12, { rotZ: -8 }), B('earF', 'head', 'cone', shade(c, 0.8), 0.13, 0.4, 0.06, 0.34, by + 0.5, -0.12, { rotZ: -8 }),
    B('eyeW', 'head', 'sphere', '#ff3b3b', 0.09, 0.09, 0.05, 0.5, by + 0.25, 0.14, { glow: true }),
    B('fangN', 'head', 'cone', WHITE, 0.04, 0.1, 0.04, 0.58, by + 0.04, 0.05, { rotZ: 180 }), B('fangF', 'head', 'cone', WHITE, 0.04, 0.1, 0.04, 0.58, by + 0.04, -0.05, { rotZ: 180 }),
    ...[0.1, -0.1].map((z, i) => S('leg' + (i ? 'F' : 'N'), 'body', 'cylinder', dark, 0.3, 0.05, -0.1, by - 0.2, 190, z, { swing: 8, swingPhase: i })));
  return { parts: rig(parts), back: by + 0.3, kind: 'bird', fly: true, gait: 0.45, ctx: { by } };
}
const BIRDS = {
  eagle: (c) => bird(c || '#6b4a2a', '#f2c230', { s: 1.5, bl: 1.05, head: 0.4, headC: WHITE, tailC: WHITE, tail: 'fan', beak: { kind: 'hook', len: 0.3 }, wing: { l1: 0.8, l2: 1.1, t2: 1.1, fingers: 5 }, wingTip: '#3a2a1a', belly: '#7a5a38', talonC: '#f2c230', talon: 0.2, gait: 0.26 }),
  hawk: (c) => bird(c || '#8a5a30', '#f2c230', { s: 1.15, head: 0.34, tail: 'fan', tailBand: '#3a2a1a', beak: { kind: 'hook', len: 0.24 }, wing: { l1: 0.7, l2: 1.0, t2: 0.8, fingers: 4 }, wingTip: '#4a3a28', belly: '#e8d8c0', talonC: '#f2c230', talon: 0.18, gait: 0.34 }),
  vulture: (c) => bird(c || '#3a2a22', '#d8c8a0', { s: 1.5, bl: 1.1, head: 0.3, headC: '#e07a6a', neck: [[0.4, 15]], neckC: '#e07a6a', tail: 'short', beak: { kind: 'hook', len: 0.28 }, wing: { l1: 0.9, l2: 1.3, t2: 1.1, fingers: 6 }, wingTip: '#2a1c16', talonC: '#8a7a6a', talon: 0.2, gait: 0.22, eyeC: '#f2c230',
    extra: (k) => [B('ruff', 'n0', 'sphere', '#f0ead8', 0.5 * k.s, 0.32 * k.s, 0.5 * k.s, 0.4 * k.s, k.by + 0.15 * k.s, 0)] }),
  owl: (c) => bird(c || '#a98a62', '#e8b030', { s: 1.2, bl: 0.85, bh: 0.9, bw: 0.7, head: 0.62, neck: [], tail: 'short', tailLen: 0.35, beak: { kind: 'cone', len: 0.14, th: 0.12 }, wing: { l1: 0.6, l2: 0.9, t2: 1.15, t1: 0.4 }, wingTip: '#7a6040', belly: '#e8dcc0', eye: 0.24, eyeC: '#ffcc22', talonC: '#c9a23a', talon: 0.2, gait: 0.24,
    extra: (k) => [B('disc', 'head', 'sphere', '#e8dcc0', k.hs * 0.95, k.hs * 0.95, k.hs * 0.3, k.hx + 0.08 * k.s, k.hy, 0.2 * k.s), B('tuftN', 'head', 'cone', c || '#a98a62', 0.12 * k.s, 0.3 * k.s, 0.1 * k.s, k.hx - 0.06 * k.s, k.hy + 0.35 * k.s, 0.1 * k.s, { rotZ: -10 }), B('tuftF', 'head', 'cone', shade(c || '#a98a62', 0.8), 0.12 * k.s, 0.3 * k.s, 0.1 * k.s, k.hx - 0.06 * k.s, k.hy + 0.35 * k.s, -0.1 * k.s, { rotZ: -10 }),
      ...[0.1, 0, -0.1, -0.2].map((dy, i) => B('bar' + i, 'body', 'box', '#6a5030', 0.05, 0.05, 0.32, 0.25 * k.s, k.by + dy * k.s, 0))] }),
  crow: (c) => bird(c || '#1c1c24', '#2a2a30', { s: 1.05, head: 0.34, tail: 'fan', tailLen: 0.55, beak: { kind: 'cone', len: 0.3, th: 0.22 }, wing: { l1: 0.75, l2: 1.0, t2: 0.8, fingers: 4 }, wingTip: '#101016', talonC: '#2a2a30', gait: 0.4 }),
  bat: (c) => bat(c || '#5a4a60'),
  parrot: (c) => bird(c || '#d8322a', '#c9c9b0', { s: 1.1, head: 0.36, neck: [[0.22, 20]], tail: 'long', tailC: '#2a6fd8', tailBand: '#f2c230', tailLen: 0.5, beak: { kind: 'curved', len: 0.26, th: 0.22 }, wingC: '#2a6fd8', wingTip: '#f2c230', wing: { l1: 0.6, l2: 0.8, t2: 0.7 }, talonC: '#6a6a5a', gait: 0.38,
    extra: (k) => [B('face', 'head', 'sphere', '#f4f1ea', 0.24 * k.s, 0.22 * k.s, 0.1 * k.s, k.hx + 0.08 * k.s, k.hy - 0.02 * k.s, 0.2 * k.s)] }),
  toucan: (c) => bird(c || '#1c1c24', '#ff8a2a', { s: 1.05, head: 0.36, tail: 'short', tailC: '#1c1c24', beak: { kind: 'toucan', len: 0.75, th: 0.3 }, wing: { l1: 0.6, l2: 0.7, t2: 0.7 }, wingTip: '#101016', talonC: '#4a90d8', gait: 0.34,
    extra: (k) => [B('bib', 'body', 'sphere', WHITE, 0.35 * k.s, 0.4 * k.s, 0.4 * k.s, 0.36 * k.s, k.by + 0.06 * k.s, 0), B('ring', 'head', 'sphere', '#4ab0e8', 0.2 * k.s, 0.2 * k.s, 0.06 * k.s, k.hx + 0.14 * k.s, k.hy + 0.06 * k.s, 0.2 * k.s)] }),
  seagull: (c) => bird(c || WHITE, '#f2a830', { s: 1.2, head: 0.32, tail: 'short', tailLen: 0.45, beak: { kind: 'cone', len: 0.28, th: 0.14 }, wingC: '#d4d8de', wingTip: '#2a2a30', wing: { l1: 0.8, l2: 1.3, t2: 0.7 }, talonC: '#f2a830', gait: 0.3,
    extra: (k) => [B('spot', 'beak', 'sphere', '#d8322a', 0.06 * k.s, 0.06 * k.s, 0.05 * k.s, k.bx + 0.15 * k.s, k.hy - 0.08 * k.s, 0.08 * k.s)] }),
  swan: (c) => bird(c || WHITE, '#f2822a', { s: 1.5, ground: true, legLen: 0.3, bl: 1.2, bh: 0.6, bw: 0.62, head: 0.26, neck: [[0.5, 15], [0.5, -35], [0.4, 45]], neckT: 0.7, tail: 'short', tailLen: 0.45, beak: { kind: 'flat', len: 0.28 }, wing: { l1: 0.7, l2: 0.8, t2: 0.9 }, wingTip: '#e8e8e0', legC: '#1c1c20', fold: 28, flap: 6, gait: 0.3, eye: 0.09 }),
  chicken: (c) => bird(c || '#c0501c', '#f2a830', { s: 1.0, ground: true, legLen: 0.45, bl: 0.9, bh: 0.65, bw: 0.55, head: 0.3, neck: [[0.25, 20]], tailAngs: [-20, -38, -56, -74], tailC: '#2a6a3a', tailBand: '#c0501c', tailLen: 0.55, beak: { kind: 'cone', len: 0.14, th: 0.12 }, wing: { l1: 0.5, l2: 0.55, t2: 0.6 }, wingTip: shade(c || '#c0501c', 0.75), legC: '#e8b830', flap: 10, gait: 0.6,
    extra: (k) => [...[0, 1, 2].map((i) => B('comb' + i, 'head', 'sphere', '#d8322a', 0.1 * k.s, 0.12 * k.s, 0.06 * k.s, k.hx - 0.04 * k.s + i * 0.07 * k.s, k.hy + 0.2 * k.s + (i === 1 ? 0.04 * k.s : 0), 0)), B('wattle', 'head', 'sphere', '#d8322a', 0.08 * k.s, 0.14 * k.s, 0.06 * k.s, k.hx + 0.16 * k.s, k.hy - 0.18 * k.s, 0)] }),
  phoenix: (c) => bird(c || '#ff6a1a', '#ffd23f', { s: 2, head: 0.38, headC: '#ffb02a', tail: 'long', tailC: '#ffd23f', tailBand: '#ff3b1a', tailLen: 0.7, glowTail: true, glowWing: true, beak: { kind: 'hook', len: 0.28 }, wingC: '#ff3b1a', wingTip: '#ffd23f', wing: { l1: 0.8, l2: 1.2, t2: 1.0, fingers: 6 }, talonC: '#ffd23f', gait: 0.26,
    extra: (k) => [0, 1, 2].map((i) => B('crest' + i, 'head', 'cone', '#ffd23f', 0.1 * k.s, 0.4 * k.s, 0.06 * k.s, k.hx - 0.1 * k.s - i * 0.08 * k.s, k.hy + 0.35 * k.s, 0, { rotZ: -20 - i * 12, glow: true })) }),
  bird: (c) => bird(c || '#4a90d8', '#f2c230', { s: 0.9, bl: 0.9, head: 0.34, tail: 'short', tailLen: 0.4, beak: { kind: 'cone', len: 0.14, th: 0.1 }, wing: { l1: 0.55, l2: 0.7, t2: 0.7 }, wingTip: '#2a5a98', belly: '#f4f1ea', gait: 0.5 }),
};

// ── sea animals: the body is a chain of segments that undulate ───────────────────
function sea(c, c2, o = {}) {
  const L = o.L || 3.2, H = o.H || 1.1, y = o.y || 1.4, W = H * 0.85;
  const parts = [
    S('b1', null, 'sphere', c, L * 0.6, H, -L * 0.1, y, 90, 0, { sz: W, swing: 3, swingPhase: 0 }),
    S('b2', 'b1', 'sphere', c, L * 0.4, H * 0.75, -L * 0.1, y, 270, 0, { sz: W * 0.75, swing: 6, swingPhase: 0.8 }),
    S('b3', 'b2', 'sphere', c, L * 0.38, H * 0.45, -L * 0.5, y, 270, 0, { sz: W * 0.45, swing: 11, swingPhase: 1.6 }),
    S('fl0', 'b3', 'sphere', c, H * 0.75, H * 0.2, -L * 0.88, y, 215, 0, { sz: H * 0.14, swing: 14, swingPhase: 2.4 }),
    S('fl1', 'b3', 'sphere', c, H * 0.75, H * 0.2, -L * 0.88, y, 325, 0, { sz: H * 0.14, swing: 14, swingPhase: 2.4 }),
    B('belly', 'b1', 'sphere', c2, L * 0.7, H * 0.5, W * 0.8, L * 0.08, y - H * 0.24, 0),
    S('dors', 'b1', 'cone', c, H * 0.85, H * 0.3, -L * 0.05, y + H * 0.38, -22, 0, { sz: 0.08 }),
    ...[0.4, -0.4].map((z, i) => S('pec' + i, 'b1', 'sphere', c, H * 0.8, H * 0.2, L * 0.15, y - H * 0.3, 150, W * z, { sz: 0.08, swing: 18, swingPhase: i * 0.6 })),
    B('eyeW', 'b1', 'sphere', WHITE, 0.14, 0.12, 0.05, L * 0.34, y + H * 0.14, W * 0.42), B('eye', 'b1', 'sphere', EYE, 0.08, 0.08, 0.05, L * 0.36, y + H * 0.14, W * 0.44),
    B('mouth', 'b1', 'box', '#2a1a1a', L * 0.12, 0.03, 0.05, L * 0.4, y - H * 0.12, W * 0.4),
  ];
  if (o.jaw) parts.push(S('jaw', 'b1', 'sphere', shade(c, 0.75), L * 0.3, H * 0.14, L * 0.22, y - H * 0.12, 92, 0, { sz: W * 0.4 }));
  if (o.beak) parts.push(B('beak', 'b1', 'cone', c2, 0.16, 0.18 * L, 0.14, L * 0.5 + 0.1, y - 0.02, 0, { rotZ: 96 }));
  if (o.patch) parts.push(B('patch', 'b1', 'sphere', WHITE, 0.55, 0.28, 0.1, L * 0.05, y + H * 0.2, W * 0.45), B('patch2', 'b1', 'sphere', WHITE, 0.25, 0.16, 0.1, L * 0.34, y + H * 0.35, W * 0.4));
  if (o.snout) parts.push(B('snout', 'b1', 'cone', c, H * 0.5, H * 0.9, H * 0.5, L * 0.5, y, 0, { rotZ: 90 }), ...[0.12, 0.2, 0.28].map((x, i) => B('tooth' + i, 'b1', 'cone', WHITE, 0.05, 0.1, 0.05, L * (0.4 + x), y - H * 0.18, W * 0.3, { rotZ: 180 })));
  return { parts: rig(parts), back: y + H * 0.45, kind: 'sea', fly: true, water: true, gait: o.gait || 0.24 };
}
const SEA = {
  whale: (c) => sea(c || '#3b6ea8', '#c9d8e8', { L: 5, H: 2, y: 1.05, gait: 0.16 }),
  orca: (c) => sea(c || '#1c1f26', WHITE, { L: 4, H: 1.5, y: 0.9, patch: true, jaw: true, gait: 0.2 }),
  dolphin: (c) => sea(c || '#6f8fb0', '#dce6ef', { L: 2.6, H: 0.8, y: 0.85, beak: true, gait: 0.3 }),
  shark: (c) => sea(c || '#74808c', WHITE, { L: 3.4, H: 1.0, y: 0.8, snout: true, jaw: true, gait: 0.28 }),
  fish: (c) => sea(c || '#f2822a', '#ffd9a8', { L: 1.4, H: 0.8, y: 0.7, gait: 0.4 }),
};

// ── snake: a chain that slithers ─────────────────────────────────────────────────
function snake(c, c2, o = {}) {
  const n = o.n || 10, r = o.r || 0.3, len = r * 1.6;
  const parts = [B('head', null, 'sphere', c, r * 3.2, r * 2.2, r * 2.4, r * 1.4, r + 0.12, 0, { swing: 6, swingPhase: 0 })];
  let par = 'head';
  for (let i = 0; i < n; i++) {
    const th = r * 2 * (1 - i / (n * 1.5));
    parts.push(S('sg' + i, par, 'sphere', i % 2 ? c2 : c, len, th, -i * len * 0.9, r + 0.12, 270, 0, { sz: th, swing: 16, swingPhase: i * 0.75 }));
    par = 'sg' + i;
  }
  parts.push(B('eyeW', 'head', 'sphere', WHITE, r * 0.5, r * 0.45, r * 0.2, r * 2.0, r + 0.28, r * 0.95), B('eye', 'head', 'sphere', '#c81818', r * 0.28, r * 0.3, r * 0.2, r * 2.15, r + 0.28, r * 1.05),
    B('tongue', 'head', 'cone', '#e63b3b', r * 0.25, r * 1.0, r * 0.06, r * 3.6, r + 0.1, 0, { rotZ: 90 }));
  return { parts: rig(parts), kind: 'snake', gait: 0.3, back: 0.9 };
}

// ── dragon, dinosaur ─────────────────────────────────────────────────────────────
function dragon(c, c2) {
  return quad(c, c2, { L: 2.6, H: 1.0, W: 0.9, leg: 0.6, T: 0.26, neck: 1.1, head: 0.9, nang: 50, hang: 15, tail: 2.0, tailSeg: 5, tailC: c, ears: false, gait: 0.32,
    extra: (k) => [
      ...hornsOf(c2, 0.6)(k),
      ...[0.5, -0.5].flatMap((z, i) => {
        const col = i ? shade('#8a1f1a', 0.8) : '#8a1f1a';
        return [S('wa' + i, 'body', 'cylinder', c, 1.2, 0.12, -0.2, k.top, -10, z, { swing: 30, swingPhase: i * 0.2, swingBias: 22 }),
          S('wb' + i, 'wa' + i, 'cone', col, 2.0, 1.5, -0.4, k.top + 1.2, -30, z, { sz: 0.06, swing: 22, swingPhase: i * 0.2 + 0.7 })];
      }),
      S('jaw', 'head', 'sphere', c, k.hd * 0.8, k.hd * 0.22, k.cx - k.hd * 0.15, k.hy - k.hd * 0.12, 105, 0, { sz: k.hd * 0.34, swing: 4, swingPhase: 1, swingBias: 5 }),
      B('fire', 'head', 'sphere', '#ffb02a', 0.34, 0.22, 0.22, k.cx + k.hd * 0.75, k.hy - 0.15, 0, { glow: true }),
      B('eyeW', 'head', 'sphere', '#ffe36a', 0.16, 0.12, 0.06, k.cx + k.hd * 0.1, k.hy + k.hd * 0.14, k.hd * 0.26, { glow: true }),
      ...[-0.6, -0.2, 0.2, 0.6].map((x, i) => B('spine' + i, 'body', 'crystal', c2, 0.22, 0.42, 0.15, x, k.top + 0.12, 0)),
    ] });
}
function dinosaur(c, c2) {
  const by = 1.55, dk = shade(c, 0.8);
  const parts = [B('body', null, 'sphere', c, 1.9, 1.2, 0.9, 0, by, 0, { rotZ: -12, pv: 0.4, swing: 2 })];
  for (const [sd, z, ph, col] of [['N', 0.3, 0, c], ['F', -0.3, Math.PI, dk]]) parts.push(
    S('th' + sd, null, 'cylinder', col, 0.7, 0.5, 0, by - 0.3, 180, z, { swing: 26, swingPhase: ph }),
    S('sh' + sd, 'th' + sd, 'cylinder', col, 0.6, 0.3, 0, by - 1.0, 180, z, { swing: 50, swingMode: 'flex', swingPhase: ph + 0.4 }),
    B('ft' + sd, 'sh' + sd, 'box', col, 0.6, 0.14, 0.34, 0.18, 0.08, z, { rotZ: 180, pv: -0.05, swing: -20, swingPhase: ph }));
  parts.push(S('neck', 'body', 'sphere', c, 1.1, 0.45, 0.8, by + 0.2, 25, 0, { swing: 5, swingPhase: 0.6 }));
  const [nx, ny] = tip(0.8, by + 0.2, 25, 1.1);
  parts.push(B('head', 'neck', 'sphere', c, 1.2, 0.65, 0.65, nx + 0.45, ny + 0.05, 0, { rotZ: 10, swing: 4, swingPhase: 1.2 }),
    S('jaw', 'head', 'sphere', c2, 1.0, 0.22, nx + 0.05, ny - 0.2, 100, 0, { sz: 0.5, swing: 4, swingBias: 6, swingPhase: 1.4 }),
    B('teeth', 'head', 'box', WHITE, 0.7, 0.07, 0.4, nx + 0.62, ny - 0.17, 0),
    B('eyeW', 'head', 'sphere', '#ffe36a', 0.16, 0.14, 0.06, nx + 0.3, ny + 0.18, 0.3), B('eye', 'head', 'sphere', EYE, 0.07, 0.1, 0.06, nx + 0.34, ny + 0.18, 0.32));
  let px = -0.8, py = by - 0.1, par = 'body';
  for (let i = 0; i < 4; i++) { parts.push(S('tl' + i, par, 'sphere', c, 0.6, 0.5 * (1 - i * 0.18), px, py, 250, 0, { sz: 0.4 * (1 - i * 0.18), swing: 8 + i * 3, swingPhase: 0.4 + i * 0.7 })); [px, py] = tip(px, py, 250, 0.6); par = 'tl' + i; }
  parts.push(S('arm0', 'body', 'cylinder', c, 0.4, 0.1, 0.9, by + 0.1, 150, 0.4, { swing: 14, swingPhase: 0.5 }), S('arm1', 'body', 'cylinder', dk, 0.4, 0.1, 0.9, by + 0.1, 150, -0.4, { swing: 14, swingPhase: 1.5 }),
    ...[-0.5, 0, 0.5].map((x, i) => B('plate' + i, 'body', 'cone', c2, 0.15, 0.3, 0.1, x - 0.2, by + 0.65, 0)));
  return { parts: rig(parts), kind: 'biped', back: 1.9, gait: 0.3 };
}

// ── people: a jointed skeleton (hip, knee, ankle; shoulder, elbow, wrist; neck) ─────
// o: leg, leg2, boot, torso, belt, arm, arm2, glove, skin, robot, k (size), lean, cape, uaBias (arms held out), armSwing
function human(o) {
  const k = o.k || 1, s = (v) => v * k, dk = (c) => shade(c, 0.78), lean = o.lean ?? 8, lt = o.legT || 1, cd = o.chestDim || [0.62, 0.9, 0.46], wd = o.waistDim || [0.66, 0.2, 0.5];
  const parts = [];
  for (const [sd, z, ph] of [['N', 0.15, 0], ['F', -0.15, Math.PI]]) {
    const n = sd === 'N', f = (c) => (n ? c : dk(c));
    parts.push(
      S('th' + sd, null, 'cylinder', f(o.leg), s(0.46), s(0.27 * lt), 0, s(0.92), 180, s(z), { swing: 36, swingPhase: ph }),
      S('sh' + sd, 'th' + sd, 'cylinder', f(o.leg2 || o.leg), s(0.44), s(0.22 * lt), 0, s(0.46), 180, s(z), { swing: 70, swingMode: 'flex', swingPhase: ph + 0.4 }),
      B('ft' + sd, 'sh' + sd, 'box', f(o.boot), s(0.46), s(0.16), s(0.26), s(0.1), s(0.09), s(z), { rotZ: 180, pv: -s(0.07), swing: -28, swingPhase: ph }),
    );
    if (o.knee) parts.push(B('kn' + sd, 'th' + sd, 'sphere', f(o.knee), s(0.3), s(0.3), s(0.3), s(0.06), s(0.46), s(z)));
  }
  parts.push(
    B('waist', null, o.robot ? 'box' : 'cylinder', o.belt || o.torso, s(wd[0]), s(wd[1]), s(wd[2]), 0, s(1.0), 0, { pv: s(0.1), swingBias: lean, swing: 1.5, swingPhase: 0.5 }),
    B('chest', 'waist', o.robot ? 'box' : 'sphere', o.torso, s(cd[0]), s(cd[1]), s(cd[2]), 0, s(1.45), 0, { pv: s(0.45), swing: 2.5, swingPhase: 1 }),
  );
  if (o.cape) parts.push(S('cp1', 'chest', 'box', o.cape, s(0.62), s(0.08), s(-0.3), s(1.82), 180, 0, { sz: s(0.55), swingBias: 16, swing: 9, swingPhase: 1 }), S('cp2', 'cp1', 'box', shade(o.cape, 0.9), s(0.55), s(0.08), s(-0.3), s(1.2), 180, 0, { sz: s(0.55), swingBias: 8, swing: 15, swingPhase: 1.8 }));
  // head and face
  const hy = s(2.0), skin = o.skin || SKIN;
  parts.push(o.robot ? B('head', 'chest', 'box', o.headC || o.torso, s(0.46), s(0.44), s(0.4), s(0.04), hy, 0, { pv: s(0.14), swing: 3, swingPhase: 0.3 })
    : B('head', 'chest', 'sphere', o.headC || skin, s(0.42), s(0.46), s(0.4), s(0.06), hy, 0, { pv: s(0.14), swing: 3, swingPhase: 0.3 }));
  if (o.robot) parts.push(B('visor', 'head', 'box', '#7ad8ff', s(0.1), s(0.1), s(0.34), s(0.27), hy + s(0.03), 0, { glow: true }), S('ant', 'head', 'cylinder', '#4a5058', s(0.4), s(0.04), 0, hy + s(0.22), 0, 0, {}), B('antb', 'ant', 'sphere', '#ff3b3b', s(0.1), s(0.1), s(0.1), 0, hy + s(0.62), 0, { glow: true }));
  else if (!o.noFace) parts.push(
    B('eyeW', 'head', 'sphere', WHITE, s(0.14), s(0.12), s(0.05), s(0.18), hy + s(0.05), s(0.19)), B('eye', 'head', 'sphere', EYE, s(0.07), s(0.08), s(0.05), s(0.21), hy + s(0.05), s(0.22)),
    B('brow', 'head', 'box', o.brow || '#4a3220', s(0.14), s(0.03), s(0.05), s(0.19), hy + s(0.14), s(0.2), { rotZ: -12 }),
    B('nose', 'head', 'sphere', skin, s(0.1) * (o.nose || 1), s(0.11) * (o.nose || 1), s(0.1), s(0.28), hy - s(0.03), 0), B('mouth', 'head', 'box', '#7a3a30', s(0.1), s(0.025), s(0.05), s(0.22), hy - s(0.13), s(0.17)),
    B('ear', 'head', 'sphere', skin, s(0.07), s(0.12), s(0.05), s(0.03), hy, s(0.2)));
  // arms: shoulder, elbow, wrist
  for (const [sd, z, ph] of [['N', 0.32, 0], ['F', -0.32, Math.PI]]) {
    const n = sd === 'N', f = (c) => (n ? c : dk(c)), arm = o.arm || o.torso, held = o.uaBias || 0;
    parts.push(
      S('ua' + sd, 'chest', 'cylinder', f(arm), s(0.38), s(o.armT || 0.2), 0, s(1.72), 180, s(z), { swing: o.armSwing ?? 32, swingPhase: ph + Math.PI, swingBias: held }),
      S('fa' + sd, 'ua' + sd, 'cylinder', f(o.arm2 || arm), s(0.34), s((o.armT || 0.2) * 0.85), 0, s(1.34), 180, s(z), { swing: -42, swingMode: 'flex', swingBias: o.elbow ?? -32, swingPhase: ph + Math.PI + 0.6 }),
      B('hd' + sd, 'fa' + sd, 'sphere', f(o.glove || skin), s(0.2), s(0.2), s(0.2), 0, s(1.0), s(z), { rotZ: 180, pv: 0 }),
    );
  }
  if (o.extra) parts.push(...o.extra({ k, s, hy }));
  return { parts: rig(parts), kind: 'person', back: 2.0 * k, gait: o.gait || 0.42 };
}
const blade = (id, par, c, x, y, angUp, len, t, z = 0) => B(id, par, 'spike', c, t, len / 1.4, t * 0.4, x + Math.cos(angUp * RAD) * len / 2, y + Math.sin(angUp * RAD) * len / 2, z, { rotZ: -angUp });
function knight(c) {
  const steel = c || '#c7cdd6', dark = '#8b929e', blue = '#2a4fa8', red = '#b02a2a', steel2 = '#aab1bc';
  return human({ leg: steel, leg2: steel2, boot: dark, torso: steel, belt: '#5a3a22', arm: steel, arm2: steel2, glove: dark, knee: dark, cape: red, brow: '#4a3220',
    extra: ({ hy }) => [
      B('skirt', 'waist', 'cylinder', dark, 0.66, 0.36, 0.52, 0, 0.9, 0), B('buckle', 'waist', 'box', GOLD, 0.12, 0.12, 0.06, 0.02, 1.0, 0.27),
      B('tabard', 'chest', 'box', blue, 0.4, 0.5, 0.06, 0.02, 1.35, 0.24), B('emblem', 'chest', 'sphere', GOLD, 0.2, 0.2, 0.06, 0.02, 1.5, 0.26), B('gorget', 'chest', 'cylinder', steel, 0.32, 0.18, 0.32, 0.03, 1.9, 0),
      B('paN', 'chest', 'sphere', steel, 0.36, 0.3, 0.32, 0, 1.76, 0.32), B('paF', 'chest', 'sphere', dark, 0.36, 0.3, 0.32, 0, 1.76, -0.32),
      B('helm', 'head', 'sphere', steel, 0.52, 0.3, 0.48, 0.02, hy + 0.17, 0), B('guard', 'head', 'box', steel, 0.05, 0.3, 0.07, 0.3, hy, 0), B('cheek', 'head', 'box', dark, 0.12, 0.18, 0.05, 0.0, hy - 0.02, 0.21),
      S('pl1', 'head', 'cone', red, 0.45, 0.18, -0.12, hy + 0.3, -35, 0, { swing: 12, swingPhase: 1.2 }), S('pl2', 'pl1', 'cone', shade(red, 0.85), 0.3, 0.14, -0.12 - Math.sin(35 * RAD) * 0.45, hy + 0.3 + Math.cos(35 * RAD) * 0.45, -50, 0, { swing: 14, swingPhase: 1.9 }),
      B('shield', 'faN', 'box', blue, 0.55, 0.8, 0.1, 0.22, 1.2, 0.5), B('sx', 'shield', 'box', GOLD, 0.4, 0.09, 0.12, 0.22, 1.28, 0.52), B('sy', 'shield', 'box', GOLD, 0.09, 0.55, 0.12, 0.22, 1.2, 0.52), B('srim', 'shield', 'box', steel, 0.6, 0.06, 0.12, 0.22, 1.6, 0.5),
      blade('blade', 'hdF', '#e8edf5', 0, 1.0, 55, 1.25, 0.14, -0.32), B('guardS', 'hdF', 'box', GOLD, 0.06, 0.3, 0.12, 0.0, 1.0, -0.32, { rotZ: -35 }),
    ] });
}
function wizard(c) {
  const robe = c || '#3a4fa8', deep = '#2a2f6a', hat = '#2f3f90', white = '#f2f2f2';
  return human({ leg: deep, boot: '#3a2a1a', torso: robe, belt: GOLD, arm: robe, arm2: robe, armT: 0.26, glove: SKIN, cape: deep, nose: 1.8, brow: white, lean: 5,
    extra: ({ hy }) => [
      B('robe', 'waist', 'cone', robe, 1.1, 1.75, 0.9, 0, 0.95, 0, { pv: 0.1, swing: 2.5, swingPhase: 0.9 }), B('rtrim', 'waist', 'cylinder', GOLD, 0.98, 0.06, 0.82, 0, 0.14, 0),
      B('beard', 'head', 'sphere', white, 0.34, 0.8, 0.3, 0.14, 1.7, 0, { rotZ: 188, pv: 0.32, swing: 5, swingPhase: 0.8 }), B('stache', 'head', 'sphere', white, 0.24, 0.09, 0.4, 0.22, hy - 0.08, 0),
      B('brim', 'head', 'cylinder', hat, 1.0, 0.07, 1.0, 0, hy + 0.28, 0), B('hband', 'head', 'cylinder', GOLD, 0.66, 0.1, 0.66, 0, hy + 0.34, 0),
      S('hat1', 'head', 'cone', hat, 0.65, 0.66, 0, hy + 0.36, -6, 0, { swing: 3, swingPhase: 1 }), S('hat2', 'hat1', 'cone', hat, 0.5, 0.36, -0.07, hy + 0.36 + 0.65, -30, 0, { swing: 8, swingPhase: 1.6 }),
      B('star1', 'head', 'sphere', '#ffe36a', 0.1, 0.1, 0.05, 0.12, hy + 0.7, 0.3, { glow: true }), B('star2', 'head', 'sphere', '#ffe36a', 0.08, 0.08, 0.05, -0.06, hy + 0.98, 0.22, { glow: true }),
      B('staff', 'hdF', 'cylinder', '#8a5a2b', 0.09, 2.4, 0.09, 0, 1.2, -0.32), B('orb', 'staff', 'sphere', '#7ad8ff', 0.34, 0.34, 0.34, 0, 2.5, -0.32, { glow: true }), B('orbg', 'staff', 'sphere', '#bfeaff', 0.55, 0.55, 0.55, 0, 2.5, -0.32, { glow: true, opacity: 0.3 }),
      B('pouch', 'waist', 'sphere', '#6a4a22', 0.2, 0.22, 0.14, 0.3, 0.95, 0.3),
    ] });
}
function ninja(c) {
  const b = c || '#1c1c24', red = '#d8322a';
  return human({ leg: b, boot: '#2a2a34', torso: b, belt: red, arm: b, glove: '#2a2a34', headC: b, lean: 14, gait: 0.5, elbow: -45, armSwing: 38,
    extra: ({ hy }) => [
      B('slit', 'head', 'box', SKIN, 0.2, 0.1, 0.36, 0.2, hy + 0.02, 0), B('nEye', 'head', 'sphere', WHITE, 0.1, 0.07, 0.05, 0.22, hy + 0.04, 0.18), B('nPup', 'head', 'sphere', EYE, 0.05, 0.06, 0.05, 0.25, hy + 0.04, 0.2),
      B('band', 'head', 'box', red, 0.5, 0.09, 0.46, 0.05, hy + 0.14, 0), S('bt1', 'head', 'cone', red, 0.4, 0.1, -0.2, hy + 0.14, 250, 0, { sz: 0.04, swing: 14, swingPhase: 1 }), S('bt2', 'head', 'cone', red, 0.34, 0.1, -0.2, hy + 0.1, 262, 0, { sz: 0.04, swing: 18, swingPhase: 1.7 }),
      S('scarf', 'chest', 'cone', red, 0.5, 0.12, -0.25, 1.8, 262, 0, { sz: 0.04, swing: 12, swingPhase: 0.6 }),
      blade('katana', 'chest', '#dfe6ee', -0.12, 1.15, 62, 1.25, 0.1, -0.3), B('hilt', 'chest', 'box', '#1c1c24', 0.07, 0.32, 0.1, -0.17, 1.12, -0.3, { rotZ: 28 }),
      B('shuri', 'waist', 'crystal', '#c9ced6', 0.16, 0.16, 0.04, 0.3, 0.95, 0.28),
    ] });
}
function viking(c) {
  const leather = c || '#7a4a2a', fur = '#d8c8a8', beard = '#d8741f', steel = '#c7cdd6';
  return human({ leg: '#5a4a3a', boot: '#3a2a1a', torso: leather, belt: '#3a2a1a', arm: '#8a6a4a', glove: '#c9a06a', knee: '#7a6a5a', cape: '#7a2a22', brow: beard,
    extra: ({ hy }) => [
      B('fur', 'chest', 'sphere', fur, 0.7, 0.26, 0.6, 0, 1.78, 0), B('beard', 'head', 'sphere', beard, 0.4, 0.75, 0.36, 0.14, 1.72, 0, { rotZ: 186, pv: 0.3, swing: 5, swingPhase: 0.8 }), B('stache', 'head', 'sphere', beard, 0.24, 0.1, 0.4, 0.22, hy - 0.08, 0),
      B('helm', 'head', 'sphere', steel, 0.52, 0.3, 0.48, 0.02, hy + 0.17, 0), B('guard', 'head', 'box', steel, 0.05, 0.3, 0.07, 0.3, hy, 0), B('hbrow', 'head', 'box', '#8b929e', 0.54, 0.06, 0.5, 0.02, hy + 0.06, 0),
      S('hornN', 'head', 'cone', '#f0ead2', 0.5, 0.16, 0, hy + 0.3, 28, 0.27), S('hornF', 'head', 'cone', shade('#f0ead2', 0.85), 0.5, 0.16, 0, hy + 0.3, 28, -0.27),
      B('wshield', 'faN', 'disc', '#8a5a2b', 0.85, 6, 0.85, 0.2, 1.2, 0.5), B('boss', 'wshield', 'sphere', GOLD, 0.2, 0.2, 0.12, 0.2, 1.2, 0.56), B('wrim', 'wshield', 'torus', steel, 0.82, 0.82, 0.82, 0.2, 1.2, 0.5),
      B('haft', 'hdF', 'cylinder', '#6a4222', 0.09, 1.5, 0.09, 0.1, 1.3, -0.32, { rotZ: 20 }), B('axeh', 'haft', 'box', '#c9ced6', 0.35, 0.45, 0.06, 0.2, 1.95, -0.32, { rotZ: 20 }), B('axeb', 'haft', 'cone', '#c9ced6', 0.12, 0.28, 0.06, 0.38, 1.95, -0.32, { rotZ: 110 }),
    ] });
}
function skeleton(c) {
  const bone = c || '#e8e2cc', dark = '#141414', bone2 = shade(bone, 0.8), rust = '#8a7a66';
  return human({ leg: bone, leg2: bone, boot: bone2, torso: bone, belt: bone2, arm: bone, arm2: bone, glove: bone, headC: bone, armT: 0.1, legT: 0.45, chestDim: [0.12, 0.85, 0.12], waistDim: [0.4, 0.2, 0.3], noFace: true, knee: bone, gait: 0.46, lean: 10,
    extra: ({ hy }) => [
      // ribcage: a dark hollow with the ribs in front of it
      B('cavity', 'chest', 'sphere', dark, 0.5, 0.64, 0.34, 0.02, 1.5, 0),
      ...[1.74, 1.62, 1.5, 1.38, 1.26].map((y, i) => B('rib' + i, 'chest', 'sphere', bone, 0.56 - i * 0.03, 0.065, 0.4 - i * 0.02, 0.03, y, 0)),
      B('sternum', 'chest', 'box', bone2, 0.05, 0.55, 0.1, 0.27, 1.5, 0),
      ...[1.78, 1.62, 1.46, 1.3, 1.14].map((y, i) => B('vert' + i, 'chest', 'sphere', bone2, 0.17, 0.12, 0.15, -0.12, y, 0)),
      B('pelvis', 'waist', 'sphere', bone2, 0.5, 0.2, 0.34, 0, 0.98, 0), B('hipN', 'thN', 'sphere', bone, 0.2, 0.2, 0.2, 0, 0.92, 0.15), B('hipF', 'thF', 'sphere', bone2, 0.2, 0.2, 0.2, 0, 0.92, -0.15),
      B('shoN', 'chest', 'sphere', bone, 0.18, 0.18, 0.18, 0, 1.74, 0.32), B('shoF', 'chest', 'sphere', bone2, 0.18, 0.18, 0.18, 0, 1.74, -0.32),
      B('elbN', 'uaN', 'sphere', bone, 0.15, 0.15, 0.15, 0, 1.34, 0.32), B('elbF', 'uaF', 'sphere', bone2, 0.15, 0.15, 0.15, 0, 1.34, -0.32),
      // the skull: dark eye sockets with glowing eyes, a nose hole, teeth and a jaw that chatters
      B('sockN', 'head', 'sphere', dark, 0.17, 0.2, 0.1, 0.17, hy + 0.06, 0.17), B('eyeG', 'head', 'sphere', '#ff5a2a', 0.07, 0.08, 0.05, 0.2, hy + 0.06, 0.2, { glow: true }),
      B('nasal', 'head', 'cone', dark, 0.08, 0.14, 0.06, 0.27, hy - 0.07, 0.08), B('cheek', 'head', 'sphere', bone2, 0.1, 0.1, 0.06, 0.2, hy - 0.08, 0.17),
      B('teeth', 'head', 'box', '#f4f0e0', 0.2, 0.06, 0.3, 0.19, hy - 0.16, 0), ...[0.12, 0.17, 0.22, 0.27].map((x, i) => B('gap' + i, 'head', 'box', dark, 0.012, 0.07, 0.31, x, hy - 0.16, 0)),
      S('jaw', 'head', 'box', bone, 0.28, 0.09, 0.0, hy - 0.2, 100, 0, { sz: 0.28, swing: 3, swingPhase: 1 }),
      // ragged cloth and a rusty sword
      B('rag', 'waist', 'box', '#5a4a3a', 0.34, 0.3, 0.34, 0.02, 0.8, 0), blade('rblade', 'hdF', rust, 0, 1.0, 55, 1.15, 0.14, -0.32), B('rguard', 'hdF', 'box', '#6a5a46', 0.06, 0.3, 0.12, 0, 1.0, -0.32, { rotZ: -35 }),
    ] });
}
const PEOPLE = {
  knight, wizard, ninja, viking,
  robot: (c) => human({ leg: c || '#9aa3ad', leg2: '#6b727b', boot: '#4a5058', torso: c || '#9aa3ad', belt: '#4a5058', arm: '#6b727b', glove: '#4a5058', robot: true, headC: c || '#9aa3ad', gait: 0.5,
    extra: () => [B('core', 'chest', 'sphere', '#7ad8ff', 0.2, 0.2, 0.08, 0.02, 1.5, 0.24, { glow: true }), B('vent', 'chest', 'box', '#4a5058', 0.3, 0.2, 0.06, 0.02, 1.2, 0.24)] }),
  skeleton,
  zombie: (c) => human({ leg: '#3a3f5a', boot: '#2a2a2a', torso: c || '#4a6a3a', belt: '#3a3a3a', arm: '#7a9a5a', glove: '#7a9a5a', skin: '#7a9a5a', uaBias: -78, elbow: -8, armSwing: 8, lean: 12, gait: 0.28,
    extra: ({ hy }) => [B('zEye', 'head', 'sphere', '#c8d84a', 0.1, 0.1, 0.05, 0.19, hy + 0.05, 0.2, { glow: true }), B('scar', 'head', 'box', '#5a3a30', 0.14, 0.03, 0.05, 0.1, hy + 0.12, 0.2, { rotZ: 40 })] }),
  giant: (c) => human({ leg: '#4a3a2a', boot: '#2a2018', torso: c || '#7a5a3a', belt: '#3a2a1a', arm: '#8a6a4a', glove: SKIN, k: 2.2, gait: 0.22 }),
  golem: (c) => human({ leg: c || '#8a8f98', leg2: '#6b707a', boot: '#6b707a', torso: c || '#8a8f98', belt: '#6b707a', arm: '#6b707a', glove: '#6b707a', robot: true, headC: c || '#8a8f98', k: 2.4, gait: 0.2, armT: 0.3,
    extra: ({ s, hy }) => [B('gEye', 'head', 'box', '#ff8a2a', s(0.1), s(0.1), s(0.34), s(0.27), hy + s(0.03), 0, { glow: true })] }),
  person: (c) => human({ leg: '#2a2a33', boot: '#3a2a22', torso: c || '#3a5fa8', belt: '#2a2a33', arm: c || '#3a5fa8' }),
};

// ── things you throw, drop or swing, and vehicles you drive ──────────────────────
// (built pointing forwards; a falling one is turned to point down, except the ones marked upright)
const obj = (parts, extra = {}) => ({ kind: 'object', parts: rig(parts), ...extra });
const wheel = (x, y, z, d = 0.7, c = '#1c1c20') => { const zz = z + (z >= 0 ? 0.2 : -0.2); return [
  P('disc', c, d, 6, d, x, y, z), P('disc', '#8a9098', d * 0.6, 6.6, d * 0.6, x, y, z),
  ...[0, 60, 120].map((r) => P('box', '#e8ecf0', d * 0.62, d * 0.08, 0.03, x, y, zz, { rotZ: r, roll: 14 })), P('sphere', '#c9ced6', d * 0.18, d * 0.18, d * 0.1, x, y, zz),
]; };
const OBJECTS = {
  sword: (c) => obj([P('spike', c || '#dfe6ee', 0.22, 1.1, 0.07, 0.85, 0, 0), P('box', '#9aa5b0', 0.7, 0.08, 0.02, 0.85, 0, 0), P('box', '#c9a23a', 0.08, 0.1, 0.5, 0.0, 0, 0), P('box', '#6a4222', 0.5, 0.1, 0.1, -0.3, 0, 0), P('sphere', '#c9a23a', 0.14, 0.14, 0.14, -0.58, 0, 0)]),
  spear: (c) => obj([P('cylinder', '#8a5a2b', 0.07, 2.4, 0.07, 0, 0, 0, { rotZ: 90 }), P('spike', c || '#dfe6ee', 0.22, 0.5, 0.1, 1.5, 0, 0), P('box', '#d8322a', 0.3, 0.2, 0.03, 1.1, -0.1, 0)]),
  arrow: (c) => obj([P('cylinder', '#8a5a2b', 0.05, 1.6, 0.05, 0, 0, 0, { rotZ: 90 }), P('spike', c || '#c9ced6', 0.16, 0.2, 0.08, 0.95, 0, 0), P('spike', '#e63b3b', 0.2, 0.2, 0.04, -0.85, 0, 0, { rotZ: 180 }), P('spike', '#e63b3b', 0.2, 0.2, 0.04, -0.7, 0, 0, { rotZ: 180 })]),
  axe: (c) => obj([P('cylinder', '#8a5a2b', 0.09, 1.6, 0.09, 0, 0, 0, { rotZ: 90 }), P('box', c || '#c9ced6', 0.12, 0.7, 0.08, 0.7, 0.1, 0), P('cone', c || '#c9ced6', 0.2, 0.3, 0.08, 0.8, 0.5, 0, { rotZ: 90 })]),
  hammer: (c) => obj([P('cylinder', '#8a5a2b', 0.1, 1.7, 0.1, 0, 0, 0, { rotZ: 90 }), P('box', c || '#8a8f98', 0.5, 0.5, 0.5, 0.95, 0, 0), P('box', '#6b707a', 0.55, 0.12, 0.55, 0.95, 0, 0)]),
  anvil: (c) => obj([P('box', c || '#3a3f48', 1.2, 0.35, 0.6, 0, 0.55, 0), P('box', c || '#3a3f48', 0.5, 0.5, 0.45, 0, 0.18, 0), P('spike', c || '#3a3f48', 0.3, 0.3, 0.3, 0.85, 0.55, 0), P('box', '#555b66', 1.0, 0.06, 0.5, 0, 0.74, 0)], { upright: true }),
  // a grand piano: black body on three legs, a raised lid, a strip of white keys
  piano: (c) => { const bl = c || '#16161c'; return obj([
    P('box', bl, 2.0, 0.22, 1.1, 0, 1.0, 0), P('box', bl, 0.5, 0.3, 1.1, 1.15, 1.0, 0), P('box', '#f4f1ea', 0.34, 0.07, 1.0, 1.28, 1.17, 0), ...[0.1, 0.28, 0.46, 0.64, 0.82].map((z) => P('box', '#101014', 0.2, 0.06, 0.06, 1.34, 1.22, z - 0.45)),
    P('box', shade(bl, 1.3), 1.5, 0.05, 1.0, -0.2, 1.45, 0, { rotZ: -32 }), P('cylinder', '#8a8f98', 0.04, 0.5, 0.04, 0.2, 1.3, 0.3),
    P('cylinder', bl, 0.16, 0.9, 0.16, 0.85, 0.45, 0.4), P('cylinder', bl, 0.16, 0.9, 0.16, 0.85, 0.45, -0.4), P('cylinder', bl, 0.16, 0.9, 0.16, -0.8, 0.45, 0),
    P('box', '#c9a23a', 0.5, 0.05, 0.05, 1.0, 0.25, 0), P('box', bl, 0.5, 0.2, 0.2, 1.0, 0.95, 0),
  ], { upright: true }); },
  safe: (c) => obj([P('box', c || '#4a5058', 1.0, 1.2, 1.0, 0, 0.62, 0), P('box', '#5a626c', 0.86, 1.0, 0.06, 0, 0.62, 0.52), P('disc', '#c9ced6', 0.34, 3, 0.34, 0.1, 0.7, 0.56), P('box', '#e0b030', 0.3, 0.06, 0.06, -0.2, 0.4, 0.58), P('box', '#2a2e34', 1.08, 0.08, 1.08, 0, 0.04, 0), P('box', '#2a2e34', 0.1, 1.0, 0.04, -0.4, 0.62, 0.55)], { upright: true }),
  fridge: (c) => obj([P('box', c || '#eef0f2', 0.9, 1.95, 0.9, 0, 1.0, 0), P('box', '#c9ced6', 0.92, 0.03, 0.92, 0, 1.45, 0), P('box', '#8a8f98', 0.06, 0.5, 0.06, 0.4, 1.2, 0.46), P('box', '#8a8f98', 0.06, 0.5, 0.06, 0.4, 1.7, 0.46), P('box', '#d8322a', 0.18, 0.18, 0.04, -0.1, 1.6, 0.46), P('box', '#2f6fd8', 0.18, 0.18, 0.04, 0.12, 1.25, 0.46)], { upright: true }),
  weight: (c) => obj([P('box', c || '#26262c', 1.3, 0.9, 0.9, 0, 0.5, 0), P('box', shade(c || '#26262c', 1.4), 0.9, 0.5, 0.86, 0, 1.1, 0), P('torus', '#26262c', 0.9, 0.9, 0.3, 0, 1.65, 0, { rotZ: 0 }), P('box', '#f4f1ea', 0.5, 0.25, 0.04, 0, 0.5, 0.47), P('box', '#d8322a', 0.3, 0.08, 0.04, 0, 0.5, 0.49)], { upright: true }),
  boot: (c) => obj([P('cylinder', c || '#7a4a22', 0.62, 1.3, 0.62, -0.25, 1.05, 0), P('box', c || '#7a4a22', 1.4, 0.5, 0.66, 0.2, 0.34, 0), P('sphere', c || '#7a4a22', 0.7, 0.5, 0.66, 0.85, 0.4, 0), P('box', '#2a1a10', 1.5, 0.16, 0.7, 0.22, 0.08, 0), P('box', '#c9a06a', 0.64, 0.12, 0.7, -0.25, 1.6, 0), ...[0.5, 0.75, 1.0].map((y) => P('box', '#f4f1ea', 0.1, 0.05, 0.05, -0.02, y, 0.34))], { upright: true }),
  rock: (c) => obj([P('sphere', c || '#7a756c', 1.2, 1.0, 1.0, 0, 0.5, 0), P('sphere', '#8a857c', 0.7, 0.6, 0.7, 0.3, 0.9, 0.2), P('sphere', '#6a655c', 0.5, 0.4, 0.4, -0.4, 0.3, 0.35)], { upright: true }),
  bomb: (c) => obj([P('sphere', c || '#22242a', 0.8, 0.8, 0.8, 0, 0.4, 0), P('cylinder', '#8a5a2b', 0.08, 0.25, 0.08, 0.12, 0.88, 0), P('sphere', '#ffb02a', 0.18, 0.18, 0.18, 0.15, 1.05, 0, { glow: true }), P('sphere', '#ffffff', 0.18, 0.1, 0.05, -0.2, 0.6, 0.38, { opacity: 0.5 })], { upright: true }),
  rocket: (c) => obj([P('cylinder', c || '#e8e8f0', 0.5, 2.4, 0.5, 0, 0, 0, { rotZ: 90 }), P('cone', '#e63b3b', 0.5, 0.9, 0.5, 1.6, 0, 0, { rotZ: 90 }), P('cone', '#e63b3b', 0.1, 0.6, 0.8, -0.9, 0.25, 0), P('cone', '#e63b3b', 0.1, 0.6, 0.8, -0.9, -0.25, 0, { rotZ: 180 }), P('sphere', '#ffb02a', 0.9, 0.35, 0.35, -1.5, 0, 0, { glow: true }), P('sphere', '#fff2a0', 0.5, 0.2, 0.2, -1.2, 0, 0, { glow: true }), P('sphere', '#7ad8ff', 0.2, 0.2, 0.2, 0.7, 0.05, 0.25)]),

  // ── vehicles: the player drives them into the opponent (the tank and the plane stop and shoot) ──
  // The player stands INSIDE: side panels, doors and a windscreen hide the legs, so only the driver's top half shows.
  car: (c) => { const b = c || '#d8322a', dk = shade(b, 0.78); return obj([
    P('box', '#2a2a30', 2.6, 0.1, 1.2, 0, 0.3, 0), P('box', b, 2.6, 0.78, 0.07, 0, 0.7, 0.6), P('box', dk, 2.6, 0.78, 0.07, 0, 0.7, -0.6),
    P('box', b, 1.0, 0.4, 1.2, 1.05, 0.58, 0), P('box', dk, 0.8, 0.4, 1.2, -1.1, 0.58, 0), P('box', '#2a2a30', 0.12, 0.55, 1.1, 0.5, 0.82, 0), P('box', '#3a3a44', 0.1, 0.55, 0.9, -0.5, 0.78, 0),
    P('box', '#9fd2ff', 0.05, 0.5, 1.1, 0.58, 1.22, 0, { rotZ: -30, opacity: 0.5 }), P('torus', '#222226', 0.34, 0.34, 0.1, 0.36, 1.08, 0, { rotZ: 40 }),
    ...wheel(0.9, 0.36, 0.64), ...wheel(-0.9, 0.36, 0.64), ...wheel(0.9, 0.36, -0.64), ...wheel(-0.9, 0.36, -0.64),
    P('sphere', '#fff2a0', 0.18, 0.18, 0.18, 1.55, 0.62, 0.4, { glow: true }), P('sphere', '#fff2a0', 0.18, 0.18, 0.18, 1.55, 0.62, -0.4, { glow: true }), P('box', '#c9ced6', 0.1, 0.12, 1.3, 1.58, 0.36, 0), P('box', '#c9ced6', 0.1, 0.12, 1.3, -1.52, 0.36, 0), P('box', '#f4f1ea', 2.3, 0.06, 0.04, 0, 0.62, 0.64),
  ], { upright: true, drive: { key: 'car', rideY: 0.1, carryTo: 1.2 } }); },
  truck: (c) => { const b = c || '#2f8a4a', dk = shade(b, 0.8); return obj([
    P('box', '#26262c', 2.7, 0.14, 1.4, 0, 0.9, 0), P('box', b, 2.7, 0.78, 0.07, 0, 1.3, 0.72), P('box', dk, 2.7, 0.78, 0.07, 0, 1.3, -0.72),
    P('box', b, 1.0, 0.7, 1.4, 1.1, 1.25, 0), P('box', dk, 0.5, 0.78, 1.4, -1.2, 1.3, 0), P('box', '#2a2a30', 0.12, 0.6, 1.2, 0.55, 1.5, 0), P('box', '#9fd2ff', 0.05, 0.5, 1.2, 0.6, 1.85, 0, { rotZ: -20, opacity: 0.5 }),
    P('cylinder', '#8a8f98', 0.07, 0.8, 0.07, -0.55, 2.0, 0.55), P('cylinder', '#8a8f98', 0.07, 0.8, 0.07, -0.55, 2.0, -0.55), P('cylinder', '#8a8f98', 0.07, 0.6, 0.07, -0.55, 2.35, 0, { rotZ: 90 }),
    P('cylinder', '#1c1c20', 0.12, 0.9, 0.12, -1.3, 2.0, 0.5), P('cylinder', '#1c1c20', 0.12, 0.9, 0.12, -1.3, 2.0, -0.5), P('torus', '#222226', 0.36, 0.36, 0.1, 0.4, 1.55, 0, { rotZ: 40 }),
    ...wheel(1.0, 0.66, 0.86, 1.3), ...wheel(-1.0, 0.66, 0.86, 1.3), ...wheel(1.0, 0.66, -0.86, 1.3), ...wheel(-1.0, 0.66, -0.86, 1.3),
    P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 1.62, 1.45, 0.5, { glow: true }), P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 1.62, 1.45, -0.5, { glow: true }), P('box', '#8a8f98', 0.2, 0.2, 1.5, 1.62, 0.95, 0),
  ], { upright: true, drive: { key: 'truck', rideY: 0.72, carryTo: 1.2 } }); },
  bus: (c) => { const b = c || '#f2c230', dk = shade(b, 0.75), glass = '#9fd2ff'; return obj([
    P('box', '#5a4a3a', 4.0, 0.08, 1.5, 0, 0.42, 0), P('box', b, 4.0, 0.74, 0.07, 0, 0.82, 0.76), P('box', dk, 4.0, 0.74, 0.07, 0, 0.82, -0.76), P('box', '#1c1c20', 3.9, 0.07, 0.04, 0, 0.7, 0.8), P('box', '#d8322a', 3.9, 0.06, 0.04, 0, 1.0, 0.8),
    P('box', b, 4.0, 0.1, 1.6, 0, 2.5, 0), ...[-1.8, -1.2, -0.6, 1.5, 1.95].flatMap((x) => [P('box', b, 0.12, 1.4, 0.08, x, 1.78, 0.76), P('box', dk, 0.12, 1.4, 0.08, x, 1.78, -0.76)]),
    P('box', glass, 1.1, 1.3, 0.04, -1.2, 1.8, 0.78, { opacity: 0.3 }), P('box', glass, 0.04, 1.4, 1.4, 1.98, 1.75, 0, { opacity: 0.3 }), P('box', '#2a2a30', 0.1, 0.5, 1.4, 1.2, 1.0, 0), P('torus', '#222226', 0.4, 0.4, 0.1, 1.05, 1.2, 0, { rotZ: 35 }),
    P('box', b, 0.6, 0.9, 1.5, -1.95, 1.3, 0), P('box', '#26262c', 0.05, 0.25, 0.9, 2.03, 2.3, 0), P('box', '#d8322a', 0.05, 0.3, 0.3, 0.9, 2.1, 0.8),
    ...wheel(1.3, 0.45, 0.8, 0.9), ...wheel(-1.3, 0.45, 0.8, 0.9), ...wheel(1.3, 0.45, -0.8, 0.9), ...wheel(-1.3, 0.45, -0.8, 0.9),
    P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 2.04, 0.85, 0.5, { glow: true }), P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 2.04, 0.85, -0.5, { glow: true }),
  ], { upright: true, drive: { key: 'bus', rideY: 0.25, carryTo: 1.2 } }); },
  train: (c) => { const b = c || '#2a2a30', cab = '#b02a2a'; return obj([
    P('box', '#26262c', 1.9, 0.15, 1.6, 0, 0.65, 0), P('box', cab, 1.9, 0.78, 0.07, 0, 1.06, 0.8), P('box', shade(cab, 0.8), 1.9, 0.78, 0.07, 0, 1.06, -0.8), P('box', cab, 0.1, 1.9, 1.6, -0.95, 1.7, 0),
    P('box', '#26262c', 2.1, 0.12, 1.8, 0, 2.75, 0), ...[0.9, -0.9].flatMap((z) => [P('box', cab, 0.12, 1.3, 0.12, 0.92, 2.1, z)]), P('box', '#9fd2ff', 0.05, 1.0, 1.4, 0.95, 2.0, 0, { opacity: 0.3 }),
    P('cylinder', b, 1.3, 2.9, 1.3, 2.4, 1.3, 0, { rotZ: 90 }), P('cylinder', '#1c1c20', 0.4, 1.0, 0.4, 3.0, 2.3, 0), P('cone', '#1c1c20', 0.8, 0.4, 0.8, 3.0, 2.9, 0, { rotZ: 180 }), P('sphere', '#c9a23a', 0.5, 0.4, 0.5, 2.0, 2.05, 0), P('cone', '#8a8f98', 1.2, 1.0, 1.2, 4.3, 1.0, 0, { rotZ: 90 }),
    P('box', '#26262c', 5.6, 0.2, 1.1, 1.2, 0.55, 0), P('box', '#1c1c20', 1.6, 0.9, 1.4, -2.0, 1.15, 0), P('sphere', '#1c1c20', 1.2, 0.5, 1.2, -2.0, 1.7, 0),
    ...wheel(-0.4, 0.6, 0.68, 1.2, '#3a3f48'), ...wheel(0.7, 0.6, 0.68, 1.2, '#3a3f48'), ...wheel(2.4, 0.4, 0.68, 0.8, '#3a3f48'), ...wheel(3.4, 0.4, 0.68, 0.8, '#3a3f48'), ...wheel(-0.4, 0.6, -0.68, 1.2, '#3a3f48'), ...wheel(0.7, 0.6, -0.68, 1.2, '#3a3f48'),
    P('box', '#e0b030', 0.1, 0.1, 1.2, 4.7, 0.5, 0), P('sphere', '#fff2a0', 0.26, 0.26, 0.26, 3.9, 1.5, 0, { glow: true }),
  ], { upright: true, drive: { key: 'train', rideY: 0.45, carryTo: 1.2 } }); },
  motorcycle: (c) => { const b = c || '#d8322a'; return obj([
    ...wheel(0.8, 0.4, 0.2, 0.8), ...wheel(-0.8, 0.4, 0.2, 0.8), P('cylinder', '#8a8f98', 0.07, 0.9, 0.07, 0.72, 0.8, 0.2, { rotZ: -22 }), P('box', '#26262c', 0.8, 0.4, 0.34, 0, 0.55, 0.2), P('sphere', b, 0.7, 0.4, 0.4, 0.3, 1.0, 0.2),
    P('box', b, 1.5, 0.85, 0.06, 0, 0.58, 0.56), P('box', shade(b, 0.8), 1.5, 0.85, 0.06, 0, 0.58, -0.16), P('box', '#26262c', 0.6, 0.12, 0.34, -0.4, 0.98, 0.2), P('box', '#26262c', 0.06, 0.06, 0.8, 0.55, 1.2, 0.2),
    P('cylinder', '#8a8f98', 0.09, 0.8, 0.09, -0.55, 0.35, 0.34, { rotZ: 90 }), P('box', '#9fd2ff', 0.05, 0.3, 0.4, 0.65, 1.4, 0.2, { rotZ: -25, opacity: 0.5 }), P('sphere', '#fff2a0', 0.22, 0.22, 0.22, 1.0, 1.0, 0.2, { glow: true }),
  ], { upright: true, drive: { key: 'motorcycle', rideY: 0.05, carryTo: 1.2 } }); },
  tank: (c) => { const g = c || '#5a6a3a'; return obj([
    P('box', '#26262c', 3.2, 0.5, 0.45, 0, 0.35, 0.8), P('box', '#26262c', 3.2, 0.5, 0.45, 0, 0.35, -0.8), ...[-1.2, -0.6, 0, 0.6, 1.2].flatMap((x) => wheel(x, 0.34, 0.8, 0.4, '#3a3f48')),
    P('box', g, 2.8, 0.55, 1.5, 0, 0.8, 0), P('box', shade(g, 1.15), 1.0, 0.3, 1.2, 1.3, 0.9, 0, { rotZ: -14 }), P('sphere', g, 1.2, 0.5, 1.0, -0.1, 1.2, 0, { id: 'tur' }), P('cylinder', shade(g, 0.8), 0.7, 0.14, 0.7, -0.1, 1.46, 0),
    { ...limb('cylinder', '#3a4030', 1.5, 0.17, 0.4, 1.25, 90, 0, { id: 'barrel', par: 'tur' }) }, P('cylinder', '#26262c', 0.26, 0.22, 0.26, 2.0, 1.25, 0, { rotZ: 90 }),
    P('cylinder', '#8a8f98', 0.05, 0.9, 0.05, -1.2, 1.5, 0.4), P('box', '#d8322a', 0.3, 0.2, 0.05, -1.4, 0.9, 0.78),
  ], { upright: true, drive: { key: 'tank', rideY: 0.7, carryTo: 6 } }); },
  boat: (c) => { const b = c || '#8a5a2b', dk = shade(b, 0.8); return obj([
    P('box', '#3a2a1a', 2.8, 0.1, 1.1, 0, 0.3, 0), P('box', b, 2.8, 0.9, 0.07, 0, 0.75, 0.55), P('box', dk, 2.8, 0.9, 0.07, 0, 0.75, -0.55), P('cone', b, 1.1, 1.0, 1.1, 1.9, 0.7, 0, { rotZ: 90 }), P('box', dk, 0.1, 0.9, 1.1, -1.4, 0.75, 0),
    P('box', '#9fd2ff', 0.05, 0.5, 1.0, 0.55, 1.4, 0, { rotZ: -22, opacity: 0.5 }), P('torus', '#222226', 0.34, 0.34, 0.1, 0.35, 1.1, 0, { rotZ: 40 }), P('cylinder', '#6a4222', 0.1, 2.0, 0.1, -0.9, 1.7, 0), P('box', '#d8322a', 0.5, 0.3, 0.05, -0.9, 2.55, 0),
    P('cylinder', '#8a8f98', 0.07, 0.7, 0.07, -1.45, 1.0, 0.3), P('sphere', '#fff2a0', 0.16, 0.16, 0.16, 2.2, 0.9, 0, { glow: true }),
  ], { water: true, domain: 'water', upright: true, drive: { key: 'boat', rideY: 0.25, carryTo: 1.2 } }); },
  // a drill machine: tunnels under the floor and bursts up beneath the opponent (it drives itself)
  drill: (c) => { const y = c || '#e0b030'; return obj([
    P('box', '#26262c', 3.0, 0.45, 0.45, 0, 0.3, 0.7), P('box', '#26262c', 3.0, 0.45, 0.45, 0, 0.3, -0.7), ...[-1.0, -0.35, 0.3, 0.95].flatMap((x) => wheel(x, 0.3, 0.7, 0.4, '#3a3f48')),
    P('cylinder', y, 1.3, 2.4, 1.3, 0, 0.95, 0, { rotZ: 90 }), P('box', '#26262c', 0.9, 0.5, 1.1, -0.9, 1.7, 0), P('box', '#9fd2ff', 0.5, 0.4, 1.0, -0.9, 1.75, 0, { opacity: 0.5 }),
    P('cone', '#8a8f98', 1.35, 1.8, 1.35, 2.1, 0.95, 0, { rotZ: 90 }), ...[0.25, 0.7, 1.1, 1.5].map((x, i) => P('torus', '#4a4f58', 1.25 - i * 0.28, 1.25 - i * 0.28, 0.3, 1.3 + x, 0.95, 0, { rotZ: 0 })),
    ...[0, 1, 2, 3, 4].map((i) => P('crystal', '#e8ecf0', 0.16, 0.3, 0.16, 2.8 - i * 0.1, 0.95 + Math.sin(i * 1.9) * 0.45, Math.cos(i * 1.9) * 0.3)),
    P('cylinder', '#1c1c20', 0.16, 0.7, 0.16, -1.1, 2.2, 0.3), P('sphere', '#ffb02a', 0.3, 0.3, 0.3, 0.6, 1.5, 0.6, { glow: true }),
  ], { autonomous: true, domain: 'under', upright: true }); },
  helicopter: (c) => { const b = c || '#4a6a8a', dk = shade(b, 0.75); return obj([
    P('box', '#26262c', 1.9, 0.14, 1.3, 0, 0.9, 0), P('box', b, 1.9, 0.62, 0.07, 0, 1.2, 0.64), P('box', dk, 1.9, 0.62, 0.07, 0, 1.2, -0.64), P('sphere', '#9fd2ff', 2.0, 2.6, 1.4, 0.1, 1.9, 0, { opacity: 0.28 }),
    P('cone', b, 0.5, 3.0, 0.5, -2.2, 1.7, 0, { rotZ: 270 }), P('box', dk, 0.08, 0.9, 0.3, -3.6, 2.0, 0), P('box', '#1c1c20', 0.7, 0.05, 0.1, -3.6, 2.3, 0.2, { roll: 22 }),
    P('cylinder', '#26262c', 0.14, 0.5, 0.14, 0, 3.05, 0), P('box', '#26262c', 4.6, 0.05, 0.2, 0, 3.3, 0, { yaw: 28 }), P('flat', '#cfd4da', 4.6, 1, 4.6, 0, 3.3, 0, { opacity: 0.18, glow: true }),
    P('cylinder', '#26262c', 0.07, 2.0, 0.07, 0.2, 0.55, 0.6, { rotZ: 90 }), P('cylinder', '#26262c', 0.07, 2.0, 0.07, 0.2, 0.55, -0.6, { rotZ: 90 }), P('cylinder', '#26262c', 0.06, 0.5, 0.06, 0.6, 0.78, 0.6), P('cylinder', '#26262c', 0.06, 0.5, 0.06, -0.3, 0.78, 0.6),
    P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 1.1, 1.4, 0, { glow: true }),
  ], { fly: true, domain: 'air', upright: true, drive: { key: 'helicopter', rideY: 3.2, carryTo: 5 } }); },
  ufo: (c) => { const b = c || '#9aa3ad'; return obj([
    P('sphere', b, 3.4, 0.7, 3.4, 0, 1.0, 0), P('sphere', shade(b, 0.75), 2.2, 0.5, 2.2, 0, 0.7, 0), P('sphere', '#9fffd0', 1.9, 2.2, 1.9, 0, 1.9, 0, { opacity: 0.3 }),
    ...[0, 1, 2, 3, 4, 5].map((i) => P('sphere', i % 2 ? '#ffe36a' : '#ff6aa8', 0.2, 0.2, 0.2, Math.cos(i * 1.05) * 1.55, 0.95, Math.sin(i * 1.05) * 1.55, { glow: true })),
    P('cone', '#8a8f98', 0.3, 0.3, 0.3, 0, 0.45, 0, { rotZ: 180 }),
  ], { fly: true, domain: 'air', upright: true, drive: { key: 'ufo', rideY: 3.8, carryTo: 0 } }); },
  submarine: (c) => { const b = c || '#6a7a8a'; return obj([
    P('cylinder', b, 1.4, 4.2, 1.4, 0, 0.4, 0, { rotZ: 90 }), P('sphere', b, 1.4, 1.4, 1.4, 2.1, 0.4, 0), P('sphere', shade(b, 0.8), 1.4, 1.4, 1.4, -2.1, 0.4, 0),
    P('box', b, 1.0, 0.9, 0.9, 0, 1.2, 0), P('box', '#26262c', 0.9, 0.06, 0.8, 0, 1.68, 0), P('cylinder', '#26262c', 0.08, 0.9, 0.08, 0.5, 2.1, 0), P('cylinder', '#26262c', 0.08, 0.3, 0.08, 0.7, 2.5, 0, { rotZ: 90 }),
    ...[0.35, -0.35].map((z) => P('cylinder', '#3a3f48', 0.22, 0.7, 0.22, 2.5, 0.3, z, { rotZ: 90 })), P('box', '#26262c', 0.1, 0.9, 0.06, -2.7, 0.55, 0), P('box', '#26262c', 0.1, 0.06, 0.9, -2.7, 0.4, 0),
    ...[1.4, 0.7, -0.7, -1.4].map((x) => P('sphere', '#9fd2ff', 0.2, 0.2, 0.06, x, 0.55, 0.7, { glow: true })), P('sphere', '#fff2a0', 0.2, 0.2, 0.2, 2.8, 0.5, 0, { glow: true }),
  ], { water: true, domain: 'water', upright: true, drive: { key: 'submarine', rideY: 0.55, carryTo: 6 } }); },
  plane: (c) => { const b = c || '#c9ced6'; return obj([
    P('cylinder', b, 1.3, 3.6, 1.3, 0, 1.5, 0, { rotZ: 90 }), P('cone', '#d8322a', 1.3, 1.0, 1.3, 2.3, 1.5, 0, { rotZ: 90 }), P('box', shade(b, 0.85), 1.1, 0.07, 3.8, 0.1, 1.35, 0), P('box', '#d8322a', 0.9, 0.9, 0.06, -1.7, 2.1, 0, { rotZ: -20 }), P('box', shade(b, 0.85), 0.7, 0.06, 1.6, -1.75, 1.5, 0),
    P('box', '#7ad8ff', 0.05, 0.5, 0.9, 0.7, 2.35, 0, { rotZ: -30, opacity: 0.45 }), P('torus', '#222226', 0.3, 0.3, 0.1, 0.35, 2.15, 0, { rotZ: 40 }), P('disc', '#3a3f48', 1.4, 3, 1.4, 2.8, 1.5, 0, { spin: 14, opacity: 0.5 }), P('box', '#26262c', 0.1, 0.5, 0.1, 0.5, 0.75, 0.4),
    ...wheel(0.5, 0.6, 0.4, 0.5), P('sphere', '#fff2a0', 0.16, 0.16, 0.16, 1.3, 1.5, 0.6, { glow: true }),
  ], { fly: true, domain: 'air', upright: true, drive: { key: 'plane', rideY: 3.5, carryTo: 0 } }); },
};

// ── underground animals: they dig, travel below the floor and burst up under the opponent ──
function mole(c) {
  const fur = c || '#4a3a32', pink = '#e8a8a0', dk = shade(fur, 0.8);
  const parts = [
    B('body', null, 'sphere', fur, 1.0, 0.62, 0.6, 0, 0.42, 0, { pv: 0.2, swing: 3 }),
    B('head', 'body', 'sphere', fur, 0.5, 0.42, 0.42, 0.55, 0.5, 0, { swing: 4, swingPhase: 1 }),
    B('nose', 'head', 'cone', pink, 0.16, 0.26, 0.16, 0.86, 0.5, 0, { rotZ: 90 }), B('nostrilN', 'head', 'sphere', '#c87a78', 0.05, 0.05, 0.05, 0.99, 0.53, 0.06),
    B('eyeN', 'head', 'sphere', '#101010', 0.06, 0.06, 0.04, 0.7, 0.62, 0.18), B('eyeF', 'head', 'sphere', '#101010', 0.06, 0.06, 0.04, 0.7, 0.62, -0.18),
    ...[0, 1, 2].map((i) => B('wh' + i, 'head', 'cylinder', '#e8e0d0', 0.012, 0.36, 0.012, 0.9, 0.46 + i * 0.05, 0.16, { rotZ: 75 + i * 12 })),
    B('tail', 'body', 'cone', pink, 0.12, 0.35, 0.1, -0.6, 0.38, 0, { rotZ: 250 }),
    ...[['N', 0.22], ['F', -0.22]].map(([sd, z]) => B('leg' + sd, 'body', 'sphere', dk, 0.22, 0.2, 0.2, -0.2, 0.1, z)),
  ];
  // the big digging hands: an arm, a pink palm, long white claws
  [['N', 0.32, 0], ['F', -0.32, Math.PI]].forEach(([sd, z, ph]) => {
    const [hx, hy] = tip(0.38, 0.4, 150, 0.4);
    parts.push(S('arm' + sd, 'body', 'cylinder', sd === 'N' ? dk : shade(dk, 0.8), 0.4, 0.17, 0.38, 0.4, 150, z, { swing: 12, swingPhase: ph }),
      B('palm' + sd, 'arm' + sd, 'box', pink, 0.1, 0.36, 0.3, hx + 0.02, hy + 0.04, z),
      ...[-0.1, 0, 0.1].map((dz, i) => B('claw' + i + sd, 'arm' + sd, 'cone', WHITE, 0.07, 0.24, 0.07, hx + 0.14, hy - 0.04, z + dz, { rotZ: 125 })));
  });
  return { parts: rig(parts), kind: 'burrower', domain: 'under', back: 0.8, gait: 0.4 };
}
function sandworm(c) {
  const sand = c || '#b89868', band = shade(sand, 0.72), n = 7, seg = 0.8;
  const parts = [];
  let par = null;
  for (let i = 0; i < n; i++) {
    const th = 1.5 - i * 0.1;
    parts.push(S('sw' + i, par, 'sphere', i % 2 ? band : sand, seg, th, 0, i * seg * 0.92, 0, 0, { sz: th, swing: 2.5, swingPhase: i * 0.5 }));
    par = 'sw' + i;
  }
  const ty = (n - 1) * seg * 0.92 + seg;
  parts.push(B('maw', 'sw6', 'sphere', '#401818', 0.95, 0.7, 0.8, 0.0, ty - 0.1, 0),
    S('petalN', 'sw6', 'cone', '#d8c8a8', 1.1, 0.5, 0.05, ty - 0.35, -32, 0.3, { sz: 0.18, swing: 3 }), S('petalF', 'sw6', 'cone', shade('#d8c8a8', 0.85), 1.1, 0.5, 0.05, ty - 0.35, 32, -0.3, { sz: 0.18, swing: 3 }),
    ...[-0.3, -0.1, 0.1, 0.3].map((z, i) => B('tooth' + i, 'sw6', 'cone', WHITE, 0.09, 0.3, 0.09, 0.1 * (i % 2 ? -1 : 1), ty - 0.3, z, { rotZ: 180 })),
    B('eyeN', 'sw6', 'sphere', '#ffe36a', 0.14, 0.14, 0.06, 0.2, ty - 0.55, 0.62, { glow: true }));
  return { parts: rig(parts), kind: 'burrower', domain: 'under', back: 4, gait: 0.2, ctx: { ty } };
}

// ── the words ────────────────────────────────────────────────────────────────────
// word pattern -> [group, key]. Plurals and common names for the same thing share a key.
const WORDS = [
  [/\b(horses?|ponys?|ponies|stallions?|mares?|steeds?|mustangs?|racehorses?)\b/, 'A', 'horse'], [/\bunicorns?\b/, 'A', 'unicorn'], [/\b(cows?|cattle|oxen)\b/, 'A', 'cow'], [/\b(bulls?|buffalos?|buffaloes|bison)\b/, 'A', 'bull'],
  [/\b(pigs?|boars?|hogs?)\b/, 'A', 'pig'], [/\b(sheep|lambs?|rams?|goats?)\b/, 'A', 'sheep'], [/\b(dogs?|puppy|puppies|hounds?)\b/, 'A', 'dog'], [/\b(wolf|wolves|werewolf|werewolves|hyenas?|jackals?)\b/, 'A', 'wolf'],
  [/\b(foxe?s?)\b/, 'A', 'fox'], [/\b(cats?|kittens?|kitty|panthers?|cheetahs?|leopards?|jaguars?|pumas?|cougars?|lynx)\b/, 'A', 'cat'], [/\b(lions?|lionesses?)\b/, 'A', 'lion'], [/\b(tigers?)\b/, 'A', 'tiger'],
  [/\b(bears?|pandas?|grizzlys?|grizzlies|gorillas?|apes?|kong)\b/, 'A', 'bear'], [/\b(elephants?|mammoths?|mastodons?)\b/, 'A', 'elephant'], [/\b(rhinos?|rhinoceros(es)?|hippos?|hippopotamus(es)?)\b/, 'A', 'rhino'],
  [/\b(deers?|stags?|elks?|moose|antelopes?|reindeers?)\b/, 'A', 'deer'], [/\bgiraffes?\b/, 'A', 'giraffe'], [/\b(camels?|llamas?|alpacas?)\b/, 'A', 'camel'],
  [/\b(crocodiles?|alligators?|gators?)\b/, 'A', 'crocodile'], [/\b(lizards?|geckos?|iguanas?|komodo|salamanders?|raptors?)\b/, 'A', 'lizard'], [/\b(turtles?|tortoises?)\b/, 'A', 'turtle'],
  [/\b(eagles?|falcons?)\b/, 'B', 'eagle'], [/\b(hawks?|kites?|buzzards?)\b/, 'B', 'hawk'], [/\b(vultures?|condors?)\b/, 'B', 'vulture'], [/\b(owls?)\b/, 'B', 'owl'], [/\b(crows?|ravens?|blackbirds?)\b/, 'B', 'crow'], [/\b(bats?|vampire bats?)\b/, 'B', 'bat'], [/\b(parrots?|macaws?)\b/, 'B', 'parrot'], [/\b(toucans?)\b/, 'B', 'toucan'],
  [/\b(seagulls?|gulls?|doves?|pigeons?|storks?)\b/, 'B', 'seagull'], [/\b(swans?|geese|goose|ducks?)\b/, 'B', 'swan'], [/\b(chickens?|roosters?|hens?)\b/, 'B', 'chicken'], [/\b(phoenix|phoenixes|firebirds?)\b/, 'B', 'phoenix'], [/\b(birds?|sparrows?|robins?|songbirds?)\b/, 'B', 'bird'],
  [/\b(whales?)\b/, 'S', 'whale'], [/\b(orcas?|killer whales?)\b/, 'S', 'orca'], [/\b(dolphins?|porpoises?)\b/, 'S', 'dolphin'], [/\b(sharks?|megalodons?|great white)\b/, 'S', 'shark'], [/\b(fish|fishes|piranhas?|salmon|tuna|swordfish|marlin)\b/, 'S', 'fish'],
  [/\b(snakes?|serpents?|cobras?|pythons?|vipers?|anacondas?|eels?|hydras?)\b/, 'N', 'snake'], [/\b(moles?|gophers?|groundhogs?|badgers?|prairie dogs?|meerkats?)\b/, 'U', 'mole'], [/\b((giant |huge |dune )?sand ?worms?|giant worms?|dune worms?|worms?|earthworms?)\b/, 'U', 'sandworm'],
  [/\b(dragons?|wyverns?|drakes?)\b/, 'D', 'dragon'], [/\b(dinosaurs?|dinos?|t-?rex|tyrannosaurus|trex)\b/, 'D', 'dino'],
  [/\b(knights?|paladins?|crusaders?|warriors?|soldiers?|samurai)\b/, 'H', 'knight'], [/\b(wizards?|witch(es)?|mages?|sorcerers?|sorceress(es)?|warlocks?)\b/, 'H', 'wizard'], [/\b(ninjas?|assassins?|rogues?)\b/, 'H', 'ninja'],
  [/\b(robots?|androids?|cyborgs?|mechs?|terminators?)\b/, 'H', 'robot'], [/\b(skeletons?|skulls?|bones?|undead)\b/, 'H', 'skeleton'], [/\b(zombies?|ghouls?|mummy|mummies)\b/, 'H', 'zombie'], [/\b(vikings?|barbarians?)\b/, 'H', 'viking'],
  [/\b(giants?|titans?|ogres?|trolls?|cyclops(es)?|colossus)\b/, 'H', 'giant'], [/\b(golems?|statues?)\b/, 'H', 'golem'], [/\b(men|man|people|person|humans?|guys?|boys?|girls?|women|woman|clowns?)\b/, 'H', 'person'],
  [/\b(swords?|katanas?|blades?|sabres?|sabers?|scimitars?|machetes?)\b/, 'O', 'sword'], [/\b(spears?|lances?|javelins?|tridents?|harpoons?|pikes?)\b/, 'O', 'spear'], [/\b(arrows?|bolts?|darts?)\b/, 'O', 'arrow'],
  [/\b(axes?|hatchets?|battle ?axes?)\b/, 'O', 'axe'], [/\b(hammers?|mallets?|maces?|clubs?)\b/, 'O', 'hammer'], [/\b(anvils?)\b/, 'O', 'anvil'], [/\b(pianos?)\b/, 'O', 'piano'], [/\b(safes?|vaults?)\b/, 'O', 'safe'], [/\b(fridges?|refrigerators?|freezers?)\b/, 'O', 'fridge'], [/\b(weights?|dumbbells?|barbells?|kettlebells?)\b/, 'O', 'weight'], [/\b(boots?|shoes?|sneakers?|giant foot|feet)\b/, 'O', 'boot'],
  [/\b(rocks?|boulders?|stones?|meteors?|asteroids?|comets?)\b/, 'O', 'rock'], [/\b(bombs?|grenades?|mines?|dynamite)\b/, 'O', 'bomb'], [/\b(rockets?|missiles?|torpedo(es)?)\b/, 'O', 'rocket'],
  [/\b(cars?|sports ?cars?|taxis?|vans?|jeeps?)\b/, 'O', 'car'], [/\b(trucks?|pickups?|lorr(y|ies)|monster trucks?)\b/, 'O', 'truck'], [/\b(buses|bus|school bus)\b/, 'O', 'bus'], [/\b(trains?|locomotives?)\b/, 'O', 'train'], [/\b(motorcycles?|motorbikes?|bikes?|scooters?)\b/, 'O', 'motorcycle'], [/\b(tanks?)\b/, 'O', 'tank'], [/\b(boats?|ships?|pirate ships?|canoes?|yachts?)\b/, 'O', 'boat'], [/\b(planes?|jets?|airplanes?|aeroplanes?|bombers?|fighter planes?|aircraft)\b/, 'O', 'plane'], [/\b(helicopters?|choppers?|copters?|gunships?)\b/, 'O', 'helicopter'], [/\b(ufos?|flying saucers?|saucers?|spaceships?|alien ships?)\b/, 'O', 'ufo'], [/\b(submarines?|subs?|u-?boats?)\b/, 'O', 'submarine'], [/\b(drills?|drill machines?|diggers?|excavators?|borers?|boring machines?|mining machines?)\b/, 'O', 'drill'],
];
const MAKERS = {
  A: ANIMALS, B: BIRDS, S: SEA, H: PEOPLE, O: OBJECTS,
  N: { snake: (c) => snake(c || '#4f9a3a', '#c9d86a') },
  U: { mole, sandworm },
  D: { dragon: (c) => Object.assign(dragon(c || '#c0322a', '#ffd23f'), { domain: 'air' }), dino: (c) => dinosaur(c || '#5a8a3a', '#d8d29a') },
};
const COLORS = { red: '#d8322a', blue: '#2f6fd8', green: '#3a9a4a', yellow: '#f2c230', orange: '#ee7a22', purple: '#8a4ad8', pink: '#f08ac0', black: '#1c1c24', white: '#f4f1ea', gold: '#e0b030', golden: '#e0b030', silver: '#c0c6d0', brown: '#7a4a2a', grey: '#8a8f98', gray: '#8a8f98', cyan: '#2fd0e0' };

// every thing named in the words, in the order said
function findAll(t) {
  const all = [];
  for (const [re, g, key] of WORDS) { const m = re.exec(t); if (m) all.push({ index: m.index, group: g, key, word: m[0] }); }
  // a word inside a longer match is part of it ("giant" in "giant sandworm")
  return all.filter((x) => !all.some((y) => y !== x && y.index <= x.index && y.index + y.word.length >= x.index + x.word.length && y.word.length > x.word.length)).sort((a, b) => a.index - b.index);
}
// the thing the words are about: "a wizard riding a horse" is the horse, "a wizard throws a rocket" is the rocket
export function findThing(text) {
  const t = String(text || '').toLowerCase(), all = findAll(t);
  if (all.length < 2) return all[0] || null;
  const ride = /\b(riding|rides?|ridden|mounted|on (the )?back of)\b/.exec(t);
  if (ride) return all.find((x) => x.index > ride.index && x.group !== 'H' && x.group !== 'O') || all.find((x) => x.group !== 'H' && x.group !== 'O') || all[0];
  if (/\b(throws?|thrown|shoots?|fires?|hurls?|flings?|launch(es)?|drops?|dropped|rain|rains|falls?|falling|swings?)\b/.test(t)) return all.find((x) => x.group === 'O') || all[0];
  return all[0];
}

// make the parts of a thing, in the colour named in the words (if any)
function build(found, t) {
  const col = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  const thing = MAKERS[found.group][found.key](col ? COLORS[col] : null);
  if (/\b(fire|flaming|burning|flame|lava|inferno)\b/.test(t)) thing.parts.forEach((p) => { if (p.color !== EYE) { p.color = '#ff6a1a'; p.glow = true; } });
  if (/\b(ice|frozen|frost|icy|crystal)\b/.test(t)) thing.parts.forEach((p) => { if (p.color !== EYE) p.color = '#9fdcff'; });
  if (/\b(ghost|ghostly|spirit|shadow|phantom)\b/.test(t)) thing.parts.forEach((p) => { p.color = '#7a6aa8'; p.glow = true; p.opacity = 0.7; });
  return thing;
}

// turn a whole thing by `deg` degrees (clockwise), around its middle
function turn(parts, deg) {
  const co = Math.cos(deg * RAD), si = Math.sin(deg * RAD);
  return parts.map((p) => ({ ...p, offX: p.offX * co + p.offY * si, offY: -p.offX * si + p.offY * co, rotZ: (p.rotZ || 0) + deg }));
}

const layer = (p, o) => ({
  id: p.id, parName: p.parName, shape: p.shape, color: p.color, glow: !!p.glow, opacity: p.opacity ?? 1, count: p.count || 1, spread: p.spread || 'point', spreadSize: p.spreadSize || 1,
  sx: p.sx, sy: p.sy, sz: p.sz, offX: p.offX, offY: p.offY, offZ: p.offZ || 0, rotZ: p.rotZ || 0, path: p.path || 'line', pathAmp: p.pathAmp || 1.5,
  trail: !!p.trail, under: !!p.under, roll: p.roll || 0, swing: p.swing || 0, swingPhase: p.swingPhase || 0, swingBias: p.swingBias || 0, swingMode: p.swingMode || 'sin', pv: p.pv ?? null, par: p.par ?? -1, bob: p.bob || 0, spin: p.spin || 0,
  fade: 'none', grow0: 1, grow1: 1, stagger: 0, ...o,
});

// ── each thing's own attack ──────────────────────────────────────────────────────
// A thing runs (or flies) in, stops in front of the opponent and does its OWN move: the knight slashes, the wizard casts a bolt,
// the lion pounces, the eagle stoops with its talons, the dragon breathes fire, the sheep rams... acts = key poses
// [fraction of the special, degrees] added to a joint; lunge / lift = the whole thing jumps forward / up [fraction, metres];
// fx = glowing effects placed relative to the opponent (E: dx metres forwards of where the thing stands, D back from the opponent).
const effects = (D) => (p, dx, y, o = {}) => layer(p, { fromA: 'opponent', fromDx: -D + dx, fromDy: y - 1.2, toA: 'opponent', toDx: -D + dx, toDy: y - 1.2, fade: 'inout', glow: true, ...o });
const userFx = (p, dx, y, o = {}) => layer(p, { fromA: 'ground_user', fromDx: dx, fromDy: y - 0.1, toA: 'ground_user', toDx: dx, toDy: y - 0.1, fade: 'inout', glow: true, ...o });
const impact = (E, dx, y, c, t0, t1) => [
  E(P('ring', c, 2.4, 2.4, 0.2), dx, y, { start: t0, end: t1, grow0: 0.3, grow1: 1.3 }),
  E(P('crystal', '#fff2a0', 0.18, 0.34, 0.06, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.9 }), dx, y, { start: t0 + 0.02, end: t1 + 0.1, stagger: 0.3, slideX: 0.6, spin: 3 }),
];
const dust = (E, dx, t0, t1, c = '#d8c8a8', w = 1.8) => E(P('flat', c, w, 1, w, 0, 0, 0, { opacity: 0.55 }), dx, 0.06, { start: t0, end: t1, glow: false, grow0: 0.3, grow1: 1.6, fade: 'out' });
const rocks = (E, dx, t0, t1, c = '#8a7a62', n = 8) => E(P('crystal', c, 0.22, 0.3, 0.2, 0, 0, 0, { count: n, spread: 'cloud', spreadSize: 1.0 }), dx, 0.3, { start: t0, end: t1, glow: false, slideY: 1.6, slideX: 0.4, stagger: 0.3, spin: 2 });
// sound / roar rings that grow outward from where a mouth is
const rings = (E, dx, y, c, t0, n = 3, reach = 1.4) => Array.from({ length: n }, (_, i) => E(P('ring', c, 1.4, 1.4, 0.2), dx, y, { start: t0 + i * 0.045, end: t0 + i * 0.045 + 0.12, grow0: 0.3, grow1: 1.8, slideX: reach, fade: 'out' }));
const claws = (E, dx, y, t0, t1, c = '#ffe9c0', n = 3) => E(P('crystal', c, 0.1, 0.9, 0.04, 0, 0, 0, { count: n, spread: 'line', spreadSize: 0.25, rotZ: 25 }), dx, y, { start: t0, end: t1 });
const feathers = (E, dx, y, c, t0, t1, n = 10) => E(P('crystal', c, 0.2, 0.34, 0.06, 0, 0, 0, { count: n, spread: 'cloud', spreadSize: 1.0 }), dx, y, { start: t0, end: t1, stagger: 0.3, slideY: 0.7, slideX: 0.8, spin: 3, glow: false });
const splash = (E, dx, t0, t1, big = 1) => [
  E(P('sphere', '#ffffff', 0.5 * big, 0.5 * big, 0.5 * big, 0, 0, 0, { count: 12, spread: 'cloud', spreadSize: 1.0 * big, opacity: 0.8 }), dx, 0.6, { start: t0, end: t1, stagger: 0.4, slideY: 2.0 * big, grow0: 0.4, grow1: 1.4 }),
  E(P('ring', '#bfe6ff', 3 * big, 3 * big, 0.2), dx, 0.7, { start: t0, end: t1, grow0: 0.2, grow1: 1.5 }),
];

const KNIGHT_ARMS = { uaF: [[0.46, 0], [0.55, -150], [0.6, -150], [0.66, -55], [0.78, -55], [0.9, 0]], hdF: [[0.46, 0], [0.55, 85], [0.6, 85], [0.66, 145], [0.78, 145], [0.9, 0]] };
const ATTACKS = {
  // ── people ──
  knight: () => ({ D: 1.9, hit: [0.62, 0.78], lunge: [[0.58, 0], [0.66, 0.7], [0.8, 0.7], [0.9, 0]],
    acts: { ...KNIGHT_ARMS, uaN: [[0.5, -65], [0.8, -65], [0.9, 0]], waist: [[0.55, -6], [0.66, 16], [0.8, 10], [0.9, 0]], thN: [[0.58, -24], [0.8, -24], [0.9, 0]], thF: [[0.58, 18], [0.8, 18], [0.9, 0]], head: [[0.6, -8], [0.7, 8], [0.9, 0]], cp1: [[0.6, 20], [0.8, -10], [0.9, 0]] },
    fx: (E) => impact(E, 1.5, 1.3, '#bfe6ff', 0.64, 0.76) }),
  wizard: () => ({ D: 3.4, hit: [0.76, 0.9],
    acts: { uaF: [[0.46, 0], [0.54, -132], [0.64, -132], [0.7, -92], [0.82, -92], [0.92, 0]], hdF: [[0.46, 0], [0.54, 128], [0.64, 128], [0.7, 160], [0.82, 160], [0.92, 0]], uaN: [[0.46, 0], [0.56, -110], [0.7, -80], [0.92, 0]], faN: [[0.5, -20], [0.7, -40], [0.92, 0]],
      head: [[0.55, -12], [0.7, 6], [0.92, 0]], waist: [[0.55, -8], [0.7, 10], [0.92, 0]], cp1: [[0.55, 22], [0.75, -6], [0.92, 0]] },
    fx: (E) => [
      E(P('flat', '#a06bff', 2.8, 1, 2.8, 0, 0, 0, { opacity: 0.7 }), 0, 0.06, { start: 0.44, end: 0.93, spin: 2, grow0: 0.3, grow1: 1 }),
      E(P('ring', '#d9b8ff', 2.0, 2.0, 0.2), 0.2, 1.3, { start: 0.46, end: 0.7, spin: 1.5, grow0: 0.3, grow1: 1.2 }),
      E(P('sphere', '#c9a0ff', 0.7, 0.7, 0.7), 0.4, 2.9, { start: 0.5, end: 0.7, grow0: 0.1, grow1: 1.4 }),
      E(P('sphere', '#d9b8ff', 0.55, 0.55, 0.55, 0, 0, 0, { trail: true }), 1.3, 1.9, { start: 0.68, end: 0.8, slideX: 2.1, fade: 'in' }), E(P('sphere', '#ffffff', 0.3, 0.3, 0.3), 1.3, 1.9, { start: 0.68, end: 0.8, slideX: 2.1, fade: 'in' }),
      E(P('sphere', '#f0d8ff', 0.4, 0.4, 0.4, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 1.2 }), 3.2, 1.3, { start: 0.78, end: 0.93, stagger: 0.3, grow0: 0.3, grow1: 1.6 }), ...impact(E, 3.3, 1.3, '#e0c0ff', 0.78, 0.9)] }),
  ninja: () => ({ D: 2.6, hit: [0.64, 0.82],
    acts: { uaF: [[0.46, 0], [0.52, -140], [0.56, -95], [0.6, -140], [0.64, -95], [0.68, -140], [0.72, -95], [0.8, 0], [0.9, 0]], uaN: [[0.5, -20], [0.8, -30], [0.92, 0]], waist: [[0.5, -14], [0.6, 12], [0.7, -8], [0.8, 12], [0.92, 0]], thN: [[0.5, -20], [0.8, -20], [0.92, 0]], thF: [[0.5, 16], [0.8, 16], [0.92, 0]] },
    fx: (E) => [[0.54, 0.66], [0.62, 0.74], [0.7, 0.82]].map(([a, b]) => E(P('crystal', '#d0d6de', 0.5, 0.5, 0.06), 0.9, 1.55, { start: a, end: b, slideX: 1.7, spin: 5, glow: false, fade: 'none' })).concat(impact(E, 2.6, 1.3, '#dfe6ee', 0.66, 0.84)) }),
  viking: () => ({ D: 1.9, hit: [0.68, 0.82], lunge: [[0.62, 0], [0.7, 0.5], [0.84, 0.5], [0.92, 0]],
    acts: { uaF: [[0.46, 0], [0.56, -160], [0.62, -160], [0.68, -50], [0.8, -50], [0.92, 0]], hdF: [[0.46, 0], [0.56, 80], [0.62, 80], [0.68, 130], [0.8, 130], [0.92, 0]], uaN: [[0.5, -80], [0.8, -80], [0.92, 0]], waist: [[0.56, -14], [0.68, 22], [0.82, 12], [0.92, 0]], head: [[0.56, -14], [0.68, 10], [0.92, 0]], thN: [[0.6, -26], [0.82, -26], [0.92, 0]] },
    fx: (E) => [dust(E, 1.9, 0.68, 0.86, '#c9a06a', 2.4), rocks(E, 1.9, 0.68, 0.86), ...impact(E, 1.7, 1.2, '#ffe0b0', 0.7, 0.8)] }),
  robot: () => ({ D: 4.2, hit: [0.6, 0.8],
    acts: { uaF: [[0.46, 0], [0.52, -92], [0.84, -92], [0.92, 0]], faF: [[0.5, 32], [0.84, 32], [0.92, 0]], waist: [[0.58, -6], [0.62, -2], [0.92, 0]], head: [[0.56, -6], [0.8, -6], [0.92, 0]] },
    fx: (E) => [E(P('cylinder', '#ff3b3b', 0.16, 3.4, 0.16, 0, 0, 0, { rotZ: 90 }), 2.5, 1.72, { start: 0.58, end: 0.8 }), E(P('cylinder', '#ffffff', 0.06, 3.4, 0.06, 0, 0, 0, { rotZ: 90 }), 2.5, 1.72, { start: 0.58, end: 0.8 }),
      E(P('sphere', '#ffb0a0', 0.5, 0.5, 0.5), 0.9, 1.72, { start: 0.56, end: 0.66, grow0: 0.3, grow1: 1.3 }), ...impact(E, 4.2, 1.7, '#ff8a70', 0.6, 0.8)] }),
  skeleton: () => ({ D: 1.9, hit: [0.58, 0.8], lunge: [[0.52, 0], [0.6, 0.5], [0.8, 0.5], [0.9, 0]],
    acts: { uaF: [[0.46, 0], [0.52, -150], [0.56, -150], [0.6, -55], [0.64, -55], [0.68, -150], [0.72, -55], [0.8, -55], [0.9, 0]], hdF: [[0.46, 0], [0.52, 85], [0.56, 85], [0.6, 145], [0.64, 145], [0.68, 85], [0.72, 145], [0.8, 145], [0.9, 0]], uaN: [[0.5, -40], [0.8, -40], [0.9, 0]],
      jaw: [[0.5, 0], [0.54, 22], [0.58, 0], [0.62, 22], [0.66, 0], [0.7, 22], [0.74, 0]], head: [[0.5, -6], [0.56, 8], [0.62, -6], [0.68, 8], [0.74, 0]], waist: [[0.52, -8], [0.6, 12], [0.7, 8], [0.9, 0]], thN: [[0.56, -18], [0.8, -18], [0.9, 0]] },
    fx: (E) => [...impact(E, 1.5, 1.3, '#d8f0b8', 0.6, 0.7), ...impact(E, 1.5, 1.2, '#d8f0b8', 0.7, 0.8), E(P('sphere', '#9aff8a', 0.3, 0.3, 0.3, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.9 }), 0.4, 2.0, { start: 0.5, end: 0.8, stagger: 0.5, slideY: 1.0 })] }),
  zombie: () => ({ D: 1.8, hit: [0.62, 0.82], lunge: [[0.54, 0], [0.64, 0.9], [0.82, 0.9], [0.92, 0]],
    acts: { waist: [[0.5, 18], [0.62, 38], [0.8, 28], [0.92, 0]], head: [[0.6, 25], [0.8, 10], [0.92, 0]], uaN: [[0.5, 0], [0.62, -15], [0.8, -8], [0.92, 0]], uaF: [[0.5, 0], [0.62, -15], [0.8, -8], [0.92, 0]], thN: [[0.56, -16], [0.8, -16], [0.92, 0]] },
    fx: (E) => [E(P('sphere', '#b8e04a', 0.26, 0.26, 0.26, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.7 }), 1.5, 1.4, { start: 0.64, end: 0.86, stagger: 0.4, slideX: 0.5, slideY: -0.3 }), ...impact(E, 1.7, 1.3, '#b8e04a', 0.64, 0.78)] }),
  giant: () => ({ D: 3.0, hit: [0.68, 0.84],
    acts: { uaF: [[0.46, 0], [0.56, -175], [0.62, -175], [0.7, -30], [0.82, -30], [0.92, 0]], uaN: [[0.46, 0], [0.56, -175], [0.62, -175], [0.7, -30], [0.82, -30], [0.92, 0]], waist: [[0.56, -18], [0.7, 32], [0.82, 20], [0.92, 0]], head: [[0.56, -14], [0.7, 14], [0.92, 0]] },
    fx: (E) => [dust(E, 2.6, 0.68, 0.9, '#c8b890', 4.5), rocks(E, 2.6, 0.7, 0.9, '#8a7a62', 12), ...impact(E, 2.5, 0.8, '#ffe0b0', 0.7, 0.84)] }),
  golem: () => ({ D: 2.6, hit: [0.64, 0.82], lunge: [[0.58, 0], [0.66, 0.5], [0.8, 0.5], [0.9, 0]],
    acts: { uaF: [[0.46, 0], [0.54, 70], [0.6, 70], [0.66, -95], [0.78, -95], [0.9, 0]], waist: [[0.54, -10], [0.66, 22], [0.8, 12], [0.92, 0]], uaN: [[0.5, -30], [0.8, -30], [0.92, 0]] },
    fx: (E) => [rocks(E, 2.0, 0.66, 0.86, '#8a8f98', 10), dust(E, 2.2, 0.66, 0.86, '#9a9a9a', 3), ...impact(E, 2.4, 1.6, '#ff8a2a', 0.66, 0.8)] }),
  person: () => ({ D: 1.6, hit: [0.54, 0.78],
    acts: { uaF: [[0.5, -30], [0.54, -95], [0.6, -30], [0.64, -95], [0.7, -30], [0.74, -95], [0.9, 0]], uaN: [[0.5, 0], [0.57, -30], [0.62, -95], [0.67, -30], [0.9, 0]], waist: [[0.5, -6], [0.6, 12], [0.7, 8], [0.9, 0]] },
    fx: (E) => impact(E, 1.4, 1.4, '#ffffff', 0.56, 0.78) }),

  // ── big cats and dogs: each hunts its own way ──
  lion: () => ({ D: 3.0, hit: [0.64, 0.8],
    acts: { jaw: [[0.44, 0], [0.5, 45], [0.56, 45], [0.6, 0], [0.66, 40], [0.72, -2], [0.8, 0]], neck: [[0.46, -14], [0.54, -14], [0.58, 16], [0.7, 12], [0.9, 0]], body: [[0.54, 18], [0.58, 22], [0.62, -14], [0.7, 6], [0.9, 0]],
      FNu: [[0.58, 0], [0.62, -95], [0.7, -95], [0.76, -10], [0.9, 0]], FFu: [[0.6, 0], [0.64, -90], [0.7, -90], [0.78, -8], [0.9, 0]], HNu: [[0.54, 10], [0.6, -20], [0.7, 0]], HFu: [[0.54, 10], [0.6, -20], [0.7, 0]], tl0: [[0.5, -30], [0.6, 30], [0.8, -10], [0.92, 0]] },
    lunge: [[0.56, 0], [0.64, 1.7], [0.76, 1.7], [0.88, 0]], lift: [[0.58, 0], [0.64, 0.8], [0.7, 0.1], [0.76, 0]],
    fx: (E) => [...rings(E, 1.5, 1.4, '#ffe9c0', 0.44), claws(E, 3.1, 1.2, 0.66, 0.78), dust(E, 2.8, 0.68, 0.86), ...impact(E, 3.3, 1.2, '#ffd9a0', 0.68, 0.8)] }),
  tiger: () => ({ D: 3.4, hit: [0.64, 0.82],
    acts: { body: [[0.48, 14], [0.56, 22], [0.62, -18], [0.72, 8], [0.9, 0]], FNu: [[0.6, 0], [0.64, -110], [0.7, -5], [0.74, -100], [0.8, -5], [0.9, 0]], FFu: [[0.62, 0], [0.66, -100], [0.72, -5], [0.78, -95], [0.84, -5], [0.9, 0]], jaw: [[0.68, 0], [0.72, 45], [0.78, -2], [0.84, 0]], neck: [[0.56, 10], [0.7, 18], [0.9, 0]], tl0: [[0.5, -25], [0.62, 25], [0.8, -15], [0.92, 0]] },
    lunge: [[0.54, 0], [0.62, 2.1], [0.78, 2.1], [0.9, 0]], lift: [[0.56, 0], [0.62, 1.1], [0.7, 0.1], [0.78, 0]],
    fx: (E) => [claws(E, 3.3, 1.3, 0.66, 0.76, '#ffb060', 4), claws(E, 3.3, 1.0, 0.72, 0.82, '#ffb060', 4), dust(E, 3.0, 0.68, 0.88), ...impact(E, 3.6, 1.2, '#ffb060', 0.7, 0.82)] }),
  wolf: () => ({ D: 2.8, hit: [0.64, 0.82],
    acts: { neck: [[0.44, -44], [0.56, -44], [0.62, 10], [0.66, 22], [0.69, -22], [0.72, 22], [0.75, -22], [0.78, 8], [0.9, 0]], jaw: [[0.44, 0], [0.5, 40], [0.56, 40], [0.6, 0], [0.62, 38], [0.78, 38], [0.82, 0]], body: [[0.5, -10], [0.56, -10], [0.62, 12], [0.8, 4], [0.9, 0]], tl0: [[0.5, -20], [0.7, 20], [0.9, 0]] },
    lunge: [[0.58, 0], [0.64, 1.3], [0.8, 1.3], [0.9, 0]], lift: [[0.58, 0], [0.62, 0.5], [0.68, 0], [0.7, 0]],
    fx: (E) => [...rings(E, 1.5, 2.4, '#cfe0ff', 0.44, 3, 0.6), dust(E, 2.4, 0.64, 0.86), ...impact(E, 2.8, 1.0, '#ffd9a0', 0.66, 0.8)] }),
  dog: () => ({ D: 2.6, hit: [0.62, 0.8],
    acts: { jaw: [[0.46, 0], [0.5, 35], [0.54, 0], [0.58, 35], [0.62, 0], [0.66, 30], [0.8, 30], [0.84, 0]], neck: [[0.66, 16], [0.69, -20], [0.72, 20], [0.75, -20], [0.78, 6], [0.9, 0]], tl0: [[0.4, 35], [0.46, -35], [0.52, 35], [0.58, -35], [0.64, 35], [0.7, -35], [0.9, 0]], body: [[0.46, -8], [0.5, 6], [0.54, -8], [0.58, 6], [0.64, 12], [0.9, 0]] },
    lunge: [[0.6, 0], [0.66, 1.4], [0.82, 1.4], [0.92, 0]], lift: [[0.6, 0], [0.64, 0.3], [0.7, 0]],
    fx: (E) => [...rings(E, 1.0, 0.8, '#ffffff', 0.46, 2, 0.8), dust(E, 2.3, 0.66, 0.86), ...impact(E, 2.6, 0.7, '#ffd9a0', 0.68, 0.8)] }),
  fox: () => ({ D: 3.0, hit: [0.66, 0.82],
    acts: { body: [[0.46, -8], [0.5, 8], [0.54, -8], [0.58, 8], [0.62, -18], [0.68, 42], [0.76, 10], [0.9, 0]], jaw: [[0.68, 0], [0.72, 40], [0.76, -2], [0.8, 0]], tl0: [[0.46, 25], [0.52, -25], [0.58, 25], [0.64, -25], [0.7, 25], [0.9, 0]], FNu: [[0.7, 0], [0.74, -50], [0.8, 0]] },
    lunge: [[0.58, 0], [0.66, 2.0], [0.8, 2.0], [0.9, 0]], lift: [[0.6, 0], [0.66, 1.4], [0.72, 0.1], [0.78, 0]],
    fx: (E) => [dust(E, 2.8, 0.7, 0.88), E(P('crystal', '#fff2d8', 0.12, 0.2, 0.05, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.7 }), 3.2, 0.7, { start: 0.7, end: 0.86, stagger: 0.4, slideY: 0.8, spin: 3 }), ...impact(E, 3.3, 0.7, '#ffd9a0', 0.7, 0.82)] }),
  cat: () => ({ D: 2.4, hit: [0.6, 0.8],
    acts: { jaw: [[0.44, 0], [0.5, 45], [0.58, 45], [0.62, 0]], body: [[0.46, -10], [0.56, -12], [0.6, 8], [0.8, 0], [0.9, 0]], FNu: [[0.58, 0], [0.6, -95], [0.63, -10], [0.66, -95], [0.69, -10], [0.72, -95], [0.75, -10], [0.8, 0]], FFu: [[0.6, 0], [0.62, -95], [0.65, -10], [0.68, -95], [0.71, -10], [0.74, -95], [0.77, -10], [0.82, 0]], tl0: [[0.46, 20], [0.56, -20], [0.66, 20], [0.8, 0]] },
    lunge: [[0.56, 0], [0.62, 0.7], [0.82, 0.7], [0.9, 0]],
    fx: (E) => [...rings(E, 1.0, 0.7, '#ffffff', 0.46, 2, 0.5), claws(E, 2.0, 0.9, 0.6, 0.68, '#ffffff', 4), claws(E, 2.0, 0.7, 0.68, 0.76, '#ffffff', 4), claws(E, 2.0, 0.8, 0.74, 0.82, '#ffffff', 4), ...impact(E, 2.3, 0.8, '#ffffff', 0.66, 0.8)] }),
  bear: () => ({ D: 2.8, hit: [0.68, 0.84],
    acts: { body: [[0.46, 0], [0.54, -48], [0.64, -48], [0.72, 12], [0.82, 0]], FNu: [[0.5, 0], [0.56, -125], [0.64, -125], [0.72, -10], [0.82, 0]], FFu: [[0.5, 0], [0.56, -125], [0.64, -125], [0.72, -10], [0.82, 0]], jaw: [[0.54, 0], [0.58, 45], [0.66, 45], [0.72, 0]], neck: [[0.56, -10], [0.72, 15], [0.9, 0]] },
    lunge: [[0.62, 0], [0.72, 0.8], [0.86, 0]],
    fx: (E) => [...rings(E, 1.2, 2.2, '#ffe9c0', 0.54, 3), dust(E, 2.2, 0.7, 0.9, '#c8b890', 3.6), rocks(E, 2.3, 0.72, 0.9, '#8a7a62', 10), ...impact(E, 2.4, 0.8, '#ffe0b0', 0.72, 0.86)] }),

  // ── hooved animals ──
  horse: () => ({ D: 2.2, hit: [0.64, 0.82], lunge: [[0.6, 0], [0.7, 0.5], [0.84, 0]],
    acts: { body: [[0.46, 0], [0.56, -34], [0.64, -34], [0.7, 6], [0.82, 0], [0.92, 0]], FNu: [[0.5, 0], [0.58, -100], [0.64, -100], [0.7, -20], [0.76, -95], [0.82, -5], [0.9, 0]], FFu: [[0.52, 0], [0.6, -92], [0.66, -92], [0.72, -15], [0.78, -90], [0.84, -5], [0.9, 0]], neck: [[0.56, -22], [0.66, 18], [0.9, 0]], HNu: [[0.56, 6], [0.7, 6], [0.8, 0]], HFu: [[0.56, 6], [0.7, 6], [0.8, 0]], tl0: [[0.5, -20], [0.64, 20], [0.8, 0]] },
    fx: (E) => [...rings(E, 1.6, 2.0, '#ffffff', 0.54, 2, 0.8), dust(E, 1.4, 0.68, 0.86, '#d8c8a8', 2.2), rocks(E, 1.5, 0.7, 0.86, '#9a8a6a', 6), ...impact(E, 1.7, 1.0, '#ffe9c0', 0.7, 0.8)] }),
  unicorn: () => ({ D: 3.4, hit: [0.66, 0.82],
    acts: { neck: [[0.5, 0], [0.56, 34], [0.8, 34], [0.9, 0]], head: [[0.56, 12], [0.8, 12], [0.9, 0]], body: [[0.5, -6], [0.56, 8], [0.8, 4], [0.9, 0]], tl0: [[0.5, -20], [0.7, 20], [0.9, 0]] },
    lunge: [[0.58, 0], [0.66, 2.2], [0.8, 2.2], [0.9, 0]],
    fx: (E) => ['#ff3b3b', '#ff9a1a', '#ffe36a', '#5ad86a', '#4aa8ff', '#6a5aff', '#c05aff'].map((c, i) => E(P('cylinder', c, 0.1, 3.0, 0.1, 0, 0, 0, { rotZ: 90 }), 3.4, 1.05 + i * 0.06, { start: 0.66, end: 0.8 }))
      .concat([E(P('crystal', '#ff9bf0', 0.16, 0.28, 0.06, 0, 0, 0, { count: 12, spread: 'cloud', spreadSize: 1.2 }), 4.2, 1.2, { start: 0.7, end: 0.92, stagger: 0.4, slideY: 0.8, spin: 3 }), ...impact(E, 3.4, 1.2, '#ffe0f8', 0.68, 0.82)]) }),
  deer: () => ({ D: 2.8, hit: [0.64, 0.82],
    acts: { neck: [[0.05, 22], [0.5, 22], [0.58, 34], [0.7, -50], [0.84, -20], [0.92, 0]], head: [[0.58, 10], [0.7, -20], [0.92, 0]], FNu: [[0.44, 0], [0.48, -45], [0.52, 0], [0.56, -45], [0.6, 0]], body: [[0.58, 6], [0.7, -8], [0.92, 0]] },
    lunge: [[0.58, 0], [0.66, 1.8], [0.8, 1.8], [0.9, 0]], lift: [[0.66, 0], [0.7, 0.4], [0.76, 0]],
    fx: (E) => [dust(E, 2.5, 0.68, 0.88, '#b8a888', 2.2), E(P('crystal', '#7ac84a', 0.18, 0.3, 0.06, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 1.0 }), 2.7, 1.2, { start: 0.7, end: 0.88, stagger: 0.4, slideY: 0.8, spin: 3, glow: false }), ...impact(E, 2.8, 1.2, '#ffe0b0', 0.7, 0.82)] }),
  camel: () => ({ D: 3.4, hit: [0.74, 0.9],
    acts: { neck: [[0.44, 0], [0.52, -40], [0.58, -40], [0.64, 28], [0.7, 10], [0.9, 0]], head: [[0.5, -15], [0.64, 20], [0.9, 0]], body: [[0.52, -4], [0.64, 4], [0.9, 0]] },
    fx: (E) => [E(P('sphere', '#e0f0a0', 0.5, 0.6, 0.5, 0, 0, 0, { trail: true, opacity: 0.9 }), 2.0, 2.2, { start: 0.64, end: 0.78, slideX: 1.2, path: 'arc', pathAmp: 0.8, glow: false, fade: 'none' }), ...splash(E, 3.4, 0.76, 0.92, 0.5).map((l) => ({ ...l, color: '#d8f080' })), ...impact(E, 3.4, 1.2, '#e0f0a0', 0.78, 0.9)] }),
  giraffe: () => ({ D: 3.4, hit: [0.68, 0.84], lunge: [[0.62, 0], [0.7, 0.4], [0.84, 0]],
    acts: { neck: [[0.46, 0], [0.56, -75], [0.62, -75], [0.68, 45], [0.82, 10], [0.92, 0]], head: [[0.56, -20], [0.68, 25], [0.92, 0]], body: [[0.56, -8], [0.68, 8], [0.92, 0]], tl0: [[0.5, -20], [0.7, 20], [0.9, 0]] },
    fx: (E) => [dust(E, 2.8, 0.68, 0.88, '#c8b890', 3), rocks(E, 2.8, 0.7, 0.88), ...impact(E, 3.0, 0.9, '#ffe0b0', 0.7, 0.84)] }),

  // ── horned and head-butting animals ──
  bull: () => ({ D: 3.4, hit: [0.66, 0.84],
    acts: { FNu: [[0.44, 0], [0.47, -55], [0.5, 0], [0.53, -55], [0.56, 0], [0.59, -55], [0.62, 0]], neck: [[0.05, 26], [0.62, 28], [0.7, -50], [0.82, -20], [0.92, 0]], head: [[0.56, 10], [0.7, -20], [0.92, 0]], body: [[0.56, 6], [0.7, -10], [0.92, 0]], tl0: [[0.5, -20], [0.7, 20], [0.9, 0]] },
    lunge: [[0.62, 0], [0.72, 2.0], [0.86, 2.0], [0.92, 0]],
    fx: (E) => [E(P('sphere', '#ffffff', 0.3, 0.3, 0.3, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.4, opacity: 0.7 }), 1.8, 0.9, { start: 0.46, end: 0.62, stagger: 0.5, slideX: 0.8, slideY: 0.3, glow: false }), dust(E, 2.6, 0.7, 0.9, '#c8b890', 2.6), rocks(E, 2.9, 0.72, 0.9), ...impact(E, 3.2, 1.0, '#ffe0b0', 0.72, 0.84)] }),
  rhino: () => ({ D: 4.0, hit: [0.68, 0.86],
    acts: { FNu: [[0.44, 0], [0.5, -50], [0.56, 0], [0.62, -50], [0.66, 0]], neck: [[0.05, 14], [0.66, 20], [0.74, -60], [0.86, -20], [0.92, 0]], head: [[0.6, 10], [0.74, -25], [0.92, 0]], body: [[0.6, 6], [0.74, -12], [0.92, 0]] },
    lunge: [[0.64, 0], [0.74, 2.6], [0.88, 2.6], [0.94, 0]],
    fx: (E) => [dust(E, 3.0, 0.68, 0.92, '#b8a888', 4), rocks(E, 3.4, 0.72, 0.92, '#8a8478', 12), E(P('ring', '#e8dcc0', 3, 3, 0.2), 3.4, 0.2, { start: 0.72, end: 0.88, grow0: 0.3, grow1: 2.2, fade: 'out' }), ...impact(E, 3.8, 1.0, '#ffe0b0', 0.74, 0.86)] }),
  cow: () => ({ D: 2.6, hit: [0.66, 0.82],
    acts: { neck: [[0.5, 0], [0.6, 24], [0.68, -25], [0.8, 0], [0.9, 0]], head: [[0.6, 8], [0.68, -12], [0.9, 0]], tl0: [[0.46, 30], [0.52, -30], [0.58, 30], [0.64, -30], [0.7, 30], [0.9, 0]] },
    lunge: [[0.6, 0], [0.68, 0.9], [0.82, 0.9], [0.92, 0]],
    fx: (E) => [...rings(E, 1.6, 1.2, '#ffffff', 0.46, 3, 0.8), dust(E, 2.4, 0.68, 0.86), E(P('crystal', '#fff2a0', 0.16, 0.24, 0.06, 0, 0, 0, { count: 6, spread: 'ring', spreadSize: 0.5 }), 2.8, 1.5, { start: 0.7, end: 0.86, stagger: 0.2, spin: 4 }), ...impact(E, 2.8, 1.0, '#ffffff', 0.68, 0.8)] }),
  pig: () => ({ D: 2.4, hit: [0.62, 0.8],
    acts: { neck: [[0.5, 0], [0.58, 14]], head: [[0.5, 14], [0.6, 22], [0.7, -16], [0.8, 0]], body: [[0.56, 8], [0.68, -6], [0.9, 0]], tl0: [[0.46, 40], [0.52, -40], [0.58, 40], [0.64, -40], [0.9, 0]] },
    lunge: [[0.56, 0], [0.64, 1.5], [0.82, 1.5], [0.92, 0]],
    fx: (E) => [...rings(E, 0.9, 0.8, '#ffc0d0', 0.46, 3, 0.6), E(P('sphere', '#6a4a2a', 0.3, 0.2, 0.3, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 0.9 }), 2.3, 0.4, { start: 0.64, end: 0.84, stagger: 0.4, slideY: 1.0, glow: false }), dust(E, 2.2, 0.64, 0.84, '#8a6a4a', 2), ...impact(E, 2.4, 0.6, '#ffd0d8', 0.66, 0.78)] }),
  sheep: () => ({ D: 3.4, hit: [0.64, 0.82],
    acts: { neck: [[0.52, 28], [0.7, 28], [0.76, -10], [0.9, 0]], head: [[0.52, 12], [0.7, 12], [0.8, 0]], body: [[0.46, -10], [0.52, -10], [0.64, 12], [0.8, 0]] },
    lunge: [[0.46, 0], [0.52, -1.0], [0.58, -1.0], [0.64, 2.6], [0.76, 2.6], [0.9, 0]],
    fx: (E) => [E(P('ring', '#ffffff', 3.4, 3.4, 0.2), 3.1, 1.0, { start: 0.64, end: 0.76, grow0: 0.2, grow1: 1.6 }), dust(E, 2.6, 0.64, 0.84), E(P('crystal', '#ffe36a', 0.18, 0.3, 0.06, 0, 0, 0, { count: 10, spread: 'ring', spreadSize: 0.7 }), 3.1, 1.6, { start: 0.66, end: 0.86, stagger: 0.2, spin: 5 }), ...impact(E, 3.2, 1.0, '#ffffff', 0.66, 0.78)] }),
  turtle: () => ({ D: 2.0, hit: [0.6, 0.8],
    acts: { jaw: [[0.5, 0], [0.56, 42], [0.6, -4], [0.66, 42], [0.7, 0]], head: [[0.5, -8], [0.62, 10], [0.7, 0]], body: [[0.5, -4], [0.62, 6], [0.8, 0]] },
    lunge: [[0.54, 0], [0.62, 0.7], [0.8, 0.7], [0.9, 0]],
    fx: (E) => [dust(E, 1.6, 0.58, 0.82, '#b8a888', 1.6), E(P('crystal', '#ffffff', 0.12, 0.2, 0.04, 0, 0, 0, { count: 5, spread: 'cloud', spreadSize: 0.4 }), 0.2, 0.6, { start: 0.52, end: 0.7, stagger: 0.4, spin: 4 }), ...impact(E, 2.0, 0.6, '#ffffff', 0.62, 0.78)] }),
  elephant: () => ({ D: 3.2, hit: [0.68, 0.86], lunge: [[0.66, 0], [0.74, 0.5], [0.86, 0]],
    acts: { trunk0: [[0.44, 0], [0.5, -120], [0.58, -120], [0.64, -95], [0.7, 55], [0.82, 10], [0.92, 0]], trunk1: [[0.5, 0], [0.56, -40], [0.7, 40], [0.92, 0]], body: [[0.5, -16], [0.64, -16], [0.72, 8], [0.92, 0]], FNu: [[0.74, 0], [0.78, -55], [0.84, 0]], FFu: [[0.78, 0], [0.82, -55], [0.88, 0]] },
    fx: (E) => [...rings(E, 2.6, 3.2, '#e8e0f0', 0.5, 4, 0.8), dust(E, 2.5, 0.7, 0.92, '#c8b890', 3.8), rocks(E, 2.5, 0.72, 0.92, '#8a7a62', 10), ...impact(E, 2.9, 1.0, '#ffe0b0', 0.72, 0.84)] }),

  // ── reptiles ──
  crocodile: () => ({ D: 2.8, hit: [0.6, 0.82],
    acts: { jaw: [[0.54, 0], [0.58, 45], [0.62, -5], [0.66, 45], [0.7, -5], [0.74, 45], [0.78, 0]], head: [[0.6, -10], [0.64, 28], [0.68, -28], [0.72, 28], [0.76, -28], [0.8, 0]], body: [[0.62, -8], [0.66, 8], [0.7, -8], [0.74, 8], [0.8, 0]], tl0: [[0.5, -30], [0.6, 30], [0.7, -30], [0.8, 25], [0.92, 0]], tl1: [[0.5, 20], [0.6, -20], [0.7, 20], [0.92, 0]] },
    lunge: [[0.54, 0], [0.6, 1.4], [0.8, 1.4], [0.9, 0]],
    fx: (E) => [...splash(E, 2.6, 0.62, 0.86, 0.6), dust(E, 2.4, 0.58, 0.84, '#b8a878', 2.6), ...impact(E, 2.9, 0.7, '#ffe0b0', 0.6, 0.78)] }),
  lizard: () => ({ D: 3.0, hit: [0.6, 0.82],
    acts: { jaw: [[0.62, 0], [0.66, 40], [0.7, -3], [0.76, 0]], head: [[0.56, -6], [0.66, 8], [0.8, 0]], tl0: [[0.5, -30], [0.62, 30], [0.74, -30], [0.86, 20], [0.92, 0]], tl1: [[0.5, 20], [0.62, -20], [0.74, 20], [0.92, 0]] },
    lunge: [[0.6, 0], [0.68, 1.0], [0.8, 1.0], [0.9, 0]],
    fx: (E) => [E(P('cone', '#e8607a', 0.1, 1.5, 0.1, 0, 0, 0, { rotZ: 90 }), 1.7, 0.35, { start: 0.54, end: 0.66, slideX: 0.9, grow0: 0.3, grow1: 1.2, glow: false, fade: 'none' }), dust(E, 2.8, 0.66, 0.86, '#b8a878', 2), ...impact(E, 3.0, 0.5, '#ffe0b0', 0.64, 0.8)] }),
  snake: () => ({ D: 3.0, hit: [0.62, 0.8],
    acts: { head: [[0.5, -34], [0.6, -34], [0.64, 32], [0.7, -10], [0.78, 0]], sg0: [[0.5, -26], [0.6, -26], [0.64, 22], [0.74, 0]], sg1: [[0.5, -20], [0.6, -20], [0.64, 14], [0.76, 0]] },
    lunge: [[0.6, 0], [0.66, 1.8], [0.78, 1.8], [0.88, 0]],
    fx: (E) => [E(P('sphere', '#9aff3a', 0.4, 0.4, 0.4, 0, 0, 0, { trail: true }), 1.2, 0.8, { start: 0.56, end: 0.64, slideX: 1.0, fade: 'in' }), E(P('crystal', '#ffffff', 0.05, 0.2, 0.05, 0, 0, 0, { count: 2, spread: 'line', spreadSize: 0.1 }), 3.2, 0.7, { start: 0.64, end: 0.7 }), E(P('sphere', '#c8ff7a', 0.5, 0.5, 0.5, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.8 }), 3.0, 0.9, { start: 0.66, end: 0.88, stagger: 0.3 })] }),
  dragon: (thing) => {
    const k = thing.ctx, mx = k.cx + k.hd * 0.75, my = k.hy - 0.1 + 1.3, D = 4.8, Lf = D - mx + 0.8;
    return { D, hover: 1.3, cruise: 2.6, hit: [0.62, 0.86],
      acts: { neck: [[0.44, 0], [0.52, -38], [0.6, -38], [0.66, 12], [0.84, 8], [0.92, 0]], head: [[0.52, -14], [0.66, 12], [0.92, 0]], jaw: [[0.54, 0], [0.62, 38], [0.84, 38], [0.9, 0]], body: [[0.5, -10], [0.6, -10], [0.9, 0]],
        wa0: [[0.44, 0], [0.52, -30], [0.6, 25], [0.7, -25], [0.8, 20], [0.92, 0]], wa1: [[0.44, 0], [0.52, -30], [0.6, 25], [0.7, -25], [0.8, 20], [0.92, 0]], wb0: [[0.5, -20], [0.6, 20], [0.7, -20], [0.92, 0]], wb1: [[0.5, -20], [0.6, 20], [0.7, -20], [0.92, 0]], tl0: [[0.6, 20], [0.8, -20], [0.92, 0]] },
      fx: (E) => [
        E(P('sphere', '#ff3b1a', 0.9, 0.9, 0.9, 0, 0, 0, { count: 9, spread: 'cloud', spreadSize: 0.3, opacity: 0.65 }), mx, my, { start: 0.58, end: 0.88, stagger: 0.6, slideX: Lf, grow0: 0.4, grow1: 1.9 }),
        E(P('sphere', '#ff9a1a', 0.6, 0.6, 0.6, 0, 0, 0, { count: 9, spread: 'cloud', spreadSize: 0.25 }), mx, my, { start: 0.58, end: 0.88, stagger: 0.6, slideX: Lf, grow0: 0.4, grow1: 1.6 }),
        E(P('sphere', '#ffe36a', 0.4, 0.4, 0.4, 0, 0, 0, { count: 7, spread: 'cloud', spreadSize: 0.2 }), mx, my, { start: 0.58, end: 0.88, stagger: 0.6, slideX: Lf * 0.9, grow0: 0.4, grow1: 1.4 }),
        E(P('flat', '#ff6a1a', 2.6, 1, 2.6, 0, 0, 0, { opacity: 0.6 }), D, 0.06, { start: 0.66, end: 0.95, grow0: 0.3, grow1: 1.4 }),
        E(P('crystal', '#ffd23f', 0.14, 0.2, 0.05, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 1.2 }), D, 0.8, { start: 0.68, end: 0.95, slideY: 2.2, stagger: 0.4, spin: 2 })] };
  },
  dino: () => ({ D: 3.2, hit: [0.62, 0.84],
    acts: { neck: [[0.46, 0], [0.54, -35], [0.6, -35], [0.68, 28], [0.78, 6], [0.92, 0]], jaw: [[0.54, 0], [0.6, 42], [0.66, -6], [0.72, 42], [0.78, -6], [0.84, 0]], body: [[0.54, -8], [0.68, 10], [0.92, 0]], tl0: [[0.5, -20], [0.65, 25], [0.92, 0]], head: [[0.54, -10], [0.68, 10], [0.92, 0]] },
    fx: (E) => [...rings(E, 1.6, 2.6, '#e8f0d0', 0.54, 3, 1.0), dust(E, 2.4, 0.66, 0.86, '#c8b890', 3), ...impact(E, 3.0, 1.2, '#ffe0b0', 0.68, 0.82)] }),

  // ── sea animals leap in ──
  whale: () => ({ D: 4.5, hit: [0.64, 0.86],
    acts: { b1: [[0.44, -18], [0.56, -18], [0.64, 30], [0.72, 0]], fl0: [[0.7, -40], [0.76, 45], [0.84, 0]], fl1: [[0.7, -40], [0.76, 45], [0.84, 0]] },
    lift: [[0.44, 0], [0.56, 3.4], [0.66, 0.2], [0.72, 0]], lunge: [[0.44, 0], [0.66, 3.0], [0.82, 3.0], [0.9, 0]],
    fx: (E) => [...splash(E, 4.4, 0.64, 0.88, 2), ...splash(E, 3.6, 0.66, 0.9, 1.4), ...impact(E, 4.6, 1.0, '#bfe6ff', 0.66, 0.84)] }),
  orca: () => ({ D: 3.6, hit: [0.62, 0.82],
    acts: { b1: [[0.5, -14], [0.58, -14], [0.64, 24], [0.74, 0]], jaw: [[0.58, 0], [0.64, 38], [0.7, -2], [0.76, 38], [0.82, 0]], fl0: [[0.7, -30], [0.76, 35], [0.84, 0]], fl1: [[0.7, -30], [0.76, 35], [0.84, 0]] },
    lunge: [[0.5, 0], [0.6, 2.8], [0.8, 2.8], [0.9, 0]], lift: [[0.52, 0], [0.58, 1.4], [0.66, 0.1], [0.7, 0]],
    fx: (E) => [...splash(E, 3.4, 0.62, 0.86, 1.1), ...impact(E, 3.7, 1.0, '#e0f0ff', 0.64, 0.8)] }),
  dolphin: () => ({ D: 3.0, hit: [0.62, 0.8],
    acts: { b1: [[0.5, -10], [0.58, -10], [0.64, 20], [0.74, 0]], fl0: [[0.7, -35], [0.76, 40], [0.84, 0]], fl1: [[0.7, -35], [0.76, 40], [0.84, 0]], pec0: [[0.5, 20], [0.6, -20], [0.7, 20], [0.8, 0]] },
    lunge: [[0.56, 0], [0.64, 2.0], [0.8, 2.0], [0.9, 0]], lift: [[0.56, 0], [0.62, 1.3], [0.7, 0.1], [0.74, 0]],
    fx: (E) => [...rings(E, 1.4, 0.9, '#cfeaff', 0.42, 4, 1.4), ...splash(E, 2.8, 0.64, 0.86, 0.8), ...impact(E, 3.0, 1.0, '#e0f0ff', 0.64, 0.8)] }),
  shark: () => ({ D: 3.0, hit: [0.6, 0.82],
    acts: { jaw: [[0.58, 0], [0.62, 40], [0.66, -2], [0.7, 40], [0.74, -2], [0.78, 40], [0.82, 0]], b1: [[0.64, -8], [0.68, 8], [0.72, -8], [0.76, 8], [0.8, 0]], b2: [[0.64, 8], [0.68, -8], [0.72, 8], [0.76, -8], [0.8, 0]], fl0: [[0.6, -25], [0.68, 25], [0.76, -25], [0.84, 0]], fl1: [[0.6, -25], [0.68, 25], [0.76, -25], [0.84, 0]] },
    lunge: [[0.54, 0], [0.6, 1.6], [0.8, 1.6], [0.9, 0]], lift: [[0.56, 0], [0.6, 0.5], [0.66, 0]],
    fx: (E) => [...splash(E, 2.8, 0.6, 0.86, 1), ...impact(E, 3.0, 0.9, '#ffffff', 0.62, 0.8)] }),
  fish: () => ({ D: 2.2, hit: [0.56, 0.78],
    acts: { fl0: [[0.5, -60], [0.56, 60], [0.62, -60], [0.68, 60], [0.74, 0]], fl1: [[0.5, -60], [0.56, 60], [0.62, -60], [0.68, 60], [0.74, 0]], b1: [[0.5, -8], [0.56, 8], [0.62, -8], [0.68, 8], [0.74, 0]] },
    lunge: [[0.5, 0], [0.58, 0.8], [0.78, 0.8], [0.9, 0]], lift: [[0.52, 0], [0.58, 0.5], [0.66, 0]],
    fx: (E) => [...splash(E, 2.0, 0.56, 0.8, 0.6), E(P('sphere', '#bfe6ff', 0.2, 0.2, 0.2, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 0.8, opacity: 0.6 }), 1.4, 0.9, { start: 0.5, end: 0.8, stagger: 0.5, slideY: 1.0 })] }),

  // ── birds: each one hunts differently ──
  eagle: () => ({ D: 3.6, hit: [0.6, 0.76],
    acts: { body: [[0.5, -8], [0.56, 40], [0.66, 40], [0.76, -15], [0.9, 0]], legN: [[0.52, 0], [0.6, -90], [0.7, -90], [0.8, 0]], legF: [[0.52, 0], [0.6, -90], [0.7, -90], [0.8, 0]], wuN: [[0.5, 0], [0.56, -28], [0.68, -28], [0.78, 0]], wuF: [[0.5, 0], [0.56, -28], [0.68, -28], [0.78, 0]], head: [[0.5, 15], [0.6, -10], [0.8, 0]] },
    lunge: [[0.54, 0], [0.66, 2.8], [0.78, 2.8], [0.9, 0]], lift: [[0.46, 1.0], [0.54, 1.0], [0.64, -0.4], [0.74, 0.5], [0.9, 0]],
    fx: (E) => [claws(E, 3.6, 1.2, 0.62, 0.72, '#f2e0a0', 4), feathers(E, 3.6, 1.2, '#9a7a52', 0.64, 0.84), ...impact(E, 3.8, 1.0, '#fff2d0', 0.64, 0.76)] }),
  hawk: () => ({ D: 3.0, hit: [0.56, 0.7],
    acts: { body: [[0.5, 10], [0.6, 28], [0.8, 10], [0.9, 0]], legN: [[0.52, 0], [0.56, -85], [0.6, 0], [0.64, -85], [0.68, 0]], legF: [[0.52, 0], [0.56, -85], [0.6, 0], [0.64, -85], [0.68, 0]], head: [[0.5, 10], [0.6, -8], [0.8, 0]] },
    lunge: [[0.5, 0], [0.6, 2.2], [0.84, 2.2], [0.92, 0]], lift: [[0.46, 0.5], [0.52, -0.5], [0.7, -0.5], [0.78, 0.4], [0.9, 0]],
    fx: (E) => [claws(E, 3.2, 1.0, 0.56, 0.62, '#ffe9c0', 3), claws(E, 3.2, 0.9, 0.64, 0.7, '#ffe9c0', 3), feathers(E, 3.2, 1.0, '#b08a60', 0.6, 0.8, 8), ...impact(E, 3.3, 0.9, '#ffe9c0', 0.58, 0.7)] }),
  vulture: () => ({ D: 3.8, hit: [0.74, 0.88],
    acts: { body: [[0.6, 0], [0.7, 30], [0.84, 10], [0.92, 0]], head: [[0.74, 35], [0.78, -10], [0.82, 35], [0.86, -10], [0.9, 0]], n0: [[0.74, 25], [0.78, -8], [0.82, 25], [0.86, -8]], legN: [[0.66, 0], [0.72, -80], [0.84, -80], [0.9, 0]], legF: [[0.66, 0], [0.72, -80], [0.84, -80], [0.9, 0]] },
    lunge: [[0.62, 0], [0.74, 2.6], [0.88, 2.6]], lift: [[0.44, 1.6], [0.6, 1.6], [0.7, -0.2], [0.82, 0.8], [0.92, 0]],
    fx: (E) => [feathers(E, 3.8, 1.2, '#3a2a22', 0.74, 0.9, 12), dust(E, 3.4, 0.74, 0.9, '#7a6a5a', 2), ...impact(E, 3.8, 1.0, '#8a6a5a', 0.76, 0.88)] }),
  owl: () => ({ D: 2.6, hit: [0.68, 0.84],
    acts: { legN: [[0.64, 0], [0.7, -90], [0.8, -90], [0.88, 0]], legF: [[0.64, 0], [0.7, -90], [0.8, -90], [0.88, 0]], body: [[0.62, 0], [0.68, 24], [0.82, 6], [0.9, 0]], wuN: [[0.46, 0], [0.54, -22], [0.64, 0]], wuF: [[0.46, 0], [0.54, -22], [0.64, 0]] },
    lunge: [[0.62, 0], [0.7, 1.6], [0.82, 1.6], [0.92, 0]], lift: [[0.64, 0], [0.7, -0.3], [0.84, 0]],
    fx: (E) => [E(P('sphere', '#ffe36a', 0.5, 0.5, 0.5), 0.9, 1.9, { start: 0.48, end: 0.6, grow0: 0.3, grow1: 1.5 }), ...rings(E, 1.2, 1.8, '#ffe36a', 0.48, 3, 1.3), feathers(E, 2.5, 1.2, '#c8b08a', 0.7, 0.86, 8), ...impact(E, 2.7, 1.0, '#fff2a0', 0.7, 0.82)] }),
  crow: () => ({ D: 1.8, hit: [0.52, 0.76],
    acts: { head: [[0.5, 34], [0.54, -8], [0.58, 34], [0.62, -8], [0.66, 34], [0.7, -8], [0.74, 0]], n0: [[0.5, 24], [0.54, -6], [0.58, 24], [0.62, -6], [0.66, 24], [0.7, -6], [0.74, 0]], body: [[0.5, 14], [0.56, -4], [0.62, 14], [0.68, -4], [0.74, 0]] },
    lunge: [[0.5, 0], [0.7, 0.5], [0.86, 0]],
    fx: (E) => [...rings(E, 1.0, 1.8, '#d8d8e0', 0.44, 2, 0.5), feathers(E, 1.6, 1.0, '#1c1c24', 0.52, 0.78, 12), ...impact(E, 1.8, 1.0, '#c0c0d0', 0.54, 0.74)] }),
  bat: () => ({ D: 2.2, hit: [0.64, 0.8],
    acts: { head: [[0.62, 22], [0.66, -10], [0.7, 22], [0.74, -6], [0.8, 0]], n0: [[0.62, 14], [0.7, -6], [0.8, 0]], body: [[0.58, 10], [0.66, 20], [0.8, 0]] },
    lunge: [[0.58, 0], [0.68, 1.2], [0.86, 0]], lift: [[0.46, 0.3], [0.52, -0.3], [0.58, 0.4], [0.64, -0.4], [0.7, 0.2], [0.8, 0]],
    fx: (E) => [...rings(E, 1.0, 2.0, '#ff9ad8', 0.42, 4, 1.4), ...impact(E, 2.2, 1.6, '#c8a0ff', 0.66, 0.8)] }),
  parrot: () => ({ D: 2.0, hit: [0.64, 0.82],
    acts: { wuN: [[0.5, 0], [0.56, -35], [0.7, -35], [0.8, 0]], wuF: [[0.5, 0], [0.56, -35], [0.7, -35], [0.8, 0]], woN: [[0.52, 0], [0.58, -20], [0.7, -20], [0.8, 0]], woF: [[0.52, 0], [0.58, -20], [0.7, -20], [0.8, 0]], head: [[0.5, -15], [0.56, 20], [0.66, -10], [0.72, 24], [0.8, 0]], body: [[0.56, -10], [0.7, 8], [0.8, 0]] },
    lunge: [[0.62, 0], [0.7, 0.8], [0.86, 0]],
    fx: (E) => [E(P('ring', '#ff3b3b', 1.4, 1.4, 0.2), 1.0, 1.8, { start: 0.5, end: 0.62, grow0: 0.3, grow1: 1.8, slideX: 1.0, fade: 'out' }), E(P('ring', '#2f6fd8', 1.4, 1.4, 0.2), 1.0, 1.8, { start: 0.55, end: 0.67, grow0: 0.3, grow1: 1.8, slideX: 1.0, fade: 'out' }), E(P('ring', '#f2c230', 1.4, 1.4, 0.2), 1.0, 1.8, { start: 0.6, end: 0.72, grow0: 0.3, grow1: 1.8, slideX: 1.0, fade: 'out' }),
      feathers(E, 2.0, 1.4, '#ff5a4a', 0.66, 0.86, 8), feathers(E, 2.0, 1.4, '#4a90f0', 0.68, 0.88, 8), ...impact(E, 2.2, 1.4, '#ffe36a', 0.68, 0.8)] }),
  toucan: () => ({ D: 2.6, hit: [0.66, 0.82],
    acts: { n0: [[0.5, -35], [0.6, -35], [0.66, 45], [0.74, 0]], head: [[0.5, -20], [0.6, -20], [0.66, 40], [0.74, 0]], body: [[0.56, -10], [0.66, 14], [0.8, 0]] },
    lunge: [[0.6, 0], [0.68, 1.4], [0.84, 0]],
    fx: (E) => [E(P('ring', '#ff8a2a', 2.2, 2.2, 0.2), 2.5, 1.4, { start: 0.66, end: 0.78, grow0: 0.2, grow1: 1.5 }), ...['#ff3b3b', '#ffe36a', '#4aa8ff', '#5ad86a'].map((c, i) => E(P('crystal', c, 0.16, 0.3, 0.06, 0, 0, 0, { count: 6, spread: 'cloud', spreadSize: 0.8 }), 2.6, 1.4, { start: 0.66 + i * 0.01, end: 0.86, stagger: 0.4, slideY: 0.8, spin: 4 })), ...impact(E, 2.8, 1.4, '#ffd9a0', 0.68, 0.8)] }),
  seagull: () => ({ D: 3.0, hit: [0.68, 0.84],
    acts: { body: [[0.5, -10], [0.58, 8], [0.7, -4], [0.8, 0]], head: [[0.5, -10], [0.6, 10], [0.8, 0]], legN: [[0.6, 0], [0.64, 30], [0.76, 0]], legF: [[0.6, 0], [0.64, 30], [0.76, 0]] },
    lunge: [[0.44, 0], [0.58, 2.4], [0.74, 2.4], [0.9, 0]], lift: [[0.44, 0], [0.54, 0.6], [0.72, 0.4], [0.9, 0]],
    fx: (E) => [...rings(E, 1.2, 1.8, '#ffffff', 0.44, 2, 0.8), E(P('sphere', '#f4f4f0', 0.35, 0.5, 0.35), 2.4, 2.9, { start: 0.56, end: 0.7, slideY: -2.0, glow: false, fade: 'none' }), ...splash(E, 3.0, 0.68, 0.84, 0.4).map((l) => ({ ...l, color: '#f8f8f4' })), ...impact(E, 3.0, 1.2, '#ffffff', 0.68, 0.8)] }),
  swan: () => ({ D: 1.8, hit: [0.56, 0.74],
    acts: { wuN: [[0.5, 0], [0.54, -45], [0.6, 20], [0.64, -45], [0.68, 20], [0.72, -45], [0.8, 0]], wuF: [[0.52, 0], [0.56, -45], [0.62, 20], [0.66, -45], [0.7, 20], [0.74, -45], [0.82, 0]], n0: [[0.54, -20], [0.62, 25], [0.7, -10], [0.8, 0]], n1: [[0.54, 20], [0.62, -35], [0.7, 10], [0.8, 0]], body: [[0.5, -6], [0.62, 8], [0.8, 0]] },
    lunge: [[0.54, 0], [0.62, 0.5], [0.8, 0.5], [0.9, 0]],
    fx: (E) => [...rings(E, 1.4, 1.8, '#ffffff', 0.46, 3, 0.8), feathers(E, 1.5, 1.4, '#ffffff', 0.54, 0.8, 14), ...impact(E, 1.8, 1.2, '#ffffff', 0.58, 0.74)] }),
  chicken: () => ({ D: 1.3, hit: [0.52, 0.8],
    acts: { n0: [[0.5, 40], [0.53, -6], [0.56, 40], [0.59, -6], [0.62, 40], [0.65, -6], [0.68, 40], [0.71, -6], [0.74, 40], [0.77, -6], [0.8, 0]], head: [[0.5, 30], [0.53, -4], [0.56, 30], [0.59, -4], [0.62, 30], [0.65, -4], [0.68, 30], [0.71, -4], [0.74, 30], [0.77, -4], [0.8, 0]], body: [[0.5, 10], [0.56, -2], [0.62, 10], [0.68, -2], [0.74, 10], [0.8, 0]],
      wuN: [[0.5, -20], [0.54, 25], [0.58, -20], [0.62, 25], [0.66, -20], [0.7, 25], [0.74, -20], [0.78, 25], [0.84, 0]], wuF: [[0.5, 25], [0.54, -20], [0.58, 25], [0.62, -20], [0.66, 25], [0.7, -20], [0.74, 25], [0.78, -20], [0.84, 0]] },
    fx: (E) => [...rings(E, 0.8, 1.0, '#ffe9c0', 0.44, 2, 0.5), feathers(E, 1.2, 0.8, '#c0501c', 0.52, 0.82, 12), feathers(E, 1.2, 0.8, '#ffffff', 0.54, 0.84, 8), dust(E, 1.1, 0.5, 0.82, '#c8b890', 1.4), ...impact(E, 1.4, 0.5, '#ffe9c0', 0.56, 0.78)] }),
  phoenix: () => ({ D: 4.0, hit: [0.64, 0.84],
    acts: { body: [[0.5, -8], [0.58, 30], [0.68, 30], [0.78, -12], [0.9, 0]], wuN: [[0.44, 0], [0.5, -25], [0.56, 20], [0.62, -25], [0.7, 20], [0.8, 0]], wuF: [[0.44, 0], [0.5, -25], [0.56, 20], [0.62, -25], [0.7, 20], [0.8, 0]], legN: [[0.56, 0], [0.64, -80], [0.76, 0]], legF: [[0.56, 0], [0.64, -80], [0.76, 0]] },
    lunge: [[0.56, 0], [0.68, 3.2], [0.8, 3.2], [0.92, 0]], lift: [[0.46, 1.2], [0.56, 1.2], [0.66, -0.3], [0.78, 1.0], [0.9, 0]],
    fx: (E, C) => [
      C(P('sphere', '#ff9a1a', 0.7, 0.7, 0.7, 0, 0, 0, { count: 10, spread: 'point', opacity: 0.7 }), { start: 0, end: 1, stagger: 0.6, fade: 'inout', glow: true }),
      E(P('sphere', '#ff3b1a', 0.9, 0.9, 0.9, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 1.0, opacity: 0.7 }), 4.0, 1.0, { start: 0.66, end: 0.9, stagger: 0.5, slideY: 2.4, grow0: 0.4, grow1: 1.8 }),
      E(P('sphere', '#ffd23f', 0.5, 0.5, 0.5, 0, 0, 0, { count: 8, spread: 'cloud', spreadSize: 0.8 }), 4.0, 1.0, { start: 0.66, end: 0.9, stagger: 0.5, slideY: 2.4 }),
      E(P('flat', '#ff6a1a', 3, 1, 3, 0, 0, 0, { opacity: 0.6 }), 4.0, 0.06, { start: 0.68, end: 0.95, grow0: 0.3, grow1: 1.4 }), ...impact(E, 4.0, 1.0, '#ffb02a', 0.66, 0.82)] }),
  bird: () => ({ D: 1.8, hit: [0.52, 0.76],
    acts: { head: [[0.5, 30], [0.54, -6], [0.58, 30], [0.62, -6], [0.66, 30], [0.7, -6], [0.74, 0]], body: [[0.5, 12], [0.58, -3], [0.66, 12], [0.74, 0]] },
    lunge: [[0.5, 0], [0.66, 0.5], [0.84, 0]],
    fx: (E) => [feathers(E, 1.6, 1.0, '#4a90d8', 0.52, 0.78, 8), ...impact(E, 1.8, 1.0, '#ffffff', 0.54, 0.74)] }),
};

// ── underground things: they travel below the floor (only a moving mound shows), burst up under the opponent, fight, and sink back ──
const mound = (C, big = 1) => [[0, 0.5], [0.88, 1]].flatMap(([a, b]) => [
  C(P('sphere', '#6a4a2a', 1.1 * big, 0.4 * big, 0.9 * big, 0, 0.12, 0, { count: 4, spread: 'line', spreadSize: 0.8 * big }), { start: a, end: b, glow: false, fade: 'none', chr: false }),
  C(P('sphere', '#a08868', 0.6 * big, 0.4 * big, 0.6 * big, 0, 0.3, 0, { count: 6, spread: 'cloud', spreadSize: 0.9 * big, opacity: 0.5 }), { start: a, end: b, glow: false, stagger: 0.6, fade: 'none', chr: false }),
]);
const burrow = (deep) => [[0, -deep], [0.4, -deep], [0.5, 0], [0.84, 0], [0.92, -deep], [1, -deep]];
const erupt = (E, dx, big = 1) => [rocks(E, dx, 0.44, 0.64, '#6a4a2a', 12), dust(E, dx, 0.46, 0.7, '#a08868', 3 * big), E(P('flat', '#3a2a1a', 2.2 * big, 1, 2.2 * big, 0, 0, 0, { opacity: 0.7 }), dx, 0.05, { start: 0.46, end: 0.96, glow: false, fade: 'inout' }), ...impact(E, dx, 0.8, '#d8c8a8', 0.46, 0.58)];
ATTACKS.mole = () => ({ D: 1.4, hit: [0.6, 0.74], lift: burrow(2.6), lunge: [[0.52, 0], [0.6, 0.8], [0.78, 0.8], [0.88, 0]],
  acts: { armN: [[0.52, 0], [0.58, -80], [0.62, 30], [0.68, -80], [0.72, 30], [0.8, 0]], armF: [[0.55, 0], [0.61, -80], [0.65, 30], [0.71, -80], [0.75, 30], [0.82, 0]], head: [[0.52, -12], [0.6, 16], [0.7, -8], [0.8, 0]], body: [[0.5, -10], [0.6, 8], [0.8, 0]] },
  fx: (E, C) => [...mound(C), ...erupt(E, 0), dust(E, 1.2, 0.6, 0.8, '#a08868', 2), ...impact(E, 1.4, 0.7, '#ffd9d0', 0.6, 0.74)] });
ATTACKS.sandworm = () => ({ D: 3.8, frames: 110, hit: [0.7, 0.7], lift: burrow(7.5),
  acts: { sw0: [[0.56, 0], [0.68, 16], [0.8, 16], [0.9, 0]], ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => ['sw' + i, [[0.56, 0], [0.68, 26], [0.8, 26], [0.9, 0]]])), petalN: [[0.6, 0], [0.68, -25], [0.78, -25], [0.86, 0]], petalF: [[0.6, 0], [0.68, 25], [0.78, 25], [0.86, 0]] },
  fx: (E, C) => [...mound(C, 2.2), ...erupt(E, 0, 2), dust(E, 3.8, 0.66, 0.9, '#c8b890', 5), rocks(E, 3.8, 0.68, 0.9, '#8a7a62', 14), ...impact(E, 3.8, 0.9, '#d8c8a8', 0.68, 0.8)] });
ATTACKS.drill = () => ({ D: 1.4, hit: [0.58, 0.72], lift: burrow(2.6),
  fx: (E, C) => [...mound(C, 1.3), ...erupt(E, 0, 1.3), E(P('crystal', '#ffd23f', 0.14, 0.24, 0.05, 0, 0, 0, { count: 12, spread: 'cloud', spreadSize: 1.0 }), 1.4, 0.8, { start: 0.5, end: 0.72, stagger: 0.4, slideY: 1.4, spin: 4 }), ...impact(E, 1.5, 0.8, '#ffd23f', 0.58, 0.72)] });

// ── vehicles: the player drives them (carried along) and runs the opponent over; the tank stops far off and shoots, the plane strafes and bombs ──
const crash = (E, c = '#ffe0b0', big = 1) => [dust(E, 0, 0.6, 0.84, '#c8b890', 3 * big), rocks(E, 0.2, 0.62, 0.86, '#8a7a62', 8), ...impact(E, 0, 1.0, c, 0.6, 0.76)];
const trail = (U, n = 10, c = '#d8c8a8') => U(P('sphere', c, 0.7, 0.45, 0.7, 0, 0, 0, { count: n, spread: 'point', opacity: 0.5 }), -1.6, 0.3, { start: 0.12, end: 0.78, stagger: 0.8, slideX: -3.2, slideY: 0.3, glow: false, grow0: 0.3, grow1: 1.6 });
const DRIVES = {
  car: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [trail(U), U(P('sphere', '#ffb02a', 0.35, 0.25, 0.25, 0, 0, 0, { count: 4, spread: 'point' }), -1.5, 0.45, { start: 0.12, end: 0.7, stagger: 0.8, slideX: -1.5 }), ...crash(E)] }),
  truck: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [trail(U, 12, '#b8a888'), ...crash(E, '#ffd9a0', 1.4), E(P('ring', '#ffe0b0', 3.4, 3.4, 0.2), 0, 0.3, { start: 0.62, end: 0.8, grow0: 0.2, grow1: 2 })] }),
  bus: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [trail(U, 12), ...rings(U, 2.2, 1.4, '#ffe36a', 0.14, 3, 1.6), ...crash(E, '#ffe36a', 1.4)] }),
  train: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [U(P('sphere', '#f0f0f0', 0.9, 0.9, 0.9, 0, 0, 0, { count: 12, spread: 'point', opacity: 0.7 }), 3.0, 3.1, { start: 0.1, end: 0.8, stagger: 0.8, slideX: -2.5, slideY: 1.4, glow: false, grow0: 0.4, grow1: 1.8 }), trail(U, 10, '#9a9a9a'), ...rings(U, 4.4, 1.3, '#ffffff', 0.14, 3, 1.6), ...crash(E, '#ffd9a0', 1.6)] }),
  motorcycle: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [trail(U, 8), U(P('sphere', '#ffb02a', 0.3, 0.2, 0.2, 0, 0, 0, { count: 4 }), -0.7, 0.35, { start: 0.12, end: 0.7, stagger: 0.8, slideX: -1.4 }), ...crash(E, '#ffe0b0', 0.8)] }),
  boat: () => ({ hit: [0.64, 0.64], hits: 1, fx: (E, U) => [U(P('sphere', '#ffffff', 0.7, 0.4, 0.7, 0, 0, 0, { count: 10, spread: 'point', opacity: 0.7 }), -1.6, 0.6, { start: 0.1, end: 0.8, stagger: 0.8, slideX: -3, glow: false, grow0: 0.4, grow1: 1.6 }), ...splash(E, 0, 0.6, 0.86, 1.6), ...impact(E, 0, 1.0, '#bfe6ff', 0.6, 0.78)] }),
  tank: () => ({ frames: 110, hit: [0.78, 0.94], hits: 3,
    acts: { barrel: [[0.72, 0], [0.74, -10], [0.78, 0], [0.8, -10], [0.84, 0], [0.88, -10], [0.92, 0]] }, lunge: [[0.72, 0], [0.74, -0.3], [0.78, 0], [0.8, -0.3], [0.84, 0], [0.88, -0.3], [0.92, 0]],
    fx: (E, U) => [0.72, 0.8, 0.88].flatMap((t) => [
      U(P('sphere', '#ffb02a', 0.9, 0.7, 0.7), 2.5, 1.3, { start: t, end: t + 0.07, grow0: 0.3, grow1: 1.5 }), U(P('sphere', '#d8d8d8', 0.6, 0.6, 0.6, 0, 0, 0, { count: 5, spread: 'cloud', spreadSize: 0.4, opacity: 0.6 }), 2.8, 1.3, { start: t + 0.01, end: t + 0.12, stagger: 0.3, slideX: 1.0, slideY: 0.4, glow: false }),
      U(P('cylinder', '#ffd27a', 0.16, 0.6, 0.16, 0, 0, 0, { rotZ: 90 }), 2.3, 1.3, { start: t, end: t + 0.08, slideX: 3.5, fade: 'none' }),
      E(P('sphere', '#ff6a1a', 1.2, 1.2, 1.2, 0, 0, 0, { count: 6, spread: 'cloud', spreadSize: 0.8, opacity: 0.8 }), 0, 1.0, { start: t + 0.07, end: t + 0.16, stagger: 0.3, slideY: 1.4, grow0: 0.3, grow1: 1.6 }),
      E(P('ring', '#ffd23f', 3, 3, 0.2), 0, 1.0, { start: t + 0.07, end: t + 0.15, grow0: 0.2, grow1: 1.8 }), E(P('flat', '#c8b890', 2.4, 1, 2.4, 0, 0, 0, { opacity: 0.55 }), 0, 0.06, { start: t + 0.07, end: t + 0.2, glow: false, grow0: 0.3, grow1: 1.6, fade: 'out' }), rocks(E, 0, t + 0.07, t + 0.18, '#6a5a42', 6)]) }),
  // ── flying vehicles: they climb, fly over the opponent (passU) and on past them ──
  plane: () => ({ frames: 110, passU: 0.45, carryAfter: 6, rideRamp: 0.3, hit: [0.4, 0.5], hits: 2, lift: [[0.02, 0], [0.32, 2.4], [0.87, 2.4], [0.97, 0]],
    fx: (E, U) => [
      U(P('cylinder', '#ffe36a', 0.08, 0.5, 0.08, 0, 0, 0, { count: 14, spread: 'point', rotZ: 62 }), 2.7, 3.9, { start: 0.3, end: 0.44, stagger: 0.8, slideX: 3.5, slideY: -3.4, fade: 'none' }), U(P('sphere', '#ffb02a', 0.3, 0.3, 0.3), 2.8, 3.9, { start: 0.3, end: 0.44, grow0: 0.5, grow1: 1.2 }),
      E(P('sphere', '#ffe36a', 0.4, 0.3, 0.3, 0, 0, 0, { count: 8, spread: 'line', spreadSize: 1.4 }), 0, 0.2, { start: 0.34, end: 0.46, stagger: 0.7 }),
      E(P('sphere', '#26262c', 0.7, 0.7, 0.7), 0, 3.9, { start: 0.39, end: 0.5, slideY: -3.7, glow: false, fade: 'none' }), E(P('cone', '#d8322a', 0.3, 0.4, 0.3), 0, 4.4, { start: 0.39, end: 0.5, slideY: -3.7, glow: false, fade: 'none' }),
      E(P('sphere', '#ff6a1a', 1.5, 1.5, 1.5, 0, 0, 0, { count: 10, spread: 'cloud', spreadSize: 1.2, opacity: 0.8 }), 0, 1.0, { start: 0.5, end: 0.64, stagger: 0.3, slideY: 1.8, grow0: 0.3, grow1: 1.8 }),
      E(P('ring', '#ffd23f', 4, 4, 0.2), 0, 1.0, { start: 0.5, end: 0.62, grow0: 0.2, grow1: 2 }), E(P('flat', '#ff6a1a', 3, 1, 3, 0, 0, 0, { opacity: 0.6 }), 0, 0.06, { start: 0.5, end: 0.66, grow0: 0.3, grow1: 1.8 }), rocks(E, 0, 0.5, 0.64, '#6a5a42', 10)] }),
  helicopter: () => ({ frames: 110, rideRamp: 0.25, hit: [0.6, 0.8], hits: 3, lift: [[0.02, 0], [0.27, 2.6], [0.9, 2.6], [0.97, 0]],
    fx: (E, U) => [
      U(P('cylinder', '#ffe36a', 0.08, 0.5, 0.08, 0, 0, 0, { count: 18, spread: 'point', rotZ: 62 }), 1.3, 3.9, { start: 0.5, end: 0.8, stagger: 0.9, slideX: 4.6, slideY: -3.8, fade: 'none' }), U(P('sphere', '#ffb02a', 0.3, 0.3, 0.3), 1.4, 3.9, { start: 0.5, end: 0.8, grow0: 0.5, grow1: 1.2 }),
      ...[[0.58, 0.7], [0.7, 0.82]].flatMap(([a, b]) => [U(P('cylinder', '#cfd4da', 0.16, 0.8, 0.16, 0, 0, 0, { rotZ: 75 }), 1.0, 3.6, { start: a, end: b, slideX: 4.0, slideY: -3.0, fade: 'none', glow: false }), U(P('sphere', '#ffb02a', 0.4, 0.3, 0.3, 0, 0, 0, { trail: true }), 0.7, 3.65, { start: a, end: b, slideX: 4.0, slideY: -3.0, fade: 'none' })]),
      ...[[0.7, 0.8], [0.8, 0.9]].flatMap(([a, b]) => [E(P('sphere', '#ff6a1a', 1.2, 1.2, 1.2, 0, 0, 0, { count: 6, spread: 'cloud', spreadSize: 0.8, opacity: 0.8 }), 0, 1.0, { start: a, end: b, stagger: 0.3, slideY: 1.4, grow0: 0.3, grow1: 1.6 }), E(P('ring', '#ffd23f', 3, 3, 0.2), 0, 1.0, { start: a, end: b, grow0: 0.2, grow1: 1.8 })]), ...impact(E, 0, 1.0, '#ffd23f', 0.6, 0.72)] }),
  ufo: () => ({ frames: 110, rideRamp: 0.3, hit: [0.55, 0.75], hits: 2, lift: [[0.02, 0], [0.32, 3.0], [0.9, 3.0], [0.97, 0]],
    fx: (E, U) => [
      E(P('cone', '#8aff9a', 2.4, 4.2, 2.4, 0, 0, 0, { opacity: 0.45 }), 0, 2.3, { start: 0.45, end: 0.9 }), E(P('cone', '#e8ffe8', 1.2, 4.0, 1.2, 0, 0, 0, { opacity: 0.4 }), 0, 2.3, { start: 0.47, end: 0.88 }),
      E(P('flat', '#8aff9a', 3, 1, 3, 0, 0, 0, { opacity: 0.6 }), 0, 0.06, { start: 0.45, end: 0.9, spin: 3 }), E(P('crystal', '#caffd0', 0.12, 0.2, 0.05, 0, 0, 0, { count: 14, spread: 'cloud', spreadSize: 0.9 }), 0, 0.6, { start: 0.48, end: 0.9, stagger: 0.8, slideY: 3.2, spin: 3 }),
      ...rings(E, 0, 3.8, '#8aff9a', 0.5, 4, 0), ...impact(E, 0, 1.2, '#8aff9a', 0.55, 0.66), ...impact(E, 0, 1.2, '#8aff9a', 0.75, 0.86)] }),
  submarine: () => ({ frames: 110, hit: [0.8, 0.9], hits: 2,
    fx: (E, U) => [[0.72, 0.84], [0.8, 0.92]].flatMap(([a, b]) => [U(P('cylinder', '#cfd4da', 0.2, 0.9, 0.2, 0, 0, 0, { rotZ: 90 }), 3.2, 0.5, { start: a, end: b, slideX: 2.9, fade: 'none', glow: false }), U(P('sphere', '#ffffff', 0.3, 0.3, 0.3, 0, 0, 0, { count: 8, spread: 'point', opacity: 0.6 }), 2.6, 0.5, { start: a, end: b, stagger: 0.8, slideX: 2.2, glow: false, fade: 'none' }),
      ...splash(E, 0, b - 0.02, b + 0.1, 1.2), ...impact(E, 0, 1.0, '#e0f0ff', b - 0.02, b + 0.08)]) }),
};
const HITS = { knight: 1, wizard: 1, ninja: 3, viking: 1, robot: 3, skeleton: 2, zombie: 1, giant: 1, golem: 1, person: 3, lion: 2, tiger: 3, wolf: 2, dog: 2, fox: 1, cat: 4, bear: 2, horse: 2, unicorn: 1, deer: 1, camel: 1, giraffe: 1,
  bull: 1, rhino: 1, cow: 1, pig: 1, sheep: 1, turtle: 2, elephant: 2, crocodile: 3, lizard: 1, snake: 1, dragon: 3, dino: 2, whale: 1, orca: 2, dolphin: 1, shark: 3, fish: 2,
  mole: 2, sandworm: 1, drill: 2, eagle: 1, hawk: 2, vulture: 2, owl: 1, crow: 3, bat: 1, parrot: 1, toucan: 1, seagull: 1, swan: 3, chicken: 5, phoenix: 1, bird: 3 };
const RUN = /^(th|sh|ft|ua|fa|hd)[NF]$|^[FH][NF][ulh]$|^(leg|shin|foot)[NF]$/;

// what the words say the thing does
function verbOf(t, thing) {
  const fall = /\b(rain|rains|raining|fall|falls|falling|drops?|dropped|from (the )?(sky|above)|crash(es)? down|comes? down|stomps?|crush(es)?|squash(es)?)\b/.test(t);
  const toss = /\b(throws?|thrown|shoots?|fires?|launch(es)?|hurls?|flings?|casts?|swings?)\b/.test(t);
  if (/\b(riding|rides?|ridden|on (the )?back|mounted)\b/.test(t) && thing.back && thing.kind !== 'object') return 'ride';
  if (thing.autonomous) return 'charge';
  if (thing.drive) return fall ? 'fall' : /\b(throws?|thrown|hurls?|flings?|launch(es)?)\b/.test(t) && !/\b(drives?|driving|rides?|riding)\b/.test(t) ? 'throw' : 'drive';
  if (fall) return /\b(stomps?|crush(es)?|squash(es)?|giant)\b/.test(t) && thing.kind !== 'object' ? 'stomp' : 'fall';
  if (/\b(throws?|thrown|shoots?|fires?|launch(es)?|hurls?|flings?|casts?|fly|flies|flying|swings?)\b/.test(t) && (thing.kind === 'object' || /\b(throw|shoot|hurl|fling)/.test(t))) return 'throw';
  if (thing.kind === 'object') return /\b(rocket|arrow|spear|sword|axe|hammer)\b/.test(t) ? 'throw' : 'fall';
  return 'charge';
}

// the special's effect, for the first thing found in `piece`: { fx, size, verb, name, kind } or null
export function libraryFx(piece) {
  const t = ` ${String(piece || '').toLowerCase()} `, found = findThing(t);
  if (!found) return null;
  const thing = build(found, t), verb = verbOf(t, thing);
  thing.domain ||= thing.water ? 'water' : thing.fly ? 'air' : 'ground'; // ground things run, air things fly in from above (with a shadow), water things swim in a wave, underground things tunnel under the floor
  const big = /\b(huge|giant|massive|enormous|gigantic)\b/.test(t), small = /\b(tiny|small|little|mini)\b/.test(t);
  const k = big ? 1.8 : small ? 0.6 : 1;
  const water = thing.water || /\b(sea|ocean|water|waves?|flood(ed)?|underwater)\b/.test(t);
  const out = { frames: 80, gait: thing.gait || 0.5, carry: false, reach: 12, hitFrom: 0.3, hitTo: 0.75, layers: [] };
  let hits = 1, parts = thing.parts, size = k, path0 = { fromA: 'ground_user', toA: 'ground_opponent', toDx: 3 };
  if (verb === 'ride') {
    out.carry = true; out.rideY = Math.min(3, thing.back * k); out.hitFrom = 0.66; out.hitTo = 0.66;
    path0 = { fromA: 'ground_user', toA: 'ground_user', fromDx: 0, toDx: 0, fromDy: -0.1, toDy: -0.1 };
    out.layers = parts.map((p) => layer(p, { ...path0 }));
  } else if (verb === 'drive') {
    const dr = thing.drive, at = DRIVES[dr.key]();
    out.carry = true; out.rideY = Math.min(3, dr.rideY * k); out.carryTo = dr.carryTo; out.frames = at.frames || 80; [out.hitFrom, out.hitTo] = at.hit; hits = at.hits || 1;
    out.lift = at.lift; out.lunge = at.lunge; out.passU = at.passU ?? null; out.carryAfter = at.carryAfter ?? null; out.rideRamp = at.rideRamp ?? 0.06;
    path0 = { fromA: 'ground_user', toA: 'ground_user', fromDx: 0, toDx: 0, fromDy: -0.1, toDy: -0.1, chr: true };
    out.layers = parts.map((p) => layer(p, { ...path0, act: at.acts?.[p.id] }));
    out.layers.push(...at.fx(effects(0), userFx));
    if (thing.domain === 'air') out.layers.push(layer(P('flat', '#000000', 3.2, 1, 1.4, 0, 0.05, 0, { opacity: 0.3 }), { fromA: 'ground_user', toA: 'ground_user', fromDx: 0, toDx: 0, fromDy: -0.1, toDy: -0.1, glow: false, fade: 'none' }));
  } else if (verb === 'charge') {
    // (the anchors are at chest height: drop them to the ground, so a runner's feet are on the floor)
    const ground = thing.kind === 'object' && !thing.fly && !thing.autonomous ? 0 : -1.2, at = ATTACKS[found.key]?.(thing), D = at ? at.D : 0, stop = D > 0, air = thing.domain === 'air';
    if (at) { out.frames = at.frames || 100; [out.hitFrom, out.hitTo] = at.hit; hits = HITS[found.key] ?? 1; if (hits === 1) out.hitTo = out.hitFrom; out.lift = at.lift; out.lunge = at.lunge; if (stop) out.stopU = at.stopU ?? 0.42; }
    const cruise = at?.cruise ?? (air ? 2 : 0), hover = at?.hover ?? 0;
    path0 = { fromA: 'behind_user', fromDx: -2, fromDy: ground + cruise, toA: stop ? 'ground_opponent' : 'far_side', toDx: stop ? -D : 2, toDy: stop ? -0.1 + hover : ground, mv: stop ? out.stopU : 1, chr: true };
    if (thing.domain === 'under') parts = parts.map((p) => ({ ...p, under: true }));
    out.layers = parts.map((p) => layer(p, { ...path0, run: stop && RUN.test(p.id || ''), act: at?.acts?.[p.id], bob: thing.kind === 'person' || thing.kind === 'quad' ? 0.05 : 0 }));
    if (at) out.layers.push(...at.fx(effects(D), (p, o) => layer(p, { ...path0, fade: 'inout', glow: true, ...o })));
    if (air && stop) out.layers.push(layer(P('flat', '#000000', 1.8 * (thing.ctx?.s || 1.2), 1, 0.9 * (thing.ctx?.s || 1.2), 0, 0.05, 0, { opacity: 0.3 }), { fromA: 'behind_user', fromDx: -2, fromDy: -1.15, toA: 'ground_opponent', toDx: -D, toDy: -0.05, mv: out.stopU, glow: false, fade: 'none' }));
  } else if (verb === 'fall' || verb === 'stomp') {
    if (thing.kind === 'object' && !thing.upright) parts = turn(parts, 90);
    const many = /(rain|rains|raining|shower|volley|barrage)/.test(t) || /s$/.test(found.word); // ("swords rain down": three; "a piano falls": one)
    const n = verb === 'stomp' || thing.drive || ['anvil', 'piano', 'safe', 'fridge', 'weight', 'boot'].includes(found.key) ? 1 : thing.kind === 'object' && many ? 3 : 1;
    if (verb === 'stomp') size = Math.max(k, 1.8);
    out.frames = 90; hits = n; out.hitFrom = 0.7; out.hitTo = Math.min(0.98, 0.7 + (n - 1) * 0.14); // (it hits when it lands, once for each thing that lands)
    for (let i = 0; i < n; i++) {
      const dx = n === 1 ? 0 : (i - 1) * 2.2, s = n === 1 ? 0 : i * 0.14, base = out.layers.length;
      for (const p of parts) out.layers.push(layer(p, { par: p.par >= 0 ? p.par + base : -1, fromA: 'above_opponent', fromDx: dx, toA: 'ground_opponent', toDx: dx, toDy: -0.1, start: s, end: 0.7 + s, path: 'accel' }));
    }
  } else { // throw
    if (thing.kind !== 'object') parts = parts.map((p) => ({ ...p, offY: p.offY - 0.6 }));
    out.hitFrom = 0.65; out.hitTo = 0.65;
    out.layers = parts.map((p) => layer(p, { fromA: 'ground_user', fromDx: 1, fromDy: thing.kind === 'object' ? 1.1 : 1.3, toA: 'far_side', toDx: 0, toDy: thing.kind === 'object' ? -0.1 : 0, path: 'accel' }));
  }
  if (water) {
    out.layers.push(layer(P('flat', '#2f9fff', 9, 1, 3.5, 0, 0.55, 0, { opacity: 0.55 }), { ...path0, glow: false, path: verb === 'charge' ? 'line' : 'accel' }));
    out.layers.push(layer(P('sphere', '#bfe6ff', 0.5, 0.35, 0.5, 0, 0.7, 0.9, { count: 6, spread: 'line', spreadSize: 3 }), { ...path0, glow: false, path: 'wave', pathAmp: 0.15 }));
  }
  out.layers = out.layers.slice(0, 120);
  return { fx: out, size, verb, hits, name: found.word, kind: found.key };
}
// ── what the free builder understands (shown in the designer as a list) ──────────
const it = (name, also, say) => ({ name, also, say: say || `a ${name.toLowerCase()} charges them` });
export const LIBRARY_LIST = [
  { title: 'Land animals', note: 'They run on the ground and each attacks the way it does in the wild: lions pounce, bears rear up and smash, rams charge, giraffes swing their necks... Say "riding a ..." to ride one into them.', items: [
    it('Horse', 'pony, stallion, steed', 'riding a horse towards them'), it('Unicorn', '', 'a unicorn charges them'), it('Cow', 'cattle'), it('Bull', 'buffalo, bison'), it('Pig', 'boar, hog'), it('Sheep', 'goat, ram, lamb'),
    it('Dog', 'puppy, hound'), it('Wolf', 'werewolf, hyena'), it('Fox', ''), it('Cat', 'panther, cheetah, leopard, jaguar'), it('Lion', ''), it('Tiger', ''), it('Bear', 'panda, gorilla, ape'),
    it('Elephant', 'mammoth', 'riding an elephant towards them'), it('Rhino', 'hippo'), it('Deer', 'stag, elk, moose'), it('Giraffe', ''), it('Camel', 'llama'), it('Crocodile', 'alligator'), it('Lizard', 'gecko, iguana, raptor'), it('Turtle', 'tortoise'), it('Snake', 'serpent, cobra, python, eel'),
    it('Chicken', 'rooster, hen'), it('Swan', 'goose, duck'),
  ] },
  { title: 'Flying animals', note: 'They fly in from above, with their own shape and their own way of hunting. A shadow follows them on the ground.', items: [
    it('Eagle', 'falcon', 'an eagle dives on them'), it('Hawk', 'kite, buzzard'), it('Vulture', 'condor'), it('Owl', ''), it('Crow', 'raven, blackbird'), it('Bat', 'vampire bat'), it('Parrot', 'macaw'), it('Toucan', ''),
    it('Seagull', 'gull, dove, pigeon'), it('Phoenix', 'firebird', 'a phoenix dives on them'), it('Bird', 'sparrow, robin'),
  ] },
  { title: 'Sea animals', note: 'They leap out of a wave of water.', items: [
    it('Whale', ''), it('Orca', 'killer whale'), it('Dolphin', '', 'riding a dolphin towards them'), it('Shark', 'megalodon'), it('Fish', 'piranha, salmon'),
  ] },
  { title: 'Underground animals', note: 'They tunnel under the floor (you only see a moving mound of earth), burst up under the opponent, fight, then dig back down.', items: [
    it('Mole', 'gopher, groundhog, badger, meerkat', 'a mole digs up under them'), it('Sandworm', 'giant worm, dune worm, worm', 'a giant sandworm bursts up under them'),
  ] },
  { title: 'Monsters', note: 'The dragon flies and breathes fire from the air.', items: [
    it('Dragon', 'wyvern, drake'), it('Dinosaur', 'T-rex, tyrannosaurus'), it('Giant', 'titan, ogre, troll, cyclops'), it('Golem', 'statue'), it('Zombie', 'ghoul, mummy'), it('Skeleton', 'skull, undead'),
  ] },
  { title: 'People', note: 'They run at them and fight with their own weapon and moves.', items: [
    it('Knight', 'warrior, soldier, paladin, samurai'), it('Wizard', 'witch, mage, sorcerer, warlock'), it('Ninja', 'assassin, rogue'), it('Viking', 'barbarian'), it('Robot', 'android, cyborg, mech'), it('Person', 'man, woman, boy, girl, clown'),
  ] },
  { title: 'Land vehicles', note: 'You drive them and run the opponent over. The tank drives up and shoots.', items: [
    it('Car', 'taxi, van, jeep', 'driving a car into them'), it('Truck', 'pickup, monster truck', 'driving a monster truck over them'), it('Bus', 'school bus', 'driving a bus into them'), it('Train', 'locomotive', 'driving a train over them'),
    it('Motorcycle', 'motorbike, scooter', 'riding a motorcycle into them'), it('Tank', '', 'a tank shoots them'),
  ] },
  { title: 'Flying vehicles', note: 'You climb into the sky and fly them over the opponent. A shadow follows on the ground.', items: [
    it('Plane', 'jet, bomber, fighter plane', 'a plane bombs them'), it('Helicopter', 'chopper, gunship', 'a helicopter shoots them'), it('UFO', 'flying saucer, spaceship', 'a ufo beams them up'),
  ] },
  { title: 'Water vehicles', note: 'They ride on a wave of water.', items: [
    it('Boat', 'ship, yacht, canoe', 'a boat crashes into them'), it('Submarine', 'sub', 'a submarine torpedoes them'),
  ] },
  { title: 'Underground vehicles', note: 'It drives itself under the floor and bursts up beneath the opponent.', items: [
    it('Drill', 'digger, excavator, mining machine', 'a drill machine bursts up under them'),
  ] },
  { title: 'Weapons and heavy things', note: 'They fly at them, or fall from the sky ("... falls from the sky", "... rain down").', items: [
    it('Sword', 'katana, blade, saber', 'swords rain down from the sky'), it('Spear', 'lance, javelin, trident'), it('Arrow', 'dart, bolt'), it('Axe', 'hatchet'), it('Hammer', 'mace, club'),
    it('Anvil', '', 'an anvil falls from the sky'), it('Piano', '', 'a piano falls from the sky'), it('Safe', 'vault', 'a safe falls from the sky'), it('Fridge', 'refrigerator, freezer', 'a fridge falls from the sky'), it('Weight', 'dumbbell, barbell, kettlebell', 'a giant weight falls from the sky'), it('Boot', 'shoe, giant foot', 'a giant boot stomps them'),
    it('Rock', 'boulder, stone, meteor, asteroid', 'a giant meteor falls from the sky'), it('Bomb', 'grenade, dynamite', 'a bomb falls from the sky'), it('Rocket', 'missile, torpedo', 'a rocket flies at them'),
  ] },
  { title: 'Effects and moves', note: 'These are built into the game.', items: [
    { name: 'Fireball', also: 'orb, shuriken, rock, arrow', say: 'throw a fireball' }, { name: 'Beam', also: 'laser', say: 'a laser beam' }, { name: 'Wave', also: 'tsunami, flood, surf', say: 'riding a wave towards them' },
    { name: 'Tornado', also: 'whirlwind, twister', say: 'a tornado grabs them' }, { name: 'Fire pillar', also: 'volcano, geyser', say: 'a volcano erupts under them' }, { name: 'Sword rain', also: '', say: 'swords rain down from the sky' },
    { name: 'Stomp', also: 'giant foot', say: 'a giant foot stomps them' }, { name: 'Cage', also: 'trap, prison', say: 'a cage traps them' }, { name: 'Shadow clones', also: 'copies, army', say: 'shadow clones rush them' },
    { name: 'Earthquake', also: 'crack', say: 'an earthquake cracks the ground' }, { name: 'Teleport', also: 'blink, vanish', say: 'teleport behind them' }, { name: 'Explosion', also: 'blast, nuke, nova', say: 'a huge explosion' }, { name: 'Meteor', also: 'lightning, thunder, airstrike', say: 'lightning strikes from the sky' },
  ] },
];
