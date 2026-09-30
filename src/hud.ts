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

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// DOM трогаем только при изменении значений — иначе Safari тратит кадр на layout.
export class Hud {
  private lvl = $('lvl');
  private time = $('time');
  private kills = $('kills');
  private xpFill = $('xp-fill');
  private choice = $('levelup');
  private choiceTitle = $('lu-title');
  private choiceSub = $('lu-sub');
  private choices = $('choices');
  private reroll = $('reroll') as HTMLButtonElement;
  private wslots = $('wslots');
  private gslots = $('gslots');
  private gameover = $('gameover');
  private summary = $('summary');
  private dash = $('dash');
  private c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1 };
  private onReroll: (() => void) | null = null;

  constructor() {
    $('restart').addEventListener('click', () => location.reload());
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

  update(level: number, time: number, kills: number, xpFrac: number) {
    const c = this.c;
    if (level !== c.lvl) {
      c.lvl = level;
      this.lvl.textContent = `Уровень ${level}`;
    }
    const sec = Math.floor(time);
    if (sec !== c.sec) {
      c.sec = sec;
      this.time.textContent = fmtTime(sec);
    }
    if (kills !== c.kills) {
      c.kills = kills;
      this.kills.textContent = `Убито ${kills}`;
    }
    const xp = Math.round(Math.min(1, xpFrac) * 200) / 200;
    if (xp !== c.xp) {
      c.xp = xp;
      this.xpFill.style.transform = `scaleX(${xp})`;
    }
  }

  showChoice(
    title: string,
    sub: string,
    cards: Card[],
    onPick: (i: number) => void,
    reroll?: { left: number; onReroll: () => void },
  ) {
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

  showGameOver(time: number, level: number, kills: number) {
    this.summary.textContent = `Продержался ${fmtTime(time)}. Уровень ${level}, уничтожено врагов: ${kills}.`;
    this.gameover.hidden = false;
  }
}
