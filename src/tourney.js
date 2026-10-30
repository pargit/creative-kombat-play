// Tournament: knockout for 4, 8 or 16 fighters (a power of two, so every round splits evenly
// down to a final of two). Whoever joined plays; the empty seats up to the next size are CPU
// fighters (3 → 4, 5 → 8, 11 → 16).
//
// The player who creates it is the host: their browser holds the bracket and everyone else
// connects to it with the 4-letter tournament code (same PeerJS setup as online 1v1).
// The host sends the whole bracket to everyone after every change.
//
// The fights themselves are ordinary matches: two people play an online 1v1 room (the
// first-listed player opens it and tells the host its code, the other joins), a person vs a
// CPU plays locally against the computer, and CPU vs CPU is decided instantly. The winner is
// reported to the host, who moves them into the next round as soon as both sides are known.

import { PREFIX, CODE_CHARS, makePeer, connectTo, net } from './net.js';
import { ROSTER } from './roster.js';

export const MAX = 16;
// a player whose connection dropped (switched apps, the screen locked) keeps their seat this long
// while their game reconnects; only then do they lose their match
export const GRACE_MS = 90000;
// The clock only runs while they hold up a match that's ready to play: someone who won early
// and put the phone away while the others finish isn't thrown out for it.
const gone = (p, m) => p.gone && !p.cpu && Date.now() - Math.max(p.goneAt || 0, m?.ready || 0) > GRACE_MS;
// how long a player's game keeps trying to get back to the host before giving up
const RECONNECT_MS = 30 * 60000;
// the bracket size for this many players: 4, 8 or 16
export const bracketSize = (n) => { let size = 4; while (size < n && size < MAX) size *= 2; return size; };
// a round's name, counted back from the final
export function roundName(s, r) {
  const n = s?.rounds?.length || 1, back = n - 1 - r;
  if (back === 0) return 'FINAL';
  if (back === 1) return 'SEMIFINAL';
  if (back === 2 && s.rounds[r].length === 4) return 'QUARTERFINAL';
  return `ROUND ${r + 1}`;
}
const tId = (code) => `${PREFIX}t-${code}`;

// fair shuffle (Fisher–Yates): every order equally likely
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// the empty bracket for `size` players (even): each round has half as many matches (rounded up);
// a match fed by only one earlier match is a bye
function emptyRounds(size) {
  const rounds = [];
  let n = size / 2;
  for (;;) {
    const prev = rounds[rounds.length - 1];
    rounds.push(Array.from({ length: n }, (_, i) => ({ a: null, b: null, w: null, room: null, bye: !!prev && 2 * i + 1 >= prev.length })));
    if (n === 1) break;
    n = Math.ceil(n / 2);
  }
  return rounds;
}

// Events (assign functions): onState(s), onEnd(reason)
export const tourney = {
  s: null,          // { code, phase: 'lobby'|'running'|'done', players: [{ name, cpu?, fighter?, gone? }], rounds, champ }
  me: -1,           // my index in s.players
  isHost: false,
  peer: null,
  conn: null,       // player → host
  conns: new Map(), // host: player index → connection
  live: {},         // matches being played online, for spectators: key → { picks, frames: [masks…], end }
  watchers: new Map(), // host: match key → set of player indexes watching it
  get active() { return !!this.s; },

  // ── host ───────────────────────────────────────────────────────────────────
  async create(name) {
    this.leave();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      let peer;
      try {
        peer = await makePeer(tId(code));
      } catch (err) {
        if (err?.type === 'unavailable-id') continue;
        throw new Error('Could not go online. Check your connection and try again.');
      }
      this.peer = peer;
      this.isHost = true;
      this.me = 0;
      this.s = { code, phase: 'lobby', players: [{ name }], rounds: null, champ: null };
      peer.on('connection', (c) => c.on('open', () => this.accept(c)));
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch { /* ignore */ } });
      net.tourneyCode = code; // so tournament invites keep being re-sent while it's open
      this.changed();
      return code;
    }
    throw new Error('Could not create a tournament. Try again.');
  },

  accept(c) {
    if (c.tAccepted) return; // PeerJS can report the same connection open twice
    c.tAccepted = true;
    let idx = -1;
    c.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join' && idx < 0) {
        idx = this.addPlayer(c, String(msg.name || 'Player').slice(0, 20));
        return;
      }
      if (idx >= 0) this.handle(this.indexOf(c), msg);
    });
    c.on('close', () => this.drop(c));
    c.on('error', () => this.drop(c));
  },

  indexOf(c) {
    for (const [i, x] of this.conns) if (x === c) return i;
    return -1;
  },

  addPlayer(c, name) {
    const s = this.s;
    const known = this.indexOf(c);
    if (known >= 0) { c.send({ t: 'twelcome', you: known }); return known; }
    const live = (p) => !p.gone && !p.cpu;
    // came back (switched apps, lost signal, reloaded): give them their seat again
    const back = s.players.findIndex((p) => p.gone && !p.cpu && p.name.toLowerCase() === name.toLowerCase());
    if (back >= 0) {
      s.players[back].gone = false;
      delete s.players[back].goneAt;
      this.conns.set(back, c);
      c.send({ t: 'twelcome', you: back });
      this.changed();
      return back;
    }
    if (s.phase !== 'lobby') { c.send({ t: 'tdeny', why: 'That tournament has already started.' }); setTimeout(() => c.close(), 300); return -1; }
    if (s.players.filter(live).length >= MAX) { c.send({ t: 'tdeny', why: `That tournament is full (${MAX} players).` }); setTimeout(() => c.close(), 300); return -1; }
    let unique = name, n = 2;
    while (s.players.some((p) => live(p) && p.name.toLowerCase() === unique.toLowerCase())) unique = `${name} ${n++}`;
    s.players.push({ name: unique });
    const i = s.players.length - 1;
    this.conns.set(i, c);
    c.send({ t: 'twelcome', you: i });
    this.changed();
    return i;
  },

  drop(c) {
    const i = this.indexOf(c);
    if (i < 0) return;
    this.conns.delete(i);
    this.s.players[i].gone = true;
    this.s.players[i].goneAt = Date.now();
    this.changed();
  },

  // host: every few seconds, settle matches held up by someone who's been gone too long
  watchdog() {
    clearInterval(this.dogTimer);
    this.dogTimer = setInterval(() => {
      if (!this.s?.rounds || this.s.phase !== 'running') return;
      const was = JSON.stringify(this.s.rounds);
      this.advance();
      if (JSON.stringify(this.s.rounds) !== was) this.changed();
    }, 5000);
  },

  // host: start with whoever joined; the empty seats up to 4 / 8 / 16 are CPU fighters
  start() {
    if (!this.isHost || this.s.phase !== 'lobby') return;
    const s = this.s;
    // drop people who left the lobby (and didn't come back) and renumber everyone
    const keep = s.players.map((p, i) => [p, i]).filter(([p]) => !p.gone);
    const conns = new Map();
    s.players = keep.map(([p]) => p);
    keep.forEach(([, old], i) => { const c = this.conns.get(old); if (c) { conns.set(i, c); c.send({ t: 'twelcome', you: i }); } });
    this.conns = conns;
    const pool = shuffle(ROSTER.filter((d) => !d.locked));
    const size = bracketSize(s.players.length);
    while (s.players.length < size) {
      const def = pool[(s.players.length) % pool.length];
      s.players.push({ name: `CPU ${def.name.replace(/\s*\(.*\)/, '')}`, cpu: true, fighter: def.id });
    }
    // random 1v1s: everyone (people and CPUs) gets a random seat in the bracket
    const seats = shuffle(s.players.map((_, i) => i));
    s.rounds = emptyRounds(size);
    s.rounds[0].forEach((m, k) => { m.a = seats[2 * k]; m.b = seats[2 * k + 1]; });
    s.phase = 'running';
    this.advance();
    this.changed();
    this.watchdog();
  },

  // host: settle what can be settled (CPU vs CPU, no-shows) and move winners on
  advance() {
    const s = this.s;
    if (!s.rounds) return;
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      s.rounds.forEach((round, r) => round.forEach((m, i) => {
        if (r > 0) {
          const f1 = s.rounds[r - 1][2 * i], f2 = s.rounds[r - 1][2 * i + 1];
          if (m.a === null && f1.w !== null) { m.a = f1.w; moved = true; }
          if (f2 && m.b === null && f2.w !== null) { m.b = f2.w; moved = true; }
        }
        // a bye: straight through
        if (m.bye && m.w === null && m.a !== null) { m.w = m.a; moved = true; return; }
        if (m.w !== null || m.a === null || m.b === null) return;
        if (!m.ready) m.ready = Date.now(); // both sides known: the match can be played from now
        const A = s.players[m.a], B = s.players[m.b];
        const outA = gone(A, m), outB = gone(B, m);
        if (outA || outB) m.w = outA && !outB ? m.b : m.a;
        else if (A.cpu && B.cpu) m.w = Math.random() < 0.5 ? m.a : m.b;
        if (m.w !== null) moved = true;
      }));
      if (!moved) break;
    }
    const fin = s.rounds[s.rounds.length - 1][0];
    if (fin.w !== null && s.phase !== 'done') { s.phase = 'done'; s.champ = fin.w; }
  },

  // a message from player `from` (also used for the host's own actions)
  handle(from, msg) {
    const s = this.s;
    if (!s?.rounds || from < 0) return;
    // spectating: a match's inputs come in from its room's player; watchers get them passed on
    if (msg.t === 'tlive') return this.liveFrames(msg, from);
    if (msg.t === 'twatch') return this.addWatcher(String(msg.key), from);
    const m = s.rounds[msg.r]?.[msg.i];
    if (!m || m.w !== null) return;
    if (msg.t === 'troom' && m.a === from) { m.room = String(msg.code || '').slice(0, 4); this.changed(); }
    if (msg.t === 'tresult' && (from === m.a || from === m.b) && (msg.w === m.a || msg.w === m.b)) {
      m.w = msg.w;
      this.advance();
      this.changed();
    }
  },

  // host: frames of a match being played
  liveFrames(msg, from) {
    const [r, i] = String(msg.key).split('-').map(Number), m = this.s.rounds[r]?.[i];
    // a match between two people is sent by whoever opened its room; vs a CPU, by the person
    if (!m || !(from === m.a || (from === m.b && this.s.players[m.a]?.cpu))) return;
    this.storeLive(msg);
    const out = { t: 'tlive', key: msg.key, picks: msg.picks, names: msg.names, from: msg.from, frames: msg.frames, end: msg.end };
    for (const w of this.watchers.get(msg.key) || []) {
      if (w === this.me) this.onLive?.(msg.key);
      else { try { this.conns.get(w)?.send(out); } catch { /* dying */ } }
    }
  },
  addWatcher(key, who) {
    if (!this.watchers.has(key)) this.watchers.set(key, new Set());
    this.watchers.get(key).add(who);
    const l = this.live[key];
    if (who !== this.me && l) { try { this.conns.get(who)?.send({ t: 'tlive', key, picks: l.picks, names: l.names, from: 0, frames: l.frames, end: l.end }); } catch { /* dying */ } }
    if (who === this.me) this.onLive?.(key);
  },
  storeLive(msg) {
    const l = this.live[msg.key] ||= { picks: msg.picks, names: msg.names, frames: [], end: false };
    if (msg.picks) l.picks = msg.picks;
    if (msg.names) l.names = msg.names;
    for (let k = 0; k < (msg.frames || []).length; k++) l.frames[msg.from + k] = msg.frames[k];
    if (msg.end) l.end = true;
  },
  // anyone: start watching a match
  watch(key) {
    if (this.isHost) this.addWatcher(key, this.me);
    else this.send({ t: 'twatch', key });
  },

  changed() {
    if (this.isHost) for (const c of this.conns.values()) { try { c.send({ t: 'tstate', s: this.s }); } catch { /* dying */ } }
    this.onState?.(this.s);
  },

  // ── player ─────────────────────────────────────────────────────────────────
  async join(code, name) {
    this.leave();
    code = code.toUpperCase().replace(/[^A-Z]/g, '');
    const peer = await makePeer().catch(() => { throw new Error('Could not go online. Check your connection and try again.'); });
    this.peer = peer;
    this.code = code;
    this.name = name;
    try {
      await this.connect(20000);
    } catch (err) {
      this.leave();
      throw err;
    }
    if (this.s) this.onState?.(this.s);
  },

  // (re)connect to the host and take my seat
  async connect(ms) {
    let c;
    try {
      c = await connectTo(this.peer, tId(this.code), { name: this.name }, ms);
    } catch (err) {
      throw new Error(err.type === 'peer-unavailable' ? `Tournament ${this.code} was not found. Check the code.` : 'Could not reach that tournament. Try again.');
    }
    const peer = this.peer;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The tournament did not answer. Try again.')), 15000);
      c.on('data', (msg) => {
        if (!msg || typeof msg !== 'object' || this.peer !== peer) return; // (left meanwhile)
        if (msg.t === 'twelcome') { this.me = msg.you; this.conn = c; this.reconnecting = false; clearTimeout(timer); resolve(); }
        if (msg.t === 'tdeny') { clearTimeout(timer); reject(new Error(msg.why)); }
        if (msg.t === 'tstate') { this.s = msg.s; if (this.me >= 0) this.onState?.(this.s); }
        if (msg.t === 'tlive') { this.storeLive(msg); this.onLive?.(msg.key); }
        if (msg.t === 'tend') this.ended(msg.why || 'The host closed the tournament.');
      });
      c.on('close', () => { clearTimeout(timer); reject(new Error('Could not join.')); if (this.conn === c) this.lostHost(); });
      c.send({ t: 'join', name: this.name });
    });
  },

  // the link to the host dropped (I switched apps, the screen locked, the signal went):
  // keep trying to get back in for a while before giving up
  async lostHost() {
    if (!this.s || this.isHost || this.reconnecting) return;
    this.conn = null;
    this.reconnecting = true;
    this.onState?.(this.s);
    // the host keeps my seat (and only forfeits a match I'm holding up), so keep trying
    const until = Date.now() + RECONNECT_MS;
    while (this.s && this.reconnecting && Date.now() < until) {
      try {
        if (!this.peer || this.peer.destroyed) this.peer = await makePeer();
        else if (this.peer.disconnected) { try { this.peer.reconnect(); } catch { /* ignore */ } }
        await this.connect(8000);
        this.onState?.(this.s);
        return;
      } catch (err) {
        if (/already started|full/.test(err?.message || '')) break;
        await new Promise((r) => setTimeout(r, document.hidden ? 4000 : 2000));
      }
    }
    if (this.s && this.reconnecting) this.ended('Lost the connection to the tournament host.');
  },

  // back in the app: if the link to the host died meanwhile, get it back now
  checkLink() {
    if (!this.s || this.isHost) return;
    if (this.peer?.disconnected && !this.peer.destroyed) { try { this.peer.reconnect(); } catch { /* ignore */ } }
    if (!this.conn?.open && !this.reconnecting) this.lostHost();
  },

  ended(why) {
    if (!this.s) return;
    this.leave();
    this.onEnd?.(why);
  },

  // ── both ───────────────────────────────────────────────────────────────────
  send(msg) {
    if (this.isHost) this.handle(this.me, msg);
    else if (this.conn?.open) { try { this.conn.send(msg); } catch { /* dying */ } }
  },
  reportRoom(r, i, code) { this.send({ t: 'troom', r, i, code }); },
  reportResult(r, i, w) { this.send({ t: 'tresult', r, i, w }); },

  // my next match that's ready to play: { r, i, m, opp }
  myMatch() {
    const s = this.s;
    if (!s?.rounds || s.phase !== 'running') return null;
    for (let r = 0; r < s.rounds.length; r++) {
      for (let i = 0; i < s.rounds[r].length; i++) {
        const m = s.rounds[r][i];
        if (m.w === null && m.a !== null && m.b !== null && (m.a === this.me || m.b === this.me)) {
          return { r, i, m, opp: m.a === this.me ? m.b : m.a };
        }
      }
    }
    return null;
  },

  // knocked out? (lost a match)
  out() {
    const s = this.s;
    return !!s?.rounds?.some((round) => round.some((m) => m.w !== null && (m.a === this.me || m.b === this.me) && m.w !== this.me));
  },

  leave() {
    if (this.isHost) {
      for (const c of this.conns.values()) { try { c.send({ t: 'tend', why: 'The host closed the tournament.' }); } catch { /* ignore */ } }
      const peer = this.peer;
      setTimeout(() => peer?.destroy(), 400);
    } else {
      const c = this.conn;
      this.conn = null;
      try { c?.close(); } catch { /* ignore */ }
      this.peer?.destroy();
    }
    net.tourneyCode = null;
    this.reconnecting = false;
    clearInterval(this.dogTimer);
    this.peer = null;
    this.conn = null;
    this.conns = new Map();
    this.live = {};
    this.watchers = new Map();
    this.s = null;
    this.me = -1;
    this.isHost = false;
  },
};
