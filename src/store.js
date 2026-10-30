// Your creations on this device (IndexedDB): fighters (with their model files) and arenas.
// Each one belongs to an owner: the account that made it (its username, lowercased), or '' for
// this device (guests, or no account server). Only the current owner's things are listed, so two
// people sharing a phone each see their own. With an online account they also go up to the account
// (cloud.js) and come down on any other device.

const DB = 'creative-kombat', VER = 1;
let dbp = null;
let owner = '';
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { for (const s of ['fighters', 'arenas']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('The browser refused to save (out of space?)'));
  });
}
// whose things we show: the logged-in account's username, or '' for this device
export function setOwner(name) { owner = String(name || '').trim().toLowerCase(); }
export function currentOwner() { return owner; }
const mine = (r) => (r.owner || '') === owner;

export const listAll = (store) => tx(store, 'readonly', (s) => s.getAll()).catch(() => []);
export const listItems = (store) => listAll(store).then((all) => all.filter(mine));
export const getItem = (store, id) => tx(store, 'readonly', (s) => s.get(id)).catch(() => null);
export const saveItem = (store, item) => { item.owner = owner; return tx(store, 'readwrite', (s) => { s.put(item); }); };
export const putRaw = (store, item) => tx(store, 'readwrite', (s) => { s.put(item); }); // (keeps the item's own owner)
export const deleteItem = (store, id) => tx(store, 'readwrite', (s) => { s.delete(id); });
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Things made on this device with no account (as a guest, or before accounts) become the account's
// when someone logs in: they made them, and now they follow them. Returns what moved.
export async function adoptDeviceItems(store) {
  if (!owner) return [];
  const moved = (await listAll(store)).filter((r) => !(r.owner || ''));
  for (const r of moved) { r.owner = owner; await putRaw(store, r); }
  return moved;
}
