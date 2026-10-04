import { LEVELS } from '../game/content.js';
import { FLAG_TEXT, HEROES, heroById, IMPLANTS, modText, PROTOCOLS, SLOT_SHORT, TALENT_LEVEL } from '../game/heroes.js';
import { GOBLIN } from '../game/content.js';
import { TIERS } from '../game/run.js';
import {
  buyHero,
  claimPass,
  claimQuest,
  heroLevelCost,
  levelHero,
  MAX_HERO_LEVEL,
  PASS_LEVELS,
  PASS_STEP,
  passLevel,
  passReward,
  QUEST_REWARD,
  resetProfile,
  saveProfile,
  tierOpen,
  unlocked,
  type Profile,
} from '../meta/meta.js';
import { $, describe, el } from './hud.js';
import { PORTRAIT } from './portraits.js';
import type { Showcase } from './showcase.js';

type Screen = 'home' | 'heroes' | 'codex' | 'pass' | 'locations' | 'settings' | 'c-heroes' | 'c-implants' | 'c-protos' | 'c-enemies';

export interface MenuHooks {
  play: () => void;
  setProfile: (p: Profile) => void;
  settings: () => void;
  click: () => void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export class Menu {
  private root = $('menu');
  private body = $('menu-body');
  screen: Screen = 'home';
  offset = 0;
  private heroSel = 'volt';
  private heroTab: 'data' | 'talents' | 'lore' = 'data';

  constructor(
    private p: Profile,
    private show: Showcase,
    private h: MenuHooks,
  ) {
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.h.click();
    });
    $('top-settings').addEventListener('click', () => this.go('settings'));
    $('top-home').addEventListener('click', () => this.go('home'));
  }

  setProfile(p: Profile) {
    this.p = p;
  }

  open(screen: Screen = 'home') {
    this.root.hidden = false;
    this.go(screen);
  }

  hide() {
    this.root.hidden = true;
  }

  back() {
    if (this.screen.startsWith('c-')) return this.go('codex');
    if (this.screen !== 'home') return this.go('home');
    return false;
  }

  go(s: Screen) {
    this.screen = s;
    this.root.dataset.screen = s;
    this.body.replaceChildren();
    this.top();
    this.show.hero = s === 'heroes' ? this.heroSel : this.p.hero;
    this.offset = s === 'heroes' ? -0.9 : 0;
    const fn: Record<Screen, () => void> = {
      home: () => this.home(),
      heroes: () => this.heroes(),
      codex: () => this.codex(),
      pass: () => this.pass(),
      locations: () => this.locations(),
      settings: () => this.settingsScreen(),
      'c-heroes': () => this.codexHeroes(),
      'c-implants': () => this.codexImplants(),
      'c-protos': () => this.codexProtos(),
      'c-enemies': () => this.codexEnemies(),
    };
    fn[s]();
    return true;
  }

  private top() {
    $('top-credits').textContent = String(this.p.credits);
    $('top-cores').textContent = String(this.p.cores);
    $('top-pass').textContent = `Пропуск · ${passLevel(this.p)}`;
    $('top-home').hidden = this.screen === 'home';
  }

  private btn(text: string, cls: string, fn: () => void) {
    const b = el('button', 'btn ' + cls, text) as HTMLButtonElement;
    b.addEventListener('click', fn);
    return b;
  }

  private title(text: string) {
    this.body.append(el('div', 'screen-title', text));
  }

  // ---------- хаб ----------

  private home() {
    const p = this.p;
    const hero = heroById(p.hero);
    const left = el('div', 'hub-side');
    const side = (icon: string, text: string, s: Screen, badge = '') => {
      const b = el('button', 'side-btn') as HTMLButtonElement;
      b.append(el('span', 'side-icon', icon), el('span', 'side-text', text));
      if (badge) b.append(el('span', 'side-badge', badge));
      b.onclick = () => this.go(s);
      left.append(b);
    };
    const claimable = this.passClaimable();
    side('⚔', 'Герои', 'heroes');
    side('◫', 'Справочник', 'codex');
    side('★', 'Пропуск', 'pass', claimable ? String(claimable) : '');
    side('⌖', 'Локации', 'locations');
    this.body.append(left);

    const name = el('div', 'hub-hero');
    name.append(el('div', 'hub-hero-name', hero.name), el('div', 'hub-hero-title', `${hero.title} · ур. ${p.heroes[hero.id]?.lvl ?? 1}`));
    this.body.append(name);

    const quests = el('div', 'panel quests');
    quests.append(el('div', 'panel-title', 'Задания дня'));
    p.quests.list.forEach((q, i) => {
      const row = el('div', 'quest' + (q.done ? ' done' : '') + (q.claimed ? ' claimed' : ''));
      const bar = el('div', 'qbar');
      const fill = el('div', 'qfill');
      fill.style.width = `${(q.prog / q.goal) * 100}%`;
      bar.append(fill);
      row.append(el('div', 'quest-text', q.text), bar, el('div', 'quest-prog', `${q.prog}/${q.goal}`));
      if (q.done && !q.claimed) {
        row.append(this.btn(`Забрать ⬡${QUEST_REWARD.credits}`, 'small primary', () => {
          claimQuest(p, i);
          this.go('home');
        }));
      } else if (q.claimed) row.append(el('div', 'quest-ok', '✓'));
      quests.append(row);
    });
    this.body.append(quests);

    const L = LEVELS[p.level];
    const loc = el('button', 'loc-card') as HTMLButtonElement;
    loc.style.setProperty('--g', L.ground.glow);
    loc.append(el('div', 'loc-sub', `${ROMAN[p.level]} · ${L.sub}`), el('div', 'loc-name', L.name), el('div', 'loc-tier', TIERS[p.tier].name));
    loc.onclick = () => this.go('locations');
    this.body.append(loc);

    const go = this.btn('В БОЙ', 'primary big play', () => this.h.play());
    this.body.append(go);
  }

  private passClaimable() {
    const p = this.p;
    const lvl = passLevel(p);
    let n = 0;
    for (let k = 1; k <= lvl; k++) if (!p.pass.claimed.includes(k)) n++;
    return n;
  }

  // ---------- герои ----------

  private heroes() {
    const p = this.p;
    const list = el('div', 'hero-list');
    for (const h of HEROES) {
      const own = p.heroes[h.id];
      const b = el('button', 'hero-card' + (h.id === this.heroSel ? ' sel' : '') + (own ? '' : ' locked')) as HTMLButtonElement;
      b.style.setProperty('--c', h.look.glow);
      const dot = el('span', 'hero-dot', PORTRAIT[h.id] ? '' : h.name.slice(0, 1));
      if (PORTRAIT[h.id]) dot.style.backgroundImage = `url(${PORTRAIT[h.id]})`;
      b.append(dot, el('span', 'hero-name', h.name), el('span', 'hero-lv', own ? `ур. ${own.lvl}` : `⬡ ${h.cost}`));
      if (p.hero === h.id) b.append(el('span', 'hero-active', 'В БОЮ'));
      b.onclick = () => {
        this.heroSel = h.id;
        this.go('heroes');
      };
      list.append(b);
    }
    this.body.append(list);

    const h = heroById(this.heroSel);
    const own = p.heroes[h.id];
    const panel = el('div', 'panel hero-panel');
    panel.style.setProperty('--c', h.look.glow);
    panel.append(el('div', 'hp-name', h.name), el('div', 'hp-title', h.title));
    const tabs = el('div', 'tabs');
    for (const [k, t] of [['data', 'Данные'], ['talents', 'Таланты'], ['lore', 'История']] as const) {
      const b = el('button', 'tab' + (this.heroTab === k ? ' on' : ''), t) as HTMLButtonElement;
      b.onclick = () => {
        this.heroTab = k;
        this.go('heroes');
      };
      tabs.append(b);
    }
    panel.append(tabs);
    const content = el('div', 'tab-body');
    if (this.heroTab === 'data') {
      const w = h.weapon;
      const item = (k: string, name: string, desc: string) => {
        const r = el('div', 'kit');
        r.append(el('div', 'kit-k', k), el('div', 'kit-name', name), el('div', 'kit-desc', desc));
        content.append(r);
      };
      item('Оружие', w.name, w.desc);
      item('Умение', h.skill.name, `${h.skill.desc} · перезарядка ${h.skill.cd} с`);
      item('Пассивка', h.passive.name, h.passive.desc);
      item('Сет имплантов', `${h.name} (В/Ц/Н)`, `2 части: ${h.set2.text}. 3 части: ${h.set3.text}`);
      const lv = own?.lvl ?? 1;
      content.append(el('div', 'kit-stats', `Урон +${(lv - 1) * 4}% · Здоровье +${(lv - 1) * 5}`));
    } else if (this.heroTab === 'talents') {
      const lv = own?.lvl ?? 0;
      h.talents.forEach((row, tier) => {
        const need = TALENT_LEVEL[tier];
        const open = !!own && lv >= need;
        const r = el('div', 'tal-row' + (open ? '' : ' locked'));
        r.append(el('div', 'tal-tier', open ? `★ ${tier + 1}` : `🔒 ур.${need}`));
        row.forEach((t, k) => {
          const on = own?.talents[tier] === k;
          const b = el('button', 'tal' + (on ? ' on' : '')) as HTMLButtonElement;
          b.append(el('span', 'tal-name', t.name), el('span', 'tal-desc', [...modText(t.mods), ...(t.flag ? [FLAG_TEXT[t.flag]] : [])].join(', ')));
          b.disabled = !open;
          b.onclick = () => {
            if (!own) return;
            own.talents[tier] = on ? -1 : k;
            saveProfile(p);
            this.go('heroes');
          };
          r.append(b);
        });
        content.append(r);
      });
    } else content.append(el('p', 'lore-text', h.lore));
    panel.append(content);

    const act = el('div', 'hero-actions');
    if (!own) {
      const b = this.btn(`Открыть · ⬡ ${h.cost}`, 'primary', () => {
        if (buyHero(p, h.id)) this.go('heroes');
      });
      b.disabled = p.credits < h.cost;
      act.append(b);
    } else {
      if (own.lvl < MAX_HERO_LEVEL) {
        const cost = heroLevelCost(own.lvl);
        const b = this.btn(`Улучшить до ${own.lvl + 1} · ⬡ ${cost}`, '', () => {
          if (levelHero(p, h.id)) this.go('heroes');
        });
        b.disabled = p.credits < cost;
        act.append(b);
      } else act.append(el('div', 'maxed', 'Максимальный уровень'));
      if (p.hero !== h.id) {
        act.append(this.btn('Выбрать', 'primary', () => {
          p.hero = h.id;
          saveProfile(p);
          this.go('heroes');
        }));
      }
    }
    panel.append(act);
    this.body.append(panel);
  }

  // ---------- справочник ----------

  private codex() {
    const p = this.p;
    this.title('Справочник');
    const enemiesTotal = LEVELS.reduce((s, L) => s + L.enemies.length + 1, 0) + 1;
    const seen = Object.keys(p.codex.enemies).length;
    const grid = el('div', 'codex-grid');
    const tile = (big: boolean, label: string, count: string, icon: string, s: Screen) => {
      const b = el('button', 'codex-tile' + (big ? ' big' : '')) as HTMLButtonElement;
      b.append(el('span', 'ct-icon', icon), el('span', 'ct-count', count), el('span', 'ct-label', label));
      b.onclick = () => this.go(s);
      grid.append(b);
    };
    tile(true, 'Герои', `${Object.keys(p.heroes).length}/${HEROES.length}`, '⚔', 'c-heroes');
    tile(true, 'Импланты', `${p.codex.implants.length}/${IMPLANTS.length}`, '◈', 'c-implants');
    tile(false, 'Протоколы', `${p.codex.protos.length}/${PROTOCOLS.length}`, '⚙', 'c-protos');
    tile(false, 'Противники', `${seen}/${enemiesTotal}`, '☠', 'c-enemies');
    this.body.append(grid);
  }

  private codexHeroes() {
    this.title('Герои');
    const list = el('div', 'clist');
    for (const h of HEROES) {
      const row = el('div', 'crow' + (this.p.heroes[h.id] ? '' : ' dim'));
      row.style.setProperty('--c', h.look.glow);
      row.append(el('div', 'crow-name', `${h.name} — ${h.title}`), el('div', 'crow-desc', `${h.weapon.name}: ${h.weapon.desc}. Умение: ${h.skill.name}.`));
      list.append(row);
    }
    this.body.append(list);
  }

  private codexImplants() {
    this.title('Импланты');
    const list = el('div', 'clist');
    for (const imp of IMPLANTS) {
      const got = this.p.codex.implants.includes(imp.id);
      const d = describe({ kind: 'implant', id: imp.id, level: 1 });
      const row = el('div', 'crow' + (got ? '' : ' dim'));
      row.style.setProperty('--c', d.color);
      row.append(el('div', 'crow-name', got ? d.title : `??? (${SLOT_SHORT[imp.slot]})`), el('div', 'crow-desc', got ? d.lines.join(' · ') : 'Найди в забеге, чтобы узнать'));
      list.append(row);
    }
    this.body.append(list);
  }

  private codexProtos() {
    this.title('Протоколы');
    const list = el('div', 'clist');
    for (const pr of PROTOCOLS) {
      const got = this.p.codex.protos.includes(pr.id);
      const d = describe({ kind: 'proto', id: pr.id, level: 1 });
      const row = el('div', 'crow' + (got ? '' : ' dim'));
      row.style.setProperty('--c', d.color);
      row.append(el('div', 'crow-name', got ? `${pr.icon} ${pr.name}` : '???'), el('div', 'crow-desc', got ? `${pr.tags.join(', ')} — ${d.lines.join(' · ')}` : 'Найди в забеге, чтобы узнать'));
      list.append(row);
    }
    this.body.append(list);
  }

  private codexEnemies() {
    this.title('Противники');
    const list = el('div', 'clist');
    const all = [...LEVELS.flatMap((L) => [...L.enemies, L.boss]), GOBLIN];
    for (const e of all) {
      const k = this.p.codex.enemies[e.name] ?? 0;
      const row = el('div', 'crow' + (k ? '' : ' dim'));
      row.style.setProperty('--c', e.pal[2]);
      row.append(el('div', 'crow-name', k ? e.name : '???'), el('div', 'crow-desc', k ? `Убито: ${k}` : 'Ещё не встречен'));
      list.append(row);
    }
    this.body.append(list);
  }

  // ---------- боевой пропуск ----------

  private pass() {
    const p = this.p;
    const lvl = passLevel(p);
    this.title('Боевой пропуск');
    const head = el('div', 'panel pass-head');
    const bar = el('div', 'qbar');
    const fill = el('div', 'qfill');
    fill.style.width = `${lvl >= PASS_LEVELS ? 100 : ((p.pass.xp % PASS_STEP) / PASS_STEP) * 100}%`;
    bar.append(fill);
    head.append(el('div', 'pass-lvl', `Уровень ${lvl} / ${PASS_LEVELS}`), bar, el('div', 'pass-note', p.vip ? 'VIP активен: премиальная линия открыта, кредиты ×1,5' : 'Премиальная линия откроется с VIP (скоро)'));
    this.body.append(head);
    const list = el('div', 'pass-list');
    for (let k = 1; k <= PASS_LEVELS; k++) {
      const row = el('div', 'pass-row' + (k <= lvl ? ' reached' : ''));
      row.append(el('div', 'pass-n', String(k)));
      for (const prem of [false, true]) {
        const r = passReward(k, prem);
        const claimed = (prem ? p.pass.claimedP : p.pass.claimed).includes(k);
        const cell = el('div', 'pass-cell' + (prem ? ' prem' : '') + (claimed ? ' got' : ''));
        cell.append(el('span', 'pass-rew', r.text));
        if (!claimed && k <= lvl && (!prem || p.vip)) {
          cell.append(this.btn('Забрать', 'small primary', () => {
            claimPass(p, k, prem);
            this.go('pass');
          }));
        } else if (claimed) cell.append(el('span', 'quest-ok', '✓'));
        else if (prem && !p.vip) cell.append(el('span', 'lock', '🔒'));
        row.append(cell);
      }
      list.append(row);
    }
    this.body.append(list);
  }

  // ---------- локации ----------

  private locations() {
    const p = this.p;
    this.title('Локации');
    const list = el('div', 'loc-list');
    LEVELS.forEach((L, i) => {
      const open = unlocked(p, i);
      const card = el('div', 'loc-big' + (open ? '' : ' locked') + (p.level === i ? ' sel' : ''));
      card.style.setProperty('--g', L.ground.glow);
      card.append(el('div', 'loc-sub', `${ROMAN[i]} · ${L.sub}`), el('div', 'loc-name', L.name), el('div', 'loc-desc', open ? L.desc : 'Победи босса предыдущей локации'));
      const tiers = el('div', 'tier-row');
      TIERS.forEach((T, t) => {
        const ok = open && tierOpen(p, i, t);
        const b = el('button', 'tier' + (p.level === i && p.tier === t ? ' on' : '') + (p.won[i][t] ? ' won' : ''), (p.won[i][t] ? '✓ ' : '') + T.name) as HTMLButtonElement;
        b.disabled = !ok;
        b.onclick = () => {
          p.level = i;
          p.tier = t;
          saveProfile(p);
          this.go('locations');
        };
        tiers.append(b);
      });
      card.append(tiers);
      list.append(card);
    });
    this.body.append(list);
    this.body.append(this.btn('В БОЙ', 'primary big play', () => this.h.play()));
  }

  // ---------- настройки ----------

  private settingsScreen() {
    const p = this.p;
    this.title('Настройки');
    const list = el('div', 'panel settings');
    const vols = [0, 0.25, 0.5, 0.75, 1];
    const vname = ['Выкл', '25%', '50%', '75%', '100%'];
    const cyc = (label: string, value: string, fn: () => void) => {
      const b = el('button', 'set-row') as HTMLButtonElement;
      b.append(el('span', '', label), el('span', 'set-v', value));
      b.onclick = () => {
        fn();
        saveProfile(p);
        this.h.settings();
        this.go('settings');
      };
      list.append(b);
    };
    const vi = (v: number) => Math.max(0, vols.findIndex((x) => Math.abs(x - v) < 0.01));
    cyc('Музыка', vname[vi(p.settings.music)], () => (p.settings.music = vols[(vi(p.settings.music) + 1) % 5]));
    cyc('Звуки', vname[vi(p.settings.sfx)], () => (p.settings.sfx = vols[(vi(p.settings.sfx) + 1) % 5]));
    cyc('Качество', ['Низкое', 'Среднее', 'Высокое'][p.settings.quality], () => (p.settings.quality = (p.settings.quality + 1) % 3));
    cyc('Цифры урона', p.settings.numbers ? 'Вкл' : 'Выкл', () => (p.settings.numbers = !p.settings.numbers));
    cyc('Вибрация', p.settings.haptics ? 'Вкл' : 'Выкл', () => (p.settings.haptics = !p.settings.haptics));
    let armed = false;
    const reset = this.btn('Сбросить прогресс', 'danger', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Точно? Нажми ещё раз';
        return;
      }
      this.p = resetProfile();
      this.h.setProfile(this.p);
      this.go('home');
    });
    list.append(reset);
    this.body.append(list);
  }
}
