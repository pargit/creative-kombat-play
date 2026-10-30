import * as THREE from 'three';
import { DOT } from './fx.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floorTexture(initials) {
  return canvasTex(2048, 1024, (g, w, h) => {
    g.fillStyle = '#2a1d1a';
    g.fillRect(0, 0, w, h);
    // flagstones
    const tile = 128;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        const off = (y / tile) % 2 ? tile / 2 : 0;
        const v = 30 + Math.random() * 18;
        g.fillStyle = `rgb(${v + 14},${v + 4},${v})`;
        g.fillRect(x + off + 3, y + 3, tile - 6, tile - 6);
      }
    }
    // worn centre
    const grad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, h * 0.7);
    grad.addColorStop(0, 'rgba(255,140,60,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // emblem ring
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1.9, 1);
    g.strokeStyle = '#d9a53a';
    g.lineWidth = 10;
    g.beginPath(); g.arc(0, 0, 330, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 300, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 16; i++) {
      g.rotate(Math.PI / 8);
      g.fillStyle = '#d9a53a';
      g.fillRect(302, -6, 26, 12);
    }
    g.restore();
    g.fillStyle = 'rgba(217,165,58,0.55)';
    g.font = '900 220px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1.9, 1);
    g.fillText(initials, 0, 10);
    g.restore();
  });
}

function bannerTexture(color, initials) {
  return canvasTex(256, 768, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 6; i++) g.fillRect(i * 44 + 10, 0, 6, h);
    g.fillStyle = '#e8b64a';
    g.fillRect(0, 30, w, 14);
    g.fillRect(0, h - 120, w, 14);
    g.beginPath(); g.moveTo(0, h); g.lineTo(w / 2, h - 90); g.lineTo(w, h); g.fill();
    g.font = '900 120px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(initials, w / 2, h / 2 + 40);
  });
}

function titleTexture(title) {
  return canvasTex(2048, 256, (g, w, h) => {
    g.font = '400 150px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const grad = g.createLinearGradient(0, 40, 0, 210);
    grad.addColorStop(0, '#fff3c4');
    grad.addColorStop(0.5, '#f4c542');
    grad.addColorStop(0.52, '#b9791d');
    grad.addColorStop(1, '#ffd978');
    g.shadowColor = 'rgba(255,120,30,0.8)';
    g.shadowBlur = 30;
    g.fillStyle = grad;
    g.fillText(title, w / 2, h / 2);
  });
}

export class Arena {
  constructor(scene, title) {
    this.scene = scene;
    this.flames = [];
    this.fogRange = [2, 22];
    const initials = title.split(/\s+/).map((w) => w[0]).join('').slice(0, 3);

    scene.background = new THREE.Color('#150b0e');
    scene.fog = new THREE.Fog('#150b0e', 14, 34);

    const hemi = new THREE.HemisphereLight('#ffd9b0', '#2a1414', 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff1dd', 2.2);
    key.position.set(-4, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 8, bottom: -4, near: 1, far: 30 });
    key.shadow.bias = -0.0015;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#6fb7ff', 1.4);
    rim.position.set(3, 5, -8);
    scene.add(rim);

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 17), new THREE.MeshStandardMaterial({
      map: floorTexture(initials), roughness: 0.85, metalness: 0.05,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -2;
    floor.receiveShadow = true;
    scene.add(floor);

    // back wall
    const stone = new THREE.MeshStandardMaterial({ color: '#3a2724', roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1), stone);
    wall.position.set(0, 7, -9.5);
    wall.receiveShadow = true;
    scene.add(wall);
    const title3d = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshBasicMaterial({
      map: titleTexture(title), transparent: true, depthWrite: false,
    }));
    title3d.position.set(0, 7.4, -8.9);
    scene.add(title3d);
    this.title3d = title3d;

    // pillars and banners
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#5a403a', roughness: 0.8 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#c8932f', roughness: 0.35, metalness: 0.8 });
    const bannerA = bannerTexture('#1d4f8f', initials), bannerB = bannerTexture('#8f1d2b', initials);
    [-15, -10.5, -5.5, 5.5, 10.5, 15].forEach((x, i) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 10, 16), pillarMat);
      p.position.set(x, 5, -8.6);
      p.castShadow = true;
      scene.add(p);
      for (const y of [0.2, 9.9]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), goldMat);
        cap.position.set(x, y, -8.6);
        scene.add(cap);
      }
      if (i < 5) {
        const bx = x + ([-15, -10.5, -5.5, 5.5, 10.5, 15][i + 1] - x) / 2;
        if (Math.abs(bx) > 1) {
          const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.8), new THREE.MeshStandardMaterial({
            map: bx < 0 ? bannerA : bannerB, roughness: 0.9, side: THREE.DoubleSide,
          }));
          banner.position.set(bx, 5.6, -8.9);
          scene.add(banner);
        }
      }
    });

    // braziers
    for (const [x, z] of [[-7.5, -5.5], [7.5, -5.5], [-11.5, -2.5], [11.5, -2.5]]) this.brazier(x, z, goldMat);

    // embers drifting up
    const n = 120;
    const geo = new THREE.BufferGeometry();
    this.emberPos = new Float32Array(n * 3);
    this.emberSeed = [];
    for (let i = 0; i < n; i++) {
      this.emberSeed.push({ x: (Math.random() - 0.5) * 30, z: -8 + Math.random() * 7, s: 0.3 + Math.random(), o: Math.random() * 10 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, color: '#ff9a3c', map: DOT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.embers.frustumCulled = false;
    scene.add(this.embers);
  }

  brazier(x, z, goldMat) {
    const s = this.scene;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 2.2, 10), goldMat);
    stand.position.set(x, 1.1, z);
    stand.castShadow = true;
    s.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.5, 16, 1, true), goldMat);
    bowl.position.set(x, 2.35, z);
    s.add(bowl);
    const flame = new THREE.Group();
    flame.position.set(x, 2.5, z);
    const cols = ['#ff4d1a', '#ff9a2e', '#ffe28a'];
    cols.forEach((c, i) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55 - i * 0.14, 1.5 - i * 0.3, 10, 1, true), new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      cone.position.y = 0.6 - i * 0.1;
      flame.add(cone);
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ff7a2a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(4.5);
    glow.position.y = 0.6;
    flame.add(glow);
    s.add(flame);
    const light = new THREE.PointLight('#ff8a3a', 6, 9, 1.6);
    light.position.set(x, 3.2, z);
    s.add(light);
    this.flames.push({ flame, light, seed: Math.random() * 10 });
  }

  update(t) {
    for (const f of this.flames) {
      const n = Math.sin(t * 13 + f.seed) * 0.5 + Math.sin(t * 7.3 + f.seed * 2) * 0.5;
      f.flame.scale.set(1 + n * 0.08, 1 + n * 0.18, 1 + n * 0.08);
      f.flame.rotation.y = t * 2 + f.seed;
      f.light.intensity = 6 + n * 1.8;
    }
    this.emberSeed.forEach((e, i) => {
      const y = ((t * e.s * 0.6 + e.o) % 9);
      this.emberPos[i * 3] = e.x + Math.sin(t + e.o) * 0.4;
      this.emberPos[i * 3 + 1] = y;
      this.emberPos[i * 3 + 2] = e.z;
    });
    this.embers.geometry.attributes.position.needsUpdate = true;
  }
}
