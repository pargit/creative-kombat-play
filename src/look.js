// Cheap graphics upgrades (no per-frame cost worth mentioning):
// - image-based lighting: a small sky (gradient + sun) is blurred once into an environment map,
//   so every PBR material gets soft light from all around instead of one flat fill light
// - rim light on the fighters: a thin bright edge (fresnel) so they stand out from the background
// - contact shadows: a soft dark blot right under each fighter's feet, so they sit on the ground

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// sky: top colour, horizon colour, ground colour, sun direction and colour
export function makeEnvironment(renderer, { top = '#7fb2e6', horizon = '#e8eef2', ground = '#9a8a72', sun = [-0.45, 0.75, 0.5], sunColor = '#fff3dc', sunPower = 3, power = 0.4 } = {}) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { power: { value: power }, top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, ground: { value: new THREE.Color(ground) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
      uniform float power;
      void main() { float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.35)); gl_FragColor = vec4(c * power, 1.0); }`,
  }));
  env.add(sky);
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(sunColor).multiplyScalar(sunPower) }));
  s.position.set(...sun).normalize().multiplyScalar(8);
  env.add(s);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  sky.geometry.dispose(); sky.material.dispose(); s.geometry.dispose(); s.material.dispose();
  return tex;
}

// a thin bright edge round a material (patched into the standard shader; one shared program)
const RIM = { color: new THREE.Color('#dfe9ff'), strength: 0.16, power: 3.5 };
export function addRim(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.rim) return m;
  m.userData.rim = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: RIM.color };
    sh.uniforms.rimStrength = { value: RIM.strength };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <opaque_fragment>', `float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
outgoingLight += rimColor * pow(rimF, ${RIM.power.toFixed(1)}) * rimStrength;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rim';
  m.needsUpdate = true;
  return m;
}

// soft blots under the fighters' feet, fading as they jump
export class ContactShadows {
  constructor(scene) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.4, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.tex = new THREE.CanvasTexture(c);
    this.blobs = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false;
      scene.add(m);
      return m;
    });
  }
  update(fighters) {
    this.blobs.forEach((b, i) => {
      const f = fighters?.[i];
      const op = f ? (f.body?.object?.visible === false ? 0 : (f.opacity ?? 1)) : 0;
      b.visible = op > 0.05;
      if (!b.visible) return;
      const h = Math.max(0, f.pos.y), k = 1 / (1 + h * 1.2), w = 0.95 * (f.reachScale || 1);
      b.position.set(f.pos.x, 0.012, 0);
      b.scale.set(w * (1 + h * 0.3), w * 0.55 * (1 + h * 0.3), 1);
      b.material.opacity = 0.8 * k * op;
    });
  }
}

// gold Ori in Shirley's night: he shines like a lamp, a glow round him and a pool of light at his feet
export class GoldLight {
  constructor(scene) {
    const tex = (stops) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [p, col] of stops) gr.addColorStop(p, col);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    this.tex = tex([[0, 'rgba(255,240,190,1)'], [0.25, 'rgba(255,214,110,.6)'], [1, 'rgba(255,190,60,0)']]);
    const mat = () => new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat());
    this.pool.rotation.x = -Math.PI / 2;
    this.halo.visible = this.pool.visible = false;
    scene.add(this.halo, this.pool);
    this.k = 0;
  }
  update(f, on, time) {
    this.k += ((on ? 1 : 0) - this.k) * 0.12;
    const vis = this.k > 0.01 && f;
    this.halo.visible = this.pool.visible = !!vis;
    if (!vis) return;
    const p = 1 + Math.sin(time * 4) * 0.05;
    this.halo.position.set(f.pos.x, f.pos.y + 1.3, -0.4); // (behind him, so he isn't washed out)
    this.halo.scale.setScalar(3.6 * p);
    this.halo.material.opacity = 0.5 * this.k;
    this.pool.position.set(f.pos.x, 0.02, 0);
    this.pool.scale.set(7 * p, 4.5 * p, 1);
    this.pool.material.opacity = 0.55 * this.k;
  }
}

// Merge an arena's scenery that never moves into one mesh per material, once at load: a few dozen
// draw calls instead of a few hundred (and the same for the shadow pass), which is what phones
// choke on. `before`: what was in the scene before the arena was built; `keep`: objects that move
// or change (flags, the banner...), left alone with everything under them.
export function bakeStatic(scene, before, keep = []) {
  const skip = new Set(keep.filter(Boolean));
  scene.updateMatrixWorld(true);
  const groups = new Map(), taken = [];
  const visit = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.visible && o.geometry.attributes.position) {
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', g.attributes.position);
      if (!g.attributes.normal) g.computeVertexNormals();
      out.setAttribute('normal', g.attributes.normal);
      out.setAttribute('uv', g.attributes.uv || new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      groups.get(key).geos.push(out);
      taken.push(o);
      return;
    }
    for (const c of [...o.children]) visit(c);
  };
  for (const o of [...scene.children]) if (!before.has(o)) visit(o);
  let merged = 0;
  for (const { mat, cast, receive, geos } of groups.values()) {
    if (geos.length < 2) continue; // (nothing to gain)
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false;
    scene.add(m);
    merged += geos.length;
    for (const g of geos) g.dispose();
    geos.length = 0;
    geos.merged = true;
  }
  // take the originals out (only the ones that went into a merged mesh)
  for (const o of taken) {
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    if (groups.get(key).geos.merged) o.parent?.remove(o);
  }
  return merged;
}
