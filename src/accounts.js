// Accounts live in the game (server: api/account.js), so you can log in from any device with
// your username + PIN. This device only remembers a login token and which usernames logged in
// here (for quick-pick buttons). Guests are local only.
//
// If the account server isn't reachable (e.g. the Claude preview link, or no database set up),
// accounts fall back to living on this device, like before.

const SESSION = 'fk-session';      // { token, name, friends }
const RECENT = 'fk-recent-names';  // usernames that logged in on this device
const LOCAL = 'fk-accounts';       // old on-device accounts (fallback + migration)
const GUEST = 'fk-guest';

export const PIN_RE = /^\d{4,6}$/;
export const NAME_RE = /^[\p{L}\p{N} ._-]{2,14}$/u;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const remove = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export function cleanName(name) { return String(name || '').trim().replace(/\s+/g, ' '); }

let serverMode = null; // true / false once known
async function api(action, data) {
  const r = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  if (r.status === 404 || r.status === 503 || r.status === 405) throw Object.assign(new Error('no server'), { noServer: true });
  return r.json();
}
async function server(action, data) {
  if (serverMode === false) throw Object.assign(new Error('no server'), { noServer: true });
  try {
    const j = await api(action, data);
    serverMode = true;
    return j;
  } catch (err) {
    if (err.noServer || err instanceof TypeError) serverMode = false;
    throw Object.assign(err, { noServer: true });
  }
}
export function onlineAccounts() { return serverMode !== false; }
export function sessionToken() { return read(SESSION, null)?.token || null; }
// what the server has set up: { google: <client id> | null, cloud: bool } (null: no server)
let cfg = null;
export function serverConfig() { cfg ||= server('config', {}).then((r) => (r.ok ? r : null)).catch(() => null); return cfg; }

function remember(name) {
  const list = read(RECENT, []).filter((n) => n.toLowerCase() !== name.toLowerCase());
  write(RECENT, [name, ...list].slice(0, 8));
}
export function recentNames() {
  const recent = read(RECENT, []);
  for (const a of read(LOCAL, [])) if (!recent.some((n) => n.toLowerCase() === a.name.toLowerCase())) recent.push(a.name);
  return recent;
}

// ── local fallback (old on-device accounts) ──
async function hashLocal(name, pin) {
  const data = new TextEncoder().encode(`friends-kombat:${name.toLowerCase()}:${pin}`);
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (const b of data) { h ^= b; h = Math.imul(h, 16777619); }
  return `fnv${h >>> 0}`;
}
async function localLogin(name, pin) {
  const a = read(LOCAL, []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!a) return null;
  if ((await hashLocal(a.name, pin)) !== a.hash) return { ok: false, error: 'Wrong PIN.' };
  return { ok: true, name: a.name, friends: a.friends || [] };
}

// ── settings that follow the account (not the phone-button layout or the auto graphics level: those
// depend on the device) ──
const SETTINGS_KEYS = ['fk-controls', 'fk-gfx', 'fk-volume', 'fk-muted', 'fk-level'];
const rawGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function snapshot() { const o = {}; for (const k of SETTINGS_KEYS) { const v = rawGet(k); if (v != null) o[k] = v; } return o; }
let synced = null, settingsReload = false;
// the account's saved settings: put them on this device (true if anything changed: reload to use them)
function takeSettings(remote) {
  if (!remote || typeof remote !== 'object') return false;
  let changed = false;
  for (const k of SETTINGS_KEYS) {
    if (typeof remote[k] !== 'string' || rawGet(k) === remote[k]) continue;
    try { localStorage.setItem(k, remote[k]); changed = true; } catch { /* storage blocked */ }
  }
  synced = JSON.stringify(snapshot());
  return changed;
}
// true once: the account brought different settings, the game should reload to use them
export function takeSettingsReload() { const r = settingsReload; settingsReload = false; return r; }
// every couple of seconds: a setting changed on this device -> save it to the account
export function startSettingsSync() {
  setInterval(() => {
    const s = read(SESSION, null);
    if (!s?.token) return;
    const now = JSON.stringify(snapshot());
    if (now === synced) return;
    synced = now;
    server('settings', { token: s.token, settings: JSON.parse(now) }).catch(() => { synced = null; });
  }, 2000);
}

function startSession(r, local = false) {
  write(SESSION, { token: r.token || null, name: r.name, friends: r.friends || [], requests: r.requests || [], sent: r.sent || [], local, google: !!r.google, steam: !!r.steam, pin: r.pin !== false });
  // the account's settings come with it (an account without any yet takes this device's)
  if (r.token) { if (takeSettings(r.settings)) settingsReload = true; else if (!r.settings) synced = null; }
  remove(GUEST);
  remember(r.name);
  return { ok: true, name: r.name };
}

export async function createAccount(name, pin) {
  const n = cleanName(name);
  if (!NAME_RE.test(n)) return { ok: false, error: 'Usernames are 2–14 letters or numbers.' };
  if (!PIN_RE.test(pin)) return { ok: false, error: 'The PIN must be 4–6 digits.' };
  try {
    const r = await server('register', { name: n, pin });
    return r.ok ? startSession(r) : r;
  } catch {
    const list = read(LOCAL, []);
    if (list.some((a) => a.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'There is already an account with that name on this device.' };
    list.push({ name: n, hash: await hashLocal(n, pin), friends: [], at: Date.now() });
    write(LOCAL, list);
    return startSession({ name: n, friends: [] }, true);
  }
}

export async function login(name, pin) {
  const n = cleanName(name);
  try {
    const r = await server('login', { name: n, pin });
    if (r.ok) return startSession(r);
    // an account made on this device before accounts moved online: move it up now
    if (r.missing) {
      const local = await localLogin(n, pin);
      if (local?.ok) {
        const reg = await server('register', { name: local.name, pin, friends: local.friends });
        if (reg.ok) return startSession(reg);
      }
    }
    return r;
  } catch {
    const local = await localLogin(n, pin);
    if (!local) return { ok: false, error: 'No account with that name on this device (the account server is offline).' };
    return local.ok ? startSession(local, true) : local;
  }
}

// ── Google sign-in (the Google button on the account screen; Google Identity Services) ──
// known Google account → logged in { ok, name }; new → { ok, needName, claim, suggest }: pick a name
export async function googleLogin(credential) {
  try {
    const r = await server('google', { credential });
    return r.ok && r.token ? startSession(r) : r;
  } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}
export async function claimName(claim, name) {
  const n = cleanName(name);
  if (!NAME_RE.test(n)) return { ok: false, error: 'Usernames are 2–14 letters or numbers.' };
  try {
    const r = await server('claim', { claim, name: n });
    return r.ok ? startSession(r) : r;
  } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}
// logged in: connect a Google account to it (log in with either from then on)
export async function linkGoogle(credential) {
  const s = read(SESSION, null);
  if (!s?.token) return { ok: false, error: 'Log in first.' };
  try {
    const r = await server('google', { credential, token: s.token });
    if (r.ok) write(SESSION, { ...s, google: true });
    return r;
  } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}
// a new Google / Steam sign-in that turned out to be someone with an account: after they log in to
// it (PIN or the other button), the new sign-in is connected to that account
export async function linkClaim(claim) {
  const s = read(SESSION, null);
  if (!s?.token) return { ok: false, error: 'Log in first.' };
  try {
    const r = await server('linkclaim', { claim, token: s.token });
    if (r.ok) write(SESSION, { ...s, google: !!r.google, steam: !!r.steam, pin: r.pin !== false });
    return r;
  } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}

// ── Steam sign-in: the browser goes to Steam and comes back (api/steam.js) ──
// the address to send the browser to; connecting Steam to the logged-in account when `link`
export async function steamStartUrl(link = false) {
  const app = new URLSearchParams(location.search).get('app') || sessionStorage.getItem('ck-app') ? '&app=1' : '';
  if (!link) return `/api/steam?start=1${app}`;
  const s = read(SESSION, null);
  if (!s?.token) return null;
  const r = await server('linkcode', { token: s.token });
  return r.ok ? `/api/steam?start=1&link=${r.code}${app}` : null;
}
// back from Steam with a one-time code: it becomes the login
export async function redeemLogin(code) {
  try {
    const r = await server('redeem', { code });
    return r.ok ? startSession(r) : r;
  } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}
// what the account screen says next to the name
export function loginWays(acc) {
  const w = [];
  if (acc?.google) w.push('Google');
  if (acc?.steam) w.push('Steam');
  if (acc?.pin !== false) w.push('the PIN');
  return w;
}

export function guestLogin() {
  const name = `Guest-${100 + Math.floor(Math.random() * 900)}`;
  remove(SESSION);
  write(GUEST, name);
  return { ok: true, name, guest: true };
}

// what we know right now (instant, from this device)
export function currentAccount() {
  const guest = read(GUEST, null);
  if (guest) return { name: guest, guest: true, friends: [] };
  const s = read(SESSION, null);
  return s?.name ? { name: s.name, friends: s.friends || [], requests: s.requests || [], sent: s.sent || [], online: !!s.token, google: !!s.google, steam: !!s.steam, pin: s.pin !== false } : null;
}

// check the saved login with the server (and pick up friends added on another device)
// set when a device-only login has to be redone so the account moves online (shown on the login screen)
let notice = '';
export function takeAccountNotice() { const n = notice; notice = ''; return n; }

export async function refreshAccount() {
  const s = read(SESSION, null);
  if (s?.name && !s.token) {
    // made while the game had no account database: if it has one now, log in once more (with
    // the PIN) and the account moves online, where usernames and friends are checked
    try {
      const j = await server('exists', { name: s.name });
      if (j?.ok) {
        remove(SESSION);
        notice = `Accounts are online now: log in once more as ${s.name} to move your account (your PIN stays the same).`;
        return null;
      }
    } catch { /* still no account database */ }
    await syncLocalFriends();
    return currentAccount();
  }
  if (!s?.token) return currentAccount();
  try {
    const r = await server('me', { token: s.token });
    if (r.ok) {
      write(SESSION, { ...s, name: r.name, friends: r.friends, requests: r.requests || [], sent: r.sent || [], google: !!r.google, steam: !!r.steam, pin: r.pin !== false });
      if (takeSettings(r.settings)) settingsReload = true; // (changed on another device)
      else if (!r.settings) synced = null;
      return currentAccount();
    }
    if (r.expired) { remove(SESSION); return null; }
  } catch { /* offline: keep what we have */ }
  return currentAccount();
}

export function logout() {
  const s = read(SESSION, null);
  if (s?.token) server('logout', { token: s.token }).catch(() => {});
  remove(SESSION);
  remove(GUEST);
}

export function setFriends(friends) {
  const s = read(SESSION, null);
  if (!s) return;
  s.friends = friends;
  write(SESSION, s);
  if (s.token) server('friends', { token: s.token, friends }).catch(() => {});
  else {
    const list = read(LOCAL, []);
    const a = list.find((x) => x.name === s.name);
    if (a) { a.friends = friends; write(LOCAL, list); }
  }
}

// ── friends for device-only accounts (no account database) ──
// Like Hytster: each phone keeps its own friends list, and messages go through the game's relay
// (api/relay.js). Adding someone sends a request; only when they accept are you on both lists.
// A name nobody plays under never accepts, so it never becomes a friend. The game keeps
// re-sending until a message is answered (the relay only keeps things in memory).
const lc = (n) => String(n?.name ?? n ?? '').trim().toLowerCase();
const hasN = (list, n) => (list || []).some((f) => lc(f) === lc(n));
const dropN = (list, n) => (list || []).filter((f) => lc(f) !== lc(n));
const addN = (list, n) => dropN(list, n).concat([{ name: n }]);
const DAY = 864e5;
const KEEP = { req: 14 * DAY, acc: 3 * DAY, dec: DAY, rm: 2 * DAY };
async function relay(body) {
  const r = await fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  if (!r.ok) throw new Error('relay');
  return r.json();
}
// one pending message per person: the newest replaces the older one
function queue(s, to, kind) {
  const at = Date.now();
  s.outbox = (s.outbox || []).filter((o) => lc(o.to) !== lc(to)).concat([{ to, kind, at, until: at + KEEP[kind] }]);
}
function localView(s) { return { ok: true, local: true, name: s.name, friends: s.friends || [], requests: s.requests || [], sent: s.sent || [] }; }
let syncing = null, syncAgain = false;
function applyFriendMsg(s, m) {
  const who = String(m.from).slice(0, 20);
  if (m.kind === 'req') {
    if (hasN(s.friends, who)) queue(s, who, 'acc');                       // they missed my yes: say it again
    else if (hasN(s.sent, who)) { s.sent = dropN(s.sent, who); s.friends = addN(s.friends, who); queue(s, who, 'acc'); } // we both asked
    else if (!hasN(s.requests, who)) s.requests = addN(s.requests, who);
  } else if (m.kind === 'acc') {
    if (hasN(s.sent, who)) { s.sent = dropN(s.sent, who); s.requests = dropN(s.requests, who); s.friends = addN(s.friends, who); s.outbox = (s.outbox || []).filter((o) => lc(o.to) !== lc(who)); }
  } else if (m.kind === 'dec') {
    if (hasN(s.sent, who)) { s.sent = dropN(s.sent, who); s.outbox = (s.outbox || []).filter((o) => lc(o.to) !== lc(who)); }
  } else if (m.kind === 'rm') {
    s.friends = dropN(s.friends, who); s.sent = dropN(s.sent, who); s.requests = dropN(s.requests, who);
    s.outbox = (s.outbox || []).filter((o) => lc(o.to) !== lc(who));
  }
}
export function syncLocalFriends() {
  const s0 = read(SESSION, null);
  if (!s0?.name || s0.token) return Promise.resolve(false);
  if (syncing) { syncAgain = true; return syncing; } // something changed meanwhile: go again after
  syncing = (async () => {
    let changed = false;
    // friends added before requests existed only count once the other person accepts too
    const first = read(SESSION, null);
    if (!first.friendsV) {
      first.friendsV = 2;
      for (const f of first.friends || []) { first.sent = addN(first.sent, f.name); queue(first, f.name, 'req'); }
      first.friends = [];
      write(SESSION, first);
      changed = true;
    }
    const name = first.name, now = Date.now();
    let msgs = [];
    try {
      const out = (first.outbox || []).filter((o) => o.until > now);
      if (out.length) await relay({ op: 'fsend', from: name, msgs: out.map(({ to, kind, at }) => ({ to, kind, at })) });
      msgs = (await relay({ op: 'fpoll', for: name })).msgs || [];
    } catch { /* offline: try again next time */ }
    // apply to the latest saved copy (the player may have added / answered someone meanwhile)
    const s = read(SESSION, null);
    if (!s || s.name !== name || s.token) return changed;
    const done = new Set(s.done || []), acks = [];
    for (const m of msgs.sort((x, y) => x.at - y.at)) {
      acks.push({ from: m.from, at: m.at });
      const key = `${lc(m.from)}:${m.kind}:${m.at}`;
      if (done.has(key)) continue;
      done.add(key);
      applyFriendMsg(s, m);
      changed = true;
    }
    s.done = [...done].slice(-400);
    s.outbox = (s.outbox || []).filter((o) => o.until > Date.now());
    write(SESSION, s);
    if (acks.length) relay({ op: 'fack', for: name, items: acks }).catch(() => {});
    return changed;
  })().finally(() => {
    syncing = null;
    if (syncAgain) { syncAgain = false; syncLocalFriends(); }
  });
  return syncing;
}
function localFriendAction(fn) {
  const s = read(SESSION, null);
  const out = fn(s);
  write(SESSION, s);
  syncLocalFriends(); // send it right away
  return { ...localView(s), ...out };
}

// ── friend requests (server accounts): adding someone asks them; they accept or decline ──
function keep(r) {
  const s = read(SESSION, null);
  if (s && r.ok && r.friends) write(SESSION, { ...s, friends: r.friends, requests: r.requests || [], sent: r.sent || [] });
  return r;
}
async function call(action, data) {
  const s = read(SESSION, null);
  if (!s?.token) return { ok: false, local: true };
  try { return keep(await server(action, { token: s.token, ...data })); } catch { return { ok: false, error: 'Could not reach the account server. Try again.' }; }
}
export async function requestFriend(name) {
  const s = read(SESSION, null);
  // a device-only account (made while the account server was unreachable) can't ask anyone,
  // and friends must accept: it has to go online first
  if (s && !s.token) {
    // only real accounts: ask the account server if the name exists (when it has a database)
    let exists = null;
    try { const j = await server('exists', { name }); if (j?.ok) exists = !!j.exists; } catch { /* no database: can't check */ }
    if (exists === false) return { ok: false, error: `No account called "${name}". Check the spelling.` };
    const r = await localFriendAction((x) => {
      if (hasN(x.friends, name)) return { status: 'friends', name };
      if (hasN(x.requests, name)) { // they already asked me: that's a yes from both
        x.requests = dropN(x.requests, name); x.friends = addN(x.friends, name); queue(x, name, 'acc');
        return { status: 'friends', name };
      }
      x.sent = addN(x.sent, name); queue(x, name, 'req');
      return { status: 'sent', name };
    });
    if (exists === null && r?.ok !== false) r.unverified = true;
    return r;
  }
  return call('request', { to: name });
}
export async function respondFriend(from, accept) {
  const s = read(SESSION, null);
  if (s && !s.token) {
    return localFriendAction((x) => {
      x.requests = dropN(x.requests, from);
      if (accept) { x.friends = addN(x.friends, from); x.sent = dropN(x.sent, from); }
      queue(x, from, accept ? 'acc' : 'dec');
      return {};
    });
  }
  return call('respond', { from, accept });
}
export async function unfriend(name) {
  const s = read(SESSION, null);
  if (s && !s.token) {
    return localFriendAction((x) => { x.friends = dropN(x.friends, name); x.sent = dropN(x.sent, name); x.requests = dropN(x.requests, name); queue(x, name, 'rm'); return {}; });
  }
  return call('unfriend', { name });
}
