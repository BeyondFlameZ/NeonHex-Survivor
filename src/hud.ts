export interface Choice {
  id: string;
  name: string;
  desc: string;
  level: number;
  max: number;
}

export const fmtTime = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// DOM трогаем только при изменении значений — иначе Safari тратит кадр на layout.
export class Hud {
  private lvl = $('lvl');
  private time = $('time');
  private kills = $('kills');
  private xpFill = $('xp-fill');
  private levelup = $('levelup');
  private choices = $('choices');
  private gameover = $('gameover');
  private summary = $('summary');
  private dash = $('dash');
  private c = { lvl: -1, sec: -1, kills: -1, xp: -1, dash: -1 };

  constructor() {
    $('restart').addEventListener('click', () => location.reload());
    window.addEventListener('keydown', (e) => {
      if (this.levelup.hidden) return;
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

  showLevelUp(list: Choice[], onPick: (id: string) => void) {
    let picked = false;
    this.choices.replaceChildren();
    for (const ch of list) {
      const b = document.createElement('button');
      b.className = 'choice';

      const name = document.createElement('span');
      name.className = 'choice-name';
      name.textContent = ch.name;

      const pips = document.createElement('span');
      pips.className = 'pips';
      for (let k = 0; k < ch.max; k++) {
        const p = document.createElement('span');
        p.className = 'pip' + (k < ch.level ? ' on' : k === ch.level ? ' next' : '');
        pips.append(p);
      }

      const desc = document.createElement('span');
      desc.className = 'choice-desc';
      desc.textContent = ch.desc;

      b.append(name, pips, desc);
      b.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        onPick(ch.id);
      });
      this.choices.append(b);
    }
    this.levelup.hidden = false;
  }

  hideLevelUp() {
    this.levelup.hidden = true;
  }

  showGameOver(time: number, level: number, kills: number) {
    this.summary.textContent = `Продержался ${fmtTime(time)}. Уровень ${level}, уничтожено врагов: ${kills}.`;
    this.gameover.hidden = false;
  }
}
