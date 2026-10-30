// A realistic explosion (Or Haim's Hoshech Mavet blowing up, in his special and his fatality).
// It runs itself: updateExplosions() every frame from the main loop, and it goes when it's over.

import * as THREE from 'three';

const live = new Set();
const TINT = new THREE.Color('#9a4cff');
export function updateExplosions(dt) {
  const k = Math.min(3, dt * 60);
  for (const e of [...live]) if (e.update(k)) e.dispose();
}
export function clearExplosions() { for (const e of [...live]) e.dispose(); }

// ── an explosion that looks like one ────────────────────────────────────────────
// Billowing puffs of fire (white-hot at first, then orange, red, and out) that turn into thick
// black smoke rising and spreading, a bright flash with a glow on the floor, a shockwave, sparks.
// Soft noisy puff textures, made once.
let puffTex = null;
function puffTextures() {
  if (puffTex) return puffTex;
  puffTex = [0, 1, 2, 3].map((n) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    let seed = 7 + n * 131; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // lumpy: many soft blobs inside a round falloff
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 34, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, R = 16 + rnd() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.3})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    // fade the edge out round
    g.globalCompositeOperation = 'destination-in';
    const edge = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    edge.addColorStop(0, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = edge; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
  return puffTex;
}
const FIRE = [[0, '#fffbe8'], [0.12, '#ffe08a'], [0.3, '#ff9a2e'], [0.55, '#d8481a'], [0.8, '#6e1d10'], [1, '#2a120c']].map(([k, c]) => [k, new THREE.Color(c)]);
function fireColor(k, out) {
  for (let i = 1; i < FIRE.length; i++) if (k <= FIRE[i][0]) return out.copy(FIRE[i - 1][1]).lerp(FIRE[i][1], (k - FIRE[i - 1][0]) / (FIRE[i][0] - FIRE[i - 1][0]));
  return out.copy(FIRE.at(-1)[1]);
}
export class Explosion {
  constructor(scene, x, y, { size = 1, tint = null } = {}) {
    this.scene = scene; this.t = 0; this.size = size;
    live.add(this);
    const tex = puffTextures();
    this.group = new THREE.Group(); scene.add(this.group);
    const puff = (additive) => {
      const m = new THREE.SpriteMaterial({ map: tex[Math.floor(Math.random() * 4)], transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 });
      const sp = new THREE.Sprite(m); sp.renderOrder = additive ? 7 : 6; this.group.add(sp); return sp;
    };
    const rnd = (a) => (Math.random() - 0.5) * a;
    // the fireball: puffs bursting outward (a little upward), slowing down
    this.fire = Array.from({ length: 34 }, (_, i) => {
      const dir = new THREE.Vector3(rnd(2), rnd(2) + 0.35, rnd(1.2)).normalize();
      return { sp: puff(i % 5 === 0), p: new THREE.Vector3(x, y, 0.3).addScaledVector(dir, Math.random() * 0.3 * size), v: dir.multiplyScalar((0.05 + Math.random() * 0.09) * size),
        life: 26 + Math.random() * 26, s0: (0.5 + Math.random() * 0.6) * size, s1: (1.6 + Math.random() * 1.6) * size, rot: Math.random() * 6, delay: Math.floor(Math.random() * 6), tint: tint && i % 4 === 0 };
    });
    // the smoke left behind: dark, rising and spreading, slowly thinning
    this.smoke = Array.from({ length: 26 }, () => {
      const dir = new THREE.Vector3(rnd(2), rnd(1.2) + 0.5, rnd(1)).normalize();
      return { sp: puff(false), p: new THREE.Vector3(x, y, 0.2).addScaledVector(dir, Math.random() * 0.8 * size), v: dir.multiplyScalar((0.02 + Math.random() * 0.04) * size),
        life: 150 + Math.random() * 90, s0: 1.0 * size, s1: (3 + Math.random() * 2.5) * size, rot: Math.random() * 6, delay: 8 + Math.floor(Math.random() * 14), shade: 0.1 + Math.random() * 0.12 };
    });
    // the flash: a huge glow, and its light on the floor
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[0], color: '#ffd9a0', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.flash.position.set(x, y, 0.4); this.group.add(this.flash);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: tex[1], color: '#ff9a40', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.set(x, 0.03, 0.3); this.group.add(this.floor);
    this.y = y; this.c = new THREE.Color();
  }
  update(k) { // k: game frames passed
    this.t += k;
    const t = this.t;
    for (const f of this.fire) {
      const a = t - f.delay;
      f.sp.visible = a > 0 && a < f.life;
      if (!f.sp.visible) continue;
      const u = a / f.life;
      f.p.addScaledVector(f.v, k); f.v.multiplyScalar(Math.pow(0.93, k)); f.v.y += 0.0012 * k; // (hot: it rises)
      f.sp.position.copy(f.p);
      f.sp.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - u, 3)));
      fireColor(u, f.sp.material.color);
      if (f.tint) f.sp.material.color.lerp(TINT, 0.3 * (1 - u)); // (a touch of his darkness in it)
      f.sp.material.opacity = Math.min(1, a / 3) * (1 - u * u) * (f.sp.material.blending === THREE.AdditiveBlending ? 0.5 : 0.95);
      f.sp.material.rotation = f.rot + u * 0.6;
    }
    for (const m of this.smoke) {
      const a = t - m.delay;
      m.sp.visible = a > 0 && a < m.life;
      if (!m.sp.visible) continue;
      const u = a / m.life;
      m.p.addScaledVector(m.v, k); m.v.multiplyScalar(Math.pow(0.985, k)); m.p.y += 0.006 * k;
      m.sp.position.copy(m.p);
      m.sp.scale.setScalar(m.s0 + (m.s1 - m.s0) * Math.sqrt(u));
      // glowing from the fire inside at first, then just dark smoke
      const hot = Math.max(0, 1 - a / 26);
      m.sp.material.color.setRGB(m.shade + hot * 0.8, m.shade + hot * 0.35, m.shade + hot * 0.1);
      m.sp.material.opacity = Math.min(0.85, a / 10) * (1 - u) * 0.9;
      m.sp.material.rotation = m.rot + u * 0.4;
    }
    const fl = Math.max(0, 1 - t / 14);
    this.flash.visible = fl > 0; this.flash.scale.setScalar((3 + t * 0.3) * this.size); this.flash.material.opacity = fl * 0.6;
    const gl = Math.max(0, 1 - t / 40) * Math.min(1, 6 / Math.max(1, this.y));
    this.floor.visible = gl > 0.01; this.floor.scale.setScalar(5 * this.size); this.floor.material.opacity = gl;
    return t > 260;
  }
  dispose() {
    live.delete(this);
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.material?.dispose(); o.geometry?.dispose(); }); // (the puff textures are kept)
  }
}

