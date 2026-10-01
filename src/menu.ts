import { CLASSES, classById } from './classes';
import { $, el, fmtTime } from './hud';
import { BEH_NAME, levelChallenges, LEVELS } from './levels';
import { ACHIEVEMENTS, SHOP, shopLevel } from './meta';
import { INTRO, LORE, loreNeed } from './lore';
import { dailyFor, modById, riftDmg, riftHp, riftLevel, TIERS, tierOpen, todayKey, type RunOpts } from './modes';
import { canAlloc, NODES, PCENTER, paragonLevel, PSIZE, statLabel } from './paragon';
import { gemById, gemKey, GEMS, parseGem } from './relics';
import { SKINS } from './skins';
import { legendById } from './stats';
import { exitApp, isNative } from './native';
import { exportCode, importCode, resetProfile, saveProfile, type Profile } from './save';
import { SCHOOL_ORDER, SCHOOLS } from './schools';
import { ARSENAL } from './weapons';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

type Screen = 'title' | 'map' | 'level' | 'shop' | 'ach' | 'chal' | 'settings' | 'arsenal' | 'daily' | 'paragon' | 'relics' | 'bestiary' | 'rift' | 'records' | 'intro';

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
  private pSel = PCENTER;
  private rSel = '';
  private riftSel = 1;
  private pending: RunOpts | null = null;

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

  // кнопка «Назад» на Android: из любого экрана — на титул, с титула — выход
  back() {
    const screen = this.root.dataset.screen;
    if (screen === 'map' || screen === 'rift' || screen === 'daily') return this.render('title');
    if (screen === 'level') return this.render('map');
    if (screen && screen !== 'title') return this.render('title');
    void exitApp();
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
      paragon: () => this.paragon(),
      relics: () => this.relics(),
      bestiary: () => this.bestiary(),
      rift: () => this.riftScreen(),
      records: () => this.records(),
      intro: () => this.intro(),
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

  private go(o: RunOpts) {
    if (!o.rift && !o.daily && !this.profile.intro[o.level]) {
      this.pending = o;
      this.render('intro');
      return;
    }
    this.h.play(o);
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
    const pl = paragonLevel(p.paragon.xp).lvl;
    const free = pl - p.paragon.alloc.length;
    const list = el('div', 'title-buttons');
    const row = el('div', 'title-grid');
    row.append(
      this.button(`Великие порталы${p.rift.best ? ` · ${p.rift.best}` : ''}`, 'daily', () => this.render('rift')),
      this.button(`Испытание дня${dailyDone ? ' ✓' : ''}`, 'daily', () => this.render('daily')),
    );
    const grid = el('div', 'title-grid');
    grid.append(
      this.button(`Парагон ${pl}${free > 0 ? ` (+${free})` : ''}`, free > 0 ? 'glow' : '', () => this.render('paragon')),
      this.button(`Реликвии · ${p.relics.inv.length}`, '', () => this.render('relics')),
      this.button('Мастерская', '', () => this.render('shop')),
      this.button('Арсенал', '', () => this.render('arsenal')),
      this.button('Бестиарий', '', () => this.render('bestiary')),
      this.button(`Испытания · ${stars}/15 ★`, '', () => this.render('chal')),
      this.button(`Достижения · ${ach}/${ACHIEVEMENTS.length}`, '', () => this.render('ach')),
      this.button('Рекорды', '', () => this.render('records')),
    );
    list.append(this.button('Играть', 'primary big', () => this.render('map')), row, grid, this.button('Настройки', 'ghost', () => this.render('settings')));
    box.append(logo, list, el('div', 'title-foot', `Забегов: ${p.life.runs} · убито: ${p.life.kills} · боссов: ${p.life.bosses} · гоблинов: ${p.life.goblins}`));
    this.body.append(box);
  }

  private intro() {
    const o = this.pending;
    if (!o) return this.render('map');
    const L = LEVELS[o.level];
    const box = el('div', 'intro');
    box.style.setProperty('--glow', L.ground.glow);
    box.append(el('div', 'intro-roman', ROMAN[o.level]), el('h2', 'intro-title', L.name));
    INTRO[o.level].forEach((line, k) => {
      const ln = el('p', 'intro-line', line);
      ln.style.animationDelay = `${0.4 + k * 1.1}s`;
      box.append(ln);
    });
    const btn = this.button('В бой', 'primary big intro-go', () => {
      this.profile.intro[o.level] = true;
      saveProfile(this.profile);
      this.pending = null;
      this.h.play(o);
    });
    btn.style.animationDelay = `${0.4 + INTRO[o.level].length * 1.1}s`;
    box.append(btn);
    this.body.append(box);
  }

  private paragon() {
    const p = this.profile;
    const pl = paragonLevel(p.paragon.xp);
    const free = pl.lvl - p.paragon.alloc.length;
    this.header(`Парагон · ${pl.lvl}`, 'title');
    const info = el('div', 'block');
    info.append(el('p', 'hint', `Свободных очков: ${free} · до следующего уровня ${pl.need - pl.into} опыта`));
    const xp = el('div', 'pbar');
    const fill = el('div', 'pbar-fill');
    fill.style.width = `${(pl.into / pl.need) * 100}%`;
    xp.append(fill);
    info.append(xp);
    const node = NODES[this.pSel];
    const taken = this.pSel === PCENTER || p.paragon.alloc.includes(this.pSel);
    const det = el('div', 'pdetail ' + node.kind);
    det.append(el('span', 'pdetail-name', node.name), ...node.stats.map(([k, v]) => el('span', 'build-perk', statLabel(k, v))));
    if (!taken) {
      const can = canAlloc(p.paragon.alloc, this.pSel) && free > 0;
      const b = this.button(can ? 'Изучить' : free > 0 ? 'Нужен соседний изученный узел' : 'Нет свободных очков', can ? 'primary' : '', () => {
        if (!can) return;
        p.paragon.alloc.push(this.pSel);
        saveProfile(p);
        this.render('paragon');
      });
      b.disabled = !can;
      det.append(b);
    } else det.append(el('span', 'hint', this.pSel === PCENTER ? 'Отсюда начинается путь' : 'Изучено'));
    info.append(det);
    this.body.append(info);

    const board = el('div', 'pboard');
    board.style.gridTemplateColumns = `repeat(${PSIZE}, 1fr)`;
    for (const nd of NODES) {
      const on = nd.i === PCENTER || p.paragon.alloc.includes(nd.i);
      const avail = !on && canAlloc(p.paragon.alloc, nd.i);
      const b = el('button', `pnode ${nd.kind}${on ? ' on' : ''}${avail ? ' avail' : ''}${nd.i === this.pSel ? ' sel' : ''}`) as HTMLButtonElement;
      b.textContent = nd.kind === 'glyph' ? '✦' : nd.kind === 'start' ? '◉' : nd.kind === 'rare' ? '◆' : '•';
      b.addEventListener('click', () => {
        this.pSel = nd.i;
        this.render('paragon');
      });
      board.append(b);
    }
    this.body.append(board);
    const reset = this.button('Сбросить доску · ◆ 200', 'ghost', () => {
      if (p.shards < 200 || !p.paragon.alloc.length) return;
      p.shards -= 200;
      p.paragon.alloc = [];
      saveProfile(p);
      this.render('paragon');
    });
    this.body.append(el('div', 'btn-row'), reset);
  }

  private relicCard(id: string, parent: HTMLElement) {
    const p = this.profile;
    const r = p.relics.inv.find((x) => x.id === id);
    if (!r) return;
    const leg = legendById(r.leg);
    const eqSlot = p.relics.eq.indexOf(r.id);
    const card = el('button', 'relic' + (this.rSel === r.id ? ' sel' : '') + (eqSlot >= 0 ? ' eq' : '')) as HTMLButtonElement;
    card.append(el('span', 'relic-name', `${leg?.name ?? r.leg}${eqSlot >= 0 ? ' · надета' : ''}`), el('span', 'relic-desc', leg?.desc ?? ''));
    const socks = el('span', 'relic-socks');
    for (const g of r.sockets) {
      const dot = el('span', 'sock' + (g ? ' full' : ''), g ? '◆' : '◇');
      if (g) dot.style.color = gemById(parseGem(g).id).css;
      socks.append(dot);
    }
    card.append(socks);
    card.addEventListener('click', () => {
      this.rSel = this.rSel === r.id ? '' : r.id;
      this.render('relics');
    });
    parent.append(card);
  }

  private relics() {
    const p = this.profile;
    this.header('Реликвии', 'title');
    this.body.append(el('p', 'hint', 'Реликвии — вечные легендарки: две надетые работают в каждом забеге. Падают с боссов и из Великих порталов. В гнёзда вставляются камни.'));

    const eq = el('div', 'block');
    eq.append(el('h3', 'block-title', 'Надето'));
    p.relics.eq.forEach((id, k) => {
      if (id && p.relics.inv.some((r) => r.id === id)) this.relicCard(id, eq);
      else eq.append(el('div', 'relic empty', `Слот ${k + 1} пуст`));
    });
    this.body.append(eq);

    const sel = p.relics.inv.find((r) => r.id === this.rSel);
    if (sel) {
      const act = el('div', 'block');
      act.append(el('h3', 'block-title', legendById(sel.leg)?.name ?? ''));
      const row = el('div', 'btn-row');
      const slot = p.relics.eq.indexOf(sel.id);
      if (slot >= 0) {
        row.append(this.button('Снять', '', () => {
          p.relics.eq[slot] = null;
          saveProfile(p);
          this.render('relics');
        }));
      } else {
        [0, 1].forEach((k) =>
          row.append(this.button(`Надеть в слот ${k + 1}`, 'primary', () => {
            p.relics.eq[k] = sel.id;
            saveProfile(p);
            this.render('relics');
          })),
        );
        row.append(this.button('Разобрать · +◆ 100', 'danger', () => {
          for (const g of sel.sockets) if (g) p.gems[g] = (p.gems[g] ?? 0) + 1;
          p.relics.inv = p.relics.inv.filter((r) => r.id !== sel.id);
          p.shards += 100;
          this.rSel = '';
          saveProfile(p);
          this.render('relics');
        }));
      }
      act.append(row);
      sel.sockets.forEach((g, k) => {
        if (g) {
          const { id, lvl } = parseGem(g);
          act.append(this.button(`Вынуть: ${gemById(id).name} ${lvl} · ${gemById(id).text(lvl)}`, 'small', () => {
            p.gems[g] = (p.gems[g] ?? 0) + 1;
            sel.sockets[k] = null;
            saveProfile(p);
            this.render('relics');
          }));
        } else {
          const gr = el('div', 'gem-pick');
          gr.append(el('span', 'hint', `Гнездо ${k + 1}:`));
          for (const [key, cnt] of Object.entries(p.gems)) {
            if (cnt <= 0) continue;
            const { id, lvl } = parseGem(key);
            const b = this.button(`${gemById(id).name} ${lvl}`, 'small gem', () => {
              p.gems[key]--;
              sel.sockets[k] = key;
              saveProfile(p);
              this.render('relics');
            });
            b.style.color = gemById(id).css;
            gr.append(b);
          }
          if (gr.children.length === 1) gr.append(el('span', 'hint', 'нет камней'));
          act.append(gr);
        }
      });
      this.body.append(act);
    }

    const inv = el('div', 'block');
    inv.append(el('h3', 'block-title', `Хранилище · ${p.relics.inv.length}/20`));
    if (!p.relics.inv.length) inv.append(el('p', 'hint', 'Пока пусто. Убивай боссов!'));
    for (const r of p.relics.inv) if (!p.relics.eq.includes(r.id)) this.relicCard(r.id, inv);
    this.body.append(inv);

    const gems = el('div', 'block');
    gems.append(el('h3', 'block-title', 'Камни'));
    let any = false;
    for (const g of GEMS) {
      for (let lvl = 1; lvl <= 5; lvl++) {
        const key = gemKey(g.id, lvl);
        const cnt = p.gems[key] ?? 0;
        if (cnt <= 0) continue;
        any = true;
        const row = el('div', 'gem-row');
        const nm = el('span', 'gem-name', `${g.name} ${lvl} ×${cnt}`);
        nm.style.color = g.css;
        row.append(nm, el('span', 'gem-desc', g.text(lvl)));
        if (cnt >= 3 && lvl < 5) {
          row.append(this.button('Слить 3 → 1', 'small', () => {
            p.gems[key] -= 3;
            const up = gemKey(g.id, lvl + 1);
            p.gems[up] = (p.gems[up] ?? 0) + 1;
            saveProfile(p);
            this.render('relics');
          }));
        }
        gems.append(row);
      }
    }
    if (!any) gems.append(el('p', 'hint', 'Камни падают с боссов, гоблинов и из порталов'));
    this.body.append(gems);
  }

  private bestiary() {
    const p = this.profile;
    this.header('Бестиарий', 'title');
    const list = el('div', 'chal-list');
    LEVELS.forEach((L, li) => {
      const block = el('div', 'block');
      block.style.setProperty('--glow', L.ground.glow);
      block.append(el('h3', 'block-title', `${ROMAN[li]} · ${L.name}`));
      const entries: [string, string, boolean][] = [...L.enemies.map((e) => [e.name, BEH_NAME[e.beh], false] as [string, string, boolean]), [L.boss.name, 'Босс', true]];
      if (li === 0) entries.push(['Гоблин-майнер', BEH_NAME[12], false]);
      for (const [name, beh, boss] of entries) {
        const k = p.bestiary[name] ?? 0;
        const need = loreNeed(name, boss);
        const row = el('div', 'lore' + (k >= need ? ' open' : '') + (boss ? ' boss' : ''));
        row.append(el('span', 'lore-name', k ? name : '???'), el('span', 'lore-sub', k ? `${beh} · убито: ${k}` : 'Ещё не встречен'));
        row.append(el('span', 'lore-text', k >= need ? LORE[name] ?? '' : `Убей ещё ${need - k}, чтобы узнать больше`));
        block.append(row);
      }
      list.append(block);
    });
    this.body.append(list);
  }

  private riftScreen() {
    const p = this.profile;
    this.header('Великие порталы', 'title');
    const max = p.rift.best + 1;
    this.riftSel = Math.max(1, Math.min(max, this.riftSel === 1 ? p.rift.last : this.riftSel));
    const n = this.riftSel;
    const panel = el('div', 'level-panel');
    panel.append(el('p', 'level-desc', 'Случайная локация, 5 минут. Убивай, чтобы наполнить портал. На 100% приходит страж — убей его, и откроется следующий уровень. Чем выше уровень, тем злее враги и богаче добыча.'));
    const pick = el('div', 'block');
    pick.append(el('h3', 'block-title', `Уровень портала: ${n}`));
    const row = el('div', 'btn-row');
    row.append(
      this.button('−5', 'small', () => ((this.riftSel = Math.max(1, n - 5)), this.render('rift'))),
      this.button('−1', 'small', () => ((this.riftSel = Math.max(1, n - 1)), this.render('rift'))),
      this.button('+1', 'small', () => ((this.riftSel = Math.min(max, n + 1)), this.render('rift'))),
      this.button('+5', 'small', () => ((this.riftSel = Math.min(max, n + 5)), this.render('rift'))),
    );
    pick.append(row);
    pick.append(el('p', 'hint', `Здоровье врагов ×${riftHp(n).toFixed(1)} · урон ×${riftDmg(n).toFixed(1)} · рекорд: ${p.rift.best || 'нет'}`));
    panel.append(pick);
    const cls = el('div', 'block');
    cls.append(el('h3', 'block-title', 'Класс'));
    this.classPicker(cls);
    panel.append(cls);
    this.body.append(panel);
    const open = LEVELS.map((_, i) => i).filter((i) => this.unlocked(i));
    const go = el('div', 'btn-row sticky');
    go.append(this.button('Открыть портал', 'primary big', () => this.go({ level: riftLevel(n, open), tier: 0, endless: false, daily: null, cls: p.cls, rift: n })));
    this.body.append(go);
  }

  private records() {
    const p = this.profile;
    this.header('Рекорды', 'title');
    const groups: [string, string][] = [['rift', 'Великие порталы'], ['level', 'Локации'], ['endless', 'Бесконечный режим'], ['daily', 'Испытания дня']];
    const list = el('div', 'chal-list');
    for (const [mode, title] of groups) {
      const recs = p.records.filter((r) => r.mode === mode).slice(0, 10);
      if (!recs.length) continue;
      const block = el('div', 'block');
      block.append(el('h3', 'block-title', title));
      recs.forEach((r, k) => {
        const row = el('div', 'rec');
        const d = new Date(r.date);
        row.append(el('span', 'rec-pos', `${k + 1}`), el('span', 'rec-text', r.text), el('span', 'rec-date', `${d.getDate()}.${d.getMonth() + 1}`));
        block.append(row);
      });
      list.append(block);
    }
    if (!list.children.length) list.append(el('p', 'hint', 'Сыграй забег — здесь появятся лучшие результаты'));
    this.body.append(list);
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
    const skins = el('div', 'skin-row');
    const opt = (id: string, name: string, color: string, open: boolean, hint: string) => {
      const b = el('button', 'skin' + (p.skin === id ? ' on' : '') + (open ? '' : ' locked')) as HTMLButtonElement;
      b.style.setProperty('--c', color);
      b.append(el('span', 'skin-dot'), el('span', 'skin-name', open ? name : hint));
      b.disabled = !open;
      b.addEventListener('click', () => {
        p.skin = id;
        saveProfile(p);
        this.render(this.root.dataset.screen as Screen);
      });
      skins.append(b);
    };
    opt('', 'Цвет класса', classById(p.cls).pal.C, true, '');
    for (const sk of SKINS) opt(sk.id, sk.name, sk.pal.C, sk.req(p), sk.reqText);
    block.append(el('p', 'hint', `Ульта: ${classById(p.cls).ult.name} — ${classById(p.cls).ult.desc}`), skins);
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
    go.append(this.button('В бой', 'primary big', () => this.go({ level: i, tier: p.tier, endless: p.endless, daily: null, cls: p.cls, rift: 0 })));
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
    go.append(this.button('Начать', 'primary big', () => this.go({ level: d.level, tier: 0, endless: false, daily: d.mods, cls: p.cls, rift: 0 })));
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

    const toggle = (label: string, key: 'bloom' | 'shake' | 'numbers' | 'haptics') => {
      const row = el('button', 'toggle' + (p.settings[key] ? ' on' : '')) as HTMLButtonElement;
      row.append(el('span', '', label), el('span', 'toggle-state', p.settings[key] ? 'Вкл' : 'Выкл'));
      row.addEventListener('click', () => {
        p.settings[key] = !p.settings[key];
        saveProfile(p);
        this.h.audio();
        this.render('settings');
      });
      list.append(row);
    };
    toggle('Свечение (bloom)', 'bloom');
    toggle('Тряска экрана', 'shake');
    toggle('Цифры урона', 'numbers');
    if (isNative) toggle('Вибрация', 'haptics');
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
