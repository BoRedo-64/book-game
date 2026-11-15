// Loading screen that turns into "Tap to start". The tap is what lets the
// browser play music, so the soundtrack starts the moment the app opens.
import { S, active } from './state.js';
import { levelInfo, monsterImg } from './game.js';
import * as Audio from './audio.js';

const el = document.getElementById('splash');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MSGS = ['Waking the monsters…', 'Dusting off the books…', 'Tuning the music…', 'Counting pages…'];

export async function runSplash(boot) {
  if (!el) return;
  const bar = el.querySelector('.sp-bar i'), msg = el.querySelector('.sp-msg');
  let pct = 6, m = 0;
  const bump = (n) => { pct = Math.min(100, pct + n); bar.style.width = `${pct}%`; };
  const tick = setInterval(() => { msg.textContent = MSGS[++m % MSGS.length]; if (pct < 80) bump(3); }, 1300);
  const step = (p, n) => Promise.resolve(p).finally(() => bump(n));

  await Promise.allSettled([
    step(boot, 45),
    step(Promise.race([Audio.ready, sleep(8000)]), 40), // never let slow audio block the app
    sleep(1200), // long enough to see it, short enough not to annoy
  ]);
  clearInterval(tick);
  bump(100);
  await sleep(350);

  const mon = S.me && S.monsters.length && active();
  if (mon) {
    const logo = el.querySelector('.sp-logo');
    logo.src = monsterImg(mon.element, levelInfo(mon.xp).stage);
    logo.classList.add('mon');
    el.classList.add(`el-${mon.element}`);
  }
  if (!Audio.needsTap()) return leave(); // already allowed to play (e.g. Android home-screen app)
  el.classList.add('ready');
  el.addEventListener('click', leave, { once: true });
}

function leave() {
  el.classList.add('out');
  document.body.classList.remove('splashing');
  setTimeout(() => el.remove(), 550);
}
