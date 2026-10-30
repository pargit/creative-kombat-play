import * as THREE from 'three';
import { ROSTER, DUMMY, LOCKED_SLOTS, GAME_TITLE, GAME_SUBTITLE, CONFETTI_COLORS, STAGE } from './roster.js';
import { Arena } from './arena.js';
import { CustomArena, DEFAULT_ARENA } from './arenas.js';
import './custom.js'; // (the player-made specials: registers their effect)
import { initCreator, openCreate, loadCustomFighters, allArenas, openTutorials } from './creator.js';
import { makeEnvironment, ContactShadows, GoldLight, bakeStatic } from './look.js';
import { quality } from './quality.js';
import { vp } from './viewport.js';
import './touchfix.js'; // (sliders + colour pickers that work with the game turned sideways)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Particles, Rings, Confetti, makeProjectileMesh } from './fx.js';
import { InputHub, Controller } from './input.js';
import { Fighter, Projectile } from './fighter.js';
import { Lasso } from './lasso.js';
import { JoyWave, JoyHalo } from './joy.js';
import { createEffect, SmokeHead, Stars, Cigarette, Sick, FrenchAura, IVStand, ResetIcon, buildSpiritWorld, spiritSky } from './effects.js';
import { AI } from './ai.js';
import { FATALITIES, BodyPieces } from './fatalities.js';
import { updateExplosions, clearExplosions } from './explosion.js';
import { createRig, modelHeadClone, tintGold, darkSkin, loadProp, heightOf, preloadModel } from './rig.js';
import { sfx, unlockAudio, announce, setMuted, isMuted, getVolume, setVolume, startMusic, stopMusic, SOUND_ENABLED, NARRATOR_ENABLED, narrate, stopNarration, unlockVoice, preloadClip } from './audio.js';
import { PHYS, ROUND_TIME, ROUNDS_TO_WIN, specialFor, SPECIALS, MOVES } from './moves.js';
const SPECIALS_GOLD = SPECIALS.gold.goldFrames;
import { ControlsScreen, BINDABLE, bindings, bindingLabel } from './controls.js';
import { TouchEditor, applyLayout } from './touchlayout.js';
import { net, Lockstep, FrameController, packInput } from './net.js';
import { SELF_SPECIALS } from './moves.js';
import { tourney, roundName, bracketSize, MAX as TOURNEY_MAX, GRACE_MS } from './tourney.js';
import { recentNames, createAccount, login, guestLogin, currentAccount, refreshAccount, takeAccountNotice, logout, setFriends, cleanName, NAME_RE, PIN_RE, requestFriend, respondFriend, unfriend, takeSettingsReload, startSettingsSync } from './accounts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

// ── renderer / scene ─────────────────────────────────────────────────────────
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
quality.init(renderer);
renderer.setPixelRatio(quality.pixelRatio); // (quality.js: the graphics settings)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
const camPos = new THREE.Vector3(0, 2.5, 12);
const camLook = new THREE.Vector3(0, 1.3, 0);

// HIGH quality: bloom, a soft glow round the brightest things (gold, explosions, bolts, flashes).
// Made only when needed; the glow is worked out at half resolution.
let composer = null, bloom = null;
function setupComposer() {
  if (!quality.bloom) { composer?.dispose(); composer = bloom = null; return; }
  if (composer) return;
  // The scene is drawn into the buffer exactly as it would be on screen (each material does its
  // own tone mapping, fog and sRGB, the sky isn't tone-mapped): three.js only does that for a
  // render target flagged as an XR one, and that flag changes nothing else. In a float buffer,
  // additive effects that pile up past full white are > 1, and only those glow.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.isXRRenderTarget = true;
  composer = new EffectComposer(renderer, rt);
  composer.renderTarget2.isXRRenderTarget = true;
  composer.renderTarget2.texture.colorSpace = THREE.SRGBColorSpace;
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(vp.w / 2, vp.h / 2), 0.55, 0.45, 0.98);
  composer.addPass(bloom);
  // then straight onto the screen, as it is
  composer.addPass(new ShaderPass(new THREE.ShaderMaterial({
    toneMapped: false, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
  })));
}
// three.js hands the fog colour and a plain-colour sky to a render target in linear space, but
// this one holds screen (sRGB) colours: swap in the converted colours just while it draws
const _fogSave = new THREE.Color(), _bgSave = new THREE.Color(), _rgb = { r: 0, g: 0, b: 0 };
const toScreenSpace = (c) => { c.getRGB(_rgb, THREE.SRGBColorSpace); c.setRGB(_rgb.r, _rgb.g, _rgb.b, THREE.LinearSRGBColorSpace); };
function renderComposed() {
  const fog = scene.fog?.color, bg = scene.background?.isColor ? scene.background : null;
  if (fog) { _fogSave.copy(fog); toScreenSpace(fog); }
  if (bg) { _bgSave.copy(bg); toScreenSpace(bg); }
  composer.render();
  if (fog) fog.copy(_fogSave);
  if (bg) bg.copy(_bgSave);
}
function resize() {
  vp.update(); // (phones held upright: the game is turned sideways)
  renderer.setSize(vp.w, vp.h, false);
  camera.aspect = vp.w / vp.h;
  camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(vp.w, vp.h); bloom.resolution.set(vp.w / 2, vp.h / 2); }
}
setupComposer();
// apply the graphics settings (at start, when changed in the menu, or when AUTO steps down)
function applyShadows() {
  const mode = quality.shadows, on = mode !== 'off';
  if (renderer.shadowMap.enabled !== on) {
    renderer.shadowMap.enabled = on;
    scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; }); // (shaders change with shadows on/off)
  }
  const size = mode === 'low' ? 1024 : 2048;
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow && o.shadow.mapSize.x !== size) { o.shadow.mapSize.set(size, size); o.shadow.map?.dispose(); o.shadow.map = null; }
  });
}
function applyGraphics() {
  renderer.setPixelRatio(quality.pixelRatio);
  applyShadows();
  setupComposer();
  resize();
  renderGraphicsMenu();
}
quality.onChange(applyGraphics);
addEventListener('resize', resize);
resize();

// distance the camera needs so that `halfWidth` metres fit either side of centre
function fitDistance(halfWidth, halfHeight = 1.6) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(halfWidth / (tanV * camera.aspect), halfHeight / tanV);
}

// iPhone: if Safari zoomed in (e.g. on a text box) or scrolled the page for the keyboard,
// snap back once the keyboard closes (rewriting the viewport tag resets the zoom)
const isField = (el) => !!el?.matches?.('input, textarea, select');
function unzoom() {
  const vp = document.querySelector('meta[name=viewport]');
  if (vp && (window.visualViewport?.scale ?? 1) > 1.01) {
    const c = vp.content; vp.content = c.replace(/,?\s*maximum-scale=[\d.]+/, '') + ', maximum-scale=1.0'; setTimeout(() => { vp.content = c; }, 50);
  }
}
addEventListener('focusout', (e) => {
  if (!isField(e.target)) return;
  setTimeout(() => { if (isField(document.activeElement)) return; unzoom(); scrollTo(0, 0); }, 100);
});
// iOS ignores user-scalable=no, so block its zoom gestures by hand:
// pinch (Safari's own gesture events)…
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
// …and double-tap-to-zoom (a second tap within 350 ms); a cancelled tap loses its click, so
// menu buttons get it back by hand (fight buttons use pointer events and don't need it)
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now(), quick = now - lastTouchEnd < 350;
  lastTouchEnd = now;
  if (!quick || isField(e.target) || e.touches.length) return;
  e.preventDefault();
  const el = e.target.closest?.('button, a, label, .btn, [role=button], .tile');
  if (el && !el.closest('#touch')) el.click();
}, { passive: false });
// and if Safari zoomed in anyway, snap back
window.visualViewport?.addEventListener('resize', () => { if (!isField(document.activeElement)) unzoom(); });

// ── app state ────────────────────────────────────────────────────────────────
const hub = new InputHub();
hub.bindTouch($('#touch'));
const menuCtrl = new Controller(hub, [{ keys: 'p1' }, { keys: 'p2' }, { pad: 0 }, { pad: 1 }, { pad: 2 }, { pad: 3 }]);

const LEVELS = ['easy', 'normal', 'hard'];
const app = {
  screen: 'loading',
  mode: '1p',
  level: 'normal',
  ctrls: null,
  match: null,
  paused: false,
  timeScale: 1,
  shake: 0,
  time: 0,
  portraits: {},
};
try { app.level = localStorage.getItem('fk-level') || 'normal'; } catch { /* storage blocked */ }
if (!LEVELS.includes(app.level)) app.level = 'normal';

let arena, particles, rings, confetti, contactShadows, goldLight;

function isTouch() {
  return hub.lastDevice === 'touch' || (hub.lastDevice === undefined && matchMedia('(pointer: coarse)').matches);
}

function show(id) {
  for (const s of $$('.screen')) s.hidden = s.id !== id;
  app.screen = id.replace('screen-', '');
  document.body.classList.toggle('fighting', id === 'screen-fight');
  if (typeof renderBadge === 'function') renderBadge();
  document.body.classList.toggle('hudon', ['screen-fight', 'screen-pause', 'screen-result'].includes(id) || (['screen-controls', 'screen-graphics', 'screen-audio'].includes(id) && settingsReturn === 'pause'));
  refreshChrome();
}

const STANDALONE = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
function refreshChrome() {
  const fighting = app.screen === 'fight' && app.match && app.match.phase !== 'over';
  $('#hud').hidden = !['fight', 'pause', 'result', 'leave'].includes(app.screen);
  document.body.classList.toggle('touch', isTouch());
  if (!$('#touch').classList.contains('editing')) $('#touch').hidden = !(fighting && isTouch());
  $('#btn-pause').hidden = !fighting;
  // the installed app has no browser refresh: a button for it on the home screen (where full screen is on the web)
  $('#btn-reload').hidden = !(STANDALONE && ['title', 'account'].includes(app.screen));
  if (!app.match?.practice) $('#practice').hidden = true;
  if (!app.watch || app.mode !== 'watch') $('#watch-bar').hidden = true;
}

// ── cinematics: fighter intros, fatality ─────────────────────────────────────
// specials that reach the opponent from afar: their fatality is done from where they stand
// (the rest, close-range or on themselves, walk up to them)
const RANGED = new Set(['lasso', 'tiger', 'weight', 'smoke', 'happiness', 'foot', 'cage', 'guitar', 'night', 'quake', 'satellite', 'computer', 'cough', 'darkness', 'shatter']);
// Before round 1 the camera flies up to each fighter's face in turn (with their name and
// tagline), then pulls back for "ROUND 1". Frames at 60/s, part of the deterministic match clock.
// Shots (frames): fighter 1 close-up → white flash → fighter 2 close-up → cut to the two of them
// facing off with VS → cut to the wide shot with ROUND 1.
// a floating marker over a fighter: a label with a downward arrow (mirror matches)
function youArrow(label, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.fillStyle = color;
  g.strokeText(label, 64, 34); g.fillText(label, 64, 34);
  g.beginPath(); g.moveTo(34, 66); g.lineTo(94, 66); g.lineTo(64, 112); g.closePath();
  g.stroke(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.62, 0.62, 1); s.renderOrder = 20; s.visible = false;
  scene.add(s);
  return s;
}
const MOVE_LABEL = { punch: 'PUNCH', punch2: 'PUNCH', kick: 'KICK', kick2: 'KICK', lowKick: 'LOW KICK', grab: 'GRAB', airPunch: 'AIR PUNCH', airKick: 'AIR KICK', dashPunch: 'DASH PUNCH' };
const practicing = () => !!app.practice && app.mode === '1p' && !app.tmatch;
const secs = (frames) => `${Math.round(Math.max(0, frames) / 6) / 10} s`;
// practice: the effects on the dummy now → { key: { what, left, for } } (frames left → seconds)
function practiceEffects(b) {
  const out = {}, add = (key, what, frames, untilText) => { out[key] = { what, left: untilText || secs(frames), for: untilText ? `${what} ${untilText}` : `${what} for ${secs(frames)}` }; };
  if (b.smoked > 0) add('smoked', "can't see you", b.smoked);
  if (b.poison) add('poison', 'poisoned', b.poison.left);
  if (b.deaf > 0) add('deaf', "can't act (holding the ears)", b.deaf);
  if (b.happy > 0) add('happy', 'too happy to attack or block', b.happy);
  if (b.slow > 0) add('slow', 'moves at half speed', b.slow);
  if (b.scrambled > 0) add('scrambled', 'buttons mixed up', b.scrambled);
  if (b.weak > 0) add('weak', 'deals half damage', b.weak);
  if (b.state === 'caged') add('cage', 'caged', 0, 'until they punch their way out');
  if (b.state === 'dazed') add('dazed', 'dazed', b.stun);
  if (b.state === 'shocked') add('shocked', 'tied up and shocked', b.stun);
  return out;
}
const INTRO_SHOT = 105;                 // each close-up
const INTRO_VS = INTRO_SHOT * 2;        // the face-off shot starts here
const INTRO_CINE = INTRO_VS + 80;       // then ROUND 1
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
function introShot(m) {
  if (!m?.cine || m.phase !== 'intro' || m.pt >= m.cine) return -1;
  return m.pt < INTRO_SHOT ? 0 : m.pt < INTRO_VS ? 1 : 2;
}
function whiteFlash(ms = 700) {
  const fl = $('#white-flash');
  fl.style.animationDuration = `${ms}ms`;
  fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
}
// the factory-reset screen: fake system code scrolling by and the time until the buttons are back
const RESET_LINES = [
  '> factory_reset --force --target=player', 'wiping /controls/*.cfg ........ OK', 'scrambling input matrix [##########] 100%',
  'kernel: button driver not responding', 'reboot gadhik_kombat.os v2.4.1', 'loading fists.dll ........ FAILED',
  'loading legs.sys ........ FAILED', 'checksum mismatch at 0x{H}', 'remapping keys... done (good luck)', 'warning: user is confused',
  'restoring defaults in progress', 'sync controls <-> brain ... 0x{H}', 'ERR 418: player is a teapot', 'mov eax, 0x{H}', 'jmp 0x{H}',
  'push ebp ; call reset_buttons', 'downloading patience.exe ... {P}%', 'installing michael_was_here.bat', 'fsck /dev/hands ... {P}%',
];
let resetLines = [], resetNext = 0;
function resetScreen(f) {
  const el = $('#reset-screen');
  const on = !!f && f.scrambled > 0 && f.alive;
  if (!on) { if (el.style.opacity !== '0') { el.style.opacity = '0'; resetLines = []; el.querySelector('pre').textContent = ''; } return; }
  el.style.opacity = '1';
  const now = performance.now();
  if (!resetLines.length) resetNext = 0; // just reset: fill the screen at once
  for (let n = resetLines.length ? 1 : 40; n > 0 && now >= resetNext; n--) {
    if (n === 1) resetNext = now + 70 + Math.random() * 90;
    const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    const line = RESET_LINES[Math.floor(Math.random() * RESET_LINES.length)].replace('{H}', hex()).replace('{P}', Math.floor(Math.random() * 100));
    resetLines.push(Math.random() < 0.3 ? `${hex()} ${hex()} ${hex()} ${hex()}` : line);
    if (resetLines.length > 60) resetLines.shift();
    el.querySelector('pre').textContent = resetLines.join('\n');
  }
  const left = f.scrambled / 60, total = (SPECIALS.computer?.resetFrames || 300) / 60;
  el.querySelector('.rs-time').textContent = `${left.toFixed(1)}s`;
  el.querySelector('.rs-bar i').style.width = `${Math.max(0, 100 * (1 - left / total)).toFixed(1)}%`;
}

// Oron's French moveset renames the touch buttons while it lasts
let baguetteButtons = false;
function setBaguetteButtons(on) {
  if (on === baguetteButtons) return;
  baguetteButtons = on;
  const p = document.querySelector('.tb[data-action="punch"]'), k = document.querySelector('.tb[data-action="kick"]');
  if (p) p.textContent = on ? 'STAB' : 'PUNCH';
  if (k) k.textContent = on ? 'SLASH' : 'KICK';
}
// the narrator says a fighter's name over their close-up
function sayName(def, queue = false) {
  const name = def.sayName || def.name.replace(/\(.*\)/, '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  narrate(name, { file: def.nameVoice, queue });
}
function introCard(f, side) {
  const el = $('#intro-card');
  if (!f) { el.hidden = true; return; }
  el.hidden = false;
  el.className = side ? 'right' : 'left';
  // just the name, big; a line under it only if the roster gives one (introLine)
  el.querySelector('.ic-tag').textContent = f.def.name;
  const line = el.querySelector('.ic-name');
  line.textContent = (f.def.introLine || '').toUpperCase();
  line.hidden = !f.def.introLine;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}

// a fighter lit up white from inside (k 0…1.4)
function rigGlow(rig, k) {
  const mats = rig.fallback ? rig.fallback.materials : rig.materials;
  for (const m of mats || []) m.emissive?.setScalar(k);
}

// the fatality's black frame: everything disappears except the victim, drawn pure white
let blackState = null;
const WHITE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
// things that turn themselves back on each frame (the arena banner, stun stars) are hidden again
// right before drawing
function keepBlack() {
  if (!blackState) return;
  for (const o of scene.children) {
    if (o === blackState.keep || o.isLight || !o.visible) continue;
    o.visible = false;
    if (!blackState.hidden.includes(o)) blackState.hidden.push(o);
  }
}
function blackout(keep) {
  if (keep && !blackState) {
    blackState = { bg: scene.background, hidden: [], mats: [], keep: keep.rig.object };
    for (const o of scene.children) if (o !== keep.rig.object && o.visible && !o.isLight) { o.visible = false; blackState.hidden.push(o); }
    scene.background = new THREE.Color('#000000');
    keep.rig.object.traverse((o) => { if (o.isMesh) { blackState.mats.push([o, o.material]); o.material = WHITE; } });
    document.body.classList.add('cinema');
  } else if (!keep && blackState) {
    for (const o of blackState.hidden) o.visible = true;
    for (const [o, mat] of blackState.mats) o.material = mat;
    scene.background = blackState.bg;
    blackState = null;
    document.body.classList.remove('cinema');
  }
}

// Shirley's night: every light dims, the sky goes dark blue, stars and a moon come out (k 0…1)
let night = null;
function setNight(k) {
  if (k <= 0 && !night) return;
  if (!night) {
    const lights = []; scene.traverse((o) => { if (o.isLight) lights.push([o, o.intensity]); });
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, (_, i) => (i % 3 === 0 ? (Math.random() - 0.5) * 60 : i % 3 === 1 ? 3 + Math.random() * 14 : -12 - Math.random() * 10)), 3)),
      new THREE.PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true, opacity: 0 }));
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64); grd.addColorStop(0, '#fffbe8'); grd.addColorStop(0.45, '#f4efd6'); grd.addColorStop(0.5, 'rgba(244,239,214,0.35)'); grd.addColorStop(1, 'rgba(244,239,214,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false }));
    moon.scale.setScalar(3.2);
    scene.add(stars, moon);
    const mats = new Set(); scene.traverse((o) => { for (const mm of [].concat(o.material || [])) if (mm.isMeshStandardMaterial) mats.add(mm); });
    night = { lights, stars, moon, bg: scene.background, fog: scene.fog.color.clone(), mats: [...mats] };
  }
  // pitch black: only a faint blue moonlight from the sky light so the fighters' shapes still read
  for (const [l, i] of night.lights) {
    l.intensity = i * (1 - (l.isHemisphereLight ? 0.8 : 0.96) * k);
    if (l.isHemisphereLight) { l.userData.day ??= { sky: l.color.clone(), ground: l.groundColor.clone() }; l.color.copy(l.userData.day.sky).lerp(new THREE.Color('#5d73c8'), k); l.groundColor.copy(l.userData.day.ground).lerp(new THREE.Color('#05060c'), k); }
  }
  nightLevel = k;
  for (const mm of night.mats) mm.envMapIntensity = (mm.userData.env ?? 1) * (1 - 0.95 * k);
  const dark = new THREE.Color('#010208');
  // (the flag plaza's sky is a picture: it fades from its horizon colour to black)
  if (!night.bgColor) night.bgColor = night.bg?.isColor ? night.bg.clone() : night.fog.clone();
  scene.background = night.bgColor.clone().lerp(dark, Math.min(1, k * 1.4));
  scene.fog.color.copy(night.fog).lerp(new THREE.Color('#010208'), k);
  night.stars.material.opacity = k;
  night.moon.material.opacity = k;
  night.moon.position.set(camPos.x + 5, camPos.y + 5, -14);
  if (k <= 0) {
    for (const [l, i] of night.lights) { l.intensity = i; if (l.userData.day) { l.color.copy(l.userData.day.sky); l.groundColor.copy(l.userData.day.ground); } }
    nightLevel = 0;
    for (const mm of night.mats) mm.envMapIntensity = mm.userData.env ?? 1;
    scene.background = night.bg;
    scene.fog.color.copy(night.fog);
    scene.remove(night.stars, night.moon);
    night.stars.geometry.dispose(); night.moon.material.map.dispose();
    night = null;
  }
}

// Minibar's SKADOOSH sends both fighters to the spirit world for the rest of the round: the arena
// is hidden and a golden sky with a floating island takes its place
let arenaObjects = [], spirit = null, nightLevel = 0;
function spiritWorld(on) {
  if (on && !spirit) {
    spirit = { hidden: arenaObjects.filter((o) => o.visible), group: buildSpiritWorld(), sky: spiritSky(), bg: scene.background, fog: scene.fog.color.clone() };
    for (const o of spirit.hidden) o.visible = false;
    scene.add(spirit.group);
    scene.background = spirit.sky;
    scene.fog.color.set('#ffd9a0');
  } else if (!on && spirit) {
    for (const o of spirit.hidden) o.visible = true;
    scene.remove(spirit.group);
    spirit.group.traverse((o) => { o.geometry?.dispose?.(); });
    spirit.sky.dispose();
    if (scene.background === spirit.sky) scene.background = spirit.bg;
    scene.fog.color.copy(spirit.fog);
    spirit = null;
  }
}
function updateSpiritWorld(time) {
  if (!spirit) return;
  for (const o of spirit.hidden) o.visible = false; // the arena banner turns itself back on
  spirit.group.userData.update?.(time);
  // golden petals drifting through
  if (Math.random() < 0.35) particles.burst(camPos.x + (Math.random() - 0.5) * 16, 4 + Math.random() * 3, -1 - Math.random() * 3, { count: 1, color: Math.random() < 0.6 ? '#ffe7a3' : '#ffb3c6', speed: 0.01, gravity: 0.0012, life: 120 });
}

// the fatality: the body bursts into white shards that fly out at the camera, then settle
let shards = [];
let shardGeo, shardMat;
function shatterBody(f) {
  shardGeo ||= new THREE.TetrahedronGeometry(0.1);
  shardMat ||= new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 170; i++) {
    const mesh = new THREE.Mesh(shardGeo, shardMat);
    const along = (Math.random() - 0.5) * 0.7;
    mesh.position.set(f.pos.x + along, 0.15 + Math.random() * 1.9, (Math.random() - 0.5) * 0.4);
    mesh.scale.setScalar(0.4 + Math.random() * 1.2);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    // most fly out toward the camera (+z), spreading wide
    const v = new THREE.Vector3(along * 0.12 + (Math.random() - 0.5) * 0.16, (Math.random() - 0.35) * 0.14, 0.04 + Math.random() * 0.2);
    scene.add(mesh);
    shards.push({ mesh, v, spin: (Math.random() - 0.5) * 0.4, life: 100 + Math.random() * 70 });
  }
  particles.burst(f.pos.x, 1, 0.5, { count: 40, color: '#ffffff', speed: 0.16 });
  whiteFlash(650);
  app.shake = 0.6;
  sfx.thud();
}
// a special that finishes them blows them apart (Or Haim's explosion): chunks in their colours
// and fire fly out from the body in every direction, and they're gone for the rest of the round
const chunkGeo = new THREE.DodecahedronGeometry(0.09, 0), chunkMats = new Map();
function explodeBody(f, fire = ['#ffb347', '#ff6a1a', '#7a3cc8', '#15101c']) {
  const c = f.def.colors || {}, cols = [c.skin || '#d9a98a', c.shirt || '#6b6b3a', c.pants || '#3a3a2a', c.hair || '#2a1a12', '#2a1410'];
  const mid = new THREE.Vector3(f.pos.x, f.pos.y + 1.1, 0);
  // their body in real pieces (head, chest, arms, legs…), scorched, flung everywhere; and gore
  blownUp.push(new BodyPieces(scene, f, mid.clone().add(new THREE.Vector3(-(f.facing || 1) * 0.4, -0.3, 0))));
  particles.burst(mid.x, mid.y, 0.4, { count: 60, color: '#8a0c0c', speed: 0.22, gravity: 0.006, life: 44 });
  for (let i = 0; i < 40; i++) {
    const col = cols[i % cols.length];
    if (!chunkMats.has(col)) chunkMats.set(col, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
    const mesh = new THREE.Mesh(chunkGeo, chunkMats.get(col));
    mesh.position.copy(mid).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.4));
    mesh.scale.setScalar(0.5 + Math.random() * 1.6);
    const dir = mesh.position.clone().sub(mid).normalize(), sp = 0.08 + Math.random() * 0.2;
    const v = dir.multiplyScalar(sp).add(new THREE.Vector3(0, 0.06 + Math.random() * 0.08, 0.03 + Math.random() * 0.08));
    scene.add(mesh);
    shards.push({ mesh, v, spin: (Math.random() - 0.5) * 0.5, life: 120 + Math.random() * 80 });
  }
  void fire; // (the fire is the explosion's own)
  f.exploded = true;
  f.dizzy = 0;
  whiteFlash(500);
  app.shake = 0.9;
  sfx.thud();
}
let blownUp = []; // bodies blown to pieces (Or Haim's explosion finishing them)
function clearBlownUp() { for (const b of blownUp) b.dispose(); blownUp = []; }
function updateShards(k) {
  for (const b of blownUp) { b.update(k); b.smoke(particles); }
  for (const s of shards) {
    s.v.y -= 0.0045 * k;
    s.mesh.position.addScaledVector(s.v, k);
    if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.v.y *= -0.3; s.v.x *= 0.6; s.v.z *= 0.6; }
    s.mesh.rotation.x += s.spin * k; s.mesh.rotation.y += s.spin * 0.7 * k;
    s.life -= k;
    if (s.life < 25) s.mesh.scale.multiplyScalar(Math.pow(0.93, k));
  }
  for (const s of shards.filter((x) => x.life <= 0)) scene.remove(s.mesh);
  shards = shards.filter((x) => x.life > 0);
}
function clearShards() { for (const s of shards) scene.remove(s.mesh); shards = []; blackout(null); clearExplosions(); clearBlownUp(); }

// character select: a glowing blue ring on the floor and the fighter appears lit up white
function beamIn(actor) {
  const x = actor.x;
  rings.spawn(x, 0.04, '#3aa8ff', { grow: 0.1, life: 34 });
  rings.spawn(x, 0.05, '#bfe6ff', { grow: 0.06, life: 24 });
  actor.rig.flash();
}
function updateBeams() {}

// ── announcer overlay ────────────────────────────────────────────────────────
let annTimer;
function showAnnounce(text, { cls = '', sub = '', ms = 1200 } = {}) {
  const box = $('#announce');
  box.innerHTML = '';
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  if (sub) {
    const em = document.createElement('em');
    em.textContent = sub;
    span.appendChild(em);
  }
  box.appendChild(span);
  clearTimeout(annTimer);
  if (ms) annTimer = setTimeout(() => { box.innerHTML = ''; }, ms);
}
function clearAnnounce() { clearTimeout(annTimer); $('#announce').innerHTML = ''; }

// ── menus ────────────────────────────────────────────────────────────────────
class Menu {
  constructor(root, onPick, onBack) {
    const all = $$('[data-nav]', root);
    this.all = all;
    this.i = 0;
    this.onPick = onPick;
    this.onBack = onBack;
    all.forEach((b) => {
      b.addEventListener('click', () => { unlockAudio(); this.i = Math.max(0, this.items.indexOf(b)); this.render(); sfx.confirm(); onPick(b.dataset.nav, b); });
      b.addEventListener('pointerenter', () => { const i = this.items.indexOf(b); if (i >= 0 && this.i !== i) { this.i = i; this.render(); sfx.move(); } });
    });
  }

  // the buttons showing now (some come and go: SEE FATALITY only in practice...)
  get items() { return this.all.filter((b) => !b.hidden); }

  handle(c) {
    const n = this.items.length;
    const was = this.i;
    if (c.pressed.up) { this.i = (this.i + n - 1) % n; sfx.move(); }
    if (c.pressed.down) { this.i = (this.i + 1) % n; sfx.move(); }
    this.render(this.i !== was);
    if (c.pressed.confirm) { unlockAudio(); sfx.confirm(); this.onPick(this.items[this.i].dataset.nav, this.items[this.i]); }
    else if (c.pressed.back && this.onBack) this.onBack();
  }

  // scroll: only when the keyboard / controller moved the highlight. (Doing it every frame fought
  // a finger scrolling the menu, and the menu jittered up and down.)
  render(scroll = false) {
    this.items.forEach((b, i) => b.classList.toggle('focus', i === this.i));
    // a screen that scrolls (short screens): keep the picked button in view
    const scr = this.items[this.i]?.closest('.screen');
    if (scroll && scr && scr.scrollHeight > scr.clientHeight) this.items[this.i].scrollIntoView({ block: 'nearest' });
  }
}

const titleMenu = new Menu($('#screen-title'), (nav) => {
  if (nav === '1p' || nav === '2p') { app.practice = false; enterSelect(nav); }
  // practice: pick your fighter and a dummy to try combos and specials on
  if (nav === 'practice') { app.practice = true; enterSelect('1p'); }
  if (nav === 'online') openOnline();
  if (nav === 'tourney') openTourney();
  if (nav === 'level') {
    app.level = LEVELS[(LEVELS.indexOf(app.level) + 1) % LEVELS.length];
    try { localStorage.setItem('fk-level', app.level); } catch { /* ignore */ }
    renderLevel();
  }
  if (nav === 'settings') openSettings('title');
  if (nav === 'help') openHelp('title');
  if (nav === 'create') openCreate();
});
function renderLevel() { $('#level-val').textContent = app.level.toUpperCase(); }

// Graphics settings screen: each button steps through its choices
// SETTINGS: three tabs (each its own screen with the same tab bar): controls, graphics, audio.
// Tap a tab, or Q / E on a keyboard, LB / RB on a controller.
let settingsReturn = 'title';
const SETTINGS_TABS = ['controls', 'graphics', 'audio'];
function closeSettings() { show(`screen-${settingsReturn}`); }
function openSettings(from, tab = 'controls') { settingsReturn = from; openTab(tab); }
function openTab(tab) {
  if (tab === 'controls') { controlsScreen.open(); show('screen-controls'); }
  if (tab === 'graphics') { graphicsMenu.i = 0; renderGraphicsMenu(); graphicsMenu.render(); show('screen-graphics'); }
  if (tab === 'audio') { audioMenu.i = 0; renderAudioMenu(); audioMenu.render(); show('screen-audio'); }
  for (const b of $$('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  menuCtrl.flush();
}
function stepTab(d) {
  const i = SETTINGS_TABS.indexOf(app.screen);
  if (i < 0 || (app.screen === 'controls' && controlsScreen.listening)) return;
  sfx.move();
  openTab(SETTINGS_TABS[(i + d + SETTINGS_TABS.length) % SETTINGS_TABS.length]);
}
for (const b of $$('.tab')) b.addEventListener('click', () => { unlockAudio(); if (app.screen !== b.dataset.tab) { sfx.move(); openTab(b.dataset.tab); } });
addEventListener('keydown', (e) => { if (e.code === 'KeyQ') stepTab(-1); if (e.code === 'KeyE') stepTab(1); });
let padShoulders = [false, false];
function pollTabPads() { // LB / RB, on a press
  let lb = false, rb = false;
  for (const pad of hub.pads) { lb ||= !!pad.buttons[4]?.pressed; rb ||= !!pad.buttons[5]?.pressed; }
  if (lb && !padShoulders[0]) stepTab(-1);
  if (rb && !padShoulders[1]) stepTab(1);
  padShoulders = [lb, rb];
}
const graphicsMenu = new Menu($('#screen-graphics'), (nav) => {
  if (nav === 'back') { closeSettings(); return; }
  quality.cycle(nav);
}, closeSettings);
const audioMenu = new Menu($('#screen-audio'), (nav) => {
  if (nav === 'back') { closeSettings(); return; }
  if (nav === 'sound') setMuted(!isMuted());
  if (nav === 'volume') setVolume(getVolume() >= 1 ? 0 : getVolume() + 0.1);
  renderAudioMenu();
}, closeSettings);
for (const st of $$('#screen-audio .step')) st.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); setVolume(getVolume() + 0.1 * +st.dataset.vol); renderAudioMenu(); sfx.move(); });
function renderAudioMenu() {
  $('#aud-sound').textContent = isMuted() ? 'OFF' : 'ON';
  $('#aud-volume').textContent = `${Math.round(getVolume() * 100)}%`;
}
const LEVEL_NAME = ['LOW', 'MEDIUM', 'HIGH'];
function renderGraphicsMenu() {
  const s = quality.settings, auto = (v, now) => (v === 'auto' ? `AUTO (${now})` : null);
  const val = {
    preset: s.preset === 'auto' ? `AUTO (${LEVEL_NAME[quality.level]})` : LEVEL_NAME[s.preset],
    res: auto(s.res, `${quality.pixelRatio}×`) ?? `${s.res}×`,
    shadows: auto(s.shadows, quality.shadows.toUpperCase()) ?? s.shadows.toUpperCase(),
    bloom: s.bloom.toUpperCase(),
    hd: s.hd.toUpperCase() + (quality.hdWanted !== quality.hdModels ? ' · RELOAD' : ''),
    fps: s.fps.toUpperCase(),
    cap: s.cap === 'off' ? 'OFF' : `${s.cap} FPS`,
  };
  for (const [k, v] of Object.entries(val)) { const el = $(`#gfx-${k}`); if (el) el.textContent = v; }
}

let helpReturn = 'title';
const helpMenu = new Menu($('#screen-help'), () => show(`screen-${helpReturn}`), () => show(`screen-${helpReturn}`));
function openHelp(from) { helpReturn = from; renderHelpKeys(); renderHelpSpecials(); show('screen-help'); }

const controlsScreen = new ControlsScreen($('#screen-controls'), hub, {
  onClose: closeSettings,
  onChange: () => { renderHelpKeys(); },
  onEditTouch: () => { $('#screen-controls').hidden = true; touchEditor.open(); }, // just the arena + buttons while arranging
});
const touchEditor = new TouchEditor($('#touch'), $('#touch-edit'), { onClose: () => show('screen-controls') });
applyLayout($('#touch'));
// How to play → special moves: one row per fighter, straight from the roster and move data
const SPECIAL_INFO = {
  lasso: { dmg: (d) => d, effect: 'Electric cable ties them up and shocks them for about 1 s, then they drop' },
  projectile: { dmg: (d) => d, effect: 'A homing blast' },
  tiger: { dmg: (d) => d, effect: 'Calls a tiger that runs at them, pounces and bites (knockdown)' },
  weight: { dmg: (d) => d, effect: 'Thrown weight dazes them on the spot for 1 s (seeing stars, can\'t act): walk in and combo them' },
  smoke: { dmg: (d) => `${d} + 12 poison`, effect: 'Poison over 2 s; their screen fills with smoke and she vanishes for 4 s (only a faint shape when she is close enough to hit them)' },
  happiness: { dmg: (d) => d, effect: "Too happy to attack or block for 2 s" },
  shatter: { dmg: (d) => d, effect: 'Turns into a skeleton that falls apart into a pile of bones; the bones fly through the opponent (held in place), rebuild into the skeleton on their other side and become Snir again (5 hits; they stay where they are, stunned)' },
  foot: { dmg: (d) => d, effect: 'Turns into a giant foot and stomps them flat' },
  flagpole: { dmg: (d) => d, effect: 'Spins around a flag pole, kicking 3 times' },
  cage: { dmg: () => '1.4 per ¼ s + 14', effect: 'Bamboo cage for up to 5 s: no specials, punch your way out; when it breaks he grabs a stalk and spin-slams them' },
  night: { dmg: () => '—', effect: "The map turns to night and she disappears for 7 s: the opponent's punches and kicks all miss her (they only see themselves getting hit). Gold Ori shines in the dark: while he's gold she can be seen and hit. Can be used at the same time as another special" },
  nunchaku: { dmg: (d) => d, effect: 'Her military dog tags on their chain as nunchucks, ninja style: she rushes in with a 7-hit combo of swings, spins and catches (the last one launches them)' },
  mirror: { dmg: (d) => d, effect: 'Looks in a mirror and his reflection turns into a terrorist: he becomes him, stabs the mirror to pieces, then dashes in and stabs the opponent 6 times all over the body (they stay standing where they are), then he is Talel again' },
  whip: { dmg: (d) => d, effect: 'Teaches you a lesson: three cracks of his whip (they can\'t move meanwhile, and on the last one they drop to their knees)' },
  guitar: { dmg: (d) => `${d} over 1.5 s`, effect: "A guitar solo through two gigantic speakers that rise up behind him: their sound waves hurt, and the opponent holds their ears and can't act for 1.5 s" },
  satellite: { dmg: (d) => d, effect: 'Calls in a satellite on his walkie-talkie: it locks its laser sight on them and fires a barrage of 6 plasma bolts (the last one knocks them down)' },
  darkness: { dmg: () => '20 + 5', effect: 'Summons his alter ego Hoshech Mavet from his shadow: he dashes behind them with a scythe, both attack at once, kick them into the air, then Hoshech Mavet jumps and explodes' },
  france: { dmg: () => '—', effect: "Viva la France! Turns French for 8 s: a baguette (+50% reach and +20% damage on punches and kicks; kicks become slashes that break blocks) and a French-flag aura. Can be used at the same time as another special, and his French time stands still while the opponent's special plays. On gold Ori the baguette breaks: still French, but plain punches and kicks" },
  skadoosh: { dmg: (d) => d, effect: 'Turns into Kung Fu Panda, Wuxi finger hold, SKADOOSH: both go to the spirit world for the rest of the round, then the Dragon Warrior\'s golden chi dragon hits them' },
  computer: { dmg: (d) => d, effect: 'Throws a computer: factory reset, their buttons do each other\'s jobs (a random mix every time) for 5 s' },
  quake: { dmg: (d) => d, effect: 'Darbuka earthquake: his beat shakes the ground and a crack runs to them; damage, and they move at half speed for 4 s' },
  gold: { dmg: () => '—', effect: "Turns to gold for 3 s: nothing can hurt him and his hits go through blocks. A special used on him plays out but does no damage and has no effect (it bounces off or breaks on the gold), and he stays gold until it's over, then the gold breaks. Can be used at the same time as another special" },
  cough: { dmg: () => '19.5 over 9 s', effect: 'Poison cough: 2.25 per second for 9 s, and they deal half damage meanwhile. Then she is on an I.V. for the rest of the round: a combo ending with a kick becomes an I.V. SWING' },
  dash: { dmg: (d) => d, effect: 'Rushing charge' },
  uppercut: { dmg: (d) => d, effect: 'Rising uppercut' },
  slam: { dmg: (d) => d, effect: 'Ground slam shockwave' },
  teleport: { dmg: (d) => d, effect: 'Teleports behind them and strikes' },
};
function customSpecialText(sp) {
  const how = { projectile: 'a shot', shot: 'a shot', beam: 'a beam', dash: 'dashes through', teleport: 'teleports behind', sky: 'from the sky', blast: 'a blast', summon: 'summons a beast', stomp: 'a giant stomp', cage: 'a cage', clones: 'shadow clones', quake: 'an earthquake' };
  const steps = sp.steps || [{ kind: sp.delivery, hits: sp.hits || 1 }];
  const fx = (sp.onHit || []).map((k) => ({ knockdown: 'knocks down', launch: 'launches', push: 'pushes away', pull: 'pulls in', daze: 'dazes', freeze: 'freezes', slow: 'slows', poison: 'poisons', blind: 'blinds' }[k])).filter(Boolean);
  const said = steps.map((st) => `${how[st.kind] || ''}${st.hits > 1 ? ` (${st.hits} hits)` : ''}`).join(', then ');
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}${fx.length ? `; ${fx.join(', ')}` : ''}`;
}
function renderHelpSpecials() {
  const body = $('#help-specials');
  body.innerHTML = '';
  for (const def of ROSTER) {
    if (!def.special) continue;
    const info = def.special.type === 'custom' ? { dmg: (d) => d, effect: customSpecialText(def.special) } : SPECIAL_INFO[def.special.type] || { dmg: (d) => d, effect: '' };
    const tr = document.createElement('tr');
    for (const text of [def.name, def.special.name, info.dmg(specialFor(def).damage), info.effect]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}
function renderHelpKeys() {
  const body = $('#help-keys');
  body.innerHTML = '';
  for (const [action, name] of BINDABLE) {
    const tr = document.createElement('tr');
    for (const text of [name, bindingLabel('p1', action), bindingLabel('p2', action), bindingLabel('pad', action)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

// trying a special from the editor: QUIT (and fighter select) go back to the editor
function setQuitLabel() { const b = $('#screen-pause [data-nav=title]'); if (b) b.textContent = app.returnTo ? 'BACK TO THE EDITOR' : 'QUIT TO TITLE'; }
function leaveToEditor() { const back = app.returnTo; app.returnTo = null; setQuitLabel(); enterTitle(); back(); }
const pauseMenu = new Menu($('#screen-pause'), (nav) => {
  if (app.returnTo && (nav === 'title' || nav === 'select')) return leaveToEditor();
  if (app.tmatch && nav === 'title') return tourneyForfeit();
  if (app.tmatch && (nav === 'restart' || nav === 'select')) return;
  if (nav === 'resume') resume();
  if (nav === 'restart') startMatch(app.match.defs);
  if (nav === 'select') enterSelect(app.mode);
  if (nav === 'settings') openSettings('pause');
  if (nav === 'help') openHelp('pause');
  if (nav === 'title') enterTitle();
}, () => resume());

const resultMenu = new Menu($('#screen-result'), (nav) => {
  if (app.tmatch) return; // tournament: goes back to the bracket by itself
  if (app.mode === 'online') return onlineResult(nav);
  if (nav === 'rematch') startMatch(app.match.defs);
  if (nav === 'select') enterSelect(app.mode);
  if (nav === 'title') enterTitle();
});

const leaveMenu = new Menu($('#screen-leave'), (nav) => {
  if (nav === 'ff') { forfeitOnline(); return; }
  if (nav === 'leave') { if (app.tmatch) return tourneyForfeit(); net.leave(); endOnline('You left the match.'); } else show('screen-fight');
}, () => show('screen-fight'));

function pause() {
  if (!app.match || app.match.phase === 'over') return;
  if (app.mode === 'watch') { stopWatching(); return; } // watching: the pause button just goes back
  if (app.mode === 'online') { leaveMenu.i = 0; leaveMenu.render(); menuCtrl.flush(); show('screen-leave'); return; }
  app.paused = true;
  // tournament match vs the CPU: no restarting or re-picking; quitting is a forfeit
  for (const b of $$('#screen-pause [data-nav=restart], #screen-pause [data-nav=select]')) b.hidden = !!app.tmatch;
  $('#screen-pause [data-nav=title]').textContent = app.tmatch ? 'FORFEIT MATCH' : app.returnTo ? 'BACK TO THE EDITOR' : 'QUIT TO TITLE';
  pauseMenu.i = 0;
  menuCtrl.flush(); // the Esc that paused is also the menu's 'back': don't let it close the menu at once
  show('screen-pause');
  stopMusic();
}
function resume() {
  app.paused = false;
  show('screen-fight');
  app.ctrls.forEach((c) => c.flush());
  startMusic();
}

// ── stage actors (title + select previews) ───────────────────────────────────
const actorCache = new Map();
const actors = [null, null];
function setActor(side, def, x) {
  const key = `${side}:${def.id}`;
  if (actors[side]?.key === key) return actors[side];
  if (actors[side]) scene.remove(actors[side].rig.object);
  let a = actorCache.get(key);
  if (!a) {
    a = { key, def, rig: createRig(def), t: 0, anim: 'select' };
    actorCache.set(key, a);
  }
  a.x = x;
  a.t = 0;
  a.rig.setFacing(side === 0 ? 1 : -1);
  a.rig.object.position.set(x, 0, 0);
  scene.add(a.rig.object);
  actors[side] = a;
  if (app.screen === 'select') beamIn(a);
  return a;
}
function clearActors() {
  for (let i = 0; i < 2; i++) if (actors[i]) { scene.remove(actors[i].rig.object); actors[i] = null; }
}

// ── title ────────────────────────────────────────────────────────────────────
function enterTitle() {
  if (app.mode === 'online') { net.leave(); app.mode = '1p'; }
  endMatch();
  confetti?.stop();
  clearAnnounce();
  app.paused = false;
  const pool = ROSTER.filter((d) => !d.locked);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  if (b === a && pool.length > 1) b = pool[(pool.indexOf(a) + 1) % pool.length];
  setActor(0, a, -2.4).anim = 'taunt';
  setActor(1, b, 2.4).anim = 'idle';
  titleMenu.i = 0;
  titleMenu.render();
  show('screen-title');
  stopMusic();
}

// ── character select ─────────────────────────────────────────────────────────
const grid = $('#grid');
const tiles = [];
const RANDOM = { id: '__random', name: 'RANDOM', random: true };
// as many columns as it takes for two rows on a wide screen (more in portrait), so every
// fighter fits on a phone without scrolling; the grid scrolls if it still doesn't fit
function sizeGrid(n = tiles.length) {
  const wide = vp.w > vp.h;
  const cols = wide ? Math.min(12, Math.ceil(n / 2)) : Math.min(6, Math.ceil(n / 4));
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', Math.ceil(n / cols));
  sel.cols = cols; // the keyboard / controller cursor moves by these rows
}
addEventListener('resize', () => sizeGrid());
function buildGrid() {
  const entries = [...ROSTER, RANDOM, ...Array.from({ length: LOCKED_SLOTS }, (_, i) => ({ id: `__locked${i}`, name: 'LOCKED', locked: true }))];
  sizeGrid(entries.length);
  grid.innerHTML = '';
  tiles.length = 0;
  entries.forEach((def, i) => {
    const el = document.createElement('button');
    el.className = 'tile' + (def.locked ? ' locked' : '');
    el.setAttribute('aria-label', def.name);
    const ini = def.random ? '?' : def.locked ? '🔒' : def.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
    el.innerHTML = `<span class="ini">${ini}</span><span class="lbl"></span>`;
    el.querySelector('.lbl').textContent = def.locked ? '' : def.name;
    el.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    el.addEventListener('click', () => { unlockAudio(); pointerPick(i, lastPointer === 'mouse'); });
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pointerHover(i); });
    grid.appendChild(el);
    tiles.push({ el, def });
  });
}

const sel = { cursor: [0, 1], locked: [false, false], cols: 5, done: false };

function enterSelect(mode) {
  endMatch();
  confetti?.stop();
  clearAnnounce();
  app.paused = false;
  app.mode = mode;
  app.ctrls = fightControllers(mode);
  sel.randomPicks = [null, null]; // a fresh random fighter every time
  if (mode === 'online') { sel.cursor = [0, 1]; sel.randomPicks = [null, null]; app.lockstep = null; app.rematch = [false, false]; $('#net-wait').hidden = true; }
  sel.locked = [false, false];
  sel.tapped = [null, null];
  sel.done = false;
  const keep = sel.cursor[0] < tiles.length ? sel.cursor : [0, 1];
  sel.cursor = [...keep];
  show('screen-select');
  stopMusic();
  renderSelect();
  if (mode === 'online') syncSel(net.side);
  if (app.tmatch) setTimeout(tourneyAutoPick, 400);
}

// later tournament rounds: you fight with the fighter you picked the first time
function tourneyAutoPick() {
  const t = app.tFighter;
  if (!app.tmatch || app.screen !== 'select' || !t || t.code !== tourney.s?.code) return;
  const side = app.mode === 'online' ? net.side : 0;
  const k = tiles.findIndex((x) => x.def.id === t.id);
  if (k < 0 || sel.locked[side]) return;
  sel.cursor[side] = k;
  sel.randomPicks[side] = null;
  if (app.mode === 'online') syncSel(side);
  lockIn(side);
}

function activeSide() {
  if (app.mode === 'online') return net.side;
  // which player's cursor a mouse/touch or (in 1P) the only controller moves
  return sel.locked[0] ? 1 : 0;
}

function pointerHover(i) {
  if (app.screen !== 'select' || sel.done) return;
  const side = activeSide();
  if (sel.locked[side]) return;
  if (sel.cursor[side] !== i) { sel.cursor[side] = i; sfx.move(); renderSelect(); syncSel(side); }
}

// how the last tile was pressed: a mouse already showed the fighter by hovering, so one click picks
let lastPointer = '';
function pointerPick(i, mouse = false) {
  if (app.screen !== 'select' || sel.done) return;
  const side = activeSide();
  if (sel.locked[side]) return;
  if (mouse) {
    if (sel.cursor[side] !== i) { sel.cursor[side] = i; syncSel(side); }
    if (sel.tapped) sel.tapped[side] = null;
    lockIn(side);
    return;
  }
  // first tap selects (shows the fighter), a second tap on the same one locks it in
  if (sel.tapped?.[side] === i && sel.cursor[side] === i) { sel.tapped[side] = null; lockIn(side); return; }
  sel.tapped ||= [null, null];
  sel.tapped[side] = i;
  if (sel.cursor[side] !== i) { sel.cursor[side] = i; sfx.move(); syncSel(side); }
  renderSelect();
}

function lockIn(side) {
  const t = tiles[sel.cursor[side]];
  if (t.def.locked) { sfx.block(); return; }
  sel.randomPicks[side] = null; // RANDOM rolls again on every pick
  sel.locked[side] = true;
  sfx.confirm();
  const def = resolvePick(side);
  // a tournament: the fighter you pick first is yours for every round
  if (app.tmatch && side === (app.mode === 'online' ? net.side : 0)) app.tFighter = { code: tourney.s?.code, id: def.id };
  announce(def.name.replace(/\(.*\)/, ''), { rate: 0.95, pitch: 0.6 });
  if (actors[side]) { actors[side].anim = 'win'; actors[side].t = 0; }
  renderSelect();
  if (app.mode === 'online') { syncSel(side); onlineMaybeGo(); return; }
  // tournament vs a CPU: its fighter is already decided
  if (app.tmatch?.cpu && side === 0) {
    const k = tiles.findIndex((t) => t.def.id === app.tmatch.cpu);
    if (k >= 0) { sel.cursor[1] = k; sel.locked[1] = true; renderSelect(); }
  }
  // practice: no opponent to pick, it's the training dummy
  if (practicing() && side === 0) {
    sel.done = true;
    setTimeout(() => { if (app.screen === 'select' && sel.done) startMatch([resolvePick(0), DUMMY]); }, 700);
    return;
  }
  if (sel.locked[0] && sel.locked[1]) {
    sel.done = true;
    setTimeout(() => showVersus([resolvePick(0), resolvePick(1)]), 700);
  }
}

sel.randomPicks = [null, null];
function resolvePick(side) {
  const def = tiles[sel.cursor[side]].def;
  if (!def.random) return def;
  if (!sel.locked[side]) return def;
  if (!sel.randomPicks[side]) {
    const pool = ROSTER.filter((d) => !d.locked);
    sel.randomPicks[side] = pool[Math.floor(Math.random() * pool.length)];
  }
  return sel.randomPicks[side];
}

function unlockLast() {
  if (app.tmatch && app.mode === '1p') { if (sel.locked[0] && !sel.done) { sel.locked[0] = false; sel.randomPicks = [null, null]; renderSelect(); } return; }
  if (app.mode === 'online') {
    const s = net.side;
    if (!sel.locked[s]) { if (!app.tmatch) openOnline(); return; }
    sel.locked[s] = false; sel.randomPicks[s] = null; sfx.move(); renderSelect(); syncSel(s); return;
  }
  if (sel.locked[1]) sel.locked[1] = false;
  else if (sel.locked[0]) sel.locked[0] = false;
  else return enterTitle();
  sel.randomPicks = [null, null];
  sfx.move();
  renderSelect();
}

function moveCursor(side, c) {
  const n = tiles.length, cols = sel.cols;
  let i = sel.cursor[side];
  if (c.pressed.left) i = (i + n - 1) % n;
  if (c.pressed.right) i = (i + 1) % n;
  if (c.pressed.up) i = i - cols >= 0 ? i - cols : i;
  if (c.pressed.down) i = i + cols < n ? i + cols : i;
  if (i !== sel.cursor[side]) { sel.cursor[side] = i; sfx.move(); renderSelect(); syncSel(side); }
}

function selectLogic() {
  if (sel.done) return;
  if (app.mode === 'online') {
    menuCtrl.update();
    const side = net.side;
    if (!sel.locked[side]) {
      moveCursor(side, menuCtrl);
      if (menuCtrl.pressed.confirm) lockIn(side);
    }
    if (menuCtrl.pressed.back) unlockLast();
    return;
  }
  if (app.mode === '1p') {
    menuCtrl.update();
    const c = menuCtrl;
    const side = activeSide();
    moveCursor(side, c);
    if (c.pressed.confirm) lockIn(side);
    else if (c.pressed.back) unlockLast();
  } else {
    app.ctrls.forEach((c, side) => {
      c.update();
      if (!sel.locked[side]) {
        moveCursor(side, c);
        if (c.pressed.confirm || c.pressed.punch) lockIn(side);
      }
      if (c.pressed.back) unlockLast();
    });
  }
}

function renderSelect() {
  const one = app.mode === '1p';
  const online = app.mode === 'online';
  $('#sel-head').textContent = one && sel.locked[0] && !app.tmatch ? 'CHOOSE YOUR OPPONENT' : 'CHOOSE YOUR FIGHTER';
  $('#sel-sub').textContent = app.tmatch ? `tournament ${roundName(tourney.s, app.tmatch.r).toLowerCase()} vs ${app.tmatch.oppName}${app.tFighter?.code === tourney.s?.code ? '' : ' · you keep this fighter all tournament'}`
    : online ? `online vs ${net.opponent || 'friend'} · room ${net.roomCode}` : one
    ? (practicing() ? 'practice · pick your fighter, then hit the training dummy' : `vs computer · ${app.level}`)
    : `P1 ${hub.padCount() >= 2 ? 'controller 1' : 'keyboard'} · P2 ${hub.padCount() >= 2 ? 'controller 2' : hub.padCount() === 1 ? 'controller' : 'arrow keys'}`;
  // online: there's no start button, so say what to do and what we're waiting for
  const hint = $('#sel-hint');
  const pick = activeSide(), tappedOne = sel.tapped?.[pick] != null && sel.tapped[pick] === sel.cursor[pick] && !sel.locked[pick];
  hint.hidden = !online && !tappedOne;
  if (online) {
    const me = net.side, them = 1 - me, who = net.opponent || 'your friend';
    hint.textContent = !sel.locked[me] ? (tappedOne ? 'Tap again to lock in' : matchMedia('(hover: none)').matches ? 'Tap a fighter, then tap again to lock in. The fight starts when you\'re both locked in.' : 'Pick a fighter. The fight starts when you\'re both locked in.')
      : !sel.locked[them] ? `Locked in! Waiting for ${who} to pick…`
        : 'Both ready. Starting!';
  } else if (tappedOne) hint.textContent = 'Tap again to lock in';
  tiles.forEach((t, i) => {
    const c1 = sel.cursor[0] === i, c2 = sel.cursor[1] === i && (!one || sel.locked[0]);
    t.el.classList.toggle('c1', c1);
    t.el.classList.toggle('c2', c2);
    t.el.querySelectorAll('.who').forEach((w) => w.remove());
    if (c1) t.el.insertAdjacentHTML('beforeend', '<span class="who w1">1</span>');
    if (c2 && !practicing()) t.el.insertAdjacentHTML('beforeend', `<span class="who w2">${one ? 'CPU' : '2'}</span>`);
    if (online) t.el.querySelectorAll('.who').forEach((w) => { w.textContent = (w.classList.contains('w1') ? 0 : 1) === net.side ? 'YOU' : 'P' + (w.classList.contains('w1') ? 1 : 2); });
  });
  for (const side of [0, 1]) {
    const plate = $(`.plate.p${side + 1}`);
    const dummy = side === 1 && practicing(); // practice: the training dummy over there, from the start
    const visible = side === 0 || !one || sel.locked[0] || dummy;
    plate.style.visibility = visible ? 'visible' : 'hidden';
    const shown = dummy ? DUMMY : resolvePick(side);
    const def = shown.locked ? { name: 'LOCKED', tagline: 'Coming soon' } : shown;
    plate.querySelector('.tag').textContent = online ? (side === net.side ? `YOU · ${app.account?.name || ''}` : (net.opponent || 'FRIEND')) : side === 0 ? 'P1' : dummy ? 'PRACTICE' : one ? 'CPU' : 'P2';
    plate.querySelector('.nm').textContent = def.name;
    plate.querySelector('.tl').textContent = def.random ? 'Let fate decide' : def.tagline || '';
    if (def.special && !def.dummy) {
      const sp = specialFor(def);
      plate.querySelector('.sp').textContent = `SPECIAL · ${def.special.name} · ${sp.damage} DMG · ONCE PER ROUND`;
    } else plate.querySelector('.sp').textContent = '';
    plate.classList.toggle('locked', sel.locked[side]);
    // 3D preview
    if (visible && !shown.locked && !shown.random) {
      const a = setActor(side, shown, side === 0 ? -1.7 : 1.7);
      if (dummy) a.anim = 'dummy';
      else if (!sel.locked[side] && a.anim !== 'select') a.anim = 'select';
    } else if (actors[side]) {
      scene.remove(actors[side].rig.object);
      actors[side] = null;
    }
  }
}

// ── versus splash ────────────────────────────────────────────────────────────
function showVersus(defs) {
  const vs = $('#screen-vs');
  defs.forEach((d, i) => {
    const card = $(`.vs-card.p${i + 1}`, vs);
    card.querySelector('img').src = app.portraits[d.id] || '';
    card.querySelector('.nm').textContent = d.name;
  });
  show('screen-vs');
  sfx.gong();
  announce(`${defs[0].name.replace(/\(.*\)/, '')}. versus. ${defs[1].name.replace(/\(.*\)/, '')}`, { rate: 1, pitch: 0.5 });
  setTimeout(() => { if (app.screen === 'vs') startMatch(defs); }, 2300);
}

// ── controllers per mode ─────────────────────────────────────────────────────
function fightControllers(mode) {
  hub.poll();
  const pads = hub.padCount();
  if (mode === 'online') return [new FrameController(), new FrameController()];
  if (mode === '1p') {
    return [
      new Controller(hub, [{ keys: 'p1' }, { keys: 'p2' }, { pad: 0 }, { pad: 1 }, { touch: true }]),
      new Controller(hub, []),
    ];
  }
  if (pads >= 2) {
    return [
      new Controller(hub, [{ keys: 'p1' }, { pad: 0 }, { touch: true }]),
      new Controller(hub, [{ keys: 'p2' }, { pad: 1 }]),
    ];
  }
  return [
    new Controller(hub, [{ keys: 'p1' }, { touch: true }]),
    new Controller(hub, [{ keys: 'p2' }, { pad: 0 }]),
  ];
}

// ── the match ────────────────────────────────────────────────────────────────
class Match {
  constructor(defs, mode, level) {
    this.defs = defs;
    this.mode = mode;
    this.fighters = defs.map((d, i) => new Fighter(d, i, this));
    const [a, b] = this.fighters;
    a.opponent = b;
    b.opponent = a;
    for (const f of this.fighters) scene.add(f.rig.object);
    // Or Haim's special summons his alter ego Hoshech Mavet: a second, darkened copy of him
    // (built now so it's ready the moment he's called; the effect adds it to the scene)
    for (const f of this.fighters) {
      if (f.def.special?.type !== 'darkness') continue;
      const rig = f.shadowRig = createRig(f.def);
      rig.ready = rig.ready.then(() => {
        const mats = rig.fallback ? rig.fallback.materials : rig.materials;
        darkSkin(mats, true); // Or Haim with black skin (his clothes stay the same)
      });
    }
    // Oron turns into his French model during VIVA LA FRANCE: load it now, hidden
    for (const f of this.fighters) {
      if (!f.def.specialModel) continue;
      f.altRig = createRig({ ...f.def, model: f.def.specialModel, ...(f.def.specialRig || {}) });
      f.altRig.object.visible = false;
      scene.add(f.altRig.object);
    }
    for (const d of defs) { preloadClip(d.nameVoice); preloadClip(d.specialVoice); } // the narrator's lines and special voice lines, ready in time
    if (defs.some((d) => d.special?.type === 'tiger')) preloadModel('models/tiger.glb'); // Linoy's tiger (her special and her fatality)
    for (const d of defs) if (d.specialProp) loadProp(d.specialProp, 1).catch(() => {}); // e.g. Minibar's dragon, loaded early
    this.frenchAuras = this.fighters.map((f) => (f.def.special?.type === 'france' ? new FrenchAura(scene) : null));
    this.ivStands = this.fighters.map((f) => (f.def.special?.type === 'cough' ? new IVStand(scene) : null));
    // both picked the same fighter: an arrow over yours (YOU), or P1 / P2 over both on one screen
    this.youArrows = this.fighters.map((f, i) => {
      if (defs[0].id !== defs[1].id) return null;
      const label = mode === 'online' ? (i === net.side ? 'YOU' : null) : mode === '1p' ? (i === 0 ? 'YOU' : null) : mode === '2p' ? `P${i + 1}` : null;
      return label ? youArrow(label, label === 'P2' ? '#ff4d5e' : label === 'P1' ? '#4da3ff' : '#ffd23f') : null;
    });
    this.ctrls = app.ctrls;
    this.practice = practicing(); // a standing dummy instead of the computer
    this.ai = mode === '1p' && !this.practice ? new AI(b, level) : null;
    this.projectiles = [];
    this.lassos = [];
    this.joys = [];
    this.halos = this.fighters.map(() => new JoyHalo(scene));
    this.effects = [];
    this.smokeHeads = this.fighters.map(() => new SmokeHead(scene));
    this.stars = this.fighters.map(() => new Stars(scene));
    this.resetIcons = this.fighters.map(() => new ResetIcon(scene));
    this.sicks = this.fighters.map(() => new Sick(scene));
    this.cigs = this.fighters.map((f) => (f.def.special?.type === 'smoke' ? new Cigarette(scene) : null));
    this.wins = [0, 0];
    this.round = 0;
    this.hitstop = 0;
    this.phase = 'loading';
    this.trail = [1, 1];
    this.ready = Promise.all(this.fighters.flatMap((f) => [f.rig.ready, f.shadowRig?.ready, f.altRig?.ready]));
    this.setupHud();
  }

  setupHud() {
    this.fighters.forEach((f, i) => {
      const bar = $(`.hbar.p${i + 1}`);
      bar.querySelector('.name').textContent = this.mode === 'online' ? `${f.def.name} · ${i === net.side ? 'YOU' : net.opponent || 'FRIEND'}` : this.mode === 'watch' && app.watch?.names?.[i] ? `${f.def.name} · ${app.watch.names[i]}` : f.def.name;
      bar.querySelector('.pfp').style.backgroundImage = app.portraits[f.def.id] ? `url(${app.portraits[f.def.id]})` : 'none';
      bar.querySelector('.spec').textContent = f.def.special?.name || 'SPECIAL';
    });
  }

  startRound() {
    this.freeze = 0;
    this.dropFatFx();
    clearBlownUp(); // (the last round's pieces)
    for (const f of this.fighters) if (f.exploded) { f.exploded = false; f.body.setOpacity(1); }
    this.round++;
    for (const f of this.fighters) f.guard = null;
    spiritWorld(false); // a new round starts back in the arena
    this.fighters[0].reset(-2.6);
    this.fighters[1].reset(2.6);
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles = [];
    this.clearLassos();
    this.timer = ROUND_TIME * 60;
    this.phase = 'intro';
    this.pt = 0;
    this.winner = null;
    this.trail = [1, 1];
    app.timeScale = 1;
    this.fatal = false;
    // before the first round: the camera flies up to each fighter's face, then pulls back
    this.cine = this.round === 1 && !this.practice ? INTRO_CINE : 0;
    if (this.practice) this.pr = { list: [], calm: 999, hp: this.fighters[1].hp, specialIdle: 0 };
    if (this.practice) { $('#pr-combo').textContent = 'Hit the dummy to see your combo'; $('#pr-moves').textContent = ''; $('#pr-fx').textContent = ''; $('#pr-last').textContent = ''; } // (a fresh panel for a new fighter)
    if (!this.cine) this.roundCall();
  }

  roundCall() {
    const final = this.wins[0] === ROUNDS_TO_WIN - 1 && this.wins[1] === ROUNDS_TO_WIN - 1;
    const label = this.practice ? 'PRACTICE' : final ? 'FINAL ROUND' : `ROUND ${this.round}`;
    showAnnounce(label, { ms: 1150, cls: final ? 'red' : '' });
    announce(final ? 'Final round' : `Round ${this.round}`);
    sfx.gong();
  }

  tick() {
    if (this.hitstop > 0) {
      this.hitstop--;
      // the fight is frozen for a moment, but keep reading the buttons so quick taps aren't lost
      if (this.phase === 'fight') {
        this.ctrls[0].update(); this.ctrls[1].update();
        this.fighters.forEach((f, i) => f.noteFrozenInput(this.ctrls[i]));
      }
      return;
    }
    this.pt++;
    const [a, b] = this.fighters;
    const [c0, c1] = this.ctrls;

    if (this.phase === 'intro') {
      a.tick(null); b.tick(null);
      const L = this.cine;
      if (L) {
        if (this.pt === 1) { introCard(this.fighters[0], 1); app.camCut = true; document.body.classList.add('cinema'); sayName(this.fighters[0].def); }
        if (this.pt === INTRO_SHOT) { introCard(this.fighters[1], 0); app.camCut = true; whiteFlash(450); sayName(this.fighters[1].def); }
        if (this.pt === INTRO_VS) { introCard(null); app.camCut = true; showAnnounce('VS', { ms: 1250, cls: 'red vs' }); sfx.gong(); }
        if (this.pt === L) { app.camCut = true; document.body.classList.remove('cinema'); this.roundCall(); }
      }
      if (this.pt === L + 70) { showAnnounce('FIGHT!', { ms: 700 }); announce('Fight!', { rate: 1.1 }); }
      if (this.pt === L + 90) { this.phase = 'fight'; c0.flush(); c1.flush(); }
      this.separate();
      return;
    }

    if (this.phase === 'fight') {
      if (this.ai) c1.virtual = this.ai.tick(this);
      c0.update(); c1.update();
      if (c0.pressed.start || c1.pressed.start) { pause(); return; }
      // a special's cinematic pause (Orone's France): the fight, the round timer and both fighters
      // (and their timers) stand still; only the effects playing the cinematic go on
      if (this.freeze > 0) {
        this.freeze--;
        for (const e of this.effects) if (e.duringFreeze) e.tick(this);
        this.effects = this.effects.filter((e) => !e.dead);
        return;
      }
      a.tick(c0); b.tick(c1);
      if (this.phase !== 'fight') return; // (a special just turned into a fatality: the round's over)
      for (const p of this.projectiles) p.tick();
      for (const l of this.lassos) l.tick(this);
      this.lassos = this.lassos.filter((l) => !l.dead);
      for (const j of this.joys) j.tick();
      this.joys = this.joys.filter((j) => !j.dead);
      for (const e of this.effects) e.tick(this);
      this.effects = this.effects.filter((e) => !e.dead);
      this.clashProjectiles();
      this.projectiles = this.projectiles.filter((p) => {
        if (p.dead) {
          if (!p.hit) particles.burst(p.x, p.y, 0, { count: 12, color: p.owner.def.special.color, speed: 0.08 });
          scene.remove(p.mesh);
        }
        return !p.dead;
      });
      this.separate();
      this.updateGuards();
      if (this.practice) { this.practiceStep(); return; }
      this.timer--;
      if (!a.alive || !b.alive) this.endRound(a.alive ? 0 : b.alive ? 1 : -1, 'ko');
      else if (this.timer <= 0) {
        const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
        this.endRound(Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1, 'time');
      }
      return;
    }

    // after the round: let bodies fall, then celebrate (or the fatality plays out)
    const fin = this.phase === 'ko' && this.fatal ? this.fatalityStep() : [null, null];
    a.tick(fin[0]); b.tick(fin[1]);
    this.clearLassos();
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles = [];
    this.separate();
    if (this.phase === 'ko') {
      if (this.pt === 28) app.timeScale = 1;
      const sh = this.fatal ? this.fatShatterAt : 0;
      if (this.pt === (this.fatal ? sh + 90 : 75) && (!this.fatal || sh) && !this.fatFx) this.celebrate();
      if (this.pt === (this.fatal ? sh + 220 : 210) && (!this.fatal || sh)) {
        if (this.winner !== null && this.wins[this.winner] >= ROUNDS_TO_WIN) this.finish();
        else this.startRound();
      }
    }
  }

  // the fatality, frame by frame (match clock, so it plays the same on both phones online)
  // Someone whose special reaches from afar (RANGED) doesn't walk up for it: they do their
  // special's move from where they stand; the rest walk up and grab them.
  fatalityStep() {
    const w = this.fighters[this.winner], l = this.fighters[1 - this.winner], pt = this.pt;
    const inp = [null, null];
    const dir = sign(l.pos.x - w.pos.x) || 1;
    if (pt === 32 && !this.fatInstant) { showAnnounce('FINISH HIM!', { ms: 1500, cls: 'red' }); announce('Finish him!', { rate: 0.8, pitch: 0.35 }); }
    if (pt >= (this.fatInstant ? 1 : 80) && !this.fatGrabAt) {
      const gap = Math.abs(l.pos.x - w.pos.x);
      const type = w.def.special?.type;
      const near = FATALITIES[type]?.reach ?? (RANGED.has(type) ? 99 : 0.95); // (Guy's cables, Linoy's tiger... reach them from there)
      if (gap > near && pt < 200) {
        // walk up to them
        inp[this.winner] = { held: { [dir > 0 ? 'right' : 'left']: true }, pressed: {} };
        w.pos.x += dir * Math.min(0.05, gap - 0.95);
      } else {
        this.fatGrabAt = pt;
        w.facing = dir;
        const Own = FATALITIES[w.def.special?.type];
        if (Own) { // their own fatality instead of the grab and shatter
          l.dizzy = 0;
          this.fatFx = new Own(this.fxCtx(), w, l);
        } else if (RANGED.has(w.def.special?.type)) {
          this.fatRanged = true; // (their special's move, posed: below)
        } else {
          w.startMove(MOVES.grab, 'grab');
          w.hasHit = true; // a cinematic: no hit, no knockdown
        }
      }
    }
    const g = this.fatGrabAt;
    // a ranged special's move, from where they stand: wind up, then held out till the shatter
    if (g && this.fatRanged) {
      const m = SPECIALS[w.def.special.type], anim = !m?.anim || m.anim === 'idle' ? 'taunt' : m.anim;
      const k = pt - g;
      w.poseOverride = k >= 58 ? null : { anim, phase: k < 12 ? 'startup' : 'active', pt: k < 12 ? k / 12 : 1 };
    }
    if (this.fatFx) {
      if (!this.fatFxDone) {
        const u = pt - g;
        this.fatFx.setU?.(u);
        const r = this.fatFx.step(u);
        if (r === 'fatality') {
          this.fatShatterAt = pt;
          showAnnounce('FATALITY', { ms: 2200, cls: 'red' });
          announce('Fatality', { rate: 0.75, pitch: 0.3 });
          sfx.gong();
        }
        if (r === 'done') { this.fatFxDone = true; w.poseOverride = null; this.celebrate(); }
      }
      return inp;
    }
    if (g && pt === g + 12) { this.cinema = 'black'; app.camCut = true; sfx.thud(); }
    if (g && pt === g + 58) {
      this.cinema = null;
      this.fatShatterAt = pt;
      this.shatterLoser = true;
      showAnnounce('FATALITY', { ms: 2200, cls: 'red' });
      announce('Fatality', { rate: 0.75, pitch: 0.3 });
      sfx.gong();
    }
    return inp;
  }

  endRound(winner, how, opts = {}) {
    for (const f of this.fighters) f.guard = null;
    this.phase = 'ko';
    this.pt = 0;
    this.winner = winner >= 0 ? winner : null;
    if (this.winner !== null) this.wins[this.winner]++;
    // FATALITY whenever the knockout was a special move (every round)
    this.fatal = how === 'ko' && this.winner !== null && !!this.fighters[1 - this.winner].koBySpecial;
    this.fatInstant = !!opts.instant && this.fatal; // (straight into it: their special turned into the fatality)
    if (this.winner !== null && this.fighters[1 - this.winner].exploded) this.fatal = false; // (already blown apart)
    this.fatGrabAt = 0; this.fatShatterAt = 0; this.cinema = null; this.shattered = false; this.fatRanged = false;
    this.dropFatFx();
    if (this.fatal) {
      // "FINISH HIM": the loser stays up, stunned, instead of falling
      const l = this.fighters[1 - this.winner];
      l.move = null;
      l.setState('dazed');
      l.stun = 1e6;
      l.dizzy = 1e6;
      l.vel.x = 0;
    }
    if (how === 'ko' && this.fatInstant) {
      app.shake = 0.3;
    } else if (how === 'ko') {
      app.timeScale = 0.3;
      this.hitstop = 10;
      app.shake = 0.5;
      showAnnounce('K.O.', { ms: 1600, cls: 'red' });
      announce('K. O.', { rate: 0.7, pitch: 0.3 });
      sfx.gong();
      sfx.thud();
    } else {
      showAnnounce(winner < 0 ? 'DRAW' : 'TIME', { ms: 1400 });
      announce('Time');
    }
  }

  // A special that would finish them (it does at least the damage they have left): if the fighter
  // has their own fatality, that plays instead of the special, there and then
  tryFatality(f) {
    const o = f.opponent;
    if (this.practice || this.phase !== 'fight' || !FATALITIES[f.def.special?.type] || !o.alive || o.gold > 0) return false;
    const m = f.special;
    let dmg = (m.damage || 0) + (m.effect === 'smoke' ? 12 : 0) + (m.poisonDmg ? m.poisonDmg * 8 : 0); // (with what it leaves behind)
    if (f.weak > 0) dmg *= 0.5; // (Noa's cough: half damage)
    if (o.hp > dmg + 1e-6) return false;
    f.specialsLeft--; f.specialAt = f.clock; f.move = null; f.setState('idle');
    o.hp = 0; o.koBySpecial = true;
    this.endRound(f.index, 'ko', { instant: true });
    return true;
  }

  // a fighter's own fatality scene (fatalities.js): its tiger, torn-off limbs... go at the next round or the end
  dropFatFx() {
    this.fatFx?.dispose();
    this.fatFx = null; this.fatFxDone = false;
  }

  fxCtx() {
    return { scene, particles, rings, sfx, whiteFlash: (ms) => whiteFlash(ms), shake: (v) => { app.shake = Math.max(app.shake, v); }, headClone: (def, size, neckFrac) => modelHeadClone(def, size, neckFrac),
      voice: (file, text) => narrate(text, { file }),
      seed: this.round * 31 + this.wins[0] * 7 + this.wins[1] * 3 + (this.fatGrabAt || 0) }; // (the same on both phones online)
  }

  celebrate() {
    if (this.winner === null) return;
    const w = this.fighters[this.winner];
    w.move = null;
    w.setState('win');
    if (this.practice) return; // (a practice fatality: nobody won anything)
    const flawless = w.damageTaken === 0;
    showAnnounce(`${w.def.name} WINS`, { ms: 1900, cls: 'small', sub: flawless ? 'FLAWLESS VICTORY' : '' });
    announce(`${w.def.name.replace(/\(.*\)/, '')} wins.${flawless ? ' Flawless victory.' : ''}`, { rate: 0.9 });
  }

  // a player gave up: the other one wins the match right away
  forfeit(side) {
    if (this.phase === 'over') return;
    introCard(null);
    blackout(null);
    document.body.classList.remove('cinema');
    this.winner = 1 - side;
    this.wins[this.winner] = ROUNDS_TO_WIN;
    this.fatal = false;
    this.byForfeit = true;
    this.fighters[side].setState?.('ko');
    this.finish();
  }

  finish() {
    const w = this.fighters[this.winner];
    this.phase = 'over';
    stopMusic();
    show('screen-result');
    resultMenu.i = 0;
    resultMenu.render();
    showAnnounce(w.def.name, { ms: 0, cls: 'small', sub: this.byForfeit ? 'WINS · THE OTHER PLAYER FORFEITED' : 'WINS THE MATCH' });
    confetti.start(w.pos.x);
    w.setState('win');
    if (app.tmatch) { tourneyMatchDone(this.winner); return; }
    if (this.mode === 'watch') { $('#screen-result .menu').hidden = true; const key = app.watch?.key; setTimeout(() => { if (app.watch?.key === key) stopWatching(); }, 4000); return; }
    const q = document.createElement('div');
    q.className = 'result-quote';
    q.textContent = `“${w.def.winQuote || 'Too easy.'}”`;
    $('#announce span').appendChild(q);
  }

  separate() {
    const [a, b] = this.fighters;
    const dx = b.pos.x - a.pos.x;
    if (Math.abs(dx) >= PHYS.minGap || Math.abs(a.pos.y - b.pos.y) > 1.4) return;
    if (a.state === 'ko' || b.state === 'ko' || a.opacity < 0.9 || b.opacity < 0.9) return;
    if (a.rollThrough || b.rollThrough) return; // rolling under the opponent out of a corner
    const s = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
    const push = (PHYS.minGap - Math.abs(dx)) / 2;
    a.pos.x -= s * push;
    b.pos.x += s * push;
    const lim = PHYS.arenaHalf;
    for (const [f, o] of [[a, b], [b, a]]) {
      if (Math.abs(f.pos.x) > lim) {
        const over = Math.abs(f.pos.x) - lim;
        f.pos.x = Math.sign(f.pos.x) * lim;
        o.pos.x -= Math.sign(f.pos.x) * over;
      }
    }
  }

  clashProjectiles() {
    for (const p of this.projectiles) {
      for (const q of this.projectiles) {
        if (p !== q && p.owner !== q.owner && !p.dead && !q.dead && Math.abs(p.x - q.x) < 0.5) {
          p.dead = q.dead = true;
          particles.burst((p.x + q.x) / 2, p.y, 0, { count: 40, color: '#ffffff', speed: 0.15 });
          sfx.block();
        }
      }
    }
  }

  // practice: FINISH HIM on the dummy, and your fighter's fatality plays out; then practice goes on
  practiceFatality() {
    if (!this.practice || this.phase !== 'fight') return;
    this.clearLassos();
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles = [];
    const [w, l] = this.fighters;
    for (const f of this.fighters) { f.guard = null; f.move = null; f.vel.x = 0; f.vel.y = 0; f.pos.y = 0; f.setState('idle'); }
    this.phase = 'ko';
    this.pt = 0;
    this.winner = 0;
    this.fatal = true;
    this.fatGrabAt = 0; this.fatShatterAt = 0; this.cinema = null; this.shattered = false; this.fatRanged = false;
    this.dropFatFx();
    w.facing = sign(l.pos.x - w.pos.x) || 1;
    l.setState('dazed'); l.stun = 1e6; l.dizzy = 1e6;
    app.timeScale = 1;
  }

  // ── fighter callbacks ──
  // practice: the dummy has endless health (each hit is shown, never summed into its bar), your
  // health stays full and your special comes back once it's over. The panel lists the current
  // combo hit by hit: each move, its damage and what it did, and the total.
  practiceStep() {
    const [a, b] = this.fighters, pr = this.pr;
    a.hp = a.maxHp;
    const took = pr.hp - Math.max(0, b.hp), extra = took - (pr.tickHit || 0);
    pr.tickHit = 0;
    if (!b.alive) { b.koBySpecial = false; b.downFor = 34; b.downAt = 0; b.setState('knockdown'); }
    const special = a.guard || (a.state === 'attack' && a.move?.id?.startsWith('special'));
    // damage that isn't a hit (a guitar solo, poison, the cage): goes on the special's line
    if (extra > 0.01) {
      if (pr.calm > 40) this.newCombo();
      // (poison and the like that a special left behind count on that special's line)
      const from = special ? (a.def.special?.name || 'SPECIAL') : pr.list.findLast((e) => e.special)?.name || 'DAMAGE OVER TIME';
      this.practiceEntry(from, extra, true);
    }
    // the effects on the dummy right now, with the time left: a special's line says what it put
    // on them and for how long, and a live line counts them down
    const now = practiceEffects(b);
    const last = pr.list.at(-1), had = {};
    pr.firstFor ||= {};
    for (const [key, e] of Object.entries(now)) {
      if (!pr.had?.[key]) pr.firstFor[key] ??= e.for; // its full length, from when it went on
      if (pr.had?.[key]) had[key] = true;
      else if (last) { last.fx.add(pr.firstFor[key]); had[key] = true; } // (else: once the special's line exists)
    }
    for (const key of Object.keys(pr.firstFor)) if (!now[key]) delete pr.firstFor[key];
    pr.had = had;
    const live = Object.values(now).map((e) => `${e.what} ${e.left}`).join(' · ');
    if (live !== pr.live) { pr.live = live; $('#pr-fx').textContent = live ? `on the dummy now: ${live}` : ''; }
    // the panel fades out a few seconds after the last hit (and comes back with the next one)
    pr.idle = took > 0 || extra > 0.01 || live ? 0 : (pr.idle || 0) + 1;
    if (took > 0 || extra > 0.01) this.renderPractice();
    b.hp = b.maxHp; // endless health
    pr.hp = b.hp;
    // calm: how long the dummy has been back on its feet (a new hit after that starts a new combo)
    const reeling = ['hit', 'launched', 'knockdown', 'dazed', 'shocked', 'caged', 'getup'].includes(b.state) || !!b.poison;
    pr.calm = reeling || took > 0 ? 0 : (pr.calm ?? 999) + 1;
    const busy = a.guard || (a.state === 'attack' && a.move?.id?.startsWith('special'));
    pr.specialIdle = a.specialsLeft > 0 || busy ? 0 : pr.specialIdle + 1;
    if (pr.specialIdle > 45) { a.specialsLeft = 1; pr.specialIdle = 0; }
  }
  newCombo() { Object.assign(this.pr, { list: [] }); }
  // add a hit to the combo list (a special's hits all go on one line)
  practiceEntry(name, dmg, special, effect) {
    const pr = this.pr, last = pr.list.at(-1);
    let e = special && last?.special && last.name === name ? last : null;
    if (!e) { e = { name, dmg: 0, hits: 0, special, fx: new Set() }; pr.list.push(e); }
    e.dmg += dmg;
    e.hits++;
    if (effect) e.fx.add(effect);
    if (pr.list.length > 10) pr.list.splice(0, pr.list.length - 10);
  }
  renderPractice() {
    const pr = this.pr, n = (d) => String(Math.round(d * 10) / 10);
    const total = pr.list.reduce((t, e) => t + e.dmg, 0), hits = pr.list.reduce((t, e) => t + e.hits, 0);
    $('#pr-combo').textContent = pr.list.length ? `TOTAL ${n(total)} DAMAGE · ${hits} HIT${hits === 1 ? '' : 'S'}` : 'Hit the dummy to see your combo';
    $('#pr-moves').textContent = pr.list.map((e) => `${e.name} ${n(e.dmg)}${e.fx.size ? ` (${[...e.fx].join(', ')})` : ''}`).join('  →  ');
    $('#pr-last').textContent = 'the dummy never runs out of health · a new combo starts once it is back on its feet';
  }

  onHit(att, def, dmg, heavy, from, m) {
    if (this.practice && def === this.fighters[1]) {
      const pr = this.pr;
      if (pr.calm > 40) this.newCombo();
      const special = m?.id === 'special';
      const bread = att.bread && att.altRig && !special && !m?.finisher ? att.baguetteAnim(m) : ''; // Oron's baguette: stab / slash
      const name = !m ? 'HIT' : special ? (att.def.special?.name || 'SPECIAL') : m.finisher || (bread === 'stab' ? 'STAB' : bread === 'slash' ? 'SLASH' : MOVE_LABEL[m.id] || m.id.toUpperCase());
      // what the hit did to them
      const effect = m?.grab ? 'thrown' : def.state === 'launched' ? 'thrown up' : def.state === 'knockdown' ? 'knocked down'
        : ['dazed', 'shocked'].includes(def.state) ? null : (m?.push ?? 0) >= 0.2 ? 'knocked back' : null; // (dazed / shocked: with their time, below)
      this.practiceEntry(name, dmg, special, effect);
      pr.tickHit = (pr.tickHit || 0) + dmg;
      this.renderPractice();
    }
    const hx = def.pos.x - att.facing * 0.2, hy = def.pos.y + (def.state === 'knockdown' ? 0.9 : 1.35);
    particles.burst(hx, hy, 0.4, { count: heavy ? 44 : 24, color: heavy ? '#ffb347' : '#ffe7a0', speed: heavy ? 0.17 : 0.11, dir: att.facing });
    particles.burst(hx, hy, 0.4, { count: heavy ? 16 : 8, color: '#ff3b4d', speed: 0.07, gravity: 0.01 });
    this.hitstop = heavy ? 9 : 5;
    app.shake = Math.max(app.shake, heavy ? 0.28 : 0.1);
    sfx.hit(heavy);
    if (def.comboTaken >= 2) this.flashCombo(att.index, `${def.comboTaken} HITS`, 'COMBO');
    navigator.vibrate?.(heavy ? 40 : 15);
  }

  onBlock(att, def) {
    particles.burst(def.pos.x - att.facing * 0.35, def.pos.y + 1.3, 0.4, { count: 14, color: '#9fd4ff', speed: 0.09, dir: att.facing });
    this.hitstop = 3;
    sfx.block();
  }

  onSpecialRefund(f) {
    this.flashCombo(f.index, 'INTERRUPTED', 'SPECIAL NOT USED UP');
  }

  onCounter(att) {
    this.flashCombo(att.index, 'COUNTER HIT', '+25% DAMAGE');
    this.hitstop += 3;
  }

  // blocked just in time: no damage and the attacker is stunned
  onParry(def, att) {
    this.flashCombo(def.index, 'COUNTER!', 'PERFECT BLOCK');
    particles.burst(def.pos.x + def.facing * 0.4, def.pos.y + 1.3, 0.4, { count: 30, color: '#7fd0ff', speed: 0.14, gravity: 0 });
    rings.spawn(def.pos.x + def.facing * 0.4, def.pos.y + 1.3, '#7fd0ff', { grow: 0.12, life: 16 });
    this.hitstop = 10;
    sfx.block(); sfx.teleport();
  }

  // the 4th hit of a string landed: show its name
  onNightMiss(f) { if (this.pt - (f._missAt ?? -99) > 20) { f._missAt = this.pt; sfx.whoosh(); this.flashCombo(1 - f.index, 'MISS', "SHE'S NOT THERE"); } }

  onGoldBounce(gold, x, y) { particles.burst(x, y, 0.3, { count: 18, color: '#ffd23f', speed: 0.13, gravity: 0.004, life: 14 }); sfx.block(); this.flashCombo(gold.index, 'BOUNCED OFF', 'THE GOLD'); }

  onBaguetteBreak(f, gold) {
    this.flashCombo(f.index, 'BAGUETTE BROKEN', 'ON THE GOLD · STILL FRENCH');
    const x = gold.pos.x - f.facing * 0.35;
    particles.burst(x, 1.3, 0.3, { count: 26, color: '#c8873a', speed: 0.12, gravity: 0.008, life: 26 });
    particles.burst(x, 1.3, 0.3, { count: 14, color: '#f1d39a', speed: 0.09, gravity: 0.008, life: 22 });
    particles.burst(x, 1.3, 0.3, { count: 12, color: '#ffd23f', speed: 0.14, gravity: 0.004, life: 14 });
    sfx.block();
  }

  onFinisher(att, m) {
    const def = att.opponent;
    this.flashCombo(att.index, m.finisher, m.launcher ? `${def.comboTaken} HITS · JUMP TO FOLLOW` : `${def.comboTaken} HITS COMBO`);
    if (m.launcher) rings.spawn(def.pos.x, def.pos.y + 1.0, '#ffd34d', { grow: 0.1, life: 14 });
  }

  // Oron's baguette slash went straight through a block
  onGuardBreak(att, def) {
    this.flashCombo(att.index, 'GUARD BREAK', 'THE BAGUETTE SLASH');
    particles.burst(def.pos.x - att.facing * 0.3, def.pos.y + 1.3, 0.4, { count: 26, color: '#f1d39a', speed: 0.15, dir: att.facing });
    this.hitstop += 3;
  }

  // tapped block in the air just before an air hit: the attacker gets knocked down
  onAirCounter(def, att) {
    this.flashCombo(def.index, 'AIR COUNTER', 'KNOCKED OUT OF THE AIR');
    particles.burst(def.pos.x, def.pos.y + 1.0, 0.4, { count: 34, color: '#7fd0ff', speed: 0.15, gravity: 0 });
    rings.spawn(def.pos.x, def.pos.y + 1.0, '#7fd0ff', { grow: 0.12, life: 16 });
    this.hitstop = 10;
    sfx.block(); sfx.teleport();
  }


  onRoll(f, breaker) {
    if (breaker) this.flashCombo(f.index, 'COMBO BREAKER', 'ROLL READY AGAIN IN 5 S');
    sfx.whoosh();
    particles.burst(f.pos.x, 0.15, 0, { count: 12, color: '#d8cdb8', speed: 0.06, gravity: 0.004 });
  }

  onDash(f) {
    sfx.whoosh();
    particles.burst(f.pos.x - f.facing * 0.3, 0.1, 0, { count: 6, color: '#d8cdb8', speed: 0.04, gravity: 0.003 });
  }

  onThrow(att, def) {
    this.flashCombo(att.index, 'GRAB!', 'THROUGH THE BLOCK');
    sfx.thud();
    app.shake = Math.max(app.shake, 0.25);
  }

  onSpecialEmpty(f) {
    if (this.pt - (f.emptyAt ?? -99) < 40) return;
    f.emptyAt = this.pt;
    this.flashCombo(f.index, 'USED', 'SPECIAL · BACK NEXT ROUND');
    sfx.block();
  }

  onSpecial(f) {
    this.flashCombo(f.index, f.def.special?.name || 'SPECIAL', 'SPECIAL');
    // A special that hits can't be cancelled: until it has landed, a hit on its user doesn't
    // stop it (the fight goes on as normal otherwise). Power-ups (Ori's gold, Oron's France) aren't covered.
    if (!SELF_SPECIALS.includes(f.special.effect)) {
      f.guard = { t: 0 };
      // gold Ori: the whole special is his to take: gold from now until it's over, then it breaks
      if (f.opponent.gold > 0) f.opponent.goldSoak(f);
    }
  }
  // the special is over once its move has finished, nothing it threw is still flying and its
  // whole animation has played out (then a lined-up special can go, and gold Ori's gold breaks)
  updateGuards() {
    for (const f of this.fighters) {
      const G = f.guard;
      if (!G) continue;
      const opp = f.opponent, mine = (x) => x.owner === f && !x.dead;
      G.t++;
      const moving = f.state === 'attack' && f.move?.id?.startsWith('special');
      const flying = this.projectiles.some(mine) || this.lassos.some(mine) || this.joys.some(mine);
      const playing = this.effects.some(mine);
      if ((!moving && !flying && !playing) || G.t > 1500 || !f.alive || !opp.alive) {
        f.guard = null;
        if (opp.goldHold === f) opp.releaseGold();
      }
    }
  }

  spawnProjectile(f, m) {
    const mesh = makeProjectileMesh(f.def.special.color, f.def.special.shape);
    const p = new Projectile(f, m, mesh);
    mesh.position.set(p.x, p.y, 0);
    scene.add(mesh);
    this.projectiles.push(p);
  }

  spawnLasso(f, m) {
    this.lassos.push(new Lasso(f, m, scene, f.def.special.color || '#7fdcff'));
    sfx.whip();
  }

  onShockStart(target, color) {
    particles.burst(target.pos.x, target.pos.y + 1.2, 0.3, { count: 40, color: '#ffffff', speed: 0.15, gravity: 0 });
    app.shake = Math.max(app.shake, 0.2);
    sfx.zap();
  }

  onShockTick(target, color) {
    particles.burst(target.pos.x, target.pos.y + 0.4 + Math.random() * 1.4, 0.3, {
      count: 10, color: Math.random() < 0.5 ? '#ffffff' : `#${color.getHexString()}`, speed: 0.12, gravity: 0, life: 14,
    });
    if (Math.random() < 0.5) sfx.zap();
    app.shake = Math.max(app.shake, 0.06);
  }

  clearLassos() {
    for (const l of this.lassos) l.dispose();
    this.lassos = [];
    for (const j of this.joys ?? []) j.dispose();
    this.joys = [];
    for (const e of this.effects ?? []) e.dispose();
    this.effects = [];
  }

  // who is looking at this screen (for effects that blind one player): online = me,
  // vs computer = player 1, two players on one screen = nobody in particular
  get viewerIndex() { return this.mode === 'online' ? net.side : this.mode === '1p' ? 0 : -1; } // (watching: nobody)

  spawnEffect(f, m) {
    const e = createEffect(f, m, {
      scene, particles, rings, sfx,
      shake: (v) => { app.shake = Math.max(app.shake, v); },
      portrait: (id) => app.portraits[id],
      headClone: (def, size, neckFrac) => modelHeadClone(def, size, neckFrac),
      explode: (f, fire) => explodeBody(f, fire),
      // a flat picture of `obj` (a w×h world-unit window around its origin, looking down -z),
      // e.g. a reflection painted onto a mirror. Returns the render target; the caller disposes it.
      snapshot: (obj, w, h, px = 512) => {
        const s2 = new THREE.Scene();
        s2.add(new THREE.AmbientLight('#ffffff', 1.4));
        const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(-1.2, 1.5, 2); s2.add(key);
        const fill = new THREE.DirectionalLight('#bcd2ff', 0.8); fill.position.set(1.5, 0.3, 1); s2.add(fill);
        s2.add(obj);
        const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 20); cam.position.set(0, 0, 5);
        const rt = new THREE.WebGLRenderTarget(Math.round(px * w / h), px, { samples: 4 });
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(s2, cam); renderer.setRenderTarget(prev);
        s2.remove(obj);
        return rt;
      },
      prop: (url, height) => loadProp(url, height),
      flash: (side, big, small) => this.flashCombo(side, big, small),
      whiteFlash: (ms) => whiteFlash(ms),
      spiritWorld: (on) => spiritWorld(on),
      // a voice line (a recorded clip, or the device voice saying `text` if it won't play)
      voice: (file, text) => narrate(text, { file }),
      // a fighter's recorded battle cry (roster shoutVoice), when there is one
      shout: (def) => { if (def.shoutVoice) narrate('', { file: def.shoutVoice }); },
      // a special can steer the camera for a moment: { x, y, half, halfH } (null = back to normal)
      camera: (shot) => { app.specialCam = shot ? { ...shot, until: app.time + 0.25 } : null; if (shot?.cut) app.camCut = true; },
      onSmoke: (victim) => {
        particles.burst(victim.pos.x, victim.pos.y + 1.8, 0.3, { count: 30, color: '#cfcfd4', speed: 0.08, gravity: -0.001 });
        this.flashCombo(victim.opponent.index, 'SMOKED!', 'POISON');
      },
    });
    if (e) this.effects.push(e);
  }

  spawnJoy(f, m) {
    this.joys.push(new JoyWave(f, m, scene, this));
    sfx.joy();
  }

  onJoyStart(target) {
    particles.burst(target.pos.x, target.pos.y + 1.4, 0.3, { count: 50, color: '#ffd23f', speed: 0.13, gravity: 0.002 });
    particles.burst(target.pos.x, target.pos.y + 1.4, 0.3, { count: 30, color: '#ff6fa5', speed: 0.1, gravity: 0.002 });
    this.flashCombo(target.opponent.index, 'SO HAPPY!', "CAN'T ATTACK OR BLOCK");
  }

  onShockwave(f) {
    rings.spawn(f.pos.x, 0.05, f.def.special.color, { grow: 0.22, life: 24 });
    particles.burst(f.pos.x, 0.2, 0, { count: 40, color: '#c9a98a', speed: 0.12, gravity: 0.004, spread: 2.2 });
    app.shake = Math.max(app.shake, 0.35);
    sfx.thud();
  }

  onGroundImpact(f) {
    particles.burst(f.pos.x, 0.15, 0, { count: 22, color: '#a88a70', speed: 0.07, gravity: 0.002, spread: 2 });
    app.shake = Math.max(app.shake, 0.15);
    sfx.land();
  }

  // someone hit Ori while he's gold: a clink and gold sparks, no damage
  onGoldBlock(f) {
    sfx.block();
    particles.burst(f.pos.x, f.pos.y + 1.2, 0.3, { count: 10, color: '#ffd23f', speed: 0.1, gravity: 0.004, life: 14 });
  }

  onGoldBreak(f) {
    this.flashCombo(f.index, 'GOLD BROKEN', 'THE SPECIAL DOES NOTHING');
    particles.burst(f.pos.x, f.pos.y + 1.2, 0.3, { count: 40, color: '#ffd23f', speed: 0.16, gravity: 0.006, life: 22 });
  }

  onTeleport(f) {
    particles.burst(f.pos.x, 1.2, 0, { count: 36, color: f.def.special.color, speed: 0.12, gravity: 0 });
  }

  flashCombo(side, big, small) {
    const el = $(`#combo${side}`);
    el.innerHTML = '';
    el.append(big);
    const s = document.createElement('small');
    s.textContent = small;
    el.appendChild(s);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 900);
  }

  render(dt) {
    for (const f of this.fighters) f.render(dt);
    this.fighters.forEach((f, i) => {
      const a = this.youArrows[i];
      if (!a) return;
      a.visible = this.phase === 'fight' && f.opacity > 0.3;
      a.position.set(f.pos.x, f.pos.y + heightOf(f.def) * 1.95 + 0.45 + Math.sin(app.time * 4) * 0.06, 0.3);
    });
    if (this.fatal && (this.phase === 'ko' || this.phase === 'over') && this.winner !== null) {
      const loser = this.fighters[1 - this.winner];
      blackout(this.cinema === 'black' ? loser : null);
      if (this.shatterLoser) {
        this.shatterLoser = false;
        this.shattered = true;
        loser.dizzy = 0; // no stars over an empty spot
        shatterBody(loser);
      }
      if (this.shattered) loser.rig.setOpacity(0);
    }
    for (const f of this.fighters) if (f.exploded) { f.body.setOpacity(0); f.dizzy = 0; } // blown apart: gone
    this.fatFx?.render(dt, app.time);
    for (const l of this.lassos) l.render(dt);
    for (const j of this.joys) j.render(dt);
    for (const e of this.effects) e.render(app.time);
    this.fighters.forEach((f, i) => { this.smokeHeads[i].render(f, app.time); this.stars[i].render(f, app.time); this.resetIcons[i].render(f, app.time); this.cigs[i]?.render(f, app.time); this.sicks[i].render(f, app.time); });
    // Oron's VIVA LA FRANCE: the flag aura and the baguette; his touch buttons become STAB / SLASH
    const mine = this.fighters[Math.max(0, this.viewerIndex)];
    setBaguetteButtons(mine.bread && !!mine.altRig);
    this.fighters.forEach((f, i) => { const a = this.frenchAuras[i]; if (a) { a.render(f, app.time); a.sparks(f, particles); } });
    this.fighters.forEach((f, i) => this.ivStands[i]?.render(f));
    // Netanel's earthquake: dust at the feet while slowed
    for (const f of this.fighters) if (f.slow > 0 && Math.random() < 0.2) particles.burst(f.pos.x + (Math.random() - 0.5) * 0.5, f.pos.y + 0.1, 0.2, { count: 2, color: '#b89a72', speed: 0.025, gravity: 0.002, life: 18 });
    // Ori's gold: fade the tint in and out, with sparkles while it lasts
    for (const f of this.fighters) {
      const k = f.gold > 0 ? Math.min(1, f.gold / 12, (SPECIALS_GOLD - f.gold) / 6 + 0.2) : 0;
      if (k !== f._goldK) { f._goldK = k; tintGold(f.rig.materials || [], k); }
      if (k > 0 && Math.random() < 0.25) particles.burst(f.pos.x + (Math.random() - 0.5) * 0.6, f.pos.y + 0.4 + Math.random() * 1.6, 0.3, { count: 2, color: '#fff2a8', speed: 0.03, gravity: 0, life: 16 });
    }
    // Michael's factory reset: the reset player's own screen scrolls code with a countdown
    resetScreen(this.fighters[this.viewerIndex] || null);
    // Karina's smoke: the smoked player's own screen fills with smoke and she vanishes from it
    const v = this.viewerIndex;
    const blind = v >= 0 && this.fighters[v].smoked > 0 ? Math.min(1, this.fighters[v].smoked / 40) : 0;
    $('#smoke-screen').style.opacity = blind.toFixed(2);
    if (v >= 0) {
      const hidden = this.fighters[1 - v];
      const body = hidden.body;
      // her shadow goes too (a see-through body still casts a full shadow)
      const shadows = (on) => body.object.traverse((o) => { if (o.isMesh) o.castShadow = on; });
      // truly invisible, except a faint shape when she's close enough to hit them
      const reach = 1.45 * (hidden.reachScale || 1) + PHYS.bodyWidth;
      const close = Math.abs(hidden.pos.x - this.fighters[v].pos.x) <= reach ? 1 : 0;
      hidden._smokeSeen = (hidden._smokeSeen ?? 0) + (close - (hidden._smokeSeen ?? 0)) * 0.2;
      if (blind > 0) { body.setOpacity(Math.max(0.06 * hidden._smokeSeen, 1 - blind)); if (!hidden._smokeHidden) shadows(false); hidden._smokeHidden = body; }
      else if (hidden._smokeHidden) { hidden._smokeHidden.object.traverse((o) => { if (o.isMesh) o.castShadow = true; }); hidden._smokeHidden = null; body.setOpacity(hidden.opacity ?? 1); }
    }
    // Shirley's night: the arena goes dark and she's gone (her own player sees a faint ghost)
    let nightK = 0;
    for (const f of this.fighters) {
      const on = f.night > 0;
      if (on) nightK = Math.max(nightK, Math.min(1, f.night / 20, (420 - f.night) / 12 + 0.01));
      const body = f.body;
      // gold Ori shines in the dark: she can be seen (and hit) while he's gold
      const lit = on && f.opponent?.gold > 0;
      if (lit && !f._nightLit) this.flashCombo(f.opponent.index, 'THE GOLD SHINES', 'SHE CAN BE SEEN');
      f._nightLit = lit;
      if (on && lit) {
        if (f._nightHidden) { f._nightHidden.object.traverse((o) => { if (o.isMesh) o.castShadow = true; }); f._nightHidden = null; }
        body.setOpacity(f.opacity ?? 1);
      } else if (on) {
        body.setOpacity(v === f.index ? 0.28 : v < 0 ? 0.1 : 0);
        if (!f._nightHidden) body.object.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        f._nightHidden = body;
      } else if (f._nightHidden) { f._nightHidden.object.traverse((o) => { if (o.isMesh) o.castShadow = true; }); f._nightHidden.setOpacity(f.opacity ?? 1); f._nightHidden = null; }
    }
    setNight(nightK);
    { const ori = this.fighters.find((f) => f.gold > 0 && f.opponent?.night > 0); goldLight.update(ori || this.fighters.find((f) => f.gold >= 0 && f.def.special?.type === 'gold'), !!ori, app.time); }
    this.fighters.forEach((f, i) => this.halos[i].render(f, app.time));
    // Asis's cage: tell the trapped player (on their own screen) how to get out, and how close they are
    const caged = this.fighters.find((f) => f.cage && (v < 0 || f.index === v));
    const cp = $('#cage-prompt');
    cp.hidden = !caged;
    if (caged) {
      const { hp, maxHp } = caged.cage;
      const bars = cp.querySelector('.bars');
      if (bars.childElementCount !== maxHp) bars.innerHTML = '<i></i>'.repeat(maxHp);
      [...bars.children].forEach((b, i) => b.classList.toggle('gone', i >= hp));
    }
    for (const p of this.projectiles) {
      p.mesh.position.set(p.x, p.y, 0);
      p.mesh.userData.core.rotation.z += dt * 12 * p.dir;
      p.mesh.userData.core.rotation.y += dt * 5;
    }
    this.updateHud(dt);
  }

  updateHud(dt) {
    this.fighters.forEach((f, i) => {
      const bar = $(`.hbar.p${i + 1}`);
      const r = clamp(f.hp / f.maxHp, 0, 1);
      this.trail[i] = r < this.trail[i] ? this.trail[i] - (this.trail[i] - r) * damp(0.04, dt) : r;
      bar.querySelector('.fill').style.transform = `scaleX(${r})`;
      // (rounded up so a sliver of health never shows 0%, but not a float hair over: 75.0000001 is 75)
      const pct = this.practice && i === 1 ? '∞' : `${f.hp > 0 ? Math.max(1, Math.ceil(r * 100 - 1e-6)) : 0}%`;
      const hpEl = bar.querySelector('.hp');
      if (hpEl.textContent !== pct) hpEl.textContent = pct;
      bar.querySelector('.trail').style.transform = `scaleX(${this.trail[i]})`;
      bar.querySelector('.health').classList.toggle('low', r < 0.25);
      bar.querySelectorAll('.wins b').forEach((b, k) => b.classList.toggle('on', k < this.wins[i]));
      const spec = bar.querySelector('.spec');
      spec.classList.toggle('ready', f.specialsLeft > 0);
      spec.classList.toggle('used', f.specialsLeft <= 0);
      const roll = bar.querySelector('.roll');
      roll.classList.toggle('ready', f.rollReady);
      roll.textContent = f.rollReady ? 'ROLL' : `ROLL ${Math.ceil((f.rollReadyAt - f.clock) / 60)}`;
    });
    const secs = this.practice ? '∞' : Math.max(0, Math.ceil((this.timer ?? 0) / 60));
    const tEl = $('#timer');
    if (tEl.textContent !== String(secs)) tEl.textContent = secs;
    $('#practice').hidden = !(this.practice && this.phase === 'fight' && ['fight', 'pause'].includes(app.screen));
    // practice: a button to see your fatality on the dummy (while the fight is on, not mid-fatality)
    const fb = !(this.practice && this.phase === 'fight' && app.screen === 'fight');
    if ($('#btn-fatality').hidden !== fb) $('#btn-fatality').hidden = fb;
    if (this.practice) $('#practice').classList.toggle('gone', (this.pr?.idle || 0) > 240 && app.screen === 'fight');
    tEl.classList.toggle('hurry', secs <= 10 && this.phase === 'fight');
  }

  dispose() {
    this.dropFatFx();
    for (const f of this.fighters) { scene.remove(f.rig.object); f.rig.dispose(); if (f.shadowRig) { scene.remove(f.shadowRig.object); f.shadowRig.dispose(); } if (f.altRig) { scene.remove(f.altRig.object); f.altRig.dispose(); } }
    for (const a of this.frenchAuras) a?.dispose();
    for (const v of this.ivStands) v?.dispose();
    for (const a of this.youArrows) if (a) { scene.remove(a); a.material.map.dispose(); a.material.dispose(); }
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.clearLassos();
    for (const h of this.halos) h.dispose();
    for (const h of this.smokeHeads) h.dispose();
    for (const h of this.stars) h.dispose();
    for (const h of this.resetIcons) h.dispose();
    for (const h of this.sicks) h.dispose();
    for (const f of this.fighters) tintGold(f.rig.materials || [], 0);
    for (const c of this.cigs) c?.dispose();
    $('#smoke-screen').style.opacity = '0';
    resetScreen(null);
    $('#cage-prompt').hidden = true;
  }
}

function endMatch() {
  setNight(0); // (a match that ended in Shirley's night)
  stopNarration();
  spiritWorld(false);
  setBaguetteButtons(false);
  if (app.match) { app.match.dispose(); app.match = null; }
  clearShards();
  introCard(null);
  document.body.classList.remove('cinema');
  app.timeScale = 1;
}

async function startMatch(defs) {
  endMatch();
  setArena(app.arenaCfg); // (the one picked, not one being looked at in CREATE)
  clearActors();
  confetti.stop();
  clearAnnounce();
  app.paused = false;
  if (!app.ctrls) app.ctrls = fightControllers(app.mode);
  if (app.mode === 'online') {
    app.ctrls = fightControllers('online');
    app.lockstep = new Lockstep(net.side, app.onlineDelay || 4);
    app.lockstep.m = ++app.netMatchNo;
    for (const msg of pendingNet.splice(0)) if (msg.m === app.lockstep.m) app.lockstep.receive(msg); else if (msg.m > app.lockstep.m) pendingNet.push(msg);
  }
  const m = new Match(defs, app.mode, app.level);
  app.match = m;
  show('screen-fight');
  await m.ready;
  if (app.match !== m || m.phase === 'over') return; // (e.g. the opponent forfeited while this was loading)
  if (app.mode !== 'online') await warmShaders(m); // (online: both sides start together, no extra wait)
  if (app.match !== m || m.phase === 'over') return;
  m.startRound();
  startMusic();
}

// Phones freeze for a moment the first time they draw something new (the graphics code for it is
// built then). Build it during the VS screen instead: the fighters (their hidden second forms too)
// and the kinds of materials the specials use, so the fight itself doesn't hitch.
const warmMats = [
  new THREE.MeshStandardMaterial({ color: '#888' }),
  new THREE.MeshStandardMaterial({ color: '#888', transparent: true }),
  new THREE.MeshStandardMaterial({ color: '#888', emissive: '#222', metalness: 0.5, roughness: 0.3 }),
  new THREE.MeshStandardMaterial({ color: '#888', side: THREE.DoubleSide, transparent: true }),
  new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide }),
];
async function warmShaders(m) {
  const tmp = new THREE.Group(), geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  for (const mat of warmMats) { const x = new THREE.Mesh(geo, mat); x.castShadow = true; tmp.add(x); }
  tmp.add(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  scene.add(tmp);
  const shown = [];
  for (const f of m.fighters) for (const r of [f.rig, f.altRig]) if (r?.object && !r.object.visible) { r.object.visible = true; shown.push(r.object); }
  await new Promise((r) => requestAnimationFrame(r)); // (let the VS screen show first)
  try { renderer.compile(scene, camera); } catch { /* the fight just compiles as it goes */ }
  for (const o of shown) o.visible = false;
  scene.remove(tmp); geo.dispose();
}

// ── portraits: render each fighter's head once, for the grid and HUD ─────────
async function makePortrait(def) {
  if (def.portrait) return def.portrait;
  const rig = createRig(def);
  await rig.ready;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight('#fff4e6', '#40302a', 2.2));
  const d = new THREE.DirectionalLight('#ffffff', 2.4);
  d.position.set(2, 3, 4);
  s.add(d);
  s.add(rig.object);
  rig.setFacing(1);
  rig.turn.rotation.y = 0.35;
  for (let i = 0; i < 8; i++) rig.update(0.1, 'idle', { t: 0 });
  rig.object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.object);
  const top = box.max.y;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0.25, top - 0.4, 2.5);
  cam.lookAt(0, top - 0.55, 0);
  const size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(s, cam);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  renderer.setRenderTarget(null);
  rt.dispose();
  rig.dispose();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  const layer = document.createElement('canvas');
  layer.width = layer.height = size;
  layer.getContext('2d').putImageData(img, 0, 0);
  const bg = g.createRadialGradient(size / 2, size * 0.4, 10, size / 2, size / 2, size * 0.7);
  bg.addColorStop(0, '#7a3a1c');
  bg.addColorStop(1, '#1a0b0b');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.drawImage(layer, 0, 0);
  return c.toDataURL('image/png');
}

async function buildPortraits() {
  for (const def of ROSTER) {
    try {
      const url = await makePortrait(def);
      app.portraits[def.id] = url;
      const t = tiles.find((t) => t.def.id === def.id);
      if (t) {
        const img = new Image();
        img.alt = '';
        img.src = url;
        t.el.querySelector('.ini').replaceWith(img);
      }
    } catch (err) {
      console.warn('portrait failed for', def.id, err);
    }
  }
}

// ── camera ───────────────────────────────────────────────────────────────────
function updateCamera(dt) {
  let tx, ty, tz, lx, ly;
  const m = app.match;
  if (m && ['fight', 'pause', 'result'].includes(app.screen)) {
    const [a, b] = m.fighters;
    const shot = introShot(m);
    if (shot === 0 || shot === 1) {
      // close-up: the face on one side of the frame, the camera slowly pushing in
      const f = m.fighters[shot];
      const u = shot === 0 ? m.pt / INTRO_SHOT : (m.pt - INTRO_SHOT) / INTRO_SHOT;
      const face = f.mouthPos().y + 0.1;
      lx = f.pos.x + f.facing * 0.32; ly = face - 0.05;
      tx = f.pos.x + f.facing * (shot === 0 ? 1.05 : 1.45); ty = face + 0.12 - u * 0.08; tz = 2.45 - u * 0.5;
    } else if (shot === 2) {
      // the two of them facing off, low and close, drifting sideways
      const u = (m.pt - INTRO_VS) / (INTRO_CINE - INTRO_VS);
      const mid = (a.pos.x + b.pos.x) / 2;
      lx = mid; ly = 1.15; tx = mid - 0.9 + u * 1.8; ty = 1.35; tz = 5.2 - u * 0.4;
    } else if (m.phase === 'ko' && m.fatal && m.pt >= (m.fatInstant ? 0 : 50)) {
      // fatality: move in on the two of them; when the screen goes black, close on the victim
      const l = m.fighters[1 - m.winner], w = m.fighters[m.winner];
      const xs = [l.pos.x, w.pos.x]; if (m.fatFx?.x !== undefined && m.fatFx.t) xs.push(m.fatFx.x); // (and the tiger)
      const lo = Math.min(...xs), hi = Math.max(...xs), mid = (lo + hi) / 2;
      const own = !m.fatFxDone && m.fatFx?.cam?.(); // (a fighter's own fatality can have its own shot: the tiger's mauling)
      if (own) { lx = own.x; ly = own.y; tx = own.x + own.side; ty = own.y + own.up; tz = own.z; }
      else if (m.cinema === 'black') { lx = l.pos.x; ly = 1.1; tx = l.pos.x + 0.4; ty = 1.3; tz = 3.6; }
      else { lx = mid; ly = 1.2; tx = mid; ty = 1.6; tz = clamp(fitDistance((hi - lo) / 2 + 1.6, 1.8), 5, 12); }
    } else if (m.phase === 'over') {
      const w = m.fighters[m.winner ?? 0];
      lx = w.pos.x; ly = 1.2;
      tx = w.pos.x + 0.8; ty = 1.8; tz = clamp(fitDistance(2.4, 2.2), 6, 14);
    } else if (app.specialCam && app.time < app.specialCam.until && m.phase === 'fight') {
      // a special's own shot (Or Haim's: tilting up to follow the opponent into the sky)
      const c = app.specialCam;
      const dist = clamp(fitDistance(c.half, c.halfH), c.near ?? 8, 26); // a close-up can come nearer
      lx = c.x; ly = c.y; tx = c.x; ty = c.y - (c.tilt ?? 0.6); tz = dist;
    } else {
      const mid = (a.pos.x + b.pos.x) / 2;
      const portrait = vp.h > vp.w;
      const half = Math.abs(a.pos.x - b.pos.x) / 2 + (portrait ? 1.1 : 2.3);
      const dist = clamp(fitDistance(half, 2.1), 8, 26);
      const maxMid = Math.max(0, PHYS.arenaHalf + 1.2 - half);
      lx = clamp(mid, -maxMid, maxMid); ly = 1.45;
      tx = lx; ty = 2.2 + dist * 0.06; tz = dist;
    }
  } else if (app.screen === 'select' || app.screen === 'vs') {
    const dist = clamp(fitDistance(3.4, 2.3), 6.5, 18);
    tx = 0; ty = 1.6; tz = dist; lx = 0; ly = 0.8;
    if (vp.h > vp.w) ly = 0; // portrait phones: leave room for the grid below
  } else {
    const t = app.time * 0.12;
    const dist = clamp(fitDistance(3.4, 1.4), 7, 16);
    tx = Math.sin(t) * 3.5; ty = 1.2 + Math.sin(t * 0.7) * 0.3; tz = dist;
    lx = 0; ly = vp.h > vp.w ? 2.2 : 1.9;
  }
  // hard cuts between intro shots; otherwise ease (gently during the slow cinematic drifts)
  let k = damp(introShot(m) >= 0 ? 0.25 : 0.08, dt);
  if (app.camCut) { app.camCut = false; k = 1; }
  camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
  camLook.x += (lx - camLook.x) * k; camLook.y += (ly - camLook.y) * k;
  camera.position.copy(camPos);
  if (app.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * app.shake;
    camera.position.y += (Math.random() - 0.5) * app.shake;
    app.shake *= Math.pow(0.86, dt * 60);
  }
  camera.lookAt(camLook);
}

// ── main loop ────────────────────────────────────────────────────────────────
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // FPS limit (settings): skip screen refreshes until it's time for the next frame. The fight runs
  // on its own fixed 60 steps a second either way (it just catches up two at a time at 30).
  const cap = quality.frameCap;
  if (cap) {
    const iv = 1000 / cap;
    if (now - lastDraw < iv - 3) return;
    lastDraw = Math.max(lastDraw + iv, now - iv); // steps of exactly 1/cap (right on 120 / 144 Hz screens too)
  }
  quality.sample((now - last) / 1000, app.screen === 'fight' && !app.paused);
  if (quality.showFps) { const el = $('#fps'); el.hidden = false; const v = Math.round(quality.fps); if (el.textContent !== `${v} FPS`) el.textContent = `${v} FPS`; } else $('#fps').hidden = true;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.time += dt;
  hub.poll();
  const sdt = dt * app.timeScale;
  const m = app.match;

  if (m && app.mode === 'online' && app.lockstep && m.phase !== 'loading') {
    onlineSteps(m, sdt);
  } else if (m && app.mode === 'watch' && m.phase !== 'loading') {
    watchSteps(m, sdt);
  } else if (m && !app.paused && ['fight', 'result'].includes(app.screen) && m.phase !== 'loading') {
    acc += sdt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      m.tick();
      if (app.tmatch && app.mode === '1p') recordLive(packInput(app.ctrls[0].held), packInput(app.ctrls[1].held));
      acc -= STEP; steps++;
    }
    if (steps === 4) acc = 0;
    app.ticked = steps > 0;
  } else {
    app.ticked = true;
  }

  switch (app.screen) {
    case 'title': menuCtrl.update(); titleMenu.handle(menuCtrl); break;
    case 'select': selectLogic(); break;
    case 'pause': menuCtrl.update(); pauseMenu.handle(menuCtrl); break;
    case 'result': menuCtrl.update(); resultMenu.handle(menuCtrl); break;
    case 'help': menuCtrl.update(); helpMenu.handle(menuCtrl); break;
    case 'graphics': menuCtrl.update(); pollTabPads(); graphicsMenu.handle(menuCtrl); break;
    case 'audio': {
      menuCtrl.update(); pollTabPads();
      const vol = audioMenu.items[audioMenu.i]?.dataset.nav === 'volume'; // ◀ ▶ change the volume
      if (vol && (menuCtrl.pressed.left || menuCtrl.pressed.right)) { setVolume(getVolume() + (menuCtrl.pressed.right ? 0.1 : -0.1)); renderAudioMenu(); sfx.move(); }
      audioMenu.handle(menuCtrl);
      break;
    }
    case 'controls': menuCtrl.update(); pollTabPads(); controlsScreen.handle(menuCtrl); break;
    case 'leave': menuCtrl.update(); leaveMenu.handle(menuCtrl); break;
    case 'account': menuCtrl.update(); if (menuCtrl.pressed.back && app.account && !document.activeElement?.matches('input')) (accSwitching ? $('#acc-cancel') : $('#acc-back')).click(); break;
    case 'fight': if (app.mode === 'online') { menuCtrl.update(); if (menuCtrl.pressed.start) pause(); } break;
    case 'tourney': menuCtrl.update(); break;
    case 'online': menuCtrl.update(); if (menuCtrl.pressed.back && !document.activeElement?.matches('input')) enterTitle(); break;
    default: break;
  }

  if (m) m.render(app.paused ? 0 : sdt);
  for (const a of actors) {
    if (!a) continue;
    a.t += dt * 60;
    if (a.anim === 'win' && a.t > 80) { a.anim = 'taunt'; a.t = 0; }
    a.rig.update(dt, a.anim, { t: a.t });
  }
  const k = (app.paused ? 0 : sdt) * 60;
  particles.update(k);
  rings.update(k);
  updateShards(k);
  updateExplosions(k / 60);
  updateBeams(k);
  confetti.update(k, app.time);
  arena.title3d.visible = !['title', 'select', 'vs'].includes(app.screen);
  scene.fog.near = camPos.z + arena.fogRange[0] * (1 - 0.6 * nightLevel);
  scene.fog.far = camPos.z + arena.fogRange[1] * (1 - 0.6 * nightLevel); // (at night the arena sinks into the dark)
  arena.update(app.time);
  // Orone's VIVA LA FRANCE: the plaza turns French while it lasts (and back after, wherever we are)
  arena.setFrance?.(!!m && ['fight', 'pause', 'result'].includes(app.screen) && m.fighters.some((f) => f.french > 0));
  contactShadows.update(m && ['fight', 'result', 'pause', 'vs'].includes(app.screen) ? m.fighters : null);
  updateSpiritWorld(app.time);
  updateCamera(dt);
  keepBlack();
  if (composer) renderComposed(); else renderer.render(scene, camera);
  if (app.ticked) hub.endFrame();
  if (hub.lastDevice !== app.lastDeviceSeen) { app.lastDeviceSeen = hub.lastDevice; refreshChrome(); }
}


// ── online 1v1 ───────────────────────────────────────────────────────────────
const localOnlineCtrl = new Controller(hub, [{ keys: 'p1' }, { keys: 'p2' }, { pad: 0 }, { pad: 1 }, { touch: true }]);
const pendingNet = [];
app.netMatchNo = 0;
app.rematch = [false, false];

function setStatus(text, err = false, el = $('#on-status')) {
  el.textContent = text || '';
  el.classList.toggle('err', !!err);
}

function friends() { return app.account?.friends || []; }

function renderMe() {
  const acc = app.account;
  $('#on-me').textContent = acc ? acc.name : '';
  $('#acc-me').textContent = acc ? acc.name : '';
  $('#on-friendsbox').hidden = !acc || acc.guest;
  $('#on-guestnote').hidden = !(acc && acc.guest);
}
const setFriendStatus = (text, err = false) => setStatus(text, err, $('#acc-fstatus'));

function renderFriends() {
  const ul = $('#on-friends');
  ul.innerHTML = '';
  renderRequests();
  const list = friends();
  const sent = app.account?.sent || [];
  if (!list.length && !sent.length) {
    ul.innerHTML = '<li class="empty">No friends yet. Add them by their username.</li>';
    return;
  }
  for (const p of sent) {
    const li = document.createElement('li');
    const nm = document.createElement('span');
    nm.className = 'fname';
    nm.textContent = p.name;
    const tag = document.createElement('span');
    tag.className = 'pending';
    tag.textContent = ' · waiting for them to accept';
    nm.appendChild(tag);
    const rm = document.createElement('button');
    rm.className = 'mini ghost';
    rm.type = 'button';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', `Cancel request to ${p.name}`);
    rm.addEventListener('click', async () => { applyAccount(await unfriend(p.name)); setFriendStatus(`Request to ${p.name} cancelled.`); });
    li.append(nm, rm);
    ul.appendChild(li);
  }
  list.forEach((f, i) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.title = 'offline';
    const nm = document.createElement('span');
    nm.className = 'fname';
    nm.textContent = f.name;
    const inv = document.createElement('button');
    inv.className = 'mini';
    inv.type = 'button';
    inv.textContent = 'Invite';
    inv.addEventListener('click', () => { unlockAudio(); if (tourney.active && tourney.s?.phase === 'lobby') { inviteFriend(f); openTourney(); } else { openOnline(); inviteFriend(f); } });
    const rm = document.createElement('button');
    rm.className = 'mini ghost';
    rm.type = 'button';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', `Remove ${f.name}`);
    rm.addEventListener('click', async () => {
      const r = await unfriend(f.name);
      if (r.ok === false && !r.local) { setFriendStatus(r.error || 'Could not remove them.', true); return; }
      applyAccount(r.local ? currentAccount() : r);
      if (!r.local) net.poke(f.name);
      setFriendStatus(`${f.name} removed from your friends (and you from theirs).`);
    });
    li.append(dot, nm, inv, rm);
    ul.appendChild(li);
    f._dot = dot;
  });
}

// incoming friend requests: accept or decline
function renderRequests() {
  const reqs = app.account?.requests || [];
  $('#fr-reqbox').hidden = !reqs.length;
  const ul = $('#fr-requests');
  ul.innerHTML = '';
  for (const q of reqs) {
    const li = document.createElement('li');
    const nm = document.createElement('span');
    nm.className = 'fname';
    nm.textContent = `${q.name} wants to be friends`;
    const yes = document.createElement('button');
    yes.className = 'mini'; yes.type = 'button'; yes.textContent = 'Accept';
    const no = document.createElement('button');
    no.className = 'mini ghost'; no.type = 'button'; no.textContent = 'Decline';
    const answer = async (accept) => {
      yes.disabled = no.disabled = true;
      const r = await respondFriend(q.name, accept);
      if (!r.ok) { setFriendStatus(r.error || 'Could not answer. Try again.', true); yes.disabled = no.disabled = false; return; }
      applyAccount(r);
      net.poke(q.name);
      setFriendStatus(accept ? `You and ${q.name} are now friends.` : `Declined ${q.name}.`);
      refreshPresence();
    };
    yes.addEventListener('click', () => answer(true));
    no.addEventListener('click', () => answer(false));
    li.append(nm, yes, no);
    ul.appendChild(li);
  }
}

// friends / requests / pending lists from the server (or this device)
function applyAccount(r) {
  if (!r || !app.account || app.account.guest) return;
  if (r.friends) app.account.friends = r.friends;
  if (r.requests) app.account.requests = r.requests;
  if (r.sent) app.account.sent = r.sent;
  renderBadge();
  if (app.screen === 'account') renderFriends();
  if (app.screen === 'online') { renderInvites(); refreshPresence(); }
}
async function pollFriends() {
  if (!app.account || app.account.guest) return;
  const had = (app.account.requests || []).length;
  const fresh = await refreshAccount();
  if (fresh && fresh.name === app.account?.name) {
    applyAccount(fresh);
    const reqs = fresh.requests || [];
    if (reqs.length > had && app.screen !== 'fight') showAnnounce('FRIEND REQUEST', { ms: 2400, cls: 'small', sub: `${reqs.at(-1).name.toUpperCase()} WANTS TO BE FRIENDS · TAP 👤 TO ANSWER` });
  }
}
net.onFriendsChanged = () => pollFriends();
// device-only accounts get friend requests through the relay: check often (cheap); accounts on
// the database server less often (each check costs database reads)
let lastFriendPoll = 0;
setInterval(() => {
  if (app.screen === 'fight' || document.hidden || !app.account || app.account.guest) return;
  const every = app.account.online ? 45000 : 8000;
  if (performance.now() - lastFriendPoll < every) return;
  lastFriendPoll = performance.now();
  pollFriends();
}, 2000);

// 1v1 screen: your friends with an Invite button (add/remove them on the account screen)
function renderInvites() {
  const acc = app.account;
  $('#on-invitebox').hidden = !acc || acc.guest;
  const ul = $('#on-invites');
  ul.innerHTML = '';
  const list = friends();
  if (!list.length) {
    ul.innerHTML = '<li class="empty">No friends yet. Add them under Account &amp; friends.</li>';
    return;
  }
  for (const f of list) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.title = 'offline';
    const nm = document.createElement('span');
    nm.className = 'fname';
    nm.textContent = f.name;
    const inv = document.createElement('button');
    inv.className = 'mini';
    inv.type = 'button';
    inv.textContent = 'Invite';
    inv.addEventListener('click', () => { unlockAudio(); inviteFriend(f); });
    li.append(dot, nm, inv);
    ul.appendChild(li);
    f._idot = dot;
  }
}

async function refreshPresence() {
  if (!app.account || app.account.guest) return;
  await Promise.all(friends().map(async (f) => {
    const on = await net.isOnline(f);
    for (const dot of [f._dot, f._idot]) if (dot) { dot.classList.toggle('on', on); dot.title = on ? 'in the game now' : 'offline'; }
  }));
}

function requireName() {
  if (app.account) return true;
  openAccount('online');
  return false;
}

function showRoom() {
  const hosting = net.roomCode && net.side === 0 && !net.active;
  $('#on-room').hidden = !hosting;
  $('#on-create').hidden = hosting;
  if (hosting) $('#on-roomcode').textContent = net.roomCode;
  $('#on-joinbox').hidden = hosting; // hosting a room: nothing to join
}

function openOnline() {
  endMatch();
  clearAnnounce();
  confetti?.stop();
  if (app.mode === 'online') { net.leave(); app.mode = '1p'; }
  if (!app.account) { openAccount('online'); return; }
  renderMe();
  renderInvites();
  showRoom();
  setStatus('');
  show('screen-online');
  refreshPresence();
}

async function createRoom() {
  if (!requireName()) return;
  setStatus('Creating a room…');
  try {
    const code = await net.createRoom();
    showRoom();
    setStatus(`Send your friend the code ${code}, the invite link, or invite them from your friends list.`);
  } catch (err) {
    setStatus(err.message || 'Could not create a room. Check your connection and try again.', true);
  }
}

net.onStatus = (text) => { if (app.screen === 'online') setStatus(text); };
net.onVisible = () => { net.reviveRoom(); tourney.checkLink(); }; // back in the app: get dropped links back
async function joinRoom(code) {
  if (!requireName()) return;
  code = (code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { setStatus('Room codes are 4 letters.', true); return; }
  setStatus(`Joining room ${code}… (this can take a few seconds)`);
  try {
    await net.joinRoom(code);
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function inviteFriend(f) {
  if (!requireName()) return;
  // in a tournament lobby: invite them to the tournament, not to a 1v1
  if (tourney.active && tourney.s?.phase === 'lobby') {
    const code = tourney.s.code;
    const ok = await net.inviteTourney(f, code).catch(() => false);
    const msg = ok ? `Tournament invite sent to ${f.name}.` : `Tournament invite sent to ${f.name}: they'll see it within a few seconds if they have the game open. Or send them the code ${code}.`;
    setStatus(msg); tStatus(msg);
    return;
  }
  setStatus(`Inviting ${f.name}…`);
  try {
    const ok = await net.invite(f);
    showRoom();
    setStatus(ok
      ? `Invite sent to ${f.name}. Waiting for them to accept (room ${net.roomCode}).`
      : `Invite sent to ${f.name}: they'll see it within a few seconds if they have the game open. You can also send them room code ${net.roomCode}.`);
  } catch (err) {
    setStatus(err.message || 'Could not send the invite.', true);
  }
}

function shareLink() {
  const url = `${location.origin}${location.pathname}#join-${net.roomCode}`;
  const text = `Fight me in Creative Kombat! Room ${net.roomCode}`;
  if (navigator.share) {
    navigator.share({ title: 'Creative Kombat', text, url }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(`${text} ${url}`).then(() => setStatus('Invite link copied. Paste it to your friend.'),
    () => setStatus(`Send your friend this link: ${url}`));
}

$('#on-switch').addEventListener('click', () => openAccount('online'));
$('#on-create').addEventListener('click', () => { unlockAudio(); createRoom(); });
$('#on-share').addEventListener('click', shareLink);
$('#on-join').addEventListener('click', () => { unlockAudio(); joinRoom($('#on-joincode').value); });
$('#on-joincode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(e.target.value); });
$('#on-add').addEventListener('click', async () => {
  const name = cleanName($('#on-addcode').value);
  if (!NAME_RE.test(name)) { setFriendStatus("Type your friend's username exactly as they wrote it.", true); return; }
  if (name.toLowerCase() === app.account.name.toLowerCase()) { setFriendStatus("That's you.", true); return; }
  if (friends().some((x) => x.name.toLowerCase() === name.toLowerCase())) { setFriendStatus(`${name} is already your friend.`); return; }
  $('#on-add').disabled = true;
  const r = await requestFriend(name);
  $('#on-add').disabled = false;
  if (!r.ok) { setFriendStatus(r.error || 'Could not send the request.', true); return; }
  $('#on-addcode').value = '';
  applyAccount(r.local ? currentAccount() : r);
  if (!r.local) net.poke(r.name || name);
  setFriendStatus(r.status === 'friends' ? `You and ${r.name || name} are now friends.` : `Friend request sent to ${r.name || name}. They'll appear here once they accept.`
    + (r.unverified ? " (The game can't check that this account exists until the account database is connected.)" : ''));
  refreshPresence();
});
$('#on-addcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#on-add').click(); });
$('#on-back').addEventListener('click', () => { net.leave(); enterTitle(); });

// invites arrive wherever you are in the game
let inviteTimer;
net.onInvite = ({ from, room, tourney: tcode }) => {
  if (net.active || !(room || tcode) || !app.account || app.account.guest || tourney.active || app.tmatch) return;
  $('#inv-from').textContent = from;
  $('#inv-what').textContent = tcode ? 'a TOURNAMENT' : 'an online fight';
  $('#invite-toast').dataset.tourney = tcode || '';
  $('#invite-toast').hidden = false;
  $('#invite-toast').dataset.room = room;
  sfx.confirm();
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(() => { $('#invite-toast').hidden = true; }, 30000);
};
$('#inv-yes').addEventListener('click', () => {
  $('#invite-toast').hidden = true;
  const room = $('#invite-toast').dataset.room;
  const tcode = $('#invite-toast').dataset.tourney;
  if (tcode) { openTourney(); joinTourney(tcode); return; }
  if (app.screen !== 'online') openOnline();
  joinRoom(room);
});
$('#inv-no').addEventListener('click', () => { $('#invite-toast').hidden = true; });

net.onConnected = () => {
  $('#invite-toast').hidden = true;
  if (tPending) { app.tmatch = tPending; tPending = null; } // my tournament match's room
  app.mode = 'online';
  app.netMatchNo = 0;
  pendingNet.length = 0;
  sfx.confirm();
  enterSelect('online');
};

net.onDisconnected = (reason, who) => {
  if (app.tmatch) { if (!app.tmatch.done) tourneyWalkover(who); return; }
  if (reason === 'full') return endOnline('That room already has two players.');
  endOnline(`${who || 'Your opponent'} left the match.`);
};

function endOnline(msg) {
  app.lockstep = null;
  app.mode = '1p';
  $('#net-wait').hidden = true;
  openOnline();
  setStatus(msg, true);
}

// FF: give up this match (the opponent wins it); you both stay connected for a rematch
function forfeitOnline() {
  const m = app.match;
  if (!m || m.phase === 'over' || app.mode !== 'online') { show('screen-fight'); return; }
  net.send({ t: 'ff', m: app.lockstep?.m });
  show('screen-fight');
  m.forfeit(net.side);
}

net.onMessage = (msg) => {
  switch (msg.t) {
    case 'ff': if (app.match && app.match.phase !== 'over' && msg.m === app.lockstep?.m) app.match.forfeit(1 - net.side); break;
    case 'hello': if (app.screen === 'select') renderSelect(); break;
    case 'sel': remoteSel(msg); break;
    case 'go': onGo(msg); break;
    case 'rematch':
      app.rematch[1 - net.side] = true;
      if (app.screen === 'result') showAnnounce(`${net.opponent} wants a rematch`, { ms: 0, cls: 'small', sub: 'CHOOSE REMATCH TO PLAY AGAIN' });
      onlineMaybeGo();
      break;
    case 'toselect': if (app.screen !== 'select') enterSelect('online'); break;
    case 'in':
    case 'hash':
      if (app.lockstep && msg.m === app.lockstep.m) app.lockstep.receive(msg);
      else if (msg.m > (app.lockstep?.m ?? 0)) pendingNet.push(msg);
      break;
  }
};

function syncSel(side) {
  if (app.mode !== 'online' || side !== net.side) return;
  const pick = sel.locked[side] ? resolvePick(side).id : null;
  net.send({ t: 'sel', i: sel.cursor[side], locked: sel.locked[side], pick });
}

function remoteSel(msg) {
  const other = 1 - net.side;
  if (app.screen !== 'select' || sel.done) return;
  const was = sel.locked[other];
  sel.cursor[other] = Math.max(0, Math.min(tiles.length - 1, msg.i | 0));
  sel.locked[other] = !!msg.locked;
  sel.randomPicks[other] = msg.locked && msg.pick ? ROSTER.find((d) => d.id === msg.pick) || null : null;
  if (msg.locked && !was) {
    sfx.confirm();
    if (actors[other]) { actors[other].anim = 'win'; actors[other].t = 0; }
  } else sfx.move();
  renderSelect();
  onlineMaybeGo();
}

function pickIds() { return [resolvePick(0).id, resolvePick(1).id]; }

// the host decides when the match starts (and the input delay both sides use)
function onlineMaybeGo() {
  if (net.side !== 0) return;
  if (app.screen === 'select' && sel.locked[0] && sel.locked[1] && !sel.done) {
    const msg = { t: 'go', delay: net.pickDelay(), picks: pickIds() };
    net.send(msg);
    onGo(msg);
  } else if (app.screen === 'result' && app.rematch[0] && app.rematch[1]) {
    const msg = { t: 'go', delay: net.pickDelay(), picks: app.match.defs.map((d) => d.id), rematch: true };
    net.send(msg);
    onGo(msg);
  }
}

function onGo(msg) {
  const defs = msg.picks.map((id) => ROSTER.find((d) => d.id === id));
  if (defs.some((d) => !d)) return endOnline('Your games have different fighters. Both of you should reload the page.');
  app.onlineDelay = msg.delay;
  app.rematch = [false, false];
  sel.done = true;
  if (msg.rematch) startMatch(defs);
  else showVersus(defs);
}

function onlineResult(nav) {
  if (nav === 'rematch') {
    app.rematch[net.side] = true;
    net.send({ t: 'rematch' });
    showAnnounce('REMATCH?', { ms: 0, cls: 'small', sub: `WAITING FOR ${(net.opponent || 'YOUR FRIEND').toUpperCase()}` });
    onlineMaybeGo();
  }
  if (nav === 'select') { net.send({ t: 'toselect' }); enterSelect('online'); }
  if (nav === 'title') { net.leave(); enterTitle(); }
}

function fingerprint(m) {
  return m.fighters.map((f) => `${f.hp.toFixed(3)},${f.pos.x.toFixed(3)},${f.pos.y.toFixed(3)},${f.state},${f.specialsLeft}`).join('|') + `|${m.timer}`;
}

// spectating a tournament match: replay the players' inputs about a second behind them
function watchSteps(m, sdt) {
  const w = app.watch, live = tourney.live[w?.key];
  if (!live) return;
  const have = live.frames.length / 2;
  acc += sdt;
  let steps = 0;
  const behind = have - w.f;
  const ahead = live.end ? 0 : 50; // keep a small buffer so it plays smoothly
  const max = behind > 240 ? 6 : 2; // far behind (joined late): catch up quickly
  while (acc >= STEP && steps < max && w.f < have - ahead) {
    app.ctrls[0].set(live.frames[2 * w.f]);
    app.ctrls[1].set(live.frames[2 * w.f + 1]);
    m.tick();
    w.f++;
    steps++;
    if (behind <= 240) acc -= STEP;
  }
  if (steps === 0) acc = Math.min(acc, STEP);
  app.ticked = steps > 0;
  $('#net-wait').hidden = !(steps === 0 && !live.end && m.phase !== 'over');
  // the match ended without a winner on screen (someone forfeited or left): back to the bracket
  if (live.end && w.f >= have && m.phase !== 'over' && !w.closing) { w.closing = true; setTimeout(() => { if (app.watch === w) stopWatching(); }, 1500); }
}
function startWatching(key) {
  const [r, i] = key.split('-').map(Number), mm = tourney.s?.rounds?.[r]?.[i];
  if (!mm) return;
  if (app.watch) { // switching to another match: drop this one first
    app.watch = null;
    $('#net-wait').hidden = true;
    $('#screen-result .menu').hidden = false;
    openTourney();
  }
  app.watch = { key, f: 0, r, i };
  tourney.watch(key);
  tStatus(`Connecting to ${matchTitle(mm)}… (it shows once the fight has started)`);
  const begin = () => {
    const live = tourney.live[key];
    if (!app.watch || app.watch.key !== key) return;
    if (!live?.picks || live.frames.length < 120) { if (tourney.s?.rounds?.[r]?.[i]?.w === null) setTimeout(begin, 500); else stopWatching(); return; }
    const defs = live.picks.map((id) => ROSTER.find((d) => d.id === id));
    if (defs.some((d) => !d)) { stopWatching(); return; }
    app.mode = 'watch';
    app.ctrls = [new FrameController(), new FrameController()];
    app.watch.names = live.names || [];
    startMatch(defs);
    renderWatchBar();
  };
  begin();
}
function stopWatching() {
  if (!app.watch) return;
  app.watch = null;
  renderWatchBar();
  $('#net-wait').hidden = true;
  $('#screen-result .menu').hidden = false;
  openTourney();
}

// the matches I could watch right now: anyone else's that's being played, with at least one person in it
function watchable() {
  const s = tourney.s, out = [];
  if (!s?.rounds || s.phase !== 'running') return out;
  s.rounds.forEach((round, r) => round.forEach((m, i) => {
    if (m.w !== null || m.a === null || m.b === null || m.a === tourney.me || m.b === tourney.me) return;
    if (s.players[m.a].cpu && s.players[m.b].cpu) return; // settled instantly, nothing to watch
    out.push({ key: `${r}-${i}`, r, i, m });
  }));
  return out;
}
const matchTitle = (m) => `${tourney.s.players[m.a].name} vs ${tourney.s.players[m.b].name}`;

// while watching: which match, and arrows to flick to the others
function renderWatchBar() {
  const bar = $('#watch-bar'), w = app.watch;
  bar.hidden = !(w && app.mode === 'watch' && app.match);
  if (bar.hidden) return;
  const list = watchable(), m = tourney.s?.rounds?.[w.r]?.[w.i];
  $('#wb-name').textContent = `👁 ${m ? matchTitle(m) : 'MATCH'} · ${roundName(tourney.s, w.r)}`;
  const others = list.length - (list.some((x) => x.key === w.key) ? 1 : 0);
  $('#wb-prev').hidden = $('#wb-next').hidden = others < 1;
}
function flickWatch(dir) {
  const list = watchable();
  if (!list.length || !app.watch) return;
  const at = list.findIndex((x) => x.key === app.watch.key);
  const next = list[((at < 0 ? (dir > 0 ? -1 : 0) : at) + dir + list.length) % list.length];
  if (next && next.key !== app.watch.key) startWatching(next.key);
}
$('#wb-prev').addEventListener('click', () => { unlockAudio(); flickWatch(-1); });
$('#wb-next').addEventListener('click', () => { unlockAudio(); flickWatch(1); });
$('#wb-exit').addEventListener('click', () => { unlockAudio(); stopWatching(); });

// tournament spectators: the player who opened the match room sends both players' inputs to the
// tournament host twice a second; the host passes them to whoever is watching
function recordLive(i0, i1, end = false) {
  const t = app.tmatch, rec = app.liveRec;
  if (!t || !tourney.active || (app.mode === 'online' ? net.side !== 0 : app.mode !== '1p')) return;
  if (!rec || rec.key !== `${t.r}-${t.i}`) {
    app.liveRec = { key: `${t.r}-${t.i}`, frames: [], sent: 0, picks: app.match?.defs.map((d) => d.id),
      names: [tourney.s.players[tourney.me]?.name, t.oppName] };
    return recordLive(i0, i1, end);
  }
  if (!end) rec.frames.push(i0, i1);
  if (rec.frames.length - rec.sent >= 60 || end) {
    tourney.send({ t: 'tlive', key: rec.key, picks: rec.picks, names: rec.names, from: rec.sent, frames: rec.frames.slice(rec.sent), end });
    rec.sent = rec.frames.length;
  }
}

let waitFrames = 0;
function onlineSteps(m, sdt) {
  const ls = app.lockstep;
  acc += sdt;
  let steps = 0, blocked = false;
  const wanted = acc >= STEP;
  while (acc >= STEP && steps < 6) {
    if (!ls.canStep()) { acc = Math.min(acc, STEP * 3); blocked = true; break; }
    localOnlineCtrl.update();
    const [i0, i1] = ls.step(packInput(localOnlineCtrl.held));
    app.ctrls[0].set(i0);
    app.ctrls[1].set(i1);
    recordLive(i0, i1);
    m.tick();
    ls.afterTick(() => fingerprint(m));
    acc -= STEP;
    steps++;
  }
  app.ticked = steps > 0;
  waitFrames = ls.canStep() || steps ? 0 : waitFrames + 1;
  $('#net-wait').hidden = waitFrames < 45;
  if (ls.desync && !ls.desyncShown) {
    ls.desyncShown = true;
    console.warn('online fight out of sync');
  }
}


// ── tournament (knockout for however many join; see tourney.js) ──────────────
let tPending = null;  // the tournament match whose online room I'm opening / joining
let tDriving = '';    // which match I've already started setting up
let tTimer = null;
let tLeaveArmed = 0;
const tStatus = (text, err = false) => setStatus(text, err, $('#t-status'));
const roundLabel = (r) => roundName(tourney.s, r).toLowerCase();
const isFinal = (r) => r === (tourney.s?.rounds?.length ?? 1) - 1;

function openTourney() {
  endMatch();
  clearAnnounce();
  confetti?.stop();
  if (app.mode === 'online') { net.leave(); app.lockstep = null; }
  app.mode = '1p';
  app.paused = false;
  if (!app.account) { openAccount('tourney'); return; }
  show('screen-tourney');
  tLeaveArmed = 0;
  renderTourney();
  if (!tourney.active && app.tEnd) { tStatus(app.tEnd, true); app.tEnd = null; }
  tourneyDrive();
}

function renderTourney() {
  const s = tourney.s;
  $('#t-entry').hidden = !!s;
  $('#t-lobby').hidden = !s || s.phase !== 'lobby';
  $('#t-bracket').hidden = !s || s.phase === 'lobby';
  $('#t-back').textContent = s ? (tLeaveArmed ? 'TAP AGAIN TO LEAVE' : 'LEAVE TOURNAMENT') : 'BACK';
  if (!s) return;
  if (s.phase === 'lobby') return renderTourneyLobby(s);
  const cols = $('#t-cols');
  cols.innerHTML = '';
  // the matches being played now: pick one to watch (not while my own match is waiting for me)
  const canWatch = !tourney.myMatch(), list = canWatch ? watchable() : [];
  const watchKeys = new Set(list.map((x) => x.key));
  const pick = $('#t-live');
  pick.hidden = !list.length;
  pick.querySelector('.t-live-list').innerHTML = '';
  for (const x of list) {
    const b = document.createElement('button');
    b.className = 'mini';
    b.type = 'button';
    b.textContent = `👁 ${matchTitle(x.m)} · ${roundName(s, x.r).toLowerCase()}`;
    b.addEventListener('click', () => { unlockAudio(); startWatching(x.key); });
    pick.querySelector('.t-live-list').appendChild(b);
  }
  s.rounds.forEach((round, r) => {
    const col = document.createElement('div');
    col.className = 't-col';
    const h = document.createElement('h4');
    h.textContent = isFinal(r) ? 'FINAL' : `${roundName(s, r)}S`.replace(/^(ROUND \d+)S$/, '$1');
    col.appendChild(h);
    const ms = document.createElement('div');
    ms.className = 't-ms';
    col.appendChild(ms);
    round.forEach((m, mi) => {
      const box = document.createElement('div');
      box.className = 't-match' + (m.w === null && m.a !== null && m.b !== null ? ' live' : '');
      // someone else's match, being played now: you can watch it
      if (canWatch && watchKeys.has(`${r}-${mi}`)) {
        const wb = document.createElement('button');
        wb.className = 'mini t-watch';
        wb.type = 'button';
        wb.textContent = '👁 WATCH';
        wb.addEventListener('click', () => { unlockAudio(); startWatching(`${r}-${mi}`); });
        box.appendChild(wb);
      }
      for (const [k, idx] of [m.a, m.b].entries()) {
        const row = document.createElement('div');
        if (k === 1 && m.bye) { row.className = 't-p tbd'; row.textContent = 'BYE'; box.appendChild(row); continue; }
        const p = idx === null ? null : s.players[idx];
        row.className = 't-p' + (idx === null ? ' tbd' : m.w === null ? '' : m.w === idx ? ' win' : ' lose')
          + (idx !== null && idx === tourney.me ? ' me' : '') + (p?.gone && !p.cpu ? ' gone' : '');
        row.textContent = p ? p.name + (idx === tourney.me ? ' (you)' : '') + (p.gone && !p.cpu ? ' · reconnecting…' : '') : 'TBD';
        box.appendChild(row);
      }
      ms.appendChild(box);
    });
    cols.appendChild(col);
  });
  if (s.phase === 'done') {
    const champ = s.players[s.champ];
    const p = document.createElement('p');
    p.className = 't-champ';
    p.textContent = `🏆 ${champ.name} ${s.champ === tourney.me ? '(YOU!)' : ''} WINS THE TOURNAMENT`;
    cols.after(p);
    $$('.t-champ').forEach((x) => { if (x !== p) x.remove(); });
    tStatus(s.champ === tourney.me ? 'You are the champion!' : 'The tournament is over. Leave it to start a new one.');
  } else {
    $$('.t-champ').forEach((x) => x.remove());
    const mine = tourney.myMatch();
    if (tourney.reconnecting) tStatus('Connection lost. Reconnecting to the tournament…', true);
    else if (!mine) tStatus(tourney.out() ? "You're out. Stay to watch how it ends, or leave." : 'Waiting for the other matches to finish…');
  }
}

function renderTourneyLobby(s) {
  $('#t-code').textContent = s.code;
  const live = s.players.map((p, i) => [p, i]).filter(([p]) => !p.gone || Date.now() - (p.goneAt || 0) < GRACE_MS);
  $('#t-count').textContent = `(${live.length}/${bracketSize(live.length)})`;
  const ol = $('#t-players');
  ol.innerHTML = '';
  for (const [p, i] of live) {
    const li = document.createElement('li');
    li.textContent = p.name + (i === 0 ? ' (host)' : '') + (i === tourney.me ? ' (you)' : '') + (p.gone ? ' · reconnecting…' : '');
    if (i === tourney.me) li.className = 'me';
    ol.appendChild(li);
  }
  const size = bracketSize(live.length);
  for (let k = live.length; k < size; k++) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'empty seat (CPU fighter if nobody joins)';
    ol.appendChild(li);
  }
  $('#t-start').hidden = !tourney.isHost;
  $('#t-invitebox').hidden = !!app.account?.guest;
  renderTourneyInvites(s);
  if (!tourney.isHost) tStatus(`You're in! Waiting for ${s.players[0].name} to start the tournament…`);
  else tStatus(live.length < 2 ? 'Share the code or invite friends. Once someone joins you can start.'
    : live.length >= TOURNEY_MAX ? 'Full! Start when ready.'
      : `Start whenever you're ready: ${live.length} players${bracketSize(live.length) > live.length ? ` + ${bracketSize(live.length) - live.length} CPU fighter${bracketSize(live.length) - live.length > 1 ? 's' : ''}` : ''}. More can still join.`);
  $('#t-start').disabled = live.length < 2;
}

function renderTourneyInvites(s) {
  const ul = $('#t-invites');
  ul.innerHTML = '';
  const inLobby = new Set(s.players.filter((p) => !p.gone).map((p) => p.name.toLowerCase()));
  const list = friends().filter((f) => !inLobby.has(f.name.toLowerCase()));
  if (!list.length) { ul.innerHTML = `<li class="empty">${friends().length ? 'All your friends are in.' : 'No friends yet. Share the code instead.'}</li>`; return; }
  for (const f of list) {
    const li = document.createElement('li');
    const nm = document.createElement('span');
    nm.className = 'fname';
    nm.textContent = f.name;
    const b = document.createElement('button');
    b.className = 'mini';
    b.type = 'button';
    b.textContent = 'Invite';
    b.addEventListener('click', async () => {
      unlockAudio();
      b.disabled = true;
      tStatus(`Inviting ${f.name}…`);
      const ok = await net.inviteTourney(f, s.code).catch(() => false);
      b.disabled = false;
      tStatus(ok ? `Invite sent to ${f.name}.` : `Invite sent to ${f.name}: they'll see it within a few seconds if they have the game open. You can also send them the code ${s.code}.`);
    });
    li.append(nm, b);
    ul.appendChild(li);
  }
}

// start my next match when it's ready (only while looking at the bracket)
function tourneyDrive() {
  if (app.screen !== 'tourney' || app.tmatch || !tourney.s) return;
  const mm = tourney.myMatch();
  if (!mm) { tDriving = ''; return; }
  const s = tourney.s;
  const key = `${s.code}-${mm.r}-${mm.i}`;
  const opp = s.players[mm.opp];
  const info = { r: mm.r, i: mm.i, oppIdx: mm.opp, oppName: opp.name };
  const label = `Your ${roundLabel(mm.r)} vs ${opp.name}`;
  if (opp.cpu) {
    tStatus(`${label}. Get ready…`);
    if (tDriving === key) return;
    tDriving = key;
    clearTimeout(tTimer);
    tTimer = setTimeout(() => {
      const still = tourney.myMatch();
      if (app.screen !== 'tourney' || app.tmatch || !still || still.r !== mm.r || still.i !== mm.i) { tDriving = ''; return; }
      app.tmatch = { ...info, cpu: opp.fighter };
      enterSelect('1p');
    }, 2500);
    return;
  }
  if (mm.m.a === tourney.me) {
    // I open the room and tell the host its code; they join it
    tStatus(`${label}. Waiting for ${opp.name} to connect…`);
    if (tDriving === key) return;
    tDriving = key;
    tPending = info;
    net.createRoom().then((code) => {
      if (tPending === info) tourney.reportRoom(mm.r, mm.i, code);
      // nobody came (their game was in the background, or the room's link died while mine was):
      // open a fresh room and tell the host its new code
      setTimeout(() => {
        if (tPending !== info || net.active || app.tmatch) return;
        tDriving = '';
        tourneyDrive();
      }, 40000);
    }).catch(() => {
      tPending = null;
      tStatus('Could not open your match room. Trying again…', true);
      setTimeout(() => { tDriving = ''; tourneyDrive(); }, 3000);
    });
  } else {
    if (!mm.m.room) { tStatus(`${label}. Waiting for ${opp.name}…`); return; }
    tStatus(`${label}. Connecting…`);
    if (tDriving === key + mm.m.room) return;
    tDriving = key + mm.m.room;
    tPending = info;
    net.joinRoom(mm.m.room).catch(() => {
      tPending = null;
      tStatus(`Could not reach ${opp.name}. Trying again…`, true);
      setTimeout(() => { tDriving = ''; tourneyDrive(); }, 3000);
    });
  }
}

function tourneyMatchDone(winSide) {
  const t = app.tmatch;
  if (!t || t.done) return;
  recordLive(0, 0, true); // the last frames for anyone watching
  t.done = true;
  const won = winSide === (app.mode === 'online' ? net.side : 0);
  tourney.reportResult(t.r, t.i, won ? tourney.me : t.oppIdx);
  $('#screen-result .menu').hidden = true;
  showAnnounce(won ? (isFinal(t.r) ? 'CHAMPION!' : 'YOU ADVANCE') : 'ELIMINATED', {
    ms: 0, cls: won ? 'small' : 'small red',
    sub: won ? (isFinal(t.r) ? 'YOU WON THE TOURNAMENT' : `ON TO THE ${roundName(tourney.s, t.r + 1)}`) : `${t.oppName.toUpperCase()} MOVES ON`,
  });
  setTimeout(backToTourney, 4500);
}

// the opponent left mid-match: I go through
function tourneyWalkover(who) {
  const t = app.tmatch;
  t.done = true;
  tourney.reportResult(t.r, t.i, tourney.me);
  app.lockstep = null;
  $('#net-wait').hidden = true;
  endMatch();
  show('screen-fight');
  showAnnounce('YOU ADVANCE', { ms: 0, cls: 'small', sub: `${(who || t.oppName).toUpperCase()} LEFT THE MATCH` });
  setTimeout(backToTourney, 3000);
}

function tourneyForfeit() {
  const t = app.tmatch;
  if (!t) return;
  t.done = true;
  tourney.reportResult(t.r, t.i, t.oppIdx);
  backToTourney();
}

function backToTourney() {
  if (!app.tmatch) return;
  app.tmatch = null;
  tPending = null;
  $('#screen-result .menu').hidden = false;
  openTourney();
}

async function joinTourney(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { tStatus('Tournament codes are 4 letters.', true); return; }
  $('#t-joincode').value = code;
  tStatus(`Joining tournament ${code}… (this can take a few seconds)`);
  try {
    await tourney.join(code, app.account.name);
    renderTourney();
    tourneyDrive();
  } catch (err) {
    renderTourney();
    tStatus(err.message, true);
  }
}

tourney.onState = () => { if (app.screen === 'tourney') { renderTourney(); tourneyDrive(); } if (app.watch) { if (tourney.myMatch()) stopWatching(); else renderWatchBar(); } }; // my own match is ready: go play it
tourney.onEnd = (why) => {
  app.tEnd = why;
  if (app.screen === 'tourney') { renderTourney(); tStatus(why, true); app.tEnd = null; }
};

$('#t-create').addEventListener('click', async () => {
  unlockAudio();
  tStatus('Creating a tournament…');
  try {
    await tourney.create(app.account.name);
    renderTourney();
  } catch (err) {
    tStatus(err.message, true);
  }
});
$('#t-join').addEventListener('click', () => { unlockAudio(); joinTourney($('#t-joincode').value); });
$('#t-joincode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTourney(e.target.value); });
$('#t-start').addEventListener('click', () => { unlockAudio(); tourney.start(); });
$('#t-share').addEventListener('click', () => {
  const code = tourney.s?.code;
  if (!code) return;
  const url = `${location.origin}${location.pathname}#tourney-${code}`;
  const text = `Join my Creative Kombat tournament! Code ${code}`;
  if (navigator.share) { navigator.share({ title: 'Creative Kombat', text, url }).catch(() => {}); return; }
  navigator.clipboard?.writeText(`${text} ${url}`).then(() => tStatus('Invite link copied. Paste it to your friends.'),
    () => tStatus(`Send your friends this link: ${url}`));
});
$('#t-back').addEventListener('click', () => {
  if (!tourney.active) { enterTitle(); return; }
  // a stray tap shouldn't throw you out of a tournament
  if (!tLeaveArmed || performance.now() - tLeaveArmed > 3000) { tLeaveArmed = performance.now(); renderTourney(); return; }
  tLeaveArmed = 0;
  clearTimeout(tTimer);
  tDriving = '';
  tPending = null;
  net.leave();
  tourney.leave();
  enterTitle();
});

// ── accounts ─────────────────────────────────────────────────────────────────
let accMode = 'login';
let accReturn = 'title';
let accSwitching = false;

async function setAccount(acc) {
  // The online registration stays up through a log-out; it's replaced only when a different
  // account logs in (the server takes a while to free a name that was just closed).
  app.account = acc;
  net.me = acc;
  if (acc && !acc.guest) net.startInvitePoll(); // invites through the game's relay
  renderBadge();
  if (acc && !acc.guest) {
    net.startIdentity(); // (the same account can be online on several devices at once)
  }
}

function renderBadge() {
  const b = $('#acct-badge');
  const n = app.account?.requests?.length || 0;
  b.textContent = app.account ? `👤 ${app.account.name}${n ? ` (${n})` : ''}` : '👤 Log in';
  b.classList.toggle('alert', n > 0);
  b.hidden = !['title', 'online'].includes(app.screen);
}

function renderAccount() {
  // quick picks: accounts used on this device (not the one you're already on)
  const saved = recentNames().filter((n) => n.toLowerCase() !== app.account?.name?.toLowerCase()).map((name) => ({ name }));
  const box = $('#acc-saved');
  box.innerHTML = '';
  for (const a of saved) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = a.name;
    btn.classList.toggle('on', $('#acc-name').value.toLowerCase() === a.name.toLowerCase() && accMode === 'login');
    btn.addEventListener('click', () => { setAccMode('login'); $('#acc-name').value = a.name; $('#acc-pin').value = ''; $('#acc-pin').focus(); renderAccount(); });
    box.appendChild(btn);
  }
  $('#acc-tab-login').classList.toggle('ghost', accMode !== 'login');
  $('#acc-tab-create').classList.toggle('ghost', accMode !== 'create');
  $('#acc-submit').textContent = accMode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT';
  $('#acc-pin').autocomplete = accMode === 'login' ? 'current-password' : 'new-password';
  // signed in: only Back / Switch account / Log out; switching only logs in to another
  // account (new accounts are made after logging out)
  const profile = !!app.account && !accSwitching;
  $('#acc-profile').hidden = !profile;
  $('#acc-signin').hidden = profile;
  $('#acc-tabs').hidden = !!app.account;
  $('#acc-guest').hidden = !!app.account;
  $('#acc-cancel').hidden = !app.account;
  $('#acc-title').textContent = app.account ? 'SWITCH ACCOUNT' : "WHO'S PLAYING?";
  if (profile) { renderMe(); renderFriends(); setFriendStatus(''); refreshPresence(); }
}

function setAccMode(mode) {
  accMode = mode;
  $('#acc-status').textContent = '';
  renderAccount();
}

function openAccount(from = 'title') {
  accReturn = from;
  accSwitching = false;
  $('#acc-pin').value = '';
  if (app.account) accMode = 'login';
  else if (!recentNames().length) accMode = 'create';
  $('#acc-name').value = accMode === 'login' ? (app.account && !app.account.guest ? app.account.name : recentNames()[0] || '') : '';
  $('#acc-status').textContent = takeAccountNotice();
  show('screen-account');
  renderAccount();
}

function afterLogin() {
  if (app.pendingJoin) {
    const code = app.pendingJoin;
    app.pendingJoin = null;
    openOnline();
    $('#on-joincode').value = code;
    joinRoom(code);
  } else if (app.pendingTourney) {
    const code = app.pendingTourney;
    app.pendingTourney = null;
    openTourney();
    joinTourney(code);
  } else if (accReturn === 'online') openOnline();
  else if (accReturn === 'tourney') openTourney();
  else enterTitle();
}

$('#acc-tab-login').addEventListener('click', () => setAccMode('login'));
$('#acc-tab-create').addEventListener('click', () => { setAccMode('create'); $('#acc-name').value = ''; $('#acc-name').focus(); });
$('#acc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  unlockAudio();
  const name = $('#acc-name').value, pin = $('#acc-pin').value;
  if (!PIN_RE.test(pin)) { $('#acc-status').textContent = 'The PIN must be 4–6 digits.'; return; }
  $('#acc-submit').disabled = true;
  const r = accMode === 'login' ? await login(name, pin) : await createAccount(name, pin);
  $('#acc-submit').disabled = false;
  if (!r.ok) { $('#acc-status').textContent = r.error; return; }
  sfx.confirm();
  if (app.account && app.account.name !== r.name) net.leave(); // switched: drop the old account's room
  accSwitching = false;
  setAccount(currentAccount());
  if (takeSettingsReload()) { location.reload(); return; } // this account's settings (controls, graphics, sound) come with it
  afterLogin();
});
$('#acc-guest').addEventListener('click', () => { unlockAudio(); guestLogin(); setAccount(currentAccount()); afterLogin(); });
$('#acc-logout').addEventListener('click', () => { net.leave(); logout(); setAccount(null); setAccMode('login'); openAccount(); });
$('#acc-back').addEventListener('click', () => (accReturn === 'online' ? openOnline() : accReturn === 'tourney' && app.account ? openTourney() : enterTitle()));
$('#acc-switch').addEventListener('click', () => {
  accSwitching = true;
  setAccMode('login');
  const other = recentNames().find((n) => n.toLowerCase() !== app.account?.name.toLowerCase());
  $('#acc-name').value = other || '';
  $('#acc-pin').value = '';
  (other ? $('#acc-pin') : $('#acc-name')).focus();
});
$('#acc-cancel').addEventListener('click', () => { accSwitching = false; renderAccount(); });
$('#acct-badge').addEventListener('click', () => openAccount(app.screen === 'online' ? 'online' : 'title'));

function initOnline() {
  const t = location.hash.match(/^#tourney-([A-Za-z]{4})$/);
  if (t) {
    history.replaceState(null, '', location.pathname + location.search);
    if (app.account) { openTourney(); joinTourney(t[1]); } else app.pendingTourney = t[1].toUpperCase();
  }
  const m = location.hash.match(/^#join-([A-Za-z]{4})$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    if (app.account) openOnline();
    $('#on-joincode').value = m[1].toUpperCase();
    if (app.account) joinRoom(m[1]);
    else app.pendingJoin = m[1].toUpperCase();
  }
}

// ── chrome buttons ───────────────────────────────────────────────────────────
$('#btn-pause').addEventListener('click', () => pause());
$('#btn-fatality').addEventListener('click', (e) => { e.currentTarget.blur(); unlockAudio(); app.match?.practiceFatality(); });
$('#sel-arena').addEventListener('click', () => { unlockAudio(); nextArena(); });
$('#sel-back').addEventListener('click', () => { unlockAudio(); unlockLast(); }); // a step back: undo the last pick, or leave
// every tap: the phone may have paused the game's audio since (another app, a call)
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlockVoice, { capture: true });

// opened from the Home Screen it's already full screen
const standalone = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const el = document.documentElement;
const canFull = !!(el.requestFullscreen || el.webkitRequestFullscreen);
if (standalone) $('#btn-full').hidden = true; // (the installed app is full screen already)
$('#btn-reload').addEventListener('click', () => location.reload());
$('#btn-full').addEventListener('click', async () => {
  // iPhone Safari has no full screen for pages: explain Add to Home Screen instead
  if (!canFull) { $('#fs-tip').hidden = false; return; }
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      navigator.keyboard?.lock?.(['Escape']).catch(() => {}); // computer: Esc pauses (hold Esc to leave full screen)
      await screen.orientation?.lock?.('landscape');
    }
  } catch { $('#fs-tip').hidden = false; }
});
$('#fs-tip-ok').addEventListener('click', () => { $('#fs-tip').hidden = true; });
// Install as an app: opened from the home screen it's full screen and sideways from the start,
// with no tap needed (a website can't do that on its own). The phone offers it, we show a button.
let installEvt = null;
try { navigator.serviceWorker?.register('/sw.js'); } catch { /* not supported */ }
// (in the corner next to full screen, in the browser only: the installed app has neither)
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  if (!standalone) $('#btn-install').hidden = false;
});
addEventListener('appinstalled', () => { installEvt = null; $('#btn-install').hidden = true; });
$('#btn-install').addEventListener('click', () => installApp());
async function installApp() {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch { /* dismissed */ }
}


addEventListener('pointerdown', () => unlockAudio(), { once: false });
addEventListener('keydown', () => unlockAudio());
hub.onPadsChanged = () => { if (app.screen === 'select') renderSelect(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && app.screen === 'fight' && app.mode !== 'online') pause(); });
// in full screen the browser keeps Esc for itself (leaving full screen): pause the fight then too
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => {
  if (!(document.fullscreenElement || document.webkitFullscreenElement) && app.screen === 'fight') pause();
});

// ── arenas and the player's own fighters ─────────────────────────────────────
function setArena(cfg) {
  if (arena?.cfg === cfg || (arena?.cfg && cfg && arena.cfg.id === cfg.id && JSON.stringify(arena.cfg) === JSON.stringify({ ...DEFAULT_ARENA, ...cfg }))) return;
  arena?.dispose();
  arena = new CustomArena(scene, cfg);
  const S = arena.sky;
  scene.environment?.dispose?.();
  // soft light from the whole sky, in the arena's colours
  scene.environment = makeEnvironment(renderer, { top: S.top, horizon: S.horizon, ground: '#6b5a48', sunColor: S.sun, power: 0.25 + 0.2 * S.light });
  arena.group.traverse((o) => { for (const mm of [].concat(o.material || [])) if (mm.isMeshStandardMaterial) mm.envMapIntensity = mm.userData.env = 0.45; });
  arenaObjects = arena.group.children;
  if (night) { night = null; nightLevel = 0; }
  applyShadows();
}
const ARENA_NAV = () => app.arenas || [DEFAULT_ARENA];
function renderArenaPick() { const b = $('#sel-arena'); if (b) b.textContent = `ARENA: ${app.arenaCfg?.name || DEFAULT_ARENA.name} ▸`; }
function nextArena() {
  const list = ARENA_NAV(), i = list.findIndex((a) => a.id === app.arenaCfg?.id);
  app.arenaCfg = list[(i + 1) % list.length];
  try { localStorage.setItem('ck-arena', app.arenaCfg.id); } catch { /* ignore */ }
  setArena(app.arenaCfg);
  renderArenaPick();
}
async function refreshCustomFighters(rebuild) {
  for (let i = ROSTER.length - 1; i >= 0; i--) if (ROSTER[i].custom) ROSTER.splice(i, 1);
  ROSTER.push(...await loadCustomFighters());
  if (rebuild) { buildGrid(); buildPortraits(); }
}
async function serverUp() {
  try {
    const r = await Promise.race([fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"ping"}' }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))]);
    return r.status !== 404 && (r.headers.get('content-type') || '').includes('json');
  } catch { return false; }
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  $('#logo').innerHTML = '';
  $('#logo').append(GAME_TITLE);
  const small = document.createElement('small');
  small.textContent = GAME_SUBTITLE;
  $('#logo').appendChild(small);
  document.title = GAME_TITLE.replace(/\w\S*/g, (w) => w[0] + w.slice(1).toLowerCase());
  try {
    await Promise.race([Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('800 40px Rubik', 'רחבת דגל')]), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* fall back to system font */ }
  // the player's own fighters and arenas (kept on this device)
  await refreshCustomFighters(false);
  app.arenas = await allArenas();
  let saved = null; try { saved = localStorage.getItem('ck-arena'); } catch { /* ignore */ }
  app.arenaCfg = app.arenas.find((a) => a.id === saved) || DEFAULT_ARENA;
  setArena(app.arenaCfg);
  contactShadows = new ContactShadows(scene);
  goldLight = new GoldLight(scene);
  applyShadows();
  particles = new Particles(scene);
  rings = new Rings(scene);
  confetti = new Confetti(scene, CONFETTI_COLORS);
  buildGrid();
  initCreator({
    show, backToTitle: () => { setArena(app.arenaCfg); enterTitle(); },
    // (back: from the special editor's TRY IT NOW, where QUIT goes back to the editor)
    practice: (def, back = null) => { setArena(app.arenaCfg); app.practice = true; app.mode = '1p'; app.ctrls = null; app.tmatch = null; app.returnTo = back; setQuitLabel(); startMatch([def, DUMMY]); },
    fightersChanged: () => refreshCustomFighters(true),
    arenasChanged: async () => { app.arenas = await allArenas(); renderArenaPick(); },
    previewArena: (cfg) => setArena(cfg || app.arenaCfg),
    offline: () => app.offline,
  });
  renderArenaPick();
  renderLevel();
  renderHelpKeys();
  enterTitle();
  $('#loading').remove();
  requestAnimationFrame(frame);
  buildPortraits();
  const acc = currentAccount();
  setAccount(acc);
  initOnline();
  app.offline = !(await serverUp());
  document.body.classList.toggle('offline', app.offline);
  if (app.offline) { if (!acc) setAccount(guestLogin()); return; } // (no server here, e.g. the preview: play on this device)
  if (!acc) openAccount('title');
  // confirm the saved login with the server and pick up friends added on other devices
  startSettingsSync(); // settings changed here are saved to the account
  refreshAccount().then((fresh) => {
    if (!fresh && acc && !acc.guest) { setAccount(null); openAccount('title'); return; }
    // the account's settings were changed on another device: reload to use them (not mid-fight)
    if (takeSettingsReload() && !['fight', 'pause', 'vs', 'result'].includes(app.screen) && !app.match) { location.reload(); return; }
    if (fresh && !fresh.guest && app.account?.name === fresh.name) applyAccount(fresh);
  });
}
boot();

// handy for testing from the console
window.__fk = { app, setArena, startMatch, enterSelect, enterTitle, ROSTER, AI, net, hub, tourney, renderer, scene, updateFx: (dt) => { updateExplosions(dt); updateShards(dt * 60); particles.update(dt * 60); rings.update(dt * 60); } };
