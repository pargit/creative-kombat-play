// ─────────────────────────────────────────────────────────────────────────────
//  THE ROSTER — the two starter fighters (built in code), plus everyone the player
//  makes in CREATE (their own 3D models and specials: they're added at start, from
//  this device's storage: see creator.js).
//
//  A fighter: { id, name, heightCm, colors, build, stats, special, model? }
//  special: { type: 'custom', ...parts } (custom.js: the special builder's parts)
// ─────────────────────────────────────────────────────────────────────────────

export const GAME_TITLE = 'CREATIVE KOMBAT';
export const GAME_SUBTITLE = 'Make your own fighters';

// practice mode's training dummy: one of the simple code-built figures, in burlap with stitched
// eyes and a target on its chest (see ToyRig); it never moves on its own
export const DUMMY = {
  id: 'dummy',
  name: 'TRAINING DUMMY',
  tagline: 'Hit me',
  heightCm: 180,
  colors: { skin: '#d8b77f', hair: '#d8b77f', shirt: '#cfa86e', pants: '#bf9658', shoes: '#7a5530' },
  build: { height: 1.0, width: 1.18, head: 1.0 },
  stats: { speed: 1.0, power: 1.0, health: 100 },
  special: { type: 'uppercut', name: '—' },
  dummy: true,
  winQuote: '…',
};

export const ROSTER = [
  {
    id: 'stickman',
    builtIn: true,
    name: 'STICKMAN',
    tagline: 'Drawn to fight',
    heightCm: 178,
    colors: { skin: '#f4f4f4', hair: '#f4f4f4', shirt: '#1b1b1f', pants: '#1b1b1f', shoes: '#1b1b1f' },
    build: { height: 1.0, width: 0.5, head: 0.95 },
    stats: { speed: 1.05, power: 1.0, health: 100 },
    special: { type: 'custom', name: 'PENCIL VOLLEY', steps: [{ kind: 'shot', hits: 3, size: 1, speed: 1.3, shape: 'arrow' }], damage: 18, onHit: ['daze'], color: '#ffd23f', sound: 'whoosh', flash: false, shake: true },
    winQuote: 'Back to the drawing board.',
  },
  {
    id: 'redninja',
    builtIn: true,
    name: 'RED NINJA',
    tagline: 'Fast as fire',
    heightCm: 172,
    colors: { skin: '#e8b894', hair: '#7a0d12', shirt: '#c8161e', pants: '#8a0f14', shoes: '#1b1b1f' },
    build: { height: 1.0, width: 0.9, head: 1.0 },
    stats: { speed: 1.1, power: 1.0, health: 100 },
    special: { type: 'custom', name: 'FLAME DASH', steps: [{ kind: 'dash', hits: 1, size: 1.2, speed: 1 }, { kind: 'blast', hits: 1, size: 1, speed: 1 }], damage: 22, onHit: ['knockdown'], color: '#ff4a1a', sound: 'whoosh', flash: true, shake: true },
    winQuote: 'Too slow.',
  },
];

// Grey "?" tiles on the select screen (none: the CREATE button makes new fighters)
export const LOCKED_SLOTS = 0;

// Colors that rain down when someone wins a match.
export const CONFETTI_COLORS = ['#f4c542', '#ff3b4d', '#3fa9ff', '#ffffff', '#22c55e'];

// (kept so older code can import it; arenas are chosen per fight now: arenas.js)
export const STAGE = 'custom';
