// Guy Cohen's special: real electric cables (black and red, twisted, copper plug) whip out,
// wrap the opponent and only THEN the electricity switches on: crackling arcs along the
// cables and around the body, glowing coils and sparks until they drop.

import * as THREE from 'three';
import { DOT } from './fx.js';
import { PHYS } from './moves.js';

const handY = 1.45;

function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

export class Lasso {
  constructor(owner, move, scene, color) {
    this.owner = owner;
    this.move = move;
    this.scene = scene;
    this.dir = owner.facing;
    this.reach = 0.3;
    this.state = 'flying'; // flying → holding → retracting → dead
    this.t = 0;
    this.dead = false;
    this.target = null;
    this.color = new THREE.Color(color);

    this.group = new THREE.Group();
    scene.add(this.group);
    // the cables themselves: two insulated wires (rebuilt along a whipping curve every frame)
    this.wires = [['#151515', 0], ['#b3161c', Math.PI]].map(([c, phase]) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 }));
      m.userData.phase = phase;
      m.castShadow = true;
      this.group.add(m);
      return m;
    });
    // electricity glow over the cables (only once it has caught them)
    this.cableGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true), glowMat(color, 0.45));
    this.group.add(this.cableGlow);
    // copper plug on the end: a body and two prongs
    this.plug = new THREE.Group();
    const copper = new THREE.MeshStandardMaterial({ color: '#c8783a', roughness: 0.3, metalness: 0.9 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.09), rubber);
    this.plug.add(body);
    for (const z of [0.025, -0.025]) { const pr = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.018), copper); pr.position.set(0.1, 0, z); this.plug.add(pr); }
    this.group.add(this.plug);
    // jagged arcs along the cable and around the victim
    this.arcs = [0, 1, 2, 3].map(() => {
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
        color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.group.add(line);
      return line;
    });
    // spark at the tip
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tip.scale.setScalar(0.7);
    this.group.add(this.tip);
    // cable coils that tie the opponent up (dark cable, with an electric glow ring over each)
    this.coils = [1.45, 1.05, 0.7].map((y) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), new THREE.MeshStandardMaterial({ color: y > 1 ? '#151515' : '#b3161c', roughness: 0.55 }));
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 6, 28), glowMat(color, 0.5));
      ring.add(glow);
      ring.userData.glow = glow;
      ring.rotation.x = Math.PI / 2;
      ring.userData.y = y;
      ring.visible = false;
      this.group.add(ring);
      return ring;
    });
  }

  start() { return { x: this.owner.pos.x + this.dir * 0.55, y: this.owner.pos.y + handY }; }

  end() {
    if (this.target) return { x: this.target.pos.x, y: this.target.pos.y + 1.2 };
    const s = this.start();
    return { x: s.x + this.dir * this.reach, y: this.tipY ?? s.y };
  }

  // 60 Hz logic
  tick(game) {
    this.t++;
    const m = this.move.lasso;
    const owner = this.owner;
    if (this.state === 'flying') {
      // only stops if Guy himself gets hit; otherwise it chases the opponent until it lands
      if (['hit', 'knockdown', 'ko', 'shocked'].includes(owner.state)) { this.state = 'retracting'; return; }
      const opp = owner.opponent;
      this.dir = opp.pos.x >= this.start().x ? 1 : -1;
      this.reach = Math.min(this.reach + m.speed, Math.abs(opp.pos.x - this.start().x) + 0.2);
      const tipX = this.start().x + this.dir * this.reach;
      const wantY = opp.pos.y + 1.2;
      this.tipY = (this.tipY ?? this.start().y) + Math.max(-m.speed, Math.min(m.speed, wantY - (this.tipY ?? this.start().y)));
      const top = opp.pos.y + PHYS.bodyHeight;
      const y = this.tipY;
      if (opp.alive && Math.abs(tipX - opp.pos.x) < 0.5 && y > opp.pos.y - 0.3 && y < top + 0.3) {
        const result = opp.receive(owner, this.move, { x: tipX });
        if ((result === 'hit' || result === 'gold') && opp.state === 'shocked') {
          this.state = 'holding';
          this.target = opp;
          this.t = 0;
          game.onShockStart(opp, this.color);
        } else {
          this.state = 'retracting';
        }
      } else if (this.t > 60 * 6 || !opp.alive) {
        this.state = 'retracting';
      }
    } else if (this.state === 'holding') {
      const opp = this.target;
      if (this.t % 6 === 0) {
        opp.rig.flash();
        game.onShockTick(opp, this.color);
      }
      if (opp.state !== 'shocked') { this.target = null; this.reach = Math.abs(opp.pos.x - this.start().x); this.state = 'retracting'; }
    } else if (this.state === 'retracting') {
      this.reach -= m.speed * 1.6;
      if (this.reach <= 0.2) this.dispose();
    }
  }

  // render-rate visuals
  render() {
    if (this.dead) return;
    const a = this.start(), b = this.end();
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.max(0.01, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const live = this.state === 'holding' && this.target; // electricity only once it has caught them
    // the cable's path: whipping and sagging in flight, pulled nearly taut while holding
    const nx = -dy / len, ny = dx / len;
    const t = this.t;
    const pathAt = (f) => {
      const sag = (live ? 0.05 : 0.18) * len * Math.sin(Math.PI * f);
      const whip = live ? 0 : 0.16 * Math.sin(f * Math.PI * 3 - t * 0.7) * f * (1 - f) * 4;
      return new THREE.Vector3(a.x + dx * f + nx * whip, a.y + dy * f - sag + ny * whip, 0.15);
    };
    const n = 24;
    for (const w of this.wires) {
      // two wires twisting around each other
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, p = pathAt(f), tw = f * len * 9 + w.userData.phase;
        pts.push(new THREE.Vector3(p.x + nx * Math.cos(tw) * 0.022, p.y + ny * Math.cos(tw) * 0.022, p.z + Math.sin(tw) * 0.022));
      }
      w.geometry.dispose();
      w.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.02, 6, false);
    }
    this.cableGlow.visible = !!live;
    if (live) {
      this.cableGlow.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.03 * len, 0.15);
      this.cableGlow.scale.set(1, len, 1);
      this.cableGlow.rotation.set(0, 0, angle - Math.PI / 2);
      this.cableGlow.material.opacity = 0.3 + Math.random() * 0.35;
    }
    // copper plug leading the way (hidden inside the coils once it has wrapped them)
    const tipDir = pathAt(1).sub(pathAt(0.95));
    this.plug.visible = !live;
    this.plug.position.copy(pathAt(1));
    this.plug.rotation.set(0, 0, Math.atan2(tipDir.y, tipDir.x));
    // electric arcs: along the cable, and crawling over the victim's body
    this.arcs.forEach((arc, k) => {
      arc.visible = !!live && Math.random() > 0.2;
      if (!arc.visible) return;
      const pts = [];
      if (k < 2) {
        const m = Math.max(4, Math.round(len * 5));
        for (let i = 0; i <= m; i++) {
          const f = i / m, p = pathAt(f), j = i === 0 || i === m ? 0 : 0.14;
          pts.push(new THREE.Vector3(p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, 0.2 + (Math.random() - 0.5) * j));
        }
      } else {
        const tg = this.target, cy = tg.pos.y + 0.4 + Math.random() * 1.3;
        for (let i = 0; i <= 7; i++) {
          const ang = Math.random() * Math.PI * 2;
          pts.push(new THREE.Vector3(tg.pos.x + Math.cos(ang) * 0.45, cy + (Math.random() - 0.5) * 0.5, Math.sin(ang) * 0.45));
        }
      }
      arc.geometry.setFromPoints(pts);
    });
    this.tip.visible = !!live;
    if (live) { this.tip.position.set(b.x, b.y, 0.2); this.tip.scale.setScalar(0.5 + Math.random() * 0.5); }
    this.coils.forEach((ring, i) => {
      ring.visible = !!live;
      if (!live) return;
      const tg = this.target;
      const tighten = Math.max(0.75, 1.35 - this.t * 0.03);
      ring.position.set(tg.pos.x, tg.pos.y + ring.userData.y, 0);
      ring.scale.setScalar(tighten);
      ring.rotation.z = this.t * 0.2 * (i % 2 ? 1 : -1);
      ring.rotation.y = Math.sin(this.t * 0.3 + i) * 0.25;
      ring.userData.glow.material.opacity = 0.3 + Math.random() * 0.5;
    });
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
