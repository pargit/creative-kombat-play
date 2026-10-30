// Your creations on your account: fighters (with their model files) and arenas follow you to any
// device you log in on. The account database keeps the small part (api/creations.js); model files
// go straight from the browser to the file store (Vercel Blob; api/upload.js hands out the upload token).
// This device's IndexedDB (store.js) is the working copy: everything is saved there first
// and then sent up; what the account has and this device doesn't comes down. Model files are the
// big part (up to 20 MB each), so they are NOT fetched by themselves: the fighter is in the game
// right away and plays straight from the file's address; the files are kept on this device only
// when the player asks (DOWNLOAD on MY FIGHTERS, or the question after logging in), and can be
// dropped again (REMOVE DOWNLOAD) without losing anything: they stay on the account.
//
// Each item has `updated` (when it was last saved); the newer side wins. A fighter remembers what
// the account has of it in `cloud` ({ model, props, updated }), so an unchanged model isn't uploaded
// twice (files are compared by a hash of their bytes).

import { sessionToken, serverConfig } from './accounts.js';
import { listItems, getItem, putRaw, deleteItem, currentOwner, adoptDeviceItems } from './store.js';

const state = { on: false, dir: null, text: '', error: '', busy: false, offline: false, asked: false };
const watchers = new Set(), changed = new Set();
let chain = Promise.resolve(), pending = 0;

// the game shows this (MY FIGHTERS / MY ARENAS): { on, busy, text, error }
// model files on the account that this device hasn't kept: { count, bytes, recs }
export async function pendingFiles() {
  const recs = (await listItems('fighters')).filter((r) => r.cloud?.pendingBytes);
  const bytes = recs.reduce((n, r) => n + ((r.cloud.model && !r.model ? r.cloud.model.size : 0) + Object.entries(r.cloud.props || {}).reduce((m, [pid, p]) => m + (r.props?.[pid]?.data ? 0 : p.size || 0), 0)), 0);
  return { count: recs.length, bytes, recs };
}
// after a login that brought fighters whose files aren't here: the game asks once whether to fetch them
let askFn = null;
export function onAskDownload(fn) { askFn = fn; }
export const fmtMB = (n) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
export function onCloud(fn) { watchers.add(fn); fn(status()); return () => watchers.delete(fn); }
// something came down from the account: the game reloads its fighters / arenas
export function onCloudChanged(fn) { changed.add(fn); }
export const status = () => ({ on: state.on, busy: state.busy || pending > 0, text: state.text, error: state.error });
function say(text, error = '') { state.text = text; state.error = error; for (const fn of watchers) fn(status()); }
function notify(kind) { for (const fn of changed) fn(kind); }

async function call(action, data = {}) {
  const r = await fetch('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: sessionToken(), ...data }), cache: 'no-store' });
  if (r.status === 404 || r.status === 405) throw Object.assign(new Error('no server'), { noServer: true });
  const j = await r.json();
  if (!j.ok) throw Object.assign(new Error(j.error || 'Server error'), { expired: !!j.expired });
  return j;
}

// is the account able to keep creations? (logged in online, and the server has a file store)
export async function cloudReady() {
  if (!sessionToken() || !currentOwner()) return false;
  const cfg = await serverConfig();
  return !!cfg?.cloud;
}

async function sha(buf) {
  try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return `len${buf.byteLength}`; }
}
const mb = (n) => (n / 1048576).toFixed(1);
async function putFile(pathname, buf, label) {
  const { upload } = await import('./vendor/blob-client.js'); // (@vercel/blob's browser client, bundled; only loaded when something is uploaded)
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const r = await upload(pathname, blob, {
    access: 'public', handleUploadUrl: '/api/upload', contentType: 'application/octet-stream',
    clientPayload: JSON.stringify({ token: sessionToken() }),
    onUploadProgress: (p) => say(`Uploading ${label} (${mb(buf.byteLength)} MB)… ${Math.floor(p.percentage)}%`),
  });
  return r.url;
}
async function getFile(url) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  return r.arrayBuffer();
}

// ── up ──
async function pushFighter(rec) {
  const type = rec.modelType === 'fbx' ? 'fbx' : 'glb';
  let model = null;
  if (rec.model) {
    const hash = await sha(rec.model);
    model = rec.cloud?.model?.hash === hash ? rec.cloud.model
      : { url: await putFile(`${state.dir}/${rec.id}.${type}`, rec.model, rec.def.name), size: rec.model.byteLength, hash, type };
  } else if (rec.cloud?.model && !rec.model && rec.cloud.pendingBytes) model = rec.cloud.model; // (file not downloaded yet: still theirs)
  const props = {};
  for (const [pid, p] of Object.entries(rec.props || {})) {
    if (!p?.data) { if (rec.cloud?.props?.[pid]) props[pid] = rec.cloud.props[pid]; continue; }
    const hash = await sha(p.data), old = rec.cloud?.props?.[pid];
    props[pid] = old?.hash === hash ? old
      : { url: await putFile(`${state.dir}/${rec.id}/${pid}.${p.type === 'fbx' ? 'fbx' : 'glb'}`, p.data, `${rec.def.name}'s ${p.name || 'model'}`), size: p.data.byteLength, hash, type: p.type === 'fbx' ? 'fbx' : 'glb', name: p.name || '' };
  }
  const item = { id: rec.id, created: rec.created, updated: rec.updated, def: rec.def, modelType: type, model, props };
  say(`Saving ${rec.def.name} to your account…`);
  const r = await call('put', { kind: 'fighters', item });
  if (r.newer) return pullFighter(r.newer, rec); // saved more recently on another device: take that
  rec.cloud = { model, props, updated: rec.updated };
  await putRaw('fighters', rec);
  return rec;
}
async function pushArena(rec) {
  say(`Saving ${rec.name} to your account…`);
  const { owner, cloud, ...item } = rec;
  const r = await call('put', { kind: 'arenas', item });
  if (r.newer) { await putRaw('arenas', { ...r.newer, owner: currentOwner(), cloud: { updated: r.newer.updated } }); return; }
  rec.cloud = { updated: rec.updated };
  await putRaw('arenas', rec);
}

// ── down ──
async function pullFighter(item, local) {
  const rec = {
    id: item.id, created: item.created, updated: item.updated, owner: currentOwner(), def: item.def, modelType: item.modelType,
    model: null, props: {}, cloud: { model: item.model, props: item.props || {}, updated: item.updated, pendingBytes: false },
  };
  // the same file this device already has: keep the bytes
  if (local?.model && item.model && local.cloud?.model?.hash === item.model.hash) rec.model = local.model;
  for (const [pid, p] of Object.entries(item.props || {})) if (local?.props?.[pid]?.data && local.cloud?.props?.[pid]?.hash === p.hash) rec.props[pid] = local.props[pid];
  rec.cloud.pendingBytes = (!!item.model && !rec.model) || Object.keys(item.props || {}).some((pid) => !rec.props[pid]);
  await putRaw('fighters', rec);
  return rec;
}
// the model files of a fighter that came down: fetch them and keep them on this device
export async function ensureFiles(rec) {
  if (!rec?.cloud?.pendingBytes) return rec;
  if (rec.cloud.model && !rec.model) { say(`Downloading ${rec.def.name}'s model (${mb(rec.cloud.model.size)} MB)…`); rec.model = await getFile(rec.cloud.model.url); rec.modelType = rec.cloud.model.type; }
  for (const [pid, p] of Object.entries(rec.cloud.props || {})) if (!rec.props[pid]?.data) rec.props[pid] = { data: await getFile(p.url), type: p.type, name: p.name || '' };
  rec.cloud.pendingBytes = false;
  await putRaw('fighters', rec);
  say(`${rec.def.name} is on this device.`);
  return rec;
}
// DOWNLOAD ALL: every fighter's files, one after the other
export function downloadAll() {
  return queue(async () => {
    for (const rec of (await pendingFiles()).recs) { await ensureFiles(rec); notify('fighters'); }
    say('All your fighters are on this device.');
  });
}
// REMOVE DOWNLOAD: free the space; the files stay on the account and the fighter still plays from there
export async function dropFiles(rec) {
  if (!rec?.cloud?.model && !Object.keys(rec?.cloud?.props || {}).length) return rec;
  if (rec.cloud.model) rec.model = null;
  for (const pid of Object.keys(rec.cloud.props || {})) delete rec.props[pid];
  rec.cloud.pendingBytes = true;
  await putRaw('fighters', rec);
  notify('fighters');
  return rec;
}

// ── sync: after logging in (and when the game opens with an account) ──
export function sync() { return queue(doSync); }
async function doSync() {
  if (!(await cloudReady())) { state.on = false; say(''); return; }
  state.on = true;
  say('Checking your account…');
  const owner = currentOwner();
  const r = await call('list');
  if (currentOwner() !== owner) return; // switched account meanwhile
  state.dir = r.dir;
  // things made here with no account become this account's
  const adopted = [...await adoptDeviceItems('fighters'), ...await adoptDeviceItems('arenas')];
  if (adopted.length) notify('all');
  for (const kind of ['fighters', 'arenas']) {
    const local = await listItems(kind), remote = new Map(r[kind].map((x) => [x.id, x]));
    for (const rec of local) {
      rec.updated ||= rec.created || Date.now();
      const far = remote.get(rec.id);
      if (!far) { if (rec.cloud) { await deleteItem(kind, rec.id); notify(kind); continue; } } // deleted on another device
      if (!far || rec.updated > far.updated || (rec.cloud?.updated || 0) < rec.updated) { await (kind === 'fighters' ? pushFighter(rec) : pushArena(rec)); continue; }
      if (far.updated > rec.updated) { await (kind === 'fighters' ? pullFighter(far, rec) : putRaw('arenas', { ...far, owner, cloud: { updated: far.updated } })); notify(kind); }
    }
    for (const far of r[kind]) if (!local.some((x) => x.id === far.id)) { await (kind === 'fighters' ? pullFighter(far, null) : putRaw('arenas', { ...far, owner, cloud: { updated: far.updated } })); notify(kind); }
  }
  say('Your fighters and arenas are on your account.');
  // model files that aren't on this device: the player decides (once per login) whether to fetch them
  const pend = await pendingFiles();
  if (pend.count && !state.asked && askFn) { state.asked = true; askFn(pend); }
}
// a new login: ask again about the files
export function resetAsk() { state.asked = false; }

// after saving / deleting on this device
export function push(kind, rec) {
  return queue(async () => {
    if (!(await cloudReady())) return;
    state.on = true;
    if (!state.dir) state.dir = (await call('list')).dir;
    // (a sync that was running meanwhile may have sent this very save already, or know which files are up)
    const stored = await getItem(kind, rec.id);
    if (stored?.cloud) { if ((stored.cloud.updated || 0) >= rec.updated) { say('Saved to your account.'); return; } rec.cloud = stored.cloud; }
    await (kind === 'fighters' ? pushFighter(rec) : pushArena(rec));
    say('Saved to your account.');
  });
}
export function remove(kind, id) { return queue(async () => { if (!(await cloudReady())) return; await call('del', { kind, id }); say('Deleted from your account.'); }); }

function queue(fn) {
  pending += 1;
  const run = chain.then(fn).catch((e) => {
    if (e.noServer) { state.on = false; say(''); return; }
    say(e.expired ? 'Logged out: log in again to save to your account.' : `Couldn't save to your account: ${e.message}`, 'error');
  }).finally(() => { pending -= 1; for (const w of watchers) w(status()); });
  chain = run;
  return run;
}
