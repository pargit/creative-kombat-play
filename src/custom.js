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
import { Effect, strike, registerEffect, tigerMesh } from './effects.js';
import { DOT } from './fx.js';
import { loadProp } from './rig.js';

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
};
export const ON_HIT = {
  knockdown: 'Knock down', launch: 'Launch into the air', push: 'Push far away', pull: 'Pull to you',
  daze: 'Daze (stars, 1.5 s)', freeze: 'Freeze (2 s)', slow: 'Slow them (4 s)', poison: 'Poison (damage over 3 s)', blind: "Blind (can't see you, 4 s)",
};
export const SHAPES = { orb: 'Glowing orb', star: 'Star', blade: 'Spinning blade', rock: 'Rock', arrow: 'Arrow' };
export const SOUNDS = { zap: 'Zap', whoosh: 'Whoosh', thud: 'Boom', teleport: 'Warp', special: 'Power up', glass: 'Shatter', whip: 'Crack' };
export const MAX_DAMAGE = 25, MAX_STEPS = 4, MAX_HITS = 10;
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
  num(s, 'damage', 1, MAX_DAMAGE, 20);
  s.steps = s.steps.slice(0, MAX_STEPS).map((st, i) => {
    const o = { ...blankStep(), ...st };
    if (!STEPS[o.kind]) { problems.push(`Step ${i + 1}: "${o.kind}" isn't a part: a shot was used.`); o.kind = 'shot'; }
    num(o, 'hits', 1, 6, 1, `Step ${i + 1} hits`); o.hits = Math.round(o.hits);
    num(o, 'size', 0.5, 2.5, 1, `Step ${i + 1} size`); num(o, 'speed', 0.5, 2, 1, `Step ${i + 1} speed`);
    if (!SHAPES[o.shape]) o.shape = 'orb';
    if (!STEPS[o.kind].model || typeof o.model !== 'string') o.model = null;
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
  if (!/^#[0-9a-f]{6}$/i.test(s.color)) s.color = '#ff8a2a';
  if (!SOUNDS[s.sound]) s.sound = 'zap';
  s.flash = !!s.flash; s.shake = s.shake !== false;
  delete s.delivery; delete s.hits; delete s.size; delete s.speed; delete s.shape;
  return { special: s, problems };
}
export const firstAnim = (sp) => STEPS[(sp.steps?.[0]?.kind) || ({ projectile: 'shot' }[sp.delivery] || sp.delivery)]?.anim || 'throw';

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
  return STEP_KW.some(([re]) => re.test(t));
}
export function describeSpecial(text) {
  const t = String(text || '').toLowerCase(), s = blankSpecial();
  s.onHit = []; s.steps = [];
  for (const piece of t.split(/\b(?:and then|then|after that|afterwards|followed by|finally)\b|[;.]/).map((p) => p.trim()).filter(Boolean)) {
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
  if (/\b(weak|light)\b/.test(t)) s.damage = 12;
  if (/\b(strong|powerful|deadly|brutal|devastating)\b/.test(t)) s.damage = 25;
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
  const dm = t.match(/\b(\d{1,2})\s*(damage|dmg|hp)\b/);
  if (dm) { s.damage = Number(dm[1]); said.push(`Damage ${s.damage}`); }
  else if (/\b(stronger|more damage|too weak|hits? harder|more powerful)\b/.test(t)) { s.damage = Math.min(MAX_DAMAGE, s.damage + 4); said.push(`Stronger (${s.damage} damage)`); }
  else if (/\b(weaker|less damage|too strong|too powerful|overpowered|op)\b/.test(t)) { s.damage = Math.max(1, s.damage - 4); said.push(`Weaker (${s.damage} damage)`); }
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

// one model per (url, height) on screen: the player's own (from their fighter's files), loaded once
function ownModel(ctx, owner, id, height, onReady) {
  const p = owner.def.props?.[id];
  if (!p?.url) return;
  loadProp(p.url, height, p.type).then(onReady).catch(() => {});
}

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
    while (this.g.children.length < this.shots.length) this.g.add(this.custom ? this.custom.clone() : shotMesh(st.shape, this.color, st.size));
    this.shots.forEach((s, i) => {
      const m = this.g.children[i];
      m.visible = s.live; m.position.set(s.x, s.y, 0.2);
      if (this.custom) m.rotation.set(0, d > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
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
    if (this.st.model) ownModel(this.fx.ctx, this.o, this.st.model, h * 1.4, (m) => { this.beast.visible = false; this.custom = m; this.g.add(m); });
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
    if (this.custom) T.rotation.set(0, d > 0 ? Math.PI / 2 : -Math.PI / 2, run ? Math.sin(t * 0.55) * 0.06 : 0);
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
const STEP_CLASS = { shot: Shot, beam: Beam, dash: Dash, teleport: Teleport, sky: Sky, blast: Blast, summon: Summon, stomp: Stomp, cage: Cage, clones: Clones, quake: Quake };

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
