// The helper: a little chat bubble that answers questions about the game. It is free for players, so it runs on the
// free Gemini plan through api/ai.js (action 'help'), never on Claude or credits, and it is limited per day.
// It only shows on the menu and creator screens (never in a fight).
const SHOW_ON = ['title', 'create', 'fighters', 'fighter-edit', 'arenas', 'arena-edit', 'ai-buy', 'tutorials'];
const $el = (tag, props = {}, css = '') => Object.assign(document.createElement(tag), props, css ? { style: css } : {});

export function initHelper({ screen }) {
  const btn = $el('button', { type: 'button', textContent: '?', title: 'Ask the helper (free)', ariaLabel: 'Ask the helper' },
    'position:fixed;right:14px;bottom:14px;z-index:60;width:46px;height:46px;border-radius:50%;border:2px solid #ffb347;background:#2a1c14;color:#ffd27a;font-weight:800;font-size:22px;font-family:inherit;cursor:pointer;box-shadow:0 2px 10px #0008;display:none');
  const box = $el('div', {}, 'position:fixed;right:14px;bottom:70px;z-index:61;width:min(340px,calc(100vw - 28px));max-height:min(70vh,520px);display:none;flex-direction:column;background:#1c130f;border:2px solid #ffb347;border-radius:12px;box-shadow:0 4px 18px #000a;color:#f3e9dc;font-size:14px');
  const head = $el('div', {}, 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #ffb34755');
  head.append($el('b', { textContent: 'ASK THE HELPER' }, 'flex:1;letter-spacing:.06em;color:#ffd27a'), $el('button', { type: 'button', textContent: '✕', ariaLabel: 'Close' }, 'background:none;border:0;color:#f3e9dc;font-size:16px;cursor:pointer'));
  const log = $el('div', {}, 'flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px;min-height:120px');
  const note = $el('div', { textContent: 'Free. Ask how anything in the game works.' }, 'padding:0 10px 6px;font-size:11px;opacity:.7');
  const row = $el('form', {}, 'display:flex;gap:6px;padding:8px 10px;border-top:1px solid #ffb34755');
  const input = $el('input', { type: 'text', maxLength: 500, placeholder: 'e.g. how do I turn my model?' }, 'flex:1;min-width:0;padding:8px;border-radius:8px;border:1px solid #ffb34788;background:#0e0806;color:#f3e9dc;font-family:inherit;font-size:14px');
  const send = $el('button', { type: 'submit', textContent: 'SEND' }, 'padding:8px 12px;border-radius:8px;border:0;background:#ffb347;color:#2a1c14;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer');
  row.append(input, send);
  box.append(head, log, note, row);
  document.body.append(btn, box);

  btn.id = 'helper-btn'; box.id = 'helper-box'; log.id = 'helper-log'; input.id = 'helper-input';
  const history = [];
  const say = (who, text, bad = false) => {
    const m = $el('div', { textContent: text }, `align-self:${who === 'me' ? 'flex-end' : 'flex-start'};max-width:88%;padding:7px 10px;border-radius:10px;white-space:pre-wrap;background:${who === 'me' ? '#ffb347' : '#33241b'};color:${who === 'me' ? '#2a1c14' : bad ? '#ff9a8a' : '#f3e9dc'}`);
    log.append(m); log.scrollTop = log.scrollHeight; return m;
  };
  say('bot', 'Hi! Ask me anything about making fighters, specials and arenas.');
  const open = (on) => { box.style.display = on ? 'flex' : 'none'; if (on) input.focus(); };
  btn.onclick = () => open(box.style.display === 'none');
  head.lastChild.onclick = () => open(false);
  const token = () => { try { return JSON.parse(localStorage.getItem('fk-session'))?.token || null; } catch { return null; } };
  row.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (text.length < 2 || send.disabled) return;
    input.value = ''; say('me', text);
    if (!token()) { say('bot', 'Log in to an online account first (ACCOUNT on the title screen), then ask me.', true); return; }
    send.disabled = true;
    const wait = say('bot', '…');
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'help', token: token(), text, history: history.slice(-6) }) });
      const j = await r.json();
      if (j.ok) {
        wait.textContent = j.answer; history.push({ role: 'user', text }, { role: 'model', text: j.answer });
        if (typeof j.left === 'number' && j.left < 999) note.textContent = `Free. ${j.left} question${j.left === 1 ? '' : 's'} left today.`;
      } else { wait.textContent = j.error || 'The helper could not answer.'; wait.style.color = '#ff9a8a'; }
    } catch { wait.textContent = 'Could not reach the helper. Check your connection and try again.'; wait.style.color = '#ff9a8a'; }
    send.disabled = false; log.scrollTop = log.scrollHeight;
  };
  const refresh = () => { const on = SHOW_ON.includes(screen()); btn.style.display = on ? 'block' : 'none'; if (!on) open(false); };
  window.__helperScreen = refresh;
  refresh();
}
