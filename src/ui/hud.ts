import { FLAG_TEXT, heroById, implantById, modText, protoById, SLOT_NAME, SLOT_SHORT, type Mods, type Tag } from '../game/heroes.js';
import type { Choice, ChoiceCb, ChoiceCtl, RunResult, Slot, UI } from '../game/types.js';
import type { Settlement } from '../meta/meta.js';
import { PORTRAIT } from './portraits.js';

export const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const TAG_COLOR: Record<Tag, string> = {
  Урон: '#ff6a4a',
  Стихия: '#3ec8ff',
  Выживание: '#6aff8a',
  Подвижность: '#ffd24a',
  Штраф: '#ff2d55',
};

// описание карты выбора: заголовок, тип, строки эффекта
export function describe(c: Choice) {
  if (c.kind === 'implant') {
    const imp = implantById(c.id);
    const h = heroById(imp.hero);
    const k = 0.4 + 0.6 * c.level;
    const scaled: Mods = {};
    for (const key in imp.mods) (scaled as Record<string, number>)[key] = Math.round((imp.mods as Record<string, number>)[key] * k * 100) / 100;
    return {
      title: `${h.name} (${SLOT_SHORT[imp.slot]})`,
      type: 'Имплант',
      color: h.look.glow,
      lines: [...modText(scaled), `Сет 2: ${h.set2.text}`, `Сет 3: ${h.set3.text}`],
      tags: [SLOT_NAME[imp.slot]],
      icon: SLOT_SHORT[imp.slot],
    };
  }
  if (c.kind === 'proto') {
    const p = protoById(c.id);
    const scaled: Mods = {};
    for (const key in p.mods) (scaled as Record<string, number>)[key] = Math.round((p.mods as Record<string, number>)[key] * c.level * 100) / 100;
    return {
      title: p.name,
      type: 'Протокол',
      color: TAG_COLOR[p.tags[0]],
      lines: [...modText(scaled), ...(p.flag ? [FLAG_TEXT[p.flag]] : [])],
      tags: p.tags as string[],
      icon: p.icon,
    };
  }
  return { title: 'Ремонт', type: 'Награда', color: '#6aff8a', lines: ['Полное здоровье и 10 монет'], tags: [], icon: '✚' };
}

export class Hud implements UI {
  private c = { hp: -1, max: -1, xp: -1, lvl: -1, sec: -1, phase: '', coins: -1, skill: -1, dodge: -1 };
  private queue: [string, string][] = [];
  private busy = false;
  private bannerTimer = 0;
  private selected = -1;
  private banishMode = false;
  private onEnd: (r: RunResult) => void = () => undefined;

  setEnd(fn: (r: RunResult) => void) {
    this.onEnd = fn;
  }

  show(v: boolean) {
    $('run-ui').hidden = !v;
    $('choice').hidden = true;
    $('pause').hidden = true;
    $('results').hidden = true;
    $('bossbar').hidden = true;
    this.c = { hp: -1, max: -1, xp: -1, lvl: -1, sec: -1, phase: '', coins: -1, skill: -1, dodge: -1 };
    this.queue = [];
    this.busy = false;
    window.clearTimeout(this.bannerTimer);
    $('banner').classList.remove('show');
  }

  setHero(id: string, name: string, color: string) {
    const e = $('hud-hero');
    e.style.setProperty('--c', color);
    if (PORTRAIT[id]) {
      e.textContent = '';
      e.style.backgroundImage = `url(${PORTRAIT[id]})`;
    } else e.textContent = name.slice(0, 1);
  }

  hp(cur: number, max: number) {
    const v = Math.max(0, Math.round(cur));
    if (v === this.c.hp && max === this.c.max) return;
    this.c.hp = v;
    this.c.max = max;
    $('hp-fill').style.transform = `scaleX(${Math.max(0, cur / max)})`;
    $('hp-text').textContent = `${v} / ${Math.round(max)}`;
  }

  xp(frac: number, lvl: number) {
    const v = Math.round(Math.min(1, frac) * 100) / 100;
    if (v !== this.c.xp) {
      this.c.xp = v;
      $('xp-fill').style.transform = `scaleX(${v})`;
    }
    if (lvl !== this.c.lvl) {
      this.c.lvl = lvl;
      $('hud-lvl').textContent = `Уровень ${lvl}`;
    }
  }

  timer(left: number, _phase: number, label: string) {
    const sec = Math.ceil(left);
    if (sec !== this.c.sec) {
      this.c.sec = sec;
      $('hud-time').textContent = fmt(sec);
    }
    if (label !== this.c.phase) {
      this.c.phase = label;
      $('hud-phase').textContent = label;
    }
  }

  coins(n: number) {
    if (n === this.c.coins) return;
    this.c.coins = n;
    $('hud-coins').textContent = String(n);
  }

  skill(frac: number) {
    const v = Math.ceil(frac * 30) / 30;
    if (v === this.c.skill) return;
    this.c.skill = v;
    $('btn-skill').style.setProperty('--cd', `${v * 100}%`);
    $('btn-skill').classList.toggle('ready', v <= 0);
  }

  dodge(frac: number) {
    const v = Math.ceil(frac * 20) / 20;
    if (v === this.c.dodge) return;
    this.c.dodge = v;
    $('btn-dodge').style.setProperty('--cd', `${v * 100}%`);
  }

  slots(imps: Slot[], protos: Slot[]) {
    const fill = (id: string, list: Slot[], implant: boolean) => {
      const box = $(id);
      box.replaceChildren();
      for (let k = 0; k < 6; k++) {
        const s = list[k];
        const cell = el('div', 'inv-slot' + (s ? ' on' : ''));
        if (s) {
          const d = describe({ kind: implant ? 'implant' : 'proto', id: s.id, level: s.lvl });
          cell.style.setProperty('--c', d.color);
          cell.append(el('span', 'inv-icon', d.icon), el('span', 'inv-lvl', '✦'.repeat(s.lvl)));
        }
        box.append(cell);
      }
    };
    fill('inv-imp', imps, true);
    fill('inv-proto', protos, false);
  }

  banner(text: string, color: string) {
    this.queue.push([text, color]);
    if (!this.busy) this.next();
  }

  private next() {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const b = $('banner');
    b.textContent = item[0];
    b.style.setProperty('--c', item[1]);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerTimer = window.setTimeout(() => this.next(), 1900);
  }

  boss(name: string | null, frac: number) {
    const bar = $('bossbar');
    if (!name) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    $('boss-name').textContent = name;
    $('boss-fill').style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  markers(list: { x: number; y: number; color: string }[]) {
    const box = $('markers');
    while (box.children.length < list.length) box.append(el('div', 'marker'));
    const W = window.innerWidth;
    const H = window.innerHeight;
    [...box.children].forEach((m, k) => {
      const e = m as HTMLElement;
      const p = list[k];
      if (!p) {
        e.hidden = true;
        return;
      }
      e.hidden = false;
      const cx = W / 2;
      const cy = H / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const kx = (W / 2 - 40) / Math.abs(Math.cos(a) || 1e-6);
      const ky = (H / 2 - 40) / Math.abs(Math.sin(a) || 1e-6);
      const d = Math.min(kx, ky);
      e.style.transform = `translate(${cx + Math.cos(a) * d}px, ${cy + Math.sin(a) * d}px) rotate(${a}rad)`;
      e.style.setProperty('--c', p.color);
    });
  }

  // ---------- выбор 1 из 5 ----------

  choose(opts: Choice[], ctl: ChoiceCtl, cb: ChoiceCb) {
    this.selected = -1;
    this.banishMode = false;
    const box = $('choice-cards');
    box.replaceChildren();
    $('choice-title').textContent = ctl.chest ? 'Сундук: выберите 1 предмет' : 'Выберите 1 предмет';
    this.choiceTimer(ctl.timer);
    const confirm = $('ch-confirm') as HTMLButtonElement;
    confirm.disabled = true;
    opts.forEach((c, i) => {
      const d = describe(c);
      const card = el('button', 'card') as HTMLButtonElement;
      card.style.setProperty('--c', d.color);
      const art = el('div', 'card-art');
      if (c.kind === 'implant') {
        const hid = implantById(c.id).hero;
        if (PORTRAIT[hid]) {
          art.classList.add('portrait');
          art.style.backgroundImage = `url(${PORTRAIT[hid]})`;
        }
        art.append(el('span', 'card-slot', d.icon), el('span', 'card-hero', heroById(hid).name));
      } else art.append(el('span', 'card-icon', d.icon));
      const tags = el('div', 'card-tags');
      for (const t of d.tags) {
        const tg = el('span', 'tag', t);
        tg.style.setProperty('--t', TAG_COLOR[t as Tag] ?? '#6aa8ff');
        tags.append(tg);
      }
      const info = el('div', 'card-info');
      info.append(el('div', 'card-type', `Тип: ${d.type}`));
      for (const ln of d.lines) info.append(el('div', 'card-line', ln));
      const stars = el('div', 'card-stars');
      for (let s = 1; s <= 3; s++) stars.append(el('span', 'st' + (s <= c.level ? ' on' : ''), '✦'));
      card.append(art, el('div', 'card-name', d.title), tags, stars, info);
      card.addEventListener('click', () => {
        if (this.banishMode) {
          this.banishMode = false;
          $('ch-banish').classList.remove('armed');
          cb.banish(i);
          return;
        }
        this.selected = i;
        [...box.children].forEach((x, k) => x.classList.toggle('sel', k === i));
        confirm.disabled = false;
      });
      card.addEventListener('dblclick', () => cb.pick(i));
      box.append(card);
    });
    const set = (id: string, text: string, on: boolean, fn: () => void) => {
      const b = $(id) as HTMLButtonElement;
      b.innerHTML = text;
      b.disabled = !on;
      b.onclick = fn;
    };
    set('ch-skip', `ПРОПУСТИТЬ (${ctl.skips}/3)`, ctl.skips > 0 && !ctl.chest, () => cb.skip());
    set('ch-banish', `УБРАТЬ (${ctl.banish}/2)`, ctl.banish > 0, () => {
      this.banishMode = !this.banishMode;
      $('ch-banish').classList.toggle('armed', this.banishMode);
    });
    set('ch-refresh', `ОБНОВИТЬ<small>⬢ ${ctl.refreshCost}</small>`, ctl.coins >= ctl.refreshCost, () => cb.refresh());
    confirm.onclick = () => {
      if (this.selected >= 0) cb.pick(this.selected);
    };
    $('choice').hidden = false;
  }

  choiceTimer(left: number) {
    $('choice-timer').textContent = String(Math.ceil(left));
  }

  closeChoice() {
    $('choice').hidden = true;
  }

  end(r: RunResult) {
    this.onEnd(r);
  }

  showResults(r: RunResult, s: Settlement, h: { home: () => void; again: () => void }) {
    this.queue = [];
    window.clearTimeout(this.bannerTimer);
    this.busy = false;
    $('banner').classList.remove('show');
    $('bossbar').hidden = true;
    $('markers').replaceChildren();
    const box = $('results-body');
    box.replaceChildren();
    box.append(el('div', 'res-title ' + (r.won ? 'win' : 'lose'), r.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'));
    const grid = el('div', 'res-grid');
    const stat = (k: string, v: string) => {
      const c = el('div', 'res-stat');
      c.append(el('span', 'res-k', k), el('span', 'res-v', v));
      grid.append(c);
    };
    stat('Время', fmt(r.time));
    stat('Убийств', String(r.kills));
    stat('Уровень', String(r.lvl));
    stat('Элита', String(r.elites));
    box.append(grid);
    const rew = el('div', 'res-rewards');
    rew.append(el('div', 'rew', `⬡ +${s.credits} кредитов`), el('div', 'rew', `★ +${s.passXp} опыта пропуска`));
    if (s.newImplants || s.newProtos) rew.append(el('div', 'rew new', `В справочник: ${s.newImplants} имплантов, ${s.newProtos} протоколов`));
    if (s.unlockedLevel) rew.append(el('div', 'rew new', 'Открыта новая локация'));
    if (s.unlockedTier) rew.append(el('div', 'rew new', 'Открыта следующая сложность'));
    box.append(rew);
    const row = el('div', 'res-btns');
    const home = el('button', 'btn ghost', 'В ХАБ') as HTMLButtonElement;
    const again = el('button', 'btn primary', 'ЕЩЁ РАЗ') as HTMLButtonElement;
    home.onclick = h.home;
    again.onclick = h.again;
    row.append(home, again);
    box.append(row);
    $('choice').hidden = true;
    $('pause').hidden = true;
    $('results').hidden = false;
  }
}
