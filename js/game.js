// Pure game rules: elements, levels, dates, battles, quests, achievements.

export const ELEMENTS = {
  fire: {
    name: 'Fire', emoji: '🔥', beats: 'plant', blast: 'Flame Burst',
    stages: ['Ember Egg', 'Cindling', 'Blazekin', 'Infernox'],
    blurb: 'Hot-headed and fearless. Burns through chapters.',
    perk: { name: 'Scorch', burnTurns: 2, burnPct: 0.1 }, // blast sets the foe on fire
  },
  water: {
    name: 'Water', emoji: '💧', beats: 'fire', blast: 'Tidal Crash',
    stages: ['Tide Egg', 'Dribblet', 'Surgefin', 'Maelstrom'],
    blurb: 'Calm and clever. Goes with the flow of a good story.',
    perk: { name: 'Quick Current', cooldown: 1 }, // blast recharges faster
  },
  plant: {
    name: 'Plant', emoji: '🌿', beats: 'water', blast: 'Petal Storm',
    stages: ['Sprout Egg', 'Leaflet', 'Bloomane', 'Eldergrove'],
    blurb: 'Patient and loyal. Grows a little with every page.',
    perk: { name: 'Regrowth', healMult: 1.75 }, // guard heals more
  },
};

export const HATCH_PAGES = 30;
export const EVOLVE_1 = 10;
export const EVOLVE_2 = 30;
export const MAX_LEVEL = 60;
export const MAX_ENERGY = 5;
export const PAGES_PER_ENERGY = 10;

const need = (level) => 20 + 5 * level; // pages to go from `level` to `level + 1`

export function levelInfo(xp) {
  if (xp < HATCH_PAGES) return { level: 0, stage: 0, cur: xp, need: HATCH_PAGES };
  let x = xp - HATCH_PAGES, level = 1;
  while (level < MAX_LEVEL && x >= need(level)) { x -= need(level); level++; }
  const stage = level >= EVOLVE_2 ? 3 : level >= EVOLVE_1 ? 2 : 1;
  return { level, stage, cur: x, need: need(level) };
}

export function xpForLevel(level) {
  let xp = HATCH_PAGES;
  for (let l = 1; l < level; l++) xp += need(l);
  return xp;
}

export const stageName = (element, stage) => ELEMENTS[element].stages[stage];
export const monsterImg = (element, stage) => `assets/monsters/${element}-${stage}.webp`;

// ---------- dates (local time, YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); };
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const weekStart = (s = dayStr()) => addDays(s, -((parseDay(s).getDay() + 6) % 7)); // Monday

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- streak ----------
export function liveStreak(me, today = dayStr()) {
  if (!me.last_read) return 0;
  const gap = diffDays(me.last_read, today);
  if (gap <= 1) return me.streak;
  return gap - 1 <= me.freezes ? me.streak : 0;
}

// Returns the profile fields to change when the player reads today.
export function streakAfterReading(me, today = dayStr()) {
  if (me.last_read === today) return {};
  let streak = 1, freezes = me.freezes;
  if (me.last_read) {
    const gap = diffDays(me.last_read, today);
    if (gap === 1) streak = me.streak + 1;
    else if (gap > 1 && gap - 1 <= freezes) { freezes -= gap - 1; streak = me.streak + 1; }
  }
  return { streak, freezes, last_read: today, best_streak: Math.max(me.best_streak || 0, streak) };
}

export const streakBonus = (streak) => (streak >= 30 ? 1.2 : streak >= 7 ? 1.1 : 1);

// ---------- battle ----------
export function fighter(mon, extra = {}) {
  const { level, stage } = levelInfo(mon.xp);
  const hp = 50 + level * 14;
  return { name: mon.name, element: mon.element, level, stage, maxHp: hp, hp, atk: 8 + level * 3, cd: 0, guard: false, burn: null, ...extra };
}

export function elementMult(a, b) {
  if (ELEMENTS[a].beats === b) return 1.5;
  if (ELEMENTS[b].beats === a) return 0.7;
  return 1;
}

export const MOVES = {
  strike: { name: 'Strike', icon: '⚔️', desc: 'Reliable hit' },
  blast: { name: 'Blast', icon: '✨', desc: 'Big elemental hit' },
  guard: { name: 'Guard', icon: '🛡️', desc: 'Block most damage and heal' },
};
const BASE_COOLDOWN = 2, BASE_HEAL = 0.12;
export const blastCooldown = (el) => ELEMENTS[el].perk.cooldown ?? BASE_COOLDOWN;
export const guardHeal = (el) => BASE_HEAL * (ELEMENTS[el].perk.healMult ?? 1);

// Tuned with a battle simulator so each family wins ~50% across all match-ups
// and each perk is worth about the same (~58% vs an identical monster with no perk).

/** Plain-language description of each family's battle perk. */
export function perkText(el) {
  const p = ELEMENTS[el].perk;
  if (p.burnTurns) return `${ELEMENTS[el].blast} burns the foe for ${p.burnTurns} turns, even through Guard.`;
  if (p.cooldown) return `${ELEMENTS[el].blast} recharges in ${p.cooldown} turn instead of ${BASE_COOLDOWN}.`;
  if (p.healMult) return `Guard heals ${Math.round((p.healMult - 1) * 100)}% more (${Math.round(guardHeal(el) * 100)}% of max HP).`;
  return '';
}

/** Burn damage at the start of a's turn. Returns the damage dealt (0 if not burning). */
export function burnTick(a) {
  if (!a.burn) return 0;
  const dmg = Math.min(a.hp, a.burn.dmg);
  a.hp -= dmg;
  if (--a.burn.turns <= 0) a.burn = null;
  return dmg;
}

export function applyMove(a, b, move) {
  a.guard = false;
  if (a.cd > 0) a.cd--;
  if (move === 'guard') {
    const heal = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * guardHeal(a.element)));
    a.hp += heal; a.guard = true;
    return { move, heal, dmg: 0, text: `${a.name} braces and recovers ${heal} HP.` };
  }
  let dmg = a.atk * (0.85 + Math.random() * 0.3);
  let mult = 1;
  if (move === 'blast') { mult = elementMult(a.element, b.element); dmg *= 1.6 * mult; a.cd = blastCooldown(a.element); }
  const crit = Math.random() < 0.12;
  if (crit) dmg *= 1.5;
  if (b.guard) dmg *= 0.35;
  dmg = Math.max(1, Math.round(dmg));
  b.hp = Math.max(0, b.hp - dmg);
  const name = move === 'blast' ? ELEMENTS[a.element].blast : 'Strike';
  let text = `${a.name} used ${name}! −${dmg}`;
  if (crit) text += ' Critical hit!';
  if (move === 'blast' && mult > 1) text += " It's super effective!";
  if (move === 'blast' && mult < 1) text += ' Not very effective…';
  if (b.guard) text += ' (blocked)';
  const perk = ELEMENTS[a.element].perk;
  if (move === 'blast' && perk.burnTurns && b.hp > 0) {
    b.burn = { turns: perk.burnTurns, dmg: Math.max(1, Math.round(a.atk * perk.burnPct)) };
    text += ` ${b.name} is burning!`;
  }
  return { move, dmg, crit, mult, text };
}
export function aiMove(a, b) {
  if (a.cd === 0 && Math.random() < 0.65) return 'blast';
  if (a.hp < a.maxHp * 0.35 && Math.random() < 0.4) return 'guard';
  return Math.random() < 0.12 ? 'guard' : 'strike';
}

export const LEAGUES = [
  { min: 600, name: 'Mythic', icon: '👑' },
  { min: 300, name: 'Gold', icon: '🥇' },
  { min: 150, name: 'Silver', icon: '🥈' },
  { min: 50, name: 'Bronze', icon: '🥉' },
  { min: 0, name: 'Paper', icon: '📜' },
];
export const league = (trophies) => LEAGUES.find((l) => trophies >= l.min);

// ---------- weekly raid ----------
export const BOSSES = [
  { name: 'The Procrastinator', element: 'fire', line: 'It whispers: “just one more episode…”' },
  { name: 'Scroll Wraith', element: 'water', line: 'It feeds on endless feeds.' },
  { name: 'Dust Golem', element: 'plant', line: 'Born from books nobody opened.' },
  { name: 'Spoiler Hydra', element: 'fire', line: 'Cut off one ending, two more leak out.' },
  { name: 'The Slumber Wyrm', element: 'water', line: 'Makes eyelids heavy on page two.' },
];
export function raidFor(week, members) {
  const n = Math.floor(parseDay(week).getTime() / 604800000);
  return { ...BOSSES[n % BOSSES.length], hp: 100 * members, reward: 60 };
}

// ---------- misc ----------
export function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
  return x >>> 0;
}

export const HABITATS = {
  default: { name: 'Home Turf', price: 0, desc: 'Where every monster starts.' },
  library: { name: 'Starlit Library', price: 120, desc: 'Late-night reading under the stars.' },
  sunset: { name: 'Sunset Peaks', price: 120, desc: 'Golden hour on the mountaintops.' },
  crystal: { name: 'Crystal Cave', price: 180, desc: 'Glowing gems deep underground.' },
  clouds: { name: 'Cloud Kingdom', price: 180, desc: 'A sky castle above the clouds.' },
};

export const DUEL_TYPES = {
  1: { name: 'Sprint', days: 1, prize: 20 },
  3: { name: 'Clash', days: 3, prize: 50 },
  7: { name: 'Marathon', days: 7, prize: 120 },
};

export const ACHIEVEMENTS = [
  { id: 'hatch', icon: '🐣', name: 'Hello, world', desc: 'Hatch your first egg', test: (c) => c.maxLevel >= 1 },
  { id: 'evo1', icon: '⚡', name: 'Growing up', desc: 'Reach the first evolution', test: (c) => c.maxLevel >= EVOLVE_1 },
  { id: 'evo2', icon: '🌟', name: 'Final form', desc: 'Reach the last evolution', test: (c) => c.maxLevel >= EVOLVE_2 },
  { id: 'p100', icon: '📄', name: 'Page turner', desc: 'Read 100 pages', test: (c) => c.pages >= 100 },
  { id: 'p1000', icon: '📚', name: 'Bookworm', desc: 'Read 1,000 pages', test: (c) => c.pages >= 1000 },
  { id: 'p5000', icon: '🏛️', name: 'Living library', desc: 'Read 5,000 pages', test: (c) => c.pages >= 5000 },
  { id: 'b1', icon: '✅', name: 'The end', desc: 'Finish a book', test: (c) => c.books >= 1 },
  { id: 'b5', icon: '🎓', name: 'Well read', desc: 'Finish 5 books', test: (c) => c.books >= 5 },
  { id: 's7', icon: '🔥', name: 'On fire', desc: '7-day streak', test: (c) => c.bestStreak >= 7 },
  { id: 's30', icon: '☄️', name: 'Unstoppable', desc: '30-day streak', test: (c) => c.bestStreak >= 30 },
  { id: 'w1', icon: '🥊', name: 'First blood', desc: 'Win a battle', test: (c) => c.wins >= 1 },
  { id: 'w25', icon: '🏆', name: 'Champion', desc: 'Win 25 battles', test: (c) => c.wins >= 25 },
  { id: 'f3', icon: '🤝', name: 'Book club', desc: 'Have 3 friends', test: (c) => c.friends >= 3 },
  { id: 'col', icon: '🥚', name: 'Collector', desc: 'Raise all three elements', test: (c) => c.elements >= 3 },
];
