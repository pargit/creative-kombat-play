// Player-made specials, put together from parts in the special builder. A special is a chain of
// up to 4 steps that play one after another, e.g. "summon a beast, then stomp them, then a blast":
//   steps: how each part reaches them — a thrown shot, a beam, a dash through them, a teleport behind
//     them, a strike from the sky, a blast all round, a summoned beast, a giant stomp, a cage, shadow
//     clones, an earthquake crack. A shot, a beast or a stomp can be the player's own 3D model.
//   onHit: what the last hit does — knock down, launch, push, pull, daze, freeze, slow, poison, blind
//   the look and sound: colour, flash, shake, sound
// A special is plain settings (JSON), never code: safe to share, the same on both phones online.
// normalizeSpecial keeps every value in range (damage at most 25 in all, fair against the built-in
// moves), testSpecial plays it out in a quick invisible test, describeSpecial turns words into parts.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Effect, strike, registerEffect, tigerMesh } from './effects.js';
import { DOT } from './fx.js';
import { loadProp } from './rig.js';
import { libraryFx, findThing } from './library.js';

export const STEPS = {
  shot: { label: 'Throw a shot', anim: 'throw', model: true, help: 'Something flies at them: a fireball, a shuriken, a rock... (or your own model)' },
  beam: { label: 'Beam', anim: 'throw', body: true, help: 'A beam from your hands, straight across to them' },
  dash: { label: 'Dash through', anim: 'dash', body: true, help: 'You rush through them and land on their other side' },
  teleport: { label: 'Teleport behind', anim: 'uppercut', body: true, help: 'You vanish and strike them from behind' },
  sky: { label: 'From the sky', anim: 'taunt', help: 'A target locks on them and it comes down from above: a meteor, lightning...' },
  blast: { label: 'Blast around you', anim: 'gold', body: true, help: 'You charge up and blast everything round you. Short range!' },
  summon: { label: 'Summon a beast', anim: 'throw', model: true, help: 'A beast runs in from behind you and pounces on them (a tiger, or your own model)' },
  stomp: { label: 'Giant stomp', anim: 'taunt', model: true, help: 'Something giant comes down on them from above and crushes them (a boot, or your own model)' },
  cage: { label: 'Cage', anim: 'throw', help: 'Bars slam down round them: stuck, taking damage' },
  clones: { label: 'Shadow clones', anim: 'gold', help: 'Shadow copies of you appear and rush them, one after another' },
  quake: { label: 'Earthquake', anim: 'slam', help: 'You stomp the ground and a crack runs along the floor to them' },
  free: { label: 'Freestyle (made by the AI from your words)', anim: 'throw', body: true, model: true, help: 'Anything you can describe: the AI composes it from glowing shapes that move exactly as you said' },
};
export const ON_HIT = {
  knockdown: 'Knock down', launch: 'Launch into the air', push: 'Push far away', pull: 'Pull to you',
  daze: 'Daze (stars, 1.5 s)', freeze: 'Freeze (2 s)', slow: 'Slow them (4 s)', poison: 'Poison (damage over 3 s)', blind: "Blind (can't see you, 4 s)",
};
export const SHAPES = { orb: 'Glowing orb', star: 'Star', blade: 'Spinning blade', rock: 'Rock', arrow: 'Arrow' };
export const SOUNDS = { zap: 'Zap', whoosh: 'Whoosh', thud: 'Boom', teleport: 'Warp', special: 'Power up', glass: 'Shatter', whip: 'Crack' };
export const MAX_DAMAGE = 25, MAX_STEPS = 4, MAX_HITS = 10;
// Damage is not chosen: every special does the maximum (25 over all its hits), whatever its effects.
export const autoDamage = () => MAX_DAMAGE;
const NO_STACK = { knockdown: ['launch'], launch: ['knockdown'], push: ['pull'], pull: ['push'], daze: ['freeze'], freeze: ['daze'] };

export function blankStep(kind = 'shot') { return { kind, hits: 1, size: 1, speed: 1, shape: 'orb', model: null }; }
export function blankSpecial() {
  return { type: 'custom', name: 'MY SPECIAL', steps: [blankStep('shot')], damage: 20, onHit: ['knockdown'], color: '#ff8a2a', sound: 'zap', flash: false, shake: true };
}

// every value in range; problems explains anything that had to change
export function normalizeSpecial(sp) {
  const s = { ...blankSpecial(), ...sp, type: 'custom' }, problems = [];
  // (older specials: one step, its settings at the top)
  if (!Array.isArray(sp?.steps)) s.steps = [{ kind: { projectile: 'shot' }[sp?.delivery] || sp?.delivery || 'shot', hits: sp?.hits, size: sp?.size, speed: sp?.speed, shape: sp?.shape }];
  s.name = String(s.name || '').toUpperCase().replace(/[^\p{L}\p{N} !'?.-]/gu, '').trim().slice(0, 22);
  if (!s.name) { s.name = 'MY SPECIAL'; problems.push('It needs a name.'); }
  const num = (o, k, lo, hi, def, what = k) => { let v = Number(o[k]); if (!Number.isFinite(v)) v = def; if (v < lo || v > hi) problems.push(`${what} must be ${lo}–${hi}${k === 'damage' ? ' (fair against the built-in moves)' : ''}.`); o[k] = Math.min(hi, Math.max(lo, v)); };
  s.steps = s.steps.slice(0, MAX_STEPS).map((st, i) => {
    const o = { ...blankStep(), ...st };
    if (!STEPS[o.kind]) { problems.push(`Step ${i + 1}: "${o.kind}" isn't a part: a shot was used.`); o.kind = 'shot'; }
    num(o, 'hits', 1, 6, 1, `Step ${i + 1} hits`); o.hits = Math.round(o.hits);
    num(o, 'size', 0.5, 2.5, 1, `Step ${i + 1} size`); num(o, 'speed', 0.5, 2, 1, `Step ${i + 1} speed`);
    if (!SHAPES[o.shape]) o.shape = 'orb';
    if (!STEPS[o.kind].model || typeof o.model !== 'string') o.model = null;
    o.turn = ((Math.round(Number(o.turn)) || 0) % 4 + 4) % 4; // (own model turned in quarter turns: files differ in which way they face)
    if (o.kind === 'free') { o.fx = normalizeFx(o.fx); if (!o.fx) { problems.push(`Step ${i + 1}: the freestyle effect was empty: a shot was used.`); o.kind = 'shot'; delete o.fx; } }
    else delete o.fx;
    return o;
  });
  if (!s.steps.length) { s.steps = [blankStep()]; problems.push('It needs at least one step.'); }
  if ((sp?.steps || []).length > MAX_STEPS) problems.push(`At most ${MAX_STEPS} steps: kept the first ${MAX_STEPS}.`);
  let total = s.steps.reduce((n, st) => n + st.hits, 0);
  while (total > MAX_HITS) { const st = s.steps.find((x) => x.hits > 1); if (!st) break; st.hits--; total--; }
  if (total > MAX_HITS) problems.push(`At most ${MAX_HITS} hits in all.`);
  s.onHit = [...new Set((Array.isArray(s.onHit) ? s.onHit : []).filter((k) => ON_HIT[k]))];
  for (const k of [...s.onHit]) for (const x of NO_STACK[k] || []) if (s.onHit.includes(x) && s.onHit.indexOf(x) > s.onHit.indexOf(k)) { s.onHit.splice(s.onHit.indexOf(x), 1); problems.push(`"${ON_HIT[x]}" doesn't go with "${ON_HIT[k]}": kept the first.`); }
  if (s.onHit.length > 3) { s.onHit = s.onHit.slice(0, 3); problems.push('At most 3 effects: kept the first 3.'); }
  s.damage = autoDamage(s.onHit);
  if (!/^#[0-9a-f]{6}$/i.test(s.color)) s.color = '#ff8a2a';
  if (!SOUNDS[s.sound]) s.sound = 'zap';
  s.flash = !!s.flash; s.shake = s.shake !== false;
  s.mode = s.mode === 'creative' ? 'creative' : 'basic'; s.desc = String(s.desc || '').slice(0, 600);
  delete s.delivery; delete s.hits; delete s.size; delete s.speed; delete s.shape; delete s.plan;
  return { special: s, problems };
}
export const firstAnim = (sp) => STEPS[(sp.steps?.[0]?.kind) || ({ projectile: 'shot' }[sp.delivery] || sp.delivery)]?.anim || 'throw';

// ── free presets: big ideas the free builder knows how to draw from the basic shapes ──
// (like the original tiger, made of simple shapes). Same data as the AI's freestyle effects.
const L = (o) => ({ glow: true, opacity: 0.9, count: 1, spread: 'point', spreadSize: 1, sx: 1, sy: 1, sz: 1, fromA: 'user', fromDx: 0, fromDy: 0, toA: 'opponent', toDx: 0, toDy: 0, path: 'line', pathAmp: 1.5, start: 0, end: 1, stagger: 0, grow0: 1, grow1: 1, spin: 0, fade: 'inout', ...o });
const FREE_PRESETS = [
  // a wave the user rides into them, washing them away
  [/\b(wave|waves|tsunami|surf|surfs|surfing|flood|floods|wash(es)? (them )?away)\b/, () => ({
    frames: 80, carry: true, reach: 12, hitFrom: 0.3, hitTo: 0.8,
    layers: [
      L({ shape: 'sphere', color: '#1f7fe0', glow: false, opacity: 0.85, count: 8, spread: 'column', spreadSize: 2.6, sx: 2.2, sy: 2.2, sz: 2.6, fromDx: 1, toDx: 3, path: 'accel', grow0: 0.5, grow1: 1.3 }),
      L({ shape: 'sphere', color: '#bfe6ff', count: 8, spread: 'cloud', spreadSize: 1.8, sx: 0.8, sy: 0.8, sz: 0.8, fromDx: 1.5, fromDy: 2.6, toDx: 3.5, toDy: 2.6, path: 'wave', pathAmp: 0.6, stagger: 0.4 }),
      L({ shape: 'disc', color: '#2f9fff', glow: false, opacity: 0.6, sx: 8, sy: 1, sz: 3.5, fromA: 'ground_user', toA: 'ground_opponent', toDx: 3, path: 'accel' }),
    ],
  })],
  // a tornado that grabs them
  [/\b(tornado|tornados|twister|whirlwind|cyclone)\b/, () => ({
    frames: 100, carry: false, reach: 12, hitFrom: 0.3, hitTo: 0.85,
    layers: [
      L({ shape: 'torus', color: '#cfd8dc', opacity: 0.75, count: 7, spread: 'column', spreadSize: 4.2, sx: 2.4, sy: 2.4, sz: 2.4, fromA: 'opponent', fromDy: -0.2, toA: 'opponent', toDy: -0.2, spin: 4, grow0: 0.3, grow1: 1.3 }),
      L({ shape: 'sphere', color: '#ffffff', opacity: 0.8, count: 10, spread: 'column', spreadSize: 4, sx: 0.4, sy: 0.4, sz: 0.4, fromA: 'opponent', toA: 'opponent', path: 'orbit', pathAmp: 1.6, stagger: 0.5 }),
    ],
  })],
  // a rain of swords / spears / spikes from above
  [/\b(swords?|spears?|daggers?|knives|spikes?|needles)\b.*\b(rain|fall|falls|down|sky)\b|\b(rain|rains|shower|storm)\b.*\b(swords?|spears?|daggers?|knives|spikes?|needles)\b/, () => ({
    frames: 90, carry: false, reach: 12, hitFrom: 0.4, hitTo: 0.85,
    layers: [L({ shape: 'spike', color: '#dfe6ee', glow: false, opacity: 1, count: 14, spread: 'cloud', spreadSize: 4.5, sx: 0.5, sy: 1.6, sz: 0.5, fromA: 'above_opponent', fromDy: 10, toA: 'ground_opponent', stagger: 0.7, path: 'accel' })],
  })],
  // a whale that swims through them
  [/\b(whale|whales|orca|dolphin|shark)\b/, () => ({
    frames: 90, carry: false, reach: 12, hitFrom: 0.35, hitTo: 0.8,
    layers: [
      L({ shape: 'sphere', color: '#3b6ea8', glow: false, opacity: 0.95, sx: 5, sy: 2.4, sz: 2.2, fromA: 'behind_user', fromDy: 1, toA: 'far_side', toDy: 1.5, path: 'arc', pathAmp: 2.5 }),
      L({ shape: 'cone', color: '#2f5c8f', glow: false, opacity: 0.95, sx: 1.6, sy: 2.4, sz: 0.6, fromA: 'behind_user', fromDx: -2.8, fromDy: 1.4, toA: 'far_side', toDx: -2.8, toDy: 1.9, path: 'arc', pathAmp: 2.5, spin: 1 }),
      L({ shape: 'sphere', color: '#bfe6ff', count: 10, spread: 'cloud', spreadSize: 2.4, sx: 0.5, sy: 0.5, sz: 0.5, fromA: 'behind_user', fromDy: 2, toA: 'far_side', toDy: 2.5, path: 'arc', pathAmp: 2.5, stagger: 0.3 }),
    ],
  })],
  // a pillar of fire / a volcano under them
  [/\b(fire ?pillar|pillar of fire|volcano|eruption|erupts?|geyser)\b/, () => ({
    frames: 80, carry: false, reach: 12, hitFrom: 0.4, hitTo: 0.8,
    layers: [
      L({ shape: 'cylinder', color: '#ff6a1a', opacity: 0.7, sx: 2, sy: 6, sz: 2, fromA: 'ground_opponent', fromDy: 2, toA: 'ground_opponent', toDy: 2, grow0: 0.1, grow1: 1.2 }),
      L({ shape: 'sphere', color: '#ffd23f', count: 12, spread: 'column', spreadSize: 5, sx: 0.6, sy: 0.6, sz: 0.6, fromA: 'ground_opponent', toA: 'ground_opponent', toDy: 6, path: 'accel', stagger: 0.6 }),
    ],
  })],
];
// a single layer that shows the player's own uploaded model flying at them (used when the words are not known)
export const modelFx = () => ({ frames: 70, carry: false, reach: 12, hitFrom: 0.4, hitTo: 0.8,
  layers: [L({ shape: 'model', color: '#ffffff', glow: false, opacity: 1, sx: 3, sy: 3, sz: 3, fromDx: 1, toDx: 1, path: 'accel' })] });

// ── words → parts (understood right here, no AI service) ─────────────────────────
// "summon a tiger that pounces on them, then a giant foot stomps them, then explode"
// → steps: summon, stomp, blast. Each piece (split at "then") becomes a step.
const STEP_KW = [
  [/\b(summon|summons|calls?|tiger|lion|wolf|wolves|dog|bear|dragon|beast|monster|creature|pounce|shark|horse|bull|dinosaur|t-?rex)\b/, 'summon'],
  [/\b(stomp|stomps|foot|boot|giant|crush|crushes|squash|anvil|step on|smash(es)? (them )?from above)\b/, 'stomp'],
  [/\b(cage|caged|trap|traps|prison|jail|bars|locks? (them )?up)\b/, 'cage'],
  [/\b(clone|clones|copies|copy|shadows|army)\b/, 'clones'],
  [/\b(earthquake|quake|crack|ground splits|ground shakes|fissure)\b/, 'quake'],
  [/\b(laser|beam|ray|kamehameha|hadouken)\b/, 'beam'],
  [/\b(dash|dashes|charge|charges|rush|rushes|tackle|run through|ram|rams|ride|rides|riding|surf|surfs|surfing|wave|waves|tsunami|flood|floods|sweep|sweeps|sweeping|slide|slides|roll|rolls|rolling|tornado|whirlwind|stampede|avalanche|plow|plows)\b/, 'dash'],
  [/\b(teleport|teleports|blink|vanish|vanishes|behind them|shadow step)\b/, 'teleport'],
  [/\b(meteor|comet|from the sky|from above|rain down|airstrike|orbital|satellite|lightning|thunder)\b/, 'sky'],
  [/\b(explosion|explode|explodes|blast|shockwave|bomb|nova|nuke)\b/, 'blast'],
  [/\b(fireball|fire ?ball|shuriken|throw|throws|shoot|shoots|shot|arrow|spear|rock|boulder|blade|bullet|shards?|orb|ball|projectile)\b/, 'shot'],
];
const LOOK_KW = [
  [/\b(fire|flame|flaming|burn(ing|s)?|inferno|lava)\b/, { color: '#ff6a1a', sound: 'whoosh' }],
  [/\b(ice|frost|freez(e|ing)|frozen|snow)\b/, { color: '#8fd8ff' }],
  [/\b(lightning|thunder|electric|shock)\b/, { color: '#9fd2ff', sound: 'zap', flash: true }],
  [/\b(water|wave|waves|tsunami|flood|wash|washes|washing|ocean|sea|surf|rain)\b/, { color: '#2f9fff', sound: 'whoosh' }],
  [/\b(poison|toxic|venom|acid|slime)\b/, { color: '#7dff6a' }],
  [/\b(shadow|dark|darkness|void)\b/, { color: '#7a3cc8' }],
  [/\b(holy|light|gold|golden)\b/, { color: '#ffd23f' }],
  [/\b(explosion|explode|blast|bomb|stomp|crush|quake|earthquake)\b/, { sound: 'thud', shake: true }],
];
const SHAPE_KW = [[/\b(shuriken|ninja star|star)\b/, 'star'], [/\b(blade|saw|disc|frisbee|boomerang)\b/, 'blade'], [/\b(rock|boulder|stone|meteor)\b/, 'rock'], [/\b(arrow|spear|javelin|dart|bullet)\b/, 'arrow']];
const FX_KW = [
  [/\b(ice|frost|freez(e|es|ing)|frozen)\b/, 'freeze'], [/\b(poison|toxic|venom|acid|sick|burn(s|ing)?)\b/, 'poison'], [/\b(slow|slows|sticky|mud|glue|web)\b/, 'slow'],
  [/\b(blind|blinds|smoke|ink)\b/, 'blind'], [/\b(stun|stuns|daze|dazes|dizzy|stars)\b/, 'daze'], [/\b(knock(s|ed)? (them )?down|knockdown|floor)\b/, 'knockdown'],
  [/\b(launch|launches|uppercut|into the air|sky high|flying)\b/, 'launch'], [/\b(push|pushes|wash|washes|washing|sweep|sweeps|sweeping|sweep away|knockback|blow(s)? (them )?away|send(s)? (them )?flying)\b/, 'push'], [/\b(pull|pulls|grab|grabs|hook|drag|drags|magnet)\b/, 'pull'],
];
const SP_COLORS = { red: '#ff3b3b', blue: '#2f7fff', green: '#22c55e', yellow: '#ffd23f', orange: '#ff8a2a', purple: '#9b4dff', pink: '#ff4fa8', cyan: '#2fe0ff', white: '#ffffff', black: '#222222', gold: '#f4c542' };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twice: 2 };
// does any part of the words match something the free builder knows? (if not, FILL IN would only give the default shot)
export function understands(text) {
  const t = String(text || '').toLowerCase();
  return STEP_KW.some(([re]) => re.test(t)) || FREE_PRESETS.some(([re]) => re.test(t)) || !!findThing(t);
}
export function describeSpecial(text) {
  const t = String(text || '').toLowerCase(), s = blankSpecial();
  s.onHit = []; s.steps = [];
  for (const piece of t.split(/\b(?:and then|then|after that|afterwards|followed by|finally)\b|[;.]/).map((p) => p.trim()).filter(Boolean)) {
    const lib = libraryFx(piece); // (a thing from the game's own library: a horse, a dragon, a sword...)
    if (lib) { const fs = blankStep('free'); fs.hits = lib.hits || 1; fs.fx = normalizeFx(lib.fx); fs.size = Math.min(2.5, Math.max(0.5, lib.size)); s.steps.push(fs); continue; }
    const preset = FREE_PRESETS.find(([re]) => re.test(piece));
    if (preset) { const fs = blankStep('free'); fs.hits = 3; fs.fx = normalizeFx(preset[1]()); if (/\b(huge|giant|massive|big|enormous)\b/.test(piece)) fs.size = 1.7; s.steps.push(fs); continue; }
    const hit = STEP_KW.map(([re, kind]) => [piece.search(re), kind]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0])[0];
    if (!hit) continue;
    const st = blankStep(hit[1]);
    const n = piece.match(/\b([1-6]|one|two|three|four|five|six)\b(?:\s+[a-z]+){0,3}?\s+[a-z]+s\b/) || piece.match(/\b(twice)\b/) || piece.match(/\b([1-6]|two|three|four|five|six) times\b/);
    if (n) st.hits = NUM[n[1]] ?? Number(n[1]);
    if (st.kind === 'clones' && !n) st.hits = 3;
    for (const [re, sh] of SHAPE_KW) if (re.test(piece)) { st.shape = sh; break; }
    if (/\b(huge|giant|massive|big|enormous)\b/.test(piece)) st.size = 1.7;
    if (/\b(tiny|small|little|mini)\b/.test(piece)) st.size = 0.7;
    if (/\b(fast|quick|rapid|lightning fast)\b/.test(piece)) st.speed = 1.6;
    if (/\b(slow(ly)? (moving|flying))\b/.test(piece)) st.speed = 0.7;
    s.steps.push(st);
  }
  if (!s.steps.length) s.steps.push(blankStep('shot'));
  for (const [re, look] of LOOK_KW) if (re.test(t)) Object.assign(s, look);
  for (const [re, fx] of FX_KW) if (re.test(t) && !s.onHit.includes(fx)) s.onHit.push(fx);
  const col = Object.keys(SP_COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (col) s.color = SP_COLORS[col];
  if (!s.onHit.length) s.onHit = ['knockdown'];
  // a name: the main words (what it is), e.g. "ICE SHARDS", "TIGER STOMP"
  const skip = /^(player|rides?|riding|towards?|toward|opponent|enemy|everything|way|washing|washes|a|an|the|that|which|and|with|them|they|it|its|to|of|on|in|at|from|my|your|me|him|her|three|two|four|five|six|one|\d|fast|quick|huge|big|giant|tiny|small|little|very|really|summons?|calls?|freezes?|burns?|knocks?|slows?|stuns?|blinds?|poisons?|launch(es)?|pushes|pulls|hits?|down|times|twice|sky|behind|then|who|runs?|pounces?|comes?|out|up|is|are|throws?|shoots?)$/;
  const words = t.split(/[,.!;]|\bthen\b/)[0].split(/\s+/).filter((w) => w && !skip.test(w) && !SP_COLORS[w]);
  let name = '';
  for (const w of words) { if ((name + ' ' + w).trim().length > 22) break; name = (name + ' ' + w).trim(); if (name.split(' ').length >= 3) break; }
  s.name = name ? name.toUpperCase() : 'MY SPECIAL';
  return normalizeSpecial(s).special;
}

// ── "not quite right": change it with words (free, understood right here) ────────
// "the tiger is too slow, make it bigger and hit 3 times, freeze instead of knock down, add a cage"
// → changes only what's asked. Returns { special, said: [what changed, in words] }.
const NEG = /\b(no|not|don'?t|without|remove|stop|instead of|less|never)\s+(\w+\s+){0,2}$/;
const ORDINAL = { first: 0, second: 1, third: 2, fourth: 3, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3 };
export function tweakSpecial(sp, text) {
  const s = JSON.parse(JSON.stringify(normalizeSpecial(sp).special)), said = [];
  let t = ` ${String(text || '').toLowerCase()} `;
  const kindName = (k) => STEPS[k].label.toLowerCase();
  // a new name ("call it Ice Tiger"): taken out first, so its words don't count as changes
  const nm = t.match(/\b(?:call it|name it|named|rename it(?: to)?)\s+["']?([^"',.!]{2,22})/);
  if (nm) { t = t.replace(nm[0], ' '); s.name = nm[1].trim().toUpperCase(); }
  // add / remove whole steps
  for (const m of [...t.matchAll(/\b(add|plus|and then|then|at the end)\s+(a |an |some )?([a-z -]{2,30}?)(?=[,.;!]| and | then |$)/g)]) {
    const hit = STEP_KW.find(([re]) => re.test(m[3]));
    if (!hit || s.steps.length >= MAX_STEPS) continue;
    s.steps.push(blankStep(hit[1])); said.push(`Added a step: ${kindName(hit[1])}`);
    t = t.replace(m[0], ' ');
  }
  for (const m of [...t.matchAll(/\b(remove|delete|get rid of|without|no more|no)\s+(the )?([a-z -]{2,20}?)( step)?(?=[,.;!]| and | then |$)/g)]) {
    const hit = STEP_KW.find(([re]) => re.test(m[3]));
    if (!hit || !s.steps.some((x) => x.kind === hit[1]) || s.steps.length < 2) continue;
    s.steps = s.steps.filter((x) => x.kind !== hit[1]); if (!s.steps.length) s.steps = [blankStep()];
    said.push(`Removed the ${kindName(hit[1])} step`); t = t.replace(m[0], ' ');
  }
  // which steps the rest is about: "the tiger", "the second step", "the last one"... or all of them
  let targets = [];
  const ord = t.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th|last)\b(?: step| one| part| hit)?/) || t.match(/\bstep (\d)\b/);
  if (ord) targets = [ord[1] === 'last' ? s.steps.length - 1 : ORDINAL[ord[1]] ?? Number(ord[1]) - 1].filter((i) => s.steps[i]);
  if (!targets.length) for (const [re, kind] of STEP_KW) if (re.test(t)) s.steps.forEach((x, i) => { if (x.kind === kind && !targets.includes(i)) targets.push(i); });
  if (!targets.length) targets = s.steps.map((_, i) => i);
  const which = targets.length === s.steps.length ? '' : ` (${targets.map((i) => kindName(s.steps[i].kind)).join(', ')})`;
  const each = (f) => targets.forEach((i) => f(s.steps[i]));
  if (/\b(bigger|larger|huge|giant|massive|too small)\b/.test(t)) { each((x) => { x.size = Math.min(2.5, +(x.size * 1.35).toFixed(1)); }); said.push(`Bigger${which}`); }
  else if (/\b(smaller|too big|too large|tiny|little)\b/.test(t)) { each((x) => { x.size = Math.max(0.5, +(x.size / 1.35).toFixed(1)); }); said.push(`Smaller${which}`); }
  if (/\b(faster|quicker|too slow|speed (it )?up)\b/.test(t)) { each((x) => { x.speed = Math.min(2, +(x.speed * 1.35).toFixed(1)); }); said.push(`Faster${which}`); }
  else if (/\b(slower|too fast|slow (it )?down)\b/.test(t)) { each((x) => { x.speed = Math.max(0.5, +(x.speed / 1.35).toFixed(1)); }); said.push(`Slower${which}`); }
  const nh = t.match(/\b([1-6]|one|two|three|four|five|six)\s+(hits|times|shots|bites|clones|copies)\b/) || t.match(/\bhits?\s+([1-6]|one|two|three|four|five|six)\s+times\b/);
  if (nh) { const n = NUM[nh[1]] ?? Number(nh[1]); each((x) => { x.hits = n; }); said.push(`${n} hit${n > 1 ? 's' : ''}${which}`); }
  else if (/\b(more hits|hit more|more times|more shots)\b/.test(t)) { each((x) => { x.hits = Math.min(6, x.hits + 1); }); said.push(`One more hit${which}`); }
  else if (/\b(fewer hits|less hits|hit less|fewer shots|less times)\b/.test(t)) { each((x) => { x.hits = Math.max(1, x.hits - 1); }); said.push(`One hit fewer${which}`); }
  for (const [re, sh] of SHAPE_KW) { const m = t.match(re); if (m && !NEG.test(t.slice(0, m.index))) { targets.forEach((i) => { s.steps[i].shape = sh; }); said.push(`Shape: ${SHAPES[sh].toLowerCase()}`); break; } }
  // what it does: "freeze instead of knock down", "no poison", "make it daze them"
  for (const [re, fx] of FX_KW) {
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      if (fx === 'slow' && /\btoo\s+$/.test(t.slice(0, m.index))) continue; // ("too slow" is about speed)
      const off = NEG.test(t.slice(0, m.index));
      if (off && s.onHit.includes(fx)) { s.onHit = s.onHit.filter((k) => k !== fx); said.push(`No more "${ON_HIT[fx]}"`); }
      if (!off && !s.onHit.includes(fx)) { s.onHit.push(fx); said.push(`Now: ${ON_HIT[fx]}`); }
    }
  }
  const col = Object.keys(SP_COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (col) { s.color = SP_COLORS[col]; said.push(`Colour: ${col}`); }
  if (/\bno (screen )?shake|don'?t shake|without (the )?shake\b/.test(t)) { s.shake = false; said.push('No screen shake'); }
  else if (/\b(shake|shakes|rumble)\b/.test(t)) { s.shake = true; said.push('Screen shake'); }
  if (/\bno (white )?flash|without (the )?flash\b/.test(t)) { s.flash = false; said.push('No flash'); }
  else if (/\bflash\b/.test(t)) { s.flash = true; said.push('White flash'); }
  if (nm) said.push(`Named ${s.name}`);
  const out = normalizeSpecial(s);
  return { special: out.special, said, problems: out.problems };
}

// ── the look of things ───────────────────────────────────────────────────────────
const sign = (v) => (v < 0 ? -1 : 1);
const ease = (k) => k * k * (3 - 2 * k);
function glowMat(color, opacity = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); }
function shotMesh(shape, color, size) {
  const g = new THREE.Group(), c = color, s = 0.3 * size;
  if (shape === 'star') { for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.09 * size, s * 1.4, 4), new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.8, roughness: 0.3 })); b.rotation.z = i * Math.PI / 2; b.position.set(Math.sin(i * Math.PI / 2) * s * 0.5, Math.cos(i * Math.PI / 2) * s * 0.5, 0); g.add(b); } }
  else if (shape === 'blade') g.add(new THREE.Mesh(new THREE.TorusGeometry(s * 0.8, s * 0.12, 6, 20), new THREE.MeshStandardMaterial({ color: '#d8dde4', metalness: 0.9, roughness: 0.25, emissive: c, emissiveIntensity: 0.3 })));
  else if (shape === 'rock') g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })));
  else if (shape === 'arrow') { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, s * 3, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2e' })); a.rotation.z = Math.PI / 2; g.add(a); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06 * size, 0.2 * size, 8), new THREE.MeshStandardMaterial({ color: c, metalness: 0.6 })); tip.rotation.z = -Math.PI / 2; tip.position.x = s * 1.5; g.add(tip); }
  else { g.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.6, 16, 12), glowMat('#ffffff'))); g.add(new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), glowMat(c, 0.7))); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(s * 4); g.add(halo);
  return g;
}
function bootMesh(color) { // the built-in giant: a huge boot, sole down
  const g = new THREE.Group(), leather = new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.7 }), sole = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.9 });
  const foot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.3), leather); foot.position.set(0.3, 0.6, 0); g.add(foot);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), leather); toe.scale.set(1, 0.7, 0.9); toe.position.set(1.4, 0.55, 0); g.add(toe);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 4, 20), leather); shaft.position.set(-0.4, 3, 0); g.add(shaft);
  const s = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 1.4), sole); s.position.set(0.5, 0.1, 0); g.add(s);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.25, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 })); band.position.set(-0.4, 4.6, 0); g.add(band);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// the run / attack clips of a rigged model, found by name (a tiger: Run, Attack; others: Walk, Gallop, Bite...)
function summonClips({ mixer, clips }) {
  const names = Object.keys(clips), find = (...res) => { for (const re of res) { const n = names.find((x) => re.test(x)); if (n) return n; } return null; };
  const run = find(/^run/i, /gallop|sprint|trot/i, /run/i, /walk fast|fast walk/i, /walk/i, /move/i) ?? names[0];
  const attack = find(/attack|bite|pounce|strike/i, /jump|leap/i);
  const act = (n) => (n ? mixer.clipAction(clips[n]) : null);
  return { mixer, run: act(run), attack: act(attack), cur: null };
}

// one model per (url, height) on screen: the player's own (from their fighter's files), loaded once
function ownModel(ctx, owner, id, height, onReady) {
  const p = owner.def.props?.[id];
  if (!p?.url) return;
  loadProp(p.url, height, p.type).then(onReady).catch(() => {});
}


// ── freestyle: any effect, composed from simple moving shapes ─────────────────────
// A freestyle step is a few "layers" (a shape, a colour, how many, where it starts and ends, how it
// moves, grows and fades) that the AI writes from the player's words. It is only data, played
// by the frame count like every other step (same on both phones online), and the hits are
// still the special's own (damage, on-hit effects), so it can look like anything and stay fair.
export const FX_SHAPES = ['sphere', 'box', 'cone', 'cylinder', 'torus', 'disc', 'flat', 'crystal', 'spike', 'ring', 'model']; // (disc: faces the camera like a wheel or a shield; flat: lies on the ground) // (model: the player's own uploaded 3D model)
export const FX_ANCHORS = ['user', 'opponent', 'above_opponent', 'above_user', 'ground_opponent', 'ground_user', 'behind_user', 'far_side'];
export const FX_PATHS = ['line', 'accel', 'arc', 'wave', 'spiral', 'orbit', 'bounce'];
export const FX_SPREADS = ['point', 'line', 'column', 'ring', 'cloud'];
export const FX_FADES = ['none', 'in', 'out', 'inout'];
const MAX_LAYERS = 120, MAX_ITEMS = 480;
const normKeys = (a, lo, hi) => (Array.isArray(a) ? a.slice(0, 12).map((k) => [fnum(k?.[0], 0, 1, 0), fnum(k?.[1], lo, hi, 0)]).sort((x, y) => x[0] - y[0]) : null);
const fnum = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const fpick = (v, list, def) => (list.includes(v) ? v : def);
export function normalizeFx(fx) {
  if (!fx || typeof fx !== 'object' || !Array.isArray(fx.layers) || !fx.layers.length) return null;
  const out = { frames: Math.round(fnum(fx.frames, 30, 150, 70)), gait: fnum(fx.gait, 0.05, 1.5, 0.5), stopU: fnum(fx.stopU, 0.05, 1, 1), lift: normKeys(fx.lift, -6, 6), lunge: normKeys(fx.lunge, -8, 8), carryTo: fnum(fx.carryTo, -12, 12, 1.2), passU: fx.passU == null ? null : fnum(fx.passU, 0.15, 0.9, 0.45), carryAfter: fx.carryAfter == null ? null : fnum(fx.carryAfter, -12, 12, 0), rideRamp: fnum(fx.rideRamp, 0.02, 0.5, 0.06), carry: !!fx.carry, rideY: fnum(fx.rideY, 0, 6, 0), reach: fnum(fx.reach, 3, 16, 9), hitFrom: fnum(fx.hitFrom, 0.05, 0.95, 0.4), hitTo: 0, layers: [] };
  out.hitTo = fnum(fx.hitTo, out.hitFrom, 0.98, Math.min(0.98, out.hitFrom + 0.2));
  let items = 0;
  for (const l of fx.layers.slice(0, MAX_LAYERS)) {
    if (!l || typeof l !== 'object') continue;
    const count = Math.round(fnum(l.count, 1, 24, 1));
    if (items + count > MAX_ITEMS) break;
    items += count;
    const start = fnum(l.start, 0, 0.95, 0), end = fnum(l.end, start + 0.05, 1, 1);
    out.layers.push({
      shape: fpick(l.shape, FX_SHAPES, 'sphere'), color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#ffffff', glow: l.glow !== false, opacity: fnum(l.opacity, 0.1, 1, 0.9),
      count, spread: fpick(l.spread, FX_SPREADS, 'point'), spreadSize: fnum(l.spreadSize, 0, 8, 1),
      sx: fnum(l.sx, 0.05, 10, 1), sy: fnum(l.sy, 0.05, 10, 1), sz: fnum(l.sz, 0.05, 10, 1),
      fromA: fpick(l.fromA, FX_ANCHORS, 'user'), fromDx: fnum(l.fromDx, -20, 20, 0), fromDy: fnum(l.fromDy, -3, 14, 0),
      toA: fpick(l.toA, FX_ANCHORS, 'opponent'), toDx: fnum(l.toDx, -20, 20, 0), toDy: fnum(l.toDy, -3, 14, 0),
      path: fpick(l.path, FX_PATHS, 'line'), pathAmp: fnum(l.pathAmp, 0, 8, 1.5),
      start, end, stagger: fnum(l.stagger, 0, 0.9, 0), grow0: fnum(l.grow0, 0, 6, 1), grow1: fnum(l.grow1, 0, 6, 1), spin: fnum(l.spin, -5, 5, 0),
      fade: fpick(l.fade, FX_FADES, 'inout'), trail: !!l.trail && count <= 4, offX: fnum(l.offX, -8, 8, 0), offY: fnum(l.offY, -3, 8, 0), offZ: fnum(l.offZ, -2, 2, 0), rotZ: fnum(l.rotZ, -360, 360, 0),
      // joints: a part turns about its pivot (swing: degrees each way, swingPhase: where in the stride, swingBias: its resting turn, swingMode: sin or flex (a knee bends one way only)); par: the layer it is attached to (turns with it)
      swing: fnum(l.swing, -90, 90, 0), swingPhase: fnum(l.swingPhase, 0, 7, 0), swingBias: fnum(l.swingBias, -180, 180, 0), swingMode: l.swingMode === 'flex' ? 'flex' : 'sin',
      // run: its swinging stops when the thing stops running (fx.stopU); mv: the part of its time spent travelling (it then stands still); act: key poses [[fraction of the special, degrees]...] added to the joint; slide: it drifts this far over its time
      roll: fnum(l.roll, -30, 30, 0), yaw: fnum(l.yaw, -40, 40, 0), under: !!l.under, run: !!l.run, mv: fnum(l.mv, 0.05, 1, 1), act: normKeys(l.act, -360, 360), chr: !!l.chr, slideX: fnum(l.slideX, -14, 14, 0), slideY: fnum(l.slideY, -6, 10, 0),
      pv: l.pv == null ? null : fnum(l.pv, -8, 8, 0), bob: fnum(l.bob, 0, 0.5, 0), par: Number.isInteger(l.par) && l.par >= 0 && l.par < out.layers.length ? l.par : -1,
    });
  }
  return out.layers.length ? out : null;
}
function fxGeometry(shape) {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 14);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    case 'torus': return new THREE.TorusGeometry(0.45, 0.12, 8, 24);
    case 'ring': return new THREE.TorusGeometry(0.5, 0.04, 6, 32);
    case 'disc': case 'flat': return new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24);
    case 'crystal': return new THREE.OctahedronGeometry(0.5, 0);
    case 'spike': return new THREE.ConeGeometry(0.25, 1.4, 8);
    default: return new THREE.SphereGeometry(0.5, 16, 12);
  }
}
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ── the steps ────────────────────────────────────────────────────────────────────
// Each: start(), tick(t) → true when done (t: frames since it started), render(time).
// All the game logic runs off the frame count (no randomness): the same on both phones online.
class Step {
  constructor(fx, st) { this.fx = fx; this.st = st; this.g = new THREE.Group(); fx.group.add(this.g); this.hits = 0; }
  get o() { return this.fx.owner; } get opp() { return this.fx.opp; } get d() { return this.fx.dir; } get color() { return this.fx.sp.color; }
  hit(fromX) { this.hits++; return this.fx.hit(fromX); }
  miss(x) { this.hits++; this.fx.miss(x); }
  start() {} render() {} end() { this.g.visible = false; }
}
class Shot extends Step {
  start() { this.shots = []; this.custom = null; if (this.st.model) ownModel(this.fx.ctx, this.o, this.st.model, 0.7 * this.st.size, (m) => { this.custom = m; }); }
  tick(t) {
    const st = this.st, o = this.o, opp = this.opp, d = this.d;
    if (this.shots.length < st.hits && (t - 1) % 8 === 0) { this.shots.push({ x: o.pos.x + d * 0.6, y: o.pos.y + 1.3, live: true }); this.fx.ctx.sfx.whoosh?.(); }
    const v = 0.2 * st.speed;
    for (const s of this.shots) {
      if (!s.live) continue;
      s.x += d * v; s.y += Math.max(-v, Math.min(v, opp.pos.y + 1.2 - s.y));
      if (Math.abs(s.x - opp.pos.x) < 0.45 + 0.1 * st.size) { s.live = false; this.hit(s.x); }
      else if (Math.abs(s.x) > 13) { s.live = false; this.miss(s.x); }
    }
    return this.shots.length >= st.hits && this.shots.every((s) => !s.live);
  }
  render(time) {
    const st = this.st, d = this.d;
    while (this.g.children.length < this.shots.length) this.g.add(this.custom ? SkeletonUtils.clone(this.custom) : shotMesh(st.shape, this.color, st.size));
    this.shots.forEach((s, i) => {
      const m = this.g.children[i];
      m.visible = s.live; m.position.set(s.x, s.y, 0.2);
      if (this.custom) m.rotation.set(0, (d > 0 ? Math.PI / 2 : -Math.PI / 2) + (st.turn || 0) * Math.PI / 2, 0);
      else if (st.shape === 'blade' || st.shape === 'star') m.rotation.z = time * 20 * d;
      else if (st.shape === 'rock') m.rotation.set(time * 5, time * 4, 0);
      else if (st.shape === 'arrow') m.rotation.y = d > 0 ? 0 : Math.PI;
      if (s.live && st.shape === 'orb' && !this.custom) this.fx.ctx.particles.burst(s.x - d * 0.2, s.y, 0.2, { count: 1, color: this.color, speed: 0.02, gravity: 0, life: 12 });
    });
  }
}
class Beam extends Step {
  start() { this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), glowMat(this.color, 0.8)); this.core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), glowMat('#ffffff', 0.9)); this.g.add(this.beam, this.core); this.fx.ctx.sfx.zap?.(); }
  tick(t) {
    const on = t - 14, reach = 6, hold = 26, every = Math.max(1, Math.floor(hold / this.st.hits));
    this.o.vel.x = 0; this.t = t;
    if (on > reach && on <= reach + hold && (on - reach - 1) % every === 0 && this.hits < this.st.hits) this.hit();
    if (on === reach + hold + 1) while (this.hits < this.st.hits) this.hit();
    return on > reach + hold + 4;
  }
  render(time) {
    const o = this.o, opp = this.opp, d = this.d, on = (this.t || 0) - 14;
    const a = new THREE.Vector3(o.pos.x + d * 0.5, o.pos.y + 1.3, 0.2), reach = Math.min(1, Math.max(0, on / 6)), fade = on > 32 ? Math.max(0, 1 - (on - 32) / 4) : 1;
    const len = Math.abs(opp.pos.x - a.x) * reach + 0.01, b = a.clone(); b.x += d * len;
    this.beam.visible = this.core.visible = on > 0 && fade > 0;
    const w = 0.22 * this.st.size * fade * (1 + Math.sin(time * 40) * 0.1);
    for (const [m, k] of [[this.beam, 1], [this.core, 0.4]]) { m.position.set((a.x + b.x) / 2, a.y, a.z); m.rotation.z = Math.PI / 2; m.scale.set(w * k, len, w * k); }
    if (on <= 0) this.fx.ctx.particles.burst(a.x, a.y, a.z, { count: 2, color: this.color, speed: 0.03, gravity: 0, life: 10 });
  }
}
class Dash extends Step {
  start() { this.from = this.o.pos.x; this.to = Math.max(-8.2, Math.min(8.2, this.opp.pos.x + this.d * 1.2)); this.fx.ctx.sfx.whoosh?.(); }
  tick(t) {
    const o = this.o, d = this.d, len = Math.round(14 / this.st.speed);
    o.invuln = 2;
    if (t >= 4 && t <= 4 + len) {
      const x = this.from + (this.to - this.from) * ((t - 4) / len);
      o.pos.x = x; o.vel.x = 0;
      const past = (x - this.opp.pos.x) * d;
      while (this.hits < this.st.hits && past > -0.4 + (this.hits / this.st.hits) * 0.6) this.hit(x - d);
      this.fx.ctx.particles.burst(x, o.pos.y + 1, 0.2, { count: 3, color: this.color, speed: 0.04, gravity: 0, life: 14 });
    }
    if (t === 5 + len) { while (this.hits < this.st.hits) this.hit(); o.facing = -d; this.fx.dir = -d; }
    return t > 10 + len;
  }
}
class Teleport extends Step {
  tick(t) {
    const o = this.o, opp = this.opp, d = this.d;
    o.invuln = 2; o.vel.x = 0;
    o.opacity = t < 10 ? 1 - t / 10 : t < 16 ? 0 : Math.min(1, (t - 16) / 4);
    if (t === 10) { this.fx.ctx.sfx.teleport?.(); this.fx.ctx.particles.burst(o.pos.x, o.pos.y + 1, 0.2, { count: 26, color: this.color, speed: 0.1, gravity: 0 }); }
    if (t === 16) { o.pos.x = Math.max(-8.2, Math.min(8.2, opp.pos.x + d * 0.9)); o.facing = -d; this.fx.dir = -d; this.fx.ctx.particles.burst(o.pos.x, o.pos.y + 1, 0.2, { count: 26, color: this.color, speed: 0.1, gravity: 0 }); }
    if (t >= 20 && this.hits < this.st.hits && (t - 20) % 4 === 0) { this.fx.pose('uppercut', 1); this.hit(o.pos.x); }
    if (t >= 34) o.opacity = 1;
    return t >= 34;
  }
}
class Sky extends Step {
  start() { this.tx = this.opp.pos.x; this.marker = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 32), glowMat(this.color, 0.9)); this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.03; this.g.add(this.marker); this.falls = []; }
  tick(t) {
    if (t <= 34) this.tx += (this.opp.pos.x - this.tx) * 0.12;
    for (let i = 0; i < this.st.hits; i++) if (t === 46 + i * 6) {
      if (Math.abs(this.opp.pos.x - this.tx) < 1.3 + 0.2 * this.st.size) this.hit(this.tx - this.d * 0.3); else this.miss(this.tx);
      if (this.fx.sp.shake) this.fx.ctx.shake(0.3);
    }
    this.t = t;
    return t > 46 + this.st.hits * 6 + 8;
  }
  render(time) {
    const t = this.t || 0;
    this.marker.visible = t < 46 + this.st.hits * 6;
    this.marker.position.x = this.tx; this.marker.scale.setScalar(this.st.size * (1 + Math.sin(time * 12) * 0.08));
    while (this.falls.length < this.st.hits) { const m = shotMesh(this.st.shape === 'arrow' ? 'orb' : this.st.shape, this.color, this.st.size * 1.4); this.g.add(m); this.falls.push(m); }
    this.falls.forEach((m, i) => { const k = (t - 34 - i * 6) / 12; m.visible = k >= 0 && k < 1; m.position.set(this.tx + (1 - k) * 2 * this.d, 12 * (1 - k) + 0.6, 0.2); });
  }
}
class Blast extends Step {
  // first in a special it blasts round you; later in a chain (they're held by then) it goes off on them
  start() { this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glowMat(this.color, 0.6)); this.g.add(this.ball); this.range = 2.5 + 1.5 * this.st.size; this.onThem = this.fx.i > 0 && this.fx.landed > 0; if (this.onThem) this.range = 1.2 + 0.8 * this.st.size; }
  get at() { return this.onThem ? this.opp.pos : this.o.pos; }
  tick(t) {
    const o = this.at, k = (t - 22) / 16;
    this.o.vel.x = 0; this.t = t;
    if (t === 22) { this.fx.ctx.sfx.thud?.(); if (this.fx.sp.shake) this.fx.ctx.shake(0.5); }
    if (k >= 0 && k <= 1 && this.hits === 0 && Math.abs(this.opp.pos.x - o.x) <= this.range * k + 0.3) for (let i = 0; i < this.st.hits; i++) this.hit(o.x);
    if (t === 38 && this.hits === 0) for (let i = 0; i < this.st.hits; i++) this.miss(o.x);
    return t > 44;
  }
  render(time) {
    const t = this.t || 0, k = (t - 22) / 16, o = this.at;
    this.ball.visible = t < 38; this.ball.position.set(o.x, o.y + 1, 0.2);
    this.ball.scale.setScalar(k < 0 ? 0.3 + 0.5 * (t / 22) : 0.8 + this.range * Math.min(1, k));
    this.ball.material.opacity = k < 0 ? 0.5 + 0.3 * Math.sin(time * 30) : 0.6 * (1 - Math.min(1, k));
  }
}
class Summon extends Step {
  // a beast runs in from behind you, pounces on them, bites (the hits) and runs off
  start() {
    this.x = this.o.pos.x - this.d * 1.4; this.y = 0; this.phase = 'run'; this.pt = 0;
    const h = 1.1 * this.st.size;
    this.beast = tigerMesh(); this.beast.scale.setScalar(1.15 * this.st.size); this.g.add(this.beast);
    if (this.st.model) ownModel(this.fx.ctx, this.o, this.st.model, h * 1.4, (m) => { this.beast.visible = false; this.custom = m; this.g.add(m); this.anim = m.userData.anim && summonClips(m.userData.anim); });
    this.fx.ctx.sfx.whoosh?.();
  }
  tick(t) {
    const opp = this.opp, d = this.d, sp = 0.24 * this.st.speed;
    this.t = t;
    if (this.phase === 'run') { this.x += d * sp; if (Math.abs(opp.pos.x - this.x) < 1.3 || t > 120) { this.phase = 'pounce'; this.pt = 0; this.from = this.x; } }
    else if (this.phase === 'pounce') {
      const k = Math.min(1, ++this.pt / 10);
      this.x = this.from + (opp.pos.x - d * 0.55 - this.from) * k; this.y = Math.sin(Math.PI * k) * 0.7;
      if (this.pt === 10) { this.phase = 'bite'; this.pt = 0; }
    } else if (this.phase === 'bite') {
      if (this.pt++ % 8 === 0 && this.hits < this.st.hits) { if (Math.abs(opp.pos.x - this.x) < 1.6) this.hit(this.x); else this.miss(this.x); }
      if (this.hits >= this.st.hits && this.pt > 8) { this.phase = 'leave'; this.pt = 0; }
    } else { this.pt++; this.x += d * 0.3; }
    return this.phase === 'leave' && this.pt > 24;
  }
  render(time) {
    const T = this.custom || this.beast, u = this.beast.userData, d = this.d, run = this.phase !== 'pounce', t = this.t || 0;
    this.g.position.set(0, 0, 0.3);
    T.position.set(this.x, this.y + (this.custom ? 0.55 * this.st.size + Math.abs(Math.sin(t * 0.55)) * 0.08 : 0), 0);
    if (this.custom) {
      T.rotation.set(0, (d > 0 ? Math.PI / 2 : -Math.PI / 2) + (this.st.turn || 0) * Math.PI / 2, this.anim ? 0 : run ? Math.sin(t * 0.55) * 0.06 : 0);
      if (this.anim) { // the model's own run / attack clips (visual only: the fight logic above never looks at them)
        const A = this.anim, dt = Math.min(0.1, Math.max(0, time - (this.lastTime ?? time))); this.lastTime = time;
        const want = this.phase === 'run' || this.phase === 'leave' ? A.run : (A.attack || A.run);
        if (want && A.cur !== want) { A.cur?.fadeOut(0.1); want.reset().fadeIn(0.1).play(); A.cur = want; }
        A.mixer.update(dt * (this.phase === 'run' ? 1.3 * this.st.speed : 1));
      }
    }
    else {
      T.scale.x = 1.15 * this.st.size * d;
      u.legs.forEach((leg, i) => { leg.rotation.z = run ? Math.sin(t * 0.55 + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.4) * 0.7 : (i < 2 ? 1.0 : -0.9); });
      u.jaw.rotation.z = this.phase === 'bite' ? -0.1 - Math.abs(Math.sin(t * 0.4)) * 0.6 : this.phase === 'pounce' ? -0.7 : -0.05;
      u.tail.forEach((seg, i) => { if (i) seg.rotation.z = -0.25 + Math.sin(time * 6 + i) * 0.25; });
    }
    const fade = this.phase === 'leave' ? Math.max(0, 1 - this.pt / 24) : 1;
    T.visible = fade > 0.05;
  }
}
class Stomp extends Step {
  // something giant comes down on them, grinds, and lifts off
  start() {
    this.x = this.opp.pos.x; this.y = 14;
    this.thing = bootMesh(this.color); this.thing.scale.setScalar(this.st.size); this.g.add(this.thing);
    if (this.st.model) ownModel(this.fx.ctx, this.o, this.st.model, 4.5 * this.st.size, (m) => { this.thing.visible = false; this.custom = m; this.g.add(m); });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.03; this.g.add(this.shadow);
  }
  tick(t) {
    const opp = this.opp, D = 30, F = 10;
    this.t = t;
    if (t < D) this.x += (opp.pos.x - this.x) * 0.15;
    if (t >= D && t < D + F) this.y = 14 * (1 - (t - D) / F);
    if (t === D + F) {
      this.y = 0;
      this.fx.ctx.sfx.thud?.(); this.fx.ctx.shake(0.6);
      this.fx.ctx.particles.burst(this.x, 0.2, 0, { count: 50, color: '#b8a88a', speed: 0.16, gravity: 0.004, spread: 2.5 });
      this.fx.ctx.rings.spawn(this.x, 0.05, '#ffffff', { grow: 0.3, life: 26 });
      this.under = Math.abs(opp.pos.x - this.x) < 1.4 * this.st.size + 0.4;
    }
    for (let i = 0; i < this.st.hits; i++) if (t === D + F + i * 8) { if (this.under) this.hit(this.x); else this.miss(this.x); }
    const up = D + F + this.st.hits * 8 + 14;
    if (t > up) this.y += 0.5;
    return t > up + 26;
  }
  render() {
    const T = this.custom || this.thing, body = this.opp.rig?.object;
    T.position.set(this.x, this.y + (this.custom ? 2.25 * this.st.size : 0), 0);
    // under it: squashed flat, and back up as it lifts
    if (body && this.under) {
      this.sy ??= body.scale.y;
      const flat = Math.min(1, Math.max(0.12, this.y / 2.2));
      body.scale.y = this.sy * flat; this.squashed = flat < 1;
    }
    if (!this.custom) T.scale.x = this.st.size * this.d;
    this.shadow.position.x = this.x;
    this.shadow.material.opacity = this.y < 14 ? 0.45 * (1 - this.y / 16) : 0;
  }
}
class Cage extends Step {
  start() {
    this.x = this.opp.pos.x;
    const bar = new THREE.MeshStandardMaterial({ color: '#4b4f55', metalness: 0.8, roughness: 0.35, emissive: this.color, emissiveIntensity: 0.15 });
    this.cage = new THREE.Group();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), bar); b.position.set(Math.cos(a) * 0.8, 1.4, Math.sin(a) * 0.8); b.castShadow = true; this.cage.add(b); }
    for (const y of [0.05, 2.8]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 6, 24), bar); r.rotation.x = Math.PI / 2; r.position.y = y; this.cage.add(r); }
    this.g.add(this.cage);
  }
  tick(t) {
    const opp = this.opp, hold = 60 + this.st.hits * 10;
    this.t = t;
    if (t === 10) { this.fx.ctx.sfx.thud?.(); this.fx.ctx.shake(0.3); this.caught = Math.abs(opp.pos.x - this.x) < 1.2; }
    if (t > 10 && t < 10 + hold && this.caught) { opp.pos.x = this.x; opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2; }
    for (let i = 0; i < this.st.hits; i++) if (t === 16 + Math.round(((i + 1) * hold) / (this.st.hits + 1))) { if (this.caught) this.hit(this.x); else this.miss(this.x); }
    return t > 14 + hold;
  }
  render() {
    const t = this.t || 0, k = Math.min(1, t / 10);
    this.cage.position.set(this.x, 8 * (1 - k * k), 0.1);
    this.cage.visible = t < 14 + 60 + this.st.hits * 10;
  }
}
class Clones extends Step {
  // shadow copies of you appear round you and rush them one after another
  start() {
    this.cl = [];
    const src = this.o.rig.object;
    for (let i = 0; i < this.st.hits; i++) {
      let c;
      try { c = src.clone(true); } catch { c = new THREE.Group(); }
      c.traverse((m) => { if (m.isMesh) { m.material = glowMat(this.color, 0.55); } });
      c.visible = false; this.g.add(c);
      this.cl.push({ m: c, x: this.o.pos.x - this.d * (0.8 + i * 0.6), hit: false });
    }
    this.fx.ctx.sfx.teleport?.();
  }
  tick(t) {
    const d = this.d, opp = this.opp;
    this.t = t;
    this.cl.forEach((c, i) => {
      const go = 10 + i * 10;
      if (t >= go && !c.hit) { c.x += d * 0.45 * this.st.speed; if ((c.x - opp.pos.x) * d > -0.6) { c.hit = true; this.hit(c.x); } }
      else if (c.hit) c.x += d * 0.2;
      if (t > 140 && !c.hit) { c.hit = true; this.miss(c.x); }
    });
    return this.cl.every((c) => c.hit) && t > 10 + this.cl.length * 10 + 16;
  }
  render() {
    const t = this.t || 0, o = this.o;
    this.cl.forEach((c, i) => {
      c.m.visible = t >= 4 + i * 3 && !(c.hit && t > 10 + i * 10 + 30);
      c.m.position.set(c.x, o.pos.y, -0.1 - i * 0.05);
      c.m.rotation.copy(o.rig.object.rotation); c.m.scale.copy(o.rig.object.scale);
    });
  }
}
class Quake extends Step {
  start() { this.x0 = this.o.pos.x + this.d * 0.4; this.mat = new THREE.MeshBasicMaterial({ color: '#2b2118', transparent: true, depthWrite: false }); this.glow = glowMat(this.color, 0.8); this.segs = 0; this.fx.ctx.sfx.thud?.(); this.fx.ctx.shake(0.4); }
  tick(t) {
    const opp = this.opp, len = Math.max(0.5, Math.abs(opp.pos.x - this.x0));
    this.t = t; this.len = len;
    if (t === 18) for (let i = 0; i < this.st.hits; i++) { if (opp.pos.y < 0.6) this.hit(opp.pos.x - this.d * 0.5); else this.miss(opp.pos.x); }
    if (t < 50 && t % 6 === 0) this.fx.ctx.shake(0.15);
    return t > 40;
  }
  render() {
    const t = this.t || 0, want = Math.floor(Math.min(1, t / 18) * (this.len || 1) / 0.28);
    while (this.segs < want) {
      const x = this.x0 + this.d * (this.segs + 0.5) * 0.28, z = Math.sin(this.segs * 7.3) * 0.12;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.14), this.mat); c.rotation.x = -Math.PI / 2; c.rotation.z = Math.sin(this.segs * 3.1) * 0.45; c.position.set(x, 0.012, z);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.045), this.glow); gl.rotation.copy(c.rotation); gl.position.set(x, 0.016, z);
      this.g.add(c, gl); this.segs++;
      this.fx.ctx.particles.burst(x, 0.08, z, { count: 4, color: '#a8926e', speed: 0.06, gravity: 0.008, life: 24 });
    }
  }
}
Stomp.prototype.end = function () { this.g.visible = false; if (this.squashed) this.opp.rig.object.scale.y = this.sy; };

class Free extends Step {
  start() {
    const fx = this.fx2 = this.st.fx;
    this.frames = Math.max(20, Math.round(fx.frames / this.st.speed));
    this.items = [];
    for (const [li, l] of fx.layers.entries()) {
      const own = l.shape === 'model' && this.st.model && this.o.def.props?.[this.st.model]?.url;
      const geo = fxGeometry(own ? 'sphere' : l.shape);
      for (let i = 0; i < l.count; i++) {
        if (own) { // the player's own 3D model, one per copy, 1 unit tall before the layer's size
          const grp = new THREE.Group(); grp.visible = false; this.g.add(grp); this.items.push({ m: grp, l, i, li, model: true });
          ownModel(this.fx.ctx, this.o, this.st.model, 1, (mm) => { grp.add(SkeletonUtils.clone(mm)); });
          continue;
        }
        const mat = l.glow ? new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: l.opacity, blending: THREE.AdditiveBlending, depthWrite: false })
          : new THREE.MeshStandardMaterial({ color: l.color, roughness: 0.6, emissive: l.color, emissiveIntensity: 0.25, transparent: true, opacity: l.opacity });
        const m = new THREE.Mesh(geo, mat); m.visible = false; if (!l.glow) m.castShadow = true;
        this.g.add(m); this.items.push({ m, l, i, li });
      }
    }
    this.fired = 0; this.from = this.o.pos.x; this.to = Math.max(-8.2, Math.min(8.2, this.opp.pos.x - this.d * (fx.carryTo ?? 1.2)));
    this.fx.ctx.sfx.whoosh?.();
  }
  tick(t) {
    const o = this.o, opp = this.opp, d = this.d, fx = this.fx2, u = t / this.frames;
    this.t = t; o.vel.x = 0;
    if (fx.carry) {
      o.invuln = 2; const cl = (v) => Math.min(1, Math.max(0, v)), sm = (v) => v * v * (3 - 2 * v);
      if (fx.passU != null) { // (a flying thing: straight to the opponent, over them at passU, then on past them)
        const tgt = Math.max(-8.2, Math.min(8.2, opp.pos.x - d * fx.carryTo)), aft = Math.max(-8.2, Math.min(8.2, opp.pos.x + d * (fx.carryAfter ?? 0)));
        o.pos.x = u <= fx.passU ? this.from + (tgt - this.from) * cl((u - 0.1) / (fx.passU - 0.1)) : tgt + (aft - tgt) * cl((u - fx.passU) / (0.9 - fx.passU));
      } else o.pos.x = this.from + (this.to - this.from) * cl((u - 0.1) / 0.6);
      if (fx.rideY) { o.pos.y = fx.rideY * sm(cl((u - 0.02) / (fx.rideRamp ?? 0.06))) * sm(cl((0.97 - u) / 0.1)); o.vel.y = 0; }
    }
    const n = this.st.hits;
    while (this.fired < n) {
      const at = Math.round(this.frames * (fx.hitFrom + (fx.hitTo - fx.hitFrom) * (n > 1 ? this.fired / (n - 1) : 0)));
      if (t < at) break;
      this.fired++;
      if (Math.abs(opp.pos.x - o.pos.x) <= fx.reach) this.hit(o.pos.x + d * 0.4); else this.miss(o.pos.x);
    }
    if (t === Math.round(this.frames * fx.hitFrom) && this.fx.sp.shake) this.fx.ctx.shake(0.2);
    if (t > this.frames + 6) { while (this.fired < n) { this.fired++; this.miss(o.pos.x); } return true; }
    return false;
  }
  anchor(a) {
    const o = this.o, opp = this.opp, d = this.d;
    switch (a) {
      case 'opponent': return [opp.pos.x, opp.pos.y + 1.2];
      case 'above_opponent': return [opp.pos.x, 11];
      case 'above_user': return [o.pos.x, 11];
      case 'ground_opponent': return [opp.pos.x, 0.1];
      case 'ground_user': return [o.pos.x, 0.1];
      case 'behind_user': return [o.pos.x - d * 3, 1.2];
      case 'far_side': return [opp.pos.x + d * 6, 1.2];
      default: return [o.pos.x, o.pos.y + 1.2];
    }
  }
  render(time) {
    const d = this.d, u = (this.t || 0) / this.frames, size = this.st.size, TAU = Math.PI * 2;
    const ls = this.fx2.layers, w = (this.t || 0) * (this.fx2.gait || 0.5), RAD = Math.PI / 180;
    // each joint's turn now, and where it turns about
    const stopU = this.fx2.stopU ?? 1, runF = u <= stopU ? 1 : Math.max(0, 1 - (u - stopU) / 0.06);
    const actAt = (a) => { // key poses, eased between, back to rest outside them
      if (!a || !a.length) return 0;
      const pts = [[a[0][0] - 0.04, 0], ...a, [a[a.length - 1][0] + 0.04, 0]];
      for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const f = Math.min(1, Math.max(0, (u - pts[i - 1][0]) / Math.max(1e-6, pts[i][0] - pts[i - 1][0]))); return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f * f * (3 - 2 * f); }
      return 0;
    };
    const liftAt = actAt(this.fx2.lift), lungeAt = actAt(this.fx2.lunge);
    const th = ls.map((l) => (l.swingBias || 0) + (l.swing ? (l.swingMode === 'flex' ? l.swing * Math.max(0, -Math.cos(w + l.swingPhase)) : l.swing * Math.sin(w + l.swingPhase)) * (l.run ? runF : 1) : 0) + actAt(l.act));
    const piv = ls.map((l) => { const a = l.rotZ * RAD, hl = (l.pv ?? l.sy / 2) * size; return [l.offX * size - Math.sin(a) * hl, l.offY * size - Math.cos(a) * hl]; });
    for (const it of this.items) {
      const { m, l, i } = it, n = l.count, dur = l.end - l.start, iStart = l.start + l.stagger * dur * (i / n), iDur = Math.max(0.04, dur * (1 - l.stagger));
      const k = (u - iStart) / iDur;
      if (k < 0 || k > 1) { m.visible = false; continue; }
      const [ax, ay] = this.anchor(l.fromA), [bx, by] = this.anchor(l.toA);
      const km = l.mv < 1 ? Math.min(1, k / l.mv) : k, e = l.path === 'accel' ? km * km : km;
      let x = ax + d * l.fromDx + (bx + d * l.toDx - ax - d * l.fromDx) * e, y = ay + l.fromDy + (by + l.toDy - ay - l.fromDy) * e, z = 0.2 + l.offZ * size;
      const f = n > 1 ? i / (n - 1) - 0.5 : 0, a = TAU * i / n;
      if (l.spread === 'line') x += f * l.spreadSize * 2 * d; else if (l.spread === 'column') y += f * l.spreadSize * 2;
      else if (l.spread === 'ring') { x += Math.cos(a) * l.spreadSize; y += Math.sin(a) * l.spreadSize * 0.7; }
      else if (l.spread === 'cloud') { x += (hash01(i + it.li * 31) - 0.5) * l.spreadSize * 2; y += (hash01(i * 7 + it.li * 17 + 3) - 0.5) * l.spreadSize * 1.4; z += (hash01(i * 3 + 5) - 0.5) * 0.8; }
      const amp = l.pathAmp;
      if (l.path === 'arc') y += amp * 4 * k * (1 - k);
      else if (l.path === 'wave') y += amp * Math.sin(k * TAU * 2 + i);
      else if (l.path === 'spiral') { x += Math.cos(k * 14 + i) * amp * (1 - k) * 0.6; y += Math.sin(k * 14 + i) * amp * (1 - k); }
      else if (l.path === 'orbit') { x = ax + d * l.fromDx + Math.cos(k * TAU * 2 + a) * amp; y = ay + l.fromDy + Math.sin(k * TAU * 2 + a) * amp; }
      else if (l.path === 'bounce') y += amp * Math.abs(Math.sin(k * Math.PI * 3));
      // forward kinematics: turn the part about its own joint, then about its parent's joint, and so on up the chain
      let ox = l.offX * size, oy = l.offY * size, rz = l.rotZ;
      for (let c = it.li, hop = 0; c >= 0 && hop < 8; c = ls[c].par, hop++) {
        const t = th[c]; if (!t) continue;
        const ang = t * RAD, ca = Math.cos(ang), sa = Math.sin(ang), dx = ox - piv[c][0], dy = oy - piv[c][1];
        ox = piv[c][0] + dx * ca + dy * sa; oy = piv[c][1] - dx * sa + dy * ca; rz += t;
      }
      ox += l.slideX * k; oy += l.slideY * k;
      if (l.chr) { ox += lungeAt; oy += liftAt; }
      x += d * ox; y += oy;
      if (l.bob) y += l.bob * Math.abs(Math.sin(w)) * size * runF;
      const fade = l.fade === 'in' ? Math.min(1, k * 4) : l.fade === 'out' ? Math.min(1, (1 - k) * 4) : l.fade === 'inout' ? Math.min(1, k * 5, (1 - k) * 5) : 1;
      const g = (l.grow0 + (l.grow1 - l.grow0) * k) * size * Math.max(0.02, fade);
      m.visible = true; m.position.set(x, l.under ? y : Math.max(0.02, y), z); // (under: a burrower starts below the floor, which hides it until it comes up)
      m.scale.set(l.sx * g, l.sy * g, l.sz * g);
      if (m.material) m.material.opacity = l.opacity * fade;
      if (it.model) m.rotation.set(0, (d > 0 ? Math.PI / 2 : -Math.PI / 2) + (this.st.turn || 0) * Math.PI / 2 + l.spin * time * 2, 0);
      else if (l.shape === 'spike') m.rotation.set(0, 0, d > 0 ? -Math.PI / 2 : Math.PI / 2);
      else if (l.shape === 'disc') m.rotation.set(Math.PI / 2, l.spin * time * 2, 0);
      else if (l.shape === 'ring') m.rotation.set(0, 0, l.spin * time * 2);
      else if (l.shape === 'flat') m.rotation.set(0, l.spin * time * 2, 0);
      else m.rotation.set(l.spin * time * 1.3, l.spin * time * 2, 0);
      if (rz && !it.model) m.rotation.z -= rz * Math.PI / 180 * d;
      if (l.roll && !it.model) m.rotation.z -= l.roll * time * d; // (a wheel's spokes turning as it rolls)
      if (l.yaw && !it.model) m.rotation.y += l.yaw * time; // (a rotor turning about the upright axis)
      if (l.trail) this.fx.ctx.particles.burst(x, y, z, { count: 1, color: l.color, speed: 0.02, gravity: 0, life: 14 });
    }
  }
  end() { this.g.visible = false; this.g.traverse((o) => { if (o.isMesh) o.material.dispose(); }); }
}
const STEP_CLASS = { free: Free, shot: Shot, beam: Beam, dash: Dash, teleport: Teleport, sky: Sky, blast: Blast, summon: Summon, stomp: Stomp, cage: Cage, clones: Clones, quake: Quake };

// ── the special: its steps, one after another ────────────────────────────────────
class CustomSpecial extends Effect {
  constructor(o, m, ctx) {
    super(o, m, ctx);
    const { special } = normalizeSpecial(o.def.special);
    this.sp = special;
    this.dir = sign(this.opp.pos.x - o.pos.x);
    this.totalHits = special.steps.reduce((n, s) => n + s.hits, 0);
    this.hitsDone = 0; this.landed = 0;
    this.i = -1; this.st = 0;
    // you're free to move once no step left needs your body (a shot / beast / stomp... carry on alone)
    this.lastBody = special.steps.reduce((k, s, i) => (STEPS[s.kind].body ? i : k), -1);
    ctx.sfx[special.sound]?.();
    if (special.flash) ctx.whiteFlash?.(140);
    this.next();
    if (this.lastBody < 0) o.endSpecial();
  }
  next() {
    this.cur?.end();
    this.i++; this.st = 0;
    if (this.i >= this.sp.steps.length) { this.cur = null; return; }
    const st = this.sp.steps[this.i];
    this.cur = new STEP_CLASS[st.kind](this, st);
    this.pose(STEPS[st.kind].anim, 0);
    this.cur.start();
  }
  pose(anim, pt) { if (this.i <= this.lastBody || this.i === 0) this.owner.poseOverride = { anim, phase: pt ? 'active' : 'startup', pt: pt || 0.5 }; }
  // one hit's worth: the damage split over every hit of every step (poison takes part of it later)
  hit(fromX) {
    const sp = this.sp, opp = this.opp, o = this.owner, last = ++this.hitsDone >= this.totalHits;
    const poison = sp.onHit.includes('poison');
    const per = (poison ? sp.damage * 0.4 : sp.damage) / this.totalHits;
    const ex = { damage: per, hitstun: last ? 30 : 26, push: 0.02 };
    if (last) {
      if (sp.onHit.includes('knockdown')) Object.assign(ex, { knockdown: true, launch: 0.06, push: 0.08 });
      if (sp.onHit.includes('launch')) Object.assign(ex, { knockdown: true, launch: 0.22, push: 0.05 });
      if (sp.onHit.includes('push')) Object.assign(ex, { knockdown: true, launch: 0.05, push: 0.42 });
      if (sp.onHit.includes('daze')) ex.daze = 90;
      if (sp.onHit.includes('freeze')) ex.daze = 120;
    }
    const pull = last && sp.onHit.includes('pull');
    const r = strike(o, this.move, ex, pull ? opp.pos.x + this.dir * 0.6 : fromX ?? opp.pos.x - this.dir * 0.5);
    if (r === 'hit') this.landed++;
    if (pull && r === 'hit') opp.vel.x = -this.dir * 0.32;
    if (r === 'hit' && last) {
      if (sp.onHit.includes('slow')) opp.slow = 240;
      if (poison) opp.poison = { left: 180, every: 20, dmg: (sp.damage * 0.6) / 9 };
      if (sp.onHit.includes('blind')) opp.smoked = 240;
      if (sp.onHit.includes('freeze')) this.frozenUntil = this.t + 120;
    }
    const at = opp.pos;
    this.ctx.particles.burst(at.x, at.y + 1.1, 0.3, { count: last ? 40 : 16, color: sp.color, speed: last ? 0.16 : 0.1, gravity: 0.004 });
    this.ctx.particles.burst(at.x, at.y + 1.1, 0.3, { count: 10, color: '#ffffff', speed: 0.08, gravity: 0.002 });
    if (sp.shake) this.ctx.shake(last ? 0.45 : 0.15);
    if (last && sp.flash) this.ctx.whiteFlash?.(220);
    if (last) { this.ctx.rings.spawn(at.x, 0.05, sp.color, { grow: 0.25, life: 22 }); this.ctx.sfx.hit?.(true); } else this.ctx.sfx.hit?.(false);
    this.ctx.log?.({ t: this.t, hit: this.hitsDone, r });
    return r;
  }
  miss() { this.hitsDone++; this.ctx.log?.({ t: this.t, hit: this.hitsDone, r: 'miss' }); }
  tick() {
    const t = ++this.t, o = this.owner, opp = this.opp;
    // between the steps of a chain they're held where they are (once it's got them)
    if (this.landed && this.cur && this.hitsDone < this.totalHits && opp.alive) { opp.vel.x = 0; opp.pinnedUntil = (opp.clock || 0) + 2; }
    if (this.cur) {
      this.st++;
      if (this.cur.tick(this.st)) {
        if (this.i === this.lastBody) { o.poseOverride = null; o.opacity = 1; o.endSpecial(); }
        this.next();
      }
    } else if (!(t < (this.frozenUntil || 0))) this.finish(); // (the freeze's blue lasts after it)
    if (t > 900) this.finish(); // (never stuck)
  }
  render(time) {
    const o = this.owner, opp = this.opp;
    o.rig.setOpacity?.(o.opacity);
    const frozen = this.t < (this.frozenUntil || 0);
    for (const m of opp.body?.materials || []) if (m.emissive && (frozen || this.wasFrozen)) m.emissive.set(frozen ? '#3a8fd0' : '#000000');
    this.wasFrozen = frozen;
    this.cur?.render(time);
  }
  cleanup() {
    for (const m of this.opp.body?.materials || []) if (m.emissive && this.wasFrozen) m.emissive.set('#000000');
    this.owner.opacity = 1;
    if (this.owner.poseOverride) this.owner.poseOverride = null;
  }
}
registerEffect('custom', CustomSpecial);

// ── the test: is it ready? ───────────────────────────────────────────────────────
// Plays the special out invisibly against a stand-in opponent, at a few distances, twice: no
// errors, it ends, it lands where it should, it deals the damage it says, and it plays out the
// same every time (that's what keeps online fights in sync).
function standIn(x, def) {
  const f = { def, pos: { x, y: 0 }, vel: { x: 0, y: 0 }, facing: 1, alive: true, hp: 100, maxHp: 100, opacity: 1, state: 'idle', clock: 0,
    invuln: 0, slow: 0, smoked: 0, poison: null, dealt: 0, body: { materials: [] }, rig: { setOpacity() {}, object: new THREE.Object3D(), flash() {} },
    endSpecial() { this.ended = true; }, specialsLeft: 1 };
  f.receive = (att, m) => { const d = m.damage || 0; f.hp -= d; f.dealt += d; f.state = m.knockdown ? 'knockdown' : 'hit'; return 'hit'; };
  return f;
}
export function testSpecial(sp) {
  const { special, problems } = normalizeSpecial(sp);
  const report = { ok: true, problems: [...problems], lines: [], special };
  const run = (dist) => {
    const log = [];
    const me = standIn(-dist / 2, { special, props: {} }), them = standIn(dist / 2, {});
    me.opponent = them; them.opponent = me; them.facing = -1;
    const ctx = { scene: new THREE.Scene(), particles: { burst() {} }, rings: { spawn() {} }, sfx: {}, shake() {}, whiteFlash() {}, flash() {}, log: (e) => log.push(e) };
    const e = new CustomSpecial(me, { damage: special.damage, hitstun: 20, push: 0.1 }, ctx);
    let frames = 0;
    while (!e.dead && frames < 1000) { e.tick(); e.render(frames / 60); frames++; them.clock++; }
    const poison = them.poison ? them.poison.dmg * Math.floor(them.poison.left / them.poison.every) : 0;
    e.finish();
    const hits = log.filter((l) => l.r === 'hit');
    return { frames, dealt: them.dealt + poison, hits: hits.length, lastHit: log.length ? log[log.length - 1].t : frames, sig: JSON.stringify(log) };
  };
  try {
    const near = run(2.5), mid = run(4.5), far = run(7), again = run(4.5);
    const say = (r) => (r.hits ? `${r.hits === r.total && r.total > 1 ? 'all ' : ''}${r.hits} hit${r.hits > 1 ? 's' : ''}, ${Math.round(r.dealt)} damage` : 'misses');
    const total = special.steps.reduce((n, s) => n + s.hits, 0);
    for (const r of [near, mid, far]) r.total = total;
    report.lines.push(`Up close: ${say(near)}`, `Mid range: ${say(mid)}`, `Across the arena: ${say(far)}`);
    report.lines.push(`Takes ${(mid.lastHit / 60).toFixed(1)} s from start to the last hit (${special.steps.length} step${special.steps.length > 1 ? 's' : ''}, ${total} hit${total > 1 ? 's' : ''})`);
    if (!near.hits) { report.ok = false; report.problems.push("It doesn't even hit up close."); }
    if (Math.max(near.dealt, mid.dealt, far.dealt) > MAX_DAMAGE + 0.5) { report.ok = false; report.problems.push('It deals too much damage.'); }
    if (Math.max(near.frames, mid.frames, far.frames) >= 1000) { report.ok = false; report.problems.push("It doesn't end."); }
    if (mid.lastHit > 600) { report.ok = false; report.problems.push('It takes too long (over 10 seconds): fewer steps or hits.'); }
    if (again.sig !== mid.sig) { report.ok = false; report.problems.push('It plays out differently each time (it would go out of sync online).'); }
    else report.lines.push('Plays the same every time: works online ✓');
  } catch (err) {
    report.ok = false;
    report.problems.push(`It crashed: ${err.message}`);
  }
  return report;
}
