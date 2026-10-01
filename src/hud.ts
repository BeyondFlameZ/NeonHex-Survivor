import type { Settlement } from './meta';
import { levelChallenges, LEVELS } from './levels';
import type { Profile, RunResult } from './save';
import { byId } from './weapons';

export interface Card {
  kicker: string;
  title: string;
  lines: string[];
  badge?: { text: string; css: string };
  note?: string;
  gold?: boolean;
  isNew?: boolean;
}

export interface WeaponSlot {
  tag: string;
  css: string;
  level: number;
  evolved: boolean;
}

export interface GearSlot {
  glyph: string;
  filled: boolean;
}

export const fmtTime = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// DOM трогаем только при изменении значений — иначе Safari тратит кадр на layout.
export class Hud {
  private runUi = $('run-ui');
  private lvl = $('lvl');
  private time = $('time');
  private kills = $('kills');
  private bossTimer = $('boss-timer');
  private xpFill = $('xp-fill');
  private choice = $('levelup');
  private choiceTitle = $('lu-title');
  private choiceSub = $('lu-sub');
  private choices = $('choices');
  private reroll = $('reroll') as HTMLButtonElement;
  private wslots = $('wslots');
  private gslots = $('gslots');
  private dash = $('dash');
  private banner = $('banner');
  private bossbar = $('bossbar');
  private bossName = $('boss-name');
  private bossFill = $('boss-fill');
  private pause = $('pause');
  private results = $('results');
  private c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1, boss: -1, bossLeft: -2 };
  private onReroll: (() => void) | null = null;
  private queue: [string, string][] = [];
  private bannerBusy = false;
  private bannerTimer = 0;

  constructor() {
    this.reroll.addEventListener('click', () => this.onReroll?.());
    window.addEventListener('keydown', (e) => {
      if (this.choice.hidden) return;
      if (e.code === 'KeyR') {
        this.onReroll?.();
        return;
      }
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      const btn = this.choices.children[n] as HTMLButtonElement | undefined;
      if (n >= 0 && btn) btn.click();
    });
  }

  bindDash(fn: () => void) {
    this.dash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
  }

  bindPause(h: { toggle: () => void; restart: () => void; quit: () => void }) {
    $('pausebtn').addEventListener('click', h.toggle);
    $('p-resume').addEventListener('click', h.toggle);
    $('p-restart').addEventListener('click', h.restart);
    $('p-quit').addEventListener('click', h.quit);
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && !this.runUi.hidden && this.results.hidden) h.toggle();
    });
  }

  setRunVisible(v: boolean) {
    this.runUi.hidden = !v;
    this.reset();
  }

  reset() {
    this.c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1, boss: -1, bossLeft: -2 };
    this.choice.hidden = true;
    this.pause.hidden = true;
    this.results.hidden = true;
    this.bossbar.hidden = true;
    this.banner.classList.remove('show');
    this.queue = [];
    this.bannerBusy = false;
    window.clearTimeout(this.bannerTimer);
  }

  // очередь крупных надписей в духе «Приближается орда»
  announce(text: string, color: string) {
    this.queue.push([text, color]);
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner() {
    const item = this.queue.shift();
    if (!item) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    this.banner.textContent = item[0];
    this.banner.style.setProperty('--c', item[1]);
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = window.setTimeout(() => this.nextBanner(), 2200);
  }

  showBoss(name: string) {
    this.bossName.textContent = name;
    this.bossbar.hidden = false;
    this.c.boss = -1;
    this.setBoss(1);
  }

  setBoss(frac: number) {
    const v = Math.round(Math.max(0, frac) * 400) / 400;
    if (v === this.c.boss) return;
    this.c.boss = v;
    this.bossFill.style.transform = `scaleX(${v})`;
  }

  hideBoss() {
    this.bossbar.hidden = true;
  }

  showPause() {
    this.pause.hidden = false;
  }

  hidePause() {
    this.pause.hidden = true;
  }

  // cd: 0 — готов, 1 — только что использован
  setDash(cd: number) {
    const v = Math.ceil(cd * 20) / 20;
    if (v === this.c.dash) return;
    this.c.dash = v;
    this.dash.style.setProperty('--cd', `${v * 100}%`);
    this.dash.classList.toggle('ready', v === 0);
  }

  setSlots(weapons: WeaponSlot[], gear: GearSlot[]) {
    this.wslots.replaceChildren();
    for (let k = 0; k < 6; k++) {
      const w = weapons[k];
      const box = el('div', 'slot' + (w ? ' filled' : '') + (w?.evolved ? ' evo' : ''));
      if (w) {
        box.style.setProperty('--c', w.css);
        box.append(el('span', 'slot-tag', w.tag), el('span', 'slot-lv', w.evolved ? '★' : String(w.level)));
      }
      this.wslots.append(box);
    }
    this.gslots.replaceChildren();
    for (const g of gear) {
      const box = el('div', 'slot gear' + (g.filled ? ' filled' : ''));
      box.append(el('span', 'slot-tag', g.glyph));
      this.gslots.append(box);
    }
  }

  update(level: number, time: number, kills: number, xpFrac: number, bossAt: number) {
    const c = this.c;
    if (level !== c.lvl) {
      c.lvl = level;
      this.lvl.textContent = `Ур. ${level}`;
    }
    const sec = Math.floor(time);
    if (sec !== c.sec) {
      c.sec = sec;
      this.time.textContent = fmtTime(sec);
      const left = Math.max(-1, bossAt - sec);
      if (left !== c.bossLeft) {
        c.bossLeft = left;
        this.bossTimer.textContent = left > 0 ? `Босс через ${fmtTime(left)}` : '';
      }
    }
    if (kills !== c.kills) {
      c.kills = kills;
      this.kills.textContent = `☠ ${kills}`;
    }
    const xp = Math.round(Math.min(1, xpFrac) * 200) / 200;
    if (xp !== c.xp) {
      c.xp = xp;
      this.xpFill.style.transform = `scaleX(${xp})`;
    }
  }

  showChoice(title: string, sub: string, cards: Card[], onPick: (i: number) => void, reroll?: { left: number; onReroll: () => void }) {
    let picked = false;
    this.choiceTitle.textContent = title;
    this.choiceSub.textContent = sub;
    this.choices.replaceChildren();

    cards.forEach((card, i) => {
      const b = el('button', 'choice' + (card.gold ? ' gold' : '')) as HTMLButtonElement;
      const head = el('span', 'choice-head');
      if (card.badge) {
        const badge = el('span', 'badge', card.badge.text);
        badge.style.setProperty('--c', card.badge.css);
        head.append(badge);
      }
      head.append(el('span', 'kicker' + (card.isNew ? ' new' : ''), card.kicker));
      b.append(head, el('span', 'choice-name', card.title));
      for (const line of card.lines) b.append(el('span', 'choice-desc', line));
      if (card.note) b.append(el('span', 'choice-note', card.note));
      b.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(i);
      });
      this.choices.append(b);
    });

    this.onReroll = reroll ? reroll.onReroll : null;
    this.reroll.hidden = !reroll;
    if (reroll) this.reroll.textContent = `Реролл (${reroll.left})`;
    this.choice.hidden = false;
  }

  hideChoice() {
    this.choice.hidden = true;
    this.onReroll = null;
  }

  showResults(r: RunResult, s: Settlement, p: Profile, h: { toMap: () => void; retry: () => void }) {
    const L = LEVELS[r.level];
    const box = $('results-body');
    box.replaceChildren();
    this.choice.hidden = true;
    this.pause.hidden = true;

    box.append(
      el('h2', 'title ' + (r.won ? 'gold' : 'blood'), r.won ? 'Победа' : 'Сигнал потерян'),
      el('p', 'sub', `${L.name} · ${fmtTime(r.time)} · уровень ${r.lvl} · убито ${r.kills}`),
    );

    const stars = el('div', 'star-list');
    levelChallenges(r.level).forEach((c, i) => {
      const got = p.stars[r.level][i];
      const fresh = s.newStars.includes(c.text);
      const row = el('div', 'star-line' + (got ? ' got' : '') + (fresh ? ' fresh' : ''));
      row.append(el('span', 'star', got ? '★' : '☆'), el('span', 'star-text', c.text));
      stars.append(row);
    });
    box.append(stars);

    const loot = el('div', 'loot');
    loot.append(el('div', 'loot-line', `Осколки за забег: +${s.base}`));
    if (s.starShards) loot.append(el('div', 'loot-line', `За новые звёзды: +${s.starShards}`));
    for (const a of s.newAch) loot.append(el('div', 'loot-line ach', `Достижение «${a.name}»: +${a.reward}`));
    loot.append(el('div', 'loot-total', `Итого: +${s.total} ◆`));
    if (s.unlocked) {
      const w = byId(s.unlocked);
      loot.append(el('div', 'loot-line unlock', `Открыт стартовый скрипт: ${w?.name ?? s.unlocked}`));
      if (r.level + 1 < LEVELS.length) loot.append(el('div', 'loot-line unlock', `Открыта локация: ${LEVELS[r.level + 1].name}`));
    }
    box.append(loot);

    const btns = el('div', 'btn-row');
    const map = el('button', 'btn', 'К карте') as HTMLButtonElement;
    const retry = el('button', 'btn primary', 'Заново') as HTMLButtonElement;
    map.addEventListener('click', h.toMap);
    retry.addEventListener('click', h.retry);
    btns.append(map, retry);
    box.append(btns);
    this.results.hidden = false;
  }
}
