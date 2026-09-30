import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { CFG, COL } from './config';
import { SpatialGrid } from './grid';
import type { Card, Hud } from './hud';
import type { Input } from './input';
import { DamageNumbers } from './numbers';
import { Pool } from './pool';
import { SCHOOL_ORDER, SCHOOLS, type SchoolId } from './schools';
import { computeStats, GEAR_GLYPH, GEAR_SLOTS, gearHasElem, rollGear, statText, type Gear, type Stats } from './stats';
import * as tex from './textures';
import { ARSENAL, START_WEAPON } from './weapons';
import { F_NOFX, F_NOKB, F_NONUM, F_NOSET, type Weapon, type WeaponDef } from './weapons/types';

type EK =
  | 'x' | 'y' | 'hp' | 'spd' | 'r' | 'xp' | 'flash' | 'kx' | 'ky' | 'dcd' | 'kind' | 'ph' | 'burn' | 'bdps' | 'stun';
type BK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'dmg' | 'pierce' | 'last' | 'elem' | 'aoe';
type GK = 'x' | 'y' | 'v' | 'val' | 'mag';
type PK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'max';
type DK = 'x' | 'y' | 'life';
type IK = 'x' | 'y' | 't';
type HK = 'x' | 'y' | 'life' | 'max';

interface Arc {
  pts: number[];
  color: number;
  life: number;
  max: number;
  w: number;
}
interface Pillar {
  x: number;
  y: number;
  color: number;
  life: number;
  max: number;
  w: number;
}
interface Zone {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  dps: number;
  elem: number;
  color: number;
  tick: number;
}
interface Option {
  card: Card;
  act: () => void;
}

const TAU = Math.PI * 2;
const OCT = Math.PI / 4;
const PX = CFG.px;
const IMPACT_FRAME = 0.04;
const MAX_WEAPONS = 6;
const xpNeed = (lvl: number) => Math.round(5 * Math.pow(lvl, 1.35));
const GIB_COLORS = [COL.blood, COL.bloodDark, 0x2e2340];

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  readonly root = new Container();
  readonly layerGround = new Container();
  readonly layerFx = new Container();
  readonly enemies: Pool<EK>;

  // публичное состояние, которое читают оружия
  px = 0;
  py = 0;
  time = 0;
  stats: Stats = computeStats([]);
  viewHW = 400;
  viewHH = 400;

  private scene = new Container();
  private world = new Container();
  private bg: TilingSprite;
  private glow: Sprite;
  private vignette: Sprite;
  private hurtOverlay = new Graphics();
  private groundG = new Graphics();
  private fxG = new Graphics();

  private bullets: Pool<BK>;
  private gems: Pool<GK>;
  private sparks: Pool<PK>;
  private gibs: Pool<PK>;
  private decals: Pool<DK>;
  private impacts: Pool<IK>;
  private ghosts: Pool<HK>;
  private numbers: DamageNumbers;
  private grid = new SpatialGrid(CFG.gridCols, CFG.gridRows, CFG.cell, CFG.maxEnemies);

  private player: Sprite;
  private mageTex: Texture[];
  private enemyTex: Texture[][];
  private rimTex: Texture[][];
  private rims: Sprite[] = [];
  private rimShown = 0;
  private splatTex: Texture[];
  private impactTex: Texture[];
  private hpBar = new Graphics();

  private weapons: Weapon[] = [];
  private gear: (Gear | null)[] = [null, null, null, null, null, null];
  private setCounts: Record<SchoolId, number> = { electro: 0, pyro: 0, kinetic: 0, necro: 0, mech: 0, glitch: 0 };
  private rerolls = 1;
  private elecHits = 0;

  private arcs: Arc[] = [];
  private pillars: Pillar[] = [];
  private zones: Zone[] = [];

  private lx = new Float32Array(CFG.maxLights);
  private ly = new Float32Array(CFG.maxLights);
  private lr = new Float32Array(CFG.maxLights);
  private ls = new Float32Array(CFG.maxLights);
  private lc = new Uint32Array(CFG.maxLights);
  private nL = 0;
  private fx = new Float32Array(32);
  private fy = new Float32Array(32);
  private fr = new Float32Array(32);
  private fs = new Float32Array(32);
  private fl = new Float32Array(32);
  private fm = new Float32Array(32);
  private fc = new Uint32Array(32);
  private nF = 0;

  private face = 1;
  private moving = false;
  private hp: number = CFG.player.hp;
  private xp = 0;
  private level = 1;
  private need = xpNeed(1);
  private kills = 0;
  private tick = 0;
  private spawnAcc = 0;
  private nextWave = 60;
  private iframes = 0;
  private shakeAmt = 0;
  private hurt = 0;
  private hitstop = 0;
  private lastStop = -1;
  private dashT = 0;
  private dashCd = 0;
  private dashX = 0;
  private dashY = 0;
  private zoom = 1;
  private paused = false;
  private over = false;
  private pending = 0;
  private acc = 0;
  private tmpX = 0;
  private tmpY = 0;

  constructor(
    private app: Application,
    private input: Input,
    private hud: Hud,
  ) {
    this.bg = new TilingSprite({ texture: tex.groundTile(), width: app.screen.width, height: app.screen.height });

    this.glow = new Sprite(tex.lightTex());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = COL.arcane;
    this.glow.alpha = 0.2;
    this.glow.scale.set(2.4);

    this.mageTex = tex.mageFrames();
    this.enemyTex = [tex.enemyFrames(0), tex.enemyFrames(1), tex.enemyFrames(2)];
    this.rimTex = tex.enemyRimMasks();
    this.splatTex = tex.splatTextures();
    this.impactTex = tex.impactFrames();
    const pixel = tex.pixelTex();

    const decalLayer = new Container();
    const gemLayer = new Container();
    const enemyLayer = new Container();
    const rimLayer = new Container();
    const bulletLayer = new Container();
    const ghostLayer = new Container();
    const gibLayer = new Container();
    const sparkLayer = new Container();
    const impactLayer = new Container();
    const numberLayer = new Container();

    this.decals = new Pool<DK>(CFG.maxDecals, ['x', 'y', 'life'], this.splatTex[0], decalLayer, 'normal', PX);
    this.gems = new Pool<GK>(CFG.maxGems, ['x', 'y', 'v', 'val', 'mag'], tex.crystalTex(), gemLayer, 'normal', PX);
    this.enemies = new Pool<EK>(
      CFG.maxEnemies,
      ['x', 'y', 'hp', 'spd', 'r', 'xp', 'flash', 'kx', 'ky', 'dcd', 'kind', 'ph', 'burn', 'bdps', 'stun'],
      this.enemyTex[0][0],
      enemyLayer,
      'normal',
      PX,
    );
    this.bullets = new Pool<BK>(
      CFG.maxBullets,
      ['x', 'y', 'vx', 'vy', 'life', 'dmg', 'pierce', 'last', 'elem', 'aoe'],
      tex.boltTex(),
      bulletLayer,
      'normal',
      PX,
    );
    this.ghosts = new Pool<HK>(CFG.maxGhosts, ['x', 'y', 'life', 'max'], tex.mageGhost(), ghostLayer, 'add', PX);
    this.gibs = new Pool<PK>(CFG.maxGibs, ['x', 'y', 'vx', 'vy', 'life', 'max'], pixel, gibLayer, 'normal', PX);
    this.sparks = new Pool<PK>(CFG.maxSparks, ['x', 'y', 'vx', 'vy', 'life', 'max'], pixel, sparkLayer, 'add', PX);
    this.impacts = new Pool<IK>(CFG.maxImpacts, ['x', 'y', 't'], this.impactTex[0], impactLayer, 'add', PX);
    this.numbers = new DamageNumbers(CFG.maxNumbers, numberLayer, tex.digitTextures());

    for (let i = 0; i < CFG.maxEnemies; i++) {
      const s = new Sprite(this.rimTex[0][0]);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      rimLayer.addChild(s);
      this.rims.push(s);
    }

    this.player = new Sprite(this.mageTex[0]);
    this.player.anchor.set(0.5);
    this.player.scale.set(PX);

    this.world.addChild(
      this.glow,
      decalLayer,
      this.groundG,
      this.layerGround,
      gemLayer,
      enemyLayer,
      rimLayer,
      bulletLayer,
      ghostLayer,
      this.player,
      this.layerFx,
      gibLayer,
      sparkLayer,
      impactLayer,
      this.fxG,
      this.hpBar,
      numberLayer,
    );
    this.scene.addChild(this.bg, this.world);

    if (CFG.bloom) {
      this.scene.filters = [
        new AdvancedBloomFilter({ threshold: 0.42, bloomScale: 1.25, brightness: 1, blur: 5, quality: 5 }),
      ];
      this.scene.filterArea = app.screen;
    }

    this.vignette = new Sprite(tex.vignetteTex());
    this.root.addChild(this.scene, this.vignette, this.hurtOverlay);

    this.addWeapon(START_WEAPON);
  }

  frame(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= CFG.dt) {
      this.update(CFG.dt);
      this.acc -= CFG.dt;
    }
    this.render();
  }

  // ================= API для оружия =================

  heal(n: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }
  cdMul() {
    return Math.max(0.35, 1 - this.stats.cd);
  }
  dmgMul(elem: number) {
    const set = elem === 0 && this.setCounts.electro >= 2 ? 0.15 : 0;
    return 1 + this.stats.dmg + this.stats.elem[elem] + set;
  }
  areaMul() {
    return 1 + this.stats.area;
  }
  durMul() {
    return 1 + this.stats.dur;
  }
  speedMul() {
    return 1 + this.stats.speed;
  }
  amount() {
    return this.stats.amount;
  }

  // живые враги, чей круг касается круга (x, y, r)
  forEachIn(x: number, y: number, r: number, cb: (j: number) => void) {
    const g = this.grid;
    const f = this.enemies.f;
    const reach = r + CFG.enemyMaxR;
    const x0 = Math.max(0, Math.floor((x - reach - g.ox) / g.cell));
    const x1 = Math.min(g.cols - 1, Math.floor((x + reach - g.ox) / g.cell));
    const y0 = Math.max(0, Math.floor((y - reach - g.oy) / g.cell));
    const y1 = Math.min(g.rows - 1, Math.floor((y + reach - g.oy) / g.cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let j = g.head[cy * g.cols + cx];
        while (j !== -1) {
          if (f.hp[j] > 0) {
            const dx = f.x[j] - x;
            const dy = f.y[j] - y;
            const rr = r + f.r[j];
            if (dx * dx + dy * dy < rr * rr) cb(j);
          }
          j = g.next[j];
        }
      }
    }
  }

  anyIn(x: number, y: number, r: number) {
    let found = false;
    this.forEachIn(x, y, r, () => {
      found = true;
    });
    return found;
  }

  nearest(x: number, y: number, range: number, except?: Set<number>) {
    const f = this.enemies.f;
    let best = -1;
    let bd = range * range;
    for (let i = 0; i < this.enemies.n; i++) {
      if (f.hp[i] <= 0 || except?.has(i)) continue;
      const dx = f.x[i] - x;
      const dy = f.y[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  strongest(x: number, y: number, range: number, exclude = -1) {
    const f = this.enemies.f;
    let best = -1;
    let bh = 0;
    const r2 = range * range;
    for (let i = 0; i < this.enemies.n; i++) {
      if (f.hp[i] <= 0 || i === exclude) continue;
      const dx = f.x[i] - x;
      const dy = f.y[i] - y;
      if (dx * dx + dy * dy > r2) continue;
      if (f.hp[i] > bh) {
        bh = f.hp[i];
        best = i;
      }
    }
    return best;
  }

  randomNear(x: number, y: number, range: number) {
    const f = this.enemies.f;
    const r2 = range * range;
    let pick = -1;
    let seen = 0;
    for (let i = 0; i < this.enemies.n; i++) {
      if (f.hp[i] <= 0) continue;
      const dx = f.x[i] - x;
      const dy = f.y[i] - y;
      if (dx * dx + dy * dy > r2) continue;
      if (Math.random() * ++seen < 1) pick = i;
    }
    return pick;
  }

  randomInView() {
    const f = this.enemies.f;
    let pick = -1;
    let seen = 0;
    for (let i = 0; i < this.enemies.n; i++) {
      if (f.hp[i] <= 0) continue;
      if (Math.abs(f.x[i] - this.px) > this.viewHW || Math.abs(f.y[i] - this.py) > this.viewHH) continue;
      if (Math.random() * ++seen < 1) pick = i;
    }
    return pick;
  }

  // из 16 случайных врагов на экране — тот, у кого больше всего соседей
  densest() {
    let best = -1;
    let bc = -1;
    for (let k = 0; k < 16; k++) {
      const j = this.randomInView();
      if (j < 0) break;
      let c = 0;
      this.forEachIn(this.enemies.f.x[j], this.enemies.f.y[j], 60, () => c++);
      if (c > bc) {
        bc = c;
        best = j;
      }
    }
    return best;
  }

  segment(x0: number, y0: number, x1: number, y1: number, w: number, cb: (j: number) => void) {
    const g = this.grid;
    const f = this.enemies.f;
    const reach = w + CFG.enemyMaxR;
    const cx0 = Math.max(0, Math.floor((Math.min(x0, x1) - reach - g.ox) / g.cell));
    const cx1 = Math.min(g.cols - 1, Math.floor((Math.max(x0, x1) + reach - g.ox) / g.cell));
    const cy0 = Math.max(0, Math.floor((Math.min(y0, y1) - reach - g.oy) / g.cell));
    const cy1 = Math.min(g.rows - 1, Math.floor((Math.max(y0, y1) + reach - g.oy) / g.cell));
    const sx = x1 - x0;
    const sy = y1 - y0;
    const len2 = sx * sx + sy * sy || 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        let j = g.head[cy * g.cols + cx];
        while (j !== -1) {
          if (f.hp[j] > 0) {
            const t = Math.max(0, Math.min(1, ((f.x[j] - x0) * sx + (f.y[j] - y0) * sy) / len2));
            const dx = f.x[j] - (x0 + sx * t);
            const dy = f.y[j] - (y0 + sy * t);
            const rr = w + f.r[j];
            if (dx * dx + dy * dy < rr * rr) cb(j);
          }
          j = g.next[j];
        }
      }
    }
  }

  // возвращает true, если этот удар добил врага
  hit(j: number, dmg: number, nx: number, ny: number, elem: number, flags = 0): boolean {
    const f = this.enemies.f;
    if (f.hp[j] <= 0) return false;
    const crit = Math.random() < this.stats.crit;
    const d = crit ? dmg * 2.2 : dmg;
    f.hp[j] -= d;
    f.flash[j] = 0.08;

    if (!(flags & F_NOKB)) {
      const kb = 160 * (11 / f.r[j]) * (crit ? 1.8 : 1);
      f.kx[j] += nx * kb;
      f.ky[j] += ny * kb;
    }

    const color = crit ? COL.gold : SCHOOLS[SCHOOL_ORDER[elem]].color;
    if (!(flags & F_NOFX)) {
      const ix = f.x[j] - nx * f.r[j] * 0.6;
      const iy = f.y[j] - ny * f.r[j] * 0.6 - 4;
      this.impact(ix, iy, color, crit ? PX * 2 : PX);
      this.flash(ix, iy, crit ? 120 : 64, crit ? 1.1 : 0.6, color, crit ? 0.16 : 0.08);
      for (let k = 0; k < (crit ? 5 : 2); k++) {
        const a = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 1.4;
        const v = 90 + Math.random() * 120;
        this.spark(f.x[j], f.y[j], Math.cos(a) * v, Math.sin(a) * v, 0.18 + Math.random() * 0.12, k ? COL.gold : 0xffffff);
      }
      if (crit) {
        this.addShake(2.5);
        this.stop(0.035);
      }
    }
    if (!(flags & F_NONUM) || crit) this.numbers.add(f.x[j], f.y[j] - f.r[j] - 8, d, crit);

    if (elem === 0 && !(flags & F_NOSET) && this.setCounts.electro >= 4 && ++this.elecHits % 10 === 0) {
      this.orbital(f.x[j], f.y[j], 36 * this.areaMul(), 20 * this.dmgMul(0), COL.arcane, 0, F_NOSET);
    }
    return f.hp[j] <= 0;
  }

  // урон по площади; возвращает число убийств
  aoe(x: number, y: number, r: number, dmg: number, elem: number, flags = 0, onHit?: (j: number) => void) {
    const f = this.enemies.f;
    let kills = 0;
    this.forEachIn(x, y, r, (j) => {
      const dx = f.x[j] - x;
      const dy = f.y[j] - y;
      const l = Math.hypot(dx, dy) || 1;
      if (this.hit(j, dmg, dx / l, dy / l, elem, flags | F_NOFX)) kills++;
      onHit?.(j);
    });
    return kills;
  }

  burn(j: number, sec: number, dps: number) {
    const f = this.enemies.f;
    f.burn[j] = Math.max(f.burn[j], sec);
    f.bdps[j] = Math.max(f.bdps[j], dps * (this.setCounts.pyro >= 2 ? 1.5 : 1));
  }

  stun(j: number, sec: number) {
    const f = this.enemies.f;
    f.stun[j] = Math.max(f.stun[j], sec * (this.setCounts.electro >= 2 ? 2 : 1));
  }

  shoot(x: number, y: number, vx: number, vy: number, dmg: number, pierce: number, elem: number, aoe: number, life: number) {
    const b = this.bullets;
    const i = b.add();
    if (i < 0) return;
    const f = b.f;
    f.x[i] = x;
    f.y[i] = y;
    f.vx[i] = vx;
    f.vy[i] = vy;
    f.dmg[i] = dmg;
    f.pierce[i] = pierce;
    f.last[i] = -1;
    f.elem[i] = elem;
    f.aoe[i] = aoe;
    f.life[i] = life;
  }

  orbital(x: number, y: number, r: number, dmg: number, color: number, zoneDps: number, flags = 0) {
    this.pillars.push({ x, y, color, life: 0.22, max: 0.22, w: 12 });
    this.aoe(x, y, r, dmg, 0, flags, (j) => this.stun(j, 0.25));
    this.impact(x, y, color, PX * 2);
    this.flash(x, y, r * 3, 1.2, color, 0.18);
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * TAU;
      this.spark(x, y, Math.cos(a) * 160, Math.sin(a) * 160, 0.25, color);
    }
    if (zoneDps > 0) this.zone(x, y, r * 1.1, 2 * this.durMul(), zoneDps, 0, color);
  }

  zone(x: number, y: number, r: number, life: number, dps: number, elem: number, color: number) {
    if (this.zones.length >= 60) return;
    this.zones.push({ x, y, r, life, max: life, dps, elem, color, tick: 0 });
  }

  arc(pts: number[], color: number, life: number, w: number) {
    if (this.arcs.length >= 120) return;
    this.arcs.push({ pts, color, life, max: life, w });
  }

  // ломаная молнии между двумя точками
  lightning(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const segs = Math.max(2, Math.min(10, (len / 14) | 0));
    const nx = -dy / len;
    const ny = dx / len;
    const pts = [x0, y0];
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const off = (Math.random() - 0.5) * Math.min(18, len * 0.25);
      pts.push(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
    }
    pts.push(x1, y1);
    return pts;
  }

  light(x: number, y: number, r: number, s: number, c: number) {
    if (this.nL >= CFG.maxLights) return;
    const i = this.nL++;
    this.lx[i] = x;
    this.ly[i] = y;
    this.lr[i] = r;
    this.ls[i] = s;
    this.lc[i] = c;
  }

  number(x: number, y: number, v: number, crit: boolean) {
    this.numbers.add(x, y, v, crit);
  }

  spark(x: number, y: number, vx: number, vy: number, life: number, tint: number) {
    const p = this.sparks;
    const i = p.add();
    if (i < 0) return;
    const f = p.f;
    f.x[i] = x;
    f.y[i] = y;
    f.vx[i] = vx;
    f.vy[i] = vy;
    f.life[i] = f.max[i] = life;
    p.sprites[i].tint = tint;
  }

  impact(x: number, y: number, tint: number, scale: number) {
    const p = this.impacts;
    const i = p.add();
    if (i < 0) return;
    p.f.x[i] = Math.round(x);
    p.f.y[i] = Math.round(y);
    p.f.t[i] = 0;
    const s = p.sprites[i];
    s.texture = this.impactTex[0];
    s.tint = tint;
    s.scale.set(scale);
  }

  flash(x: number, y: number, r: number, s: number, color: number, life: number) {
    if (this.nF >= 32) return;
    const i = this.nF++;
    this.fx[i] = x;
    this.fy[i] = y;
    this.fr[i] = r;
    this.fs[i] = s;
    this.fl[i] = this.fm[i] = life;
    this.fc[i] = color;
  }

  addShake(v: number) {
    this.shakeAmt = Math.max(this.shakeAmt, v);
  }

  // мелкие стопы не чаще раза в 0.3с, иначе при сотне убийств в секунду игра встанет колом
  stop(sec: number) {
    if (sec < 0.06 && this.time - this.lastStop < 0.3) return;
    this.hitstop = Math.max(this.hitstop, sec);
    this.lastStop = this.time;
  }

  // ================= цикл =================

  private update(dt: number) {
    if (this.paused || this.over) return;
    this.input.poll();

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
      return;
    }

    this.time += dt;
    this.tick++;
    const s = this.stats;
    const mx = this.input.mx;
    const my = this.input.my;
    const speed = CFG.player.speed * (1 + s.move);

    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.input.consumeDash() && this.dashCd <= 0 && this.dashT <= 0) this.startDash(mx, my);

    if (this.dashT > 0) {
      this.dashT -= dt;
      const v = speed * CFG.dash.mult;
      this.px += this.dashX * v * dt;
      this.py += this.dashY * v * dt;
      if ((this.tick & 1) === 0) this.ghost();
    } else {
      this.px += mx * speed * dt;
      this.py += my * speed * dt;
    }
    this.moving = mx !== 0 || my !== 0 || this.dashT > 0;
    if (this.dashT <= 0) {
      if (mx > 0.05) this.face = 1;
      else if (mx < -0.05) this.face = -1;
    }

    if (this.iframes > 0) this.iframes -= dt;
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 2.5);
    this.heal(s.regen * dt);

    const e = this.enemies;
    const g = this.grid;
    g.reset(this.px, this.py);
    for (let i = 0; i < e.n; i++) g.insert(i, e.f.x[i], e.f.y[i]);

    this.spawn(dt);
    this.updateEnemies(dt);
    for (const w of this.weapons) w.update(dt);
    this.updateBullets(dt);
    this.updateZones(dt);
    this.reapEnemies();
    this.updateGems(dt);
    this.updateFx(this.sparks, dt, 0.9);
    this.updateFx(this.gibs, dt, 0.86);
    this.updateTimed(this.decals, dt);
    this.updateTimed(this.ghosts, dt);
    this.updateImpacts(dt);
    this.updateFlashes(dt);
    this.updateVisuals(dt);
    this.numbers.update(dt);

    while (this.xp >= this.need) {
      this.xp -= this.need;
      this.level++;
      this.need = xpNeed(this.level);
      this.pending++;
    }

    if (this.hp <= 0) {
      this.over = true;
      this.hp = 0;
      this.burst(this.px, this.py, 22, 3);
      this.flash(this.px, this.py, 220, 1.2, COL.blood, 0.6);
      this.hud.showGameOver(this.time, this.level, this.kills);
      return;
    }
    if (this.pending > 0) this.openLevelUp();
  }

  // ---------- рывок ----------

  private startDash(mx: number, my: number) {
    let dx = mx;
    let dy = my;
    const l = Math.hypot(dx, dy);
    if (l < 0.1) {
      dx = this.face;
      dy = 0;
    } else {
      dx /= l;
      dy /= l;
    }
    this.dashX = dx;
    this.dashY = dy;
    this.dashT = CFG.dash.time;
    this.dashCd = CFG.dash.cooldown;
    this.iframes = Math.max(this.iframes, CFG.dash.iframes);
    this.face = dx >= 0 ? 1 : -1;
    this.impact(this.px, this.py, COL.arcane, PX * 2);
    this.flash(this.px, this.py, 140, 0.9, COL.arcane, 0.15);
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.6;
      const v = 80 + Math.random() * 140;
      this.spark(this.px, this.py + 8, Math.cos(a) * v, Math.sin(a) * v, 0.25, COL.arcane);
    }
  }

  private ghost() {
    const g = this.ghosts;
    const i = g.add();
    if (i < 0) return;
    g.f.x[i] = Math.round(this.px);
    g.f.y[i] = Math.round(this.py);
    g.f.life[i] = g.f.max[i] = 0.22;
    const s = g.sprites[i];
    s.tint = COL.arcane;
    s.scale.set(PX * this.face, PX);
  }

  // ---------- спавн ----------

  private ringRadius() {
    return Math.hypot(this.viewHW, this.viewHH) + 40;
  }

  private ringPoint() {
    const rad = this.ringRadius();
    const a = Math.random() * TAU;
    this.tmpX = this.px + Math.cos(a) * rad;
    this.tmpY = this.py + Math.sin(a) * rad;
  }

  private spawn(dt: number) {
    const t = this.time;
    const rate = Math.min(CFG.spawn.maxRate, CFG.spawn.base + (t / 60) * CFG.spawn.perMin);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.ringPoint();
      this.spawnEnemy(this.tmpX, this.tmpY);
    }

    if (t >= this.nextWave) {
      this.nextWave += 60;
      const count = 24 + Math.floor(t / 60) * 8;
      const rad = this.ringRadius();
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU;
        this.spawnEnemy(this.px + Math.cos(a) * rad, this.py + Math.sin(a) * rad);
      }
    }
  }

  private spawnEnemy(x: number, y: number) {
    const e = this.enemies;
    const i = e.add();
    if (i < 0) return;
    const t = this.time;
    const roll = Math.random();
    let kind = 0;
    let r = 11;
    let hp = 10 + t * 0.15;
    let spd = 50 + Math.random() * 20;
    let xp = 1;

    if (t > 180 && roll < 0.05) {
      kind = 2;
      r = 22;
      hp *= 6;
      spd = 38;
      xp = 5;
    } else if (t > 90 && roll < 0.15) {
      kind = 1;
      r = 10;
      hp *= 0.6;
      spd = 115;
    }

    const f = e.f;
    f.x[i] = x;
    f.y[i] = y;
    f.hp[i] = hp;
    f.spd[i] = spd;
    f.r[i] = r;
    f.xp[i] = xp;
    f.flash[i] = 0;
    f.kx[i] = 0;
    f.ky[i] = 0;
    f.dcd[i] = 0;
    f.kind[i] = kind;
    f.ph[i] = Math.random() * 2;
    f.burn[i] = 0;
    f.bdps[i] = 0;
    f.stun[i] = 0;
  }

  // ---------- враги ----------

  private updateEnemies(dt: number) {
    const n = this.enemies.n;
    const { x, y, hp, spd, r, flash, kx, ky, dcd, burn, bdps, stun } = this.enemies.f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const pr = CFG.player.radius;
    const parity = this.tick & 1;

    for (let i = 0; i < n; i++) {
      if (hp[i] <= 0) continue;

      if (burn[i] > 0) {
        burn[i] -= dt;
        hp[i] -= bdps[i] * dt;
        if (burn[i] <= 0) bdps[i] = 0;
        if (((this.tick + i) & 15) === 0) this.spark(x[i], y[i] - 6, (Math.random() - 0.5) * 30, -50, 0.35, 0xff7a2d);
        if (hp[i] <= 0) continue;
      }
      if (flash[i] > 0) flash[i] -= dt;
      if (dcd[i] > 0) dcd[i] -= dt;

      const dx = this.px - x[i];
      const dy = this.py - y[i];
      const d = Math.hypot(dx, dy) || 1;

      if (d > CFG.far) {
        this.ringPoint();
        x[i] = this.tmpX;
        y[i] = this.tmpY;
        continue;
      }

      if (stun[i] > 0) {
        stun[i] -= dt;
        kx[i] *= 0.85;
        ky[i] *= 0.85;
        x[i] += kx[i] * dt;
        y[i] += ky[i] * dt;
        if (((this.tick + i) & 15) === 0) this.spark(x[i], y[i] - 14, (Math.random() - 0.5) * 60, -30, 0.2, COL.arcane);
        continue;
      }

      if ((i & 1) === parity) {
        const cx = Math.floor((x[i] - g.ox) / cell);
        const cy = Math.floor((y[i] - g.oy) / cell);
        let sx = 0;
        let sy = 0;
        let checks = 0;
        for (let yy = cy - 1; yy <= cy + 1; yy++) {
          if (yy < 0 || yy >= rows) continue;
          for (let xx = cx - 1; xx <= cx + 1; xx++) {
            if (xx < 0 || xx >= cols) continue;
            let j = head[yy * cols + xx];
            while (j !== -1 && checks < 10) {
              if (j !== i) {
                const ox = x[i] - x[j];
                const oy = y[i] - y[j];
                const rr = r[i] + r[j];
                const d2 = ox * ox + oy * oy;
                if (d2 < rr * rr && d2 > 1e-4) {
                  const dd = Math.sqrt(d2);
                  const push = (rr - dd) / dd;
                  sx += ox * push;
                  sy += oy * push;
                }
                checks++;
              }
              j = next[j];
            }
          }
        }
        x[i] += sx * 0.5;
        y[i] += sy * 0.5;
      }

      x[i] += ((dx / d) * spd[i] + kx[i]) * dt;
      y[i] += ((dy / d) * spd[i] + ky[i]) * dt;
      kx[i] *= 0.85;
      ky[i] *= 0.85;

      if (d < r[i] + pr && this.iframes <= 0) {
        this.hp -= CFG.enemy.contactDmg * (1 + this.time / 240);
        this.iframes = CFG.player.iframes;
        this.shakeAmt = 6;
        this.hurt = 1;
        this.flash(this.px, this.py, 150, 1, COL.blood, 0.2);
        this.stop(0.07);
      }
    }
  }

  private reapEnemies() {
    const e = this.enemies;
    const f = e.f;
    for (let i = e.n - 1; i >= 0; i--) {
      if (f.hp[i] > 0) continue;
      this.kills++;
      const kind = f.kind[i];
      const x = f.x[i];
      const y = f.y[i];
      this.dropGem(x, y, f.xp[i]);
      this.burst(x, y, f.r[i], kind);
      if (kind === 2) {
        this.impact(x, y, COL.gold, PX * 4);
        this.flash(x, y, 220, 1.3, COL.gold, 0.3);
        this.shakeAmt = 8;
        this.stop(0.09);
      } else {
        this.flash(x, y, 70, 0.7, COL.blood, 0.12);
      }
      if (f.burn[i] > 0 && this.setCounts.pyro >= 4) {
        this.aoe(x, y, 40 * this.areaMul(), 12 * this.dmgMul(1), 1, F_NOSET | F_NONUM);
        this.impact(x, y, SCHOOLS.pyro.color, PX * 2);
      }
      e.kill(i);
    }
  }

  // ---------- снаряды ----------

  private updateBullets(dt: number) {
    const b = this.bullets;
    const f = b.f;
    const e = this.enemies.f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const reach = CFG.boltRadius + CFG.enemyMaxR;
    const trail = (this.tick & 1) === 0;

    for (let k = b.n - 1; k >= 0; k--) {
      f.x[k] += f.vx[k] * dt;
      f.y[k] += f.vy[k] * dt;
      f.life[k] -= dt;
      if (f.life[k] <= 0) {
        b.kill(k);
        continue;
      }

      const bx = f.x[k];
      const by = f.y[k];
      const elem = f.elem[k];
      const color = SCHOOLS[SCHOOL_ORDER[elem]].color;
      if (trail) this.spark(bx, by, 0, 0, 0.14, color);

      const x0 = Math.max(0, Math.floor((bx - reach - g.ox) / cell));
      const x1 = Math.min(cols - 1, Math.floor((bx + reach - g.ox) / cell));
      const y0 = Math.max(0, Math.floor((by - reach - g.oy) / cell));
      const y1 = Math.min(rows - 1, Math.floor((by + reach - g.oy) / cell));
      let dead = false;

      scan: for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          let j = head[cy * cols + cx];
          while (j !== -1) {
            if (e.hp[j] > 0 && j !== f.last[k]) {
              const dx = e.x[j] - bx;
              const dy = e.y[j] - by;
              const rr = CFG.boltRadius + e.r[j];
              if (dx * dx + dy * dy < rr * rr) {
                const sp = Math.hypot(f.vx[k], f.vy[k]) || 1;
                this.hit(j, f.dmg[k], f.vx[k] / sp, f.vy[k] / sp, elem);
                if (f.aoe[k] > 0) {
                  this.aoe(e.x[j], e.y[j], f.aoe[k], f.dmg[k] * 0.5, elem, F_NONUM);
                  this.impact(e.x[j], e.y[j], color, PX * 2);
                  this.flash(e.x[j], e.y[j], f.aoe[k] * 2.5, 0.9, color, 0.12);
                }
                f.last[k] = j;
                if (--f.pierce[k] < 0) {
                  dead = true;
                  break scan;
                }
              }
            }
            j = next[j];
          }
        }
      }
      if (dead) b.kill(k);
    }
  }

  private updateZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      if (z.life <= 0) {
        this.zones.splice(i, 1);
        continue;
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        this.aoe(z.x, z.y, z.r, z.dps * 0.25, z.elem, F_NOFX | F_NONUM | F_NOKB);
        this.spark(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.6, 0, -50, 0.4, z.color);
      }
    }
  }

  private updateVisuals(dt: number) {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      this.pillars[i].life -= dt;
      if (this.pillars[i].life <= 0) this.pillars.splice(i, 1);
    }
  }

  // ---------- лут и эффекты ----------

  private dropGem(x: number, y: number, val: number) {
    const g = this.gems;
    const i = g.add();
    if (i < 0) {
      g.f.val[(Math.random() * g.n) | 0] += val;
      return;
    }
    g.f.x[i] = x;
    g.f.y[i] = y;
    g.f.v[i] = 0;
    g.f.val[i] = val;
    g.f.mag[i] = 0;
    const sp = g.sprites[i];
    sp.tint = val >= 5 ? COL.gold : COL.crystal;
    if (val >= 5) sp.scale.set(PX * 2);
  }

  private updateGems(dt: number) {
    const g = this.gems;
    const f = g.f;
    const pick = CFG.player.pickup * (1 + this.stats.pickup);
    const grab = CFG.player.radius + 6;
    for (let i = g.n - 1; i >= 0; i--) {
      const dx = this.px - f.x[i];
      const dy = this.py - f.y[i];
      const d = Math.hypot(dx, dy) || 1;
      if (!f.mag[i] && d < pick) f.mag[i] = 1;
      if (f.mag[i]) {
        f.v[i] = Math.min(f.v[i] + 1400 * dt, 900);
        const step = Math.min(d, f.v[i] * dt);
        f.x[i] += (dx / d) * step;
        f.y[i] += (dy / d) * step;
      }
      if (d < grab) {
        this.xp += f.val[i];
        this.spark(f.x[i], f.y[i], 0, -60, 0.25, g.sprites[i].tint as number);
        g.kill(i);
      }
    }
  }

  private burst(x: number, y: number, r: number, kind: number) {
    const big = r > 15;
    const gp = this.gibs;
    const gf = gp.f;
    const gibCount = big ? 14 : 7;
    for (let k = 0; k < gibCount; k++) {
      const i = gp.add();
      if (i < 0) break;
      const a = Math.random() * TAU;
      const v = (70 + Math.random() * 150) * (big ? 1.4 : 1);
      gf.x[i] = x;
      gf.y[i] = y;
      gf.vx[i] = Math.cos(a) * v;
      gf.vy[i] = Math.sin(a) * v;
      gf.life[i] = gf.max[i] = 0.5 + Math.random() * 0.5;
      gp.sprites[i].tint = kind === 2 && k % 2 ? COL.crystal : GIB_COLORS[k % GIB_COLORS.length];
    }

    for (let k = 0; k < (big ? 8 : 4); k++) {
      const a = Math.random() * TAU;
      const v = 120 + Math.random() * 160;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.2 + Math.random() * 0.15, k & 1 ? COL.blood : COL.gold);
    }

    const d = this.decals;
    const i = d.add();
    if (i >= 0) {
      d.f.x[i] = Math.round(x);
      d.f.y[i] = Math.round(y + 6);
      d.f.life[i] = 8;
      const s = d.sprites[i];
      s.texture = this.splatTex[(Math.random() * this.splatTex.length) | 0];
      s.rotation = ((Math.random() * 4) | 0) * (Math.PI / 2);
      if (big) s.scale.set(PX * 2);
      if (kind === 2) s.tint = 0xb080ff;
    }
  }

  private updateFx(p: Pool<PK>, dt: number, friction: number) {
    const f = p.f;
    for (let i = p.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) {
        p.kill(i);
        continue;
      }
      f.x[i] += f.vx[i] * dt;
      f.y[i] += f.vy[i] * dt;
      f.vx[i] *= friction;
      f.vy[i] *= friction;
    }
  }

  private updateTimed<K extends string>(p: Pool<K>, dt: number) {
    const f = p.f as unknown as Record<'life', Float32Array>;
    for (let i = p.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) p.kill(i);
    }
  }

  private updateImpacts(dt: number) {
    const p = this.impacts;
    const f = p.f;
    for (let i = p.n - 1; i >= 0; i--) {
      f.t[i] += dt;
      if (f.t[i] >= IMPACT_FRAME * 3) p.kill(i);
    }
  }

  private updateFlashes(dt: number) {
    for (let i = this.nF - 1; i >= 0; i--) {
      this.fl[i] -= dt;
      if (this.fl[i] > 0) continue;
      const j = --this.nF;
      this.fx[i] = this.fx[j];
      this.fy[i] = this.fy[j];
      this.fr[i] = this.fr[j];
      this.fs[i] = this.fs[j];
      this.fl[i] = this.fl[j];
      this.fm[i] = this.fm[j];
      this.fc[i] = this.fc[j];
    }
  }

  // ================= арсенал и снаряжение =================

  private addWeapon(def: WeaponDef) {
    this.weapons.push(def.make(this));
    this.recountSets();
    this.refreshSlots();
  }

  private recountSets() {
    for (const id of SCHOOL_ORDER) this.setCounts[id] = 0;
    for (const w of this.weapons) this.setCounts[w.def.school]++;
  }

  private equip(g: Gear) {
    const oldMax = this.stats.maxHp;
    this.gear[g.slot] = g;
    this.stats = computeStats(this.gear);
    if (this.stats.maxHp > oldMax) this.heal(this.stats.maxHp - oldMax);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.refreshSlots();
  }

  private refreshSlots() {
    this.hud.setSlots(
      this.weapons.map((w) => ({
        tag: w.def.tag,
        css: SCHOOLS[w.def.school].css,
        level: w.level,
        evolved: w.evolved,
      })),
      this.gear.map((g, k) => ({ glyph: GEAR_GLYPH[k], filled: !!g })),
    );
  }

  private schoolBadge(def: WeaponDef) {
    const s = SCHOOLS[def.school];
    return { text: s.name, css: s.css };
  }

  private setNote(def: WeaponDef, after: number) {
    const s = SCHOOLS[def.school];
    if (after === 2) return `Сет «${s.name}» 2/4: ${s.set2}`;
    if (after === 4) return `Сет «${s.name}» 4/4: ${s.set4}`;
    return `Сет «${s.name}» ${after}/4`;
  }

  private openLevelUp() {
    const resolving = this.level - this.pending + 1;
    if (resolving % 5 === 0) this.openGear();
    else this.openWeapons();
  }

  private openWeapons() {
    const opts: Option[] = [];

    const evo = this.weapons.find(
      (w) => w.level >= 8 && !w.evolved && gearHasElem(this.gear, SCHOOLS[w.def.school].elem),
    );
    if (evo) {
      opts.push({
        card: {
          kicker: 'Компиляция',
          title: evo.def.evo.name,
          lines: [evo.def.evo.desc],
          badge: this.schoolBadge(evo.def),
          note: `${evo.def.name} + снаряжение школы «${SCHOOLS[evo.def.school].name}»`,
          gold: true,
        },
        act: () => {
          evo.evolved = true;
          this.impact(this.px, this.py, COL.gold, PX * 6);
          this.flash(this.px, this.py, 320, 1.5, COL.gold, 0.5);
          this.addShake(8);
        },
      });
    }

    const pool: Option[] = [];
    for (const w of this.weapons) {
      if (w.level >= 8) continue;
      pool.push({
        card: {
          kicker: `Ур. ${w.level} → ${w.level + 1}`,
          title: w.def.name,
          lines: [w.def.perks[w.level - 1]],
          badge: this.schoolBadge(w.def),
        },
        act: () => {
          w.level++;
        },
      });
    }
    if (this.weapons.length < MAX_WEAPONS) {
      for (const def of ARSENAL) {
        if (this.weapons.some((w) => w.def === def)) continue;
        pool.push({
          card: {
            kicker: 'Новое',
            title: def.name,
            lines: [def.desc],
            badge: this.schoolBadge(def),
            note: this.setNote(def, this.setCounts[def.school] + 1),
            isNew: true,
          },
          act: () => this.addWeapon(def),
        });
      }
    }
    shuffle(pool);
    while (opts.length < 3 && pool.length) opts.push(pool.pop()!);

    if (opts.length === 0) {
      opts.push({
        card: { kicker: 'Ремонт', title: 'Нанопатч', lines: ['Полностью восстанавливает здоровье'] },
        act: () => this.heal(Infinity),
      });
    }
    this.present('Новый уровень', 'Выбери модуль', opts);
  }

  private openGear() {
    const owned = [...new Set(this.weapons.map((w) => SCHOOLS[w.def.school].elem))];
    let items = [rollGear(owned), rollGear(owned), rollGear(owned)];

    const show = () => {
      const opts: Option[] = items.map((g) => {
        const cur = this.gear[g.slot];
        const unlock = this.weapons.find(
          (w) =>
            w.level >= 8 &&
            !w.evolved &&
            !gearHasElem(this.gear, SCHOOLS[w.def.school].elem) &&
            g.stats.some((s) => s.key === 'elem' && s.elem === SCHOOLS[w.def.school].elem),
        );
        return {
          card: {
            kicker: GEAR_SLOTS[g.slot],
            title: g.name,
            lines: g.stats.map(statText),
            note: unlock ? `Откроет компиляцию ${unlock.def.evo.name}` : cur ? `Заменит: ${cur.name}` : 'Пустой слот',
            gold: !!unlock,
          },
          act: () => this.equip(g),
        };
      });
      this.present('Снаряжение', 'Выбери имплант', opts, this.rerolls > 0 ? () => {
        this.rerolls--;
        items = [rollGear(owned), rollGear(owned), rollGear(owned)];
        show();
      } : undefined);
    };
    show();
  }

  private present(title: string, sub: string, opts: Option[], reroll?: () => void) {
    this.paused = true;
    this.impact(this.px, this.py, COL.gold, PX * 4);
    this.flash(this.px, this.py, 240, 1.2, COL.gold, 0.4);
    this.hud.showChoice(
      title,
      sub,
      opts.map((o) => o.card),
      (i) => {
        opts[i].act();
        this.pending--;
        this.hud.hideChoice();
        this.paused = false;
        this.refreshSlots();
        if (this.pending > 0) this.openLevelUp();
      },
      reroll ? { left: this.rerolls, onReroll: reroll } : undefined,
    );
  }

  // ================= рендер =================

  private render() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const P = Math.max(2, Math.min(5, Math.round((Math.min(w, h) / 560) * PX)));
    this.zoom = P / PX;
    const z = this.zoom;
    this.viewHW = w / 2 / z;
    this.viewHH = h / 2 / z;

    let sx = 0;
    let sy = 0;
    if (this.shakeAmt > 0 && !this.paused) {
      sx = (Math.random() * 2 - 1) * this.shakeAmt;
      sy = (Math.random() * 2 - 1) * this.shakeAmt;
    }
    const wx = Math.round(w / 2 - this.px * z + sx);
    const wy = Math.round(h / 2 - this.py * z + sy);
    this.world.scale.set(z);
    this.world.position.set(wx, wy);
    this.bg.width = w;
    this.bg.height = h;
    this.bg.tileScale.set(P);
    this.bg.tilePosition.set(wx, wy);

    // --- свет и векторные эффекты кадра ---
    this.nL = 0;
    const fxG = this.fxG;
    const groundG = this.groundG;
    fxG.clear();
    groundG.clear();

    if (!this.over) this.light(this.px, this.py - 6, 170, 0.85, COL.arcane);
    for (let i = 0; i < this.nF; i++) {
      this.light(this.fx[i], this.fy[i], this.fr[i], this.fs[i] * (this.fl[i] / this.fm[i]), this.fc[i]);
    }

    for (const zn of this.zones) {
      const k = Math.min(1, zn.life / 0.4);
      groundG.circle(zn.x, zn.y, zn.r).fill({ color: zn.color, alpha: 0.16 * k });
      groundG.circle(zn.x, zn.y, zn.r).stroke({ width: 2, color: zn.color, alpha: 0.45 * k });
      this.light(zn.x, zn.y, zn.r * 1.6, 0.45 * k, zn.color);
    }
    for (const a of this.arcs) {
      const k = a.life / a.max;
      fxG.moveTo(a.pts[0], a.pts[1]);
      for (let i = 2; i < a.pts.length; i += 2) fxG.lineTo(a.pts[i], a.pts[i + 1]);
      fxG.stroke({ width: a.w, color: a.color, alpha: k });
    }
    for (const p of this.pillars) {
      const k = p.life / p.max;
      const pw = p.w * k;
      fxG.rect(p.x - pw / 2, p.y - 520, pw, 520).fill({ color: p.color, alpha: 0.45 * k });
      fxG.rect(p.x - pw / 6, p.y - 520, pw / 3, 520).fill({ color: 0xffffff, alpha: 0.9 * k });
      this.light(p.x, p.y, 150, 1.2 * k, p.color);
    }
    for (const wpn of this.weapons) wpn.draw(fxG, groundG);

    const b = this.bullets;
    for (let i = 0; i < b.n && this.nL < CFG.maxLights; i++) {
      this.light(b.f.x[i], b.f.y[i], 90, 0.8, SCHOOLS[SCHOOL_ORDER[b.f.elem[i]]].color);
    }

    // --- враги с динамическим rim light ---
    const nL = this.nL;
    const { lx, ly, lr, ls, lc } = this;
    const t = this.time;
    const halfW = this.viewHW + 48;
    const halfH = this.viewHH + 48;
    const e = this.enemies;
    const ef = e.f;

    for (let i = 0; i < e.n; i++) {
      const s = e.sprites[i];
      const rim = this.rims[i];
      const ex = ef.x[i];
      const ey = ef.y[i];
      if (Math.abs(ex - this.px) > halfW || Math.abs(ey - this.py) > halfH) {
        s.visible = false;
        rim.visible = false;
        continue;
      }
      s.visible = true;

      const kind = ef.kind[i];
      const frames = this.enemyTex[kind];
      const flashing = ef.flash[i] > 0;
      const frozen = ef.stun[i] > 0;
      const frame = flashing || frozen ? 0 : ((t * 5 + ef.ph[i]) | 0) & 1;
      s.texture = flashing ? frames[2] : frames[frame];
      const sc = kind === 2 ? PX * 2 : PX;
      const flip = ex > this.px ? -1 : 1;
      const rx = Math.round(ex);
      const ry = Math.round(ey);
      s.scale.set(sc * flip, sc);
      s.position.set(rx, ry);

      let ax = 0;
      let ay = 0;
      let total = 0;
      let best = 0;
      let col = 0xffffff;
      const cy = ey - 6;
      for (let l = 0; l < nL; l++) {
        const dx = lx[l] - ex;
        const dy = ly[l] - cy;
        const r = lr[l];
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1;
        let k = 1 - d / r;
        k = k * k * ls[l];
        ax += (dx / d) * k;
        ay += (dy / d) * k;
        total += k;
        if (k > best) {
          best = k;
          col = lc[l];
        }
      }
      // горящих подсвечивает их же пламя снизу
      if (ef.burn[i] > 0) {
        ay += 0.5;
        total += 0.5;
        if (best < 0.5) col = 0xff7a2d;
      }

      if (total < 0.04 || flashing) {
        rim.visible = false;
        continue;
      }
      const dir = (((Math.round(Math.atan2(ay, ax * flip) / OCT) % 8) + 8) % 8) | 0;
      rim.visible = true;
      rim.texture = this.rimTex[frame][dir];
      rim.tint = col;
      rim.alpha = Math.min(1, total * 1.4);
      rim.scale.set(sc * flip, sc);
      rim.position.set(rx, ry);
    }
    for (let i = e.n; i < this.rimShown; i++) this.rims[i].visible = false;
    this.rimShown = e.n;

    for (let i = 0; i < b.n; i++) b.sprites[i].position.set(Math.round(b.f.x[i]), Math.round(b.f.y[i]));

    const g = this.gems;
    const bob = Math.round(Math.sin(t * 5) * 1.5);
    for (let i = 0; i < g.n; i++) g.sprites[i].position.set(Math.round(g.f.x[i]), Math.round(g.f.y[i]) + bob);

    for (const p of [this.sparks, this.gibs]) {
      const pf = p.f;
      for (let i = 0; i < p.n; i++) {
        const s = p.sprites[i];
        s.position.set(Math.round(pf.x[i]), Math.round(pf.y[i]));
        s.alpha = Math.min(1, (pf.life[i] / pf.max[i]) * 2);
      }
    }

    const d = this.decals;
    for (let i = 0; i < d.n; i++) {
      const s = d.sprites[i];
      s.position.set(d.f.x[i], d.f.y[i]);
      s.alpha = Math.min(1, d.f.life[i] / 2) * 0.85;
    }

    const im = this.impacts;
    for (let i = 0; i < im.n; i++) {
      const s = im.sprites[i];
      s.texture = this.impactTex[Math.min(2, (im.f.t[i] / IMPACT_FRAME) | 0)];
      s.position.set(im.f.x[i], im.f.y[i]);
    }

    const gh = this.ghosts;
    for (let i = 0; i < gh.n; i++) {
      const s = gh.sprites[i];
      s.position.set(gh.f.x[i], gh.f.y[i]);
      s.alpha = (gh.f.life[i] / gh.f.max[i]) * 0.55;
    }

    this.numbers.render();

    const walk = this.moving && !this.paused ? ((t * 8) | 0) & 1 : 0;
    this.player.texture = this.mageTex[walk];
    this.player.scale.set(PX * this.face, PX);
    this.player.position.set(Math.round(this.px), Math.round(this.py));
    const blink = this.dashT <= 0 && this.iframes > 0 && ((t * 20) | 0) & 1;
    this.player.visible = !this.over && !blink;

    this.glow.position.set(this.px, this.py);
    this.glow.alpha = 0.18 + Math.sin(t * 2.2) * 0.03;

    const hb = this.hpBar;
    hb.clear();
    if (!this.over) {
      const bw = 28;
      const bx = Math.round(this.px - bw / 2);
      const by = Math.round(this.py + 20);
      const frac = Math.max(0, this.hp / this.stats.maxHp);
      hb.rect(bx - 2, by - 2, bw + 4, 8).fill({ color: 0x05030c });
      hb.rect(bx, by, bw, 4).fill({ color: COL.hpBack });
      if (frac > 0) hb.rect(bx, by, Math.max(2, Math.round((bw * frac) / 2) * 2), 4).fill({ color: COL.blood });
    }

    this.vignette.width = w;
    this.vignette.height = h;

    const ho = this.hurtOverlay;
    ho.clear();
    if (this.hurt > 0) ho.rect(0, 0, w, h).fill({ color: COL.blood, alpha: this.hurt * 0.22 });

    this.hud.setDash(Math.max(0, this.dashCd / CFG.dash.cooldown));
    this.hud.update(this.level, this.time, this.kills, this.xp / this.need);
  }
}
