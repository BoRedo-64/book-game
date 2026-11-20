// Shared app state + values derived from it.
import { db } from './db.js';
import {
  dayStr, addDays, diffDays, weekStart, levelInfo, hash, raidFor, liveStreak, ACHIEVEMENTS, ELEMENTS, DAILY_PAGE_LIMIT, trainerLevel,
} from './game.js';

export const S = {
  ready: false,
  me: null, monsters: [], books: [], logs: [],
  friends: [], incoming: [], outgoing: [], ships: [], fmon: {}, flogs: [],
  events: [], cheers: [], duels: [], battles: [], people: {},
  tab: 'home', sub: { library: 'reading', arena: 'battle', friends: 'feed', shop: 'all' },
  sheet: null, profile: null, battle: null, party: [], busy: false, admin: false,
  auth: { mode: 'signup', error: '', name: '' }, starter: { element: null, name: '' },
};

export const today = () => dayStr();
export const active = () => S.monsters.find((m) => m.id === S.me.active_monster) || S.monsters[0];
export const person = (id) => (id === S.me.id ? S.me : S.people[id]);
export const nameOf = (id) => (id === S.me.id ? 'You' : person(id)?.username || 'Someone');
export const monsterOf = (profile) =>
  profile.id === S.me.id ? active() : S.fmon[profile.active_monster] || Object.values(S.fmon).find((m) => m.owner === profile.id);

/** Every monster a player owns (yours, or a friend's from the loaded friend monsters). */
export const monstersOf = (profile) =>
  profile.id === S.me.id ? S.monsters : Object.values(S.fmon).filter((m) => m.owner === profile.id);
/** Trainer level, built from the total XP of all the player's monsters. */
export function trainer(profile) {
  const monsters = monstersOf(profile);
  return { ...trainerLevel(monsters.reduce((n, m) => n + m.xp, 0)), monsters };
}

export function pagesBetween(uid, from, to = '9999') {
  const logs = uid === S.me.id ? S.logs : S.flogs;
  let n = 0;
  for (const l of logs) if (l.user_id === uid && l.day >= from && l.day <= to) n += l.pages;
  return n;
}
export const pagesToday = () => pagesBetween(S.me.id, today(), today());
export const pagesLeftToday = () => Math.max(0, DAILY_PAGE_LIMIT - pagesToday());
export const weekPages = (uid) => pagesBetween(uid, weekStart());
export const streak = () => liveStreak(S.me);

export const foughtToday = (id) => (daily().fought || []).includes(id);

export function daily() {
  const d = S.me.state.daily;
  return d && d.day === today() ? d : { day: today(), wins: 0, cheers: 0, claimed: [], fought: [], refills: 0 };
}

export function quests() {
  const d = daily(), seed = hash(today() + S.me.id), pt = pagesToday(), goal = S.me.daily_goal;
  const [n, reward] = [[10, 15], [25, 25], [40, 40]][seed % 3];
  const sessions = S.logs.filter((l) => l.day === today()).length;
  const pool = [
    { id: 'goal', text: `Hit your daily goal (${goal} pages)`, cur: Math.min(pt, goal), max: goal, reward: 20 },
    { id: 'win', text: 'Win a battle', cur: Math.min(1, d.wins), max: 1, reward: 20 },
    { id: 'cheer', text: 'Cheer a friend in the feed', cur: Math.min(1, d.cheers), max: 1, reward: 10 },
    { id: 'twice', text: 'Read in two separate sessions', cur: Math.min(2, sessions), max: 2, reward: 15 },
  ];
  const i = (seed >>> 3) % pool.length;
  return [
    { id: 'read', text: `Read ${n} pages today`, cur: Math.min(pt, n), max: n, reward },
    pool[i], pool[(i + 1) % pool.length],
  ].map((q) => ({ ...q, done: q.cur >= q.max, claimed: d.claimed.includes(q.id) }));
}

export function raid() {
  const week = weekStart();
  const members = [S.me, ...S.friends].map((p) => ({ p, pages: weekPages(p.id) })).sort((a, b) => b.pages - a.pages);
  const boss = raidFor(week, members.length);
  const dmg = members.reduce((n, m) => n + m.pages, 0);
  return {
    ...boss, week, members, dmg, left: Math.max(0, boss.hp - dmg), dead: dmg >= boss.hp,
    mine: weekPages(S.me.id), claimed: S.me.state.raid === week,
    daysLeft: 7 - ((new Date().getDay() + 6) % 7),
  };
}

export function ranking() {
  return [S.me, ...S.friends].map((p) => ({ p, pages: weekPages(p.id) })).sort((a, b) => b.pages - a.pages);
}

export function achievements() {
  const ctx = {
    maxLevel: Math.max(0, ...S.monsters.map((m) => levelInfo(m.xp).level)),
    pages: S.me.total_pages, books: S.me.books_done, bestStreak: S.me.best_streak, wins: S.me.wins,
    friends: S.friends.length, elements: new Set(S.monsters.map((m) => m.element)).size,
    // every family (hybrids included) owned at its final stage
    allFinal: Object.keys(ELEMENTS).every((el) => S.monsters.some((m) => m.element === el && levelInfo(m.xp).stage >= 3)),
  };
  return ACHIEVEMENTS.map((a) => ({ ...a, got: a.test(ctx) }));
}

export function duelView(d) {
  const mine = d.challenger === S.me.id;
  const other = mine ? d.opponent : d.challenger;
  const end = d.end_day || today();
  const my = d.start_day ? pagesBetween(S.me.id, d.start_day, end) : 0;
  const their = d.start_day ? pagesBetween(other, d.start_day, end) : 0;
  return {
    mine, other, my, their,
    claimed: mine ? d.claimed_c : d.claimed_o,
    daysLeft: d.end_day ? Math.max(0, diffDays(today(), d.end_day) + 1) : d.days,
  };
}

export const badges = () => ({
  arena: S.duels.filter((d) => (d.status === 'pending' && d.opponent === S.me.id) || (d.status === 'done' && !duelView(d).claimed)).length,
  friends: S.incoming.length,
  home: quests().filter((q) => q.done && !q.claimed).length,
});

// ---------- loading ----------
export async function loadAll(pid) {
  const [me] = await db.select('profiles', { id: pid });
  if (!me) { await db.logout(); S.me = null; return; }
  me.state ||= {};
  S.me = me;
  const adminCheck = db.isAdmin().catch(() => false);
  const since = addDays(today(), -90);
  const [monsters, books, logs, shipsA, shipsB, duelsA, duelsB, atk, def] = await Promise.all([
    db.select('monsters', { owner: pid }, { order: 'created_at', asc: true }),
    db.select('books', { owner: pid }, { order: 'created_at' }),
    db.select('logs', { user_id: pid, day: { gte: since } }),
    db.select('friendships', { requester: pid }),
    db.select('friendships', { addressee: pid }),
    db.select('duels', { challenger: pid }, { order: 'created_at', limit: 30 }),
    db.select('duels', { opponent: pid }, { order: 'created_at', limit: 30 }),
    db.select('battles', { attacker: pid }, { order: 'created_at', limit: 10 }),
    db.select('battles', { defender: pid }, { order: 'created_at', limit: 10 }),
  ]);
  Object.assign(S, { monsters, books, logs, admin: await adminCheck });
  S.ships = [...shipsA, ...shipsB];
  S.duels = [...duelsA, ...duelsB].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  S.battles = [...atk, ...def].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 12);

  const otherOf = (f) => (f.requester === pid ? f.addressee : f.requester);
  const friendIds = S.ships.filter((f) => f.status === 'accepted').map(otherOf);
  const ids = [...new Set([...S.ships.map(otherOf), ...S.duels.map((d) => (d.challenger === pid ? d.opponent : d.challenger)),
    ...S.battles.flatMap((b) => [b.attacker, b.defender]).filter((x) => x && x !== pid)])];
  const duelStart = S.duels.filter((d) => d.start_day && (d.status === 'active' || !duelView(d).claimed)).map((d) => d.start_day);
  const logsFrom = [weekStart(), ...duelStart].sort()[0];
  const [profiles, fmons, flogs, events] = await Promise.all([
    db.select('profiles', { id: ids }),
    db.select('monsters', { owner: ids }),
    db.select('logs', { user_id: ids, day: { gte: logsFrom } }),
    db.select('events', { user_id: [pid, ...friendIds] }, { order: 'created_at', limit: 40 }),
  ]);
  S.people = Object.fromEntries(profiles.map((p) => [p.id, p]));
  S.friends = friendIds.map((id) => S.people[id]).filter(Boolean);
  S.incoming = S.ships.filter((f) => f.status === 'pending' && f.addressee === pid && S.people[f.requester]);
  S.outgoing = S.ships.filter((f) => f.status === 'pending' && f.requester === pid && S.people[f.addressee]);
  S.fmon = Object.fromEntries(fmons.map((m) => [m.id, m]));
  S.flogs = flogs;
  S.events = events;
  S.cheers = await db.select('cheers', { event_id: events.map((e) => e.id) });

  // Close duels whose last day has passed.
  for (const d of S.duels) {
    if (d.status !== 'active' || today() <= d.end_day) continue;
    const v = duelView(d);
    const winner = v.my === v.their ? null : v.my > v.their ? pid : v.other;
    Object.assign(d, await db.update('duels', d.id, { status: 'done', winner }));
  }
}
