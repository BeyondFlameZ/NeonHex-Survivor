import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { CFG, COL } from './config';
import { SpatialGrid } from './grid';
import type { Sound } from './audio';
import { classById, type ClassDef } from './classes';
import type { BuildInfo, Card, Hud } from './hud';
import type { Input } from './input';
import { B, ELITE_AT, GOBLIN, LEVELS, UNLOCK_AT, WEIGHT, type EnemyDef, type LevelDef } from './levels';
import { TIERS, type RunOpts, type Tier } from './modes';
import { metaBonuses } from './meta';
import { DamageNumbers } from './numbers';
import { Pool } from './pool';
import type { Profile, RunResult } from './save';
import { SCHOOL_ORDER, SCHOOLS, type SchoolId } from './schools';
import {
  computeStats,
  DROP_CHEST,
  DROP_LEGEND,
  DROP_LEVELUP,
  GEAR_GLYPH,
  GEAR_SLOTS,
  gearHasElem,
  legendById,
  RARITY,
  rollGear,
  rollRarity,
  statText,
  type Gear,
  type MetaStats,
  type Stats,
} from './stats';
import * as tex from './textures';
import { ARSENAL, byId } from './weapons';
import { F_NOFX, F_NOKB, F_NONUM, F_NOSET, type Weapon, type WeaponDef } from './weapons/types';

type EK =
  | 'x' | 'y' | 'hp' | 'mhp' | 'spd' | 'r' | 'xp' | 'flash' | 'kx' | 'ky' | 'dcd' | 'type' | 'ph'
  | 'burn' | 'bdps' | 'stun' | 'chill' | 'frz' | 'inf' | 'idps' | 'stz' | 'sacc'
  | 'ai' | 'st' | 'vx' | 'vy' | 'dmg' | 'kbr' | 'elite' | 'gen' | 'sc';
type BK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'dmg' | 'pierce' | 'last' | 'elem' | 'aoe';
type SK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'dmg';
type GK = 'x' | 'y' | 'v' | 'val' | 'mag';
type PK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'max';
type GBK = PK | 'z' | 'vz';
type DK = 'x' | 'y' | 'life';
type IK = 'x' | 'y' | 't';
type HK = 'x' | 'y' | 'life' | 'max';
type MK = 'x' | 'y' | 'life' | 'dmg' | 'ai' | 'tg';

interface Arc { pts: number[]; color: number; life: number; max: number; w: number }
interface Pillar { x: number; y: number; color: number; life: number; max: number; w: number }
interface Zone { x: number; y: number; r: number; life: number; max: number; dps: number; elem: number; color: number; tick: number }
interface Hazard { x: number; y: number; r: number; delay: number; max: number; life: number; dmg: number; color: number; hit: boolean }
type PickKind = 'heal' | 'chest' | 'lchest' | 'shrine' | 'fountain' | 'shard';
interface Pickup { kind: PickKind; x: number; y: number; life: number; s: Sprite }
interface Decoy { x: number; y: number; life: number; max: number; dmg: number; r: number; s: Sprite }
interface Option { card: Card; act: () => void }
interface PropSpr { s: Sprite; light: number; x: number; y: number; anim: Texture[] | null }

const TAU = Math.PI * 2;
const OCT = Math.PI / 4;
const PX = CFG.px;
const IMPACT_FRAME = 0.04;
const MAX_WEAPONS = 6;
const CHUNK = 320;
const BOSS = 9;
const GOB = 10;
// пресеты яркости из настроек: тёмная / обычная / яркая
const LOOK = [
  { ground: 0.8, vig: 1, glow: 0.24, fog: 0.14 },
  { ground: 1, vig: 0.7, glow: 0.32, fog: 0.12 },
  { ground: 1.3, vig: 0.4, glow: 0.4, fog: 0.1 },
];
const xpNeed = (lvl: number) => Math.round(5 * Math.pow(lvl, 1.35));
const GIB_COLORS = [COL.blood, COL.bloodDark, 0x2e2340];

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Game {
  readonly root = new Container();
  readonly layerGround = new Container();
  readonly layerFx = new Container();
  readonly enemies: Pool<EK>;

  px = 0;
  py = 0;
  time = 0;
  aimX = 1;
  aimY = 0;
  stats: Stats;
  viewHW = 400;
  viewHH = 400;

  private L: LevelDef;
  private T: Tier;
  private cls: ClassDef;
  private levelIdx: number;
  private mods: Set<string>;
  private extra: MetaStats;
  private legs = new Set<string>();
  private dashMul = 1;
  private phoenixCd = 0;
  private legHits = 0;
  private wfT = 0;
  private voidT = 5;
  private nextBoss: number;
  private bossHp = 1;
  private goblinAt: number[];
  private chaosT = 30;
  private dailyEliteT = 60;
  private endlessEliteT = 120;
  private roster: EnemyDef[];
  private eyeCol: number[];
  private meta: ReturnType<typeof metaBonuses>;

  private scene = new Container();
  private world = new Container();
  private bg: TilingSprite;
  private fog: TilingSprite;
  private glow: Sprite;
  private vignette: Sprite;
  private hurtOverlay = new Graphics();
  private screenG = new Graphics();
  private groundG = new Graphics();
  private fxG = new Graphics();
  private propLayer = new Container();
  private poolLayer = new Container();
  private pools: Sprite[] = [];
  private look: (typeof LOOK)[number];
  // всё, что стоит на земле и имеет высоту: сортируется по Y, маг заходит за колонны
  private actors = new Container();

  private bullets: Pool<BK>;
  private shots: Pool<SK>;
  private gems: Pool<GK>;
  private sparks: Pool<PK>;
  private gibs: Pool<GBK>;
  private decals: Pool<DK>;
  private impacts: Pool<IK>;
  private ghosts: Pool<HK>;
  private minions: Pool<MK>;
  private numbers: DamageNumbers;
  private grid = new SpatialGrid(CFG.gridCols, CFG.gridRows, CFG.cell, CFG.maxEnemies);

  private player: Sprite;
  private mageTex: Texture[];
  private mechTex: Texture[];
  private minionTex: Texture[];
  private enemyTex: Texture[][];
  private rimTex: Texture[][][];
  private rims: Sprite[] = [];
  private rimShown = 0;
  private splatTex: Texture[];
  private impactTex: Texture[];
  private hpBar = new Graphics();

  private weapons: Weapon[] = [];
  private gear: (Gear | null)[] = [null, null, null, null, null, null];
  private setCounts: Record<SchoolId, number> = { electro: 0, pyro: 0, kinetic: 0, necro: 0, mech: 0, glitch: 0 };
  private rerolls: number;
  private elecHits = 0;

  private arcs: Arc[] = [];
  private pillars: Pillar[] = [];
  private zones: Zone[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private freePick: Sprite[] = [];
  private decoys: Decoy[] = [];
  private freeDecoy: Sprite[] = [];
  private chunks = new Map<string, PropSpr[]>();
  private freeProps: Sprite[] = [];

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
  private hp: number;
  private xp = 0;
  private level = 1;
  private need = xpNeed(1);
  private kills = 0;
  private tick = 0;
  private spawnAcc = 0;
  private nextWave = 60;
  private nextElite = 0;
  private nextShrine = 45;
  private nextFountain = 100;
  private bossSpawned = false;
  private bossI = -1;
  private bossT = 3;
  private bossPat = 0;
  private victoryT = -1;
  private iframes = 0;
  private shakeAmt = 0;
  private hurt = 0;
  private hitstop = 0;
  private lastStop = -1;
  private dashT = 0;
  private dashCd = 0;
  private dashX = 0;
  private dashY = 0;
  private mechT = 0;
  private rage = 0;
  private haste = 0;
  private conduit = 0;
  private conduitT = 0;
  private revive: boolean;
  private bloom: AdvancedBloomFilter | null = null;
  private zoom = 1;
  private paused = false;
  private userPaused = false;
  private over = false;
  private pending = 0;
  private acc = 0;
  private tmpX = 0;
  private tmpY = 0;

  private run = { crits: 0, evolutions: 0, dashes: 0, minHp: 1, shrines: 0, chests: 0, maxSet: 0, shards: 0, goblins: 0, bosses: 0, legends: 0 };

  constructor(
    private app: Application,
    private input: Input,
    private hud: Hud,
    private sfx: Sound,
    private opts: RunOpts,
    private profile: Profile,
    private onEnd: (r: RunResult) => void,
  ) {
    this.levelIdx = opts.level;
    this.L = LEVELS[opts.level];
    this.T = TIERS[opts.tier] ?? TIERS[0];
    this.cls = classById(opts.cls);
    this.mods = new Set(opts.daily ?? []);
    this.nextBoss = this.L.bossAt;
    this.goblinAt = [75 + Math.random() * 30, 250 + Math.random() * 40];
    this.roster = [...this.L.enemies, this.L.boss, GOBLIN];
    this.eyeCol = this.roster.map((d) => tex.hexNum(d.pal[2]));
    this.meta = metaBonuses(profile);
    const cm = this.cls.mods;
    const elem = [0, 0, 0, 0, 0, 0];
    if (cm.elem) elem[cm.elem[0]] += cm.elem[1];
    this.extra = {
      dmg: this.meta.dmg + (cm.dmg ?? 0),
      maxHp: this.meta.maxHp + (cm.maxHp ?? 0),
      regen: this.meta.regen + (cm.regen ?? 0),
      move: this.meta.move,
      pickup: this.meta.pickup,
      crit: this.meta.crit,
      cd: this.meta.cd,
      area: this.meta.area + (cm.area ?? 0),
      dur: cm.dur ?? 0,
      elem,
    };
    this.stats = this.calcStats();
    this.hp = this.stats.maxHp;
    this.rerolls = this.meta.rerolls + (cm.rerolls ?? 0);
    this.revive = this.meta.revive;
    this.dashMul = cm.dashCd ?? 1;
    this.look = LOOK[Math.max(0, Math.min(2, profile.settings.bright ?? 1))];

    this.bg = new TilingSprite({ texture: tex.groundTile(this.L.ground, this.look.ground), width: app.screen.width, height: app.screen.height });
    this.fog = new TilingSprite({ texture: tex.fogTex(), width: app.screen.width, height: app.screen.height });
    this.fog.tint = tex.hexNum(this.L.fog);
    this.fog.alpha = this.look.fog;
    this.fog.blendMode = 'add';

    this.glow = new Sprite(tex.lightTex());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = this.L.torch;
    this.glow.alpha = this.look.glow;
    this.glow.scale.set(3.2);

    this.mageTex = tex.mageFrames(this.cls.pal);
    this.mechTex = tex.mechFrames();
    this.minionTex = tex.minionFrames();
    this.enemyTex = this.roster.map((d) => tex.enemyFrames(d));
    this.rimTex = this.roster.map((d) => tex.rimMasks(d));
    this.splatTex = tex.splatTextures();
    this.impactTex = tex.impactFrames();
    const pixel = tex.pixelTex();

    const decalLayer = new Container();
    const gemLayer = new Container();
    const bulletLayer = new Container();
    const shotLayer = new Container();
    const ghostLayer = new Container();
    const gibLayer = new Container();
    const sparkLayer = new Container();
    const impactLayer = new Container();
    const numberLayer = new Container();

    this.decals = new Pool<DK>(CFG.maxDecals, ['x', 'y', 'life'], this.splatTex[0], decalLayer, 'normal', PX);
    this.gems = new Pool<GK>(CFG.maxGems, ['x', 'y', 'v', 'val', 'mag'], tex.crystalTex(), gemLayer, 'normal', PX);
    this.enemies = new Pool<EK>(
      CFG.maxEnemies,
      ['x', 'y', 'hp', 'mhp', 'spd', 'r', 'xp', 'flash', 'kx', 'ky', 'dcd', 'type', 'ph', 'burn', 'bdps', 'stun', 'chill', 'frz', 'inf', 'idps', 'stz', 'sacc', 'ai', 'st', 'vx', 'vy', 'dmg', 'kbr', 'elite', 'gen', 'sc'],
      this.enemyTex[0][0],
      this.actors,
      'normal',
      PX,
    );
    this.bullets = new Pool<BK>(CFG.maxBullets, ['x', 'y', 'vx', 'vy', 'life', 'dmg', 'pierce', 'last', 'elem', 'aoe'], tex.boltTex(), bulletLayer, 'normal', PX);
    this.shots = new Pool<SK>(CFG.maxEnemyShots, ['x', 'y', 'vx', 'vy', 'life', 'dmg'], tex.orbTex(), shotLayer, 'normal', PX);
    this.ghosts = new Pool<HK>(CFG.maxGhosts, ['x', 'y', 'life', 'max'], tex.mageGhost(), ghostLayer, 'add', PX);
    this.minions = new Pool<MK>(CFG.maxMinions, ['x', 'y', 'life', 'dmg', 'ai', 'tg'], this.minionTex[0], this.actors, 'normal', PX);
    this.gibs = new Pool<GBK>(CFG.maxGibs, ['x', 'y', 'vx', 'vy', 'life', 'max', 'z', 'vz'], pixel, gibLayer, 'normal', PX);
    this.sparks = new Pool<PK>(CFG.maxSparks, ['x', 'y', 'vx', 'vy', 'life', 'max'], pixel, sparkLayer, 'add', PX);
    this.impacts = new Pool<IK>(CFG.maxImpacts, ['x', 'y', 't'], this.impactTex[0], impactLayer, 'add', PX);
    this.numbers = new DamageNumbers(CFG.maxNumbers, numberLayer, tex.digitTextures());

    for (let i = 0; i < CFG.maxEnemies; i++) {
      const s = new Sprite(this.rimTex[0][0][0]);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.actors.addChild(s);
      this.rims.push(s);
    }
    for (let i = 0; i < CFG.maxProps; i++) {
      const s = new Sprite(pixel);
      s.anchor.set(0.5, 0.9);
      s.scale.set(PX);
      s.visible = false;
      this.propLayer.addChild(s);
      this.freeProps.push(s);
    }
    for (let i = 0; i < 48; i++) {
      const s = new Sprite(pixel);
      s.anchor.set(0.5, 0.8);
      s.scale.set(PX);
      s.visible = false;
      this.actors.addChild(s);
      this.freePick.push(s);
    }
    const lt = tex.lightTex();
    for (let i = 0; i < 40; i++) {
      const s = new Sprite(lt);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.poolLayer.addChild(s);
      this.pools.push(s);
    }
    const ghostTex = tex.mageGhost();
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(ghostTex);
      s.anchor.set(0.5);
      s.scale.set(PX);
      s.visible = false;
      s.blendMode = 'add';
      this.actors.addChild(s);
      this.freeDecoy.push(s);
    }

    this.player = new Sprite(this.mageTex[0]);
    this.player.anchor.set(0.5);
    this.player.scale.set(PX);
    this.actors.addChild(this.player);
    this.actors.sortableChildren = true;

    this.world.addChild(
      this.glow,
      this.poolLayer,
      decalLayer,
      this.groundG,
      this.propLayer,
      this.layerGround,
      gemLayer,
      ghostLayer,
      this.actors,
      bulletLayer,
      shotLayer,
      this.layerFx,
      gibLayer,
      sparkLayer,
      impactLayer,
      this.fxG,
      this.hpBar,
      numberLayer,
    );
    this.scene.addChild(this.bg, this.world, this.fog);

    if (profile.settings.bloom) {
      this.bloom = new AdvancedBloomFilter({ threshold: 0.42, bloomScale: 1.25, brightness: 1, blur: 5, quality: 5 });
      this.scene.filters = [this.bloom];
      this.scene.filterArea = app.screen;
    }

    this.vignette = new Sprite(tex.vignetteTex());
    this.vignette.alpha = this.look.vig;
    this.root.addChild(this.scene, this.vignette, this.hurtOverlay, this.screenG);

    this.addWeapon(byId(this.cls.start) ?? ARSENAL[0]);
    const tag = opts.daily ? 'Испытание дня' : opts.endless ? 'Бесконечный режим' : this.T.name;
    this.hud.announce(`${this.L.name} · ${tag}`, '#ffc94a');
    if (profile.life.runs === 0) {
      this.hud.announce('Веди пальцем по экрану — оружие стреляет само', '#e8dcc4');
      this.hud.announce('Собирай кристаллы опыта, чтобы расти', '#c46bff');
      this.hud.announce('Кнопка справа — рывок сквозь врагов', '#3ef0ff');
      this.hud.announce('На 8:00 придёт босс. Убей его — и локация пройдена', '#ff5a5a');
    }
  }

  destroy() {
    this.scene.filters = [];
    this.bloom?.destroy();
    this.root.destroy({ children: true });
  }

  frame(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= CFG.dt) {
      this.update(CFG.dt);
      this.acc -= CFG.dt;
    }
    this.render();
  }

  togglePause() {
    if (this.over || (this.paused && !this.userPaused)) return;
    this.userPaused = !this.userPaused;
    this.paused = this.userPaused;
    this.sfx.duck(this.userPaused);
    if (this.userPaused) this.hud.showPause(this.buildInfo());
    else this.hud.hidePause();
  }

  quit() {
    this.hud.hidePause();
    this.userPaused = false;
    this.paused = false;
    this.end(false);
  }

  // ================= API для оружия =================

  heal(n: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }
  cdMul() {
    return Math.max(0.3, 1 - this.stats.cd - (this.haste > 0 ? 0.3 : 0));
  }
  dmgMul(elem: number) {
    let set = 0;
    if (elem === 0 && this.setCounts.electro >= 2) set = 0.15;
    if (elem === 4 && this.setCounts.mech >= 2) set = 0.25;
    const reaper = this.legs.has('reaper') ? 1 + Math.min(0.6, this.kills / 5000) : 1;
    return (1 + this.stats.dmg + this.stats.elem[elem] + set) * (this.rage > 0 ? 1.6 : 1) * reaper * (this.mods.has('glass') ? 2 : 1);
  }
  areaMul() {
    return 1 + this.stats.area;
  }
  durMul(elem = -1) {
    return (1 + this.stats.dur) * (elem === 5 && this.setCounts.glitch >= 2 ? 1.5 : 1);
  }
  speedMul() {
    return 1 + this.stats.speed;
  }
  amount() {
    return this.stats.amount;
  }
  private calcStats() {
    const s = computeStats(this.gear, this.extra);
    if (this.mods.has('glass')) s.maxHp = Math.round(s.maxHp * 0.5);
    if (this.mods.has('noregen')) s.regen = 0;
    return s;
  }

  setCount(id: SchoolId) {
    return this.setCounts[id];
  }
  mechActive() {
    return this.mechT > 0;
  }
  facing() {
    return this.face;
  }

  forEachIn(x: number, y: number, r: number, cb: (j: number) => void) {
    const g = this.grid;
    const f = this.enemies.f;
    const reach = r + CFG.enemyMaxR * 2;
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
    const reach = w + CFG.enemyMaxR * 2;
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

  hit(j: number, dmg: number, nx: number, ny: number, elem: number, flags = 0): boolean {
    const f = this.enemies.f;
    if (f.hp[j] <= 0) return false;
    const crit = Math.random() < this.stats.crit;
    let d = crit ? dmg * 2.2 : dmg;
    if (f.frz[j] > 0 && this.setCounts.kinetic >= 2) d *= 1.5;
    if (crit) this.run.crits++;
    f.hp[j] -= d;
    if (f.type[j] === GOB && Math.random() < 0.15) this.placePickupAt('shard', f.x[j], f.y[j], 25);
    if (!(flags & F_NONUM) || crit) {
      if (crit) this.sfx.crit();
      else this.sfx.hit(elem);
    }
    f.flash[j] = 0.08;
    if (f.stz[j] > 0) f.sacc[j] += d;

    if (!(flags & F_NOKB) && f.frz[j] <= 0) {
      const kb = 160 * (11 / f.r[j]) * (crit ? 1.8 : 1) * f.kbr[j];
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
    if ((!(flags & F_NONUM) || crit) && this.profile.settings.numbers) this.numbers.add(f.x[j], f.y[j] - f.r[j] - 8, d, crit);

    if (crit && !(flags & F_NOSET) && this.legs.has('madness')) {
      this.aoe(f.x[j], f.y[j], 40 * this.areaMul(), d * 0.4, elem, F_NOSET | F_NONUM);
      this.impact(f.x[j], f.y[j], COL.gold, PX * 2);
    }
    if (!(flags & F_NOSET) && this.legs.has('thunder') && ++this.legHits % 8 === 0) this.chainThunder(j);
    if (elem === 0 && !(flags & F_NOSET) && this.setCounts.electro >= 4 && ++this.elecHits % 10 === 0) {
      this.orbital(f.x[j], f.y[j], 36 * this.areaMul(), 20 * this.dmgMul(0), COL.arcane, 0, F_NOSET);
    }
    return f.hp[j] <= 0;
  }

  private chainThunder(from: number) {
    const f = this.enemies.f;
    const except = new Set([from]);
    let x = f.x[from];
    let y = f.y[from];
    const dmg = 25 * this.dmgMul(0);
    for (let k = 0; k < 4; k++) {
      const t = this.nearest(x, y, 160, except);
      if (t < 0) break;
      except.add(t);
      this.arc(this.lightning(x, y - 6, f.x[t], f.y[t] - 6), COL.arcane, 0.18, 2);
      this.hit(t, dmg, 0, 0, 0, F_NOSET | F_NOFX);
      x = f.x[t];
      y = f.y[t];
    }
  }

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
    if (f.type[j] === BOSS) sec *= 0.2;
    f.stun[j] = Math.max(f.stun[j], sec * (this.setCounts.electro >= 2 ? 2 : 1));
  }

  // 5 стаков холода = заморозка
  freeze(j: number, stacks: number) {
    const f = this.enemies.f;
    if (f.type[j] === BOSS) return;
    f.chill[j] += stacks;
    if (f.chill[j] >= 5) {
      f.chill[j] = 0;
      f.frz[j] = 1.5 * this.durMul();
      this.impact(f.x[j], f.y[j] - 6, SCHOOLS.kinetic.color, PX * 2);
    }
  }

  infect(j: number, sec: number, dps: number) {
    const f = this.enemies.f;
    f.inf[j] = Math.max(f.inf[j], sec);
    f.idps[j] = Math.max(f.idps[j], dps);
  }

  stasis(j: number, sec: number) {
    const f = this.enemies.f;
    if (f.type[j] === BOSS) return;
    f.stz[j] = Math.max(f.stz[j], sec);
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
    b.sprites[i].tint = elem === 0 ? 0xffffff : SCHOOLS[SCHOOL_ORDER[elem]].color;
  }

  // затягивает кристаллы опыта в радиусе к магу
  pullGems(x: number, y: number, r: number) {
    const f = this.gems.f;
    const r2 = r * r;
    for (let i = 0; i < this.gems.n; i++) {
      const dx = f.x[i] - x;
      const dy = f.y[i] - y;
      if (dx * dx + dy * dy < r2) f.mag[i] = 1;
    }
  }

  minionCount() {
    return this.minions.n;
  }

  minionCap(base: number) {
    return Math.min(CFG.maxMinions, base + (this.setCounts.necro >= 4 ? 2 : 0));
  }

  spawnMinion(x: number, y: number, dmg: number, life: number) {
    const m = this.minions;
    const i = m.add();
    if (i < 0) return false;
    m.f.x[i] = x;
    m.f.y[i] = y;
    m.f.life[i] = life;
    m.f.dmg[i] = dmg;
    m.f.ai[i] = 0;
    m.f.tg[i] = -1;
    this.impact(x, y - 6, SCHOOLS.necro.color, PX * 2);
    return true;
  }

  spawnDecoy(x: number, y: number, life: number, dmg: number, r: number) {
    const s = this.freeDecoy.pop();
    if (!s) return;
    s.visible = true;
    this.decoys.push({ x, y, life, max: life, dmg, r, s });
    this.impact(x, y, SCHOOLS.glitch.color, PX * 3);
  }

  setMech(sec: number) {
    this.mechT = Math.max(this.mechT, sec);
    this.impact(this.px, this.py, COL.gold, PX * 5);
    this.flash(this.px, this.py, 240, 1.3, COL.gold, 0.3);
    this.addShake(6);
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
    if (this.profile.settings.numbers) this.numbers.add(x, y, v, crit);
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
    if (this.profile.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, v);
  }

  stop(sec: number) {
    if (sec < 0.06 && this.time - this.lastStop < 0.3) return;
    this.hitstop = Math.max(this.hitstop, sec);
    this.lastStop = this.time;
  }

  // ================= игрок =================

  private hurtPlayer(dmg: number) {
    if (this.iframes > 0 || this.dashT > 0 || this.mechT > 0 || this.over || this.victoryT >= 0) return;
    this.hp -= dmg;
    this.sfx.hurt();
    this.iframes = CFG.player.iframes;
    this.addShake(6);
    this.hurt = 1;
    this.flash(this.px, this.py, 150, 1, COL.blood, 0.2);
    this.stop(0.07);
    this.run.minHp = Math.min(this.run.minHp, Math.max(0, this.hp) / this.stats.maxHp);
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
    const speed = CFG.player.speed * (1 + s.move + (this.haste > 0 ? 0.3 : 0)) * (this.mechT > 0 ? 1.35 : 1);

    if (mx !== 0 || my !== 0) {
      const l = Math.hypot(mx, my);
      this.aimX = mx / l;
      this.aimY = my / l;
    }
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
    if (this.mechT > 0) this.mechT -= dt;
    if (this.rage > 0) this.rage -= dt;
    if (this.haste > 0) this.haste -= dt;
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 2.5);
    this.heal(s.regen * dt);
    if (this.phoenixCd > 0) this.phoenixCd -= dt;
    this.updateLegends(dt);
    this.updateDailyMods(dt);

    if (this.conduit > 0) {
      this.conduit -= dt;
      this.conduitT -= dt;
      if (this.conduitT <= 0) {
        this.conduitT = 0.45;
        const j = this.randomNear(this.px, this.py, 260);
        if (j >= 0) this.orbital(this.enemies.f.x[j], this.enemies.f.y[j], 40, 30 * this.dmgMul(0), COL.arcane, 0, F_NOSET);
      }
    }

    const e = this.enemies;
    const g = this.grid;
    g.reset(this.px, this.py);
    for (let i = 0; i < e.n; i++) g.insert(i, e.f.x[i], e.f.y[i]);

    this.director(dt);
    this.updateEnemies(dt);
    for (const w of this.weapons) w.update(dt);
    this.updateMinions(dt);
    this.updateDecoys(dt);
    this.updateBullets(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateHazards(dt);
    this.reapEnemies();
    this.updateGems(dt);
    this.updatePickups(dt);
    this.updateFx(this.sparks, dt, 0.9);
    this.updateGibs(dt);
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

    if (this.victoryT >= 0) {
      this.victoryT -= dt;
      if (this.victoryT < 0) this.end(true);
      return;
    }

    if (this.hp <= 0) {
      if (this.legs.has('phoenix') && this.phoenixCd <= 0) {
        this.phoenixCd = 60;
        this.hp = this.stats.maxHp * 0.3;
        this.iframes = 1.5;
        this.impact(this.px, this.py, 0xff7a2d, PX * 6);
        this.flash(this.px, this.py, 360, 1.6, 0xff7a2d, 0.6);
        this.hud.announce('Сердце феникса', '#ff8a1a');
        this.sfx.legendary();
      } else if (this.revive) {
        this.revive = false;
        this.hp = this.stats.maxHp * 0.5;
        this.iframes = 2;
        this.aoe(this.px, this.py, 220, 200 * this.dmgMul(0), 0, F_NOSET);
        this.impact(this.px, this.py, COL.arcane, PX * 6);
        this.flash(this.px, this.py, 400, 1.6, COL.arcane, 0.6);
        this.hud.announce('Резервная копия восстановлена', '#3ef0ff');
      } else {
        this.burst(this.px, this.py, 22, 3);
        this.flash(this.px, this.py, 220, 1.2, COL.blood, 0.6);
        this.end(false);
        return;
      }
    }
    if (this.pending > 0 && !this.paused) this.openLevelUp();
  }

  private updateLegends(dt: number) {
    if (this.legs.has('wildfire') && this.moving) {
      this.wfT -= dt;
      if (this.wfT <= 0) {
        this.wfT = 0.2;
        this.zone(this.px, this.py + 6, 22 * this.areaMul(), 1.6 * this.durMul(), 18 * this.dmgMul(1), 1, SCHOOLS.pyro.color);
      }
    }
    if (this.legs.has('void')) {
      this.voidT -= dt;
      if (this.voidT <= 0) {
        this.voidT = 5;
        const R = 130 * this.areaMul();
        this.aoe(this.px, this.py, R, 35 * this.dmgMul(5), 5, F_NONUM);
        this.impact(this.px, this.py, SCHOOLS.glitch.color, PX * 6);
        this.flash(this.px, this.py, R * 2.5, 1.4, SCHOOLS.glitch.color, 0.3);
        this.pillars.push({ x: this.px, y: this.py, color: SCHOOLS.glitch.color, life: 0.2, max: 0.2, w: 18 });
        this.sfx.boom();
      }
    }
  }

  private updateDailyMods(dt: number) {
    if (this.mods.has('chaos')) {
      this.chaosT -= dt;
      if (this.chaosT <= 0) {
        this.chaosT = 30;
        this.shrineBuff((Math.random() * 4) | 0);
      }
    }
    if (this.mods.has('elite') && this.time > 30) {
      this.dailyEliteT -= dt;
      if (this.dailyEliteT <= 0) {
        this.dailyEliteT = 60;
        const type = this.pickType();
        this.ringPoint();
        this.spawnEnemy(type, this.tmpX, this.tmpY, 1, 0);
        this.hud.announce(`Элита: ${this.roster[type].name}`, '#ffc94a');
      }
    }
  }

  private spawnGoblin() {
    const a = Math.random() * TAU;
    const i = this.spawnEnemy(GOB, this.px + Math.cos(a) * 240, this.py + Math.sin(a) * 240, 0, 0);
    if (i < 0) return;
    this.hud.announce('Гоблин-майнер! Догони его', '#ffc94a');
    this.sfx.goblin();
  }

  // состав билда для экрана паузы
  buildInfo(): BuildInfo {
    return {
      weapons: this.weapons.map((w) => ({
        name: w.evolved ? w.def.evo.name : w.def.name,
        css: SCHOOLS[w.def.school].css,
        school: SCHOOLS[w.def.school].name,
        level: w.level,
        evolved: w.evolved,
        perks: w.def.perks.slice(0, w.level - 1),
      })),
      sets: SCHOOL_ORDER.filter((id) => this.setCounts[id] > 0).map((id) => ({
        name: SCHOOLS[id].name,
        css: SCHOOLS[id].css,
        count: this.setCounts[id],
        bonuses: [this.setCounts[id] >= 2 ? SCHOOLS[id].set2 : '', this.setCounts[id] >= 4 ? SCHOOLS[id].set4 : ''].filter(Boolean),
      })),
      gear: this.gear.map((g, k) => ({
        slot: GEAR_SLOTS[k],
        name: g?.name ?? '',
        css: g ? RARITY[g.rarity].css : '',
        lines: g ? [...g.stats.map(statText), ...(g.leg ? [legendById(g.leg)?.desc ?? ''] : [])] : [],
      })),
    };
  }

  private end(won: boolean) {
    if (this.over) return;
    this.over = true;
    this.hud.hideBoss();
    this.sfx.intensity(0);
    if (won) this.sfx.victory();
    else this.sfx.defeat();
    this.onEnd({
      level: this.levelIdx,
      won,
      time: this.time,
      kills: this.kills,
      lvl: this.level,
      crits: this.run.crits,
      evolutions: this.run.evolutions,
      maxSet: this.run.maxSet,
      dashes: this.run.dashes,
      minHp: this.run.minHp,
      shrines: this.run.shrines,
      chests: this.run.chests,
      weapons: this.weapons.map((w) => w.def.id),
      tier: this.opts.tier,
      endless: this.opts.endless,
      daily: !!this.opts.daily,
      cls: this.cls.id,
      shards: this.run.shards,
      goblins: this.run.goblins,
      bosses: this.run.bosses,
      legends: this.run.legends,
    });
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
    this.dashCd = CFG.dash.cooldown * this.dashMul * (this.legs.has('shadow') ? 0.6 : 1);
    this.sfx.dash();
    if (this.legs.has('shadow')) {
      this.aoe(this.px, this.py, 70 * this.areaMul(), 40 * this.dmgMul(5), 5);
      this.impact(this.px, this.py, SCHOOLS.glitch.color, PX * 4);
    }
    this.iframes = Math.max(this.iframes, CFG.dash.iframes);
    this.face = dx >= 0 ? 1 : -1;
    this.run.dashes++;
    this.impact(this.px, this.py, COL.arcane, PX * 2);
    this.flash(this.px, this.py, 140, 0.9, COL.arcane, 0.15);
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.6;
      const v = 80 + Math.random() * 140;
      this.spark(this.px, this.py + 8, Math.cos(a) * v, Math.sin(a) * v, 0.25, COL.arcane);
    }
    if (this.setCounts.glitch >= 4) this.spawnDecoy(this.px, this.py, 2.5, 60 * this.dmgMul(5), 70);
    for (const w of this.weapons) w.onDash?.();
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

  // ---------- режиссёр уровня: спавн, волны, элита, босс, святилища ----------

  private ringRadius() {
    return Math.hypot(this.viewHW, this.viewHH) + 40;
  }

  private ringPoint() {
    const rad = this.ringRadius();
    const a = Math.random() * TAU;
    this.tmpX = this.px + Math.cos(a) * rad;
    this.tmpY = this.py + Math.sin(a) * rad;
  }

  private pickType() {
    let total = 0;
    for (let k = 0; k < 9; k++) if (this.time >= UNLOCK_AT[k]) total += WEIGHT[k];
    let r = Math.random() * total;
    for (let k = 0; k < 9; k++) {
      if (this.time < UNLOCK_AT[k]) continue;
      r -= WEIGHT[k];
      if (r <= 0) return k;
    }
    return 0;
  }

  private director(dt: number) {
    const t = this.time;
    const L = this.L;
    if (this.victoryT < 0) {
      let rate = Math.min(45 * L.rate, (1.2 + (t / 60) * 5.5) * L.rate) * this.T.rate * (this.mods.has('swarm') ? 1.6 : 1);
      if (this.bossSpawned) rate *= 0.35;
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.ringPoint();
        this.spawnEnemy(this.pickType(), this.tmpX, this.tmpY, 0, 0);
      }
    }

    if (t >= this.nextWave && !this.bossSpawned) {
      this.nextWave += 60;
      this.hud.announce('Приближается орда', '#ff5a5a');
      this.sfx.horde();
      const count = 24 + Math.floor(t / 60) * 8;
      const rad = this.ringRadius();
      const type = this.pickType();
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU;
        this.spawnEnemy(type, this.px + Math.cos(a) * rad, this.py + Math.sin(a) * rad, 0, 0);
      }
    }

    if (this.nextElite < ELITE_AT.length && t >= ELITE_AT[this.nextElite]) {
      this.nextElite++;
      const type = this.pickType();
      this.ringPoint();
      this.spawnEnemy(type, this.tmpX, this.tmpY, 1, 0);
      this.hud.announce(`Элита: ${this.roster[type].name}`, '#ffc94a');
    }

    if (!this.bossSpawned && t >= this.nextBoss) {
      this.bossSpawned = true;
      const a = Math.random() * TAU;
      this.spawnEnemy(BOSS, this.px + Math.cos(a) * 320, this.py + Math.sin(a) * 320, 0, 0);
      this.hud.announce(`Босс: ${L.boss.title}`, '#ff2d55');
      this.hud.showBoss(L.boss.title);
      this.addShake(8);
      this.sfx.boss();
      this.sfx.intensity(1);
    }
    // в бесконечном режиме после первого босса элита приходит каждые 2 минуты
    if (this.opts.endless && t > 480) {
      this.endlessEliteT -= dt;
      if (this.endlessEliteT <= 0) {
        this.endlessEliteT = 120;
        const type = this.pickType();
        this.ringPoint();
        this.spawnEnemy(type, this.tmpX, this.tmpY, 1, 0);
        this.hud.announce(`Элита: ${this.roster[type].name}`, '#ffc94a');
      }
    }
    while (this.goblinAt.length && t >= this.goblinAt[0]) {
      this.goblinAt.shift();
      this.spawnGoblin();
    }
    if (this.mods.has('goblins') && this.goblinAt.length === 0) this.goblinAt.push(t + 60);

    if (t >= this.nextShrine) {
      this.nextShrine += 70;
      this.placePickup('shrine', 45);
    }
    if (t >= this.nextFountain) {
      this.nextFountain += 110;
      this.placePickup('fountain', 45);
    }
  }

  private spawnEnemy(type: number, x: number, y: number, elite: number, gen: number) {
    const e = this.enemies;
    const i = e.add();
    if (i < 0) return -1;
    const d = this.roster[type];
    const t = this.time;
    const boss = type === BOSS;
    const giant = this.mods.has('giants') && !boss && type !== GOB;
    const sizeMul = (elite ? 1.4 : 1) * (gen ? 0.65 : 1) * (giant ? 1.3 : 1);
    const hpScale =
      (boss ? this.bossHp * this.T.boss : this.L.hpMul * (1 + t / 240) * this.T.hp) * (this.mods.has('swarm') ? 0.7 : 1) * (giant ? 1.5 : 1) * (type === GOB ? 8 : 1);
    const f = e.f;
    f.x[i] = x;
    f.y[i] = y;
    f.hp[i] = f.mhp[i] = d.hp * hpScale * (elite ? 10 : 1) * (gen ? 0.35 : 1);
    f.spd[i] = d.spd * (0.9 + Math.random() * 0.2) * (this.mods.has('fast') && type !== GOB ? 1.3 : 1);
    f.r[i] = d.r * sizeMul;
    f.sc[i] = (d.size ?? 1) * sizeMul;
    f.xp[i] = (d.xp ?? 1) * (elite ? 15 : 1) * (giant ? 1.5 : 1);
    f.dmg[i] = d.dmg * this.L.dmgMul * this.T.dmg;
    f.kbr[i] = (d.kbr ?? 1) * (elite ? 0.4 : 1);
    f.type[i] = type;
    f.elite[i] = elite;
    f.gen[i] = gen;
    f.ph[i] = Math.random() * 2;
    f.ai[i] = type === GOB ? 25 : (d.cd ?? 2) * (0.5 + Math.random() * 0.5);
    for (const k of ['flash', 'kx', 'ky', 'dcd', 'burn', 'bdps', 'stun', 'chill', 'frz', 'inf', 'idps', 'stz', 'sacc', 'st', 'vx', 'vy'] as const) {
      f[k][i] = 0;
    }
    return i;
  }

  private enemyShoot(x: number, y: number, vx: number, vy: number, dmg: number, tint: number) {
    const s = this.shots;
    const i = s.add();
    if (i < 0) return;
    s.f.x[i] = x;
    s.f.y[i] = y;
    s.f.vx[i] = vx;
    s.f.vy[i] = vy;
    s.f.dmg[i] = dmg;
    s.f.life[i] = 4;
    s.sprites[i].tint = tint;
    this.sfx.eshot();
  }

  private hazard(x: number, y: number, r: number, delay: number, life: number, dmg: number, color: number) {
    if (this.hazards.length >= 80) return;
    this.hazards.push({ x, y, r, delay, max: delay, life, dmg, color, hit: false });
  }

  // ---------- враги ----------

  private updateEnemies(dt: number) {
    const n = this.enemies.n;
    const f = this.enemies.f;
    const { x, y, hp, spd, r, flash, kx, ky, dcd, burn, bdps, stun, chill, frz, inf, idps, stz, sacc, ai, st, type } = f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const pr = CFG.player.radius;
    const parity = this.tick & 1;
    const timeDmg = 1 + this.time / 300;
    const decoy = this.decoys.length ? this.decoys[0] : null;
    this.bossI = -1;

    for (let i = 0; i < n; i++) {
      if (hp[i] <= 0) continue;
      const tp = type[i];
      const def = this.roster[tp];
      if (tp === BOSS) this.bossI = i;

      if (burn[i] > 0) {
        burn[i] -= dt;
        hp[i] -= bdps[i] * dt;
        if (burn[i] <= 0) bdps[i] = 0;
        if (((this.tick + i) & 15) === 0) this.spark(x[i], y[i] - 6, (Math.random() - 0.5) * 30, -50, 0.35, 0xff7a2d);
      }
      if (inf[i] > 0) {
        inf[i] -= dt;
        hp[i] -= idps[i] * dt;
        if (((this.tick + i) & 15) === 3) this.spark(x[i], y[i] - 8, (Math.random() - 0.5) * 30, -30, 0.4, SCHOOLS.necro.color);
      }
      if (hp[i] <= 0) continue;
      if (flash[i] > 0) flash[i] -= dt;
      if (dcd[i] > 0) dcd[i] -= dt;
      if (chill[i] > 0) chill[i] = Math.max(0, chill[i] - dt * 0.8);

      if (stz[i] > 0) {
        stz[i] -= dt;
        if (stz[i] <= 0) {
          const burst = sacc[i] * 0.6;
          sacc[i] = 0;
          if (burst > 0) {
            hp[i] -= burst;
            this.impact(x[i], y[i] - 6, SCHOOLS.glitch.color, PX * 2);
            this.number(x[i], y[i] - 20, burst, true);
          }
        }
        continue;
      }

      const pdx = this.px - x[i];
      const pdy = this.py - y[i];
      const pd = Math.hypot(pdx, pdy) || 1;
      if (pd > CFG.far && tp !== BOSS && tp !== GOB) {
        this.ringPoint();
        x[i] = this.tmpX;
        y[i] = this.tmpY;
        st[i] = 0;
        continue;
      }

      let tx = this.px;
      let ty = this.py;
      if (decoy && Math.hypot(decoy.x - x[i], decoy.y - y[i]) < 420) {
        tx = decoy.x;
        ty = decoy.y;
      }
      const dx = tx - x[i];
      const dy = ty - y[i];
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;

      if (stun[i] > 0 || frz[i] > 0) {
        if (stun[i] > 0) stun[i] -= dt;
        if (frz[i] > 0) frz[i] -= dt;
        kx[i] *= 0.85;
        ky[i] *= 0.85;
        x[i] += kx[i] * dt;
        y[i] += ky[i] * dt;
        if (stun[i] > 0 && ((this.tick + i) & 15) === 0) this.spark(x[i], y[i] - 14, (Math.random() - 0.5) * 60, -30, 0.2, COL.arcane);
        continue;
      }

      const slow = 1 - Math.min(0.6, chill[i] * 0.12);
      const sp = spd[i] * slow;
      let mvx = ux * sp;
      let mvy = uy * sp;
      let separate = true;

      switch (def.beh) {
        case B.FLY: {
          const w = Math.sin(this.time * 4 + f.ph[i] * 3) * 0.7;
          mvx = (ux - uy * w) * sp;
          mvy = (uy + ux * w) * sp;
          separate = false;
          break;
        }
        case B.RANGED:
        case B.SUMMON:
        case B.HEAL:
        case B.SPIT: {
          const keep = def.beh === B.HEAL ? 170 : def.beh === B.SUMMON ? 240 : 210;
          if (d < keep - 40) {
            mvx = -ux * sp;
            mvy = -uy * sp;
          } else if (d < keep + 30) {
            mvx = -uy * sp * 0.5;
            mvy = ux * sp * 0.5;
          }
          ai[i] -= dt;
          if (ai[i] <= 0 && d < 460) {
            ai[i] = def.cd ?? 2;
            this.enemyAbility(i, def, ux, uy);
          }
          break;
        }
        case B.CHARGE: {
          if (st[i] === 1) {
            mvx = 0;
            mvy = 0;
            ai[i] -= dt;
            if (ai[i] <= 0) {
              st[i] = 2;
              ai[i] = 0.45;
            }
          } else if (st[i] === 2) {
            mvx = f.vx[i];
            mvy = f.vy[i];
            ai[i] -= dt;
            if (ai[i] <= 0) {
              st[i] = 0;
              ai[i] = def.cd ?? 2.5;
            }
            separate = false;
          } else {
            ai[i] -= dt;
            if (ai[i] <= 0 && d < 260) {
              st[i] = 1;
              ai[i] = 0.6;
              f.vx[i] = ux * sp * 4.5;
              f.vy[i] = uy * sp * 4.5;
            }
          }
          break;
        }
        case B.EXPLODE: {
          if (st[i] === 1) {
            mvx = 0;
            mvy = 0;
            ai[i] -= dt;
            flash[i] = ((this.time * 12) | 0) & 1 ? 0.05 : 0;
            if (ai[i] <= 0) {
              this.explodeEnemy(i);
              continue;
            }
          } else if (pd < 46) {
            st[i] = 1;
            ai[i] = 0.55;
          }
          break;
        }
        case B.BLINK: {
          ai[i] -= dt;
          if (ai[i] <= 0 && d < 500) {
            ai[i] = def.cd ?? 3;
            this.impact(x[i], y[i] - 6, this.eyeCol[tp], PX * 2);
            const a = Math.random() * TAU;
            const rr = 90 + Math.random() * 50;
            x[i] = this.px + Math.cos(a) * rr;
            y[i] = this.py + Math.sin(a) * rr;
            this.impact(x[i], y[i] - 6, this.eyeCol[tp], PX * 2);
            this.flash(x[i], y[i], 90, 0.8, this.eyeCol[tp], 0.15);
          }
          break;
        }
        case B.FLEE: {
          const w = Math.sin(this.time * 3 + f.ph[i] * 5) * 0.6;
          mvx = (-ux - uy * w) * sp;
          mvy = (-uy + ux * w) * sp;
          separate = false;
          ai[i] -= dt;
          if (((this.tick + i) & 7) === 0) this.spark(x[i], y[i] - 6, 0, -40, 0.4, COL.gold);
          if (ai[i] <= 0) {
            st[i] = 9;
            hp[i] = 0;
          }
          break;
        }
        case B.BOSS: {
          const res = this.bossBrain(i, dt, ux, uy, d, sp);
          mvx = res[0];
          mvy = res[1];
          separate = false;
          break;
        }
      }

      if (separate && (i & 1) === parity) {
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

      x[i] += (mvx + kx[i]) * dt;
      y[i] += (mvy + ky[i]) * dt;
      kx[i] *= 0.85;
      ky[i] *= 0.85;

      if (pd < r[i] + pr && f.dmg[i] > 0) {
        if (this.legs.has('frost') && tp !== BOSS) {
          this.freeze(i, 5);
          this.hurtPlayer(f.dmg[i] * timeDmg * 0.7);
        } else this.hurtPlayer(f.dmg[i] * timeDmg);
      }
    }

    if (this.bossSpawned && this.bossI >= 0) this.hud.setBoss(f.hp[this.bossI] / f.mhp[this.bossI]);
  }

  private enemyAbility(i: number, def: EnemyDef, ux: number, uy: number) {
    const f = this.enemies.f;
    const x = f.x[i];
    const y = f.y[i];
    const tp = f.type[i];
    const col = this.eyeCol[tp];
    switch (def.beh) {
      case B.RANGED: {
        const v = def.proj ?? 180;
        this.enemyShoot(x, y - 6, ux * v, uy * v, f.dmg[i] * 0.8, col);
        this.impact(x + ux * 8, y - 6 + uy * 8, col, PX);
        break;
      }
      case B.SUMMON: {
        const child = def.child ?? 0;
        for (let k = 0; k < (def.count ?? 3); k++) {
          const a = Math.random() * TAU;
          this.spawnEnemy(child, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 0, 0);
        }
        this.impact(x, y, col, PX * 3);
        this.flash(x, y, 120, 1, col, 0.2);
        break;
      }
      case B.HEAL: {
        this.forEachIn(x, y, 130, (j) => {
          if (j === i || f.type[j] === BOSS) return;
          f.hp[j] = Math.min(f.mhp[j], f.hp[j] + f.mhp[j] * 0.25);
          this.spark(f.x[j], f.y[j] - 10, 0, -60, 0.4, 0x7dff6a);
        });
        this.impact(x, y, 0x7dff6a, PX * 4);
        this.flash(x, y, 150, 0.9, 0x7dff6a, 0.25);
        break;
      }
      case B.SPIT: {
        this.hazard(this.px + (Math.random() - 0.5) * 40, this.py + (Math.random() - 0.5) * 40, 46, 0.9, 2.5, f.dmg[i], tex.hexNum(def.pal[3]));
        this.impact(x, y - 8, col, PX * 2);
        break;
      }
    }
  }

  private explodeEnemy(i: number) {
    const f = this.enemies.f;
    const x = f.x[i];
    const y = f.y[i];
    const col = tex.hexNum(this.roster[f.type[i]].pal[3]);
    if (Math.hypot(this.px - x, this.py - y) < 64) this.hurtPlayer(f.dmg[i] * (1 + this.time / 300));
    f.hp[i] = 0;
    this.aoe(x, y, 60, f.dmg[i] * 2, 1, F_NOSET | F_NONUM);
    this.impact(x, y, col, PX * 4);
    this.flash(x, y, 200, 1.3, col, 0.25);
    this.addShake(4);
    this.sfx.boom();
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU;
      this.spark(x, y, Math.cos(a) * 200, Math.sin(a) * 200, 0.3, col);
    }
  }

  // ИИ босса: держит дистанцию и крутит паттерны; на половине здоровья звереет
  private bossBrain(i: number, dt: number, ux: number, uy: number, d: number, sp: number): [number, number] {
    const f = this.enemies.f;
    const def = this.L.boss;
    const x = f.x[i];
    const y = f.y[i];
    const rage = f.hp[i] < f.mhp[i] * 0.5;
    const col = this.eyeCol[BOSS];
    const acc = tex.hexNum(def.pal[3]);

    if (f.st[i] === 1) {
      f.ai[i] -= dt;
      if (((this.time * 20) | 0) & 1) this.spark(x, y, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0.2, 0xff2d55);
      if (f.ai[i] <= 0) {
        f.st[i] = 2;
        f.ai[i] = 0.7;
      }
      return [0, 0];
    }
    if (f.st[i] === 2) {
      f.ai[i] -= dt;
      if ((this.tick & 3) === 0) this.hazard(x, y, 36, 0.25, 0.2, f.dmg[i], 0xff2d55);
      if (f.ai[i] <= 0) f.st[i] = 0;
      return [f.vx[i], f.vy[i]];
    }

    let mv: [number, number] = d > 160 ? [ux * sp, uy * sp] : d < 110 ? [-ux * sp * 0.6, -uy * sp * 0.6] : [-uy * sp * 0.6, ux * sp * 0.6];

    this.bossT -= dt;
    if (this.bossT > 0) return mv;
    const pats = def.patterns;
    const p = pats[this.bossPat++ % pats.length];
    this.bossT = rage ? 1.5 : 2.3;
    const dmg = f.dmg[i];

    switch (p) {
      case 'burst': {
        const n = rage ? 26 : 18;
        const off = Math.random() * TAU;
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * TAU;
          this.enemyShoot(x, y - 10, Math.cos(a) * 150, Math.sin(a) * 150, dmg * 0.6, col);
        }
        this.impact(x, y, col, PX * 5);
        break;
      }
      case 'volley': {
        const base = Math.atan2(uy, ux);
        const waves = rage ? 3 : 2;
        for (let w = 0; w < waves; w++) {
          for (let k = -2; k <= 2; k++) {
            const a = base + k * 0.18 + w * 0.05;
            const v = 220 + w * 40;
            this.enemyShoot(x, y - 10, Math.cos(a) * v, Math.sin(a) * v, dmg * 0.6, acc);
          }
        }
        break;
      }
      case 'summon': {
        for (let k = 0; k < (rage ? 10 : 6); k++) {
          const a = (k / 6) * TAU;
          this.spawnEnemy((Math.random() * 4) | 0, x + Math.cos(a) * 60, y + Math.sin(a) * 60, 0, 0);
        }
        this.impact(x, y, acc, PX * 5);
        this.flash(x, y, 260, 1.2, acc, 0.3);
        break;
      }
      case 'spikes': {
        for (let k = 0; k < (rage ? 9 : 6); k++) {
          const a = Math.random() * TAU;
          const rr = 20 + Math.random() * 160;
          this.hazard(this.px + Math.cos(a) * rr, this.py + Math.sin(a) * rr, 38, 0.9, 0.4, dmg * 0.9, acc);
        }
        break;
      }
      case 'slam': {
        this.hazard(x, y, 120, 0.8, 0.3, dmg * 1.2, 0xff2d55);
        const n = 14;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          this.enemyShoot(x, y, Math.cos(a) * 190, Math.sin(a) * 190, dmg * 0.5, acc);
        }
        this.addShake(5);
        break;
      }
      case 'charge': {
        f.st[i] = 1;
        f.ai[i] = rage ? 0.5 : 0.8;
        f.vx[i] = ux * 460;
        f.vy[i] = uy * 460;
        break;
      }
      case 'teleport': {
        this.impact(x, y, col, PX * 5);
        const a = Math.random() * TAU;
        f.x[i] = this.px + Math.cos(a) * 170;
        f.y[i] = this.py + Math.sin(a) * 170;
        this.impact(f.x[i], f.y[i], col, PX * 5);
        this.flash(f.x[i], f.y[i], 200, 1.3, col, 0.3);
        for (let k = 0; k < 12; k++) {
          const b = (k / 12) * TAU;
          this.enemyShoot(f.x[i], f.y[i] - 10, Math.cos(b) * 130, Math.sin(b) * 130, dmg * 0.5, col);
        }
        mv = [0, 0];
        break;
      }
    }
    return mv;
  }

  private reapEnemies() {
    const e = this.enemies;
    const f = e.f;
    for (let i = e.n - 1; i >= 0; i--) {
      if (f.hp[i] > 0) continue;
      const tp = f.type[i];
      if (tp === GOB && f.st[i] === 9) {
        this.hud.announce('Гоблин сбежал', '#9a8a70');
        e.kill(i);
        continue;
      }
      this.kills++;
      const def = this.roster[tp];
      const x = f.x[i];
      const y = f.y[i];
      const big = f.sc[i] > 1.2;

      for (const w of this.weapons) w.onKill?.(x, y, i);

      if (tp === BOSS) {
        this.impact(x, y, COL.gold, PX * 8);
        this.flash(x, y, 500, 2, COL.gold, 1);
        this.addShake(12);
        this.stop(0.25);
        this.sfx.boom(true);
        this.sfx.intensity(0);
        this.run.bosses++;
        for (let k = 0; k < 30; k++) this.dropGem(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120, 5);
        this.hud.hideBoss();
        if (this.opts.endless) {
          this.hud.announce(`Босс повержен (${this.run.bosses}). Следующий — через 4 минуты`, '#ffc94a');
          this.placePickupAt('chest', x, y, 999);
          this.bossSpawned = false;
          this.nextBoss = this.time + 240;
          this.bossHp *= 1.6;
        } else {
          this.hud.announce('Босс повержен', '#ffc94a');
          this.victoryT = 2.5;
        }
      } else if (tp === GOB) {
        this.run.goblins++;
        this.hud.announce('Гоблин повержен! Забирай добычу', '#ffc94a');
        this.placePickupAt('lchest', x, y, 999);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU;
          this.placePickupAt('shard', x + Math.cos(a) * 40, y + Math.sin(a) * 40, 30);
        }
        this.impact(x, y, COL.gold, PX * 5);
        this.flash(x, y, 300, 1.5, COL.gold, 0.4);
        this.sfx.boom(true);
        this.sfx.legendary();
      } else {
        this.dropGem(x, y, f.xp[i]);
        if (f.elite[i]) {
          this.placePickupAt('chest', x, y, 999);
          this.impact(x, y, COL.gold, PX * 4);
          this.flash(x, y, 240, 1.3, COL.gold, 0.3);
          this.addShake(6);
          this.stop(0.08);
          this.sfx.boom(true);
        } else if (Math.random() < 0.006) {
          this.placePickupAt('heal', x, y, 30);
        }
        this.sfx.kill();
        if (big) {
          this.impact(x, y, COL.gold, PX * 3);
          this.flash(x, y, 160, 1, COL.gold, 0.2);
        } else {
          this.flash(x, y, 70, 0.7, COL.blood, 0.12);
        }
      }
      this.burst(x, y, big ? 20 : 11, tp);

      if (def.beh === B.SPLIT && f.gen[i] === 0) {
        for (let k = 0; k < 2; k++) this.spawnEnemy(tp, x + (k ? 10 : -10), y, 0, 1);
      }
      if (f.burn[i] > 0 && this.setCounts.pyro >= 4) {
        this.aoe(x, y, 40 * this.areaMul(), 12 * this.dmgMul(1), 1, F_NOSET | F_NONUM);
        this.impact(x, y, SCHOOLS.pyro.color, PX * 2);
      }
      e.kill(i);
    }
  }

  // ---------- союзники ----------

  private updateMinions(dt: number) {
    const m = this.minions;
    const f = m.f;
    const e = this.enemies.f;
    for (let i = m.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) {
        if (this.setCounts.necro >= 4) {
          this.aoe(f.x[i], f.y[i], 50, f.dmg[i] * 2, 3, F_NONUM);
          this.impact(f.x[i], f.y[i], SCHOOLS.necro.color, PX * 3);
        }
        m.kill(i);
        continue;
      }
      let t = f.tg[i] | 0;
      if (t < 0 || t >= this.enemies.n || e.hp[t] <= 0 || (this.tick + i) % 12 === 0) {
        t = this.nearest(f.x[i], f.y[i], 280);
        f.tg[i] = t;
      }
      let tx = this.px;
      let ty = this.py;
      if (t >= 0) {
        tx = e.x[t];
        ty = e.y[t];
      }
      const dx = tx - f.x[i];
      const dy = ty - f.y[i];
      const d = Math.hypot(dx, dy) || 1;
      if (t >= 0 || d > 60) {
        f.x[i] += (dx / d) * 120 * dt;
        f.y[i] += (dy / d) * 120 * dt;
      }
      f.ai[i] -= dt;
      if (t >= 0 && d < e.r[t] + 12 && f.ai[i] <= 0) {
        f.ai[i] = 0.5;
        this.hit(t, f.dmg[i], dx / d, dy / d, 3);
        if (this.setCounts.necro >= 2) this.infect(t, 3, f.dmg[i] * 0.4);
      }
    }
  }

  private updateDecoys(dt: number) {
    for (let k = this.decoys.length - 1; k >= 0; k--) {
      const d = this.decoys[k];
      d.life -= dt;
      if (d.life > 0) continue;
      this.aoe(d.x, d.y, d.r, d.dmg, 5);
      this.impact(d.x, d.y, SCHOOLS.glitch.color, PX * 4);
      this.flash(d.x, d.y, d.r * 3, 1.2, SCHOOLS.glitch.color, 0.25);
      this.addShake(3);
      d.s.visible = false;
      this.freeDecoy.push(d.s);
      this.decoys.splice(k, 1);
    }
  }

  // ---------- снаряды ----------

  private updateBullets(dt: number) {
    const b = this.bullets;
    const f = b.f;
    const e = this.enemies.f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const reach = CFG.boltRadius + CFG.enemyMaxR * 2;
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

  private updateShots(dt: number) {
    const s = this.shots;
    const f = s.f;
    const hitR = CFG.player.radius + 4;
    for (let i = s.n - 1; i >= 0; i--) {
      f.x[i] += f.vx[i] * dt;
      f.y[i] += f.vy[i] * dt;
      f.life[i] -= dt;
      const dx = f.x[i] - this.px;
      const dy = f.y[i] - this.py;
      if (f.life[i] <= 0) {
        s.kill(i);
        continue;
      }
      if (dx * dx + dy * dy < hitR * hitR) {
        this.hurtPlayer(f.dmg[i]);
        this.impact(f.x[i], f.y[i], s.sprites[i].tint as number, PX * 2);
        s.kill(i);
      }
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

  private updateHazards(dt: number) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay <= 0) {
          this.impact(h.x, h.y, h.color, PX * Math.max(2, Math.round(h.r / 16)));
          this.flash(h.x, h.y, h.r * 2, 1, h.color, 0.2);
        }
        continue;
      }
      h.life -= dt;
      if (!h.hit && Math.hypot(this.px - h.x, this.py - h.y) < h.r) {
        h.hit = true;
        this.hurtPlayer(h.dmg);
      }
      if (h.life <= 0) this.hazards.splice(i, 1);
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

  // ---------- лут, предметы, эффекты ----------

  private dropGem(x: number, y: number, val: number) {
    const g = this.gems;
    const i = g.add();
    const v = val * (1 + this.meta.xp + (this.cls.mods.xp ?? 0)) * (this.legs.has('singular') ? 1.25 : 1);
    if (i < 0) {
      g.f.val[(Math.random() * g.n) | 0] += v;
      return;
    }
    g.f.x[i] = x;
    g.f.y[i] = y;
    g.f.v[i] = 0;
    g.f.val[i] = v;
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
        this.sfx.gem();
        this.spark(f.x[i], f.y[i], 0, -60, 0.25, g.sprites[i].tint as number);
        g.kill(i);
      }
    }
  }

  private placePickup(kind: PickKind, life: number) {
    const a = Math.random() * TAU;
    const rr = Math.min(this.viewHW, this.viewHH) * 0.75;
    this.placePickupAt(kind, this.px + Math.cos(a) * rr, this.py + Math.sin(a) * rr, life);
  }

  private placePickupAt(kind: PickKind, x: number, y: number, life: number) {
    const s = this.freePick.pop();
    if (!s) return;
    s.texture =
      kind === 'heal'
        ? tex.healOrbTex()
        : kind === 'chest'
          ? tex.chestTex()
          : kind === 'lchest'
            ? tex.chestTex(true)
            : kind === 'shrine'
              ? tex.shrineTex()
              : kind === 'shard'
                ? tex.shardPickTex()
                : tex.fountainTex();
    s.visible = true;
    s.position.set(Math.round(x), Math.round(y));
    this.pickups.push({ kind, x, y, life, s });
  }

  private updatePickups(dt: number) {
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const p = this.pickups[k];
      p.life -= dt;
      const d = Math.hypot(this.px - p.x, this.py - p.y);
      const take = d < (p.kind === 'shard' ? 40 * (1 + this.stats.pickup) : 22);
      if (!take && p.life > 0) continue;
      p.s.visible = false;
      this.freePick.push(p.s);
      this.pickups.splice(k, 1);
      if (!take) continue;

      switch (p.kind) {
        case 'shard':
          this.run.shards += 4;
          this.sfx.shard();
          this.spark(p.x, p.y, 0, -80, 0.4, COL.crystal);
          break;
        case 'heal':
          this.heal(this.stats.maxHp * 0.25 * (this.mods.has('noregen') ? 0.5 : 1));
          this.impact(p.x, p.y, COL.blood, PX * 3);
          this.sfx.heal();
          break;
        case 'fountain':
          this.sfx.heal();
          this.heal(this.stats.maxHp * 0.5 * (this.mods.has('noregen') ? 0.5 : 1));
          this.impact(p.x, p.y, COL.blood, PX * 5);
          this.flash(p.x, p.y, 200, 1.2, COL.blood, 0.4);
          this.hud.announce('Омут исцеления', '#ff5a7a');
          break;
        case 'chest':
          this.run.chests++;
          this.impact(p.x, p.y, COL.gold, PX * 5);
          this.flash(p.x, p.y, 240, 1.4, COL.gold, 0.4);
          this.sfx.chest();
          this.openGear('chest');
          break;
        case 'lchest':
          this.run.chests++;
          this.impact(p.x, p.y, 0xff8a1a, PX * 6);
          this.flash(p.x, p.y, 320, 1.6, 0xff8a1a, 0.6);
          this.sfx.legendary();
          this.openGear('legend');
          break;
        case 'shrine': {
          this.run.shrines++;
          this.sfx.shrine();
          this.shrineBuff((Math.random() * 4) | 0);
          this.impact(p.x, p.y, COL.gold, PX * 5);
          this.flash(p.x, p.y, 260, 1.4, COL.gold, 0.5);
          break;
        }
      }
    }
  }

  private shrineBuff(roll: number) {
    if (roll === 0) {
      this.rage = 20;
      this.hud.announce('Святилище ярости: урон +60%', '#ff5a5a');
    } else if (roll === 1) {
      this.haste = 20;
      this.hud.announce('Святилище спешки: скорость и перезарядка', '#3ef0ff');
    } else if (roll === 2) {
      for (let i = 0; i < this.gems.n; i++) this.gems.f.mag[i] = 1;
      this.hud.announce('Святилище жадности: весь опыт к тебе', '#c46bff');
    } else {
      this.conduit = 15;
      this.hud.announce('Святилище-проводник: молнии 15 секунд', '#3ef0ff');
    }
  }

  private burst(x: number, y: number, r: number, kind: number) {
    const big = r > 15;
    const gp = this.gibs;
    const gf = gp.f;
    const col = kind < this.roster.length ? tex.hexNum(this.roster[kind].pal[0]) : COL.blood;
    const gibCount = big ? 14 : 7;
    for (let k = 0; k < gibCount; k++) {
      const i = gp.add();
      if (i < 0) break;
      const a = Math.random() * TAU;
      const v = (40 + Math.random() * 90) * (big ? 1.4 : 1);
      gf.x[i] = x;
      gf.y[i] = y;
      gf.vx[i] = Math.cos(a) * v;
      gf.vy[i] = Math.sin(a) * v * 0.6;
      gf.z[i] = 4 + Math.random() * 8;
      gf.vz[i] = 90 + Math.random() * 170;
      gf.life[i] = gf.max[i] = 0.9 + Math.random() * 0.6;
      gp.sprites[i].tint = k % 3 === 2 ? col : GIB_COLORS[k % GIB_COLORS.length];
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

  // ошмётки летят по дуге и пару раз отскакивают от пола
  private updateGibs(dt: number) {
    const p = this.gibs;
    const f = p.f;
    for (let i = p.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) {
        p.kill(i);
        continue;
      }
      f.vz[i] -= 700 * dt;
      f.z[i] += f.vz[i] * dt;
      if (f.z[i] <= 0) {
        f.z[i] = 0;
        f.vz[i] = Math.abs(f.vz[i]) < 40 ? 0 : -f.vz[i] * 0.35;
        f.vx[i] *= 0.55;
        f.vy[i] *= 0.55;
      }
      f.x[i] += f.vx[i] * dt;
      f.y[i] += f.vy[i] * dt;
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

  // ---------- декорации мира: чанки по хешу координат ----------

  private updateProps() {
    const L = this.L;
    const cx0 = Math.floor((this.px - this.viewHW - 80) / CHUNK);
    const cx1 = Math.floor((this.px + this.viewHW + 80) / CHUNK);
    const cy0 = Math.floor((this.py - this.viewHH - 80) / CHUNK);
    const cy1 = Math.floor((this.py + this.viewHH + 120) / CHUNK);

    for (const [key, list] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
      for (const p of list) {
        p.s.visible = false;
        this.freeProps.push(p.s);
      }
      this.chunks.delete(key);
    }

    const totalW = L.props.reduce((s, p) => s + p.weight, 0);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        if (this.chunks.has(key)) continue;
        const list: PropSpr[] = [];
        const count = 1 + ((hash(cx, cy, this.levelIdx) * 4) | 0);
        for (let k = 0; k < count; k++) {
          const s = this.freeProps.pop();
          if (!s) break;
          let r = hash(cx, cy, 100 + k) * totalW;
          let def = L.props[0];
          for (const p of L.props) {
            r -= p.weight;
            if (r <= 0) {
              def = p;
              break;
            }
          }
          const x = (cx + hash(cx, cy, 200 + k)) * CHUNK;
          const y = (cy + hash(cx, cy, 300 + k)) * CHUNK;
          s.texture = tex.propTex(def.kind, def.pal);
          s.position.set(Math.round(x), Math.round(y));
          if (tex.FLAT_PROPS.has(def.kind)) this.propLayer.addChild(s);
          else {
            this.actors.addChild(s);
            s.zIndex = Math.round(y) * 2;
          }
          s.visible = true;
          s.alpha = def.kind === 'crack' || def.kind === 'rune' ? 0.85 : 1;
          const anim = def.anim ? [tex.propTex(def.kind, def.pal), tex.propTex(def.anim, def.pal)] : null;
          list.push({ s, light: def.light ?? -1, x, y, anim });
        }
        this.chunks.set(key, list);
      }
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
    for (const id of SCHOOL_ORDER) this.run.maxSet = Math.max(this.run.maxSet, this.setCounts[id]);
  }

  private equip(g: Gear) {
    const oldMax = this.stats.maxHp;
    this.gear[g.slot] = g;
    if (g.rarity === 3) this.run.legends++;
    this.legs = new Set(this.gear.map((x) => x?.leg ?? '').filter(Boolean));
    this.stats = this.calcStats();
    if (this.stats.maxHp > oldMax) this.heal(this.stats.maxHp - oldMax);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.refreshSlots();
  }

  private refreshSlots() {
    this.hud.setSlots(
      this.weapons.map((w) => ({ tag: w.def.tag, css: SCHOOLS[w.def.school].css, level: w.level, evolved: w.evolved })),
      this.gear.map((g, k) => ({ glyph: GEAR_GLYPH[k], filled: !!g, css: g ? RARITY[g.rarity].css : '' })),
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
    this.sfx.levelup();
    if (resolving % 5 === 0) this.openGear('level');
    else this.openWeapons();
  }

  private openWeapons() {
    const opts: Option[] = [];
    const evo = this.weapons.find((w) => w.level >= 8 && !w.evolved && gearHasElem(this.gear, SCHOOLS[w.def.school].elem));
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
          this.run.evolutions++;
          this.sfx.evolve();
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
        card: { kicker: `Ур. ${w.level} → ${w.level + 1}`, title: w.def.name, lines: [w.def.perks[w.level - 1]], badge: this.schoolBadge(w.def) },
        act: () => {
          w.level++;
        },
      });
    }
    if (this.weapons.length < MAX_WEAPONS) {
      for (const def of ARSENAL) {
        if (this.weapons.some((w) => w.def === def)) continue;
        pool.push({
          card: { kicker: 'Новое', title: def.name, lines: [def.desc], badge: this.schoolBadge(def), note: this.setNote(def, this.setCounts[def.school] + 1), isNew: true },
          act: () => this.addWeapon(def),
        });
      }
    }
    shuffle(pool);
    while (opts.length < 3 && pool.length) opts.push(pool.pop()!);
    if (opts.length === 0) {
      opts.push({ card: { kicker: 'Ремонт', title: 'Нанопатч', lines: ['Полностью восстанавливает здоровье'] }, act: () => this.heal(Infinity) });
    }
    this.present('Новый уровень', 'Выбери модуль', opts, false);
  }

  private openGear(src: 'level' | 'chest' | 'legend') {
    const fromChest = src !== 'level';
    const owned = [...new Set(this.weapons.map((w) => SCHOOLS[w.def.school].elem))];
    const table = src === 'legend' ? DROP_LEGEND : src === 'chest' ? DROP_CHEST : DROP_LEVELUP;
    const roll = () => {
      const out = [0, 1, 2].map(() => rollGear(owned, rollRarity(table, this.T.legend)));
      if (src === 'legend' && !out.some((g) => g.rarity === 3)) out[0] = rollGear(owned, 3);
      return out;
    };
    let items = roll();

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
            kicker: `${GEAR_SLOTS[g.slot]} · ${RARITY[g.rarity].name}`,
            title: g.name,
            lines: [...g.stats.map(statText), ...(g.leg ? [`★ ${legendById(g.leg)?.desc ?? ''}`] : [])],
            note: unlock ? `Откроет компиляцию ${unlock.def.evo.name}` : cur ? `Заменит: ${cur.name}` : 'Пустой слот',
            gold: !!unlock,
            rarity: g.rarity,
          },
          act: () => this.equip(g),
        };
      });
      this.present(
        src === 'legend' ? 'Легендарный сундук' : fromChest ? 'Сундук' : 'Снаряжение',
        'Выбери имплант',
        opts,
        fromChest,
        this.rerolls > 0
          ? () => {
              this.rerolls--;
              items = roll();
              show();
            }
          : undefined,
      );
    };
    show();
  }

  private present(title: string, sub: string, opts: Option[], extra: boolean, reroll?: () => void) {
    this.paused = true;
    this.hud.showChoice(
      title,
      sub,
      opts.map((o) => o.card),
      (i) => {
        opts[i].act();
        if (!extra) this.pending--;
        this.hud.hideChoice();
        this.paused = false;
        this.recountSets();
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
    // тексель = целое число физических пикселей, иначе чёткие пиксели дрожат при движении
    const res = this.app.renderer.resolution || 1;
    const texDev = Math.max(2, Math.min(10, Math.round(((Math.min(w, h) / 560) * PX * res) / 2)));
    const P = (texDev * 2) / res;
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
    const wx = Math.round((w / 2 - this.px * z + sx) * res) / res;
    const wy = Math.round((h / 2 - this.py * z + sy) * res) / res;
    this.world.scale.set(z);
    this.world.position.set(wx, wy);
    this.bg.width = w;
    this.bg.height = h;
    this.bg.tileScale.set((P * 48) / tex.GROUND_SIZE);
    this.bg.tilePosition.set(wx, wy);
    this.fog.width = w;
    this.fog.height = h;
    this.fog.tileScale.set(P * 2.5);
    this.fog.tilePosition.set(wx * 0.6 + this.time * 12, wy * 0.6 + this.time * 5);

    this.updateProps();

    this.nL = 0;
    const fxG = this.fxG;
    const groundG = this.groundG;
    fxG.clear();
    groundG.clear();
    const t = this.time;

    if (!this.over) this.light(this.px, this.py - 6, 230, 0.9, this.L.torch);
    let nPool = 0;
    const pool = (x: number, y: number, scale: number, alpha: number, color: number) => {
      if (nPool >= this.pools.length) return;
      const s = this.pools[nPool++];
      s.visible = true;
      s.position.set(x, y);
      s.scale.set(scale);
      s.alpha = alpha;
      s.tint = color;
    };
    for (let i = 0; i < this.nF; i++) this.light(this.fx[i], this.fy[i], this.fr[i], this.fs[i] * (this.fl[i] / this.fm[i]), this.fc[i]);

    for (const list of this.chunks.values()) {
      for (const p of list) {
        if (p.anim) p.s.texture = p.anim[((t * 7 + p.x) | 0) & 1];
        if (p.light >= 0 && Math.abs(p.x - this.px) < this.viewHW + 100 && Math.abs(p.y - this.py) < this.viewHH + 100) {
          const flick = Math.sin(t * 9 + p.x) * 0.08;
          this.light(p.x, p.y - 14, 150, 0.55 + flick, p.light);
          pool(p.x, p.y - 8, 0.85, 0.26 + flick * 0.5, p.light);
        }
      }
    }

    for (const p of this.pickups) {
      const bob = Math.round(Math.sin(t * 4 + p.x) * 2);
      p.s.position.set(Math.round(p.x), Math.round(p.y) + bob);
      p.s.zIndex = Math.round(p.y) * 2;
      const col = p.kind === 'heal' || p.kind === 'fountain' ? COL.blood : COL.gold;
      this.light(p.x, p.y - 10, 120, 0.9, col);
      pool(p.x, p.y - 6, 0.55, 0.3, col);
      if (p.kind === 'shrine' || p.kind === 'fountain') groundG.circle(p.x, p.y, 24).stroke({ width: 2, color: col, alpha: 0.35 + Math.sin(t * 5) * 0.15 });
    }

    for (let i = nPool; i < this.pools.length; i++) this.pools[i].visible = false;

    for (const zn of this.zones) {
      const k = Math.min(1, zn.life / 0.4);
      groundG.circle(zn.x, zn.y, zn.r).fill({ color: zn.color, alpha: 0.16 * k });
      groundG.circle(zn.x, zn.y, zn.r).stroke({ width: 2, color: zn.color, alpha: 0.45 * k });
      this.light(zn.x, zn.y, zn.r * 1.6, 0.45 * k, zn.color);
    }
    for (const hz of this.hazards) {
      if (hz.delay > 0) {
        const p = 1 - hz.delay / hz.max;
        groundG.circle(hz.x, hz.y, hz.r).stroke({ width: 2, color: hz.color, alpha: 0.5 + p * 0.4 });
        groundG.circle(hz.x, hz.y, hz.r * p).fill({ color: hz.color, alpha: 0.22 });
      } else {
        groundG.circle(hz.x, hz.y, hz.r).fill({ color: hz.color, alpha: 0.45 });
        this.light(hz.x, hz.y, hz.r * 2, 0.9, hz.color);
      }
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
    for (const dcy of this.decoys) {
      dcy.s.position.set(Math.round(dcy.x), Math.round(dcy.y));
      dcy.s.zIndex = Math.round(dcy.y + 7 * PX) * 2 + 1;
      dcy.s.alpha = 0.5 + Math.sin(t * 20) * 0.25;
      dcy.s.tint = SCHOOLS.glitch.color;
      this.light(dcy.x, dcy.y, 100, 0.8, SCHOOLS.glitch.color);
    }
    for (const wpn of this.weapons) wpn.draw(fxG, groundG);

    const b = this.bullets;
    for (let i = 0; i < b.n && this.nL < CFG.maxLights; i++) this.light(b.f.x[i], b.f.y[i], 90, 0.8, SCHOOLS[SCHOOL_ORDER[b.f.elem[i]]].color);
    const sh = this.shots;
    for (let i = 0; i < sh.n && this.nL < CFG.maxLights; i++) this.light(sh.f.x[i], sh.f.y[i], 70, 0.7, sh.sprites[i].tint as number);

    // --- враги с динамическим rim light ---
    const nL = this.nL;
    const { lx, ly, lr, ls, lc } = this;
    const halfW = this.viewHW + 80;
    const halfH = this.viewHH + 80;
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
      const tp = ef.type[i];
      const frames = this.enemyTex[tp];
      const flashing = ef.flash[i] > 0;
      const still = ef.stun[i] > 0 || ef.frz[i] > 0 || ef.stz[i] > 0;
      const frame = flashing || still ? 0 : ((t * 5 + ef.ph[i]) | 0) & 1;
      s.texture = flashing ? frames[2] : frames[frame];
      s.tint = ef.frz[i] > 0 ? 0x9ad8ff : ef.stz[i] > 0 ? 0xff9af0 : 0xffffff;
      const sc = PX * ef.sc[i];
      const flip = ex > this.px ? -1 : 1;
      const rx = Math.round(ex);
      const ry = Math.round(ey);
      s.scale.set(sc * flip, sc);
      s.position.set(rx, ry);
      const depth = Math.round(ey + 7 * PX * ef.sc[i]) * 2;
      s.zIndex = depth;

      if (this.roster[tp].beh === B.CHARGE && ef.st[i] === 1) {
        const l = Math.hypot(ef.vx[i], ef.vy[i]) || 1;
        groundG.moveTo(ex, ey).lineTo(ex + (ef.vx[i] / l) * 140, ey + (ef.vy[i] / l) * 140).stroke({ width: 3, color: 0xff2d55, alpha: 0.5 });
      }

      let ax = 0;
      let ay = 0;
      let total = 0;
      let best = 0;
      let col = 0xffffff;
      const cy = ey - 6 * ef.sc[i];
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
      if (ef.burn[i] > 0) {
        ay += 0.5;
        total += 0.5;
        if (best < 0.5) col = 0xff7a2d;
      }
      if (ef.elite[i] || tp === BOSS) {
        ay -= 0.6;
        total += 0.6;
        if (best < 0.6) col = COL.gold;
      }
      if (total < 0.04 || flashing) {
        rim.visible = false;
        continue;
      }
      const dir = (((Math.round(Math.atan2(ay, ax * flip) / OCT) % 8) + 8) % 8) | 0;
      rim.visible = true;
      rim.texture = this.rimTex[tp][frame][dir];
      rim.tint = col;
      rim.alpha = Math.min(1, total * 1.4);
      rim.scale.set(sc * flip, sc);
      rim.position.set(rx, ry);
      rim.zIndex = depth + 1;
    }
    for (let i = e.n; i < this.rimShown; i++) this.rims[i].visible = false;
    this.rimShown = e.n;

    for (let i = 0; i < b.n; i++) b.sprites[i].position.set(Math.round(b.f.x[i]), Math.round(b.f.y[i]));
    for (let i = 0; i < sh.n; i++) sh.sprites[i].position.set(Math.round(sh.f.x[i]), Math.round(sh.f.y[i]));

    const mn = this.minions;
    for (let i = 0; i < mn.n; i++) {
      const s = mn.sprites[i];
      s.texture = this.minionTex[((t * 6 + i) | 0) & 1];
      s.position.set(Math.round(mn.f.x[i]), Math.round(mn.f.y[i]));
      s.zIndex = Math.round(mn.f.y[i] + 7 * PX) * 2;
      this.light(mn.f.x[i], mn.f.y[i], 60, 0.4, SCHOOLS.necro.color);
    }

    const g = this.gems;
    const bob = Math.round(Math.sin(t * 5) * 1.5);
    for (let i = 0; i < g.n; i++) g.sprites[i].position.set(Math.round(g.f.x[i]), Math.round(g.f.y[i]) + bob);

    const sp = this.sparks;
    for (let i = 0; i < sp.n; i++) {
      const s = sp.sprites[i];
      s.position.set(Math.round(sp.f.x[i]), Math.round(sp.f.y[i]));
      s.alpha = Math.min(1, (sp.f.life[i] / sp.f.max[i]) * 2);
    }
    const gb = this.gibs;
    for (let i = 0; i < gb.n; i++) {
      const s = gb.sprites[i];
      s.position.set(Math.round(gb.f.x[i]), Math.round(gb.f.y[i] - gb.f.z[i]));
      s.alpha = Math.min(1, (gb.f.life[i] / gb.f.max[i]) * 3);
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
    const mech = this.mechT > 0;
    this.player.texture = mech ? this.mechTex[walk] : this.mageTex[walk];
    const psc = mech ? PX * 1.4 : PX;
    this.player.scale.set(psc * this.face, psc);
    this.player.position.set(Math.round(this.px), Math.round(this.py));
    this.player.zIndex = Math.round(this.py + 7 * PX) * 2 + 1;
    const blink = this.dashT <= 0 && !mech && this.iframes > 0 && ((t * 20) | 0) & 1;
    this.player.visible = !this.over && !blink;
    this.player.tint = this.rage > 0 ? 0xffb0b0 : 0xffffff;

    this.glow.position.set(this.px, this.py);
    this.glow.alpha = this.look.glow + Math.sin(t * 2.2) * 0.03;

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

    // стрелки к важным объектам за краем экрана
    const sg = this.screenG;
    sg.clear();
    const targets: [number, number, number][] = this.pickups.filter((p) => p.kind !== 'heal').map((p) => [p.x, p.y, p.kind === 'fountain' ? COL.blood : COL.gold]);
    if (this.bossI >= 0) targets.push([ef.x[this.bossI], ef.y[this.bossI], COL.blood]);
    for (const [ox, oy, col] of targets) {
      const dx = ox - this.px;
      const dy = oy - this.py;
      if (Math.abs(dx) < this.viewHW - 20 && Math.abs(dy) < this.viewHH - 20) continue;
      const a = Math.atan2(dy, dx);
      const k = Math.min((w / 2 - 34) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - 34) / Math.abs(Math.sin(a) || 1e-6));
      const ax = w / 2 + Math.cos(a) * k;
      const ay = h / 2 + Math.sin(a) * k;
      const c = Math.cos(a);
      const s = Math.sin(a);
      sg.poly([ax + c * 12, ay + s * 12, ax - c * 6 - s * 8, ay - s * 6 + c * 8, ax - c * 6 + s * 8, ay - s * 6 - c * 8]).fill({ color: col, alpha: 0.9 });
    }

    this.hud.setDash(Math.max(0, this.dashCd / CFG.dash.cooldown));
    this.hud.update(this.level, this.time, this.kills, this.xp / this.need, this.bossSpawned ? -1 : this.nextBoss, this.run.shards);
  }
}
