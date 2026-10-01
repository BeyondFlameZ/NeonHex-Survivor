import { $, el } from './hud';
import { BEH_NAME, levelChallenges, LEVELS } from './levels';
import { ACHIEVEMENTS, SHOP, shopLevel, startOptions } from './meta';
import { resetProfile, saveProfile, type Profile } from './save';
import { SCHOOLS } from './schools';
import { byId } from './weapons';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

type Screen = 'title' | 'map' | 'level' | 'shop' | 'ach' | 'chal' | 'settings';

export class Menu {
  private root = $('menu');
  private body = $('menu-body');
  private shards = $('menu-shards');
  private selected = 0;

  constructor(
    private profile: Profile,
    private h: { play: (level: number, start: string) => void; setProfile: (p: Profile) => void },
  ) {}

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
    switch (screen) {
      case 'title':
        return this.title();
      case 'map':
        return this.map();
      case 'level':
        return this.level();
      case 'shop':
        return this.shop();
      case 'ach':
        return this.achievements();
      case 'chal':
        return this.challenges();
      case 'settings':
        return this.settings();
    }
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
    const list = el('div', 'title-buttons');
    list.append(
      this.button('Играть', 'primary big', () => this.render('map')),
      this.button('Мастерская', '', () => this.render('shop')),
      this.button(`Испытания · ${stars}/15 ★`, '', () => this.render('chal')),
      this.button(`Достижения · ${ach}/${ACHIEVEMENTS.length}`, '', () => this.render('ach')),
      this.button('Настройки', 'ghost', () => this.render('settings')),
    );
    box.append(logo, list, el('div', 'title-foot', `Забегов: ${p.life.runs} · убито: ${p.life.kills} · боссов: ${p.life.bosses}`));
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
      const node = el('button', 'map-node' + (open ? '' : ' locked') + (this.profile.won[i] ? ' done' : '')) as HTMLButtonElement;
      node.style.setProperty('--glow', L.ground.glow);
      const seal = el('span', 'seal', open ? ROMAN[i] : '🔒');
      const txt = el('span', 'node-text');
      txt.append(el('span', 'node-name', L.name), el('span', 'node-sub', open ? L.sub : 'Пройди предыдущую локацию'));
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

  private level() {
    const i = this.selected;
    const L = LEVELS[i];
    const p = this.profile;
    this.header(`${ROMAN[i]} · ${L.name}`, 'map');

    const panel = el('div', 'level-panel');
    panel.style.setProperty('--glow', L.ground.glow);
    panel.append(el('p', 'level-desc', L.desc));

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

    const start = el('div', 'block');
    start.append(el('h3', 'block-title', 'Стартовый скрипт'));
    const opts = startOptions(p);
    if (!opts.includes(p.start)) p.start = 'bolt';
    const row = el('div', 'start-row');
    for (const id of opts) {
      const w = byId(id);
      if (!w) continue;
      const b = el('button', 'start-opt' + (p.start === id ? ' on' : '')) as HTMLButtonElement;
      b.style.setProperty('--c', SCHOOLS[w.school].css);
      b.append(el('span', 'start-name', w.name), el('span', 'start-school', SCHOOLS[w.school].name));
      b.addEventListener('click', () => {
        p.start = id;
        saveProfile(p);
        this.render('level');
      });
      row.append(b);
    }
    start.append(row);
    if (opts.length < 6) start.append(el('p', 'hint', 'Новые стартовые скрипты открываются за первую победу на каждой локации'));
    panel.append(start);

    this.body.append(panel);
    const go = el('div', 'btn-row sticky');
    go.append(this.button('В бой', 'primary big', () => this.h.play(i, p.start)));
    this.body.append(go);
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
    const toggle = (label: string, key: keyof Profile['settings']) => {
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
    list.append(el('p', 'hint', 'Если игра тормозит на телефоне — выключи свечение'));

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
