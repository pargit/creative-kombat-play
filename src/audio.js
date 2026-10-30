// All sound is synthesised — no audio files to ship.
// Sound is switched off for now (effects, music and the announcer voice); set to true to bring it back.
export const SOUND_ENABLED = false;
// Let the game's sounds mix with music playing on the phone (Spotify etc.) instead of stopping
// it: an "ambient" audio session (Safari on iPhone; other browsers ignore it). On iPhones, sound
// that mixes with music also follows the silent switch.
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* not supported */ }
let ctx, master, noiseBuf;
let muted = false, volume = 1;
try { muted = localStorage.getItem('fk-muted') === '1'; volume = Math.max(0, Math.min(1, +(localStorage.getItem('fk-volume') ?? 1))); } catch { /* storage blocked */ }
export function getVolume() { return volume; }
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
  if (master) master.gain.value = muted ? 0 : 0.6 * volume;
  if (ngain) ngain.gain.value = volume;
  try { localStorage.setItem('fk-volume', String(volume)); } catch { /* ignore */ }
}

export function unlockAudio() {
  if (!SOUND_ENABLED) return; // no audio context = every sound below is silent
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6 * volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6 * volume;
  try { localStorage.setItem('fk-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (m) stopNarration();
}

function noise(dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur);
  return f;
}

function tone(f0, f1, dur, { type = 'sine', gain = 0.5 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  whoosh() {
    const f = noise(0.16, { freq: 600, q: 0.8, gain: 0.25, attack: 0.03 });
    f?.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.14);
  },
  hit(heavy = false) {
    tone(heavy ? 150 : 210, 45, heavy ? 0.28 : 0.18, { gain: heavy ? 0.9 : 0.7 });
    noise(heavy ? 0.2 : 0.12, { freq: heavy ? 900 : 1500, q: 0.7, gain: heavy ? 0.8 : 0.6 });
  },
  block() {
    tone(900, 700, 0.09, { type: 'square', gain: 0.12 });
    noise(0.08, { freq: 3500, q: 3, gain: 0.35 });
  },
  jump() { tone(220, 420, 0.12, { type: 'triangle', gain: 0.15 }); },
  land() { noise(0.1, { freq: 300, type: 'lowpass', gain: 0.35 }); },
  thud() { tone(90, 30, 0.45, { gain: 0.9 }); noise(0.3, { freq: 250, type: 'lowpass', gain: 0.6 }); },
  special() { tone(300, 1200, 0.25, { type: 'sawtooth', gain: 0.12 }); noise(0.25, { freq: 2000, q: 2, gain: 0.25 }); },
  joy() {
    // bright rising arpeggio
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, f * 1.01, 0.22, { type: 'triangle', gain: 0.16 }), i * 55));
  },
  zap() {
    for (let i = 0; i < 3; i++) {
      const f = noise(0.09 + Math.random() * 0.08, { freq: 2500 + Math.random() * 4000, q: 6, gain: 0.35 });
      f?.frequency.setValueAtTime(800 + Math.random() * 6000, ctx.currentTime + 0.03 * i);
    }
    tone(70 + Math.random() * 40, 60, 0.18, { type: 'sawtooth', gain: 0.18 });
  },
  whip() {
    const f = noise(0.22, { freq: 900, q: 1.2, gain: 0.35, attack: 0.01 });
    f?.frequency.exponentialRampToValueAtTime(5000, ctx.currentTime + 0.2);
    tone(1800, 300, 0.2, { type: 'square', gain: 0.05 });
  },
  // Ofek's solo: a fast distorted minor-pentatonic run (i = note number)
  riff(i) {
    const scale = [329.6, 392, 440, 493.9, 587.3, 659.3, 784, 880];
    const pat = [0, 2, 3, 4, 3, 2, 4, 5, 6, 5, 4, 7, 6, 4, 5, 3];
    const f = scale[pat[i % pat.length]] * (i % 32 < 16 ? 1 : 1.5);
    tone(f, f * 1.01, 0.13, { type: 'sawtooth', gain: 0.07 });
    tone(f * 0.5, f * 0.5, 0.13, { type: 'square', gain: 0.04 });
  },
  glass() { // a mirror shattering: a hard crack, then shards tinkling down
    noise(0.08, { freq: 5000, q: 0.7, gain: 0.7 }); noise(0.35, { freq: 3200, q: 1.5, gain: 0.35 });
    [2637, 3520, 3136, 4186, 2794, 3951, 3322].forEach((f, k) => setTimeout(() => tone(f, f * 0.98, 0.09, { type: 'triangle', gain: 0.07 }), 60 + k * 55 + (k % 3) * 25));
  },
    gold() { [784, 988, 1175, 1568].forEach((f, k) => setTimeout(() => tone(f, f, 0.25, { type: 'triangle', gain: 0.14 }), k * 70)); },
  beep() { tone(1046, 1046, 0.1, { type: 'sine', gain: 0.16 }); }, // a heart monitor
  flatline() { tone(1046, 1046, 2.8, { type: 'sine', gain: 0.14 }); },
  cough() { noise(0.12, { freq: 900, q: 0.8, gain: 0.5 }); setTimeout(() => noise(0.16, { freq: 700, q: 0.8, gain: 0.45 }), 160); },
  teleport() { tone(1600, 200, 0.3, { type: 'sine', gain: 0.25 }); },
  select() { tone(660, 880, 0.06, { type: 'square', gain: 0.1 }); },
  move() { tone(440, 440, 0.04, { type: 'square', gain: 0.06 }); },
  confirm() { tone(523, 1046, 0.18, { type: 'square', gain: 0.14 }); },
  gong() {
    for (const [f, g] of [[110, 0.5], [220, 0.25], [331, 0.12], [587, 0.06]]) tone(f, f * 0.98, 2.2, { gain: g });
    noise(0.4, { freq: 800, q: 0.5, gain: 0.25 });
  },
};

// ── the intro narrator ──────────────────────────────────────────────────────
// Says the fighters' names over the opening close-ups ("OR HAIM … versus … KARINA") in a deep
// announcer voice. It stays on while the rest of the sound is off (the mute button silences it).
// Every fighter has a recorded clip (roster `nameVoice`, made from phonetic spellings so the
// Hebrew names come out right: audio/narrator/*.mp3); anyone without one gets the device's own
// voice (roster `sayName` fixes its pronunciation). Clips play through Web Audio, which iPhones
// allow once the first tap has unlocked it.
export const NARRATOR_ENABLED = true;
const CLIP_TAIL = 0.4; // seconds of echo at the end of each clip that the next line may overlap
let voicePrimed = false;
let nctx = null, ngain = null;
function narratorCtx() {
  if (!nctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    nctx = new AC();
    ngain = nctx.createGain();
    ngain.gain.value = volume;
    ngain.connect(nctx.destination);
  }
  return nctx;
}
// iPhones only allow sound that starts from a tap: unlock on the first one
export function unlockVoice() {
  if (!NARRATOR_ENABLED) return;
  if (nctx?.state === 'running' && voicePrimed) return;
  const c = narratorCtx();
  if (c && c.state !== 'running') {
    c.resume?.();
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch { /* ignore */ }
  }
  // (no silent "warm-up" word for the device voice: on iPhones speech pauses the music app;
  // every fighter has a recorded clip, so the device voice is only a fallback)
  voicePrimed = true;
}
const clips = new Map(); // url → Promise<AudioBuffer | null>
export function preloadClip(url) {
  if (!url || !NARRATOR_ENABLED) return null;
  if (!clips.has(url)) {
    const c = narratorCtx();
    clips.set(url, !c ? Promise.resolve(null) : fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => b && new Promise((res) => c.decodeAudioData(b, res, () => res(null))))
      .catch(() => null));
  }
  return clips.get(url);
}
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /^en/i.test(v.lang) && /daniel|fred|alex|george|david|male|aaron|arthur|guy|ryan/i.test(v.name))
    || voices.find((v) => /^en-(GB|US)/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
}
function speak(text, { rate = 0.8, pitch = 0.3, queue = false } = {}) {
  if (!text || !('speechSynthesis' in window)) return;
  try {
    if (!queue) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u);
  } catch { /* no voice available */ }
}
let playing = [], lineEnd = 0;
function stopClips() { for (const s of playing) { try { s.stop(); } catch { /* done */ } } playing = []; lineEnd = 0; }
// text: what to say; file: its recorded clip; queue: start after the line before it
export function narrate(text, { file, queue = false, rate, pitch } = {}) {
  if (!NARRATOR_ENABLED || muted) return;
  if (!file) { speak(text, { queue, rate, pitch }); return; }
  const c = narratorCtx();
  const when = c?.currentTime ?? 0;
  // a line with a recording is only ever said in that (male) voice: if the phone paused the
  // game's audio (another app, a call), wake it first; never switch to the device's own voice
  Promise.all([preloadClip(file), c && c.state !== 'running' ? c.resume?.().catch(() => {}) : null]).then(([buf]) => {
    if (muted || !buf || !c || c.state !== 'running') return;
    if (!queue) stopClips();
    const at = Math.max(c.currentTime, queue ? lineEnd : 0, when);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(ngain);
    s.start(at);
    s.onended = () => { playing = playing.filter((x) => x !== s); };
    playing.push(s);
    lineEnd = at + Math.max(0.2, buf.duration - CLIP_TAIL);
  });
}
export function stopNarration() {
  stopClips();
  try { speechSynthesis?.cancel?.(); } catch { /* ignore */ }
}

// The announcer uses the browser's built-in voice when there is one.
export function announce(text, { rate = 0.85, pitch = 0.5 } = {}) {
  if (!SOUND_ENABLED || muted || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    const voices = speechSynthesis.getVoices();
    const deep = voices.find((v) => /en/i.test(v.lang) && /male|daniel|fred|alex|george|david/i.test(v.name))
      || voices.find((v) => /^en/i.test(v.lang));
    if (deep) u.voice = deep;
    speechSynthesis.speak(u);
  } catch { /* no voice available */ }
}

// A low drum-and-bass loop for fights, built from the same synth pieces.
let musicTimer = null;
export function startMusic() {
  if (!ctx || musicTimer) return;
  let step = 0;
  const bpm = 132;
  const stepDur = 60 / bpm / 4;
  const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 73.4, 0, 65.4, 0];
  musicTimer = setInterval(() => {
    if (muted) { step++; return; }
    const s = step % 16;
    if (s % 4 === 0) tone(120, 40, 0.18, { gain: 0.45 });
    if (s === 4 || s === 12) noise(0.12, { freq: 1800, q: 0.6, gain: 0.22 });
    if (s % 2 === 1) noise(0.03, { freq: 7000, q: 1, type: 'highpass', gain: 0.06 });
    if (bass[s]) tone(bass[s], bass[s] * 0.99, stepDur * 1.8, { type: 'sawtooth', gain: 0.07 });
    step++;
  }, stepDur * 1000);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
