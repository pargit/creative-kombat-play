import { MOVES, FINISHERS, AIR, PHYS, SELF_SPECIALS, specialFor, SPECIALS_PER_ROUND, CHAIN_WINDOW, BUFFER_FRAMES, COMBO_LIMIT, DASH, ROLL, PARRY } from './moves.js';
import { createRig, heightOf } from './rig.js';
import { sfx } from './audio.js';

const sign = (v) => (v < 0 ? -1 : 1);
const SPECIAL_REPEAT = 60; // frames after a special starts before another one can
// Oron's VIVA LA FRANCE: the baguette reaches this much further and hits this much harder
const BAGUETTE = { reach: 1.5, power: 1.2 }; // +50% reach

export class Fighter {
  constructor(def, index, game) {
    this.def = def;
    this.index = index;
    this.game = game;
    this.rig = createRig(def);
    this.stats = { speed: 1, power: 1, health: 100, ...def.stats };
    // specials can't be blocked, dodged or rolled out of
    this.special = { ...specialFor(def), id: 'special', name: def.special?.name || 'SPECIAL', unblockable: true };
    this.opponent = null;
    // taller fighters reach further, and to keep it fair shorter ones move faster, in the same
    // proportion: 10% less reach is 1/0.9 = 11% more walking and dashing speed
    this.reachScale = heightOf(def);
    this.stats.speed /= this.reachScale;
    this.reset(index === 0 ? -2.6 : 2.6);
  }

  reset(x) {
    this.pos = { x, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.facing = x < 0 ? 1 : -1;
    this.maxHp = this.stats.health;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.t = 0;
    this.move = null;
    this.specialsLeft = SPECIALS_PER_ROUND;
    this.queuedSpecial = false; // pressed while theirs was playing: mine goes right after it
    this.goldHold = null; // Ori: gold until this fighter's special (which hit the gold) is over
    this.voided = false; // my special hit Ori's gold: it plays out but does nothing to him
    this.guard = null;  // using a special that hasn't landed yet: hits can't cancel it
    this.happy = 0; // frames left of Yali's happiness: can't attack or block
    this.poison = null; // Karina's smoke: damage over time
    this.smoked = 0;    // Karina's smoke: can't see her
    this.dizzy = 0;     // stars over the head (Ziv's weight)
    this.cage = null;   // Asis's cage
    this.gold = 0;      // Ori: frames left as gold (nothing hurts him)
    this.goldEndsNight = false; // Ori went gold during Shirley's night: it ends with his gold
    this.weak = 0;      // Noa's cough: frames left dealing half damage
    this.deaf = 0;      // Ofek's solo: frames left holding their ears (can't act)
    this.slow = 0;      // Netanel's earthquake: frames left at half speed
    this.french = 0;    // Oron's VIVA LA FRANCE: frames left French (baguette)
    this.scrambled = 0; // Michael's factory reset: frames left with mixed-up buttons
    this.altForm = false; // Minibar: Kung Fu Panda for the rest of the round
    this.breadBroken = false; // Oron: his baguette broke on gold Ori (still French, plain punches)
    this.night = 0;       // Shirley: frames left invisible in the night (their punches and kicks miss her)
    this.iv = false;      // Noa: hooked up to an I.V. for the rest of the round (after her cough)
    this.koBySpecial = false; // was the knockout blow a special move (only then: FATALITY)
    this.scramble = null; // which button does which job meanwhile
    this.rollReadyAt = this.clock || 0; // combo-breaker roll is ready again at this clock
    this.lastTap = null;  // for double-taps (dash / roll)
    this.parryAt = -99;   // when block was freshly tapped (counter window)
    this.lastDownAt = -99;
    this.downFor = 34;
    this.stun = 0;
    this.invuln = 0;
    this.comboTaken = 0;
    this.buffer = null;
    this.contactAt = -1;
    this.airUsed = false;
    this.seq = '';      // the buttons of the current string so far, e.g. 'PK'
    this.juggle = 0;    // air hits taken since being launched
    this.opacity = 1;
    this.damageTaken = 0;
    this.rig.setOpacity?.(1);
    this.rig.setFacing(this.facing);
  }

  // the body on screen: Oron's French model while VIVA LA FRANCE lasts, else the normal one
  // Oron's baguette is in his hand: French, and it hasn't broken (on gold Ori)
  get bread() { return this.french > 0 && !this.breadBroken; }

  get body() { return (this.french > 0 || this.altForm) && this.altRig ? this.altRig : this.rig; }

  get grounded() { return this.pos.y <= 0.0001; }
  get alive() { return this.hp > 0; }
  get rollReady() { return (this.clock || 0) >= this.rollReadyAt; }

  get busy() { return !['idle', 'walk', 'block', 'jump'].includes(this.state); }

  setState(state) {
    if (state !== this.state) { if (this.state === 'roll') this.rollThrough = false; this.state = state; this.t = 0; }
  }

  startMove(move, id, seq = '') {
    this.move = { ...move, id, uid: Math.random() };
    this.seq = seq;
    this.dashFrames = 0;
    this.hasHit = false;
    this.contactAt = -1;
    this.landed = false;
    this.buffer = null;
    this.state = 'attack';
    this.t = 0;
    if (id === 'special') {
      this.voided = false;
      this.specialAt = this.clock;
      this.specialsLeft--;
      sfx.special();
      this.game.onSpecial(this);
    } else {
      sfx.whoosh();
    }
  }

  get phase() {
    const m = this.move;
    if (!m) return null;
    if (this.t < m.startup) return 'startup';
    if (m.onLanding && !this.landed) return 'active';
    const t = m.onLanding ? this.t - this.landedAt + m.startup + m.active : this.t;
    if (t < m.startup + m.active) return 'active';
    if (t < m.startup + m.active + m.recovery) return 'recovery';
    return 'done';
  }

  phaseProgress() {
    const m = this.move;
    if (!m) return 0;
    const ph = this.phase;
    if (ph === 'startup') return this.t / m.startup;
    if (ph === 'active') return m.onLanding ? 0.5 : (this.t - m.startup) / m.active;
    const t = m.onLanding ? this.t - this.landedAt + m.startup + m.active : this.t;
    return Math.min(1, (t - m.startup - m.active) / m.recovery);
  }

  // One 60 Hz logic step. `input` is a Controller (or null while inputs are locked).
  tick(input) {
    const opp = this.opponent;
    this.t++;
    this.clock = (this.clock || 0) + 1;
    if (this.invuln > 0) this.invuln--;
    if (this.happy > 0 && --this.happy === 0) this.game.onJoyEnd?.(this);
    if (this.smoked > 0) this.smoked--;
    if (this.dizzy > 0) this.dizzy--;
    if (this.gold > 0 && !this.goldHold) this.gold--;
    // gone gold in the middle of Shirley's night: her night ends when his gold does (fair's fair)
    if (this.goldEndsNight) { if (opp.night > this.gold) opp.night = this.gold; if (this.gold <= 0) this.goldEndsNight = false; }
    if (this.weak > 0) this.weak--;
    if (this.deaf > 0) this.deaf--;
    if (this.slow > 0) this.slow--;
    if (this.night > 0) this.night--;
    if (this.french > 0 && !opp.guard) this.french--; // (French time stands still while their special plays)
    if (this.scrambled > 0 && --this.scrambled === 0) this.scramble = null;
    if (this.poison && this.alive) {
      if (--this.poison.left % this.poison.every === 0) this.tickDamage(this.poison.dmg, opp);
      if (this.poison.left <= 0) this.poison = null;
    }
    const toOpp = sign(opp.pos.x - this.pos.x);
    let held = this.unscramble(input?.held || {});
    let pressed = this.unscramble(input?.pressed || {});
    if (this.deaf > 0) {
      // Ofek's solo: hands over the ears, can't do anything
      held = {}; pressed = {}; this.buffer = null;
      if (this.state === 'walk' || this.state === 'block') this.setState('idle');
      this.vel.x = 0;
    }
    if (this.happy > 0) {
      // too happy to fight: attacks and blocking do nothing, moving and jumping still work
      held = { ...held, down: false, punch: false, kick: false, special: false };
      pressed = { ...pressed, punch: false, kick: false, special: false };
    }
    const speed = PHYS.walkSpeed * this.stats.speed * (this.slow > 0 ? 0.5 : 1); // earthquake slows you

    this.noteTaps(pressed, toOpp);
    // grab: punch and kick together (the second button within a few frames of the first)
    const startingStrike = this.state === 'attack' && (this.move?.id === 'punch' || this.move?.id === 'kick') && this.t <= 4;
    if ((pressed.punch && pressed.kick) || (startingStrike && ((this.move.id === 'punch' && pressed.kick) || (this.move.id === 'kick' && pressed.punch)))) {
      if (['idle', 'walk', 'block', 'dash'].includes(this.state) || startingStrike) {
        this.startMove(MOVES.grab, 'grab');
        pressed = {};
      }
    }

    const want = pressed.special ? 'special' : pressed.punch ? 'punch' : pressed.kick ? (held.down ? 'lowKick' : 'kick') : null;
    if (want) this.buffer = { action: want, at: this.clock };
    let buffered = this.buffer && this.clock - this.buffer.at <= BUFFER_FRAMES ? this.buffer.action : null;
    // a special can't be used again while the last one is still playing (some end their move at
    // once while what they threw is still flying), nor in the second after it started: mashing
    // the button never spends both specials at once
    if (buffered === 'special' && (this.guard || this.clock - (this.specialAt ?? -999) < SPECIAL_REPEAT)) { this.buffer = null; buffered = null; }
    // Two specials don't happen together: whoever pressed first goes first. Pressing it while
    // theirs is playing (even while being hit by it) lines mine up for right after.
    const selfSpecial = SELF_SPECIALS.includes(this.special.effect); // gold / France: can go at the same time
    if (buffered === 'special' && opp.guard && this.specialsLeft > 0 && !this.queuedSpecial && this.alive && this.state !== 'caged') {
      this.queuedSpecial = true;
      this.buffer = null;
      buffered = null;
    }
    // ...and it goes the moment theirs is over, out of whatever state theirs left me in
    if (this.queuedSpecial && (!opp.guard || selfSpecial) && this.alive && this.state !== 'caged') {
      if (this.grounded) { // (knocked into the air: as soon as they land)
        this.queuedSpecial = false;
        this.vel.x = 0;
        this.stun = 0;
        this.downAt = 0;
        this.invuln = 0;
        this.facing = toOpp;
        if (!this.game.tryFatality?.(this)) this.startMove(this.special, 'special'); // (it'd finish them: their fatality instead)
        buffered = null;
      }
    }

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'block': {
        this.facing = toOpp;
        this.comboTaken = 0;
        if (buffered === 'special') {
          if (this.specialsLeft > 0) { if (!this.game.tryFatality?.(this)) this.startMove(this.special, 'special'); break; } // (it'd finish them: their fatality instead)
          if (pressed.special) this.game.onSpecialEmpty(this);
          this.buffer = null;
        }
        if (buffered === 'punch') { this.startMove(MOVES.punch, 'punch', 'P'); break; }
        if (buffered === 'kick') { this.startMove(MOVES.kick, 'kick', 'K'); break; }
        if (buffered === 'lowKick') { this.startMove(MOVES.lowKick, 'lowKick'); break; }
        if (held.up) {
          const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
          this.vel.y = PHYS.jumpVel;
          this.vel.x = dir * speed * 1.35;
          this.airUsed = false;
          this.setState('jump');
          sfx.jump();
          break;
        }
        if (held.down) { this.setState('block'); this.vel.x *= 0.5; break; }
        const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        if (dir) {
          const back = dir !== this.facing;
          this.vel.x = dir * speed * (back ? 0.75 : 1);
          this.walkBack = back;
          this.setState('walk');
        } else {
          this.setState('idle');
        }
        break;
      }
      case 'jump':
        if (!this.airUsed && (pressed.kick || pressed.punch) && this.t > 3) {
          this.airUsed = true;
          if (pressed.punch) this.startMove(MOVES.airPunch, 'airPunch');
          else this.startMove(MOVES.airKick, 'airKick');
        } else if (this.grounded && this.t > 2) {
          sfx.land();
          this.setState('idle');
        }
        break;
      case 'attack': {
        // a string ending in a kick launched them: hold up to jump after them and keep going
        const lm = this.move;
        if (lm?.launcher && held.up && this.contactAt >= 0 && this.t - this.contactAt <= AIR.cancel && opp.state === 'launched') {
          this.move = null;
          this.facing = toOpp;
          this.vel.y = PHYS.jumpVel;
          this.vel.x = Math.max(-0.12, Math.min(0.12, (opp.pos.x - toOpp * 0.8 - this.pos.x) / 24));
          this.airUsed = false;
          this.setState('jump');
          sfx.jump();
          break;
        }
        if (this.tryCancel(pressed, held)) break;
        // keep walking while punching/kicking, so you can chase someone you just knocked back
        const m = this.move;
        if (this.grounded && m && !m.id.startsWith('special') && m.id !== 'special' && !m.air) {
          const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
          if (dir) { this.vel.x = dir * speed * (dir === this.facing ? 0.9 : 0.6); this.attackWalk = true; }
        }
        this.tickAttack(opp);
        break;
      }
      case 'dash':
        // a burst of speed; punch any time in a forward dash for the instant dash punch,
        // other attacks after a few frames
        if (buffered === 'punch' && this.dashFwd) {
          const v = this.vel.x;
          this.startMove(MOVES.dashPunch, 'dashPunch', 'P');
          this.vel.x = v; // keep the momentum into the punch
          break;
        }
        if (this.t > 5 && (buffered === 'punch' || buffered === 'kick' || buffered === 'lowKick')) {
          this.startMove(MOVES[buffered], buffered, { punch: 'P', kick: 'K' }[buffered] || '');
          break;
        }
        if (this.t >= this.dashFrames) this.setState('idle');
        break;
      case 'roll':
        this.vel.x *= 0.95;
        if (this.t >= ROLL.frames) { this.rollThrough = false; this.setState('idle'); }
        break;
      case 'hit':
      case 'blockHit':
        if (--this.stun <= 0) this.setState(held.down && this.state === 'blockHit' ? 'block' : 'idle');
        break;
      case 'caged':
        // trapped: mash punch or kick to break out
        this.vel.x = 0;
        // the cage blocks specials, and a special pressed in here doesn't fire once you're out
        this.buffer = null;
        if (pressed.punch || pressed.kick) this.cage?.struggle();
        if (!this.cage && this.state === 'caged') this.setState('idle');
        break;
      case 'launched':
        // knocked into the air by a launcher: can be juggled until landing
        this.buffer = null;
        if (this.grounded && this.vel.y <= 0 && this.t > 2) { this.downFor = 30; this.setState('knockdown'); }
        break;
      case 'knockdown':
        if (this.grounded && this.vel.y <= 0) {
          if (!this.downAt) { this.downAt = this.t; this.game.onGroundImpact(this); }
          if (this.t - this.downAt > this.downFor) { this.downAt = 0; this.setState('getup'); this.invuln = 30; }
        }
        break;
      case 'dazed':
        this.vel.x = 0;
        if (--this.stun <= 0) this.setState('idle');
        break;
      case 'shocked':
        // tied up and electrified: can't act, then drops to the floor
        if (--this.stun <= 0) {
          this.setState('knockdown');
          this.vel.x = -this.facing * 0.06;
          this.vel.y = 0.1;
        }
        break;
      case 'getup':
        if (this.t > 24) this.setState('idle'); // (the kip-up)
        break;
      case 'ko':
        if (this.grounded && !this.downAt) { this.downAt = this.t; this.game.onGroundImpact(this); }
        break;
    }

    this.physics();
  }

  // Strings: a hit that connected can be cancelled into the next hit (up to 4, any mix of
  // punch and kick); any connected normal can be cancelled into the special.
  tryCancel(pressed, held) {
    const m = this.move;
    if (!m) return false;
    if (this.contactAt < 0 || this.t - this.contactAt > CHAIN_WINDOW) return false;
        const next = this.buffer && this.clock - this.buffer.at <= BUFFER_FRAMES ? this.buffer.action : null;
    if (!next) return false;
    if (next === 'special' && this.specialsLeft > 0 && m.id !== 'special' && !this.guard && this.clock - (this.specialAt ?? -999) >= SPECIAL_REPEAT) { this.startMove(this.special, 'special'); return true; }
    const letter = next === 'punch' ? 'P' : next === 'kick' || next === 'lowKick' ? 'K' : null;
    if (!letter) return false;
    // in the air over a launched opponent: keep juggling (punch or kick, up to AIR.hits)
    if (m.air) {
      if (this.opponent.state !== 'launched' || this.opponent.juggle >= AIR.hits) return false;
      if (letter === 'P') this.startMove(MOVES.airPunch, 'airPunch');
      else this.startMove(MOVES.airKick, 'airKick');
      return true;
    }
    // on the ground: hits 2 and 3 of a string, then the finisher the 4 buttons spell
    const seq = this.seq + letter;
    if (!this.seq || seq.length > 4) return false;
    if (seq.length === 4) this.startMove(FINISHERS[seq], 'finisher', seq);
    else if (letter === 'P') this.startMove(MOVES.punch2, 'punch2', seq);
    else this.startMove(MOVES.kick2, 'kick2', seq);
    return true;
  }

  tickAttack(opp) {
    const m = this.move;
    const ph = this.phase;
    const activeStart = this.t === m.startup;

    // uppercut: lunge in during the wind-up so it always reaches
    if (m.rise && ph === 'startup') {
      this.facing = sign(opp.pos.x - this.pos.x);
      const gap = Math.abs(opp.pos.x - this.pos.x) - 0.7;
      this.vel.x = gap > 0 ? this.facing * Math.min(0.3, gap) : 0;
      // keep rushing in (up to ~1.5 s) until close enough to land it
      if (gap > 0.15 && this.t === m.startup - 1 && (this.dashFrames = (this.dashFrames || 0) + 1) < 90) this.t--;
    }
    // the later hits of a string: slide in during the wind-up (the last hit pushed them back)
    if (m.stepIn && ph === 'startup') {
      this.facing = sign(opp.pos.x - this.pos.x);
      const gap = Math.abs(opp.pos.x - this.pos.x) - 0.9;
      this.vel.x = gap > 0 ? this.facing * Math.min(0.2, gap) : 0;
    }
    // slam: steer in the air so you come down on the opponent
    if (m.onLanding && !this.landed && this.t > m.startup && !this.grounded) {
      const g = PHYS.gravity;
      const framesLeft = Math.max(1, (this.vel.y + Math.sqrt(this.vel.y * this.vel.y + 2 * g * this.pos.y)) / g);
      this.vel.x = Math.max(-0.35, Math.min(0.35, (opp.pos.x - this.pos.x) / framesLeft));
    }
    if (m.onLanding) {
      // slam: hop so you land right on the opponent
      if (activeStart) { this.vel.y = m.hop; this.vel.x = (opp.pos.x - this.pos.x) / (2 * m.hop / PHYS.gravity); }
      if (this.t > m.startup + 3 && this.grounded && !this.landed) {
        this.landed = true;
        this.landedAt = this.t;
        this.game.onShockwave(this);
        this.tryHit(m, { shockwave: true });
      }
    } else if (ph === 'active') {
      if (activeStart) {
        if (m.projectile) this.game.spawnProjectile(this, m);
        if (m.lasso) this.game.spawnLasso(this, m);
        if (m.joy) this.game.spawnJoy(this, m);
        if (m.effect) this.game.spawnEffect(this, m);
        if (m.rise) { this.vel.y = m.rise; this.vel.x = this.facing * 0.03; }
        if (m.teleport) this.teleportBehind(opp);
      }
      if (m.dashSpeed) {
        // the charge keeps going until it reaches the opponent (up to ~1.5 s)
        this.facing = sign(opp.pos.x - this.pos.x);
        this.vel.x = this.facing * m.dashSpeed * this.stats.speed;
        if (!this.hasHit && this.t === m.startup + m.active - 1 && (this.dashFrames = (this.dashFrames || 0) + 1) < 90) this.t--;
      }
      if (!m.projectile && !m.lasso && !m.joy && !m.effect && !this.hasHit) this.tryHit(m);
    }

    if (m.teleport) {
      if (ph === 'startup') this.opacity = 1 - this.phaseProgress();
      else this.opacity = Math.min(1, this.opacity + 0.25);
      this.rig.setOpacity(this.opacity);
    }

    if (ph === 'done') {
      this.move = null;
      if (this.grounded) this.setState('idle');
      else { this.airUsed = true; this.setState('jump'); }
    } else if (m.air && this.grounded && this.t > 2) {
      sfx.land();
      this.move = null;
      this.setState('idle');
    }
  }

  // where the mouth is (for Karina's smoke), from the auto-rig's neck or the toy's proportions
  mouthPos() {
    const L = this.rig.auto?.landmarks;
    const y = L ? L.neckY + 0.075 * L.H : 1.85 * heightOf(this.def);
    return { x: this.pos.x + this.facing * 0.2 * heightOf(this.def), y: this.pos.y + y };
  }

  // Taps that matter even mid-freeze (the hit-stop after every hit, when tick() doesn't run):
  // counter taps, double-taps for dash/roll, and attack presses (kept in the input buffer).
  noteTaps(pressed, toOpp) {
    // counter: a fresh tap of block (not held or mashed) opens a short counter window
    if (pressed.down) {
      if (this.clock - this.lastDownAt > PARRY.mash) this.parryAt = this.clock;
      this.lastDownAt = this.clock;
    }
    // double-tap left/right: dash, or the combo-breaker roll when tapping back with it ready
    const tapDir = pressed.right ? 1 : pressed.left ? -1 : 0;
    if (tapDir) {
      const dbl = this.lastTap && this.lastTap.dir === tapDir && this.clock - this.lastTap.at <= DASH.tapWindow;
      this.lastTap = dbl ? null : { dir: tapDir, at: this.clock };
      if (dbl && this.alive) this.doubleTap(tapDir, toOpp);
    }
  }

  // called by the match during hit-stop: remember taps and attack presses for when it ends
  noteFrozenInput(input) {
    if (!input || this.deaf > 0 || !this.alive) return;
    const p = this.unscramble(input.pressed || {}), h = this.unscramble(input.held || {});
    this.noteTaps(p, sign(this.opponent.pos.x - this.pos.x));
    if (this.happy > 0) return;
    const want = p.special ? 'special' : p.punch ? 'punch' : p.kick ? (h.down ? 'lowKick' : 'kick') : null;
    if (want) this.buffer = { action: want, at: this.clock };
  }

  // double-tap left/right: forward dash, back dash, or (tapping back with it ready) the
  // combo-breaker roll, which also works while being hit
  doubleTap(dir, toOpp) {
    if ((this.pinnedUntil || 0) > (this.clock || 0)) return; // held in place by a special (no rolling out)
    const back = dir !== toOpp;
    // the end of a roll (once you're hittable again) can go straight into a forward dash
    const free = ['idle', 'walk', 'block'].includes(this.state) || (this.state === 'roll' && !back && this.t >= ROLL.invuln);
    // anywhere in a combo: flinching, blocking, knocked into the air or down, getting up
    const inCombo = ['hit', 'blockHit', 'knockdown', 'launched', 'getup'].includes(this.state);
    // every double-tap back is a roll while it's ready (spending it well is up to you);
    // on cooldown it's a back dash
    const cornered = PHYS.arenaHalf - this.pos.x * dir < ROLL.corner;
    // (no rolling out of someone's special while it plays, e.g. Yahli's flag pole kicks)
    if (back && this.rollReady && this.alive && !this.opponent.guard && (free || inCombo || this.state === 'dash') && (this.grounded || inCombo)) {
      if (!this.grounded) { this.pos.y = 0; this.vel.y = 0; } // knocked up: break out and drop straight into the roll
      this.downAt = 0;
      this.move = null;
      this.setState('roll');
      this.t = 0;
      this.facing = toOpp;
      // backed into the wall? roll forward instead, under the opponent to their other side
      const opp = this.opponent;
      this.rollDir = cornered ? -dir : dir;
      this.rollThrough = cornered && Math.abs(opp.pos.x - this.pos.x) < 3;
      let dist = ROLL.speed * 14.16; // how far the normal roll goes (speed decays 5% a frame)
      if (this.rollThrough) {
        // come up well clear of them (out of punch range)
        const lim = PHYS.arenaHalf - 0.2, target = Math.max(-lim, Math.min(lim, opp.pos.x + this.rollDir * 2.2));
        dist = Math.abs(target - this.pos.x);
      }
      this.vel.x = this.rollDir * dist / 14.16;
      this.invuln = this.rollThrough ? ROLL.frames + 10 : ROLL.invuln;
      this.comboTaken = 0;
      this.rollReadyAt = this.clock + ROLL.cooldown;
      this.game.onRoll?.(this, inCombo);
      return;
    }
    if (!free || !this.grounded) return;
    this.setState('dash');
    this.t = 0;
    this.facing = toOpp;
    this.dashFrames = back ? DASH.backFrames : DASH.fwdFrames;
    this.dashFwd = !back;
    this.rollThrough = false;
    this.vel.x = dir * (back ? DASH.backSpeed : DASH.fwdSpeed) * this.stats.speed;
    this.game.onDash?.(this);
  }

  // effects that run the special themselves call this when they're done with the fighter
  endSpecial() {
    const m = this.move;
    if (this.state !== 'attack' || !m || m.id !== 'special') return;
    this.t = Math.max(this.t, m.startup + m.active);
  }

  // Ori's gold soaks up a whole special: it plays out in full (he's thrown around by it like
  // anyone) but none of its hits do damage and none of its effects land. He stays gold until
  // it's over, then the gold breaks.
  goldSoak(attacker) {
    if (attacker.voided) return true;
    if (!(this.gold > 0)) return false;
    attacker.voided = true;
    this.goldHold = attacker;
    return true;
  }
  releaseGold() {
    this.goldHold = null;
    this.breakGold();
  }

  // Ori's gold ends early when another special reaches him
  breakGold() {
    if (!(this.gold > 0)) return;
    this.gold = 0; // (Shirley's night, if it was tied to it, ends too: tick)
    this.game.onGoldBreak?.(this);
  }

  // damage over time (poison, cage): no hit reaction, but can K.O.
  tickDamage(d, from) {
    if (!this.alive || this.gold > 0 || from?.voided) return;
    if (from?.weak > 0) d *= 0.5;
    this.hp = Math.max(0, this.hp - d);
    this.damageTaken += d;
    this.rig.flash();
    if (this.hp <= 0) {
      this.koBySpecial = true; // poison, the cage…: all from specials
      this.cage = null;
      this.move = null;
      this.setState('ko');
      this.vel.y = 0.12;
      this.vel.x = -sign((from?.pos.x ?? 0) - this.pos.x) * -0.08;
    }
  }

  teleportBehind(opp) {
    const side = -sign(this.pos.x - opp.pos.x);
    let x = opp.pos.x + side * 1.0;
    if (Math.abs(x) > PHYS.arenaHalf - 0.3) x = opp.pos.x - side * 1.0;
    this.pos.x = x;
    this.facing = sign(opp.pos.x - this.pos.x);
    sfx.teleport();
    this.game.onTeleport(this);
  }

  tryHit(m, { shockwave = false } = {}) {
    // Noa on her I.V.: a combo that ends with a kick is her swinging the I.V. stand up into them
    if (this.iv && m.launcher && m.id !== 'special') m = this.ivSwing(m);
    const opp = this.opponent;
    const special = m.id === 'special';
    if (!opp.alive || (opp.invuln > 0 && !special) || opp.state === 'ko' || opp.state === 'caged') return false;
    const dx = (opp.pos.x - this.pos.x) * this.facing;
    if (shockwave) {
      if (Math.abs(dx) > m.range || (opp.pos.y > 0.35 && !special)) return false;
    } else {
      if (dx < -0.35 || dx > m.range * this.reachScale * (this.bread && !special ? BAGUETTE.reach : 1) + PHYS.bodyWidth) return false;
      // crouching in a low kick: only reachable up to ~0.85 m, so punches go over
      const ducking = opp.state === 'attack' && opp.move?.lowProfile && opp.phase !== 'recovery';
      const oppTop = opp.pos.y + (opp.state === 'knockdown' && opp.downAt ? 0.5 : ducking ? 0.85 : PHYS.bodyHeight);
      const lo = this.pos.y + m.height[0], hi = this.pos.y + m.height[1];
      if (!special && (hi < opp.pos.y || lo > oppTop)) return false;
      if (!special && ducking && m.high) return false; // punches pass over the spin-sweep
    }
    if (m.grab && (!opp.grounded || ['knockdown', 'getup', 'ko', 'roll'].includes(opp.state))) return false;
    // a knockdown ends the combo: no punches/kicks on someone already knocked down
    if (!special && opp.state === 'knockdown') return false;
    // someone launched into the air can only be reached by jumping after them
    if (!special && opp.state === 'launched' && !m.air) return false;
    this.hasHit = true;
    // Oron's baguette slash (his kicks while French) breaks through a block
    if (!special && this.bread && this.altRig && this.baguetteAnim(m) === 'slash') {
      const guarded = opp.isBlocking(this.pos, m);
      m = { ...m, unblockable: true };
      if (guarded) this.game.onGuardBreak?.(this, opp);
    }
    // Oron's baguette breaks on gold Ori: still French, but plain punches and kicks from now on
    const breaking = !special && this.bread && this.altRig && opp.gold > 0;
    if (breaking) { this.breadBroken = true; this.game.onBaguetteBreak?.(this, opp); }
    // only a clean hit lets you continue the combo; a blocked hit leaves you open
    const res = opp.receive(this, m);
    if (breaking && !opp.goldHold) opp.breakGold(); // (the baguette and the gold break together)
    if (res === 'hit') {
      this.contactAt = this.t;
      if (m.finisher) this.game.onFinisher?.(this, m);
    }
    return true;
  }

  // Blocking: hold BLOCK, or walk away from your opponent (like classic fighting games).
  // A teleport that reappears behind you can still be blocked if you were already blocking.
  isBlocking(from, m = {}) {
    if (!this.grounded) return false;
    const guarding = this.state === 'block' || this.state === 'blockHit' || (this.state === 'walk' && this.walkBack);
    if (!guarding) return false;
    return m.teleport || this.state !== 'walk' ? true : sign(from.x - this.pos.x) === this.facing;
  }

  // Take a hit from `attacker` (a Fighter) using move `m`. `from` = {x} of the hit source.
  receive(attacker, m, from = attacker.pos) {
    const dir = -sign(from.x - this.pos.x);
    if (m.id === 'special') this.game.onSpecialLanded?.(attacker);
    const soaked = m.id === 'special' && this.goldSoak(attacker); // gold Ori: the hit, but nothing else
    if (soaked) this.game.onGoldBlock?.(this);
    // using a special that hasn't landed yet: a hit can't cancel it. Punches and kicks do
    // nothing; the other fighter's special still does its damage, but doesn't stop this one.
    if (!soaked && this.guard && attacker !== this && this.alive && !(this.gold > 0)) {
      if (m.id !== 'special') return 'miss';
      const d = m.damage * (attacker.weak > 0 ? 0.5 : 1);
      if (d < this.hp) {
        this.hp -= d;
        this.damageTaken += d;
        this.body.flash();
        this.game.onHit(attacker, this, d, true, from, m);
        return 'hit';
      }
    }
    // Shirley in the night: they can't see her, every punch and kick misses
    // …unless gold Ori lights up the dark: then she's there to be hit
    if (this.night > 0 && attacker !== this && m.id !== 'special' && !(attacker.gold > 0)) { this.game.onNightMiss?.(this); return 'miss'; }
    if (this.state === 'caged' && !m.fromCage) return 'miss';
    if (this.gold > 0 && !soaked) { this.game.onGoldBlock?.(this); return 'miss'; } // gold: nothing gets through
    // a counter-hit: struck while starting up your own attack
    const counter = this.state === 'attack' && this.phase === 'startup';
    // hit before your special came out? you get it back
    if (!soaked && this.state === 'attack' && this.move?.id === 'special' && this.phase === 'startup' && !(this.isBlocking(from, m) && !m.unblockable && !m.grab && !(attacker.gold > 0))) {
      this.specialsLeft++;
      this.game.onSpecialRefund?.(this);
    }
    const guard = m.id !== 'special' && this.isBlocking(from, m); // specials can't be blocked
    // counter: blocked a punch/kick right after tapping block: no damage, the attacker is stunned
    if (guard && !m.unblockable && !m.grab && !(attacker.gold > 0) && this.clock - this.parryAt <= PARRY.window) {
      this.parryAt = -99;
      this.setState('block');
      this.vel.x = 0;
      attacker.move = null;
      attacker.setState('hit');
      attacker.t = 0;
      attacker.stun = PARRY.stun; // 0.5 s stunned, with stars over their head
      attacker.dizzy = Math.max(attacker.dizzy, PARRY.stun);
      attacker.vel.x = dir * -0.12;
      this.game.onParry?.(this, attacker);
      return 'block';
    }
    // air counter: launched, tap block just before an air hit lands: they get knocked down
    if (this.state === 'launched' && m.air && this.clock - this.parryAt <= AIR.counter) {
      this.parryAt = -99;
      this.juggle = 0;
      this.comboTaken = 0;
      this.setState('jump');
      this.airUsed = false; // and you get a free air attack on the way down
      this.vel.y = Math.max(this.vel.y, 0.12);
      this.vel.x = 0;
      attacker.move = null;
      attacker.downFor = 40;
      attacker.setState('knockdown');
      attacker.vel.y = 0.05;
      attacker.vel.x = -dir * 0.12;
      attacker.dizzy = Math.max(attacker.dizzy, 70);
      this.game.onAirCounter?.(this, attacker);
      return 'block';
    }
    if (guard && !m.unblockable && !m.grab && !(attacker.gold > 0)) { // gold Ori's hits and grabs go through blocks
      const chip = m.damage * 0.12 * (attacker.weak > 0 ? 0.5 : 1);
      this.hp = Math.max(1, this.hp - chip);
      this.stun = m.blockstun;
      this.vel.x = dir * m.push * 0.8;
      this.setState('blockHit');
      this.t = 0;
      this.pushAttacker(attacker, dir, m.push * 0.8);
      this.game.onBlock(attacker, this, from);
      return 'block';
    }
    // plain multiplication instead of Math.pow: identical on every browser (online lockstep)
    let scale = 1;
    for (let i = 0; i < this.comboTaken; i++) scale *= 0.88;
    const isSpecial = m.id === 'special';
    const weak = attacker.weak > 0 ? 0.5 : 1; // coughed on by Noa: half damage
    const baguette = attacker.bread ? BAGUETTE.power : 1; // Oron's baguette
    const dmg = soaked ? 0 : (isSpecial ? m.damage : Math.max(1, m.damage * attacker.stats.power * baguette * scale * (counter ? 1.25 : 1))) * weak;
    // (a special whose finale is the finishing blow: they hang on at 1 until it, e.g. Or Haim's explosion)
    this.hp = Math.max(this.holdLife ? Math.min(1, this.hp) : 0, this.hp - dmg);
    this.damageTaken += dmg;
    this.comboTaken++;
    this.move = null;
    if (!soaked) this.body.flash(); // (gold Ori stays gold: no white hit flash)
    this.rig.setOpacity?.(1);
    this.opacity = 1;
    this.downAt = 0;
    const heavy = m.knockdown || m.launcher || m.damage >= 10;
    if (this.hp <= 0) {
      this.koBySpecial = isSpecial;
      this.setState('ko');
      this.vel.x = dir * 0.12;
      this.vel.y = 0.16;
    } else if (m.launcher && this.comboTaken < COMBO_LIMIT) {
      // a string ending in a kick: up into the air
      this.setState('launched');
      this.juggle = 0;
      this.vel.y = m.launch;
      this.vel.x = dir * m.push;
    } else if (this.state === 'launched' && !isSpecial) {
      // juggled: each air hit pops them back up, the last one spikes them to the floor
      if (++this.juggle >= AIR.hits || this.comboTaken >= COMBO_LIMIT) {
        this.downFor = 34;
        this.setState('knockdown');
        this.vel.y = AIR.spike;
        this.vel.x = dir * 0.1;
      } else {
        this.vel.y = AIR.pop;
        this.vel.x = dir * 0.03;
      }
      if (!attacker.grounded) attacker.vel.y = Math.max(attacker.vel.y, AIR.hover);
    } else if (m.daze && !soaked) {
      // Ziv's weight: dazed on the spot (stars, can't act) for m.daze frames; hits still land
      this.setState('dazed');
      this.t = 0;
      this.stun = m.daze;
      this.dizzy = Math.max(this.dizzy, m.daze);
      this.vel.x = 0;
      if (this.vel.y > 0) this.vel.y = 0;
    } else if (m.shock) {
      this.setState('shocked');
      this.t = 0;
      this.stun = m.hitstun;
      this.vel.x = 0;
      if (this.vel.y > 0) this.vel.y = 0;
    } else if (m.knockdown || !this.grounded || (this.comboTaken >= COMBO_LIMIT && !m.noLimit)) {
      this.downFor = m.downFor || 34;
      if (m.downFor) this.dizzy = m.downFor + 40;
      this.setState('knockdown');
      this.vel.x = dir * (m.push + 0.05);
      this.vel.y = m.launch ?? 0.13;
    } else {
      this.setState('hit');
      this.t = 0;
      this.stun = m.hitstun + (counter ? 10 : 0);
      this.vel.x = dir * m.push;
      this.pushAttacker(attacker, dir, m.push);
    }
    if (soaked) return 'gold'; // (effects only land on 'hit')
    if (counter) this.game.onCounter?.(attacker);
    if (m.grab) this.game.onThrow?.(attacker, this);
    this.game.onHit(attacker, this, dmg, heavy, from, m);
    return 'hit';
  }

  // pinned against the wall? then the attacker gets pushed back instead (no corner loops)
  pushAttacker(attacker, dir, push) {
    if (Math.abs(this.pos.x) > PHYS.arenaHalf - 0.4 && attacker.grounded) attacker.vel.x = -dir * push;
  }

  physics() {
    const p = this.pos, v = this.vel;
    if (!this.grounded || v.y > 0) v.y -= PHYS.gravity;
    p.x += v.x;
    p.y += v.y;
    if (p.y <= 0) {
      p.y = 0;
      if (v.y < 0) v.y = 0;
      const walking = this.state === 'walk' || this.attackWalk || this.state === 'dash' || this.state === 'roll' || (this.state === 'attack' && this.move?.lunge && this.phase !== 'recovery') || (this.state === 'attack' && this.move?.dashSpeed && this.phase === 'active');
      if (!walking) v.x *= 0.78;
    }
    const lim = PHYS.arenaHalf;
    if (p.x < -lim) { p.x = -lim; v.x = Math.max(0, v.x); }
    if (p.x > lim) { p.x = lim; v.x = Math.min(0, v.x); }
    if (this.state === 'walk' || this.attackWalk) v.x = 0; // walking speed is re-applied every frame from input
    this.attackWalk = false;
  }

  // Render-rate update: pick the animation and move the rig.
  render(dt) {
    // a special effect can take over the body's pose (e.g. Or Haim's combo with Hoshech Mavet)
    const ov = this.poseOverride;
    const anim = ov?.anim ?? this.animName();
    const m = this.move;
    const duration = m ? m.startup + m.active + m.recovery : this.state === 'hit' ? 20 : undefined;
    const rig = this.body;
    if (this.altRig) { this.altRig.object.visible = rig === this.altRig; if (rig === this.altRig) this.rig.object.visible = false; else if (this.opacity > 0.02) this.rig.object.visible = true; }
    rig.setFacing(this.facing);
    rig.object.position.set(this.pos.x, this.pos.y, 0);
    rig.update(dt, anim, {
      t: this.t,
      phase: ov ? ov.phase : m ? this.phase : null,
      pt: ov ? ov.pt : m ? this.phaseProgress() : 0,
      back: this.walkBack,
      moveId: m?.uid ?? (this.state === 'hit' || this.state === 'blockHit' ? `${this.state}${this.comboTaken}` : ''),
      duration,
    });
    // the combo-breaker roll: a full backward somersault around the body's middle
    const obj = rig.object;
    if (this.state === 'roll') {
      const k = Math.min(1, this.t / (ROLL.frames - 4));
      const a = -(this.rollDir ?? -this.facing) * Math.PI * 2 * (k * k * (3 - 2 * k)), h = 0.75 * heightOf(this.def);
      obj.rotation.set(0, 0, a);
      obj.position.set(this.pos.x + h * Math.sin(a), this.pos.y + h - h * Math.cos(a), 0);
      this._rolling = true;
    } else if (this._rolling) { this._rolling = false; obj.rotation.set(0, 0, 0); }
  }

  // Michael's factory reset: each button does another one's job
  unscramble(buttons) {
    if (!(this.scrambled > 0) || !this.scramble) return buttons;
    const out = { ...buttons };
    for (const k of Object.keys(this.scramble)) out[k] = false;
    for (const [k, to] of Object.entries(this.scramble)) if (buttons[k]) out[to] = true;
    return out;
  }

  // Noa's I.V. swing: the kick-ending finisher (it still launches them), a bit more reach and damage
  ivSwing(m) { return { ...m, finisher: 'I.V. SWING', damage: m.damage + 2, range: m.range * 1.25 }; }

  // Oron's French moveset: every punch is a stab with the baguette and every kick a slash
  // (specials, grabs and the low sweep stay as they are)
  baguetteAnim(m) {
    const P = ['punch', 'punch2', 'dashPunch', 'airPunch'], K = ['kick', 'kick2', 'airKick'];
    const last = m.id === 'finisher' ? this.seq.slice(-1) : P.includes(m.id) ? 'P' : K.includes(m.id) ? 'K' : '';
    return last === 'P' ? 'stab' : last === 'K' ? 'slash' : m.anim;
  }

  animName() {
    switch (this.state) {
      case 'attack': return this.iv && this.move.launcher ? 'ivSwing' : this.bread && this.altRig ? this.baguetteAnim(this.move) : this.move.anim;
      case 'jump': return 'jump';
      case 'dash': return 'dash';
      case 'roll': return 'roll';
      case 'block': return 'block';
      case 'blockHit': return 'blockHit';
      case 'hit': return 'hit';
      case 'caged': return 'block';
      case 'shocked': return 'shocked';
      case 'dazed': return 'dazed';
      case 'idle': if (this.def.dummy && !(this.deaf > 0) && !(this.happy > 0)) return 'dummy';
        return this.deaf > 0 ? 'ears' : this.happy > 0 ? 'happy' : 'idle';
      case 'walk': return this.happy > 0 ? 'happy' : 'walk';
      case 'knockdown':
      case 'launched': return 'knockdown';
      case 'getup': return 'getup';
      case 'ko': return 'ko';
      case 'win': return 'win';
      case 'taunt': return 'taunt';
      case 'select': return 'select';
      default: return 'idle';
    }
  }
}

// Thrown specials
export class Projectile {
  constructor(owner, move, mesh) {
    this.owner = owner;
    this.move = move;
    this.mesh = mesh;
    this.dir = owner.facing;
    this.x = owner.pos.x + owner.facing * 0.8;
    this.y = owner.pos.y + 1.35;
    this.life = 60 * 8; // chases for up to 8 seconds
    this.dead = false;
  }

  // Specials can't be dodged: the thrown object chases the opponent until it connects.
  tick() {
    const opp = this.owner.opponent;
    // bounced off gold Ori: flies back up and away, harmless
    if (this.bouncing) { this.x += this.vx; this.y += this.vy; this.vy -= 0.012; if (--this.bouncing <= 0 || this.y < 0) this.dead = true; return; }
    const speed = this.move.projectile.speed;
    const tx = opp.pos.x, ty = opp.pos.y + (opp.state === 'knockdown' || opp.state === 'ko' ? 0.4 : 1.2);
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * speed;
    this.y += (dy / d) * speed;
    this.dir = dx < 0 ? -1 : 1;
    if (--this.life <= 0 || !opp.alive) { this.dead = true; return; }
    const top = opp.pos.y + (opp.state === 'knockdown' ? 0.6 : PHYS.bodyHeight);
    if (Math.abs(this.x - opp.pos.x) < 0.55 && this.y > opp.pos.y - 0.3 && this.y < top + 0.3) {
      if (opp.receive(this.owner, this.move, { x: this.x }) === 'gold') {
        this.bouncing = 40; this.vx = -this.dir * 0.11; this.vy = 0.17; this.hit = true;
        this.owner.game.onGoldBounce?.(opp, this.x, this.y);
        return;
      }
      this.dead = true;
      this.hit = true;
    }
  }
}
