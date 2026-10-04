// Общие типы забега и интерфейс, через который игра говорит с интерфейсом
export interface RunOpts {
  level: number;
  tier: number;
  hero: string;
  heroLevel: number;
  talents: number[]; // выбранный талант на каждом из 5 уровней, -1 — не выбран
  seed: number;
}

export interface RunResult {
  won: boolean;
  level: number;
  tier: number;
  hero: string;
  time: number;
  kills: number;
  lvl: number;
  bosses: number;
  elites: number;
  goblins: number;
  implants: string[];
  protocols: string[];
  killsBy: Record<string, number>;
  skillUses: number;
  maxSet: number;
  dodges: number;
}

export interface Choice {
  kind: 'implant' | 'proto' | 'heal';
  id: string;
  level: number; // уровень после выбора
}

export interface ChoiceCtl {
  timer: number;
  skips: number;
  banish: number;
  refreshCost: number;
  coins: number;
  chest: boolean;
}

export interface ChoiceCb {
  pick: (i: number) => void;
  skip: () => void;
  banish: (i: number) => void;
  refresh: () => void;
}

export interface Slot {
  id: string;
  lvl: number;
}

export interface UI {
  hp(cur: number, max: number): void;
  xp(frac: number, lvl: number): void;
  timer(left: number, phase: number, label: string): void;
  coins(n: number): void;
  skill(frac: number): void;
  dodge(frac: number): void;
  slots(imps: Slot[], protos: Slot[]): void;
  banner(text: string, color: string): void;
  boss(name: string | null, frac: number): void;
  choose(opts: Choice[], ctl: ChoiceCtl, cb: ChoiceCb): void;
  choiceTimer(left: number): void;
  closeChoice(): void;
  markers(list: { x: number; y: number; color: string }[]): void;
  end(r: RunResult): void;
}
