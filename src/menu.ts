import { CLASSES, classById } from './classes';
import { $, el, fmtTime } from './hud';
import { BEH_NAME, levelChallenges, LEVELS } from './levels';
import { ACHIEVEMENTS, SHOP, shopLevel } from './meta';
import { dailyFor, modById, TIERS, tierOpen, todayKey, type RunOpts } from './modes';
import { exportCode, importCode, resetProfile, saveProfile, type Profile } from './save';
import { SCHOOL_ORDER, SCHOOLS } from './schools';
import { ARSENAL } from './weapons';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

type Screen = 'title' | 'map' | 'level' | 'shop' | 'ach' | 'chal' | 'settings' | 'arsenal' | 'daily';

export interface MenuHooks {
  play: (o: RunOpts) => void;
  setProfile: (p: Profile) => void;
  audio: () => void;
  click: () => void;
}

export class Menu {
  private root = $('menu');
  private body = $('menu-body');
  private shards = $('menu-shards');
  private selected = 0;

  constructor(
    private profile: Profile,
    private h: MenuHooks,
  ) {
    // любой тап по меню — щелчок
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.h.click();
    });
  }

  setProfile(p: Profile) {
    this.profile = p;
  }

  show(screen: Screen = 'title') {
    this.root.hidden = false;
    this.render(screen);
  }

  hide() {
    this.root.hidden = true;
  }

  private render(screen: Screen) {
    this.shards.textContent = `◆ ${this.profile.shards}`;
    this.body.replaceChildren();
    this.root.dataset.screen = screen;
    this.root.scrollTop = 0;
    const map: Record<Screen, () => void> = {
      title: () => this.title(),
      map: () => this.map(),
      level: () => this.level(),
      shop: () => this.shop(),
      ach: () => this.achievements(),
      chal: () => this.challenges(),
      settings: () => this.settings(),
      arsenal: () => this.arsenal(),
      daily: () => this.daily(),
    };
    map[screen]();
  }

  private button(text: string, cls: string, on: () => void) {
    const b = el('button', 'btn ' + cls, text) as HTMLButtonElement;
    b.addEventListener('click', on);
    return b;
  }

  private header(title: string, back: Screen) {
    const head = el('div', 'screen-head');
    head.append(this.button('‹ Назад', 'ghost', () => this.render(back)), el('h2', 'screen-title', title), el('span', 'spacer'));
    this.body.append(head);
  }

  private title() {
    const p = this.profile;
    const box = el('div', 'title-screen');
    const logo = el('div', 'logo');
    logo.append(el('div', 'logo-main', 'NEON HEX'), el('div', 'logo-sub', 'Кибермаги против Бездны'));
    const stars = p.stars.flat().filter(Boolean).length;
    const ach = Object.keys(p.ach).length;
    const d = dailyFor(p);
    const dailyDone = p.daily.key === d.key && p.daily.done;
    const list = el('div', 'title-buttons');
    list.append(
      this.button('Играть', 'primary big', () => this.render('map')),
      this.button(`Испытание дня${dailyDone ? ' ✓' : ''}`, 'daily', () => this.render('daily')),
      this.button('Мастерская', '', () => this.render('shop')),
      this.button('Арсенал', '', () => this.render('arsenal')),
      this.button(`Испытания · ${stars}/15 ★`, '', () => this.render('chal')),
      this.button(`Достижения · ${ach}/${ACHIEVEMENTS.length}`, '', () => this.render('ach')),
      this.button('Настройки', 'ghost', () => this.render('settings')),
    );
    box.append(logo, list, el('div', 'title-foot', `Забегов: ${p.life.runs} · убито: ${p.life.kills} · боссов: ${p.life.bosses} · гоблинов: ${p.life.goblins}`));
    this.body.append(box);
  }

  private unlocked(i: number) {
    return i === 0 || this.profile.won[i - 1];
  }

  private map() {
    this.header('Карта заражения', 'title');
    const map = el('div', 'map');
    LEVELS.forEach((L, i) => {
      const open = this.unlocked(i);
      const tw = this.profile.tierWon[i];
      const node = el('button', 'map-node' + (open ? '' : ' locked') + (this.profile.won[i] ? ' done' : '')) as HTMLButtonElement;
      node.style.setProperty('--glow', L.ground.glow);
      const seal = el('span', 'seal', open ? ROMAN[i] : '🔒');
      const txt = el('span', 'node-text');
      const tiers = tw[2] ? ' · Ад ✓' : tw[1] ? ' · Кошмар ✓' : '';
      txt.append(el('span', 'node-name', L.name), el('span', 'node-sub', open ? L.sub + tiers : 'Пройди предыдущую локацию'));
      const st = el('span', 'node-stars', this.profile.stars[i].map((s) => (s ? '★' : '☆')).join(''));
      node.append(seal, txt, st);
      node.disabled = !open;
      node.addEventListener('click', () => {
        this.selected = i;
        this.render('level');
      });
      map.append(node);
      if (i < LEVELS.length - 1) map.append(el('div', 'map-link' + (this.profile.won[i] ? ' lit' : '')));
    });
    this.body.append(map);
  }

  private classPicker(block: HTMLElement) {
    const p = this.profile;
    if (!classById(p.cls).unlock(p)) p.cls = 'cyber';
    const row = el('div', 'class-row');
    for (const c of CLASSES) {
      const open = c.unlock(p);
      const b = el('button', 'class-opt' + (p.cls === c.id ? ' on' : '') + (open ? '' : ' locked')) as HTMLButtonElement;
      b.style.setProperty('--c', c.pal.t);
      b.append(el('span', 'class-name', c.name), el('span', 'class-pas', open ? c.passive : c.unlockText));
      b.disabled = !open;
      b.addEventListener('click', () => {
        p.cls = c.id;
        saveProfile(p);
        this.render(this.root.dataset.screen as Screen);
      });
      row.append(b);
    }
    block.append(row);
    const cur = classById(p.cls);
    block.append(el('p', 'hint', `${cur.desc} Стартовое оружие: ${ARSENAL.find((w) => w.id === cur.start)?.name ?? cur.start}.`));
  }

  private level() {
    const i = this.selected;
    const L = LEVELS[i];
    const p = this.profile;
    this.header(`${ROMAN[i]} · ${L.name}`, 'map');

    const panel = el('div', 'level-panel');
    panel.style.setProperty('--glow', L.ground.glow);
    panel.append(el('p', 'level-desc', L.desc));

    const mode = el('div', 'block');
    mode.append(el('h3', 'block-title', 'Сложность'));
    if (!tierOpen(p, i, p.tier)) p.tier = 0;
    const tr = el('div', 'tier-row');
    TIERS.forEach((T, t) => {
      const open = tierOpen(p, i, t);
      const b = el('button', 'tier-opt' + (p.tier === t ? ' on' : '') + (open ? '' : ' locked') + ` t${t}`) as HTMLButtonElement;
      b.append(el('span', 'tier-name', (p.tierWon[i][t] ? '✓ ' : '') + T.name), el('span', 'tier-sub', open ? `награды ×${T.reward}` : 'закрыто'));
      b.disabled = !open;
      b.addEventListener('click', () => {
        p.tier = t;
        saveProfile(p);
        this.render('level');
      });
      tr.append(b);
    });
    mode.append(tr);
    const endless = el('button', 'toggle' + (p.endless ? ' on' : '')) as HTMLButtonElement;
    endless.append(el('span', '', 'Бесконечный режим'), el('span', 'toggle-state', p.endless ? 'Вкл' : 'Выкл'));
    endless.addEventListener('click', () => {
      p.endless = !p.endless;
      saveProfile(p);
      this.render('level');
    });
    mode.append(endless);
    mode.append(
      el(
        'p',
        'hint',
        p.endless
          ? `Победы нет: босс возвращается каждые 4 минуты и сильнее. Рекорд: ${p.best[i] ? fmtTime(p.best[i]) : 'нет'}`
          : 'Кошмар открывается победой на Обычной, Ад — победой на Кошмаре',
      ),
    );
    panel.append(mode);

    const cls = el('div', 'block');
    cls.append(el('h3', 'block-title', 'Класс'));
    this.classPicker(cls);
    panel.append(cls);

    const chal = el('div', 'block');
    chal.append(el('h3', 'block-title', 'Испытания'));
    levelChallenges(i).forEach((c, k) => {
      const row = el('div', 'star-line' + (p.stars[i][k] ? ' got' : ''));
      row.append(el('span', 'star', p.stars[i][k] ? '★' : '☆'), el('span', 'star-text', c.text));
      chal.append(row);
    });
    panel.append(chal);

    const best = el('div', 'block');
    best.append(el('h3', 'block-title', 'Бестиарий'));
    const grid = el('div', 'bestiary');
    for (const e of L.enemies) {
      const card = el('div', 'beast');
      card.style.setProperty('--c', e.pal[2]);
      card.append(el('span', 'beast-name', e.name), el('span', 'beast-beh', BEH_NAME[e.beh]));
      grid.append(card);
    }
    const boss = el('div', 'beast boss');
    boss.style.setProperty('--c', L.boss.pal[3]);
    boss.append(el('span', 'beast-name', L.boss.title), el('span', 'beast-beh', 'Босс · появляется на 8:00'));
    grid.append(boss);
    best.append(grid);
    panel.append(best);

    this.body.append(panel);
    const go = el('div', 'btn-row sticky');
    go.append(this.button('В бой', 'primary big', () => this.h.play({ level: i, tier: p.tier, endless: p.endless, daily: null, cls: p.cls })));
    this.body.append(go);
  }

  private daily() {
    const p = this.profile;
    const d = dailyFor(p);
    if (p.daily.key !== d.key) p.daily = { key: d.key, done: false, best: 0, count: p.daily.count };
    this.header('Испытание дня', 'title');
    const panel = el('div', 'level-panel');
    const L = LEVELS[d.level];
    panel.style.setProperty('--glow', L.ground.glow);
    const k = String(todayKey());
    panel.append(el('p', 'level-desc', `${k.slice(6)}.${k.slice(4, 6)}.${k.slice(0, 4)} · ${L.name}. Набор одинаковый весь день — проверь, насколько далеко пройдёшь.`));
    const mods = el('div', 'block');
    mods.append(el('h3', 'block-title', 'Модификаторы'));
    for (const id of d.mods) {
      const m = modById(id);
      const row = el('div', 'mod');
      row.append(el('span', 'mod-name', m.name), el('span', 'mod-desc', m.desc));
      mods.append(row);
    }
    panel.append(mods);
    const rec = el('div', 'block');
    rec.append(el('h3', 'block-title', 'Сегодня'));
    rec.append(el('p', 'hint', p.daily.done ? 'Пройдено ✓ Награда получена, можно бить рекорд' : 'Победи босса — получишь 400 ◆'));
    rec.append(el('p', 'hint', `Лучший результат: ${p.daily.best} убийств · всего пройдено: ${p.daily.count}`));
    panel.append(rec);
    const cls = el('div', 'block');
    cls.append(el('h3', 'block-title', 'Класс'));
    this.classPicker(cls);
    panel.append(cls);
    this.body.append(panel);
    const go = el('div', 'btn-row sticky');
    go.append(this.button('Начать', 'primary big', () => this.h.play({ level: d.level, tier: 0, endless: false, daily: d.mods, cls: p.cls })));
    this.body.append(go);
  }

  private arsenal() {
    this.header('Арсенал', 'title');
    const used = new Set(this.profile.used);
    const list = el('div', 'chal-list');
    for (const id of SCHOOL_ORDER) {
      const S = SCHOOLS[id];
      const block = el('div', 'block');
      block.style.setProperty('--glow', S.css);
      const t = el('h3', 'block-title', S.name);
      t.style.color = S.css;
      block.append(t, el('p', 'hint', `Сет 2: ${S.set2}`), el('p', 'hint', `Сет 4: ${S.set4}`));
      for (const w of ARSENAL.filter((x) => x.school === id)) {
        const card = el('details', 'weapon-card' + (used.has(w.id) ? ' used' : ''));
        const sum = el('summary', 'weapon-sum');
        sum.append(el('span', 'weapon-name', w.name), el('span', 'weapon-desc', w.desc));
        card.append(sum);
        w.perks.forEach((pk, k) => card.append(el('div', 'build-perk', `Ур. ${k + 2}: ${pk}`)));
        card.append(el('div', 'weapon-evo', `★ ${w.evo.name}: ${w.evo.desc}`));
        block.append(card);
      }
      list.append(block);
    }
    this.body.append(list, el('p', 'hint', 'Компиляция: оружие 8 уровня + снаряжение с бонусом его школы'));
  }

  private shop() {
    this.header('Мастерская', 'title');
    const p = this.profile;
    const list = el('div', 'shop');
    for (const item of SHOP) {
      const lvl = shopLevel(p, item.id);
      const max = item.cost.length;
      const row = el('div', 'shop-item');
      const info = el('div', 'shop-info');
      const pips = el('div', 'pips');
      for (let k = 0; k < max; k++) pips.append(el('span', 'pip' + (k < lvl ? ' on' : '')));
      info.append(el('span', 'shop-name', item.name), el('span', 'shop-desc', item.desc), pips);
      row.append(info);
      if (lvl >= max) {
        row.append(el('span', 'shop-max', 'Макс.'));
      } else {
        const cost = item.cost[lvl];
        const b = this.button(`◆ ${cost}`, 'buy', () => {
          if (p.shards < cost) return;
          p.shards -= cost;
          p.shop[item.id] = lvl + 1;
          saveProfile(p);
          this.render('shop');
        });
        b.disabled = p.shards < cost;
        row.append(b);
      }
      list.append(row);
    }
    this.body.append(list);
  }

  private achievements() {
    const p = this.profile;
    this.header(`Достижения · ${Object.keys(p.ach).length}/${ACHIEVEMENTS.length}`, 'title');
    const list = el('div', 'ach-list');
    for (const a of ACHIEVEMENTS) {
      const got = !!p.ach[a.id];
      const row = el('div', 'ach' + (got ? ' got' : ''));
      const info = el('div', 'ach-info');
      info.append(el('span', 'ach-name', a.name), el('span', 'ach-desc', a.desc));
      row.append(el('span', 'ach-icon', got ? '◈' : '◇'), info, el('span', 'ach-reward', `◆ ${a.reward}`));
      list.append(row);
    }
    this.body.append(list);
  }

  private challenges() {
    const p = this.profile;
    this.header('Испытания', 'title');
    const list = el('div', 'chal-list');
    LEVELS.forEach((L, i) => {
      const block = el('div', 'block' + (this.unlocked(i) ? '' : ' dim'));
      block.style.setProperty('--glow', L.ground.glow);
      block.append(el('h3', 'block-title', `${ROMAN[i]} · ${L.name}`));
      levelChallenges(i).forEach((c, k) => {
        const row = el('div', 'star-line' + (p.stars[i][k] ? ' got' : ''));
        row.append(el('span', 'star', p.stars[i][k] ? '★' : '☆'), el('span', 'star-text', c.text), el('span', 'star-reward', `◆ ${50 * (i + 1)}`));
        block.append(row);
      });
      list.append(block);
    });
    this.body.append(list);
  }

  private settings() {
    this.header('Настройки', 'title');
    const p = this.profile;
    const list = el('div', 'settings');
    const cycle = (label: string, names: string[], get: () => number, set: (v: number) => void, after?: () => void) => {
      const b = el('button', 'toggle on') as HTMLButtonElement;
      b.append(el('span', '', label), el('span', 'toggle-state', names[get()]));
      b.addEventListener('click', () => {
        set((get() + 1) % names.length);
        saveProfile(p);
        after?.();
        this.render('settings');
      });
      list.append(b);
    };
    const vols = [0, 0.25, 0.5, 0.75, 1];
    const volIdx = (v: number) => Math.max(0, vols.findIndex((x) => Math.abs(x - v) < 0.01));
    cycle('Музыка', ['Выкл', '25%', '50%', '75%', '100%'], () => volIdx(p.settings.music), (v) => (p.settings.music = vols[v]), this.h.audio);
    cycle('Звуки', ['Выкл', '25%', '50%', '75%', '100%'], () => volIdx(p.settings.sfx), (v) => (p.settings.sfx = vols[v]), this.h.audio);
    cycle('Яркость', ['Тёмная', 'Обычная', 'Яркая'], () => p.settings.bright, (v) => (p.settings.bright = v));
    cycle('Качество', ['Низкое', 'Среднее', 'Высокое'], () => p.settings.quality, (v) => (p.settings.quality = v), () => location.reload());

    const toggle = (label: string, key: 'bloom' | 'shake' | 'numbers') => {
      const row = el('button', 'toggle' + (p.settings[key] ? ' on' : '')) as HTMLButtonElement;
      row.append(el('span', '', label), el('span', 'toggle-state', p.settings[key] ? 'Вкл' : 'Выкл'));
      row.addEventListener('click', () => {
        p.settings[key] = !p.settings[key];
        saveProfile(p);
        this.render('settings');
      });
      list.append(row);
    };
    toggle('Свечение (bloom)', 'bloom');
    toggle('Тряска экрана', 'shake');
    toggle('Цифры урона', 'numbers');
    list.append(el('p', 'hint', 'Тормозит на телефоне — снизь качество или выключи свечение. Звука нет — проверь бесшумный режим на iPhone.'));

    const save = el('div', 'block');
    save.append(el('h3', 'block-title', 'Перенос сохранения'));
    save.append(el('p', 'hint', 'Иконка на домашнем экране хранит прогресс отдельно от Safari. Скопируй код здесь и вставь его там.'));
    const area = el('textarea', 'save-code') as HTMLTextAreaElement;
    area.readOnly = true;
    area.hidden = true;
    const row = el('div', 'btn-row');
    row.append(
      this.button('Скопировать код', '', () => {
        area.value = exportCode(p);
        area.hidden = false;
        area.select();
        navigator.clipboard?.writeText(area.value).catch(() => undefined);
      }),
      this.button('Вставить код', '', () => {
        const code = window.prompt('Вставь код сохранения');
        if (!code) return;
        const np = importCode(code);
        if (!np) {
          window.alert('Код не подошёл — проверь, что скопирован целиком');
          return;
        }
        saveProfile(np);
        this.profile = np;
        this.h.setProfile(np);
        this.render('title');
      }),
    );
    save.append(row, area);
    list.append(save);

    let armed = false;
    const reset = this.button('Сбросить прогресс', 'danger', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Точно? Нажми ещё раз';
        return;
      }
      const fresh = resetProfile();
      this.profile = fresh;
      this.h.setProfile(fresh);
      this.render('title');
    });
    list.append(reset);
    this.body.append(list);
  }
}
