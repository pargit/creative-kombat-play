// Custom specials from the friends' power table. Each effect runs on the 60 Hz logic clock
// (tick: deterministic, so online play stays in sync) and draws itself at render rate.
//
//   smoke     Karina     – smoke cloud: poison over 2 s; the victim can't see her for 4 s
//   shatter   Snir       – skeleton → pile of bones → bones pierce the opponent → skeleton → Snir
//   foot      Ido Bohen  – becomes a giant foot (he is the big toe) and stomps the opponent
//   flagpole  Yahli      – a flag pole appears, human-flag spin around it kicking the opponent
//   cage      Asis       – a bamboo cage traps the opponent and hurts over time until they break it
//   guitar    Ofek       – 1.5 s guitar solo: the opponent holds their ears and takes 18
//   gold      Ori Gold   – golden for 3 s: nothing can hurt him
//   cough     Noa        – poison cough: 19.5 over 9 s and the victim deals half damage
//   darkness  Or Haim    – summons Hoshech Mavet: a two-man combo, then he explodes
//   france    Oron       – VIVA LA FRANCE: French model, baguette (+reach, +damage), flag aura
//   computer  Michael    – throws a computer: factory reset, the opponent's buttons get mixed up
//   skadoosh  Minibar    – Kung Fu Panda: finger hold, SKADOOSH to the spirit world, chi dragon
//
// ctx = { scene, particles, rings, sfx, shake(v), portrait(id), viewerIndex, flash(side, big, small) }

import * as THREE from 'three';
import { DOT } from './fx.js';
import { PHYS } from './moves.js';
import { loadAnimated } from './rig.js';
import { Explosion } from './explosion.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

const sign = (v) => (v < 0 ? -1 : 1);
const tex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

let SMOKE_TEX;
function smokeTex() {
  return SMOKE_TEX ||= tex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(235,235,235,0.95)');
    grad.addColorStop(0.5, 'rgba(190,190,195,0.6)');
    grad.addColorStop(1, 'rgba(160,160,170,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}
const puff = (size, opacity = 0.85) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
};

// a hit from an effect: specials can't be blocked
export function strike(owner, move, extra, fromX) {
  const opp = owner.opponent;
  if (!opp.alive) return null;
  return opp.receive(owner, { ...move, ...extra, unblockable: true, id: 'special' }, { x: fromX ?? owner.pos.x });
}

export class Effect {
  constructor(owner, move, ctx) {
    this.owner = owner; this.move = move; this.ctx = ctx;
    this.t = 0; this.dead = false;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
  }
  get opp() { return this.owner.opponent; }
  finish() {
    if (this.dead) return;
    this.dead = true;
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    this.owner.opacity = 1;
    this.owner.rig.setOpacity?.(1);
    this.owner.rig.object.rotation.set(0, 0, 0);
    this.owner.endSpecial?.();
    this.cleanup?.();
  }
  dispose() { this.finish(); }
}

// ── Karina: smoke ────────────────────────────────────────────────────────────
// (ctx.fatality: Karina's fatality — no damage: ctx.onSmoked() when the cloud reaches them)
export class Smoke extends Effect {
  cleanup() { for (const tr of this.trail) { this.ctx.scene.remove(tr.p); tr.p.material.dispose(); } }
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const mouth = o.mouthPos();
    this.x = mouth.x;
    this.y = mouth.y;
    this.puffs = Array.from({ length: 7 }, (_, i) => { const p = puff(0.6 + i * 0.08); this.group.add(p); return p; });
    this.trail = [];
    o.endSpecial();
    ctx.sfx.whoosh();
    this.fatal = !!ctx.fatality;
  }
  tick() {
    this.t++;
    const opp = this.opp;
    if (this.fatal && Math.hypot(opp.pos.x - this.x, opp.pos.y + 1.5 - this.y) < 0.6) { this.ctx.onSmoked?.(); this.finish(); return; }
    const dx = opp.pos.x - this.x, dy = opp.pos.y + 1.5 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = this.ctx.slow ?? 0.2; // (the fatality: drifting slowly over)
    this.x += (dx / d) * sp; this.y += (dy / d) * sp;
    if (d < 0.6) {
      const r = strike(this.owner, this.move, { damage: this.move.damage, hitstun: 12 }, this.x);
      if (r === 'hit') { opp.poison = { left: 120, every: 15, dmg: 1.5 }; opp.smoked = 240; this.ctx.onSmoke?.(opp); }
      this.finish();
    }
    if (this.t > 600 || (!opp.alive && !this.fatal)) this.finish();
  }
  render(t) {
    // a stream of smoke from her mouth to the cloud
    if (this.trail.length < 14 && this.t < 40) { const p = puff(0.35, 0.6); this.ctx.scene.add(p); this.trail.push({ p, life: 1 }); }
    const mouth = this.owner.mouthPos();
    this.trail.forEach((tr, i) => {
      const f = (i + 1) / (this.trail.length + 1);
      tr.p.position.set(mouth.x + (this.x - mouth.x) * f, mouth.y + (this.y - mouth.y) * f + Math.sin(t * 3 + i) * 0.05, 0.2);
      tr.life = Math.max(0, tr.life - 0.012);
      tr.p.material.opacity = 0.55 * tr.life;
      tr.p.scale.setScalar(0.3 + f * 0.4);
    });
    this.group.position.set(this.x, this.y, 0.2);
    this.puffs.forEach((p, i) => {
      const a = t * 3 + i;
      p.position.set(Math.cos(a) * 0.3, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.3);
    });
  }
}

// Smoke wrapped around a smoked fighter's head (everyone sees it)
export class SmokeHead {
  constructor(scene) {
    this.group = new THREE.Group();
    this.puffs = Array.from({ length: 6 }, () => { const p = puff(0.7, 0.8); this.group.add(p); return p; });
    this.group.visible = false;
    scene.add(this.group);
    this.scene = scene;
  }
  render(f, t) {
    const on = f.smoked > 0;
    this.group.visible = on;
    if (!on) return;
    const fade = Math.min(1, f.smoked / 40);
    this.group.position.set(f.pos.x, f.pos.y + 2.0 * (f.reachScale || 1), 0);
    this.puffs.forEach((p, i) => {
      const a = t * 1.6 + i * 1.05;
      p.position.set(Math.cos(a) * 0.32, Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.32);
      p.material.opacity = 0.8 * fade;
    });
  }
  dispose() { this.scene.remove(this.group); this.puffs.forEach((p) => p.material.dispose()); }
}

// Karina's cigarette: held in her right hand while she takes a drag; the ember glows on the drag
export class Cigarette {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 }));
    stick.rotation.z = Math.PI / 2;
    stick.position.x = 0.1;
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 10), new THREE.MeshStandardMaterial({ color: '#d99a4e', roughness: 0.8 }));
    filter.rotation.z = Math.PI / 2;
    filter.position.x = -0.02;
    this.emberMat = new THREE.MeshBasicMaterial({ color: '#ff5a1f' });
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), this.emberMat);
    ember.position.x = 0.2;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ff7a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.position.x = 0.21;
    this.group.add(stick, filter, ember, this.glow);
    this.wisps = Array.from({ length: 4 }, (_, i) => { const p = puff(0.12, 0.5); p.userData.o = i / 4; this.scene.add(p); return p; });
    this.group.visible = false;
    scene.add(this.group);
    this.v = new THREE.Vector3();
  }
  render(f, t) {
    const hand = f.rig.auto?.bones?.rHand;
    const on = f.state === 'attack' && f.move?.anim === 'smoke' && f.alive && !!hand && (f.opacity ?? 1) > 0.5;
    this.group.visible = on;
    for (const w of this.wisps) w.visible = on;
    if (!on) return;
    hand.updateWorldMatrix(true, false);
    hand.getWorldPosition(this.v);
    const H = heightScale(f);
    this.group.position.copy(this.v).add({ x: f.facing * 0.05 * H, y: 0.02, z: 0.03 });
    this.group.rotation.set(0, f.facing > 0 ? 0 : Math.PI, 0.35);
    this.group.scale.setScalar(H);
    // the drag: ember flares while she inhales
    const drag = f.phase === 'startup' && f.phaseProgress() > 0.45;
    const k = drag ? 0.75 + 0.25 * Math.sin(t * 22) : 0.35;
    this.emberMat.color.setRGB(1, 0.25 + 0.3 * k, 0.08);
    this.glow.material.opacity = k;
    this.glow.scale.setScalar((drag ? 0.16 : 0.09) * H);
    // thin smoke curling up from the tip
    const tip = this.glow.getWorldPosition(this.v);
    for (const w of this.wisps) {
      const a = (t * 0.6 + w.userData.o) % 1;
      w.position.set(tip.x + Math.sin(t * 3 + w.userData.o * 9) * 0.05 * a, tip.y + a * 0.5, tip.z);
      w.scale.setScalar((0.06 + a * 0.18) * H);
      w.material.opacity = 0.45 * (1 - a);
    }
  }
  dispose() {
    this.scene.remove(this.group);
    for (const w of this.wisps) { this.scene.remove(w); w.material.dispose(); }
  }
}
const heightScale = (f) => (f.def.heightCm || 175) / 175;

// Dizzy stars over a knocked-out fighter (Ziv's weight)
export class Stars {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const t = tex(64, 64, (g) => {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 30, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      g.fill();
    });
    this.stars = Array.from({ length: 5 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.28);
      this.group.add(s);
      return s;
    });
    this.group.visible = false;
    scene.add(this.group);
  }
  render(f, t) {
    const on = f.dizzy > 0;
    this.group.visible = on;
    if (!on) return;
    const down = f.state === 'knockdown' || f.state === 'ko';
    this.group.position.set(f.pos.x + (down ? -f.facing * 0.9 : 0), f.pos.y + (down ? 0.55 : 2.25), 0);
    this.stars.forEach((s, i) => { const a = t * 4 + (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); });
  }
  dispose() { this.scene.remove(this.group); }
}

// ── Minibar: SKADOOSH ────────────────────────────────────────────────────────
// He turns into Kung Fu Panda (his second model) for the rest of the round, rushes in and takes
// the Wuxi finger hold, SKADOOSH: the bell rings and a green shockwave sends both of them to the
// spirit world (golden sky, floating rocks) for the rest of the round. Then the Dragon Warrior: a golden chi
// dragon spirals up around him and dives into the opponent for 25.
// timed to the movie clip (audio/skadoosh-po.mp3, started at SK.say): Po's "Skadoooosh" while the
// little finger slowly lifts, the snap as the word ends (+108 frames), then the bell (+118): a
// green shockwave and the spirit world on that very frame
const SK = { morph: 10, dash: 30, hold: 50, say: 56, skadoosh: 164, world: 174, float: 186, emerge: 198, roar: 238, dive: 252, strike: 266, land: 272, end: 306 };
function chiTexture() {
  return tex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, '#fffbe0'); r.addColorStop(0.35, '#ffd34d'); r.addColorStop(0.75, 'rgba(255,150,20,0.6)'); r.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
}
// a golden Chinese dragon made of chi: a long tapering body that follows the head's path, a mane
// of flames along its back, horns, whiskers and a jaw that opens to roar
const DR = { rings: 46, sides: 10, length: 5.2 };
// Cut the head off the dragon model (the top of it, on the side it faces) to put on the built
// snake body: returns a group with the snout pointing along +z and the neck at the origin
function extractDragonHead(prop, length) {
  prop.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(prop);
  const H = all.max.y - all.min.y, W = all.max.x - all.min.x, cx = (all.min.x + all.max.x) / 2;
  const parts = [];
  prop.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    parts.push({ geo, mat: o.material });
  });
  const pick = (test) => parts.map(({ geo, mat }) => {
    const pos = geo.attributes.position, uv = geo.attributes.uv, P = [], U = [];
    for (let i = 0; i < pos.count; i += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { x += pos.getX(i + k) / 3; y += pos.getY(i + k) / 3; z += pos.getZ(i + k) / 3; }
      if (!test(x, y, z)) continue;
      for (let k = 0; k < 3; k++) { P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)); if (uv) U.push(uv.getX(i + k), uv.getY(i + k)); }
    }
    return { P, U, mat };
  });
  // the head: the top of the model on the side its face points to (-x)
  const rough = pick((x, y) => y > all.min.y + 0.72 * H && x < cx + 0.05 * W);
  let n = 0; const c = new THREE.Vector3();
  for (const { P } of rough) for (let i = 0; i < P.length; i += 3) { c.x += P[i]; c.y += P[i + 1]; c.z += P[i + 2]; n++; }
  c.divideScalar(Math.max(1, n));
  // drop stray bits (whisker tips, a claw) far from the head itself
  const r = 0.26 * H;
  const head = pick((x, y, z) => y > all.min.y + 0.72 * H && x < cx + 0.05 * W && Math.hypot(x - c.x, y - c.y, z - c.z) < r);
  const g = new THREE.Group(), inner = new THREE.Group();
  for (const { P, U, mat } of head) {
    if (!P.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.computeVertexNormals();
    const mt = mat.clone();
    mt.side = THREE.DoubleSide;
    inner.add(new THREE.Mesh(geo, mt));
  }
  const hb = new THREE.Box3().setFromObject(inner);
  // the neck: the back of the head (+x), halfway up
  inner.position.set(-hb.max.x, -(hb.min.y + hb.max.y) / 2, -(hb.min.z + hb.max.z) / 2);
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.y = Math.PI / 2; // snout (-x) → +z
  holder.scale.setScalar(length / Math.max(1e-6, hb.max.x - hb.min.x));
  g.add(holder);
  return g;
}
class ChiDragon {
  constructor(group) {
    this.group = group;
    const n = DR.rings * DR.sides;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < DR.rings - 1; i++) for (let j = 0; j < DR.sides; j++) {
      const a = i * DR.sides + j, b = i * DR.sides + (j + 1) % DR.sides, c = a + DR.sides, d = b + DR.sides;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#f6b938', emissive: '#ff9410', emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.35, transparent: true, opacity: 0.97 }); // the gold of the real head
    this.body = new THREE.Mesh(geo, this.bodyMat);
    this.body.frustumCulled = false;
    group.add(this.body);
    // flames along its back
    this.maneMat = new THREE.MeshStandardMaterial({ color: '#e0401a', emissive: '#c02000', emissiveIntensity: 0.6, transparent: true, opacity: 0.95 });
    this.mane = Array.from({ length: 15 }, () => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), this.maneMat); group.add(m); return m; });
    // the head
    this.head = new THREE.Group();
    const gold = this.bodyMat;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), gold); skull.scale.set(1, 0.85, 1.25); this.head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.42), gold); snout.position.set(0, 0.0, 0.42); this.head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), gold); nose.position.set(0, 0.04, 0.62); this.head.add(nose);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.1, 0.12);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.48), gold); jaw.position.set(0, -0.02, 0.24); this.jaw.add(jaw);
    const teeth = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff0c0', emissiveIntensity: 0.4 });
    for (const sx of [-0.09, 0.09]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5), teeth); f.position.set(sx, 0.04, 0.42); this.jaw.add(f); }
    this.head.add(this.jaw);
    const horn = new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffd27a', emissiveIntensity: 0.5 });
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), horn);
      h.position.set(sx * 0.14, 0.26, -0.18); h.rotation.set(-1.0, 0, sx * -0.35); this.head.add(h);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      eye.position.set(sx * 0.17, 0.1, 0.22); this.head.add(eye);
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.7, 4), horn);
      whisker.position.set(sx * 0.2, -0.02, 0.62); whisker.rotation.set(1.2, 0, sx * 0.9); this.head.add(whisker);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), this.maneMat);
      fin.position.set(sx * 0.24, 0.05, -0.15); fin.rotation.set(-1.6, 0, sx * 0.9); this.head.add(fin);
    }
    group.add(this.head);
    this.headMats = [];
    this.visible(false);
  }
  visible(v) { this.body.visible = this.head.visible = v; for (const m of this.mane) m.visible = v; }
  // swap the built head for the real dragon's head (cut from the model)
  setHead(real) {
    for (const c of [...this.head.children]) c.visible = false;
    real.traverse((x) => { if (x.isMesh) { const mt = x.material; mt.emissive?.set('#ffb000'); if (mt.map) mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.5; mt.transparent = true; this.headMats.push(mt); } });
    this.head.add(real);
    this.realHead = real;
  }
  // place the body along the head's recent path (newest first), `grow` 0…1 = how much has come out
  update(path, grow, jawOpen, time, opacity) {
    if (path.length < 2) { this.visible(false); return; }
    this.visible(opacity > 0.01);
    this.bodyMat.opacity = 0.95 * opacity; this.maneMat.opacity = 0.95 * opacity;
    for (const mt of this.headMats) mt.opacity = opacity;
    // resample the path by distance
    const len = DR.length * grow, step = len / (DR.rings - 1);
    const pts = [new THREE.Vector3(path[0].x, path[0].y, path[0].z)];
    let k = 0, carry = 0, prev = pts[0].clone();
    for (let i = 1; i < path.length && pts.length < DR.rings; i++) {
      const cur = new THREE.Vector3(path[i].x, path[i].y, path[i].z);
      let seg = cur.distanceTo(prev);
      while (seg + carry >= step && pts.length < DR.rings) {
        const tt = (step - carry) / seg;
        prev = prev.clone().lerp(cur, tt); pts.push(prev.clone()); seg = cur.distanceTo(prev); carry = 0;
      }
      carry += seg; prev = cur;
    }
    while (pts.length < DR.rings) pts.push(pts[pts.length - 1].clone().add(new THREE.Vector3(0, -0.001, 0)));
    void k;
    const pos = this.body.geometry.attributes.position;
    const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3();
    let maneI = 0;
    for (let i = 0; i < DR.rings; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(DR.rings - 1, i + 1)];
      t.subVectors(a, b); if (t.lengthSq() < 1e-8) t.set(1, 0, 0); t.normalize();
      bin.crossVectors(t, up); if (bin.lengthSq() < 1e-6) bin.set(0, 0, 1); bin.normalize();
      nrm.crossVectors(bin, t).normalize();
      const u = i / (DR.rings - 1);
      // thick behind the head, tapering to the tail; a gentle ripple
      const r = (0.36 * Math.min(1, 0.55 + u * 4) * (1 - u * 0.85) + 0.03) * (1 + 0.06 * Math.sin(time * 8 - i * 0.7));
      for (let j = 0; j < DR.sides; j++) {
        const ang = (j / DR.sides) * Math.PI * 2;
        const c = Math.cos(ang) * r, s2 = Math.sin(ang) * r;
        pos.setXYZ(i * DR.sides + j, pts[i].x + nrm.x * c + bin.x * s2, pts[i].y + nrm.y * c + bin.y * s2, pts[i].z + nrm.z * c + bin.z * s2);
      }
      if (i > 2 && i % 3 === 0 && maneI < this.mane.length) {
        const m = this.mane[maneI++];
        m.position.copy(pts[i]).addScaledVector(nrm, r * 0.95);
        m.quaternion.setFromUnitVectors(up, nrm);
        m.scale.setScalar(Math.max(0.3, 1 - u));
      }
    }
    for (; maneI < this.mane.length; maneI++) this.mane[maneI].visible = false;
    pos.needsUpdate = true;
    this.body.geometry.computeVertexNormals();
    // the head looks along its path
    const dir = new THREE.Vector3().subVectors(pts[0], pts[1]);
    if (dir.lengthSq() > 1e-8) {
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.normalize().negate(), up);
      this.head.quaternion.setFromRotationMatrix(m);
    }
    this.head.position.copy(pts[0]);
    this.head.scale.setScalar(this.realHead ? 1 : 1.55);
    const fw = new THREE.Vector3().subVectors(pts[0], pts[1]);
    if (fw.lengthSq() > 1e-8) this.forward = fw.normalize();
    this.jaw.rotation.x = jawOpen * 0.7;
  }
}
class Skadoosh extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.side = o.facing;
    this.held = false;
    this.dragon = new ChiDragon(this.group);
    // the real dragon model (painted gold like the movie's); the built one above is the fallback
    if (o.def.specialProp) ctx.prop?.(o.def.specialProp, 3.4).then((m) => {
      if (this.dead) return;
      // the real dragon's head on the built snake body (which can slither); the whole model is
      // only the fallback below if cutting fails
      try { this.dragon.setHead(extractDragonHead(m, 0.95)); return; } catch { /* use the whole model */ }
      // the model is one stiff pose: bend it in the shader so waves run down its body (head to
      // tail) like a swimming snake
      const box = new THREE.Box3().setFromObject(m.children[0].children[0]); // in the model's own units
      m.updateMatrixWorld(true);
      const gb = new THREE.Box3();
      m.traverse((x) => { if (x.isMesh) { x.geometry.computeBoundingBox(); gb.union(x.geometry.boundingBox); } });
      void box;
      const gc = gb.getCenter(new THREE.Vector3());
      this.wave = { uTime: { value: 0 }, uMinY: { value: gb.min.y }, uH: { value: Math.max(1e-6, gb.max.y - gb.min.y) }, uAmp: { value: 1 },
        uC: { value: new THREE.Vector2(gc.x, gc.z) } };
      const U = this.wave;
      m.traverse((x) => {
        if (!x.isMesh) return;
        const mt = x.material;
        mt.emissive?.set('#ffb000'); if (mt.map) mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.45;
        mt.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, U);
          sh.vertexShader = 'uniform float uTime, uMinY, uH, uAmp; uniform vec2 uC;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float yn = (position.y - uMinY) / uH;      // 0 at the tail end, 1 at the head
            float tail = 0.4 + 0.6 * (1.0 - yn);        // the tail moves more than the head
            // each slice of the coil turns back and forth around the coil's middle, in a wave
            // that runs from head to tail: the loops slide along like a swimming snake
            float a = sin(yn * 9.42 + uTime * 4.5) * 0.55 * uAmp * tail;
            vec2 d = transformed.xz - uC;
            transformed.xz = uC + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
            // and a sideways ripple on top
            float w = 0.09 * uH * uAmp * tail;
            transformed.x += sin(yn * 15.7 + uTime * 6.5) * w;
            transformed.z += cos(yn * 12.6 + uTime * 5.0) * w * 0.7;
            transformed.y += sin(yn * 6.28 + uTime * 3.0) * w * 0.4;`);
        };
        mt.needsUpdate = true;
        x.userData.mat = mt;
      });
      m.visible = false;
      this.group.add(m);
      this.model = m;
    }).catch(() => {});
    const map = chiTexture();
    // a glow around the dragon and the sparkle where the fingers meet
    this.glow = Array.from({ length: 14 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 })); this.group.add(sp); return sp; });
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
    this.group.add(this.spark);
    this.path = []; // the dragon head's past positions, newest first
    // the dragon's chi laser
    const add = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.laserMat = add('#ffcf3a'); this.laserCore = add('#ffffff');
    this.laser = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true), this.laserMat);
    this.laserIn = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), this.laserCore);
    this.charge = new THREE.Sprite(new THREE.SpriteMaterial({ map: chiTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    this.laser.visible = this.laserIn.visible = this.charge.visible = false;
    this.group.add(this.laser, this.laserIn, this.charge);
    this.waveMat = new THREE.MeshBasicMaterial({ color: '#19e85a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.62, 1.0, 64), this.waveMat);
    this.wave.visible = false;
    this.group.add(this.wave);
    ctx.flash(o.index, 'KUNG FU PANDA', 'THE DRAGON WARRIOR');
    ctx.particles.burst(o.pos.x, o.pos.y + 1.1, 0.4, { count: 60, color: '#ffd34d', speed: 0.14, gravity: -0.001, life: 34 });
    ctx.particles.burst(o.pos.x, o.pos.y + 1.1, 0.4, { count: 40, color: '#ffffff', speed: 0.1, gravity: -0.001, life: 28 });
    ctx.rings.spawn(o.pos.x, 0.05, '#ffc23a', { grow: 0.24, life: 24 });
    o.poseOverride = { anim: 'gold', phase: 'active', pt: 1 };
  }
  cleanup() { this.owner.poseOverride = null; this.opp.poseOverride = null; this.ctx.camera?.(null); }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp, P = this.ctx.particles;
    // knocked out of it before the finger hold: back to Minibar, special not used up
    if (!this.held && !this.struck && (o.state !== 'attack' || o.move?.id !== 'special')) {
      if (o.alive) { o.specialsLeft++; o.game.onSpecialRefund?.(o); }
      o.altForm = false;
      this.finish();
      return;
    }
    if (t === SK.morph) o.altForm = true; // hidden in the burst
    // rush in to grab their finger
    if (t === SK.dash) { this.side = sign(opp.pos.x - o.pos.x || o.facing); this.fromX = o.pos.x; o.poseOverride = { anim: 'dash', phase: 'active', pt: 0.5 }; this.ctx.sfx.whoosh?.(); }
    if (t > SK.dash && t <= SK.hold) {
      const k = (t - SK.dash) / (SK.hold - SK.dash), e = k * k * (3 - 2 * k);
      const lim = PHYS.arenaHalf - 0.8;
      this.lockX = Math.max(-lim, Math.min(lim, opp.pos.x));
      o.pos.x = this.fromX + (this.lockX - this.side * 1.05 - this.fromX) * e;
      o.vel.x = 0; o.facing = this.side;
    }
    // the Wuxi finger hold: Po's hand on their hand, little finger up; they can't move
    // gold Ori: it all plays out, but none of it does anything to him
    if (t === SK.hold && opp.goldSoak(o)) this.ctx.flash(opp.index, 'NO EFFECT', 'THE GOLD TAKES IT');
    if (t === SK.hold) {
      this.held = true;
      o.poseOverride = { anim: 'wuxi', phase: 'active', pt: 1 };
      if (opp.alive) { opp.move = null; opp.setState('hit'); opp.facing = -this.side; }
      this.ctx.flash(o.index, 'WUXI FINGER HOLD', '');
    }
    if (this.held && opp.alive && opp.state !== 'ko') {
      opp.stun = Math.max(opp.stun, 10);
      if (opp.state !== 'hit') { opp.move = null; opp.setState('hit'); }
      opp.vel.x = 0; opp.pos.x = this.lockX;
      opp.pinnedUntil = (opp.clock || 0) + 2;
      // the hold: Po lifts their hand by the little finger… then SKADOOSH, the snap down
      const k = Math.min(1, (t - SK.hold) / (SK.skadoosh - SK.hold) * 0.9 + Math.max(0, t - SK.skadoosh + 3) * 0.04);
      opp.poseOverride = t < SK.skadoosh + 4 ? { anim: 'wuxiHeld', phase: 'active', pt: k } : null;
      if (t < SK.float) o.poseOverride = { anim: 'wuxi', phase: 'active', pt: k };
    }
    if (t === SK.say && o.def.specialVoice) this.ctx.voice?.(o.def.specialVoice, 'Skadoosh!'); // the line from the movie
    // SKADOOSH: as the word ends, the pinky snaps down
    if (t === SK.skadoosh) {
      this.ctx.flash(o.index, 'SKADOOSH!', '');
      this.ctx.shake(0.2);
      P.burst((o.pos.x + opp.pos.x) / 2, 1.3, 0.4, { count: 24, color: '#ffd34d', speed: 0.1, gravity: 0, life: 20 });
    }
    // the bell: a green shockwave rolls out and sends everything to the spirit world
    if (t === SK.world) {
      this.ctx.flash(opp.index, 'SPIRIT WORLD', '');
      this.ctx.shake(0.6);
      this.wave.visible = true;
      this.boomX = (o.pos.x + opp.pos.x) / 2;
      P.burst(this.boomX, 1.3, 0.5, { count: 110, color: '#5dff8a', speed: 0.27, gravity: 0, life: 42 });
      P.burst(this.boomX, 1.3, 0.5, { count: 50, color: '#d8ffe0', speed: 0.2, gravity: 0, life: 30 });
      this.ctx.rings.spawn(this.boomX, 1.3, '#5dff8a', { grow: 0.55, life: 26, flat: false });
      this.ctx.rings.spawn(this.boomX, 0.05, '#3ddc6a', { grow: 0.45, life: 30 });
      this.ctx.sfx.thud?.();
      this.ctx.whiteFlash?.(450);
      this.ctx.spiritWorld?.(true);
    }
    // the Dragon Warrior: Po floats up, meditating, and a golden chi dragon comes out of him
    if (t === SK.float) { o.poseOverride = { anim: 'float', phase: 'active', pt: 1 }; this.ctx.flash(o.index, 'DRAGON WARRIOR', ''); }
    if (t >= SK.float && t < SK.land) {
      o.pos.y = Math.min(1, (t - SK.float) / 16) * 1.1 + Math.sin(t * 0.12) * 0.05;
      o.vel.y = 0; o.vel.x = 0;
      if (t % 2 === 0) P.burst(o.pos.x + (Math.random() - 0.5) * 0.8, o.pos.y + 0.2 + Math.random() * 1.2, 0.3, { count: 2, color: '#ffd34d', speed: 0.02, gravity: -0.002, life: 20 });
    }
    if (t >= SK.land && t < SK.land + 10) { o.pos.y = Math.max(0, 1.1 * (1 - (t - SK.land) / 10)); o.vel.y = 0; }
    if (t === SK.land) o.poseOverride = { anim: 'gold', phase: 'active', pt: 1 };
    if (t >= SK.emerge && t <= SK.strike + 18) {
      const cx = o.pos.x, cy = o.pos.y + 1.0;
      let x, y, z;
      if (t < SK.roar) {
        // spiralling up around him
        const k = (t - SK.emerge) / (SK.roar - SK.emerge), a = k * Math.PI * 3.2 - Math.PI / 2;
        x = cx + Math.cos(a) * 1.5 * Math.min(1, k * 3); y = cy + k * 1.5; z = Math.sin(a) * 1.5 * Math.min(1, k * 3);
      } else if (t < SK.dive) {
        // rearing up over the opponent and roaring
        const k = (t - SK.roar) / (SK.dive - SK.roar), e = k * k * (3 - 2 * k);
        const hx = cx + this.side * 1.2;
        x = this.path[0].x + (hx - this.path[0].x) * Math.min(1, e * 1.5); y = cy + 1.7 + Math.sin(k * Math.PI) * 0.25; z = this.path[0].z * (1 - e);
        if (t === SK.roar + 4) { this.ctx.shake(0.4); this.ctx.rings.spawn(x, y, '#ffd34d', { grow: 0.3, life: 20, flat: false }); }
      } else {
        // diving at them and straight through them (hits as the head passes), then on and away
        const k = (t - SK.dive) / (SK.strike - SK.dive);
        const sx = this.diveFrom ?? (this.diveFrom = { x: this.path[0].x, y: this.path[0].y, z: this.path[0].z || 0 });
        const tx = opp.pos.x, ty = opp.pos.y + 1.0;
        if (k <= 1) { const e = k * k; x = sx.x + (tx - sx.x) * e; y = sx.y + (ty - sx.y) * e; z = sx.z * (1 - k); }
        else { const u = k - 1; x = tx + this.side * u * 4.5; y = ty + u * u * 2.5 - u * 0.3; z = -u * 0.8; }
      }
      this.path.unshift({ x, y, z });
      if (this.path.length > 160) this.path.pop();
    }
    if (t === SK.strike) {
      this.held = false;
      this.struck = true;
      opp.poseOverride = null;
      strike(o, this.move, { damage: this.move.damage, knockdown: true, launch: 0.16, push: 0.22, hitstun: 30 }, o.pos.x);
      P.burst(opp.pos.x, 1.2, 0.5, { count: 90, color: '#ffd34d', speed: 0.24, gravity: 0.002, life: 36 });
      P.burst(opp.pos.x, 1.2, 0.5, { count: 50, color: '#ff8a1f', speed: 0.2, gravity: 0.003, life: 30 });
      P.burst(opp.pos.x, 1.2, 0.5, { count: 30, color: '#ffffff', speed: 0.16, gravity: 0, life: 22 });
      this.ctx.rings.spawn(opp.pos.x, 1.2, '#ffc23a', { grow: 0.4, life: 22, flat: false });
      this.ctx.shake(0.6);
      this.ctx.sfx.hit?.(true);
      o.endSpecial();
    }
    if (t >= SK.end) { o.poseOverride = null; this.finish(); } // he stays Kung Fu Panda for the rest of the round
  }
  // the dragon model: it circles around Po, then rises up behind him, faces the opponent,
  // charges up and breathes a golden chi laser at them
  placeModel(grow, fade, time) {
    const m = this.model, t = this.t, o = this.owner, opp = this.opp;
    m.visible = t >= SK.emerge && fade > 0.01;
    if (!m.visible) return;
    const side = this.side, cx = o.pos.x, base = o.pos.y;
    let x, y, z, yaw;
    if (t < SK.roar) {
      // round and round him, rising
      const k = (t - SK.emerge) / (SK.roar - SK.emerge), a = k * Math.PI * 4;
      x = cx + Math.sin(a) * 1.6; z = Math.cos(a) * 1.6 - 0.2; y = base + 1.5 + k * 0.6 + Math.sin(time * 3) * 0.08;
      yaw = a + Math.PI / 2; // facing the way it's going round
    } else {
      // up behind him, facing the opponent (the model's head looks along -x)
      const k = Math.min(1, (t - SK.roar) / 10), e = k * k * (3 - 2 * k);
      const from = this.orbitEnd || (this.orbitEnd = { x: m.position.x, y: m.position.y, z: m.position.z });
      x = from.x + (cx - side * 0.5 - from.x) * e; y = from.y + (base + 2.4 - from.y) * e; z = from.z + (-0.7 - from.z) * e;
      yaw = side > 0 ? Math.PI : 0;
      y += Math.sin(time * 2.5) * 0.06;
    }
    m.position.set(x, y, z);
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m.quaternion.slerp(want, this.placed ? 0.2 : 1);
    this.placed = true;
    const roar = t >= SK.roar && t < SK.strike ? 1 + 0.05 * Math.sin((t - SK.roar) * 0.9) : 1;
    m.scale.setScalar((0.25 + 0.75 * grow) * roar);
    if (this.wave) { this.wave.uTime.value = time; this.wave.uAmp.value = 0.35; } // just a little life in the coils
    m.traverse((x2) => {
      const mt = x2.userData.mat; if (!mt) return;
      mt.emissiveIntensity = 0.45 + 0.25 * Math.sin(time * 6) + (t >= SK.dive && t < SK.strike + 10 ? 0.4 : 0);
      mt.transparent = fade < 1; mt.opacity = fade;
    });
    // its mouth: up at the head, out in front (scaled with the model)
    const s = m.scale.x;
    this.mouth = new THREE.Vector3(x + side * 0.75 * s, y + 1.25 * s, z + 0.25);
  }
  // charging in its mouth, then a thick golden beam into the opponent
  drawLaser(time) {
    const t = this.t, opp = this.opp, mouth = this.mouth;
    const charging = t >= SK.roar + 6 && t < SK.dive, firing = t >= SK.dive && t < SK.strike + 12;
    this.charge.visible = !!mouth && (charging || firing);
    if (this.charge.visible) {
      const k = charging ? (t - SK.roar - 6) / (SK.dive - SK.roar - 6) : 1;
      this.charge.position.copy(mouth);
      this.charge.scale.setScalar(0.2 + 0.8 * k + Math.sin(time * 30) * 0.06);
      this.charge.material.opacity = 0.95;
    }
    this.laser.visible = this.laserIn.visible = !!mouth && firing;
    if (!this.laser.visible) return;
    const target = new THREE.Vector3(opp.pos.x, opp.pos.y + 1.1, 0.1);
    const reach = Math.min(1, (t - SK.dive + 1) / 6), fadeL = t > SK.strike ? 1 - (t - SK.strike) / 12 : 1;
    const end = mouth.clone().lerp(target, reach);
    const span = (mesh, w) => {
      const d = new THREE.Vector3().subVectors(end, mouth), len = d.length() || 0.001;
      mesh.position.copy(mouth).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
      mesh.scale.set(w, len, w);
    };
    const pulse = 1 + 0.15 * Math.sin(time * 40);
    span(this.laser, 0.28 * pulse * (0.5 + 0.5 * fadeL));
    span(this.laserIn, 0.1 * pulse * (0.5 + 0.5 * fadeL));
    this.laserMat.opacity = 0.75 * fadeL;
    this.laserCore.opacity = 0.95 * fadeL;
    if (reach >= 1 && Math.random() < 0.6) this.ctx.particles.burst(target.x, target.y, 0.3, { count: 4, color: Math.random() < 0.5 ? '#ffd34d' : '#ffffff', speed: 0.12, gravity: 0.002, life: 18 });
  }
  render(time) {
    const t = this.t, o = this.owner, opp = this.opp;
    // the camera: close on the hands for the finger hold, wide for the dragon
    // the hands: Po's paw on theirs (taken from his hand bone when there is one)
    const hb = o.body?.auto?.bones?.lHand, ob = opp.body?.auto?.bones?.lHand;
    const hand = hb ? hb.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3((o.pos.x + opp.pos.x) / 2, 1.3, 0);
    const theirs = ob ? ob.getWorldPosition(new THREE.Vector3()) : hand;
    const focus = hand.clone().lerp(theirs, 0.5);
    if (t >= SK.hold && t < SK.skadoosh + 6) this.ctx.camera?.({ x: focus.x, y: focus.y + 0.05, half: 0.95, halfH: 0.62, near: 1.6, tilt: 0.05, cut: t === SK.hold || !this.closeUp });
    this.closeUp = t >= SK.hold && t < SK.skadoosh + 6;
    if (t === SK.skadoosh + 6 && !this.cutBack) { this.cutBack = true; this.ctx.camera?.({ x: (o.pos.x + opp.pos.x) / 2, y: 1.45, half: 3.5, halfH: 2.1, cut: true }); }
    else if (t >= SK.float && t < SK.strike + 30) this.ctx.camera?.({ x: (o.pos.x + opp.pos.x) / 2, y: 2.7, half: Math.abs(o.pos.x - opp.pos.x) / 2 + 3.2, halfH: 3.5, tilt: 0.3 });
    // the spark where the fingers meet
    const holding = t >= SK.hold && t < SK.skadoosh;
    this.spark.visible = holding;
    if (holding) {
      // the glowing little finger
      this.spark.position.set(hand.x, hand.y + 0.06, hand.z + 0.15);
      this.spark.scale.setScalar(0.05 + 0.12 * ((t - SK.hold) / (SK.skadoosh - SK.hold)) + Math.sin(time * 20) * 0.01);
      this.spark.material.opacity = 0.95;
    }
    // the blast ring
    if (this.wave.visible) {
      const k = (t - SK.world) / 26;
      if (k > 1) this.wave.visible = false;
      else { this.wave.position.set(this.boomX, 1.3, 0.3); this.wave.scale.setScalar(0.5 + k * 12); this.waveMat.opacity = 0.95 * (1 - k * k); }
    }
    // the dragon
    const grow = Math.min(1, Math.max(0, (t - SK.emerge) / 26));
    const fade = t > SK.strike ? Math.max(0, 1 - (t - SK.strike) / 16) : 1;
    const jaw = t >= SK.roar && t < SK.dive ? Math.min(1, (t - SK.roar) / 4) : t >= SK.dive && t < SK.strike ? 0.6 : 0.15;
    if (this.model) this.placeModel(grow, fade, time);
    else if (t >= SK.emerge) {
      this.dragon.update(this.path, grow, jaw, time, fade);
      // the laser comes out of its mouth: a little in front of the head, along where it's looking
      if (this.path.length > 1 && this.dragon.forward) this.mouth = this.dragon.head.position.clone().addScaledVector(this.dragon.forward, 0.55);
    }
    if (this.model && t >= SK.emerge) this.drawLaser(time); // (only the whole-model fallback breathes a laser)
    this.glow.forEach((sp, i) => {
      const p = this.path[Math.min(this.path.length - 1, i * 5)];
      sp.visible = !!p && t >= SK.emerge && fade > 0;
      if (!sp.visible) return;
      sp.position.set(p.x, p.y, (p.z || 0) + 0.1);
      sp.scale.setScalar((i === 0 ? 1.4 : 0.9) * (1 + 0.15 * Math.sin(time * 9 + i)));
      sp.material.opacity = 0.45 * fade;
    });
    // when it hits, the dragon bursts into golden sparks
    if (t > SK.strike && t < SK.strike + 14 && this.path.length > 2) {
      const p = this.path[Math.floor(Math.random() * Math.min(this.path.length, 60))];
      this.ctx.particles.burst(p.x, p.y, p.z || 0, { count: 3, color: '#ffd34d', speed: 0.05, gravity: 0.002, life: 22 });
    }
  }
}

// the spirit world (Kung Fu Panda): golden sky, a floating stone island to fight on, rocks
// drifting in the air and golden petals. Built by the match when SKADOOSH sends them there.
export function buildSpiritWorld() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#a8916a', roughness: 0.95, flatShading: true });
  const top = new THREE.MeshStandardMaterial({ color: '#d9c48c', roughness: 0.9, flatShading: true });
  const island = new THREE.Mesh(new THREE.CylinderGeometry(11, 6, 3.2, 12, 2), stone);
  island.scale.z = 0.5; island.position.y = -1.62; g.add(island);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.04, 12), top);
  lid.scale.z = 0.5; lid.position.y = -0.03; g.add(lid);
  const rocks = [];
  for (let i = 0; i < 18; i++) {
    const r = 0.5 + ((i * 0.37) % 1) * 2.4;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
    rock.scale.y = 0.6;
    rock.position.set(-26 + ((i * 0.61) % 1) * 52, 1 + ((i * 0.43) % 1) * 13, -9 - ((i * 0.29) % 1) * 30);
    rock.userData = { y: rock.position.y, ph: i };
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.08, 8), top);
    cap.position.y = r * 0.55; rock.add(cap);
    g.add(rock); rocks.push(rock);
  }
  g.userData.update = (time) => { for (const r of rocks) { r.position.y = r.userData.y + Math.sin(time * 0.5 + r.userData.ph) * 0.3; r.rotation.y = time * 0.05 + r.userData.ph; } };
  return g;
}
export function spiritSky() {
  return tex(16, 256, (g) => {
    const l = g.createLinearGradient(0, 0, 0, 256);
    l.addColorStop(0, '#ffcf6e'); l.addColorStop(0.5, '#ffb24d'); l.addColorStop(0.8, '#ffd9a0'); l.addColorStop(1, '#fff0cf');
    g.fillStyle = l; g.fillRect(0, 0, 16, 256);
  });
}

// ── Michael: factory reset ───────────────────────────────────────────────────
// He throws a computer that chases the opponent. When it lands (blocking halves the damage,
// the reset still happens) their buttons get mixed up for move.resetFrames: every button does
// another button's job, a different random mix each time (picked from the match state, so both
// players' games agree online).
const RESET_KEYS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'special'];
function resetMix(seed) {
  let x = (Math.floor(seed) >>> 0) || 1;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  for (let tries = 0; tries < 50; tries++) {
    const to = [...RESET_KEYS];
    for (let i = to.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [to[i], to[j]] = [to[j], to[i]]; }
    if (to.every((k, i) => k !== RESET_KEYS[i])) return Object.fromEntries(RESET_KEYS.map((k, i) => [k, to[i]]));
  }
  return Object.fromEntries(RESET_KEYS.map((k, i) => [k, RESET_KEYS[(i + 1) % RESET_KEYS.length]]));
}
function laptopMesh() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.4, metalness: 0.6 });
  const screen = new THREE.MeshBasicMaterial({ map: tex(128, 80, (c) => {
    c.fillStyle = '#1452c8'; c.fillRect(0, 0, 128, 80);
    c.fillStyle = '#ffffff'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
    c.fillText('FACTORY', 64, 34); c.fillText('RESET', 64, 54);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(24, 64, 80, 5); c.fillStyle = '#fff'; c.fillRect(24, 64, 52, 5);
  }) });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.42), shell);
  g.add(base);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.26), new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.8 }));
  keys.rotation.x = -Math.PI / 2; keys.position.set(0, 0.019, 0.04); g.add(keys);
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, -0.2);
  lid.rotation.x = -0.35;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.025), shell); back.position.y = 0.2; lid.add(back);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.35), screen); disp.position.set(0, 0.2, 0.014); lid.add(disp);
  g.add(lid);
  return g;
}
// (ctx.fatality: Michael's fatality — no damage: ctx.onHit() when it reaches them)
export class Computer extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    this.x = o.pos.x + o.facing * 0.6;
    this.y = o.pos.y + 1.6;
    this.laptop = laptopMesh();
    this.group.add(this.laptop);
    this.spin = 0;
    ctx.sfx.whoosh?.();
    o.endSpecial(); // Michael can move again while it flies
  }
  tick() {
    this.t++;
    const opp = this.opp;
    const dx = opp.pos.x - this.x, dy = opp.pos.y + 1.3 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 0.21;
    this.x += (dx / d) * sp;
    this.y += (dy / d) * sp + (this.t < 14 ? 0.05 * (1 - this.t / 14) : 0); // a little lob at first
    this.spin += 0.35;
    if (d < 0.6 && this.fatal) { this.ctx.onHit?.(this.x, this.y); this.finish(); return; }
    if (d < 0.6) {
      const r = strike(this.owner, this.move, { damage: this.move.damage, hitstun: this.move.hitstun }, this.x);
      if (r === 'gold') { // gold Ori: the laptop smashes to pieces on him
        this.ctx.flash(opp.index, 'COMPUTER BROKEN', 'BY THE GOLD');
        for (const [c, n] of [['#2b2f36', 24], ['#9aa3ad', 14], ['#3a8bff', 12], ['#ffd23f', 12]]) this.ctx.particles.burst(this.x, this.y, 0.3, { count: n, color: c, speed: 0.14, gravity: 0.009, dir: -sign(opp.pos.x - this.owner.pos.x), life: 26 });
        this.ctx.shake(0.25);
        this.ctx.sfx.block?.();
      }
      if (r === 'hit' && opp.alive) {
        opp.scrambled = this.move.resetFrames;
        opp.scramble = resetMix(this.owner.clock * 7919 + opp.clock * 31 + Math.round(opp.hp * 1000) + Math.round(opp.pos.x * 1000));
        this.ctx.flash(this.owner.index, 'FACTORY RESET!', 'BUTTONS MIXED UP FOR 5 S');
        this.ctx.particles.burst(this.x, this.y, 0.3, { count: 40, color: '#3a8bff', speed: 0.14, gravity: 0.003 });
        this.ctx.particles.burst(this.x, this.y, 0.3, { count: 20, color: '#ffffff', speed: 0.1, gravity: 0.003 });
        this.ctx.shake(0.25);
        this.ctx.sfx.zap?.();
      }
      this.finish();
      return;
    }
    if (this.t > 600 || (!opp.alive && !this.fatal)) this.finish();
  }
  render() {
    this.group.position.set(this.x, this.y, 0.2);
    this.laptop.rotation.set(this.spin * 0.6, this.spin, this.spin * 0.3);
  }
}

// a blue "factory reset" screen over the head of someone whose buttons are mixed up, with a
// progress bar that runs out when they're back to normal
export class ResetIcon {
  constructor(scene) {
    this.scene = scene;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(160, 64, (c) => {
      c.fillStyle = '#1452c8'; c.beginPath(); c.roundRect?.(2, 2, 156, 60, 10); c.fill?.(); if (!c.roundRect) c.fillRect(2, 2, 156, 60);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke?.();
      c.fillStyle = '#ffffff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('⟳ RESET', 80, 40);
    }), transparent: true, depthWrite: false }));
    this.sprite.scale.set(0.7, 0.28, 1);
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#7fd0ff', depthWrite: false }));
    this.sprite.visible = this.bar.visible = false;
    scene.add(this.sprite, this.bar);
  }
  render(f, t) {
    const on = f.scrambled > 0 && f.alive;
    this.sprite.visible = this.bar.visible = on;
    if (!on) return;
    const y = f.pos.y + 2.45 * (f.reachScale || 1) + Math.sin(t * 3) * 0.04;
    this.sprite.position.set(f.pos.x, y, 0.3);
    this.sprite.material.rotation = Math.sin(t * 9) * 0.04; // glitchy shake
    const k = f.scrambled / 300;
    this.bar.scale.set(0.6 * k, 0.04, 1);
    this.bar.position.set(f.pos.x - 0.3 * (1 - k), y - 0.19, 0.3);
  }
  dispose() { this.scene.remove(this.sprite, this.bar); this.sprite.material.map?.dispose(); this.sprite.material.dispose(); this.bar.material.dispose(); }
}

// ── Oron: VIVA LA FRANCE ─────────────────────────────────────────────────────
// He shouts "Viva la France!" and turns French (his French model) for move.frenchFrames: a
// baguette in his hand (more reach and damage) and a Dragon Ball style aura in the colours of
// the French flag. The aura and baguette are drawn by FrenchAura below.
const FR_BLUE = '#2b5bd7', FR_WHITE = '#ffffff', FR_RED = '#e8333b';
const FR_FREEZE = 120; // frames the fight pauses for the transformation
class France extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    o.french = m.frenchFrames;
    o.breadBroken = false; // a fresh baguette
    ctx.flash(o.index, 'VIVA LA FRANCE!', 'BAGUETTE · +REACH · +DAMAGE');
    ctx.shout?.(o.def);
    ctx.shake(0.25);
    for (const [c, dx] of [[FR_BLUE, -0.35], [FR_WHITE, 0], [FR_RED, 0.35]]) {
      ctx.particles.burst(o.pos.x + dx, o.pos.y + 1.1, 0.3, { count: 30, color: c, speed: 0.14, gravity: -0.001, life: 34 });
    }
    ctx.rings.spawn(o.pos.x, 0.05, FR_BLUE, { grow: 0.24, life: 24 });
    ctx.rings.spawn(o.pos.x, 0.05, FR_RED, { grow: 0.16, life: 28 });
    o.endSpecial();
    // the fight pauses (like the other specials' cinematics) while the camera pulls back to show
    // the plaza turning French, the Eiffel Tower standing over it; no French time is used up
    o.game.freeze = FR_FREEZE;
    this.duringFreeze = true;
    o.poseOverride = { anim: 'taunt', phase: 'active', pt: 1 };
  }
  tick() {
    this.t++;
    if (this.t === FR_FREEZE - 4) this.owner.poseOverride = null;
    if (this.t >= FR_FREEZE) this.finish();
  }
  render() {
    const o = this.owner, opp = this.opp, t = this.t;
    if (t > 4 && t < FR_FREEZE - 10) this.ctx.camera?.({ x: (o.pos.x + opp.pos.x) / 2 * 0.5, y: 6, half: 13, halfH: 9, near: 8, tilt: -2.5 });
    else if (t >= FR_FREEZE - 10 && !this.camDone) { this.camDone = true; this.ctx.camera?.(null); }
  }
  cleanup() { if (!this.camDone) this.ctx.camera?.(null); if (this.owner.poseOverride?.anim === 'taunt') this.owner.poseOverride = null; }
}

// French-flag aura (blue | white | red, flickering like flames) and the baguette in his lead
// hand, while VIVA LA FRANCE lasts
// Noa's I.V. stand: after her cough she's hooked up to it (a tube from the bag into her arm) and it
// rolls along beside her; her kick-ending combo finisher is her grabbing it and swinging it up
export class IVStand {
  constructor(scene) {
    this.scene = scene;
    this.c = new THREE.Group();     // the grip point (where her hands go when she swings it)
    this.s = new THREE.Group();     // the stand: base at y = 0, top at 1.9
    this.s.position.y = -1.65;
    this.c.add(this.s);
    const metal = new THREE.MeshStandardMaterial({ color: '#cfd4da', roughness: 0.3, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.9, 10), metal); pole.position.y = 0.95; this.s.add(pole);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.035), metal);
      leg.position.set(Math.cos(a) * 0.12, 0.06, Math.sin(a) * 0.12); leg.rotation.y = -a; this.s.add(leg);
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dark); wheel.position.set(Math.cos(a) * 0.24, 0.03, Math.sin(a) * 0.24); this.s.add(wheel);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8), metal); bar.rotation.z = Math.PI / 2; bar.position.y = 1.88; this.s.add(bar);
    for (const x of [0.16, -0.16]) { const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI * 1.4), metal); hook.position.set(x, 1.85, 0); this.s.add(hook); }
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.2, 6, 12), new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.1, transparent: true, opacity: 0.6 }));
    bag.scale.z = 0.45; bag.position.set(0.17, 1.62, 0); this.s.add(bag);
    const fluid = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.12, 6, 12), new THREE.MeshStandardMaterial({ color: '#f6d84a', roughness: 0.2, emissive: '#5a4a00', transparent: true, opacity: 0.9 }));
    fluid.scale.z = 0.4; fluid.position.set(0.17, 1.57, 0); this.s.add(fluid);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.07), new THREE.MeshBasicMaterial({ color: '#ffffff' })); label.position.set(0.17, 1.66, 0.05); this.s.add(label);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), new THREE.MeshBasicMaterial({ color: '#e0233a' })); cross.position.set(0.17, 1.66, 0.052); this.s.add(cross);
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2; this.s.add(cross2);
    const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#eef6ff', transparent: true, opacity: 0.7 }));
    drip.position.set(0.17, 1.38, 0); this.s.add(drip);
    this.bagEnd = new THREE.Object3D(); this.bagEnd.position.set(0.17, 1.33, 0); this.s.add(this.bagEnd);
    this.c.visible = false;
    scene.add(this.c);
    // the tube from the bag to her arm (rebuilt every frame along a sagging curve)
    this.tubeMat = new THREE.MeshStandardMaterial({ color: '#eaf3f8', roughness: 0.2, transparent: true, opacity: 0.9 });
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), this.tubeMat);
    this.tube.frustumCulled = false;
    this.tube.visible = false;
    scene.add(this.tube);
  }
  render(f) {
    const on = !!f.iv && f.opacity > 0.05;
    this.c.visible = on;
    this.tube.visible = on;
    if (!on) return;
    const bones = f.body?.auto?.bones;
    const swinging = f.state === 'attack' && f.move?.launcher && bones?.lHand && bones?.rHand;
    if (swinging) {
      // in both hands, held near the top, the wheeled base swinging out along her arms
      const l = bones.lHand.getWorldPosition(new THREE.Vector3()), r = bones.rHand.getWorldPosition(new THREE.Vector3());
      const grip = l.add(r).multiplyScalar(0.5);
      const sh = bones.lSh.getWorldPosition(new THREE.Vector3()).add(bones.rSh.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      const u = grip.clone().sub(sh);
      if (u.lengthSq() < 1e-6) u.set(f.facing, 0, 0);
      this.c.position.copy(grip);
      this.c.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), u.normalize());
    } else {
      // standing beside her (behind, on the side away from the opponent), rolling along
      this.c.position.set(f.pos.x - f.facing * 0.78, 1.65, -0.32);
      this.c.quaternion.identity();
    }
    // the tube: from the bag, sagging, into her back arm (the elbow's crook)
    const a = this.bagEnd.getWorldPosition(new THREE.Vector3());
    const arm = bones?.rEl && bones?.rHand ? bones.rEl.getWorldPosition(new THREE.Vector3()).lerp(bones.rHand.getWorldPosition(new THREE.Vector3()), 0.6)
      : new THREE.Vector3(f.pos.x, f.pos.y + 1.1, 0);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const k = i / 7, sag = Math.sin(k * Math.PI) * 0.22;
      pts.push(new THREE.Vector3(a.x + (arm.x - a.x) * k, a.y + (arm.y - a.y) * k - sag, a.z + (arm.z - a.z) * k + 0.05));
    }
    this.tube.geometry.dispose();
    this.tube.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 5, false);
  }
  dispose() {
    for (const o of [this.c, this.tube]) { this.scene.remove(o); o.traverse((x) => { x.geometry?.dispose?.(); x.material?.dispose?.(); }); }
  }
}

export class FrenchAura {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    // the aura: Dragon Ball style flames licking up around him in blue, white and red
    const flame = tex(64, 128, (g) => {
      const grd = g.createRadialGradient(32, 92, 2, 32, 80, 46);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      // a teardrop: round at the bottom, pulled to a point at the top
      g.beginPath();
      g.moveTo(32, 2);
      g.bezierCurveTo(46, 40, 62, 70, 60, 96);
      g.bezierCurveTo(58, 120, 6, 120, 4, 96);
      g.bezierCurveTo(2, 70, 18, 40, 32, 2);
      g.fill();
    });
    const colors = [FR_BLUE, FR_WHITE, FR_RED].map((c) => new THREE.Color(c));
    this.flames = Array.from({ length: 34 }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: colors[i % 3], transparent: true, opacity: 0, depthWrite: false })); // solid colours: a glow would vanish on the bright arena
      sp.userData = { band: i % 3, phase: (i * 0.618) % 1, x: ((i * 0.37) % 1) * 2 - 1, speed: 0.9 + ((i * 0.53) % 1) * 0.6 };
      this.group.add(sp);
      return sp;
    });
    this.group.visible = false;
    scene.add(this.group);
    // the baguette: golden crust with diagonal scores
    this.bread = new THREE.Group();
    const crust = new THREE.MeshStandardMaterial({ color: '#c8873a', roughness: 0.75 });
    const score = new THREE.MeshStandardMaterial({ color: '#f1d39a', roughness: 0.9 });
    const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.05, 6, 12), crust); // long: it reaches 50% further
    loaf.position.y = 0.5; // from the hand outwards along +y
    this.bread.add(loaf);
    for (let i = 0; i < 6; i++) {
      const sc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), score);
      sc.position.set(0, 0.12 + i * 0.16, 0.05);
      sc.rotation.z = 0.5;
      this.bread.add(sc);
    }
    this.bread.visible = false;
    scene.add(this.bread);
    // the slash: a crescent swoosh where the baguette swings (from high behind to low in front)
    this.swooshMat = new THREE.MeshBasicMaterial({ color: '#ffd978', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: '#e07a1f', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.swoosh = new THREE.Group();
    this.swoosh.add(new THREE.Mesh(new THREE.RingGeometry(0.62, 1.2, 40, 1, -0.75, 2.6), this.swooshMat));
    this.swoosh.add(new THREE.Mesh(new THREE.RingGeometry(1.12, 1.28, 40, 1, -0.75, 2.6), this.edgeMat));
    this.swoosh.visible = false;
    scene.add(this.swoosh);
  }
  render(f, time) {
    const on = f.french > 0 && f.alive;
    this.group.visible = on;
    this.bread.visible = false;
    // the slash swoosh while the baguette swings
    const slashing = on && f.bread && f.state === 'attack' && f.move && f.altRig && f.baguetteAnim(f.move) === 'slash' && (f.phase === 'active' || (f.phase === 'recovery' && f.phaseProgress() < 0.5));
    this.swoosh.visible = !!slashing;
    if (slashing) {
      const k = f.phase === 'active' ? f.phaseProgress() : 1 + f.phaseProgress();
      const h = f.reachScale || 1;
      this.swoosh.position.set(f.pos.x + f.facing * 0.35 * h, f.pos.y + 1.15 * h, 0.35);
      this.swoosh.scale.set(f.facing * h, h, 1);
      this.swoosh.rotation.z = f.facing * (0.4 - 0.5 * Math.min(1, k)); // sweeps down with the swing
      const op = k < 1 ? 0.35 + 0.5 * k : Math.max(0, 0.85 * (1 - (k - 1) * 2));
      this.swooshMat.opacity = Math.min(0.9, op * 1.05);
      this.edgeMat.opacity = op;
    }
    if (!on) return;
    const h = f.reachScale || 1;
    const fade = Math.min(1, f.french / 20);
    this.group.position.set(f.pos.x, f.pos.y, 0);
    // flames rise from his feet past his head, swaying, growing then thinning out; the flag's
    // colours as bands across him (blue behind, white in the middle, red in front)
    for (const sp of this.flames) {
      const u = sp.userData, k = (time * 1.5 * u.speed + u.phase) % 1;
      const band = (u.band - 1) * 0.32 * f.facing;
      const sway = Math.sin(time * 6 + u.phase * 12) * 0.06;
      sp.position.set(band + u.x * 0.16 + sway * (0.5 + k), (0.05 + k * 2.2) * h, (u.x > 0 ? 0.18 : -0.18) * (1 - k * 0.5));
      const w = (0.5 - 0.26 * k) * h, ht = (0.85 + 0.4 * Math.sin(k * Math.PI)) * h;
      sp.scale.set(w, ht, 1);
      sp.material.opacity = fade * Math.min(1, Math.sin(Math.PI * k) * 1.4) * (u.band === 1 ? 0.7 : 0.85);
    }
    // the baguette: from the lead hand, pointing along the forearm
    const bones = f.body?.auto?.bones;
    this.bread.visible = false;
    if (f.bread && bones?.lHand && bones?.lEl) { // (gone once it broke on gold Ori)
      const a = bones.lEl.getWorldPosition(new THREE.Vector3()), b = bones.lHand.getWorldPosition(new THREE.Vector3());
      const d = b.clone().sub(a);
      if (d.lengthSq() > 1e-6) {
        this.bread.visible = true;
        this.bread.position.copy(b).addScaledVector(d.normalize(), -0.04);
        this.bread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        this.bread.scale.setScalar(f.reachScale || 1);
      }
    }
  }
  // flame-like specks rising off him (called from the match render with the particle system)
  sparks(f, particles) {
    if (!(f.french > 0) || !f.alive || Math.random() > 0.7) return;
    const k = Math.random(), c = k < 0.33 ? FR_BLUE : k < 0.66 ? FR_WHITE : FR_RED;
    particles.burst(f.pos.x + (Math.random() - 0.5) * 0.9, f.pos.y + 0.1 + Math.random() * 1.8, 0.25, { count: 2, color: c, speed: 0.02, gravity: -0.004, life: 20 });
  }
  dispose() {
    this.scene.remove(this.group, this.bread, this.swoosh);
    for (const g of [this.group, this.bread, this.swoosh]) g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

// ── Snir: bones ──────────────────────────────────────────────────────────────
// Snir turns into a skeleton (an x-ray flash), the skeleton falls apart into a pile of bones,
// the bones fly at the opponent and pierce straight through them (close-up; they're held in
// place, 5 hits), the bones rebuild into the skeleton on their other side, and the skeleton
// becomes Snir again. The opponent never moves: stunned on the spot until it's over.
export const SN = { xray: 16, fall: 34, lift: 44, pierce: 72, built: 96, back: 110, end: 116 };
const BONE_HITS = 5;
function boneMesh(mat) {
  const g = new THREE.Group(); // a cartoon bone along +y, 0.34 long
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), mat); g.add(shaft);
  for (const y of [0.17, -0.17]) for (const x of [0.028, -0.028]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), mat); knob.position.set(x, y, 0); g.add(knob);
  }
  return g;
}
function skullMesh(mat, dark) {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat); cap.scale.set(0.95, 1, 1.05); g.add(cap);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), mat); jaw.position.set(0, -0.13, 0.05); g.add(jaw);
  for (const x of [0.055, -0.055]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), dark); eye.position.set(x, -0.01, 0.12); g.add(eye); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3), dark); nose.position.set(0, -0.065, 0.145); nose.rotation.x = Math.PI; g.add(nose);
  return g;
}
// the skeleton's parts: where each sits standing (local, facing +z), as [mesh, slot]
export function skeletonParts(mat, dark, h) {
  const parts = [];
  const bone = (x1, y1, x2, y2, thick = 1) => { // a bone from (x1,y1) to (x2,y2)
    const m = boneMesh(mat), len = Math.hypot(x2 - x1, y2 - y1);
    m.scale.set(thick, len / 0.34, thick);
    parts.push([m, { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: 0, rz: Math.atan2(x1 - x2, y2 - y1) }]);
  };
  const skull = skullMesh(mat, dark); skull.scale.setScalar(1.15);
  parts.push([skull, { x: 0, y: 1.66 * h, z: 0, rz: 0, skull: true }]);
  for (let i = 0; i < 6; i++) { // spine
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 8), mat);
    parts.push([v, { x: 0, y: (0.98 + i * 0.085) * h, z: -0.06, rz: 0 }]);
  }
  for (let i = 0; i < 4; i++) { // ribs
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.012, 0.016, 6, 18), mat);
    r.scale.set(1, 0.62, 1); r.rotation.x = Math.PI / 2;
    const g = new THREE.Group(); g.add(r);
    parts.push([g, { x: 0, y: (1.4 - i * 0.075) * h, z: 0, rz: 0 }]);
  }
  const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 16), mat); pelvis.scale.set(1, 0.6, 1); pelvis.rotation.x = Math.PI / 2;
  const pg = new THREE.Group(); pg.add(pelvis); parts.push([pg, { x: 0, y: 0.92 * h, z: 0, rz: 0 }]);
  for (const s of [1, -1]) {
    bone(s * 0.04, 1.47 * h, s * 0.22, 1.45 * h, 0.8);                // collarbone
    bone(s * 0.23, 1.44 * h, s * 0.27, 1.13 * h);                     // upper arm
    bone(s * 0.27, 1.12 * h, s * 0.3, 0.86 * h, 0.85);                // forearm
    bone(s * 0.1, 0.9 * h, s * 0.11, 0.5 * h, 1.15);                  // thigh
    bone(s * 0.11, 0.49 * h, s * 0.11, 0.08 * h, 1.05);               // shin
  }
  return parts;
}
const ease = (k) => k * k * (3 - 2 * k);
// (ctx.fatality: Snir's fatality (fatalities.js) — no hits: ctx.onPierce instead)
export class Shatter extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    // the fatality: his bones land in a heap first, and rebuild him after a beat
    // (and slower: the bones take their time going through them)
    const P = 120;
    this.S = this.fatal ? { xray: 20, fall: 42, lift: 56, pierce: P, heap: P + 22, rise: P + 42, built: P + 74, back: P + 90, end: P + 96 } : SN;
    const opp = this.opp;
    this.dir = sign(opp.pos.x - o.pos.x);
    const past = this.fatal ? 2.6 : 1.4; // (the fatality: further past them, clear of what's left of them)
    if (Math.abs(opp.pos.x + this.dir * past) > PHYS.arenaHalf - 0.3) opp.pos.x = this.dir * (PHYS.arenaHalf - 0.3 - past); // cornered: make room behind them
    this.from = o.pos.x;
    this.lockX = opp.pos.x;
    this.to = opp.pos.x + this.dir * past; // where he rebuilds: their other side
    this.hits = 0;
    this.h = (o.def.heightCm || 175) / 175;
    this.mat = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.55, transparent: true, opacity: 0 });
    this.dark = new THREE.MeshBasicMaterial({ color: '#1b1410', transparent: true, opacity: 0 });
    this.parts = skeletonParts(this.mat, this.dark, this.h).map(([mesh, slot], i) => {
      this.group.add(mesh);
      // where it lands in the pile, and its place in the flying volley
      const pile = { x: Math.sin(i * 12.9) * 0.55, y: 0.04 + (i % 3) * 0.03, z: Math.cos(i * 7.7) * 0.35, rz: Math.PI / 2 + Math.sin(i * 5.3) * 0.6, ry: i * 1.7 };
      const fly = { lag: slot.skull ? -0.25 : (i % 7) * 0.26 + (i % 2) * 0.1, y: slot.skull ? 1.45 : 0.55 + ((i * 7) % 13) / 13 * 1.2, z: Math.sin(i * 3.1) * 0.22, spin: (i % 3 - 1) * 0.35 };
      return { mesh, slot, pile, fly };
    });
    if (!this.fatal) ctx.flash(o.index, 'SHATTER', '');
    ctx.sfx.teleport();
  }
  cleanup() { this.mat.dispose(); this.dark.dispose(); this.ctx.camera?.(null); }
  // the volley's front, and how far through them it is
  front(t) {
    const k = ease(Math.min(1, Math.max(0, (t - this.S.lift) / (this.S.pierce - this.S.lift)))), x = this.from + (this.to + this.dir * 0.8 - this.from) * k;
    return this.blocked && (x - this.stopX) * this.dir > 0 ? this.stopX : x; // gold Ori: they can't get through
  }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp;
    o.invuln = 2; o.vel.x = 0;
    o.opacity = t < this.S.xray ? 1 - t / this.S.xray : t < this.S.built ? 0 : Math.min(1, (t - this.S.built) / (this.S.back - this.S.built));
    if (t === this.S.xray) { this.ctx.whiteFlash?.(160); this.ctx.shake(0.15); }
    if (t === this.S.fall - 5) this.ctx.voice?.(o.def.specialVoice, ''); // the clatter: its first knock as the bones hit the floor
    if (t === this.S.fall + 2) this.ctx.shake(0.12); // the bones clatter down
    // gold Ori: the bones smash against the gold, fall in a pile and he rebuilds where he started
    if (t === this.S.lift && opp.gold > 0 && !this.fatal) {
      this.blocked = true; this.stopX = this.lockX - this.dir * 0.35;
      opp.goldSoak(o);
    }
    if (this.blocked) {
      if (!this.smashed && (this.front(t + 1) - this.stopX) * this.dir >= 0) {
        this.smashed = t;
        this.ctx.flash(opp.index, 'BLOCKED', 'THE BONES SHATTER ON THE GOLD');
        this.ctx.particles.burst(this.stopX, 1.1, 0.3, { count: 30, color: '#ffd23f', speed: 0.15, gravity: 0.004, life: 16 });
        this.ctx.particles.burst(this.stopX, 1.1, 0.3, { count: 26, color: '#efe6cf', speed: 0.12, gravity: 0.009, dir: -this.dir, life: 24 });
        this.ctx.shake(0.3);
        this.ctx.sfx.block?.();
      }
      if (t >= this.S.end) { o.facing = sign(opp.pos.x - o.pos.x); this.finish(); }
      return;
    }
    // they're held in place while the bones go through them
    if (t >= this.S.lift && opp.alive && opp.state !== 'ko') {
      opp.pos.x = this.lockX; opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2;
    }
    // piercing: a hit each time a wave of bones passes through them
    const fr = this.front(t);
    if (t > this.S.lift && t <= this.S.pierce && this.hits < BONE_HITS && (fr - this.lockX) * this.dir > -0.2 + this.hits * 0.42) this.pierce();
    if (t === this.S.pierce) { while (this.hits < BONE_HITS) this.pierce(); o.pos.x = this.to; } // (all the hits are the bones'; invisible, he'll rebuild over there)
    if (t >= this.S.end) { o.facing = sign(opp.pos.x - o.pos.x); this.finish(); }
  }
  pierce() {
    const o = this.owner, opp = this.opp;
    const last = ++this.hits === BONE_HITS;
    // no knockdown or push: they stay standing where they are, stunned until Snir is back
    if (this.fatal) this.ctx.onPierce?.(this.hits);
    else strike(o, this.move, { damage: this.move.damage / BONE_HITS, hitstun: this.S.back - this.t + 6, push: 0, noLimit: true }, opp.pos.x);
    opp.vel.x = 0;
    // splinters out of both sides of them
    for (const s of [-1, 1]) this.ctx.particles.burst(opp.pos.x + s * 0.2, opp.pos.y + 0.7 + Math.random() * 0.8, 0.3, { count: 8, color: s === this.dir ? '#efe6cf' : '#c41d2a', speed: 0.09, gravity: 0.006, dir: this.dir, life: 18 });
    this.ctx.shake(last ? 0.35 : 0.14);
    this.ctx.sfx.hit?.(last);
  }
  render(time) {
    const o = this.owner, opp = this.opp, t = this.t, d = this.dir;
    o.rig.setOpacity(o.opacity);
    const skel = t < this.S.xray ? t / this.S.xray : t < this.S.built ? 1 : Math.max(0, 1 - (t - this.S.built) / (this.S.back - this.S.built));
    this.mat.opacity = skel; this.dark.opacity = skel;
    this.group.visible = skel > 0.01;
    this.group.position.set(0, 0, 0.12);
    const fr = this.front(t);
    for (const p of this.parts) {
      const { slot, pile, fly } = p, m = p.mesh;
      // standing at his start / at the far side, as a pile, and in flight
      const stand = (cx) => ({ x: cx + slot.x * d, y: slot.y, z: slot.z, rz: slot.rz * d, ry: 0 });
      const lying = { x: this.from + pile.x, y: pile.y, z: pile.z, rz: pile.rz, ry: pile.ry };
      const flying = { x: fr - d * fly.lag, y: fly.y, z: fly.z, rz: slot.skull ? 0 : -d * Math.PI / 2, ry: slot.skull ? d * Math.PI / 2 : 0 };
      let a, b, k;
      // gold Ori: from the smash, the bones bounce back and drop in a pile, then rebuild at the start
      const pile2 = this.blocked ? { x: this.stopX - d * (0.3 + Math.abs(pile.x) * 1.4), y: pile.y, z: pile.z, rz: pile.rz, ry: pile.ry } : null;
      const rebuild = this.smashed ? Math.max(this.S.pierce, this.smashed + 18) : this.S.pierce;
      if (this.blocked && this.smashed && t >= this.smashed) {
        const at = { ...flying, x: this.stopX - d * fly.lag };
        if (t < rebuild) { a = at; b = pile2; k = Math.min(1, (t - this.smashed) / 16); k = k * k; }
        else if (t < this.S.built) { a = pile2; b = stand(this.from); k = ease((t - rebuild) / (this.S.built - rebuild)); }
        else { a = b = stand(this.from); k = 0; }
        m.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k + (t < rebuild ? Math.sin(Math.min(1, (t - this.smashed) / 16) * Math.PI) * 0.35 : 0), a.z + (b.z - a.z) * k);
        m.rotation.set(t < rebuild ? (t - this.smashed) * 0.4 * fly.spin : 0, a.ry + (b.ry - a.ry) * k, a.rz + (b.rz - a.rz) * k, 'YXZ');
        continue;
      }
      if (t < this.S.xray) { a = b = stand(this.from); k = 0; }
      else if (t < this.S.fall) { a = stand(this.from); b = lying; k = Math.pow((t - this.S.xray) / (this.S.fall - this.S.xray), 2); }      // collapsing (falling)
      else if (t < this.S.lift) { a = lying; b = { ...flying, x: this.from - d * fly.lag * 0.4 }; k = ease((t - this.S.fall) / (this.S.lift - this.S.fall)); } // rising, turning into spears
      else if (t < this.S.pierce) { a = b = flying; k = 0; }                                                                 // flying through them
      else if (this.fatal && t < this.S.rise) { // (the fatality: falling into a heap over there, lying a moment)
        a = { ...flying, x: this.front(this.S.pierce) - d * fly.lag }; b = { ...lying, x: this.to + pile.x * 0.8 };
        k = Math.min(1, (t - this.S.pierce) / (this.S.heap - this.S.pierce)); k *= k;
      } else if (this.fatal && t < this.S.built) { a = { ...lying, x: this.to + pile.x * 0.8 }; b = stand(this.to); k = ease((t - this.S.rise) / (this.S.built - this.S.rise)); } // …then rising back into him
      else if (t < this.S.built) { a = { ...flying, x: this.front(this.S.pierce) - d * fly.lag }; b = stand(this.to); k = ease((t - this.S.pierce) / (this.S.built - this.S.pierce)); } // rebuilding
      else { a = b = stand(this.to); k = 0; }
      m.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      const spin = t >= this.S.lift && t < this.S.pierce ? time * 10 * fly.spin : 0;
      m.rotation.set(spin, a.ry + (b.ry - a.ry) * k, a.rz + (b.rz - a.rz) * k, 'YXZ');
    }
    // the camera: close in on them as the bones go through, then back out
    if (t >= this.S.lift && t < this.S.pierce + 8) this.ctx.camera?.({ x: this.lockX, y: 1.15, half: 1.7, halfH: 1.05, near: 2.4, tilt: 0.04, cut: t === this.S.lift });
    else if (t >= this.S.pierce + 8 && !this.camBack) { this.camBack = true; this.ctx.camera?.(null); }
  }
}

// ── Ido Bohen: giant foot ────────────────────────────────────────────────────
// One smooth sculpted foot (an SDF turned into a mesh with marching cubes, built once):
// heel, ankle bones, Achilles tendon, arch, wide ball and four separate small toes along +x.
// The medial side (big toe, arch) faces +z. The big toe itself is Ido's head, added separately.
const FOOT_DOMAIN = { cx: 0.2, cy: 2.2, cz: 0, half: 2.75 };
const SMALL_TOES = [ // [base x, z, radius, tip x]
  [1.35, 0.1, 0.19, 2.28], [1.27, -0.2, 0.175, 2.12], [1.17, -0.47, 0.16, 1.94], [1.02, -0.71, 0.145, 1.7],
];
const BIG_TOE_TIP = { x: 2.95, y: 0.7, z: 0.98 }; // where Ido's crown goes
function footSdf(x, y, z) {
  const len = (a, b, c) => Math.sqrt(a * a + b * b + c * c);
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);
  const ellipsoid = (px, py, pz, rx, ry, rz) => { const k0 = len(px / rx, py / ry, pz / rz), k1 = len(px / rx / rx, py / ry / ry, pz / rz / rz); return k0 * (k0 - 1) / (k1 || 1e-6); };
  const segment = (px, py, pz, ax, ay, az, bx, by, bz, ra, rb) => { // capsule with radius ra → rb
    const bax = bx - ax, bay = by - ay, baz = bz - az, pax = px - ax, pay = py - ay, paz = pz - az;
    const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return len(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  };
  // heel + midfoot + ball (wider than tall: squash z)
  let d = ellipsoid(x + 1.45, y - 0.56, z, 0.66, 0.58, 0.56);
  d = smin(d, segment(x, y, z / 1.45, -1.15, 0.78, 0, 1.0, 0.36, 0.04, 0.68, 0.34), 0.5);
  d = smin(d, ellipsoid(x - 1.05, y - 0.36, z + 0.02, 0.5, 0.36, 0.86), 0.35);
  // leg, ankle bones, Achilles tendon behind the ankle
  d = smin(d, segment(x, y, z, -0.95, 1.0, 0, -0.95, 6.5, 0, 0.56, 0.72), 0.55);
  d = smin(d, ellipsoid(x + 1.0, y - 1.25, z - 0.5, 0.2, 0.24, 0.12), 0.18);
  d = smin(d, ellipsoid(x + 1.1, y - 1.1, z + 0.5, 0.2, 0.24, 0.12), 0.18);
  d = smin(d, segment(x, y, z, -1.78, 0.9, 0, -1.42, 3.0, 0, 0.26, 0.3), 0.35);
  // base of the big toe (Ido's head grows out of it)
  d = smin(d, segment(x, y, z, 1.0, 0.42, 0.5, 1.62, 0.44, 0.66, 0.38, 0.34), 0.25);
  // small toes: a flat proximal part, then the tip curling down to the floor; small blend keeps the gaps
  for (const [bx, tz, r, tx] of SMALL_TOES) {
    const mx = bx + (tx - bx) * 0.6;
    const toe = Math.min(segment(x, y, z, bx, r + 0.12, tz, mx, r + 0.1, tz * 1.08, r * 1.05, r), segment(x, y, z, mx, r + 0.1, tz * 1.08, tx, r * 0.95, tz * 1.12, r, r * 0.95));
    d = smin(d, toe, 0.07);
  }
  // flat sole, and the inner arch lifted off the floor
  d = smax(d, -y, 0.12);
  d = smax(d, -ellipsoid(x + 0.1, y + 0.1, z - 0.95, 0.95, 0.42, 0.55), 0.2);
  return d;
}
let footGeo = null;
const FOOT_SCALE = 0.75;
function footGeometry() {
  if (footGeo) return footGeo;
  const { cx, cy, cz, half } = FOOT_DOMAIN;
  const res = 88;
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 60000);
  mc.isolation = 0;
  for (let k = 0; k < res; k++) for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const f = (n) => ((n - res / 2) / (res / 2)) * half;
    mc.field[k * res * res + j * res + i] = -footSdf(cx + f(i), cy + f(j), cz + f(k));
  }
  mc.update();
  const n = mc.count * 3;
  const g = new THREE.BufferGeometry();
  const pos = mc.geometry.attributes.position.array.slice(0, n);
  for (let i = 0; i < n; i += 3) { pos[i] = pos[i] * half + cx; pos[i + 1] = pos[i + 1] * half + cy; pos[i + 2] = pos[i + 2] * half + cz; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mc.geometry.attributes.normal.array.slice(0, n), 3));
  // subtle skin tones: pinker sole, heel and toe tips
  const col = new Float32Array(n);
  for (let i = 0; i < n; i += 3) {
    const x = pos[i], y = pos[i + 1];
    const pink = Math.max(Math.max(0, 1 - y / 0.25), Math.max(0, (x - 1.5) / 0.8) * 0.6, Math.max(0, (-x - 1.6) / 0.5) * 0.5);
    col[i] = 1; col[i + 1] = 1 - 0.13 * pink; col[i + 2] = 1 - 0.1 * pink;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mc.geometry.dispose(); mc.material.dispose();
  footGeo = g;
  return g;
}
// build it in the background so the first stomp doesn't hitch
setTimeout(() => { try { footGeometry(); } catch { /* built on first use instead */ } }, 2500);

// Grow Ido's neck out of the foot: find the ring where his head was cut off, run a skin "sleeve"
// from the big-toe mound into it (covering the cut edge), and tint the foot to his own skin tone.
const TOE_ROOT = new THREE.Vector3(1.3, 0.42, 0.55); // inside the big-toe mound
function joinHeadToFoot(head, foot, skinMats) {
  foot.updateMatrixWorld(true);
  const toFoot = new THREE.Matrix4().copy(foot.matrixWorld).invert();
  const v = new THREE.Vector3();
  const verts = []; // { y: original height, p: position in foot space, uv, map }
  head.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, uv = o.geometry.attributes.uv, seen = new Set();
    const m = new THREE.Matrix4().multiplyMatrices(toFoot, o.matrixWorld);
    for (const i of o.geometry.index.array) {
      if (seen.has(i)) continue;
      seen.add(i);
      v.fromBufferAttribute(pos, i);
      verts.push({ y: v.y, p: v.clone().applyMatrix4(m), uv: uv && [uv.getX(i), uv.getY(i)], map: o.material.map });
    }
  });
  if (!verts.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const q of verts) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
  const ring = verts.filter((q) => q.y < lo + (hi - lo) * 0.05);
  const c = new THREE.Vector3(), hc = new THREE.Vector3();
  for (const q of ring) c.add(q.p);
  c.multiplyScalar(1 / ring.length);
  for (const q of verts) hc.add(q.p);
  hc.multiplyScalar(1 / verts.length);
  let r = 0;
  for (const q of ring) r += q.p.distanceTo(c);
  r /= ring.length;
  const out = c.clone().sub(hc).normalize(); // from the head down through the neck
  // skin tone: average the texture around the neck
  const map = ring.find((q) => q.map?.image)?.map;
  if (map) {
    try {
      const img = map.image, cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 128, 128);
      const data = g.getImageData(0, 0, 128, 128).data;
      let R = 0, G = 0, B = 0, n = 0;
      for (const q of ring) {
        if (!q.uv) continue;
        const x = Math.min(127, Math.max(0, Math.floor(q.uv[0] * 128))), y = Math.min(127, Math.max(0, Math.floor((map.flipY ? 1 - q.uv[1] : q.uv[1]) * 128)));
        const k = (y * 128 + x) * 4;
        if (data[k] + data[k + 1] + data[k + 2] < 150) continue; // skip hair / shadows
        R += data[k]; G += data[k + 1]; B += data[k + 2]; n++;
      }
      if (n > 4) { const col = new THREE.Color().setRGB(R / n / 255, G / n / 255, B / n / 255, THREE.SRGBColorSpace); for (const mat of skinMats) mat.color.copy(col); }
    } catch { /* keep the default skin */ }
  }
  // the sleeve: a smooth tube from inside the toe mound to just over the neck's cut edge
  const end = c.clone().addScaledVector(out, -0.07);
  const len = end.distanceTo(TOE_ROOT);
  const r0 = 0.36, r1 = r * 1.05;
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, s = t * t * (3 - 2 * t);
    prof.push(new THREE.Vector2(r0 + (r1 - r0) * s - 0.03 * Math.sin(t * Math.PI), t * len));
  }
  const sleeve = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), skinMats[1]);
  sleeve.position.copy(TOE_ROOT);
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(TOE_ROOT).normalize());
  sleeve.castShadow = true;
  foot.add(sleeve);
}

// (ctx.fatality: Ido's fatality (fatalities.js) — no hit: ctx.onStomp squashes them, and the
// foot stays down grinding them into the floor before it lifts)
export class Foot extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    this.x = this.opp.pos.x;
    this.y = 14;
    const skinColor = o.def.colors?.skin || '#e3b394';
    const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6, vertexColors: true });
    const legSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
    this.skinMats = [skin, legSkin];
    const nailMat = new THREE.MeshStandardMaterial({ color: '#f4ddd2', roughness: 0.2 });
    const foot = new THREE.Group();
    const body = new THREE.Mesh(footGeometry(), skin);
    body.castShadow = true;
    foot.add(body);
    // the rest of the leg, continuing the sculpted shin up and out of the shot
    const top = FOOT_DOMAIN.cy + FOOT_DOMAIN.half - 0.1;
    // in two halves, ankle to knee and knee up, so it can buckle on gold Ori
    this.ankle = new THREE.Group(); this.ankle.position.set(-0.95, top, 0); foot.add(this.ankle);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.672, 1.6, 32, 1, true), legSkin);
    shin.position.y = 0.8; shin.castShadow = true; this.ankle.add(shin);
    this.knee = new THREE.Group(); this.knee.position.y = 1.6; this.ankle.add(this.knee);
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 16), legSkin); kneeCap.castShadow = true; this.knee.add(kneeCap);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.7, 4.4, 32, 1, true), legSkin);
    thigh.position.y = 2.2; thigh.castShadow = true; this.knee.add(thigh);
    // toenails on the small toes
    for (const [, tz, r, tx] of SMALL_TOES) {
      const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), nailMat);
      nail.scale.set(r * 0.62, r * 0.22, r * 0.7);
      nail.position.set(tx - r * 0.35, r * 1.78, tz * 1.12);
      nail.rotation.z = -0.25;
      foot.add(nail);
    }
    // big toe: Ido's own head (from his 3D model), crown forward like a toe tip, face to the camera.
    // A plain big toe stands in if the model isn't ready.
    const bigToe = new THREE.Group();
    bigToe.position.set(BIG_TOE_TIP.x, BIG_TOE_TIP.y, BIG_TOE_TIP.z);
    foot.add(bigToe);
    const fallback = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.45, 6, 16), legSkin);
    fallback.rotation.z = Math.PI / 2;
    fallback.position.set(-0.62, -0.25, -0.25);
    bigToe.add(fallback);
    const L = o.rig.auto?.landmarks;
    ctx.headClone?.(o.def, 1.25, L ? L.neckY / L.H + 0.04 : 0.73).then((head) => {
      if (!head || this.dead) return;
      head.rotation.set(0, -0.35, -1.25); // tipped forward like a toe, face turned to the camera
      bigToe.remove(fallback);
      bigToe.add(head);
      joinHeadToFoot(head, foot, [skin, legSkin]);
    });
    foot.scale.setScalar(FOOT_SCALE);
    this.foot = foot;
    this.group.add(foot);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1.6, 1, 0.8);
    ctx.scene.add(this.shadow);
    if (!this.fatal) ctx.flash(o.index, 'GIANT FOOT', 'INCOMING');
  }
  cleanup() { this.ctx.scene.remove(this.shadow); this.shadow.material.dispose(); this.shadow.geometry.dispose(); if (this.hurt) this.ctx.camera?.(null); }
  tick() {
    this.t++;
    const o = this.owner;
    // knocked out of it before the stomp: no foot, he's visible again, and he keeps his special
    // (like any special hit before it comes out)
    if (!this.fatal && this.t < 65 && (o.state !== 'attack' || o.move?.id !== 'special')) {
      o.specialsLeft++;
      o.game.onSpecialRefund?.(o);
      this.finish();
      return;
    }
    o.invuln = 2;
    const F = this.fatal ? { up: 128, back: 160, end: 176 } : { up: 95, back: 130, end: 142 }; // (the fatality: it stays down, grinding)
    o.opacity = this.t < 12 ? 1 - this.t / 12 : this.t > F.back ? Math.min(1, (this.t - F.back) / 12) : 0;
    if (this.t < 55) this.x += (this.opp.pos.x - this.x) * 0.15;      // tracking
    // gold Ori: the foot comes down on top of him and gets no further
    const opp = this.opp, under = Math.abs(opp.pos.x - this.x) < 2.2;
    const floor = under && opp.gold > 0 ? opp.pos.y + 2.25 * (opp.def.heightCm || 175) / 175 * 0.95 : 0;
    if (this.t >= 55 && this.t < 66 && !this.hurt) this.y = Math.max(floor, 14 * (1 - (this.t - 55) / 10));
    if (this.t === 65) {
      this.y = floor;
      const r = this.fatal ? (this.ctx.onStomp?.(this.x), 'fatal') : under ? strike(o, this.move, opp.gold > 0 ? { push: 0, hitstun: 0 } : { knockdown: true, launch: 0.05, push: 0.05 }, this.x) : 'miss'; // (gold Ori stays on his feet under it)
      if (r === 'gold') { // …and the leg buckles on him and goes red: that hurt
        this.hurt = this.t;
        this.ctx.flash(opp.index, 'OUCH!', 'THE GOLD DOESN\'T GIVE');
        this.ctx.particles.burst(opp.pos.x, this.y + 0.1, 0.3, { count: 40, color: '#ffd23f', speed: 0.14, gravity: 0.004, life: 18 });
        this.ctx.sfx.block?.();
      }
      this.ctx.shake(0.6);
      this.ctx.sfx.thud();
      this.ctx.particles.burst(this.x, 0.2, 0, { count: 60, color: '#b8a88a', speed: 0.16, gravity: 0.004, spread: 2.5 });
      this.ctx.rings.spawn(this.x, 0.05, '#ffffff', { grow: 0.3, life: 26 });
    }
    // the fatality: grinding them into the floor, blood squirting out from under it
    if (this.fatal && this.t > 68 && this.t < F.up && this.t % 7 === 0) {
      this.ctx.particles.burst(this.x + (Math.random() - 0.5) * 2.2, 0.15, 0.3 + Math.random() * 0.6, { count: 10, color: '#9a0a0a', speed: 0.1, gravity: 0.006, life: 26 });
      this.ctx.shake(0.08); this.ctx.sfx.thud?.();
    }
    if (this.t > F.up) this.y += 0.4;
    if (this.t > F.end) this.finish();
  }
  render() {
    this.owner.rig.setOpacity(this.owner.opacity);
    this.group.position.set(this.x, this.y, 0);
    // the fatality: twisting on them, grinding them in
    this.group.rotation.y = this.fatal && this.t > 68 && this.t < 128 ? Math.sin(this.t * 0.35) * 0.12 : 0;
    // mirrored (not turned around) when stomping leftward, so the big toe — Ido's face — stays on the camera side
    const f = this.owner.facing > 0 ? 1 : -1;
    // hurt on gold Ori: the leg buckles at the ankle and the knee (trembling), the foot squashes a
    // little on him, and it all flushes red
    const hk = this.hurt ? Math.min(1, (this.t - this.hurt) / 6) : 0;
    this.foot.scale.set(FOOT_SCALE * f * (1 + 0.06 * hk), FOOT_SCALE * (1 - 0.1 * hk), FOOT_SCALE);
    const shake = Math.sin(this.t * 1.7) * 0.04 * hk;
    this.ankle.rotation.z = hk * 0.75 + shake;
    this.knee.rotation.z = -hk * 1.5 - shake;
    // pull back to show the whole leg buckling on him
    if (this.hurt && this.t < this.hurt + 34) this.ctx.camera?.({ x: this.x - f * 0.6, y: 4.2, half: 5.2, halfH: 4.6, tilt: 0.3, cut: this.t === this.hurt });
    else if (this.hurt && !this.camDone) { this.camDone = true; this.ctx.camera?.(null); }
    if (hk !== this.lastHk) {
      this.lastHk = hk;
      for (const m of this.skinMats) {
        const base = m.userData.base || (m.userData.base = { c: m.color.clone(), e: m.emissive.clone() });
        m.color.copy(base.c).lerp(new THREE.Color('#ff2a1e'), 0.65 * hk);
        m.emissive.copy(base.e).lerp(new THREE.Color('#5a0000'), hk);
      }
    }
    this.shadow.position.set(this.x, 0.03, 0);
    this.shadow.material.opacity = this.y < 14 ? 0.45 * (1 - this.y / 16) : 0;
    const k = 0.6 + 0.6 * (1 - this.y / 14);
    this.shadow.scale.set(1.6 * k, 0.8 * k, 1);
  }
}

// ── Yahli: flag pole ─────────────────────────────────────────────────────────
const FLAG_ARM_STRETCH = 1.4; // with the smaller head, just enough for his arms to reach past it
const FLAG_HEAD_SCALE = 0.7; // his big cartoon head shrinks during the flag so the pose looks natural
class FlagPole extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const opp = this.opp;
    let side = sign(o.pos.x - opp.pos.x);
    let px = opp.pos.x + side * 1.3;
    if (Math.abs(px) > PHYS.arenaHalf - 0.3) px = opp.pos.x - side * 1.3;
    this.px = px;
    this.oppX = opp.pos.x; // they're held here, next to the pole, until the last kick
    this.startX = o.pos.x;
    this.spin = 0;
    this.hits = 0;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 10), new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.3, metalness: 0.7 }));
    this.pole.position.y = 2.1;
    this.group.add(this.pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.72), new THREE.MeshStandardMaterial({ map: tex(220, 160, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#0038b8'; g.fillRect(0, h * 0.1, w, h * 0.12); g.fillRect(0, h * 0.78, w, h * 0.12);
      g.strokeStyle = '#0038b8'; g.lineWidth = 6;
      for (const f of [1, -1]) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 * f + i * 2 * Math.PI / 3; g.lineTo(w / 2 + 30 * Math.cos(a), h / 2 + 30 * Math.sin(a)); } g.closePath(); g.stroke(); }
    }), side: THREE.DoubleSide }));
    flag.position.set(0.52, 3.8, 0);
    this.flag = flag;
    this.group.add(flag);
    this.group.position.x = px;
    ctx.sfx.special();
  }
  tick() {
    this.t++;
    const o = this.owner, opp = this.opp;
    o.invuln = 2;
    // no getting away from the pole (walking, dashing or rolling) before the last kick
    if (this.hits < 3 && this.t < 90 && opp.alive && opp.state !== 'ko') {
      opp.pos.x = this.oppX;
      opp.vel.x = 0;
      if (opp.state === 'dash' || opp.state === 'roll') opp.setState('idle');
      opp.pinnedUntil = (opp.clock || 0) + 2;
    }
    if (this.t < 18) { this.group.scale.y = this.t / 18; o.pos.x += (this.px - o.pos.x) * 0.25; return; } // pole rises, run to it
    if (this.t < 90) {
      o.pos.x = this.px;
      const prev = this.spin;
      this.spin += 0.32;
      // a kick lands each time the legs swing past the opponent
      const toOpp = Math.atan2(0, sign(opp.pos.x - this.px)); // 0 or PI
      const crossed = Math.floor((prev - toOpp) / (Math.PI * 2)) !== Math.floor((this.spin - toOpp) / (Math.PI * 2));
      if (crossed && this.hits < 3 && Math.abs(opp.pos.x - this.px) < 2.4) {
        this.hits++;
        const last = this.hits === 3;
        const r = strike(o, this.move, { damage: this.move.damage / 3, hitstun: 30, knockdown: last, launch: last ? 0.14 : undefined, push: last ? 0.25 : 0.02 }, this.px);
        if (r === 'gold') { // gold Ori: the spin stops dead on the first kick, and he drops off the pole
          this.hits = 3; this.t = 89;
          this.ctx.flash(opp.index, 'STOPPED', 'BY THE GOLD');
          this.ctx.particles.burst(opp.pos.x, 1.2, 0.3, { count: 24, color: '#ffd23f', speed: 0.14, gravity: 0.004, life: 16 });
          this.ctx.shake(0.3);
          this.ctx.sfx.block?.();
        }
        this.ctx.shake(0.15);
      }
      return;
    }
    if (this.t < 104) { this.group.scale.y = Math.max(0.01, 1 - (this.t - 90) / 14); return; }
    o.facing = sign(opp.pos.x - o.pos.x);
    this.finish();
  }
  render() {
    const o = this.owner, obj = o.rig.object;
    this.flag.rotation.y = Math.sin(this.t * 0.3) * 0.25;
    if (this.t >= 18 && this.t < 90) {
      // human flag: body horizontal, hands on the pole, spinning around it
      obj.rotation.set(0, this.spin, -Math.PI / 2, 'YXZ');
      o.rig.turn && (o.rig.turn.rotation.y = 0); // square to the pole: one shoulder straight above the other
      this.stretchArms(FLAG_ARM_STRETCH);
      // place him so his hands (the top of the Y) are on the pole
      obj.position.set(this.px - Math.cos(this.spin) * 2, 1.4, Math.sin(this.spin) * 2);
      obj.updateMatrixWorld(true);
      const B = o.rig.auto?.bones;
      if (B) {
        const l = B.lHand.getWorldPosition(new THREE.Vector3()), r = B.rHand.getWorldPosition(new THREE.Vector3());
        obj.position.x += this.px - (l.x + r.x) / 2;
        obj.position.z += 0 - (l.z + r.z) / 2;
      }
    } else { obj.rotation.set(0, 0, 0); this.stretchArms(1); }
  }
  // longer arms for the Y (along the bone only, so they don't get fatter; hands keep their size)
  // and a smaller head; k = 1 puts everything back
  stretchArms(k) {
    const B = this.owner.rig.auto?.bones;
    if (!B) return;
    for (const s of ['l', 'r']) { B[`${s}Sh`].scale.set(k, 1, 1); B[`${s}Hand`].scale.set(1 / k, 1, 1); }
    B.head.scale.setScalar(k === 1 ? 1 : FLAG_HEAD_SCALE);
  }
  cleanup() { this.stretchArms(1); }
}

// ── Asis: bamboo cage ───────────────────────────────────────────────────────────────
// When the cage breaks Asis catches one bamboo stalk and spin-slams the opponent with it
const SLAM = { catch: 6, leap: 20, end: 34 }; // frames after the break
const CAGE_SLAM_DAMAGE = 14;                  // on top of the damage over time while caged
class Cage extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const opp = this.opp;
    this.hp = this.maxHp = 8; // punches/kicks to break out
    this.x = opp.pos.x;
    this.rise = 0;
    // bamboo: green-yellow stalks with darker nodes, lashed to two bamboo rings
    const stalk = new THREE.CylinderGeometry(0.055, 0.06, 2.7, 8);
    const node = new THREE.CylinderGeometry(0.068, 0.068, 0.05, 8);
    const cane = new THREE.MeshStandardMaterial({ color: '#b9b25a', roughness: 0.55 });
    const knot = new THREE.MeshStandardMaterial({ color: '#7f7a33', roughness: 0.7 });
    const rope = new THREE.MeshStandardMaterial({ color: '#8b6b45', roughness: 0.9 });
    this.bars = [];
    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = new THREE.Group();
      const st = new THREE.Mesh(stalk, cane);
      st.position.y = 1.35;
      b.add(st);
      for (const y of [0.45, 1.1, 1.75, 2.4]) { const n = new THREE.Mesh(node, knot); n.position.y = y + (i % 3) * 0.06; b.add(n); }
      b.position.set(Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78);
      b.rotation.z = Math.sin(i * 2.3) * 0.03; // not perfectly straight
      b.userData.a = a;
      this.group.add(b);
      this.bars.push(b);
    }
    for (const y of [0.25, 2.55]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), cane);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      this.group.add(ring);
      this.rings.push(ring);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.02, 4, 24), rope);
      tie.rotation.x = Math.PI / 2; tie.position.y = y + 0.07;
      this.group.add(tie);
      this.rings.push(tie);
    }
    // gold Ori: the cage goes up around him but can't hold him: it bursts, and the slam does nothing
    if (opp.goldSoak(o)) { this.goldMiss = true; ctx.flash(opp.index, 'NO EFFECT', 'THE GOLD TAKES IT'); return; }
    opp.cage = this;
    // caged while winding up their own special: it didn't come out, so they keep it
    if (opp.state === 'attack' && opp.move?.id === 'special' && opp.phase === 'startup') { opp.specialsLeft++; opp.game.onSpecialRefund?.(opp); }
    opp.move = null;
    opp.setState('caged');
    opp.vel.x = 0;
    ctx.flash(o.index, 'CAGED!', 'PUNCH YOUR WAY OUT');
    ctx.sfx.block();
  }
  struggle() {
    if (this.broken) return;
    this.hp--;
    this.shakeT = 6;
    this.ctx.sfx.block();
    if (this.hp <= 0) this.breakOut();
  }
  breakOut() {
    this.broken = true;
    this.breakAt = this.t;
    const opp = this.opp;
    opp.cage = null;
    if (opp.state === 'caged') {
      // still reeling from breaking out: can't act until Asis's spin slam has landed
      opp.move = null;
      opp.buffer = null;
      opp.setState('dazed');
      opp.stun = SLAM.leap + 2;
      opp.vel.x = 0;
    }
    this.ctx.particles.burst(this.x, 1.3, 0, { count: 40, color: '#b9b25a', speed: 0.15, gravity: 0.006 });
    this.ctx.sfx.thud();
  }
  cleanup() {
    if (this.opp.cage === this) { this.opp.cage = null; if (this.opp.state === 'caged') this.opp.setState('idle'); }
    if (this.staff) { this.ctx.scene.remove(this.staff); this.staff.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); }); }
    if (this.slamming && this.owner.move?.id === 'special-cageslam') this.owner.rig.object.rotation.set(0, 0, 0);
  }
  // Asis takes over: leap in spinning with the stalk overhead, then bring it down
  startSlam() {
    const o = this.owner;
    // the slam always happens (whatever Asis was doing), unless he's down for good
    if (!o.alive || !this.opp.alive || ['ko', 'caged'].includes(o.state)) return;
    o.rollThrough = false;
    o.rig.object.rotation.set(0, 0, 0);
    this.slamming = true;
    this.slamFrom = o.pos.x;
    o.move = { anim: 'spinSlam', id: 'special-cageslam', startup: 0, active: SLAM.end, recovery: 10, uid: this.breakAt + 0.5, damage: 0, push: 0 };
    o.setState('attack');
    o.t = 0;
    o.hasHit = true;   // the effect does the hitting
    o.contactAt = -1;
    o.invuln = SLAM.end;
    // the stalk he catches
    const g = new THREE.Group();
    const cane = new THREE.MeshStandardMaterial({ color: '#b9b25a', roughness: 0.55 });
    const knot = new THREE.MeshStandardMaterial({ color: '#7f7a33', roughness: 0.7 });
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 2.0, 8), cane);
    stalk.position.y = 1.0; stalk.castShadow = true; g.add(stalk);
    for (const y of [0.35, 0.95, 1.55]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 8), knot); n.position.y = y; g.add(n); }
    this.staff = g;
    this.ctx.scene.add(g);
  }
  tick() {
    this.t++;
    if (this.goldMiss && !this.broken) { if (this.t === 1) this.owner.endSpecial(); if (this.t >= 40) this.breakOut(); return; }
    if (this.blocked) { this.owner.endSpecial(); this.finish(); return; }
    const opp = this.opp;
    if (this.t === 1) this.owner.endSpecial();
    if (this.broken) {
      const u = this.t - this.breakAt, o = this.owner;
      if (u === 1) this.startSlam();
      if (this.slamming && (o.state !== 'attack' || o.move?.id !== 'special-cageslam')) this.slamming = false; // knocked out of it
      if (this.slamming && u <= SLAM.leap) {
        // leap at the opponent, spinning, stalk overhead
        const dir = sign(opp.pos.x - o.pos.x), k = u / SLAM.leap;
        const target = opp.pos.x - dir * 0.8;
        o.pos.x = this.slamFrom + (target - this.slamFrom) * k;
        o.pos.y = u < SLAM.leap ? 1.3 * Math.sin(Math.PI * k) : 0;
        o.vel.x = 0; o.vel.y = 0;
        o.facing = dir;
        if (u === SLAM.leap && opp.alive && Math.abs(opp.pos.x - o.pos.x) < 1.6) {
          strike(o, this.move, { damage: CAGE_SLAM_DAMAGE, hitstun: 22, knockdown: true, launch: 0.1, push: 0.15 }, o.pos.x);
          this.ctx.sfx.thud();
          this.ctx.shake(0.4);
          this.ctx.particles.burst(opp.pos.x, 0.2, 0, { count: 40, color: '#b9b25a', speed: 0.14, gravity: 0.006 });
          this.ctx.rings.spawn(opp.pos.x, 0.05, '#ffffff', { grow: 0.2, life: 20 });
        }
      }
      if (u > (this.slamming ? SLAM.end + 10 : 30)) this.finish();
      return;
    }
    opp.pos.x = this.x;
    if (this.t % 15 === 0) opp.tickDamage(1.4, this.owner);
    if (this.t > 300 || !opp.alive) this.breakOut();
  }
  render() {
    if (this.blocked) return;
    this.group.position.set(this.x, 0, 0);
    this.rise = Math.min(1, this.rise + 0.12);
    const shake = (this.shakeT = Math.max(0, (this.shakeT || 0) - 1)) ? Math.sin(this.t * 3) * 0.06 : 0;
    this.group.position.x += shake;
    this.group.scale.y = this.rise;
    if (this.broken) {
      // the stalks burst outward and topple over (one flies to Asis), then fade
      const u = this.t - this.breakAt;
      for (const r of this.rings) r.visible = false;
      this.bars.forEach((b, i) => {
        if (i === 0 && this.staff) { b.visible = false; return; }
        const a = b.userData.a, k = Math.min(1, u / 14);
        b.scale.y = 0.5; // broken in half
        b.position.set(Math.cos(a) * (0.78 + 1.3 * k), 0.15 + 0.9 * Math.sin(Math.PI * k), Math.sin(a) * (0.78 + 1.3 * k));
        b.rotation.set(Math.sin(a) * k * Math.PI / 2, u * 0.2 * (1 - k), Math.cos(a) * k * Math.PI / 2);
      });
      const fade = Math.max(0, (u - 18) / 10);
      if (this.staff) this.renderSlam(u);
      this.group.traverse((m) => { if (m.material) { m.material.transparent = true; m.material.opacity = 1 - fade; } });
    }
  }
  renderSlam(u) {
    const o = this.owner, st = this.staff, hs = (o.def.heightCm || 175) / 175;
    const hand = { x: o.pos.x, y: o.pos.y + 2.05 * hs };
    if (u < SLAM.catch) {
      // the stalk flies from the cage into his hands
      const k = u / SLAM.catch;
      st.position.set(this.x + (hand.x - this.x) * k, 1.4 + (hand.y - 1.4) * k + Math.sin(Math.PI * k) * 0.6, 0.2);
      st.rotation.set(0, 0, u * 0.9);
    } else if (u < SLAM.leap) {
      // held overhead, spinning with him like a helicopter blade
      st.position.set(hand.x, hand.y, 0.2);
      st.rotation.set(0, u * 0.7, Math.PI / 2);
      if (this.slamming) o.rig.object.rotation.set(0, u * 0.7, 0);
    } else {
      // brought down on the opponent
      if (this.slamming) o.rig.object.rotation.set(0, 0, 0);
      const k = Math.min(1, (u - SLAM.leap + 2) / 4);
      st.position.set(o.pos.x + o.facing * 0.15, o.pos.y + 1.5 * hs, 0.2);
      st.rotation.set(0, 0, -o.facing * 1.9 * k);
      if (u > SLAM.end) st.traverse((m) => { if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, 1 - (u - SLAM.end) / 10); } });
    }
    if (!this.slamming && u >= SLAM.catch) st.visible = false;
  }
}

// ── Ofek: guitar solo ────────────────────────────────────────────────────────
// A black superstrat in his hands; for 1.5 s the opponent holds their ears and every note
// hurts (18 in all), wherever they stand. Hitting him (if you can) stops the solo.
const glyphTex = (ch, color) => tex(64, 64, (g) => {
  g.font = 'bold 48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 4;
  g.strokeText(ch, 32, 34); g.fillText(ch, 32, 34);
});
let ringTex;
const waveTex = () => ringTex || (ringTex = tex(128, 128, (g) => {
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7;
  for (const r of [56, 40]) { g.globalAlpha = r === 56 ? 1 : 0.5; g.beginPath(); g.arc(64, 64, r, -0.9, 0.9); g.stroke(); }
}));
// a big speaker blast: three thick arcs
let blastTexC = null;
const blastTex = () => blastTexC || (blastTexC = tex(128, 128, (g) => {
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (const [r, a, w] of [[58, 1, 10], [44, 0.75, 8], [30, 0.5, 6]]) { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.arc(64, 64, r, -0.85, 0.85); g.stroke(); }
}));
function guitarMesh() {
  const black = new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.25, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.6 });
  const board = new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9d9de', roughness: 0.2, metalness: 0.9 });
  const g = new THREE.Group();
  const bout = (r, x, y, mat, depth) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 28), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m;
  };
  bout(0.27, 0, 0, black, 0.08);          // lower bout
  bout(0.2, 0.25, 0.02, black, 0.08);     // upper bout
  bout(0.12, 0.33, 0.13, black, 0.08);    // horn
  const guard = bout(0.17, 0.06, -0.05, white, 0.085); guard.scale.set(1, 1, 0.9);
  for (const x of [-0.08, 0.1]) { const pu = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.02), black); pu.position.set(x, 0, 0.05); g.add(pu); }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.075, 0.05), wood); neck.position.set(0.72, 0, 0.01); g.add(neck);
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.012), board); fb.position.set(0.74, 0, 0.04); g.add(fb);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.035), black); head.position.set(1.24, 0.03, 0.01); head.rotation.z = 0.25; g.add(head);
  for (let i = 0; i < 6; i++) {
    const str = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.004, 0.004), chrome);
    str.position.set(0.55, -0.025 + i * 0.01, 0.052); g.add(str);
  }
  return g;
}
// a giant concert speaker: a black cabinet (front along +z) with two big woofers and a horn tweeter
function speakerMesh() {
  const g = new THREE.Group();
  const cab = new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9a9ca3', roughness: 0.3, metalness: 0.85 });
  const cone = new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.65, side: THREE.DoubleSide });
  const cap = new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.4, metalness: 0.3 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.1, 0.9), cab); box.position.y = 1.55; box.castShadow = true; g.add(box);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.39, 0.06, 0.94), metal); trim.position.y = 3.1; g.add(trim);
  const woofers = [];
  for (const y of [0.85, 1.95]) {
    const w = new THREE.Group(); w.position.set(0, y, 0.46);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 32), metal); w.add(rim);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.2, 32, 1, true), cone); c.rotation.x = -Math.PI / 2; c.position.z = -0.08; w.add(c);
    const dust = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap); dust.rotation.x = Math.PI / 2; dust.position.z = -0.02; w.add(dust);
    g.add(w); woofers.push(w);
  }
  const horn = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.08), metal); horn.position.set(0, 2.75, 0.46); g.add(horn);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.05), cap); mouth.position.set(0, 2.75, 0.5); g.add(mouth);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#3cff6a' })); led.position.set(0.55, 0.2, 0.46); g.add(led);
  g.userData.woofers = woofers;
  return g;
}

class Guitar extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.guitar = guitarMesh();
    this.group.add(this.guitar);
    // two gigantic speakers rise out of the floor behind him (angled a little toward the camera);
    // the sound waves that hurt come blasting out of them
    const f = o.facing, lim = PHYS.arenaHalf + 1.2;
    this.speakers = [[-0.9, -1.5], [-2.0, -0.2]].map(([dx, z]) => {
      const sp = speakerMesh();
      sp.position.set(Math.max(-lim, Math.min(lim, o.pos.x + f * (dx - 0.4))), 0, z);
      sp.rotation.y = f * (Math.PI / 2 - 0.4);
      sp.scale.set(1, 0.01, 1);
      ctx.scene.add(sp);
      return sp;
    });
    this.fx = [];  // sound waves and notes (render only)
    this.noteTex = [glyphTex('♪', '#ffffff'), glyphTex('♫', '#e0233a')];
    ctx.flash(o.index, 'GUITAR SOLO', 'TURN IT UP');
    const opp = this.opp;
    this.reflect = opp.gold > 0; // gold Ori: the sound waves bounce off him, back at the speakers
    if (this.reflect) ctx.flash(opp.index, 'REFLECTED', 'THE GOLD BOUNCES IT BACK');
    if (opp.alive && opp.state !== 'caged' && !opp.goldSoak(o)) { // gold Ori doesn't hear it (and loses his gold)
      opp.deaf = m.deafFrames;
      if (opp.state === 'attack' && opp.move?.id !== 'special') { opp.move = null; opp.setState('idle'); }
      ctx.flash(opp.index, 'TOO LOUD!', 'HOLDING YOUR EARS');
    }
  }
  cleanup() {
    for (const f of this.fx) { this.ctx.scene.remove(f.s); f.s.material.dispose(); }
    for (const sp of this.speakers) { this.ctx.scene.remove(sp); sp.traverse((x) => { x.geometry?.dispose?.(); x.material?.dispose?.(); }); }
  }
  tick() {
    this.t++;
    const o = this.owner;
    if (this.t === 1) this.ctx.shake(0.2); // the speakers slam up out of the floor
    // hit out of it, or the solo is over
    if (o.state !== 'attack' || o.move?.id !== 'special' || this.t > this.move.deafFrames) { if (o.state === 'attack') o.endSpecial(); this.opp.deaf = 0; this.finish(); return; }
    // the full damage lands while they're stuck holding their ears (a note every 10 frames)
    if (this.t % 10 === 0 && this.opp.alive) {
      this.opp.tickDamage(this.move.damage / (this.move.deafFrames / 10), o);
      this.ctx.particles.burst(this.opp.pos.x, this.opp.pos.y + 1.4, 0, { count: 4, color: '#e0233a', speed: 0.05, gravity: 0, life: 14 });
    }
    if (this.t % 7 === 1) this.ctx.sfx.riff?.(Math.floor(this.t / 7));
    if (this.t % 30 === 1) this.ctx.shake(0.06);
  }
  render(time) {
    const o = this.owner, hs = (o.def.heightCm || 175) / 175, f = o.facing;
    this.group.position.set(o.pos.x + f * 0.12 * hs, o.pos.y + 0.95 * hs, 0.38);
    this.group.scale.set(f * hs, hs, hs);
    this.guitar.rotation.z = 0.5 + Math.sin(time * 9) * 0.04;
    // the speakers: rise up fast with a little overshoot, woofers pumping to the beat, sink at the end
    const left = this.move.deafFrames - this.t;
    const up = Math.min(1, this.t / 10), k = left < 12 ? Math.max(0.01, left / 12) : up < 1 ? up * (1.08 - 0.08 * up) : 1;
    const beat = Math.max(0, Math.sin(time * 15));
    for (const sp of this.speakers) {
      sp.scale.set(1, k, 1);
      sp.userData.woofers.forEach((w, i) => w.scale.set(1 + beat * 0.05, 1 + beat * 0.05, 1 + beat * (0.6 + i * 0.2)));
    }
    // sound waves blasting from the speakers at the opponent, notes floating up from the guitar
    if (this.t % 9 === 0 && this.fx.at(-1)?.born !== this.t) {
      const sp = this.speakers[(this.t / 9) % 2], w = sp.userData.woofers[(this.t / 18) % 2 | 0];
      const from = w.getWorldPosition(new THREE.Vector3());
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex(), color: '#ff3d5a', transparent: true, depthWrite: false }));
      this.ctx.scene.add(s);
      this.fx.push({ s, born: this.t, wave: true, x: from.x, y: from.y, z: from.z });
      const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.noteTex[this.t % 2], transparent: true, depthWrite: false }));
      this.ctx.scene.add(n);
      this.fx.push({ s: n, born: this.t, wave: false, x: this.group.position.x + (Math.random() - 0.5) * 0.6, y: this.group.position.y + 0.5 });
    }
    const tx = this.opp.pos.x, ty = this.opp.pos.y + 1.3;
    this.fx = this.fx.filter((e) => {
      const age = (this.t - e.born) / (e.wave ? 22 : 40);
      if (age >= 1) { this.ctx.scene.remove(e.s); e.s.material.dispose(); return false; }
      if (e.wave) {
        const back = this.reflect && age > 0.5, k = this.reflect ? (back ? 2 - age * 2 : age * 2) : age; // (off gold Ori: out and back)
        e.s.position.set(e.x + (tx - e.x) * k, e.y + (ty - e.y) * k, e.z + (0.4 - e.z) * k);
        e.s.scale.setScalar(1.3 + age * 2.0);
        e.s.material.rotation = (f > 0) !== back ? 0 : Math.PI;
        if (back && !e.bounced) { e.bounced = true; this.ctx.particles.burst(tx, ty, 0.3, { count: 8, color: '#ffd23f', speed: 0.1, gravity: 0, life: 12 }); }
        e.s.material.opacity = 1 - age * age;
      } else {
        e.s.position.set(e.x + Math.sin(age * 9 + e.born) * 0.15, e.y + age * 1.4, 0.45);
        e.s.scale.setScalar(0.32);
        e.s.material.opacity = 1 - age;
      }
      return true;
    });
  }
}

// ── Ori Gold: golden ─────────────────────────────────────────────────────────
// Turns to gold for 3 s: nothing hurts him, specials included (fighter.receive/tickDamage).
class Gold extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    o.gold = m.goldFrames;
    if (this.opp.night > 0) o.goldEndsNight = true; // (during Shirley's night: it ends with his gold)
    if (this.opp.guard && !this.opp.voided) o.goldSoak(this.opp); // turned gold in the middle of their special: gold until it's over
    ctx.flash(o.index, 'GOLDEN!', "CAN'T BE HIT FOR 3 S");
    ctx.sfx.gold?.();
    ctx.particles.burst(o.pos.x, o.pos.y + 1.2, 0, { count: 40, color: '#ffd23f', speed: 0.12, gravity: 0, life: 26 });
    o.endSpecial();
  }
  tick() { this.t++; if (this.t > 1) this.finish(); }
  render() {}
}

// ── Noa: cough ───────────────────────────────────────────────────────────────
// A green cloud from her mouth chases the opponent: 1 now and 1 per second after (9 over
// 9 s), and they deal half damage for those 9 s.
const COUGH_FIT = 66; // frames of coughing (3 coughs) before the big one sends the cloud
class Cough extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.puffs = Array.from({ length: 6 }, (_, i) => { const p = puff(0.45 + i * 0.07); p.material.color.set('#9bd84a'); p.visible = false; this.group.add(p); return p; });
    this.spray = []; // little puffs from each cough (render only)
  }
  cleanup() { for (const p of this.spray) { this.ctx.scene.remove(p.s); p.s.material.dispose(); } }
  tick() {
    this.t++;
    const o = this.owner, opp = this.opp;
    if (this.t <= COUGH_FIT) {
      // hit out of the coughing fit: the cough never came out, so she keeps her special
      if (o.state !== 'attack' || o.move?.id !== 'special') { o.specialsLeft++; o.game.onSpecialRefund?.(o); this.finish(); return; }
      if (this.t % 22 === 1) this.ctx.sfx.cough?.();
      if (this.t === COUGH_FIT) {
        const mouth = o.mouthPos();
        this.x = mouth.x; this.y = mouth.y;
        this.puffs.forEach((p) => { p.visible = true; });
        o.endSpecial(); // the big cough (recovery pose leans into it)
        this.ctx.sfx.cough?.();
        o.iv = true; // …and now she's on an I.V. for the rest of the round (IVStand)
        this.ctx.flash(o.index, 'I.V. ATTACHED', 'END A COMBO WITH A KICK: I.V. SWING');
      }
      return;
    }
    const dx = opp.pos.x - this.x, dy = opp.pos.y + 1.5 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * 0.22; this.y += (dy / d) * 0.22;
    if (d < 0.6) {
      if (strike(this.owner, this.move, { damage: this.move.damage, hitstun: 8 }, this.x) === 'hit') {
        opp.poison = { left: (this.move.weakFrames / 60 - 1) * 60, every: 60, dmg: this.move.poisonDmg ?? 1.5 };
        opp.weak = this.move.weakFrames;
        this.ctx.flash(opp.index, 'SICK!', 'HALF DAMAGE FOR 9 S');
      }
      this.finish();
    }
    if (this.t > 600 || !opp.alive) this.finish();
  }
  render(t) {
    // a small green spray from her mouth on each cough
    if (this.t <= COUGH_FIT && this.t % 22 === 3 && this.lastSpray !== this.t) {
      this.lastSpray = this.t;
      const m = this.owner.mouthPos();
      for (let k = 0; k < 3; k++) {
        const s = puff(0.18, 0.7); s.material.color.set('#b7e07a');
        this.ctx.scene.add(s);
        this.spray.push({ s, x: m.x, y: m.y, vx: this.owner.facing * (0.025 + k * 0.01), vy: 0.004 * (k - 1), life: 1 });
      }
    }
    this.spray = this.spray.filter((p) => {
      p.life -= 0.04; p.x += p.vx; p.y += p.vy;
      if (p.life <= 0) { this.ctx.scene.remove(p.s); p.s.material.dispose(); return false; }
      p.s.position.set(p.x, p.y, 0.3); p.s.scale.setScalar(0.15 + (1 - p.life) * 0.3); p.s.material.opacity = 0.7 * p.life;
      return true;
    });
    if (this.t < COUGH_FIT) return;
    this.group.position.set(this.x, this.y, 0.2);
    this.puffs.forEach((p, i) => { const a = t * 4 + i; p.position.set(Math.cos(a) * 0.22, Math.sin(a * 1.4) * 0.18, Math.sin(a) * 0.22); });
  }
}

// Green bubbles over someone Noa coughed on (dealing half damage)
export class Sick {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.bubbles = Array.from({ length: 5 }, () => { const p = puff(0.22, 0.8); p.material.color.set('#7fd02a'); this.group.add(p); return p; });
    this.group.visible = false;
    scene.add(this.group);
  }
  render(f, t) {
    const on = f.weak > 0 && f.alive;
    this.group.visible = on;
    if (!on) return;
    const hs = (f.def.heightCm || 175) / 175;
    this.group.position.set(f.pos.x, f.pos.y + 2.2 * hs, 0.3);
    this.bubbles.forEach((b, i) => {
      const k = (t * 0.6 + i / 5) % 1;
      b.position.set(Math.sin(i * 2.1 + t) * 0.3, k * 0.5, Math.cos(i * 2.1) * 0.2);
      b.material.opacity = 0.95 * (1 - k * 0.7) * Math.min(1, f.weak / 30);
      b.scale.setScalar(0.25 + k * 0.3);
    });
  }
  dispose() { this.scene.remove(this.group); this.bubbles.forEach((b) => b.material.dispose()); }
}

// ── Linoy: tiger ─────────────────────────────────────────────────────────────
// A tiger bounds in from behind her, runs at the opponent, pounces and bites (18, knockdown).
// The real tiger model (models/tiger.glb, running); the code-built one until it has loaded.
let stripeTex;
const tigerStripes = () => stripeTex || (stripeTex = tex(256, 128, (g, w, h) => {
  g.fillStyle = '#e8781e'; g.fillRect(0, 0, w, h);
  const belly = g.createLinearGradient(0, 0, 0, h); belly.addColorStop(0.6, 'rgba(255,240,215,0)'); belly.addColorStop(1, 'rgba(255,240,215,1)');
  g.fillStyle = belly; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1a1008';
  for (let i = 0; i < 14; i++) {
    const x = 8 + i * 18 + (i % 2) * 5;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 10, h * 0.25, x + 2, h * 0.55); g.lineTo(x + 7, h * 0.5); g.quadraticCurveTo(x + 16, h * 0.22, x + 9, 0); g.fill();
  }
}));
export function tigerMesh() {
  const fur = new THREE.MeshStandardMaterial({ map: tigerStripes(), roughness: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e8781e', roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: '#fff0dc', roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: '#140c06', roughness: 0.5 });
  const pink = new THREE.MeshStandardMaterial({ color: '#c0485a', roughness: 0.6 });
  const g = new THREE.Group();
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 24, 16);
  part(sph, fur, 0, 0.62, 0, 0.62, 0.27, 0.25);          // body
  part(sph, fur, 0.36, 0.68, 0, 0.3, 0.3, 0.27);         // shoulders
  part(sph, fur, -0.4, 0.64, 0, 0.26, 0.25, 0.24);       // haunches
  const head = new THREE.Group(); head.position.set(0.68, 0.86, 0); g.add(head);
  part(sph, fur, 0, 0, 0, 0.22, 0.2, 0.21, head);
  part(sph, white, 0.17, -0.06, 0, 0.12, 0.08, 0.13, head); // muzzle
  part(sph, black, 0.27, -0.01, 0, 0.035, 0.03, 0.045, head); // nose
  for (const z of [0.09, -0.09]) {
    part(sph, white, 0.15, 0.06, z, 0.045, 0.04, 0.035, head);
    part(sph, black, 0.18, 0.065, z, 0.022, 0.025, 0.02, head); // eyes
    part(sph, orange, -0.05, 0.19, z * 1.6, 0.06, 0.07, 0.03, head); // ears
    part(sph, white, 0.1, -0.03, z * 1.5, 0.08, 0.08, 0.05, head); // cheek ruff
  }
  const jaw = new THREE.Group(); jaw.position.set(0.05, -0.1, 0); head.add(jaw);
  part(sph, white, 0.11, -0.03, 0, 0.12, 0.04, 0.1, jaw);
  part(new THREE.BoxGeometry(0.12, 0.02, 0.12), pink, 0.1, 0.01, 0, 1, 1, 1, jaw);
  for (const z of [0.05, -0.05]) part(new THREE.ConeGeometry(0.014, 0.06, 6), white, 0.2, 0.04, z, 1, 1, 1, jaw); // fangs
  const legs = [];
  for (const [x, z] of [[0.38, 0.13], [0.38, -0.13], [-0.42, 0.13], [-0.42, -0.13]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.62, z); g.add(hip);
    part(new THREE.CylinderGeometry(0.075, 0.06, 0.5, 10), fur, 0, -0.27, 0, 1, 1, 1, hip);
    part(sph, white, 0.03, -0.53, 0, 0.08, 0.05, 0.07, hip); // paw
    legs.push(hip);
  }
  const tail = [];
  let parent = g, px = -0.62, py = 0.7;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group(); seg.position.set(px, py, 0); parent.add(seg);
    part(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 8), i === 4 ? black : fur, 0, 0.1, 0, 1, 1, 1, seg);
    seg.rotation.z = i === 0 ? 2.2 : -0.25;
    tail.push(seg); parent = seg; px = 0; py = 0.2;
  }
  g.userData = { head, jaw, legs, tail };
  return g;
}
class Tiger extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.dir = o.facing;
    this.x = o.pos.x - this.dir * 0.6;
    this.y = 0;
    this.tiger = tigerMesh();
    this.tiger.scale.setScalar(1.15);
    this.group.add(this.tiger);
    loadAnimated('models/tiger.glb', 1.15, 'Run').then((t) => {
      if (this.dead) return;
      this.real = t;
      this.tiger.visible = false;
      this.group.add(t.object);
      const run = t.clips.Run && t.mixer.clipAction(t.clips.Run);
      run?.play();
    }).catch(() => { /* keep the code-built one */ });
    this.phase = 'run';
    o.endSpecial();
    ctx.flash(o.index, 'TIGER!', 'GO GET THEM');
  }
  tick() {
    this.t++;
    const opp = this.opp;
    if (this.t > 420 || (!opp.alive && this.phase !== 'leave')) { this.finish(); return; }
    if (this.phase === 'run') {
      this.dir = sign(opp.pos.x - this.x);
      this.x += this.dir * 0.21;
      if (Math.abs(opp.pos.x - this.x) < 1.25) { this.phase = 'pounce'; this.pt = 0; this.fromX = this.x; this.fromY = this.y; }
    } else if (this.phase === 'pounce') {
      // leap at them (even mid-jump: specials can't be dodged), jaws open
      this.pt++;
      const k = Math.min(1, this.pt / 10), tx = opp.pos.x - this.dir * 0.55, ty = Math.max(0, opp.pos.y + 0.3);
      this.x = this.fromX + (tx - this.fromX) * k;
      this.y = this.fromY + (ty - this.fromY) * k + Math.sin(Math.PI * k) * 0.7;
      if (this.pt === 10) {
        strike(this.owner, this.move, { knockdown: true, launch: 0.08, push: 0.12 }, this.x);
        this.ctx.shake(0.3);
        this.ctx.particles.burst(opp.pos.x, opp.pos.y + 1.0, 0.4, { count: 26, color: '#ffffff', speed: 0.12, gravity: 0.004 });
        this.phase = 'leave'; this.pt = 0;
      }
    } else {
      // bounds away off the stage and fades
      this.pt++;
      this.y = Math.max(0, this.y - 0.08);
      this.x += this.dir * 0.24;
      if (this.pt > 30) this.finish();
    }
  }
  finish() {
    // (the real tiger shares its geometry with the loaded file: not disposed with the rest)
    if (this.real) { this.group.remove(this.real.object); this.real.mixer.stopAllAction(); }
    super.finish();
  }
  render(time) {
    const T = this.tiger, u = T.userData;
    this.group.position.set(this.x, this.y, 0.3);
    if (this.real) {
      const R = this.real, dt = Math.min(0.1, Math.max(0, time - (this.lastTime ?? time)));
      this.lastTime = time;
      R.object.rotation.y = this.dir > 0 ? Math.PI : 0; // (its nose points -x in the file)
      R.mixer.update(dt * (this.phase === 'pounce' ? 0.6 : 1.3)); // (a fast gallop; slower in the air)
      R.object.rotation.z = this.phase === 'pounce' ? this.dir * (this.pt < 6 ? 0.2 : -0.12) : 0;
      const fade = this.phase === 'leave' ? Math.max(0, 1 - Math.max(0, this.pt - 14) / 16) : 1;
      if (fade < 1) R.object.traverse((m) => { if (m.material) { m.material.transparent = true; m.material.opacity = fade; } });
      return;
    }
    T.scale.x = 1.15 * this.dir;
    const run = this.phase !== 'pounce';
    const s = this.t * 0.55;
    // gallop: front and back legs in pairs, body bobbing
    u.legs.forEach((leg, i) => { leg.rotation.z = run ? Math.sin(s + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.4) * 0.7 : (i < 2 ? 1.0 : -0.9); });
    T.position.y = run ? Math.abs(Math.sin(s)) * 0.08 : 0;
    T.rotation.z = run ? Math.sin(s) * 0.05 : (this.pt < 6 ? 0.25 : -0.15);
    u.jaw.rotation.z = this.phase === 'pounce' ? -0.7 : Math.max(-0.7, -0.05 - (this.phase === 'leave' && this.pt < 8 ? 0.6 : 0));
    u.head.rotation.z = this.phase === 'pounce' ? 0.15 : Math.sin(s) * 0.06;
    u.tail.forEach((seg, i) => { if (i) seg.rotation.z = -0.25 + Math.sin(time * 6 + i) * 0.25; });
    const fade = this.phase === 'leave' ? Math.max(0, 1 - Math.max(0, this.pt - 14) / 16) : 1;
    if (fade < 1) this.group.traverse((m) => { if (m.material) { m.material.transparent = true; m.material.opacity = fade; } });
  }
}

// ── Netanel: darbuka earthquake ──────────────────────────────────────────────
// He pulls out a darbuka and drums DUM-tek-tek-DUM: every beat thumps the ground (a ring and a
// shake). The big last hit sends a crack zig-zagging along the floor to the opponent, throwing up
// rocks and dust; when it reaches them: damage, and half speed for move.slowFrames. Hit out of it
// before the big beat and nothing happens.
const DARBUKA_BEATS = [6, 16, 24, 32];
const DARBUKA_FIRE = 44;
function darbukaMesh() {
  const g = new THREE.Group();
  // a goblet: wide drum head, round bowl, narrow neck, flared foot (lathe profile: [radius, height])
  const prof = [[0.001, 0], [0.12, 0], [0.12, 0.02], [0.085, 0.06], [0.06, 0.13], [0.058, 0.2], [0.09, 0.27], [0.15, 0.33], [0.175, 0.39], [0.172, 0.43], [0.165, 0.45]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide }));
  body.castShadow = true;
  g.add(body);
  // inlaid bands (the mother-of-pearl / enamel look)
  for (const [y, r, c] of [[0.36, 0.163, '#1f6f78'], [0.3, 0.125, '#8a1f2b'], [0.05, 0.1, '#1f6f78']]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.5 }));
    band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
  }
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.163, 32), new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.8 }));
  head.rotation.x = -Math.PI / 2; head.position.y = 0.452; g.add(head);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.012, 8, 32), new THREE.MeshStandardMaterial({ color: '#8f7330', roughness: 0.3, metalness: 0.9 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.452; g.add(rim);
  return g;
}

// (ctx.fatality: Netanel's fatality — no damage: ctx.onCrack() when the crack reaches them)
export class Quake extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    this.drum = darbukaMesh();
    this.group.add(this.drum);
    this.crack = new THREE.Group();
    ctx.scene.add(this.crack);
    this.segs = [];
    this.crackMat = new THREE.MeshBasicMaterial({ color: '#2b2118', transparent: true, depthWrite: false });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bump = 0;
    if (!this.fatal) ctx.flash(o.index, 'EARTHQUAKE', 'DARBUKA BEAT');
  }
  cleanup() {
    this.ctx.scene.remove(this.crack);
    this.crack.traverse((x) => x.geometry?.dispose?.());
    this.crackMat.dispose(); this.glowMat.dispose();
  }
  tick() {
    this.t++;
    const o = this.owner;
    if (!this.fired) {
      // hit out of the drumming before the big beat: no earthquake
      if (!this.fatal && (o.state !== 'attack' || o.move?.id !== 'special')) { this.finish(); return; }
      const big = this.t === DARBUKA_FIRE;
      if (DARBUKA_BEATS.includes(this.t) || big) {
        this.bump = 1;
        const k = DARBUKA_BEATS.indexOf(this.t);
        this.ctx.shake(big ? 0.5 : k === 0 || k === 3 ? 0.14 : 0.07);
        this.ctx.rings.spawn(o.pos.x, 0.04, big ? '#ffb347' : '#e8c27a', { grow: big ? 0.3 : 0.14, life: big ? 30 : 18 });
        this.ctx.particles.burst(o.pos.x, 0.1, 0.3, { count: big ? 30 : 8, color: '#b89a72', speed: big ? 0.11 : 0.05, gravity: 0.006 });
        this.ctx.sfx.thud?.();
      }
      if (big) {
        this.fired = this.t;
        this.dir = sign(this.opp.pos.x - o.pos.x) || o.facing;
        this.x0 = o.pos.x + this.dir * 0.4;
        this.len = Math.max(0.5, Math.abs(this.opp.pos.x - this.x0));
      }
      return;
    }
    const since = this.t - this.fired;
    if (since === 12) o.endSpecial(); // done drumming: he can move again
    if (since % 6 === 0 && since < 50) this.ctx.shake(0.18);
    if (!this.hit && since >= 18) { // the crack takes 18 frames to reach them
      this.hit = true;
      const opp = this.opp;
      if (this.fatal) this.ctx.onCrack?.();
      else if (opp.alive) {
        strike(o, this.move, { push: this.move.push });
        if (opp.alive && opp.state !== 'caged' && !opp.goldSoak(o)) {
          opp.slow = this.move.slowFrames;
          this.ctx.flash(opp.index, 'SLOWED DOWN', 'THE GROUND IS SHAKING');
        }
        this.ctx.particles.burst(opp.pos.x, 0.2, 0.3, { count: 30, color: '#a88a62', speed: 0.13, gravity: 0.006 });
      }
    }
    if (since > 70) this.finish();
  }
  render() {
    const o = this.owner, hs = (o.def.heightCm || 175) / 175, f = o.facing;
    // the drum jumps a little on each beat
    this.bump *= 0.82;
    const showDrum = !this.fired || this.t - this.fired < 14;
    this.drum.visible = showDrum;
    // upright in front of his belly, the drum head just under his hands, tipped a little toward
    // the camera so you see him slapping it
    this.group.position.set(o.pos.x + f * 0.36 * hs, o.pos.y + (0.57 + this.bump * 0.03) * hs, 0.32);
    this.group.rotation.set(0.45, 0, f * 0.3);
    const s = hs * (1 + this.bump * 0.06);
    this.group.scale.set(s, s, s);
    if (!this.fired) return;
    // the crack: short zig-zag segments flat on the floor
    const since = this.t - this.fired, reach = Math.min(1, since / 18), fade = since > 48 ? Math.max(0, 1 - (since - 48) / 22) : 1;
    const want = Math.floor(reach * this.len / 0.28);
    while (this.segs.length < want) {
      const i = this.segs.length, x = this.x0 + this.dir * (i + 0.5) * 0.28;
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12 + Math.random() * 0.08), this.crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = (Math.random() - 0.5) * 0.9;
      crack.position.set(x, 0.012, (Math.random() - 0.5) * 0.25);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.045), this.glowMat);
      glow.rotation.copy(crack.rotation);
      glow.position.set(x, 0.016, crack.position.z);
      this.crack.add(crack, glow);
      this.segs.push(crack);
      this.ctx.particles.burst(x, 0.08, crack.position.z, { count: 5, color: i % 2 ? '#8c7356' : '#c9b08a', speed: 0.07, gravity: 0.008, life: 26 });
    }
    this.crackMat.opacity = fade;
    this.glowMat.opacity = 0.8 * fade * (0.6 + 0.4 * Math.sin(this.t * 0.6));
  }
}

// ── Or Haim: Hoshech Mavet ───────────────────────────────────────────────────
// He summons his alter ego out of his own shadow. Hoshech Mavet dashes behind the opponent with a
// scythe (slashing them on the way, then throwing it away) while Or Haim dashes in from the front;
// the two of them hit at the same time, the last hit kicks the opponent into the air, then
// Hoshech Mavet leaps after them and explodes. 20 for the combo, 5 for the explosion.
const HM = {
  rise: 26,           // rising out of the shadow
  dash: 14,           // both dash in
  flurry: 44,         // the double flurry starts
  beats: 6, beat: 9,  // 6 simultaneous hits, one every 9 frames
  kick: 98,           // both kick them into the air (the hit lands 4 frames in)
  fly: 34, high: 5.0, // they fly up this high over this many frames, then hang there
  crouch: 108,        // Hoshech Mavet crouches, gathering darkness…
  jump: 124,          // …leaps up after them…
  reach: 138,         // …reaches them and starts to glow…
  boom: 154,          // …and explodes
  end: 220,
  dmg: { scythe: 3, beat: 2, kick: 5, boom: 5 }, // 3 + 6×2 + 5 = 20 combo, + 5 explosion
};
const HM_OR = ['punch', 'cross', 'punch', 'cross', 'kick', 'cross'];
const HM_SHADOW = ['cross', 'punch', 'kick', 'punch', 'cross', 'punch'];
function scytheMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#24180f', roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd6', roughness: 0.25, metalness: 0.9, emissive: '#2a0e44', side: THREE.DoubleSide });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.7, 8), wood);
  g.add(pole);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.04);
  sh.quadraticCurveTo(0.5, 0.26, 1.0, -0.14);
  sh.quadraticCurveTo(0.5, 0.04, 0, -0.1);
  sh.lineTo(0, 0.04);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: false }), steel);
  blade.position.set(0, 0.8, -0.0075);
  g.add(blade);
  return g;
}
// purple glow on a body's materials (k 0…1), back to their own emissive at 0
function glowMats(mats, k) {
  for (const m of mats || []) {
    if (!m.emissive) continue;
    const base = m.userData.hmEmissive || (m.userData.hmEmissive = m.emissive.clone());
    m.emissive.copy(base).lerp(new THREE.Color(0.75, 0.3, 1.0), k);
  }
}
// (ctx.fatality: Or Haim's fatality (fatalities.js) — the same scene with no damage; at the
// explosion ctx.onBoom(x, y) blows them apart)
export class Darkness extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    this.rig = o.shadowRig || null;
    this.side = o.facing;
    this.cx = o.pos.x - o.facing * 0.55; // Hoshech Mavet: position, height, facing, pose
    this.cy = -2.3;
    this.cf = o.facing;
    this.cPose = { anim: 'gold', phase: 'active', pt: 1 };
    this.puddleX = this.cx;
    this.landed = 0;
    this.boomed = false;
    this.scythe = scytheMesh();
    this.group.add(this.scythe);
    this.sx = 0; this.sy = 0; this.svx = 0; this.svy = 0; this.spin = 0; this.thrown = false;
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: '#0b0710', transparent: true, opacity: 0, depthWrite: false }));
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.y = 0.015;
    this.group.add(this.puddle);
    // the explosion: a dark core inside a purple-orange fireball
    this.ballMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: '#2a0f45', transparent: true, opacity: 0, depthWrite: false });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.ballMat);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), this.coreMat);
    this.ball.visible = this.core.visible = false;
    this.group.add(this.ball, this.core);
    if (this.rig) { ctx.scene.add(this.rig.object); this.rig.setOpacity?.(1); this.rig.object.visible = false; }
    o.poseOverride = { anim: 'gold', phase: 'active', pt: 1 };
    this.opp.holdLife = true; // if this finishes them, it's the explosion that does it
    if (!this.fatal) ctx.flash(o.index, 'HOSHECH MAVET', 'FROM THE SHADOWS');
    ctx.shake(0.15);
    ctx.sfx.teleport?.();
  }
  cleanup() {
    this.opp.holdLife = false;
    if (this.rig) { this.ctx.scene.remove(this.rig.object); glowMats(this.rig.fallback ? this.rig.fallback.materials : this.rig.materials, 0); this.rig.setOpacity?.(1); }
    if (this.halo) { for (const sp of [this.halo, this.rays, this.rays2]) sp.material.dispose(); this.haloTex.dispose(); this.raysTex.dispose(); }
    this.ctx.camera?.(null);
    this.owner.poseOverride = null;
  }
  hit(extra, fromX) {
    if (this.fatal) { // no damage: just their body taking it
      this.opp.poseOverride = { anim: extra.knockdown ? 'knockdown' : 'hit', phase: 'active', pt: extra.knockdown ? 1 : 0 };
      this.hitT = this.t; this.landed++;
      return 'hit';
    }
    const r = strike(this.owner, this.move, { hitstun: 40, push: 0, noLimit: true, ...extra }, fromX ?? this.owner.pos.x);
    if (r === 'hit' || r === 'gold') this.landed++;
    return r;
  }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp, P = this.ctx.particles;
    const alive = this.fatal || opp.alive; // (the fatality: they're already beaten, it plays on anyway)
    if (this.fatal && this.hitT && t - this.hitT > 8 && opp.poseOverride?.anim === 'hit') opp.poseOverride = { anim: 'dazed', phase: 'active', pt: 1 };
    // Or Haim knocked out of it before the explosion: Hoshech Mavet sinks back into the shadow
    if (!this.fatal && !this.boomed && (o.state !== 'attack' || o.move?.id !== 'special')) {
      if (!this.landed && o.alive) { o.specialsLeft++; o.game.onSpecialRefund?.(o); }
      P.burst(this.cx, Math.max(0, this.cy) + 1, 0.3, { count: 30, color: '#15101c', speed: 0.09, gravity: -0.002, life: 30 });
      this.finish();
      return;
    }
    const lim = PHYS.arenaHalf;
    const ease = (k) => k * k * (3 - 2 * k);
    // gold Ori: the sun glints off him straight onto Hoshech Mavet, who is a shadow: he burns away
    if (!this.fatal && !this.burn && t === 14 && opp.gold > 0 && alive) {
      this.burn = t;
      this.cPose = { anim: 'hit', phase: 'active', pt: 0 };
      o.poseOverride = { anim: 'idle', phase: 'active', pt: 0 };
      this.ctx.flash(opp.index, 'THE SUN ON GOLD', 'THE SHADOW BURNS');
      this.ctx.sfx.zap?.();
    }
    if (this.burn) {
      const k = t - this.burn;
      this.cy = -2.3 * (1 - ease(Math.min(1, t / HM.rise)));
      this.cPose = { anim: k % 16 < 8 ? 'hit' : 'blockHit', phase: 'active', pt: 0 }; // writhing
      const top = Math.max(0, this.cy);
      if (t % 2 === 0) {
        P.burst(this.cx + (Math.random() - 0.5) * 0.7, top + 0.4 + Math.random() * 1.5, 0.2, { count: 3, color: '#15101c', speed: 0.03, gravity: -0.004, life: 34 });
        P.burst(this.cx + (Math.random() - 0.5) * 0.6, top + 0.5 + Math.random() * 1.4, 0.2, { count: 2, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd23f', speed: 0.04, gravity: -0.003, life: 18 });
      }
      if (k === 58) P.burst(this.cx, top + 1.1, 0.3, { count: 50, color: '#15101c', speed: 0.08, gravity: -0.003, life: 40 });
      if (k >= 60) { this.boomed = true; o.poseOverride = null; o.endSpecial(); this.finish(); }
      return;
    }
    // 1. rising out of the shadow behind him
    if (t <= HM.rise) {
      const k = t / HM.rise;
      this.cy = -2.3 * (1 - ease(k));
      if (t % 2 === 0) P.burst(this.cx + (Math.random() - 0.5) * 0.8, 0.1, 0.2, { count: 4, color: Math.random() < 0.7 ? '#15101c' : '#6c34b8', speed: 0.04, gravity: -0.003, life: 26 });
    }
    // 2. both dash in: Hoshech Mavet through them to their back (slashing with the scythe), Or Haim to their front
    if (t === HM.rise) {
      this.side = sign(opp.pos.x - o.pos.x || o.facing);
      this.lockX = Math.max(-lim + 1.1, Math.min(lim - 1.1, opp.pos.x));
      this.from = { c: this.cx, o: o.pos.x, v: opp.pos.x };
      this.cPose = { anim: 'dash', phase: 'active', pt: 0.5 };
      o.poseOverride = { anim: 'dash', phase: 'active', pt: 0.5 };
      this.ctx.sfx.whoosh?.();
    }
    if (t > HM.rise && t <= HM.rise + HM.dash) {
      const k = ease((t - HM.rise) / HM.dash), s = this.side;
      this.cx = this.from.c + (this.lockX + s * 0.95 - this.from.c) * k;
      this.cy = 0;
      this.cf = s;
      o.pos.x = this.from.o + (this.lockX - s * 0.85 - this.from.o) * k;
      o.vel.x = 0;
      o.facing = s;
      if (alive && (this.fatal || opp.state !== 'ko')) { opp.pos.x = this.from.v + (this.lockX - this.from.v) * k; opp.vel.x = 0; }
      P.burst(this.cx, 1.0, 0.2, { count: 3, color: '#2a1840', speed: 0.03, gravity: 0, life: 18 });
      if (t === HM.rise + 7) {
        this.hit({ damage: HM.dmg.scythe });
        P.burst(this.lockX, 1.2, 0.3, { count: 26, color: '#d8d0ff', speed: 0.14, gravity: 0.002, dir: s });
      }
    }
    // the scythe is thrown away after the dash; both turn on them
    if (t === HM.rise + HM.dash) {
      this.thrown = true;
      this.sx = this.cx + this.side * 0.4; this.sy = 1.3;
      this.svx = this.side * 0.13; this.svy = 0.19;
      this.cf = -this.side;
    }
    if (this.thrown) { this.sx += this.svx; this.sy += this.svy; this.svy -= 0.008; this.spin += 0.45; }
    // 3. the double flurry, then the double kick into the air
    const locked = t > HM.rise + HM.dash && t < HM.kick + 4;
    if (locked && alive && (this.fatal || opp.state !== 'ko')) { opp.pos.x = this.lockX; opp.vel.x = 0; }
    if (t > HM.rise && t < HM.kick + 4) opp.pinnedUntil = (opp.clock || 0) + 2;
    if (t >= HM.flurry && t < HM.flurry + HM.beats * HM.beat) {
      const n = Math.floor((t - HM.flurry) / HM.beat), u = (t - HM.flurry) % HM.beat;
      const phase = u < 3 ? 'startup' : u < 6 ? 'active' : 'recovery', pt = u < 3 ? u / 3 : u < 6 ? (u - 3) / 3 : (u - 6) / 3;
      o.poseOverride = { anim: HM_OR[n], phase, pt };
      this.cPose = { anim: HM_SHADOW[n], phase, pt };
      if (u === 3) {
        this.hit({ damage: HM.dmg.beat });
        P.burst(this.lockX - this.side * 0.3, 1.3, 0.3, { count: 10, color: '#ffe7a0', speed: 0.09, dir: this.side });
        P.burst(this.lockX + this.side * 0.3, 1.3, 0.3, { count: 10, color: '#b07cff', speed: 0.09, dir: -this.side });
      }
    } else if (t >= HM.flurry - 4 && t < HM.flurry) {
      o.poseOverride = this.cPose = { anim: 'idle', phase: null, pt: 0 };
    }
    if (t >= HM.kick && t < HM.jump) {
      const u = t - HM.kick;
      const phase = u < 4 ? 'startup' : u < 10 ? 'active' : 'recovery', pt = u < 4 ? u / 4 : u < 10 ? (u - 4) / 6 : 0.2;
      o.poseOverride = { anim: 'highKick', phase, pt };
      this.cPose = { anim: 'highKick', phase, pt };
      if (u === 4) {
        this.hit({ damage: HM.dmg.kick, knockdown: true, launch: 0.19, hitstun: 30 }, this.lockX - this.side);
        opp.vel.x = 0;
        this.ctx.shake(0.25);
        this.ctx.rings.spawn(this.lockX, 0.05, '#7a3cc8', { grow: 0.16, life: 20 });
      }
    }
    // 4. they fly high into the air; Hoshech Mavet crouches, leaps after them and explodes
    const up = HM.kick + 4;
    if (t > up && t < HM.boom && alive && (this.fatal || opp.state === 'knockdown')) {
      // carried up by the kick and held hanging at the top (bobbing) until the explosion
      const k = Math.min(1, (t - up) / HM.fly);
      opp.pos.y = HM.high * (1 - (1 - k) * (1 - k) * (1 - k)) + (k >= 1 ? Math.sin((t - up - HM.fly) * 0.15) * 0.08 : 0);
      opp.pos.x = this.lockX;
      opp.vel.x = 0; opp.vel.y = 0;
      opp.pinnedUntil = (opp.clock || 0) + 2;
      if (k < 1 && t % 2 === 0) P.burst(opp.pos.x, opp.pos.y + 0.5, 0.2, { count: 3, color: '#ffffff', speed: 0.03, gravity: 0.002, life: 14 });
    }
    if (t === HM.crouch) {
      this.cPose = { anim: 'uppercut', phase: 'startup', pt: 0 };
      o.poseOverride = { anim: 'gold', phase: 'active', pt: 1 };
      this.cx = this.lockX + this.side * 0.95;
    }
    if (t >= HM.crouch && t < HM.jump) {
      // crouched, darkness gathering at his feet
      this.cPose = { anim: 'uppercut', phase: 'startup', pt: Math.min(1, (t - HM.crouch) / 8) };
      if (t % 2 === 0) P.burst(this.cx + (Math.random() - 0.5) * 1.6, 0.1, 0.4, { count: 3, color: Math.random() < 0.6 ? '#15101c' : '#9a5cff', speed: 0.05, gravity: -0.004, life: 20 });
      if ((t - HM.crouch) % 6 === 0) this.ctx.rings.spawn(this.cx, 0.04, '#7a3cc8', { grow: 0.06, life: 18 });
    }
    if (t === HM.jump) {
      // the leap: the ground cracks under him
      this.jumpFrom = { x: this.cx, y: 0 };
      this.cPose = { anim: 'uppercut', phase: 'active', pt: 0.5 };
      this.ctx.shake(0.4);
      this.ctx.rings.spawn(this.cx, 0.05, '#b07cff', { grow: 0.28, life: 24 });
      P.burst(this.cx, 0.2, 0.4, { count: 46, color: '#a88a70', speed: 0.13, gravity: 0.005, spread: 2 });
      P.burst(this.cx, 0.3, 0.4, { count: 30, color: '#15101c', speed: 0.1, gravity: -0.002, life: 30 });
      this.ctx.sfx.whoosh?.();
      this.ctx.sfx.thud?.();
    }
    if (t > HM.jump && t <= HM.reach) {
      const k = (t - HM.jump) / (HM.reach - HM.jump);
      this.cx = this.jumpFrom.x + (opp.pos.x + this.side * 0.45 - this.jumpFrom.x) * ease(k);
      this.cy = (opp.pos.y - 1.0) * (1 - (1 - k) * (1 - k));
      P.burst(this.cx, this.cy + 0.6, 0.3, { count: 5, color: Math.random() < 0.5 ? '#15101c' : '#7a3cc8', speed: 0.03, gravity: 0.002, life: 24 });
    }
    if (t > HM.reach && t < HM.boom) {
      // face to face up there, glowing brighter and brighter
      this.cy = opp.pos.y - 1.0;
      this.cx = opp.pos.x + this.side * 0.45;
      this.cPose = { anim: 'gold', phase: 'active', pt: 1 };
      this.glow = (t - HM.reach) / (HM.boom - HM.reach);
      const a = t * 0.7;
      P.burst(this.cx + Math.cos(a) * 1.4, this.cy + 1 + Math.sin(a) * 1.4, 0.3, { count: 3, color: '#c99cff', speed: 0.02, gravity: 0, life: 12 });
      if (t % 5 === 0) this.ctx.shake(0.1 + this.glow * 0.2);
    }
    // a dark aura around Hoshech Mavet while he's out
    if (!this.boomed && t > 4 && t % 3 === 0) P.burst(this.cx + (Math.random() - 0.5) * 0.6, Math.max(0, this.cy) + 0.3 + Math.random() * 1.6, 0.2, { count: 2, color: Math.random() < 0.7 ? '#15101c' : '#6c34b8', speed: 0.025, gravity: -0.0015, life: 22 });
    if (t === HM.boom) {
      this.boomed = true;
      this.glow = 0;
      const x = this.cx, y = this.cy + 1.0;
      this.boomAt = { x, y };
      if (this.fatal) { this.ctx.onBoom?.(x, y); o.poseOverride = null; o.endSpecial(); return; } // (its own, bigger explosion)
      new Explosion(this.ctx.scene, x, y, { size: 1.3, tint: true }); // (a real one: fire, smoke, a flash)
      P.burst(x, y, 0.4, { count: 70, color: '#ffd27a', speed: 0.34, gravity: 0.004, life: 30 }); // sparks
      this.ctx.rings.spawn(x, y, '#ffe2b0', { grow: 0.5, life: 22, flat: false }); // the shockwave
      this.ctx.rings.spawn(x, 0.05, '#ffb066', { grow: 0.4, life: 34 });
      this.ctx.whiteFlash?.(450);
      this.ctx.shake(0.8);
      this.ctx.sfx.thud?.();
      this.ctx.sfx.hit?.(true);
      // blown away from Or Haim, falling from the sky
      opp.holdLife = false;
      this.hit({ damage: HM.dmg.boom, knockdown: true, launch: 0.06, push: 0.08, hitstun: 30 }, opp.pos.x - this.side * 0.5);
      // the explosion finished them: they go up with it
      if (!opp.alive || opp.hp <= 0) this.ctx.explode?.(opp);
      o.poseOverride = null;
      o.endSpecial();
    }
    if (t >= HM.end) this.finish();
  }
  render(time) {
    const dt = this.lastTime ? Math.min(0.05, Math.max(0, time - this.lastTime)) : 1 / 60;
    this.lastTime = time;
    const t = this.t;
    // the shadow puddle he rises out of
    const pk = Math.min(1, t / 10) * Math.max(0, Math.min(1, (HM.rise + 16 - t) / 14));
    this.puddle.visible = pk > 0;
    this.puddle.position.x = this.puddleX;
    this.puddle.scale.setScalar(0.4 + 0.8 * Math.min(1, t / 12));
    this.puddle.material.opacity = 0.85 * pk;
    // Hoshech Mavet
    if (this.rig) {
      this.rig.object.visible = !this.boomed && t > 0;
      this.rig.object.position.set(this.cx, this.cy, 0);
      this.rig.setFacing(this.cf);
      this.rig.update(dt, this.cPose.anim, { t, phase: this.cPose.phase, pt: this.cPose.pt, duration: 9 });
    }
    // he glows before he explodes
    if (this.rig) {
      const mats = this.rig.fallback ? this.rig.fallback.materials : this.rig.materials;
      const g = this.boomed ? 0 : this.glow || 0;
      if (g !== this.lastGlow && !this.burn) { this.lastGlow = g; glowMats(mats, g); }
    }
    if (this.burn) this.renderBurn(t);
    // the camera tilts up to follow them into the sky
    const opp = this.opp, o = this.owner;
    if (t > HM.kick + 4 && t < HM.boom + 45) {
      const y = opp.pos.y;
      this.ctx.camera?.({ x: (o.pos.x + opp.pos.x) / 2, y: 0.9 + y * 0.72, half: Math.abs(o.pos.x - opp.pos.x) / 2 + 2.2, halfH: 2.2 + y * 0.45 });
    }
    // the fireball
    const bk = this.boomAt ? (t - HM.boom) / 30 : -1;
    this.ball.visible = this.core.visible = !this.fatal && bk >= 0 && bk < 1;
    if (this.ball.visible) {
      this.ball.position.set(this.boomAt.x, this.boomAt.y, 0);
      this.core.position.copy(this.ball.position);
      this.ball.scale.setScalar(0.6 + 3.0 * Math.sqrt(bk));
      this.core.scale.setScalar(0.5 + 2.2 * Math.sqrt(bk));
      this.ballMat.opacity = 0.9 * (1 - bk);
      this.ballMat.color.set(bk < 0.3 ? '#ffd27a' : '#b05cff');
      this.coreMat.opacity = 0.8 * (1 - bk) * (1 - bk);
    }
    // the scythe: in his hands while he dashes, then spinning away (it burns away with him)
    if (this.burn) { this.scythe.visible = t > 6 && t - this.burn < 40; this.scythe.position.set(this.cx + this.cf * 0.35, this.cy + 1.0, 0.25); return; }
    this.scythe.visible = !this.boomed && t > 6 && this.sy > -1;
    if (!this.thrown) {
      const dashing = t > HM.rise;
      this.scythe.position.set(this.cx + this.cf * 0.35, this.cy + 1.0, 0.25);
      this.scythe.rotation.set(0, this.cf > 0 ? 0 : Math.PI, dashing ? -1.1 : -0.25);
    } else {
      this.scythe.position.set(this.sx, this.sy, 0.25);
      this.scythe.rotation.set(0, this.side > 0 ? 0 : Math.PI, -this.spin);
    }
  }
  // gold Ori catches the sun and shines like a light source: a soft glow and rays spreading out
  // from him in every direction. Hoshech Mavet, a shadow, flushes orange in it and fades away
  renderBurn(t) {
    const k = t - this.burn, opp = this.opp;
    if (!this.halo) {
      const radial = (stops) => {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        for (const [p, col] of stops) gr.addColorStop(p, col);
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
      };
      this.haloTex = radial([[0, 'rgba(255,250,220,1)'], [0.15, 'rgba(255,226,140,0.85)'], [0.45, 'rgba(255,190,70,0.28)'], [1, 'rgba(255,170,40,0)']]);
      // soft rays: many thin wedges of light fading out from the middle
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d');
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.07, w = 0.03 + (i % 4) * 0.012, len = 180 + (i % 5) * 16;
        const gr = g.createLinearGradient(256, 256, 256 + Math.cos(a) * len, 256 + Math.sin(a) * len);
        gr.addColorStop(0, 'rgba(255,235,170,0.55)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(256, 256);
        g.arc(256, 256, len, a - w, a + w); g.closePath(); g.fill();
      }
      this.raysTex = new THREE.CanvasTexture(c); this.raysTex.colorSpace = THREE.SRGBColorSpace;
      const mat = (map) => new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.halo = new THREE.Sprite(mat(this.haloTex));
      this.rays = new THREE.Sprite(mat(this.raysTex));
      this.rays2 = new THREE.Sprite(mat(this.raysTex));
      this.group.add(this.halo, this.rays, this.rays2);
    }
    const ori = new THREE.Vector3(opp.pos.x, opp.pos.y + 1.35, 0.4);
    const on = Math.min(1, k / 10) * (k < 48 ? 1 : Math.max(0, 1 - (k - 48) / 12));
    const pulse = 1 + Math.sin(t * 0.35) * 0.06;
    this.halo.position.copy(ori); this.halo.scale.setScalar(2.4 * pulse * (0.6 + 0.4 * on));
    this.halo.material.opacity = 0.55 * on;
    this.rays.position.copy(ori); this.rays.scale.setScalar(7.5 * pulse);
    this.rays.material.rotation = t * 0.004; this.rays.material.opacity = 0.5 * on;
    this.rays2.position.copy(ori); this.rays2.scale.setScalar(5.5 / pulse);
    this.rays2.material.rotation = -t * 0.006 + 0.3; this.rays2.material.opacity = 0.32 * on;
    if (this.rig) {
      const fade = Math.max(0, 1 - k / 55);
      this.rig.setOpacity?.(fade);
      const mats = this.rig.fallback ? this.rig.fallback.materials : this.rig.materials;
      for (const m of mats || []) {
        if (!m.emissive) continue;
        const base = m.userData.hmEmissive || (m.userData.hmEmissive = m.emissive.clone());
        m.emissive.copy(base).lerp(new THREE.Color(1, 0.45, 0.1), Math.min(1, k / 20));
      }
    }
  }


}

// ── Haim: satellite strike ───────────────────────────────────────────────────
// He calls it in on his walkie-talkie (like Tony Stark's drone strike on the bus in Spider-Man):
// a satellite flies in and hovers far away, high in the sky behind him. Its red laser sight
// locks onto the opponent, then it opens fire: a barrage of bolts from its two guns, each one
// hitting, the last one knocking them down.
const SAT = { call: 56, arrive: 22, lock: 54, fire: 86, gap: 9, shots: 6, fly: 8 };
SAT.last = SAT.fire + (SAT.shots - 1) * SAT.gap + SAT.fly; // the last bolt lands
function walkieMesh() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.6, metalness: 0.2 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.17, 0.045), black); g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.05, 0.048), yellow); band.position.y = -0.04; g.add(band);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.13, 6), black); ant.position.set(0.022, 0.145, 0); g.add(ant);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' })); led.position.set(-0.02, 0.07, 0.024); g.add(led);
  g.userData.led = led;
  return g;
}
// the satellite: gold foil body, blue solar panels on two arms, a dish with a lens underneath
// (its -y points at the target; the laser sight comes out of the lens), two guns underneath
// pointing the same way, and a blinking red light
function satelliteMesh() {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.35, metalness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: '#e8eaee', roughness: 0.5, metalness: 0.3 });
  const panel = new THREE.MeshStandardMaterial({ color: '#1d3f8a', roughness: 0.25, metalness: 0.6, emissive: '#0a1a44' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.6), foil); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.62), white); top.position.y = 0.25; g.add(top);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35), white); arm.rotation.z = Math.PI / 2; arm.position.x = s * 0.38; g.add(arm);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 0.42), panel); p.position.x = s * 1.02; g.add(p);
    for (let i = 1; i < 4; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.42), white); line.position.set(s * (0.55 + i * 0.24), 0, 0); g.add(line); }
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 20, 1, true), white); dish.position.y = -0.3; g.add(dish);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#7fe6ff' })); lens.position.y = -0.38; g.add(lens);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); light.position.set(0, 0.32, 0.25); g.add(light);
  // two gun turrets under the body, barrels pointing the same way as the dish (-y)
  const gunMetal = new THREE.MeshStandardMaterial({ color: '#6b727c', roughness: 0.3, metalness: 0.9 });
  const gunDark = new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.45, metalness: 0.8 });
  const guns = [];
  for (const s of [-1, 1]) {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.22), gunDark); mount.position.set(s * 0.3, -0.24, 0.2); g.add(mount);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.75, 12), gunMetal); barrel.position.set(s * 0.3, -0.66, 0.2); g.add(barrel);
    for (const y of [-0.5, -0.82]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12), gunDark); band.position.set(s * 0.3, y, 0.2); g.add(band); }
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff8a3a' })); muzzle.position.set(s * 0.3, -1.05, 0.2); g.add(muzzle);
    guns.push(muzzle);
  }
  g.userData = { lens, light, guns };
  return g;
}
const UP = new THREE.Vector3(0, 1, 0);
// stretch a unit-height cylinder from a to b
function spanTo(mesh, a, b, width) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length() || 0.001;
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  mesh.scale.set(width, len, width);
}
// (ctx.fatality: Haim's fatality — a much longer barrage, no damage: ctx.onShot(i, last) as each lands)
export class Satellite extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    this.fatal = !!ctx.fatality;
    this.S = this.fatal ? { ...SAT, shots: 16, gap: 6 } : SAT;
    this.S.last = this.S.fire + (this.S.shots - 1) * this.S.gap + this.S.fly;
    this.side = o.facing;
    this.tx = this.opp.pos.x;
    this.hits = 0;
    // the walkie-talkie in his hand while he calls it in
    this.walkie = walkieMesh();
    ctx.scene.add(this.walkie);
    o.poseOverride = { anim: 'radio', phase: 'active', pt: 0 };
    // the satellite and where it hovers: far away, high up and deep in the sky behind Haim
    this.sat = satelliteMesh();
    this.sat.visible = false;
    this.group.add(this.sat);
    this.home = new THREE.Vector3(o.pos.x * 0.4 - o.facing * 1.2, 3.5, -6.5);
    // the reticle on the ground
    this.ret = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), red); ring.rotation.x = -Math.PI / 2; this.ret.add(ring);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32), red); inner.rotation.x = -Math.PI / 2; this.ret.add(inner);
    for (let i = 0; i < 4; i++) { const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.26), red); tick.rotation.x = -Math.PI / 2; tick.rotation.z = (i * Math.PI) / 2; const a = (i * Math.PI) / 2; tick.position.set(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62); this.ret.add(tick); }
    this.retMat = red;
    this.ret.position.y = 0.02;
    ctx.scene.add(this.ret);
    // the laser sight and the plasma bolts (unit cylinders, stretched each frame)
    const add = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sightMat = add('#ff2a2a');
    this.sight = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), this.sightMat);
    this.boltMat = add('#ff6a2a'); this.boltCoreMat = add('#fff1c0');
    this.flashMat = add('#ffb070');
    this.bolts = Array.from({ length: this.S.shots }, () => {
      const b = { glow: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), this.boltMat), core: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), this.boltCoreMat),
        flash: new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.flashMat) };
      ctx.scene.add(b.glow, b.core, b.flash);
      return b;
    });
    ctx.scene.add(this.sight);
    if (!this.fatal) ctx.flash(o.index, 'SATELLITE STRIKE', 'CALLING IT IN');
    ctx.sfx.zap?.();
  }
  cleanup() {
    const parts = [this.ret, this.sight, this.walkie, ...this.bolts.flatMap((b) => [b.glow, b.core, b.flash])];
    for (const x of parts) { this.ctx.scene.remove(x); x.traverse((y) => { y.geometry?.dispose?.(); if (x === this.walkie) y.material?.dispose?.(); }); }
    for (const mt of [this.retMat, this.sightMat, this.boltMat, this.boltCoreMat, this.flashMat]) mt.dispose();
    if (this.owner.poseOverride?.anim === 'radio') this.owner.poseOverride = null;
  }
  // the point it aims at: the opponent's chest
  aim() { const o = this.opp; return new THREE.Vector3(o.pos.x, o.pos.y + (o.state === 'knockdown' ? 0.5 : 1.1), 0); }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp;
    // on the radio, then he can fight again while the ship does the rest
    if (t < this.S.call && (this.fatal || (o.state === 'attack' && o.move?.id === 'special'))) { o.poseOverride = { anim: 'radio', phase: 'active', pt: t / this.S.call }; o.vel.x = 0; }
    if (t === 30) this.ctx.sfx.zap?.();
    if (t === this.S.call) { o.poseOverride = null; if (!this.fatal) o.endSpecial(); }
    if (t === this.S.lock && !this.fatal) { this.ctx.flash(o.index, 'TARGET LOCKED', 'OPEN FIRE'); this.ctx.sfx.zap?.(); }
    if (t <= this.S.fire) this.tx += (opp.pos.x - this.tx) * 0.12; // tracking them
    // the barrage: a bolt from its guns (taking turns) every few frames; each one lands
    for (let i = 0; i < this.S.shots; i++) {
      const f = this.S.fire + i * this.S.gap;
      if (t === f) this.ctx.sfx.zap?.();
      if (t === f + this.S.fly) {
        const last = i === this.S.shots - 1, at = this.aim();
        this.ctx.particles.burst(at.x, at.y, 0.3, { count: last ? 50 : 18, color: '#ffb347', speed: last ? 0.17 : 0.11, gravity: 0.004 });
        this.ctx.particles.burst(at.x, at.y, 0.3, { count: last ? 24 : 8, color: '#fff1c0', speed: 0.09, gravity: 0.002 });
        this.ctx.shake(last ? 0.5 : 0.15);
        if (last) { this.ctx.rings.spawn(at.x, 0.05, '#ffb347', { grow: 0.3, life: 26 }); this.ctx.sfx.thud?.(); }
        if (this.fatal) this.ctx.onShot?.(i, last);
        else if (opp.alive) {
          this.hits++;
          const r = strike(o, this.move, last ? { damage: this.move.damage / this.S.shots, knockdown: true, launch: 0.12, push: this.move.push }
            : { damage: this.move.damage / this.S.shots, hitstun: this.S.gap + 8, push: 0.02 }, opp.pos.x - this.side * 0.5);
          // gold Ori: the bolt ricochets off him, up and away
          if (r === 'gold') {
            (this.bounce ||= [])[i] = { t0: t, from: at.clone(), v: new THREE.Vector3(this.side * (0.1 + (i % 3) * 0.04), 0.13 + (i % 2) * 0.05, (i % 2 ? 1 : -1) * 0.04) };
            this.ctx.particles.burst(at.x, at.y, 0.3, { count: 16, color: '#ffd23f', speed: 0.13, gravity: 0.004, life: 14 });
            this.ctx.sfx.block?.();
          }
        }
      }
    }
    if (t > this.S.last + 60) this.finish();
  }
  render(time) {
    const t = this.t, o = this.owner;
    // the walkie-talkie in his right hand while he's on the radio
    const hand = o.body.auto?.bones?.rHand;
    this.walkie.visible = t < this.S.call && !!hand;
    if (this.walkie.visible) {
      hand.getWorldPosition(this.walkie.position);
      this.walkie.position.y += 0.06;
      this.walkie.rotation.set(0, o.facing > 0 ? 0.6 : -0.6, 0);
      this.walkie.scale.setScalar(2.2);
      this.walkie.userData.led.visible = Math.floor(time * 6) % 2 === 0;
    }
    // fly in from off screen to its spot far away, hover, then leave
    const inK = Math.min(1, Math.max(0, (t - this.S.arrive) / 30)), outK = Math.max(0, (t - this.S.last - 14) / 40);
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    this.sat.visible = t >= this.S.arrive;
    const pos = this.home.clone();
    pos.x += (1 - ease(inK)) * -this.side * 12 - ease(outK) * this.side * 16;
    pos.y += (1 - ease(inK)) * 3 + ease(outK) * 4 + Math.sin(time * 2) * 0.08;
    this.sat.position.copy(pos);
    this.sat.scale.setScalar(1.8);
    // the dish (its -y) points at the target; it kicks back with each shot
    const target = this.aim();
    const dir = new THREE.Vector3().subVectors(target, pos).normalize();
    this.sat.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const shot = t >= this.S.fire ? (t - this.S.fire) % this.S.gap : 99;
    if (t >= this.S.fire && t < this.S.last && shot < 4) this.sat.position.addScaledVector(dir, -0.12 * (1 - shot / 4));
    const ud = this.sat.userData;
    ud.light.visible = Math.floor(time * 4) % 2 === 0;
    ud.guns.forEach((g) => g.scale.setScalar(t >= this.S.lock && t < this.S.last ? 1.3 + Math.sin(time * 30) * 0.3 : 1)); // hot
    this.sat.updateMatrixWorld(true);
    const muzzle = (i) => ud.guns[i % 2].getWorldPosition(new THREE.Vector3()); // the guns take turns
    // reticle: tracking, pulsing, spinning; gone once it opens fire
    const locking = t >= this.S.lock - 8 && t < this.S.fire;
    this.ret.visible = locking || (t >= this.S.arrive + 20 && t < this.S.fire);
    this.ret.position.x = this.tx;
    this.ret.rotation.y = time * 2;
    this.ret.scale.setScalar(1 + Math.sin(time * 12) * 0.06 + Math.max(0, (this.S.fire - t) / this.S.fire) * 0.5);
    this.retMat.opacity = 0.6 + 0.35 * Math.sin(time * 16);
    // the red laser sight from its eye to them, while it locks on
    this.sight.visible = locking;
    if (locking) { spanTo(this.sight, ud.lens.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(this.tx, 1.1, 0), 0.025); this.sightMat.opacity = 0.45 + 0.4 * Math.sin(time * 20); }
    // the bolts: a streak of plasma from the cannon to them, a flash at the muzzle as it fires
    this.boltMat.opacity = 0.85; this.boltCoreMat.opacity = 1; this.flashMat.opacity = 0.8;
    this.bolts.forEach((b, i) => {
      const f = this.S.fire + i * this.S.gap, k = (t - f) / this.S.fly;
      const flying = k >= 0 && k <= 1, rb = this.bounce?.[i], since = rb ? t - rb.t0 : 99;
      b.glow.visible = b.core.visible = flying || since < 18;
      b.flash.visible = k >= 0 && k < 0.4;
      if (!flying && since < 18) { // ricocheting off gold Ori
        const head = rb.from.clone().addScaledVector(rb.v, since + 1), tail = head.clone().addScaledVector(rb.v.clone().normalize(), -0.9);
        spanTo(b.glow, tail, head, 0.13 * (1 - since / 22));
        spanTo(b.core, tail, head, 0.05);
        return;
      }
      if (!flying) return;
      const from = muzzle(i), d = new THREE.Vector3().subVectors(target, from);
      const len = d.length(), head = from.clone().addScaledVector(d, k), tail = head.clone().addScaledVector(d, -Math.min(0.9, len * k) / len); // a short bolt, not a beam
      spanTo(b.glow, tail, head, 0.13);
      spanTo(b.core, tail, head, 0.05);
      b.flash.position.copy(from);
      b.flash.scale.setScalar(0.22 * (1 - k * 2));
    });
  }
}

// ── Zohar: the whip ──────────────────────────────────────────────────────────
// He pulls out a long leather whip and teaches them a lesson: three cracks (they're held in place,
// flinching), and on the third they drop to their knees. The whip is a real rope: a chain of points
// with gravity, pinned to his hand, lying on the floor at rest; on each lash his arm swings it back
// over his head and snaps it forward, and the snap rolls down the whip to crack at the tip.
const WH = { lashes: [30, 60, 90], wind: 16, end: 140, n: 26, len: 3.6 };
class Whip extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const opp = this.opp;
    this.dir = sign(opp.pos.x - o.pos.x || o.facing);
    // too far away: he strides in to whip's length first
    if (Math.abs(opp.pos.x - o.pos.x) > 3.2) o.pos.x = opp.pos.x - this.dir * 3.2;
    this.lockX = opp.pos.x;
    this.hits = 0;
    this.leather = new THREE.MeshStandardMaterial({ color: '#6b3d1f', roughness: 0.6 });
    this.handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 8), new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.5 }));
    this.cord = new THREE.Mesh(new THREE.BufferGeometry(), this.leather);
    this.cord.frustumCulled = false;
    this.group.add(this.handle, this.cord);
    // the rope, lying out on the floor in front of him
    this.hand = new THREE.Vector3(o.pos.x + this.dir * 0.3, o.pos.y + 1.3, 0.1);
    const seg = WH.len / (WH.n - 1);
    this.seg = seg;
    this.pts = Array.from({ length: WH.n }, (_, i) => {
      const p = new THREE.Vector3(this.hand.x + this.dir * Math.max(0, i * seg - 1.2), Math.max(0.03, this.hand.y - i * seg), 0.15);
      return { p, q: p.clone() };
    });
    ctx.flash(o.index, 'LESSON TIME', 'THE WHIP');
    o.poseOverride = { anim: 'whip', phase: 'active', pt: 0 };
  }
  cleanup() {
    this.leather.dispose(); this.cord.geometry.dispose(); this.owner.poseOverride = null;
    if (this.kneeling && this.opp.poseOverride?.anim === 'kneel') this.opp.poseOverride = null;
  }
  // where we are in the current lash: -1 = not lashing, 0…1 wind-up, 1…2 crack and follow-through
  lash(t) {
    for (const h of WH.lashes) {
      if (t >= h - WH.wind && t < h) return (t - (h - WH.wind)) / WH.wind;
      if (t >= h && t < h + 12) return 1 + (t - h) / 12;
    }
    return -1;
  }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp;
    if (o.state !== 'attack' || o.move?.id !== 'special') { this.finish(); return; } // (the special was stopped)
    o.vel.x = 0; o.facing = this.dir;
    // held where they are while the lesson lasts
    if (opp.alive && opp.state !== 'ko') { opp.pos.x = this.lockX; opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2; }
    const l = this.lash(t);
    o.poseOverride = { anim: 'whip', phase: 'active', pt: l < 0 ? 0.4 : l <= 1 ? 1 - l : Math.min(1, (l - 1) * 3) };
    if (WH.lashes.includes(t) && opp.alive) {
      const last = ++this.hits === 3;
      // no knockback: flinching in place, and down on their knees after the third
      const r = strike(o, this.move, { damage: this.move.damage / 3, hitstun: last ? WH.end - t + 4 : 30, push: 0, noLimit: true }, o.pos.x);
      opp.vel.x = 0;
      if (last && r === 'hit') { this.kneeling = true; opp.poseOverride = { anim: 'kneel', phase: 'active', pt: 0 }; this.ctx.shake(0.25); }
      const tip = { x: opp.pos.x - this.dir * 0.15, y: opp.pos.y + 1.1 };
      this.ctx.particles.burst(tip.x, tip.y, 0.3, { count: last ? 26 : 14, color: r === 'gold' ? '#ffd23f' : '#ffffff', speed: 0.12, gravity: 0.002, life: 12 });
      this.ctx.rings.spawn(tip.x, tip.y, '#ffffff', { grow: 0.18, life: 10, flat: false });
      this.ctx.shake(last ? 0.3 : 0.15);
      this.ctx.sfx.whip?.();
      if (r === 'gold') this.ctx.sfx.block?.();
    }
    if (this.kneeling && opp.poseOverride?.anim === 'kneel') opp.vel.x = 0;
    this.simulate(t, l);
    if (t >= WH.end) {
      if (this.kneeling && opp.poseOverride?.anim === 'kneel') opp.poseOverride = null;
      this.kneeling = false;
      o.poseOverride = null; o.endSpecial(); this.finish();
    }
  }
  // the rope (only looks; nothing in the fight depends on it)
  simulate(t, l) {
    const d = this.dir, opp = this.opp, H = this.hand, P = this.pts, n = P.length;
    const target = new THREE.Vector3(opp.pos.x - d * 0.15, opp.pos.y + 1.1, 0.12);
    const back = new THREE.Vector3(H.x - d * 1.6, H.y + 1.6, -0.2);
    for (let s = 0; s < 2; s++) {
      for (let i = 1; i < n; i++) {
        const pt = P[i], v = pt.p.clone().sub(pt.q).multiplyScalar(0.96);
        pt.q.copy(pt.p);
        pt.p.add(v).add(new THREE.Vector3(0, -0.0035, 0));
        const f = i / (n - 1);
        if (l >= 0 && l <= 1) pt.p.lerp(back, 0.05 * f * f); // the wind-up: thrown back over his head
        else if (l > 1 && l < 1.35) { // the snap: the whip unrolls along the line to them, the tip last
          const along = H.clone().lerp(target, f);
          pt.p.lerp(along, Math.min(1, 0.22 * Math.pow(f, 1.6) * (1 + (l - 1) * 6)));
        }
        if (pt.p.y < 0.03) { pt.p.y = 0.03; pt.q.x = pt.p.x - (pt.p.x - pt.q.x) * 0.6; } // floor friction
      }
      P[0].p.copy(H); P[0].q.copy(H);
      for (let k = 0; k < 10; k++) for (let i = 1; i < n; i++) { // keep every link its length
        const a = P[i - 1].p, b = P[i].p, dd = b.clone().sub(a), len = dd.length() || 1e-6, diff = (len - this.seg) / len;
        if (i === 1) b.addScaledVector(dd, -diff);
        else { a.addScaledVector(dd, diff * 0.5); b.addScaledVector(dd, -diff * 0.5); }
      }
    }
  }
  render() {
    const o = this.owner, d = this.dir;
    const hb = o.body?.auto?.bones?.rHand;
    const hand = hb ? hb.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(o.pos.x + d * 0.3, o.pos.y + 1.4, 0.1);
    this.hand.copy(hand);
    this.handle.position.copy(hand);
    const pts = this.pts.map((x) => x.p.clone());
    pts[0].copy(hand);
    this.handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[1].clone().sub(pts[0]).normalize());
    this.cord.geometry.dispose();
    // tapering from the handle to a thin tip
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 60, 0.026, 6, false);
    const pos = g.attributes.position, c = new THREE.Vector3();
    for (let i = 0; i <= 60; i++) {
      const center = curve.getPointAt(i / 60, c), k = 1 - 0.75 * (i / 60);
      for (let j = 0; j <= 6; j++) {
        const idx = i * 7 + j;
        pos.setXYZ(idx, center.x + (pos.getX(idx) - center.x) * k, center.y + (pos.getY(idx) - center.y) * k, center.z + (pos.getZ(idx) - center.z) * k);
      }
    }
    this.cord.geometry = g;
  }
}

// ── Shirley: night ───────────────────────────────────────────────────────────
// The map turns to night and she disappears for 7 s (fighter.night; main.js dims the arena and
// hides her): their punches and kicks all miss her.
class Night extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    o.night = m.nightFrames;
    if (this.opp.gold > 0) this.opp.goldEndsNight = true; // Ori already gold: her night ends with his gold
    ctx.flash(o.index, 'NIGHT FALLS', 'SHE DISAPPEARS');
    ctx.particles.burst(o.pos.x, o.pos.y + 1.1, 0.4, { count: 50, color: '#1c2550', speed: 0.12, gravity: -0.001, life: 34 });
    ctx.particles.burst(o.pos.x, o.pos.y + 1.1, 0.4, { count: 24, color: '#cfd8ff', speed: 0.09, gravity: -0.001, life: 26 });
    ctx.sfx.teleport?.();
  }
  tick() { if (++this.t > 4) this.finish(); }
  render() {}
}

// ── Roni: dog tag nunchucks ─────────────────────────────────────────────────
// Her military dog tags on their ball chain, swung like nunchucks. Close on her as she whirls them
// round her hand, then she rushes in and lays into them with a crazy 7-hit combo (they're held in
// place): every hit is one big swing, over the top or up from below, that lands somewhere else on
// the body, the tags whirling round between hits and leaving a bright trail; the last hit launches
// them.
// (between the 3rd and 4th hits and before the last, she catches them under her arm like Bruce Lee)
const NC = { rush: 34, hits: [52, 62, 72, 92, 102, 112, 134], poses: ['nunHigh', 'nunSide', 'nunLow', 'nunSpin', 'nunSide', 'nunHigh', 'nunLow'],
  over: [1, 1, -1, 1, -1, 1, -1], // swung in over the top (1) or up from below (-1)
  at: [0.78, 0.5, 0.88, 0.6, 0.38, 0.7, 0.55], catches: [[78, 86], [118, 128]], end: 156 };
class Nunchaku extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const opp = this.opp;
    this.dir = sign(opp.pos.x - o.pos.x || o.facing);
    this.from = o.pos.x;
    this.to = opp.pos.x - this.dir * 0.95;
    this.lockX = opp.pos.x;
    this.oppH = 2.25 * (opp.def.heightCm || 175) / 175;
    this.hits = 0;
    const steel = new THREE.MeshStandardMaterial({ color: '#e3e8ee', roughness: 0.3, metalness: 0.4, emissive: '#4a5058' });
    this.steel = steel;
    // a pair of tags (they come in twos) at the swinging end, one held in her hand
    const plate = () => new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.23, 0.016), steel);
    this.tagA = new THREE.Group(); this.tagA.add(plate());
    this.tagB = new THREE.Group(); const p1 = plate(), p2 = plate(); p2.position.set(0.035, -0.03, -0.02); p2.rotation.z = 0.25; this.tagB.add(p1, p2);
    this.chain = new THREE.Mesh(new THREE.BufferGeometry(), steel);
    this.chain.frustumCulled = false;
    // the bright trail the swinging tags leave behind
    this.trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.trail = new THREE.Mesh(new THREE.BufferGeometry(), this.trailMat); this.trail.frustumCulled = false;
    this.group.add(this.tagA, this.tagB, this.chain, this.trail);
    ctx.flash(o.index, 'DOG TAGS', 'NUNCHUCKS');
    o.poseOverride = { anim: 'idle', phase: 'active', pt: 0 };
  }
  cleanup() { this.steel.dispose(); this.trailMat.dispose(); this.chain.geometry.dispose(); this.trail.geometry.dispose(); this.owner.poseOverride = null; this.ctx.camera?.(null); }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp;
    if (o.state !== 'attack' || o.move?.id !== 'special') { this.finish(); return; }
    o.facing = this.dir; o.vel.x = 0;
    if (t === 8 || t === 20) this.ctx.sfx.whoosh?.();
    if (t > NC.rush && t <= NC.rush + 10) { const k = (t - NC.rush) / 10; o.pos.x = this.from + (this.to - this.from) * k; o.poseOverride = { anim: 'dash', phase: 'active', pt: 0.5 }; } // the rush
    if (this.hits < NC.hits.length && opp.alive && opp.state !== 'ko') { opp.pos.x = this.lockX; opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2; }
    const i = NC.hits.findIndex((h, k) => t >= h - 6 && t < (NC.hits[k + 1] ?? h + 18) - 6);
    if (i >= 0) { const h = NC.hits[i]; o.poseOverride = { anim: NC.poses[i], phase: t < h ? 'startup' : 'active', pt: t < h ? (t - h + 6) / 6 : Math.min(1, (t - h) / (NC.poses[i] === 'nunSpin' ? 8 : 5)) }; }
    if (this.catching(t) > 0) o.poseOverride = { anim: 'nunCatch', phase: 'active', pt: 0 };
    if (NC.catches.some(([a]) => t === a + 2)) this.ctx.sfx.block?.(); // the click of the catch
    if (NC.hits.includes(t) && opp.alive) {
      const last = ++this.hits === NC.hits.length;
      const r = strike(o, this.move, last ? { damage: this.move.damage / NC.hits.length, knockdown: true, launch: 0.2, push: 0.12 }
        : { damage: this.move.damage / NC.hits.length, hitstun: 24, push: 0 }, o.pos.x);
      this.ctx.particles.burst(opp.pos.x - this.dir * 0.2, opp.pos.y + this.oppH * NC.at[this.hits - 1], 0.35, { count: last ? 30 : 14, color: r === 'gold' ? '#ffd23f' : '#e8edf5', speed: 0.12, gravity: 0.004, life: 14 });
      this.ctx.shake(last ? 0.4 : 0.14);
      this.ctx.sfx.hit?.(last);
    }
    if (t >= NC.end) { o.poseOverride = null; o.endSpecial(); this.finish(); }
  }
  // 0…1: the tags caught under her arm
  catching(t) {
    for (const [a, b] of NC.catches) if (t >= a && t < b) return Math.min(1, (t - a) / 3, (b - t) / 3);
    return 0;
  }
  // where the swinging end is: an angle round her hand in the plane she faces along (0 = straight
  // at them, +π/2 = straight up), on a chain `R` long
  angleAt(t, hand) {
    if (t < NC.hits[0] - 7) return t * 0.32; // whirling round beside her
    const opp = this.opp, d = this.dir;
    const aim = (k) => Math.atan2(opp.pos.y + this.oppH * NC.at[k] - hand.y, Math.max(0.05, (opp.pos.x - d * 0.2 - hand.x) * d));
    // each hit: a big swing in from behind (over the top, or up from below, by turns) to the target
    const k = NC.hits.findIndex((h) => t < h + 1);
    if (k < 0) { const a = aim(NC.hits.length - 1); return a - 0.6 * Math.min(1, (t - NC.hits.at(-1)) / 8); } // the follow-through
    const h = NC.hits[k], a = aim(k), s = a + 2.7 * NC.over[k];
    if (t >= h - 7) { const q = (t - h + 7) / 7; return s + (a - s) * q * q; } // the swing, speeding up into the hit
    // between hits: from the last target, whirl once round to the start of the next swing
    const p = NC.hits[k - 1], ap = aim(k - 1), q = (t - p) / (h - 7 - p);
    const delta = s - ap + (s >= ap ? 2 * Math.PI : -2 * Math.PI); // one full extra turn on the way
    return ap + delta * ease(Math.min(1, q));
  }
  render() {
    const o = this.owner, t = this.t, d = this.dir, opp = this.opp;
    const hb = o.body?.auto?.bones?.lHand;
    const hand = hb ? hb.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(o.pos.x + d * 0.3, o.pos.y + 1.2, 0.1);
    this.tagA.position.copy(hand);
    // chain length: reaching just into them on a hit
    const reach = Math.min(0.85, Math.max(0.5, Math.abs(opp.pos.x - d * 0.12 - hand.x)));
    const R = t < NC.hits[0] - 7 ? 0.6 : reach;
    const th = this.angleAt(t, hand);
    const b = new THREE.Vector3(hand.x + Math.cos(th) * R * d, hand.y + Math.sin(th) * R, hand.z + 0.18 + Math.sin(th * 0.5) * 0.08);
    // caught: tucked under her right arm
    const ck = this.catching(t), arm = o.body?.auto?.bones?.rSh;
    if (ck > 0 && arm) b.lerp(arm.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.22, 0.12)), ck);
    this.tagB.position.copy(b);
    this.tagA.rotation.set(0, 0, th * 0.3);
    this.tagB.rotation.set(0.3, 0, th + Math.PI / 2); // hanging along the chain
    const mid = hand.clone().lerp(b, 0.5);
    this.chain.geometry.dispose();
    this.chain.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hand, mid, b]), 10, 0.016, 5, false);
    // the trail: the arc the tags swept through over the last few frames, fading out behind them
    const tagAt = (u) => { const a = this.angleAt(u, hand); return new THREE.Vector3(hand.x + Math.cos(a) * R * d, hand.y + Math.sin(a) * R, hand.z + 0.18 + Math.sin(a * 0.5) * 0.08); };
    const n = 20, span = 3.2;
    this.trail.geometry.dispose();
    const g = new THREE.BufferGeometry();
    if (t > 2 && t < NC.end - 8) {
      const P = []; for (let i = 0; i < n; i++) P.push(tagAt(t - span + (span * i) / (n - 1)));
      const pos = [], col = [], idx = [];
      for (let i = 0; i < n; i++) {
        const p = P[i], q = P[Math.min(n - 1, i + 1)], r = P[Math.max(0, i - 1)];
        const tx = q.x - r.x, ty = q.y - r.y, l = Math.hypot(tx, ty) || 1, f = i / (n - 1), w = 0.09 * f;
        pos.push(p.x - (ty / l) * w, p.y + (tx / l) * w, p.z, p.x + (ty / l) * w, p.y - (tx / l) * w, p.z);
        const c = f * f * 0.7;
        col.push(c * 0.7, c * 0.85, c, c * 0.7, c * 0.85, c);
        if (i < n - 1) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
    }
    this.trail.geometry = g;
    // the camera: close on her whirling them, then on the two of them through the combo
    if (t < NC.rush) this.ctx.camera?.({ x: o.pos.x + d * 0.35, y: o.pos.y + 1.35, half: 0.95, halfH: 0.6, near: 1.2, tilt: 0.02, cut: t === 1 });
    else if (t < NC.end - 14) this.ctx.camera?.({ x: (o.pos.x + opp.pos.x) / 2, y: 1.3, half: t >= NC.hits.at(-1) - 6 ? 1.25 : 1.55, halfH: 0.95, near: 1.6, tilt: 0.03 });
    else if (!this.camDone) { this.camDone = true; this.ctx.camera?.(null); }
  }
}

// ── Talel: the mirror ────────────────────────────────────────────────────────
// Close-up on Talel's face, turned 45° to the camera, a small mirror right in front of it with his
// reflection in it (painted flat onto the glass like a real reflection). The camera moves in until
// only the glass fills the screen, and there his reflection slowly turns into a terrorist (his second
// model); out of sight, Talel becomes him too. The camera slowly pulls back to show him beside the
// mirror, he pulls a knife and stabs the glass, which shatters, then dashes in and stabs them six
// times, each somewhere else (chest, leg, neck, belly, shoulder, a last lunge to the chest; they stay
// standing right where they are), each from a new camera angle. Then he's Talel again.
const MR = { look: 50, fill: 122, swap: 124, fade: 132, hold: 172, wide: 236, knife: 241, mstab: 267, rush: 311, stabs: [333, 353, 373, 393, 413, 441], back: 485, end: 497 };
// each stab: the pose, where on the body it goes in (fraction of their height) and the camera angle
const STAB = [
  { anim: 'knifeJab', at: 0.6, cam: { dx: 0.1, half: 1.15, tilt: 0.02 } },
  { anim: 'knifeLow', at: 0.3, cam: { dx: 0.35, half: 1.0, tilt: -0.08, dy: 0.3 } },
  { anim: 'knifeHigh', at: 0.8, cam: { dx: -0.2, half: 0.95, tilt: 0.12 } },
  { anim: 'knifeRise', at: 0.47, cam: { dx: 0.3, half: 1.0, tilt: -0.03 } },
  { anim: 'knifeChop', at: 0.7, cam: { dx: -0.15, half: 0.9, tilt: 0.12 } },
  { anim: 'knifeThrust', at: 0.58, cam: { dx: 0.0, half: 1.35, tilt: 0.03 } },
];
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
};
class Mirror extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const opp = this.opp;
    this.dir = sign(opp.pos.x - o.pos.x || o.facing);
    this.lockX = opp.pos.x;
    this.hits = 0;
    const h = (o.def.heightCm || 175) / 175;
    this.headY = 1.62 * h;
    this.oppH = 2.25 * (opp.def.heightCm || 175) / 175;
    // the reflected head is the same size as his own (both measured from the neck to the top)
    const L = o.rig?.auto?.landmarks, AL = o.altRig?.auto?.landmarks;
    this.headSize = L ? L.H - L.neckY : 0.48;
    // the mirror: a dark-wood frame floating right by his face, turned halfway to us. It's built
    // once the reflected head has loaded, to fit snugly around it.
    const m2 = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.55, transparent: true });
    const backing = new THREE.MeshBasicMaterial({ color: '#1b2027', transparent: true });
    this.wood = wood; this.backing = backing;
    this.glassMat = new THREE.MeshBasicMaterial({ color: '#9fb0bf', side: THREE.DoubleSide, transparent: true });
    this.glassMat2 = new THREE.MeshBasicMaterial({ color: '#9fb0bf', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }); // the terrorist, fading in over it
    this.mats = [wood, backing, this.glassMat, this.glassMat2];
    this.shards = [];
    this.mirror = m2;
    // the reflection itself: the terrorist's head, the same size as Talel's, looking back toward him,
    // rendered once into a flat picture with the grey-blue of the glass behind it
    // Two of them: his own face first (it IS a mirror), then, while the camera is on the glass,
    // it fades into the terrorist's. Both the size of his real head.
    const clone = (model, LL) => ctx.headClone?.({ ...o.def, model }, this.headSize + 0.035 * (LL?.H ?? 2.25), LL ? LL.neckY / LL.H - 0.035 : 0.77);
    const own = clone(o.def.model, L), other = clone(o.def.specialModel, AL);
    const measure = (head) => { // the head as it will be seen (only the vertices its triangles use)
      head.rotation.y = -this.dir * 0.5; // looking out of the glass at him
      head.updateMatrixWorld(true);
      const box = new THREE.Box3(), v = new THREE.Vector3();
      head.traverse((x) => {
        if (!x.isMesh) return;
        const pos = x.geometry.attributes.position, idx = x.geometry.index?.array;
        const n = idx ? idx.length : pos.count;
        for (let i = 0; i < n; i++) box.expandByPoint(v.fromBufferAttribute(pos, idx ? idx[i] : i).applyMatrix4(x.matrixWorld));
      });
      return box;
    };
    const built = own && other && Promise.all([own, other]).then(([h1, h2]) => {
      if (this.dead) return;
      if (!h1 || !h2 || !ctx.snapshot) { this.buildGlass(0.6, 0.72); return; }
      const b1 = measure(h1), b2 = measure(h2), size = b2.getSize(new THREE.Vector3());
      // the glass: the face fills it, just the edges of the hair and ears go past the frame
      const W = size.x * 0.86, H = size.y * 0.9;
      this.buildGlass(W, H);
      const bgTex = canvasTex(64, 128, (g, w, hh) => {
        const gr = g.createLinearGradient(0, 0, w * 0.6, hh);
        gr.addColorStop(0, '#b9c7d3'); gr.addColorStop(0.55, '#8394a5'); gr.addColorStop(1, '#5d6c7c');
        g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      });
      const bgMat = new THREE.MeshBasicMaterial({ map: bgTex }), bgGeo = new THREE.PlaneGeometry(W, H);
      const shoot = (head, box) => {
        const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
        c.y -= sz.y * 0.04; c.x -= this.dir * sz.x * 0.03; // a touch toward the face
        const pic = new THREE.Group();
        const bg = new THREE.Mesh(bgGeo, bgMat); bg.position.z = -2; pic.add(bg);
        head.position.set(-c.x, -c.y, 0); pic.add(head);
        const rt = ctx.snapshot(pic, W, H, 1024);
        head.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); x.material.dispose(); } });
        return rt;
      };
      this.rtOwn = shoot(h1, b1); this.rt = shoot(h2, b2);
      bgTex.dispose(); bgGeo.dispose(); bgMat.dispose();
      this.glassMat.map = this.rtOwn.texture; this.glassMat.color.set('#e4ebf1'); this.glassMat.needsUpdate = true;
      this.glassMat2.map = this.rt.texture; this.glassMat2.color.set('#e4ebf1'); this.glassMat2.needsUpdate = true;
    }).catch(() => { if (!this.dead && !this.W) this.buildGlass(0.6, 0.72); });
    if (!built) this.buildGlass(0.6, 0.72);
    // in front of his face (placed on his head in render), turned so it faces him and, halfway, us
    m2.position.set(o.pos.x + this.dir * 0.66, this.headY + 0.25, 0.1);
    m2.rotation.y = -this.dir * Math.PI / 4;
    m2.scale.setScalar(0.01);
    this.mirror = m2;
    this.group.add(m2);
    // the knife
    const steel = new THREE.MeshStandardMaterial({ color: '#e6ecf2', roughness: 0.25, metalness: 0.35, emissive: '#5a6068' }); // bright: there's nothing for real chrome to reflect
    const grip = new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.6 });
    this.mats.push(steel, grip);
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.008), steel); blade.position.y = 0.18; this.knife.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), steel); tip.position.y = 0.345; tip.scale.z = 0.25; this.knife.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), grip); guard.position.y = 0.055; this.knife.add(guard);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.11, 8), grip); this.knife.add(handle);
    this.knife.scale.setScalar(1.6); // the fighters are big-headed toys about 2.2 m tall
    this.knife.visible = false;
    this.group.add(this.knife);
    o.poseOverride = { anim: 'idle', phase: 'active', pt: 0 };
  }
  // the frame, the dark backing, and the glass: one flat picture (the reflection), already cut into
  // jagged triangles that hold together until the knife goes in
  buildGlass(W, H) {
    const m2 = this.mirror, wood = this.wood, backing = this.backing;
    this.W = W; this.H = H;
    this.fillHalf = W * 0.75; // the zoom that shows the reflected face and nothing of Talel
    for (const [w, hh, x, y] of [[W + 0.08, 0.06, 0, H / 2 + 0.03], [W + 0.08, 0.06, 0, -H / 2 - 0.03], [0.06, H + 0.12, W / 2 + 0.03, 0], [0.06, H + 0.12, -W / 2 - 0.03, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.06), wood); b.position.set(x, y, 0); m2.add(b);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), backing); back.position.z = -0.025; m2.add(back);
    const nx = 4, ny = 5, P = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const inner = i > 0 && i < nx && j > 0 && j < ny;
      P.push([-W / 2 + (W * i) / nx + (inner ? (Math.random() - 0.5) * (W / nx) * 0.7 : 0), -H / 2 + (H * j) / ny + (inner ? (Math.random() - 0.5) * (H / ny) * 0.7 : 0)]);
    }
    this.impact = [0, -0.04];
    const tri = (a, b, c) => {
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap((p) => [p[0] - cx, p[1] - cy, 0]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([a, b, c].flatMap((p) => [(p[0] + W / 2) / W, (p[1] + H / 2) / H]), 2));
      const mesh = new THREE.Mesh(g, this.glassMat); mesh.position.set(cx, cy, 0.006); m2.add(mesh);
      const over = new THREE.Mesh(g, this.glassMat2); over.position.z = 0.001; mesh.add(over);
      const rx = cx - this.impact[0], ry = cy - this.impact[1], rl = Math.hypot(rx, ry) || 1;
      const edge = [a, b, c].every((p) => Math.abs(p[0]) > W / 2 - 0.01 || Math.abs(p[1]) > H / 2 - 0.01) || (Math.abs(cx) > W * 0.36 && Math.abs(cy) > H * 0.36);
      const sp = 0.006 + Math.random() * 0.012;
      this.shards.push({ mesh, cx, cy, stays: edge && Math.random() < 0.6, vx: (rx / rl) * sp, vy: (ry / rl) * sp + 0.004, vz: 0.003 + Math.random() * 0.009,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), spin: 0.08 + Math.random() * 0.2 });
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = P[j * (nx + 1) + i], b = P[j * (nx + 1) + i + 1], c = P[(j + 1) * (nx + 1) + i + 1], d = P[(j + 1) * (nx + 1) + i];
      if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
    }
    // a soft sheen across the glass (it's a mirror, not a window)
    this.sheenTex = canvasTex(128, 128, (g, w, hh) => {
      const gr = g.createLinearGradient(0, 0, w, hh);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.32, 'rgba(255,255,255,0)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.47, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    });
    const sheenMat = new THREE.MeshBasicMaterial({ map: this.sheenTex, transparent: true, opacity: 0.35, depthWrite: false });
    this.mats.push(sheenMat);
    this.sheen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), sheenMat); this.sheen.position.z = 0.012; m2.add(this.sheen);
  }
  cleanup() {
    for (const m of this.mats) m.dispose();
    for (const s of this.shards) s.mesh.geometry.dispose();
    this.sheenTex?.dispose(); this.rt?.dispose(); this.rtOwn?.dispose();
    const o = this.owner; o.altForm = false; o.poseOverride = null; this.ctx.camera?.(null);
  }
  // a strike pose: wind up for 10 frames before `h`, hit at `h`, hold it
  strikePose(anim, t, h) { this.owner.poseOverride = { anim, phase: t < h ? 'startup' : 'active', pt: t < h ? (t - h + 10) / 10 : Math.min(1, (t - h) / 8) }; }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp, d = this.dir;
    if (o.state !== 'attack' || o.move?.id !== 'special') { this.finish(); return; }
    o.vel.x = 0; o.facing = d;
    if (opp.alive && opp.state !== 'ko') { opp.pos.x = this.lockX; opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2; }
    if (t === MR.swap) { o.altForm = true; this.ctx.sfx.thud?.(); } // only the glass is on screen: nobody sees him change
    if (t === MR.hold + 20) this.ctx.flash(o.index, 'THE OTHER TALEL', '');
    if (t >= MR.knife && t < MR.mstab - 10) o.poseOverride = { anim: 'taunt', phase: 'active', pt: Math.min(1, (t - MR.knife) / 10) }; // pulling the knife
    if (t === MR.knife) this.ctx.sfx.whoosh?.();
    // the knife into the glass
    if (t >= MR.mstab - 10 && t < MR.mstab + 16) this.strikePose('knifeJab', t, MR.mstab);
    if (t === MR.mstab) {
      this.ctx.sfx.glass?.();
      this.ctx.shake(0.25);
      const [ix, iy] = this.impact ?? [0, 0], p = this.mirror.localToWorld(new THREE.Vector3(ix, iy, 0.02));
      this.ctx.particles.burst(p.x, p.y, p.z, { count: 34, color: '#e8f4ff', speed: 0.09, gravity: 0.006, life: 26 });
    }
    if (t === MR.mstab + 16) o.poseOverride = { anim: 'idle', phase: 'active', pt: 0 };
    if (t >= MR.rush && t < MR.stabs[0] - 10) { // the dash in
      if (t === MR.rush) { this.from = o.pos.x; this.ctx.sfx.whoosh?.(); }
      const k = (t - MR.rush + 1) / (MR.stabs[0] - 10 - MR.rush), to = this.lockX - d * 0.9;
      o.pos.x = this.from + (to - this.from) * k * k;
      o.poseOverride = { anim: 'dash', phase: 'active', pt: 0.5 };
    }
    // stab after stab, each somewhere else
    const si = MR.stabs.findIndex((h, i) => t >= h - 10 && (i === MR.stabs.length - 1 ? t < h + 24 : t < MR.stabs[i + 1] - 10));
    if (si >= 0) this.strikePose(STAB[si].anim, t, MR.stabs[si]);
    if (MR.stabs.includes(t) && opp.alive) {
      const last = ++this.hits === MR.stabs.length, s = STAB[this.hits - 1];
      // no knockdown, even on the last one: they stay right where they are, stunned (like Snir's bones)
      const r = strike(o, this.move, { damage: this.move.damage / MR.stabs.length, hitstun: last ? MR.end - MR.stabs.at(-1) + 6 : 26, push: 0, noLimit: true }, o.pos.x);
      opp.vel.x = 0;
      this.ctx.particles.burst(opp.pos.x - d * 0.15, opp.pos.y + this.oppH * s.at, 0.35, { count: last ? 30 : 14, color: r === 'gold' ? '#ffd23f' : '#c41d2a', speed: 0.11, gravity: 0.008, life: 18 });
      this.ctx.shake(last ? 0.45 : 0.2);
      this.ctx.sfx.hit?.(last);
      if (last) this.ctx.whiteFlash?.(120);
    }
    if (t === MR.stabs.at(-1) + 24) o.poseOverride = { anim: 'idle', phase: 'active', pt: 0 };
    if (t === MR.back) { // himself again
      o.altForm = false;
      this.ctx.particles.burst(o.pos.x, o.pos.y + 1.1, 0.3, { count: 40, color: '#9aa0a8', speed: 0.1, gravity: -0.001, life: 26 });
    }
    if (t >= MR.end) { o.poseOverride = null; o.endSpecial(); this.finish(); }
  }
  render() {
    const o = this.owner, t = this.t, d = this.dir, opp = this.opp, cam = (s) => this.ctx.camera?.(s);
    // (he already stands at 45° to the camera, his face toward the mirror: the fighter's normal 3/4 view)
    const head = o.body?.auto?.bones?.head?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3(o.pos.x, this.headY, 0);
    head.y += this.headSize * 0.27; // the head bone sits at the jaw: the middle of his face is higher
    if (t < MR.swap) this.mirror.position.set(head.x + d * 0.66, head.y, 0.1);
    this.mirror.scale.setScalar(Math.max(0.01, Math.min(1, t / 10)));
    // the shatter: shards fly out from where the knife went in, tumble and land on the ground
    const tau = t - MR.mstab;
    if (this.sheen) this.sheen.visible = tau < 0;
    const floorY = -this.mirror.position.y + 0.015, g = 0.0011;
    for (const s of this.shards) {
      if (tau <= 0 || s.stays) { s.mesh.position.set(s.cx, s.cy, 0.006); s.mesh.rotation.set(0, 0, 0); continue; }
      // when it reaches the floor: cy + vy·τ − g·τ²/2 = floorY
      const land = (s.vy + Math.sqrt(s.vy * s.vy + 2 * g * (s.cy - floorY))) / g, k = Math.min(tau, land);
      s.mesh.position.set(s.cx + s.vx * k, Math.max(floorY, s.cy + s.vy * k - 0.5 * g * k * k), 0.006 + s.vz * k);
      s.mesh.quaternion.setFromAxisAngle(s.axis, s.spin * k);
    }
    // the broken frame and the shards fade away while he dashes in
    const fade = 1 - Math.max(0, Math.min(1, (t - MR.rush + 6) / 24));
    this.wood.opacity = this.backing.opacity = fade;
    this.glassMat.opacity = tau > 0 ? Math.min(fade, 1 - Math.max(0, (tau - 70) / 30)) : 1;
    // his own face in the glass fades into the terrorist's while that's all we see
    const into = ease(Math.max(0, Math.min(1, (t - MR.fade) / (MR.hold - 8 - MR.fade))));
    this.glassMat2.opacity = this.glassMat.opacity * into;
    this.mirror.visible = fade > 0.01 || tau < 0;
    // the camera
    const glass = this.mirror.position.clone(), F = this.fillHalf ?? 0.25;
    const both = head.clone().lerp(glass, 0.5);
    if (t < MR.look) cam({ x: both.x, y: both.y, half: 0.8, halfH: 0.45, near: 0.5, tilt: 0, cut: t === 1 });
    else if (t < MR.fill) { // slowly in until only the glass, no Talel
      const k = ease((t - MR.look) / (MR.fill - MR.look));
      cam({ x: both.x + (glass.x - both.x) * k, y: both.y + (glass.y - both.y) * k, half: 0.8 + (F - 0.8) * k, halfH: 0.45 + (F * 0.57 - 0.45) * k, near: 0.3, tilt: 0 });
    } else if (t < MR.hold) cam({ x: glass.x, y: glass.y, half: F, halfH: F * 0.57, near: 0.3, tilt: 0 });
    else if (t < MR.rush) { // slowly back out: the terrorist beside the mirror
      const k = ease(Math.min(1, (t - MR.hold) / (MR.wide - MR.hold)));
      const to = new THREE.Vector3((o.pos.x + glass.x) / 2, head.y - 0.3, 0);
      cam({ x: glass.x + (to.x - glass.x) * k, y: glass.y + (to.y - glass.y) * k, half: F + (1.25 - F) * k, halfH: F * 0.57 + (0.72 - F * 0.57) * k, near: 0.3 + 1.2 * k, tilt: 0 });
    } else if (t < MR.stabs[0] - 10) cam({ x: o.pos.x + d * 0.6, y: 1.2, half: 1.6, halfH: 0.95, near: 1.5, tilt: 0.02 });
    else if (t < MR.stabs.at(-1) + 34) { // a new angle for every stab, on the spot it goes in
      let i = MR.stabs.findIndex((h, j) => j === MR.stabs.length - 1 || t < MR.stabs[j + 1] - 10);
      const s = STAB[i].cam, h = MR.stabs[i];
      const k = Math.min(1, (t - h + 10) / 14);
      cam({ x: (o.pos.x + opp.pos.x) / 2 + d * s.dx, y: opp.pos.y + this.oppH * STAB[i].at + (s.dy ?? 0) * 0.5, half: s.half * (1.12 - 0.12 * k), halfH: s.half * 0.6 * (1.12 - 0.12 * k), near: 1.3, tilt: s.tilt, cut: t === h - 10 });
      this.camDone = false;
    } else if (!this.camDone) { this.camDone = true; cam(null); }
    // the knife in his hand from when he pulls it until he's himself again
    // (the stab poses thrust the left arm, so the knife is in his left hand)
    const hb = o.body?.auto?.bones?.lHand, el = o.body?.auto?.bones?.lEl;
    this.knife.visible = t >= MR.knife + 6 && t < MR.back && !!hb;
    if (this.knife.visible) {
      const hp = hb.getWorldPosition(new THREE.Vector3()), ep = el.getWorldPosition(new THREE.Vector3());
      this.knife.position.copy(hp);
      this.knife.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hp.clone().sub(ep).normalize());
    }
  }
}

const TYPES = { night: Night, nunchaku: Nunchaku, mirror: Mirror, whip: Whip, skadoosh: Skadoosh, computer: Computer, france: France, satellite: Satellite, darkness: Darkness, smoke: Smoke, shatter: Shatter, foot: Foot, flagpole: FlagPole, cage: Cage, guitar: Guitar, gold: Gold, cough: Cough, tiger: Tiger, quake: Quake };
// more kinds of effect from elsewhere (custom.js: the player-made specials)
export function registerEffect(name, C) { TYPES[name] = C; }
export function createEffect(owner, move, ctx) {
  const C = TYPES[move.effect];
  return C ? new C(owner, move, ctx) : null;
}
