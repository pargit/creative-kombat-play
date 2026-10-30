// Yali SMP's special: a wave of happiness. A ring of hearts, stars and smiley faces bursts
// out from her; if it reaches the opponent they get a glowing halo of floating hearts and
// can't attack or block until it wears off.

import * as THREE from 'three';
import { PHYS } from './moves.js';

function iconTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const heart = (g, color) => {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(64, 112);
  g.bezierCurveTo(10, 72, 8, 30, 38, 22);
  g.bezierCurveTo(54, 18, 62, 30, 64, 40);
  g.bezierCurveTo(66, 30, 74, 18, 90, 22);
  g.bezierCurveTo(120, 30, 118, 72, 64, 112);
  g.fill();
};
const star = (g, color) => {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 24 : 58, a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
};
const smiley = (g) => {
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3a00';
  g.beginPath(); g.ellipse(44, 50, 7, 11, 0, 0, Math.PI * 2); g.ellipse(84, 50, 7, 11, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5a3a00'; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 66, 30, 0.2, Math.PI - 0.2); g.stroke();
};

let ICONS;
function icons() {
  if (!ICONS) {
    ICONS = [
      iconTexture((g) => heart(g, '#ff4f8b')),
      iconTexture((g) => heart(g, '#ff8fb8')),
      iconTexture((g) => star(g, '#ffd23f')),
      iconTexture((g) => smiley(g)),
    ];
  }
  return ICONS;
}

function sprite(tex, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

// The burst travelling outwards from Yali
export class JoyWave {
  constructor(owner, move, scene, game) {
    this.owner = owner;
    this.move = move;
    this.scene = scene;
    this.game = game;
    this.dir = owner.facing;
    this.x = owner.pos.x + this.dir * 0.6;
    this.y = owner.pos.y + 1.3;
    this.travelled = 0;
    this.dead = false;
    this.group = new THREE.Group();
    this.parts = [];
    const tex = icons();
    for (let i = 0; i < 22; i++) {
      const s = sprite(tex[i % tex.length], 0.35 + Math.random() * 0.25);
      s.userData = { a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.9, spin: (Math.random() - 0.5) * 0.3, bob: Math.random() * 6 };
      this.group.add(s);
      this.parts.push(s);
    }
    // the happy bomb itself: pink ball with a smiley and a sparking fuse
    this.bomb = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ color: '#ff5fa2', roughness: 0.35 }));
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[3], transparent: true, depthWrite: false }));
    face.scale.setScalar(0.36); face.position.z = 0.31;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#4a3a2a' }));
    fuse.position.y = 0.36;
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffd23f', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spark.position.y = 0.48; this.spark.scale.setScalar(0.25);
    this.bomb.add(ball, face, fuse, this.spark);
    this.group.add(this.bomb);
    for (const s of this.parts) s.scale.multiplyScalar(0.6);
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 40), new THREE.MeshBasicMaterial({
      color: '#ffe680', transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glow.rotation.y = Math.PI / 2;
    this.group.add(this.glow);
    scene.add(this.group);
  }

  tick() {
    // chases the opponent until it reaches them (it can't be dodged, only blocked)
    const speed = 0.22;
    const opp = this.owner.opponent;
    const dx = opp.pos.x - this.x, dy = opp.pos.y + 1.2 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * speed;
    this.y += (dy / d) * speed;
    this.travelled += speed;
    if (opp.alive && Math.abs(this.x - opp.pos.x) < 0.7 && Math.abs(this.y - (opp.pos.y + 1.2)) < 1.0) {
      // blocked? no happiness
      if (opp.receive(this.owner, this.move, { x: this.x }) === 'hit') {
        opp.happy = this.move.joy.duration;
        this.game.onJoyStart(opp);
      }
      this.dispose();
      return;
    }
    if (this.travelled > 30 || !opp.alive) this.dispose();
  }

  render() {
    if (this.dead) return;
    const grow = 0.6 + Math.min(1, this.travelled / 2) * 0.8;
    this.group.position.set(this.x, this.y, 0.2);
    this.glow.scale.setScalar(grow);
    this.glow.material.opacity = 0.4 + Math.random() * 0.3;
    this.bomb.rotation.z += 0.15;
    this.spark.scale.setScalar(0.18 + Math.random() * 0.15);
    for (const s of this.parts) {
      const u = s.userData;
      u.a += 0.12;
      s.position.set(Math.cos(u.a) * u.r * 0.25, Math.sin(u.a) * u.r * grow, Math.cos(u.a * 1.3) * u.r * grow);
      s.material.rotation += u.spin;
    }
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    for (const s of this.parts) s.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
  }
}

// The happy halo around a fighter while the effect lasts
export class JoyHalo {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.parts = [];
    const tex = icons();
    for (let i = 0; i < 8; i++) {
      const s = sprite(tex[i % 2 === 0 ? 0 : i % 4 === 1 ? 3 : 1], 0.32);
      s.userData = { a: (i / 8) * Math.PI * 2, h: Math.random() };
      this.group.add(s);
      this.parts.push(s);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  render(f, t) {
    const on = f.happy > 0;
    this.group.visible = on;
    if (!on) return;
    const fade = Math.min(1, f.happy / 30);
    this.group.position.set(f.pos.x, f.pos.y + 2.25, 0);
    for (const s of this.parts) {
      const u = s.userData;
      const a = u.a + t * 2.2;
      s.position.set(Math.cos(a) * 0.55, Math.sin(t * 4 + u.a * 3) * 0.12 + u.h * 0.15, Math.sin(a) * 0.55);
      s.material.opacity = fade;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.parts) s.material.dispose();
  }
}
