export interface RunResult {
  level: number;
  won: boolean;
  time: number;
  kills: number;
  lvl: number;
  crits: number;
  evolutions: number;
  maxSet: number;
  dashes: number;
  minHp: number;
  shrines: number;
  chests: number;
  weapons: string[];
}

export interface Settings {
  bloom: boolean;
  shake: boolean;
  numbers: boolean;
}

export interface Profile {
  v: 1;
  shards: number;
  earned: number;
  shop: Record<string, number>;
  stars: boolean[][];
  won: boolean[];
  ach: Record<string, boolean>;
  life: { kills: number; runs: number; bosses: number; crits: number; evolutions: number; shrines: number; chests: number; time: number };
  used: string[];
  start: string;
  settings: Settings;
}

const KEY = 'neonhex.save.v1';

export function freshProfile(): Profile {
  return {
    v: 1,
    shards: 0,
    earned: 0,
    shop: {},
    stars: [0, 1, 2, 3, 4].map(() => [false, false, false]),
    won: [false, false, false, false, false],
    ach: {},
    life: { kills: 0, runs: 0, bosses: 0, crits: 0, evolutions: 0, shrines: 0, chests: 0, time: 0 },
    used: [],
    start: 'bolt',
    settings: { bloom: true, shake: true, numbers: true },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshProfile();
    const p = JSON.parse(raw) as Profile;
    // подмешиваем новые поля к старым сейвам
    const base = freshProfile();
    return { ...base, ...p, life: { ...base.life, ...p.life }, settings: { ...base.settings, ...p.settings } };
  } catch {
    return freshProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // приватный режим Safari может запретить запись — игра продолжит работать без сохранений
  }
}

export function resetProfile(): Profile {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return freshProfile();
}
