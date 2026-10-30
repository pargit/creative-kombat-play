import * as THREE from 'three';

// Soft round sprite used for sparks, glows and dust
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const DOT = dotTexture();

export class Particles {
  constructor(scene, max = 600) {
    this.max = max;
    this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.22, map: DOT, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, { count = 24, color = '#ffd27a', speed = 0.12, spread = 1, gravity = 0.006, life = 30, dir = 0 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random());
      this.list.push({
        x, y, z,
        vx: Math.cos(a) * s * spread + dir * speed * 0.8,
        vy: Math.sin(a) * s,
        vz: (Math.random() - 0.5) * s,
        life: life * (0.6 + Math.random() * 0.6), max: life, g: gravity, c,
      });
    }
  }

  update(k) {
    let i = 0;
    for (const p of this.list) {
      p.vy -= p.g * k; p.x += p.vx * k; p.y += p.vy * k; p.z += p.vz * k;
      p.vx *= Math.pow(0.95, k);
      p.life -= k;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const p of this.list) {
      const f = Math.max(0, p.life / p.max);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.c.r * f; this.col[i * 3 + 1] = p.c.g * f; this.col[i * 3 + 2] = p.c.b * f;
      i++;
    }
    this.points.geometry.setDrawRange(0, i);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.RingGeometry(0.8, 1, 48);
  }

  spawn(x, y, color = '#ffffff', { grow = 0.18, life = 22, flat = true } = {}) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.position.set(x, y, 0);
    if (flat) m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.3);
    this.scene.add(m);
    this.list.push({ m, life, max: life, grow });
  }

  update(k) {
    for (const r of this.list) {
      r.life -= k;
      r.m.scale.addScalar(r.grow * k);
      r.m.material.opacity = Math.max(0, r.life / r.max) * 0.9;
    }
    for (const r of this.list.filter((r) => r.life <= 0)) { this.scene.remove(r.m); r.m.material.dispose(); }
    this.list = this.list.filter((r) => r.life > 0);
  }
}

export class Confetti {
  constructor(scene, colors, count = 260) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.16, 0.1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
    scene.add(this.mesh);
    this.p = [];
    this.dummy = new THREE.Object3D();
  }

  start(cx) {
    this.p = Array.from({ length: this.count }, () => ({
      x: cx + (Math.random() - 0.5) * 12, y: 6 + Math.random() * 8, z: (Math.random() - 0.5) * 5,
      vy: -(0.02 + Math.random() * 0.03), sway: Math.random() * 6, rx: Math.random() * 6, ry: Math.random() * 6,
      spin: 0.05 + Math.random() * 0.15,
    }));
    this.mesh.visible = true;
  }

  stop() { this.mesh.visible = false; this.p = []; }

  update(k, t) {
    if (!this.mesh.visible) return;
    const d = this.dummy;
    this.p.forEach((p, i) => {
      p.y += p.vy * k;
      p.rx += p.spin * k; p.ry += p.spin * 0.7 * k;
      if (p.y < -0.2) p.y = 8 + Math.random() * 3;
      d.position.set(p.x + Math.sin(t * 2 + p.sway) * 0.3, p.y, p.z);
      d.rotation.set(p.rx, p.ry, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function makeProjectileMesh(color, shape = 'ball') {
  const group = new THREE.Group();
  let geo;
  if (shape === 'weight') {
    // a kettlebell
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.45, metalness: 0.8 });
    const core = new THREE.Group();
    core.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), iron));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16, Math.PI * 1.3), iron);
    handle.position.y = 0.3; handle.rotation.z = -Math.PI * 0.15;
    core.add(handle);
    group.add(core);
    group.userData.core = core;
    return group;
  }
  if (shape === 'box') geo = new THREE.BoxGeometry(0.42, 0.3, 0.12);
  else if (shape === 'disc') geo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20);
  else geo = new THREE.IcosahedronGeometry(0.24, 1);
  const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  group.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: DOT, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(1.4);
  group.add(glow);
  group.userData.core = core;
  return group;
}
