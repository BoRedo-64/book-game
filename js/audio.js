// Background music + sound effects on one Web Audio context.
// Browsers keep audio locked until the first tap, so everything waits for that.
const SRC = {
  home: 'assets/audio/home.mp3',
  battle: 'assets/audio/battle.mp3',
  evolve: 'assets/audio/evolve.mp3',
  level: 'assets/audio/level-up.mp3',
};
const MUSIC_VOL = 0.35, SFX_VOL = 0.9, FADE = 0.6;

const read = (k) => { try { return localStorage.getItem(k) !== 'off'; } catch { return true; } };
const write = (k, on) => { try { localStorage.setItem(k, on ? 'on' : 'off'); } catch { /* private mode */ } };
export const prefs = { music: read('pl-music'), sfx: read('pl-sfx') };

// iOS: mix with the reader's own podcasts/audiobooks instead of stopping them.
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* unsupported */ }

const Ctx = window.AudioContext || window.webkitAudioContext;
const ctx = Ctx ? new Ctx() : null;
const musicBus = ctx?.createGain(), sfxBus = ctx?.createGain();
if (ctx) {
  musicBus.gain.value = prefs.music ? MUSIC_VOL : 0; musicBus.connect(ctx.destination);
  sfxBus.gain.value = SFX_VOL; sfxBus.connect(ctx.destination);
}

const buffers = {};
function load(name) {
  return (buffers[name] ||= fetch(SRC[name]).then((r) => r.arrayBuffer())
    .then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
    .catch((e) => { delete buffers[name]; throw e; }));
}

let want = null, playing = null; // playing = { name, src, gain }
let unlocked = false;

async function sync() {
  if (!ctx || !unlocked || !prefs.music) return;
  const name = want;
  if (playing?.name === name) return;
  if (playing) { // fade the old track out
    const old = playing; playing = null;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3);
    setTimeout(() => old.src.stop(), FADE * 1000 + 200);
  }
  if (!name) return;
  let buf;
  try { buf = await load(name); } catch { return; }
  if (want !== name || playing || !prefs.music) return sync(); // changed while loading
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buf; src.loop = true;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3);
  src.connect(gain).connect(musicBus);
  src.start();
  playing = { name, src, gain };
}

/** Which music should be playing: 'home', 'battle' or null. Safe to call on every render. */
export function music(name) {
  if (want === name) return;
  want = name;
  sync();
}

/** Play a one-shot effect ('evolve', 'level'). Ducks the music while it plays. */
export async function sfx(name) {
  if (!ctx || !prefs.sfx || !SRC[name]) return;
  let buf;
  try { buf = await load(name); } catch { return; }
  if (ctx.state !== 'running') return;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(sfxBus);
  const t = ctx.currentTime, g = musicBus.gain;
  if (prefs.music) {
    g.cancelScheduledValues(t); g.setTargetAtTime(MUSIC_VOL * 0.15, t, 0.05);
    g.setTargetAtTime(MUSIC_VOL, t + buf.duration, 0.4);
  }
  src.start();
}

export function setPref(kind, on) {
  prefs[kind] = on; write(kind === 'music' ? 'pl-music' : 'pl-sfx', on);
  if (kind === 'music' && ctx) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.15);
    if (on) sync();
    else if (playing) { const p = playing; playing = null; setTimeout(() => p.src.stop(), 800); }
  }
}

// Download + decode the home music and jingles straight away (decoding works before
// the unlock), so the first tap can start the music instantly instead of after a
// 1.3 MB download. The battle theme follows once the app is unlocked.
if (ctx) ['home', 'evolve', 'level'].forEach((n) => load(n).catch(() => {}));

// Unlock on the first user gesture, then preload the rest quietly.
function unlock() {
  if (!ctx) return;
  // iOS only unlocks if a sound starts inside the tap itself: play one silent sample.
  try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch { /* ignore */ }
  ctx.resume().then(() => {
    if (ctx.state !== 'running') return;
    unlocked = true;
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((t) => document.removeEventListener(t, unlock, true));
    sync();
    Object.keys(SRC).forEach((n) => load(n).catch(() => {}));
  }).catch(() => {});
}
['pointerdown', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, true));

// Go quiet when the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (!ctx || !unlocked) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
});
// iOS can 'interrupt' the audio (calls, Siri, lock screen); pick it back up on the next tap.
ctx?.addEventListener?.('statechange', () => {
  if (unlocked && ctx.state !== 'running' && !document.hidden) {
    unlocked = false;
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, true));
  }
});
