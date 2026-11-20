// All screens, rendered as HTML strings from state.
import {
  S, active, person, nameOf, monsterOf, pagesToday, pagesLeftToday, weekPages, streak, quests, raid, ranking,
  achievements, duelView, badges, today, daily, foughtToday, trainer,
} from './state.js';
import {
  ELEMENTS, levelInfo, stageName, monsterImg, timeAgo, fighter, elementMult, MOVES, league, hash,
  HABITATS, DUEL_TYPES, perkText, guardFactor, STARTERS, fusable, isHybrid, RARE_WILD_CHANCE, RARE_WILD_CHANCE_HYBRID, HATCH_PAGES, DAILY_PAGE_LIMIT, MAX_ENERGY, PAGES_PER_ENERGY, EVOLVE_1, EVOLVE_2, addDays, diffDays, streakBonus,
} from './game.js';
import { db } from './db.js';
import { prefs } from './audio.js';
import { ic } from './icons.js';

const RAID_IMG = 'assets/monsters/dark-3.webp', RAID_DEAD_IMG = 'assets/monsters/dark-defeated.webp';
const elIc = (k) => ic(ELEMENTS[k].icon, `i-el el-${k}`);
const lgIc = (lg) => ic(lg.icon, `i-${lg.tint}`);
export const COIN = '<img class="ico" src="assets/coin.webp" alt="coins">';
export const ENERGY = '<img class="ico" src="assets/energy.webp" alt="energy">';
export const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString();
const pct = (a, b) => Math.max(0, Math.min(100, b ? (a / b) * 100 : 0));
const bar = (a, b, cls = '') => `<div class="bar ${cls}"><i style="width:${pct(a, b)}%"></i></div>`;
const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;

const NAV_ICONS = { home: 'house', library: 'books', arena: 'sword', friends: 'users', me: 'user-circle' };

const monImg = (mon, cls = '') => {
  const { stage } = levelInfo(mon.xp);
  return `<img class="${cls}" src="${monsterImg(mon.element, stage)}" alt="${h(stageName(mon.element, stage))}" draggable="false">`;
};
const avatar = (profile, size = '') => {
  const m = profile && monsterOf(profile);
  return `<span class="avatar ${size} ${m ? 'el-' + m.element : ''}">${m ? monImg(m) : ic('egg')}</span>`;
};
const cover = (b, cls = '') => b.cover_url?.startsWith('https://covers.openlibrary.org/')
  ? `<img class="cover ${cls}" src="${h(b.cover_url)}" alt="" loading="lazy">`
  : `<div class="cover fake ${cls}" style="--hue:${hash(b.title) % 360}"><span>${h(b.title)}</span></div>`;

// ---------- auth + starter ----------
function authView() {
  const signup = S.auth.mode === 'signup';
  return `<main class="auth">
    <div class="eggs">${['water', 'fire', 'plant'].map((e, i) => `<img src="${monsterImg(e, 0)}" alt="" style="--i:${i}">`).join('')}</div>
    <h1 class="logo">Pagelings</h1>
    <p class="tagline">Read pages. Raise a monster. Out-read your friends.</p>
    <div class="seg">
      <button data-a="authMode" data-mode="signup" class="${signup ? 'on' : ''}">New trainer</button>
      <button data-a="authMode" data-mode="login" class="${signup ? '' : 'on'}">Log in</button>
    </div>
    <form data-form="auth" class="stack">
      <input id="au-name" value="${h(S.auth.name || '')}" placeholder="Trainer name" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="16" required>
      <input id="au-pass" type="password" placeholder="Password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required>
      ${S.auth.error ? `<p class="err">${h(S.auth.error)}</p>` : ''}
      <button class="btn primary big">${signup ? 'Get my egg' : 'Log in'}</button>
    </form>
    <p class="fine">${db.online
      ? (signup ? 'No email needed. Pick a password you will remember — there is no reset.' : 'Welcome back, trainer.')
      : 'Demo mode: saved on this device only, with practice bots as friends.'}</p>
  </main>`;
}

function starterView() {
  const pick = S.starter.element;
  return `<main class="starter">
    <h1>Choose your egg</h1>
    <p class="muted">It hatches after ${HATCH_PAGES} pages of reading.</p>
    <div class="starters">${STARTERS.map((k) => [k, ELEMENTS[k]]).map(([k, e]) => `
      <button class="starter-card el-${k} ${pick === k ? 'on' : ''}" data-a="pickStarter" data-el="${k}">
        <img src="${monsterImg(k, 0)}" alt="${e.name} egg">
        <div><b>${elIc(k)} ${e.name}</b><small>${e.blurb}</small><small class="beats">Strong against ${e.beats.map((b) => ELEMENTS[b].name).join(' & ')}</small><small class="perk">${ic('sparkle')} ${e.perk.name}: ${perkText(k)}</small></div>
      </button>`).join('')}</div>
    <form data-form="starter" class="stack">
      <input id="st-name" placeholder="Name your monster" maxlength="20" value="${h(S.starter.name)}" required>
      <button class="btn primary big" ${pick ? '' : 'disabled'}>${pick ? `Start with ${ELEMENTS[pick].name}` : 'Pick an egg'}</button>
    </form>
  </main>`;
}

// ---------- home ----------
function mood(mon, info) {
  const pt = pagesToday(), goal = S.me.daily_goal, st = streak();
  if (info.level === 0) return info.cur >= HATCH_PAGES * 0.6 ? 'Something is moving inside…' : '…zzz… (read to me?)';
  if (pt >= goal) return 'That was delicious. Same time tomorrow?';
  if (pt > 0) return `Yum, pages! ${goal - pt} more to hit our goal.`;
  if (S.me.last_read && diffDays(S.me.last_read, today()) >= 2) return 'I missed you. Read me something?';
  if (st > 0) return `Our ${st}-day streak needs you today!`;
  return 'Got ten minutes? Let’s read!';
}

function topbar() {
  const st = streak(), lit = S.me.last_read === today();
  return `<header class="topbar">
    <span class="stat ${lit ? 'lit' : ''}" title="Day streak">${ic('fire', 'i-fire')} <b>${st}</b></span>
    <span class="stat" title="Battle energy">${ENERGY} <b>${S.me.energy}</b><small>/${MAX_ENERGY}</small></span>
    <button class="stat" data-a="go" data-tab="shop" title="Coins">${COIN} <b>${fmt(S.me.coins)}</b></button>
  </header>`;
}

function stageCard() {
  const mon = active(), info = levelInfo(mon.xp);
  const next = info.level === 0 ? 'to hatch' : info.level + 1 === EVOLVE_1 || info.level + 1 === EVOLVE_2 ? 'to evolve!' : `to level ${info.level + 1}`;
  return `<section class="stage hab-${S.me.habitat} el-${mon.element}">
    <div class="stage-top">
      <span class="chip">${info.level ? `Lv ${info.level}` : 'Egg'}</span>
      <span class="chip">${ic(ELEMENTS[mon.element].icon)} ${stageName(mon.element, info.stage)}</span>
    </div>
    <p class="bubble">${h(mood(mon, info))}</p>
    <button class="mon ${info.level === 0 ? 'egg' : ''}" data-a="pet" aria-label="Pet ${h(mon.name)}">${monImg(mon)}</button>
    <div class="stage-info">
      <h2>${h(mon.name)}</h2>
      ${bar(info.cur, info.need, 'xp')}
      <small>${info.need - info.cur} pages ${next}</small>
    </div>
    ${S.monsters.length > 1 ? `<div class="team">${S.monsters.map((m) => `
      <button class="${m.id === mon.id ? 'on' : ''} el-${m.element}" data-a="setActive" data-id="${m.id}" aria-label="Switch to ${h(m.name)}">${monImg(m)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function homeView() {
  const pt = pagesToday(), goal = S.me.daily_goal, reading = S.books.filter((b) => b.status === 'reading');
  const r = raid(), bonus = streakBonus(streak());
  return `${topbar()}${stageCard()}
    <button class="btn primary big wide" data-a="openLog">${ic('book-open')} Log reading</button>
    ${fusionBanner()}
    <section class="card goal">
      <div class="ring" style="--p:${pct(pt, goal)}"><b>${pt}</b><small>/ ${goal}</small></div>
      <div><h3>${pt >= goal ? 'Daily goal done!' : 'Today’s pages'}</h3>
        <p class="muted">${pt >= goal ? 'Everything extra is bonus XP for your monster.' : `${goal - pt} pages to go.`}
        ${bonus > 1 ? `<br>Streak bonus: +${Math.round((bonus - 1) * 100)}% XP` : ''}</p></div>
    </section>
    ${reading.length ? `<h3 class="h">Keep reading</h3><div class="hscroll">${reading.map((b) => `
      <button class="bookchip" data-a="openLog" data-id="${b.id}">${cover(b)}
        <span><b>${h(b.title)}</b>${bar(b.current_page, b.total_pages)}<small>p. ${b.current_page} / ${b.total_pages}</small></span>
      </button>`).join('')}</div>` : `
      <button class="card empty" data-a="sheet" data-s="addbook"><b>＋ Add your first book</b><small>Search by title or type it in.</small></button>`}
    <h3 class="h">Daily quests</h3>
    <section class="card list">${quests().map((q) => `
      <div class="quest ${q.claimed ? 'claimed' : ''}">
        <div><b>${h(q.text)}</b>${bar(q.cur, q.max)}</div>
        ${q.claimed ? `<span class="tick">${ic('check')}</span>` : q.done
          ? `<button class="btn gold sm" data-a="claimQuest" data-id="${q.id}">+${q.reward} ${COIN}</button>`
          : `<span class="reward">${q.reward} ${COIN}</span>`}
      </div>`).join('')}</section>
    <button class="card raidmini" data-a="go" data-tab="arena" data-sub="raid">
      <img class="shadowbeast ${r.dead ? 'dead' : ''}" src="${r.dead ? RAID_DEAD_IMG : RAID_IMG}" alt="">
      <span><small>WEEKLY RAID</small><b>${h(r.name)}</b>${bar(r.left, r.hp, 'hp')}
      <small>${r.dead ? 'Defeated! Claim your reward.' : `${fmt(r.left)} HP left · ${plural(r.daysLeft, 'day')}`}</small></span>
    </button>`;
}

// ---------- library ----------
function libraryView() {
  const sub = S.sub.library;
  const books = S.books.filter((b) => b.status === sub);
  const empty = { reading: 'Nothing on the go. Add a book to start feeding your monster.', finished: 'Finished books land here.', wishlist: 'Save books you want to read next.' }[sub];
  return `<header class="title"><h1>Library</h1><button class="btn primary sm" data-a="sheet" data-s="addbook">＋ Add book</button></header>
    <div class="seg">${[['reading', 'Reading'], ['finished', 'Finished'], ['wishlist', 'Wishlist']].map(([k, n]) =>
      `<button data-a="sub" data-tab="library" data-sub="${k}" class="${sub === k ? 'on' : ''}">${n} <small>${S.books.filter((b) => b.status === k).length}</small></button>`).join('')}</div>
    ${books.length ? `<div class="books">${books.map((b) => `
      <button class="book" data-a="sheet" data-s="book" data-id="${b.id}">${cover(b)}
        <span class="meta"><b>${h(b.title)}</b><small>${h(b.author)}</small>
        ${b.status === 'reading' ? `${bar(b.current_page, b.total_pages)}<small>${Math.round(pct(b.current_page, b.total_pages))}% · p. ${b.current_page} / ${b.total_pages}</small>` : ''}
        ${b.status === 'finished' ? `<small class="stars">${[1, 2, 3, 4, 5].map((n) => ic('star', n <= (b.rating || 0) ? '' : 'off')).join('')}</small>` : ''}
        ${b.status === 'wishlist' ? `<small>${b.total_pages} pages</small>` : ''}</span>
      </button>`).join('')}</div>` : `<p class="emptynote">${empty}</p>`}`;
}

// ---------- arena ----------
function matchup(mine, theirs) {
  const m = elementMult(mine, theirs), r = elementMult(theirs, mine);
  if (m > 1) return '<span class="tag good">You have the edge</span>';
  if (r > 1) return '<span class="tag bad">Risky matchup</span>';
  return '';
}

function battleTab() {
  const mon = active(), me = fighter(mon), lg = league(S.me.trophies);
  const egg = me.level === 0, can = !egg && S.me.energy > 0;
  const pips = Array.from({ length: MAX_ENERGY }, (_, i) => `<i class="${i < S.me.energy ? 'on' : ''}"></i>`).join('');
  const el = ELEMENTS[mon.element], perk = el.perk;
  return `<section class="fcard el-${mon.element}"><div class="fcard-frame">
      <div class="fcard-in">
        <span class="fcard-ribbon" aria-label="${el.name} family">${ic(el.icon)}</span>
        <div class="fcard-mon">${monImg(mon)}<i class="fcard-rock"></i></div>
        <div class="fcard-info">
          <h2 class="fcard-name"><span>${h(mon.name)}</span><em>Lv. ${me.level}</em></h2>
          ${egg ? '<p class="fcard-box fcard-note">Eggs can’t fight. Hatch it first!</p>' : `
          <div class="fcard-stats">
            <span class="fcard-box">${ic('heart', 'i-hp')} <b>${me.maxHp}</b> HP</span>
            <span class="fcard-box">${ic('sword')} <b>${me.atk}</b> ATK</span>
          </div>
          <div class="fcard-box fcard-perk"><span class="hexa">${ic(el.icon)}</span>
            <p><b>${perk.name}</b> <small>· ${perk.healMult || perk.immuneGuard ? 'Guard' : el.blast}</small><br><span>${perkText(mon.element, false)}</span></p></div>`}
          <div class="fcard-box fcard-league">${lgIc(lg)} ${lg.name} league <i>·</i> ${ic('trophy', 'i-gold')} ${fmt(S.me.trophies)}</div>
          <div class="fcard-energy" aria-label="${S.me.energy} of ${MAX_ENERGY} energy"><span class="orb">${ENERGY}</span>${pips}</div>
        </div>
      </div>
    </div></section>
    <p class="hint">Every ${PAGES_PER_ENERGY} pages you read charges 1 ${ENERGY}. A battle costs 1 ${ENERGY}.</p>
    <h3 class="h">Opponents</h3>
    <section class="card list">
      <div class="row"><span class="avatar wild">${ic('spiral')}</span>
        <div><b>Wild encounter</b><small>A random monster near your level${isHybrid(mon.element) ? ` · ${ic('sparkle', 'i-gold')} rare monsters show up 1 in ${Math.round(1 / RARE_WILD_CHANCE_HYBRID)} battles with ${h(mon.name)} (normally 1 in ${Math.round(1 / RARE_WILD_CHANCE)})` : ''}</small></div>
        <button class="btn primary sm" data-a="fight" ${can ? '' : 'disabled'}>Fight</button></div>
      ${S.friends.map((f) => {
        const fm = monsterOf(f); if (!fm) return '';
        const fi = levelInfo(fm.xp);
        return `<div class="row">${avatar(f)}
          <div><b>${h(f.username)}</b><small>${h(fm.name)} · ${fi.level ? `Lv ${fi.level} ${stageName(fm.element, fi.stage)}` : 'still an egg'}</small>${fi.level && !egg ? matchup(mon.element, fm.element) : ''}</div>
          <button class="btn primary sm" data-a="fight" data-id="${f.id}" ${can && fi.level && !foughtToday(f.id) ? '' : 'disabled'}>${foughtToday(f.id) ? 'Tomorrow' : 'Fight'}</button></div>`;
      }).join('')}
    </section>
    ${S.battles.length ? `<h3 class="h">Battle log</h3><section class="card list">${S.battles.map((b) => {
      const atk = b.attacker === S.me.id, won = atk ? b.won : !b.won;
      const text = atk
        ? `You ${b.won ? 'beat' : 'lost to'} ${b.defender ? h(nameOf(b.defender)) + '’s ' : 'a wild '}${h(b.d_mon.name)}`
        : `${h(nameOf(b.attacker))} attacked ${h(b.d_mon.name)} and ${b.won ? 'won' : 'lost'}`;
      return `<div class="row"><span class="result ${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span><div><b>${text}</b><small>${timeAgo(b.created_at)}</small></div></div>`;
    }).join('')}</section>` : ''}`;
}

function duelsTab() {
  const groups = { invites: [], active: [], sent: [], done: [] };
  for (const d of S.duels) {
    const v = duelView(d);
    if (d.status === 'pending') groups[v.mine ? 'sent' : 'invites'].push([d, v]);
    else if (d.status === 'active') groups.active.push([d, v]);
    else if (!v.claimed) groups.done.push([d, v]);
  }
  const versus = (d, v) => {
    const total = Math.max(1, v.my + v.their);
    return `<div class="versus"><span>You<b>${v.my}</b></span>
      <div class="tug"><i style="width:${v.my + v.their ? (v.my / total) * 100 : 50}%"></i></div>
      <span>${h(nameOf(v.other))}<b>${v.their}</b></span></div>`;
  };
  const type = (d) => `${DUEL_TYPES[d.days]?.name || 'Duel'} · ${plural(d.days, 'day')} · ${d.prize} ${COIN}`;
  return `<button class="btn primary wide" data-a="sheet" data-s="newduel" ${S.friends.length ? '' : 'disabled'}>${ic('sword')} Challenge a friend</button>
    <p class="hint">A reading race: whoever reads more pages before time runs out takes the prize.</p>
    ${groups.invites.map(([d, v]) => `<section class="card duel invite"><small>INVITE · ${type(d)}</small>
      <div class="row">${avatar(person(v.other))}<div><b>${h(nameOf(v.other))} challenged you!</b></div></div>
      <div class="btns"><button class="btn primary sm" data-a="duelAccept" data-id="${d.id}">Accept</button>
      <button class="btn ghost sm" data-a="duelDecline" data-id="${d.id}">Decline</button></div></section>`).join('')}
    ${groups.done.map(([d, v]) => {
      const won = d.winner === S.me.id, tie = !d.winner;
      return `<section class="card duel ${won ? 'won' : ''}"><small>FINISHED · ${type(d)}</small>${versus(d, v)}
        <button class="btn ${won || tie ? 'gold' : 'ghost'} sm wide" data-a="duelClaim" data-id="${d.id}">
        ${won ? `You won! Claim ${d.prize} ${COIN}` : tie ? `Tie! Claim ${Math.floor(d.prize / 2)} ${COIN}` : `${h(nameOf(v.other))} won. Rematch later!`}</button></section>`;
    }).join('')}
    ${groups.active.map(([d, v]) => `<section class="card duel"><small>${type(d)} · ${v.daysLeft <= 1 ? 'ends tonight' : `${v.daysLeft} days left`}</small>${versus(d, v)}</section>`).join('')}
    ${groups.sent.map(([d, v]) => `<section class="card duel"><small>WAITING · ${type(d)}</small>
      <div class="row">${avatar(person(v.other))}<div><b>Waiting for ${h(nameOf(v.other))}</b></div>
      <button class="btn ghost sm" data-a="duelDecline" data-id="${d.id}">Cancel</button></div></section>`).join('')}
    ${Object.values(groups).every((g) => !g.length) ? `<p class="emptynote">${S.friends.length ? 'No duels yet. Pick a friend and start one.' : 'Add a friend first, then challenge them here.'}</p>` : ''}`;
}

function raidTab() {
  const r = raid();
  return `<section class="card raid ${r.dead ? 'dead' : ''}">
      <small>WEEKLY RAID · ${r.dead ? 'DEFEATED' : `${plural(r.daysLeft, 'day')} left`}</small>
      <img class="shadowbeast big" src="${r.dead ? RAID_DEAD_IMG : RAID_IMG}" alt="">
      <h2>${h(r.name)}</h2><p class="muted">${h(r.line)}</p>
      ${bar(r.left, r.hp, 'hp')}<p><b>${fmt(r.left)}</b> / ${fmt(r.hp)} HP</p>
      ${r.dead ? (r.claimed ? `<p class="tick">Reward claimed ${ic('check')}</p>`
        : r.mine > 0 ? `<button class="btn gold wide" data-a="raidClaim">Claim ${r.reward} ${COIN} + ${ic('snowflake', 'i-ice')} streak freeze</button>` : '<p class="muted">Read at least a page this week to share the loot.</p>')
        : '<p class="hint">Every page you and your friends read this week deals 1 damage. Beat it together before Monday.</p>'}
    </section>
    <h3 class="h">Damage dealt</h3>
    <section class="card list">${r.members.map((m, i) => `<div class="row"><span class="rank">${i + 1}</span>${avatar(m.p)}
      <div><b>${h(nameOf(m.p.id))}</b>${bar(m.pages, Math.max(1, r.members[0].pages))}</div><b>${fmt(m.pages)}</b></div>`).join('')}</section>`;
}

function arenaView() {
  const sub = S.sub.arena, b = badges();
  return `<header class="title"><h1>Arena</h1></header>
    <div class="seg">${[['battle', 'Battle'], ['duels', 'Duels'], ['raid', 'Raid']].map(([k, n]) =>
      `<button data-a="sub" data-tab="arena" data-sub="${k}" class="${sub === k ? 'on' : ''}">${n}${k === 'duels' && b.arena ? `<em>${b.arena}</em>` : ''}</button>`).join('')}</div>
    ${sub === 'battle' ? battleTab() : sub === 'duels' ? duelsTab() : raidTab()}`;
}

// ---------- friends ----------
function eventLine(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'read': return `read <b>${plural(d.pages, 'page')}</b> of <i>${h(d.title)}</i>`;
    case 'start': return `started reading <i>${h(d.title)}</i>`;
    case 'finish': return `finished <i>${h(d.title)}</i> ${ic('confetti', 'i-gold')}`;
    case 'hatch': return `hatched <b>${h(d.name)}</b> the ${stageName(d.element, 1)} ${ic('egg-crack', 'i-gold')}`;
    case 'evolve': return `<b>${h(d.name)}</b> evolved into ${stageName(d.element, d.stage)} ${ic('sparkle', 'i-gold')}`;
    case 'level': return `<b>${h(d.name)}</b> reached level ${d.level}`;
    case 'streak': return `is on a <b>${d.days}-day streak</b> ${ic('fire', 'i-fire')}`;
    case 'battle': return `beat <b>${h(d.foe)}</b> in battle ${ic('sword')}`;
    case 'egg': return `adopted a new ${ELEMENTS[d.element]?.name} egg ${ic('egg')}`;
    case 'fuse': return `bred a <b>${ELEMENTS[d.element]?.name}</b> egg from ${(d.parents || []).map((p) => ELEMENTS[p]?.name).join(' + ')} ${ic('dna')}`;
    default: return 'did something bookish';
  }
}

function feedTab() {
  if (!S.events.length) return '<p class="emptynote">Your feed is quiet. Log some reading or add friends to see what they’re up to.</p>';
  return `<section class="feed">${S.events.map((e) => {
    const n = S.cheers.filter((c) => c.event_id === e.id), mine = n.some((c) => c.user_id === S.me.id);
    return `<article class="card post"><button class="avbtn" ${openProfile(e.user_id)} aria-label="View ${h(nameOf(e.user_id))}’s profile">${avatar(person(e.user_id))}</button>
      <div><p>${['evolve', 'level'].includes(e.type) ? (e.user_id === S.me.id ? 'Your' : `${h(nameOf(e.user_id))}’s`) : `<b>${h(nameOf(e.user_id))}</b>`} ${eventLine(e)}</p><small>${timeAgo(e.created_at)}</small></div>
      <button class="cheer ${mine ? 'on' : ''}" data-a="cheer" data-id="${e.id}" aria-label="Cheer">${ic('hands-clapping')}${n.length ? ` <b>${n.length}</b>` : ''}</button>
    </article>`;
  }).join('')}</section>`;
}

function rankTab() {
  const rows = ranking();
  return `<p class="hint">Pages read since Monday. Resets every week.</p>
    <section class="card list">${rows.map((r, i) => `<button class="row ${r.p.id === S.me.id ? 'me' : ''}" ${openProfile(r.p.id)}>
      <span class="rank r${i + 1}">${['gold', 'silver', 'bronze'][i] ? ic('medal', `i-${['gold', 'silver', 'bronze'][i]}`) : i + 1}</span>${avatar(r.p)}
      <div><b>${h(nameOf(r.p.id))}</b><small>${ic('fire', 'i-fire')} ${r.p.id === S.me.id ? streak() : r.p.streak} day streak</small></div>
      <b class="num">${fmt(r.pages)}<small> pages</small></b></button>`).join('')}</section>
    ${rows.length < 2 ? '<p class="emptynote">Add friends to make this a real race.</p>' : ''}`;
}

function friendsTab() {
  return `<form data-form="addFriend" class="addfriend">
      <input id="fr-name" placeholder="Friend’s trainer name" autocapitalize="none" spellcheck="false" maxlength="16" required>
      <button class="btn primary">Add</button></form>
    <p class="hint">Your trainer name is <b>${h(S.me.username)}</b>. Share it so friends can add you.</p>
    ${S.incoming.length ? `<h3 class="h">Requests</h3><section class="card list">${S.incoming.map((f) => `<div class="row">${avatar(person(f.requester))}
      <div><b>${h(nameOf(f.requester))}</b><small>wants to be friends</small></div>
      <button class="btn primary sm" data-a="friendAccept" data-id="${f.id}">Accept</button>
      <button class="btn ghost sm" data-a="friendRemove" data-id="${f.id}" aria-label="Decline">${ic('x')}</button></div>`).join('')}</section>` : ''}
    ${S.friends.length ? `<h3 class="h">Friends</h3><section class="card list">${S.friends.map((f) => {
      const m = monsterOf(f), i = m && levelInfo(m.xp);
      return `<button class="row" data-a="sheet" data-s="friend" data-id="${f.id}">${avatar(f)}
        <div><b>${h(f.username)}</b><small>${m ? `${h(m.name)} · ${i.level ? `Lv ${i.level}` : 'Egg'}` : 'No monster yet'} · ${ic('fire', 'i-fire')} ${f.streak}</small></div><span class="chev">›</span></button>`;
    }).join('')}</section>` : ''}
    ${S.outgoing.length ? `<h3 class="h">Sent</h3><section class="card list">${S.outgoing.map((f) => `<div class="row">${avatar(person(f.addressee))}
      <div><b>${h(nameOf(f.addressee))}</b><small>request sent</small></div>
      <button class="btn ghost sm" data-a="friendRemove" data-id="${f.id}">Cancel</button></div>`).join('')}</section>` : ''}`;
}

function friendsView() {
  const sub = S.sub.friends, b = badges();
  return `<header class="title"><h1>Friends</h1></header>
    <div class="seg">${[['feed', 'Feed'], ['rank', 'Ranking'], ['list', 'Friends']].map(([k, n]) =>
      `<button data-a="sub" data-tab="friends" data-sub="${k}" class="${sub === k ? 'on' : ''}">${n}${k === 'list' && b.friends ? `<em>${b.friends}</em>` : ''}</button>`).join('')}</div>
    ${sub === 'feed' ? feedTab() : sub === 'rank' ? rankTab() : friendsTab()}`;
}

// ---------- trainer card (your profile and every friend's) ----------
/** data-attrs that open a player's trainer card: your own Me tab, or a friend's sheet. */
const openProfile = (id) => (id === S.me.id ? 'data-a="go" data-tab="me"' : `data-a="sheet" data-s="friend" data-id="${id}"`);

function trainerCard(p) {
  const t = trainer(p), mon = monsterOf(p), lg = league(p.trophies), me = p.id === S.me.id;
  const ach = me && achievements();
  const stats = [
    ['book-open', fmt(p.total_pages), 'pages read', '#5fb4ff'],
    ['books', fmt(p.books_done), 'books finished', '#58d68d'],
    ['egg', t.monsters.length, t.monsters.length === 1 ? 'monster' : 'monsters', '#b98cff'],
    ['fire', p.best_streak, 'best streak', '#ff8a3d'],
    ['sword', fmt(p.wins), 'battles won', '#ff5d6c'],
    ['trophy', fmt(p.trophies), 'trophies', '#ffc93c'],
  ];
  const team = [...t.monsters].sort((a, b) => b.xp - a.xp);
  return `<section class="tcard ${mon ? 'el-' + mon.element : ''}" style="--tc:${t.title.color}">
    <div class="tc-hero hab-${h(p.habitat || 'default')}">
      <span class="tc-streak">${ic('fire', 'i-fire')} <b>${me ? streak() : p.streak}</b></span>
      <span class="tc-league">${lgIc(lg)} ${lg.name}</span>
      <div class="tc-mon">${mon ? monImg(mon) : ic('egg')}</div>
      <span class="tc-lv" title="Trainer level"><small>LV</small><b>${t.level}</b></span>
    </div>
    <div class="tc-id">
      <h2>${h(p.username)}</h2>
      <span class="tc-title">${ic(t.title.icon)} ${t.title.name}</span>
    </div>
    <div class="tc-xp">
      <div><b>${ic('sparkle')} ${fmt(t.xp)} XP</b><small>${t.max ? 'Max level!' : `${fmt(t.need - t.cur)} XP to Lv ${t.level + 1}`}</small></div>
      ${bar(t.cur, t.need, 'tc-bar')}
    </div>
    <div class="tc-stats">${stats.map(([icon, n, label, c]) => `
      <div style="--c:${c}"><span>${ic(icon)}</span><b>${n}</b><small>${label}</small></div>`).join('')}</div>
    ${team.length ? `<div class="tc-team">${team.map((m) => {
      const lv = levelInfo(m.xp).level;
      return `<span class="el-${m.element}" title="${h(m.name)}">${monImg(m)}<small>${lv ? `Lv ${lv}` : 'Egg'}</small></span>`;
    }).join('')}</div>` : ''}
    ${me ? `<div class="tc-foot"><span>${ic('medal', 'i-gold')} <b>${ach.filter((a) => a.got).length}</b>/${ach.length} badges</span>
      <span>${COIN} <b>${fmt(S.me.coins)}</b> coins</span></div>` : ''}
  </section>`;
}

// ---------- me ----------
function heatmap() {
  const byDay = {};
  for (const l of S.logs) byDay[l.day] = (byDay[l.day] || 0) + l.pages;
  const end = today(), start = addDays(end, -(12 * 7 - 1) - ((new Date().getDay() + 6) % 7));
  let cells = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const p = byDay[d] || 0, lvl = p === 0 ? 0 : p < 10 ? 1 : p < 25 ? 2 : p < 50 ? 3 : 4;
    cells += `<i class="h${lvl}" title="${d}: ${p} pages"></i>`;
  }
  return `<div class="heat">${cells}</div>`;
}

// ---------- fusion (breeding hybrids) ----------
const HYBRIDS = Object.keys(ELEMENTS).filter((k) => ELEMENTS[k].parents);
const bestOf = (el) => S.monsters.filter((m) => m.element === el).sort((a, b) => b.xp - a.xp)[0];

function fusionCard(k) {
  const e = ELEMENTS[k], owned = S.monsters.some((m) => m.element === k), ready = fusable(S.monsters).includes(k);
  const parent = (p) => {
    const m = bestOf(p), lv = m ? levelInfo(m.xp).level : 0, done = m && levelInfo(m.xp).stage >= 3;
    return `<div class="fz-parent el-${p} ${done ? 'done' : ''}">
      <span class="fz-orb">${m ? monImg(m) : `<img src="${monsterImg(p, 3)}" alt="" class="silhouette">`}</span>
      <small>${m ? (done ? `${ic('check')} Ready` : `Lv ${lv} / ${EVOLVE_2}`) : `Need ${ELEMENTS[p].name}`}</small>${m && !done ? bar(lv, EVOLVE_2) : ''}</div>`;
  };
  return `<section class="fusion el-${k} ${ready ? 'ready' : ''} ${owned ? 'owned' : ''}">
    <div class="fz-row">${parent(e.parents[0])}<span class="fz-plus">+</span>${parent(e.parents[1])}<span class="fz-plus">=</span>
      <div class="fz-child"><span class="fz-orb"><img src="${monsterImg(k, 0)}" alt="" class="${owned || ready ? '' : 'silhouette'}"></span>
        <small>${owned || ready ? `${ic(e.icon)} ${e.name}` : '???'}</small></div></div>
    <p class="muted">${owned ? `You bred a ${e.name}! Your ${e.parents.map((p) => ELEMENTS[p].name).join(' and ')} stay on your team.`
      : `Raise ${e.parents.map((p) => ELEMENTS[p].name).join(' and ')} to their final form (Lv ${EVOLVE_2}) to breed a ${ready ? e.name : 'mystery'} egg. You keep both parents.`}</p>
    ${owned ? '' : `<button class="btn ${ready ? 'gold' : 'ghost'} wide" data-a="sheet" data-s="fuse" data-el="${k}" ${ready ? '' : 'disabled'}>${ready ? `${ic('dna')} Fuse!` : `${ic('lock')} Locked`}</button>`}
  </section>`;
}
// Fusions stay secret until you can do one; after that, bred hybrids stay listed.
function fusionSection() {
  const ready = fusable(S.monsters), shown = HYBRIDS.filter((k) => ready.includes(k) || S.monsters.some((m) => m.element === k));
  if (!shown.length) return '';
  return `<h3 class="h">${ic('dna')} Fusion</h3><section class="fusions">${shown.map(fusionCard).join('')}</section>`;
}
function fusionBanner() {
  const k = fusable(S.monsters)[0];
  if (!k) return '';
  const e = ELEMENTS[k];
  return `<button class="card fzbanner el-${k}" data-a="sheet" data-s="fuse" data-el="${k}">
    <span class="fz-orb"><img src="${monsterImg(k, 0)}" alt=""></span>
    <span><small>${ic('lightning')} A STORM IS BREWING</small><b>Your ${e.parents.map((p) => ELEMENTS[p].name).join(' and ')} can breed a new monster!</b></span></button>`;
}
function fuseSheet(s) {
  const e = ELEMENTS[s.el];
  return `<div class="fz-ritual el-${s.el}">
      ${e.parents.map((p, i) => `<img class="fz-p p${i}" src="${monsterImg(p, 3)}" alt="">`).join('')}
      <span class="fz-vortex"></span><img class="fz-egg" src="${monsterImg(s.el, 0)}" alt=""></div>
    <h2>${ic(e.icon)} ${e.name} egg</h2>
    <p class="muted">${e.blurb} ${e.perk.name}: ${perkText(s.el)} Strong against ${e.beats.map((b) => ELEMENTS[b].name).join(' & ')}.</p>
    <form data-form="fuse" class="stack"><input id="fz-name" placeholder="Name your new monster" maxlength="20" required>
      <button class="btn gold big wide">${ic('dna')} Fuse ${e.parents.map((p) => ELEMENTS[p].name).join(' + ')}</button></form>`;
}

function dex() {
  return `<div class="dex">${Object.keys(ELEMENTS).map((el) => {
    const best = Math.max(-1, ...S.monsters.filter((m) => m.element === el).map((m) => levelInfo(m.xp).stage));
    return [0, 1, 2, 3].map((st) => `<div class="${st <= best ? 'got' : ''} el-${el}">
      <img src="${monsterImg(el, st)}" alt=""><small>${st <= best ? stageName(el, st) : '???'}</small></div>`).join('');
  }).join('')}</div>`;
}

function meView() {
  const ach = achievements();
  return `<header class="title"><h1>Profile</h1><div>${S.admin ? `<button class="btn ghost sm" data-a="sheet" data-s="admin">${ic('shield-check')} Admin</button> ` : ''}<button class="btn ghost sm" data-a="sheet" data-s="settings">${ic('gear')} Settings</button></div></header>
    ${trainerCard(S.me)}
    <button class="btn gold wide" data-a="go" data-tab="shop">${ic('shopping-cart')} Shop · ${fmt(S.me.coins)} ${COIN}</button>
    <h3 class="h">Last 12 weeks</h3><section class="card">${heatmap()}</section>
    ${fusionSection()}
    <h3 class="h">Pagedex</h3><section class="card">${dex()}</section>
    <h3 class="h">Badges <small>${ach.filter((a) => a.got).length} / ${ach.length}</small></h3>
    <section class="badges">${ach.map((a) => `<div class="${a.got ? 'got' : ''}"><span>${ic(a.icon)}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('')}</section>`;
}

// ---------- sheets ----------
function logSheet(s) {
  const reading = S.books.filter((b) => b.status === 'reading');
  const b = S.books.find((x) => x.id === s.id) || reading[0];
  if (!b) return `<h2>Log reading</h2><p class="muted">Add a book first, then log the pages you read.</p>
    <button class="btn primary wide" data-a="sheet" data-s="addbook">＋ Add a book</button>`;
  const mon = active(), left = pagesLeftToday();
  if (!left) return `<h2>Log reading</h2><p class="muted">You already read ${DAILY_PAGE_LIMIT} pages today, the daily limit. Come back tomorrow!</p>`;
  const max = Math.min(b.total_pages, b.current_page + left);
  return `<h2>Log reading</h2>
    ${reading.length > 1 ? `<div class="chips">${reading.map((x) => `<button class="${x.id === b.id ? 'on' : ''}" data-a="sheet" data-s="log" data-id="${x.id}">${h(x.title)}</button>`).join('')}</div>` : ''}
    <div class="row">${cover(b, 'sm')}<div><b>${h(b.title)}</b><small>You were on page ${b.current_page} of ${b.total_pages}</small></div></div>
    <label for="lg-page">What page are you on now?</label>
    <div class="stepper"><button data-a="bump" data-n="-1" aria-label="Minus one">−</button>
      <input id="lg-page" type="number" inputmode="numeric" min="${b.current_page}" max="${max}" value="${b.current_page}" data-from="${b.current_page}" data-max="${max}">
      <button data-a="bump" data-n="1" aria-label="Plus one">＋</button></div>
    <div class="chips center">${[5, 10, 25, 50].map((n) => `<button data-a="bump" data-n="${n}">+${n}</button>`).join('')}
      ${max === b.total_pages ? '<button data-a="bump" data-n="99999">Finished!</button>' : ''}</div>
    <p class="gain" id="lg-gain">Tap + to add the pages you read</p>
    <p class="hint">Daily limit: ${DAILY_PAGE_LIMIT} pages · ${plural(left, 'page')} left today</p>
    <button class="btn primary big wide" data-a="saveLog" data-id="${b.id}">Feed ${h(mon.name)}</button>`;
}

function addBookSheet(s) {
  const d = s.draft || {};
  return `<h2>Add a book</h2>
    <form data-form="searchBook" class="addfriend"><input id="bk-q" type="search" placeholder="Search title or author" value="${h(s.q || '')}">
      <button class="btn primary">${s.searching ? '…' : 'Search'}</button></form>
    ${s.results ? (s.results.length ? `<div class="results">${s.results.map((r, i) => `
      <button class="row" data-a="pickResult" data-i="${i}">${cover(r, 'sm')}<div><b>${h(r.title)}</b><small>${h(r.author)}${r.total_pages ? ` · ${r.total_pages} p.` : ''}</small></div></button>`).join('')}</div>`
      : '<p class="muted">Nothing found. Type the details in below.</p>') : ''}
    <form data-form="addBook" class="stack">
      <label for="bk-title">Title</label><input id="bk-title" value="${h(d.title || '')}" maxlength="200" required>
      <label for="bk-author">Author</label><input id="bk-author" value="${h(d.author || '')}" maxlength="120">
      <label for="bk-pages">Number of pages</label><input id="bk-pages" type="number" inputmode="numeric" min="1" max="20000" value="${d.total_pages || ''}" required>
      <label for="bk-start">Already started? Page you are on <small>(optional)</small></label><input id="bk-start" type="number" inputmode="numeric" min="0" placeholder="0">
      <div class="btns"><button class="btn primary" name="shelf" value="reading">Start reading</button>
      <button class="btn ghost" name="shelf" value="wishlist">Add to wishlist</button></div>
    </form>`;
}

function bookSheet(s) {
  const b = S.books.find((x) => x.id === s.id);
  if (!b) return '';
  return `<div class="bookhead">${cover(b)}<div><h2>${h(b.title)}</h2><p class="muted">${h(b.author)}</p>
      <p>${b.status === 'finished' ? `Finished · ${b.total_pages} pages` : `Page ${b.current_page} of ${b.total_pages}`}</p>${bar(b.current_page, b.total_pages)}</div></div>
    ${b.status === 'reading' ? `<button class="btn primary wide" data-a="sheet" data-s="log" data-id="${b.id}">${ic('book-open')} Log reading</button>` : ''}
    ${b.status === 'wishlist' ? `<button class="btn primary wide" data-a="startBook" data-id="${b.id}">Start reading</button>` : ''}
    ${b.status === 'finished' ? `<p class="center">Your rating</p><div class="rate">${[1, 2, 3, 4, 5].map((n) =>
      `<button data-a="rate" data-id="${b.id}" data-n="${n}" class="${n <= (b.rating || 0) ? 'on' : ''}" aria-label="${n} stars">${ic('star')}</button>`).join('')}</div>` : ''}
    <button class="btn danger wide" data-a="deleteBook" data-id="${b.id}">${s.confirm ? 'Tap again to delete' : 'Remove book'}</button>`;
}

function friendSheet(s) {
  const f = S.people[s.id];
  if (!f) return '';
  const m = monsterOf(f), i = m && levelInfo(m.xp);
  const ship = S.ships.find((x) => x.requester === f.id || x.addressee === f.id);
  const isFriend = S.friends.some((x) => x.id === f.id);
  return `${trainerCard(f)}
    <p class="hint">This week: <b>${fmt(weekPages(f.id))}</b> pages (you: ${fmt(weekPages(S.me.id))})</p>
    ${s.books?.length ? `<h3 class="h">Reading now</h3>${s.books.map((b) => `<div class="row">${cover(b, 'sm')}<div><b>${h(b.title)}</b><small>${h(b.author)} · ${Math.round(pct(b.current_page, b.total_pages))}%</small></div></div>`).join('')}` : ''}
    ${isFriend ? `<div class="btns"><button class="btn primary" data-a="fight" data-id="${f.id}" ${i?.level && S.me.energy > 0 && levelInfo(active().xp).level && !foughtToday(f.id) ? '' : 'disabled'}>${ic('sword')} ${foughtToday(f.id) ? 'Battled today' : 'Battle'}</button>
      <button class="btn gold" data-a="sheet" data-s="newduel" data-id="${f.id}">${ic('flag-checkered')} Duel</button></div>
    <button class="btn danger wide" data-a="friendRemove" data-id="${ship?.id}" data-confirm="1">${s.confirm ? 'Tap again to remove' : 'Remove friend'}</button>` : ''}`;
}

function newDuelSheet(s) {
  const fid = s.id || S.friends[0]?.id, days = s.days || 3;
  return `<h2>Reading duel</h2><p class="muted">Most pages read before the deadline wins the prize.</p>
    <label>Opponent</label><div class="chips">${S.friends.map((f) => `<button class="${f.id === fid ? 'on' : ''}" data-a="duelPick" data-id="${f.id}">${h(f.username)}</button>`).join('')}</div>
    <label>Length</label><div class="options">${Object.values(DUEL_TYPES).map((t) => `
      <button class="${t.days === days ? 'on' : ''}" data-a="duelPick" data-days="${t.days}"><b>${t.name}</b><small>${plural(t.days, 'day')}</small><span>${t.prize} ${COIN}</span></button>`).join('')}</div>
    <button class="btn primary big wide" data-a="duelSend" data-id="${fid}" data-days="${days}">Send challenge</button>`;
}

// ---------- shop ----------
// The catalog. To add an item, add an entry to a category's items(); to add a
// category, add an object here. Each item: { name, desc, art, price, action, attrs, status }
// status: '' (buyable), 'full', 'owned', 'on' (owned and in use), 'done' (daily limit reached). Buying is handled by A.buy in app.js.
const SHOP = [
  {
    id: 'boosts', name: 'Boosts', icon: 'lightning', blurb: 'A helping hand for busy reading days.',
    items: () => [
      { name: 'Streak freeze', desc: `Saves your streak if you miss a day. You have ${S.me.freezes}/2.`, art: `<span class="sart">${ic('snowflake', 'i-ice')}</span>`,
        price: 60, action: 'buy', attrs: 'data-item="freeze"', status: S.me.freezes >= 2 ? 'full' : '' },
      { name: 'Energy drink', desc: `Refills battle energy to full (${S.me.energy}/${MAX_ENERGY} now). One per day.`, art: `<img src="assets/energy.webp" alt="">`,
        price: 40, action: 'buy', attrs: 'data-item="energy"', status: daily().refills >= 1 ? 'done' : S.me.energy >= MAX_ENERGY ? 'full' : '' },
    ],
  },
  {
    id: 'monsters', name: 'Monsters', icon: 'egg', blurb: 'Hatch a new partner. Switch between them any time.', empty: 'You have every monster. Nice collection!',
    items: () => STARTERS.filter((e) => !S.monsters.some((m) => m.element === e)).map((e) => (
      { name: `${ELEMENTS[e].name} egg`, desc: `${ELEMENTS[e].perk.name}: ${perkText(e)}`, art: `<img src="${monsterImg(e, 0)}" alt="">`, artCls: `el-${e}`,
        price: 300, action: 'sheet', attrs: `data-s="egg" data-el="${e}"`, status: '' }))
      .concat(fusable(S.monsters).map((k) => {
        const e = ELEMENTS[k];
        return { name: `${e.name} egg`, desc: `Can't be bought. Breed it from your ${e.parents.map((p) => ELEMENTS[p].name).join(' + ')}.`,
          art: `<img src="${monsterImg(k, 0)}" alt="">`, artCls: `el-${k}`, action: 'sheet', attrs: `data-s="fuse" data-el="${k}"`, status: 'fuse' };
      })),
  },
  {
    id: 'habitats', name: 'Habitats', icon: 'tree-evergreen', blurb: 'Backdrops for your monster at home and in battle.',
    items: () => Object.entries(HABITATS).map(([k, hb]) => {
      const owned = k === 'default' || (S.me.state.habitats || []).includes(k), mon = active();
      return { name: hb.name, desc: hb.desc,
        art: monImg(mon), artCls: `hab hab-${k} el-${mon.element}`,
        price: hb.price, action: owned ? 'setHabitat' : 'buy', attrs: `data-item="habitat" data-id="${k}"`,
        status: S.me.habitat === k ? 'on' : owned ? 'owned' : '' };
    }),
  },
];

function shopItem(it) {
  const label = { full: 'Full', on: 'In use', owned: 'Use', fuse: `${ic('dna')} Fuse`, locked: `${ic('lock')} Locked`, done: 'Tomorrow' }[it.status] || `${it.price} ${COIN}`;
  const off = ['full', 'on', 'locked', 'done'].includes(it.status) || (!it.status && it.price > S.me.coins);
  return `<div class="sitem ${it.status}">
    <div class="sitem-art ${it.artCls || ''}">${it.art}</div>
    <b>${h(it.name)}</b><small>${h(it.desc)}</small>
    <button class="btn ${it.status === 'owned' ? 'primary' : 'gold'} sm" data-a="${it.action}" ${it.attrs} ${off ? 'disabled' : ''}>${label}</button>
  </div>`;
}

function shopView() {
  const cur = S.sub.shop || 'all';
  const tabs = [{ id: 'all', name: 'All', icon: 'shopping-bag' }, ...SHOP].map((c) =>
    `<button class="${cur === c.id ? 'on' : ''}" data-a="sub" data-tab="shop" data-sub="${c.id}">${ic(c.icon)} ${c.name}</button>`).join('');
  const cats = SHOP.filter((c) => cur === 'all' || c.id === cur).map((c) => {
    const items = c.items();
    return `<section class="scat"><h3 class="h">${ic(c.icon)} ${c.name}</h3><p class="muted scat-blurb">${c.blurb}</p>
      ${items.length ? `<div class="sgrid">${items.map(shopItem).join('')}</div>` : `<p class="card empty"><small>${c.empty || 'Nothing here yet.'}</small></p>`}</section>`;
  }).join('');
  return `<header class="title shophead">
      <button class="back" data-a="go" data-tab="home" aria-label="Back to home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h1>Shop</h1><span class="stat">${COIN} <b>${fmt(S.me.coins)}</b></span></header>
    <nav class="shoptabs" aria-label="Shop categories">${tabs}</nav>${cats}`;
}

function eggSheet(s) {
  const e = ELEMENTS[s.el];
  return `<div class="friendhead el-${s.el}"><img src="${monsterImg(s.el, 0)}" alt=""><h2>${e.name} egg</h2><p>${e.blurb}</p></div>
    <form data-form="buyEgg" class="stack"><input id="egg-name" placeholder="Name your new monster" maxlength="20" required>
    <button class="btn gold big wide">Adopt for 300 ${COIN}</button></form>`;
}

function settingsSheet(s) {
  const mon = active();
  return `<h2>Settings</h2>
    <label>Daily page goal</label>
    <div class="chips">${[10, 20, 30, 50, 75].map((n) => `<button class="${S.me.daily_goal === n ? 'on' : ''}" data-a="setGoal" data-n="${n}">${n}</button>`).join('')}</div>
    ${['music', 'sfx'].map((k) => `<label>${k === 'music' ? 'Music' : 'Sound effects'}</label>
    <div class="chips">${[['1', 'On'], ['0', 'Off']].map(([v, n]) => `<button class="${prefs[k] === (v === '1') ? 'on' : ''}" data-a="sound" data-k="${k}" data-on="${v}">${n}</button>`).join('')}</div>`).join('')}
    <form data-form="rename" class="stack"><label for="rn">Rename ${h(mon.name)}</label>
      <div class="addfriend"><input id="rn" value="${h(mon.name)}" maxlength="20" required><button class="btn primary">Save</button></div></form>
    <p class="hint">${db.online ? `Signed in as <b>${h(S.me.username)}</b>.` : 'Demo mode: progress is saved on this device only.'}</p>
    <button class="btn ghost wide" data-a="logout">Log out</button>`;
}

const FLAG_TEXT = {
  over_50: (f) => `read <b>${f.pages}</b> pages`,
  over_limit: (f) => `tried to log <b>${f.pages}</b> pages (blocked)`,
  wrong_day: (f) => `tried to log ${f.pages} pages on another date (blocked)`,
  xp_jump: (f) => `monster XP jumped by <b>${fmt(f.pages)}</b> at once (edited by hand?)`,
  pages_jump: (f) => `page count jumped by <b>${fmt(f.pages)}</b> at once (edited by hand?)`,
  banned: () => 'was banned',
};
const when = (f) => new Date(f.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function banButton(s, id, name) {
  if (!id || id === S.me.id) return '';
  return s.confirm === id
    ? `<button class="btn ban sm" data-a="ban" data-id="${id}">Delete ${h(name)}?</button>`
    : `<button class="btn ghost sm" data-a="ban" data-id="${id}">Ban</button>`;
}

function adminSheet(s) {
  if (!s.flags) return `<h2>${ic('shield-check')} Admin</h2><p class="muted">Loading…</p>`;
  const flagRows = s.flags.map((f) => `<div class="row"><div><b>${h(f.username)}</b>
      <small>${(FLAG_TEXT[f.kind] || (() => h(f.kind)))(f)}${f.times > 1 ? ` · ${f.times}×` : ''} · ${f.day ? h(f.day) : when(f)}</small></div>
      ${f.kind === 'banned' ? '' : banButton(s, f.user_id, f.username)}
      <button class="btn ghost sm" data-a="dismissFlag" data-id="${f.id}" aria-label="Dismiss">${ic('x')}</button></div>`).join('');
  const players = s.players.map((p) => `<div class="row">${avatar(p)}<div><b>${h(p.username)}</b>
      <small>today ${fmt(s.today[p.id] || 0)} · this week ${fmt(s.week[p.id] || 0)} · total ${fmt(p.total_pages)} pages</small></div>
      ${banButton(s, p.id, p.username)}</div>`).join('');
  return `<h2>${ic('shield-check')} Admin</h2>
    <p class="muted">Banning deletes the account and everything in it. It can’t be undone.</p>
    <h3 class="h">Suspicious activity</h3>
    ${s.flags.length ? `<section class="card list">${flagRows}</section>` : `<p class="emptynote">Nothing suspicious. ${ic('thumbs-up')}</p>`}
    <h3 class="h">All trainers <small>${s.players.length}</small></h3>
    <section class="card list">${players}</section>`;
}

const SHEETS = { log: logSheet, addbook: addBookSheet, book: bookSheet, friend: friendSheet, newduel: newDuelSheet, egg: eggSheet, settings: settingsSheet, fuse: fuseSheet, admin: adminSheet };

// ---------- overlays ----------
function partyView(p) {
  const el = p.element && ELEMENTS[p.element];
  let art = '', title = '', text = '';
  if (p.type === 'hatch') {
    art = `<div class="morph"><img class="from" src="${monsterImg(p.element, 0)}" alt=""><img class="to" src="${monsterImg(p.element, 1)}" alt=""></div>`;
    title = 'It hatched!'; text = `Say hi to <b>${h(p.name)}</b> the ${el.stages[1]}.`;
  } else if (p.type === 'evolve') {
    art = `<div class="morph"><img class="from" src="${monsterImg(p.element, p.stage - 1)}" alt=""><img class="to" src="${monsterImg(p.element, p.stage)}" alt=""></div>`;
    title = 'Evolution!'; text = `<b>${h(p.name)}</b> evolved into <b>${el.stages[p.stage]}</b>.`;
  } else if (p.type === 'level') {
    art = `<div class="burst"><img src="${monsterImg(p.element, p.stage)}" alt=""><span>Lv ${p.level}</span></div>`;
    title = 'Level up!'; text = `<b>${h(p.name)}</b> is now level ${p.level}. Stronger in battle.`;
  } else if (p.type === 'fuse') {
    art = `<div class="fz-ritual big el-${p.element}">${p.parents.map((x, i) => `<img class="fz-p p${i}" src="${monsterImg(x, 3)}" alt="">`).join('')}
      <span class="fz-vortex"></span><img class="fz-egg" src="${monsterImg(p.element, 0)}" alt=""></div>`;
    title = 'Fusion!'; text = `${p.parents.map((x) => ELEMENTS[x].name).join(' and ')} made a <b>${el.stages[0]}</b>. Read ${HATCH_PAGES} pages to hatch <b>${h(p.name)}</b>!`;
  } else if (p.type === 'finish') {
    art = `<div class="bigemoji">${ic('book', 'i-book')}</div>`;
    title = 'Book finished!'; text = `<i>${h(p.title)}</i> is done. Bonus: +${p.xp} XP and +${p.coins} ${COIN}.`;
  }
  return `<div class="party el-${p.element || 'fire'}"><div class="confetti">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 7) * 0.12}s;--c:${i % 5}"></i>`).join('')}</div>
    ${art}<h1>${title}</h1><p>${text}</p><button class="btn primary big" data-a="partyNext">Continue</button></div>`;
}

function battleView(b) {
  const side = (f, who) => `<div class="b-side ${who} ${b.anim?.[who] || ''}">
      <div class="b-card"><b>${h(f.name)}</b> <small>Lv ${f.level} ${elIc(f.element)}</small>${f.burn ? `<span class="burnbadge" title="Burning">${ic('fire')} ${f.burn.turns}</span>` : ''}${f.shock ? `<span class="burnbadge shockbadge" title="Electrocuted">${ic('lightning')} shocked</span>` : ''}${f.poison ? `<span class="burnbadge poisonbadge" title="Poisoned">${ic('flask')} ${f.poison.turns}</span>` : ''}${f.guard && f.immune ? `<span class="burnbadge stonebadge" title="Stoneskin">${ic('mountains')} stone</span>` : ''}${bar(f.hp, f.maxHp, 'hp')}<small>${f.hp} / ${f.maxHp}</small></div>
      <div class="b-mon"><img src="${monsterImg(f.element, f.stage)}" alt="">${b.pop?.[who] ? `<span class="pop ${b.pop[who].cls}">${b.pop[who].text}</span>` : ''}</div></div>`;
  const moves = Object.entries(MOVES).map(([k, m]) => {
    const cd = k === 'blast' ? b.me.cd : 0;
    const label = k === 'blast' ? ELEMENTS[b.me.element].blast : m.name;
    const p = ELEMENTS[b.me.element].perk;
    const desc = k === 'blast' ? (p.burnTurns ? 'Big hit + burn' : p.cooldown ? 'Big hit, fast recharge' : p.shockTurns ? 'Big hit + shock' : p.poisonTurns ? 'Big hit + poison' : m.desc)
      : k === 'guard' && b.me.guardRun ? `Heal ${Math.round(guardFactor(b.me) * 100)}% (tired)`
      : k === 'guard' && p.immuneGuard ? 'Block ALL + big heal'
      : k === 'guard' && p.healMult ? 'Block + big heal' : m.desc;
    return `<button class="move ${k}" data-a="move" data-m="${k}" ${b.busy || cd ? 'disabled' : ''}><span>${ic(m.icon)}</span><b>${label}</b><small>${cd ? `Ready in ${cd}` : desc}</small></button>`;
  }).join('');
  const over = b.over && `<div class="b-over ${b.over.won ? 'won' : ''}"><h1>${b.over.won ? 'Victory!' : 'Defeated'}</h1>
      <p>${b.over.won ? `+${b.over.coins} ${COIN} · +${b.over.trophies} ${ic('trophy', 'i-gold')}` : `${b.over.coins ? `+${b.over.coins} ${COIN} · ` : ''}${b.over.trophies ? `${b.over.trophies} ${ic('trophy', 'i-gold')} · ` : ''}Read more pages to grow stronger.`}</p>
      <button class="btn primary big" data-a="battleEnd">Continue</button></div>`;
  return `<div class="battle hab-${S.me.habitat} el-${b.me.element}">
    <button class="b-flee" data-a="battleFlee" ${b.over ? 'hidden' : ''}>Flee</button>
    ${side(b.foe, 'foe')}${side(b.me, 'me')}
    <p class="b-log">${h(b.log)}</p>
    ${over || `<div class="b-moves">${moves}</div>`}</div>`;
}

// ---------- root ----------
export function view() {
  if (!S.ready) return '<main class="splash"><img src="assets/icons/icon-192.png" alt=""><p>Waking the monsters…</p></main>';
  if (!S.me) return authView();
  if (!S.monsters.length) return starterView();
  if (active()) document.body.dataset.el = active().element;
  const b = badges();
  const screen = { home: homeView, library: libraryView, arena: arenaView, friends: friendsView, me: meView, shop: shopView }[S.tab]();
  const nav = [['home', 'Home'], ['library', 'Library'], ['arena', 'Arena'], ['friends', 'Friends'], ['me', 'Me']].map(([k, n]) =>
    `<button data-a="go" data-tab="${k}" class="${S.tab === k ? 'on' : ''}" ${S.tab === k ? 'aria-current="page"' : ''}>${ic(NAV_ICONS[k])}<span>${n}</span>${b[k] ? `<em>${b[k]}</em>` : ''}</button>`).join('');
  return `<main class="screen" id="screen">${screen}</main><nav class="nav">${nav}</nav>
    ${S.sheet ? `<div class="scrim" data-a="closeSheet"></div><section class="sheet" role="dialog"><button class="grab" data-a="closeSheet" aria-label="Close"></button>${SHEETS[S.sheet.s](S.sheet)}</section>` : ''}
    ${S.battle ? battleView(S.battle) : ''}${S.party.length && !S.battle ? partyView(S.party[0]) : ''}`;
}
