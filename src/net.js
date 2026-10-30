// Online 1v1: a direct browser-to-browser connection (WebRTC via PeerJS) plus lockstep.
//
// Matchmaking: the free public PeerJS server only introduces the two browsers; game data
// then flows directly between them. Rooms are peer IDs derived from a 4-letter code, and
// every player also has a personal ID (their "friend code") so friends can send invites.
//
// Lockstep: both browsers run the same deterministic fight. Each frame a player's buttons
// are sent to the other side and applied `delay` frames later on BOTH sides, so the two
// simulations see identical inputs and stay identical without sending positions around.

export const PREFIX = 'friendskombat-v1-';
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const STORE = 'fk-online';
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O to avoid confusion with 1 / 0

export const INPUT_BITS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'special'];

// ── identity: your account name is your online ID ───────────────────────────
// main.js sets net.me = { name, guest } whenever someone logs in.
const hex = (s) => [...new TextEncoder().encode(s.trim().toLowerCase())].map((b) => b.toString(16).padStart(2, '0')).join('');
const userId = (name) => `${PREFIX}u-${hex(name)}`;
const roomId = (code) => `${PREFIX}r-${code}`;

// ── PeerJS loading ───────────────────────────────────────────────────────────
let peerLib;
function loadPeerJS() {
  if (!peerLib) {
    peerLib = window.Peer ? Promise.resolve(window.Peer) : new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to load')));
      s.onerror = () => reject(new Error('Could not load the online module. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }
  return peerLib;
}

// ?peer=host:port lets the game use a private PeerJS server (used for local testing).
// How the two browsers find a path to each other. Many home/mobile networks block a direct
// link, so traffic is relayed through a TURN server; the extra relay on port 443 gets
// through firewalls that block PeerJS's own relay port.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: ['turn:freeturn.net:3478', 'turns:freeturn.net:5349'], username: 'free', credential: 'free' },
];

// Our own relay when it's set up (api/turn.js: a free Cloudflare TURN key in Vercel's settings).
// A TURN relay forwards the fight live through a nearby server, so it adds almost no delay;
// phones that can't link directly (often iPhone + Android on mobile data) need one.
let iceTask = null, iceAt = 0;
function iceServers() {
  if (!iceTask || Date.now() - iceAt > 12 * 3600e3) {
    iceAt = Date.now();
    iceTask = fetch('/api/turn', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.ok && Array.isArray(j.iceServers) && j.iceServers.length ? [...j.iceServers, ...ICE_SERVERS] : ICE_SERVERS))
      .catch(() => ICE_SERVERS);
  }
  return iceTask;
}
export async function hasOwnRelay() { return (await iceServers()) !== ICE_SERVERS; }

function peerOptions(ice = ICE_SERVERS) {
  const o = { debug: 0, config: { iceServers: ice } };
  const custom = new URLSearchParams(location.search).get('peer');
  if (custom) {
    const [host, port] = custom.split(':');
    Object.assign(o, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return o;
}

// An iPhone (especially a Home Screen app) drops the link to the matchmaking server as soon as
// the game goes to the background (e.g. to send the room code on WhatsApp), and the server then
// forgets the room. Reconnect right away, and again when the game is back on screen. (This only
// keeps the room registered; the fight itself still goes directly between the phones.)
const livePeers = new Set();
function keepAlive(p) {
  livePeers.add(p);
  p.on('disconnected', () => setTimeout(() => { try { if (!p.destroyed && p.disconnected) p.reconnect(); } catch { /* ignore */ } }, 500));
  p.on('close', () => livePeers.delete(p));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const p of livePeers) { try { if (p.destroyed) livePeers.delete(p); else if (p.disconnected) p.reconnect(); } catch { /* ignore */ } }
  net.onVisible?.();
});

export async function makePeer(id) {
  const Peer = await loadPeerJS();
  const ice = await iceServers();
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, peerOptions(ice)) : new Peer(peerOptions(ice));
    let done = false;
    const fail = (err) => { if (done) return; done = true; cleanup(); p.destroy(); reject(err); };
    const ok = () => { if (done) return; done = true; cleanup(); keepAlive(p); resolve(p); };
    const cleanup = () => { p.off('open', ok); p.off('error', fail); };
    p.on('open', ok);
    p.on('error', fail);
    setTimeout(() => fail(Object.assign(new Error('The online server did not answer.'), { type: 'timeout' })), 12000);
  });
}

// Connect to `id`; resolves with an open DataConnection or rejects (offline / not found).
export function connectTo(peer, id, metadata, ms = 8000) {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(id, { reliable: true, serialization: 'json', metadata });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      peer.off('error', onPeerError);
      if (err) { try { conn.close(); } catch { /* ignore */ } reject(err); } else resolve(conn);
    };
    const onPeerError = (err) => {
      if (err?.type === 'peer-unavailable' && String(err.message).includes(id)) finish(Object.assign(new Error('not found'), { type: 'peer-unavailable' }));
    };
    peer.on('error', onPeerError);
    conn.on('open', () => finish());
    conn.on('error', (e) => finish(e));
    setTimeout(() => finish(Object.assign(new Error('timeout'), { type: 'timeout' })), ms);
  });
}

// Friend invites also go through the game's relay (api/relay.js, like Hytster): the inviter
// re-sends for a minute and friends' games check every few seconds. (Only invites: fights use
// the direct connection below.)
async function relayPost(body) {
  const r = await fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  if (!r.ok) throw new Error(`relay ${r.status}`);
  return r.json();
}

// ── the online session ───────────────────────────────────────────────────────
// Events (assign functions): onInvite({from, room}), onConnected(), onMessage(msg),
// onDisconnected(reason), onStatus(text)
export const net = {
  identity: null,   // Peer registered under my friend code (receives invites)
  roomPeer: null,   // Peer registered under the room code while hosting
  guestPeer: null,  // anonymous Peer used to join a room when I have no identity yet
  conn: null,       // the game connection to the other player
  side: 0,          // 0 = host (left), 1 = guest (right)
  roomCode: '',
  opponent: '',
  rtt: 120,
  get active() { return !!this.conn; },

  me: null,

  // Registers my account name online so friends can invite me. The same account can be logged
  // in on several devices at once: the first one online takes the name's ID, the others take
  // numbered ones (they still get invites through the relay, which goes by name).
  // Resolves 'ok' or 'offline'.
  startIdentity() {
    if (!this.me || this.me.guest) return Promise.resolve('offline');
    const base = userId(this.me.name);
    if (this.identity && (this.identity.id === base || this.identity.id.startsWith(`${base}-`)) && !this.identity.destroyed) return Promise.resolve('ok');
    if (this.idTask?.base === base) return this.idTask.promise;
    this.identity?.destroy();
    this.identity = null;
    const task = { base };
    task.promise = (async () => {
      const ids = [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`];
      for (let k = 0, attempt = 0; k < ids.length; ) {
        const id = ids[k];
        try {
          const p = await makePeer(id);
          if (this.idTask !== task) { p.destroy(); return 'offline'; }
          this.identity = p;
          this.lastIdentity = id;
          p.on('connection', (c) => this.acceptSide(c));
          p.on('disconnected', () => { try { if (!p.destroyed) p.reconnect(); } catch { /* ignore */ } });
          return 'ok';
        } catch (err) {
          if (err?.type !== 'unavailable-id' || this.idTask !== task) return 'offline';
          // just closed this same ID ourselves (log out / in)? the server needs a moment to forget it
          if (this.lastIdentity === id && attempt < 3) { attempt++; await new Promise((r) => setTimeout(r, 1500)); continue; }
          k++; attempt = 0; // in use: this account is online on another device too
        }
      }
      return 'offline';
    })().finally(() => { if (this.idTask === task) this.idTask = null; });
    this.idTask = task;
    return task.promise;
  },

  stopIdentity() {
    this.identity?.destroy();
    this.identity = null;
    this.idTask = null;
  },

  // short-lived connections from friends: invites and online checks
  // an invite can arrive both directly and through the relay: show it once
  deliverInvite(inv) {
    const key = `${inv.room || ''}${inv.tourney || ''}:${inv.from}`;
    this.seenInvites ||= new Map();
    const at = this.seenInvites.get(key);
    if (at && Date.now() - at < 120000) return;
    this.seenInvites.set(key, Date.now());
    this.onInvite?.(inv);
  },

  startInvitePoll() {
    if (this.invitePoll) return;
    this.invitePoll = setInterval(async () => {
      if (document.hidden || !this.me || this.me.guest) return;
      try {
        const j = await relayPost({ op: 'invites', for: this.me.name });
        for (const i of j.invites || []) {
          const from = String(i.from || 'A friend').slice(0, 20), code = String(i.room || '').toUpperCase();
          this.deliverInvite(i.kind === 'tourney' ? { from, tourney: code } : { from, room: code });
        }
      } catch { /* next time */ }
    }, 4000);
  },

  relayInvite(to, room, kind) {
    const send = () => relayPost({ op: 'invite', to, from: this.me?.name, room, kind }).catch(() => {});
    send();
    let n = 0;
    const timer = setInterval(() => {
      const still = kind === 'tourney' ? this.tourneyCode === room : this.roomCode === room && !this.conn;
      if (++n > 15 || !still) { clearInterval(timer); return; }
      send();
    }, 5000);
  },

  acceptSide(c) {
    c.on('data', (msg) => {
      if (msg?.t === 'invite') this.deliverInvite({ from: String(msg.from || 'A friend').slice(0, 20), room: String(msg.room || '').toUpperCase() });
      if (msg?.t === 'tinvite') this.deliverInvite({ from: String(msg.from || 'A friend').slice(0, 20), tourney: String(msg.code || '').toUpperCase() });
      if (msg?.t === 'ping') c.send({ t: 'pong' });
      if (msg?.t === 'friends') this.onFriendsChanged?.(); // someone sent / answered a friend request
    });
  },

  async createRoom() {
    this.leave();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try {
        this.roomPeer = await makePeer(roomId(code));
      } catch (err) {
        if (err?.type === 'unavailable-id') continue;
        throw err;
      }
      this.roomCode = code;
      this.side = 0;
      this.listenRoom(this.roomPeer);
      return code;
    }
    throw new Error('Could not create a room. Try again.');
  },

  listenRoom(p) {
    p.on('connection', (c) => {
      if (this.conn) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
      c.on('open', () => this.attach(c));
    });
  },

  // back on screen while hosting: make sure the room is still registered under its code
  async reviveRoom() {
    const code = this.roomCode, p = this.roomPeer;
    if (!code || this.side !== 0 || this.conn || this.reviving) return;
    if (p && !p.destroyed && !p.disconnected) return;
    this.reviving = true;
    try {
      for (let attempt = 0; attempt < 5 && this.roomCode === code && !this.conn; attempt++) {
        if (p && !p.destroyed) { try { p.reconnect(); } catch { /* ignore */ } await new Promise((r) => setTimeout(r, 1500)); if (!p.disconnected) return; }
        try {
          p?.destroy();
          const np = await makePeer(roomId(code));
          if (this.roomCode !== code) { np.destroy(); return; }
          this.roomPeer = np;
          this.listenRoom(np);
          return;
        } catch { await new Promise((r) => setTimeout(r, 2500)); } // the server may still hold the old one
      }
    } finally { this.reviving = false; }
  },

  async joinRoom(code) {
    this.leave();
    code = code.toUpperCase().trim();
    let peer = this.identity;
    if (!peer || peer.destroyed || peer.disconnected) {
      this.guestPeer = await makePeer();
      peer = this.guestPeer;
    }
    let c;
    for (let attempt = 1; ; attempt++) {
      try {
        c = await connectTo(peer, roomId(code), { name: this.me?.name }, 20000); // relayed links can take a while
        break;
      } catch (err) {
        // "not found" can just mean the host's phone is reconnecting (e.g. back from WhatsApp)
        if (err.type === 'peer-unavailable' && attempt < 4) {
          this.onStatus?.(`Looking for room ${code}… (your friend should have the game open on the room screen)`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (err.type === 'peer-unavailable') throw new Error(`Room ${code} was not found. Check the code, and ask your friend to keep the game open on the room screen (on iPhone the room disappears while the game is in the background).`);
        throw new Error(`Found room ${code}, but your phones couldn't link up. ` + ((await hasOwnRelay())
          ? 'Try again, or try both on Wi-Fi.'
          : "On mobile data phones usually need a relay server, and the game doesn't have its own yet (README: TURN relay). Meanwhile, try both on the same Wi-Fi."));
      }
    }
    this.roomCode = code;
    this.side = 1;
    this.attach(c);
  },

  attach(c) {
    this.conn = c;
    this.rttSamples = [];
    this.opponent = String(c.metadata?.name || '').slice(0, 20);
    c.on('data', (msg) => this.receive(msg));
    c.on('close', () => this.lost('closed'));
    c.on('error', () => this.lost('error'));
    this.send({ t: 'hello', name: this.me?.name });
    this.pingTimer = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 1000);
    this.lastHeard = this.lastTick = performance.now();
    this.watchdog = setInterval(() => {
      const now = performance.now();
      // our own page was frozen (e.g. loading fighter models on a phone): that's not the
      // other player going quiet, so give them a fresh window to answer
      if (now - this.lastTick > 2500) this.lastHeard = now;
      this.lastTick = now;
      if (now - this.lastHeard > 30000) this.lost('timeout'); // (a real disconnect closes the connection sooner)
    }, 1000);
    this.onConnected?.();
  },

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    this.lastHeard = performance.now();
    if (msg.t === 'ping') return this.send({ t: 'pong', at: msg.at });
    if (msg.t === 'pong') {
      const r = performance.now() - msg.at;
      this.rtt = this.rtt * 0.7 + r * 0.3;
      (this.rttSamples ||= []).push(r);
      if (this.rttSamples.length > 12) this.rttSamples.shift();
      return;
    }
    if (msg.t === 'hello') { this.opponent = String(msg.name || 'Friend').slice(0, 20); this.onMessage?.(msg); return; }
    if (msg.t === 'full') { this.lost('full'); return; }
    if (msg.t === 'bye') { this.lost('left'); return; }
    this.onMessage?.(msg);
  },

  send(msg) {
    if (this.conn?.open) { try { this.conn.send(msg); } catch { /* connection dying */ } }
  },

  lost(reason) {
    if (!this.conn) return;
    const who = this.opponent;
    this.cleanupConn();
    this.onDisconnected?.(reason, who);
  },

  cleanupConn() {
    clearInterval(this.pingTimer);
    clearInterval(this.watchdog);
    const c = this.conn;
    this.conn = null;
    try { c?.close(); } catch { /* ignore */ }
  },

  leave() {
    if (this.conn) { this.send({ t: 'bye' }); this.cleanupConn(); }
    this.roomPeer?.destroy();
    this.roomPeer = null;
    this.guestPeer?.destroy();
    this.guestPeer = null;
    this.roomCode = '';
  },

  // ask a friend's game to show an invite popup; resolves true if delivered
  async invite(friend) {
    if (!this.roomCode || this.side !== 0) await this.createRoom();
    this.relayInvite(friend.name, this.roomCode, 'room');
    await this.startIdentity();
    if (!this.identity) return false;
    try {
      const c = await connectTo(this.identity, userId(friend.name), { name: this.me?.name }, 7000);
      c.send({ t: 'invite', from: this.me.name, room: this.roomCode });
      setTimeout(() => c.close(), 1500);
      return true;
    } catch {
      return false;
    }
  },

  // invite a friend to a tournament (code); resolves true if delivered
  async inviteTourney(friend, code) {
    this.relayInvite(friend.name, code, 'tourney');
    await this.startIdentity();
    if (!this.identity) return false;
    try {
      const c = await connectTo(this.identity, userId(friend.name), { name: this.me?.name }, 7000);
      c.send({ t: 'tinvite', from: this.me.name, code });
      setTimeout(() => c.close(), 1500);
      return true;
    } catch {
      return false;
    }
  },

  // tell a player's open game to re-check its friend requests (best effort; they also poll)
  async poke(name) {
    try {
      await this.startIdentity();
      if (!this.identity) return;
      const c = await connectTo(this.identity, userId(name), { name: this.me?.name }, 5000);
      c.send({ t: 'friends' });
      setTimeout(() => c.close(), 1000);
    } catch { /* not online: they'll see it within a minute */ }
  },

  async isOnline(friend) {
    await this.startIdentity();
    if (!this.identity) return false;
    try {
      const c = await connectTo(this.identity, userId(friend.name), { name: this.me?.name }, 6000);
      setTimeout(() => c.close(), 300);
      return true;
    } catch {
      return false;
    }
  },

  // input delay so inputs arrive before they're needed: half the round trip + a margin
  // how the two phones are linked: 'relay' (through the TURN server) or 'direct'
  async linkType() {
    const pc = this.conn?.peerConnection;
    if (!pc?.getStats) return '';
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
      if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected)) pair = pair || s; });
      if (!pair) return '';
      const l = stats.get(pair.localCandidateId), r = stats.get(pair.remoteCandidateId);
      const relay = l?.candidateType === 'relay' || r?.candidateType === 'relay';
      return relay ? `relay${l?.protocol === 'tcp' || l?.relayProtocol === 'tcp' ? ' (tcp)' : ''}` : 'direct';
    } catch { return ''; }
  },

  // The input delay both phones use for the fight. Sized for the WORST recent ping (ignoring one
  // freak spike), not the average: on a relay the ping jumps around, and if button presses
  // arrive later than the delay allows, the fight keeps pausing to wait for them (stalls),
  // which feels far worse than a couple more frames of delay.
  pickDelay() {
    const s = [...(this.rttSamples || [])].sort((a, b) => b - a);
    const worst = Math.max(this.rtt, s.length >= 5 ? s[1] : s[0] || 0);
    return Math.max(4, Math.min(20, Math.ceil(worst / 2 / 16.7) + 3));
  },
};

// ── lockstep ─────────────────────────────────────────────────────────────────
export function packInput(held) {
  let m = 0;
  INPUT_BITS.forEach((k, i) => { if (held[k]) m |= 1 << i; });
  return m;
}
export function unpackInput(m) {
  const held = {};
  INPUT_BITS.forEach((k, i) => { held[k] = !!(m & (1 << i)); });
  return held;
}

export class Lockstep {
  constructor(side, delay) {
    this.side = side;
    this.delay = delay;
    this.frame = 0;
    this.local = new Map();
    this.remote = new Map();
    for (let f = 0; f < delay; f++) { this.local.set(f, 0); this.remote.set(f, 0); }
    this.hashes = new Map();
    this.desync = false;
  }

  receive(msg) {
    if (msg.t === 'in') this.remote.set(msg.f, msg.h);
    if (msg.t === 'hash') this.checkHash(msg.f, msg.h, 'remote');
  }

  canStep() { return this.remote.has(this.frame); }

  // returns [input for side 0, input for side 1] for the frame about to run
  step(localMask) {
    const target = this.frame + this.delay;
    this.local.set(target, localMask);
    net.send({ t: 'in', m: this.m, f: target, h: localMask });
    const mine = this.local.get(this.frame), theirs = this.remote.get(this.frame);
    this.local.delete(this.frame - 1);
    this.remote.delete(this.frame - 1);
    this.frame++;
    return this.side === 0 ? [mine, theirs] : [theirs, mine];
  }

  // after a frame ran: occasionally compare a fingerprint of the fight with the other side
  afterTick(fingerprint) {
    const f = this.frame - 1;
    if (f % 60 !== 0) return;
    const h = fingerprint();
    net.send({ t: 'hash', m: this.m, f, h });
    this.checkHash(f, h, 'local');
  }

  checkHash(f, h, who) {
    const e = this.hashes.get(f) || {};
    e[who] = h;
    this.hashes.set(f, e);
    if (e.local !== undefined && e.remote !== undefined) {
      if (e.local !== e.remote) this.desync = true;
      this.hashes.delete(f);
    }
  }
}

// Applies one frame's packed input to a fighter, computing "just pressed" like Controller.
export class FrameController {
  constructor() { this.held = {}; this.pressed = {}; this.prev = {}; this.next = 0; }
  set(mask) { this.next = mask; }
  update() {
    const now = unpackInput(this.next);
    for (const k of INPUT_BITS) {
      this.pressed[k] = now[k] && !this.prev[k];
      this.held[k] = now[k];
      this.prev[k] = now[k];
    }
    this.pressed.start = false;
  }
  flush() { for (const k of INPUT_BITS) { this.prev[k] = true; this.pressed[k] = false; } }
}
