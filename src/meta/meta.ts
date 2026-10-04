import { HEROES } from '../game/heroes.js';
import type { RunResult } from '../game/types.js';
import { clearSave, mirrorSave } from '../native.js';

// ---------- профиль ----------

export interface Quest {
  id: string;
  text: string;
  goal: number;
  prog: number;
  done: boolean;
  claimed: boolean;
}

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  quality: number;
  numbers: boolean;
}

export interface Profile {
  v: 3;
  credits: number;
  cores: number;
  earned: number;
  heroes: Record<string, { lvl: number; talents: number[] }>;
  hero: string;
  level: number;
  tier: number;
  won: boolean[][];
  codex: { implants: string[]; protos: string[]; enemies: Record<string, number> };
  quests: { day: number; list: Quest[] };
  pass: { xp: number; claimed: number[]; claimedP: number[] };
  life: { runs: number; kills: number; wins: number; bosses: number; time: number };
  settings: Settings;
  vip: boolean;
}

export const SAVE_KEY = 'neonhex3d.save.v1';
const five = <T>(f: () => T) => [0, 1, 2, 3, 4].map(f);

export function freshProfile(): Profile {
  return {
    v: 3,
    credits: 0,
    cores: 0,
    earned: 0,
    heroes: { volt: { lvl: 1, talents: [-1, -1, -1, -1, -1] } },
    hero: 'volt',
    level: 0,
    tier: 0,
    won: five(() => [false, false, false]),
    codex: { implants: [], protos: [], enemies: {} },
    quests: { day: 0, list: [] },
    pass: { xp: 0, claimed: [], claimedP: [] },
    life: { runs: 0, kills: 0, wins: 0, bosses: 0, time: 0 },
    settings: { music: 0.6, sfx: 0.8, haptics: true, quality: 1, numbers: true },
    vip: false,
  };
}

function normalize(raw: Partial<Profile>): Profile {
  const b = freshProfile();
  const p = { ...b, ...raw, settings: { ...b.settings, ...raw.settings }, life: { ...b.life, ...raw.life }, pass: { ...b.pass, ...raw.pass }, codex: { ...b.codex, ...raw.codex } } as Profile;
  if (!p.heroes?.volt) p.heroes = { ...b.heroes, ...p.heroes };
  if (!Array.isArray(p.won) || p.won.length !== 5) p.won = b.won;
  return p;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? normalize(JSON.parse(raw)) : freshProfile();
  } catch {
    return freshProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    const json = JSON.stringify(p);
    localStorage.setItem(SAVE_KEY, json);
    mirrorSave(SAVE_KEY, json);
  } catch {
    // приватный режим — играем без сохранений
  }
}

export function resetProfile() {
  try {
    localStorage.removeItem(SAVE_KEY);
    clearSave(SAVE_KEY);
  } catch {
    // ignore
  }
  return freshProfile();
}

// ---------- экономика ----------
// Деньги копятся медленно: прокачка героя — дорогая, а VIP позже просто ускорит доход.

export const TIER_REWARD = [1, 1.8, 3];
export const VIP_MUL = 1.5;

export const heroLevelCost = (lvl: number) => Math.round((150 * Math.pow(lvl, 1.6)) / 10) * 10;
export const MAX_HERO_LEVEL = 10;

export function unlocked(p: Profile, level: number) {
  return level === 0 || p.won[level - 1][0];
}

export function tierOpen(p: Profile, level: number, tier: number) {
  return tier === 0 || p.won[level][tier - 1];
}

// ---------- задания дня ----------

const dayKey = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

const QUEST_POOL: { id: string; text: string; goal: number }[] = [
  { id: 'kills', text: 'Убей 600 врагов', goal: 600 },
  { id: 'kills2', text: 'Убей 1500 врагов', goal: 1500 },
  { id: 'phase', text: 'Продержись до третьей фазы', goal: 1 },
  { id: 'skill', text: 'Используй умение героя 10 раз', goal: 10 },
  { id: 'set', text: 'Собери сет из 2 имплантов', goal: 1 },
  { id: 'elites', text: 'Убей 3 элитных врагов', goal: 3 },
  { id: 'goblin', text: 'Поймай гоблина-майнера', goal: 1 },
  { id: 'win', text: 'Победи босса локации', goal: 1 },
  { id: 'dodge', text: 'Сделай 40 рывков', goal: 40 },
];

export const QUEST_REWARD = { credits: 60, pass: 150 };

export function refreshQuests(p: Profile) {
  const day = dayKey();
  if (p.quests.day === day && p.quests.list.length) return;
  let seed = day;
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pool = [...QUEST_POOL];
  const list: Quest[] = [];
  for (let k = 0; k < 3; k++) {
    const q = pool.splice((r() * pool.length) | 0, 1)[0];
    list.push({ ...q, prog: 0, done: false, claimed: false });
  }
  p.quests = { day, list };
}

function questProgress(p: Profile, r: RunResult) {
  for (const q of p.quests.list) {
    if (q.done) continue;
    const add =
      q.id === 'kills' || q.id === 'kills2' ? r.kills
      : q.id === 'phase' ? (r.time >= 480 ? 1 : 0)
      : q.id === 'skill' ? r.skillUses
      : q.id === 'set' ? (r.maxSet >= 2 ? 1 : 0)
      : q.id === 'elites' ? r.elites
      : q.id === 'goblin' ? r.goblins
      : q.id === 'win' ? (r.won ? 1 : 0)
      : q.id === 'dodge' ? r.dodges
      : 0;
    q.prog = Math.min(q.goal, q.prog + add);
    if (q.prog >= q.goal) q.done = true;
  }
}

export function claimQuest(p: Profile, i: number) {
  const q = p.quests.list[i];
  if (!q || !q.done || q.claimed) return false;
  q.claimed = true;
  p.credits += Math.round(QUEST_REWARD.credits * (p.vip ? VIP_MUL : 1));
  p.pass.xp += QUEST_REWARD.pass;
  saveProfile(p);
  return true;
}

// ---------- боевой пропуск ----------

export const PASS_LEVELS = 30;
export const PASS_STEP = 1000;

export interface PassReward {
  text: string;
  credits?: number;
  cores?: number;
}

export function passReward(lvl: number, premium: boolean): PassReward {
  if (premium) {
    if (lvl % 5 === 0) return { text: '25 ядер', cores: 25 };
    return { text: `${100 + lvl * 10} кредитов`, credits: 100 + lvl * 10 };
  }
  if (lvl % 10 === 0) return { text: '10 ядер', cores: 10 };
  return { text: `${50 + lvl * 5} кредитов`, credits: 50 + lvl * 5 };
}

export const passLevel = (p: Profile) => Math.min(PASS_LEVELS, Math.floor(p.pass.xp / PASS_STEP));

export function claimPass(p: Profile, lvl: number, premium: boolean) {
  if (lvl > passLevel(p)) return false;
  if (premium && !p.vip) return false;
  const list = premium ? p.pass.claimedP : p.pass.claimed;
  if (list.includes(lvl)) return false;
  list.push(lvl);
  const r = passReward(lvl, premium);
  p.credits += r.credits ?? 0;
  p.cores += r.cores ?? 0;
  saveProfile(p);
  return true;
}

// ---------- итоги забега ----------

export interface Settlement {
  credits: number;
  passXp: number;
  unlockedLevel: boolean;
  unlockedTier: boolean;
  newImplants: number;
  newProtos: number;
}

export function settle(p: Profile, r: RunResult): Settlement {
  const mul = TIER_REWARD[r.tier] * (p.vip ? VIP_MUL : 1);
  const credits = Math.round((r.kills * 0.01 + (r.time / 60) * 3 + (r.won ? 40 * (r.level + 1) : 0) + r.bosses * 20 + r.elites * 3 + r.goblins * 15) * mul);
  const passXp = Math.round(r.time * 0.5 + r.kills * 0.05 + (r.won ? 150 : 0));
  p.credits += credits;
  p.earned += credits;
  p.pass.xp += passXp;
  p.life.runs++;
  p.life.kills += r.kills;
  p.life.time += r.time;
  p.life.bosses += r.bosses;
  let unlockedLevel = false;
  let unlockedTier = false;
  if (r.won) {
    p.life.wins++;
    if (!p.won[r.level][r.tier]) {
      p.won[r.level][r.tier] = true;
      if (r.tier === 0 && r.level < 4) unlockedLevel = true;
      if (r.tier < 2) unlockedTier = true;
    }
  }
  let newImplants = 0;
  let newProtos = 0;
  for (const id of r.implants) {
    if (!p.codex.implants.includes(id)) {
      p.codex.implants.push(id);
      newImplants++;
    }
  }
  for (const id of r.protocols) {
    if (!p.codex.protos.includes(id)) {
      p.codex.protos.push(id);
      newProtos++;
    }
  }
  for (const [n, k] of Object.entries(r.killsBy)) p.codex.enemies[n] = (p.codex.enemies[n] ?? 0) + k;
  questProgress(p, r);
  saveProfile(p);
  return { credits, passXp, unlockedLevel, unlockedTier, newImplants, newProtos };
}

export function heroState(p: Profile, id: string) {
  return p.heroes[id];
}

export function buyHero(p: Profile, id: string) {
  const h = HEROES.find((x) => x.id === id);
  if (!h || p.heroes[id] || p.credits < h.cost) return false;
  p.credits -= h.cost;
  p.heroes[id] = { lvl: 1, talents: [-1, -1, -1, -1, -1] };
  saveProfile(p);
  return true;
}

export function levelHero(p: Profile, id: string) {
  const s = p.heroes[id];
  if (!s || s.lvl >= MAX_HERO_LEVEL) return false;
  const cost = heroLevelCost(s.lvl);
  if (p.credits < cost) return false;
  p.credits -= cost;
  s.lvl++;
  saveProfile(p);
  return true;
}
