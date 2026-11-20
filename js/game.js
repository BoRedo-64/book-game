// Pure game rules: elements, levels, dates, battles, quests, achievements.

export const ELEMENTS = {
  fire: {
    name: 'Fire', icon: 'fire', beats: ['plant'], blast: 'Flame Burst',
    stages: ['Ember Egg', 'Cindling', 'Blazekin', 'Infernox'],
    blurb: 'Hot-headed and fearless. Burns through chapters.',
    perk: { name: 'Scorch', burnTurns: 2, burnPct: 0.1 }, // blast sets the foe on fire
  },
  water: {
    name: 'Water', icon: 'drop', beats: ['fire'], blast: 'Tidal Crash',
    stages: ['Tide Egg', 'Dribblet', 'Surgefin', 'Maelstrom'],
    blurb: 'Calm and clever. Goes with the flow of a good story.',
    perk: { name: 'Quick Current', cooldown: 1 }, // blast recharges faster
  },
  plant: {
    name: 'Plant', icon: 'leaf', beats: ['water'], blast: 'Petal Storm',
    stages: ['Sprout Egg', 'Leaflet', 'Bloomane', 'Eldergrove'],
    blurb: 'Patient and loyal. Grows a little with every page.',
    perk: { name: 'Regrowth', healMult: 1.75 }, // guard heals more
  },
  // ---- Hybrids: bred from two final-stage parents (see fusable), +0.5% HP/ATK per level on top of normal
  // growth. Each beats whatever its parents beat, and they form a cycle: rock > tornado > poison > rock.
  tornado: {
    name: 'Tornado', icon: 'tornado', beats: ['fire', 'plant', 'poison'], blast: 'Cyclone Fury', starter: false, parents: ['fire', 'water'],
    stages: ['Gale Egg', 'Whirlet', 'Cyclonyx', 'Tempestor'],
    blurb: 'Born where fire meets water. Restless as a page-turner.',
    perk: { name: 'Electrocute', shockTurns: 1, missChance: 0.4 }, // blast makes the foe's attacks miss
    statBonus: 0.005,
  },
  rock: {
    name: 'Rock', icon: 'mountains', beats: ['fire', 'water', 'tornado'], blast: 'Rockslide', starter: false, parents: ['water', 'plant'],
    stages: ['Boulder Egg', 'Pebblit', 'Cragmaw', 'Titanstone'],
    blurb: 'Where water wears down roots, stone is born. Slow, steady, unbreakable.',
    perk: { name: 'Stoneskin', immuneGuard: true, healMult: 3 }, // first Guard in a row blocks ALL damage, big heal
    statBonus: 0.005,
  },
  poison: {
    name: 'Poison', icon: 'flask', beats: ['plant', 'water', 'rock'], blast: 'Toxic Spores', starter: false, parents: ['fire', 'plant'],
    stages: ['Spore Egg', 'Sporeling', 'Toxicap', 'Blightshroom'],
    blurb: 'Grown in the ashes of a burnt forest. Its spores linger long after the hit.',
    perk: { name: 'Venom', poisonTurns: 2, poisonPct: 0.04 }, // blast poisons the foe (% of its max HP per turn)
    statBonus: 0.005,
  },
};
/** Hybrids `me` can breed right now: both parents owned at their final stage and no hybrid yet. */
export function fusable(monsters) {
  return Object.entries(ELEMENTS).filter(([k, e]) => e.parents && !monsters.some((m) => m.element === k)
    && e.parents.every((p) => monsters.some((m) => m.element === p && levelInfo(m.xp).stage >= 3))).map(([k]) => k);
}
export const RARE_WILD_CHANCE = 1 / 50; // chance a wild battle is a rare hybrid (any of them)
export const RARE_WILD_CHANCE_HYBRID = 1 / 4; // ...when your own fighter is a hybrid (rare monsters attract each other)
export const isHybrid = (el) => !!ELEMENTS[el].parents;
export const rareChance = (myEl) => (isHybrid(myEl) ? RARE_WILD_CHANCE_HYBRID : RARE_WILD_CHANCE);
/** Families you can pick at the start, buy as eggs and meet in the wild. */
export const STARTERS = Object.keys(ELEMENTS).filter((k) => ELEMENTS[k].starter !== false);

export const HATCH_PAGES = 30;
export const DAILY_PAGE_LIMIT = 100; // anything above this in one day is treated as cheating (also enforced by the database)
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

// ---------- trainer level ----------
// Separate from monster levels: built from the XP of every monster the trainer owns.
export const TRAINER_MAX = 99;
const trainerNeed = (level) => 60 + 30 * level; // XP to go from trainer `level` to `level + 1`
export const TITLES = [
  { min: 45, name: 'Living Legend', icon: 'crown', color: '#ff6bd6' },
  { min: 30, name: 'Grand Sage', icon: 'shooting-star', color: '#b98cff' },
  { min: 20, name: 'Lore Keeper', icon: 'bank', color: '#5fd4ff' },
  { min: 15, name: 'Scholar', icon: 'graduation-cap', color: '#58d68d' },
  { min: 10, name: 'Bookworm', icon: 'books', color: '#ffc93c' },
  { min: 6, name: 'Chapter Chaser', icon: 'book-open', color: '#ff9a4a' },
  { min: 3, name: 'Page Turner', icon: 'book', color: '#e0b48a' },
  { min: 1, name: 'Fresh Bookmark', icon: 'file-text', color: '#c9c2ec' },
];
export function trainerLevel(xp) {
  let x = xp, level = 1;
  while (level < TRAINER_MAX && x >= trainerNeed(level)) { x -= trainerNeed(level); level++; }
  const max = level >= TRAINER_MAX;
  return { level, xp, cur: max ? 1 : x, need: max ? 1 : trainerNeed(level), max, title: TITLES.find((t) => level >= t.min) };
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
  const boost = 1 + (ELEMENTS[mon.element].statBonus || 0) * level;
  const hp = Math.round((50 + level * 14) * boost);
  return { name: mon.name, element: mon.element, level, stage, maxHp: hp, hp, atk: Math.round((8 + level * 3) * boost), cd: 0, guard: false, guardRun: 0, burn: null, poison: null, shock: null, immune: false, ...extra };
}

export function elementMult(a, b) {
  if (ELEMENTS[a].beats.includes(b)) return 1.5;
  if (ELEMENTS[b].beats.includes(a)) return 0.7;
  return 1;
}

export const MOVES = {
  strike: { name: 'Strike', icon: 'sword', desc: 'Reliable hit' },
  blast: { name: 'Blast', icon: 'sparkle', desc: 'Big elemental hit' },
  guard: { name: 'Guard', icon: 'shield', desc: 'Block most damage and heal' },
};
const BASE_COOLDOWN = 2, BASE_HEAL = 0.12;
export const blastCooldown = (el) => ELEMENTS[el].perk.cooldown ?? BASE_COOLDOWN;
export const guardHeal = (el) => BASE_HEAL * (ELEMENTS[el].perk.healMult ?? 1);

// Tuned with a battle simulator. Starter perks are worth about the same (~58% vs an identical
// monster with no perk); hybrid perks are stronger and level with each other (~69-73%).

/** Plain-language description of each family's battle perk. */
export function perkText(el, withMove = true) {
  const p = ELEMENTS[el].perk, mv = withMove ? `${ELEMENTS[el].blast} ` : '';
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  if (p.burnTurns) return cap(`${mv}burns the foe for ${p.burnTurns} turns, even through Guard.`);
  if (p.cooldown) return cap(`${mv}recharges in ${p.cooldown} turn instead of ${BASE_COOLDOWN}.`);
  if (p.shockTurns) return cap(`${mv}electrocutes the foe: ${Math.round(p.missChance * 100)}% chance its next ${p.shockTurns > 1 ? `${p.shockTurns} attacks miss` : 'attack misses'}.`);
  if (p.poisonTurns) return cap(`${mv}poisons the foe for ${p.poisonTurns} turns (${Math.round(p.poisonPct * 100)}% of its max HP each turn), even through Guard.`);
  if (p.immuneGuard) return `Your first Guard in a row blocks 100% of the damage and heals ${Math.round(guardHeal(el) * 100)}% of max HP.`;
  if (p.healMult) return `Guard heals ${Math.round((p.healMult - 1) * 100)}% more (${Math.round(guardHeal(el) * 100)}% of max HP).`;
  return '';
}

/** Heal multiplier for a's next Guard: 1, then ½, ¼… for each Guard in a row. */
export const guardFactor = (a) => 0.5 ** (a.guardRun || 0);

/** Damage-over-time at the start of a's turn (burn, poison). Returns { total, burn, poison }. */
export function dotTick(a) {
  const out = { total: 0, burn: 0, poison: 0 };
  for (const k of ['burn', 'poison']) {
    if (!a[k] || a.hp <= 0) continue;
    const dmg = Math.min(a.hp, a[k].dmg);
    a.hp -= dmg; out[k] = dmg; out.total += dmg;
    if (--a[k].turns <= 0) a[k] = null;
  }
  return out;
}

export function applyMove(a, b, move) {
  a.guard = false;
  if (a.cd > 0) a.cd--;
  if (move === 'guard') {
    if (a.shock && --a.shock.turns <= 0) a.shock = null;
    // Each Guard in a row heals half as much as the last, so guarding forever can't stall a fight.
    const tired = guardFactor(a);
    a.guardRun = (a.guardRun || 0) + 1;
    const heal = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * guardHeal(a.element) * tired));
    a.hp += heal; a.guard = true;
    a.immune = !!ELEMENTS[a.element].perk.immuneGuard && tired === 1; // Stoneskin: only a fresh Guard is unbreakable
    return { move, heal, dmg: 0, text: `${a.name} ${a.immune ? 'turns to stone' : 'braces'} and recovers ${heal} HP.${tired < 1 ? ' (tiring…)' : ''}` };
  }
  a.guardRun = 0;
  const shocked = a.shock;
  if (shocked && --a.shock.turns <= 0) a.shock = null;
  if (shocked && Math.random() < shocked.miss) { // a missed blast stays charged
    return { move, dmg: 0, miss: true, text: `${a.name} is shocked and misses!` };
  }
  let dmg = a.atk * (0.85 + Math.random() * 0.3);
  let mult = 1;
  if (move === 'blast') { mult = elementMult(a.element, b.element); dmg *= 1.6 * mult; a.cd = blastCooldown(a.element); }
  const crit = Math.random() < 0.12;
  if (crit) dmg *= 1.5;
  const immune = b.guard && b.immune;
  if (b.guard) dmg *= 0.35;
  dmg = immune ? 0 : Math.max(1, Math.round(dmg));
  b.hp = Math.max(0, b.hp - dmg);
  const name = move === 'blast' ? ELEMENTS[a.element].blast : 'Strike';
  let text = `${a.name} used ${name}! −${dmg}`;
  if (crit) text += ' Critical hit!';
  if (move === 'blast' && mult > 1) text += " It's super effective!";
  if (move === 'blast' && mult < 1) text += ' Not very effective…';
  if (immune) text = `${a.name} used ${name}… but ${b.name}'s Stoneskin blocks everything!`;
  else if (b.guard) text += ' (blocked)';
  const perk = ELEMENTS[a.element].perk;
  if (move === 'blast' && perk.burnTurns && b.hp > 0) {
    b.burn = { turns: perk.burnTurns, dmg: Math.max(1, Math.round(a.atk * perk.burnPct)) };
    text += ` ${b.name} is burning!`;
  }
  if (move === 'blast' && perk.poisonTurns && b.hp > 0) {
    b.poison = { turns: perk.poisonTurns, dmg: Math.max(1, Math.round(b.maxHp * perk.poisonPct)) };
    text += ` ${b.name} is poisoned!`;
  }
  if (move === 'blast' && perk.shockTurns && b.hp > 0) {
    b.shock = { turns: perk.shockTurns, miss: perk.missChance };
    text += ` ${b.name} is electrocuted!`;
  }
  return { move, dmg, crit, mult, text, blocked: immune };
}
export function aiMove(a, b) {
  if (a.cd === 0 && Math.random() < 0.65) return 'blast';
  if (a.hp < a.maxHp * 0.35 && Math.random() < 0.4) return 'guard';
  return Math.random() < 0.12 ? 'guard' : 'strike';
}

export const LEAGUES = [
  { min: 600, name: 'Mythic', icon: 'crown', tint: 'mythic' },
  { min: 300, name: 'Gold', icon: 'medal', tint: 'gold' },
  { min: 150, name: 'Silver', icon: 'medal', tint: 'silver' },
  { min: 50, name: 'Bronze', icon: 'medal', tint: 'bronze' },
  { min: 0, name: 'Paper', icon: 'scroll', tint: 'paper' },
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
  { id: 'hatch', icon: 'egg-crack', name: 'Hello, world', desc: 'Hatch your first egg', test: (c) => c.maxLevel >= 1 },
  { id: 'evo1', icon: 'lightning', name: 'Growing up', desc: 'Reach the first evolution', test: (c) => c.maxLevel >= EVOLVE_1 },
  { id: 'evo2', icon: 'shooting-star', name: 'Final form', desc: 'Reach the last evolution', test: (c) => c.maxLevel >= EVOLVE_2 },
  { id: 'p100', icon: 'file-text', name: 'Page turner', desc: 'Read 100 pages', test: (c) => c.pages >= 100 },
  { id: 'p1000', icon: 'books', name: 'Bookworm', desc: 'Read 1,000 pages', test: (c) => c.pages >= 1000 },
  { id: 'p5000', icon: 'bank', name: 'Living library', desc: 'Read 5,000 pages', test: (c) => c.pages >= 5000 },
  { id: 'b1', icon: 'check-circle', name: 'The end', desc: 'Finish a book', test: (c) => c.books >= 1 },
  { id: 'b5', icon: 'graduation-cap', name: 'Well read', desc: 'Finish 5 books', test: (c) => c.books >= 5 },
  { id: 's7', icon: 'fire', name: 'On fire', desc: '7-day streak', test: (c) => c.bestStreak >= 7 },
  { id: 's30', icon: 'meteor', name: 'Unstoppable', desc: '30-day streak', test: (c) => c.bestStreak >= 30 },
  { id: 'w1', icon: 'boxing-glove', name: 'First blood', desc: 'Win a battle', test: (c) => c.wins >= 1 },
  { id: 'w25', icon: 'trophy', name: 'Champion', desc: 'Win 25 battles', test: (c) => c.wins >= 25 },
  { id: 'f3', icon: 'handshake', name: 'Book club', desc: 'Have 3 friends', test: (c) => c.friends >= 3 },
  { id: 'col', icon: 'egg', name: 'Collector', desc: 'Raise all three elements', test: (c) => c.elements >= 3 },
  { id: 'all', icon: 'crown', name: 'Monster master', desc: 'Raise every monster to its final form', test: (c) => c.allFinal },
];
