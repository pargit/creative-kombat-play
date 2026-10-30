// Frame data for every attack, at 60 logic frames per second.
// startup → active (can hit) → recovery. Ranges are in metres from the body centre.

// Design rules (like real fighting games):
//  • Every attack is unsafe on block: the defender recovers first and can punish.
//  • Whiffing leaves you open, so mashing loses to blocking.
//  • Strings: up to 4 hits, any mix of punch and kick; each hit must connect to go on.
//    Hits 1–3 are quick strikes; the 4th is a finisher picked by the whole string (FINISHERS).
//    Every string that ends in a kick launches them into the air: jump (hold up) to follow
//    them up and keep hitting (up to AIR.hits air hits). Tapping block at the right moment
//    while in the air is an AIR COUNTER that knocks the attacker down.
//  • Hitting someone during their attack startup is a COUNTER (more damage + stun).
//  • Low kick: a crouching spin-sweep. While it's low, high attacks (punches) pass over you.
// Ranges are how far (metres, for an average 175 cm fighter) a hit reaches past the body
// centre; they scale with height. The animations step/lean in so the fist or foot visibly
// gets there.
export const MOVES = {
  punch: {
    anim: 'punch', startup: 5, active: 3, recovery: 10,
    damage: 3, range: 1.3, height: [0.6, 2.2], hitstun: 16, blockstun: 6, push: 0.04, high: true,
  },
  // the 2nd and 3rd hits of a string (they slide in to stay in reach)
  punch2: {
    anim: 'cross', startup: 5, active: 3, recovery: 12,
    damage: 3, range: 1.35, height: [0.6, 2.2], hitstun: 18, blockstun: 6, push: 0.04, high: true, stepIn: true,
  },
  kick: {
    anim: 'kick', startup: 8, active: 4, recovery: 16,
    damage: 4, range: 1.45, height: [0.2, 1.6], hitstun: 20, blockstun: 8, push: 0.08,
  },
  kick2: {
    anim: 'kick', startup: 7, active: 4, recovery: 16,
    damage: 3, range: 1.45, height: [0.2, 1.6], hitstun: 21, blockstun: 8, push: 0.06, stepIn: true,
  },
  // down + kick: crouching spin-sweep; low profile makes punches whiff over it
  lowKick: {
    anim: 'lowKick', startup: 8, active: 6, recovery: 18,
    damage: 4, range: 1.4, height: [0, 0.7], hitstun: 20, blockstun: 8, push: 0.12,
    knockdown: true, launch: 0.06, lowProfile: true,
  },
  // punch out of a forward dash: comes out almost instantly, carries the dash momentum and
  // starts a string (counts as a punch)
  dashPunch: {
    anim: 'punch', startup: 2, active: 4, recovery: 12,
    damage: 4, range: 1.45, height: [0.6, 2.2], hitstun: 18, blockstun: 6, push: 0.04, high: true,
    lunge: true,
  },
  // punch + kick together: a grab that goes through blocks; slow to come out and very
  // punishable if it misses, so a quick punch beats it
  grab: {
    anim: 'grab', startup: 7, active: 3, recovery: 28,
    damage: 5, range: 0.95, height: [0, 2.2], hitstun: 0, blockstun: 0, push: 0.22,
    knockdown: true, launch: 0.12, grab: true,
  },
  // jumping attacks (one per jump; against a launched opponent they chain, see AIR)
  airKick: {
    anim: 'airKick', startup: 4, active: 14, recovery: 3,
    damage: 4, range: 1.3, height: [-0.4, 1.9], hitstun: 18, blockstun: 12, push: 0.16, air: true,
  },
  airPunch: {
    anim: 'airPunch', startup: 3, active: 8, recovery: 4,
    damage: 3, range: 1.3, height: [-0.6, 1.9], hitstun: 16, blockstun: 10, push: 0.06, air: true, high: true,
  },
};

// The 4th hit of a string, by the buttons pressed (P = punch, K = kick).
// Punch enders knock down / daze on the ground; kick enders launch them into the air.
const fin = (name, o) => ({ startup: 7, active: 4, recovery: 22, range: 1.45, height: [0.2, 2.2], hitstun: 24,
  blockstun: 10, push: 0.06, stepIn: true, finisher: name, ...o });
const lift = (name, launch, o) => fin(name, { damage: 6, launcher: true, launch, push: 0.03, recovery: 26, ...o });
export const FINISHERS = {
  PPPP: fin('HAMMER FIST', { anim: 'hammer', damage: 7, knockdown: true, launch: 0.05, high: true }),
  KPPP: fin('HAYMAKER', { anim: 'haymaker', startup: 9, damage: 7, knockdown: true, push: 0.3, launch: 0.1, high: true }),
  PKPP: fin('GUT PUNCH', { anim: 'gut', damage: 6, daze: 34 }),
  KKPP: fin('SPINNING BACKFIST', { anim: 'backfist', startup: 9, damage: 7, knockdown: true, push: 0.2, launch: 0.08, high: true }),
  PPKP: fin('ELBOW SMASH', { anim: 'elbow', damage: 7, knockdown: true, launch: 0.07, downFor: 56, range: 1.25, high: true }),
  KPKP: fin('THROW', { anim: 'grab', damage: 7, knockdown: true, push: 0.26, launch: 0.15, range: 1.25 }),
  PKKP: fin('HEADBUTT', { anim: 'headbutt', damage: 6, daze: 46, range: 1.2, high: true }),
  KKKP: fin('DOUBLE PALM', { anim: 'palm', damage: 7, push: 0.4, hitstun: 32 }),
  PPPK: lift('RISING KNEE', 0.24, { anim: 'knee', range: 1.25 }),
  KPPK: lift('LAUNCH KICK', 0.25, { anim: 'highKick' }),
  PKPK: lift('FLIP KICK', 0.26, { anim: 'flipKick' }),
  KKPK: lift('ROUNDHOUSE', 0.23, { anim: 'roundhouse', damage: 7 }),
  PPKK: lift('CRESCENT KICK', 0.25, { anim: 'highKick' }),
  KPKK: lift('SCISSOR KICK', 0.25, { anim: 'flipKick' }),
  PKKK: lift('TORNADO KICK', 0.27, { anim: 'roundhouse' }),
  KKKK: lift('SKY KICK', 0.3, { anim: 'highKick', damage: 7 }),
};

// juggling a launched opponent: each air hit pops them back up; the last one spikes them down.
// counter: a fresh block tap this many frames before an air hit lands
export const AIR = { hits: 3, pop: 0.12, hover: 0.08, spike: -0.06, cancel: 26, counter: 10 };

// how long after a hit/block lands you can chain into the next move of a string
export const CHAIN_WINDOW = 14;
// presses made this many frames before you can act still come out (input buffer)
export const BUFFER_FRAMES = 10;
// the Nth consecutive hit always knocks down, ending the combo
export const COMBO_LIMIT = 8;
// double-tap forward/back: a quick dash
export const DASH = { tapWindow: 20, fwdFrames: 14, fwdSpeed: 0.21, backFrames: 12, backSpeed: 0.17 };
// combo breaker: double-tap back (even while being hit) to roll away, untouchable for most of it; every 5 s
// (on cooldown, double-tap back is a back dash)
export const ROLL = { frames: 24, invuln: 18, speed: 0.2, cooldown: 300, corner: 2.4 }; // 5 s cooldown; the last frames of a roll can be hit
// (less than ROLL.corner m of room behind you, the roll goes forward instead: under the
//  opponent to their other side, since a back roll would just stop at the wall)
// counter: tap block at most this many frames before a hit lands (a fresh tap, not held/mashed)
export const PARRY = { window: 8, mash: 24, stun: 30 }; // stun: the countered attacker is stuck for 0.5 s

// Specials share one shape; `type` in the roster picks which of these a fighter uses.
// Balance: every special that only deals damage does the same 25 (raised from 18 so a
// special clearly beats a grab's 10). Specials with an extra
// effect deal less, paying for it: Heavy Weight 20 (stun), Live Wire 25 (stun), Smoke 6 + 12 poison
// (blinds), Happy Bomb 18 (no attacking/blocking for 2 s), Cage 1.4 per ¼ s + 14 slam (traps),
// Cough 13 over 9 s (halves their damage), Golden 0 (3 s untouchable). Guitar Solo is 25 over 1.5 s (they hold their ears). Earthquake 18 + 4 s at half speed.
// Special damage ignores fighter power stats and combo scaling, so it's equal for everyone.
// Specials can't be blocked, dodged, rolled out of or cancelled: hits on the user do nothing
// until it has landed (except the power-ups, Golden and France). Two at once: first come, first served.
// specials that only power up their user: they don't hold up the other fighter's special
// (both can play at once)
export const SELF_SPECIALS = ['gold', 'france', 'night'];
export const SPECIALS = {
  projectile: {
    anim: 'throw', startup: 14, active: 1, recovery: 22,
    damage: 25, hitstun: 20, blockstun: 12, push: 0.15, projectile: { speed: 0.19, life: 110 },
  },
  dash: {
    anim: 'dash', startup: 8, active: 14, recovery: 18,
    damage: 25, range: 1.0, height: [0.3, 1.9], hitstun: 24, blockstun: 14, push: 0.3,
    dashSpeed: 0.24, knockdown: true,
  },
  uppercut: {
    anim: 'uppercut', startup: 5, active: 10, recovery: 26,
    damage: 25, range: 0.85, height: [0.4, 2.8], hitstun: 26, blockstun: 14, push: 0.12,
    rise: 0.19, knockdown: true, launch: 0.2,
  },
  slam: {
    anim: 'slam', startup: 10, active: 60, recovery: 20,
    damage: 25, range: 2.5, height: [-1, 0.8], hitstun: 26, blockstun: 14, push: 0.22,
    hop: 0.22, knockdown: true, onLanding: true,
  },
  // Guy Cohen: electric cable that ties the opponent up and shocks them (see lasso.js)
  lasso: {
    anim: 'throw', startup: 12, active: 1, recovery: 34,
    damage: 25, hitstun: 55, blockstun: 14, push: 0.1, shock: true,
    lasso: { speed: 0.34, range: 6.5 },
  },
  // Yali SMP: a wave of joy. Light damage, but the opponent is too happy to attack or
  // block for 2 seconds (they can still walk and jump). See joy.js.
  happiness: {
    anim: 'taunt', startup: 14, active: 1, recovery: 18,
    damage: 18, hitstun: 6, blockstun: 6, push: 0.05,
    joy: { range: 6.5, duration: 120 },
  },
  // Ziv: throws a weight; impact damage and knocked out (seeing stars) for a second
  weight: {
    anim: 'throw', startup: 14, active: 1, recovery: 8, // short, so Ziv can chase the dazed opponent
    damage: 20, hitstun: 20, blockstun: 12, push: 0, projectile: { speed: 0.21, life: 110 },
    daze: 60, // knocked silly for 1 s right where they stand: no knockback, so Ziv can follow up
  },
  // Karina: a smoke cloud — poison over 2 s, and the victim can't see her for 4 s (effects.js)
  smoke: {
    anim: 'smoke', startup: 44, active: 1, recovery: 26,
    damage: 6, hitstun: 12, blockstun: 6, push: 0.04, effect: 'smoke',
  },
  // Snir: shatters, pierces through the opponent and rebuilds on the other side
  shatter: {
    anim: 'dash', startup: 6, active: 200, recovery: 14,
    damage: 25, hitstun: 22, blockstun: 12, push: 0.15, effect: 'shatter',
  },
  // Ido Bohen: becomes a giant foot (his face on the big toe) and stomps
  foot: {
    anim: 'idle', startup: 6, active: 200, recovery: 10,
    damage: 25, hitstun: 26, blockstun: 12, push: 0.05, effect: 'foot',
  },
  // Yahli: a flag pole appears; human-flag spin around it, kicking 3 times
  flagpole: {
    anim: 'flag', startup: 6, active: 200, recovery: 12,
    damage: 25, hitstun: 30, blockstun: 12, push: 0.05, effect: 'flagpole',
  },
  // Asis: a cage around the opponent; hurts over time until they break out by mashing
  cage: {
    anim: 'throw', startup: 12, active: 1, recovery: 18,
    damage: 0, hitstun: 0, blockstun: 0, push: 0, effect: 'cage',
  },
  // Ofek: a 1.5 s guitar solo; the opponent holds their ears (can't act) and takes 18
  // Shirley: the map turns to night and she disappears: the opponent's punches and kicks miss for 7 s
  night: {
    anim: 'taunt', startup: 8, active: 1, recovery: 10,
    damage: 0, hitstun: 0, blockstun: 0, push: 0, effect: 'night', nightFrames: 420,
  },
  // Roni: her military dog tags on their chain as nunchucks: a crazy 7-hit combo
  nunchaku: {
    anim: 'dash', startup: 4, active: 600, recovery: 12, // active: the combo (the effect ends it)
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'nunchaku',
  },
  // Talel: his reflection in a mirror is a terrorist; he becomes it, stabs them, and is himself again
  mirror: {
    anim: 'idle', startup: 4, active: 600, recovery: 12, // active: the whole scene (the effect ends it)
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'mirror',
  },
  // Zohar: teaches you a lesson with a whip, three lashes (the last knocks them down)
  whip: {
    anim: 'whip', startup: 6, active: 600, recovery: 12, // active: the lashes (the effect ends it)
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'whip',
  },
  guitar: {
    anim: 'guitar', startup: 12, active: 90, recovery: 16,
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'guitar', deafFrames: 90,
  },
  // Netanel: plays the darbuka; the beat shakes the ground and the big last hit sends an
  // earthquake crack along the floor to the opponent: damage, and half speed for 4 s
  quake: {
    anim: 'darbuka', startup: 6, active: 60, recovery: 18,
    damage: 20, hitstun: 22, blockstun: 12, push: 0.06, effect: 'quake', slowFrames: 240,
  },
  // Ori Gold: turns to gold for 3 s; nothing can hurt him, not even specials (no damage)
  gold: {
    anim: 'gold', startup: 6, active: 1, recovery: 10,
    damage: 0, hitstun: 0, blockstun: 0, push: 0, effect: 'gold', goldFrames: 180,
  },
  // Haim: calls in a satellite on his walkie-talkie; it locks on and fires a barrage of 6 bolts
  satellite: {
    anim: 'radio', startup: 6, active: 600, recovery: 12, // active: the radio call (the effect ends it)
    damage: 25, hitstun: 26, blockstun: 12, push: 0.12, effect: 'satellite',
  },
  // Or Haim: summons his alter ego Hoshech Mavet from his shadow; a two-man combo (20) that
  // ends with Hoshech Mavet exploding (5). The effect runs the whole thing and ends the move.
  darkness: {
    anim: 'gold', startup: 8, active: 600, recovery: 12,
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'darkness',
  },
  // Oron: VIVA LA FRANCE: turns French for 8 s: a baguette (a bit more reach and damage on his
  // punches and kicks) and a French-flag aura
  france: {
    anim: 'gold', startup: 10, active: 1, recovery: 14,
    damage: 0, hitstun: 0, blockstun: 0, push: 0, effect: 'france', frenchFrames: 480,
  },
  // Michael: throws a computer that factory-resets the opponent: their buttons do each other's
  // jobs (a random mix, different every time) for resetFrames
  computer: {
    anim: 'throw', startup: 12, active: 1, recovery: 16,
    damage: 12, hitstun: 18, blockstun: 10, push: 0.1, effect: 'computer', resetFrames: 300,
  },
  // Minibar: turns into Kung Fu Panda, Wuxi finger hold, SKADOOSH (both go to the spirit world
  // for the rest of the round), then the Dragon Warrior's golden chi dragon. The effect runs it all.
  skadoosh: {
    anim: 'gold', startup: 8, active: 600, recovery: 12,
    damage: 25, hitstun: 0, blockstun: 0, push: 0, effect: 'skadoosh',
  },
  // Noa: a cough cloud; 1 damage per second for 9 s, and the victim deals half damage meanwhile
  // Linoy: calls a tiger that runs at the opponent, pounces and bites (effects.js)
  tiger: {
    anim: 'throw', startup: 14, active: 1, recovery: 20,
    damage: 25, hitstun: 24, blockstun: 12, push: 0.12, effect: 'tiger',
  },
  cough: {
    anim: 'cough', startup: 10, active: 80, recovery: 24, // active: the coughing fit (effects.js)
    damage: 1.5, hitstun: 8, blockstun: 6, push: 0.02, effect: 'cough', weakFrames: 540, poisonDmg: 2.25, // 1.5 + 8 × 2.25 = 19.5
  },
  teleport: {
    anim: 'teleport', startup: 16, active: 5, recovery: 16,
    damage: 25, range: 1.0, height: [0.3, 1.9], hitstun: 22, blockstun: 12, push: 0.2,
    knockdown: true, teleport: true,
  },
};

// Like classic fighting games, each fighter gets one special per round.
// The roster can override damage per fighter with special.damage.
export const SPECIALS_PER_ROUND = 1;

// player-made specials (custom.js): one move; its pose follows how it's delivered
const CUSTOM_ANIM = { projectile: 'throw', shot: 'throw', beam: 'throw', dash: 'dash', teleport: 'uppercut', sky: 'taunt', blast: 'gold', summon: 'throw', stomp: 'taunt', cage: 'throw', clones: 'gold', quake: 'slam' };
export function specialFor(def) {
  if (def.special?.type === 'custom') {
    return { anim: CUSTOM_ANIM[def.special.steps?.[0]?.kind || def.special.delivery] || 'throw', startup: 8, active: 600, recovery: 12, // (active: the effect ends it)
      damage: Math.min(25, Math.max(1, Number(def.special.damage) || 20)), hitstun: 20, blockstun: 12, push: 0.1, effect: 'custom' };
  }
  const base = SPECIALS[def.special?.type] || SPECIALS.projectile;
  const damage = def.special?.damage ?? base.damage;
  return { ...base, damage };
}

export const PHYS = {
  gravity: 0.0125,
  jumpVel: 0.25,
  walkSpeed: 0.075,
  arenaHalf: 8.5,
  bodyWidth: 0.3, // how far in front of the body centre a fighter can be hit
  bodyHeight: 1.9,
  minGap: 0.75,
};

export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
