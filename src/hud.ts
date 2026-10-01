import type { Settlement } from './meta';
import { levelChallenges, LEVELS } from './levels';
import { TIERS } from './modes';
import { gemById, parseGem } from './relics';
import { legendById } from './stats';
import type { Profile, RunResult } from './save';

export interface Card {
  kicker: string;
  title: string;
  lines: string[];
  badge?: { text: string; css: string };
  note?: string;
  gold?: boolean;
  isNew?: boolean;
  rarity?: number;
  fusion?: boolean;
}

export interface BuildInfo {
  weapons: { name: string; css: string; school: string; level: number; evolved: boolean; perks: string[] }[];
  sets: { name: string; css: string; count: number; bonuses: string[] }[];
  gear: { slot: string; name: string; css: string; lines: string[] }[];
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
  css: string;
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
  private runShards = $('run-shards');
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
  private ultBtn = $('ult');
  private riftbar = $('riftbar');
  private riftFill = $('rift-fill');
  private riftTime = $('rift-time');
  private banner = $('banner');
  private bossbar = $('bossbar');
  private bossName = $('boss-name');
  private bossFill = $('boss-fill');
  private pause = $('pause');
  private results = $('results');
  private c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1, boss: -1, bossLeft: -2, shards: -1, ult: -1, rift: -1, riftT: -1 };
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

  bindUlt(fn: () => void) {
    this.ultBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && !this.runUi.hidden) fn();
    });
  }

  setUlt(frac: number) {
    const v = Math.floor(Math.min(1, frac) * 40) / 40;
    if (v === this.c.ult) return;
    this.c.ult = v;
    this.ultBtn.style.setProperty('--fill', `${v * 100}%`);
    this.ultBtn.classList.toggle('ready', v >= 1);
  }

  setRift(prog: number, left: number) {
    this.riftbar.hidden = false;
    const v = Math.round(prog * 200) / 200;
    if (v !== this.c.rift) {
      this.c.rift = v;
      this.riftFill.style.transform = `scaleX(${v})`;
    }
    const sec = Math.ceil(left);
    if (sec !== this.c.riftT) {
      this.c.riftT = sec;
      this.riftTime.textContent = v >= 1 ? 'Страж призван' : `${Math.round(v * 100)}% · ${fmtTime(sec)}`;
      this.riftTime.classList.toggle('low', sec <= 30);
    }
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
    this.c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1, boss: -1, bossLeft: -2, shards: -1, ult: -1, rift: -1, riftT: -1 };
    this.riftbar.hidden = true;
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

  showPause(b?: BuildInfo) {
    const box = $('pause-build');
    box.replaceChildren();
    if (b) {
      const w = el('div', 'build-col');
      w.append(el('h3', 'block-title', 'Оружие'));
      for (const x of b.weapons) {
        const row = el('div', 'build-item');
        row.style.setProperty('--c', x.css);
        row.append(el('span', 'build-name', `${x.name} · ${x.evolved ? '★' : 'ур. ' + x.level}`), el('span', 'build-sub', x.school));
        for (const pk of x.perks) row.append(el('span', 'build-perk', '• ' + pk));
        w.append(row);
      }
      if (b.sets.length) {
        w.append(el('h3', 'block-title', 'Сеты'));
        for (const st of b.sets) {
          const row = el('div', 'build-item');
          row.style.setProperty('--c', st.css);
          row.append(el('span', 'build-name', `${st.name} ${st.count}/4`));
          for (const bn of st.bonuses) row.append(el('span', 'build-perk', '✓ ' + bn));
          w.append(row);
        }
      }
      const g = el('div', 'build-col');
      g.append(el('h3', 'block-title', 'Снаряжение'));
      for (const x of b.gear) {
        const row = el('div', 'build-item' + (x.name ? '' : ' empty'));
        row.style.setProperty('--c', x.css || '#4a3620');
        row.append(el('span', 'build-sub', x.slot), el('span', 'build-name', x.name || 'пусто'));
        for (const ln of x.lines) row.append(el('span', 'build-perk', ln));
        g.append(row);
      }
      box.append(w, g);
    }
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
      if (g.css) box.style.setProperty('--c', g.css);
      box.append(el('span', 'slot-tag', g.glyph));
      this.gslots.append(box);
    }
  }

  update(level: number, time: number, kills: number, xpFrac: number, bossAt: number, shards: number) {
    const c = this.c;
    if (level !== c.lvl) {
      c.lvl = level;
      this.lvl.textContent = `Ур. ${level}`;
    }
    const sec = Math.floor(time);
    if (sec !== c.sec) {
      c.sec = sec;
      this.time.textContent = fmtTime(sec);
      const left = bossAt < 0 ? -1 : Math.max(-1, Math.ceil(bossAt) - sec);
      if (left !== c.bossLeft) {
        c.bossLeft = left;
        this.bossTimer.textContent = left > 0 ? `Босс через ${fmtTime(left)}` : '';
      }
    }
    if (shards !== c.shards) {
      c.shards = shards;
      this.runShards.textContent = shards > 0 ? `◆ ${shards}` : '';
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
      const b = el('button', 'choice' + (card.gold ? ' gold' : '') + (card.fusion ? ' fusion' : '') + (card.rarity !== undefined ? ` r${card.rarity}` : '')) as HTMLButtonElement;
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

    const mode = r.rift ? `Великий портал ${r.rift}` : r.daily ? 'Испытание дня' : r.endless ? 'Бесконечный режим' : TIERS[r.tier].name;
    const good = r.won || r.riftWon;
    box.append(
      el('h2', 'title ' + (good ? 'gold' : 'blood'), r.riftWon ? 'Портал закрыт' : r.rift ? 'Портал провален' : r.won ? 'Победа' : r.endless ? 'Конец пути' : 'Сигнал потерян'),
      el('p', 'sub', `${L.name} · ${mode} · ${fmtTime(r.time)} · уровень ${r.lvl} · убито ${r.kills}`),
    );
    if (r.endless) box.append(el('p', 'sub', `Боссов убито: ${r.bosses}${s.newBest ? ' · новый рекорд!' : ` · рекорд ${fmtTime(p.best[r.level])}`}`));

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
    loot.append(el('div', 'loot-line', `Осколки за забег: +${s.base}${r.tier ? ` (×${TIERS[r.tier].reward} за сложность)` : ''}`));
    if (r.shards) loot.append(el('div', 'loot-line', `Из них подобрано с гоблинов: ${r.shards}`));
    if (s.starShards) loot.append(el('div', 'loot-line', `За новые звёзды: +${s.starShards}`));
    if (s.dailyBonus) loot.append(el('div', 'loot-line ach', `Испытание дня пройдено: +${s.dailyBonus}`));
    for (const a of s.newAch) loot.append(el('div', 'loot-line ach', `Достижение «${a.name}»: +${a.reward}`));
    loot.append(el('div', 'loot-total', `Итого: +${s.total} ◆`));
    loot.append(el('div', 'loot-line', `Опыт парагона: +${s.pxp}${s.plevels ? ` · новых уровней: ${s.plevels}` : ''}`));
    if (s.riftNew) loot.append(el('div', 'loot-line ach', `Новый рекорд порталов: ${r.rift}`));
    for (const rel of s.relics) loot.append(el('div', 'loot-line legend', `Реликвия: ${legendById(rel.leg)?.name ?? rel.leg} (${rel.sockets.length} гн.)`));
    for (const g of s.gems) {
      const { id, lvl } = parseGem(g);
      const line = el('div', 'loot-line', `Камень: ${gemById(id).name} ${lvl} ур.`);
      line.style.color = gemById(id).css;
      loot.append(line);
    }
    if (s.unlockedClass) loot.append(el('div', 'loot-line unlock', `Открыт класс: ${s.unlockedClass}`));
    if (s.unlockedLevel) loot.append(el('div', 'loot-line unlock', `Открыта локация: ${s.unlockedLevel}`));
    if (r.won && r.tier < 2 && !r.daily) loot.append(el('div', 'loot-line unlock', `Доступна сложность «${TIERS[r.tier + 1].name}»`));
    box.append(loot);

    const btns = el('div', 'btn-row');
    const share = el('button', 'btn ghost', 'Поделиться') as HTMLButtonElement;
    share.addEventListener('click', () => {
      const text = `Neon Hex · ${L.name} · ${mode} · ${fmtTime(r.time)} · убито ${r.kills}${r.riftWon ? ' · портал закрыт' : ''}\nhttps://beyondflamez.github.io/NeonHex-Survivor/`;
      if (navigator.share) navigator.share({ text }).catch(() => undefined);
      else navigator.clipboard?.writeText(text).catch(() => undefined);
    });
    btns.append(share);
    const map = el('button', 'btn', 'К карте') as HTMLButtonElement;
    const retry = el('button', 'btn primary', 'Заново') as HTMLButtonElement;
    map.addEventListener('click', h.toMap);
    retry.addEventListener('click', h.retry);
    btns.append(map, retry);
    box.append(btns);
    this.results.hidden = false;
  }
}
