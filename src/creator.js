// CREATE: the player's own fighters (their 3D model or a stick figure in their colours, their height,
// their special from the special builder), their own arenas, and the tutorials. Everything is kept
// on this device (store.js) and, with an online account, on the account too (cloud.js).
// main.js hands over what it needs: initCreator({ ... }).

import * as THREE from 'three';
import { createRig } from './rig.js';
import { listItems, saveItem, deleteItem, newId } from './store.js';
import * as cloud from './cloud.js'; // (with an online account they follow the player to any device)
import { STEPS, ON_HIT, SHAPES, SOUNDS, MAX_DAMAGE, autoDamage, modelFx, MAX_STEPS, blankStep, blankSpecial, tweakSpecial, normalizeSpecial, describeSpecial, understands, testSpecial } from './custom.js';
import { findThing, LIBRARY_LIST } from './library.js';
const KNOWS = 'animals (horse, tiger, dragon, eagle, dolphin, shark...), people (knight, wizard, ninja, robot, giant...), weapons and things (sword, spear, anvil, rocket, car, tank...) and effects (fireball, beam, wave, tornado, stomp...)';
import { GROUNDS, SKIES, WEATHER, PROPS, PRESET_ARENAS, describeArena } from './arenas.js';

// model files: what fits
export const MODEL_LIMIT_MB = 20;      // the most we take
export const MODEL_GOOD_MB = 8;        // what runs smoothly on phones
export const TRI_GOOD = 100000;        // triangles: more than this can lag on phones

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mb = (bytes) => (bytes / 1048576).toFixed(1);

let api = null;
const blobUrls = new Map(); // fighter id → its model's blob: URL (and 'id/prop' → a special's own model)
const PROP_LIMIT_MB = 8;     // a model for a special (a beast, a giant foot...): smaller than a fighter

// ── loading what's saved, into the game ────────────────────────────────────────
export function fighterDef(rec) {
  const def = { ...rec.def, id: rec.id, custom: true };
  if (rec.model) {
    if (!blobUrls.has(rec.id)) blobUrls.set(rec.id, URL.createObjectURL(new Blob([rec.model], { type: 'application/octet-stream' })));
    def.model = blobUrls.get(rec.id);
    def.modelType = rec.modelType;
    def.autoRig = 'force';
  } else if (rec.cloud?.model) { // came from the account and the file hasn't been fetched yet: play it from there
    def.model = rec.cloud.model.url;
    def.modelType = rec.cloud.model.type;
    def.autoRig = 'force';
  }
  // the special's own models (a beast, a giant foot, a thrown thing...)
  def.props = {};
  for (const [pid, p] of Object.entries(rec.props || {})) {
    if (!p?.data) continue;
    const key = `${rec.id}/${pid}`;
    if (!blobUrls.has(key)) blobUrls.set(key, URL.createObjectURL(new Blob([p.data], { type: 'application/octet-stream' })));
    def.props[pid] = { url: blobUrls.get(key), type: p.type };
  }
  for (const [pid, p] of Object.entries(rec.cloud?.props || {})) if (!def.props[pid]) def.props[pid] = { url: p.url, type: p.type };
  return def;
}
export async function loadCustomFighters() { return (await listItems('fighters')).sort((a, b) => a.created - b.created).map(fighterDef); }
export async function loadCustomArenas() { return (await listItems('arenas')).sort((a, b) => a.created - b.created); }
export async function allArenas() { return [...PRESET_ARENAS, ...(await loadCustomArenas())]; }

// ── the screens ──────────────────────────────────────────────────────────────────
const CSS = `
.cr { max-width: 760px; width: min(760px, 100%); }
.cr h2 { margin: 0 0 10px; }
.cr h3 { font-family: var(--display); color: var(--gold); font-weight: 400; font-size: 17px; margin: 18px 0 8px; letter-spacing: .04em; }
.cr .cloud { min-height: 1.3em; margin: -4px 0 8px; } .cr .cloud:empty { display: none; } .cr .cloud.busy { color: var(--gold); } .cr .cloud.bad { color: #ff8a8a; }
.cr .files { background: rgba(244,197,66,.1); border: 1px solid rgba(244,197,66,.3); border-radius: 4px; padding: 8px 10px; margin: 0 0 8px; line-height: 1.5; } .cr .files .mini { margin-left: 6px; }
.cr .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
.cr label.f { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--dust); flex: 1; min-width: 140px; }
.cr input[type=text], .cr textarea, .cr select { font: inherit; font-size: 15px; color: #fff; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.18); border-radius: 4px; padding: 8px 10px; }
.cr textarea { min-height: 64px; resize: vertical; }
.cr input[type=range] { width: 100%; }
.cr input[type=color] { width: 46px; height: 34px; padding: 0; border: 0; background: none; }
.cr .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cr .chip { font: 600 13px system-ui, sans-serif; padding: 6px 10px; border-radius: 16px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.05); color: #ddd; cursor: pointer; }
.cr .chip.on { background: var(--gold); color: #1a0f08; border-color: var(--gold); }
.cr .note { font-size: 13px; color: var(--dust); line-height: 1.45; }
.cr .warn { color: #ffcf5a; } .cr .bad { color: #ff7a7a; } .cr .good { color: #6be38a; }
.cr .box { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
.cr .list { list-style: none; padding: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; }
.cr .list li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(255,255,255,.05); border-radius: 4px; }
.cr .list li .nm { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.cr .preview { width: 100%; height: 240px; border-radius: 6px; background: radial-gradient(#3a2a26, #120a0a); display: block; touch-action: none; }
.cr .sp-step select { font-weight: 700; }
.cr .foot { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.cr .foot .btn { flex: 1; min-width: 140px; }
.cr .tut p, .cr .tut li { font-size: 14px; line-height: 1.5; }
.cr .tut ol { padding-left: 20px; }
.cr .tut code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px; }
.cr .mini { font: 600 12px system-ui, sans-serif; }
.cr .mini.ai { background: linear-gradient(90deg, #7b3cff, #ff4fa8); color: #fff; border: 0; }
`;
function screen(id, html) {
  const s = document.createElement('section');
  s.className = 'screen modal';
  s.id = id; s.hidden = true;
  s.innerHTML = `<div class="help cr">${html}</div>`;
  document.body.appendChild(s);
  return s;
}

export function initCreator(a) {
  api = a;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  buildHub(); buildFighterList(); buildFighterEdit(); buildArenaList(); buildArenaEdit(); buildTutorials(); buildAiBuy();
  // where the creations live: on the account (and what's being sent up / coming down), or only here
  cloud.onCloud((st) => {
    const text = st.on || st.error ? st.text : api.offline?.() ? '' : (api.hasAccount?.() ? 'On this device only: the server has no file store, so they can\'t follow your account yet.' : 'On this device only. Log in to an online account (ACCOUNT on the title screen) and they follow you to any device.');
    for (const el of document.querySelectorAll('.cr .cloud')) { el.textContent = text; el.classList.toggle('bad', !!st.error); el.classList.toggle('busy', st.busy); }
  });
}

// ── the AI designer: the paid option ─────────────────────────────────────────────
// The free builder (FILL IN + the parts) is always free. The AI DESIGN button sends the words to
// the server (api/ai.js), which has Claude pick the parts: any language, any way of putting it.
// One design = one credit; credits come in packs bought in the shop (a few free ones to try).
const AI = { credits: null, packs: [], from: null, unavailable: false };
const session = () => { try { return JSON.parse(localStorage.getItem('fk-session')); } catch { return null; } };
async function aiCall(action, data = {}) {
  if (api.offline?.()) return { ok: false, error: 'The AI designer works on the full online game, not in this preview. The Default special design works everywhere.' };
  const s = session();
  if (!s?.token) return { ok: false, error: 'Log in to an online account (ACCOUNT on the title screen) to use the AI designer.' };
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: s.token, ...data }) });
    const j = await r.json();
    if (typeof j.credits === 'number') AI.credits = j.credits;
    if ('unlimited' in j) AI.unlimited = !!j.unlimited;
    if (j.packs) AI.packs = j.packs;
    showCredits();
    return j;
  } catch { return { ok: false, error: 'Could not reach the server. Try again.' }; }
}
function showCredits() {
  for (const el of document.querySelectorAll('.ai-cr')) el.textContent = AI.credits == null ? '' : AI.unlimited ? 'unlimited AI designs (admin)' : `${AI.credits} AI design${AI.credits === 1 ? '' : 's'} left`;
}
const LOADING_HTML = '<span class="busy">⏳ Designing… this can take up to a minute. Please wait, it is not ready yet.</span>';

// press AI DESIGN: the result, or the shop if they're out
// the list of everything the free builder understands: tap one to use it as the description
function openLibrary(pick) {
  document.getElementById('lib-list')?.remove();
  const el = document.createElement('div'); el.id = 'lib-list';
  el.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(10,5,6,.82);display:flex;align-items:center;justify-content:center;padding:12px';
  const sec = LIBRARY_LIST.map((g) => `<h4 style="margin:14px 0 2px;color:#f4c542;font:800 15px system-ui">${esc(g.title)}</h4>${g.note ? `<div style="font:400 12px system-ui;color:#c9b99f;margin-bottom:4px">${esc(g.note)}</div>` : ''}<div style="display:flex;flex-wrap:wrap;gap:6px">${g.items.map((x) => `<button class="mini" data-say="${esc(x.say)}" style="text-align:left" title="${esc(x.also ? 'Also understands: ' + x.also : '')}">${esc(x.name)}${x.also ? `<span style="display:block;font:400 10px system-ui;opacity:.7">${esc(x.also.split(', ').slice(0, 3).join(', '))}</span>` : ''}</button>`).join('')}</div>`).join('');
  el.innerHTML = `<div style="background:#2a1816;border:2px solid rgba(244,197,66,.6);border-radius:10px;padding:16px 18px;max-width:min(640px,96vw);max-height:90vh;overflow:auto;color:#f5ecdf;font:400 14px/1.4 system-ui">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:17px">What the free builder understands</b><button class="mini" id="lib-x">CLOSE</button></div>
    <p style="margin:6px 0 0;font-size:12px;color:#c9b99f">Tap one to write it in the description. Mix them: "a knight riding a horse, then a dragon falls from the sky". Add a colour (red, gold...), "giant" or "tiny", "fire" or "ice". For anything not here use the paid AI, or upload your own 3D model.</p>${sec}</div>`;
  document.body.appendChild(el);
  el.onclick = (e) => { if (e.target === el || e.target.id === 'lib-x') return el.remove(); const b = e.target.closest('[data-say]'); if (b) { el.remove(); pick(b.dataset.say); } };
}
// a pop-up in the middle of the screen while the AI works (it can take up to a minute)
function showWait(msg) {
  let el = document.getElementById('ai-wait');
  if (!el) {
    const st = document.createElement('style'); st.textContent = '@keyframes ckspin { to { transform: rotate(360deg); } }'; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'ai-wait';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(10,5,6,.75)';
    el.innerHTML = '<div style="background:#2a1816;border:2px solid rgba(244,197,66,.6);border-radius:10px;padding:22px 28px;max-width:min(360px,86vw);text-align:center;color:#f5ecdf;font:700 18px/1.4 system-ui,sans-serif"><div style="font-size:34px;display:inline-block;animation:ckspin 1.4s linear infinite">⏳</div><div id="ai-wait-t" style="margin-top:8px"></div><div style="margin-top:6px;font:400 13px system-ui,sans-serif;color:#c9b99f">This can take up to a minute. Please wait.</div></div>';
    document.body.appendChild(el);
  }
  document.getElementById('ai-wait-t').textContent = msg; el.hidden = false; el.style.display = 'flex';
}
function hideWait() { const el = document.getElementById('ai-wait'); if (el) { el.hidden = true; el.style.display = 'none'; } }
async function aiDesign(kind, text, btn, say, extra = {}) {
  if (!text.trim()) { say('<span class="warn">Describe it first, in your own words (any language).</span>'); return null; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'DESIGNING…';
  showWait({ special: 'Designing your special…', tweak: 'Changing your special…', scene: 'Building your arena…', scenetweak: 'Changing your arena…', arena: 'Painting your arena…' }[kind] || 'Designing…');
  let r;
  try { r = await aiCall(kind, { text, ...extra }); } finally { hideWait(); btn.disabled = false; btn.textContent = label; }
  AI.unavailable = !r.ok && !!(r.login || /not set up|online game|Log in/i.test(r.error || ''));
  if (r.ok) return r[kind === 'tweak' ? 'special' : kind];
  if (r.buy) openBuy();
  say(`<span class="bad">${esc(r.error || 'It did not work. Try again.')}</span>`);
  return null;
}
function buildAiBuy() {
  screen('screen-ai-buy', `
    <h2>✨ AI DESIGNS</h2>
    <p class="note">The AI designer turns any description, in any language, into a special or an arena: <i>"like Goku's spirit bomb but made of cats"</i>. One design uses one credit. Building it yourself with the parts and FILL IN stays free.</p>
    <p class="ai-cr good"></p>
    <ul class="list" id="ai-packs"></ul>
    <p class="note" id="ai-how">🔒 Secure checkout by Lemon Squeezy: Visa, Mastercard, PayPal, Apple Pay, Google Pay. When you've paid, come back and press UPDATE.</p>
    <p class="note" id="ai-status" role="status"></p>
    <div class="foot"><button class="btn" id="ai-refresh">UPDATE</button><button class="btn" id="ai-back">BACK</button></div>`);
  $('#ai-refresh').onclick = async () => { await aiCall('credits'); await renderShop(); };
  $('#ai-back').onclick = () => api.show(AI.from || 'screen-create');
  $('#ai-packs').onclick = (e) => {
    const u = e.target.dataset.url, sku = e.target.dataset.sku;
    if (sku) buyOnPlay(sku, e.target);
    else if (u) window.open(u, '_blank', 'noopener');
  };
}
// the website: Lemon Squeezy buy links
function renderPacks() {
  const packs = AI.packs.filter((p) => p.url);
  $('#ai-packs').innerHTML = packs.length
    ? packs.map((p) => `<li><span class="nm"><b>${p.designs} AI designs</b><br><span class="note">${esc(p.price)}</span></span><button class="mini" data-url="${esc(p.url)}">BUY</button></li>`).join('')
    : '<li class="note">The shop isn\'t open yet.</li>';
}
// the shop for where the game runs: Google Play in the Play Store app, Lemon Squeezy on the website
async function renderShop() {
  const service = await playBilling();
  if (service) { await restorePlayPurchases(service); await renderPlayPacks(service); } else renderPacks();
}
async function openBuy() {
  AI.from = [...document.querySelectorAll('section.screen')].find((x) => !x.hidden && x.id !== 'screen-ai-buy')?.id || 'screen-create';
  renderPacks(); showCredits();
  $('#ai-status').textContent = '';
  api.show('screen-ai-buy');
  const r = await aiCall('credits');
  if (!r.ok) $('#ai-packs').innerHTML = `<li class="note bad">${esc(r.error)}</li>`; else await renderShop();
}

// ── Google Play (the app from the Play Store): Google's rules say digital things sold inside the app
// go through Google Play's own payment. The browser's Digital Goods API reaches Play Billing from the
// web app; the purchase is checked and credited by the server (api/play.js), then consumed so the
// same pack can be bought again. ──
const PLAY = { service: undefined };
async function playBilling() {
  if (PLAY.service !== undefined) return PLAY.service;
  PLAY.service = null;
  try { if ('getDigitalGoodsService' in window) PLAY.service = (await window.getDigitalGoodsService('https://play.google.com/billing')) || null; } catch { PLAY.service = null; }
  return PLAY.service;
}
const playPrice = (d, fallback) => { try { return d?.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) : fallback; } catch { return fallback; } };
async function renderPlayPacks(service) {
  const packs = AI.packs.filter((p) => p.sku);
  let details = [];
  try { details = await service.getDetails(packs.map((p) => p.sku)); } catch { /* Play didn't answer: the fallback prices */ }
  $('#ai-how').textContent = '🔒 Payment through Google Play (Google Pay, card, PayPal where available). The designs are added to your account right away.';
  $('#ai-packs').innerHTML = packs.length
    ? packs.map((p) => `<li><span class="nm"><b>${p.designs} AI designs</b><br><span class="note">${esc(playPrice(details.find((d) => d.itemId === p.sku), p.price))} · Google Play</span></span><button class="mini" data-sku="${esc(p.sku)}">BUY</button></li>`).join('')
    : '<li class="note">The shop isn\'t open yet.</li>';
}
async function buyOnPlay(sku, btn) {
  const service = await playBilling();
  if (!service) return;
  const status = $('#ai-status');
  btn.disabled = true; status.textContent = '';
  try {
    const request = new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku } }], { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } });
    const response = await request.show();
    const purchaseToken = response.details?.purchaseToken || response.details?.token;
    const r = await creditPlayPurchase(service, sku, purchaseToken);
    await response.complete(r.ok ? 'success' : 'fail');
    status.innerHTML = r.ok ? `<span class="good">Thanks! ${r.designs} designs added to your account.</span>` : `<span class="bad">${esc(r.error || 'The purchase did not go through.')}</span>`;
  } catch (e) {
    if (e?.name !== 'AbortError') status.innerHTML = `<span class="bad">The purchase did not go through${e?.message ? `: ${esc(e.message)}` : ''}.</span>`;
  }
  btn.disabled = false;
}
// the server checks the purchase with Google and adds the designs; then the purchase is consumed
async function creditPlayPurchase(service, sku, purchaseToken) {
  if (!purchaseToken) return { ok: false, error: 'Google Play did not return a purchase.' };
  let j;
  try {
    const r = await fetch('/api/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', token: session()?.token, sku, purchaseToken }) });
    j = await r.json();
  } catch { return { ok: false, error: 'Could not reach the server. Press UPDATE in a moment: nothing is lost.' }; }
  if (j.ok) {
    try { await service.consume(purchaseToken); } catch { /* consumed already, or Play will show it again: the server credits once per order */ }
    if (typeof j.credits === 'number') AI.credits = j.credits;
    showCredits();
  }
  return j;
}
// purchases that were paid for but not credited (the app closed in between): credit them now
async function restorePlayPurchases(service) {
  try {
    for (const p of await service.listPurchases()) if (AI.packs.some((k) => k.sku === p.itemId) && p.purchaseToken) await creditPlayPurchase(service, p.itemId, p.purchaseToken);
  } catch { /* nothing to restore */ }
}
export function openCreate() { api.show('screen-create'); }

function buildHub() {
  const s = screen('screen-create', `
    <h2>CREATE</h2>
    <p class="note">Make your own fighters (your own 3D models and specials) and your own arenas. Everything you make shows up in the fighter select and the arena list.</p>
    <div class="menu" style="margin-top:14px">
      <button class="btn" data-go="fighters">MY FIGHTERS</button>
      <button class="btn" data-go="arenas">MY ARENAS</button>
      <button class="btn" data-go="tutorials">TUTORIALS</button>
      <button class="btn" data-go="back">BACK</button>
    </div>`);
  s.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]')?.dataset.go;
    if (g === 'fighters') openFighters();
    if (g === 'arenas') openArenas();
    if (g === 'tutorials') openTutorials('models');
    if (g === 'back') api.backToTitle();
  });
}

// ── fighters ─────────────────────────────────────────────────────────────────────
function buildFighterList() {
  screen('screen-fighters', `
    <h2>MY FIGHTERS</h2>
    <p class="note cloud" role="status"></p>
    <p class="note files" id="cr-files" hidden></p>
    <ul class="list" id="cr-flist"></ul>
    <div class="foot"><button class="btn" id="cr-fnew">+ NEW FIGHTER</button><button class="btn" id="cr-fback">BACK</button></div>`);
  $('#cr-fnew').onclick = () => editFighter(null);
  $('#cr-fback').onclick = () => openCreate();
}
async function openFighters() {
  const ul = $('#cr-flist'), recs = (await listItems('fighters')).sort((a, b) => a.created - b.created);
  ul.innerHTML = recs.length ? '' : '<li class="note">No fighters yet. Make your first one!</li>';
  for (const r of recs) {
    const li = document.createElement('li');
    const size = r.model ? r.model.byteLength : r.cloud?.model?.size;
    const onAccount = !!(r.cloud?.model || Object.keys(r.cloud?.props || {}).length); // (has files on the account)
    const where = !onAccount ? '' : r.cloud.pendingBytes ? ` · <span class="warn">files on your account, not on this device</span>` : ' · on this device and your account';
    li.innerHTML = `<span class="nm"><b>${esc(r.def.name)}</b><br><span class="note">${size ? `3D model, ${mb(size)} MB` : 'Stick figure'} · ${esc(r.def.special.name)}${where}</span></span>
      ${onAccount ? (r.cloud.pendingBytes ? `<button class="mini" data-a="get">DOWNLOAD</button>` : `<button class="mini ghost" data-a="drop" title="Free the space on this device; the files stay on your account">REMOVE DOWNLOAD</button>`) : ''}
      <button class="mini" data-a="try">TRY</button><button class="mini" data-a="edit">EDIT</button><button class="mini ghost" data-a="del">DELETE</button>`;
    li.onclick = async (e) => {
      const act = e.target.dataset.a;
      if (act === 'edit') editFighter(r);
      if (act === 'try') api.practice(fighterDef(r));
      if (act === 'get') { e.target.disabled = true; e.target.textContent = 'DOWNLOADING…'; try { await cloud.ensureFiles(r); await api.fightersChanged(); } catch (err) { alert(`Couldn't download: ${err.message}`); } openFighters(); }
      if (act === 'drop') { await cloud.dropFiles(r); for (const [k, u] of [...blobUrls]) if (k === r.id || k.startsWith(`${r.id}/`)) { URL.revokeObjectURL(u); blobUrls.delete(k); } await api.fightersChanged(); openFighters(); }
      if (act === 'del' && confirm(`Delete ${r.def.name}?${onAccount ? ' It goes from your account too.' : ''}`)) { await deleteItem('fighters', r.id); cloud.remove('fighters', r.id); URL.revokeObjectURL(blobUrls.get(r.id)); blobUrls.delete(r.id); await api.fightersChanged(); openFighters(); }
    };
    ul.appendChild(li);
  }
  // files on the account that this device hasn't kept: all at once
  const pend = await cloud.pendingFiles(), files = $('#cr-files');
  files.hidden = !pend.count;
  if (pend.count) {
    files.innerHTML = `${pend.count === 1 ? 'One fighter has' : `${pend.count} fighters have`} 3D model files on your account that aren't on this device (<b>${cloud.fmtMB(pend.bytes)}</b>). They play straight from your account; download them to keep them here. <button class="mini" id="cr-getall">DOWNLOAD ALL (${cloud.fmtMB(pend.bytes)})</button>`;
    $('#cr-getall').onclick = async () => { $('#cr-getall').disabled = true; await cloud.downloadAll(); openFighters(); };
  }
  api.show('screen-fighters');
}

const FE = { rec: null, model: null, modelType: null, special: null, tested: null, preview: null, props: {}, undo: [] };
function buildFighterEdit() {
  screen('screen-fighter-edit', `
    <h2 id="fe-title">NEW FIGHTER</h2>
    <div class="row"><label class="f">Name<input type="text" id="fe-name" maxlength="18" placeholder="e.g. CAPTAIN NOODLE"></label>
      <label class="f">Line under the name<input type="text" id="fe-tag" maxlength="40" placeholder="optional"></label></div>

    <h3>1. THE LOOK</h3>
    <div class="box">
      <div class="row"><button class="btn" id="fe-upload" style="flex:1">UPLOAD A 3D MODEL</button><button class="mini ghost" id="fe-nomodel">USE A STICK FIGURE</button>
        <input type="file" id="fe-file" accept=".glb,.gltf,.fbx" hidden></div>
      <p class="note">A <b>.glb</b> file (or .gltf / .fbx) of a person or creature standing up, facing you, arms a little out. <b>Up to ${MODEL_LIMIT_MB} MB; under ${MODEL_GOOD_MB} MB runs smoothly on phones.</b> <a href="#" id="fe-howto">How to make one, and how to make it smaller</a></p>
      <p class="note" id="fe-modelinfo"></p>
      <canvas class="preview" id="fe-preview"></canvas>
      <div class="row" id="fe-turnrow"><span class="note">Facing the wrong way?</span><button class="mini" id="fe-turn">TURN 90°</button></div>
      <div class="row" id="fe-colors"><span class="note">Stick figure colours:</span>
        <label class="note">Head <input type="color" id="fe-c-skin" value="#f4f4f4"></label>
        <label class="note">Body <input type="color" id="fe-c-shirt" value="#1b1b1f"></label>
        <label class="note">Legs <input type="color" id="fe-c-pants" value="#1b1b1f"></label></div>
      <label class="f">Height: <span id="fe-hv">175 cm</span> <span class="note">(taller: longer reach; shorter: faster)</span><input type="range" id="fe-height" min="140" max="210" value="175"></label>
    </div>

    <h3>2. THE SPECIAL</h3>
    <div class="box">
      <div class="chips" id="fe-modes">
        <button class="chip" data-m="basic">1. FREE: BUILD IT FROM MY DESCRIPTION <span class="note">(the game draws it from its own shapes)</span></button>
        <button class="chip" data-m="creative">2. PAID: THE AI BUILDS IT <span class="note">(any description, realistic, any language)</span></button>
      </div>
      <p class="note" id="fe-modenote"></p>
      <div id="fe-creative">
        <label class="f">Describe your special in your own words (any language)<textarea id="fe-desc" placeholder="e.g. the player rides a wave towards the opponent, washing everything in its way"></textarea></label>
        <div class="row"><button class="mini" id="fe-fill" data-only="free">BUILD IT FROM MY DESCRIPTION (FREE)</button><button class="mini ai" id="fe-ai" data-only="paid">✨ LET THE AI BUILD IT</button><span class="note ai-cr" data-only="paid"></span><a href="#" class="note" id="fe-aibuy" data-only="paid">get more</a></div>
        <p class="note" data-only="free">FREE: write what you want and the game builds it from its own library (animals, people, weapons, vehicles and effects), instantly and with no limit. Then say what to change in the box below. Want something it does not know, in more detail? Use the paid AI. Want it realistic? Upload your own 3D model below and say in the description what it is: the game combines your model with the effects.</p>
        <p class="note" data-only="paid">✨ The AI builds the special from your description alone, in any language, nothing pre-selected (uses a credit; needs the AI to be set up on the server). The free button builds from the game's own library (animals, people, weapons, vehicles and effects) and understands simple English words. Then TEST it, and say what to change below (each AI change costs another credit; the keyword CHANGE IT is free).</p>
        <p class="note warn" data-only="paid">Heads up: the AI will not get it 100% perfect every time. Each change you ask the AI for (AI DESIGN again or ✨ AI CHANGE) costs another credit. Test it, and make the changes count: describe the whole thing clearly the first time.</p>
        <div class="row"><label class="f">Special's name<input type="text" id="fe-sname" maxlength="22"></label></div>
        <div id="fe-csum" class="note"></div>
        <div class="row"><button class="mini" id="fe-cmodel">UPLOAD YOUR OWN 3D MODEL (OPTIONAL)</button><span class="note" id="fe-cmodelinfo"></span></div>
        <p class="note warn">If you upload a 3D model, say in the description what it is and what it does (for example: "my model is a horse, it gallops at the opponent"), so the game uses your model instead of building one. Upload it first, then press the build button.</p>
      </div>
      <div id="fe-basic" hidden>
      <div class="note">Fine-tune the steps if you want (optional), one after another (up to ${MAX_STEPS}):</div>
      <div id="fe-steps"></div>
      <div class="row"><button class="mini" id="fe-addstep">+ ADD A STEP</button><span class="note">e.g. summon a beast, then a giant stomp, then a blast</span></div>
      <input type="file" id="fe-stepfile" accept=".glb,.gltf,.fbx" hidden>
      <div class="note">What the last hit does (up to 3):</div><div class="chips" id="fe-onhit"></div>
      <div class="row"><span class="note">Damage in all: <b id="fe-dmgv"></b> (automatic)</span></div>
      <div class="row"><label class="note">Colour <input type="color" id="fe-scolor"></label><label class="f">Sound<select id="fe-sound"></select></label></div>
      <div class="row"><button class="chip" id="fe-flash">White flash</button><button class="chip" id="fe-shake">Screen shake</button></div>
      </div>
      <div class="row"><button class="btn" id="fe-test" style="flex:1">TEST THE SPECIAL</button><button class="btn" id="fe-try" style="flex:1">▶ TRY IT NOW</button></div>
      <div id="fe-report" class="note"></div>
      <div class="row" data-only="free"><button class="mini" id="fe-list">📖 WHAT CAN THE FREE BUILDER MAKE?</button></div>
      <div class="box" id="fe-tweakbox" style="margin-top:10px">
        <label class="f">Not quite right? Say what to change<textarea id="fe-tweak" placeholder="e.g. the tiger is too slow, make it bigger and bite 3 times, freeze instead of knock down, add a cage at the end"></textarea></label>
        <div class="row"><button class="mini" id="fe-tw">CHANGE IT (FREE)</button><button class="mini ai" id="fe-aitw" data-only="paid">✨ AI CHANGE</button><button class="mini ghost" id="fe-undo" disabled>↶ UNDO</button><span class="note ai-cr"></span></div>
        <p class="note">Try it, say what's wrong, change it, try again, until it's perfect. UNDO goes back a change.</p>
      </div>
    </div>
    <p class="note bad" id="fe-err"></p>
    <div class="foot"><button class="btn" id="fe-save">SAVE</button><button class="btn" id="fe-cancel">CANCEL</button></div>`);
  const sel = (id, obj) => { $(id).innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${esc(v.label || v)}</option>`).join(''); };
  sel('#fe-sound', SOUNDS);
  $('#fe-onhit').innerHTML = Object.entries(ON_HIT).map(([k, v]) => `<button class="chip" data-k="${k}">${esc(v)}</button>`).join('');
  $('#fe-upload').onclick = () => $('#fe-file').click();
  $('#fe-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) takeModel(f); };
  $('#fe-nomodel').onclick = () => { FE.model = null; FE.modelType = null; $('#fe-modelinfo').innerHTML = 'A stick figure in your colours.'; refreshPreview(); };
  $('#fe-turn').onclick = () => { FE.rot = ((FE.rot || 0) + Math.PI / 2) % (Math.PI * 2); refreshPreview(); };
  $('#fe-howto').onclick = (e) => { e.preventDefault(); openTutorials('size', 'screen-fighter-edit'); };
  for (const id of ['#fe-c-skin', '#fe-c-shirt', '#fe-c-pants']) $(id).oninput = () => !FE.model && refreshPreview();
  $('#fe-height').oninput = () => { $('#fe-hv').textContent = `${$('#fe-height').value} cm`; };
  const changed = () => { FE.tested = null; $('#fe-report').innerHTML = '<span class="warn">Changed: test it again before saving.</span>'; };
  for (const id of ['#fe-sname', '#fe-scolor', '#fe-sound']) $(id).addEventListener('input', () => { readSpecial(); showSpecial(); changed(); });
  // the steps: each its own little card (what it is, hits, size, speed, look / your own model)
  $('#fe-steps').addEventListener('input', (e) => {
    const card = e.target.closest('[data-i]'); if (!card) return;
    const st = FE.special.steps[+card.dataset.i], k = e.target.dataset.f;
    st[k] = k === 'kind' || k === 'shape' ? e.target.value : +e.target.value;
    if (k === 'kind' && !STEPS[st.kind].model) st.model = null;
    FE.special = normalizeSpecial(FE.special).special; showSpecial(); changed();
  });
  $('#fe-steps').addEventListener('click', (e) => {
    const card = e.target.closest('[data-i]'), a = e.target.dataset.a; if (!card || !a) return;
    const i = +card.dataset.i, steps = FE.special.steps;
    if (a === 'del' && steps.length > 1) steps.splice(i, 1);
    if (a === 'up' && i > 0) [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
    if (a === 'model') { FE.stepFor = i; $('#fe-stepfile').click(); return; }
    if (a === 'nomodel') steps[i].model = null;
    FE.special = normalizeSpecial(FE.special).special; showSpecial(); changed();
  });
  $('#fe-addstep').onclick = () => { if (FE.special.steps.length >= MAX_STEPS) return; FE.special.steps.push(blankStep('blast')); FE.special = normalizeSpecial(FE.special).special; showSpecial(); changed(); };
  $('#fe-stepfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) takeStepModel(f, FE.stepFor); };
  $('#fe-onhit').onclick = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const on = FE.special.onHit; const i = on.indexOf(k);
    if (i >= 0) on.splice(i, 1); else on.push(k);
    FE.special = normalizeSpecial(FE.special).special; showSpecial(); changed();
  };
  for (const [id, k] of [['#fe-flash', 'flash'], ['#fe-shake', 'shake']]) $(id).onclick = () => { FE.special[k] = !FE.special[k]; showSpecial(); changed(); };
  // FREE: the game's own library builds what is described (animals, people, weapons, vehicles...): instant, no AI service, unlimited.
  // Anything it does not know is for the paid AI, or the player's own 3D model.
  $('#fe-fill').onclick = () => {
    const t = $('#fe-desc').value; if (!t.trim()) { $('#fe-report').innerHTML = '<span class="warn">Describe it first.</span>'; return; }
    if (!understands(t)) { $('#fe-report').innerHTML = `<span class="warn">The free builder doesn't know that one yet.</span> It knows ${KNOWS}. For anything else use the <b>✨ paid AI</b>, or upload your own 3D model below.`; return; }
    pushUndo(); const old = FE.special.steps; FE.special = { ...describeSpecial(t), mode: 'basic', desc: t }; keepModels(old);
    showSpecial(); changed(); $('#fe-report').innerHTML = '<span class="good">✨ Built.</span> <span class="warn">Test it before saving. Want a different look or something it does not know? The paid AI builds anything, in far more detail.</span>';
  };
  $('#fe-cmodel').onclick = () => {
    let i = FE.special.steps.findIndex((x) => STEPS[x.kind].model);
    if (i < 0) { pushUndo(); FE.special = normalizeSpecial({ ...FE.special, steps: [{ ...blankStep('free'), hits: 3, fx: modelFx() }], onHit: FE.special.onHit?.length ? FE.special.onHit : ['knockdown'], mode: 'creative', desc: $('#fe-desc').value }).special; showSpecial(); changed(); i = 0; }
    FE.stepFor = i; $('#fe-stepfile').click();
  };
  $('#fe-modes').onclick = (e) => { const m = e.target.closest('[data-m]')?.dataset.m; if (!m || m === FE.special.mode) return; FE.special.mode = m; showSpecial(); };
  $('#fe-ai').onclick = async () => {
    $('#fe-report').innerHTML = '<span class="busy">⏳ Designing… this can take up to a minute. Please wait, it is not ready yet.</span>';
    const sp = await aiDesign('special', $('#fe-desc').value, $('#fe-ai'), (h) => { $('#fe-report').innerHTML = h; }, { creative: true, hasModel: FE.special.steps.some((x) => x.model && FE.props[x.model]) });
    if (!sp) return;
    pushUndo();
    const old = FE.special.steps;
    FE.special = normalizeSpecial({ ...sp, type: 'custom', mode: 'creative', desc: $('#fe-desc').value }).special;
    // (a model uploaded for a step stays, if that step is still the same kind of part)
    FE.special.steps.forEach((st, i) => { if (old[i]?.model && old[i].kind === st.kind) st.model = old[i].model; });
    reuseModels(old);
    showSpecial(); changed();
    $('#fe-report').innerHTML += '<br><span class="good">✨ Designed by the AI from your description:</span> test it, or say what to change below.';
  };
  $('#fe-aibuy').onclick = (e) => { e.preventDefault(); openBuy(); };
  // fixing it until it's perfect: try it in practice and come straight back, change it with words, undo
  const keepModels = (old) => { FE.special.steps.forEach((st, i) => { if (!st.model && old[i]?.model && old[i].kind === st.kind && STEPS[st.kind].model) st.model = old[i].model; }); reuseModels(old); };
  // (an uploaded model the new design didn't keep in place goes to the first step that can show one)
  const reuseModels = (old) => { const used = new Set(FE.special.steps.map((x) => x.model)); for (const m of old.map((x) => x.model).filter((x) => x && !used.has(x))) { const st = FE.special.steps.find((x) => !x.model && STEPS[x.kind].model); if (st) st.model = m; } };
  const said = (h) => { $('#fe-report').innerHTML = h; };
  $('#fe-tw').onclick = () => {
    readSpecial();
    const t = $('#fe-tweak').value; if (!t.trim()) return said('<span class="warn">Say what to change first.</span>');
    if (findThing(t) && /\b(instead|change (it )?to|turn (it )?into|make it (a|an)|replace)\b/i.test(t)) { // (a different thing: build it again, keeping the rest)
      pushUndo(); const old = FE.special.steps; FE.special = { ...describeSpecial(t), mode: 'basic', desc: FE.special.desc }; keepModels(old);
      showSpecial(); changed(); return said('<span class="good">Changed.</span> <span class="warn">Test it again before saving.</span>');
    }
    const r = tweakSpecial(FE.special, t);
    if (!r.said.length) return said('<span class="warn">The free change could not understand that.</span> Try: bigger, smaller, faster, slower, hit 3 times, freeze instead of knock down, add a cage... or use the <b>✨ AI CHANGE</b> (paid).');
    pushUndo(); const old = FE.special.steps; FE.special = r.special; keepModels(old);
    showSpecial(); changed(); said(`<span class="good">Changed:</span> ${r.said.map(esc).join(' · ')}. <span class="warn">Test it again before saving.</span>`);
  };
  $('#fe-aitw').onclick = async () => {
    readSpecial();
    said('<span class="busy">⏳ Designing… this can take up to a minute. Please wait, it is not ready yet.</span>');
    const sp = await aiDesign('tweak', $('#fe-tweak').value, $('#fe-aitw'), said, { special: FE.special, creative: FE.special.mode === 'creative', hasModel: FE.special.steps.some((x) => x.model && FE.props[x.model]) });
    if (!sp) return;
    pushUndo(); const old = FE.special.steps; FE.special = normalizeSpecial({ ...sp, type: 'custom', mode: FE.special.mode, desc: FE.special.desc }).special; keepModels(old);
    showSpecial(); changed(); said('<span class="good">✨ Changed by the AI.</span> <span class="warn">Test it again before saving.</span>');
  };
  $('#fe-undo').onclick = () => { const prev = FE.undo.pop(); if (!prev) return; FE.special = prev; $('#fe-undo').disabled = !FE.undo.length; showSpecial(); changed(); };
  $('#fe-try').onclick = () => tryNow();
  $('#fe-list').onclick = () => openLibrary((say) => { $('#fe-desc').value = say; $('#fe-desc').dispatchEvent(new Event('input', { bubbles: true })); $('#fe-report').innerHTML = '<span class="good">Written in the description.</span> Press BUILD IT, or change the words first.'; });
  $('#fe-test').onclick = () => runTest();
  $('#fe-save').onclick = () => saveFighter();
  $('#fe-cancel').onclick = () => { stopPreview(); openFighters(); };
}
function readSpecial() {
  const s = FE.special;
  s.name = $('#fe-sname').value;
  s.color = $('#fe-scolor').value; s.sound = $('#fe-sound').value;
}
function showSpecial() {
  const s = FE.special, creative = s.mode === 'creative';
  for (const b of $('#fe-modes').children) b.classList.toggle('on', b.dataset.m === (creative ? 'creative' : 'basic'));
  $('#fe-basic').hidden = true; $('#fe-creative').hidden = false; $('#fe-tweakbox').hidden = false;
  for (const el of document.querySelectorAll('#fe-creative [data-only], #fe-tweakbox [data-only]')) { el.hidden = el.dataset.only === (creative ? 'free' : 'paid'); el.style.display = el.hidden ? 'none' : ''; }
  $('#fe-modenote').textContent = creative ? 'Paid: the AI builds it from your description alone, in any language. No parts to set.' : 'Free: describe it and the game builds it from its own shapes. Then say what to change.';
  { const ms = s.steps.find((x) => x.model && FE.props[x.model]); $('#fe-cmodelinfo').textContent = ms ? `Using: ${FE.props[ms.model].name}` : ''; }
  $('#fe-csum').innerHTML = (creative || s.desc) ? (s.desc ? `<b>${esc(s.name)}</b>: ${s.steps.map((x) => esc(STEPS[x.kind].label)).join(' → ')} · ${s.onHit.map((k) => esc(ON_HIT[k])).join(', ')} · damage ${s.damage}` : 'Not designed yet: describe it above and press ✨ LET THE AI BUILD IT.') : '';
  $('#fe-sname').value = s.name;
  s.damage = autoDamage(s.onHit); $('#fe-dmgv').textContent = s.damage;
  $('#fe-scolor').value = s.color; $('#fe-sound').value = s.sound;
  showSteps();
  for (const b of $('#fe-onhit').children) b.classList.toggle('on', s.onHit.includes(b.dataset.k));
  $('#fe-flash').classList.toggle('on', s.flash); $('#fe-shake').classList.toggle('on', s.shake);
}
const opts = (obj, v) => Object.entries(obj).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(x.label || x)}</option>`).join('');
function showSteps() {
  const steps = FE.special.steps, box = $('#fe-steps');
  if (box.contains(document.activeElement) && document.activeElement.type === 'range') { // (don't rebuild under a finger mid-drag)
    for (const card of box.children) { const st = steps[+card.dataset.i]; if (!st) continue; for (const k of ['hits', 'size', 'speed']) card.querySelector(`[data-v=${k}]`).textContent = k === 'hits' ? st.hits : `×${st[k]}`; }
    return;
  }
  box.innerHTML = steps.map((st, i) => {
    const P = STEPS[st.kind], own = st.model && FE.props[st.model];
    return `<div class="box sp-step" data-i="${i}">
      <div class="row"><b class="note">${i + 1}.</b><select data-f="kind" style="flex:1">${opts(st.kind === 'free' ? STEPS : Object.fromEntries(Object.entries(STEPS).filter(([k]) => k !== 'free')), st.kind)}</select>
        ${i ? '<button class="mini" data-a="up">▲</button>' : ''}${steps.length > 1 ? '<button class="mini ghost" data-a="del">✕</button>' : ''}</div>
      <p class="note">${esc(P.help)}</p>
      <div class="row"><label class="f">Hits: <span data-v="hits">${st.hits}</span><input type="range" data-f="hits" min="1" max="6" value="${st.hits}"></label>
        <label class="f">Size: <span data-v="size">×${st.size}</span><input type="range" data-f="size" min="0.5" max="2.5" step="0.1" value="${st.size}"></label>
        <label class="f">Speed: <span data-v="speed">×${st.speed}</span><input type="range" data-f="speed" min="0.5" max="2" step="0.1" value="${st.speed}"></label></div>
      ${st.kind === 'shot' || st.kind === 'sky' ? `<div class="row"><label class="f">Shape<select data-f="shape">${opts(SHAPES, st.shape)}</select></label></div>` : ''}
      ${P.model ? `<div class="row"><span class="note">${own ? `Your model: <b>${esc(own.name)}</b> (${mb(own.data.byteLength)} MB)` : `Built-in look${st.kind === 'summon' ? ' (a tiger)' : st.kind === 'stomp' ? ' (a giant boot)' : ''}. Or your own 3D model (up to ${PROP_LIMIT_MB} MB):`}</span>
        <button class="mini" data-a="model">${own ? 'CHANGE' : 'UPLOAD MODEL'}</button>${own ? '<button class="mini ghost" data-a="nomodel">BUILT-IN</button>' : ''}</div>` : ''}
    </div>`;
  }).join('');
  $('#fe-addstep').disabled = steps.length >= MAX_STEPS;
}
async function takeStepModel(file, i) {
  const st = FE.special.steps[i]; if (!st) return;
  const ext = (file.name.match(/\.(glb|gltf|fbx)$/i)?.[1] || '').toLowerCase(), size = file.size / 1048576;
  const say = (h) => { $('#fe-report').innerHTML = h; };
  if (!ext) return say('<span class="bad">That isn\'t a 3D model file. Use a .glb (best), .gltf or .fbx.</span>');
  if (size > PROP_LIMIT_MB) return say(`<span class="bad">That model is <b>${size.toFixed(1)} MB</b>: for a special the most is <b>${PROP_LIMIT_MB} MB</b>.</span> ${shrinkTips()}`);
  const id = st.model && FE.props[st.model] && !FE.special.steps.some((x, j) => j !== i && x.model === st.model) ? st.model : `p${Date.now().toString(36)}`;
  FE.props[id] = { data: await file.arrayBuffer(), type: ext === 'fbx' ? 'fbx' : 'glb', name: file.name.slice(0, 40) };
  st.model = id;
  showSpecial(); FE.tested = null;
  say(`<span class="good">Model added to step ${i + 1}.</span> <span class="warn">Test it again before saving.</span>`);
}
function pushUndo() { FE.undo.push(JSON.parse(JSON.stringify(FE.special))); if (FE.undo.length > 30) FE.undo.shift(); $('#fe-undo').disabled = false; }
// ▶ TRY IT NOW: straight into practice with it as it is now (saved or not), and back here after
function tryNow() {
  readSpecial();
  const r = testSpecial(FE.special);
  if (!r.ok) { runTest(); return; }
  FE.special = r.special; FE.tested = JSON.stringify(r.special); showSpecial();
  const def = { ...currentDef(), id: `try-${FE.rec?.id || 'new'}`, custom: true, props: {} };
  const blob = (key, buf) => { FE.urls ||= {}; if (FE.urls[key]?.buf !== buf) { if (FE.urls[key]) URL.revokeObjectURL(FE.urls[key].url); FE.urls[key] = { buf, url: URL.createObjectURL(new Blob([buf])) }; } return FE.urls[key].url; };
  if (FE.model) Object.assign(def, { model: blob('model', FE.model), modelType: FE.modelType, autoRig: 'force' });
  for (const st of FE.special.steps) if (st.model && FE.props[st.model]) def.props[st.model] = { url: blob(st.model, FE.props[st.model].data), type: FE.props[st.model].type };
  stopPreview();
  api.practice(def, () => { api.show('screen-fighter-edit'); refreshPreview(); $('#fe-report').innerHTML = '<span class="good">Back from trying it.</span> Not right yet? Say what to change below, or change the parts, then ▶ TRY IT NOW again.'; });
}
function runTest() {
  readSpecial();
  const r = testSpecial(FE.special);
  FE.special = r.special; showSpecial();
  FE.tested = r.ok ? JSON.stringify(r.special) : null;
  $('#fe-report').innerHTML = (r.ok ? '<b class="good">✓ Ready to try!</b> Save it, then TRY it in practice.<br>' : '<b class="bad">✗ Not ready yet:</b><br>')
    + r.problems.map((p) => `<span class="${r.ok ? 'warn' : 'bad'}">• ${esc(p)}</span>`).join('<br>') + (r.problems.length ? '<br>' : '')
    + r.lines.map((l) => `• ${esc(l)}`).join('<br>');
}

async function editFighter(rec) {
  if (rec?.cloud?.pendingBytes) { // its model files are still on the account: get them before editing (saving without them would drop them)
    const ul = $('#cr-flist');
    try { rec = await cloud.ensureFiles(rec); } catch (e) { if (ul) ul.insertAdjacentHTML('afterbegin', `<li class="note bad">Couldn't fetch ${esc(rec.def.name)}'s model files (${esc(e.message)}). Check your connection and try again.</li>`); return; }
  }
  FE.rec = rec; FE.model = rec?.model || null; FE.modelType = rec?.modelType || null; FE.rot = rec?.def.modelRotationY || 0;
  FE.special = normalizeSpecial(rec?.def.special || blankSpecial()).special;
  $('#fe-desc').value = FE.special.desc || '';
  FE.props = { ...(rec?.props || {}) };
  FE.undo = []; $('#fe-undo').disabled = true; $('#fe-tweak').value = '';
  FE.tested = rec ? JSON.stringify(FE.special) : null;
  $('#fe-title').textContent = rec ? `EDIT ${rec.def.name}` : 'NEW FIGHTER';
  $('#fe-name').value = rec?.def.name || ''; $('#fe-tag').value = rec?.def.tagline || '';
  $('#fe-height').value = rec?.def.heightCm || 175; $('#fe-hv').textContent = `${$('#fe-height').value} cm`;
  const c = rec?.def.colors || {};
  $('#fe-c-skin').value = c.skin || '#f4f4f4'; $('#fe-c-shirt').value = c.shirt || '#1b1b1f'; $('#fe-c-pants').value = c.pants || '#1b1b1f';
  $('#fe-err').textContent = '';
  $('#fe-modelinfo').innerHTML = FE.model ? `Your model: ${mb(FE.model.byteLength)} MB` : 'No model yet: upload one, or use a stick figure in your colours.';
  $('#fe-report').innerHTML = rec ? '<span class="good">✓ Tested</span>' : 'Build the special, then test it.';
  showSpecial();
  api.show('screen-fighter-edit');
  if (session()?.token && !api.offline?.()) aiCall('credits');
  refreshPreview();
}

// a model file: is it a size we can take? then into the preview
async function takeModel(file) {
  const ext = (file.name.match(/\.(glb|gltf|fbx)$/i)?.[1] || '').toLowerCase();
  const info = $('#fe-modelinfo');
  if (!ext) { info.innerHTML = '<span class="bad">That isn\'t a 3D model file. Use a .glb (best), .gltf or .fbx.</span>'; return; }
  const size = file.size / 1048576;
  if (size > MODEL_LIMIT_MB) {
    info.innerHTML = `<span class="bad">This model is <b>${size.toFixed(1)} MB</b>: the most is <b>${MODEL_LIMIT_MB} MB</b> (best under ${MODEL_GOOD_MB} MB).</span> ${shrinkTips()}`;
    return;
  }
  FE.model = await file.arrayBuffer(); FE.modelType = ext === 'fbx' ? 'fbx' : 'glb'; FE.rot = 0;
  info.innerHTML = `${esc(file.name)}: <b>${size.toFixed(1)} MB</b> ` + (size > MODEL_GOOD_MB
    ? `<span class="warn">(it'll work, but it may load slowly and lag on phones. Under ${MODEL_GOOD_MB} MB is best.)</span> ${shrinkTips()}`
    : '<span class="good">✓ a good size</span>') + '<br><span id="fe-tris">Loading it…</span>';
  refreshPreview();
}
function shrinkTips() {
  return `<br><b>To make it smaller:</b> open <b>gltf.report</b> in your browser, drop the file in, run a compression script (resize textures to 1024 px, compress the mesh) and export, or see <a href="#" onclick="document.dispatchEvent(new CustomEvent('ck-tut',{detail:'size'}));return false">the full guide</a>.`;
}

// the preview: the fighter, slowly turning
function stopPreview() { if (FE.preview) { cancelAnimationFrame(FE.preview.raf); FE.preview.rig?.dispose?.(); FE.preview.renderer.dispose(); FE.preview = null; } }
function currentDef() {
  const def = {
    id: FE.rec?.id || 'preview', name: ($('#fe-name').value || 'NEW FIGHTER').toUpperCase(), tagline: $('#fe-tag').value,
    heightCm: +$('#fe-height').value, build: { height: 1, width: FE.model ? 1 : 0.55, head: 1 },
    colors: { skin: $('#fe-c-skin').value, hair: $('#fe-c-skin').value, shirt: $('#fe-c-shirt').value, pants: $('#fe-c-pants').value, shoes: $('#fe-c-pants').value },
    stats: { speed: 1, power: 1, health: 100 }, special: FE.special, winQuote: 'Made it myself.',
  };
  if (FE.rot) def.modelRotationY = FE.rot;
  return def;
}
function refreshPreview() {
  stopPreview();
  const canvas = $('#fe-preview');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#554433', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 5); scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const def = currentDef();
  let url = null;
  if (FE.model) { url = URL.createObjectURL(new Blob([FE.model])); def.model = url; def.modelType = FE.modelType; def.autoRig = 'force'; }
  const rig = createRig(def);
  scene.add(rig.object);
  rig.setFacing?.(1);
  const p = FE.preview = { renderer, rig, raf: 0 };
  $('#fe-turnrow').hidden = !FE.model; $('#fe-colors').hidden = !!FE.model;
  rig.ready?.then(() => {
    if (FE.preview !== p) return;
    if (url) URL.revokeObjectURL(url);
    const tris = countTris(rig.object), el = $('#fe-tris');
    if (rig.fallback) { $('#fe-modelinfo').innerHTML += '<br><span class="bad">This file couldn\'t be read as a 3D model. Try exporting it again as .glb.</span>'; FE.model = null; return; }
    if (el) el.innerHTML = tris > TRI_GOOD ? `<span class="warn">${(tris / 1000).toFixed(0)}k triangles: a lot (over ${TRI_GOOD / 1000}k can lag on phones). See how to make it smaller.</span>` : `<span class="good">✓ ${(tris / 1000).toFixed(0)}k triangles</span>. Check it stands up straight and faces you; if not, press TURN.`;
  });
  let t = 0, last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt * 60;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    rig.update?.(dt, 'idle', { t });
    rig.object.rotation.y = Math.sin(now / 1500) * 0.5;
    const H = 2.25 * def.heightCm / 175;
    cam.position.set(0, H * 0.55, H * 2.4); cam.lookAt(0, H * 0.5, 0);
    renderer.render(scene, cam);
    p.raf = requestAnimationFrame(loop);
  };
  p.raf = requestAnimationFrame(loop);
}
function countTris(obj) { let n = 0; obj.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; }

async function saveFighter() {
  const err = $('#fe-err');
  readSpecial();
  const name = $('#fe-name').value.trim();
  if (!name) { err.textContent = 'Give your fighter a name.'; return; }
  if (FE.tested !== JSON.stringify(normalizeSpecial(FE.special).special)) { err.textContent = 'Test the special first (TEST THE SPECIAL): it has to be ready before saving.'; return; }
  const def = currentDef();
  // keep only the special's models it still uses
  const used = new Set(FE.special.steps.map((st) => st.model).filter(Boolean)), props = {};
  for (const id of used) if (FE.props[id]) props[id] = FE.props[id];
  const rec = { id: FE.rec?.id || newId('fighter'), created: FE.rec?.created || Date.now(), updated: Date.now(), def, model: FE.model, modelType: FE.modelType, props, ...(FE.rec?.cloud ? { cloud: FE.rec.cloud } : {}) };
  try { await saveItem('fighters', rec); } catch (e) { err.textContent = `Couldn't save: ${e.message}`; return; }
  cloud.push('fighters', rec); // (to the account, if there is one)
  for (const [k, u] of [...blobUrls]) if (k === rec.id || k.startsWith(`${rec.id}/`)) { URL.revokeObjectURL(u); blobUrls.delete(k); }
  stopPreview();
  await api.fightersChanged();
  openFighters();
}

// ── arenas ───────────────────────────────────────────────────────────────────────
function buildArenaList() {
  screen('screen-arenas', `
    <h2>MY ARENAS</h2>
    <p class="note cloud" role="status"></p>
    <ul class="list" id="cr-alist"></ul>
    <div class="foot"><button class="btn" id="cr-anew">+ NEW ARENA</button><button class="btn" id="cr-aback">BACK</button></div>`);
  $('#cr-anew').onclick = () => editArena(null);
  $('#cr-aback').onclick = () => { api.previewArena(null); openCreate(); };
}
async function openArenas() {
  const ul = $('#cr-alist'), mine = await loadCustomArenas();
  ul.innerHTML = '';
  for (const a of [...PRESET_ARENAS, ...mine]) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="nm"><b>${esc(a.name)}</b>${a.builtIn ? ' <span class="note">(ready-made)</span>' : ''}<br><span class="note">${esc(GROUNDS[a.ground]?.label)} · ${esc(SKIES[a.sky]?.label)} · ${esc(WEATHER[a.weather])}</span></span>
      <button class="mini" data-a="see">SEE</button>${a.builtIn ? '' : '<button class="mini" data-a="edit">EDIT</button><button class="mini ghost" data-a="del">DELETE</button>'}`;
    li.onclick = async (e) => {
      const act = e.target.dataset.a;
      if (act === 'see') api.previewArena(a);
      if (act === 'edit') editArena(a);
      if (act === 'del' && confirm(`Delete ${a.name}?`)) { await deleteItem('arenas', a.id); cloud.remove('arenas', a.id); await api.arenasChanged(); openArenas(); }
    };
    ul.appendChild(li);
  }
  api.show('screen-arenas');
}
const AE = { rec: null, cfg: null, mode: 'free', undo: [] };
function buildArenaEdit() {
  screen('screen-arena-edit', `
    <h2 id="ae-title">NEW ARENA</h2>
    <div class="chips" id="ae-modes"><button class="chip" data-m="free">1. FREE: BUILD IT FROM MY DESCRIPTION <span class="note">(the game builds it from its own parts)</span></button><button class="chip" data-m="paid">2. PAID: REALISTIC ARENA <span class="note">(painted by Gemini, like a photo)</span></button></div>
    <label class="f">Describe the place<textarea id="ae-desc" placeholder="e.g. a snowy mountain dojo at night with lanterns"></textarea></label>
    <div class="row"><button class="mini" id="ae-fill" data-only="free">BUILD IT FROM MY DESCRIPTION (FREE)</button><button class="mini ai" id="ae-ai" hidden>AI PARTS</button><button class="mini ai" id="ae-aipic" data-only="paid">🖼 PAINT IT REALISTIC (3 designs)</button><span class="note ai-cr" data-only="paid"></span><a href="#" class="note" id="ae-aibuy" data-only="paid">get more</a></div>
    <p class="note" id="ae-aimsg" data-only="free">FREE: describe the place and the AI builds a detailed arena for you from the game's own shapes (floor markings, flags, trees, buildings, chairs, fences...), up to 20 a day. Any language. Press LOOK to see it, then SAVE.</p>
    <p class="note" data-only="paid">Two ways to get your place: 1. GAME ARENA: the game builds it from its own parts (ground, sky, weather, things around), for any place in any language. 2. REALISTIC ARENA: Gemini paints a realistic picture of it like a photo ("Hogwarts at night", "Tatooine"). BUILD IT FROM MY WORDS is the free basic version of 1 (English keywords).</p>
    <div class="row"><label class="f">Name<input type="text" id="ae-name" maxlength="28"></label></div>
    <div class="row" hidden><label class="f">Ground<select id="ae-ground"></select></label></div>
    <div class="row" hidden><label class="f">Sky<select id="ae-sky"></select></label><label class="f">Weather<select id="ae-weather"></select></label><label class="note">Colour <input type="color" id="ae-accent"></label></div>
    <div hidden><div class="note">Around the arena (up to 5):</div><div class="chips" id="ae-props"></div></div>
    <div class="row" id="ae-picrow" hidden><span class="note">This arena has an AI-painted picture behind it.</span><button class="mini ghost" id="ae-nopic">REMOVE PICTURE</button></div>
    <p class="note">The arena shows behind this menu as you change it. Hide the menu to look: <button class="mini" id="ae-peek">LOOK (3 s)</button></p>
    <div class="box" data-only="free"><label class="f">Not quite right? Say what to change<textarea id="ae-tweak" placeholder="e.g. the castle is too small, add more trees, make the floor darker, move the stage closer"></textarea></label><div class="row"><button class="mini" id="ae-tw">CHANGE IT</button><button class="mini ghost" id="ae-undo" disabled>↶ UNDO</button></div></div>
    <p class="note bad" id="ae-err"></p>
    <div class="foot"><button class="btn" id="ae-save">SAVE</button><button class="btn" id="ae-cancel">CANCEL</button></div>`);
  const sel = (id, obj) => { $(id).innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${esc(v.label || v)}</option>`).join(''); };
  sel('#ae-ground', GROUNDS); sel('#ae-sky', SKIES); sel('#ae-weather', WEATHER);
  $('#ae-props').innerHTML = Object.entries(PROPS).map(([k, v]) => `<button class="chip" data-k="${k}">${esc(v)}</button>`).join('');
  const upd = () => { readArena(); api.previewArena(AE.cfg); };
  for (const id of ['#ae-name', '#ae-ground', '#ae-sky', '#ae-weather', '#ae-accent']) $(id).addEventListener('change', upd);
  $('#ae-props').onclick = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const p = AE.cfg.props, i = p.indexOf(k);
    if (i >= 0) p.splice(i, 1); else if (p.length < 5) p.push(k);
    showArena(); api.previewArena(AE.cfg);
  };
  $('#ae-modes').onclick = (e) => { const m = e.target.closest('[data-m]')?.dataset.m; if (!m || m === AE.mode) return; AE.mode = m; showArena(); };
  // free: the AI writes a detailed recipe (floor markings, flags, trees, buildings...); if it can't, the basic keyword builder does what it can
  $('#ae-fill').onclick = async () => {
    const t = $('#ae-desc').value; if (!t.trim()) return;
    readArena();
    $('#ae-err').innerHTML = 'Building your arena… this can take up to a minute.';
    const a = await aiDesign('scene', t, $('#ae-fill'), (h) => { $('#ae-err').innerHTML = h; });
    if (a) {
      AE.cfg = { ...AE.cfg, name: String(a.name || AE.cfg.name).slice(0, 24), ground: a.ground in GROUNDS ? a.ground : AE.cfg.ground, sky: a.sky in SKIES ? a.sky : AE.cfg.sky, weather: a.weather in WEATHER ? a.weather : AE.cfg.weather,
        accent: /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : AE.cfg.accent, scene: { floorColor: a.floorColor, floor: a.floor, objects: a.objects } };
      delete AE.cfg.backdrop; delete AE.cfg.floor;
      
      $('#ae-err').innerHTML = '<span class="good">🗺 Built.</span> Press LOOK to see it, then SAVE.';
    } else if (AI.unavailable) {
      const nm = $('#ae-name').value.trim();
      AE.cfg = { ...AE.cfg, ...describeArena(t, nm && nm !== 'My Arena' ? nm : undefined) }; delete AE.cfg.scene;
      $('#ae-err').innerHTML += '<br>The basic keyword builder was used instead.';
    }
    showArena(); api.previewArena(AE.cfg);
  };
  $('#ae-nopic').onclick = () => { delete AE.cfg.backdrop; delete AE.cfg.floor; showArena(); api.previewArena(AE.cfg); };
  $('#ae-peek').onclick = () => { const s = $('#screen-arena-edit'); s.style.opacity = '0'; setTimeout(() => { s.style.opacity = ''; }, 3000); };
  $('#ae-save').onclick = async () => {
    readArena();
    if (!AE.cfg.name.trim()) { $('#ae-err').textContent = 'Give it a name.'; return; }
    AE.cfg.updated = Date.now();
    try { await saveItem('arenas', AE.cfg); } catch (e) { $('#ae-err').textContent = `Couldn't save: ${e.message}`; return; }
    cloud.push('arenas', AE.cfg);
    await api.arenasChanged(); openArenas();
  };
  $('#ae-cancel').onclick = () => { api.previewArena(null); openArenas(); };
  $('#ae-ai').onclick = async () => {
    const a = await aiDesign('arena', $('#ae-desc').value, $('#ae-ai'), (h) => { $('#ae-err').innerHTML = h; });
    if (!a) return;
    const pick = (v, list, def) => (list[v] ? v : def);
    AE.cfg = { ...AE.cfg, name: String(a.name || AE.cfg.name).slice(0, 24), ground: pick(a.ground, GROUNDS, AE.cfg.ground), sky: pick(a.sky, SKIES, AE.cfg.sky), weather: pick(a.weather, WEATHER, AE.cfg.weather),
      props: [...new Set((a.props || []).filter((k) => PROPS[k]))].slice(0, 5), accent: /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : AE.cfg.accent };
    $('#ae-err').innerHTML = '<span class="good">✨ Designed by the AI:</span> change anything, then SAVE.';
    showArena(); api.previewArena(AE.cfg);
  };
  // the realistic arena: the AI paints a picture of the place (the parts Claude picks stay as the fallback look)
  $('#ae-aipic').onclick = async () => {
    readArena();
    $('#ae-err').innerHTML = 'Painting your arena (a background and a floor)… this takes about a minute.';
    const a = await aiDesign('arena', $('#ae-desc').value, $('#ae-aipic'), (h) => { $('#ae-err').innerHTML = h; }, { realistic: true, arenaId: AE.cfg.id });
    if (!a) return;
    AE.cfg = { ...AE.cfg, name: String(a.name || AE.cfg.name).slice(0, 24), backdrop: a.backdrop?.url ? { url: a.backdrop.url } : AE.cfg.backdrop, floor: a.floor?.url ? { url: a.floor.url } : AE.cfg.floor,
      ground: a.ground in GROUNDS ? a.ground : AE.cfg.ground, sky: a.sky in SKIES ? a.sky : AE.cfg.sky, weather: a.weather in WEATHER ? a.weather : AE.cfg.weather, accent: /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : AE.cfg.accent };
    delete AE.cfg.scene;
    $('#ae-err').innerHTML = '<span class="good">🖼 Painted by the AI:</span> SAVE to keep it.';
    showArena(); api.previewArena(AE.cfg);
  };
  $('#ae-aibuy').onclick = (e) => { e.preventDefault(); openBuy(); };
  // change a little of the arena with words (the AI edits the recipe), instead of building it all again
  $('#ae-tw').onclick = async () => {
    const t = $('#ae-tweak').value; if (!t.trim()) return;
    if (!AE.cfg.scene) { $('#ae-err').innerHTML = '<span class="warn">Build the arena first, then say what to change.</span>'; return; }
    readArena();
    $('#ae-err').innerHTML = LOADING_HTML;
    const c = AE.cfg, sc = c.scene;
    const a = await aiDesign('scenetweak', t, $('#ae-tw'), (h) => { $('#ae-err').innerHTML = h; }, { scene: { name: c.name, ground: c.ground, sky: c.sky, weather: c.weather, accent: c.accent, floorColor: sc.floorColor || '', floor: sc.floor || [], objects: sc.objects || [] } });
    if (!a) return;
    AE.undo.push(JSON.parse(JSON.stringify(AE.cfg))); $('#ae-undo').disabled = false;
    AE.cfg = { ...AE.cfg, name: String(a.name || c.name).slice(0, 24), ground: a.ground in GROUNDS ? a.ground : c.ground, sky: a.sky in SKIES ? a.sky : c.sky, weather: a.weather in WEATHER ? a.weather : c.weather,
      accent: /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : c.accent, scene: { floorColor: a.floorColor, floor: a.floor, objects: a.objects } };
    
    $('#ae-err').innerHTML = '<span class="good">🗺 Changed.</span> Press LOOK to see it, then SAVE.';
    showArena(); api.previewArena(AE.cfg);
  };
  $('#ae-undo').onclick = () => { const prev = AE.undo.pop(); if (!prev) return; AE.cfg = prev; $('#ae-undo').disabled = !AE.undo.length; showArena(); api.previewArena(AE.cfg); };
}
function readArena() {
  Object.assign(AE.cfg, { name: $('#ae-name').value, ground: $('#ae-ground').value, sky: $('#ae-sky').value, weather: $('#ae-weather').value, accent: $('#ae-accent').value });
}
function showArena() {
  const c = AE.cfg;
  for (const b of $('#ae-modes').children) b.classList.toggle('on', b.dataset.m === AE.mode);
  for (const el of document.querySelectorAll('#screen-arena-edit [data-only]')) { el.hidden = el.dataset.only !== AE.mode; el.style.display = el.hidden ? 'none' : ''; }
  $('#ae-name').value = c.name; $('#ae-ground').value = c.ground; $('#ae-sky').value = c.sky; $('#ae-weather').value = c.weather; $('#ae-accent').value = c.accent || '#ffb347';
  for (const b of $('#ae-props').children) b.classList.toggle('on', c.props.includes(b.dataset.k));
  $('#ae-picrow').hidden = !c.backdrop?.url;
}
function editArena(rec) {
  AE.rec = rec;
  AE.cfg = rec ? { ...rec, props: [...rec.props] } : { id: newId('arena'), created: Date.now(), ...describeArena('', 'My Arena'), props: ['trees', 'rocks'] };
  AE.mode = rec?.backdrop?.url ? 'paid' : 'free'; AE.undo = [];
  $('#ae-title').textContent = rec ? `EDIT ${rec.name}` : 'NEW ARENA';
  $('#ae-desc').value = ''; $('#ae-err').textContent = '';
  showArena();
  api.show('screen-arena-edit');
  api.previewArena(AE.cfg);
  if (session()?.token && !api.offline?.()) aiCall('credits');
}

// ── tutorials ────────────────────────────────────────────────────────────────────
const TUTS = {
  models: ['MAKING A 3D MODEL', `
    <p>Your fighter can be anyone or anything with arms and legs: you, a friend, a cartoon character, a robot. You need a 3D model file, a <b>.glb</b>. The easiest way is a free AI 3D generator: you give it a picture (or words) and it makes the model.</p>
    <ol>
      <li>Open an image-to-3D site, for example <b>Tripo</b> (tripo3d.ai), <b>Meshy</b> (meshy.ai) or <b>Hunyuan3D</b>. Most have a free tier.</li>
      <li>Give it a <b>full-body</b> picture: the whole person from head to feet, <b>standing straight, facing the camera, arms a little away from the body</b> (like an A). Plain background, no one else in the picture.</li>
      <li>Or type it: <i>"full body cartoon ninja, standing, facing forward, arms slightly out, no base"</i>.</li>
      <li>Download it as <b>GLB</b>. Pick a lower polygon count and <b>1K (1024)</b> textures if it asks: smaller files, smoother on phones.</li>
      <li>In CREATE → MY FIGHTERS → NEW FIGHTER, press <b>UPLOAD A 3D MODEL</b>. The game gives it a skeleton by itself, so it can punch, kick and fall over.</li>
    </ol>
    <p><b>Tips:</b> the model should have no base or stand under the feet, and nothing big held in the hands. Big-head cartoon styles look great in this game. If it's lying down or facing sideways in the preview, press <b>TURN</b>.</p>`],
  size: ['MODEL SIZE: HOW BIG, AND MAKING IT SMALLER', `
    <p><b>The most a model can be is ${MODEL_LIMIT_MB} MB.</b> Under <b>${MODEL_GOOD_MB} MB</b> loads fast and runs smoothly on phones. Also aim for under <b>${TRI_GOOD / 1000}k triangles</b> (the game tells you after you upload).</p>
    <p>What makes a model big: huge textures (the pictures painted on it, often 4096 px) and too many triangles. To shrink it:</p>
    <h3>Easiest: gltf.report (in your browser, free)</h3>
    <ol>
      <li>Go to <b>gltf.report</b> and drop your .glb onto the page.</li>
      <li>Open the <b>Script</b> panel, choose one of the example scripts that compresses the model (texture resize / WebP, mesh compression), and run it.</li>
      <li>Press <b>Export</b> to download the smaller .glb. Textures at 1024 px usually take a 30 MB model under 5 MB.</li>
    </ol>
    <h3>When you make it (Tripo, Meshy...)</h3>
    <p>Choose a lower polygon count (e.g. 30–50k faces) and 1K textures when you download.</p>
    <h3>In Blender (free)</h3>
    <ol>
      <li>Import the model. Select it, add a <b>Decimate</b> modifier, set Ratio to about <b>0.3</b>, apply it.</li>
      <li>In the Image editor, <b>Image → Resize</b> each texture to 1024 × 1024.</li>
      <li><b>File → Export → glTF 2.0</b>, format <b>glTF Binary (.glb)</b>, tick <b>Compression</b>.</li>
    </ol>
    <h3>On a computer, in one line</h3>
    <p><code>npx @gltf-transform/cli optimize model.glb small.glb --texture-compress webp --texture-size 1024</code></p>`],
  specials: ['BUILDING A SPECIAL', `
    <p>Every fighter has one special a round. Nothing to code. Pick one of two ways at the top of THE SPECIAL: <b>1. Default special design</b> (you build it from the basic parts) or <b>2. Creative special design</b> (you only describe it, and the AI builds exactly that).</p>
    <ol>
      <li><b>Default design:</b> build it from steps. For example <i>"summon a giant tiger that pounces on them, then a huge foot stomps them, then explode"</i> or <i>"three fast red fireballs that burn them"</i>. Add steps (up to ${MAX_STEPS}), played one after another.</li>
      <li>Each step is one of: <b>a shot</b>, <b>a beam</b>, <b>dash through</b>, <b>teleport behind</b>, <b>from the sky</b>, <b>a blast around you</b>, <b>summon a beast</b>, <b>a giant stomp</b>, <b>a cage</b>, <b>shadow clones</b> or <b>an earthquake</b>, each with its own hits, size and speed. Then <b>what the last hit does</b> (up to 3: knock down, launch, push, pull, daze, freeze, slow, poison, blind), the <b>damage in all</b> (up to ${MAX_DAMAGE}, the same as the strongest built-in specials, so it stays fair), the colour and sound.</li>
      <li><b>Your own models in a special:</b> a shot, a beast or a giant stomp can be your own 3D model (UPLOAD MODEL on that step, up to ${PROP_LIMIT_MB} MB): your dragon, your shoe, your rubber duck. Free models: Sketchfab (filter "Downloadable"), Poly Pizza, or make one in Blender.</li>
      <li><b>Creative design</b> (✨ AI DESIGN, uses a credit): write what you want, in any language and however you say it (<i>"the player rides a wave towards the opponent, washing everything in its way"</i>, <i>"like Naruto's rasengan"</i>, <i>"כדור אש ענק"</i>). Nothing is pre-selected: the special follows only your words. New accounts get 3 free to try, then credits come in packs (GET MORE). Not right yet? Say what to change.</li>
      <li>Press <b>TEST THE SPECIAL</b>. The game plays it out by itself, close up, mid range and across the arena, and checks it doesn't break, ends, deals the right damage and plays the same every time (so it works online). When it says <b class="good">✓ Ready to try</b>, save, then press <b>TRY</b> to use it in practice.</li>
    </ol>
    <p><b>Making it perfect:</b> press <b>▶ TRY IT NOW</b> to use it on the training dummy straight away (pause → BACK TO THE EDITOR brings you back with everything as you left it). Not right? Write what's wrong in <b>Not quite right?</b>, like <i>"the tiger is too slow, bigger, 3 bites, freeze instead of knock down, add a cage at the end"</i>, and press <b>CHANGE IT</b> (free) or <b>✨ AI CHANGE</b> (understands anything). <b>UNDO</b> takes back a change. Try, change, try again, as many times as you like.</p>
    <p><b>Tips:</b> a <b>blast</b> is strong but short range; a <b>shot</b> or <b>sky strike</b> reaches far but can be walked away from (sky) or arrives slowly (shots). More hits means less damage each. Freeze and daze are strong: they set up your next combo.</p>`],
  arenas: ['MAKING AN ARENA', `
    <ol>
      <li>CREATE → MY ARENAS → NEW ARENA.</li>
      <li><b>Describe the place</b>, for example <i>"a snowy mountain dojo at night with lanterns"</i> or <i>"neon city rooftop in the rain"</i>, and press <b>BUILD IT</b>. It's built behind the menu as you go.</li>
      <li>Change the parts: the <b>ground</b>, the <b>sky</b> (day, sunset, night, space...), the <b>weather</b> (rain, snow, embers...), what's <b>around</b> it (trees, buildings, neon, a temple gate... up to 5) and a <b>colour</b>.</li>
      <li>Press <b>LOOK</b> to hide the menu for a moment, then <b>SAVE</b>. Pick it before a fight on the fighter select screen (the ARENA button).</li>
    </ol>`],
  playing: ['PLAYING', `
    <p>Pick 1 PLAYER (against the computer), 2 PLAYERS (on one screen or with controllers), PRACTICE (a training dummy) or a TOURNAMENT. HOW TO PLAY on the title screen has all the buttons and combos.</p>
    <p>Finish someone with a special and you get a <b>FATALITY</b>.</p>`],
};
function buildTutorials() {
  screen('screen-tutorials', `
    <h2>TUTORIALS</h2>
    <div class="chips" id="tu-tabs">${Object.entries(TUTS).map(([k, [t]]) => `<button class="chip" data-k="${k}">${esc(t.split(':')[0])}</button>`).join('')}</div>
    <div class="tut" id="tu-body"></div>
    <div class="foot"><button class="btn" id="tu-back">BACK</button></div>`);
  $('#tu-tabs').onclick = (e) => { const k = e.target.dataset.k; if (k) showTut(k); };
  $('#tu-back').onclick = () => { if (TU.from === 'screen-fighter-edit') api.show('screen-fighter-edit'); else openCreate(); };
  document.addEventListener('ck-tut', (e) => openTutorials(e.detail, 'screen-fighter-edit'));
}
const TU = { from: null };
function showTut(k) {
  const [title, body] = TUTS[k];
  $('#tu-body').innerHTML = `<h3>${esc(title)}</h3>${body}`;
  for (const b of $('#tu-tabs').children) b.classList.toggle('on', b.dataset.k === k);
}
export function openTutorials(k = 'models', from = null) { TU.from = from; showTut(k); api.show('screen-tutorials'); }
