// A computer opponent that presses the same virtual buttons a player would.
//
// It reacts to what it SEES, with a human-like reaction delay per difficulty:
//  • blocks attacks it sees starting in range (and projectiles coming at it)
//  • punishes moves that whiffed or were blocked, using 4-hit punch/kick strings (and jumping after a launch)
//  • anti-airs jump-ins, sweeps opponents who keep blocking or throwing punches
//  • keeps spacing in neutral and pokes with kicks instead of walking into punches
// Mashing buttons at it gets blocked and punished.

export const LEVELS = {
  easy: { react: 26, block: 0.25, punish: 0.25, antiAir: 0.15, chain: 0.25, throw: 0.15, poke: 0.3, think: 22, special: 0.15 },
  normal: { react: 14, block: 0.7, punish: 0.72, antiAir: 0.5, chain: 0.6, throw: 0.4, poke: 0.5, think: 12, special: 0.3 },
  hard: { react: 9, block: 0.88, punish: 0.92, antiAir: 0.85, chain: 0.9, throw: 0.7, poke: 0.7, think: 7, special: 0.45 },
};

// how close an attack must be to actually reach (slightly generous, as a cautious player would judge it)
const ATTACK_REACH = { punch: 1.75, punch2: 1.8, kick: 1.9, kick2: 1.95, finisher: 1.95, lowKick: 1.85, airKick: 1.8, airPunch: 1.7, special: 2.4 };

export class AI {
  constructor(fighter, level = 'normal') {
    this.f = fighter;
    this.cfg = LEVELS[level] || LEVELS.normal;
    this.hold = [];      // queued button presses [{action, frames}]
    this.blockUntil = 0;
    this.seen = [];      // what the opponent was doing, frame by frame
    this.decided = new Set(); // opponent move uids we already reacted to
    this.clock = 0;
    this.nextThink = 0;
    this.walking = null;
    this.oppBlocking = 0;
  }

  press(action, frames = 2) { this.hold.push({ action, frames }); }
  roll(p) { return Math.random() < p; }

  // Stopping and re-starting a walk within a moment reads as a double-tap (dash / roll).
  // Only let deliberate taps (queued presses, e.g. the combo-breaker roll) through.
  tick(game) {
    const fromHold = this.hold.length > 0;
    const out = this.think(game);
    this.lastDir ||= {}; this.dirAt ||= {};
    for (const d of ['left', 'right']) {
      const now = !!out[d];
      if (now && !this.lastDir[d]) {
        if (!fromHold && this.clock - (this.dirAt[d] ?? -99) <= 24) out[d] = false; // longer than the double-tap window
        else this.dirAt[d] = this.clock;
      }
      this.lastDir[d] = !!out[d];
    }
    return out;
  }

  think(game) {
    const me = this.f, opp = me.opponent, c = this.cfg;
    this.clock++;
    if (this.decided.size > 300) this.decided.clear();
    const out = {};
    const dir = opp.pos.x > me.pos.x ? 1 : -1;
    const toward = dir > 0 ? 'right' : 'left';
    const away = dir > 0 ? 'left' : 'right';
    const dist = Math.abs(opp.pos.x - me.pos.x);

    // perception with reaction delay
    this.seen.push({ state: opp.state, phase: opp.phase, uid: opp.move?.uid, id: opp.move?.id, y: opp.pos.y, vy: opp.vel.y, x: opp.pos.x });
    if (this.seen.length > 40) this.seen.shift();
    const s = this.seen[Math.max(0, this.seen.length - 1 - c.react)];
    this.oppBlocking = opp.state === 'block' ? this.oppBlocking + 1 : 0;

    // finish queued presses first
    // spam detection: count how many attacks the opponent started recently
    if (opp.state === 'attack' && opp.move && opp.move.uid !== this.lastOppMove) { this.lastOppMove = opp.move.uid; (this.oppAttacks ||= []).push(this.clock); }
    this.oppAttacks = (this.oppAttacks || []).filter((t) => this.clock - t < 90);
    if (this.hold.length) {
      const h = this.hold[0];
      for (const a of [].concat(h.action)) out[a] = true; // e.g. ['down', 'kick'] = a low sweep
      if (--h.frames <= 0) this.hold.shift();
      return out;
    }
    if (!opp.alive) return out;
    // launched and they're swinging at us in the air: sometimes tap block for the air counter
    if (me.state === 'launched' && opp.state === 'attack' && opp.move?.air && opp.phase === 'startup' && !this.decided.has(`ac${opp.move.uid}`)) {
      this.decided.add(`ac${opp.move.uid}`);
      if (this.roll(c.block * 0.35)) { this.press('down', 2); return out; }
    }
    // we launched them: jump after them and hit them in the air
    if (me.state === 'jump' && !me.airUsed && opp.state === 'launched' && me.t > 4 && Math.abs(opp.pos.x - me.pos.x) < 1.7) {
      this.press(this.roll(0.5) ? 'punch' : 'kick');
      return out;
    }
    // combo breaker: caught in a combo with the roll ready? double-tap back
    if ((me.state === 'hit' || (me.state === 'knockdown' && me.downAt === 0)) && me.comboTaken >= 1 && me.rollReady && !this.decided.has(`roll${me.comboTaken}${opp.move?.uid}`)) {
      this.decided.add(`roll${me.comboTaken}${opp.move?.uid}`);
      if (this.roll(c.block * c.block * 0.7)) { this.hold.push({ action: away, frames: 2 }, { action: [], frames: 2 }, { action: away, frames: 2 }); return out; }
    }
    // caged: mash to break out
    if (me.state === 'caged') { if (this.clock % 6 === 0) this.press(this.clock % 12 ? 'punch' : 'kick', 2); return out; }
    // Ori is gold: punches do nothing and his go through blocks; break it with a special, else keep away
    if (opp.gold > 0) {
      if (me.specialsLeft > 0 && !me.busy && !this.decided.has(`brk${opp.gold > 100}`) && this.roll(c.special * 2)) { this.decided.add(`brk${opp.gold > 100}`); this.press('special'); return out; }
      if (dist < 2.6) out[away] = true;
      return out;
    }
    // Ofek mid-solo: he's open, so go and hit him to stop it
    if (opp.state === 'attack' && opp.move?.effect === 'guitar' && opp.phase === 'active' && !me.busy) {
      if (dist > 1.25) out[toward] = true;
      else if (this.clock % 9 === 0) this.press(this.roll(0.5) ? 'punch' : 'kick');
      return out;
    }
    // keep guarding while the opponent keeps swinging in range
    if (me.state === 'blockHit' || (opp.state === 'attack' && dist < (ATTACK_REACH[opp.move?.id] || 1.2) && this.clock < this.blockUntil + 12 && this.roll(c.block * 0.5))) this.blockUntil = Math.max(this.blockUntil, this.clock + 10);

    // chain our own string when it connected
    if (me.state === 'attack' && me.contactAt >= 0 && me.t - me.contactAt < 10 && !this.decided.has(`chain${me.move.uid}`)) {
      this.decided.add(`chain${me.move.uid}`);
      const m = me.move;
      if (m.launcher) { if (this.roll(c.chain)) this.press('up', 14); } // held through the hit-stop
      else if (m.air) { if (opp.state === 'launched' && this.roll(c.chain)) this.press(this.roll(0.5) ? 'punch' : 'kick'); }
      else if (me.seq && me.seq.length < 4 && this.roll(c.chain)) {
        if (me.seq.length >= 2 && me.specialsLeft > 0 && this.roll(c.special * 0.4)) this.press('special');
        else this.press(this.roll(0.5) ? 'punch' : 'kick');
      }
      return out;
    }
    // just finished blocking a hit? hit back straight away (blocked attacks leave the attacker open)
    const prev = this.prevState;
    const wasBlocking = prev === 'blockHit';
    this.prevState = me.state;
    // just recovered from a hit or got up: we're a beat behind, so don't swing into their next
    // attack (that's how a masher loops you) — sweep under a punch, or guard
    if ((prev === 'hit' || prev === 'getup') && me.state !== prev && !me.busy && dist < 1.8) {
      if (opp.state === 'attack' && opp.move?.high && opp.phase !== 'recovery' && dist < 1.5 && this.roll(c.punish * 0.7)) {
        this.hold.push({ action: ['down', 'kick'], frames: 2 });
        return out;
      }
      if (this.roll(c.block)) this.blockUntil = Math.max(this.blockUntil, this.clock + 14);
    }
    if (wasBlocking && me.state !== 'blockHit' && !me.busy && dist < 1.45 && this.roll(c.punish)) {
      this.blockUntil = 0;
      // still punching? sweep under the next one; otherwise punch the opening
      if (opp.state === 'attack' && opp.move?.high) this.hold.push({ action: ['down', 'kick'], frames: 2 });
      else this.press('punch');
      return out;
    }
    if (me.busy) return out;

    // spam detection (counted every frame, above)
    const spamming = this.oppAttacks.length >= 3 && dist < 2.0;
    if (spamming && !me.busy && me.state !== 'blockHit' && !opp.happy) {
      // against a masher: sweep under the punches, or hold block and punish the gaps
      // (the spin-sweep ducks under punches, so it beats a punch that's coming)
      if (opp.move?.high && opp.phase !== 'recovery' && dist < 1.6 && !this.decided.has(`sw${opp.move.uid}`)) {
        this.decided.add(`sw${opp.move.uid}`);
        if (this.roll(c.punish * 0.85)) { this.hold.push({ action: ['down', 'kick'], frames: 2 }); return out; }
      }
      // only strike back in the masher's recovery; otherwise keep guard up (don't punch into punches)
      // only strike back early in the masher's recovery (a late punch trades with their next one)
      const left = opp.move ? opp.move.startup + opp.move.active + opp.move.recovery - opp.t : 0;
      if (opp.state === 'attack' && opp.phase === 'recovery' && left >= 7 && dist < 1.45 && this.roll(c.punish)) { this.press('punch'); return out; }
      if (this.roll(c.block)) { out.down = true; return out; }
      // and don't walk into their punches: wait at the edge of their reach
      if (dist > 1.3) return out;
    }
    // smoked: can't see the opponent, so no reactions
    if (me.smoked > 0) { if (this.roll(0.04)) this.press(this.roll(0.5) ? 'punch' : 'kick'); return out; }
    // ── defence ──
    const projectileIncoming = game.projectiles.some((p) => p.owner === opp && Math.abs(p.x - me.pos.x) < 3.4 && Math.sign(me.pos.x - p.x) === p.dir)
      || (game.lassos || []).some((l) => l.owner === opp && l.state === 'flying')
      || (game.joys || []).some((j) => j.owner === opp);
    const threat = s.state === 'attack' && s.uid && s.phase !== 'recovery' && dist < (ATTACK_REACH[s.id] || 2);
    if (threat && (s.id === 'punch' || s.id === 'punch2') && dist < 1.5 && !this.decided.has(`duck${s.uid}`)) {
      this.decided.add(`duck${s.uid}`);
      if (this.roll(c.throw * 0.5)) { this.hold.push({ action: 'down', frames: 3 }, { action: ['down', 'kick'], frames: 2 }); return out; }
    }
    if ((threat || projectileIncoming) && !this.decided.has(`def${s.uid ?? 'proj'}${projectileIncoming ? this.clock >> 5 : ''}`)) {
      this.decided.add(`def${s.uid ?? 'proj'}${projectileIncoming ? this.clock >> 5 : ''}`);
      if (this.roll(c.block)) this.blockUntil = this.clock + 22;
    }
    // ── punish: opponent stuck in recovery (whiffed or blocked) ──
    const openFor = opp.state === 'attack' && opp.phase === 'recovery' && opp.move ? opp.move.startup + opp.move.active + opp.move.recovery - opp.t : 0;
    if (s.state === 'attack' && s.phase === 'recovery' && openFor >= 6 && dist < 2.3 && !this.decided.has(`pun${s.uid}`)) {
      this.decided.add(`pun${s.uid}`);
      if (this.roll(c.punish)) {
        this.blockUntil = 0;
        if (dist < 1.3) this.press('punch');
        else if (dist < 1.5) this.press('kick');
        else { this.hold.push({ action: toward, frames: Math.round((dist - 1.25) / 0.075) }, { action: 'punch', frames: 2 }); } // step in on a whiff
        return out;
      }
    }

    if (this.clock < this.blockUntil) {
      out.down = true;
      return out;
    }

    // ── anti-air: opponent jumping in ──
    if ((s.state === 'jump' || s.id === 'airKick') && s.y > 0.4 && dist < 2.6 && !this.decided.has(`aa${Math.floor(this.clock / 40)}`)) {
      this.decided.add(`aa${Math.floor(this.clock / 40)}`);
      if (this.roll(c.antiAir)) {
        if (me.def.special?.type === 'uppercut' && me.specialsLeft > 0 && dist < 1.6) this.press('special');
        else if (dist < 1.4) this.press('punch');
        else this.blockUntil = this.clock + 25;
        return out;
      }
    }

    // ── neutral ──
    if (this.clock < this.nextThink) {
      if (this.walking) out[this.walking] = true;
      return out;
    }
    this.nextThink = this.clock + c.think + Math.floor(Math.random() * c.think);
    this.walking = null;
    const r = Math.random();
    const type = me.def.special?.type;
    const canSpecial = me.specialsLeft > 0;
    const ranged = !['dash', 'uppercut', 'slam', 'gold'].includes(type); // gold is saved for defence (above)

    // opponent turtling in block: grab them (goes through blocks), sometimes a low sweep
    if (this.oppBlocking > 18 && dist < 1.1 && this.roll(c.throw)) { this.press(['punch', 'kick']); return out; }
    if (this.oppBlocking > 18 && dist < 1.5 && this.roll(c.throw)) { this.hold.push({ action: 'down', frames: 4 }, { action: ['down', 'kick'], frames: 2 }); return out; }
    if (this.oppBlocking > 18 && dist < 1.8) { this.walking = toward; return out; }
    if (opp.state === 'dazed' && dist < 1.35) { this.press('punch'); return out; }
    if (opp.state === 'dazed') { this.walking = toward; return out; }
    if (opp.happy > 0 && dist < 1.35) { this.press('punch'); return out; }
    if (opp.happy > 0) { this.walking = toward; return out; }

    if (dist > 2.9) {
      if (canSpecial && ranged && dist < 6 && r < c.special * 0.4) this.press('special');
      else if (canSpecial && type === 'teleport' && r < c.special * 0.3) this.press('special');
      else if (r < 0.08) { this.press('up', 3); this.walking = toward; }
      else this.walking = toward;
    } else if (dist > 1.4) {
      // footsies: poke with kick or a sweep at their tip, otherwise inch in or wait
      if (dist < 1.6 && r < c.poke * 0.3) this.press('kick');
      else if (dist < 1.6 && r < c.poke * 0.45) this.hold.push({ action: 'down', frames: 4 }, { action: ['down', 'kick'], frames: 2 });
      else if (canSpecial && type === 'dash' && r < c.special * 0.6) this.press('special');
      else if (r < 0.75) this.walking = toward;
      else this.blockUntil = this.clock + 12;
    } else {
      // close range: mix punches, sweeps, blocking and backing off
      if (r < 0.35) this.press('punch');
      else if (r < 0.35 + c.throw * 0.25) this.hold.push({ action: 'down', frames: 4 }, { action: ['down', 'kick'], frames: 2 });
      else if (canSpecial && (type === 'uppercut' || type === 'slam' || type === 'gold' || type === 'darkness') && r < 0.75) this.press('special'); // gold up close: hit through their guard
      else if (r < 0.85) this.blockUntil = this.clock + 16;
      else this.walking = away;
    }
    return out;
  }
}
