// Fighting poses shared by every code-animated body (toy figures and auto-rigged models).
// Angles are radians for a figure facing +z with arms hanging down at rest; a negative
// shoulder/hip X swings the limb forward, a negative elbow / positive knee bends it.

export const JOINTS = ['spineX', 'spineY', 'neckX', 'neckY', 'lShX', 'lShZ', 'lEl', 'rShX', 'rShZ', 'rEl',
  'lHipX', 'lHipZ', 'lKnee', 'rHipX', 'rHipZ', 'rKnee', 'hipsY', 'rootTilt', 'rootLift', 'lunge', 'spin'];

// quick strikes: the body snaps into these poses instead of easing in
export const STRIKES = ['punch', 'kick', 'lowKick', 'grab', 'airKick', 'airPunch', 'throw', 'dash', 'uppercut', 'slam', 'teleport',
  'cross', 'hammer', 'haymaker', 'gut', 'backfist', 'elbow', 'headbutt', 'palm', 'knee', 'highKick', 'flipKick', 'roundhouse', 'stab', 'slash',
  'knifeHigh', 'knifeLow', 'knifeChop', 'knifeRise', 'knifeThrust', 'knifeJab', 'nunHigh', 'nunSide', 'nunLow', 'nunSpin', 'selfPunchL', 'selfPunchR'];

export const GUARD = {
  spineX: 0.08, spineY: 0.3, neckX: 0, neckY: -0.7,
  lShX: -1.0, lShZ: -0.15, lEl: -1.9, rShX: -0.75, rShZ: 0.15, rEl: -2.2,
  lHipX: -0.35, lHipZ: 0.1, lKnee: 0.45, rHipX: 0.35, rHipZ: -0.1, rKnee: 0.5,
  hipsY: -0.07, rootTilt: 0, rootLift: 0, lunge: 0, spin: 0,
};

export function pose(anim, t, ctx) {
  const p = { ...GUARD };
  const pt = ctx.pt ?? 0;
  const ph = ctx.phase;
  const breathe = Math.sin(t * 0.08) * 0.03;
  switch (anim) {
    case 'idle':
    case 'select':
      p.spineX += breathe; p.lEl += breathe * 2; p.rEl -= breathe * 2; p.hipsY += breathe * 0.6;
      break;
    case 'walk': {
      const s = Math.sin(t * 0.28) * (ctx.back ? -1 : 1);
      p.lHipX = -0.35 + s * 0.45; p.rHipX = 0.35 - s * 0.45;
      p.lKnee = 0.45 + Math.max(0, -s) * 0.7; p.rKnee = 0.5 + Math.max(0, s) * 0.7;
      p.rootLift = Math.abs(Math.cos(t * 0.28)) * 0.04;
      break;
    }
    case 'jump':
      p.lHipX = -1.1; p.lKnee = 1.7; p.rHipX = -0.5; p.rKnee = 1.5;
      p.lShX = -1.4; p.rShX = -1.2; p.hipsY = 0;
      break;
    case 'block':
      Object.assign(p, { spineX: 0.22, spineY: 0.1, neckY: -0.1, lShX: -1.55, lShZ: -0.4, lEl: -2.35,
        rShX: -1.45, rShZ: 0.4, rEl: -2.4, lKnee: 0.8, rKnee: 0.8, hipsY: -0.2 });
      break;
    case 'punch':
      // step in, turn the shoulder into it and fully extend the arm
      if (ph === 'startup') Object.assign(p, { lShX: -0.8, spineY: 0.55, lunge: 0.06 });
      else if (ph === 'active') Object.assign(p, { lShX: -1.6, lShZ: -0.02, lEl: 0, spineY: -0.5, spineX: 0.25, neckY: 0.35,
        lHipX: -0.65, lKnee: 0.6, rHipX: 0.55, rKnee: 0.2, lunge: 0.55 });
      else Object.assign(p, { lunge: 0.55 * (1 - pt) });
      break;
    case 'kick':
      // chamber, then drive the leg straight out while leaning back and sliding in
      if (ph === 'startup') Object.assign(p, { rHipX: -1.3, rKnee: 1.9, spineX: -0.1, rootLift: 0.02, lunge: 0.08 });
      else if (ph === 'active') Object.assign(p, { rHipX: -1.62, rHipZ: 0, rKnee: 0, spineX: -0.5, lKnee: 0.12, lHipX: 0.1,
        lShX: -0.4, rShX: 0.4, lunge: 0.55 });
      else Object.assign(p, pt < 0.5 ? { rHipX: -1.0, rKnee: 1.4, lunge: 0.45 } : { lunge: 0.55 * (1 - pt) });
      break;
    case 'lowKick': {
      // crouch, then a full spin with one leg sweeping along the floor
      if (ph === 'startup') Object.assign(p, { hipsY: -0.45, lKnee: 1.5, rKnee: 1.4, lHipX: -1.0, rHipX: -0.7, spineX: 0.45, lunge: 0.05 });
      else if (ph === 'active') Object.assign(p, { hipsY: -0.62, spineX: 0.5, spineY: 0, neckX: -0.3,
        lHipX: -1.5, lHipZ: 0.25, lKnee: 2.3, rHipX: -1.5, rHipZ: -0.1, rKnee: 0,
        lShX: -0.3, lShZ: -0.9, lEl: -0.4, rShX: -0.3, rShZ: 0.9, rEl: -0.4, lunge: 0.45, spin: -Math.PI * 2 * pt });
      else Object.assign(p, { hipsY: -0.5 * (1 - pt), lKnee: 1.6 * (1 - pt) + 0.45, rKnee: 1.0 * (1 - pt) + 0.5, spineX: 0.4 * (1 - pt) + 0.08, lunge: 0.45 * (1 - pt) });
      break;
    }
    case 'grab':
      // both arms shoot forward to grab
      if (ph === 'startup') Object.assign(p, { lShX: -0.9, rShX: -0.9, lEl: -1.4, rEl: -1.4, spineX: 0.1 });
      else Object.assign(p, { lShX: -1.55, rShX: -1.55, lShZ: 0.1, rShZ: -0.1, lEl: -0.25, rEl: -0.25, spineX: 0.3, spineY: 0, neckY: 0.1, lKnee: 0.7, rKnee: 0.4 });
      break;
    case 'airKick':
      Object.assign(p, { rHipX: -1.35, rKnee: 0.05, lHipX: -0.9, lKnee: 1.6, spineX: -0.3, lShX: -0.3, rShX: 0.4, hipsY: 0 });
      break;
    case 'airPunch':
      Object.assign(p, { lShX: -1.55, lEl: -0.05, spineY: -0.4, spineX: 0.2, neckY: 0.3, lHipX: -1.1, lKnee: 1.7, rHipX: -0.5, rKnee: 1.5, hipsY: 0 });
      break;
    // ── Oron's baguette (VIVA LA FRANCE): punches stab with it, kicks slash with it ──
    case 'stab':
      // a fencer's lunge: the baguette drawn back at the hip, the other hand curved up behind the
      // head (en garde), then a deep lunge sideways-on with the baguette straight out like a sword
      if (ph === 'startup') Object.assign(p, { lShX: 0.45, lShZ: -0.1, lEl: -1.5, spineY: 0.9, spineX: -0.05, neckY: -0.4,
        rShX: -2.5, rShZ: 0.7, rEl: -1.5, lKnee: 0.8, rKnee: 0.8, hipsY: -0.2, lunge: -0.05 });
      else if (ph === 'active') Object.assign(p, { lShX: -1.55, lShZ: 0, lEl: 0, spineY: -0.95, spineX: 0.45, neckY: 0.75, neckX: 0.1,
        rShX: 0.9, rShZ: 1.05, rEl: -0.25, lHipX: -1.35, lKnee: 1.45, rHipX: 0.95, rKnee: 0.05, hipsY: -0.38, lunge: 0.95 });
      else Object.assign(p, { lShX: -1.3 + 0.4 * pt, lEl: -0.8 * pt, spineY: -0.6 * (1 - pt), spineX: 0.3 * (1 - pt) + 0.08,
        rShX: 0.5 * (1 - pt) - 0.75 * pt, lKnee: 1.0 - 0.55 * pt, hipsY: -0.3 * (1 - pt), lunge: 0.95 * (1 - pt) });
      break;
    // ── Roni's dog tag nunchucks: martial-arts swings with the left hand (the tags' hand) ──
    case 'nunHigh': // up over the shoulder, then down across them in a wide stance
      if (ph === 'startup') Object.assign(p, { lShX: -2.9, lShZ: -0.3, lEl: -0.7, spineX: -0.2, spineY: 0.5, rShX: -1.2, rShZ: 0.3, rEl: -1.5, lKnee: 0.7, rKnee: 0.7, hipsY: -0.15 });
      else Object.assign(p, { lShX: -1.0, lShZ: -0.1, lEl: 0, spineX: 0.35, spineY: -0.6, neckX: 0.1, rShX: 0.4, rShZ: 0.6, rEl: -1.2, lHipX: -1.1, lKnee: 1.2, rHipX: 0.8, rKnee: 0.25, hipsY: -0.35, lunge: 0.45 });
      break;
    case 'nunSide': // wound up across the chest, then a flat backhand whip out to the side
      if (ph === 'startup') Object.assign(p, { lShX: -1.3, lShZ: 0.9, lEl: -1.4, spineY: 0.9, rShX: -0.6, rEl: -1.8, lKnee: 0.8, rKnee: 0.8, hipsY: -0.2 });
      else Object.assign(p, { lShX: -1.5, lShZ: -1.1, lEl: -0.05, spineY: -0.9, spineX: 0.1, neckY: 0.5, rShX: -0.5, rShZ: 0.4, rEl: -1.7, lHipX: -0.8, lKnee: 0.9, rHipX: 0.6, rKnee: 0.4, hipsY: -0.25, lunge: 0.3 });
      break;
    case 'nunLow': // crouched low, then ripping up from the floor, rising onto the toes
      if (ph === 'startup') Object.assign(p, { lShX: 0.5, lShZ: -0.4, lEl: -0.2, spineX: 0.55, spineY: 0.6, rShX: -1.3, rEl: -1.8, lKnee: 1.5, rKnee: 1.4, hipsY: -0.55 });
      else Object.assign(p, { lShX: -2.6, lShZ: -0.2, lEl: -0.1, spineX: -0.2, spineY: -0.5, neckX: -0.2, rShX: 0.5, rShZ: 0.5, rEl: -0.8, lHipX: -0.5, lKnee: 0.3, rHipX: 0.4, rKnee: 0.1, hipsY: 0.05, lunge: 0.4 });
      break;
    case 'nunSpin': // a full turn on the spot with the arm out, the tags flying round with her
      Object.assign(p, { lShX: -0.5, lShZ: -1.45, lEl: -0.1, rShX: -0.3, rShZ: 1.2, rEl: -0.6, spineX: 0.1, lKnee: 0.6, rKnee: 0.6, hipsY: -0.15,
        spin: ph === 'startup' ? -0.6 * pt : (ph === 'active' ? -0.6 + (Math.PI * 2 + 0.6) * Math.min(1, pt) : 0) });
      break;
    case 'nunCatch': // the tags caught under the right armpit, left hand at the shoulder, right hand out on guard
      Object.assign(p, { lShX: -0.7, lShZ: 0.75, lEl: -2.1, rShX: -1.2, rShZ: 0.1, rEl: -0.5, spineY: 0.5, spineX: 0.1, neckY: -0.5, lHipX: -0.6, lKnee: 1.0, rHipX: 0.5, rKnee: 0.9, hipsY: -0.3 });
      break;
    case 'kneel': // dropped to both knees, head bowed, arms hanging (Zohar's lesson)
      Object.assign(p, { spineX: 0.35, spineY: 0, neckX: 0.45, neckY: 0, lShX: 0.15, lShZ: -0.1, lEl: -0.25, rShX: 0.15, rShZ: 0.1, rEl: -0.25,
        lHipX: -0.05, lHipZ: 0.05, lKnee: 1.6, rHipX: 0.05, rHipZ: -0.05, rKnee: 1.6, hipsY: -0.42 });
      break;
    // ── Talel's terrorist (TERRORIST IN DISGUISE): knife stabs at different heights, always the left hand ──
    case 'knifeHigh': // up at the head / neck, rising onto the toes
      if (ph === 'startup') Object.assign(p, { lShX: -0.5, lShZ: -0.2, lEl: -2.0, spineY: 0.8, spineX: -0.1, neckY: -0.3, rShX: -0.9, rEl: -1.6, hipsY: -0.15 });
      else Object.assign(p, { lShX: -2.25, lShZ: 0, lEl: -0.1, spineY: -0.8, spineX: -0.12, neckY: 0.6, neckX: -0.15, rShX: 0.6, rShZ: 0.8, rEl: -0.4, lHipX: -0.7, lKnee: 0.5, rHipX: 0.6, rKnee: 0.1, hipsY: 0.02, lunge: 0.3 });
      break;
    case 'knifeLow': // down low into the leg, crouched deep
      if (ph === 'startup') Object.assign(p, { lShX: 0.3, lEl: -1.4, spineY: 0.9, spineX: 0.2, rShX: -1.0, rEl: -1.8, lKnee: 1.0, rKnee: 1.0, hipsY: -0.3 });
      else Object.assign(p, { lShX: -0.75, lShZ: 0.05, lEl: 0, spineY: -0.9, spineX: 0.75, neckX: -0.3, neckY: 0.6, rShX: 0.7, rShZ: 0.9, rEl: -0.5, lHipX: -1.5, lKnee: 1.9, rHipX: 0.8, rKnee: 0.9, hipsY: -0.62, lunge: 0.4 });
      break;
    case 'knifeChop': // raised high over the head, then driven down into the shoulder
      if (ph === 'startup') Object.assign(p, { lShX: -3.0, lShZ: -0.25, lEl: -1.3, spineX: -0.25, spineY: 0.3, neckX: -0.2, rShX: -0.6, rEl: -1.8, hipsY: 0 });
      else Object.assign(p, { lShX: -1.15, lShZ: 0, lEl: -0.25, spineX: 0.55, spineY: -0.6, neckX: 0.15, neckY: 0.5, rShX: 0.5, rShZ: 0.7, rEl: -0.6, lHipX: -1.0, lKnee: 1.0, rHipX: 0.7, rKnee: 0.3, hipsY: -0.3, lunge: 0.3 });
      break;
    case 'knifeRise': // from low by the hip, ripping up into the belly
      if (ph === 'startup') Object.assign(p, { lShX: 0.35, lShZ: -0.15, lEl: -0.5, spineX: 0.35, spineY: 0.7, rShX: -1.1, rEl: -1.9, lKnee: 1.2, rKnee: 1.1, hipsY: -0.4 });
      else Object.assign(p, { lShX: -1.35, lShZ: 0, lEl: -0.5, spineX: 0.1, spineY: -0.75, neckY: 0.55, rShX: 0.6, rShZ: 0.8, rEl: -0.5, lHipX: -0.9, lKnee: 0.7, rHipX: 0.7, rKnee: 0.2, hipsY: -0.12, lunge: 0.3 });
      break;
    case 'knifeThrust': // the last one: everything behind a deep straight lunge into the chest
      if (ph === 'startup') Object.assign(p, { lShX: 0.6, lShZ: -0.1, lEl: -1.7, spineY: 1.1, spineX: -0.1, neckY: -0.5, rShX: -2.2, rShZ: 0.5, rEl: -1.2, lKnee: 0.9, rKnee: 0.9, hipsY: -0.25 });
      else Object.assign(p, { lShX: -1.6, lShZ: 0, lEl: 0, spineY: -1.1, spineX: 0.5, neckY: 0.8, neckX: 0.1, rShX: 1.0, rShZ: 1.2, rEl: -0.1, lHipX: -1.5, lKnee: 1.6, rHipX: 1.1, rKnee: 0.05, hipsY: -0.45, lunge: 0.5 });
      break;
    case 'knifeJab': // a short straight stab at chest height
      if (ph === 'startup') Object.assign(p, { lShX: 0.2, lShZ: -0.1, lEl: -1.8, spineY: 0.8, neckY: -0.4, rShX: -1.1, rEl: -1.9, lKnee: 0.7, rKnee: 0.7, hipsY: -0.15 });
      else Object.assign(p, { lShX: -1.55, lShZ: 0, lEl: -0.05, spineY: -0.9, spineX: 0.3, neckY: 0.7, rShX: 0.6, rShZ: 0.8, rEl: -0.4, lHipX: -1.0, lKnee: 1.0, rHipX: 0.8, rKnee: 0.15, hipsY: -0.25, lunge: 0.3 });
      break;
    case 'slash': {
      // the baguette raised high, then swung down and across in a big arc
      const k = ph === 'startup' ? 0 : ph === 'active' ? pt : 1;
      if (ph === 'startup') Object.assign(p, { lShX: -2.9, lShZ: -0.5, lEl: -0.4, spineY: 0.7, spineX: -0.15, rShX: -0.6, lunge: 0.1 });
      else Object.assign(p, { lShX: -2.9 + 1.9 * k, lShZ: -0.5 + 1.0 * k, lEl: -0.3, spineY: 0.7 - 1.5 * k, spineX: -0.15 + 0.5 * k, neckY: 0.3,
        rShX: 0.4, rShZ: 0.7, lHipX: -0.7, lKnee: 0.7, rKnee: 0.2, lunge: ph === 'recovery' ? 0.55 * (1 - pt) : 0.55 });
      break;
    }
    // Po's Wuxi finger hold: one hand out holding their finger, pinky up, the other hand ready
    // (pt 0…0.8: the held hand slowly lifted, little finger up; then the SKADOOSH snap down)
    case 'wuxi': {
      const lift = Math.min(1, pt / 0.8), snap = pt > 0.8 ? Math.min(1, (pt - 0.8) / 0.1) : 0;
      Object.assign(p, { lShX: -1.75 - 0.35 * lift + 0.8 * snap, lShZ: 0.1, lEl: -0.5 - 0.3 * lift + 0.5 * snap, rShX: -0.4, rShZ: 0.6, rEl: -1.7,
        spineX: 0.15 + 0.15 * snap, spineY: -0.2, neckY: 0.2, neckX: 0.1 * lift, lKnee: 0.6, rKnee: 0.4, lunge: 0.2 });
      break;
    }
    // held in Po's finger hold: arm stretched out to him, leaning back, worried
    case 'wuxiHeld': {
      const lift = Math.min(1, pt / 0.8), snap = pt > 0.8 ? Math.min(1, (pt - 0.8) / 0.1) : 0;
      Object.assign(p, { lShX: -1.5 - 0.35 * lift + 0.7 * snap, lShZ: 0.05, lEl: -0.15, rShX: 0.2, rShZ: 0.5, rEl: -0.6,
        spineX: -0.25 - 0.1 * lift, spineY: 0.3, neckX: -0.2 - 0.15 * lift, lKnee: 0.5 + 0.3 * snap, rKnee: 0.7, hipsY: -0.08 - 0.1 * snap, lunge: -0.05 });
      break;
    }
    // floating in meditation: legs crossed, palms together in front
    case 'float':
      Object.assign(p, { lHipX: -1.5, lHipZ: 0.7, lKnee: 2.3, rHipX: -1.5, rHipZ: -0.7, rKnee: 2.3, hipsY: 0,
        lShX: -1.1, lShZ: -0.35, lEl: -1.6, rShX: -1.1, rShZ: 0.35, rEl: -1.6, spineX: 0.05, spineY: 0, neckX: 0, neckY: 0, lunge: 0 });
      break;
    // ── string hits and finishers ──
    case 'cross':
      // the rear hand, straight down the middle
      if (ph === 'startup') Object.assign(p, { rShX: -0.6, spineY: 0.5, lunge: 0.06 });
      else if (ph === 'active') Object.assign(p, { rShX: -1.6, rShZ: 0.02, rEl: 0, lShX: -0.9, lEl: -2.0, spineY: 0.6, spineX: 0.25, neckY: -0.3,
        lHipX: -0.65, lKnee: 0.6, rHipX: 0.55, rKnee: 0.2, lunge: 0.55 });
      else Object.assign(p, { lunge: 0.55 * (1 - pt) });
      break;
    case 'hammer':
      // both fists raised overhead, then brought down on their head
      if (ph === 'startup') Object.assign(p, { lShX: -2.9, rShX: -2.9, lEl: -1.0, rEl: -1.0, spineX: -0.2, rootLift: 0.04 });
      else if (ph === 'active') Object.assign(p, { lShX: -1.1, rShX: -1.1, lShZ: 0.2, rShZ: -0.2, lEl: -0.3, rEl: -0.3, spineX: 0.55, neckX: 0.2, lKnee: 0.8, rKnee: 0.6, hipsY: -0.2, lunge: 0.5 });
      else Object.assign(p, { spineX: 0.4 * (1 - pt) + 0.08, lunge: 0.5 * (1 - pt) });
      break;
    case 'haymaker':
      // a huge wind-up and a looping rear-hand swing
      if (ph === 'startup') Object.assign(p, { rShX: 0.6, rShZ: 0.9, rEl: -1.2, spineY: 0.9, spineX: -0.1, lShX: -1.3 });
      else if (ph === 'active') Object.assign(p, { rShX: -1.5, rShZ: -0.35, rEl: -0.35, spineY: -0.9, spineX: 0.3, neckY: 0.4, lHipX: -0.7, lKnee: 0.6, lunge: 0.65 });
      else Object.assign(p, { spineY: -0.6 * (1 - pt), lunge: 0.65 * (1 - pt) });
      break;
    case 'gut':
      // dip down and drive the fist into the stomach
      if (ph === 'startup') Object.assign(p, { hipsY: -0.2, lKnee: 0.9, rKnee: 0.9, lShX: -0.5, spineY: 0.5 });
      else if (ph === 'active') Object.assign(p, { hipsY: -0.3, lKnee: 1.0, rKnee: 0.7, lShX: -1.25, lEl: -0.1, spineX: 0.45, spineY: -0.5, neckY: 0.3, lunge: 0.6 });
      else Object.assign(p, { hipsY: -0.3 * (1 - pt), lunge: 0.6 * (1 - pt) });
      break;
    case 'backfist': {
      // a full turn, the back of the fist leading
      const k = ph === 'startup' ? pt : 1;
      Object.assign(p, { spin: -Math.PI * 2 * k, rShX: -1.5, rShZ: 0.5 - 0.6 * k, rEl: -0.3 * (1 - k), spineY: -0.4, lunge: 0.5 * k });
      if (ph === 'recovery') Object.assign(p, { spin: 0, lunge: 0.5 * (1 - pt) });
      break;
    }
    case 'elbow':
      if (ph === 'startup') Object.assign(p, { rShX: -0.3, rEl: -2.5, spineY: 0.7 });
      else if (ph === 'active') Object.assign(p, { rShX: -1.35, rShZ: 0.5, rEl: -2.6, spineY: -0.8, spineX: 0.3, neckY: 0.4, lKnee: 0.7, lunge: 0.5 });
      else Object.assign(p, { lunge: 0.5 * (1 - pt) });
      break;
    case 'headbutt':
      if (ph === 'startup') Object.assign(p, { spineX: -0.35, neckX: -0.5, lShX: -1.4, rShX: -1.4, lEl: -1.2, rEl: -1.2 });
      else if (ph === 'active') Object.assign(p, { spineX: 0.75, neckX: 0.55, neckY: 0, spineY: 0, lShX: -1.4, rShX: -1.4, lEl: -1.0, rEl: -1.0, lKnee: 0.7, lunge: 0.5 });
      else Object.assign(p, { spineX: 0.5 * (1 - pt) + 0.08, lunge: 0.5 * (1 - pt) });
      break;
    case 'palm':
      // both palms shoved into the chest
      if (ph === 'startup') Object.assign(p, { lShX: -0.7, rShX: -0.7, lEl: -2.0, rEl: -2.0, spineX: -0.1, hipsY: -0.15, lKnee: 0.8, rKnee: 0.8 });
      else if (ph === 'active') Object.assign(p, { lShX: -1.55, rShX: -1.55, lShZ: 0.05, rShZ: -0.05, lEl: -0.1, rEl: -0.1, spineX: 0.3, spineY: 0, neckY: 0, lHipX: -0.7, lKnee: 0.5, rKnee: 0.1, lunge: 0.7 });
      else Object.assign(p, { lunge: 0.7 * (1 - pt) });
      break;
    case 'knee':
      // grab the head and drive the knee up
      if (ph === 'startup') Object.assign(p, { lShX: -1.6, rShX: -1.6, lEl: -0.8, rEl: -0.8, spineX: 0.2, lunge: 0.3 });
      else if (ph === 'active') Object.assign(p, { rHipX: -2.0, rKnee: 2.4, lKnee: 0.05, lShX: -1.0, rShX: -1.0, lEl: -1.4, rEl: -1.4, spineX: -0.15, rootLift: 0.18, lunge: 0.45 });
      else Object.assign(p, { rHipX: -1.0 * (1 - pt) + 0.35, rKnee: 1.6 * (1 - pt) + 0.5, lunge: 0.45 * (1 - pt) });
      break;
    case 'highKick':
      // the leg swings straight up under the chin
      if (ph === 'startup') Object.assign(p, { rHipX: -0.8, rKnee: 1.2, spineX: -0.1, lunge: 0.15 });
      else if (ph === 'active') Object.assign(p, { rHipX: -2.7, rKnee: 0.05, lKnee: 0.05, lHipX: 0.15, spineX: -0.6, neckX: -0.2, lShX: -0.3, lShZ: -0.6, rShX: 0.4, rShZ: 0.6, rootLift: 0.06, lunge: 0.45 });
      else Object.assign(p, pt < 0.5 ? { rHipX: -1.6, rKnee: 0.8, spineX: -0.3, lunge: 0.4 } : { lunge: 0.4 * (1 - pt) });
      break;
    case 'flipKick':
      // jump, lean way back and kick up with both legs
      if (ph === 'startup') Object.assign(p, { hipsY: -0.3, lKnee: 1.2, rKnee: 1.2, spineX: 0.2, lShX: 0.5, rShX: 0.5 });
      else if (ph === 'active') Object.assign(p, { rHipX: -2.6, rKnee: 0.05, lHipX: -1.6, lKnee: 0.9, spineX: -0.5, neckX: -0.4, lShX: 0.8, rShX: 0.8, rootTilt: -0.8, rootLift: 0.55, hipsY: 0, lunge: 0.35 });
      else Object.assign(p, { rootTilt: -0.8 * (1 - pt), rootLift: 0.55 * (1 - pt), rHipX: -1.4 * (1 - pt) + 0.35, lunge: 0.35 * (1 - pt) });
      break;
    case 'roundhouse': {
      // a full spin with the leg out, coming round under the chin
      const k = ph === 'startup' ? pt * 0.5 : ph === 'active' ? 0.5 + pt * 0.5 : 1;
      Object.assign(p, { spin: -Math.PI * 2 * k, rHipX: ph === 'startup' ? -1.0 : -2.2, rHipZ: -0.3, rKnee: ph === 'startup' ? 1.3 : 0.05, lKnee: 0.15,
        spineX: -0.45, lShX: -0.3, lShZ: -0.8, rShX: -0.3, rShZ: 0.8, rootLift: 0.08, lunge: 0.45 });
      if (ph === 'recovery') Object.assign(p, pt < 0.4 ? { spin: 0, rHipX: -1.0, rKnee: 1.2, spineX: -0.2 } : { spin: 0, rHipX: 0.35, rKnee: 0.5, spineX: 0.08, lunge: 0.45 * (1 - pt), rootLift: 0 });
      break;
    }
    case 'throw':
      if (ph === 'startup') Object.assign(p, { rShX: 1.1, rShZ: 0.3, rEl: -1.1, spineY: 0.75, spineX: -0.1 });
      else Object.assign(p, { rShX: -1.6, rShZ: 0, rEl: -0.1, spineY: -0.45, spineX: 0.25, neckY: 0.35 });
      break;
    case 'dash': {
      const s = Math.sin(t * 0.6);
      Object.assign(p, { spineX: 0.5, lShX: -1.6, lEl: -0.05, spineY: -0.2, neckX: -0.3, neckY: 0.15,
        lHipX: -0.2 + s * 0.8, rHipX: 0.2 - s * 0.8, lKnee: 0.7, rKnee: 0.7 });
      if (ph === 'startup') Object.assign(p, { spineX: 0.25, lShX: -0.7, hipsY: -0.2 });
      break;
    }
    case 'uppercut':
      if (ph === 'startup') Object.assign(p, { hipsY: -0.35, rShX: 0.6, rEl: -1.5, lKnee: 1.1, rKnee: 1.1, spineX: 0.35 });
      else if (ph === 'active') Object.assign(p, { rShX: -2.95, rShZ: 0.1, rEl: -0.35, spineX: -0.2, spineY: -0.3, lKnee: 0.1, rKnee: 0.9, rHipX: -0.9, hipsY: 0 });
      else Object.assign(p, { rShX: -2.2, rEl: -0.6, lKnee: 0.6, rKnee: 0.9 });
      break;
    case 'slam':
      if (ph === 'startup') Object.assign(p, { hipsY: -0.35, lKnee: 1.2, rKnee: 1.2, lShX: 0.6, rShX: 0.6, spineX: 0.3 });
      else if (ph === 'active') Object.assign(p, { lShX: -2.9, rShX: -2.9, lShZ: 0.3, rShZ: -0.3, lEl: -0.2, rEl: -0.2, lHipX: -1.2, rHipX: -1.2, lKnee: 1.7, rKnee: 1.7, spineX: -0.2, hipsY: 0 });
      else Object.assign(p, { hipsY: -0.45, lKnee: 1.4, rKnee: 1.4, spineX: 0.5, lShX: -0.5, rShX: -0.5, lEl: -0.3, rEl: -0.3 });
      break;
    case 'teleport':
      Object.assign(p, { lShX: -1.62, lEl: -0.05, spineY: -0.3, spineX: 0.25, neckY: 0.25 });
      if (ph === 'startup') Object.assign(p, { spineY: Math.PI * 2 * pt, lShX: -2.8, rShX: -2.8, lEl: -0.2, rEl: -0.2 });
      break;
    // punching yourself in the face (Michael's fatality): the arm swung out wide (pt 0), then the
    // fist slammed back into your own face (pt 1), the head snapping away from it
    case 'selfPunchL':
    case 'selfPunchR': {
      const L = anim === 'selfPunchL', s = L ? -1 : 1, k = pt, hit = Math.max(0, (k - 0.75) / 0.25);
      const arm = { ShX: -0.7 - 0.7 * k, ShZ: s * (0.9 - 1.3 * k), El: -0.4 - 2.15 * k };
      Object.assign(p, L ? { lShX: arm.ShX, lShZ: arm.ShZ, lEl: arm.El, rShX: -0.2, rShZ: 0.35, rEl: -0.8 }
        : { rShX: arm.ShX, rShZ: arm.ShZ, rEl: arm.El, lShX: -0.2, lShZ: -0.35, lEl: -0.8 });
      Object.assign(p, { spineY: -s * 0.25 * k, spineX: 0.1 - 0.25 * hit, neckX: -0.4 * hit, neckY: -s * 0.75 * hit,
        lKnee: 0.5 + 0.15 * hit, rKnee: 0.5 + 0.15 * hit, hipsY: -0.08 - 0.04 * hit });
      break;
    }
    case 'hit':
      Object.assign(p, { spineX: -0.45, spineY: 0.2, neckX: -0.45, lShX: 0.2, lShZ: 0.8, rShX: 0.3, rShZ: -0.8,
        lEl: -0.6, rEl: -0.6, hipsY: -0.08, lKnee: 0.6 });
      break;
    case 'dazed': {
      // seeing stars: wobbling on the spot, arms hanging, head lolling
      const w = Math.sin(t * 0.18);
      Object.assign(p, { spineX: 0.15, spineY: w * 0.2, neckX: 0.35 + Math.sin(t * 0.25) * 0.15, neckY: w * 0.5,
        lShX: 0.1, lShZ: -0.25 + w * 0.15, lEl: -0.3, rShX: 0.1, rShZ: 0.25 + w * 0.15, rEl: -0.3,
        lHipX: -0.1, lKnee: 0.35, rHipX: 0.1, rKnee: 0.4, hipsY: -0.08, rootTilt: w * 0.06 });
      break;
    }
    case 'shocked': {
      // stiff, arms pinned, body twitching from the current
      const j = () => (Math.random() - 0.5) * 0.35;
      Object.assign(p, { spineX: -0.25 + j(), spineY: j(), neckX: -0.3 + j(), neckY: j(),
        lShX: 0.1 + j(), lShZ: 0.25 + j() * 0.5, lEl: -0.2 + j(), rShX: 0.1 + j(), rShZ: -0.25 + j() * 0.5, rEl: -0.2 + j(),
        lHipX: j() * 0.4, rHipX: j() * 0.4, lKnee: 0.15 + Math.abs(j()), rKnee: 0.15 + Math.abs(j()), hipsY: 0,
        rootLift: 0.05 + Math.abs(Math.sin(t * 1.7)) * 0.08 });
      break;
    }
    case 'happy': {
      // giddy little hop, arms up and swaying
      const b = Math.abs(Math.sin(t * 0.2));
      Object.assign(p, { spineX: -0.15, spineY: Math.sin(t * 0.1) * 0.3, neckX: -0.2, neckY: Math.sin(t * 0.13) * 0.4,
        lShX: -2.6, lShZ: 0.4 + Math.sin(t * 0.2) * 0.3, lEl: -0.5, rShX: -2.6, rShZ: -0.4 - Math.sin(t * 0.2) * 0.3, rEl: -0.5,
        lHipX: -0.1, rHipX: 0.1, lKnee: 0.15 + b * 0.3, rKnee: 0.15 + b * 0.3, hipsY: 0, rootLift: b * 0.18 });
      break;
    }
    case 'smoke': {
      // Karina: cigarette to the lips, a long drag, then lean in and blow
      if (ph === 'startup' && pt < 0.45) {
        const k = Math.min(1, pt / 0.3);
        Object.assign(p, { rShX: -0.75 - 1.35 * k, rShZ: 0.15 + 0.15 * k, rEl: -2.2 + 0.6 * k, spineX: 0.05, neckY: 0.1 });
      } else if (ph === 'startup') {
        // the drag: chest rises, head tips back
        const k = (pt - 0.45) / 0.55;
        Object.assign(p, { rShX: -2.1, rShZ: 0.3, rEl: -1.6, spineX: 0.05 - 0.25 * k, neckX: -0.3 * k, neckY: 0.1, rootLift: 0.03 * k });
      } else {
        // blow: hand drops away, lean toward the opponent
        Object.assign(p, { rShX: -0.5, rShZ: 0.6, rEl: -1.6, lShX: -0.6, lEl: -1.2, spineX: 0.35, neckX: 0.25, neckY: 0.15, lunge: 0.12 });
      }
      break;
    }
    case 'guitar': {
      // Ofek shredding: fretting arm out along the neck, picking hand at the hip, headbanging
      const strum = Math.sin(t * 1.6), bang = Math.sin(t * 0.45);
      Object.assign(p, { spineX: -0.08 + bang * 0.05, spineY: 0.2, neckX: 0.25 + bang * 0.3, neckY: 0.2,
        lShX: -1.15, lShZ: -0.45, lEl: -0.7, rShX: -0.35, rShZ: 0.35 + strum * 0.12, rEl: -1.45 - strum * 0.25,
        lHipX: -0.4, lKnee: 0.5, rHipX: 0.35, rKnee: 0.55, hipsY: -0.1 });
      break;
    }
    case 'darbuka': {
      // Netanel drumming: the darbuka under his left arm, both hands slapping the head in turn
      const l = Math.max(0, Math.sin(t * 0.55)), r = Math.max(0, Math.sin(t * 0.55 + Math.PI));
      Object.assign(p, { spineX: 0.12, spineY: 0.15, neckX: 0.2 + (l + r) * 0.08, neckY: 0.1,
        lShX: -0.55 - l * 0.35, lShZ: -0.3, lEl: -1.25 + l * 0.45, rShX: -0.75 - r * 0.35, rShZ: 0.35, rEl: -1.15 + r * 0.45,
        lHipX: -0.35, lKnee: 0.45, rHipX: 0.3, rKnee: 0.5, hipsY: -0.08 });
      break;
    }
    case 'gold': {
      // Ori turning gold: arms up, flexing
      const k = ph === 'startup' ? Math.min(1, pt * 1.5) : 1;
      Object.assign(p, { spineX: -0.1 * k, spineY: 0, neckX: -0.2 * k, neckY: 0,
        lShX: -0.3 * k, lShZ: -1.4 * k, lEl: -1.9 * k, rShX: -0.3 * k, rShZ: 1.4 * k, rEl: -1.9 * k, lunge: 0 });
      break;
    }
    case 'dummy': {
      // the practice dummy standing there: limp arms out to the sides, head tipped, a slow sway
      const sway = Math.sin(t * 0.04) * 0.04;
      Object.assign(p, { spineX: 0.02, spineY: 0, neckX: 0.04, neckY: 0.25, rootTilt: sway,
        lShX: 0.05, lShZ: -0.55, lEl: -0.2, rShX: 0.05, rShZ: 0.55, rEl: -0.2,
        lHipX: -0.04, lHipZ: 0.06, lKnee: 0.06, rHipX: 0.04, rHipZ: -0.06, rKnee: 0.06, hipsY: 0, lunge: 0 });
      break;
    }
    case 'whip': {
      // Zohar's whip: the whip arm wound up high behind his head, then snapped forward and down
      const k = pt; // 0 = wound up … 1 = cracked
      Object.assign(p, { spineX: -0.15 + 0.4 * k, spineY: 0.5 - 0.9 * k, neckX: 0.1 * k, neckY: -0.3 + 0.4 * k,
        rShX: -2.9 + 2.0 * k, rShZ: 0.5 - 0.2 * k, rEl: -1.6 + 1.5 * k, lShX: -0.9 + 0.3 * k, lShZ: -0.4, lEl: -1.4,
        lHipX: -0.45, lKnee: 0.5 + 0.2 * k, rHipX: 0.35, rKnee: 0.45, hipsY: -0.1 - 0.06 * k, lunge: 0.25 * k });
      break;
    }
    case 'ivSwing': {
      // Noa grabs the I.V. stand with both hands and swings it up into them like a golf club
      if (ph === 'startup') {
        const k = Math.min(1, pt * 1.3);
        Object.assign(p, { spineX: 0.35 * k, spineY: 0.75 * k, neckY: -0.4 * k, lShX: 0.2 + 0.7 * k, lShZ: -0.1, lEl: -0.25, rShX: 0.2 + 0.75 * k, rShZ: 0.15, rEl: -0.35,
          lHipX: -0.45, lKnee: 0.8 * k + 0.4, rHipX: 0.35, rKnee: 0.7 * k + 0.4, hipsY: -0.07 - 0.18 * k });
      } else {
        const k = ph === 'active' ? Math.min(1, pt * 1.6) : 1, r = ph === 'recovery' ? pt : 0;
        Object.assign(p, { spineX: 0.35 - 0.6 * k + 0.25 * r, spineY: 0.75 - 1.45 * k + 0.6 * r, neckY: -0.4 + 0.7 * k, neckX: -0.25 * k,
          lShX: 0.9 - 3.7 * k + 1.2 * r, lShZ: -0.1 - 0.2 * k, lEl: -0.25, rShX: 0.95 - 3.8 * k + 1.2 * r, rShZ: 0.15 + 0.15 * k, rEl: -0.35,
          lHipX: -0.45 - 0.1 * k, lKnee: 1.2 - 0.9 * k, rHipX: 0.35 + 0.2 * k, rKnee: 1.1 - 0.85 * k, hipsY: -0.25 + 0.2 * k, rootLift: 0.08 * k * (1 - r), lunge: 0.25 * k });
      }
      break;
    }
    case 'radio': {
      // Haim calling in the strike: walkie-talkie at his mouth, talking (little nods), then he
      // points up at the sky with the other hand
      const talk = Math.sin(t * 0.5) * 0.06, point = Math.max(0, (pt - 0.65) / 0.35);
      Object.assign(p, { rShX: -2.05, rShZ: 0.32, rEl: -1.75, spineX: -0.05, spineY: 0.1, neckX: -0.1 + talk, neckY: 0.15,
        lShX: -0.6 - 2.2 * point, lShZ: -0.15 - 0.2 * point, lEl: -1.3 + 1.2 * point,
        lHipX: -0.3, lKnee: 0.35, rHipX: 0.3, rKnee: 0.4, hipsY: -0.05 });
      break;
    }
    case 'cough': {
      // Noa: hand over her mouth, three coughs that jerk her forward, then the big one
      if (ph === 'startup') {
        const k = Math.min(1, pt * 1.4);
        Object.assign(p, { rShX: -0.75 - 1.35 * k, rShZ: 0.15 + 0.15 * k, rEl: -2.2 + 0.6 * k, spineX: 0.05 - 0.15 * k, neckX: -0.2 * k });
      } else if (ph === 'active') {
        const c = (ctx.t ?? 0) % 22;                 // one cough every 22 frames
        const jerk = c < 5 ? c / 5 : Math.max(0, 1 - (c - 5) / 10);
        Object.assign(p, { rShX: -2.1, rShZ: 0.3, rEl: -1.6, lShX: -0.5 - 0.4 * jerk, lEl: -1.4,
          spineX: -0.1 + 0.55 * jerk, neckX: -0.15 + 0.5 * jerk, rootLift: 0.02 * (1 - jerk), hipsY: -0.04 - 0.06 * jerk });
      } else {
        Object.assign(p, { rShX: -1.2, rShZ: 0.35, rEl: -1.5, lShX: -0.7, lEl: -1.2, spineX: 0.6, neckX: 0.45, lunge: 0.12, hipsY: -0.1 });
      }
      break;
    }
    case 'ears': {
      // Ofek's solo: hands clamped over the ears, hunched, shaking the head
      const shake = Math.sin(t * 0.9) * 0.35;
      Object.assign(p, { spineX: 0.3, spineY: 0, neckX: 0.25, neckY: shake,
        lShX: -0.5, lShZ: -1.5, lEl: -2.5, rShX: -0.5, rShZ: 1.5, rEl: -2.5,
        lHipX: -0.3, lKnee: 0.6, rHipX: 0.3, rKnee: 0.65, hipsY: -0.14, lunge: 0 });
      break;
    }
    case 'roll':
      // tucked into a ball for the backward roll (the spin itself is in fighter.render)
      Object.assign(p, { spineX: 0.7, spineY: 0, neckX: 0.5, neckY: 0, lShX: -1.3, lShZ: -0.2, lEl: -2.1, rShX: -1.3, rShZ: 0.2, rEl: -2.1,
        lHipX: -1.7, lHipZ: 0.1, lKnee: 2.3, rHipX: -1.7, rHipZ: -0.1, rKnee: 2.3, hipsY: -0.25, lunge: 0 });
      break;
    case 'spinSlam': {
      // Asis: bamboo held overhead while spinning in, then brought down on the opponent
      const up = (ctx.t ?? 0) < 18;
      Object.assign(p, up
        ? { spineX: -0.15, spineY: 0, neckX: -0.2, neckY: 0, lShX: -2.9, lShZ: -0.25, lEl: -0.3, rShX: -2.9, rShZ: 0.25, rEl: -0.3, lKnee: 0.5, rKnee: 0.5, hipsY: -0.05 }
        : { spineX: 0.6, spineY: 0, neckX: 0.3, neckY: 0, lShX: -1.3, lShZ: -0.15, lEl: -0.2, rShX: -1.3, rShZ: 0.15, rEl: -0.2, lHipX: -0.6, lKnee: 0.9, rHipX: 0.4, rKnee: 0.6, hipsY: -0.2, lunge: 0.2 });
      break;
    }
    case 'flag': {
      // human flag (the body is turned sideways in effects.js): arms straight up over the head
      // in a Y (stretched long in effects.js so the hands reach past the big head to the pole);
      // legs scissor-kick
      const k = Math.sin(t * 0.5);
      Object.assign(p, { spineX: 0, spineY: 0, neckX: 0, neckY: 0, lShX: 0, lShZ: 2.5, lEl: 0, rShX: 0, rShZ: -2.5, rEl: 0, // (sign flipped: the body is on its side)
        lHipX: -0.6 + k * 0.6, rHipX: -0.6 - k * 0.6, lKnee: 0.1, rKnee: 0.1, hipsY: 0, lunge: 0 });
      break;
    }
    case 'blockHit':
      Object.assign(p, pose('block', t, ctx), { spineX: 0.05, hipsY: -0.24 });
      break;
    // lying in a hospital bed (Karina's fatality): flat on the back, arms by the sides, head on the pillow
    case 'bedRest':
      Object.assign(p, { spineX: 0.05, spineY: 0, neckX: 0.25, neckY: 0, lShX: -0.15, lShZ: -0.12, rShX: -0.15, rShZ: 0.12,
        lEl: -0.25, rEl: -0.25, lHipX: 0, lHipZ: 0.04, rHipX: 0, rHipZ: -0.04, lKnee: 0.05, rKnee: 0.05, hipsY: 0,
        rootTilt: -1.5, rootLift: 0 });
      break;
    case 'knockdown':
    case 'ko': {
      const fall = Math.min(1, t / 20);
      Object.assign(p, { spineX: -0.3, neckX: -0.3, lShX: -2.6 * fall, lShZ: 0.6, rShX: -2.6 * fall, rShZ: -0.6,
        lEl: -0.3, rEl: -0.3, lHipX: -0.3, rHipX: -0.1, lKnee: 0.3, rKnee: 0.1, hipsY: 0,
        rootTilt: -1.5 * (1 - Math.pow(1 - fall, 3)), rootLift: fall < 1 ? Math.sin(fall * Math.PI) * 0.25 : 0 });
      break;
    }
    case 'getup': {
      // kip-up: rock back onto the shoulders with the knees to the chest and the hands by the
      // ears, then kick the legs out and spring up onto the feet
      const k = Math.min(1, t / 22), ease = (x) => x * x * (3 - 2 * x);
      if (k < 0.35) {
        const u = ease(k / 0.35);
        Object.assign(p, { rootTilt: -1.5 - 0.25 * u, rootLift: 0, spineX: -0.3 + 0.5 * u, neckX: -0.3 + 0.6 * u,
          lHipX: -0.3 - 1.7 * u, rHipX: -0.1 - 1.9 * u, lKnee: 0.3 + 1.4 * u, rKnee: 0.1 + 1.6 * u,
          lShX: -2.6 - 0.3 * u, lShZ: 0.3, lEl: -0.3 - 1.9 * u, rShX: -2.6 - 0.3 * u, rShZ: -0.3, rEl: -0.3 - 1.9 * u, hipsY: 0 });
      } else if (k < 0.72) {
        const u = ease((k - 0.35) / 0.37);
        Object.assign(p, { rootTilt: -1.75 + 1.6 * u, rootLift: Math.sin(u * Math.PI) * 0.45, spineX: 0.2 + 0.15 * u, neckX: 0.3 - 0.2 * u,
          lHipX: -2.0 + 1.5 * u, rHipX: -2.0 + 1.6 * u, lKnee: 1.7 - 0.6 * u, rKnee: 1.7 - 0.5 * u,
          lShX: -2.9 + 2.0 * u, lShZ: 0.3, lEl: -2.2 + 1.0 * u, rShX: -2.9 + 2.1 * u, rShZ: -0.3, rEl: -2.2 + 0.9 * u, hipsY: -0.25 * u });
      } else {
        const u = ease((k - 0.72) / 0.28);
        Object.assign(p, { rootTilt: -0.15 * (1 - u), rootLift: 0, spineX: 0.35 - 0.27 * u, neckX: 0.1 - 0.1 * u,
          lHipX: -0.5 + 0.15 * u, rHipX: -0.4 + 0.75 * u, lKnee: 1.1 - 0.65 * u, rKnee: 1.2 - 0.7 * u,
          lShX: -0.9 - 0.1 * u, lEl: -1.2 - 0.7 * u, rShX: -0.8 + 0.05 * u, rEl: -1.3 - 0.9 * u, hipsY: -0.25 + 0.18 * u });
      }
      break;
    }
    case 'win': {
      const b = Math.abs(Math.sin(t * 0.12));
      Object.assign(p, { spineX: -0.1, spineY: -0.3, neckY: -0.5, neckX: -0.15, lShX: -2.95, lShZ: 0.25, lEl: -0.25,
        rShX: -2.95, rShZ: -0.25, rEl: -0.25, lHipX: -0.1, rHipX: 0.1, lKnee: 0.1 + b * 0.4, rKnee: 0.1 + b * 0.4,
        rootLift: b * 0.35, hipsY: 0 });
      break;
    }
    case 'taunt':
      Object.assign(p, { neckY: -0.6, lShX: -0.3, lShZ: 1.2, lEl: -1.4, rShX: -1.4, rEl: -1.2, rShZ: 0.3, spineY: 0.1 });
      p.rEl += Math.sin(t * 0.4) * 0.5;
      break;
  }
  return p;
}
