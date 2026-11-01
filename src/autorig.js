// Automatic rigging for AI-generated models that come without a skeleton.
//
// The model must stand in a T-pose or A-pose facing +z (what Tripo / Hunyuan / Meshy
// produce from a T-pose picture). We measure it (where the legs split, how wide the
// torso is, where the arms reach, where the neck narrows), build a skeleton at those
// spots, paint each vertex to the nearest body part, and then drive the bones with the
// same fighting poses the toy figures use. No Mixamo and no animation files needed.

import * as THREE from 'three';
import { JOINTS, GUARD, STRIKES, pose } from './poses.js';
import { addRim } from './look.js';

const V3 = THREE.Vector3;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

// AI exports usually come with a "metallic" map and a specular extension. With no reflections
// in the arena those make the model flash grey-white at some angles (lying on the floor, mostly),
// so keep the colour, normal and roughness textures and make the surface non-metal.
function plainMaterial(m) {
  return addRim(new THREE.MeshStandardMaterial({
    name: m.name, color: m.color, map: m.map, normalMap: m.normalMap, normalScale: m.normalScale,
    roughness: Math.max(0.6, m.roughness ?? 1), roughnessMap: m.roughnessMap, metalness: 0,
    aoMap: m.aoMap, emissive: m.emissive, emissiveMap: m.emissiveMap, side: m.side,
  }));
}

// Bake all meshes into one space: feet on y = 0, centred on x/z, `height` metres tall.
function bakeMeshes(root, height, rotationY) {
  const holder = new THREE.Group();
  holder.rotation.y = rotationY;
  holder.add(root);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new V3());
  const c = box.getCenter(new V3());
  const s = height / (size.y || 1);
  const norm = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  const out = [];
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    const mats = [].concat(o.material).map(plainMaterial);
    out.push({ geo, material: Array.isArray(o.material) ? mats : mats[0], mats });
  });
  holder.remove(root);
  return out;
}

// Half-width of the body part that touches x = 0 in a horizontal slice (ignores arms/legs
// that are separated from the centre by a gap).
function centralHalfWidth(xs, gap) {
  const a = xs.map(Math.abs).sort((p, q) => p - q);
  if (!a.length || a[0] > gap) return 0;
  let w = a[0];
  for (const v of a) { if (v - w > gap) break; w = v; }
  return w;
}

export function findLandmarks(points, H) {
  const slice = (y, band = 0.012 * H) => points.filter((p) => Math.abs(p.y - y) < band);
  const gap = 0.03 * H;

  // crotch: lowest height where the body is joined in the middle (legs have merged)
  let crotchY = 0.45 * H;
  for (let y = 0.12 * H; y < 0.7 * H; y += 0.005 * H) {
    const s = slice(y, 0.006 * H);
    if (s.some((p) => Math.abs(p.x) < 0.012 * H)) { crotchY = y; break; }
  }

  const wristX = points.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0);
  const torsoY = crotchY + 0.3 * (H - crotchY) * 0.7;
  let shoulderX = Math.max(0.06 * H, centralHalfWidth(slice(torsoY).map((p) => p.x), gap));

  // arm line: fit y = a + b·|x| through everything clearly outside the torso, above the waist
  const fitArm = (sx) => {
    const arm = points.filter((p) => Math.abs(p.x) > sx + 0.04 * H && p.y > crotchY + 0.1 * (H - crotchY));
    let a = crotchY + 0.5 * (H - crotchY), b = 0;
    if (arm.length > 20) {
      let sumx = 0, sumy = 0, sxx = 0, sxy = 0;
      for (const p of arm) { const x = Math.abs(p.x); sumx += x; sumy += p.y; sxx += x * x; sxy += x * p.y; }
      const n = arm.length;
      b = (n * sxy - sumx * sumy) / Math.max(1e-9, n * sxx - sumx * sumx);
      a = (sumy - b * sumx) / n;
    }
    return { a, b };
  };
  let { a, b } = fitArm(shoulderX);
  // A big round belly (Kung Fu Panda) hides where the shoulders are: the torso slice found a narrow bit of it, so the "arms"
  // started far too close to the middle and the belly got pulled in with them. The real body is as wide as the model is
  // just under the arms: when that is much wider than what we found, the shoulders are out there and the arms are thick.
  let fat = false;
  {
    const lo = crotchY + 0.15 * (H - crotchY), hi = a + b * shoulderX - 0.18 * H;
    const xs = points.filter((p) => p.y > lo && p.y < hi).map((p) => Math.abs(p.x)).sort((u, v) => u - v);
    if (xs.length > 40) {
      const bodyW = xs[Math.floor(xs.length * 0.95)];
      if (bodyW > shoulderX * 1.5 && bodyW < 0.3 * H) { shoulderX = bodyW; ({ a, b } = fitArm(shoulderX)); fat = true; }
    }
  }
  const shoulderY = a + b * shoulderX;
  const wristY = a + b * wristX;

  // neck: narrowest point between the shoulders and the top of the head
  let neckY = shoulderY + 0.08 * H, best = Infinity;
  // Only look just above the shoulders: long hair hides the neck, and searching higher
  // finds a 'narrow' spot inside the face, which then stretches the face when the head turns.
  const neckTop = shoulderY + 0.3 * (H - shoulderY);
  for (let y = shoulderY + 0.02 * H; y < neckTop; y += 0.005 * H) {
    const w = centralHalfWidth(slice(y, 0.006 * H).map((p) => p.x), gap);
    if (w > 0 && w < best) { best = w; neckY = y; }
  }

  const kneeY = crotchY * 0.52;
  const knee = slice(kneeY).filter((p) => Math.abs(p.x) > 0.005 * H);
  const legX = knee.length ? knee.reduce((s, p) => s + Math.abs(p.x), 0) / knee.length : 0.08 * H;
  const hipY = crotchY + 0.04 * H;
  const waistY = hipY + 0.06 * H;
  return { H, crotchY, hipY, waistY, kneeY, legX, shoulderX, shoulderY, wristX, wristY, neckY, fat };
}

const BONES = ['root', 'hips', 'spine', 'neck', 'head', 'lSh', 'lEl', 'lHand', 'rSh', 'rEl', 'rHand',
  'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));

function buildSkeleton(L) {
  const bones = BONES.map((name) => Object.assign(new THREE.Bone(), { name }));
  const at = {
    root: [0, 0, 0], hips: [0, L.hipY, 0], spine: [0, L.waistY, 0], neck: [0, L.neckY, 0], head: [0, L.neckY + 0.05 * L.H, 0],
    lSh: [L.shoulderX, L.shoulderY, 0], lEl: [(L.shoulderX + L.wristX) / 2, (L.shoulderY + L.wristY) / 2, 0], lHand: [L.wristX * 0.94, L.wristY, 0],
    rSh: [-L.shoulderX, L.shoulderY, 0], rEl: [-(L.shoulderX + L.wristX) / 2, (L.shoulderY + L.wristY) / 2, 0], rHand: [-L.wristX * 0.94, L.wristY, 0],
    lHip: [L.legX, L.hipY, 0], lKnee: [L.legX, L.kneeY, 0], lFoot: [L.legX, 0.05 * L.H, 0],
    rHip: [-L.legX, L.hipY, 0], rKnee: [-L.legX, L.kneeY, 0], rFoot: [-L.legX, 0.05 * L.H, 0],
  };
  const parent = {
    hips: 'root', spine: 'hips', neck: 'spine', head: 'neck',
    lSh: 'spine', lEl: 'lSh', lHand: 'lEl', rSh: 'spine', rEl: 'rSh', rHand: 'rEl',
    lHip: 'hips', lKnee: 'lHip', lFoot: 'lKnee', rHip: 'hips', rKnee: 'rHip', rFoot: 'rKnee',
  };
  for (const name of BONES) {
    const bone = bones[B[name]];
    const p = new V3(...at[name]);
    if (parent[name]) {
      p.sub(new V3(...at[parent[name]]));
      bones[B[parent[name]]].add(bone);
    }
    bone.position.copy(p);
  }
  return { bones, rest: at };
}

// Up to 4 bone influences per vertex, blended smoothly across joints.
function skinWeights(geo, L, arms = {}) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const H = L.H;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(x), left = x >= 0;
    const w = {};
    const add = (bone, v) => { if (v > 1e-4) w[bone] = (w[bone] || 0) + v; };
    const armT = (ax - L.shoulderX) / Math.max(1e-6, L.wristX - L.shoulderX);
    const armLineY = L.shoulderY + (L.wristY - L.shoulderY) * Math.max(0, armT);
    // Arms are a fairly thin band around the shoulder→wrist line. Keep the band tight above
    // the line, otherwise long hair hanging beside the face gets dragged along with the arms.
    const above = y - armLineY, below = armLineY - y;
    const nearShoulder = armT < 0.22;
    const inArm = armT > -0.05 && y > L.waistY + 0.25 * (L.shoulderY - L.waistY)
      && above < (arms.above ?? (nearShoulder ? 0.035 : 0.075)) * H && below < (arms.below ?? 0.12) * H
      && (arms.zMin == null || z > arms.zMin * H); // (roster) hair hanging down behind the shoulders isn't arm
    if (inArm) {
      const sh = left ? 'lSh' : 'rSh', el = left ? 'lEl' : 'rEl';
      const toSpine = arms.stiff ? 1 - smooth(-0.04, 0.02, armT) : 1 - smooth(-0.08, 0.14, armT);
      const fore = smooth(0.4, 0.56, armT);
      add('spine', toSpine);
      add(sh, (1 - toSpine) * (1 - fore));
      add(el, (1 - toSpine) * fore);
    } else if (y < L.hipY + 0.02 * H) {
      const hip = left ? 'lHip' : 'rHip', knee = left ? 'lKnee' : 'rKnee';
      const toHips = smooth(L.crotchY - 0.04 * H, L.hipY + 0.03 * H, y) * (1 - smooth(0.02 * H, 0.06 * H, ax - 0.0));
      const toHipsTop = smooth(L.hipY - 0.01 * H, L.hipY + 0.03 * H, y);
      const hipsW = Math.max(toHips * 0.6, toHipsTop);
      const shin = 1 - smooth(L.kneeY - 0.05 * H, L.kneeY + 0.05 * H, y);
      add('hips', hipsW);
      add(hip, (1 - hipsW) * (1 - shin));
      add(knee, (1 - hipsW) * shin);
    } else if (y > L.neckY - 0.01 * H) {
      const head = smooth(L.neckY - 0.01 * H, L.neckY + (L.neckBlend ?? 0.05) * H, y);
      add('head', head);
      add('neck', 1 - head);
    } else {
      const neck = smooth(L.shoulderY + 0.01 * H, L.neckY, y);
      const hips = 1 - smooth(L.hipY, L.waistY + 0.06 * H, y);
      add('neck', neck);
      add('hips', (1 - neck) * hips);
      add('spine', (1 - neck) * (1 - hips));
    }
    const list = Object.entries(w).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const total = list.reduce((s, [, v]) => s + v, 0) || 1;
    list.forEach(([bone, v], k) => { idx[i * 4 + k] = B[bone]; wts[i * 4 + k] = v / total; });
    if (!list.length) { idx[i * 4] = B.spine; wts[i * 4] = 1; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
}

export function buildAutoRig(scene, { height, rotationY = 0, neckFrac = null, shoulderFrac = null, arms = {}, neckBlend = null, armPose = {} }) {
  const parts = bakeMeshes(scene, height, rotationY);
  const points = [];
  for (const { geo } of parts) {
    const p = geo.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 40000));
    for (let i = 0; i < p.count; i += step) points.push({ x: p.getX(i), y: p.getY(i), z: p.getZ(i) });
  }
  const L = findLandmarks(points, height);
  if (L.fat) arms = { above: 0.17, below: 0.15, stiff: true, ...arms }; // (thick arms on a round body: a wider band that leaves the chest sooner)
  // some models (a big chin or beard hanging down to the collar) fool the neck search;
  // the roster can say where the neck is, as a fraction of the height
  if (neckFrac) L.neckY = neckFrac * L.H;
  // a short neck/head blend keeps a big jaw from stretching when the head turns
  if (neckBlend) L.neckBlend = neckBlend;
  // a round belly (Kung Fu Panda) can hide where the arms start: the roster can say that too
  if (shoulderFrac) L.shoulderX = shoulderFrac * L.H;
  // arms.stretch (roster): longer arms. In the rest pose (arms out to the sides) everything past the
  // shoulder near the arm line is pushed outward, more the further out it is, so the arm grows
  // evenly from the shoulder with no seam; it fades out above and below the arm.
  if (arms.stretch && arms.stretch !== 1) {
    const k = arms.stretch - 1, H = L.H;
    for (const { geo } of parts) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), ax = Math.abs(x);
        if (ax <= L.shoulderX) continue;
        const armT = (ax - L.shoulderX) / Math.max(1e-6, L.wristX - L.shoulderX);
        const lineY = L.shoulderY + (L.wristY - L.shoulderY) * Math.max(0, armT);
        const off = Math.abs(y - lineY) / H, band = 1 - smooth(0.07, 0.12, off);
        if (band <= 0 || y < L.waistY) continue;
        pos.setX(i, x + Math.sign(x) * (ax - L.shoulderX) * k * band);
      }
      pos.needsUpdate = true;
      geo.computeBoundingBox(); geo.computeBoundingSphere();
    }
    L.wristX = L.shoulderX + (L.wristX - L.shoulderX) * arms.stretch;
  }
  const { bones } = buildSkeleton(L);
  const object = new THREE.Group();
  object.add(bones[B.root]);
  object.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const materials = [];
  for (const part of parts) {
    skinWeights(part.geo, L, arms);
    const mesh = new THREE.SkinnedMesh(part.geo, part.material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    object.add(mesh);
    mesh.bind(skeleton);
    materials.push(...part.mats);
  }

  // rotation that turns each arm from its rest direction to "hanging down" (the pose convention)
  const down = new V3(0, -1, 0);
  const armDir = (s) => new V3(s * (L.wristX - L.shoulderX), L.wristY - L.shoulderY, 0).normalize();
  const D = { l: new THREE.Quaternion().setFromUnitVectors(armDir(1), down), r: new THREE.Quaternion().setFromUnitVectors(armDir(-1), down) };
  const Dinv = { l: D.l.clone().invert(), r: D.r.clone().invert() };
  const rest = Object.fromEntries(bones.map((b) => [b.name, b.position.clone()]));
  const cur = { ...GUARD };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const scale = height / 2.0; // poses were tuned on ~2 m figures

  function update(dt, anim, ctx, facing) {
    const target = pose(anim, ctx.t ?? 0, ctx);
    const fast = anim === 'hit' || anim === 'blockHit' || STRIKES.includes(anim);
    const k = damp(fast ? 0.5 : 0.22, dt);
    for (const j of JOINTS) cur[j] += (target[j] - cur[j]) * (j === 'rootTilt' || j === 'spin' || (j === 'spineY' && anim === 'teleport') ? 1 : k);

    // Real faces don't twist like toy heads: keep yaw small and turn the whole body toward
    // the camera instead (see MODEL_FACE_TURN in rig.js).
    bones[B.spine].quaternion.setFromEuler(e.set(cur.spineX * 0.8, cur.spineY * 0.35 * facing, 0));
    bones[B.neck].quaternion.setFromEuler(e.set(cur.neckX * 0.6, cur.neckY * 0.15 * facing, 0));
    for (const [s, sh, el] of [['l', 'lSh', 'lEl'], ['r', 'rSh', 'rEl']]) {
      // armPose (roster), for a figure whose chest the folded arms would sink into: spread = elbows out
      // from the body, raise = upper arms further forward, open = elbows less folded (hands further out)
      // (only as much as the elbow is folded, so straight punches still go straight)
      const fold = Math.max(0, Math.min(1, -cur[`${s}El`] / 1.8));
      const X = cur[`${s}ShX`] - (armPose.raise ?? 0) * fold, Z = cur[`${s}ShZ`] + (s === 'l' ? -1 : 1) * (armPose.spread ?? 0) * fold, E = cur[`${s}El`] + (armPose.open ?? 0) * fold;
      bones[B[sh]].quaternion.setFromEuler(e.set(X, 0, Z)).multiply(D[s]);
      // armPose.flare: the forearm turned outward round the upper arm, so long forearms don't cross
      const fl = (armPose.flare ?? 0) * fold * (s === 'l' ? 1 : -1);
      bones[B[el]].quaternion.copy(Dinv[s]).multiply(q.setFromEuler(e.set(E, fl, 0, 'YXZ'))).multiply(D[s]);
    }
    bones[B.lHip].quaternion.setFromEuler(e.set(cur.lHipX, 0, cur.lHipZ));
    bones[B.lKnee].quaternion.setFromEuler(e.set(cur.lKnee, 0, 0));
    bones[B.rHip].quaternion.setFromEuler(e.set(cur.rHipX, 0, cur.rHipZ));
    bones[B.rKnee].quaternion.setFromEuler(e.set(cur.rKnee, 0, 0));
    const bend = (Math.min(cur.lKnee, cur.rKnee) - 0.45) * 0.12;
    bones[B.hips].position.y = rest.hips.y + (cur.hipsY - Math.max(0, bend)) * scale;
    bones[B.root].rotation.set(cur.rootTilt, cur.spin, 0);
    bones[B.root].position.y = cur.rootLift * scale;
    bones[B.root].position.z = cur.lunge * scale;
  }

  // Heal stretched spikes ("pointy shoulders"): skin weights guessed from a T-pose can leave a patch of a
  // wide sleeve / cape / thick arm tied to the wrong bone, and a few poses later its triangles are pulled
  // into long thin sheets. Pose the figure the way the game will, find the edges that got much longer than they
  // are at rest, and smooth the skin weights around them with their neighbours until the stretch is gone.
  function healStretch() {
    const POSES = ['idle', 'punch', 'kick', 'uppercut'];
    const meshes = object.children.filter((c) => c.isSkinnedMesh);
    const saved = { ...cur };
    const v = new V3();
    const poseAll = (anim) => { for (let i = 0; i < 40; i++) update(1 / 30, anim, { t: i / 30 }, 1); object.updateMatrixWorld(true); skeleton.update(); };
    const jobs = meshes.map((mesh) => {
      const geo = mesh.geometry, pos = geo.attributes.position, n = pos.count;
      const idx = geo.index ? geo.index.array : null;
      // vertices at the same spot (UV seams) count as one, so smoothing never opens a crack
      const key = new Map(), canon = new Int32Array(n);
      for (let i = 0; i < n; i++) { const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`; if (!key.has(k)) key.set(k, i); canon[i] = key.get(k); }
      const edges = new Set(), nb = new Map();
      const tri = idx || Int32Array.from({ length: n }, (_, i) => i);
      for (let t = 0; t + 2 < tri.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const i = canon[tri[t + a]], j = canon[tri[t + b]]; if (i === j) continue;
        const e = i < j ? i * n + j : j * n + i; if (edges.has(e)) continue; edges.add(e);
        (nb.get(i) || nb.set(i, []).get(i)).push(j); (nb.get(j) || nb.set(j, []).get(j)).push(i);
      }
      const rest = Array.from({ length: n }, (_, i) => new V3().fromBufferAttribute(pos, i));
      return { mesh, geo, n, canon, nb, rest, edgeList: [...edges].map((e) => [Math.floor(e / n), e % n]) };
    });
    const bad = (job, posedByPose) => { // vertices on an edge that got much longer than at rest in any pose
      const out = new Set(); let worst = 1;
      for (const posed of posedByPose) for (const [i, j] of job.edgeList) {
        const r = job.rest[i].distanceTo(job.rest[j]); if (r < 1e-5) continue;
        const d = posed[i].distanceTo(posed[j]), q = d / r;
        if (q > 1.9 && d - r > 0.03 * L.H) { out.add(i); out.add(j); }
        if (q > worst) worst = q;
      }
      return { out, worst };
    };
    const measure = () => {
      const per = jobs.map(() => []);
      for (const anim of POSES) {
        poseAll(anim);
        jobs.forEach((job, k) => { const arr = []; for (let i = 0; i < job.n; i++) { job.mesh.getVertexPosition(i, v); arr.push(v.clone().applyMatrix4(job.mesh.matrixWorld)); } per[k].push(arr); });
      }
      return jobs.map((job, k) => bad(job, per[k]));
    };
    try {
      let result = measure();
      for (let round = 0; round < 3 && result.some((r) => r.out.size); round++) {
        jobs.forEach((job, k) => {
          const sw = job.geo.attributes.skinWeight, si = job.geo.attributes.skinIndex, N = BONES.length;
          const dense = (i) => { const d = new Float32Array(N); for (let c = 0; c < 4; c++) d[si.array[i * 4 + c]] += sw.array[i * 4 + c]; return d; };
          // grow the problem area by two steps, then average each vertex's weights with its neighbours' (a few times)
          let area = new Set(result[k].out);
          for (let g = 0; g < 3; g++) for (const i of [...area]) for (const j of job.nb.get(i) || []) area.add(j);
          const cache = new Map(); const get = (i) => cache.get(i) || (cache.set(i, dense(i)), cache.get(i));
          for (let pass = 0; pass < 3; pass++) {
            const next = new Map();
            for (const i of area) {
              const acc = new Float32Array(N), ns = job.nb.get(i) || [];
              const own = get(i); for (let b = 0; b < N; b++) acc[b] = own[b] * 1.0;
              for (const j of ns) { const o = get(j); for (let b = 0; b < N; b++) acc[b] += o[b]; }
              const tot = 1 + ns.length; for (let b = 0; b < N; b++) acc[b] /= tot;
              next.set(i, acc);
            }
            for (const [i, acc] of next) cache.set(i, acc);
          }
          for (let v2 = 0; v2 < job.n; v2++) {
            const c = job.canon[v2]; if (!area.has(c)) continue;
            const d = cache.get(c), list = [...d.keys()].map((b) => [b, d[b]]).sort((p, q) => q[1] - p[1]).slice(0, 4);
            const total = list.reduce((a, [, w]) => a + w, 0) || 1;
            for (let c2 = 0; c2 < 4; c2++) { si.array[v2 * 4 + c2] = list[c2] ? list[c2][0] : 0; sw.array[v2 * 4 + c2] = list[c2] ? list[c2][1] / total : 0; }
          }
          si.needsUpdate = sw.needsUpdate = true;
        });
        result = measure();
      }
    } finally { Object.assign(cur, saved, GUARD); }
  }
  try { healStretch(); } catch (err) { console.warn('auto-rig: stretch check skipped', err); }

  return { object, materials, update, landmarks: L, bones: Object.fromEntries(bones.map((b) => [b.name, b])) };
}
