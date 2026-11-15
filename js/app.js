// Boot, event wiring and every action the player can take.
import { S, active, person, monsterOf, loadAll, daily, quests, raid, duelView, today } from './state.js';
import { view, h, COIN, ENERGY } from './views.js';
import { db } from './db.js';
import * as G from './game.js';
import * as Audio from './audio.js';
import { runSplash } from './splash.js';

const root = document.getElementById('app');
const toastEl = document.getElementById('toast');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const val = (id) => document.getElementById(id)?.value.trim() ?? '';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
let lastLoad = 0, toastTimer, lastParty = null;

function render() {
  const hadSheet = !!root.querySelector('.sheet'), sheetScroll = root.querySelector('.sheet')?.scrollTop;
  const hadBattle = !!root.querySelector('.battle');
  root.innerHTML = view();
  if (hadBattle) root.querySelector('.battle')?.classList.add('still'); // only fade in when the fight starts, not on every move
  const sheet = root.querySelector('.sheet');
  if (sheet && hadSheet) { // same sheet re-rendered: skip the slide-in and keep its scroll position
    sheet.classList.add('still'); root.querySelector('.scrim').classList.add('still');
    sheet.scrollTop = sheetScroll;
  }
  document.body.classList.toggle('locked', !!(S.sheet || S.battle || S.party.length));
  sounds();
}

function sounds() {
  Audio.music(!S.ready ? null : S.battle ? 'battle' : 'home');
  const p = !S.battle && S.party[0];
  if (p && p !== lastParty) Audio.sfx({ hatch: 'evolve', evolve: 'evolve', fuse: 'evolve', level: 'level' }[p.type]);
  lastParty = p || null;
}

function toast(html) {
  toastEl.innerHTML = html; toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

async function saveMe(patch) {
  Object.assign(S.me, patch);
  await db.update('profiles', S.me.id, patch);
}
const post = (type, data) => db.insert('events', { user_id: S.me.id, type, data }).then((e) => S.events.unshift(e)).catch(() => {});

async function reload() {
  await loadAll(S.me.id);
  lastLoad = Date.now();
  render();
}
function refreshIfStale(ms) {
  if (!S.me || S.sheet || S.battle || S.party.length || S.busy || Date.now() - lastLoad < ms) return;
  lastLoad = Date.now();
  loadAll(S.me.id).then(() => { if (!S.sheet && !S.battle && !S.busy) render(); }).catch(() => {});
}

// ---------- reading ----------
async function logReading(book, page) {
  const pages = page - book.current_page, finished = page >= book.total_pages;
  const mon = active(), before = G.levelInfo(mon.xp);
  const streakPatch = G.streakAfterReading(S.me);
  const newStreak = streakPatch.streak ?? S.me.streak;
  const xp = Math.round(pages * G.streakBonus(newStreak)) + (finished ? 50 : 0);
  const coins = Math.floor(pages / 2) + (finished ? 50 : 0);
  const carry = (S.me.state.carry || 0) + pages;
  const energy = Math.min(G.MAX_ENERGY, S.me.energy + Math.floor(carry / G.PAGES_PER_ENERGY));
  const gainedEnergy = energy - S.me.energy;

  S.logs.push(await db.insert('logs', { user_id: S.me.id, book_id: book.id, pages, day: today() }));
  Object.assign(book, await db.update('books', book.id, {
    current_page: page, ...(finished ? { status: 'finished', finished_at: new Date().toISOString() } : {}),
  }));
  mon.xp += xp;
  await db.update('monsters', mon.id, { xp: mon.xp });
  await saveMe({
    ...streakPatch, coins: S.me.coins + coins, energy,
    total_pages: S.me.total_pages + pages, books_done: S.me.books_done + (finished ? 1 : 0),
    state: { ...S.me.state, carry: carry % G.PAGES_PER_ENERGY },
  });

  post('read', { pages, title: book.title });
  const after = G.levelInfo(mon.xp), base = { name: mon.name, element: mon.element };
  if (before.level === 0 && after.level >= 1) { S.party.push({ type: 'hatch', ...base }); post('hatch', base); }
  for (const stage of [2, 3]) {
    if (before.stage < stage && after.stage >= stage) { S.party.push({ type: 'evolve', stage, ...base }); post('evolve', { ...base, stage }); }
  }
  if (after.level > before.level && before.level > 0 && after.stage === before.stage) {
    S.party.push({ type: 'level', level: after.level, stage: after.stage, ...base });
  }
  if (Math.floor(after.level / 5) > Math.floor(before.level / 5)) post('level', { ...base, level: after.level - (after.level % 5) });
  if (finished) { S.party.push({ type: 'finish', title: book.title, xp: 50, coins: 50 }); post('finish', { title: book.title }); }
  if (streakPatch.streak && [3, 7, 14, 30, 50, 100, 200, 365].includes(streakPatch.streak)) post('streak', { days: streakPatch.streak });

  S.sheet = finished ? { s: 'book', id: book.id } : null;
  render();
  toast(`+${xp} XP · +${coins} ${COIN}${gainedEnergy ? ` · +${gainedEnergy} ${ENERGY}` : ''}`);
}

function updateGain() {
  const input = document.getElementById('lg-page'), out = document.getElementById('lg-gain');
  if (!input || !out) return;
  const pages = clamp(parseInt(input.value, 10) || 0, +input.dataset.from, +input.dataset.max) - input.dataset.from;
  out.innerHTML = pages > 0 ? `+${pages} pages read → +${pages} XP · +${Math.floor(pages / 2)} ${COIN}` : 'Tap + to add the pages you read';
  out.classList.toggle('on', pages > 0);
}

// ---------- battle ----------
function step(bt, who, move) {
  const other = who === 'me' ? 'foe' : 'me', a = bt[who];
  const burned = G.burnTick(a);
  if (burned && a.hp <= 0) { // burned out before it could act
    bt.log = `${a.name} was overcome by the burn! −${burned}`;
    bt.anim = { [who]: 'hit' }; bt.pop = { [who]: { text: `−${burned}`, cls: 'burn' } };
    return render();
  }
  const r = G.applyMove(a, bt[other], move);
  bt.log = (burned ? `${a.name} is hurt by the burn (−${burned}). ` : '') + r.text;
  bt.anim = { [who]: move === 'guard' ? 'guarding' : 'lunge', [other]: r.dmg ? 'hit' : '' };
  bt.pop = r.miss ? { [who]: { text: 'Miss!', cls: 'miss' } }
    : r.dmg ? { [other]: { text: `−${r.dmg}`, cls: r.crit ? 'crit' : '' } } : { [who]: { text: `+${r.heal}`, cls: 'heal' } };
  if (burned && !bt.pop[who]) bt.pop[who] = { text: `−${burned}`, cls: 'burn' };
  render();
}

async function endBattle(won) {
  const b = S.battle, friend = !!b.defender;
  const coins = won ? (friend ? 20 : 10) : friend ? 5 : 0;
  const trophies = won ? (friend ? 15 : 5) : friend ? -Math.min(8, S.me.trophies) : 0;
  b.over = { won, coins, trophies }; b.busy = false; b.pop = {};
  b.anim = { [won ? 'foe' : 'me']: 'ko' };
  b.log = won ? `${b.foe.name} fainted!` : `${b.me.name} fainted…`;
  render();
  const d = daily();
  if (won) d.wins++;
  await saveMe({
    coins: S.me.coins + coins, trophies: S.me.trophies + trophies, wins: S.me.wins + (won ? 1 : 0),
    state: { ...S.me.state, daily: d },
  });
  const snap = (f) => ({ name: f.name, element: f.element, level: f.level });
  S.battles.unshift(await db.insert('battles', { attacker: S.me.id, defender: b.defender, won, a_mon: snap(b.me), d_mon: snap(b.foe) }));
  if (won && friend) post('battle', { foe: `${b.owner}’s ${b.foe.name}` });
}

// ---------- click actions ----------
const A = {
  authMode(d) { S.auth = { mode: d.mode, error: '', name: val('au-name') }; render(); },
  pickStarter(d) { S.starter = { element: d.el, name: val('st-name') }; render(); },

  go(d) {
    S.tab = d.tab; S.sheet = null;
    if (d.sub) S.sub[d.tab] = d.sub;
    render(); window.scrollTo(0, 0);
    refreshIfStale(30000);
  },
  sub(d) { S.sub[d.tab] = d.sub; render(); },
  sheet(d) {
    const { a, ...rest } = d;
    S.sheet = rest; render();
    if (rest.s === 'friend') {
      db.select('books', { owner: rest.id, status: 'reading' }, { limit: 3 }).then((books) => {
        if (S.sheet?.s === 'friend' && S.sheet.id === rest.id) { S.sheet.books = books; render(); }
      }).catch(() => {});
    }
  },
  closeSheet() { S.sheet = null; render(); },
  partyNext() { S.party.shift(); render(); },

  pet(d, el) {
    el.classList.remove('petted'); void el.offsetWidth; el.classList.add('petted');
    const heart = document.createElement('span');
    heart.className = 'heart'; heart.textContent = ['💛', '✨', '💚', '💙', '🧡'][Math.floor(Math.random() * 5)];
    heart.style.left = `${30 + Math.random() * 40}%`;
    el.append(heart); setTimeout(() => heart.remove(), 900);
  },
  async setActive(d) { await saveMe({ active_monster: d.id }); render(); },

  openLog(d) {
    const reading = S.books.filter((b) => b.status === 'reading');
    S.sheet = reading.length ? { s: 'log', id: d.id || reading[0].id } : { s: 'addbook' };
    render();
  },
  bump(d) {
    const input = document.getElementById('lg-page');
    input.value = clamp((parseInt(input.value, 10) || +input.dataset.from) + +d.n, +input.dataset.from, +input.dataset.max);
    updateGain();
  },
  async saveLog(d) {
    const book = S.books.find((b) => b.id === d.id);
    const page = clamp(parseInt(val('lg-page'), 10) || 0, book.current_page, book.total_pages);
    if (page <= book.current_page) return toast('Move the page number up first');
    if (page - book.current_page > 2000) return toast('That is a lot for one sitting! Log up to 2,000 pages at a time.');
    await logReading(book, page);
  },

  pickResult(d) { S.sheet = { ...S.sheet, draft: S.sheet.results[d.i], results: null }; render(); },
  async startBook(d) {
    const b = S.books.find((x) => x.id === d.id);
    Object.assign(b, await db.update('books', b.id, { status: 'reading' }));
    post('start', { title: b.title });
    S.sheet = null; S.sub.library = 'reading'; render();
  },
  async rate(d) {
    const b = S.books.find((x) => x.id === d.id);
    Object.assign(b, await db.update('books', b.id, { rating: +d.n }));
    render();
  },
  async deleteBook(d) {
    if (!S.sheet.confirm) { S.sheet.confirm = true; return render(); }
    await db.remove('books', { id: d.id });
    S.books = S.books.filter((b) => b.id !== d.id);
    S.sheet = null; render();
  },

  async claimQuest(d) {
    const q = quests().find((x) => x.id === d.id);
    if (!q || !q.done || q.claimed) return;
    const dl = daily();
    dl.claimed.push(q.id);
    await saveMe({ coins: S.me.coins + q.reward, state: { ...S.me.state, daily: dl } });
    render(); toast(`Quest complete! +${q.reward} ${COIN}`);
  },
  async raidClaim() {
    const r = raid();
    if (!r.dead || r.claimed || !r.mine) return;
    await saveMe({ coins: S.me.coins + r.reward, freezes: Math.min(2, S.me.freezes + 1), state: { ...S.me.state, raid: r.week } });
    render(); toast(`${h(r.name)} is beaten! +${r.reward} ${COIN} and a streak freeze`);
  },

  async cheer(d) {
    const mine = S.cheers.find((c) => c.event_id === d.id && c.user_id === S.me.id);
    if (mine) {
      S.cheers = S.cheers.filter((c) => c !== mine);
      render();
      await db.remove('cheers', { id: mine.id });
    } else {
      const temp = { event_id: d.id, user_id: S.me.id };
      S.cheers.push(temp); render();
      Object.assign(temp, await db.insert('cheers', { event_id: d.id, user_id: S.me.id }));
      const ev = S.events.find((e) => e.id === d.id), dl = daily();
      if (ev && ev.user_id !== S.me.id && !dl.cheers) {
        dl.cheers = 1;
        await saveMe({ state: { ...S.me.state, daily: dl } });
      }
    }
  },
  async friendAccept(d) { await db.update('friendships', d.id, { status: 'accepted' }); await reload(); toast('You are now friends!'); },
  async friendRemove(d) {
    if (d.confirm && !S.sheet?.confirm) { S.sheet.confirm = true; return render(); }
    await db.remove('friendships', { id: d.id });
    S.sheet = null; await reload();
  },

  duelPick(d) { S.sheet = { ...S.sheet, ...(d.days ? { days: +d.days } : { id: d.id }) }; render(); },
  async duelSend(d) {
    if (S.duels.some((x) => x.status !== 'done' && [x.challenger, x.opponent].includes(d.id))) return toast('You already have a duel going with them');
    const t = G.DUEL_TYPES[d.days];
    S.duels.unshift(await db.insert('duels', { challenger: S.me.id, opponent: d.id, days: t.days, prize: t.prize }));
    S.sheet = null; S.tab = 'arena'; S.sub.arena = 'duels'; render();
    toast(`Challenge sent to ${h(person(d.id).username)}`);
  },
  async duelAccept(d) {
    const duel = S.duels.find((x) => x.id === d.id);
    await db.update('duels', d.id, { status: 'active', start_day: today(), end_day: G.addDays(today(), duel.days - 1) });
    await reload(); toast('Duel on! Start reading.');
  },
  async duelDecline(d) {
    await db.remove('duels', { id: d.id });
    S.duels = S.duels.filter((x) => x.id !== d.id); render();
  },
  async duelClaim(d) {
    const duel = S.duels.find((x) => x.id === d.id), v = duelView(duel);
    if (v.claimed) return;
    const prize = duel.winner === S.me.id ? duel.prize : duel.winner ? 0 : Math.floor(duel.prize / 2);
    Object.assign(duel, await db.update('duels', duel.id, { [v.mine ? 'claimed_c' : 'claimed_o']: true }));
    if (prize) await saveMe({ coins: S.me.coins + prize });
    render();
    if (prize) toast(`+${prize} ${COIN}`);
  },

  async buy(d) {
    const st = S.me.state;
    if (d.item === 'freeze' && S.me.coins >= 60 && S.me.freezes < 2) await saveMe({ coins: S.me.coins - 60, freezes: S.me.freezes + 1 });
    else if (d.item === 'energy' && S.me.coins >= 40) await saveMe({ coins: S.me.coins - 40, energy: G.MAX_ENERGY });
    else if (d.item === 'habitat' && S.me.coins >= G.HABITATS[d.id].price) {
      await saveMe({ coins: S.me.coins - G.HABITATS[d.id].price, habitat: d.id, state: { ...st, habitats: [...(st.habitats || []), d.id] } });
    } else return;
    render(); toast('Purchased!');
  },
  async setHabitat(d) { await saveMe({ habitat: d.id }); render(); },
  async setGoal(d) { await saveMe({ daily_goal: +d.n }); render(); },
  sound(d) { Audio.setPref(d.k, d.on === '1'); render(); },
  async logout() {
    await db.logout();
    Object.assign(S, { me: null, monsters: [], books: [], logs: [], friends: [], events: [], duels: [], battles: [], sheet: null, tab: 'home', auth: { mode: 'login', error: '' } });
    delete document.body.dataset.el;
    render();
  },

  async fight(d) {
    const me = G.fighter(active());
    if (!me.level) return toast('Hatch your egg first!');
    if (S.me.energy < 1) return toast(`Out of energy. Read ${G.PAGES_PER_ENERGY} pages to charge ${ENERGY}`);
    let foe, owner = null;
    if (d.id) {
      const f = S.people[d.id];
      foe = G.fighter(monsterOf(f)); owner = f.username;
    } else {
      // Hybrids are rare: each has a 1% chance to show up instead of a normal wild monster.
      const rare = Object.keys(G.ELEMENTS).filter((k) => !G.STARTERS.includes(k)).find(() => Math.random() < G.RARE_WILD_CHANCE);
      const el = rare || G.STARTERS[Math.floor(Math.random() * G.STARTERS.length)];
      const xp = G.xpForLevel(Math.max(1, me.level + Math.floor(Math.random() * 4) - 2));
      foe = G.fighter({ name: `Wild ${G.stageName(el, G.levelInfo(xp).stage)}`, element: el, xp, ...(rare ? { rare: true } : {}) });
    }
    await saveMe({ energy: S.me.energy - 1 });
    S.sheet = null;
    S.battle = { me, foe, owner, defender: d.id || null, log: foe.rare ? `${G.ELEMENTS[foe.element].emoji} A rare ${foe.name} appeared! Only 1 in 100 wild battles…` : `${owner ? `${owner}’s ${foe.name}` : foe.name} is ready to fight!`, busy: false, over: null, anim: {}, pop: {} };
    render();
  },
  async move(d) {
    const b = S.battle;
    if (!b || b.busy || b.over || (d.m === 'blast' && b.me.cd)) return;
    b.busy = true;
    step(b, 'me', d.m);
    await sleep(1000);
    if (b.me.hp <= 0) return endBattle(false);
    if (b.foe.hp <= 0) return endBattle(true);
    step(b, 'foe', G.aiMove(b.foe, b.me));
    await sleep(1000);
    if (b.foe.hp <= 0) return endBattle(true);
    if (b.me.hp <= 0) return endBattle(false);
    b.busy = false; b.anim = {}; b.pop = {};
    render();
  },
  battleEnd() { S.battle = null; render(); },
  battleFlee() { S.battle = null; render(); toast('You got away safely'); },
};

// ---------- form submits ----------
const F = {
  async auth() {
    const name = val('au-name').toLowerCase(), pass = document.getElementById('au-pass').value;
    S.auth.name = name;
    try {
      const id = await db[S.auth.mode === 'signup' ? 'register' : 'login'](name, pass);
      await loadAll(id);
      lastLoad = Date.now(); S.auth.error = '';
    } catch (e) { S.auth.error = e.message; }
    render();
  },
  async starter() {
    const name = val('st-name');
    if (!S.starter.element || !name) return;
    const m = await db.insert('monsters', { owner: S.me.id, element: S.starter.element, name });
    S.monsters = [m];
    await saveMe({ active_monster: m.id });
    render();
    toast(`Add a book and read ${G.HATCH_PAGES} pages to hatch ${h(name)}!`);
  },
  async searchBook() {
    const q = val('bk-q');
    if (!q) return;
    S.sheet = { ...S.sheet, q, searching: true }; render();
    let results = [];
    try {
      const res = await fetch(`https://openlibrary.org/search.json?limit=8&fields=title,author_name,cover_i,number_of_pages_median&q=${encodeURIComponent(q)}`);
      results = ((await res.json()).docs || []).map((x) => ({
        title: x.title, author: x.author_name?.[0] || '', total_pages: x.number_of_pages_median || 0,
        cover_url: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg` : null,
      }));
    } catch { toast('Search is unavailable. Type the book in below.'); }
    if (S.sheet?.s === 'addbook') { S.sheet = { ...S.sheet, searching: false, results }; render(); }
  },
  async addBook(form, submitter) {
    const shelf = submitter?.value === 'wishlist' ? 'wishlist' : 'reading';
    const title = val('bk-title'), total = clamp(parseInt(val('bk-pages'), 10) || 0, 1, 20000);
    const start = shelf === 'reading' ? clamp(parseInt(val('bk-start'), 10) || 0, 0, total - 1) : 0;
    const draft = S.sheet.draft;
    S.books.unshift(await db.insert('books', {
      owner: S.me.id, title, author: val('bk-author'), total_pages: total, current_page: start, status: shelf,
      cover_url: draft && draft.title === title ? draft.cover_url : null,
    }));
    if (shelf === 'reading') post('start', { title });
    S.sheet = null; S.sub.library = shelf; render();
    toast(shelf === 'reading' ? 'Book added. Happy reading!' : 'Saved to your wishlist');
  },
  async addFriend() {
    const name = val('fr-name').toLowerCase();
    if (name === S.me.username) return toast('That’s you!');
    const [p] = await db.select('profiles', { username: name });
    if (!p) return toast(`No trainer called “${h(name)}”`);
    const ship = S.ships.find((f) => f.requester === p.id || f.addressee === p.id);
    if (ship?.status === 'accepted') return toast('You are already friends');
    if (ship && ship.requester === S.me.id) return toast('Request already sent');
    if (ship) await db.update('friendships', ship.id, { status: 'accepted' });
    else await db.insert('friendships', { requester: S.me.id, addressee: p.id });
    await reload();
    toast(ship ? 'You are now friends!' : `Request sent to ${h(name)}`);
  },
  async buyEgg() {
    const name = val('egg-name'), el = S.sheet.el;
    if (!name || S.me.coins < 300 || S.monsters.some((m) => m.element === el)) return;
    const m = await db.insert('monsters', { owner: S.me.id, element: el, name });
    S.monsters.push(m);
    await saveMe({ coins: S.me.coins - 300, active_monster: m.id });
    post('egg', { element: el });
    S.sheet = null; S.tab = 'home'; render(); window.scrollTo(0, 0);
    toast(`${h(name)} joined your team!`);
  },
  async fuse() {
    const name = val('fz-name'), el = S.sheet.el, e = G.ELEMENTS[el];
    if (!name || !G.fusable(S.monsters).includes(el)) return;
    const m = await db.insert('monsters', { owner: S.me.id, element: el, name });
    S.monsters.push(m);
    await saveMe({ active_monster: m.id });
    post('fuse', { element: el, name, parents: e.parents });
    S.party.push({ type: 'fuse', element: el, name, parents: e.parents });
    S.sheet = null; S.tab = 'home'; render(); window.scrollTo(0, 0);
  },
  async rename() {
    const name = val('rn'), mon = active();
    if (!name) return;
    Object.assign(mon, await db.update('monsters', mon.id, { name }));
    S.sheet = null; render(); toast('Renamed!');
  },
};

async function run(fn, ...args) {
  if (S.busy || !fn) return;
  try {
    const p = fn(...args);
    if (p?.then) { S.busy = true; await p; }
  } catch (e) {
    console.error(e);
    toast(h(e.message || 'Something went wrong. Try again.'));
  } finally { S.busy = false; }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled) run(A[el.dataset.a], { ...el.dataset }, el);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  run(F[form.dataset.form], form, e.submitter);
});
document.addEventListener('input', (e) => { if (e.target.id === 'lg-page') updateGain(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfStale(60000); });

runSplash((async function boot() {
  render();
  try {
    const pid = await db.init();
    if (pid) { await loadAll(pid); lastLoad = Date.now(); }
  } catch (e) {
    console.error(e);
    S.auth.error = e.message;
  }
  S.ready = true;
  try { render(); } catch (e) { console.error(e); window.splashBail?.(e); }
})());
