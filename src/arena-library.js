// The free arena builder: no AI service, it all runs on the device. Words go in, a detailed arena recipe
// (a painted floor + a list of objects, the same data the paid AI writes: see scene.js) comes out.
//
// It knows famous places (a wizard castle, a superhero tower, Paris, the pyramids, Rome...), kinds of places (forest, city,
// beach, classroom, stadium...), country flags, and times and weather. Anything it doesn't know is built from the words it
// does know and the reply says what was left out. The paid AI is for places that aren't in the list.
//
// The world: the fight is around x -9…9, z 0. Behind the fighters is -z; the sides are |x| > 13. See scene.js.

import { describeArena, GROUNDS, SKIES, WEATHER } from './arenas.js';

const o = (t, x, z, p = {}) => ({ t, x, z, ...p });
const row = (t, x, z, n, dx, p = {}) => o(t, x, z, { n, dx, ...p });
const sides = (t, x, z, n, dx, p = {}) => [row(t, -x, z, n, -dx, p), row(t, x, z, n, dx, p)]; // the same row on the left and the right
const rect = (x, y, w, h, fill, p = {}) => ({ t: 'rect', x, y, w, h, fill, ...p });
const frame = (x, y, w, h, stroke, lw = 0.5, p = {}) => ({ t: 'rect', x, y, w, h, stroke, lw, ...p });
const oval = (x, y, w, h, p = {}) => ({ t: 'circle', x, y, w, h, ...p });
const line = (x, y, x2, y2, stroke, lw = 0.5) => ({ t: 'line', x, y, x2, y2, stroke, lw });
const noise = (alpha = 0.5) => ({ t: 'noise', alpha });
const flagOp = (x, y, w, h, flag) => ({ t: 'flag', x, y, w, h, flag });
const B = (c, w = 1) => ({ c, w });
const mark = (c, rad = 40) => [oval(50, 60, rad, rad * 1.6, { stroke: c, lw: 0.8 })]; // the ring round the fight

// ── countries: a flag painted on the floor with flags on poles behind ──────────────────────────
const FLAGS = {
  usa: { re: /\b(usa|america|american|united states|stars and stripes)\b/, name: 'USA', f: { bands: [B('#b22234'), B('#ffffff'), B('#b22234'), B('#ffffff'), B('#b22234'), B('#ffffff'), B('#b22234')] }, extra: (x, y, w, h) => [flagOp(x, y, w * 0.42, h * 0.54, { bands: [B('#3c3b6e')], emblem: 'star', emblemColor: '#ffffff', emblemSize: 0.7 })] },
  uk: { re: /\b(uk|britain|british|england|english|united kingdom|union jack|london)\b/, name: 'Britain', f: { bands: [B('#012169')] }, extra: (x, y, w, h) => [rect(x, y + h * 0.36, w, h * 0.28, '#ffffff'), rect(x + w * 0.4, y, w * 0.2, h, '#ffffff'), rect(x, y + h * 0.42, w, h * 0.16, '#c8102e'), rect(x + w * 0.44, y, w * 0.12, h, '#c8102e')] },
  france: { re: /\b(france|french|tricolou?r)\b/, name: 'France', f: { bands: [B('#0055a4'), B('#ffffff'), B('#ef4135')], dir: 'v' } },
  germany: { re: /\b(germany|german|deutschland)\b/, name: 'Germany', f: { bands: [B('#111111'), B('#dd0000'), B('#ffce00')] } },
  italy: { re: /\b(italy|italian|italia)\b/, name: 'Italy', f: { bands: [B('#009246'), B('#ffffff'), B('#ce2b37')], dir: 'v' } },
  spain: { re: /\b(spain|spanish|espana)\b/, name: 'Spain', f: { bands: [B('#aa151b'), B('#f1bf00', 2), B('#aa151b')] } },
  ireland: { re: /\b(ireland|irish)\b/, name: 'Ireland', f: { bands: [B('#169b62'), B('#ffffff'), B('#ff883e')], dir: 'v' } },
  netherlands: { re: /\b(netherlands|dutch|holland)\b/, name: 'Holland', f: { bands: [B('#ae1c28'), B('#ffffff'), B('#21468b')] } },
  russia: { re: /\b(russia|russian)\b/, name: 'Russia', f: { bands: [B('#ffffff'), B('#0039a6'), B('#d52b1e')] } },
  ukraine: { re: /\b(ukraine|ukrainian)\b/, name: 'Ukraine', f: { bands: [B('#0057b7'), B('#ffd700')] } },
  poland: { re: /\b(poland|polish)\b/, name: 'Poland', f: { bands: [B('#ffffff'), B('#dc143c')] } },
  japan: { re: /\b(japan flag|japanese flag|rising sun)\b/, name: 'Japan', f: { bands: [B('#ffffff')], emblem: 'circle', emblemColor: '#bc002d', emblemSize: 0.6 } },
  israel: { re: /\b(israel|israeli)\b/, name: 'Israel', f: { bands: [B('#ffffff', 1), B('#0038b8', 1.5), B('#ffffff', 5), B('#0038b8', 1.5), B('#ffffff', 1)], emblem: 'star_of_david', emblemColor: '#0038b8', emblemSize: 0.5 } },
  brazil: { re: /\b(brazil|brazilian)\b/, name: 'Brazil', f: { bands: [B('#009c3b')], emblem: 'circle', emblemColor: '#ffdf00', emblemSize: 0.55 } },
  mexico: { re: /\b(mexico|mexican)\b/, name: 'Mexico', f: { bands: [B('#006847'), B('#ffffff'), B('#ce1126')], dir: 'v', emblem: 'circle', emblemColor: '#8b6b3a', emblemSize: 0.3 } },
  china: { re: /\b(china|chinese)\b/, name: 'China', f: { bands: [B('#de2910')], emblem: 'star', emblemColor: '#ffde00', emblemSize: 0.4 } },
  turkey: { re: /\b(turkey|turkish)\b/, name: 'Turkey', f: { bands: [B('#e30a17')], emblem: 'crescent', emblemColor: '#ffffff', emblemSize: 0.5 } },
  india: { re: /\b(india|indian)\b/, name: 'India', f: { bands: [B('#ff9933'), B('#ffffff'), B('#138808')], emblem: 'circle', emblemColor: '#000080', emblemSize: 0.22 } },
  argentina: { re: /\b(argentina|argentinian|argentine)\b/, name: 'Argentina', f: { bands: [B('#74acdf'), B('#ffffff'), B('#74acdf')], emblem: 'circle', emblemColor: '#f6b40e', emblemSize: 0.2 } },
  sweden: { re: /\b(sweden|swedish)\b/, name: 'Sweden', f: { bands: [B('#006aa7')] }, extra: (x, y, w, h) => [rect(x, y + h * 0.4, w, h * 0.2, '#fecc00'), rect(x + w * 0.28, y, w * 0.12, h, '#fecc00')] },
  canada: { re: /\b(canada|canadian)\b/, name: 'Canada', f: { bands: [B('#d52b1e'), B('#ffffff', 2), B('#d52b1e')], dir: 'v', emblem: 'star', emblemColor: '#d52b1e', emblemSize: 0.5 } },
};
function flagArena(key, mods) {
  const F = FLAGS[key], flag = { dir: 'h', emblem: 'none', emblemColor: '#ffffff', emblemSize: 0.4, ...F.f };
  const x = 6, y = 20, w = 88, h = 68;
  return {
    name: `${F.name} Flag`, ground: 'concrete', sky: mods.sky || 'day', weather: 'none', accent: '#ffffff', floorColor: '#6d6d70',
    floor: [flagOp(x, y, w, h, flag), ...(F.extra ? F.extra(x, y, w, h) : []), frame(x, y, w, h, '#ffffff', 0.8, { alpha: 0.9 })],
    objects: [
      ...sides('flagpole', 16, -8, 3, 8, { h: 11, flag }), o('flagpole', 0, -16, { h: 15, flag }), o('flagpole', -8, -14, { h: 12, flag }), o('flagpole', 8, -14, { h: 12, flag }),
      o('banner', -18, -22, { w: 8, h: 4, y: 2, flag }), o('banner', 18, -22, { w: 8, h: 4, y: 2, flag }),
      ...sides('lamp', 14, -6, 2, 9, { h: 5, c2: '#fff1c0' }), o('stage', 0, -26, { w: 30, h: 1.2, d: 6, c: '#2b2b30' }),
    ],
  };
}

// ── places ──────────────────────────────────────────────────────────────────────────────
const PLACES = [
  { id: 'wizard', name: 'Wizard Castle', re: /\b(hogwarts|wizard(ing)? (school|castle|academy)|magic(al)? (school|castle|academy)|school of (magic|witchcraft)|harry potter|witch castle)\b/,
    ground: 'stone', sky: 'night', weather: 'fog', accent: '#d4af37', floorColor: '#4b4b55',
    floor: [oval(50, 60, 46, 70, { stroke: '#d4af37', lw: 0.7 }), oval(50, 60, 30, 46, { stroke: '#7a6ad8', lw: 0.5, alpha: 0.8 }), noise(0.4)],
    objects: [o('landmark', 0, -44, { k: 'castle', c: '#5d5d6c', c2: '#243a64', s: 1.1 }), ...sides('pine', 16, -12, 5, 5.5, { h: 7, c: '#1f3b2c', dz: -2 }), ...sides('lamp', 12, -6, 4, 7, { h: 4, c2: '#ffcf6a' }),
      row('sphere', -14, -10, 6, 5.6, { r: 0.18, y: 6.5, c: '#fff0b0' }), row('sphere', -12, -16, 6, 5, { r: 0.16, y: 9, c: '#fff0b0' }), row('bush', -22, -14, 8, 6, { r: 1, c: '#1f4a2c' }), o('tower', 30, -22, { r: 3, h: 24, c: '#5d5d6c', c2: '#243a64' }), o('tower', -30, -22, { r: 3, h: 20, c: '#5d5d6c', c2: '#243a64' })] },
  { id: 'hero tower', name: 'Hero Tower', re: /\b(avengers?|stark|tony stark|marvel|superhero(es)?|super hero(es)?|justice league|hero (tower|base|headquarters)|new york)\b/,
    ground: 'concrete', sky: 'sunset', weather: 'none', accent: '#2fa8ff', floorColor: '#4a4e57',
    floor: [oval(50, 60, 40, 64, { stroke: '#2fa8ff', lw: 0.8 }), oval(50, 60, 26, 42, { stroke: '#ffffff', lw: 0.4, alpha: 0.7 }), noise(0.4)],
    objects: [o('landmark', 0, -34, { k: 'skyscraper', c: '#8e99ab', c2: '#cfe8ff', txt: 'A', s: 1 }), ...sides('building', 24, -26, 4, 11, { w: 8, h: 18, d: 8, c: '#3b4250', c2: '#ffd98a', dz: -3 }), ...sides('building', 18, -42, 3, 14, { w: 9, h: 26, d: 8, c: '#2f3541', c2: '#9fd0ff' }), ...sides('lamp', 14, -6, 3, 8, { h: 4.5, c2: '#fff1c0' }), row('crate', -22, -8, 3, 2, { c: '#6a5a44' })] },
  { id: 'eiffel', name: 'Paris', re: /\b(paris|eiffel|parisian)\b/,
    ground: 'stone', sky: 'sunset', weather: 'none', accent: '#f4c542', floorColor: '#a89f8d',
    floor: [oval(50, 62, 46, 74, { stroke: '#7d7466', lw: 0.7 }), line(0, 62, 100, 62, '#8d8473', 0.4), line(50, 20, 50, 100, '#8d8473', 0.4), noise(0.5)],
    objects: [o('landmark', 0, -46, { k: 'eiffel', c: '#4a3f36', s: 1 }), ...sides('tree', 17, -14, 5, 6, { h: 5, c: '#4e8b3e', dz: -1.5 }), ...sides('lamp', 13, -5, 4, 8, { h: 4.5, c2: '#ffe3a0' }), ...sides('bench', 19, -9, 2, 6, { w: 2, c: '#2e5a3a', c2: '#222' }), row('table', -22, -20, 3, 4, { w: 1.2, d: 1.2, c: '#f4f0e6' }), row('chair', -22, -22, 6, 2, { c: '#3a3a3a' }), ...sides('building', 30, -30, 2, 12, { w: 10, h: 14, d: 8, c: '#d8cdb4', c2: '#4a5a6a' })] },
  { id: 'pyramids', name: 'Pyramids', re: /\b(pyramids?|egypt(ian)?|pharaoh|sphinx|sahara|nile)\b/,
    ground: 'sand', sky: 'day', weather: 'none', accent: '#e0b040', floorColor: '#d9bd84',
    floor: [oval(50, 62, 46, 70, { stroke: '#a88a4a', lw: 0.6, alpha: 0.7 }), noise(0.7), line(0, 90, 100, 85, '#c8a868', 1.2)],
    objects: [o('landmark', -4, -52, { k: 'pyramid', c: '#d8b878', c2: '#c8a460', s: 1.5 }), o('landmark', 26, -44, { k: 'pyramid', c: '#d2b070', c2: '#bf9c58', s: 1.0 }), o('landmark', 52, -40, { k: 'pyramid', c: '#d2b070', c2: '#bf9c58', s: 0.7 }),
      ...sides('palm', 17, -10, 3, 7, { h: 7, c: '#3f8a3a' }), ...sides('rock', 22, -8, 3, 8, { r: 1.2, c: '#b89860' }), row('cone', -26, -14, 3, 4, { r: 0.35, h: 3, c: '#c8b078' })] },
  { id: 'colosseum', name: 'Colosseum', re: /\b(colosseum|coliseum|gladiators?|roman arena|ancient rome|rome|roman)\b/,
    ground: 'sand', sky: 'day', weather: 'none', accent: '#c8302a', floorColor: '#d2b98a',
    floor: [oval(50, 62, 56, 86, { stroke: '#8a6a3a', lw: 0.8 }), oval(50, 62, 24, 38, { stroke: '#a88a5a', lw: 0.4 }), noise(0.6)],
    objects: [o('landmark', 0, -36, { k: 'colosseum', c: '#cdb48a', c2: '#bda070', s: 1 }), ...sides('cylinder', 15, -4, 3, 6, { r: 0.6, h: 5, c: '#e0d6c0' }), ...sides('flagpole', 20, -8, 2, 6, { h: 9, flag: { bands: [B('#a01820')] } }), ...sides('rock', 24, -6, 2, 5, { r: 1, c: '#a89878' })] },
  { id: 'japan', name: 'Japanese Dojo', re: /\b(dojo|pagoda|japan|japanese|samurai|shrine|temple|ninja (village|school)|kyoto|tokyo temple)\b/,
    ground: 'wood', sky: 'dawn', weather: 'leaves', accent: '#e0233a', floorColor: '#8a5a32',
    floor: [frame(14, 24, 72, 66, '#3a2210', 0.8), oval(50, 58, 34, 52, { stroke: '#f1e6cf', lw: 0.8 }), line(50, 24, 50, 90, '#6a4220', 0.3), noise(0.4)],
    objects: [o('landmark', 0, -36, { k: 'pagoda', c: '#7a3a2a', c2: '#3a3a44', s: 1 }), o('box', -7, -14, { w: 0.9, h: 7, d: 0.9, c: '#c8202a' }), o('box', 7, -14, { w: 0.9, h: 7, d: 0.9, c: '#c8202a' }), o('box', 0, -14, { w: 16.5, h: 0.9, d: 1.2, c: '#1b1b1b', y: 7 }), o('box', 0, -14, { w: 14, h: 0.6, d: 0.8, c: '#c8202a', y: 5.8 }),
      ...sides('pine', 18, -12, 4, 6, { h: 6, c: '#2f5a3a' }), ...sides('lamp', 12, -7, 3, 7, { h: 3.5, c2: '#ff5a3a' }), row('rock', 22, -9, 3, 3, { r: 1.1, c: '#7d7a72' }), o('tree', -26, -16, { h: 6, c: '#f08aa8', n: 3, dx: -5 })] },
  { id: 'lighthouse', name: 'Lighthouse', re: /\b(lighthouse|harbou?r|pier|seaside|coast|port town)\b/,
    ground: 'sand', sky: 'sunset', weather: 'none', accent: '#e0e0e0', floorColor: '#8a7a62',
    floor: [rect(0, 0, 100, 28, '#2b6a9a'), rect(0, 28, 100, 6, '#e8e0c8', { alpha: 0.9 }), frame(20, 38, 60, 56, '#5a4a32', 0.6), noise(0.5)],
    objects: [o('landmark', -22, -30, { k: 'lighthouse', c: '#f2f2f2', c2: '#d8322a', s: 1.1 }), ...sides('rock', 16, -10, 4, 5, { r: 1.2, c: '#6f7378' }), row('crate', 14, -9, 3, 1.4, { c: '#9a7a4a' }), ...sides('lamp', 13, -5, 2, 8, { h: 4, c2: '#ffe3a0' }), o('fence', -16, -6, { w: 10, c: '#8a6a3a', c2: '#e8e0c8' }), o('fence', 16, -6, { w: 10, c: '#8a6a3a', c2: '#e8e0c8' })] },
  { id: 'windmill', name: 'Windmill Farm', re: /\b(windmill|farm|farmyard|barn|countryside|ranch|holland fields|village green)\b/,
    ground: 'grass', sky: 'day', weather: 'none', accent: '#e8c44a', floorColor: '#6a9a45',
    floor: [oval(50, 60, 40, 62, { stroke: '#c8b070', lw: 0.8 }), rect(35, 72, 30, 6, '#8a6a3a', { alpha: 0.5 }), noise(0.4)],
    objects: [o('landmark', -20, -30, { k: 'windmill', c: '#e8dcc0', c2: '#8a3a2a', s: 1.1 }), o('building', 22, -22, { w: 12, h: 8, d: 9, c: '#a02a24', c2: '#222', windows: false }), o('tent', 22, -22, { w: 12, h: 8, d: 9, c: '#a02a24', c2: '#6a1a16', y: 8 }), o('fence', -12, -8, { w: 14, c: '#a07a48', c2: '#a07a48' }), o('fence', 12, -8, { w: 14, c: '#a07a48', c2: '#a07a48' }),
      ...sides('tree', 26, -18, 3, 6, { h: 5.5, c: '#4c8a3a' }), row('cylinder', -28, -12, 3, 3, { r: 0.7, h: 1.2, c: '#e0c050' }), row('bush', 14, -14, 5, 3, { r: 0.7, c: '#3f7a30' })] },
  { id: 'space', name: 'Space Station', re: /\b(space ?(station|ship|base)?|outer space|moon base|moon|mars|galaxy|alien (planet|world)|planet|orbit|sci-?fi base)\b/,
    ground: 'metal', sky: 'space', weather: 'none', accent: '#2fe0ff', floorColor: '#505862',
    floor: [oval(50, 60, 46, 74, { stroke: '#2fe0ff', lw: 0.8 }), oval(50, 60, 30, 48, { stroke: '#2fe0ff', lw: 0.4, alpha: 0.6 }), line(0, 60, 100, 60, '#3a4048', 0.5), line(50, 20, 50, 100, '#3a4048', 0.5), frame(8, 22, 84, 70, '#2fe0ff', 0.4, { alpha: 0.5 }), noise(0.4)],
    objects: [o('landmark', -26, -50, { k: 'planet', c: '#c2724a', c2: '#e8c8a0', s: 1.3 }), ...sides('dome', 24, -20, 2, 12, { r: 5, c: '#9fb4c8' }), ...sides('cylinder', 15, -10, 3, 6, { r: 0.8, h: 4, c: '#7d858f' }), ...sides('lamp', 12, -6, 3, 8, { h: 3.5, c2: '#2fe0ff' }), row('crate', -26, -9, 4, 2, { c: '#6a727c' }), o('tower', 36, -26, { r: 2, h: 16, c: '#8a929c', c2: '#2fe0ff' })] },
  { id: 'pirate', name: 'Pirate Ship', re: /\b(pirates?|pirate ship|galleon|ship deck|on a ship|sailing ship|ship)\b/,
    ground: 'wood', sky: 'sunset', weather: 'none', accent: '#d8b040', floorColor: '#8a6038',
    floor: [oval(50, 60, 34, 52, { stroke: '#4a2c12', lw: 0.8 }), line(0, 45, 100, 45, '#5a3a1a', 0.3), line(0, 75, 100, 75, '#5a3a1a', 0.3), noise(0.4)],
    objects: [o('landmark', 2, -26, { k: 'ship', c: '#8a5a32', c2: '#efe3c8', s: 1.2 }), ...sides('crate', 14, -7, 3, 1.3, { c: '#a27a4a' }), ...sides('cylinder', 20, -9, 2, 2, { r: 0.55, h: 1.2, c: '#5a3a1a' }), row('fence', -18, -4, 1, 0, { w: 12, c: '#5a3a1a', c2: '#5a3a1a' }), row('fence', 18, -4, 1, 0, { w: 12, c: '#5a3a1a', c2: '#5a3a1a' }), ...sides('flagpole', 24, -12, 1, 0, { h: 12, flag: { bands: [B('#111111')], emblem: 'circle', emblemColor: '#ffffff', emblemSize: 0.3 } })] },
  { id: 'stonehenge', name: 'Stone Circle', re: /\b(stonehenge|stone circle|druids?|standing stones)\b/,
    ground: 'grass', sky: 'dawn', weather: 'fog', accent: '#b8c0a8', floorColor: '#6a8a4e',
    floor: [oval(50, 62, 44, 70, { stroke: '#8a9a78', lw: 0.6, alpha: 0.7 }), noise(0.5)],
    objects: [o('landmark', 0, -28, { k: 'stonehenge', c: '#8a877e', s: 1 }), ...sides('rock', 17, -8, 3, 5, { r: 1.1, c: '#7d7a72' }), ...sides('pine', 24, -16, 3, 6, { h: 6, c: '#2f5a3a' })] },
  { id: 'bridge', name: 'Golden Bridge', re: /\b(golden gate|suspension bridge|bridge|san francisco)\b/,
    ground: 'concrete', sky: 'dawn', weather: 'fog', accent: '#e0502a', floorColor: '#6d6f73',
    floor: [rect(0, 20, 100, 70, '#55595e'), line(0, 56, 100, 56, '#f4c542', 0.5), line(0, 30, 100, 30, '#ffffff', 0.4), line(0, 84, 100, 84, '#ffffff', 0.4), noise(0.5)],
    objects: [o('landmark', 0, -22, { k: 'bridge', c: '#c8362a', c2: '#a02a22', s: 1 }), ...sides('lamp', 14, -6, 4, 6, { h: 4, c2: '#ffe3a0' }), row('wall', 0, -9, 1, 0, { w: 46, h: 1.1, d: 0.6, c: '#888c92' })] },
  { id: 'igloo', name: 'Arctic Village', re: /\b(igloos?|north pole|arctic|eskimo|polar|tundra|snow village|ice village)\b/,
    ground: 'snow', sky: 'dawn', weather: 'snow', accent: '#9fdcff', floorColor: '#e6eef5',
    floor: [oval(50, 62, 44, 70, { stroke: '#b5cbe0', lw: 0.7 }), noise(0.3)],
    objects: [o('landmark', -20, -22, { k: 'igloo', c: '#f2f8ff', c2: '#c8d8e8', s: 1.2 }), o('landmark', 22, -26, { k: 'igloo', c: '#f2f8ff', c2: '#c8d8e8', s: 1.0 }), ...sides('pine', 28, -14, 3, 5, { h: 6, c: '#3f6a52' }), ...sides('rock', 16, -9, 3, 5, { r: 1, c: '#c8d8e8' }), row('cone', -10, -30, 8, 8, { r: 6, h: 14, c: '#dfe9f2' })] },
  { id: 'volcano', name: 'Volcano', re: /\b(volcano|volcanic|lava (land|field|world|lake)|magma|inferno|hell|underworld|mordor|mount doom)\b/,
    ground: 'lava', sky: 'storm', weather: 'embers', accent: '#ff6a1a', floorColor: '#2a1d1a',
    floor: [oval(50, 62, 46, 72, { stroke: '#ff6a1a', lw: 0.7 }), line(10, 30, 36, 50, '#ff6a1a', 0.8), line(90, 28, 66, 52, '#ff6a1a', 0.8), line(20, 90, 44, 78, '#ff6a1a', 0.6), noise(0.3)],
    objects: [o('landmark', 0, -36, { k: 'volcano', c: '#2e2420', c2: '#ff6a1a', s: 1.3 }), ...sides('rock', 16, -9, 4, 6, { r: 1.4, c: '#1f1816' }), ...sides('cone', 24, -16, 3, 7, { r: 1.2, h: 5, c: '#3a2a24' }), ...sides('cone', 20, -6, 2, 5, { r: 0.5, h: 3, c: '#ff6a1a' })] },
  { id: 'ring', name: 'Boxing Ring', re: /\b(boxing|boxing ring|wrestling|wrestling ring|ufc|mma|octagon|cage fight|fight club|fight night)\b/,
    ground: 'concrete', sky: 'night', weather: 'none', accent: '#d8322a', floorColor: '#2a2a30',
    floor: [rect(22, 30, 56, 62, '#2f5fb8'), frame(22, 30, 56, 62, '#ffffff', 1.2), oval(50, 61, 22, 36, { stroke: '#ffffff', lw: 0.6 }), frame(22, 30, 56, 62, '#d8322a', 0.5, { alpha: 0.9 })],
    objects: [...sides('cylinder', 14, 0, 1, 0, { r: 0.25, h: 2.2, c: '#d8322a' }), ...sides('cylinder', 14, -9, 1, 0, { r: 0.25, h: 2.2, c: '#d8322a' }), o('box', 0, -9, { w: 28, h: 0.07, d: 0.07, c: '#ffffff', y: 0.8 }), o('box', 0, -9, { w: 28, h: 0.07, d: 0.07, c: '#d8322a', y: 1.35 }), o('box', 0, -9, { w: 28, h: 0.07, d: 0.07, c: '#2f5fb8', y: 1.9 }),
      ...sides('chair', 17, -14, 4, 1.6, { c: '#3a3a42', dz: -1.2 }), ...sides('chair', 17, -17, 4, 1.6, { c: '#3a3a42', dz: -1.2 }), o('stage', 0, -26, { w: 36, h: 2, d: 6, c: '#1c1c22', c2: '#ffd23f', txt: 'FIGHT NIGHT' }), ...sides('lamp', 12, -20, 2, 14, { h: 9, c2: '#fff1c0' })] },
  { id: 'stadium', name: 'Stadium', re: /\b(stadium|football|soccer|pitch|basketball|tennis|sports? (field|arena)|baseball|rugby|olympic|world cup|football field)\b/,
    ground: 'grass', sky: 'day', weather: 'none', accent: '#ffffff', floorColor: '#3f8a3a',
    floor: [rect(0, 14, 100, 84, '#3f8a3a'), ...[0, 1, 2, 3, 4].map((i) => rect(i * 20, 14, 10, 84, '#46963f', { alpha: 0.8 })), frame(8, 22, 84, 70, '#ffffff', 0.9), line(50, 22, 50, 92, '#ffffff', 0.9), oval(50, 57, 18, 36, { stroke: '#ffffff', lw: 0.9 }), frame(8, 40, 12, 34, '#ffffff', 0.8), frame(80, 40, 12, 34, '#ffffff', 0.8)],
    objects: [o('box', 0, -34, { w: 80, h: 4, d: 6, c: '#8a8f98' }), o('box', 0, -38, { w: 80, h: 7, d: 6, c: '#7a7f88' }), o('box', 0, -42, { w: 80, h: 10, d: 6, c: '#6a6f78' }), ...[0, 1, 2].map((r) => row('sphere', -36, -33 - r * 4, 24, 3, { r: 0.4, y: 4.4 + r * 3, c: r % 2 ? '#e0233a' : '#2f7fff' })), ...sides('lamp', 34, -26, 1, 0, { h: 18, c2: '#fffbe0' }), o('box', -36, -2, { w: 0.2, h: 2.6, d: 7, c: '#ffffff' }), o('box', 36, -2, { w: 0.2, h: 2.6, d: 7, c: '#ffffff' })] },
  { id: 'army', name: 'Army Base', re: /\b(army|military|parade|barracks|soldiers?|boot camp|war base|bootcamp|fort)\b/,
    ground: 'concrete', sky: 'day', weather: 'none', accent: '#6a7a3a', floorColor: '#7d7f6a',
    floor: [rect(10, 26, 80, 62, '#6e705c'), frame(10, 26, 80, 62, '#e8e2c0', 0.8), line(50, 26, 50, 88, '#e8e2c0', 0.5), oval(50, 57, 22, 40, { stroke: '#e8e2c0', lw: 0.7 }), noise(0.5)],
    objects: [...sides('tent', 22, -14, 3, 8, { w: 6, h: 3, d: 7, c: '#6a7a3a', c2: '#56652e' }), ...sides('flagpole', 14, -16, 1, 0, { h: 14, flag: { bands: [B('#3a4a2a')] } }), o('flagpole', 0, -20, { h: 16, flag: { bands: [B('#3a4a2a')] } }), o('fence', -22, -6, { w: 14, c: '#888', c2: '#666' }), o('fence', 22, -6, { w: 14, c: '#888', c2: '#666' }), ...sides('crate', 26, -9, 2, 1.4, { c: '#6a7a3a' }), o('wall', 0, -30, { w: 60, h: 3.5, d: 1.5, c: '#8a8a7a' }), o('building', 30, -34, { w: 12, h: 8, d: 9, c: '#7d7f6a', c2: '#222' })] },
  { id: 'market', name: 'Market', re: /\b(market|bazaar|souk|fair ground|street fair|marketplace|food stalls?)\b/,
    ground: 'stone', sky: 'day', weather: 'none', accent: '#e8a030', floorColor: '#b09a78',
    floor: [oval(50, 62, 40, 62, { stroke: '#8a7458', lw: 0.6 }), noise(0.6)],
    objects: [...[['#d8322a', -20], ['#2f7fff', -30], ['#f4c542', 20], ['#22a55e', 30]].map(([c, x]) => o('tent', x, -12, { w: 6, h: 2.6, d: 4, c, c2: c })), ...sides('table', 20, -10, 2, 10, { w: 2.2, d: 1, c: '#a27a4a' }), ...sides('crate', 24, -8, 3, 1.1, { c: '#a27a4a' }), ...sides('lamp', 14, -6, 3, 9, { h: 4, c2: '#ffe3a0' }), row('building', -42, -24, 4, 18, { w: 12, h: 11, d: 8, c: '#c8a878', c2: '#4a5a6a' })] },
  { id: 'beach', name: 'Beach', re: /\b(beach|island|tropical|seashore|lagoon|paradise|hawaii|caribbean|palm (trees|island))\b/,
    ground: 'sand', sky: 'sunset', weather: 'none', accent: '#2fe0ff', floorColor: '#e6d29a',
    floor: [rect(0, 0, 100, 24, '#2a8ac8'), rect(0, 24, 100, 5, '#bfe8f4', { alpha: 0.9 }), oval(50, 66, 30, 40, { stroke: '#cdb878', lw: 0.6, alpha: 0.6 }), noise(0.5)],
    objects: [...sides('palm', 17, -9, 4, 7, { h: 8, c: '#3f8a3a', dz: -2 }), ...sides('rock', 24, -12, 2, 8, { r: 1.2, c: '#8a847a' }), o('cone', -14, -6, { r: 1.4, h: 0.5, c: '#d8322a' }), o('cylinder', -14, -6, { r: 0.05, h: 2.4, c: '#f4f0e6' }), o('cone', 15, -7, { r: 1.5, h: 0.5, c: '#2f7fff' }), o('cylinder', 15, -7, { r: 0.05, h: 2.4, c: '#f4f0e6' }), o('bench', 18, -4, { w: 2, c: '#a27a4a', c2: '#6a4a2a' })] },
  { id: 'forest', name: 'Forest', re: /\b(forest|woods?|jungle|rainforest|woodland|enchanted|fairy ?tale|meadow|park|garden|nature)\b/,
    ground: 'grass', sky: 'day', weather: 'none', accent: '#7dff6a', floorColor: '#547f37',
    floor: [oval(50, 62, 44, 70, { stroke: '#7a8f4a', lw: 0.6, alpha: 0.6 }), oval(50, 60, 20, 30, { fill: '#6a8f45', alpha: 0.5 }), noise(0.6)],
    objects: [...sides('tree', 15, -6, 5, 5, { h: 7, c: '#3f7a30', dz: -2.5 }), ...sides('tree', 21, -10, 4, 6, { h: 9, c: '#4c8a3a', dz: -3 }), row('tree', -30, -32, 10, 7, { h: 12, c: '#356a2a' }), ...sides('bush', 14, -4, 3, 4, { r: 0.9, c: '#2f6a2a', dz: -3 }), ...sides('rock', 24, -8, 2, 7, { r: 1, c: '#7d776f' }), o('bench', 16, -3, { w: 2, c: '#6b4a2e', c2: '#3a2a1a' })] },
  { id: 'desert', name: 'Desert', re: /\b(desert|dunes?|wild west|western|cowboy|canyon|badlands|oasis|saloon|mesa)\b/,
    ground: 'sand', sky: 'day', weather: 'none', accent: '#e8a030', floorColor: '#d8b878',
    floor: [oval(50, 62, 44, 70, { stroke: '#b89858', lw: 0.6, alpha: 0.6 }), noise(0.7), line(0, 88, 100, 92, '#c8a868', 1)],
    objects: [row('cone', -44, -42, 8, 12, { r: 9, h: 11, c: '#c8905a' }), ...sides('cylinder', 16, -8, 3, 6, { r: 0.4, h: 2.6, c: '#3f8a4a' }), ...sides('rock', 22, -10, 3, 7, { r: 1.5, c: '#a8764a' }), o('building', 30, -22, { w: 11, h: 6, d: 8, c: '#8a5a32', c2: '#f4c542' }), o('sign', 30, -16, { w: 4, h: 1.4, txt: 'SALOON', c: '#5a3a1a', c2: '#f4c542' }), o('fence', -20, -7, { w: 12, c: '#8a5a32', c2: '#6a4220' }), o('cylinder', -28, -12, { r: 1.1, h: 1.5, c: '#6a4a2a' })] },
  { id: 'city', name: 'City Street', re: /\b(city|downtown|town|street|urban|alley|metropolis|skyline)\b/,
    ground: 'concrete', sky: 'day', weather: 'none', accent: '#ffb347', floorColor: '#55585e',
    floor: [rect(0, 28, 100, 56, '#44474c'), line(0, 56, 100, 56, '#f4c542', 0.5), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => rect(i * 13 + 2, 54, 8, 4, '#f2f2f2')), rect(0, 84, 100, 12, '#8d8f94'), rect(0, 20, 100, 8, '#8d8f94'), noise(0.5)],
    objects: [...sides('building', 22, -22, 3, 12, { w: 10, h: 16, d: 9, c: '#9aa3ad', c2: '#cfe3f2', dz: -1 }), ...sides('building', 20, -40, 3, 14, { w: 12, h: 30, d: 10, c: '#7d8691', c2: '#cfe3f2' }), ...sides('lamp', 14, -5, 4, 9, { h: 5, c2: '#fff1c0' }), o('sign', -16, -8, { w: 2, h: 1.4, txt: 'STOP', c: '#d8322a', c2: '#ffffff' }), row('crate', 18, -6, 2, 1.2, { c: '#8a6a44' })] },
  { id: 'rooftop', name: 'Rooftop', re: /\b(roof ?top|on a roof|skyscraper roof|helipad|penthouse)\b/,
    ground: 'metal', sky: 'sunset', weather: 'none', accent: '#ffb347', floorColor: '#6d747c',
    floor: [oval(50, 60, 40, 64, { stroke: '#ffd23f', lw: 0.8 }), { t: 'text', s: 'H', x: 50, y: 60, size: 22, fill: '#ffd23f' }, frame(6, 20, 88, 74, '#ffffff', 0.5, { alpha: 0.7 }), noise(0.4)],
    objects: [row('building', -52, -34, 7, 17, { w: 9, h: 22, d: 8, c: '#4a4f5a', c2: '#ffd98a' }), row('building', -44, -52, 6, 17, { w: 10, h: 36, d: 8, c: '#3b4250', c2: '#9fd0ff' }), o('fence', -22, -4, { w: 14, c: '#9aa0a8', c2: '#777' }), o('fence', 22, -4, { w: 14, c: '#9aa0a8', c2: '#777' }), ...sides('cylinder', 24, -10, 1, 0, { r: 1.2, h: 2, c: '#8a929c' }), ...sides('lamp', 15, -3, 1, 0, { h: 5, c2: '#fff1c0' })] },
  { id: 'neon', name: 'Neon City', re: /\b(neon|cyber ?punk|cyber city|arcade|night ?club|club|disco|synthwave|retro ?wave|blade runner|tokyo night)\b/,
    ground: 'metal', sky: 'night', weather: 'rain', accent: '#ff3cac', floorColor: '#25262e',
    floor: [oval(50, 60, 40, 64, { stroke: '#ff3cac', lw: 0.8 }), oval(50, 60, 26, 42, { stroke: '#2fe0ff', lw: 0.7 }), line(0, 40, 100, 40, '#9b4dff', 0.4, ), line(0, 82, 100, 82, '#9b4dff', 0.4), noise(0.3)],
    objects: [...sides('building', 22, -22, 3, 12, { w: 9, h: 20, d: 8, c: '#20222c', c2: '#2fe0ff', dz: -2 }), ...sides('building', 18, -40, 3, 14, { w: 11, h: 34, d: 9, c: '#1a1c26', c2: '#ff3cac' }), o('sign', -18, -9, { w: 5, h: 1.6, txt: 'NEON', c: '#ff3cac', c2: '#ffffff' }), o('sign', 18, -9, { w: 5, h: 1.6, txt: 'BAR', c: '#2fe0ff', c2: '#101018' }), o('banner', -30, -26, { w: 6, h: 8, y: 6, txt: 'GAME', c: '#9b4dff', c2: '#fff' }), ...sides('lamp', 14, -5, 3, 9, { h: 5, c2: '#ff3cac' })] },
  { id: 'concert', name: 'Concert Stage', re: /\b(concert|stage|rock ?show|festival|theat(er|re)|music hall|talent show|performance)\b/,
    ground: 'wood', sky: 'night', weather: 'none', accent: '#ff3cac', floorColor: '#2a2024',
    floor: [oval(50, 60, 44, 70, { stroke: '#ffd23f', lw: 0.8 }), oval(50, 60, 24, 40, { stroke: '#ff3cac', lw: 0.6 }), ...[0, 1, 2].map((i) => oval(20 + i * 30, 36, 8, 14, { fill: ['#ff3cac', '#2fe0ff', '#ffd23f'][i], alpha: 0.5 })), noise(0.3)],
    objects: [o('stage', 0, -20, { w: 40, h: 1.6, d: 9, c: '#1c1820', c2: '#ffd23f', txt: 'LIVE' }), ...sides('cylinder', 20, -22, 2, 6, { r: 0.5, h: 14, c: '#333' }), ...sides('banner', 28, -16, 1, 0, { w: 4, h: 7, y: 3, txt: 'ROCK', c: '#d8322a', c2: '#fff' }), row('chair', -22, -8, 12, 3.6, { c: '#3a3a42' }), ...sides('lamp', 25, -6, 2, 5, { h: 8, c2: '#ff3cac' })] },
  { id: 'medieval', name: 'Kingdom Castle', re: /\b(castle|medieval|kingdom|knight'?s? (castle|arena|tournament)|fortress|king'?s|joust|tournament|dragon'?s? lair|ruins|ancient ruins)\b/,
    ground: 'stone', sky: 'day', weather: 'none', accent: '#c8302a', floorColor: '#8b8680',
    floor: [oval(50, 60, 46, 70, { stroke: '#4a4640', lw: 0.8 }), ...[0, 1, 2, 3].map((i) => line(10 + i * 25, 20, 10 + i * 25, 95, '#6a665f', 0.3)), noise(0.6)],
    objects: [o('landmark', 0, -42, { k: 'castle', c: '#9a958c', c2: '#7a2a2a', s: 1 }), o('wall', 0, -22, { w: 56, h: 5, d: 1.8, c: '#8f8a80' }), ...sides('flagpole', 17, -10, 2, 5, { h: 9, flag: { bands: [B('#a01820'), B('#f4c542')], dir: 'v' } }), ...sides('banner', 26, -12, 1, 0, { w: 3, h: 6, y: 3, c: '#a01820', c2: '#f4c542', txt: '' }), ...sides('tree', 30, -16, 2, 6, { h: 6, c: '#4c8a3a' }), row('rock', -12, -7, 2, 24, { r: 0.9, c: '#7d776f' })] },
  { id: 'cave', name: 'Crystal Cave', re: /\b(cave|cavern|mine|crystal (cave|mine)|grotto|underground|dungeon|catacombs?)\b/,
    ground: 'stone', sky: 'night', weather: 'none', accent: '#9b4dff', floorColor: '#3a3640',
    floor: [oval(50, 60, 44, 70, { stroke: '#9b4dff', lw: 0.6, alpha: 0.8 }), noise(0.4)],
    objects: [row('cone', -48, -34, 9, 12, { r: 5, h: 14, c: '#3b3744' }), ...sides('cone', 16, -8, 5, 5, { r: 0.7, h: 4.5, c: '#9b4dff', dz: -2 }), ...sides('cone', 22, -6, 3, 6, { r: 0.5, h: 3, c: '#2fe0ff', dz: -2 }), ...sides('rock', 14, -4, 3, 4, { r: 1.2, c: '#524c5c' }), ...sides('lamp', 12, -9, 2, 6, { h: 3, c2: '#ffb347' })] },
  { id: 'school', name: 'Classroom', re: /\b(class ?room|school|lecture hall|university|college|principal'?s office)\b/,
    ground: 'wood', sky: 'day', weather: 'none', accent: '#2f7fff', floorColor: '#b8905a',
    floor: [...[0, 1, 2, 3, 4, 5].map((i) => line(i * 20, 18, i * 20, 96, '#9a7440', 0.3)), oval(50, 60, 40, 64, { stroke: '#2f7fff', lw: 0.6, alpha: 0.7 })],
    objects: [o('wall', 0, -22, { w: 64, h: 7, d: 0.8, c: '#e8e2d0' }), o('sign', 0, -20, { w: 10, h: 4, txt: 'CLASS', c: '#1f4a35', c2: '#f4f0e6' }), ...sides('table', 16, -10, 3, 4.5, { w: 1.4, d: 0.8, c: '#a27a4a', dz: -1.5 }), ...sides('chair', 16, -11.5, 3, 4.5, { c: '#2f7fff', dz: -1.5 }), o('table', 0, -18, { w: 3, d: 1.2, c: '#6b4a2e' }), o('box', -26, -21, { w: 3, h: 6, d: 1.5, c: '#8a5a32' }), o('box', 26, -21, { w: 3, h: 6, d: 1.5, c: '#8a5a32' })] },
  { id: 'library', name: 'Library', re: /\b(library|bookshop|bookstore|study hall|archive|old study)\b/,
    ground: 'wood', sky: 'dawn', weather: 'none', accent: '#c8902a', floorColor: '#6a4a30',
    floor: [oval(50, 60, 42, 66, { stroke: '#c8902a', lw: 0.7 }), rect(30, 40, 40, 40, '#8a2a2a', { alpha: 0.5 }), noise(0.3)],
    objects: [o('wall', 0, -22, { w: 64, h: 9, d: 1, c: '#5a3a22' }), row('box', -28, -20.8, 10, 6, { w: 3.6, h: 8, d: 0.8, c: '#7a4a28' }), row('box', -28, -20.2, 10, 6, { w: 3.3, h: 0.6, d: 0.3, c: '#c8302a', y: 2 }), row('box', -28, -20.2, 10, 6, { w: 3.3, h: 0.6, d: 0.3, c: '#2f7fff', y: 4.5 }), ...sides('table', 18, -9, 2, 6, { w: 3, d: 1.2, c: '#6b4a2e' }), ...sides('chair', 18, -11, 2, 6, { c: '#4a2a1a' }), ...sides('lamp', 14, -6, 2, 9, { h: 3, c2: '#ffcf6a' })] },
  { id: 'house', name: 'Living Room', re: /\b(living ?room|house|home|kitchen|bedroom|apartment|garage|basement|mansion|office)\b/,
    ground: 'wood', sky: 'day', weather: 'none', accent: '#e8a030', floorColor: '#9a7048',
    floor: [rect(26, 36, 48, 46, '#b03a3a', { alpha: 0.85 }), frame(26, 36, 48, 46, '#f4c542', 0.5), oval(50, 59, 24, 36, { stroke: '#f4c542', lw: 0.4 }), ...[0, 1, 2, 3, 4, 5].map((i) => line(i * 20, 18, i * 20, 96, '#7a5632', 0.3))],
    objects: [o('wall', 0, -22, { w: 64, h: 8, d: 0.8, c: '#e8dcc0' }), o('box', 0, -20, { w: 7, h: 1.2, d: 2.6, c: '#5a6a8a' }), o('box', 0, -21, { w: 7, h: 1.2, d: 0.6, c: '#4a5a7a', y: 1.2 }), ...sides('box', 14, -14, 1, 0, { w: 3.5, h: 2.4, d: 1, c: '#6b4a2e' }), ...sides('table', 20, -8, 1, 0, { w: 2.2, d: 1.2, c: '#a27a4a' }), ...sides('lamp', 11, -20, 1, 0, { h: 3.4, c2: '#ffe3a0' }), ...sides('chair', 17, -12, 2, 4, { c: '#8a3a3a' }), o('banner', 20, -21, { w: 4, h: 3, y: 2.5, c: '#2f7fff', c2: '#fff', txt: '' })] },
  { id: 'graveyard', name: 'Graveyard', re: /\b(graveyard|cemetery|haunted|halloween|spooky|zombie (land|town)|crypt|horror|creepy|vampire)\b/,
    ground: 'grass', sky: 'night', weather: 'fog', accent: '#9b4dff', floorColor: '#2f4030',
    floor: [oval(50, 62, 40, 64, { stroke: '#58405e', lw: 0.6 }), noise(0.4)],
    objects: [...sides('box', 15, -7, 4, 4.5, { w: 1.1, h: 1.5, d: 0.35, c: '#7d8088', dz: -2.5 }), ...sides('cylinder', 20, -6, 3, 6, { r: 0.12, h: 2, c: '#6b6e76' }), ...sides('tree', 24, -14, 3, 7, { h: 8, c: '#2a2420' }), o('fence', -22, -4, { w: 14, c: '#222', c2: '#222' }), o('fence', 22, -4, { w: 14, c: '#222', c2: '#222' }), o('building', 0, -28, { w: 14, h: 9, d: 8, c: '#3a3640', c2: '#ffcf6a' }), o('tower', -14, -26, { r: 2, h: 14, c: '#3a3640', c2: '#241a38' }), ...sides('lamp', 12, -9, 2, 6, { h: 3, c2: '#9bff7a' })] },
  { id: 'circus', name: 'Circus', re: /\b(circus|carnival|fun ?fair|amusement park|theme park|clown town|funfair)\b/,
    ground: 'sand', sky: 'sunset', weather: 'none', accent: '#d8322a', floorColor: '#caa86a',
    floor: [oval(50, 60, 48, 76, { fill: '#d8322a', alpha: 0.5 }), oval(50, 60, 48, 76, { stroke: '#ffffff', lw: 1 }), oval(50, 60, 30, 48, { stroke: '#ffd23f', lw: 0.8 }), noise(0.3)],
    objects: [o('tent', 0, -26, { w: 20, h: 9, d: 14, c: '#d8322a', c2: '#ffffff' }), ...sides('tent', 24, -16, 2, 9, { w: 7, h: 4, d: 6, c: '#2f7fff', c2: '#ffd23f' }), ...sides('flagpole', 16, -12, 2, 6, { h: 8, flag: { bands: [B('#d8322a'), B('#ffffff'), B('#2f7fff')], dir: 'v' } }), ...sides('sphere', 28, -8, 3, 3, { r: 0.8, c: '#ff4fa8', y: 1.4 }), o('sign', -16, -8, { w: 4, h: 1.6, txt: 'CIRCUS', c: '#ffd23f', c2: '#d8322a' })] },
  { id: 'sea', name: 'Underwater', re: /\b(underwater|under the sea|ocean floor|sea ?bed|aquarium|coral reef|reef|atlantis|deep sea)\b/,
    ground: 'sand', sky: 'dawn', weather: 'none', accent: '#2fe0ff', floorColor: '#c8b888',
    floor: [oval(50, 60, 44, 70, { stroke: '#2fe0ff', lw: 0.5, alpha: 0.6 }), ...[0, 1, 2, 3, 4].map((i) => oval(10 + i * 20, 30 + (i % 2) * 40, 12, 8, { fill: '#e8d8a0', alpha: 0.4 })), noise(0.6)],
    objects: [...sides('cone', 16, -8, 4, 4, { r: 0.7, h: 3.2, c: '#ff6a8a', dz: -2 }), ...sides('cone', 22, -6, 3, 5, { r: 0.6, h: 2.6, c: '#ffb347', dz: -2 }), ...sides('cylinder', 14, -5, 3, 3, { r: 0.12, h: 4, c: '#2fa85a', dz: -3 }), ...sides('rock', 26, -10, 3, 6, { r: 1.6, c: '#6a7a8a' }), o('dome', 0, -30, { r: 12, c: '#2f8ac8' }), row('sphere', -20, -12, 6, 7, { r: 0.35, y: 5, c: '#d8f4ff' })] },
  { id: 'mountain', name: 'Mountain Top', re: /\b(mountains?|summit|peak|himalayas?|alps|cliffs?|highlands?|everest|hilltop|hills?)\b/,
    ground: 'stone', sky: 'dawn', weather: 'none', accent: '#c8d8e8', floorColor: '#8a8a86',
    floor: [oval(50, 62, 46, 74, { stroke: '#e8e8e8', lw: 0.5, alpha: 0.8 }), noise(0.7)],
    objects: [row('cone', -56, -44, 8, 14, { r: 11, h: 26, c: '#7a8490' }), row('cone', -50, -54, 7, 16, { r: 12, h: 36, c: '#e0e6ee' }), ...sides('pine', 18, -9, 3, 5, { h: 6, c: '#2f5a3a' }), ...sides('rock', 14, -4, 3, 7, { r: 1.3, c: '#6f7378' }), o('flagpole', 24, -12, { h: 8, flag: { bands: [B('#d8322a')] } })] },
];

// ── time and weather words ──────────────────────────────────────────────────────────────
const MODS = [
  [/\b(night|midnight|dark|evening|moonlit|moonlight)\b/, { sky: 'night' }],
  [/\b(sunset|sundown|golden hour|dusk)\b/, { sky: 'sunset' }],
  [/\b(dawn|sunrise|morning|misty)\b/, { sky: 'dawn' }],
  [/\b(storm|stormy|thunder|lightning|cloudy|grey sky|gray sky)\b/, { sky: 'storm' }],
  [/\b(sunny|bright day|noon|daytime|midday|clear sky)\b/, { sky: 'day' }],
  [/\b(in space|outer space)\b/, { sky: 'space' }],
  [/\b(rain|raining|rainy|wet)\b/, { weather: 'rain' }],
  [/\b(snowing|snowfall|snow falling|blizzard|snowy|snow)\b/, { weather: 'snow' }],
  [/\b(embers|ash|sparks|burning)\b/, { weather: 'embers' }],
  [/\b(autumn|fall leaves|falling leaves|leaves)\b/, { weather: 'leaves' }],
  [/\b(fog|foggy|haze|hazy|mist)\b/, { weather: 'fog' }],
  [/\b(clear weather|no weather)\b/, { weather: 'none' }],
];
const COLORS = { red: '#e0233a', blue: '#2f7fff', green: '#22c55e', yellow: '#ffd23f', orange: '#ff8a2a', purple: '#9b4dff', pink: '#ff4fa8', cyan: '#2fe0ff', white: '#ffffff', gold: '#f4c542', black: '#222222', brown: '#8a5a32', grey: '#8d9199', gray: '#8d9199' };
const colorOf = (t) => { const k = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t)); return k ? COLORS[k] : null; };
function mods(t) { const m = {}; for (const [re, p] of MODS) if (re.test(t)) for (const k in p) if (!m[k]) m[k] = p[k]; return m; }

// ── what to draw for a kind of prop, when only the ground and props were understood ──────────
const PROP_OBJ = {
  trees: (A) => sides('tree', 15, -8, 5, 5, { h: 7, c: '#3f7a30', dz: -2.5 }), pines: () => sides('pine', 15, -8, 5, 5, { h: 7, c: '#2f5a3a', dz: -2.5 }), palms: () => sides('palm', 15, -8, 4, 5, { h: 8, c: '#3f8a3a', dz: -2.5 }),
  rocks: () => sides('rock', 15, -7, 4, 5, { r: 1.2, c: '#7d776f', dz: -2 }), mountains: () => [row('cone', -56, -44, 8, 14, { r: 11, h: 26, c: '#6f7a86' })],
  buildings: () => sides('building', 22, -24, 3, 12, { w: 10, h: 18, d: 9, c: '#9aa3ad', c2: '#cfe3f2' }), neon: () => [o('sign', -16, -9, { w: 5, h: 1.6, txt: 'NEON', c: '#ff3cac', c2: '#fff' }), o('sign', 16, -9, { w: 5, h: 1.6, txt: 'OPEN', c: '#2fe0ff', c2: '#111' })],
  lamps: () => sides('lamp', 13, -5, 4, 9, { h: 4.5, c2: '#fff1c0' }), crates: () => sides('crate', 15, -6, 4, 1.4, { c: '#a27a4a' }), pillars: () => sides('cylinder', 15, -8, 4, 6, { r: 0.55, h: 5, c: '#d8d0c0' }),
  cactus: () => sides('cylinder', 15, -8, 3, 6, { r: 0.4, h: 2.6, c: '#3f8a4a' }), lanterns: () => sides('lamp', 12, -6, 4, 7, { h: 3, c2: '#ff5a3a' }),
  torii: () => [o('box', -7, -14, { w: 0.9, h: 7, d: 0.9, c: '#c8202a' }), o('box', 7, -14, { w: 0.9, h: 7, d: 0.9, c: '#c8202a' }), o('box', 0, -14, { w: 16.5, h: 0.9, d: 1.2, c: '#1b1b1b', y: 7 })],
  crystals: (A) => sides('cone', 16, -8, 4, 5, { r: 0.6, h: 4, c: A || '#9b4dff', dz: -2 }),
};

// The fight camera sees about 0.58 * (11 - z) metres to each side at depth z: a row of trees at x 20 right behind the fighters
// is off screen. Pull near things in so they can be seen (big far-back landmarks are left alone).
const KEEP = ['landmark', 'building', 'wall', 'tower', 'stage', 'dome'];
export function fitView(objs) {
  return objs.map((x) => {
    if (KEEP.includes(x.t) && x.z <= -20 || x.z <= -26) return x;
    const hw = 0.58 * (11 - x.z) * 0.9, n = x.n || 1, dx = x.dx ?? 1, sg = x.x < 0 ? -1 : 1;
    let x0 = x.x, d = dx;
    if (Math.abs(x0) > hw) x0 = sg * hw * 0.85;
    const last = x0 + (n - 1) * d;
    if (n > 1 && Math.abs(last) > hw && Math.sign(d) === sg) d = sg * Math.max(0.6, (hw - Math.abs(x0)) / (n - 1));
    return { ...x, x: x0, dx: d };
  });
}

// ── the whole thing: words → an arena ──────────────────────────────────────────────────────
// Returns { name, ground, sky, weather, accent, props, scene, matched, left } (matched: what was understood, left: not)
const STOP = /^(a|an|the|with|and|at|in|on|of|some|lots|lot|full|very|big|small|place|arena|my|me|i|want|make|build|please|like|that|is|it|to|for|has|have|get|give|set|add|more|really|just|where|there|near|by|from|into|inside|around|huge|giant|large|tiny|a few)$/;
function fresh(text, nameHint) {
  const t = String(text || '').toLowerCase();
  const flagKey = /\bflags?\b/.test(t) ? Object.keys(FLAGS).find((k) => FLAGS[k].re.test(t)) : null;
  const m = mods(t), accentWord = colorOf(t), matched = [];
  let base;
  if (flagKey) { base = flagArena(flagKey, m); matched.push(`${FLAGS[flagKey].name} flag`); }
  else {
    const hits = PLACES.filter((p) => p.re.test(t));
    // the place named first in the words is the main one; a second place only adds its sky/ground if the first has none
    hits.sort((a, b) => t.search(a.re) - t.search(b.re));
    if (hits.length) {
      const p = hits[0];
      base = { name: p.name, ground: p.ground, sky: p.sky, weather: p.weather, accent: p.accent, floorColor: p.floorColor, floor: [...p.floor], objects: [...p.objects] };
      matched.push(p.name.toLowerCase());
    }
  }
  if (!base) {
    // not a known place: build it from the kinds of things the words do mention (snow, ice, city, temple, trees...)
    const d = describeArena(t), hit = describeArenaHits(d);
    const G = GROUNDS[d.ground] || GROUNDS.concrete, objs = [];
    for (const pr of d.props) if (PROP_OBJ[pr]) objs.push(...PROP_OBJ[pr](accentWord));
    base = { name: d.name, ground: d.ground, sky: d.sky, weather: d.weather, accent: d.accent, floorColor: G.color, floor: [oval(50, 62, 44, 70, { stroke: accentWord || d.accent, lw: 0.7 }), noise(0.5)], objects: objs, guess: !hit.length };
    matched.push(...hit);
  }
  const out = { ...base, sky: m.sky || base.sky, weather: m.weather || base.weather };
  if (m.sky) matched.push(SKIES[m.sky].label.toLowerCase());
  if (m.weather && m.weather !== 'none') matched.push(WEATHER[m.weather].toLowerCase());
  if (accentWord) { out.accent = accentWord; matched.push('colour'); }
  // a floor colour: "a red floor" / "black floor"
  const fc = /\b(red|blue|green|yellow|orange|purple|pink|cyan|white|gold|black|brown|grey|gray)\b (floor|ground)/.exec(t);
  if (fc) { out.floorColor = COLORS[fc[1]]; matched.push(`${fc[1]} floor`); }
  const words = t.replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.test(w));
  const left = out.guess ? words.filter((w) => w.length > 3).slice(0, 4) : [];
  if (nameHint) out.name = nameHint;
  out.name = String(out.name).slice(0, 24);
  out.props = [];
  out.scene = { floorColor: out.floorColor, floor: out.floor, objects: fitView(out.objects) };
  return { name: out.name, ground: out.ground, sky: out.sky, weather: out.weather, accent: out.accent, props: [], scene: out.scene, matched, left, guess: !!out.guess };
}
// which kinds of things the keyword builder found in the words (none = it only has its defaults)
function describeArenaHits(d) {
  const out = [];
  if (d.ground !== 'concrete') out.push(GROUNDS[d.ground].label.toLowerCase());
  if (d.props.join() !== 'rocks,trees') out.push(...d.props);
  return out;
}
export const libraryArena = (text, nameHint) => fresh(text, nameHint);
export function arenaUnderstands(text) { const r = fresh(text); return !r.guess; }

// ── changing an arena that's already built ("more trees", "the castle is too small", "make the floor darker") ──
const THINGS = [
  [/\b(trees?)\b/, ['tree'], () => ({ t: 'tree', h: 7, c: '#4c8a3a' })], [/\b(pines?|pine trees?|fir)\b/, ['pine'], () => ({ t: 'pine', h: 7, c: '#2f5a3a' })], [/\b(palms?|palm trees?)\b/, ['palm'], () => ({ t: 'palm', h: 8, c: '#3f8a3a' })],
  [/\b(rocks?|stones?|boulders?)\b/, ['rock'], () => ({ t: 'rock', r: 1.1, c: '#7d776f' })], [/\b(bush(es)?|hedges?)\b/, ['bush'], () => ({ t: 'bush', r: 0.9, c: '#2f6a2a' })],
  [/\b(lamps?|lights?|street ?lights?|lanterns?|torch(es)?)\b/, ['lamp'], () => ({ t: 'lamp', h: 4.5, c2: '#fff1c0' })], [/\b(chairs?|seats?)\b/, ['chair'], () => ({ t: 'chair', c: '#3a3a42' })],
  [/\b(benches|bench)\b/, ['bench'], () => ({ t: 'bench', w: 2, c: '#6b4a2e', c2: '#3a2a1a' })], [/\b(tables?|desks?)\b/, ['table'], () => ({ t: 'table', w: 2, d: 1, c: '#a27a4a' })],
  [/\b(crates?|boxes|barrels?)\b/, ['crate'], () => ({ t: 'crate', c: '#a27a4a' })], [/\b(fences?)\b/, ['fence'], () => ({ t: 'fence', w: 10, c: '#8a6a3a', c2: '#6a4a2a' })],
  [/\b(flags?|flagpoles?)\b/, ['flagpole'], () => ({ t: 'flagpole', h: 9, flag: { bands: [{ c: '#d8322a', w: 1 }, { c: '#ffffff', w: 1 }, { c: '#2f7fff', w: 1 }], dir: 'v', emblem: 'none', emblemColor: '#fff', emblemSize: 0.4 } })],
  [/\b(banners?)\b/, ['banner'], () => ({ t: 'banner', w: 3, h: 5, y: 2, c: '#a01820', c2: '#f4c542' })], [/\b(tents?)\b/, ['tent'], () => ({ t: 'tent', w: 6, h: 3, d: 6, c: '#d8322a', c2: '#d8322a' })],
  [/\b(buildings?|houses?|skyscrapers?)\b/, ['building'], () => ({ t: 'building', w: 10, h: 16, d: 9, c: '#9aa3ad', c2: '#cfe3f2' })], [/\b(towers?)\b/, ['tower'], () => ({ t: 'tower', r: 2.4, h: 16, c: '#8f8a80', c2: '#7a2a2a' })],
  [/\b(walls?)\b/, ['wall'], () => ({ t: 'wall', w: 30, h: 4, d: 1.5, c: '#8f8a80' })], [/\b(pillars?|columns?)\b/, ['cylinder'], () => ({ t: 'cylinder', r: 0.55, h: 5, c: '#d8d0c0' })],
  [/\b(signs?)\b/, ['sign'], () => ({ t: 'sign', w: 4, h: 1.4, txt: 'FIGHT', c: '#d8322a', c2: '#ffffff' })], [/\b(mountains?|hills?)\b/, ['cone'], () => ({ t: 'cone', r: 9, h: 16, c: '#6f7a86' })],
];
const LANDMARK_WORDS = /\b(castle|tower|skyscraper|eiffel|pyramids?|pagoda|lighthouse|windmill|planet|colosseum|ship|igloo|stonehenge|bridge|volcano|landmark|building in the back)\b/;
const shadeHex = (c, f) => { const n = parseInt(c.slice(1), 16); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join(''); };
export function tweakArena(cfg, text) {
  const t = String(text || '').toLowerCase(), sc = JSON.parse(JSON.stringify(cfg.scene || { floorColor: '', floor: [], objects: [] }));
  const out = { ...cfg }, said = [];
  const m = mods(t);
  if (m.sky) { out.sky = m.sky; said.push(`it is ${SKIES[m.sky].label.toLowerCase()} now`); }
  if (m.weather) { out.weather = m.weather; said.push(m.weather === 'none' ? 'the weather is clear' : `${WEATHER[m.weather].toLowerCase()} added`); }
  const color = colorOf(t);
  const thing = THINGS.find(([re]) => re.test(t));
  const lm = LANDMARK_WORDS.exec(t);
  const want = (re) => re.test(t);
  const matchObj = (x) => (thing ? thing[1].includes(x.t) : lm ? ['landmark', 'tower', 'building'].includes(x.t) : true);
  // the floor
  if (/\b(floor|ground)\b/.test(t)) {
    if (/\b(dark(er)?|black(er)?)\b/.test(t)) { sc.floorColor = shadeHex(sc.floorColor || '#9a9a9a', 0.65); said.push('the floor is darker'); }
    else if (/\b(light(er)?|bright(er)?)\b/.test(t)) { sc.floorColor = shadeHex(sc.floorColor || '#9a9a9a', 1.35); said.push('the floor is lighter'); }
    if (color && !thing) { sc.floorColor = color; said.push('the floor changed colour'); }
  }
  // removing / adding / sizes / places
  if (want(/\b(remove|delete|get rid of|no more|without|take away|less|fewer)\b/) && (thing || lm)) {
    const before = sc.objects.length;
    if (want(/\b(less|fewer)\b/)) sc.objects = sc.objects.map((x) => (matchObj(x) && x.n > 1 ? { ...x, n: Math.max(1, Math.ceil(x.n / 2)) } : x));
    else sc.objects = sc.objects.filter((x) => !matchObj(x));
    if (sc.objects.length !== before || want(/\b(less|fewer)\b/)) said.push(want(/\b(less|fewer)\b/) ? 'fewer of them' : 'removed');
  } else if (want(/\b(add|more|another|extra|some|put|plus|with|lots of|many)\b/) && thing) {
    const k = want(/\b(lots|many|loads)\b/) ? 10 : 6;
    if (sc.objects.length >= 38) said.push('the arena is full, remove something first');
    else {
      const make = thing[2](), c = color || make.c;
      if (color && make.c) make.c = color;
      sc.objects.push(...fitView([row(make.t, -9, -6, Math.ceil(k / 2), -4.5, { ...make, dz: -1.4 }), row(make.t, 9, -6, Math.ceil(k / 2), 4.5, { ...make, dz: -1.4 })]));
      said.push(`added more ${thing[1][0]}s`);
    }
  } else if (want(/\b(bigger|larger|taller|huge|giant|grow|enlarge|too small|smaller|shorter|tiny|too big|shrink|too large)\b/) && (thing || lm)) {
    const f = want(/\b(smaller|shorter|tiny|too big|shrink|too large)\b/) ? 0.75 : 1.35;
    sc.objects = sc.objects.map((x) => (matchObj(x) ? { ...x, s: Math.min(8, Math.max(0.2, (x.s || 1) * f)) } : x));
    said.push(f > 1 ? 'made it bigger' : 'made it smaller');
  } else if (want(/\b(closer|nearer|forward)\b/)) { sc.objects = sc.objects.map((x) => (matchObj(x) && x.z < -6 ? { ...x, z: Math.min(-5, x.z + 8) } : x)); said.push('moved closer'); }
  else if (want(/\b(farther|further|back|away)\b/) && (thing || lm)) { sc.objects = sc.objects.map((x) => (matchObj(x) ? { ...x, z: Math.max(-70, x.z - 8) } : x)); said.push('moved farther back'); }
  else if (color && (thing || lm)) { sc.objects = sc.objects.map((x) => (matchObj(x) ? { ...x, c: color, c2: x.t === 'lamp' ? color : x.c2 } : x)); said.push('changed the colour'); }
  else if (color && !thing && !/\b(floor|ground)\b/.test(t)) { out.accent = color; said.push('changed the ring colour'); }
  out.scene = sc;
  return { cfg: out, said };
}

// ── the list shown in the arena designer: tap one to write it in the description ────────────
const g = (title, note, items) => ({ title, note, items: items.map(([name, also, say]) => ({ name, also, say: say || name.toLowerCase() })) });
export const ARENA_LIST = [
  g('Famous places', 'Real landmarks, built so you can tell what they are.', [
    ['Wizard castle', 'hogwarts, magic school', 'a wizard castle at night'], ['Hero tower', 'avengers tower, marvel, new york', 'the avengers tower at sunset'], ['Paris', 'eiffel tower', 'paris with the eiffel tower'], ['Pyramids', 'egypt, sphinx, pharaoh', 'the egyptian pyramids'],
    ['Colosseum', 'rome, gladiators', 'a roman colosseum'], ['Japanese dojo', 'pagoda, samurai, temple', 'a japanese dojo with a pagoda'], ['Lighthouse', 'harbour, pier, coast', 'a lighthouse by the sea at sunset'], ['Windmill farm', 'barn, ranch, countryside', 'a farm with a windmill'],
    ['Stonehenge', 'stone circle, druids', 'stonehenge in the fog'], ['Golden bridge', 'golden gate, san francisco', 'a golden gate bridge'], ['Kingdom castle', 'medieval, fortress, ruins', 'a medieval castle'],
  ]),
  g('Nature', 'Ground, plants and weather to match.', [
    ['Forest', 'jungle, woods, meadow, park', 'a forest'], ['Beach', 'island, tropical, caribbean', 'a tropical beach at sunset'], ['Desert', 'wild west, canyon, saloon', 'a wild west desert'], ['Mountain top', 'summit, cliffs, alps', 'a mountain top at dawn'],
    ['Arctic village', 'igloo, north pole, polar', 'an arctic village in the snow'], ['Volcano', 'lava, inferno, hell', 'a volcano with lava'], ['Crystal cave', 'cavern, mine, dungeon', 'a crystal cave'], ['Underwater', 'coral reef, aquarium, atlantis', 'under the sea'],
  ]),
  g('Cities and buildings', '', [
    ['City street', 'downtown, town, skyline', 'a city street'], ['Rooftop', 'helipad, penthouse', 'a rooftop at sunset'], ['Neon city', 'cyberpunk, arcade, club', 'a neon cyberpunk city in the rain'], ['Market', 'bazaar, souk', 'a busy market'],
    ['Army base', 'parade, barracks, fort', 'an army base'], ['Classroom', 'school, university', 'a classroom'], ['Library', 'bookshop, archive', 'an old library'], ['Living room', 'house, kitchen, garage, office', 'a living room'],
  ]),
  g('Sport and shows', '', [
    ['Boxing ring', 'wrestling, mma, octagon', 'a boxing ring'], ['Stadium', 'football, soccer, basketball, tennis', 'a football stadium'], ['Concert stage', 'festival, theatre', 'a concert stage'], ['Circus', 'carnival, funfair, theme park', 'a circus'], ['Pirate ship', 'galleon, ship deck', 'a pirate ship at sunset'], ['Space station', 'moon, mars, planet', 'a space station'], ['Graveyard', 'haunted, halloween, spooky', 'a haunted graveyard at night'],
  ]),
  g('Country flags', 'The flag is painted on the floor and flies on poles. Say "the ___ flag".', [
    ['USA', 'american', 'the american flag'], ['Britain', 'uk, england', 'the british flag'], ['France', 'french', 'the french flag'], ['Germany', 'german', 'the german flag'], ['Italy', 'italian', 'the italian flag'], ['Spain', 'spanish', 'the spanish flag'], ['Israel', 'israeli', 'the israeli flag'],
    ['Japan', 'japanese', 'the japanese flag'], ['Brazil', 'brazilian', 'the brazilian flag'], ['Mexico', 'mexican', 'the mexican flag'], ['Canada', 'canadian', 'the canadian flag'], ['China', 'chinese', 'the chinese flag'], ['India', 'indian', 'the indian flag'], ['Ireland', 'irish', 'the irish flag'], ['Netherlands', 'dutch, holland', 'the dutch flag'],
    ['Sweden', 'swedish', 'the swedish flag'], ['Poland', 'polish', 'the polish flag'], ['Ukraine', 'ukrainian', 'the ukrainian flag'], ['Russia', 'russian', 'the russian flag'], ['Turkey', 'turkish', 'the turkish flag'], ['Argentina', 'argentinian', 'the argentinian flag'],
  ]),
  g('Time, weather and colour', 'Add any of these to any place.', [
    ['Night', 'midnight, dark, moonlit', 'a forest at night'], ['Sunset', 'dusk, golden hour', 'a city at sunset'], ['Dawn', 'sunrise, morning', 'a beach at dawn'], ['Storm', 'thunder, cloudy', 'a castle in a storm'], ['Rain', 'rainy, wet', 'a city street in the rain'],
    ['Snow', 'snowing, blizzard', 'a forest with snow falling'], ['Fog', 'misty, hazy', 'a graveyard in thick fog'], ['Embers', 'burning, sparks', 'a dojo with embers'], ['Falling leaves', 'autumn', 'a park in autumn'], ['A colour', 'red, blue, gold... (the ring), "a red floor"', 'a blue stadium with a red floor'],
  ]),
];
