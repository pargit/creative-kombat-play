// Arenas built from parts: a ground, a sky, the weather and props round the edge. A player picks the
// parts (or describes the place in words and the parts are picked for them: describeArena), and
// buildArena makes it. Everything is built in code, so an arena is just a few words of settings.
//
// An arena: { id, name, ground, sky, weather, props: [...], accent }

import * as THREE from 'three';
import { sanitizeScene, buildScene } from './scene.js';

export const GROUNDS = {
  grass: { label: 'Grass', color: '#5f8f3e', alt: '#557f37' },
  sand: { label: 'Sand', color: '#d9c08a', alt: '#cdb37c' },
  snow: { label: 'Snow', color: '#eef3f7', alt: '#e2e9ef' },
  stone: { label: 'Stone tiles', color: '#8b8680', alt: '#7b766f', tiles: 1 },
  wood: { label: 'Wooden floor', color: '#8a5a32', alt: '#7a4e2b', planks: 1 },
  concrete: { label: 'Concrete', color: '#b9b6ae', alt: '#aeaba3', tiles: 2 },
  lava: { label: 'Lava rock', color: '#2a1d1a', alt: '#221714', lava: 1 },
  ice: { label: 'Ice', color: '#c6e6f3', alt: '#b5dcec', ice: 1 },
  metal: { label: 'Metal plates', color: '#6d747c', alt: '#5f666e', tiles: 1 },
};
export const SKIES = {
  day: { label: 'Sunny day', top: '#5f9ee0', horizon: '#dceaf3', sun: '#fff1d6', light: 1, sunPos: [-7, 14, 9] },
  sunset: { label: 'Sunset', top: '#33255a', horizon: '#ff9a5a', sun: '#ffb070', light: 0.8, sunPos: [-10, 5, -4] },
  night: { label: 'Night', top: '#03050f', horizon: '#1b2547', sun: '#9fb4ff', light: 0.45, sunPos: [6, 12, 6], stars: 1, moon: 1 },
  space: { label: 'Outer space', top: '#000000', horizon: '#0b0820', sun: '#ffffff', light: 0.7, sunPos: [-8, 10, 6], stars: 1, planet: 1 },
  storm: { label: 'Storm', top: '#2f343c', horizon: '#6b7078', sun: '#c9d2dc', light: 0.6, sunPos: [-6, 14, 8] },
  dawn: { label: 'Misty dawn', top: '#8aa6c8', horizon: '#f2d6c4', sun: '#ffe2c8', light: 0.85, sunPos: [10, 6, -2] },
};
export const WEATHER = { none: 'Clear', rain: 'Rain', snow: 'Snowfall', embers: 'Embers', leaves: 'Falling leaves', fog: 'Thick fog' };
export const PROPS = {
  trees: 'Trees', pines: 'Pine trees', palms: 'Palm trees', rocks: 'Rocks', mountains: 'Mountains',
  buildings: 'City buildings', neon: 'Neon signs', lamps: 'Street lamps', crates: 'Crates', pillars: 'Pillars',
  cactus: 'Cactus', lanterns: 'Lanterns', torii: 'Temple gate', crystals: 'Crystals',
};

export const DEFAULT_ARENA = { id: 'arena-default', name: 'Training Ground', ground: 'concrete', sky: 'day', weather: 'none', props: ['trees', 'lamps', 'crates'], accent: '#ffb347', builtIn: true };
export const PRESET_ARENAS = [
  DEFAULT_ARENA,
  { id: 'arena-neon', name: 'Neon Rooftop', ground: 'metal', sky: 'night', weather: 'rain', props: ['buildings', 'neon'], accent: '#ff3cac', builtIn: true },
  { id: 'arena-dojo', name: 'Mountain Dojo', ground: 'wood', sky: 'dawn', weather: 'leaves', props: ['torii', 'lanterns', 'pines', 'mountains'], accent: '#e0233a', builtIn: true },
  { id: 'arena-volcano', name: 'Volcano', ground: 'lava', sky: 'storm', weather: 'embers', props: ['rocks', 'mountains', 'crystals'], accent: '#ff6a1a', builtIn: true },
];

// ── words → parts ──────────────────────────────────────────────────────────────
// Understood right here on the device (no AI service): keywords pick the parts. Whatever isn't
// mentioned keeps a sensible default for what was (snow → a cold sky...).
const KW = [
  [/\b(snow|snowy|winter|frozen|arctic|christmas)\b/, { ground: 'snow', weather: 'snow', props: ['pines'] }],
  [/\b(ice|icy|glacier)\b/, { ground: 'ice', props: ['crystals'] }],
  [/\b(desert|dune|sahara|sand|sandy|cactus|cacti)\b/, { ground: 'sand', props: ['cactus', 'rocks'] }],
  [/\b(beach|island|tropical|palm)\b/, { ground: 'sand', props: ['palms'] }],
  [/\b(forest|wood(s)?|jungle|park|garden|grass|field|meadow)\b/, { ground: 'grass', props: ['trees'] }],
  [/\b(volcano|lava|hell|inferno|magma)\b/, { ground: 'lava', weather: 'embers', props: ['rocks', 'mountains'] }],
  [/\b(city|street|downtown|urban|town|alley)\b/, { ground: 'concrete', props: ['buildings', 'lamps'] }],
  [/\b(roof|rooftop|skyscraper)\b/, { ground: 'metal', props: ['buildings'] }],
  [/\b(neon|cyber|cyberpunk|arcade|club|disco)\b/, { props: ['neon'], sky: 'night' }],
  [/\b(dojo|temple|shrine|japan|japanese|ninja|samurai)\b/, { ground: 'wood', props: ['torii', 'lanterns'] }],
  [/\b(castle|ruins|ancient|greek|roman|colosseum)\b/, { ground: 'stone', props: ['pillars'] }],
  [/\b(mountain|mountains|cliff|peak|hills?)\b/, { props: ['mountains'] }],
  [/\b(warehouse|factory|harbor|harbour|dock|port)\b/, { ground: 'concrete', props: ['crates', 'lamps'] }],
  [/\b(space|moon|planet|galaxy|stars?|alien|mars)\b/, { sky: 'space', ground: 'metal' }],
  [/\b(cave|crystal|crystals|mine)\b/, { props: ['crystals', 'rocks'] }],
  [/\b(night|midnight|dark|evening)\b/, { sky: 'night' }],
  [/\b(sunset|sundown|golden hour)\b/, { sky: 'sunset' }],
  [/\b(dawn|sunrise|morning|misty|mist)\b/, { sky: 'dawn' }],
  [/\b(storm|stormy|thunder|lightning|cloudy|grey|gray)\b/, { sky: 'storm' }],
  [/\b(day|sunny|bright|noon)\b/, { sky: 'day' }],
  [/\b(rain|raining|rainy|wet)\b/, { weather: 'rain' }],
  [/\b(snowing|snowfall|blizzard)\b/, { weather: 'snow' }],
  [/\b(ember|embers|ash|sparks|fire|burning)\b/, { weather: 'embers' }],
  [/\b(autumn|fall|leaves)\b/, { weather: 'leaves', props: ['trees'] }],
  [/\b(fog|foggy|haze|hazy)\b/, { weather: 'fog' }],
  [/\b(lamp|lamps|streetlight|streetlights)\b/, { props: ['lamps'] }],
  [/\b(lantern|lanterns)\b/, { props: ['lanterns'] }],
  [/\b(crate|crates|boxes)\b/, { props: ['crates'] }],
  [/\b(pillar|pillars|columns?)\b/, { props: ['pillars'] }],
  [/\b(rock|rocks|boulders?|stones?)\b/, { props: ['rocks'] }],
  [/\b(tree|trees)\b/, { props: ['trees'] }],
  [/\b(pine|pines)\b/, { props: ['pines'] }],
  [/\b(building|buildings)\b/, { props: ['buildings'] }],
  [/\b(wooden|planks?|ship|deck|boat)\b/, { ground: 'wood' }],
  [/\b(tiles?|tiled|marble|stone floor)\b/, { ground: 'stone' }],
  [/\b(metal|steel|iron|spaceship)\b/, { ground: 'metal' }],
];
const COLORS = { red: '#e0233a', blue: '#2f7fff', green: '#22c55e', yellow: '#ffd23f', orange: '#ff8a2a', purple: '#9b4dff', pink: '#ff4fa8', cyan: '#2fe0ff', white: '#ffffff', gold: '#f4c542' };
export function describeArena(text, name) {
  const t = String(text || '').toLowerCase();
  const out = { ground: null, sky: null, weather: null, props: [] };
  for (const [re, parts] of KW) if (re.test(t)) {
    for (const k of ['ground', 'sky', 'weather']) if (parts[k] && !out[k]) out[k] = parts[k];
    for (const p of parts.props || []) if (!out.props.includes(p)) out.props.push(p);
  }
  // defaults that fit what was asked for
  if (!out.sky) out.sky = out.ground === 'lava' ? 'storm' : out.ground === 'snow' ? 'dawn' : 'day';
  if (!out.ground) out.ground = out.sky === 'space' ? 'metal' : 'concrete';
  if (!out.weather) out.weather = 'none';
  if (!out.props.length) out.props = ['rocks', 'trees'];
  out.props = out.props.slice(0, 5);
  const col = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  out.accent = col ? COLORS[col] : out.props.includes('neon') ? '#ff3cac' : '#ffb347';
  // a name from the description: "a snowy mountain dojo at night" → "Snowy Mountain Dojo"
  const words = t.replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !/^(a|an|the|with|and|at|in|on|of|some|lots|lot|full|very|big|small|place|arena|my)$/.test(w));
  const stop = words.findIndex((w) => /^(night|day|sunset|dawn|rain|snowing|fog|storm)$/.test(w));
  const pick = (stop > 0 ? words.slice(0, stop) : words).slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  out.name = name || pick || 'My Arena';
  return out;
}

// ── building it ────────────────────────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hashStr(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function groundTexture(kind, R) {
  const G = GROUNDS[kind] || GROUNDS.concrete;
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = G.color; g.fillRect(0, 0, w, h);
    // speckle
    for (let i = 0; i < 2200; i++) { g.fillStyle = Math.random() < 0.5 ? G.alt : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    if (G.tiles) { const n = G.tiles === 2 ? 4 : 8; g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / n); g.lineTo(w, i * h / n); g.stroke(); } }
    if (G.planks) { g.strokeStyle = 'rgba(40,20,8,0.5)'; g.lineWidth = 3; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); const x = (y / 64 % 2) * 256 + 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
    if (G.lava) { g.strokeStyle = '#ff6a1a'; g.lineWidth = 4; g.shadowColor = '#ffb347'; g.shadowBlur = 10; for (let i = 0; i < 14; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 120; y += (R() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); } }
    if (G.ice) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(R() * w, R() * h); g.lineTo(R() * w, R() * h); g.stroke(); } }
  }, [24, 12]);
}
function skyDome(S) {
  const geo = new THREE.SphereGeometry(70, 32, 16), pos = geo.attributes.position, cols = [];
  const top = new THREE.Color(S.top), hor = new THREE.Color(S.horizon), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const k = Math.max(0, pos.getY(i) / 70); c.copy(hor).lerp(top, Math.pow(k, 0.6)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}

export class CustomArena {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg = { ...DEFAULT_ARENA, ...cfg };
    const R = rng(hashStr(cfg.id + cfg.name + cfg.ground + cfg.sky + (cfg.props || []).join()));
    const S = SKIES[cfg.sky] || SKIES.day;
    this.sky = S;
    this.group = new THREE.Group();
    this.title3d = new THREE.Group(); this.group.add(this.title3d); // (no banner: the arena's yours)
    this.fogRange = cfg.weather === 'fog' ? [4, 26] : [12, 52];
    scene.background = new THREE.Color(S.horizon);
    scene.fog = new THREE.Fog(S.horizon, 20, 60);
    this.group.add(skyDome(S));
    if (cfg.backdrop?.url) this.addBackdrop(cfg.backdrop.url); // (the AI-painted background of the place, behind the fight)
    // lights
    this.group.add(new THREE.HemisphereLight(S.top === '#000000' ? '#8aa0ff' : S.horizon, '#6b5a48', 1.15 * S.light + 0.2));
    const sun = new THREE.DirectionalLight(S.sun, 2.6 * S.light);
    sun.position.set(...S.sunPos);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -6, near: 1, far: 50 });
    sun.shadow.bias = -0.0012;
    this.group.add(sun);
    const back = new THREE.DirectionalLight('#bcd7ff', 0.5); back.position.set(6, 6, -10); this.group.add(back);
    // the ground, with a ring marking the fight
    const gt = groundTexture(cfg.ground, R);
    const G = GROUNDS[cfg.ground] || GROUNDS.concrete;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: G.ice ? 0.15 : G.lava ? 0.9 : 0.85, metalness: cfg.ground === 'metal' ? 0.5 : 0, emissive: G.lava ? '#ff4a10' : '#000', emissiveIntensity: G.lava ? 0.05 : 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.group.add(ground);
    if (cfg.backdrop?.url) { ground.geometry.dispose(); ground.geometry = new THREE.PlaneGeometry(200, 140); ground.position.z = -35; } // (the floor runs all the way to the painted background)
    if (cfg.floor?.url) this.addFloor(cfg.floor.url, ground);
    // the detailed arena: a recipe (painted floor + objects), re-checked here whoever made it
    const sc = cfg.scene && !cfg.backdrop?.url ? sanitizeScene(cfg.scene) : null;
    if (sc) buildScene(this, sc, ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 8.85, 64), new THREE.MeshBasicMaterial({ color: cfg.accent || '#ffb347', transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.scale.set(1, 0.32, 1); ring.position.y = 0.01; this.group.add(ring);
    // sky things
    if (S.stars) {
      const n = 900, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, e = 0.05 + R() * 1.3, r = 65; p.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
      this.group.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 0.25, fog: false, sizeAttenuation: true })));
    }
    if (S.moon || S.planet) {
      const body = new THREE.Mesh(new THREE.SphereGeometry(S.planet ? 7 : 2.2, 32, 16), new THREE.MeshBasicMaterial({ color: S.planet ? '#c98a5a' : '#f4efd6', fog: false }));
      body.position.set(S.planet ? -22 : 14, S.planet ? 20 : 22, -55); this.group.add(body);
    }
    // the props, round the back and the sides (never in the fight or in front of the camera)
    this.animated = [];
    if (!cfg.backdrop?.url && !sc) for (const p of cfg.props || []) this.addProps(p, R, cfg);
    // weather
    this.weather = null;
    if (['rain', 'snow', 'embers', 'leaves'].includes(cfg.weather)) {
      const n = cfg.weather === 'rain' ? 1400 : 700, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(R() - 0.5) * 44, R() * 16, -18 + R() * 26], i * 3);
      const col = { rain: '#a8c4e0', snow: '#ffffff', embers: '#ff8a2a', leaves: '#d2762a' }[cfg.weather];
      const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
        new THREE.PointsMaterial({ color: col, size: cfg.weather === 'rain' ? 0.06 : cfg.weather === 'leaves' ? 0.14 : 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: cfg.weather === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending }));
      pts.frustumCulled = false;
      this.weather = { pts, kind: cfg.weather, n };
      this.group.add(pts);
    }
    scene.add(this.group);
  }
  // a wide picture on a curved wall behind the arena, its horizon at the fighters' eye level
  addBackdrop(url) {
    const R = 55, H = 49, arc = Math.PI * 2 / 3;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (tex) => {
      if (this.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; // (seen from inside, so it isn't mirrored)
      // the picture's bottom edge is where its ground ends: that sits on the arena's floor, and the floor fades into that colour
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true, Math.PI - arc / 2, arc), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, toneMapped: false }));
      wall.position.y = H / 2 - 0.15; this.group.add(wall);
      try {
        const im = tex.image, c = document.createElement('canvas'); c.width = 32; c.height = 1;
        const x = c.getContext('2d'); x.drawImage(im, 0, im.height - Math.max(2, Math.round(im.height * 0.03)), im.width, Math.max(2, Math.round(im.height * 0.03)), 0, 0, 32, 1);
        const px = x.getImageData(0, 0, 32, 1).data; let r = 0, g = 0, b = 0;
        for (let i = 0; i < 32; i++) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; }
        const col = new THREE.Color(`rgb(${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)})`);
        if (this.scene.fog) { this.scene.fog.color.copy(col); this.scene.fog.near = 25; this.scene.fog.far = 62; }
        this.scene.background = col;
      } catch { /* (can't read the picture's colours: the sky's own colours stay) */ }
    }, undefined, () => { /* the picture didn't load: the sky and ground are still there */ });
  }
  // the AI-painted floor: a seamless tile, repeated over the whole ground
  addFloor(url, ground) {
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (tex) => {
      if (this.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
      tex.repeat.set(200 / 7, 140 / 7);
      ground.material.map?.dispose(); ground.material.map = tex; ground.material.color.set('#ffffff'); ground.material.needsUpdate = true;
    }, undefined, () => {});
  }
  // spots for props: behind the fight (z -4…-30) and off to the sides
  spots(R, n, { near = 4, far = 26, spread = 30 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const z = -(near + R() * (far - near)), x = (R() - 0.5) * 2 * (spread * (0.5 + (-z) / far * 0.6));
      if (Math.abs(x) < 10 && z > -6) continue;
      out.push([x, z]);
    }
    return out;
  }
  add(mesh, x, y, z) { mesh.position.set(x, y, z); mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.group.add(mesh); return mesh; }
  mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); }
  addProps(kind, R, cfg) {
    const A = cfg.accent || '#ffb347';
    if (kind === 'trees' || kind === 'pines' || kind === 'palms') {
      const trunk = this.mat(kind === 'palms' ? '#9a7a52' : '#6b4a2e');
      const leaf = this.mat(kind === 'pines' ? '#2f5a3a' : kind === 'palms' ? '#3f8a3a' : (cfg.weather === 'leaves' ? '#c86a2a' : '#4c8a3a'));
      for (const [x, z] of this.spots(R, 26)) {
        const s = 0.8 + R() * 0.8, g = new THREE.Group();
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, (kind === 'palms' ? 4 : 2) * s, 7), trunk); t.position.y = (kind === 'palms' ? 2 : 1) * s; g.add(t);
        if (kind === 'pines') for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry((1.3 - k * 0.3) * s, 1.6 * s, 8), leaf); c.position.y = (2 + k * 0.9) * s; g.add(c); }
        else if (kind === 'palms') for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.8 * s, 0.05, 0.4 * s), leaf); f.position.set(Math.cos(k) * 0.8 * s, 4 * s, Math.sin(k) * 0.8 * s); f.rotation.set(0, -k, -0.35); g.add(f); }
        else { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 0), leaf); c.position.y = 2.6 * s; g.add(c); }
        this.add(g, x, 0, z);
      }
    } else if (kind === 'rocks') {
      const m = this.mat(cfg.ground === 'lava' ? '#2b2422' : '#7d776f', { flatShading: true });
      for (const [x, z] of this.spots(R, 24, { near: 3.5 })) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + R() * 0.9, 0), m); r.scale.y = 0.6 + R() * 0.5; r.rotation.y = R() * 6; this.add(r, x, 0.2, z); }
    } else if (kind === 'mountains') {
      const m = this.mat(cfg.ground === 'snow' ? '#dfe6ee' : cfg.ground === 'lava' ? '#3a2a24' : '#6f7a86', { flatShading: true });
      for (let i = 0; i < 9; i++) { const h = 10 + R() * 14, c = new THREE.Mesh(new THREE.ConeGeometry(8 + R() * 8, h, 6), m); c.rotation.y = R() * 6; this.add(c, -48 + i * 12 + R() * 6, h / 2 - 1, -46 - R() * 8); }
    } else if (kind === 'buildings' || kind === 'neon') {
      const m = this.mat(cfg.sky === 'night' || cfg.sky === 'space' ? '#2a2f3a' : '#9aa3ad');
      const win = new THREE.MeshBasicMaterial({ color: cfg.sky === 'night' ? '#ffd27a' : '#cfe3f2' });
      const neonCols = [A, '#2fe0ff', '#ff3cac', '#9b4dff', '#7dff6a'];
      for (let i = 0; i < 14; i++) {
        const w = 3 + R() * 4, h = 6 + R() * 16, x = -40 + i * 6 + R() * 2, z = -16 - R() * 14;
        const b = this.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), m), x, h / 2, z);
        if (kind === 'buildings') for (let k = 0; k < 6; k++) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), win); wn.position.set((R() - 0.5) * (w - 1), (R() - 0.5) * (h - 2), 2.01); b.add(wn); }
        else { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.35, 0.1), new THREE.MeshBasicMaterial({ color: neonCols[i % neonCols.length] })); s.position.set(0, h * (0.2 + R() * 0.25), 2.05); b.add(s); this.animated.push({ kind: 'flicker', m: s, ph: R() * 6 }); }
      }
    } else if (kind === 'lamps' || kind === 'lanterns') {
      const pole = this.mat('#3a3d42', { metalness: 0.6, roughness: 0.4 });
      const glow = new THREE.MeshBasicMaterial({ color: kind === 'lanterns' ? '#ff5a3a' : '#fff1c0' });
      for (let i = 0; i < 8; i++) {
        const x = -21 + i * 6, z = -5 - (i % 2) * 1.5, g = new THREE.Group();
        if (kind === 'lamps') { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), pole); p.position.y = 1.7; g.add(p); const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), glow); l.position.y = 3.45; g.add(l); }
        else { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 10), glow); l.position.y = 2.2; g.add(l); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 6), pole); p.position.y = 1; g.add(p); }
        this.add(g, x, 0, z);
      }
    } else if (kind === 'crates') {
      const m = this.mat('#a27a4a');
      for (const [x, z] of this.spots(R, 14, { near: 4, far: 12, spread: 20 })) { const s = 0.7 + R() * 0.5; this.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m), x, s / 2, z).rotation.y = R(); }
    } else if (kind === 'pillars') {
      const m = this.mat('#d8d0c0');
      for (let i = 0; i < 10; i++) { const h = 4 + (i % 3 === 0 ? -1.5 : 0); this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 14), m), -22.5 + i * 5, h / 2, -7 - (i % 2) * 0.5); }
    } else if (kind === 'cactus') {
      const m = this.mat('#3f8a4a');
      for (const [x, z] of this.spots(R, 14)) { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.8, 4, 8), m); t.position.y = 1.1; g.add(t); const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 8), m); a.position.set(0.4, 1.3, 0); g.add(a); this.add(g, x, 0, z); }
    } else if (kind === 'torii') {
      const red = this.mat(A === '#ffb347' ? '#c8202a' : A), dark = this.mat('#1b1b1b');
      const g = new THREE.Group();
      for (const x of [-3.2, 3.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6, 12), red); p.position.set(x, 3, 0); g.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(9, 0.45, 0.6), dark); top.position.y = 6.2; g.add(top);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 0.4), red); bar.position.y = 5.2; g.add(bar);
      this.add(g, 0, 0, -12);
    } else if (kind === 'crystals') {
      const m = new THREE.MeshStandardMaterial({ color: A, emissive: A, emissiveIntensity: 0.6, roughness: 0.2, flatShading: true });
      for (const [x, z] of this.spots(R, 16, { near: 7, far: 18 })) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + R() * 0.6, 0), m); c.scale.y = 2; c.rotation.z = (R() - 0.5) * 0.6; this.add(c, x, 0.6, z); }
    }
  }
  update(t) {
    for (const a of this.animated) if (a.kind === 'flicker') a.m.visible = Math.sin(t * 7 + a.ph) > -0.85;
    const w = this.weather;
    if (!w) return;
    const p = w.pts.geometry.attributes.position, fall = { rain: 0.35, snow: 0.03, embers: -0.025, leaves: 0.035 }[w.kind];
    for (let i = 0; i < w.n; i++) {
      let y = p.getY(i) - fall, x = p.getX(i);
      if (w.kind !== 'rain') x += Math.sin(t * 1.5 + i) * 0.01;
      if (y < 0) y += 16; if (y > 16) y -= 16;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  }
  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
  }
}
