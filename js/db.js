// Data layer. Same tiny API on top of two backends:
//  - Supabase (online, when js/config.js is filled in)
//  - localStorage (demo mode, with practice bots as friends)
//
// where-objects: { col: value } equals, { col: [a, b] } any of, { col: { gte, lte } } ranges.
import { CONFIG } from './config.js';
import { dayStr, addDays, xpForLevel } from './game.js';

const online = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
const hasEmptyList = (where) => Object.values(where).some((v) => Array.isArray(v) && !v.length);

function supabaseBackend() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  const ok = ({ data, error }) => {
    if (error) throw new Error(friendly(error.message));
    return data;
  };
  const friendly = (msg) =>
    /anonymous sign-?ins are disabled/i.test(msg)
      ? 'Setup needed: enable “Anonymous sign-ins” in Supabase → Authentication → Sign In / Providers.'
      : /failed to fetch|networkerror/i.test(msg) ? 'No connection. Check your internet and try again.' : msg;
  const filter = (q, where) => {
    for (const [k, v] of Object.entries(where)) {
      if (Array.isArray(v)) q = q.in(k, v);
      else if (v && typeof v === 'object') {
        if (v.gte !== undefined) q = q.gte(k, v.gte);
        if (v.lte !== undefined) q = q.lte(k, v.lte);
      } else q = q.eq(k, v);
    }
    return q;
  };
  const connect = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) ok(await sb.auth.signInAnonymously());
  };
  return {
    online: true,
    async init() {
      const { data } = await sb.auth.getSession();
      return data.session ? ok(await sb.rpc('my_pid')) : null;
    },
    async register(username, password) {
      await connect();
      return ok(await sb.rpc('register', { p_username: username, p_password: password }));
    },
    async login(username, password) {
      await connect();
      const id = ok(await sb.rpc('login', { p_username: username, p_password: password }));
      if (!id) throw new Error('Wrong trainer name or password.');
      return id;
    },
    async logout() { ok(await sb.rpc('logout')); },
    async select(table, where = {}, { order, asc = false, limit } = {}) {
      if (hasEmptyList(where)) return [];
      let q = filter(sb.from(table).select('*'), where);
      if (order) q = q.order(order, { ascending: asc });
      if (limit) q = q.limit(limit);
      return ok(await q);
    },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, where) { ok(await filter(sb.from(table).delete(), where)); },
  };
}

const PROFILE_DEFAULTS = {
  coins: 50, energy: 3, streak: 0, best_streak: 0, last_read: null, freezes: 0, trophies: 0, wins: 0,
  total_pages: 0, books_done: 0, daily_goal: 20, active_monster: null, habitat: 'default', state: {},
};
const ROW_DEFAULTS = {
  monsters: { xp: 0 },
  books: { author: '', cover_url: null, current_page: 0, status: 'reading', rating: null, finished_at: null },
  friendships: { status: 'pending' },
  events: { data: {} },
  duels: { status: 'pending', start_day: null, end_day: null, winner: null, claimed_c: false, claimed_o: false },
};

function localBackend() {
  const KEY = 'pagelings-demo-v1';
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { /* corrupt or blocked */ }
  data ||= { tables: {}, accounts: {}, session: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full/blocked */ } };
  const T = (t) => (data.tables[t] ||= []);
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const match = (row, where) => Object.entries(where).every(([k, v]) => {
    if (Array.isArray(v)) return v.includes(row[k]);
    if (v && typeof v === 'object') return (v.gte === undefined || row[k] >= v.gte) && (v.lte === undefined || row[k] <= v.lte);
    return row[k] === v;
  });
  const add = (table, row) => {
    const full = { id: uuid(), created_at: now(), ...(ROW_DEFAULTS[table] || {}), ...row };
    T(table).push(full);
    return full;
  };
  const copy = (x) => JSON.parse(JSON.stringify(x));

  function seedBots(me) {
    const today = dayStr();
    const bots = [
      { username: 'luna_reads', element: 'water', mon: 'Ripple', level: 12, streak: 9, book: ['The Hobbit', 'J.R.R. Tolkien', 310, 142], week: [18, 25, 12, 30, 22, 15, 20], friend: 'accepted' },
      { username: 'atlas', element: 'fire', mon: 'Scorch', level: 5, streak: 3, book: ['Dune', 'Frank Herbert', 612, 88], week: [10, 0, 14, 8, 0, 12, 9], friend: 'accepted' },
      { username: 'mossy', element: 'plant', mon: 'Fern', level: 31, streak: 41, book: ['Project Hail Mary', 'Andy Weir', 476, 301], week: [40, 35, 28, 45, 30, 38, 33], friend: 'pending' },
    ];
    for (const b of bots) {
      let p = T('profiles').find((x) => x.username === b.username);
      if (!p) {
        p = add('profiles', { ...PROFILE_DEFAULTS, username: b.username, streak: b.streak, best_streak: b.streak, last_read: today,
          total_pages: xpForLevel(b.level) + 40, books_done: Math.floor(b.level / 4), trophies: b.level * 9, wins: b.level });
        const m = add('monsters', { owner: p.id, element: b.element, name: b.mon, xp: xpForLevel(b.level) + 5 });
        p.active_monster = m.id;
        const book = add('books', { owner: p.id, title: b.book[0], author: b.book[1], total_pages: b.book[2], current_page: b.book[3] });
        b.week.forEach((pages, i) => { if (pages) add('logs', { user_id: p.id, book_id: book.id, pages, day: addDays(today, -i) }); });
        add('events', { user_id: p.id, type: 'read', data: { pages: b.week[0], title: b.book[0] }, created_at: new Date(Date.now() - 3600e3 * (1 + bots.indexOf(b) * 3)).toISOString() });
        if (b.level >= 10) add('events', { user_id: p.id, type: 'evolve', data: { name: b.mon, element: b.element, stage: b.level >= 30 ? 3 : 2 }, created_at: new Date(Date.now() - 86400e3 * 2).toISOString() });
      }
      add('friendships', { requester: p.id, addressee: me, status: b.friend });
    }
    const luna = T('profiles').find((x) => x.username === 'luna_reads');
    add('duels', { challenger: luna.id, opponent: me, days: 3, prize: 50 });
  }

  return {
    online: false,
    async init() { return data.session; },
    async register(username, password) {
      if (!/^[a-z0-9_]{3,16}$/.test(username)) throw new Error('Trainer names are 3–16 characters: letters, numbers and _ only.');
      if (password.length < 6) throw new Error('Password needs at least 6 characters.');
      if (T('profiles').some((p) => p.username === username)) throw new Error('That trainer name is taken.');
      const p = add('profiles', { ...PROFILE_DEFAULTS, username });
      data.accounts[username] = { id: p.id, password };
      data.session = p.id;
      seedBots(p.id);
      save();
      return p.id;
    },
    async login(username, password) {
      const acc = data.accounts[username];
      if (!acc || acc.password !== password) throw new Error('Wrong trainer name or password.');
      data.session = acc.id; save();
      return acc.id;
    },
    async logout() { data.session = null; save(); },
    async select(table, where = {}, { order, asc = false, limit } = {}) {
      let rows = T(table).filter((r) => match(r, where));
      if (order) rows.sort((a, b) => (a[order] < b[order] ? -1 : a[order] > b[order] ? 1 : 0) * (asc ? 1 : -1));
      if (limit) rows = rows.slice(0, limit);
      return copy(rows);
    },
    async insert(table, row) { const r = add(table, row); save(); return copy(r); },
    async update(table, id, patch) {
      const r = T(table).find((x) => x.id === id);
      if (!r) throw new Error('Not found');
      Object.assign(r, copy(patch)); save();
      return copy(r);
    },
    async remove(table, where) {
      data.tables[table] = T(table).filter((r) => !match(r, where)); save();
    },
  };
}

export const db = online ? supabaseBackend() : localBackend();
