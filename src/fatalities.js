// Fighters' own fatalities (instead of the standard grab and shatter). Each is a little scene the
// match runs after FINISH HIM: step(u) every game tick (u = ticks since it started) returns
// 'fatality' on the frame the FATALITY call should come, and 'done' when it's over; render(dt, time)
// every drawn frame; dispose() at the end.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadAnimated } from './rig.js';
import { Lasso } from './lasso.js';
import { Foot, Shatter, SN, skeletonParts, Darkness, Quake, Computer, ResetIcon, Smoke, Satellite } from './effects.js';
import { Explosion } from './explosion.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const sign = (v) => (v < 0 ? -1 : 1);
// the joints a limb hangs from: the auto-rig's bones on a model, the pivot groups on a
// code-built figure (the practice dummy)
function joints(f) {
  const body = f.body;
  if (body?.auto?.bones) return body.auto.bones;
  if (body?.lArm) return { lSh: body.lArm.sh, rSh: body.rArm.sh, lHip: body.lLeg.hip, rHip: body.rLeg.hip, lEl: body.lArm.el, rEl: body.rArm.el, lKnee: body.lLeg.knee, rKnee: body.rLeg.knee };
  return null;
}

// ── Guy Cohen: electrocuted and vaporised ──────────────────────────────────────
// He throws his cables as in his special; they wrap the opponent, and then lightning pours
// down them: thick forked bolts along the cables, arcs crawling over their body, and bolts out of
// the sky striking them. They jolt and shake, lit up
// blue-white, sparks flying, brighter and brighter, until a last huge strike, a flash, and they're
// gone: a burst of ash and smoke rising where they stood.

// a lightning bolt: a jagged path drawn as a flat ribbon facing the camera, a wide blue glow under
// a thin white-hot core
const MAXP = 33;
function jagged(a, b, rough, out = []) {
  out.length = 0;
  out.push(a.clone(), b.clone());
  // midpoint displacement: every pass splits each piece and kicks the middle sideways
  let amp = a.distanceTo(b) * rough;
  while (out.length < MAXP) {
    const next = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const p = out[i - 1], q = out[i];
      const m = p.clone().add(q).multiplyScalar(0.5);
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      const k = (Math.random() - 0.5) * 2 * amp;
      m.x += (-dy / len) * k; m.y += (dx / len) * k; m.z += (Math.random() - 0.5) * amp * 0.3;
      next.push(m, q);
    }
    out.splice(0, out.length, ...next);
    amp *= 0.55;
  }
  return out;
}
class Bolt {
  constructor(scene) {
    this.parts = [['#5fb4ff', 0.5, 1], ['#ffffff', 1, 0.28]].map(([color, opacity, w]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXP * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 5;
      scene.add(m);
      return { m, w };
    });
    this.pts = [];
  }
  // a bolt from a to b, `width` wide, tapering to `taper` of that at b
  set(a, b, width, rough = 0.18, taper = 0.4) {
    const pts = jagged(a, b, rough, this.pts);
    for (const { m, w } of this.parts) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < MAXP; i++) {
        const p = pts[i], q = pts[Math.min(MAXP - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
        const hw = width * w * (1 - (1 - taper) * (i / (MAXP - 1))) / 2;
        pos.setXYZ(i * 2, p.x - (dy / len) * hw, p.y + (dx / len) * hw, p.z);
        pos.setXYZ(i * 2 + 1, p.x + (dy / len) * hw, p.y - (dx / len) * hw, p.z);
      }
      pos.needsUpdate = true;
      m.visible = true;
    }
    return pts;
  }
  hide() { for (const { m } of this.parts) m.visible = false; }
  dispose(scene) { for (const { m } of this.parts) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}

const STRIKES = [24, 48, 66, 80]; // bolts from the sky (and the last, biggest one at 90)
const VAPOR = 90;
const THROW = 12; // his throw's wind-up (as the special's), then the cables fly
export class ElectroFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.dir = sign(l.pos.x - w.pos.x);
    this.bolts = Array.from({ length: 20 }, () => new Bolt(ctx.scene));
    this.lx = l.pos.x;
    this.strikeAt = -99;
    this.u = 0;
    this.holdAt = -1; // when the cables caught them (the electrocution's clock starts there)
  }
  // his cables (lasso.js, the special's own), flown by hand here: nothing to dodge, no damage
  cables(u) {
    const { w, l, ctx } = this;
    if (u === THROW) {
      this.lasso = new Lasso(w, { lasso: { speed: 0.34 } }, ctx.scene, w.def.special?.color || '#7fdcff');
      ctx.sfx.whip?.();
    }
    const c = this.lasso;
    if (!c || c.dead) return;
    c.t++;
    const s = c.start(), gap = Math.abs(l.pos.x - s.x);
    if (c.state === 'flying') {
      c.dir = sign(l.pos.x - s.x);
      c.reach = Math.min(c.reach + 0.34, gap);
      const want = l.pos.y + 1.2;
      c.tipY = (c.tipY ?? s.y) + Math.max(-0.34, Math.min(0.34, want - (c.tipY ?? s.y)));
      if (c.reach >= gap - 0.02) { // wrapped
        c.state = 'holding'; c.target = l; c.t = 0;
        this.holdAt = u;
        ctx.sfx.zap?.(); ctx.shake(0.2);
        ctx.particles.burst(l.pos.x, l.pos.y + 1.2, 0.3, { count: 40, color: '#ffffff', speed: 0.15, gravity: 0 });
      }
    } else if (c.state === 'retracting') {
      c.reach -= 0.5;
      if (c.reach <= 0.2) c.dispose();
    }
  }
  step(u) {
    const { w, l } = this;
    this.cables(u);
    // the throw (the special's), then his arm stays out holding the cables
    w.poseOverride = { anim: 'throw', phase: u < THROW ? 'startup' : 'active', pt: u < THROW ? u / THROW : 1 };
    if (this.holdAt < 0) return null;
    return this.shock(u - this.holdAt);
  }
  shock(u) {
    const { l, ctx } = this;
    if (u < VAPOR) l.poseOverride = { anim: u % 6 < 3 ? 'hit' : 'blockHit', phase: 'active', pt: 0 }; // jolting
    if (u > 4 && u < VAPOR && u % 3 === 0) {
      ctx.particles.burst(l.pos.x + (Math.random() - 0.5) * 0.5, l.pos.y + 0.4 + Math.random() * 1.6, 0.3, { count: 5, color: Math.random() < 0.5 ? '#bfe3ff' : '#ffffff', speed: 0.11, gravity: 0.003, life: 12 });
      if (u % 6 === 0) ctx.sfx.zap?.();
    }
    if (u % 12 === 0 && u < VAPOR) ctx.shake(0.12);
    if (STRIKES.includes(u)) { // lightning out of the sky
      this.strikeAt = u;
      ctx.whiteFlash(140);
      ctx.shake(0.3);
      ctx.sfx.zap?.(); ctx.sfx.thud?.();
      ctx.rings.spawn(l.pos.x, 0.05, '#9fd2ff', { grow: 0.15, life: 14 });
      ctx.particles.burst(l.pos.x, l.pos.y + 1.9, 0.3, { count: 24, color: '#e6f4ff', speed: 0.16, gravity: 0.004, life: 16 });
    }
    if (u === VAPOR) { // the last strike: vaporised
      this.strikeAt = u;
      ctx.whiteFlash(500);
      ctx.shake(0.7);
      ctx.sfx.zap?.(); ctx.sfx.thud?.();
      const x = l.pos.x, y = l.pos.y;
      ctx.particles.burst(x, y + 1.1, 0.3, { count: 90, color: '#5a5a60', speed: 0.06, gravity: -0.003, life: 70, spread: 1.4 });
      ctx.particles.burst(x, y + 1.1, 0.3, { count: 60, color: '#2b2b30', speed: 0.05, gravity: -0.002, life: 80, spread: 1.2 });
      ctx.particles.burst(x, y + 1.1, 0.3, { count: 60, color: '#cfe8ff', speed: 0.18, gravity: 0, life: 22 });
      ctx.rings.spawn(x, 0.05, '#9fd2ff', { grow: 0.3, life: 26 });
      l.exploded = true; // gone for good
      // the cables let go of nothing and reel back in
      const c = this.lasso;
      if (c && !c.dead) { c.target = null; c.reach = Math.abs(this.lx - c.start().x); c.tipY = l.pos.y + 1.2; c.state = 'retracting'; }
      return 'fatality';
    }
    if (u > VAPOR && u < 160 && u % 4 === 0) ctx.particles.burst(this.lx + (Math.random() - 0.5) * 0.4, 0.2, 0.2, { count: 2, color: '#4a4a50', speed: 0.02, gravity: -0.002, life: 60 });
    if (u >= 190) return 'done';
    return null;
  }
  render(dt, time) {
    const { l } = this, live = !l.exploded && this.holdAt >= 0, u = this.u - Math.max(0, this.holdAt);
    if (this.lasso && !this.lasso.dead) this.lasso.render();
    if (this.holdAt < 0) return;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const onBody = () => V(l.pos.x + (Math.random() - 0.5) * 0.5, l.pos.y + 0.3 + Math.random() * 1.7, 0.25);
    let n = 0;
    const spare = { set: (a, b) => [a, b], hide() {} };
    const B = () => this.bolts[n++] ?? spare; // (out of bolts: skip it)
    // re-drawn every other frame or so: lightning flickers
    this.frame = ((this.frame ?? 0) + 1) % 2;
    if (this.frame) return;
    const grow = Math.min(1, u / 60); // thicker and wilder as it goes on
    if (live) {
      // down his cables into them, each with a fork or two
      const c = this.lasso, a = c?.start() ?? { x: this.w.pos.x + this.dir * 0.55, y: this.w.pos.y + 1.45 };
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.12) continue;
        const pts = B().set(V(a.x, a.y, 0.2), onBody(), 0.07 + 0.06 * grow, 0.1 + 0.08 * i);
        for (let f = 0; f < 2; f++) {
          const p = pts[Math.min(pts.length - 1, 8 + Math.floor(Math.random() * 18))];
          B().set(p, V(p.x + (Math.random() - 0.3) * this.dir * 0.6, p.y + (Math.random() - 0.5) * 0.8, p.z), 0.04 + 0.02 * grow, 0.3, 0.1);
        }
      }
      // arcs crawling over their body
      for (let k = 0; k < 3 + Math.round(grow * 2); k++) if (Math.random() < 0.8) B().set(onBody(), onBody(), 0.03 + 0.02 * grow, 0.35, 0.3);
    }
    // a bolt out of the sky, for a few frames after a strike
    const since = u - this.strikeAt;
    if (since >= 0 && since < 7) {
      const big = this.strikeAt === VAPOR;
      const top = V(l.pos.x + (Math.random() - 0.5) * 2, 9, -0.5), hit = V(this.lx, live ? l.pos.y + 1.6 : 0.1, 0.25);
      const pts = B().set(top, hit, big ? 0.3 : 0.18, 0.12, 0.7);
      for (let f = 0; f < 3; f++) { const p = pts[Math.min(pts.length - 1, 6 + Math.floor(Math.random() * 20))]; B().set(p, V(p.x + (Math.random() - 0.5) * 1.6, p.y - Math.random() * 1.4, p.z), 0.06, 0.3, 0.1); }
    }
    while (n < this.bolts.length) this.bolts[n++].hide();
    // them: glowing brighter and brighter, shaking
    const mats = l.body?.materials || [];
    const glow = live ? Math.min(1, u / 80) : 0, hot = since >= 0 && since < 4 ? 1.8 : 1;
    for (const m of mats) if (m.emissive) m.emissive.setRGB(0.2 + 0.4 * glow, 0.45 + 0.35 * glow, 1).multiplyScalar(live ? (0.1 + 0.25 * glow) * hot * (Math.random() < 0.25 ? 1.6 : 0.6 + Math.random() * 0.3) : 0);
    if (live && l.body?.object) l.body.object.position.x = l.pos.x + (Math.random() - 0.5) * 0.06;
    void time; void dt;
  }
  setU(u) { this.u = u; }
  dispose() {
    if (this.lasso && !this.lasso.dead) this.lasso.dispose();
    for (const b of this.bolts) b.dispose(this.ctx.scene);
    for (const m of this.l.body?.materials || []) m.emissive?.setScalar(0);
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// ── Linoy: the tiger tears them apart ──────────────────────────────────────────
// A real tiger comes in the way her TIGER special's does (bounding in from just behind her, running
// at them, a pounce in an arc) and brings them down, then mauls them, ripping off an arm, the other
// arm, a leg and the other leg (each flies off in a spray of blood), and roars over what's left.
// Times after the pounce lands. Each limb: its jaws close on the middle of it (elbow, knee) and
// it pulls back, harder and harder, dragging the limb out straight toward its mouth and the body
// along the ground with it, for TUG ticks, tugging from side to side; then a last jerk and it
// tears off (the tick in rips), still in its jaws, and it lifts its head and shakes it from side
// to side like a dog with a toy; HOLD ticks later it flings it away.
const TG = { rips: [36, 76, 116, 156], tug: 22, hold: 26, roar: 196, end: 262 };
const LIMBS = ['lSh', 'rSh', 'lHip', 'rHip'];
const BITE = { lSh: 'lEl', rSh: 'rEl', lHip: 'lKnee', rHip: 'rKnee' }; // where its jaws close on each
export class TigerFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.dir = sign(l.pos.x - w.pos.x);
    this.x = w.pos.x - this.dir * 0.6; this.y = 0; this.z = 0.3; // (as the special's tiger)
    this.phase = 'run'; this.downAt = -1;
    this.limbs = [];
    this.ripped = [];
    this.snout = 0.62; // how far its mouth is in front of its middle (measured once it's loaded)
    this.ready = loadAnimated('models/tiger.glb', 1.15, 'Run').then((t) => {
      if (this.dead) return;
      this.t = t;
      t.object.rotation.y = this.dir > 0 ? Math.PI : 0; // (its nose points -x in the file)
      ctx.scene.add(t.object);
      t.object.traverse((o) => { if (/HeadNub/.test(o.name)) this.nub = o; if (/Head_06/.test(o.name)) this.neck = o; if (/Spine2_04/.test(o.name)) this.chest = o; }); // (the tip of its snout; its head: turned on top of the clip. Not the neck bone: its front legs hang from that)
      this.play('Run');
    }).catch(() => { /* no tiger: the fatality still plays (limbs and blood) */ });
  }
  play(name, once = false) {
    const t = this.t;
    if (!t || !t.clips[name] || this.clip === name) return;
    const a = t.mixer.clipAction(t.clips[name]);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once;
    if (this.action) a.crossFadeFrom(this.action, 0.2, false);
    a.play();
    this.action = a; this.clip = name;
  }
  step(u) {
    const { l, ctx } = this, d = this.dir;
    // it lands with its mouth on them
    const tx = l.pos.x - d * this.snout;
    if (this.phase === 'run') {
      this.x += d * 0.21;
      if (Math.abs(tx - this.x) < 1.25) { this.phase = 'pounce'; this.pt = 0; this.fromX = this.x; ctx.sfx.whoosh?.(); }
    } else if (this.phase === 'pounce') {
      // the leap, in an arc (as the special's)
      this.pt++;
      const k = Math.min(1, this.pt / 10);
      this.x = this.fromX + (tx - this.fromX) * k;
      this.y = Math.sin(Math.PI * k) * 0.7;
      if (this.pt === 10) { // brought down
        this.phase = 'maul'; this.downAt = u;
        ctx.shake(0.45); ctx.sfx.thud?.();
        ctx.particles.burst(l.pos.x, 0.3, 0.3, { count: 30, color: '#a88a70', speed: 0.12, gravity: 0.004, spread: 2 });
      }
    } else this.z += (-0.15 - this.z) * 0.15; // (a step back: its head over them, its body behind)
    l.poseOverride = this.downAt >= 0 ? { anim: 'knockdown', phase: 'active', pt: 1 } : { anim: 'hit', phase: 'active', pt: 0 };
    if (this.downAt < 0) return null;
    const v = u - this.downAt;
    if (v === 2) { this.play('Eat'); if (this.action) this.action.time = 1.2; }
    this.v = v;
    const k = TG.rips.indexOf(v);
    if (k >= 0) this.rip(LIMBS[k]);
    // the pull: a growl as it bites down, the strain building
    for (const r of TG.rips) {
      if (v === r - TG.tug) { ctx.sfx.thud?.(); ctx.shake(0.12); }
      if (v > r - TG.tug && v < r && (v - r) % 6 === 0) ctx.shake(0.05 + 0.1 * (1 - (r - v) / TG.tug));
    }
    // the throw: over its shoulder
    for (const L of this.limbs) if (L.held && v >= L.throwAt) {
      L.held = false;
      L.v.set(-d * (0.08 + Math.random() * 0.03), 0.16 + Math.random() * 0.04, 0.02 + Math.random() * 0.03);
      L.spin.set(Math.random() * 0.15, 0, d * (0.22 + Math.random() * 0.12));
      ctx.sfx.whoosh?.();
    }
    if (v === TG.rips.at(-1) + TG.hold + 4) return 'fatality';
    if (v === TG.roar) { this.play('Howl', true); ctx.shake(0.25); }
    if (v >= TG.end) return 'done';
    return null;
  }
  // the camera: once it's on them, in close on the mauling (between its head and their body,
  // a little from the side and above), easing back out a bit for the roar
  cam() {
    if (this.downAt < 0) return null;
    const l = this.l, d = this.dir, mid = (this.x + l.pos.x) / 2 + d * 0.15;
    const out = (this.v ?? 0) >= TG.roar ? 0.8 : 0;
    return { x: mid, y: 0.55 + out * 0.25, side: -d * 0.5, up: 0.75 + out * 0.3, z: 3.1 + out };
  }
  // tear off one limb: the bone shrinks to nothing on the body and a copy flies off, bleeding
  rip(bone) {
    const { l, ctx } = this, b = joints(l)?.[bone];
    this.ripped.push(bone);
    const at = b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(l.pos.x, 0.4, 0.2);
    const c = l.def.colors || {}, arm = bone.endsWith('Sh');
    const H = 2.25 * (l.def.heightCm || 175) / 175;
    const limb = new THREE.Group();
    const real = this.realLimb(bone);
    if (real) { limb.add(real); this.finishLimb(limb, at, []); return; }
    const cloth = new THREE.MeshStandardMaterial({ color: arm ? (c.shirt || '#6b6b3a') : (c.pants || '#3a3a2a'), roughness: 0.8 });
    const end = new THREE.MeshStandardMaterial({ color: arm ? (c.skin || '#d9a98a') : (c.shoes || '#222222'), roughness: 0.6 });
    const gore = new THREE.MeshStandardMaterial({ color: '#7a0a0a', roughness: 0.4 });
    const len = arm ? 0.26 * H : 0.33 * H, r = arm ? 0.055 * H : 0.07 * H;
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), cloth); seg.position.y = -len / 2; limb.add(seg);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), end); tip.position.y = -len - r * 0.6; tip.scale.set(1, 0.8, arm ? 1 : 1.6); limb.add(tip);
    const stump = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), gore); stump.scale.y = 0.5; limb.add(stump);
    this.finishLimb(limb, at, [cloth, end, gore]);
  }
  // the limb itself, cut from their own model: a copy of the body where everything but that limb
  // shrinks to a point (the root bone scaled to nothing, the limb's bone scaled back up)
  realLimb(bone) {
    const auto = this.l.body?.auto;
    if (!auto?.bones?.[bone]) {
      // a code-built figure: a copy of the limb's group, where it is now
      const j = joints(this.l)?.[bone];
      if (!j) return null;
      const copy = j.clone(true);
      j.updateWorldMatrix(true, false);
      const at = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      j.matrixWorld.decompose(at, q, sc);
      copy.position.set(0, 0, 0); copy.quaternion.copy(q); copy.scale.copy(sc);
      return copy;
    }
    const copy = SkeletonUtils.clone(auto.object);
    let root = null, b = null;
    copy.traverse((o) => { if (o.isBone && o.name === 'root') root = o; if (o.isBone && o.name === bone) b = o; });
    if (!root || !b) return null;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    copy.updateMatrixWorld(true);
    // cut it out: only the triangles that move with the limb's bones (no stretched skin to the body)
    const limbBones = new Set(); b.traverse((o) => { if (o.isBone) limbBones.add(o); });
    copy.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones;
      const n = g.attributes.position.count, on = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (limbBones.has(bones[si.getComponent(i, k)])) w += sw.getComponent(i, k);
        on[i] = w > 0.5 ? 1 : 0;
      }
      const src = g.index ? g.index.array : null, count = src ? src.length : n, idx = [];
      for (let t = 0; t < count; t += 3) {
        const a = src ? src[t] : t, c = src ? src[t + 1] : t + 1, d = src ? src[t + 2] : t + 2;
        if (on[a] && on[c] && on[d]) idx.push(a, c, d);
      }
      const cut = new THREE.BufferGeometry();
      for (const [k, v] of Object.entries(g.attributes)) cut.setAttribute(k, v); // (shared with the body: only the triangles are its own)
      cut.setIndex(idx);
      o.geometry = cut;
      o.userData.ownGeometry = true;
      o.visible = idx.length > 0;
    });
    const j = b.getWorldPosition(new THREE.Vector3());
    copy.position.sub(j);
    copy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const turn = new THREE.Group();
    auto.object.getWorldQuaternion(turn.quaternion);
    turn.add(copy);
    return turn;
  }
  finishLimb(limb, at, mats) {
    const { ctx } = this;
    limb.position.copy(at);
    limb.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ctx.scene.add(limb);
    // in its jaws (until it throws it: step)
    // it hangs from its jaws by where they bit it (elbow, knee)
    const mouth = this.nub?.getWorldPosition(new THREE.Vector3());
    const bit = joints(this.l)?.[BITE[this.ripped.at(-1)]]?.getWorldPosition(new THREE.Vector3());
    this.limbs.push({ limb, v: new THREE.Vector3(), spin: new THREE.Vector3(), mats, landed: false, held: true, throwAt: (this.v ?? 0) + TG.hold,
      off: bit ? at.clone().sub(bit) : new THREE.Vector3() }); // (the joint, from the bitten point)
    ctx.particles.burst(at.x, at.y, at.z, { count: 40, color: '#b00f0f', speed: 0.13, gravity: 0.006, life: 30 });
    ctx.particles.burst(at.x, at.y, at.z, { count: 20, color: '#5a0505', speed: 0.08, gravity: 0.006, life: 40 });
    ctx.shake(0.3);
    ctx.sfx.hit?.(true);
  }
  render(dt) {
    const { t, l } = this, d = this.dir, v = this.v ?? -99;
    // what it's doing: pulling at a limb (pull: how far back it has dragged it, 0..1), or holding
    // the torn-off one up (lift)
    // yaw: its head swinging side to side (tugging, then shaking it like a dog with a toy)
    let pull = 0, lift = 0, yaw = 0, holding = false, tugging = -1;
    this.yawBias = 0;
    const time = this.time = (this.time ?? 0) + dt; // (smooth, between game ticks)
    for (const r of TG.rips) {
      if (v >= r - TG.tug && v < r) { const k = (v - (r - TG.tug)) / TG.tug; pull = k * k * (3 - 2 * k) * 0.85; tugging = TG.rips.indexOf(r); yaw = Math.sin(time * 7) * 0.15 * k; this.yawBias = -0.05 * k; } // (head down: the other way round)
      if (v >= r && v < r + TG.hold) { holding = true; const k = (v - r) / TG.hold; pull = 1 - k * 0.6; lift = Math.min(1, k * 4); const on = Math.min(1, k * 5) * (1 - Math.max(0, k - 0.8) * 5); yaw = Math.sin(time * 9) * 0.26 * on; this.yawBias = 0.1 * on; }
    }
    const back = -d * pull * 0.42; // (it backs away, dragging)
    if (t) {
      t.mixer.update(dt);
      // eating: the head-down tearing part of the clip, over and over (the head stays at the body)
      if (this.clip === 'Eat' && this.action.time > 3.0) this.action.time = 1.7;
      // pulling and shaking: the clip held on its head-down frame (the rest is done on its neck below)
      if (this.clip === 'Eat') { this.action.timeScale = pull || lift ? 0 : 1; if (pull || lift) this.action.time = 1.75 - 0.85 * lift; } // (lifting: back to a head-up frame)
      t.object.position.set(this.x + back, this.y, this.z);
      // (its nose is -x in the file; leaning back into the pull; the shake is mostly the whole tiger
      // turning a little, which never stretches it)
      t.object.rotation.set(0, (d > 0 ? Math.PI : 0) + (yaw + Math.abs(this.yawBias)) * 0.55 * -d, -lift * 0.1 + pull * 0.05);
      t.object.updateMatrixWorld(true);
      // the head: pulled back on its neck while dragging, lifted with the limb in its jaws
      if (this.neck && (lift || pull || yaw || this.yawBias)) {
        const turn = (bone, axis, ang, world = false) => {
          const w = world ? axis.clone() : axis.clone().applyQuaternion(t.object.quaternion); // (the tiger's own axis, in the world)
          const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
          bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(w.applyQuaternion(pq).normalize(), ang));
          t.object.updateMatrixWorld(true); // (the next turn works from this one)
        };
        const Z = new THREE.Vector3(0, 0, 1);
        turn(this.neck, Z, -lift * 0.2 - pull * 0.08);
        // side to side, like a dog with a toy: round the head's own up (its snout swings left and
        // right, whichever way it points), mostly from the neck
        if ((yaw || this.yawBias) && this.nub) {
          const side = Z.clone().applyQuaternion(t.object.quaternion);
          const snout = this.nub.getWorldPosition(new THREE.Vector3()).sub(this.neck.getWorldPosition(new THREE.Vector3())).normalize();
          const up = new THREE.Vector3().crossVectors(side, snout).normalize();
          // (+ swings toward the camera: mostly that way, so its head isn't hidden behind its body)
          const toCam = -Math.sign(new THREE.Vector3().crossVectors(up, snout).z) || 1;
          const a = toCam * (yaw + this.yawBias);
          turn(this.neck, up, a * 0.45, true); // (small: a big turn on one bone stretches its neck)
        }
        t.object.updateMatrixWorld(true);
      }
      if (this.nub) {
        const off = this.nub.getWorldPosition(new THREE.Vector3()).x - (this.x + back);
        if (this.clip === 'Run') this.snout = Math.abs(off);
        // between limbs: its mouth goes to the middle of the next one (elbow, knee)
        const bones = joints(l);
        if (this.downAt >= 0 && this.clip !== 'Howl' && bones && tugging < 0 && !holding) {
          const next = LIMBS[Math.min(3, this.ripped.length)];
          const j = (bones[BITE[next]] || bones[next])?.getWorldPosition(new THREE.Vector3());
          if (j) { this.x += (j.x - off - this.x) * Math.min(1, dt * 5); t.object.position.x = this.x + back; t.object.updateMatrixWorld(true); }
        }
      }
    }
    const mouth = this.nub?.getWorldPosition(new THREE.Vector3());
    // the limb in its jaws, still on the body: dragged out straight toward its mouth, and the body
    // pulled along the ground after it
    const bones = joints(l);
    if (pull && l.body?.object) l.body.object.position.x = l.pos.x + back * 0.35;
    if (tugging >= 0 && mouth && bones) {
      const name = LIMBS[tugging], j = bones[name], tip = bones[BITE[name]];
      if (j && tip && j.parent) {
        l.body.object.updateMatrixWorld(true);
        const p = j.getWorldPosition(new THREE.Vector3()), c = tip.getWorldPosition(new THREE.Vector3()).sub(p).normalize();
        const want = mouth.clone().sub(p).normalize();
        const qw = new THREE.Quaternion().setFromUnitVectors(c, want);
        qw.slerp(new THREE.Quaternion(), 1 - 0.45 * Math.min(1, 0.3 + pull)); // (part of the way: more and the skin round the joint stretches)
        const pw = j.parent.getWorldQuaternion(new THREE.Quaternion()).invert(), bw = j.getWorldQuaternion(new THREE.Quaternion());
        j.quaternion.copy(pw.multiply(qw).multiply(bw));
        // and the lower part straightened out along it
        if (tip.quaternion) tip.quaternion.slerp(tip.userData.straight ?? (tip.userData.straight = tip.quaternion.clone().identity()), Math.min(1, pull) * 0.7);
      }
      // blood seeping where its teeth are in
      if (Math.random() < 0.25) this.ctx.particles.burst(mouth.x, mouth.y, mouth.z, { count: 2, color: '#a00c0c', speed: 0.03, gravity: 0.008, life: 20 });
    }
    // the torn-off limbs: in its jaws, then flung, tumbling, then lying where they land
    for (const L of this.limbs) {
      if (L.landed) continue;
      if (L.held) {
        // swinging with its head (round its jaws)
        if (mouth) L.limb.position.copy(mouth).add(L.off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * 1.6));
        L.limb.rotation.y = yaw * 1.6;
        if (mouth && Math.random() < 0.35) this.ctx.particles.burst(mouth.x, mouth.y, mouth.z, { count: 3, color: '#9a0a0a', speed: 0.04, gravity: 0.008, life: 24 }); // dripping
        continue;
      }
      const k = Math.min(3, dt * 60);
      L.v.y -= 0.006 * k;
      L.limb.position.addScaledVector(L.v, k);
      L.limb.rotation.x += L.spin.x * k; L.limb.rotation.z += L.spin.z * k;
      if (L.limb.position.y < 0.1 && L.v.y < 0) { L.limb.position.y = 0.1; L.landed = true; L.limb.rotation.set(0, Math.random() - 0.5, (L.v.x < 0 ? 1 : -1) * Math.PI / 2); }
    }
    // the ripped-off limbs stay gone on the body
    if (bones) for (const b of this.ripped) bones[b]?.scale.setScalar(0.001);
  }
  dispose() {
    this.dead = true;
    if (this.t) { this.ctx.scene.remove(this.t.object); this.t.mixer.stopAllAction(); }
    for (const L of this.limbs) { this.ctx.scene.remove(L.limb); if (L.mats.length) L.limb.traverse((o) => o.geometry?.dispose()); for (const m of L.mats) m.dispose(); } // (a real limb shares its body's geometry: kept)
    const bones = joints(this.l);
    if (bones) for (const b of this.ripped) bones[b]?.scale.setScalar(1);
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// ── Ido Bohen: squashed flat by the giant foot ──────────────────────────────────
// His special's giant foot (his face on the big toe) comes down on them, stays down grinding them
// into the floor with blood squirting out from under it, and lifts off: they're as flat as a
// pancake, in a pool of blood.
const STOMP = 65; // (the foot's own clock: when it lands)
export class StompFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.flat = 0;
    this.foot = new Foot(w, {}, {
      ...ctx, fatality: true, flash() {}, camera() {},
      onStomp: (x) => this.stomp(x),
    });
    // the pool of blood that spreads out from under them
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: '#5c0606', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92, depthWrite: false }));
    this.pool.rotation.x = -Math.PI / 2; this.pool.visible = false; this.pool.renderOrder = 2;
    ctx.scene.add(this.pool);
  }
  stomp(x) {
    const { l, ctx } = this;
    this.flat = 1; this.stompX = x;
    l.dizzy = 0;
    ctx.whiteFlash?.(120);
    ctx.shake(0.9);
    ctx.particles.burst(l.pos.x, 0.25, 0.4, { count: 70, color: '#a00c0c', speed: 0.2, gravity: 0.007, life: 34, spread: 2.5 });
    ctx.particles.burst(l.pos.x, 0.2, 0.4, { count: 30, color: '#5a0505', speed: 0.12, gravity: 0.007, life: 40 });
    this.pool.visible = true; this.poolR = 0.3;
  }
  step(u) {
    const f = this.foot;
    if (!f.dead) f.tick();
    this.u = u;
    if (this.flat && this.poolR < 0.95) this.poolR += 0.03;
    if (u === STOMP + 22) return 'fatality';
    if (f.dead && u > STOMP + 120) return 'done';
    return null;
  }
  render() {
    const { l } = this;
    if (!this.foot.dead) this.foot.render();
    // flattened: lying in a heap, squashed to a sliver
    if (this.flat) {
      l.poseOverride = { anim: 'knockdown', phase: 'active', pt: 1 };
      const o = l.body?.object;
      if (o) o.scale.set(1.3, 0.1, 1.7);
      this.pool.position.set(l.pos.x, 0.015, 0.1);
      this.pool.scale.set(this.poolR * 1.3, this.poolR * 0.6, 1);
    }
  }
  // the camera: from below as it comes down (the whole foot and leg over them), then close on what's left
  cam() {
    const l = this.l, u = this.u ?? 0;
    const d = Math.sign(l.pos.x - this.w.pos.x) || 1;
    if (u < STOMP - 4) return { x: l.pos.x, y: 2.4, side: 0.3, up: -0.6, z: 9.5 };
    if (u > 140) return { x: l.pos.x, y: 0.15, side: 1.1, up: 0.55, z: 3.6 }; // (low: how flat they are)
    return { x: l.pos.x + d * 0.5, y: 1.7, side: 0, up: 0.3, z: 9.5 }; // (the whole foot, his face on the big toe)
  }
  dispose() {
    if (!this.foot.dead) this.foot.finish();
    this.ctx.scene.remove(this.pool); this.pool.geometry.dispose(); this.pool.material.dispose();
    this.l.body?.object?.scale.set(1, 1, 1);
    this.l.poseOverride = null;
  }
}

// ── Snir: the bones take something with them ────────────────────────────────────
// His special: he falls apart into bones that fly through them like spears and rebuild him on
// the other side. Here, as they pass through, they take part of them along (it changes each time):
//   'bones' — their skeleton is pulled out with his; the skin left behind sags flat, and their
//            bones fall back down into a pile on top of it
//   'skin'  — their skin is torn off and dragged along, dropped crumpled on the far side; their
//            bare skeleton is left standing, wobbles, and collapses into a pile
const ease = (k) => k * k * (3 - 2 * k);
export class BonesFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.mode = (ctx.seed ?? 0) % 2 ? 'skin' : 'bones';
    this.fx = new Shatter(w, { damage: 0 }, { ...ctx, fatality: true, flash() {}, camera() {}, onPierce: () => this.pierced() });
    this.d = this.fx.dir; this.lockX = this.fx.lockX; this.to = this.fx.to;
    this.passAt = -1;
    // their own skeleton (their height), hidden inside them till it's seen
    this.h = (l.def.heightCm || 175) / 175;
    this.mat = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.55 });
    this.dark = new THREE.MeshBasicMaterial({ color: '#1b1410' });
    this.group = new THREE.Group(); this.group.position.z = 0.12; this.group.visible = false;
    ctx.scene.add(this.group);
    this.parts = skeletonParts(this.mat, this.dark, this.h).map(([mesh, slot], i) => {
      this.group.add(mesh);
      const pile = { x: Math.sin(i * 9.1) * 0.5, y: 0.04 + (i % 3) * 0.03, z: Math.cos(i * 5.3) * 0.32, rz: Math.PI / 2 + Math.sin(i * 4.1) * 0.7, ry: i * 1.3 };
      const fly = { lag: 0.6 + (i % 6) * 0.22, y: slot.skull ? 1.3 : 0.5 + ((i * 5) % 11) / 11 * 1.1, z: Math.sin(i * 2.3) * 0.2, spin: (i % 3 - 1) * 0.4 };
      return { mesh, slot, pile, fly };
    });
  }
  pierced() { // each wave of bones through them: blood (none from an empty skin)
    const { l, ctx, d } = this;
    ctx.particles.burst(l.pos.x + d * 0.25, l.pos.y + 0.6 + Math.random() * 0.9, 0.3, { count: 12, color: '#a00c0c', speed: 0.11, gravity: 0.006, dir: d, life: 22 });
  }
  step(u) {
    const fx = this.fx, t = fx.t + 1;
    if (!fx.dead) fx.tick();
    this.t = t;
    // the moment the front of the volley is through them: that's when it takes them
    if (this.passAt < 0 && t > this.fx.S.lift && (fx.front(t) - this.lockX) * this.d > 0) {
      this.passAt = t;
      this.ctx.shake(0.4); this.ctx.sfx.hit?.(true);
      this.ctx.particles.burst(this.lockX, 1.1, 0.3, { count: 40, color: '#a00c0c', speed: 0.16, gravity: 0.006, dir: this.d, life: 26 });
    }
    if (t === this.fx.S.pierce + 22) { this.ctx.shake(0.15); this.ctx.sfx.thud?.(); } // (the pile lands)
    if (t === this.fx.S.pierce + 24) return 'fatality'; // (what's left of them has landed; he rebuilds after)
    if (fx.dead && t > fx.S.end + 30) return 'done';
    return null;
  }
  // the middle of their flat skin (its hips), where their bones land
  skinMid() {
    if (this.mid === undefined || (this.t ?? 0) < this.fx.S.pierce + 4) {
      const hips = joints(this.l)?.hips;
      this.mid = hips ? hips.getWorldPosition(new THREE.Vector3()).x : this.lockX + this.d * 0.8;
    }
    return this.mid;
  }
  // where a part of their skeleton is: standing at x, flying in the volley, or in a pile at x
  stand(p, x) { return { x: x + p.slot.x * this.d, y: p.slot.y, z: p.slot.z, rz: p.slot.rz * this.d, ry: 0 }; }
  lying(p, x) { return { x: x + p.pile.x, y: p.pile.y, z: p.pile.z, rz: p.pile.rz, ry: p.pile.ry }; }
  flying(p, fr) { return { x: fr - this.d * p.fly.lag, y: p.fly.y, z: p.fly.z, rz: p.slot.skull ? 0 : -this.d * Math.PI / 2, ry: p.slot.skull ? this.d * Math.PI / 2 : 0 }; }
  render(dt, time) {
    const { fx, l, d } = this, t = this.t ?? 0;
    if (!fx.dead) fx.render(time);
    if (this.passAt < 0) return;
    const since = t - this.passAt, fr = fx.front(Math.min(t, this.fx.S.pierce)), far = this.to + d * 1.2;
    this.group.visible = true;
    const o = l.body?.object;
    for (const p of this.parts) {
      let a, b, k;
      if (this.mode === 'bones') {
        // pulled out of them a little way with the volley, flung up, and falling back onto their skin
        const out = (q) => { const f = this.flying(p, q); f.x = this.lockX + d * Math.min(1.1, (f.x - this.lockX) * d + 0.6); f.y += 0.5; return f; };
        if (t < this.fx.S.pierce) { a = this.stand(p, this.lockX); b = out(fr); k = ease(Math.min(1, since / 18)); }
        else { a = out(fx.front(this.fx.S.pierce)); b = this.lying(p, this.skinMid()); b.y += 0.07; k = Math.min(1, (t - this.fx.S.pierce) / 20); k *= k; } // a pile in the middle of the skin
      } else {
        const fall = this.fx.S.pierce + 6;
        if (t < fall) { a = b = this.stand(p, this.lockX); k = 0; } // left standing, bare
        else { a = this.stand(p, this.lockX); b = this.lying(p, this.lockX); k = Math.min(1, (t - fall) / 18); k *= k; } // collapsing
      }
      const wob = this.mode === 'skin' && t < this.fx.S.pierce + 6 ? Math.sin(time * 18 + p.slot.y * 4) * 0.025 : 0;
      p.mesh.position.set(a.x + (b.x - a.x) * k + wob, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      const spin = this.mode === 'bones' && t < this.fx.S.pierce ? time * 6 * p.fly.spin * Math.min(1, since / 18) : 0;
      p.mesh.rotation.set(spin, a.ry + (b.ry - a.ry) * k, a.rz + (b.rz - a.rz) * k, 'YXZ');
    }
    if (!o) return;
    l.dizzy = 0;
    if (this.mode === 'bones') {
      // the skin left behind, nothing holding it up: it sags down into a heap
      const k = ease(Math.min(1, since / 26));
      l.poseOverride = { anim: k > 0.6 ? 'knockdown' : 'dazed', phase: 'active', pt: 1 };
      o.scale.set(1 + 0.35 * k, Math.max(0.12, 1 - 0.88 * k), 1 + 0.35 * k);
    } else {
      // the skin torn off and dragged along behind the bones, flat as a sheet, then dropped crumpled
      if (t < this.fx.S.pierce) {
        const k = Math.min(1, since / 14);
        o.position.set(this.lockX + (fr - d * 1.9 - this.lockX) * k, 0.85 * k + Math.sin(time * 9) * 0.06 * k, 0.1);
        o.rotation.set(0, 0, -d * Math.PI / 2 * k + Math.sin(time * 14) * 0.08 * k);
        o.scale.set(1, 1, 1 - 0.65 * k);
        l.poseOverride = { anim: 'dazed', phase: 'active', pt: 1 };
      } else {
        const k = Math.min(1, (t - this.fx.S.pierce) / 16), from = fx.front(this.fx.S.pierce) - d * 1.9;
        o.position.set(from + (far + d * 0.4 - from) * ease(k), 0.85 * (1 - k * k), 0.1);
        o.rotation.set(0, 0, -d * Math.PI / 2 * (1 - k));
        l.poseOverride = { anim: k > 0.5 ? 'knockdown' : 'dazed', phase: 'active', pt: 1 };
        o.scale.set(1 + 0.2 * k, 1 - 0.75 * k, 0.35 + 0.85 * k);
      }
    }
  }
  // the camera: close on them as the bones go through, then back to take in both piles
  cam() {
    const t = this.t ?? 0, d = this.d;
    if (t < this.fx.S.lift) return null;
    if (t < this.fx.S.pierce + 6) return { x: this.lockX, y: 1.1, side: -d * 0.4, up: 0.15, z: 3.6 };
    // both: what's left of them, and him rebuilding from his bones
    const mid = (this.lockX + this.to + (this.mode === 'skin' ? d * 1.6 : 0)) / 2;
    return { x: mid, y: 0.8, side: 0, up: 0.6, z: 5.6 };
  }
  dispose() {
    if (!this.fx.dead) this.fx.finish();
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.mat.dispose(); this.dark.dispose();
    const o = this.l.body?.object;
    if (o) { o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); }
    this.l.poseOverride = null;
  }
}

// ── a body blown to pieces ────────────────────────────────────────────────────
// Their own model cut up along its joints (head, chest, hips, upper and lower arms and legs),
// each piece a real chunk of them, scorched, flung out from `at`, tumbling, bouncing and coming
// to rest on the floor.
const PIECES = { head: ['head'], chest: ['spine', 'neck'], hips: ['hips', 'root'], lUp: ['lSh'], lLo: ['lEl', 'lHand'], rUp: ['rSh'], rLo: ['rEl', 'rHand'],
  lTh: ['lHip'], lSh2: ['lKnee', 'lFoot'], rTh: ['rHip'], rSh2: ['rKnee', 'rFoot'] };
function scorch(m) {
  const c = m.clone();
  if (c.color) c.color.multiplyScalar(0.6);
  if (c.emissive) c.emissive.set('#ff5a14');
  c.userData.scorched = true;
  return c;
}
export class BodyPieces {
  constructor(scene, f, at) {
    this.scene = scene; this.list = []; this.mats = new Map();
    const body = f.body;
    body.object.updateMatrixWorld(true);
    const cuts = body.auto ? this.cutModel(body.auto) : this.cutToy(body);
    for (const { obj, center } of cuts) {
      const pivot = new THREE.Group(); pivot.position.copy(center);
      // keep it where it was in the world: its transform relative to the pivot
      const m = new THREE.Matrix4().copy(obj.matrixWorld);
      obj.matrixAutoUpdate = true;
      m.premultiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
      m.decompose(obj.position, obj.quaternion, obj.scale);
      pivot.add(obj);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.frustumCulled = false;
        o.material = Array.isArray(o.material) ? o.material.map((x) => this.scorched(x)) : this.scorched(o.material);
      });
      scene.add(pivot);
      // blown out from the blast, more up than down, mostly sideways (and not too far toward the camera)
      const dir = center.clone().sub(at); dir.z = 0; if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0.3, 0);
      dir.normalize(); dir.x += (Math.random() - 0.5) * 0.8; dir.y = Math.abs(dir.y) * 0.6 + 0.35 + Math.random() * 0.4; dir.z = (Math.random() - 0.35) * 0.5;
      const v = dir.normalize().multiplyScalar(0.12 + Math.random() * 0.1);
      this.list.push({ pivot, v, spin: new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5), rest: false, trail: 0 });
    }
    this.t = 0;
  }
  scorched(m) { if (!this.mats.has(m)) this.mats.set(m, scorch(m)); return this.mats.get(m); }
  // a model with the auto-rig: one copy per piece, keeping only the triangles that go with its bones
  cutModel(auto) {
    const out = [], byBone = {};
    for (const [piece, names] of Object.entries(PIECES)) for (const n of names) byBone[n] = piece;
    for (const piece of Object.keys(PIECES)) {
      const copy = SkeletonUtils.clone(auto.object);
      let main = null;
      copy.traverse((o) => { if (o.isBone && o.name === PIECES[piece][0]) main = o; });
      copy.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones, n = g.attributes.position.count;
        const on = new Uint8Array(n);
        for (let i = 0; i < n; i++) { // the vertex goes with the bone that moves it most
          let best = -1, bw = 0;
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
          on[i] = byBone[bones[best]?.name] === piece ? 1 : 0;
        }
        const src = g.index ? g.index.array : null, count = src ? src.length : n, idx = [];
        for (let t = 0; t < count; t += 3) {
          const a = src ? src[t] : t, b = src ? src[t + 1] : t + 1, c = src ? src[t + 2] : t + 2;
          if (on[a] + on[b] + on[c] >= 2) idx.push(a, b, c); // (ragged edges, no gaps)
        }
        const cut = new THREE.BufferGeometry();
        for (const [k, v] of Object.entries(g.attributes)) cut.setAttribute(k, v);
        cut.setIndex(idx);
        o.geometry = cut; o.userData.ownGeometry = true;
        o.visible = idx.length > 0;
      });
      // in the world where the body is
      const holder = new THREE.Group();
      auto.object.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
      holder.add(copy);
      holder.updateMatrixWorld(true);
      const center = main ? main.getWorldPosition(new THREE.Vector3()) : holder.position.clone();
      // its middle, not its joint: halfway to the next joint down the line
      const next = main?.children.find((c) => c.isBone);
      if (next && piece !== 'chest' && piece !== 'hips') center.lerp(next.getWorldPosition(new THREE.Vector3()), 0.5);
      out.push({ obj: holder, center });
    }
    return out;
  }
  // a code-built figure (the dummy): its groups copied, each without the parts that are other pieces
  cutToy(body) {
    const roots = [body.neck, body.lArm?.sh, body.rArm?.sh, body.lLeg?.hip, body.rLeg?.hip, body.spine, body.hips].filter(Boolean);
    const others = new Set(roots);
    return roots.map((r) => {
      const copy = r.clone(true);
      const a = [], b = [];
      r.traverse((o) => a.push(o)); copy.traverse((o) => b.push(o));
      a.forEach((o, i) => { if (o !== r && others.has(o)) b[i].visible = false; });
      r.updateWorldMatrix(true, false);
      copy.matrixWorld.copy(r.matrixWorld);
      const center = r.getWorldPosition(new THREE.Vector3());
      const box = new THREE.Box3();
      r.traverse((o) => { if (o.isMesh && (o === r || ![...others].some((x) => x !== r && isUnder(o, x, r)))) box.expandByObject(o); });
      if (!box.isEmpty()) box.getCenter(center);
      return { obj: copy, center };
    });
  }
  update(k) {
    this.t += k;
    const glow = Math.max(0, 1 - this.t / 50);
    for (const m of this.mats.values()) if (m.emissive) m.emissiveIntensity = glow * glow * 0.35; // (embers, cooling)
    for (const P of this.list) {
      if (P.rest) continue;
      P.v.y -= 0.0055 * k;
      P.pivot.position.addScaledVector(P.v, k);
      P.pivot.rotation.x += P.spin.x * k; P.pivot.rotation.y += P.spin.y * k; P.pivot.rotation.z += P.spin.z * k;
      if (P.pivot.position.y < 0.12 && P.v.y < 0) { // bounce, and slow down
        P.pivot.position.y = 0.12;
        P.v.y *= -0.35; P.v.x *= 0.55; P.v.z *= 0.55; P.spin.multiplyScalar(0.5);
        if (Math.abs(P.v.y) < 0.02) P.rest = true;
      }
      if (Math.abs(P.pivot.position.x) > 14) P.rest = true; // (off past the arena)
    }
  }
  // a little smoke rising off the pieces
  smoke(particles) {
    if (this.t > 200) return;
    for (const P of this.list) if (Math.random() < 0.12) particles.burst(P.pivot.position.x, P.pivot.position.y + 0.1, P.pivot.position.z, { count: 1, color: Math.random() < 0.5 ? '#3a3330' : '#57504a', speed: 0.01, gravity: -0.002, life: 40 });
  }
  dispose() {
    for (const P of this.list) {
      this.scene.remove(P.pivot);
      P.pivot.traverse((o) => { if (o.userData.ownGeometry) o.geometry.setIndex(null); }); // (the vertex data is the body's: kept)
    }
    for (const m of this.mats.values()) m.dispose();
  }
}
function isUnder(o, root, stop) { for (let p = o; p && p !== stop; p = p.parent) if (p === root) return true; return false; }

// ── Or Haim: blown to pieces ────────────────────────────────────────────────────
// His special (Hoshech Mavet rises from his shadow, the two of them beat them up and kick them into
// the sky, Hoshech Mavet leaps after them) — and the explosion is a real one: they go up with it,
// blown apart, their pieces raining down all over the arena.
export class BlastFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    l.dizzy = 0;
    this.fx = new Darkness(w, { damage: 0 }, { ...ctx, fatality: true, flash() {}, camera() {}, onBoom: (x, y) => this.boom(x, y) });
  }
  boom(x, y) {
    const { ctx, l } = this;
    this.boomT = this.u;
    this.blastAt = new THREE.Vector3(x, y, 0);
    this.blast = new Explosion(ctx.scene, x, y, { size: 1.3, tint: true });
    this.pieces = new BodyPieces(ctx.scene, l, this.blastAt);
    l.exploded = true; // gone
    ctx.whiteFlash(450); ctx.shake(1);
    ctx.sfx.thud?.(); ctx.sfx.hit?.(true);
    ctx.particles.burst(x, y, 0.4, { count: 70, color: '#ffd27a', speed: 0.34, gravity: 0.004, life: 30 }); // sparks
    ctx.particles.burst(x, y, 0.4, { count: 60, color: '#8a0c0c', speed: 0.22, gravity: 0.006, life: 44 }); // and them
    ctx.particles.burst(x, y, 0.4, { count: 40, color: '#1a1412', speed: 0.18, gravity: 0.006, life: 50 });
    ctx.rings.spawn(x, y, '#ffe2b0', { grow: 0.5, life: 22, flat: false }); // the shockwave
    ctx.rings.spawn(x, 0.05, '#ffb066', { grow: 0.4, life: 34 });
  }
  step(u) {
    this.u = u;
    if (!this.fx.dead) this.fx.tick();
    if (this.boomT !== undefined) {
      const v = u - this.boomT;
      if (v === 40) return 'fatality';
      if (v >= 190) return 'done';
    }
    return null;
  }
  render(dt, time) {
    const k = Math.min(3, dt * 60);
    if (!this.fx.dead) this.fx.render(time);
    if (this.pieces) { this.pieces.update(k); this.pieces.smoke(this.ctx.particles); }
  }
  // the camera: as the special's (tilting up after them into the sky), then wide on the blast and
  // following the pieces down
  cam() {
    const { w, l } = this, u = this.u ?? 0;
    const mid = (w.pos.x + l.pos.x) / 2, y = Math.max(0, l.pos.y);
    if (this.boomT === undefined) {
      if (y < 0.3) return null;
      return { x: mid, y: 0.9 + y * 0.72, side: 0, up: -0.25 - y * 0.2, z: 7 + y * 1.1 };
    }
    const v = u - this.boomT, b = this.blastAt, k = Math.min(1, v / 70);
    return { x: b.x, y: b.y * (1 - k) + 1.2 * k + 0.6, side: 0, up: -0.3 * (1 - k), z: 12.5 - 2 * k };
  }
  dispose() {
    if (!this.fx.dead) this.fx.finish();
    this.pieces?.dispose();
    this.l.poseOverride = null;
  }
}

// ── Netanel: swallowed by the earth ─────────────────────────────────────────────
// He drums the earthquake (his special); the crack runs along the floor to them and the ground
// under them breaks open into a hole. They teeter on the edge, drop into it, and the ground
// closes over them with a slam, leaving only a scar in the floor.
function jaggedDisc(r, n, rough, seed) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * Math.PI * 2, rr = r * (1 - rough * (0.5 + 0.5 * Math.sin(a * 7 + seed) * Math.cos(a * 3 + seed * 2)));
    i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g;
}
const QK = { open: 0, fall: 34, gone: 66, close: 80, shut: 104, end: 190 }; // (after the crack reaches them)
export class SwallowFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.fx = new Quake(w, {}, { ...ctx, fatality: true, flash() {}, onCrack: () => { this.crackAt = this.u; } });
    this.hole = new THREE.Group(); this.hole.visible = false;
    this.edge = new THREE.Mesh(jaggedDisc(1.15, 40, 0.22, 1.3), new THREE.MeshBasicMaterial({ color: '#3a2a1d', depthWrite: false }));
    this.pit = new THREE.Mesh(jaggedDisc(1.0, 40, 0.25, 2.1), new THREE.MeshBasicMaterial({ color: '#050302', depthWrite: false }));
    this.edge.position.y = 0.012; this.pit.position.y = 0.016;
    this.edge.renderOrder = 2; this.pit.renderOrder = 3;
    // broken slabs of floor tipped up round the edge
    this.slabMat = new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.9 });
    this.slabs = Array.from({ length: 9 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34 + (i % 3) * 0.08, 0.08, 0.26), this.slabMat);
      const a = i / 9 * Math.PI * 2 + 0.3;
      m.userData = { a, tilt: 0.3 + (i % 4) * 0.12 };
      m.castShadow = true;
      this.hole.add(m);
      return m;
    });
    this.hole.add(this.edge, this.pit);
    ctx.scene.add(this.hole);
    this.scar = new THREE.Mesh(jaggedDisc(0.9, 30, 0.35, 4.2), new THREE.MeshBasicMaterial({ color: '#6e6355', transparent: true, opacity: 0, depthWrite: false }));
    this.scar.position.y = 0.011; this.scar.renderOrder = 2;
    ctx.scene.add(this.scar);
    this.r = 0; this.drop = 0; this.vy = 0;
  }
  step(u) {
    this.u = u;
    const { w, l, ctx } = this;
    if (!this.fx.dead) this.fx.tick();
    // drumming (his special's pose), till the crack is on its way
    w.poseOverride = !this.fx.fired || u - this.fx.fired < 14 ? { anim: 'darbuka', phase: 'active', pt: 1 } : null;
    if (this.crackAt === undefined) return null;
    const v = u - this.crackAt;
    this.v = v;
    l.dizzy = 0;
    if (v === QK.open) { // the ground breaks open under them
      ctx.shake(0.6); ctx.sfx.thud?.();
      this.hole.position.set(l.pos.x, 0, 0.1); this.hole.visible = true;
      ctx.particles.burst(l.pos.x, 0.15, 0.3, { count: 50, color: '#8c7356', speed: 0.12, gravity: 0.007, spread: 2.2, life: 30 });
    }
    if (v > QK.open && v < QK.close && v % 5 === 0) { // rubble crumbling off the edge
      ctx.shake(0.12);
      const a = Math.random() * Math.PI * 2;
      ctx.particles.burst(l.pos.x + Math.cos(a) * this.r, 0.1, 0.1 + Math.sin(a) * this.r * 0.5, { count: 6, color: '#7a6650', speed: 0.04, gravity: 0.008, life: 20 });
    }
    // teetering, then falling in
    if (v < QK.fall) l.poseOverride = { anim: v % 10 < 5 ? 'hit' : 'dazed', phase: 'active', pt: 0 };
    else l.poseOverride = { anim: 'hit', phase: 'active', pt: 0 };
    if (v >= QK.fall && this.drop < 6) { this.vy += 0.012; this.drop += this.vy; }
    if (v === QK.gone) { l.exploded = true; if (l.body?.object) l.body.object.visible = false; }
    if (v === QK.shut) { // slammed shut
      ctx.shake(0.8); ctx.sfx.thud?.(); ctx.whiteFlash?.(120);
      ctx.particles.burst(l.pos.x, 0.2, 0.3, { count: 70, color: '#a88a62', speed: 0.14, gravity: 0.005, spread: 2.5, life: 40 });
      ctx.rings.spawn(l.pos.x, 0.05, '#e8d2a8', { grow: 0.3, life: 26 });
      return 'fatality';
    }
    if (v >= QK.end) return 'done';
    return null;
  }
  render(dt, time) {
    if (!this.fx.dead) this.fx.render(time);
    const { l } = this, v = this.v ?? -1;
    if (v < 0) return;
    // the hole: opening fast, holding, then grinding shut
    const ease = (k) => k * k * (3 - 2 * k);
    this.r = v < 14 ? ease(v / 14) : v < QK.close ? 1 : Math.max(0, 1 - ease(Math.min(1, (v - QK.close) / (QK.shut - QK.close))));
    this.hole.visible = this.r > 0.01;
    this.hole.scale.set(this.r, 1, this.r * 0.75);
    for (const m of this.slabs) {
      const { a, tilt } = m.userData;
      m.position.set(Math.cos(a) * 1.1, 0.03 + tilt * 0.12, Math.sin(a) * 1.1);
      m.rotation.set(Math.sin(a) * tilt, -a, Math.cos(a) * tilt);
      m.scale.set(1 / Math.max(0.05, this.r), 1, 1 / Math.max(0.05, this.r * 0.75)); // (keep their size as the hole scales)
      m.visible = this.r > 0.15;
    }
    this.scar.position.x = l.pos.x;
    this.scar.material.opacity = v >= QK.shut ? 0.55 : 0;
    // them, dropping into it (below the floor they're out of sight)
    const o = l.body?.object;
    if (o && v >= QK.fall) o.position.y = l.pos.y - this.drop;
  }
  // the camera: close on them at the edge, then looking down into the hole
  cam() {
    const v = this.v ?? -1, l = this.l;
    if (v < 0) return null;
    return { x: l.pos.x, y: v < QK.fall ? 0.9 : 0.2, side: 0.4, up: v < QK.fall ? 0.6 : 2.0, z: v < QK.fall ? 5.0 : 4.6 };
  }
  dispose() {
    if (!this.fx.dead) this.fx.finish();
    for (const m of [this.hole, this.scar]) { this.ctx.scene.remove(m); m.traverse((o) => { o.geometry?.dispose(); if (o.material !== this.slabMat) o.material?.dispose(); }); }
    this.slabMat.dispose();
    const o = this.l.body?.object;
    if (o) o.visible = true;
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// ── Michael: factory reset ──────────────────────────────────────────────────────
// He throws the computer (his special); it hits them and resets them — their own fists turn on
// them. They punch themselves in the face, again and again, faster and harder, bloodier and
// bloodier, staggering, until a last one knocks them out cold for good.
const MP = { first: 30, n: 11, end: 330 };
export class SelfPunchFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.fx = new Computer(w, {}, { ...ctx, fatality: true, onHit: (x, y) => this.reset(x, y) });
    this.icon = new ResetIcon(ctx.scene);
    // when each punch lands: slow at first, faster and faster
    this.times = []; let t = MP.first;
    for (let i = 0; i < MP.n; i++) { this.times.push(t); t += Math.max(9, 26 - i * 2); }
    this.lastAt = this.times.at(-1);
    this.bruise = 0;
  }
  reset(x, y) {
    const { ctx } = this;
    this.hitAt = this.u;
    ctx.particles.burst(x, y, 0.3, { count: 40, color: '#3a8bff', speed: 0.14, gravity: 0.003 });
    ctx.particles.burst(x, y, 0.3, { count: 20, color: '#ffffff', speed: 0.1, gravity: 0.003 });
    ctx.shake(0.25); ctx.sfx.zap?.();
  }
  step(u) {
    this.u = u;
    const { w, l, ctx } = this;
    if (!this.fx.dead) this.fx.tick();
    w.poseOverride = u < 14 ? { anim: 'throw', phase: u < 10 ? 'startup' : 'active', pt: 1 } : null;
    if (this.hitAt === undefined) return null;
    const v = u - this.hitAt;
    this.v = v;
    l.dizzy = 0;
    if (v < MP.first - 12) { l.poseOverride = { anim: v % 6 < 3 ? 'hit' : 'idle', phase: 'active', pt: 0 }; return null; } // glitching
    if (v > this.lastAt) { // out cold
      l.poseOverride = { anim: 'knockdown', phase: 'active', pt: 1 };
      if (v === this.lastAt + 40) return 'fatality';
      if (v >= MP.end) return 'done';
      return null;
    }
    // which punch, which hand, and how far through it
    const i = this.times.findIndex((t) => t >= v), at = this.times[i], prev = i ? this.times[i - 1] : MP.first - 14;
    const k = Math.min(1, Math.max(0, (v - prev) / (at - prev)));
    const wind = Math.min(1, k * 1.6), strike = k > 0.62 ? 1 : wind * 0.35; // (wind up, then slam it in)
    l.poseOverride = { anim: i % 2 ? 'selfPunchL' : 'selfPunchR', phase: 'active', pt: v === at ? 1 : strike };
    if (v === at) { // smack
      const last = i === MP.n - 1;
      const m = l.mouthPos?.() ?? { x: l.pos.x, y: l.pos.y + 1.7 };
      this.bruise = Math.min(1, this.bruise + 0.1);
      ctx.sfx.hit?.(last || i > 6);
      ctx.shake(last ? 0.5 : 0.12 + i * 0.015);
      if (i >= 2) ctx.particles.burst(m.x, m.y, 0.35, { count: 6 + i * 3, color: '#a00c0c', speed: 0.07 + i * 0.006, gravity: 0.007, life: 26 });
      if (i >= 6) ctx.particles.burst(m.x, m.y, 0.35, { count: 3, color: '#f2efe6', speed: 0.09, gravity: 0.008, life: 30 }); // (teeth)
      if (last) { ctx.whiteFlash?.(120); ctx.sfx.thud?.(); }
    }
    return null;
  }
  render(dt, time) {
    if (!this.fx.dead) this.fx.render(time);
    const { l } = this, v = this.v ?? -1;
    // the reset screen over their head, glitching, while they're under its control
    this.icon.render({ scrambled: v >= 0 && v <= this.lastAt ? 300 * (1 - v / this.lastAt) : 0, alive: true, pos: l.pos, reachScale: l.reachScale }, time);
    // bruising: the body flushes red the more they hit themselves
    for (const m of l.body?.materials || []) if (m.emissive) m.emissive.setRGB(0.1 * this.bruise, 0, 0); // (a little: the blood does the rest)
    // staggering about
    const o = l.body?.object;
    if (o && v > MP.first && v <= this.lastAt) o.position.x = l.pos.x + Math.sin(time * 3.1) * 0.08 * this.bruise;
  }
  cam() {
    const v = this.v ?? -1, l = this.l;
    if (v < MP.first - 12) return null;
    if (v > this.lastAt + 10) return { x: l.pos.x, y: 0.4, side: 0.6, up: 0.9, z: 4.2 };
    return { x: l.pos.x, y: 1.55, side: 0.5, up: 0.05, z: 4.6 }; // (close on them, head and fists)
  }
  dispose() {
    if (!this.fx.dead) this.fx.finish();
    this.icon.dispose();
    for (const m of this.l.body?.materials || []) m.emissive?.setScalar(0);
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// ── going bald (for real) ───────────────────────────────────────────────────────
// Their own hair taken off the model: the hair is found by its colour in the texture (on top of
// the head, at the back and hanging down it), and bit by bit, top first, it's painted over in
// their skin colour and pulled in to the shape of the skull. set(k): 0 = all there, 1 = bald.
// newly(): the hair that just came off (where to drop falling hairs). restore() puts it all back.
export function makeBald(f, scene) {
  const auto = f.body?.auto, def = f.def;
  if (!auto?.landmarks) { // the dummy: its own hair just shrinks away
    const hair = f.body?.hair;
    return { set(k) { if (hair) hair.scale.setScalar(Math.max(0.001, 1 - k)); }, newly: () => [], restore() { if (hair) hair.scale.setScalar(1); } };
  }
  const L = auto.landmarks, hh = L.H - L.neckY;
  const jobs = [];
  auto.object.traverse((o) => {
    if (!o.isSkinnedMesh || Array.isArray(o.material) || !o.material.map?.image) return;
    const map = o.material.map, img = map.image, W = img.width, H = img.height;
    if (!W || !H) return;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const c2 = canvas.getContext('2d', { willReadFrequently: true });
    c2.drawImage(img, 0, 0);
    const px = c2.getImageData(0, 0, W, H).data;
    const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv;
    if (!uv) return;
    const n = pos.count;
    const at = (i) => { // the texture's colour at a vertex
      let x = Math.floor(uv.getX(i) * W), y = Math.floor((map.flipY ? 1 - uv.getY(i) : uv.getY(i)) * H);
      x = ((x % W) + W) % W; y = Math.min(H - 1, Math.max(0, y));
      const k = (y * W + x) * 4; return [px[k], px[k + 1], px[k + 2]];
    };
    jobs.push({ o, map, canvas, c2, W, H, pos, uv, n, at });
  });
  if (!jobs.length) return { set() {}, newly: () => [], restore() {} };
  // the head's middle (front to back), and reference colours: skin from the cheeks, hair from the crown
  let cz = 0, cn = 0, top = -Infinity;
  for (const j of jobs) for (let i = 0; i < j.n; i++) { const y = j.pos.getY(i); if (y > L.neckY + 0.3 * hh) { cz += j.pos.getZ(i); cn++; } top = Math.max(top, y); }
  cz /= cn || 1;
  const C = new THREE.Vector3(0, L.neckY + 0.5 * hh, cz);
  const avg = (list) => list.length ? [0, 1, 2].map((k) => list.reduce((s, c) => s + c[k], 0) / list.length) : null;
  const skinCols = [], hairCols = [], faceD = [], backCols = [];
  for (const j of jobs) for (let i = 0; i < j.n; i++) {
    const x = j.pos.getX(i), y = j.pos.getY(i), z = j.pos.getZ(i);
    if (y > L.neckY + 0.32 * hh && y < L.neckY + 0.55 * hh && z > cz + 0.3 * hh && Math.abs(x) < 0.35 * hh) { skinCols.push(j.at(i)); faceD.push(Math.hypot(x - C.x, y - C.y, z - C.z)); }
    if (y > top - 0.05 * hh) hairCols.push(j.at(i));
    if (z < cz - 0.25 * hh && y > L.neckY + 0.3 * hh && y < L.neckY + 0.55 * hh && Math.abs(x) < 0.3 * hh) backCols.push(j.at(i));
  }
  const sc = new THREE.Color(def.colors?.skin || '#d9a98a');
  // (under a hat's brim the cheeks are in its shade, or it's a beard: then the skin's from the nose tip)
  let nose = [];
  if (def.hat) {
    const pts = [];
    for (const j of jobs) for (let i = 0; i < j.n; i++) { const x = j.pos.getX(i), y = j.pos.getY(i); if (Math.abs(x) < 0.08 * hh && y > L.neckY + 0.35 * hh && y < L.neckY + 0.55 * hh) pts.push([j.pos.getZ(i), j.at(i)]); }
    pts.sort((a, b) => b[0] - a[0]); nose = pts.slice(0, Math.max(3, pts.length * 0.03 | 0)).map((p) => p[1]);
  }
  const dist0 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hatC = def.hat ? avg(hairCols) : null, hairC = def.hairTone && [1, 3, 5].map((k) => parseInt(def.hairTone.slice(k, k + 2), 16));
  // (not the hat's brim or a beard: the brightest of what's left, skin catching the light)
  const faceCols = (def.hat ? [...nose, ...skinCols] : skinCols).filter((c) => !(hatC && dist0(c, hatC) < 70) && !(hairC && dist0(c, hairC) < 60));
  const skinGiven = def.skinTone && [1, 3, 5].map((k) => parseInt(def.skinTone.slice(k, k + 2), 16)); // (or the roster says)
  const skin = skinGiven || avg(faceCols) || avg(skinCols) || [sc.r * 255, sc.g * 255, sc.b * 255];
  // a hat (def.hat): the top of the head is the hat, so the hair's colour comes from the back of the
  // head, under it; the hat comes off first and falls
  const hatRef = def.hat ? avg(hairCols) : null;
  const given = def.hairTone && [1, 3, 5].map((k) => parseInt(def.hairTone.slice(k, k + 2), 16)); // (the roster can say: hard to sample under a hat)
  const hairRef = given || (def.hat ? avg(backCols) : avg(hairCols)) || skin;
  faceD.sort((a, b) => a - b);
  const R = (faceD[Math.floor(faceD.length * 0.4)] || hh * 0.45) * 0.97; // (the skull, about the face's depth)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const skinCss = `rgb(${skin.map(Math.round).join(',')})`;
  // the hair: hair-coloured, on the head above the brows, or at the back of the head / hanging down it
  let tris = [];
  for (const j of jobs) {
    j.orig = new Float32Array(j.n * 3); // (read through the attribute: it may be stored packed)
    for (let i = 0; i < j.n; i++) { j.orig[i * 3] = j.pos.getX(i); j.orig[i * 3 + 1] = j.pos.getY(i); j.orig[i * 3 + 2] = j.pos.getZ(i); }
    j.hair = new Uint8Array(j.n); j.t = new Float32Array(j.n).fill(2); j.hat = new Uint8Array(j.n);
    for (let i = 0; i < j.n; i++) {
      const x = j.pos.getX(i), y = j.pos.getY(i), z = j.pos.getZ(i);
      // (a brim: sticking out in front, past the face, above the eyes)
      if (hatRef && z > cz + 0.15 * hh && y > L.neckY + 0.4 * hh && Math.hypot(x - C.x, y - C.y, z - C.z) > R * 0.98 && dist(j.at(i), skin) > 1.2 * dist(j.at(i), hatRef)) { j.hat[i] = 1; j.hair[i] = 1; continue; }
      if (hatRef && y > L.neckY + 0.45 * hh && Math.hypot(x - C.x, y - C.y, z - C.z) < hh * 0.9) {
        const c = j.at(i);
        if (dist(c, hatRef) < dist(c, hairRef) && dist(c, hatRef) < dist(c, skin)) { j.hat[i] = 1; j.hair[i] = 1; continue; } // (a copy falls; on the head it turns to bare scalp at once)
      }
      // the crown (above the brows; higher at the front, for the eyebrows) all goes; at the back of
      // the head a bit lower, if it's hair-coloured (not a hood or a collar: only on the head)
      const crown = y > L.neckY + (z > cz + 0.25 * hh ? 0.74 : 0.62) * hh;
      const back = z < cz - 0.1 * hh && y > L.neckY + 0.4 * hh && Math.hypot(x - C.x, y - C.y, z - C.z) < hh * 0.75;
      if (crown) { j.hair[i] = 1; continue; }
      if (back && dist(j.at(i), hairRef) < dist(j.at(i), skin) * 0.9) j.hair[i] = 1;
      // hair at the sides of the head, round the ears: scalp too (painted, not cut off)
      const faceZone = z > cz + 0.15 * hh && Math.abs(x) < 0.27 * hh;
      if (!faceZone && y > L.neckY + 0.3 * hh && Math.hypot(x - C.x, y - C.y, z - C.z) < hh * 0.62 && dist(j.at(i), hairRef) < dist(j.at(i), skin) * 0.8) j.hair[i] = 1;
    }
    const idx = j.o.geometry.index?.array, cnt = idx ? idx.length : j.n;
    for (let t = 0; t < cnt; t += 3) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
      if (j.hair[a] + j.hair[b] + j.hair[c] < 2) continue;
      const y = (j.pos.getY(a) + j.pos.getY(b) + j.pos.getZ(c) * 0 + j.pos.getY(c)) / 3;
      tris.push({ j, a, b, c, order: j.hat[a] + j.hat[b] + j.hat[c] >= 2 ? -10 : (top - y) / (top - L.shoulderY) + Math.random() * 0.35 }); // (from the top down, patchy; the hat's place first)
    }
  }
  tris.sort((p, q) => p.order - q.order);
  const hatTris = tris.filter((t) => t.order === -10).length;
  // long hair (def.longHair): what hangs down from the scalp, hair-coloured, grown out from the crown
  // through the triangles (so it never takes a dark shirt or a belt); cut off in four clumps that fall
  const clumps = [[], [], [], []];
  if (def.longHair) {
    let ch = [0, 0, 0], cn2 = 0; // (the clothes: the chest's colour, so hair is told from them too)
    for (const j of jobs) for (let i = 0; i < j.n; i++) {
      const y = j.pos.getY(i), z = j.pos.getZ(i);
      if (Math.abs(y - (L.shoulderY + L.waistY) / 2) < 0.04 * L.H && z > cz && Math.abs(j.pos.getX(i)) < L.shoulderX * 0.6) { const c = j.at(i); ch = ch.map((v, k) => v + c[k]); cn2++; }
    }
    const clothes = cn2 ? ch.map((v) => v / cn2) : [9999, 9999, 9999];
    for (const j of jobs) {
      const idx = j.o.geometry.index?.array, cnt = idx ? idx.length : j.n;
      const cand = new Uint8Array(j.n), lng = new Uint8Array(j.n);
      for (let i = 0; i < j.n; i++) {
        const y = j.pos.getY(i);
        const x = j.pos.getX(i), z = j.pos.getZ(i);
        if (y < L.waistY || Math.abs(x) > Math.max(L.shoulderX * 1.2, hh * 0.85) || j.hair[i]) continue;
        if (z > cz + 0.15 * hh && Math.abs(x) < 0.27 * hh && y > L.neckY - 0.15 * hh) continue; // (never the face: eyes, brows, mouth)
        const c = j.at(i), dh = dist(c, hairRef);
        // below the neck: only hanging down the back, and clearly hair, not the uniform
        // (in front, over the shoulders, only if it's very clearly hair)
        if (y < L.neckY) { const dc = dist(c, clothes); if (z > cz - 0.05 * hh ? dh > 0.4 * dc : dh > 0.7 * dc) continue; }
        if (dh < 1.4 * dist(c, skin) && dh < 1.1 * dist(c, clothes)) cand[i] = 1; // (leaning to hair: it has light streaks)
      }
      // grow it out from the crown, across the triangles. (Points are often stored once per
      // triangle, so they're joined by position first, or nothing would connect.)
      const ids = new Map(), canon = new Int32Array(j.n);
      for (let i = 0; i < j.n; i++) {
        const k = `${Math.round(j.pos.getX(i) * 400)},${Math.round(j.pos.getY(i) * 400)},${Math.round(j.pos.getZ(i) * 400)}`;
        let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id); } canon[i] = id;
      }
      const seedC = new Uint8Array(ids.size), candC = new Uint8Array(ids.size), lngC = new Uint8Array(ids.size);
      for (let i = 0; i < j.n; i++) { if (j.hair[i]) seedC[canon[i]] = 1; if (cand[i]) candC[canon[i]] = 1; }
      let grew = true;
      while (grew) {
        grew = false;
        for (let t = 0; t < cnt; t += 3) {
          const a = canon[idx ? idx[t] : t], b = canon[idx ? idx[t + 1] : t + 1], c = canon[idx ? idx[t + 2] : t + 2];
          if (!(seedC[a] || lngC[a] || seedC[b] || lngC[b] || seedC[c] || lngC[c])) continue;
          for (const v of [a, b, c]) if (candC[v] && !lngC[v]) { lngC[v] = 1; grew = true; }
        }
      }
      for (let i = 0; i < j.n; i++) lng[i] = lngC[canon[i]];
      j.cut = new Uint8Array(cnt / 3);
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
        if (lng[a] + lng[b] + lng[c] < 2) continue;
        const x = (j.pos.getX(a) + j.pos.getX(b) + j.pos.getX(c)) / 3, z = (j.pos.getZ(a) + j.pos.getZ(b) + j.pos.getZ(c)) / 3;
        const k = x < 0 ? (z < cz ? 0 : 1) : (z < cz ? 2 : 3); // (four clumps: back and front, each side)
        clumps[k].push({ j, t });
      }
    }
  }
  const drops = clumps.filter((c) => c.length).map((list, i, all) => ({ list, at: 0.2 + 0.65 * i / Math.max(1, all.length - 1), dropped: false }));
  // the hat: off first, in one piece
  if (hatRef) {
    const list = [];
    for (const j of jobs) {
      const idx = j.o.geometry.index?.array, cnt = idx ? idx.length : j.n;
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
        if (j.hat[a] + j.hat[b] + j.hat[c] >= 2) list.push({ j, t });
      }
    }
    if (list.length) drops.unshift({ list, at: 0, dropped: false, hat: true });
  }
  const fallen = [];
  for (const j of jobs) {
    j.origIndex = j.o.geometry.index;
    if (!j.origIndex) { const a = new Uint32Array(j.n); for (let i = 0; i < j.n; i++) a[i] = i; j.o.geometry.setIndex(new THREE.BufferAttribute(a, 1)); }
    j.origSide = j.o.material.side;
  }
  // a clump comes off: out of the body (which shows its inside through the gap), into its own piece that falls
  const drop = (d) => {
    d.dropped = true;
    const byJob = new Map();
    for (const { j, t } of d.list) { if (!byJob.has(j)) byJob.set(j, []); byJob.get(j).push(t); }
    const keepOnBody = !!d.hat; // (the hat: a copy falls, the head under it is bald scalp)
    const copy = SkeletonUtils.clone(auto.object), meshes = [];
    copy.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const all = []; auto.object.traverse((o) => { if (o.isSkinnedMesh) all.push(o); });
    let minY = Infinity; const ctr = new THREE.Vector3(); let cn3 = 0;
    meshes.forEach((m, mi) => {
      const j = jobs.find((x) => x.o === all[mi]), ts = j && byJob.get(j);
      if (!ts) { m.visible = false; return; }
      const src = j.o.geometry.index.array, idx = [];
      for (const t of ts) idx.push(src[t], src[t + 1], src[t + 2]);
      const g = new THREE.BufferGeometry();
      for (const [k, v] of Object.entries(j.o.geometry.attributes)) g.setAttribute(k, v);
      if (keepOnBody) g.setAttribute('position', new THREE.BufferAttribute(j.orig.slice(), 3)); // (its own: the head's are pulled in to the skull)
      g.setIndex(idx); m.geometry = g; m.userData.ownGeometry = true;
      m.material = j.o.material.clone(); m.material.map = j.map; m.material.side = THREE.DoubleSide; // (the hair as it was)
      m.frustumCulled = false; m.castShadow = true;
      for (const v of idx) { minY = Math.min(minY, j.orig[v * 3 + 1]); ctr.x += j.orig[v * 3]; ctr.y += j.orig[v * 3 + 1]; ctr.z += j.orig[v * 3 + 2]; cn3++; }
      // and out of the body
      if (keepOnBody) return;
      const keep = [], dead = new Set(ts);
      const cur = j.o.geometry.index.array;
      for (let t = 0; t < cur.length; t += 3) if (!dead.has(t)) keep.push(cur[t], cur[t + 1], cur[t + 2]); else keep.push(0, 0, 0); // (zero-area: the triangle numbering stays)
      j.o.geometry.setIndex(keep);
      j.o.material.side = THREE.DoubleSide; j.o.material.needsUpdate = true;
    });
    const holder = new THREE.Group();
    auto.object.updateMatrixWorld(true);
    auto.object.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(copy);
    const c = auto.object.localToWorld(ctr.divideScalar(Math.max(1, cn3)));
    const pivot = new THREE.Group(); pivot.position.copy(c);
    holder.position.sub(c); pivot.add(holder);
    scene.add(pivot);
    const floorY = (c.y - auto.object.localToWorld(new THREE.Vector3(0, minY, 0)).y);
    fallen.push({ pivot, vy: 0, rest: floorY * 0.45 + 0.03, tilt: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 0.08, mats: meshes.filter((m) => m.visible).map((m) => m.material) });
  };
  tris.forEach((tr, k) => { tr.t = k / Math.max(1, tris.length); for (const v of [tr.a, tr.b, tr.c]) tr.j.t[v] = Math.min(tr.j.t[v], tr.t); });
  // a copy of each texture to paint on (theirs alone: the original is shared with every copy of the model)
  for (const j of jobs) {
    j.tex = new THREE.CanvasTexture(j.canvas);
    for (const k of ['flipY', 'wrapS', 'wrapT', 'colorSpace', 'channel']) j.tex[k] = j.map[k];
    j.o.material.map = j.tex; j.o.material.needsUpdate = true;
  }
  let done = 0, last = [];
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  return {
    set(k) {
      for (const d of drops) if (!d.dropped && k >= d.at) drop(d);
      const hatGone = drops.some((d) => d.hat && d.dropped);
      const upto = Math.max(Math.floor(k * tris.length), hatGone ? hatTris : 0); // (where the hat was: bare at once)
      last = [];
      if (upto > done) {
        for (let i = done; i < upto; i++) {
          const { j, a, b, c } = tris[i], P = [a, b, c].map((v) => [j.uv.getX(v) * j.W, (j.map.flipY ? 1 - j.uv.getY(v) : j.uv.getY(v)) * j.H]);
          j.c2.fillStyle = skinCss; j.c2.strokeStyle = skinCss; j.c2.lineWidth = 3;
          j.c2.beginPath(); j.c2.moveTo(...P[0]); j.c2.lineTo(...P[1]); j.c2.lineTo(...P[2]); j.c2.closePath(); j.c2.fill(); j.c2.stroke();
          if (i % 6 === 0) last.push(new THREE.Vector3(j.pos.getX(a), j.pos.getY(a), j.pos.getZ(a)));
          j.dirty = true;
        }
        done = upto;
      }
      // the hair pulled in to the skull as it goes
      for (const j of jobs) {
        let moved = false;
        for (let i = 0; i < j.n; i++) {
          if (!j.hair[i]) continue;
          const kv = hatGone && j.hat[i] ? 1 : Math.min(1, Math.max(0, (k - j.t[i]) / 0.06));
          p.set(j.orig[i * 3], j.orig[i * 3 + 1], j.orig[i * 3 + 2]);
          d.copy(p).sub(C); const len = d.length();
          const Rr = j.hat[i] ? R * 0.84 : R; // (where a hat was: right down to the skull, brim and all)
          if (len > Rr) p.copy(C).addScaledVector(d.divideScalar(len), len + (Rr - len) * kv);
          j.pos.setXYZ(i, p.x, p.y, p.z); moved = true;
        }
        if (moved) j.pos.needsUpdate = true;
        if (j.dirty) { j.tex.needsUpdate = true; j.dirty = false; }
      }
    },
    // the clumps of long hair falling to the floor, landing in heaps
    update(dt) {
      const k = Math.min(3, dt * 60);
      for (const F of fallen) {
        if (F.pivot.position.y <= F.rest) continue;
        F.vy -= 0.006 * k; F.pivot.position.y = Math.max(F.rest, F.pivot.position.y + F.vy * k);
        F.pivot.rotation.z += F.spin * k; F.pivot.rotation.x += F.tilt * 0.03 * k;
        if (F.pivot.position.y === F.rest) F.pivot.scale.set(1.1, 0.55, 1.1); // (in a heap)
      }
    },
    hideFallen() { for (const F of fallen) F.pivot.visible = false; },
    // where hair just came off (model space): for the falling hairs
    newly: () => last.map((v) => auto.object.localToWorld(v.clone())),
    hairColor: new THREE.Color(hairRef[0] / 255, hairRef[1] / 255, hairRef[2] / 255).convertSRGBToLinear(),
    restore() {
      for (const F of fallen) { F.pivot.parent?.remove(F.pivot); for (const m of F.mats) m.dispose(); }
      for (const j of jobs) { j.o.geometry.setIndex(j.origIndex); j.o.material.side = j.origSide; }
      for (const j of jobs) { for (let i = 0; i < j.n; i++) j.pos.setXYZ(i, j.orig[i * 3], j.orig[i * 3 + 1], j.orig[i * 3 + 2]); j.pos.needsUpdate = true; j.o.material.map = j.map; j.o.material.needsUpdate = true; j.tex.dispose(); }
    },
  };
}

// ── Karina: cancer ──────────────────────────────────────────────────────────────
// Her smoke drifts over to them: they choke on it, coughing, and their hair falls out, slowly,
// patch by patch, till they're bald. Then they're lying in a hospital bed (a CANCER sign on it so
// you know), on a drip, wired to a heart monitor, its beeps slowing down... down... to nothing.
const CK = { inhale: 16, bald0: 6, bald1: 84, ward: 100 }; // (the whole thing under 5 s) // (from bald0 on: after the smoke reaches them)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class CancerFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.mats = [];
    this.mat = (o) => { const m = new THREE.MeshStandardMaterial(o); this.mats.push(m); return m; };
    this.bald = makeBald(l, ctx.scene);
    // falling hairs: thin dark strands fluttering down (not glowing particles: those can't be dark)
    const hc = this.bald.hairColor || new THREE.Color(l.def.colors?.hair || '#2a1a12');
    this.strands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.002, 0.075, 4), this.mat({ color: hc, roughness: 0.8 }), 500);
    this.strands.count = 0; this.strands.frustumCulled = false;
    ctx.scene.add(this.strands);
    this.hairs = [];
    this.hospital = this.buildWard();
    this.hospital.visible = false;
    ctx.scene.add(this.hospital);
    this.ecg = new Array(150).fill(0); this.beatAt = 0; this.bpm = 72; this.amp = 1;
  }
  buildWard() {
    const g = new THREE.Group();
    const white = this.mat({ color: '#eef1f3', roughness: 0.5 }), steel = this.mat({ color: '#c3c9cf', roughness: 0.3, metalness: 0.75 });
    const trim = this.mat({ color: '#3f8fc4', roughness: 0.5 }), vinyl = this.mat({ color: '#a9cde3', roughness: 0.45 });
    const sheet = this.mat({ color: '#fbfbf8', roughness: 0.9 }), gown = this.mat({ color: '#9cc3df', roughness: 0.95 }), dark = this.mat({ color: '#2a2d33', roughness: 0.6 });
    const box = (w, h, d, m, x, y, z, round = 0) => {
      const b = new THREE.Mesh(round ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    };
    const tube = (a, b, r, m) => { const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8), m); g.add(c); return c; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const L = 2.7; this.bedL = L; this.top = 0.78; // (the mattress's top)
    // the chassis on swivel casters, the lifting column, the platform
    box(L * 0.8, 0.1, 0.5, dark, 0, 0.16, 0);
    for (const x of [L / 2 - 0.15, -L / 2 + 0.15]) for (const z of [0.38, -0.38]) {
      tube(V(x, 0.16, z * 0.6), V(x, 0.16, z), 0.025, steel);
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), dark); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.07, z); g.add(wh);
      box(0.03, 0.1, 0.03, steel, x, 0.13, z);
    }
    for (const x of [-0.6, 0.6]) box(0.12, 0.42, 0.12, steel, x, 0.4, 0);
    box(L, 0.08, 0.95, white, 0, 0.62, 0, 0.03);
    box(L - 0.05, 0.14, 0.9, vinyl, 0, 0.71, 0, 0.05);                  // the mattress
    box(L - 0.1, 0.012, 0.92, sheet, 0, this.top + 0.004, 0);            // the sheet
    this.pillow = box(0.5, 0.14, 0.66, sheet, L / 2 - 0.34, this.top + 0.07, 0, 0.06);
    // head and foot boards: white plastic panels with a blue trim and a grab bar
    box(0.07, 0.9, 0.98, white, L / 2 + 0.03, 0.95, 0, 0.03); box(0.08, 0.06, 0.98, trim, L / 2 + 0.03, 1.38, 0, 0.02);
    box(0.07, 0.6, 0.98, white, -L / 2 - 0.03, 0.82, 0, 0.03); box(0.08, 0.06, 0.98, trim, -L / 2 - 0.03, 1.1, 0, 0.02);
    tube(V(-L / 2 - 0.1, 1.0, 0.4), V(-L / 2 - 0.1, 1.0, -0.4), 0.018, steel);
    // the side rail (the far side only, so you can see them lying there), its control panel on the foot board
    for (const z of [-0.5]) {
      for (const y of [0.98, 1.1]) tube(V(-0.1, y, z), V(L / 2 - 0.1, y, z), 0.016, steel);
      for (const x of [0, 0.5, 1.0]) tube(V(x, this.top, z), V(x, 1.1, z), 0.014, steel);
    }
    box(0.02, 0.14, 0.3, white, -L / 2 - 0.075, 0.9, -0.22);
    for (let i = 0; i < 4; i++) box(0.01, 0.04, 0.04, trim, -L / 2 - 0.087, 0.9, -0.32 + i * 0.065);
    // the chart clipped to the foot board
    box(0.02, 0.3, 0.22, this.mat({ color: '#d9c39a', roughness: 0.8 }), -L / 2 - 0.08, 0.86, 0.15);
    box(0.012, 0.24, 0.18, sheet, -L / 2 - 0.095, 0.85, 0.15);
    // the blanket over them, up to the waist (sized to them later)
    // the blanket: a sheet of cloth (shaped over their legs when they're in: drape()), its top turned down
    this.blanketMat = this.mat({ color: '#86acd0', roughness: 0.95, side: THREE.DoubleSide, map: canvasTex(64, 64, (c) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#dfe8f0';
      for (let i = 0; i < 64; i += 8) c.fillRect(i, 0, 3, 64); // (a woven stripe)
    }) });
    this.blanketMat.map.wrapS = this.blanketMat.map.wrapT = THREE.RepeatWrapping; this.blanketMat.map.repeat.set(6, 3);
    this.blanket = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 24), this.blanketMat);
    this.blanket.castShadow = true; this.blanket.receiveShadow = true; this.blanket.visible = false;
    g.add(this.blanket);
    this.fold = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 2, 24), this.mat({ color: '#fbfbf8', roughness: 0.9, side: THREE.DoubleSide }));
    this.fold.visible = false; g.add(this.fold);
    // the sign on the bed's side, facing you: CANCER with the ribbon
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshBasicMaterial({ map: canvasTex(380, 168, (c, W, H) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#d61f5a'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
      c.strokeStyle = '#ff5c9a'; c.lineWidth = 16; c.lineCap = 'round';
      c.beginPath(); c.moveTo(30, 140); c.bezierCurveTo(90, 50, 22, 18, 48, 30); c.bezierCurveTo(74, 18, 6, 50, 66, 140); c.stroke();
      c.fillStyle = '#d61f5a'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('CANCER', 226, 88, 270);
    }), toneMapped: false }));
    sign.position.set(0.75, 0.55, 0.51); g.add(sign); this.sign = sign; // (on the head half: the blanket hangs over the other)
    // the drip on its stand at the head end
    tube(V(L / 2 + 0.4, 0, 0.42), V(L / 2 + 0.4, 2.05, 0.42), 0.016, steel);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; tube(V(L / 2 + 0.4, 0.06, 0.42), V(L / 2 + 0.4 + Math.cos(a) * 0.25, 0.04, 0.42 + Math.sin(a) * 0.25), 0.012, steel); }
    tube(V(L / 2 + 0.25, 2.0, 0.42), V(L / 2 + 0.55, 2.0, 0.42), 0.01, steel);
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 6, 12), this.mat({ color: '#f2f8ff', roughness: 0.1, transparent: true, opacity: 0.75 }));
    bag.scale.z = 0.45; bag.position.set(L / 2 + 0.5, 1.78, 0.42); g.add(bag);
    this.tubeFrom = new THREE.Vector3(L / 2 + 0.5, 1.56, 0.42);
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), this.mat({ color: '#e8f0f4', roughness: 0.3, transparent: true, opacity: 0.85 }));
    g.add(this.tube);
    // the heart monitor on its stand behind the bed head, its screen to you
    tube(V(L / 2 + 0.75, 0, -0.25), V(L / 2 + 0.75, 1.0, -0.25), 0.022, steel);
    const mon = box(0.9, 0.64, 0.2, dark, L / 2 + 0.75, 1.35, -0.2, 0.03); // (beside the bed head, low enough to be seen under the health bars)
    mon.rotation.y = -0.2;
    this.screen = document.createElement('canvas'); this.screen.width = 256; this.screen.height = 180;
    this.screenTex = new THREE.CanvasTexture(this.screen); this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.56), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    scr.position.set(0, 0, 0.101); mon.add(scr); this.scr = scr;
    // and the hospital curtain hanging behind on its rail
    const cur = new THREE.PlaneGeometry(L + 1.6, 2.3, 48, 1), cp = cur.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 9) * 0.06);
    cur.computeVertexNormals();
    const curtain = new THREE.Mesh(cur, this.mat({ color: '#9ed0c4', roughness: 0.9, side: THREE.DoubleSide }));
    curtain.position.set(0.1, 1.27, -0.95); g.add(curtain);
    tube(V(-L / 2 - 0.75, 2.45, -0.95), V(L / 2 + 0.95, 2.45, -0.95), 0.02, steel);
    return g;
  }
  // shape the blanket over the bed from x0 to x1 (bed space): over their legs in the middle, hanging
  // down over both sides of the mattress, a few soft wrinkles; the sheet turned down over its top
  drape(x0, x1) {
    const top = this.top + 0.01, half = 0.47, W = 0.8;
    const shape = (geo, u0, u1, lift = 0) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const uv = geo.attributes.uv, u = uv.getX(i), v = uv.getY(i) - 0.5; // (u along the bed, v across: -0.5..0.5; from the uvs, so it can be reshaped)
        const x = x0 + (x1 - x0) * (u0 + (u1 - u0) * u), zz = v * 2 * W;
        const legs = 0.2 + (0.22 + 0.3 * Math.exp(-(((x - x0 - 0.22) / 0.22) ** 2))) * Math.exp(-((zz / 0.32) ** 2)); // (over their legs, a tent over their feet)
        const wr = 0.012 * Math.sin(x * 11 + zz * 4) + 0.008 * Math.sin(x * 23 - zz * 9);
        let y, z;
        if (Math.abs(zz) < half) { y = top + legs + wr + lift; z = zz; }
        else { const over = Math.min(0.2, Math.abs(zz) - half); y = top + 0.12 + lift - over * 1.4 + wr * 0.5; z = Math.sign(zz) * (half + 0.025 + over * 0.08); } // (hanging down the side)
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    };
    shape(this.blanket.geometry, 0, 1);
    shape(this.fold.geometry, 1 - 0.07, 1, 0.012);
    this.blanket.visible = this.fold.visible = true;
  }
  smoked() { this.smokedAt = this.u; this.ctx.sfx.cough?.(); }
  step(u) {
    this.u = u;
    const { w, l, ctx } = this;
    // she draws on her cigarette, then blows the smoke at them (slowly drifting over)
    if (u < CK.inhale) w.poseOverride = { anim: 'smoke', phase: 'startup', pt: u / CK.inhale };
    else if (u < CK.inhale + 14) w.poseOverride = { anim: 'smoke', phase: 'active', pt: 1 };
    else w.poseOverride = null;
    if (u === CK.inhale) this.fx = new Smoke(w, {}, { ...ctx, fatality: true, slow: 0.2, onSmoked: () => this.smoked() });
    if (this.fx && !this.fx.dead) this.fx.tick();
    if (this.smokedAt === undefined) return null;
    const v = u - this.smokedAt;
    this.v = v;
    l.dizzy = 0;
    if (v < CK.ward) { // choking on it while their hair falls out
      l.poseOverride = { anim: v % 90 < 50 ? 'cough' : 'dazed', phase: 'active', pt: 1 };
      if (v % 30 === 0) ctx.sfx.cough?.();
      if (v % 5 === 0) ctx.particles.burst(l.pos.x, l.pos.y + 1.8, 0.3, { count: 2, color: '#b8b8bc', speed: 0.025, gravity: -0.002, life: 40 });
    }
    if (v === CK.ward) { ctx.whiteFlash?.(500); this.hospital.visible = true; this.placed = false; this.bald.hideFallen?.(); }
    if (v >= CK.ward) l.poseOverride = { anim: 'bedRest', phase: 'active', pt: 1 };
    // the heart monitor: 72, then dropping in jumps (49, 23), weaker each time, to nothing
    const m = v - CK.ward;
    if (m >= 0 && this.flat === undefined) {
      const LV = [[72, 2, 20], [49, 2, 24], [23, 1, 30]]; // (about 2 s from 72 to flat) // (bpm shown, beats, frames between them)
      this.lv ??= 0; this.beats ??= 0;
      const [bpm, n, gap] = LV[this.lv] || [0, 0, 0];
      this.bpm = bpm; this.amp = [1, 0.7, 0.42][this.lv] ?? 0.3;
      if (!bpm) { this.flat = m; ctx.sfx.flatline?.(); ctx.shake(0.1); }
      else if (m - this.beatAt >= gap || m === 0) {
        this.beatAt = m; this.beat = 0; ctx.sfx.beep?.();
        if (++this.beats >= n) { this.lv++; this.beats = 0; }
      }
    }
    if (this.flat !== undefined && m === this.flat + 20) return 'fatality';
    if (this.flat !== undefined && m >= this.flat + 150) return 'done';
    return null;
  }
  render(dt, time) {
    const { l, ctx } = this, v = this.v ?? -1;
    if (this.fx && !this.fx.dead) this.fx.render(time);
    // going bald, patch by patch, the hairs drifting down
    if (v >= 0) {
      const k = Math.min(1, Math.max(0, (v - CK.bald0) / (CK.bald1 - CK.bald0)));
      this.bald.set(k * k * (3 - 2 * k));
      this.bald.update?.(dt);
      for (const p of this.bald.newly()) for (let i = 0; i < 3 && this.hairs.length < 500; i++) {
        this.hairs.push({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.05, 0.08 + Math.random() * 0.1)),
          v: new THREE.Vector3((Math.random() - 0.5) * 0.004, 0.004, (Math.random() - 0.2) * 0.004), r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3), s: 0.6 + Math.random() * 0.9, ph: Math.random() * 6 });
      }
    }
    this.fallHairs(dt, time);
    if (v < CK.ward) return;
    const o = l.body?.object;
    if (!o) return;
    // lying in the bed: the bed put under them, their head on the pillow, the blanket over their legs
    // straight along the bed (they normally stand turned a little toward you: lying back, that'd
    // put their head behind the curtain), and their head away from her, so she's not standing in
    // front of the monitor (it's at the head end)
    if (l.body.turn) {
      if (this.turnY === undefined) {
        const wp = (b) => b?.getWorldPosition(new THREE.Vector3());
        l.body.turn.rotation.y = Math.PI / 2; o.updateMatrixWorld(true);
        const B = l.body.auto?.bones, h = wp(B?.head || l.body.head), ft = wp(B?.lFoot || l.body.lLeg?.knee);
        const towardHer = h && ft && Math.sign(h.x - ft.x) === Math.sign(this.w.pos.x - l.pos.x);
        this.turnY = towardHer ? -Math.PI / 2 : Math.PI / 2;
      }
      l.body.turn.rotation.y = this.turnY; o.updateMatrixWorld(true);
    }
    if (v - CK.ward < 30) { // (placed from where their head and feet are, as they settle into lying down)
      o.position.y = l.pos.y;
      o.updateMatrixWorld(true);
      const B = l.body.auto?.bones, wp = (b) => b?.getWorldPosition(new THREE.Vector3());
      const head = wp(B?.head || l.body.head), feet = wp(B?.lFoot || l.body.lLeg?.knee) ?? new THREE.Vector3(l.pos.x, 0, 0);
      const c = head ? head.clone().lerp(feet, 0.5) : new THREE.Vector3(l.pos.x, 0, 0);
      const headRight = head ? head.x > c.x : true;
      this.lift = this.top + 0.12; // (lying on the floor: lifted onto the mattress)
      const len = head ? Math.abs(head.x - feet.x) + 0.35 : 2.2, s = Math.max(1, (len + 0.5) / this.bedL);
      // the bed's head end under their head
      const hx = head ? head.x + (headRight ? 0.32 : -0.32) : c.x + this.bedL / 2;
      this.hospital.position.set(hx - (headRight ? 1 : -1) * this.bedL * s / 2, 0, 0.05);
      this.hospital.scale.set(s * (headRight ? 1 : -1), 1, 1);
      this.sign.scale.x = this.scr.scale.x = headRight ? 1 : -1; // (the writing and the monitor's numbers turned back round)
      // the blanket: from their feet up to the waist, over their legs
      this.drape(-this.bedL / 2 + 0.04, -this.bedL / 2 + this.bedL * 0.66);
      this.arm = l.body.auto?.bones?.lHand || l.body.lArm?.el;
      this.placed = true;
    }
    o.position.y = l.pos.y + this.lift;
    if (this.arm) { // the drip's tube, down to their arm
      this.hospital.updateMatrixWorld(true);
      const a = this.hospital.localToWorld(this.tubeFrom.clone()), b = this.arm.getWorldPosition(new THREE.Vector3());
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.3;
      const inv = new THREE.Matrix4().copy(this.hospital.matrixWorld).invert();
      this.tube.geometry.dispose();
      this.tube.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(...[a, mid, b].map((p) => p.applyMatrix4(inv))), 16, 0.008, 5, false);
    }
    this.drawScreen(dt, time);
  }
  fallHairs(dt, time) {
    const k = Math.min(3, dt * 60), m = new THREE.Matrix4(), q = new THREE.Quaternion(), S = new THREE.Vector3();
    const gone = this.hospital.visible; // (in the ward they're swept away)
    this.hairs.forEach((h, i) => {
      if (h.p.y > 0.01) { // drifting down, swaying
        h.v.y -= 0.0016 * k; h.v.y = Math.max(h.v.y, -0.04);
        h.p.addScaledVector(h.v, k); h.p.x += Math.sin(time * 4 + h.ph) * 0.002 * k;
        h.r.x += 0.05 * k; h.r.z += 0.04 * k;
        if (h.p.y <= 0.01) { h.p.y = 0.01; h.r.set(Math.PI / 2, h.r.y, 0); }
      }
      q.setFromEuler(h.r); S.setScalar(gone ? 0 : h.s);
      this.strands.setMatrixAt(i, m.compose(h.p, q, S));
    });
    this.strands.count = this.hairs.length;
    this.strands.instanceMatrix.needsUpdate = true;
  }
  // the monitor: the green trace running across, a spike for every beat (weaker and weaker); then flat, red
  drawScreen(dt, time) {
    const c = this.screen.getContext('2d'), W = this.screen.width, H = this.screen.height;
    const flat = this.flat !== undefined;
    const SPIKE = [0, -0.08, 0.95, -0.45, 0, 0.12, 0.18, 0.08, 0];
    const steps = Math.max(1, Math.round(dt * 90));
    for (let i = 0; i < steps; i++) {
      let y = 0;
      if (!flat && this.beat !== undefined && this.beat < SPIKE.length) y = SPIKE[this.beat++] * this.amp;
      this.ecg.push(y + (flat ? 0 : (Math.random() - 0.5) * 0.02)); this.ecg.shift();
    }
    c.fillStyle = '#05100a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(40,90,60,.35)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    const col = flat ? '#ff3b3b' : this.bpm < 40 ? '#ffd23f' : '#39ff7a';
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
    this.ecg.forEach((y, i) => { const X = (i / (this.ecg.length - 1)) * W, Y = 105 - y * 70; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.stroke();
    c.fillStyle = col; c.font = 'bold 34px sans-serif'; c.textAlign = 'left';
    c.fillText(`♥ ${this.bpm}`, 12, 38);
    if (flat && Math.sin(time * 8) > 0) { c.font = 'bold 22px sans-serif'; c.textAlign = 'right'; c.fillText('ALARM', W - 12, 34); }
    this.screenTex.needsUpdate = true;
  }
  cam() {
    const v = this.v ?? -1, l = this.l;
    if (v < 0) return null;
    if (v < CK.ward) { // close on their head, to watch the hair go
      const hy = (l.body?.auto?.landmarks?.H ?? 2.2) - 0.3;
      return { x: l.pos.x, y: hy, side: 0.5, up: 0.25, z: 3.0 };
    }
    return { x: this.hospital.position.x + (this.hospital.scale.x > 0 ? 0.35 : -0.35), y: 0.95, side: -0.2, up: 1.6, z: 4.6 }; // (looking down on them in the bed, the drip, the monitor)
  }
  dispose() {
    if (this.fx && !this.fx.dead) this.fx.finish();
    this.bald.restore();
    this.ctx.scene.remove(this.strands); this.strands.geometry.dispose();
    this.ctx.scene.remove(this.hospital);
    this.hospital.traverse((o) => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); if (o.material?.isMeshBasicMaterial) o.material.dispose(); });
    for (const m of this.mats) m.dispose();
    this.screenTex.dispose(); this.blanketMat.map.dispose();
    const o = this.l.body?.object; if (o) o.position.y = this.l.pos.y;
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// ── Haim: burnt to ashes ────────────────────────────────────────────────────────
// He calls in the satellite (his special), and it doesn't stop: bolt after bolt, they jolt with
// every hit, scorched blacker and blacker, smoking, embers glowing in them, until there's nothing
// left but ash: they crumble down into a grey heap, flakes drifting.
export class AshFatality {
  constructor(ctx, w, l) {
    Object.assign(this, { ctx, w, l });
    this.fx = new Satellite(w, {}, { ...ctx, fatality: true, flash() {}, camera() {}, onShot: (i, last) => this.shot(i, last) });
    this.n = this.fx.S.shots; this.hits = 0; this.burn = 0;
    this.base = (l.body?.materials || []).map((m) => ({ m, c: m.color?.clone(), e: m.emissive?.clone(), env: m.envMapIntensity }));
    // the heap of ash, and flakes
    this.ashMat = new THREE.MeshStandardMaterial({ color: '#6b6560', roughness: 1 });
    this.heap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.32, 24, 4), this.ashMat);
    const hp = this.heap.geometry.attributes.position; // (lumpy)
    for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); if (y < 0.15) { const k = 1 + (Math.sin(i * 12.9) * 0.5) * 0.18; hp.setX(i, hp.getX(i) * k); hp.setZ(i, hp.getZ(i) * k); } }
    this.heap.geometry.computeVertexNormals();
    this.heap.visible = false; this.heap.castShadow = this.heap.receiveShadow = true;
    ctx.scene.add(this.heap);
    this.flakes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.035, 0.035), new THREE.MeshStandardMaterial({ color: '#7a746d', roughness: 1, side: THREE.DoubleSide }), 260);
    this.flakes.count = 0; this.flakes.frustumCulled = false; ctx.scene.add(this.flakes);
    this.fl = [];
  }
  shot(i, last) {
    const { l, ctx } = this;
    this.hits++; this.burn = Math.min(1, this.hits / this.n); this.jolt = 1;
    ctx.particles.burst(l.pos.x, l.pos.y + 1.1, 0.3, { count: 10, color: '#ff8a2a', speed: 0.1, gravity: 0.004, life: 18 });
    if (last) { this.crumbleAt = this.u + 12; ctx.whiteFlash?.(200); }
  }
  step(u) {
    this.u = u;
    const { w, l, ctx } = this;
    if (!this.fx.dead) this.fx.tick();
    l.dizzy = 0;
    if (this.hits && this.crumbleAt === undefined) l.poseOverride = { anim: u % 8 < 4 ? 'hit' : 'blockHit', phase: 'active', pt: 0 };
    if (this.hits && u % 3 === 0 && this.crumbleAt === undefined) // smoking
      ctx.particles.burst(l.pos.x + (Math.random() - 0.5) * 0.4, l.pos.y + 0.6 + Math.random() * 1.4, 0.2, { count: 2, color: '#4a4440', speed: 0.02, gravity: -0.003, life: 40 });
    if (this.crumbleAt !== undefined) {
      const v = u - this.crumbleAt;
      if (v === 0) { ctx.sfx.thud?.(); this.heap.position.set(l.pos.x, 0, 0.1); this.heap.visible = true; }
      if (v === 36) { l.exploded = true; ctx.shake(0.2); }
      if (v === 46) return 'fatality';
      if (v >= 170) return 'done';
    }
    void w;
    return null;
  }
  render(dt, time) {
    const { l } = this, k = Math.min(3, dt * 60);
    if (!this.fx.dead) this.fx.render(time);
    // scorched: darker with every hit, embers flickering, then grey ash
    const v = this.crumbleAt !== undefined ? this.u - this.crumbleAt : -1;
    const ash = v < 0 ? 0 : Math.min(1, v / 10);
    this.jolt = (this.jolt || 0) * 0.85;
    const ashC = new THREE.Color('#5d5853');
    for (const { m, c, e } of this.base) {
      if (c) m.color.copy(c).multiplyScalar(1 - 0.97 * this.burn).lerp(ashC, ash); // (charred black)
      if (m.envMapIntensity !== undefined) m.envMapIntensity = (this.base.find((b) => b.m === m).env ?? 1) * (1 - 0.85 * this.burn * (1 - ash)); // (no sheen on charcoal)
      if (e) m.emissive.setRGB(1, 0.3, 0.04).multiplyScalar(this.jolt * 0.06 * (1 - ash)); // (a flare as each bolt hits; the embers are sparks)
    }
    const o = l.body?.object;
    if (o && v >= 0) { // crumbling: sinking down into the heap
      const c = Math.min(1, Math.max(0, (v - 6) / 30));
      o.scale.set(1 + 0.25 * c, Math.max(0.02, 1 - c), 1 + 0.25 * c);
      if (c > 0 && c < 1) for (let i = 0; i < 4 && this.fl.length < 260; i++)
        this.fl.push({ p: new THREE.Vector3(l.pos.x + (Math.random() - 0.5) * 0.6, 0.2 + (1 - c) * 1.8 * Math.random(), 0.1 + (Math.random() - 0.5) * 0.4), vy: 0, r: Math.random() * 6 });
      const hk = Math.min(1, v / 36);
      this.heap.scale.set(0.4 + 0.6 * hk, 0.2 + 0.8 * hk, 0.4 + 0.6 * hk);
      this.heap.position.y = 0.16 * this.heap.scale.y - 0.04;
    } else if (o && this.jolt > 0.05) o.position.x = l.pos.x + (Math.random() - 0.5) * 0.08 * this.jolt;
    // the flakes falling, drifting
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
    this.fl.forEach((f, i) => {
      if (f.p.y > 0.02) { f.vy = Math.max(-0.02, f.vy - 0.0008 * k); f.p.y += f.vy * k; f.p.x += Math.sin(time * 3 + f.r) * 0.003 * k; f.r += 0.1 * k; }
      q.setFromEuler(new THREE.Euler(f.r, f.r * 0.7, 0));
      this.flakes.setMatrixAt(i, M.compose(f.p, q, S1));
    });
    this.flakes.count = this.fl.length; this.flakes.instanceMatrix.needsUpdate = true;
  }
  cam() {
    const l = this.l;
    if (!this.hits) return null;
    return { x: l.pos.x, y: 1.0, side: 0.5, up: 0.4, z: 4.6 };
  }
  dispose() {
    if (!this.fx.dead) this.fx.finish();
    for (const { m, c, e, env } of this.base) { if (c) m.color.copy(c); if (e) m.emissive.copy(e); if (env !== undefined) m.envMapIntensity = env; }
    const o = this.l.body?.object; if (o) o.scale.set(1, 1, 1);
    for (const x of [this.heap, this.flakes]) { this.ctx.scene.remove(x); x.geometry.dispose(); x.material.dispose(); }
    this.ashMat.dispose();
    this.w.poseOverride = null; this.l.poseOverride = null;
  }
}

// how close the winner walks up before it starts (the standard grab needs them next to each other)
ElectroFatality.reach = 6; // (his cables' range)
TigerFatality.reach = 99; // (the tiger runs to them)
StompFatality.reach = 99; // (the foot comes down on them)
BonesFatality.reach = 99; // (his bones fly to them)
BlastFatality.reach = 99; // (Hoshech Mavet goes to them)
SwallowFatality.reach = 99; // (the crack runs to them)
SelfPunchFatality.reach = 99; // (the computer's thrown)
CancerFatality.reach = 99; // (her smoke drifts to them)
AshFatality.reach = 99; // (the satellite)
export const FATALITIES = { lasso: ElectroFatality, tiger: TigerFatality, foot: StompFatality, shatter: BonesFatality, darkness: BlastFatality, quake: SwallowFatality, computer: SelfPunchFatality, smoke: CancerFatality, satellite: AshFatality };
