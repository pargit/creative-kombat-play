// Two kinds of fighter bodies with the same interface:
//   ToyRig  – a big-head figure built from primitives, animated by code (optionally with a face photo)
//   ModelRig – a GLB/FBX model (Tripo, Hunyuan3D, Meshy, Mixamo…) animated by its own clips
//
// Interface: rig.object, rig.ready (Promise), rig.setFacing(dir), rig.update(dt, anim, ctx),
//            rig.flash(), rig.setOpacity(a), rig.dispose()

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { JOINTS, GUARD, STRIKES, pose } from './poses.js';
import { buildAutoRig } from './autorig.js';
import { addRim } from './look.js';
import { modelUrl } from './quality.js';

const FACE_TURN = 0.38; // how far fighters turn toward the camera (radians)
const MODEL_FACE_TURN = 0.75; // 3D-scanned friends: closer to a 3/4 view so faces read well

let toonRamp;
function toonMaterial(color) {
  if (!toonRamp) {
    const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
}

function facingAngle(dir, turn = FACE_TURN) {
  return dir > 0 ? Math.PI / 2 - turn : -(Math.PI / 2 - turn);
}

// Real heights: `heightCm: 182` in the roster. 175 cm is the average fighter; it overrides build.height.
export const heightOf = (def) => (def.heightCm ? def.heightCm / 175 : def.build?.height ?? 1);

const damp = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);
const lerp = (a, b, k) => a + (b - a) * k;

// ── Face photo → round, soft-edged texture ──────────────────────────────────
const faceCache = new Map();
export function loadFaceTexture(url) {
  if (!faceCache.has(url)) {
    faceCache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 512;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const s = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        // feather the edge so the photo blends into the head
        g.globalCompositeOperation = 'destination-in';
        const grad = g.createRadialGradient(size / 2, size / 2, size * 0.34, size / 2, size / 2, size * 0.5);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return faceCache.get(url);
}

// ── Toy rig ──────────────────────────────────────────────────────────────────
export class ToyRig {
  constructor(def) {
    this.def = def;
    this.object = new THREE.Group();
    this.facing = 1;
    this.cur = { ...GUARD };
    this.materials = [];
    this.flashT = 0;
    this.build();
    this.ready = def.face ? this.applyFace(def.face) : Promise.resolve();
  }

  mat(color) {
    const m = toonMaterial(color);
    this.materials.push(m);
    return m;
  }

  mesh(geo, color, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  build() {
    const { colors: c, build: b } = this.def;
    const h = heightOf(this.def), w = b.width, hs = b.head;
    const limbR = 0.085 * Math.sqrt(w);
    this.turn = new THREE.Group();
    this.object.add(this.turn);
    this.body = new THREE.Group(); // tilts for knockdowns (pivot at the feet)
    this.turn.add(this.body);

    const thigh = 0.46 * h, shin = 0.44 * h;
    this.hipY = thigh + shin + 0.08;
    this.hips = new THREE.Group();
    this.hips.position.y = this.hipY;
    this.body.add(this.hips);
    this.mesh(new THREE.SphereGeometry(0.2 * w, 16, 12), c.pants, this.hips).scale.set(1.2, 0.7, 0.8);

    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.13 * w, 0, 0);
      this.hips.add(hip);
      this.mesh(new THREE.CapsuleGeometry(limbR * 1.25, thigh - limbR * 2, 4, 10), c.pants, hip, 0, -thigh / 2, 0);
      const knee = new THREE.Group();
      knee.position.y = -thigh;
      hip.add(knee);
      this.mesh(new THREE.CapsuleGeometry(limbR * 1.1, shin - limbR * 2, 4, 10), c.pants, knee, 0, -shin / 2, 0);
      this.mesh(new THREE.BoxGeometry(0.17 * w, 0.1, 0.3), c.shoes, knee, 0, -shin - 0.02, 0.06);
      return { hip, knee };
    };
    this.lLeg = leg(1);
    this.rLeg = leg(-1);

    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const torsoH = 0.62 * h;
    const torso = this.mesh(new THREE.CapsuleGeometry(0.25 * w, torsoH - 0.4 * w, 6, 14), c.shirt, this.spine, 0, torsoH / 2, 0);
    torso.scale.z = 0.72;
    if (c.tie) this.mesh(new THREE.BoxGeometry(0.07, 0.34, 0.03), c.tie, this.spine, 0, torsoH * 0.6, 0.19 * w);

    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * (0.27 * w + limbR), torsoH - 0.1, 0);
      this.spine.add(sh);
      const upper = 0.32 * h, fore = 0.3 * h;
      this.mesh(new THREE.SphereGeometry(limbR * 1.5, 12, 10), c.shirt, sh);
      this.mesh(new THREE.CapsuleGeometry(limbR * 1.1, upper - limbR * 2, 4, 10), c.shirt, sh, 0, -upper / 2, 0);
      const el = new THREE.Group();
      el.position.y = -upper;
      sh.add(el);
      this.mesh(new THREE.CapsuleGeometry(limbR, fore - limbR * 2, 4, 10), c.skin, el, 0, -fore / 2, 0);
      this.mesh(new THREE.SphereGeometry(limbR * 1.55, 12, 10), c.skin, el, 0, -fore, 0);
      return { sh, el };
    };
    this.lArm = arm(1);
    this.rArm = arm(-1);

    // Head: deliberately oversized, caricature style
    const r = 0.36 * hs;
    this.headR = r;
    this.neck = new THREE.Group();
    this.neck.position.y = torsoH - 0.02;
    this.spine.add(this.neck);
    this.mesh(new THREE.CylinderGeometry(0.08 * w, 0.1 * w, 0.14, 10), c.skin, this.neck, 0, 0.05, 0);
    this.head = new THREE.Group();
    this.head.position.y = r * 0.95;
    this.neck.add(this.head);
    const skull = this.mesh(new THREE.SphereGeometry(r, 32, 24), c.skin, this.head);
    skull.scale.set(0.95, 1.05, 0.95);
    this.hair = this.mesh(new THREE.SphereGeometry(r * 1.04, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), c.hair, this.head);
    this.hair.rotation.x = -0.25;

    this.faceParts = new THREE.Group();
    this.head.add(this.faceParts);
    const white = '#ffffff', dark = '#1a1412';
    for (const s of [1, -1]) {
      this.mesh(new THREE.SphereGeometry(r * 0.2, 14, 10), white, this.faceParts, s * r * 0.33, r * 0.12, r * 0.78);
      this.mesh(new THREE.SphereGeometry(r * 0.1, 10, 8), dark, this.faceParts, s * r * 0.3, r * 0.1, r * 0.95);
      const brow = this.mesh(new THREE.BoxGeometry(r * 0.38, r * 0.08, r * 0.08), c.hair, this.faceParts, s * r * 0.33, r * 0.4, r * 0.86);
      brow.rotation.z = s * 0.32; // angry brows
    }
    this.mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), c.skin, this.faceParts, 0, -r * 0.08, r * 0.97);
    const mouth = this.mesh(new THREE.CapsuleGeometry(r * 0.07, r * 0.3, 4, 8), dark, this.faceParts, 0, -r * 0.42, r * 0.86);
    mouth.rotation.z = Math.PI / 2;
    mouth.scale.set(1, 1, 0.6);
    if (this.def.dummy) this.dummyDetails(r, torsoH, w);

    this.setFacing(1);
  }

  // practice dummy: a sack head with stitched X eyes and a stitched mouth, a target on the
  // chest, rope ties at the waist, wrists and neck, and patches
  dummyDetails(r, torsoH, w) {
    this.faceParts.visible = false;
    this.hair.visible = false;
    const stitch = '#4a3020', rope = '#8a6a3a';
    const face = new THREE.Group();
    this.head.add(face);
    for (const s of [1, -1]) {
      for (const a of [0.75, -0.75]) {
        const x = this.mesh(new THREE.BoxGeometry(r * 0.34, r * 0.06, r * 0.06), stitch, face, s * r * 0.33, r * 0.12, r * 0.9);
        x.rotation.z = a;
      }
    }
    const mouth = this.mesh(new THREE.BoxGeometry(r * 0.62, r * 0.045, r * 0.05), stitch, face, 0, -r * 0.38, r * 0.9);
    mouth.rotation.x = -0.35;
    for (let i = -2; i <= 2; i++) {
      const st = this.mesh(new THREE.BoxGeometry(r * 0.04, r * 0.16, r * 0.05), stitch, face, i * r * 0.14, -r * 0.38, r * 0.91);
      st.rotation.x = -0.35;
    }
    // the tied-off top of the sack
    const knot = this.mesh(new THREE.ConeGeometry(r * 0.22, r * 0.4, 10), this.def.colors.skin, this.head, 0, r * 1.1, 0);
    knot.rotation.z = 0.2;
    this.mesh(new THREE.TorusGeometry(r * 0.12, r * 0.04, 6, 14), rope, this.head, 0, r * 0.98, 0).rotation.x = Math.PI / 2;
    // target on the chest
    const front = 0.25 * w * 0.72 + 0.005;
    [['#d62828', 0.17], ['#f4efe6', 0.13], ['#d62828', 0.09], ['#f4efe6', 0.05]].forEach(([c, rad], i) => {
      const ring = this.mesh(new THREE.CircleGeometry(rad * w, 28), c, this.spine, 0, torsoH * 0.58, front + i * 0.004);
      ring.castShadow = false;
    });
    // rope ties and a couple of patches
    this.mesh(new THREE.TorusGeometry(0.25 * w, 0.025, 6, 24), rope, this.spine, 0, 0.08, 0).rotation.x = Math.PI / 2;
    this.mesh(new THREE.TorusGeometry(0.1 * w, 0.02, 6, 16), rope, this.neck, 0, 0.04, 0).rotation.x = Math.PI / 2;
    for (const a of [this.lArm, this.rArm]) this.mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 14), rope, a.el, 0, -0.3 * heightOf(this.def) + 0.08, 0).rotation.x = Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), '#9c7a48', this.spine, -0.13 * w, torsoH * 0.25, front - 0.01).rotation.z = 0.3;
    this.mesh(new THREE.BoxGeometry(0.12, 0.1, 0.02), '#a8844e', this.lLeg.knee, 0.0, -0.12, 0.1).rotation.z = -0.2;
  }

  async applyFace(url) {
    const tex = await loadFaceTexture(url);
    if (!tex) return;
    const r = this.headR;
    const geo = new THREE.SphereGeometry(r * 1.01, 32, 24, Math.PI / 2 - 1.05, 2.1, 0.32, 2.2);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const face = new THREE.Mesh(geo, m);
    face.scale.set(0.95, 1.05, 0.95);
    // phi = π/2 is the +z (front) side of a SphereGeometry, so this segment already faces forward
    this.head.add(face);
    this.faceParts.visible = false;
    this.hair.rotation.x = -0.75;
  }

  setFacing(dir) {
    this.facing = dir;
    this.turn.rotation.y = facingAngle(dir);
  }

  flash() { this.flashT = 1; }

  setOpacity(a) {
    for (const m of this.materials) { m.transparent = a < 1; m.opacity = a; }
    this.object.visible = a > 0.02;
  }

  update(dt, anim, ctx = {}) {
    const target = pose(anim, ctx.t ?? 0, ctx);
    const fast = anim === 'hit' || anim === 'blockHit' || STRIKES.includes(anim);
    const k = damp(fast ? 0.5 : 0.22, dt);
    const cur = this.cur;
    for (const j of JOINTS) cur[j] = lerp(cur[j], target[j], j === 'rootTilt' || j === 'spin' || (j === 'spineY' && anim === 'teleport') ? 1 : k);

    // yaw is mirrored for the right-hand fighter so both show their face to the camera equally
    this.spine.rotation.set(cur.spineX, cur.spineY * this.facing, 0);
    this.neck.rotation.set(cur.neckX, cur.neckY * this.facing, 0);
    this.lArm.sh.rotation.set(cur.lShX, 0, cur.lShZ);
    this.lArm.el.rotation.x = cur.lEl;
    this.rArm.sh.rotation.set(cur.rShX, 0, cur.rShZ);
    this.rArm.el.rotation.x = cur.rEl;
    this.lLeg.hip.rotation.set(cur.lHipX, 0, cur.lHipZ);
    this.lLeg.knee.rotation.x = cur.lKnee;
    this.rLeg.hip.rotation.set(cur.rHipX, 0, cur.rHipZ);
    this.rLeg.knee.rotation.x = cur.rKnee;
    // keep feet planted when knees bend
    const bend = (Math.min(cur.lKnee, cur.rKnee) - 0.45) * 0.12;
    this.hips.position.y = this.hipY + cur.hipsY - Math.max(0, bend);
    this.body.rotation.set(cur.rootTilt, cur.spin, 0);
    this.body.position.y = cur.rootLift;
    this.body.position.z = cur.lunge * heightOf(this.def);

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      for (const m of this.materials) m.emissive?.setScalar(this.flashT * 0.8);
    }
  }

  dispose() {
    this.object.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

// ── Model rig (GLB / FBX with animation clips) ──────────────────────────────
const modelCache = new Map();
// (`type`: 'fbx' / 'glb', for a model given as a blob: URL with no file name: an uploaded one)
export function loadModelFile(url, type) {
  if (!modelCache.has(url)) {
    const loader = type === 'fbx' || /\.fbx$/i.test(url) ? new FBXLoader() : new GLTFLoader();
    // HIGH quality: the HD file, falling back to the normal one if it won't load
    const hd = modelUrl(url);
    const file = hd === url ? loader.loadAsync(url) : loader.loadAsync(hd).catch(() => loader.loadAsync(url));
    modelCache.set(url, file.then((res) => ({
      scene: res.scene || res,
      animations: res.animations || [],
    })));
  }
  return modelCache.get(url);
}

// An animated model (e.g. Linoy's tiger in her fatality): its own copy with a skeleton, the clips by
// name and a mixer to play them. `height` metres tall, feet on y = 0, centred on x / z.
// start loading a model file now (so an effect that needs it later doesn't wait)
export function preloadModel(url) { loadModelFile(url).catch(() => {}); }

// `poseClip`: measure the height in that animation's first frame (some files are much bigger
// animated than in their rest pose)
export async function loadAnimated(url, height, poseClip = null) {
  const base = await loadModelFile(url);
  const model = SkeletonUtils.clone(base.scene);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.transparent = false; o.material.depthWrite = true; } });
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.add(model); holder.add(inner);
  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(base.animations.map((a) => [a.name, a]));
  const posed = poseClip && clips[poseClip] ? mixer.clipAction(clips[poseClip]).play() : null;
  if (posed) mixer.setTime(0);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, !!posed), s = height / ((box.max.y - box.min.y) || 1);
  if (posed) { posed.stop(); mixer.setTime(0); }
  inner.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  return { object: holder, inner, mixer, clips, size: box.getSize(new THREE.Vector3()).multiplyScalar(s) };
}

// A prop model (e.g. Minibar's dragon), `height` metres tall, centred on its middle, with its own
// materials (so an effect can make it glow and fade) and normals worked out if the file has none.
export async function loadProp(url, height, type) {
  const base = await loadModelFile(url, type);
  const src = SkeletonUtils.clone(base.scene); // (not scene.clone: a rigged model would keep using the original bones and tear into spikes)
  src.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.attributes.normal) { o.geometry = o.geometry.clone(); o.geometry.computeVertexNormals(); }
    o.material = o.material.clone();
    o.frustumCulled = false;
  });
  // a rigged model is drawn by its bones, not by its raw geometry: measure the posed vertices (the plain box is wrong, often by a lot)
  let skinned = false;
  src.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  // its own animations (run, attack...) are kept for the special to play; it is measured in its run pose when it has one (a lying tiger would come out huge)
  const clips = Object.fromEntries((base.animations || []).map((a) => [a.name, a]));
  const mixer = skinned && base.animations?.length ? new THREE.AnimationMixer(src) : null;
  const runName = Object.keys(clips).find((n) => /^run|gallop|sprint/i.test(n)) || Object.keys(clips).find((n) => /run/i.test(n));
  if (mixer && runName) { mixer.clipAction(clips[runName]).play(); mixer.setTime(0); }
  src.updateMatrixWorld(true);
  src.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const box = new THREE.Box3().setFromObject(src, skinned), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  if (mixer) { mixer.stopAllAction(); mixer.setTime(0); }
  src.position.sub(c);
  const holder = new THREE.Group();
  holder.add(src);
  holder.scale.setScalar(height / (size.y || 1));
  const wrap = new THREE.Group();
  wrap.add(holder);
  if (mixer) wrap.userData.anim = { mixer, clips }; // (a rigged model: its own animation clips)
  return wrap;
}

const CLIP_GUESSES = {
  idle: [/idle/i, /stance/i, /breath/i, /stand/i],
  walk: [/walk/i, /strafe/i, /run/i],
  jump: [/jump/i],
  punch: [/punch/i, /jab/i, /hook/i, /attack/i, /hit_?\d/i],
  kick: [/kick/i],
  block: [/block/i, /guard/i, /defend/i],
  hit: [/hit/i, /react/i, /damage/i, /hurt/i],
  ko: [/death/i, /dying/i, /die/i, /knock/i, /\bko\b/i, /fall/i],
  win: [/victory/i, /win/i, /cheer/i, /dance/i, /celebrat/i, /taunt/i],
  getup: [/get.?up/i, /stand.?up/i],
};
const FALLBACK = {
  cross: 'punch', hammer: 'punch', haymaker: 'punch', gut: 'punch', backfist: 'punch', elbow: 'punch', headbutt: 'punch', palm: 'grab', airPunch: 'airKick',
  knee: 'kick', highKick: 'kick', flipKick: 'kick', roundhouse: 'kick', stab: 'punch', slash: 'punch',
  knifeHigh: 'punch', knifeLow: 'kick', knifeChop: 'punch', knifeRise: 'punch', knifeThrust: 'punch', knifeJab: 'punch', kneel: 'hit', nunHigh: 'punch', nunSide: 'punch', nunLow: 'punch', nunSpin: 'punch', nunCatch: 'idle',
  dazed: 'hit', roll: 'knockdown', spinSlam: 'punch', ears: 'hit', guitar: 'idle', radio: 'cough', ivSwing: 'kick', whip: 'punch', gold: 'win', cough: 'punch', smoke: 'idle', flag: 'jump', kick: 'punch', airKick: 'kick', lowKick: 'kick', grab: 'punch', throw: 'punch', dash: 'punch', uppercut: 'punch', slam: 'jump',
  teleport: 'punch', special: 'punch', blockHit: 'block', block: 'idle', hit: 'idle', knockdown: 'ko',
  getup: 'idle', win: 'idle', walk: 'idle', jump: 'idle', select: 'idle', taunt: 'win', ko: 'hit',
};
const ONE_SHOT = new Set(['flag', 'cross', 'hammer', 'haymaker', 'gut', 'backfist', 'elbow', 'headbutt', 'palm', 'airPunch', 'knee', 'highKick', 'flipKick', 'roundhouse', 'punch', 'kick', 'lowKick', 'grab', 'airKick', 'throw', 'dash', 'uppercut', 'slam', 'teleport', 'hit', 'blockHit', 'ko', 'knockdown', 'getup']);
const HOLD_LAST = new Set(['ko', 'knockdown']);

export class ModelRig {
  constructor(def) {
    this.def = def;
    this.object = new THREE.Group();
    this.turn = new THREE.Group();
    this.object.add(this.turn);
    this.facing = 1;
    this.actions = {};
    this.current = null;
    this.flashT = 0;
    this.materials = [];
    this.tilt = 0;
    this.setFacing(1);
    this.ready = this.load().catch((err) => {
      console.error(`Could not load model for ${def.name}:`, err);
      // fall back to the toy body so the game still works
      this.fallback = new ToyRig(def);
      this.turn.visible = false;
      this.object.add(this.fallback.object);
      this.fallback.setFacing(this.facing);
      return this.fallback.ready;
    });
  }

  async load() {
    const def = this.def;
    const base = await loadModelFile(def.model, def.modelType);
    let skinned = false;
    base.scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    if (def.autoRig === 'force' || (!skinned && !base.animations.length && !def.animations && def.autoRig !== false)) { // (uploaded models: always our own skeleton)
      // a plain statue (typical straight out of Tripo / Hunyuan): give it a skeleton ourselves
      this.auto = buildAutoRig(base.scene.clone(), {
        height: 2.25 * heightOf(def) * (def.modelScale ?? 1), // matches the big-head toy fighters
        rotationY: def.modelRotationY ?? 0,
        neckFrac: def.neckFrac,
        shoulderFrac: def.shoulderFrac,
        neckBlend: def.neckBlend,
        arms: def.rigArms, // thick arms: a wider band of the mesh moves with them
        armPose: def.armPose,
      });
      this.materials = this.auto.materials;
      this.turn.add(this.auto.object);
      this.setFacing(this.facing);
      return;
    }
    const model = SkeletonUtils.clone(base.scene);
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        for (const m of [].concat(o.material)) this.materials.push(addRim(m));
      }
    });
    const holder = new THREE.Group();
    holder.rotation.y = def.modelRotationY ?? 0;
    holder.add(model);
    // normalise size: feet on the ground, ~2m tall (scaled by build.height)
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const scale = (2.1 * heightOf(def) * (def.modelScale ?? 1)) / (size.y || 1);
    const scaler = new THREE.Group();
    scaler.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    holder.position.set(-center.x, -box.min.y, -center.z);
    scaler.add(holder);
    this.turn.add(scaler);

    // collect clips from the model plus any extra animation files (e.g. Mixamo exports)
    const clips = [...base.animations];
    const extra = def.animations || {};
    const extraByAnim = {};
    for (const [anim, url] of Object.entries(extra)) {
      const file = await loadModelFile(url);
      if (file.animations[0]) {
        const clip = file.animations[0].clone();
        clip.name = `__${anim}`;
        clips.push(clip);
        extraByAnim[anim] = clip;
      }
    }
    this.mixer = new THREE.AnimationMixer(model);
    const find = (anim) => {
      if (extraByAnim[anim]) return extraByAnim[anim];
      const wanted = def.clips?.[anim];
      if (wanted) {
        const c = clips.find((c) => c.name === wanted) || clips.find((c) => c.name.toLowerCase().includes(wanted.toLowerCase()));
        if (c) return c;
      }
      for (const re of CLIP_GUESSES[anim] || []) {
        const c = clips.find((c) => re.test(c.name));
        if (c) return c;
      }
      return null;
    };
    const resolve = (anim, depth = 0) => {
      const c = find(anim);
      if (c || depth > 4) return c;
      return FALLBACK[anim] ? resolve(FALLBACK[anim], depth + 1) : null;
    };
    const all = ['idle', 'walk', 'jump', 'punch', 'kick', 'lowKick', 'grab', 'airKick', 'block', 'blockHit', 'hit', 'ko', 'knockdown',
      'getup', 'win', 'throw', 'dash', 'uppercut', 'slam', 'teleport', 'select', 'taunt',
      'cross', 'hammer', 'haymaker', 'gut', 'backfist', 'elbow', 'headbutt', 'palm', 'airPunch', 'knee', 'highKick', 'flipKick', 'roundhouse'];
    this.hasOwnKo = !!find('ko');
    for (const anim of all) {
      const clip = resolve(anim);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (ONE_SHOT.has(anim)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[anim] = action;
    }
    this.clipNames = clips.map((c) => c.name);
  }

  setFacing(dir) {
    this.facing = dir;
    this.turn.rotation.y = facingAngle(dir, this.auto ? (this.faceTurn ?? MODEL_FACE_TURN) : FACE_TURN);
    this.fallback?.setFacing(dir);
  }

  flash() { this.flashT = 1; this.fallback?.flash(); }

  setOpacity(a) {
    const mats = this.fallback ? this.fallback.materials : this.materials;
    for (const m of mats) { m.transparent = a < 1; m.opacity = a; }
    this.object.visible = a > 0.02;
  }

  update(dt, anim, ctx = {}) {
    if (this.fallback) return this.fallback.update(dt, anim, ctx);
    if (this.auto) {
      // swing round to face the opponent while attacking, so fists and feet visibly reach them
      const attacking = anim !== 'slam' && STRIKES.includes(anim);
      const want = attacking ? 0.15 : MODEL_FACE_TURN;
      this.faceTurn = (this.faceTurn ?? MODEL_FACE_TURN) + (want - (this.faceTurn ?? MODEL_FACE_TURN)) * Math.min(1, dt * 18);
      this.turn.rotation.y = facingAngle(this.facing, this.faceTurn);
      this.auto.update(dt, anim, ctx, this.facing);
      if (this.flashT > 0) {
        this.flashT = Math.max(0, this.flashT - dt * 6);
        for (const m of this.materials) m.emissive?.setScalar(this.flashT * 0.7);
      }
      return;
    }
    if (!this.mixer) return;
    const key = `${anim}:${ctx.moveId ?? ''}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      const next = this.actions[anim] || this.actions.idle;
      if (next) {
        if (next === this.current && ONE_SHOT.has(anim)) next.reset();
        if (next !== this.current) {
          next.reset();
          next.enabled = true;
          next.setEffectiveWeight(1);
          next.play();
          if (this.current) this.current.crossFadeTo(next, ONE_SHOT.has(anim) ? 0.08 : 0.18, false);
        }
        // squeeze one-shot clips into the move's real duration so the hit lines up
        if (ctx.duration && ONE_SHOT.has(anim) && !HOLD_LAST.has(anim)) {
          next.setEffectiveTimeScale(Math.max(0.5, Math.min(4, next.getClip().duration / (ctx.duration / 60))));
        } else {
          next.setEffectiveTimeScale(1);
        }
        this.current = next;
      }
    }
    // no death clip → tip the model over by hand
    const wantTilt = (anim === 'ko' || anim === 'knockdown') && !this.hasOwnKo ? -1.45 : 0;
    this.tilt = lerp(this.tilt, wantTilt, damp(0.15, dt));
    this.turn.children[0] && (this.turn.children[0].rotation.x = this.tilt);
    this.mixer.update(dt);
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      for (const m of this.materials) m.emissive?.setScalar(this.flashT * 0.7);
    }
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.fallback?.dispose();
  }
}

// Just the HEAD of a fighter's 3D model (everything above the neck), `headSize` tall, with the
// top of the head at y = 0 and the neck pointing down (-y). Used by Ido's giant foot, where his
// head is the big toe. `neckFrac` = neck height / total height (from the auto-rig). Null for toys.
export async function modelHeadClone(def, headSize, neckFrac = 0.72) {
  if (!def.model) return null;
  const base = await loadModelFile(def.model, def.modelType);
  const holder = new THREE.Group();
  const src = base.scene.clone();
  const wrap = new THREE.Group();
  wrap.rotation.y = def.modelRotationY ?? 0;
  wrap.add(src);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const cutY = box.min.y + (box.max.y - box.min.y) * neckFrac;
  const parts = [];
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const pos = g.attributes.position;
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      if (pos.getY(idx[i]) > cutY && pos.getY(idx[i + 1]) > cutY && pos.getY(idx[i + 2]) > cutY) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    if (!keep.length) return;
    g.setIndex(keep);
    const m = [].concat(o.material)[0];
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, color: m.color, roughness: Math.max(0.6, m.roughness ?? 1), metalness: 0 }));
    mesh.castShadow = true;
    parts.push(mesh);
  });
  // measure only the vertices that are actually used by the head triangles
  const headBox = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const pos = p.geometry.attributes.position, idx = p.geometry.index.array;
    for (let i = 0; i < idx.length; i++) headBox.expandByPoint(v.fromBufferAttribute(pos, idx[i]));
  }
  const c = headBox.getCenter(new THREE.Vector3());
  const s = headSize / ((headBox.max.y - headBox.min.y) || 1);
  const inner = new THREE.Group();
  for (const p of parts) inner.add(p);
  inner.position.set(-c.x, -headBox.max.y, -c.z);
  holder.add(inner);
  holder.scale.setScalar(s);
  return holder;
}

// Ori's gold: tint every material toward gold (k 0…1), remembering the original look
const GOLD = new THREE.Color('#ffd54a');
// Or Haim's alter ego (Hoshech Mavet): only his SKIN turns black. The models are one mesh with
// one texture, so we make a copy of the texture where skin-coloured pixels are darkened (a
// skin-tone test in YCbCr colour space, soft at the edges) and swap it in. Uniform, hair and
// glasses keep their colours. The copy is made once per texture and kept.
function darkSkinTexture(tex) {
  if (tex.userData.darkSkin !== undefined) return tex.userData.darkSkin;
  const img = tex.image;
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gr = p[i + 1], b = p[i + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * gr + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * gr - 0.081312 * b;
    const dist = Math.hypot((cr - 155) / 17, (cb - 104) / 18);
    // skin: in the skin-tone ellipse, and clearly redder than green (olive uniform isn't)
    const w = Math.max(0, Math.min(1, (1.15 - dist) / 0.3)) * Math.max(0, Math.min(1, (r - gr - 24) / 16));
    if (w <= 0) continue;
    const k = 1 - w * 0.88;
    p[i] = r * k; p[i + 1] = gr * k; p[i + 2] = b * (k + w * 0.04);
  }
  g.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = tex.flipY; out.colorSpace = tex.colorSpace; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.minFilter = tex.minFilter; out.magFilter = tex.magFilter; out.anisotropy = tex.anisotropy;
  out.needsUpdate = true;
  tex.userData.darkSkin = out;
  return out;
}
export function darkSkin(materials, on) {
  for (const m of materials) {
    const orig = m.userData.skinOrig || m.map;
    if (!orig) continue;
    if (on) {
      const dt = darkSkinTexture(orig);
      if (!dt) continue;
      m.userData.skinOrig = orig;
      m.map = dt;
    } else if (m.userData.skinOrig) {
      m.map = m.userData.skinOrig;
    }
    m.needsUpdate = true;
  }
}

export function tintGold(materials, k) {
  for (const m of materials) {
    if (!m.color) continue;
    const base = m.userData.base || (m.userData.base = { color: m.color.clone(), metalness: m.metalness ?? 0, roughness: m.roughness ?? 1 });
    m.color.copy(base.color).lerp(GOLD, k * 0.85);
    if ('metalness' in m) m.metalness = base.metalness + (0.45 - base.metalness) * k;
    if ('roughness' in m) m.roughness = base.roughness + (0.3 - base.roughness) * k;
    // a warm glow so even black hair and boots read as gold
    m.emissive?.setRGB(0.52 * k, 0.35 * k, 0.05 * k);
  }
}

export function createRig(def) {
  return def.model ? new ModelRig(def) : new ToyRig(def);
}
