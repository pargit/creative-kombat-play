// A detailed arena as a RECIPE: a painted floor plus a list of objects (flags, poles, trees, chairs, fences,
// buildings, banners...). It is plain data, never code: the AI (or a player) writes the recipe, and this file
// is the only thing that draws it, from a fixed set of parts. Every value is checked here (sanitizeScene) on
// every device before anything is drawn, so a shared arena can only ever contain shapes, colours and short text.
//
// World: the fight happens around x -9…9, z 0. Behind the fighters is -z (far), the camera is at +z.
// Floor: a painted rectangle on the ground, 48 wide (x -24…24) and 24 deep (z -16…8), drawn on a canvas
// with x 0…100 (left to right) and y 0…100 (far to near).

import * as THREE from 'three';

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const text = (v, max) => String(v ?? '').replace(/[^\p{L}\p{N} !'?.,:&-]/gu, '').trim().slice(0, max);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export const OP_TYPES = ['rect', 'circle', 'line', 'text', 'flag', 'noise'];
export const OBJ_TYPES = ['box', 'cylinder', 'sphere', 'cone', 'tree', 'pine', 'palm', 'rock', 'bush', 'lamp', 'chair', 'bench', 'table', 'crate', 'fence', 'flagpole', 'banner', 'sign', 'stage', 'building', 'tent', 'tower', 'wall', 'dome', 'landmark'];
export const EMBLEMS = ['none', 'star_of_david', 'circle', 'cross', 'star', 'crescent'];
const MAX_OPS = 60, MAX_OBJECTS = 40, MAX_INSTANCES = 260;

export function sanitizeFlag(f) {
  if (!f || typeof f !== 'object') return null;
  const bands = (Array.isArray(f.bands) ? f.bands : []).slice(0, 9).map((b) => ({ c: hex(b?.c, '#ffffff'), w: num(b?.w, 0.1, 20, 1) }));
  if (!bands.length) return null;
  return { bands, dir: f.dir === 'v' ? 'v' : 'h', emblem: pick(f.emblem, EMBLEMS, 'none'), emblemColor: hex(f.emblemColor, '#ffffff'), emblemSize: num(f.emblemSize, 0.1, 0.9, 0.4) };
}

export function sanitizeScene(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { floorColor: raw.floorColor ? hex(raw.floorColor, '') : '', floor: [], objects: [] };
  for (const o of (Array.isArray(raw.floor) ? raw.floor : []).slice(0, MAX_OPS)) {
    if (!o || !OP_TYPES.includes(o.t)) continue;
    out.floor.push({
      t: o.t, x: num(o.x, -10, 110, 50), y: num(o.y, -10, 110, 50), w: num(o.w, 0, 120, 10), h: num(o.h, 0, 120, 10), x2: num(o.x2, -10, 110, 60), y2: num(o.y2, -10, 110, 50),
      fill: o.fill ? hex(o.fill, '') : '', stroke: o.stroke ? hex(o.stroke, '') : '', lw: num(o.lw, 0.1, 8, 0.6), s: text(o.s, 24), size: num(o.size, 1, 40, 8),
      alpha: num(o.alpha, 0.05, 1, 1), flag: sanitizeFlag(o.flag),
    });
  }
  let total = 0;
  for (const o of (Array.isArray(raw.objects) ? raw.objects : []).slice(0, MAX_OBJECTS)) {
    if (!o || !OBJ_TYPES.includes(o.t)) continue;
    const n = Math.round(num(o.n, 1, 30, 1));
    if (total + n > MAX_INSTANCES) break;
    total += n;
    out.objects.push({
      t: o.t, x: num(o.x, -90, 90, 0), z: num(o.z, -80, 12, -10), y: num(o.y, 0, 80, 0), rot: num(o.rot, -360, 360, 0), s: num(o.s, 0.2, 8, 1),
      w: num(o.w, 0.05, 80, 1), h: num(o.h, 0.05, 80, 1), d: num(o.d, 0.05, 80, 1), r: num(o.r, 0.05, 40, 0.5),
      c: hex(o.c, '#9a9a9a'), c2: hex(o.c2, '#dddddd'), n, dx: num(o.dx, -30, 30, 1), dz: num(o.dz, -30, 30, 0),
      txt: text(o.txt, 24), flag: sanitizeFlag(o.flag), windows: o.windows !== false, k: pick(o.k, LANDMARKS, 'castle'),
    });
  }
  if (!out.floor.length && !out.objects.length && !out.floorColor) return null;
  return out;
}

// ── drawing (2D canvas) ──
function canvasOf(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function star(g, cx, cy, r, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / points, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
export function drawFlag(g, x, y, w, h, f) {
  const total = f.bands.reduce((a, b) => a + b.w, 0);
  let at = 0;
  for (const b of f.bands) {
    const len = (b.w / total) * (f.dir === 'v' ? w : h);
    g.fillStyle = b.c;
    if (f.dir === 'v') g.fillRect(x + at, y, len + 0.5, h); else g.fillRect(x, y + at, w, len + 0.5);
    at += len;
  }
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * f.emblemSize / 2;
  g.strokeStyle = g.fillStyle = f.emblemColor; g.lineWidth = Math.max(1, Math.min(w, h) * 0.03);
  if (f.emblem === 'circle') { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
  else if (f.emblem === 'star') star(g, cx, cy, r);
  else if (f.emblem === 'cross') { g.fillRect(cx - r * 0.2, cy - r, r * 0.4, r * 2); g.fillRect(cx - r, cy - r * 0.2, r * 2, r * 0.4); }
  else if (f.emblem === 'crescent') { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.fillStyle = f.bands[0].c; g.beginPath(); g.arc(cx + r * 0.35, cy, r * 0.85, 0, Math.PI * 2); g.fill(); }
  else if (f.emblem === 'star_of_david') {
    for (const dir of [1, -1]) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 * dir + (i * 2 * Math.PI) / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * dir * dir); } g.closePath(); g.stroke(); }
  }
}
function paintFloor(sc) {
  return canvasOf(2048, 1024, (g, w, h) => {
    g.fillStyle = sc.floorColor || '#b9b4aa'; g.fillRect(0, 0, w, h);
    const X = (v) => (v / 100) * w, Y = (v) => (v / 100) * h;
    for (const o of sc.floor) {
      g.save(); g.globalAlpha = o.alpha; g.lineWidth = Math.max(1, (o.lw / 100) * w * 0.1);
      if (o.fill) g.fillStyle = o.fill; if (o.stroke) g.strokeStyle = o.stroke;
      if (o.t === 'rect') { if (o.fill) g.fillRect(X(o.x), Y(o.y), X(o.w), Y(o.h)); if (o.stroke) g.strokeRect(X(o.x), Y(o.y), X(o.w), Y(o.h)); }
      else if (o.t === 'circle') { g.beginPath(); g.ellipse(X(o.x), Y(o.y), X(o.w) / 2, Y(o.h) / 2, 0, 0, Math.PI * 2); if (o.fill) g.fill(); if (o.stroke) g.stroke(); }
      else if (o.t === 'line') { g.beginPath(); g.moveTo(X(o.x), Y(o.y)); g.lineTo(X(o.x2), Y(o.y2)); g.strokeStyle = o.stroke || o.fill || '#ffffff'; g.stroke(); }
      else if (o.t === 'text' && o.s) { g.font = `900 ${Math.round((o.size / 100) * h * 1.4)}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fill || '#ffffff'; g.fillText(o.s, X(o.x), Y(o.y)); }
      else if (o.t === 'flag' && o.flag) drawFlag(g, X(o.x), Y(o.y), X(o.w), Y(o.h), o.flag);
      else if (o.t === 'noise') { for (let i = 0; i < 24000; i++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = o.alpha * 0.25; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
      g.restore();
    }
  });
}
const flagTexture = (f) => canvasOf(330, 240, (g, w, h) => drawFlag(g, 0, 0, w, h, f));
const labelTexture = (s, fg, bg) => canvasOf(512, 256, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = '900 96px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, w / 2, h / 2); });

// ── building (3D) ──
const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra });
function part(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
function makeObject(o) {
  const g = new THREE.Group(), M = std(o.c), M2 = std(o.c2);
  const add = (...p) => { g.add(part(...p)); };
  switch (o.t) {
    case 'landmark': return makeLandmark(o);
    case 'box': add(new THREE.BoxGeometry(o.w, o.h, o.d), M, 0, o.h / 2, 0); break;
    case 'cylinder': add(new THREE.CylinderGeometry(o.r, o.r, o.h, 16), M, 0, o.h / 2, 0); break;
    case 'sphere': add(new THREE.SphereGeometry(o.r, 16, 12), M, 0, o.r, 0); break;
    case 'cone': add(new THREE.ConeGeometry(o.r, o.h, 16), M, 0, o.h / 2, 0); break;
    case 'tree': add(new THREE.CylinderGeometry(0.15, 0.25, o.h * 0.5, 7), std('#6b4a2e'), 0, o.h * 0.25, 0); add(new THREE.IcosahedronGeometry(o.h * 0.35, 0), M, 0, o.h * 0.65, 0); break;
    case 'pine': add(new THREE.CylinderGeometry(0.12, 0.2, o.h * 0.3, 7), std('#6b4a2e'), 0, o.h * 0.15, 0); for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(o.h * (0.3 - k * 0.07), o.h * 0.4, 8), M, 0, o.h * (0.4 + k * 0.22), 0); break;
    case 'palm': add(new THREE.CylinderGeometry(0.12, 0.2, o.h, 7), std('#9a7a52'), 0, o.h / 2, 0); for (let k = 0; k < 6; k++) { const f = part(new THREE.BoxGeometry(o.h * 0.45, 0.05, 0.4), M, Math.cos(k) * o.h * 0.2, o.h, Math.sin(k) * o.h * 0.2); f.rotation.y = -k; g.add(f); } break;
    case 'rock': { const r = part(new THREE.DodecahedronGeometry(o.r, 0), std(o.c, { flatShading: true }), 0, o.r * 0.6, 0); r.scale.y = 0.65; g.add(r); break; }
    case 'bush': add(new THREE.SphereGeometry(o.r, 10, 8), M, 0, o.r * 0.7, 0); break;
    case 'lamp': add(new THREE.CylinderGeometry(0.06, 0.08, o.h, 8), std('#3a3d42', { metalness: 0.6 }), 0, o.h / 2, 0); add(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: o.c2 }), 0, o.h, 0); break;
    case 'chair': add(new THREE.BoxGeometry(0.5, 0.05, 0.5), M, 0, 0.45, 0); add(new THREE.BoxGeometry(0.5, 0.5, 0.05), M, 0, 0.72, -0.23); for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), M2, x, 0.22, z); break;
    case 'bench': add(new THREE.BoxGeometry(o.w, 0.08, 0.5), M, 0, 0.45, 0); for (const x of [-o.w / 2 + 0.2, o.w / 2 - 0.2]) add(new THREE.BoxGeometry(0.08, 0.45, 0.45), M2, x, 0.22, 0); break;
    case 'table': add(new THREE.BoxGeometry(o.w, 0.08, o.d), M, 0, 0.75, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6), M2, x * (o.w / 2 - 0.1), 0.37, z * (o.d / 2 - 0.1)); break;
    case 'crate': add(new THREE.BoxGeometry(0.9, 0.9, 0.9), M, 0, 0.45, 0); break;
    case 'fence': for (let i = 0; i <= Math.round(o.w); i++) add(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), M2, -o.w / 2 + (i * o.w) / Math.round(o.w), 0.75, 0); for (const y of [0.5, 1.1]) add(new THREE.BoxGeometry(o.w, 0.05, 0.05), M, 0, y, 0); break;
    case 'flagpole': {
      add(new THREE.CylinderGeometry(0.05, 0.07, o.h, 8), std('#d0d4d8', { metalness: 0.6, roughness: 0.4 }), 0, o.h / 2, 0);
      add(new THREE.SphereGeometry(0.1, 8, 6), std('#f4c542'), 0, o.h + 0.05, 0);
      if (o.flag) { const fw = Math.min(2.4, o.h * 0.35), fm = new THREE.MeshBasicMaterial({ map: flagTexture(o.flag), side: THREE.DoubleSide }); g.add(part(new THREE.PlaneGeometry(fw, fw * 0.7), fm, fw / 2 + 0.05, o.h - fw * 0.35 - 0.1, 0)); }
      break;
    }
    case 'banner': {
      const bm = new THREE.MeshBasicMaterial({ map: o.flag ? flagTexture(o.flag) : labelTexture(o.txt || ' ', o.c2, o.c), side: THREE.DoubleSide });
      add(new THREE.PlaneGeometry(o.w, o.h), bm, 0, o.y + o.h / 2 + 1, 0);
      for (const x of [-o.w / 2, o.w / 2]) add(new THREE.CylinderGeometry(0.05, 0.05, o.y + o.h + 1, 6), std('#3a3d42'), x, (o.y + o.h + 1) / 2, 0);
      break;
    }
    case 'sign': { const sw = Math.max(1.4, o.w), sh = Math.max(0.7, o.h); add(new THREE.CylinderGeometry(0.04, 0.04, 1.8 + sh / 2, 6), std('#3a3d42'), 0, (1.8 + sh / 2) / 2, 0); add(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: labelTexture(o.txt || ' ', o.c2, o.c), side: THREE.DoubleSide }), 0, 1.5 + sh / 2, 0.05); break; }
    case 'tower': {
      const roofH = Math.max(2, o.r * 2.6), wm = new THREE.MeshBasicMaterial({ color: '#ffcf6a' });
      add(new THREE.CylinderGeometry(o.r, o.r * 1.08, o.h, 16), M, 0, o.h / 2, 0);
      add(new THREE.ConeGeometry(o.r * 1.3, roofH, 16), M2, 0, o.h + roofH / 2, 0);
      for (let y = 3; y < o.h - 2; y += 4) for (const a of [0.5, 2.1, 3.7, 5.3]) { const w = part(new THREE.PlaneGeometry(Math.max(0.3, o.r * 0.28), Math.max(0.5, o.r * 0.5)), wm, Math.sin(a) * (o.r + 0.05), y, Math.cos(a) * (o.r + 0.05)); w.rotation.y = a; g.add(w); }
      break;
    }
    case 'wall': { add(new THREE.BoxGeometry(o.w, o.h, o.d), M, 0, o.h / 2, 0); const teeth = Math.min(40, Math.floor(o.w / 1.6)); for (let i = 0; i < teeth; i++) add(new THREE.BoxGeometry(0.8, 0.8, o.d), M, -o.w / 2 + 0.8 + i * (o.w - 1.6) / Math.max(1, teeth - 1), o.h + 0.4, 0); break; }
    case 'dome': add(new THREE.SphereGeometry(o.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M, 0, 0, 0); break;

    case 'stage': add(new THREE.BoxGeometry(o.w, o.h, o.d), M, 0, o.h / 2, 0); if (o.txt) add(new THREE.PlaneGeometry(o.w * 0.8, o.h * 1.6), new THREE.MeshBasicMaterial({ map: labelTexture(o.txt, o.c2, o.c) }), 0, o.h + o.h * 0.8 + 1, -o.d / 2 + 0.05); break;
    case 'building': {
      add(new THREE.BoxGeometry(o.w, o.h, o.d), M, 0, o.h / 2, 0);
      if (o.windows) { const wm = new THREE.MeshBasicMaterial({ color: o.c2 }); for (let r = 0; r < Math.floor(o.h / 2.2); r++) for (let k = 0; k < Math.floor(o.w / 2.2); k++) add(new THREE.PlaneGeometry(0.8, 1.0), wm, -o.w / 2 + 1.4 + k * 2.2, 1.6 + r * 2.2, o.d / 2 + 0.02); }
      break;
    }
    case 'tent': add(new THREE.BoxGeometry(o.w, o.h, o.d), M, 0, o.h / 2, 0); { const roof = part(new THREE.ConeGeometry(Math.max(o.w, o.d) * 0.75, o.h * 0.5, 4), M2, 0, o.h + o.h * 0.25, 0); roof.rotation.y = Math.PI / 4; g.add(roof); } break;
    default: break;
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// ── ready-made landmarks: well-built models of famous kinds of places. The recipe only picks one (k), where it stands (x, z),
// its size (s) and colours (c, c2, txt); the shape is fixed here, so a castle always looks like a castle. ──
export const LANDMARKS = ['castle', 'skyscraper', 'eiffel', 'pyramid', 'pagoda', 'lighthouse', 'windmill', 'planet', 'colosseum', 'ship', 'igloo', 'stonehenge', 'bridge', 'volcano'];
const WARM = '#ffcf6a';
function winTex(bg, fg, cols, rows) {
  return canvasOf(256, 256, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; const cw = w / cols, ch = h / rows; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r * 7 + c * 3) % 5 !== 0) g.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.6); });
}
function glowLetter(s, color) {
  return canvasOf(512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 40; g.font = '900 360px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, w / 2, h / 2 + 10); });
}
function pyramidMesh(w, h, d, mat) { const m = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), mat); m.rotation.y = Math.PI / 4; m.scale.set(w, h, d); return m; }
function beam(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
function shadeHex(c) { const n = parseInt(c.slice(1), 16); const f = (v) => Math.round(v * 0.72); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join(''); }
function roundTower(g, x, z, r, h, stone, roof) {
  const roofH = Math.max(3, r * 2.8), wm = new THREE.MeshBasicMaterial({ color: WARM });
  g.add(part(new THREE.CylinderGeometry(r, r * 1.1, h, 18), stone, x, h / 2, z));
  g.add(part(new THREE.CylinderGeometry(r * 1.2, r, 1.2, 18), stone, x, h + 0.6, z)); // (the ring under the roof)
  g.add(part(new THREE.ConeGeometry(r * 1.35, roofH, 18), roof, x, h + 1.2 + roofH / 2, z));
  for (let y = 4; y < h - 2; y += 5) for (const a of [0.4, 1.6, 2.8, 4.4]) { const w = part(new THREE.PlaneGeometry(Math.max(0.35, r * 0.25), Math.max(0.7, r * 0.55)), wm, x + Math.sin(a) * (r * 1.04 + 0.05), y, z + Math.cos(a) * (r * 1.04 + 0.05)); w.rotation.y = a; g.add(w); }
}
function battlements(g, x, y, z, w, d, mat) { const n = Math.min(60, Math.floor(w / 1.5)); for (let i = 0; i < n; i++) g.add(part(new THREE.BoxGeometry(0.8, 0.9, d), mat, x - w / 2 + 0.6 + i * (w - 1.2) / Math.max(1, n - 1), y + 0.45, z)); }
function makeLandmark(o) {
  const g = new THREE.Group(), stone = std(o.c, { emissive: o.c, emissiveIntensity: 0.14 }), roof = std(o.c2, { emissive: o.c2, emissiveIntensity: 0.14 });
  switch (o.k) {
    case 'castle': {
      const warm = new THREE.MeshBasicMaterial({ color: WARM }), dark = std('#1d1d22');
      g.add(part(new THREE.BoxGeometry(28, 12, 11), stone, 0, 6, 0)); g.add((() => { const r = pyramidMesh(30, 8, 12, roof); r.position.set(0, 16, 0); return r; })());
      for (const sx of [-1, 1]) { g.add(part(new THREE.BoxGeometry(14, 9, 9), stone, sx * 21, 4.5, 1)); const r = pyramidMesh(15, 6, 10, roof); r.position.set(sx * 21, 12, 1); g.add(r); }
      for (const [x, z, r, h] of [[-27, -4, 3, 26], [27, -4, 3, 22], [-13, -7, 2.7, 34], [13, -7, 2.7, 30], [0, -9, 3.5, 44], [-32, 5, 2.2, 15], [32, 5, 2.2, 17]]) roundTower(g, x, z, r, h, stone, roof);
      g.add(part(new THREE.BoxGeometry(26, 2.6, 2.6), stone, 0, 15, -7)); // (the covered bridge between the high towers)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) g.add(part(new THREE.PlaneGeometry(1.1, 2.4), warm, -10 + c * 2.5, 4.5 + r * 4, 5.55));
      g.add(part(new THREE.BoxGeometry(58, 5, 1.8), stone, 0, 2.5, 14)); battlements(g, 0, 5, 14, 58, 1.8, stone);
      g.add(part(new THREE.BoxGeometry(5, 4.2, 2), dark, 0, 2.1, 14.1));
      break;
    }
    case 'skyscraper': {
      let y = 0; const tiers = [[16, 15], [14, 14], [12, 14], [9, 12]];
      tiers.forEach(([w, h], i) => {
        g.add(part(new THREE.BoxGeometry(w, h, w), stone, 0, y + h / 2, 0));
        const wmat = new THREE.MeshBasicMaterial({ map: winTex('#1c2733', o.c2, Math.round(w / 1.6), Math.round(h / 1.8)) });
        for (const [px, pz, ry] of [[0, w / 2 + 0.02, 0], [w / 2 + 0.02, 0, Math.PI / 2], [-w / 2 - 0.02, 0, -Math.PI / 2], [0, -w / 2 - 0.02, Math.PI]]) { const p = part(new THREE.PlaneGeometry(w * 0.96, h * 0.94), wmat, px, y + h / 2, pz); p.rotation.y = ry; g.add(p); }
        g.add(part(new THREE.BoxGeometry(w + 0.8, 0.5, w + 0.8), roof, 0, y + h + 0.25, 0));
        y += h + 0.5;
      });
      g.add(part(new THREE.CylinderGeometry(5, 5, 0.5, 24), std('#cfd6dc'), 0, y + 0.25, 0)); // (the landing pad)
      g.add(part(new THREE.CylinderGeometry(0.2, 0.3, 14, 8), std('#cfd6dc'), 0, y + 7, 0));
      const letter = (o.txt || 'A').slice(0, 3), lm = new THREE.MeshBasicMaterial({ map: glowLetter(letter, '#ffffff'), transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const sy = 37; const A1 = part(new THREE.PlaneGeometry(10, 10), lm, 0, sy, 6.15); g.add(A1);
      const A2 = part(new THREE.PlaneGeometry(10, 10), lm, 6.15, sy, 0); A2.rotation.y = Math.PI / 2; g.add(A2);
      break;
    }
    case 'eiffel': {
      const iron = std(o.c, { metalness: 0.5, roughness: 0.5 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.add(beam([sx * 20, 0, sz * 20], [sx * 8, 28, sz * 8], 1.2, iron)); g.add(beam([sx * 8, 28, sz * 8], [sx * 3, 58, sz * 3], 0.9, iron));
      }
      for (const [y, half, th] of [[0.5, 20, 1], [28, 8, 1.4], [58, 3, 1.2]]) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) g.add(beam([ax * half, y, az * half], [bx * half, y, bz * half], th * 0.4, iron));
      for (const [y, w] of [[28, 17], [58, 7]]) g.add(part(new THREE.BoxGeometry(w, 1.2, w), iron, 0, y, 0));
      g.add(part(new THREE.ConeGeometry(2.4, 40, 8), iron, 0, 79, 0));
      break;
    }
    case 'pyramid': {
      for (let i = 0; i < 8; i++) { const w = 42 - i * 5, p = part(new THREE.BoxGeometry(w, 3.6, w), i % 2 ? roof : stone, 0, 1.8 + i * 3.6, 0); g.add(p); }
      const cap = pyramidMesh(6, 4, 6, roof); cap.position.set(0, 30.8, 0); g.add(cap);
      break;
    }
    case 'pagoda': {
      for (let i = 0; i < 5; i++) {
        const w = 10 - i * 1.5, y = i * 5.4;
        g.add(part(new THREE.BoxGeometry(w, 3.2, w), stone, 0, y + 1.6, 0));
        const r = pyramidMesh(w + 5, 2.2, w + 5, roof); r.position.set(0, y + 4.3, 0); g.add(r);
      }
      g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), std('#c9a227'), 0, 31, 0));
      break;
    }
    case 'lighthouse': {
      const a = std(o.c), b = std(o.c2);
      for (let i = 0; i < 5; i++) g.add(part(new THREE.CylinderGeometry(3 - (i + 1) * 0.28, 3 - i * 0.28, 4.4, 18), i % 2 ? b : a, 0, 2.2 + i * 4.4, 0));
      g.add(part(new THREE.CylinderGeometry(3.4, 3, 0.6, 18), std('#2d2d33'), 0, 22.3, 0));
      g.add(part(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 14), new THREE.MeshBasicMaterial({ color: '#fff3b0' }), 0, 23.9, 0));
      g.add(part(new THREE.ConeGeometry(2.2, 2.6, 14), std('#2d2d33'), 0, 26.5, 0));
      break;
    }
    case 'windmill': {
      g.add(part(new THREE.CylinderGeometry(2.2, 3.2, 13, 14), stone, 0, 6.5, 0)); g.add(part(new THREE.ConeGeometry(3.2, 4, 14), roof, 0, 15, 0));
      const hub = new THREE.Group(); hub.position.set(0, 12.5, 3.6);
      for (const rot of [0, Math.PI / 2]) { const sail = part(new THREE.BoxGeometry(1.1, 15, 0.25), std('#e8dcc0'), 0, 0, 0); sail.rotation.z = rot + 0.4; hub.add(sail); }
      g.add(hub); g.add(part(new THREE.SphereGeometry(0.6, 8, 6), std('#4a3a2a'), 0, 12.5, 3.6));
      break;
    }
    case 'colosseum': {
      // an oval of three stacked tiers of arches; only the back and the sides stand (the front is open to the fight)
      const dark = new THREE.MeshBasicMaterial({ color: '#1a1410' }), n = 30, R = 17;
      for (let t = 0; t < 3; t++) for (let i = 0; i < n; i++) {
        const a = -0.35 + (i / (n - 1)) * (Math.PI + 0.7), x = Math.cos(a) * R * 1.35, z = -Math.sin(a) * R;
        const seg = part(new THREE.BoxGeometry(R * 0.27, 4.6, 1.8), t === 1 ? roof : stone, x, 2.3 + t * 4.7, z); seg.rotation.y = a + Math.PI / 2; g.add(seg);
        const arch = part(new THREE.PlaneGeometry(1.5, 3.1), dark, Math.cos(a) * (R * 1.35 + Math.cos(a) * 0.95), 2.2 + t * 4.7, -Math.sin(a) * (R + Math.sin(a) * 0.95)); arch.rotation.y = a + Math.PI / 2; g.add(arch);
        const inner = part(new THREE.PlaneGeometry(1.5, 3.1), dark, Math.cos(a) * (R * 1.35 - Math.cos(a) * 0.95), 2.2 + t * 4.7, -Math.sin(a) * (R - Math.sin(a) * 0.95)); inner.rotation.y = a - Math.PI / 2; g.add(inner);
      }
      for (let i = 0; i < n; i += 2) { const a = -0.35 + (i / (n - 1)) * (Math.PI + 0.7); g.add(part(new THREE.BoxGeometry(1.1, 1.4, 1.1), stone, Math.cos(a) * R * 1.35, 14.8, -Math.sin(a) * R)); }
      break;
    }
    case 'ship': {
      const wood = std(o.c, { emissive: o.c, emissiveIntensity: 0.3 }), sail = std(o.c2, { side: THREE.DoubleSide, emissive: o.c2, emissiveIntensity: 0.35 });
      g.add(part(new THREE.BoxGeometry(26, 4, 7), wood, 0, 3, 0));
      const bow = part(new THREE.BoxGeometry(7, 4, 7), wood, 15.5, 3.6, 0); bow.rotation.z = -0.35; g.add(bow);
      g.add(part(new THREE.BoxGeometry(6, 3, 7.4), std(shadeHex(o.c)), -11, 5.5, 0)); // (the stern)
      g.add(part(new THREE.BoxGeometry(24, 0.5, 7.4), std(shadeHex(o.c)), 0, 5.2, 0));
      for (const [x, h] of [[-7, 20], [0, 25], [7, 19]]) {
        g.add(part(new THREE.CylinderGeometry(0.35, 0.45, h, 8), std('#4a3220'), x, 5 + h / 2, 0));
        g.add(part(new THREE.BoxGeometry(0.3, 0.4, 9), std('#4a3220'), x, 5 + h * 0.85, 0));
        g.add(part(new THREE.BoxGeometry(0.15, h * 0.6, 8), sail, x + 0.2, 5 + h * 0.55, 0));
      }
      g.add(part(new THREE.BoxGeometry(0.1, 2.2, 3.2), std('#111111'), 0.25, 5 + 26.5, 0));
      for (const c of g.children) c.position.y -= 1.2; // (the hull sits in the water line)
      for (let i = 0; i < 6; i++) g.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), std('#222'), -9 + i * 3.6, 4, 3.7).rotateX(Math.PI / 2));
      break;
    }
    case 'igloo': {
      g.add(part(new THREE.SphereGeometry(5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(o.c), 0, 0, 0));
      for (let r = 0; r < 4; r++) g.add(part(new THREE.TorusGeometry(Math.sqrt(25 - (r * 1.1) ** 2), 0.06, 4, 24), std(o.c2), 0, r * 1.1, 0).rotateX(Math.PI / 2));
      const tun = part(new THREE.CylinderGeometry(1.7, 1.7, 3.5, 14, 1, false, 0, Math.PI), std(o.c), 0, 0, 5); tun.rotation.set(Math.PI / 2, 0, Math.PI / 2); g.add(tun);
      g.add(part(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ color: '#1b2a3a' }), 0, 1.1, 6.8));
      break;
    }
    case 'stonehenge': {
      const rock = std(o.c, { flatShading: true }), n = 10, R = 11;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.add(part(new THREE.BoxGeometry(2.4, 7, 1.4), rock, Math.cos(a) * R, 3.5, Math.sin(a) * R).rotateY(-a + Math.PI / 2)); }
      for (let i = 0; i < n; i += 2) { const a = ((i + 0.5) / n) * Math.PI * 2; const l = part(new THREE.BoxGeometry(R * 0.66, 1.2, 1.5), rock, Math.cos(a) * R, 7.6, Math.sin(a) * R); l.rotation.y = -a + Math.PI / 2; g.add(l); }
      for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(part(new THREE.BoxGeometry(2, 5.5 + (i % 2), 1.2), rock, Math.cos(a) * 4, 2.8, Math.sin(a) * 4)); }
      break;
    }
    case 'bridge': {
      const red = std(o.c, { metalness: 0.3, roughness: 0.5 }), cab = std(o.c2);
      g.add(part(new THREE.BoxGeometry(120, 1.2, 5), std('#55595e'), 0, 6, 0));
      for (const x of [-22, 22]) {
        for (const dz of [-2.2, 2.2]) g.add(part(new THREE.BoxGeometry(1.5, 38, 1.5), red, x, 19, dz));
        for (const y of [14, 26, 36]) g.add(part(new THREE.BoxGeometry(1.2, 1.4, 6), red, x, y, 0));
        g.add(part(new THREE.BoxGeometry(2.2, 2, 6.4), red, x, 38.5, 0));
      }
      const cable = (x1, y1, x2, y2, sag) => { let p = [x1, y1]; for (let i = 1; i <= 12; i++) { const k = i / 12, q = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k - Math.sin(k * Math.PI) * sag]; for (const z of [-2.4, 2.4]) g.add(beam([p[0], p[1], z], [q[0], q[1], z], 0.22, cab)); p = q; } };
      cable(-22, 38, 22, 38, -26); cable(-60, 7, -22, 38, -4); cable(22, 38, 60, 7, -4);
      for (let i = -9; i <= 9; i++) { const x = i * 4.2; if (Math.abs(x) > 22 && Math.abs(x) < 27) continue; const y = Math.abs(x) <= 22 ? 38 - 26 * Math.sin(((x + 22) / 44) * Math.PI) : 7; if (Math.abs(x) <= 22) for (const z of [-2.4, 2.4]) g.add(beam([x, y, z], [x, 6.6, z], 0.06, cab)); }
      break;
    }
    case 'volcano': {
      g.add(part(new THREE.CylinderGeometry(4, 20, 26, 16), std(o.c, { flatShading: true }), 0, 13, 0));
      g.add(part(new THREE.CylinderGeometry(3.6, 3.6, 0.6, 16), new THREE.MeshBasicMaterial({ color: o.c2 }), 0, 26.2, 0));
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4, s = part(new THREE.BoxGeometry(1.1, 21, 0.25), new THREE.MeshBasicMaterial({ color: o.c2 }), Math.sin(a) * 11.2, 13.5, Math.cos(a) * 11.2); s.rotation.y = a; s.rotateX(-0.46); g.add(s); }
      break;
    }
    case 'planet': {
      g.add(part(new THREE.SphereGeometry(10, 36, 24), new THREE.MeshStandardMaterial({ color: o.c, roughness: 0.9 }), 0, 0, 0));
      const ring = part(new THREE.RingGeometry(13, 19, 64), new THREE.MeshBasicMaterial({ color: o.c2, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }), 0, 0, 0); ring.rotation.x = Math.PI / 2.6; g.add(ring);
      break;
    }
    default: break;
  }
  g.traverse((m) => { if (m.isMesh && o.k !== 'planet') { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// puts the recipe into the arena: the painted floor on the ground, and every object (never in the fight area)
// The fight camera is low and narrow: at distance D it sees only about 0.27 * D of height above its eye line. A tall landmark far
// back would be cut off (you would see a wall, or a roof), so tall things are shrunk until they fit the frame.
const FIT_TYPES = ['landmark', 'tower', 'wall', 'dome', 'building', 'tent', 'stage', 'box', 'cylinder', 'sphere', 'cone'];
const fitCache = new WeakMap();
function fitScale(o, i) {
  if (!FIT_TYPES.includes(o.t) || o.z > -18) return o.s;
  let h = fitCache.get(o);
  if (h == null) { const box = new THREE.Box3().setFromObject(makeObject(o)); h = Math.max(0.1, box.max.y - box.min.y); fitCache.set(o, h); }
  const maxH = 0.27 * (Math.abs(o.z + i * o.dz) + 16) + 1.5;
  return h * o.s > maxH ? maxH / h : o.s;
}
export function buildScene(arena, sc, ground) {
  if (sc.floorColor) { ground.material.map?.dispose(); ground.material.map = null; ground.material.color.set(sc.floorColor); ground.material.needsUpdate = true; }
  if (sc.floor.length) {
    const tex = paintFloor(sc);
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(48, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    paint.rotation.x = -Math.PI / 2; paint.position.set(0, 0.012, -4); paint.receiveShadow = true; arena.group.add(paint);
  }
  if (sc.objects.some((o) => o.z < -25) && arena.scene?.fog) { arena.scene.fog.near = 45; arena.scene.fog.far = 115; } // (a big landmark far back must not vanish into the haze)
  for (const o of sc.objects) {
    for (let i = 0; i < o.n; i++) {
      const x = o.x + i * o.dx, z = o.z + i * o.dz;
      if (z > -3 && Math.abs(x) < 13) continue; // (not in the fight, not in front of the camera)
      const obj = makeObject(o);
      obj.position.set(x, o.y && !['banner'].includes(o.t) ? o.y : 0, z);
      obj.rotation.y = (o.rot * Math.PI) / 180; obj.scale.setScalar(fitScale(o, i));
      arena.group.add(obj);
    }
  }
}
