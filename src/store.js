// Your creations, kept on this device (IndexedDB): fighters (with their model files) and arenas.
// (Sharing them through the server comes on top of this.)

const DB = 'creative-kombat', VER = 1;
let dbp = null;
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
export const listItems = (store) => tx(store, 'readonly', (s) => s.getAll()).catch(() => []);
export const saveItem = (store, item) => tx(store, 'readwrite', (s) => { s.put(item); });
export const deleteItem = (store, id) => tx(store, 'readwrite', (s) => { s.delete(id); });
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
