import type { Sound } from '../audio.js';
import type { Renderer } from '../gl/renderer.js';
import { project } from '../gl/math.js';
import { CELL, makeGround } from '../gl/textures.js';
import { GOBLIN, LEVELS, type EnemyDef, type LevelDef } from './content.js';
import { AFFIXES, AF } from './elites.js';
import { Fx } from './fx.js';
import { applyMods, baseStats, heroById, IMPLANTS, implantById, PROTOCOLS, protoById, type Flag, type HeroDef, type Stats } from './heroes.js';
import type { Input } from './input.js';
import { drawChest, drawEnemy, drawFountain, drawHealOrb, drawHero, drawMinion, drawShrine, rgb, type Pose, type RGB } from './models.js';
import { Grid, SoA } from './pools.js';
import type { Choice, RunOpts, Slot, UI } from './types.js';
import { HALF, World } from './world.js';

export const TIERS = [
  { name: 'Обычная', hp: 1, dmg: 1, rate: 1, boss: 1 },
  { name: 'Кошмар', hp: 2.3, dmg: 1.6, rate: 1.2, boss: 1.7 },
  { name: 'Ад', hp: 4.5, dmg: 2.3, rate: 1.4, boss: 2.6 },
];

const TAU = Math.PI * 2;
const RUN_TIME = 720; // 12 минут, обратный отсчёт
const PHASE = 240;
const BOSS = 9;
const GOB = 10;
const PR = 0.5; // радиус героя
const UNLOCK = [0, 20, 50, 90, 130, 180, 230, 290, 350];
const WEIGHT = [10, 6, 5, 5, 4, 3, 3, 3, 3];
const ELEM: Record<string, number> = { volt: 0, ember: 1, frost: 2, rot: 3, gear: 4, glitch: 5 };
const xpNeed = (l: number) => Math.round(5 + 4 * l + 0.6 * l * l);

type EK =
  | 'x' | 'z' | 'kx' | 'kz' | 'hp' | 'mhp' | 'spd' | 'r' | 'dmg' | 'type' | 'ph' | 'flash' | 'burn' | 'bdps' | 'chill' | 'frz'
  | 'inf' | 'idps' | 'stun' | 'ai' | 'st' | 'dx' | 'dz' | 'elite' | 'gen' | 'aff' | 'at' | 'kb' | 'sc' | 'yaw' | 'xp' | 'move';
type BK = 'x' | 'y' | 'z' | 'vx' | 'vz' | 'life' | 'dmg' | 'pierce' | 'kind' | 'last' | 'r' | 'g' | 'b' | 'size' | 'rico';
type SK = 'x' | 'z' | 'vx' | 'vz' | 'life' | 'dmg' | 'r' | 'g' | 'b';
type GK = 'x' | 'z' | 'val' | 'mag' | 'v';
type MK = 'x' | 'z' | 'life' | 'dmg' | 'tg' | 'cd' | 'yaw';

interface Hazard { x: number; z: number; r: number; delay: number; max: number; life: number; dmg: number; c: RGB; hit: boolean }
interface Zone { x: number; z: number; r: number; life: number; dps: number; c: RGB; tick: number }
interface Pickup { kind: 'heal' | 'coin' | 'chest' | 'shrine' | 'fountain'; x: number; z: number; life: number; val: number }
interface Decoy { x: number; z: number; life: number; dmg: number }

export class Run {
  readonly L: LevelDef;
  readonly hero: HeroDef;
  private T = TIERS[0];
  private world: World;
  private fx = new Fx();
  private grid = new Grid(3, 34, -51, 600);
  private roster: EnemyDef[];
  private e = new SoA<EK>(600, ['x', 'z', 'kx', 'kz', 'hp', 'mhp', 'spd', 'r', 'dmg', 'type', 'ph', 'flash', 'burn', 'bdps', 'chill', 'frz', 'inf', 'idps', 'stun', 'ai', 'st', 'dx', 'dz', 'elite', 'gen', 'aff', 'at', 'kb', 'sc', 'yaw', 'xp', 'move']);
  private b = new SoA<BK>(900, ['x', 'y', 'z', 'vx', 'vz', 'life', 'dmg', 'pierce', 'kind', 'last', 'r', 'g', 'b', 'size', 'rico']);
  private s = new SoA<SK>(400, ['x', 'z', 'vx', 'vz', 'life', 'dmg', 'r', 'g', 'b']);
  private gems = new SoA<GK>(500, ['x', 'z', 'val', 'mag', 'v']);
  private minions = new SoA<MK>(20, ['x', 'z', 'life', 'dmg', 'tg', 'cd', 'yaw']);
  private hazards: Hazard[] = [];
  private zones: Zone[] = [];
  private pickups: Pickup[] = [];
  private decoys: Decoy[] = [];

  // герой
  px = 0;
  pz = 0;
  private yaw = 0;
  private aimX = 0;
  private aimZ = 1;
  private moving = 0;
  private aiming = 0;
  private hp = 100;
  private iframes = 0;
  private hurtT = 0;
  private fireCd = 0;
  private burstLeft = 0;
  private burstCd = 0;
  private shotN = 0;
  private skillCd = 0;
  private dodgeCd = 0;
  private dashT = 0;
  private dashX = 0;
  private dashZ = 0;
  private stats: Stats = baseStats();
  private flags = new Map<Flag, number>();
  private implants = new Map<string, number>();
  private protos = new Map<string, number>();
  private banished = new Set<string>();
  private revives = 0;

  // ход забега
  time = 0;
  private level = 1;
  private xp = 0;
  private need = xpNeed(1);
  private pending = 0;
  private coins = 0;
  private kills = 0;
  private killsBy: Record<string, number> = {};
  private spawnAcc = 0;
  private nextGuard = PHASE;
  private bossSpawned = false;
  private bossI = -1;
  private bossT = 3;
  private bossPat = 0;
  private victoryT = -1;
  private nextShrine = 70;
  private nextFountain = 110;
  private nextHorde = 60;
  private goblinAt: number[];
  private skips = 3;
  private banishLeft = 2;
  private refreshes = 0;
  private choiceOpen = false;
  private choiceLeft = 0;
  private choiceOpts: Choice[] = [];
  private paused = false;
  private over = false;
  private rage = 0;
  private chillP = 0;
  private haste = 0;
  private novaT = 5;
  private frostNovaCd = 0;
  private magnetT = 20;
  private droneAng = 0;
  private droneCd = 0;
  private skillT = 0;
  private skillTick = 0;
  private stopT = 0;
  private run = { bosses: 0, elites: 0, goblins: 0, skillUses: 0, dodges: 0 };
  private acc = 0;
  private hudT = 0;
  private shake = 0;
  private slowT = 0;
  private heroGlow: RGB;
  private weaponCol: RGB;
  private elem: number;

  constructor(
    private r: Renderer,
    private input: Input,
    private ui: UI,
    private sfx: Sound,
    readonly opts: RunOpts,
    numbers: boolean,
  ) {
    this.L = LEVELS[opts.level];
    this.T = TIERS[opts.tier] ?? TIERS[0];
    this.hero = heroById(opts.hero);
    this.elem = ELEM[this.hero.id] ?? 0;
    this.heroGlow = rgb(this.hero.look.glow);
    this.weaponCol = rgb(this.hero.weapon.color);
    this.roster = [...this.L.enemies, this.L.boss, GOBLIN];
    this.world = new World(this.L, opts.seed);
    this.fx.numbers = numbers;
    this.goblinAt = [80 + Math.random() * 40, 330 + Math.random() * 60];
    this.recalc();
    this.hp = this.stats.maxHp;
    this.revives = this.stats.revive;

    const g = this.L.ground;
    r.setGround(makeGround(g), 12, HALF * 2 + 60);
    r.bounds = [-HALF, -HALF, HALF, HALF];
    const fog = rgb(this.L.sky);
    r.fog = [fog[0], fog[1], fog[2]];
    r.clear = [fog[0], fog[1], fog[2]];
    r.fogRange = [26, 60];
    r.cam.pitch = 0.98;
    r.cam.yaw = 0;
    r.cam.fov = 0.7;
    this.ui.banner(`${this.L.name} · ${this.T.name}`, '#ffd24a');
    this.pushSlots();
  }

  // ---------- характеристики ----------

  private flag(f: Flag) {
    return this.flags.has(f);
  }

  private recalc() {
    const s = baseStats();
    const h = this.hero;
    const lv = this.opts.heroLevel;
    applyMods(s, { dmg: 0.04 * (lv - 1), maxHp: 5 * (lv - 1) });
    const flags = new Map<Flag, number>();
    const addFlag = (f: Flag | undefined) => {
      if (f) flags.set(f, (flags.get(f) ?? 0) + 1);
    };
    addFlag(h.passive.flag);
    this.opts.talents.forEach((pick, tier) => {
      const t = pick >= 0 ? h.talents[tier]?.[pick] : undefined;
      if (!t) return;
      applyMods(s, t.mods);
      addFlag(t.flag);
    });
    const sets = new Map<string, number>();
    for (const [id, lvl] of this.implants) {
      const imp = implantById(id);
      applyMods(s, imp.mods, 0.4 + 0.6 * lvl);
      sets.set(imp.hero, (sets.get(imp.hero) ?? 0) + 1);
    }
    for (const [hid, n] of sets) {
      const hd = heroById(hid);
      if (n >= 2) {
        addFlag(hd.set2.flag);
        if (hd.set2.mods) applyMods(s, hd.set2.mods);
      }
      if (n >= 3) {
        addFlag(hd.set3.flag);
        if (hd.set3.mods) applyMods(s, hd.set3.mods);
      }
    }
    for (const [id, lvl] of this.protos) {
      const p = protoById(id);
      applyMods(s, p.mods, lvl);
      addFlag(p.flag);
    }
    if (flags.has('noCrit')) s.crit = 0;
    s.armor = Math.min(0.6, s.armor);
    s.maxHp = Math.max(20, s.maxHp);
    const oldMax = this.stats.maxHp;
    this.stats = s;
    this.flags = flags;
    if (s.maxHp > oldMax) this.hp += s.maxHp - oldMax;
    this.hp = Math.min(this.hp, s.maxHp);
  }

  maxSet() {
    const sets = new Map<string, number>();
    for (const id of this.implants.keys()) {
      const h = implantById(id).hero;
      sets.set(h, (sets.get(h) ?? 0) + 1);
    }
    return Math.max(0, ...sets.values());
  }

  private pushSlots() {
    const imps: Slot[] = [...this.implants].map(([id, lvl]) => ({ id, lvl }));
    const protos: Slot[] = [...this.protos].map(([id, lvl]) => ({ id, lvl }));
    this.ui.slots(imps, protos);
  }

  // ---------- цикл ----------

  frame(dt: number) {
    const real = Math.min(dt, 0.1);
    if (this.slowT > 0) this.slowT -= real;
    if (this.choiceOpen && !this.paused) {
      this.choiceLeft -= real;
      this.ui.choiceTimer(Math.max(0, this.choiceLeft));
      if (this.choiceLeft <= 0) this.pickChoice(0);
    }
    if (!this.paused && !this.choiceOpen && !this.over) {
      this.acc += real * (this.slowT > 0 ? 0.35 : 1);
      while (this.acc >= 1 / 60) {
        this.update(1 / 60);
        this.acc -= 1 / 60;
        if (this.choiceOpen || this.over) break;
      }
    }
    this.render(real);
  }

  // для автотестов: прогнать симуляцию без отрисовки, выборы делаются случайно
  debugSim(sec: number, drive?: (t: number) => [number, number]) {
    const steps = Math.round(sec * 60);
    for (let k = 0; k < steps && !this.over; k++) {
      if (drive) {
        const [mx, mz] = drive(this.time);
        this.input.drive(mx, mz);
      }
      if (this.choiceOpen) this.pickChoice((Math.random() * this.choiceOpts.length) | 0);
      this.update(1 / 60);
    }
    return { t: this.time, hp: this.hp, lvl: this.level, kills: this.kills, enemies: this.e.n, over: this.over, imps: [...this.implants], protos: [...this.protos] };
  }

  debugGod() {
    this.stats.maxHp = 99999;
    this.hp = 99999;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.sfx.duck(p);
  }

  isPaused() {
    return this.paused;
  }

  isOver() {
    return this.over;
  }

  quit() {
    this.end(false);
  }

  private update(dt: number) {
    this.time += dt;
    const s = this.stats;
    this.input.poll();

    // движение и рывок
    const mx = this.input.mx;
    const mz = this.input.mz;
    const speed = 6.2 * s.move * (this.haste > 0 ? 1.25 : 1) * (this.chillP > 0 ? 0.6 : 1);
    if (this.chillP > 0) this.chillP -= dt;
    if (this.input.consumeDodge() && this.dodgeCd <= 0) this.dodge(mx, mz);
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.px += this.dashX * 22 * dt;
      this.pz += this.dashZ * 22 * dt;
      if (Math.random() < 0.6) this.fx.part(this.px, 0.9, this.pz, 0, 0, 0, 0.25, 0.9, this.heroGlow, CELL.glow, 3);
    } else {
      this.px += mx * speed * dt;
      this.pz += mz * speed * dt;
    }
    this.moving = Math.min(1, Math.hypot(mx, mz));
    const p = { x: this.px, z: this.pz };
    this.world.collide(p, PR);
    this.px = p.x;
    this.pz = p.z;

    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtT > 0) this.hurtT -= dt * 3;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.skillCd > 0) this.skillCd -= dt;
    if (this.rage > 0) this.rage -= dt;
    if (this.haste > 0) this.haste -= dt;
    if (this.stopT > 0) this.stopT -= dt;
    if (this.frostNovaCd > 0) this.frostNovaCd -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
    if (this.input.consumeSkill() && this.skillCd <= 0) this.useSkill();
    this.updateSkill(dt);

    // особые свойства с таймерами
    if (this.flag('novaOnHit')) {
      this.novaT -= dt;
      if (this.novaT <= 0) {
        this.novaT = 5;
        this.nova(4.5 * s.area, 30, this.heroGlow, false);
      }
    }
    if (this.flag('magnet')) {
      this.magnetT -= dt;
      if (this.magnetT <= 0) {
        this.magnetT = 20;
        for (let i = 0; i < this.gems.n; i++) this.gems.f.mag[i] = 1;
      }
    }

    this.director(dt);
    this.rebuildGrid();
    this.updateEnemies(dt);
    this.updateWeapon(dt);
    this.updateBullets(dt);
    this.updateShots(dt);
    this.updateHazards(dt);
    this.updateZones(dt);
    this.updateMinions(dt);
    this.updateDrones(dt);
    this.updateDecoys(dt);
    this.reap();
    this.updateGems(dt);
    this.updatePickups(dt);
    this.updateWorld();
    this.fx.update(dt);

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
      if (this.revives > 0) {
        this.revives--;
        this.hp = s.maxHp * 0.5;
        this.iframes = 2;
        this.nova(7, 200, this.heroGlow, false);
        this.ui.banner('Второй шанс', '#3ef0ff');
        this.sfx.legendary();
      } else {
        this.fx.burst(this.px, 1, this.pz, 40, 8, this.heroGlow, 1, 0.5);
        this.end(false);
        return;
      }
    }
    if (this.pending > 0 && !this.choiceOpen) this.openChoice(false);
  }

  private dodge(mx: number, mz: number) {
    let dx = mx;
    let dz = mz;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) {
      dx = Math.sin(this.yaw);
      dz = Math.cos(this.yaw);
    } else {
      dx /= l;
      dz /= l;
    }
    this.dashX = dx;
    this.dashZ = dz;
    this.dashT = 0.18;
    this.iframes = Math.max(this.iframes, 0.3);
    this.dodgeCd = 3 * (1 - Math.min(0.6, this.stats.dodgeCd));
    this.run.dodges++;
    this.sfx.dash();
    this.fx.ring(this.px, this.pz, 1.5, this.heroGlow);
    if (this.flag('decoyOnDodge')) this.decoys.push({ x: this.px, z: this.pz, life: 2.5, dmg: 50 });
  }

  // ---------- умения героев ----------

  private useSkill() {
    const s = this.stats;
    this.skillCd = this.hero.skill.cd * (1 - Math.min(0.6, s.skillCd));
    this.run.skillUses++;
    this.ui.banner(this.hero.skill.name, this.hero.look.glow);
    this.sfx.evolve();
    this.slowT = 0.3;
    this.shake = 0.6;
    this.fx.ring(this.px, this.pz, 8, this.heroGlow, 0.5);
    const pw = s.skillPower * s.dmg;
    const f = this.e.f;
    switch (this.hero.id) {
      case 'volt':
        this.skillT = 3;
        break;
      case 'ember':
        this.skillT = 4;
        break;
      case 'gear':
        this.skillT = 2;
        break;
      case 'frost': {
        const R = 11 * s.area;
        for (let i = 0; i < this.e.n; i++) {
          if (f.hp[i] <= 0 || Math.hypot(f.x[i] - this.px, f.z[i] - this.pz) > R) continue;
          this.freeze(i, 5);
          this.damage(i, 60 * pw, 0, 0, true);
        }
        this.fx.ring(this.px, this.pz, R, rgb('#bfe8ff'), 0.6);
        this.fx.burst(this.px, 1, this.pz, 40, 10, rgb('#e8ffff'), 0.7, 0.3);
        break;
      }
      case 'rot':
        for (let k = 0; k < Math.round(6 * s.skillPower); k++) {
          const a = (k / 6) * TAU;
          this.spawnMinion(this.px + Math.cos(a) * 2, this.pz + Math.sin(a) * 2, 18 * pw, 12);
        }
        break;
      case 'glitch':
        this.stopT = 4 * s.skillPower;
        this.fx.ring(this.px, this.pz, 14, this.heroGlow, 0.7);
        break;
    }
  }

  private updateSkill(dt: number) {
    if (this.skillT <= 0) return;
    this.skillT -= dt;
    this.skillTick -= dt;
    if (this.skillTick > 0) return;
    const s = this.stats;
    const pw = s.skillPower * s.dmg;
    const f = this.e.f;
    if (this.hero.id === 'volt') {
      this.skillTick = 0.12;
      const j = this.randomNear(this.px, this.pz, 13);
      if (j < 0) return;
      this.fx.lightning(f.x[j], 9, f.z[j], f.x[j], 0.5, f.z[j], this.heroGlow, 0.2);
      this.aoe(f.x[j], f.z[j], 2.2 * s.area, 55 * pw, (k) => this.stunE(k, 0.4));
      this.fx.ring(f.x[j], f.z[j], 2.2, this.heroGlow);
      this.sfx.hit(0);
    } else if (this.hero.id === 'ember') {
      this.skillTick = 0.16;
      const a = Math.random() * TAU;
      const d = Math.random() * 10;
      const x = this.px + Math.cos(a) * d;
      const z = this.pz + Math.sin(a) * d;
      this.aoe(x, z, 2.6 * s.area, 65 * pw, (k) => this.burnE(k, 3, 12 * pw));
      this.zones.push({ x, z, r: 2 * s.area, life: 2.5, dps: 20 * pw, c: rgb('#ff7a2d'), tick: 0 });
      this.fx.burst(x, 0.5, z, 14, 6, rgb('#ffb03a'), 0.5, 0.35);
      this.fx.ring(x, z, 2.6, rgb('#ff7a2d'));
      this.sfx.boom();
    } else if (this.hero.id === 'gear') {
      this.skillTick = 0.33;
      const j = this.densest();
      if (j < 0) return;
      const x = f.x[j];
      const z = f.z[j];
      this.aoe(x, z, 4 * s.area, 150 * pw);
      for (let k = 0; k < 8; k++) this.fx.part(x, k * 1.2, z, 0, 0, 0, 0.35, 1.6, rgb('#ffd24a'), CELL.glow, 3);
      this.fx.ring(x, z, 4, rgb('#ffd24a'), 0.45);
      this.fx.burst(x, 0.5, z, 20, 9, rgb('#fff3c0'), 0.5, 0.35);
      this.shake = 0.5;
      this.sfx.boom(true);
    }
  }

  // ---------- режиссёр: спавн, орды, стражи фаз, босс ----------

  private ringPoint(): [number, number] {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * TAU;
      const d = 20 + Math.random() * 6;
      const x = this.px + Math.cos(a) * d;
      const z = this.pz + Math.sin(a) * d;
      if (Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1) return [x, z];
    }
    return [Math.max(-HALF + 2, Math.min(HALF - 2, this.px + 20)), this.pz];
  }

  private pickType() {
    let total = 0;
    for (let k = 0; k < 9; k++) if (this.time >= UNLOCK[k]) total += WEIGHT[k];
    let r = Math.random() * total;
    for (let k = 0; k < 9; k++) {
      if (this.time < UNLOCK[k]) continue;
      r -= WEIGHT[k];
      if (r <= 0) return k;
    }
    return 0;
  }

  private director(dt: number) {
    const t = this.time;
    if (this.victoryT < 0 && this.stopT <= 0) {
      const cap = Math.min(420, 160 + t * 0.5);
      let rate = Math.min(14, 0.9 + (t / 60) * 1.35) * this.L.rate * this.T.rate;
      if (this.bossSpawned) rate *= 0.35;
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.e.n >= cap) continue;
        const [x, z] = this.ringPoint();
        this.spawn(this.pickType(), x, z, 0, 0);
      }
    }
    if (t >= this.nextHorde && !this.bossSpawned) {
      this.nextHorde += 60;
      this.ui.banner('Приближается орда', '#ff5a5a');
      this.sfx.horde();
      const n = 14 + Math.floor(t / 60) * 4;
      const type = this.pickType();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = Math.max(-HALF + 1, Math.min(HALF - 1, this.px + Math.cos(a) * 21));
        const z = Math.max(-HALF + 1, Math.min(HALF - 1, this.pz + Math.sin(a) * 21));
        this.spawn(type, x, z, 0, 0);
      }
    }
    // стражи фаз: усиленная элита с двумя аффиксами
    if (t >= this.nextGuard && this.nextGuard < RUN_TIME) {
      this.nextGuard += PHASE;
      const [x, z] = this.ringPoint();
      const i = this.spawn(this.pickType(), x, z, 2, 0);
      if (i >= 0) this.ui.banner(`Страж фазы ${Math.round(t / PHASE)}`, '#ffc94a');
      this.sfx.boss();
    }
    if (!this.bossSpawned && t >= RUN_TIME) {
      this.bossSpawned = true;
      const a = Math.random() * TAU;
      const x = Math.max(-HALF + 3, Math.min(HALF - 3, this.px + Math.cos(a) * 14));
      const z = Math.max(-HALF + 3, Math.min(HALF - 3, this.pz + Math.sin(a) * 14));
      this.spawn(BOSS, x, z, 0, 0);
      this.ui.banner(`Босс: ${this.L.boss.title}`, '#ff2d55');
      this.sfx.boss();
      this.sfx.intensity(1);
      this.slowT = 0.8;
      this.shake = 1;
    }
    while (this.goblinAt.length && t >= this.goblinAt[0]) {
      this.goblinAt.shift();
      const a = Math.random() * TAU;
      const x = Math.max(-HALF + 2, Math.min(HALF - 2, this.px + Math.cos(a) * 11));
      const z = Math.max(-HALF + 2, Math.min(HALF - 2, this.pz + Math.sin(a) * 11));
      if (this.spawn(GOB, x, z, 0, 0) >= 0) {
        this.ui.banner('Гоблин-майнер! Догони его', '#ffc94a');
        this.sfx.goblin();
      }
    }
    if (t >= this.nextShrine) {
      this.nextShrine += 80;
      this.placeNear('shrine', 40);
    }
    if (t >= this.nextFountain) {
      this.nextFountain += 120;
      this.placeNear('fountain', 40);
    }
  }

  private placeNear(kind: Pickup['kind'], life: number) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU;
      const p = { x: this.px + Math.cos(a) * 12, z: this.pz + Math.sin(a) * 12 };
      if (this.world.collide(p, 1.5)) continue;
      this.pickups.push({ kind, x: p.x, z: p.z, life, val: 0 });
      return;
    }
  }

  private spawn(type: number, x: number, z: number, elite: number, gen: number) {
    const i = this.e.add();
    if (i < 0) return -1;
    const d = this.roster[type];
    const f = this.e.f;
    const t = this.time;
    const boss = type === BOSS;
    const sz = (elite === 2 ? 1.8 : elite ? 1.4 : 1) * (gen ? 0.65 : 1);
    const hpScale = boss ? this.T.boss : this.L.hpMul * this.T.hp * (1 + t / 180) * (type === GOB ? 6 : 1);
    f.x[i] = x;
    f.z[i] = z;
    f.hp[i] = f.mhp[i] = d.hp * hpScale * (elite === 2 ? 30 : elite ? 10 : 1) * (gen ? 0.35 : 1);
    f.spd[i] = d.spd * (0.9 + Math.random() * 0.2);
    f.r[i] = d.r * sz * (d.size ?? 1);
    f.sc[i] = (d.size ?? 1) * sz;
    f.dmg[i] = d.dmg * this.L.dmgMul * this.T.dmg * (1 + t / 400);
    f.type[i] = type;
    f.ph[i] = Math.random() * 10;
    f.ai[i] = boss ? 0 : type === GOB ? 25 : d.cd * (0.5 + Math.random() * 0.5);
    f.elite[i] = elite;
    f.gen[i] = gen;
    f.kb[i] = d.kb * (elite ? 0.4 : 1);
    f.xp[i] = d.xp * (elite === 2 ? 40 : elite ? 15 : 1);
    if (elite) {
      const pool = [...AFFIXES];
      let mask = 0;
      const names: string[] = [];
      for (let k = 0; k < (elite === 2 ? 2 : 1) + this.opts.tier; k++) {
        const a = pool.splice((Math.random() * pool.length) | 0, 1)[0];
        if (!a) break;
        mask |= a.bit;
        names.push(a.adj);
      }
      f.aff[i] = mask;
      if (mask & AF.fast) f.spd[i] *= 1.5;
      if (elite === 1) this.ui.banner(`Элита: ${names.join(' ')} ${d.name}`, '#ffc94a');
    }
    return i;
  }

  // ---------- враги ----------

  private rebuildGrid() {
    this.grid.reset();
    const f = this.e.f;
    for (let i = 0; i < this.e.n; i++) this.grid.insert(i, f.x[i], f.z[i]);
  }

  private updateEnemies(dt: number) {
    const f = this.e.f;
    const n = this.e.n;
    const decoy = this.decoys[0];
    const timeStop = this.stopT > 0;
    this.bossI = -1;
    for (let i = 0; i < n; i++) {
      if (f.hp[i] <= 0) continue;
      const tp = f.type[i];
      const d = this.roster[tp];
      if (tp === BOSS) this.bossI = i;
      if (f.flash[i] > 0) f.flash[i] -= dt;
      if (f.burn[i] > 0) {
        f.burn[i] -= dt;
        f.hp[i] -= f.bdps[i] * dt;
        if (Math.random() < dt * 6) this.fx.part(f.x[i], 1, f.z[i], 0, 2, 0, 0.4, 0.35, [1, 0.5, 0.15], CELL.flame, 3);
      }
      if (f.inf[i] > 0) {
        f.inf[i] -= dt;
        f.hp[i] -= f.idps[i] * dt;
        if (Math.random() < dt * 4) this.fx.part(f.x[i], 1.2, f.z[i], 0, 1, 0, 0.5, 0.3, [0.5, 1, 0.4], CELL.smoke, 2);
      }
      if (f.chill[i] > 0) f.chill[i] = Math.max(0, f.chill[i] - dt * 0.8);
      if (f.hp[i] <= 0) continue;

      const pdx = this.px - f.x[i];
      const pdz = this.pz - f.z[i];
      const pd = Math.hypot(pdx, pdz) || 1;
      if (timeStop && tp !== BOSS) {
        f.move[i] = 0;
        continue;
      }
      if (f.stun[i] > 0 || f.frz[i] > 0) {
        if (f.stun[i] > 0) f.stun[i] -= dt;
        if (f.frz[i] > 0) f.frz[i] -= dt;
        f.x[i] += f.kx[i] * dt;
        f.z[i] += f.kz[i] * dt;
        f.kx[i] *= 0.85;
        f.kz[i] *= 0.85;
        f.move[i] = 0;
        continue;
      }
      // цель: голограмма поблизости или герой
      let tx = this.px;
      let tz = this.pz;
      if (decoy && Math.hypot(decoy.x - f.x[i], decoy.z - f.z[i]) < 18) {
        tx = decoy.x;
        tz = decoy.z;
      }
      const dx = tx - f.x[i];
      const dz = tz - f.z[i];
      const dd = Math.hypot(dx, dz) || 1;
      const ux = dx / dd;
      const uz = dz / dd;
      const slow = (1 - Math.min(0.6, f.chill[i] * 0.12)) * (tp === BOSS && f.chill[i] > 0 ? 0.8 : 1);
      const sp = f.spd[i] * slow;
      let vx = ux * sp;
      let vz = uz * sp;
      let sep = true;
      if (f.aff[i]) this.affix(i, dt, pd);

      switch (d.beh) {
        case 'FLY': {
          const w = Math.sin(this.time * 3 + f.ph[i]) * 0.7;
          vx = (ux - uz * w) * sp;
          vz = (uz + ux * w) * sp;
          sep = false;
          break;
        }
        case 'RANGED':
        case 'SUMMON':
        case 'HEAL':
        case 'SPIT': {
          const keep = d.beh === 'HEAL' ? 7 : d.beh === 'SUMMON' ? 11 : 9.5;
          if (dd < keep - 2) {
            vx = -ux * sp;
            vz = -uz * sp;
          } else if (dd < keep + 1.5) {
            vx = -uz * sp * 0.5;
            vz = ux * sp * 0.5;
          }
          f.ai[i] -= dt;
          if (f.ai[i] <= 0 && dd < 20) {
            f.ai[i] = d.cd;
            this.ability(i, d, ux, uz);
          }
          break;
        }
        case 'CHARGE': {
          if (f.st[i] === 1) {
            vx = vz = 0;
            f.ai[i] -= dt;
            if (f.ai[i] <= 0) {
              f.st[i] = 2;
              f.ai[i] = 0.45;
            }
          } else if (f.st[i] === 2) {
            vx = f.dx[i];
            vz = f.dz[i];
            sep = false;
            f.ai[i] -= dt;
            if (f.ai[i] <= 0) {
              f.st[i] = 0;
              f.ai[i] = d.cd;
            }
          } else {
            f.ai[i] -= dt;
            if (f.ai[i] <= 0 && dd < 11) {
              f.st[i] = 1;
              f.ai[i] = 0.6;
              f.dx[i] = ux * sp * 4.2;
              f.dz[i] = uz * sp * 4.2;
            }
          }
          break;
        }
        case 'EXPLODE': {
          if (f.st[i] === 1) {
            vx = vz = 0;
            f.ai[i] -= dt;
            f.flash[i] = ((this.time * 12) | 0) & 1 ? 0.05 : 0;
            if (f.ai[i] <= 0) {
              this.explodeEnemy(i);
              continue;
            }
          } else if (pd < 1.9) {
            f.st[i] = 1;
            f.ai[i] = 0.55;
          }
          break;
        }
        case 'BLINK': {
          f.ai[i] -= dt;
          if (f.ai[i] <= 0 && dd < 22) {
            f.ai[i] = d.cd;
            this.fx.burst(f.x[i], 1, f.z[i], 10, 4, rgb(d.pal[2]), 0.4, 0.3);
            const a = Math.random() * TAU;
            const p = { x: this.px + Math.cos(a) * 5, z: this.pz + Math.sin(a) * 5 };
            this.world.collide(p, f.r[i]);
            f.x[i] = p.x;
            f.z[i] = p.z;
            this.fx.burst(f.x[i], 1, f.z[i], 10, 4, rgb(d.pal[2]), 0.4, 0.3);
          }
          break;
        }
        case 'FLEE': {
          const w = Math.sin(this.time * 2 + f.ph[i]) * 0.6;
          vx = (-ux - uz * w) * sp;
          vz = (-uz + ux * w) * sp;
          sep = false;
          f.ai[i] -= dt;
          if (Math.random() < dt * 5) this.fx.part(f.x[i], 1.3, f.z[i], 0, 1, 0, 0.5, 0.3, [1, 0.8, 0.3], CELL.coin, 3);
          if (f.ai[i] <= 0) {
            f.st[i] = 9;
            f.hp[i] = 0;
          }
          break;
        }
        case 'BOSS': {
          const res = this.bossBrain(i, dt, ux, uz, dd, sp);
          vx = res[0];
          vz = res[1];
          sep = false;
          break;
        }
      }

      if (sep && (i & 1) === (Math.floor(this.time * 60) & 1)) {
        let sx = 0;
        let sz = 0;
        let checks = 0;
        this.grid.each(f.x[i], f.z[i], f.r[i] * 2, (j) => {
          if (j === i || checks > 8) return;
          const ox = f.x[i] - f.x[j];
          const oz = f.z[i] - f.z[j];
          const rr = f.r[i] + f.r[j];
          const d2 = ox * ox + oz * oz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d1 = Math.sqrt(d2);
            sx += (ox / d1) * (rr - d1);
            sz += (oz / d1) * (rr - d1);
          }
          checks++;
        });
        f.x[i] += sx * 0.5;
        f.z[i] += sz * 0.5;
      }
      f.x[i] += (vx + f.kx[i]) * dt;
      f.z[i] += (vz + f.kz[i]) * dt;
      f.kx[i] *= 0.85;
      f.kz[i] *= 0.85;
      f.move[i] = Math.min(1, Math.hypot(vx, vz) / Math.max(0.1, f.spd[i]));
      if (Math.abs(vx) + Math.abs(vz) > 0.05) f.yaw[i] = Math.atan2(vx, vz);
      else f.yaw[i] = Math.atan2(pdx, pdz);
      if (d.beh !== 'FLY' && tp !== BOSS && d.beh !== 'FLEE' && (i & 3) === (Math.floor(this.time * 60) & 3)) {
        const p = { x: f.x[i], z: f.z[i] };
        this.world.collide(p, f.r[i] * 0.8);
        f.x[i] = p.x;
        f.z[i] = p.z;
      } else {
        f.x[i] = Math.max(-HALF, Math.min(HALF, f.x[i]));
        f.z[i] = Math.max(-HALF, Math.min(HALF, f.z[i]));
      }

      // контактный урон
      if (pd < f.r[i] + PR && f.dmg[i] > 0) {
        const landed = this.hurt(f.dmg[i]);
        if (landed) {
          if (f.aff[i] & AF.vampire) f.hp[i] = Math.min(f.mhp[i], f.hp[i] + f.mhp[i] * 0.2);
          if (this.flag('thorns')) this.damage(i, 15 * this.stats.dmg, -pdx / pd, -pdz / pd, true);
        }
      }
    }
    if (this.bossI >= 0) this.ui.boss(this.L.boss.title, f.hp[this.bossI] / f.mhp[this.bossI]);
  }

  private affix(i: number, dt: number, pd: number) {
    const f = this.e.f;
    const a = f.aff[i];
    const prev = f.at[i];
    f.at[i] += dt;
    const t = f.at[i];
    const every = (p: number) => Math.floor(t / p) !== Math.floor(prev / p);
    if (a & AF.fire && every(0.4)) this.hazard(f.x[i], f.z[i], 1.1, 0.35, 1.4, f.dmg[i] * 0.8, rgb('#ff7a2d'));
    if (a & AF.frost && pd < 5) {
      this.chillP = 0.3;
      if (Math.random() < dt * 4) this.fx.part(this.px, 1, this.pz, 0, 1, 0, 0.4, 0.3, [0.6, 0.85, 1], CELL.star, 3);
    }
    if (a & AF.vampire) f.hp[i] = Math.min(f.mhp[i], f.hp[i] + f.mhp[i] * 0.02 * dt);
    if (a & AF.teleport && every(4) && pd < 24) {
      this.fx.burst(f.x[i], 1, f.z[i], 10, 4, [0.77, 0.42, 1], 0.4, 0.3);
      const ang = Math.random() * TAU;
      const p = { x: this.px + Math.cos(ang) * 5, z: this.pz + Math.sin(ang) * 5 };
      this.world.collide(p, f.r[i]);
      f.x[i] = p.x;
      f.z[i] = p.z;
    }
    if (a & AF.arcane && every(3) && pd < 20) {
      for (let k = 0; k < 10; k++) {
        const b = (k / 10) * TAU + t;
        this.enemyShot(f.x[i], f.z[i], Math.cos(b) * 6, Math.sin(b) * 6, f.dmg[i] * 0.5, [0.24, 0.94, 1]);
      }
    }
  }

  private ability(i: number, d: EnemyDef, ux: number, uz: number) {
    const f = this.e.f;
    const col = rgb(d.pal[2]);
    switch (d.beh) {
      case 'RANGED':
        this.enemyShot(f.x[i], f.z[i], ux * d.proj, uz * d.proj, f.dmg[i] * 0.8, col);
        break;
      case 'SUMMON':
        for (let k = 0; k < d.count; k++) {
          const a = Math.random() * TAU;
          this.spawn(d.child, f.x[i] + Math.cos(a) * 1.4, f.z[i] + Math.sin(a) * 1.4, 0, 0);
        }
        this.fx.ring(f.x[i], f.z[i], 2.5, col);
        break;
      case 'HEAL':
        this.grid.each(f.x[i], f.z[i], 6, (j) => {
          if (j === i || f.hp[j] <= 0 || f.type[j] === BOSS) return;
          if (Math.hypot(f.x[j] - f.x[i], f.z[j] - f.z[i]) > 6) return;
          f.hp[j] = Math.min(f.mhp[j], f.hp[j] + f.mhp[j] * 0.25);
          this.fx.part(f.x[j], 1.6, f.z[j], 0, 1.5, 0, 0.5, 0.4, [0.5, 1, 0.45], CELL.plus, 2);
        });
        this.fx.ring(f.x[i], f.z[i], 6, [0.5, 1, 0.45]);
        break;
      case 'SPIT':
        this.hazard(this.px + (Math.random() - 0.5) * 2, this.pz + (Math.random() - 0.5) * 2, 2, 0.9, 2.5, f.dmg[i], rgb(d.pal[3]));
        break;
    }
  }

  private explodeEnemy(i: number) {
    const f = this.e.f;
    const col = rgb(this.roster[f.type[i]].pal[3]);
    if (Math.hypot(this.px - f.x[i], this.pz - f.z[i]) < 2.8) this.hurt(f.dmg[i]);
    f.hp[i] = 0;
    this.aoe(f.x[i], f.z[i], 2.8, f.dmg[i] * 2, undefined, true);
    this.fx.burst(f.x[i], 0.8, f.z[i], 24, 9, col, 0.5, 0.45);
    this.fx.ring(f.x[i], f.z[i], 2.8, col);
    this.shake = 0.4;
    this.sfx.boom();
  }

  private bossBrain(i: number, dt: number, ux: number, uz: number, d: number, sp: number): [number, number] {
    const f = this.e.f;
    const def = this.L.boss;
    const rage = f.hp[i] < f.mhp[i] * 0.5;
    const col = rgb(def.pal[2]);
    const acc = rgb(def.pal[3]);
    const dmg = f.dmg[i];
    if (f.st[i] === 1) {
      f.ai[i] -= dt;
      if (f.ai[i] <= 0) {
        f.st[i] = 2;
        f.ai[i] = 0.7;
      }
      return [0, 0];
    }
    if (f.st[i] === 2) {
      f.ai[i] -= dt;
      if (Math.random() < dt * 20) this.hazard(f.x[i], f.z[i], 1.6, 0.2, 0.2, dmg, [1, 0.18, 0.33]);
      if (f.ai[i] <= 0) f.st[i] = 0;
      return [f.dx[i], f.dz[i]];
    }
    let mv: [number, number] = d > 8 ? [ux * sp, uz * sp] : d < 5 ? [-ux * sp * 0.6, -uz * sp * 0.6] : [-uz * sp * 0.6, ux * sp * 0.6];
    this.bossT -= dt;
    if (this.bossT > 0) return mv;
    const p = def.patterns[this.bossPat++ % def.patterns.length];
    this.bossT = rage ? 1.6 : 2.4;
    const x = f.x[i];
    const z = f.z[i];
    switch (p) {
      case 'burst': {
        const n = rage ? 24 : 16;
        const off = Math.random() * TAU;
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * TAU;
          this.enemyShot(x, z, Math.cos(a) * 6.5, Math.sin(a) * 6.5, dmg * 0.6, col);
        }
        break;
      }
      case 'volley': {
        const base = Math.atan2(uz, ux);
        for (let w = 0; w < (rage ? 3 : 2); w++) {
          for (let k = -2; k <= 2; k++) {
            const a = base + k * 0.18 + w * 0.05;
            const v = 9 + w * 2;
            this.enemyShot(x, z, Math.cos(a) * v, Math.sin(a) * v, dmg * 0.6, acc);
          }
        }
        break;
      }
      case 'summon':
        for (let k = 0; k < (rage ? 9 : 6); k++) {
          const a = (k / 6) * TAU;
          this.spawn((Math.random() * 4) | 0, x + Math.cos(a) * 3, z + Math.sin(a) * 3, 0, 0);
        }
        this.fx.ring(x, z, 5, acc);
        break;
      case 'spikes':
        for (let k = 0; k < (rage ? 9 : 6); k++) {
          const a = Math.random() * TAU;
          const rr = 1 + Math.random() * 7;
          this.hazard(this.px + Math.cos(a) * rr, this.pz + Math.sin(a) * rr, 1.7, 0.9, 0.4, dmg * 0.9, acc);
        }
        break;
      case 'slam':
        this.hazard(x, z, 5, 0.8, 0.3, dmg * 1.2, [1, 0.18, 0.33]);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU;
          this.enemyShot(x, z, Math.cos(a) * 8, Math.sin(a) * 8, dmg * 0.5, acc);
        }
        this.shake = 0.6;
        break;
      case 'charge':
        f.st[i] = 1;
        f.ai[i] = rage ? 0.5 : 0.8;
        f.dx[i] = ux * 18;
        f.dz[i] = uz * 18;
        break;
      case 'teleport': {
        this.fx.burst(x, 1.5, z, 20, 6, col, 0.5, 0.4);
        const a = Math.random() * TAU;
        const q = { x: this.px + Math.cos(a) * 7, z: this.pz + Math.sin(a) * 7 };
        this.world.collide(q, f.r[i]);
        f.x[i] = q.x;
        f.z[i] = q.z;
        for (let k = 0; k < 12; k++) {
          const b = (k / 12) * TAU;
          this.enemyShot(q.x, q.z, Math.cos(b) * 5.5, Math.sin(b) * 5.5, dmg * 0.5, col);
        }
        mv = [0, 0];
        break;
      }
    }
    return mv;
  }

  // ---------- урон и статусы ----------

  damage(i: number, base: number, nx: number, nz: number, quiet = false): boolean {
    const f = this.e.f;
    if (f.hp[i] <= 0) return false;
    if (f.aff[i] & AF.shield && f.at[i] % 6 < 2) {
      if (Math.random() < 0.3) this.fx.part(f.x[i], 1.5, f.z[i], 0, 1, 0, 0.3, 0.4, [1, 0.85, 0.3], CELL.star, 3);
      return false;
    }
    const s = this.stats;
    const crit = Math.random() < s.crit;
    let d = base * (crit ? s.critDmg : 1) * (this.rage > 0 ? 1.5 : 1);
    if (f.burn[i] > 0 && this.flag('burnVuln')) d *= 1.3;
    if (f.frz[i] > 0 && this.flag('shatter')) d *= 2;
    f.hp[i] -= d;
    f.flash[i] = 0.08;
    const kb = 6 * f.kb[i] * (crit ? 1.6 : 1);
    f.kx[i] += nx * kb;
    f.kz[i] += nz * kb;
    if (s.lifesteal > 0) this.hp = Math.min(s.maxHp, this.hp + d * s.lifesteal);
    if (this.flag('execute') && f.type[i] !== BOSS && f.hp[i] > 0 && f.hp[i] < f.mhp[i] * 0.15) {
      f.hp[i] = 0;
      this.fx.part(f.x[i], 1.6, f.z[i], 0, 1, 0, 0.4, 0.6, [1, 0.3, 0.3], CELL.star, 3);
    }
    if (crit) {
      this.sfx.crit();
      if (this.flag('chainOnCrit')) this.chain(i, 2, d * 0.5);
    } else if (!quiet) this.sfx.hit(this.elem);
    if (!quiet || crit) this.fx.number(f.x[i], 1.9 * f.sc[i] + 0.4, f.z[i], d, crit, crit ? [1, 0.85, 0.2] : [1, 1, 1]);
    return f.hp[i] <= 0;
  }

  private onHit(i: number, nx: number, nz: number) {
    const f = this.e.f;
    const s = this.stats;
    if (s.burn > 0) this.burnE(i, 3, s.burn);
    if (s.chill > 0) this.freeze(i, s.chill);
    if (s.infect > 0) this.infectE(i, 4, s.infect);
    if (this.flag('stun') && Math.random() < 0.12) this.stunE(i, 0.5);
    if (this.flag('explosive')) {
      const twice = this.flag('doubleSpecial') && Math.random() < 0.3;
      for (let k = 0; k < (twice ? 2 : 1); k++) {
        this.aoe(f.x[i], f.z[i], 1.8 * s.area, 8 * s.dmg);
        this.fx.burst(f.x[i], 0.8, f.z[i], 8, 5, this.weaponCol, 0.3, 0.35);
      }
    }
    void nx;
    void nz;
  }

  aoe(x: number, z: number, r: number, dmg: number, each?: (i: number) => void, fromEnemy = false) {
    const f = this.e.f;
    this.grid.each(x, z, r + 1.5, (i) => {
      if (f.hp[i] <= 0) return;
      const dx = f.x[i] - x;
      const dz = f.z[i] - z;
      const d = Math.hypot(dx, dz);
      if (d > r + f.r[i]) return;
      this.damage(i, fromEnemy ? dmg : dmg, dx / (d || 1), dz / (d || 1), true);
      each?.(i);
    });
  }

  burnE(i: number, sec: number, dps: number) {
    const f = this.e.f;
    f.burn[i] = Math.max(f.burn[i], sec);
    f.bdps[i] = Math.max(f.bdps[i], dps);
  }

  infectE(i: number, sec: number, dps: number) {
    const f = this.e.f;
    f.inf[i] = Math.max(f.inf[i], sec);
    f.idps[i] = Math.max(f.idps[i], dps);
  }

  stunE(i: number, sec: number) {
    const f = this.e.f;
    f.stun[i] = Math.max(f.stun[i], f.type[i] === BOSS ? sec * 0.2 : sec);
  }

  freeze(i: number, stacks: number) {
    const f = this.e.f;
    f.chill[i] += stacks;
    if (f.type[i] === BOSS) return;
    if (f.chill[i] >= 5) {
      f.chill[i] = 0;
      f.frz[i] = 1.6;
      this.fx.burst(f.x[i], 1, f.z[i], 6, 3, [0.75, 0.92, 1], 0.4, 0.3, CELL.star);
    }
  }

  private chain(from: number, n: number, dmg: number) {
    const f = this.e.f;
    const used = new Set([from]);
    let x = f.x[from];
    let z = f.z[from];
    for (let k = 0; k < n; k++) {
      const t = this.nearest(x, z, 7, used);
      if (t < 0) break;
      used.add(t);
      this.fx.lightning(x, 1, z, f.x[t], 1, f.z[t], this.hero.id === 'volt' ? this.heroGlow : [0.6, 0.95, 1]);
      this.damage(t, dmg, 0, 0, true);
      this.onHit(t, 0, 0);
      x = f.x[t];
      z = f.z[t];
    }
  }

  nearest(x: number, z: number, range: number, except?: Set<number>) {
    const f = this.e.f;
    let best = -1;
    let bd = range * range;
    for (let i = 0; i < this.e.n; i++) {
      if (f.hp[i] <= 0 || except?.has(i)) continue;
      const dx = f.x[i] - x;
      const dz = f.z[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  private randomNear(x: number, z: number, range: number) {
    const f = this.e.f;
    let pick = -1;
    let seen = 0;
    for (let i = 0; i < this.e.n; i++) {
      if (f.hp[i] <= 0) continue;
      if (Math.hypot(f.x[i] - x, f.z[i] - z) > range) continue;
      if (Math.random() * ++seen < 1) pick = i;
    }
    return pick;
  }

  private densest() {
    let best = -1;
    let bc = -1;
    const f = this.e.f;
    for (let k = 0; k < 12; k++) {
      const j = this.randomNear(this.px, this.pz, 16);
      if (j < 0) break;
      let c = 0;
      this.grid.each(f.x[j], f.z[j], 3, () => c++);
      if (c > bc) {
        bc = c;
        best = j;
      }
    }
    return best;
  }

  private hurt(dmg: number) {
    if (this.iframes > 0 || this.dashT > 0 || this.over || this.victoryT >= 0) return false;
    this.hp -= dmg * (1 - this.stats.armor);
    this.iframes = 0.5;
    this.hurtT = 1;
    this.shake = Math.max(this.shake, 0.35);
    this.sfx.hurt();
    if (this.flag('frostNova') && this.frostNovaCd <= 0) {
      this.frostNovaCd = 3;
      this.nova(5 * this.stats.area, 15, [0.75, 0.92, 1], true);
    }
    return true;
  }

  private nova(r: number, base: number, c: RGB, frost: boolean) {
    this.aoe(this.px, this.pz, r, base * this.stats.dmg, frost ? (i) => this.freeze(i, 5) : undefined);
    this.fx.ring(this.px, this.pz, r, c, 0.5);
    this.fx.burst(this.px, 1, this.pz, 24, 8, c, 0.5, 0.3);
  }

  // ---------- оружие ----------

  private updateWeapon(dt: number) {
    const w = this.hero.weapon;
    const s = this.stats;
    const f = this.e.f;
    // прицел: правый стик или ближайший враг
    let ax = 0;
    let az = 0;
    let has = false;
    if (this.input.aiming) {
      ax = this.input.ax;
      az = this.input.az;
      has = true;
    } else if (this.input.auto) {
      const j = this.nearest(this.px, this.pz, w.range);
      if (j >= 0) {
        ax = f.x[j] - this.px;
        az = f.z[j] - this.pz;
        has = true;
      }
    }
    if (has) {
      const l = Math.hypot(ax, az) || 1;
      this.aimX = ax / l;
      this.aimZ = az / l;
      this.yaw = Math.atan2(this.aimX, this.aimZ);
      this.aiming = Math.min(1, this.aiming + dt * 8);
    } else {
      this.aiming = Math.max(0, this.aiming - dt * 3);
      if (this.moving > 0.1) this.yaw = Math.atan2(this.input.mx, this.input.mz);
    }
    this.fireCd -= dt;
    if (w.kind === 'burst' && this.burstLeft > 0) {
      this.burstCd -= dt;
      if (this.burstCd <= 0) {
        this.burstLeft--;
        this.burstCd = 0.08;
        this.fire();
      }
    }
    if (!has || this.fireCd > 0) return;
    this.fireCd = 1 / (w.rate * s.rate * (this.haste > 0 ? 1.25 : 1));
    if (w.kind === 'burst') {
      this.burstLeft = 2;
      this.burstCd = 0.08;
    }
    this.fire();
  }

  private fire() {
    const w = this.hero.weapon;
    const s = this.stats;
    const n = 1 + s.count;
    if (this.flag('bloodShots')) this.hp = Math.max(1, this.hp - 0.12);
    this.shotN++;
    const base = Math.atan2(this.aimX, this.aimZ);
    const kind = { bolt: 0, flame: 1, shard: 2, spore: 3, burst: 4, dual: 5 }[w.kind];
    const side = w.kind === 'dual' ? (this.shotN & 1 ? 0.35 : -0.35) : 0.35;
    const cx = this.px + Math.cos(base) * side + this.aimX * 0.6;
    const cz = this.pz - Math.sin(base) * side + this.aimZ * 0.6;
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) * (w.kind === 'flame' ? 0.18 : 0.12) + (Math.random() - 0.5) * w.spread * 2;
      const a = base + spread;
      const i = this.b.add();
      if (i < 0) return;
      const bf = this.b.f;
      const sp = w.speed * s.projSpeed * (w.kind === 'flame' ? 0.8 + Math.random() * 0.4 : 1);
      bf.x[i] = cx;
      bf.z[i] = cz;
      bf.y[i] = 1.1;
      bf.vx[i] = Math.sin(a) * sp;
      bf.vz[i] = Math.cos(a) * sp;
      bf.life[i] = (w.range * (w.kind === 'flame' ? 1 + s.area * 0.3 - 0.3 : 1)) / sp;
      bf.dmg[i] = w.dmg * s.dmg * (this.flag('bloodShots') ? 1.1 : 1);
      bf.pierce[i] = w.pierce + s.pierce;
      bf.kind[i] = kind;
      bf.last[i] = -1;
      bf.r[i] = this.weaponCol[0];
      bf.g[i] = this.weaponCol[1];
      bf.b[i] = this.weaponCol[2];
      bf.size[i] = w.kind === 'shard' ? 0.75 : w.kind === 'flame' ? 0.6 : 0.5;
      bf.rico[i] = this.flag('ricochet') ? 1 : 0;
    }
    if (w.kind !== 'flame' || (this.shotN & 3) === 0) this.fx.flash(cx, 1.1, cz, 1.2, this.weaponCol, 0.08);
  }

  private updateBullets(dt: number) {
    const B = this.b;
    const bf = B.f;
    const f = this.e.f;
    const s = this.stats;
    const homing = this.flag('homing');
    for (let k = B.n - 1; k >= 0; k--) {
      bf.life[k] -= dt;
      if (bf.life[k] <= 0) {
        B.kill(k);
        continue;
      }
      const kind = bf.kind[k];
      // самонаведение: споры всегда, остальные с протоколом
      if (kind === 3 || homing) {
        const t = this.nearest(bf.x[k], bf.z[k], kind === 3 ? 9 : 5);
        if (t >= 0) {
          const sp = Math.hypot(bf.vx[k], bf.vz[k]);
          const dx = f.x[t] - bf.x[k];
          const dz = f.z[t] - bf.z[k];
          const l = Math.hypot(dx, dz) || 1;
          const turn = (kind === 3 ? 7 : 3.5) * dt;
          bf.vx[k] += (dx / l) * sp * turn;
          bf.vz[k] += (dz / l) * sp * turn;
          const nl = Math.hypot(bf.vx[k], bf.vz[k]) || 1;
          bf.vx[k] = (bf.vx[k] / nl) * sp;
          bf.vz[k] = (bf.vz[k] / nl) * sp;
        }
      }
      bf.x[k] += bf.vx[k] * dt;
      bf.z[k] += bf.vz[k] * dt;
      if (kind === 1) bf.size[k] += dt * 2.2 * s.area;
      if (Math.abs(bf.x[k]) > HALF + 2 || Math.abs(bf.z[k]) > HALF + 2) {
        B.kill(k);
        continue;
      }
      // попадание в урны и бочки
      for (const br of this.world.breakables) {
        if (br.alive && Math.hypot(br.x - bf.x[k], br.z - bf.z[k]) < 0.7) this.breakIt(br);
      }
      const hr = kind === 1 ? bf.size[k] * 0.6 : 0.35;
      let dead = false;
      this.grid.each(bf.x[k], bf.z[k], hr + 1.5, (i) => {
        if (dead || f.hp[i] <= 0 || i === bf.last[k]) return;
        const dx = f.x[i] - bf.x[k];
        const dz = f.z[i] - bf.z[k];
        const rr = hr + f.r[i];
        if (dx * dx + dz * dz > rr * rr) return;
        const sp = Math.hypot(bf.vx[k], bf.vz[k]) || 1;
        const nx = bf.vx[k] / sp;
        const nz = bf.vz[k] / sp;
        if (kind === 1) {
          // пламя: слабые частые удары и поджог, без отбрасывания
          if (Math.random() < 0.5) return;
          this.damage(i, bf.dmg[k], 0, 0, true);
          this.burnE(i, 3, 3 * s.dmg + s.burn);
          bf.last[k] = i;
          return;
        }
        this.damage(i, bf.dmg[k], nx, nz, false);
        this.onHit(i, nx, nz);
        if (kind === 0) {
          const twice = this.flag('doubleSpecial') && Math.random() < 0.3;
          this.chain(i, (1 + s.chain) * (twice ? 2 : 1), bf.dmg[k] * 0.6);
        } else if (kind === 2) this.freeze(i, 2);
        else if (kind === 3) this.infectE(i, 4, 5 * s.dmg + s.infect);
        this.fx.burst(bf.x[k], 1.1, bf.z[k], 3, 4, [bf.r[k], bf.g[k], bf.b[k]], 0.2, 0.25);
        bf.last[k] = i;
        if (bf.rico[k] > 0) {
          bf.rico[k]--;
          const t = this.nearest(bf.x[k], bf.z[k], 8, new Set([i]));
          if (t >= 0) {
            const dx2 = f.x[t] - bf.x[k];
            const dz2 = f.z[t] - bf.z[k];
            const l = Math.hypot(dx2, dz2) || 1;
            bf.vx[k] = (dx2 / l) * sp;
            bf.vz[k] = (dz2 / l) * sp;
            bf.life[k] = Math.max(bf.life[k], 0.5);
            return;
          }
        }
        if (--bf.pierce[k] < 0) dead = true;
      });
      if (dead) B.kill(k);
    }
  }

  private enemyShot(x: number, z: number, vx: number, vz: number, dmg: number, c: RGB) {
    const i = this.s.add();
    if (i < 0) return;
    const sf = this.s.f;
    sf.x[i] = x;
    sf.z[i] = z;
    sf.vx[i] = vx;
    sf.vz[i] = vz;
    sf.dmg[i] = dmg;
    sf.life[i] = 5;
    sf.r[i] = c[0];
    sf.g[i] = c[1];
    sf.b[i] = c[2];
    this.sfx.eshot();
  }

  private updateShots(dt: number) {
    const S = this.s;
    const sf = S.f;
    for (let i = S.n - 1; i >= 0; i--) {
      if (this.stopT > 0) continue;
      sf.x[i] += sf.vx[i] * dt;
      sf.z[i] += sf.vz[i] * dt;
      sf.life[i] -= dt;
      if (sf.life[i] <= 0 || Math.abs(sf.x[i]) > HALF + 2 || Math.abs(sf.z[i]) > HALF + 2) {
        S.kill(i);
        continue;
      }
      if (Math.hypot(sf.x[i] - this.px, sf.z[i] - this.pz) < PR + 0.3) {
        this.hurt(sf.dmg[i]);
        this.fx.burst(sf.x[i], 1, sf.z[i], 6, 4, [sf.r[i], sf.g[i], sf.b[i]], 0.3, 0.3);
        S.kill(i);
      }
    }
  }

  private hazard(x: number, z: number, r: number, delay: number, life: number, dmg: number, c: RGB) {
    if (this.hazards.length < 80) this.hazards.push({ x, z, r, delay, max: delay, life, dmg, c, hit: false });
  }

  private updateHazards(dt: number) {
    for (let k = this.hazards.length - 1; k >= 0; k--) {
      const h = this.hazards[k];
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay <= 0) this.fx.burst(h.x, 0.4, h.z, 10, 5, h.c, 0.35, 0.35);
        continue;
      }
      h.life -= dt;
      if (!h.hit && Math.hypot(this.px - h.x, this.pz - h.z) < h.r) {
        h.hit = true;
        this.hurt(h.dmg);
      }
      if (h.life <= 0) this.hazards.splice(k, 1);
    }
  }

  private updateZones(dt: number) {
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k];
      z.life -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        this.aoe(z.x, z.z, z.r, z.dps * 0.25);
      }
      if (z.life <= 0) this.zones.splice(k, 1);
    }
  }

  // ---------- союзники ----------

  private spawnMinion(x: number, z: number, dmg: number, life: number) {
    const i = this.minions.add();
    if (i < 0) return;
    const m = this.minions.f;
    m.x[i] = x;
    m.z[i] = z;
    m.life[i] = life;
    m.dmg[i] = dmg * (this.flag('minionPower') ? 2 : 1);
    m.tg[i] = -1;
    this.fx.burst(x, 0.5, z, 12, 4, [0.5, 1, 0.45], 0.5, 0.35, CELL.smoke);
  }

  private updateMinions(dt: number) {
    const M = this.minions;
    const m = M.f;
    const f = this.e.f;
    for (let i = M.n - 1; i >= 0; i--) {
      m.life[i] -= dt;
      if (m.life[i] <= 0) {
        this.fx.burst(m.x[i], 0.8, m.z[i], 8, 3, [0.5, 1, 0.45], 0.4, 0.3, CELL.smoke);
        M.kill(i);
        continue;
      }
      let t = m.tg[i] | 0;
      if (t < 0 || t >= this.e.n || f.hp[t] <= 0 || Math.random() < dt * 2) {
        t = this.nearest(m.x[i], m.z[i], 12);
        m.tg[i] = t;
      }
      const tx = t >= 0 ? f.x[t] : this.px;
      const tz = t >= 0 ? f.z[t] : this.pz;
      const dx = tx - m.x[i];
      const dz = tz - m.z[i];
      const d = Math.hypot(dx, dz) || 1;
      if (t >= 0 || d > 3) {
        m.x[i] += (dx / d) * 5.5 * dt;
        m.z[i] += (dz / d) * 5.5 * dt;
        m.yaw[i] = Math.atan2(dx, dz);
      }
      m.cd[i] -= dt;
      if (t >= 0 && d < f.r[t] + 0.8 && m.cd[i] <= 0) {
        m.cd[i] = 0.5;
        this.damage(t, m.dmg[i], dx / d, dz / d, true);
        if (this.stats.infect > 0) this.infectE(t, 3, this.stats.infect);
      }
    }
  }

  private updateDrones(dt: number) {
    const n = (this.flag('drone') ? 1 : 0) + (this.flag('drone2') ? 1 : 0);
    if (!n) return;
    this.droneAng += dt * 2;
    this.droneCd -= dt;
    if (this.droneCd > 0) return;
    this.droneCd = 0.55;
    const f = this.e.f;
    for (let k = 0; k < n; k++) {
      const a = this.droneAng + (k / n) * TAU;
      const x = this.px + Math.cos(a) * 1.8;
      const z = this.pz + Math.sin(a) * 1.8;
      const t = this.nearest(x, z, 14);
      if (t < 0) continue;
      const dx = f.x[t] - x;
      const dz = f.z[t] - z;
      const l = Math.hypot(dx, dz) || 1;
      const i = this.b.add();
      if (i < 0) return;
      const bf = this.b.f;
      bf.x[i] = x;
      bf.z[i] = z;
      bf.y[i] = 2;
      bf.vx[i] = (dx / l) * 28;
      bf.vz[i] = (dz / l) * 28;
      bf.life[i] = 0.6;
      bf.dmg[i] = 9 * this.stats.dmg;
      bf.pierce[i] = 0;
      bf.kind[i] = 4;
      bf.last[i] = -1;
      bf.r[i] = 1;
      bf.g[i] = 0.82;
      bf.b[i] = 0.3;
      bf.size[i] = 0.4;
    }
  }

  private updateDecoys(dt: number) {
    for (let k = this.decoys.length - 1; k >= 0; k--) {
      const d = this.decoys[k];
      d.life -= dt;
      if (d.life > 0) continue;
      this.aoe(d.x, d.z, 3.5 * this.stats.area, d.dmg * this.stats.dmg);
      this.fx.ring(d.x, d.z, 3.5, this.heroGlow);
      this.fx.burst(d.x, 1, d.z, 20, 7, this.heroGlow, 0.5, 0.35);
      this.sfx.boom();
      this.decoys.splice(k, 1);
    }
  }

  // ---------- смерть врагов и добыча ----------

  private reap() {
    const E = this.e;
    const f = E.f;
    for (let i = E.n - 1; i >= 0; i--) {
      if (f.hp[i] > 0) continue;
      const tp = f.type[i];
      const d = this.roster[tp];
      const x = f.x[i];
      const z = f.z[i];
      if (tp === GOB && f.st[i] === 9) {
        this.ui.banner('Гоблин сбежал', '#9a8a70');
        E.kill(i);
        continue;
      }
      this.kills++;
      this.killsBy[d.name] = (this.killsBy[d.name] ?? 0) + 1;
      const col = rgb(d.pal[0]);
      this.fx.burst(x, 0.8 * f.sc[i], z, f.sc[i] > 1.2 ? 16 : 7, 6, col, 0.9, 0.22, CELL.square, 14, 2);
      this.fx.burst(x, 0.8, z, 4, 4, [1, 0.25, 0.35], 0.3, 0.25);
      if (tp === BOSS) {
        this.run.bosses++;
        this.ui.boss(null, 0);
        this.ui.banner('Босс повержен!', '#ffd24a');
        this.sfx.boom(true);
        this.sfx.victory();
        this.sfx.intensity(0);
        this.slowT = 1.4;
        this.shake = 1.2;
        this.fx.ring(x, z, 10, [1, 0.85, 0.3], 0.8);
        this.victoryT = 2.5;
        for (let k = 0; k < 30; k++) this.gem(x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 6, 5);
      } else if (tp === GOB) {
        this.run.goblins++;
        this.ui.banner('Гоблин повержен! Забирай добычу', '#ffc94a');
        this.pickups.push({ kind: 'chest', x, z, life: 999, val: 1 });
        for (let k = 0; k < 6; k++) this.pickups.push({ kind: 'coin', x: x + (Math.random() - 0.5) * 3, z: z + (Math.random() - 0.5) * 3, life: 30, val: 3 });
        this.sfx.legendary();
      } else {
        this.gem(x, z, f.xp[i]);
        if (f.elite[i]) {
          this.run.elites++;
          this.pickups.push({ kind: 'chest', x, z, life: 999, val: f.elite[i] === 2 ? 1 : 0 });
          this.pickups.push({ kind: 'coin', x: x + 1, z, life: 30, val: f.elite[i] === 2 ? 15 : 6 });
          this.sfx.boom(true);
        } else {
          if (Math.random() < 0.02) this.pickups.push({ kind: 'coin', x, z, life: 25, val: 1 });
          if (Math.random() < 0.006) this.pickups.push({ kind: 'heal', x, z, life: 25, val: 0 });
          this.sfx.kill();
        }
      }
      // особые свойства на смерть
      if (f.aff[i] & AF.molten) this.hazard(x, z, 3, 0.7, 0.4, f.dmg[i] * 1.5, [1, 0.69, 0.23]);
      if (f.burn[i] > 0 && this.flag('burnSpread')) {
        this.grid.each(x, z, 3, (j) => {
          if (j !== i && f.hp[j] > 0 && Math.hypot(f.x[j] - x, f.z[j] - z) < 3) this.burnE(j, 3, f.bdps[i]);
        });
        this.fx.ring(x, z, 3, [1, 0.5, 0.15]);
      }
      if (f.inf[i] > 0) {
        let spread = 0;
        this.grid.each(x, z, 3.5, (j) => {
          if (spread >= 2 || j === i || f.hp[j] <= 0) return;
          this.infectE(j, 4, f.idps[i]);
          spread++;
        });
      }
      if (f.frz[i] > 0 && this.flag('shatter')) {
        this.aoe(x, z, 2.2, 20 * this.stats.dmg, undefined);
        this.fx.burst(x, 0.8, z, 12, 6, [0.75, 0.92, 1], 0.4, 0.3, CELL.star);
      }
      if (this.flag('raiseDead') && tp !== BOSS && Math.random() < 0.08 && this.minions.n < 8) this.spawnMinion(x, z, 12 * this.stats.dmg, 15);
      if (d.beh === 'SPLIT' && f.gen[i] === 0) {
        for (let k = 0; k < 2; k++) this.spawn(tp, x + (k ? 0.5 : -0.5), z, 0, 1);
      }
      E.kill(i);
    }
  }

  private gem(x: number, z: number, val: number) {
    const G = this.gems;
    const i = G.add();
    if (i < 0) {
      G.f.val[(Math.random() * G.n) | 0] += val;
      return;
    }
    G.f.x[i] = x;
    G.f.z[i] = z;
    G.f.val[i] = val * this.stats.xp;
  }

  private updateGems(dt: number) {
    const G = this.gems;
    const g = G.f;
    const pick = 2.6 * this.stats.pickup;
    for (let i = G.n - 1; i >= 0; i--) {
      const dx = this.px - g.x[i];
      const dz = this.pz - g.z[i];
      const d = Math.hypot(dx, dz) || 1;
      if (!g.mag[i] && d < pick) g.mag[i] = 1;
      if (g.mag[i]) {
        g.v[i] = Math.min(g.v[i] + 60 * dt, 30);
        const step = Math.min(d, g.v[i] * dt);
        g.x[i] += (dx / d) * step;
        g.z[i] += (dz / d) * step;
      }
      if (d < 0.7) {
        this.xp += g.val[i];
        this.sfx.gem();
        G.kill(i);
      }
    }
  }

  private updatePickups(dt: number) {
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const p = this.pickups[k];
      p.life -= dt;
      const d = Math.hypot(this.px - p.x, this.pz - p.z);
      const grab = p.kind === 'coin' ? 1.6 * this.stats.pickup : p.kind === 'shrine' || p.kind === 'fountain' ? 1.8 : 1.1;
      if (p.kind === 'coin' && d < 4 * this.stats.pickup) {
        p.x += ((this.px - p.x) / (d || 1)) * Math.min(d, 14 * dt);
        p.z += ((this.pz - p.z) / (d || 1)) * Math.min(d, 14 * dt);
      }
      if (d > grab) {
        if (p.life <= 0) this.pickups.splice(k, 1);
        continue;
      }
      this.pickups.splice(k, 1);
      switch (p.kind) {
        case 'coin':
          this.coins += p.val;
          this.sfx.shard();
          break;
        case 'heal':
          this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.25);
          this.sfx.heal();
          this.fx.burst(this.px, 1, this.pz, 12, 3, [1, 0.3, 0.4], 0.6, 0.35, CELL.plus);
          break;
        case 'fountain':
          this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.4);
          this.ui.banner('Омут исцеления', '#ff6a8a');
          this.sfx.heal();
          this.fx.ring(p.x, p.z, 3, [1, 0.3, 0.4], 0.6);
          break;
        case 'shrine': {
          const roll = (Math.random() * 3) | 0;
          if (roll === 0) {
            this.rage = 15;
            this.ui.banner('Святилище ярости: урон ×1,5', '#ff5a5a');
          } else if (roll === 1) {
            this.haste = 15;
            this.ui.banner('Святилище спешки: скорость +25%', '#3ef0ff');
          } else {
            for (let i = 0; i < this.gems.n; i++) this.gems.f.mag[i] = 1;
            this.ui.banner('Святилище жадности: весь опыт к тебе', '#c46bff');
          }
          this.sfx.shrine();
          this.fx.ring(p.x, p.z, 4, [1, 0.85, 0.3], 0.6);
          break;
        }
        case 'chest':
          this.sfx.chest();
          this.fx.burst(p.x, 1, p.z, 24, 6, [1, 0.85, 0.3], 0.7, 0.35, CELL.star);
          this.openChoice(true);
          return;
      }
    }
  }

  private updateWorld() {
    const w = this.world;
    for (const br of w.breakables) {
      if (br.alive && Math.hypot(this.px - br.x, this.pz - br.z) < 1.1) this.breakIt(br);
    }
    const t = this.time;
    const trapDmg = 25 * this.L.hpMul * this.T.hp * (1 + t / 180);
    for (const tr of w.traps) {
      const cyc = Math.floor((t + tr.phase) / 4);
      const ph = (t + tr.phase) % 4;
      if (ph > 3.85 && cyc !== tr.fired) {
        tr.fired = cyc;
        this.aoe(tr.x, tr.z, 1.8, trapDmg);
        if (Math.hypot(this.px - tr.x, this.pz - tr.z) < 1.8) this.hurt(10 * this.L.dmgMul * this.T.dmg);
        for (let k = 0; k < 6; k++) this.fx.part(tr.x, k * 0.7, tr.z, 0, 0, 0, 0.3, 1.4, w.glow, CELL.glow, 3);
        this.fx.ring(tr.x, tr.z, 1.8, w.glow);
      }
    }
  }

  private breakIt(br: { x: number; z: number; kind: 'urn' | 'barrel'; alive: boolean }) {
    br.alive = false;
    this.fx.burst(br.x, 0.6, br.z, 14, 5, br.kind === 'urn' ? [0.6, 0.42, 0.23] : [0.48, 0.23, 0.16], 0.8, 0.25, CELL.square, 14, 2);
    if (br.kind === 'barrel') {
      this.aoe(br.x, br.z, 4 * this.stats.area, 120 * this.stats.dmg, (i) => this.burnE(i, 3, 15 * this.stats.dmg));
      this.fx.burst(br.x, 0.6, br.z, 30, 9, [1, 0.55, 0.2], 0.6, 0.5);
      this.fx.ring(br.x, br.z, 4, [1, 0.5, 0.15], 0.5);
      this.shake = 0.5;
      this.sfx.boom(true);
      return;
    }
    this.sfx.kill();
    const r = Math.random();
    if (r < 0.55) for (let k = 0; k < 3 + ((Math.random() * 3) | 0); k++) this.gem(br.x + (Math.random() - 0.5) * 2, br.z + (Math.random() - 0.5) * 2, 2);
    else if (r < 0.75) this.pickups.push({ kind: 'coin', x: br.x, z: br.z, life: 25, val: 2 });
    else if (r < 0.88) this.pickups.push({ kind: 'heal', x: br.x, z: br.z, life: 25, val: 0 });
  }

  // ---------- выбор улучшений ----------

  private genChoices(n: number, chest: boolean): Choice[] {
    const pool: { c: Choice; w: number }[] = [];
    const heroesOwned = new Map<string, number>();
    for (const id of this.implants.keys()) {
      const h = implantById(id).hero;
      heroesOwned.set(h, (heroesOwned.get(h) ?? 0) + 1);
    }
    for (const imp of IMPLANTS) {
      if (this.banished.has(imp.id)) continue;
      const lvl = this.implants.get(imp.id) ?? 0;
      if (lvl >= 3 || (!lvl && this.implants.size >= 6)) continue;
      const setBoost = (heroesOwned.get(imp.hero) ?? 0) * 2;
      pool.push({ c: { kind: 'implant', id: imp.id, level: lvl + 1 }, w: (lvl ? 3 : 2) + setBoost + (chest && lvl ? 3 : 0) });
    }
    for (const p of PROTOCOLS) {
      if (this.banished.has(p.id)) continue;
      const lvl = this.protos.get(p.id) ?? 0;
      if (lvl >= 3 || (!lvl && this.protos.size >= 6)) continue;
      pool.push({ c: { kind: 'proto', id: p.id, level: lvl + 1 }, w: lvl ? 3 : 2 });
    }
    const out: Choice[] = [];
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
      let k = 0;
      for (; k < pool.length - 1; k++) {
        r -= pool[k].w;
        if (r <= 0) break;
      }
      out.push(pool.splice(k, 1)[0].c);
    }
    if (!out.length) out.push({ kind: 'heal', id: 'heal', level: 1 });
    return out;
  }

  private chestMode = false;

  private openChoice(chest: boolean) {
    this.chestMode = chest;
    this.choiceOpen = true;
    this.choiceLeft = 30;
    this.choiceOpts = this.genChoices(chest ? 3 : 5, chest);
    if (!chest) this.sfx.levelup();
    this.showChoice();
  }

  private showChoice() {
    this.ui.choose(
      this.choiceOpts,
      { timer: this.choiceLeft, skips: this.skips, banish: this.banishLeft, refreshCost: 5 + this.refreshes * 5, coins: this.coins, chest: this.chestMode },
      {
        pick: (i) => this.pickChoice(i),
        skip: () => {
          if (this.skips <= 0 || this.chestMode) return;
          this.skips--;
          this.coins += 5;
          this.closeChoice();
        },
        banish: (i) => {
          if (this.banishLeft <= 0 || !this.choiceOpts[i] || this.choiceOpts[i].kind === 'heal') return;
          this.banishLeft--;
          this.banished.add(this.choiceOpts[i].id);
          const repl = this.genChoices(8, this.chestMode).find((c) => !this.choiceOpts.some((o) => o.id === c.id));
          if (repl) this.choiceOpts[i] = repl;
          else this.choiceOpts.splice(i, 1);
          this.showChoice();
        },
        refresh: () => {
          const cost = 5 + this.refreshes * 5;
          if (this.coins < cost) return;
          this.coins -= cost;
          this.refreshes++;
          this.choiceOpts = this.genChoices(this.chestMode ? 3 : 5, this.chestMode);
          this.showChoice();
        },
      },
    );
  }

  private pickChoice(i: number) {
    const c = this.choiceOpts[i] ?? this.choiceOpts[0];
    if (!this.choiceOpen || !c) return;
    if (c.kind === 'implant') this.implants.set(c.id, c.level);
    else if (c.kind === 'proto') this.protos.set(c.id, c.level);
    else {
      this.hp = this.stats.maxHp;
      this.coins += 10;
    }
    const before = this.maxSet();
    this.recalc();
    if (c.kind === 'implant' && this.maxSet() > before && this.maxSet() >= 2) {
      this.ui.banner(this.maxSet() === 3 ? 'Полный сет имплантов!' : 'Бонус сета активирован', '#c46bff');
      this.sfx.evolve();
    }
    this.pushSlots();
    this.closeChoice();
  }

  private closeChoice() {
    if (!this.chestMode) this.pending = Math.max(0, this.pending - 1);
    this.choiceOpen = false;
    this.ui.closeChoice();
    this.ui.coins(this.coins);
  }

  private end(won: boolean) {
    if (this.over) return;
    this.over = true;
    this.ui.boss(null, 0);
    this.sfx.intensity(0);
    if (!won) this.sfx.defeat();
    this.ui.end({
      won,
      level: this.opts.level,
      tier: this.opts.tier,
      hero: this.hero.id,
      time: this.time,
      kills: this.kills,
      lvl: this.level,
      bosses: this.run.bosses,
      elites: this.run.elites,
      goblins: this.run.goblins,
      implants: [...this.implants.keys()],
      protocols: [...this.protos.keys()],
      killsBy: this.killsBy,
      skillUses: this.run.skillUses,
      maxSet: this.maxSet(),
      dodges: this.run.dodges,
    });
  }

  // ---------- отрисовка ----------

  private pose: Pose = { t: 0, move: 0, aim: 0, hit: 0, phase: 0 };

  private render(dt: number) {
    const r = this.r;
    const cam = r.cam;
    const aspect = r.canvas.clientWidth / Math.max(1, r.canvas.clientHeight);
    cam.dist = aspect < 1 ? 30 : 22;
    cam.x += (this.px - cam.x) * Math.min(1, dt * 8);
    cam.z += (this.pz + 1.5 - cam.z) * Math.min(1, dt * 8);
    if (this.shake > 0) {
      cam.x += (Math.random() - 0.5) * this.shake * 0.5;
      cam.z += (Math.random() - 0.5) * this.shake * 0.5;
    }
    const view = cam.dist * (aspect < 1 ? 0.75 : 1.1);
    const t = this.time;
    r.begin();
    this.world.draw(r, t, cam.x, cam.z, view);

    // враги
    const f = this.e.f;
    const ps = this.pose;
    for (let i = 0; i < this.e.n; i++) {
      if (Math.abs(f.x[i] - cam.x) > view || Math.abs(f.z[i] - cam.z) > view) continue;
      const d = this.roster[f.type[i]];
      ps.t = t;
      ps.move = this.stopT > 0 && f.type[i] !== BOSS ? 0 : f.move[i];
      ps.aim = d.beh === 'RANGED' || d.beh === 'SUMMON' ? 0.6 : 0;
      ps.hit = 0;
      ps.phase = f.ph[i];
      const sc = f.sc[i];
      drawEnemy(d.body, d.pal, f.x[i], f.z[i], f.yaw[i], ps, sc, f.flash[i], f.frz[i] > 0);
      r.sprite(0, CELL.disc, f.x[i], 0.03, f.z[i], 0.75 * sc + 0.1, 0, 0, 0, 0.42);
      if (f.burn[i] > 0) r.sprite(3, CELL.glow, f.x[i], 0.8 * sc, f.z[i], 1.4 * sc, 1, 0.45, 0.1, 0.35);
      if (f.stun[i] > 0) r.sprite(3, CELL.star, f.x[i], 2 * sc + 0.3, f.z[i], 0.5, 1, 0.95, 0.4, 0.9, t * 6);
      if (f.elite[i] || f.type[i] === BOSS) {
        const glow = f.type[i] === BOSS ? [1, 0.2, 0.3] : [1, 0.75, 0.25];
        r.sprite(1, CELL.ring, f.x[i], 0.05, f.z[i], 1.1 * sc + 0.3, glow[0], glow[1], glow[2], 0.7);
        if (f.aff[i] & AF.shield && f.at[i] % 6 < 2) r.sprite(3, CELL.ring, f.x[i], 1 * sc, f.z[i], 1.6 * sc, 1, 0.85, 0.3, 0.6);
        if (f.type[i] !== BOSS) this.bar(f.x[i], 2.1 * sc + 0.4, f.z[i], f.hp[i] / f.mhp[i], [1, 0.55, 0.15]);
      }
      if (d.beh === 'CHARGE' && f.st[i] === 1) {
        const l = Math.hypot(f.dx[i], f.dz[i]) || 1;
        for (let k = 1; k <= 6; k++) r.sprite(1, CELL.chevron, f.x[i] + (f.dx[i] / l) * k * 1.2, 0.05, f.z[i] + (f.dz[i] / l) * k * 1.2, 0.6, 1, 0.2, 0.3, 0.7, -Math.atan2(f.dz[i], f.dx[i]));
      }
    }

    // герой
    const hide = this.iframes > 0 && this.dashT <= 0 && ((t * 20) | 0) & 1;
    if (!hide && !this.over) {
      ps.t = t;
      ps.move = this.moving;
      ps.aim = this.aiming;
      ps.hit = this.hurtT;
      ps.phase = 0;
      drawHero(this.hero.look, this.px, this.pz, this.yaw, ps);
    }
    r.sprite(0, CELL.disc, this.px, 0.03, this.pz, 0.9, 0, 0, 0, 0.5);
    r.sprite(1, CELL.ring, this.px, 0.05, this.pz, 1.2, this.heroGlow[0], this.heroGlow[1], this.heroGlow[2], 0.55);
    r.sprite(1, CELL.glow, this.px, 0.04, this.pz, 7, this.heroGlow[0], this.heroGlow[1], this.heroGlow[2], 0.18);
    if (this.aiming > 0.5) r.sprite(1, CELL.chevron, this.px + this.aimX * 1.8, 0.05, this.pz + this.aimZ * 1.8, 0.6, this.heroGlow[0], this.heroGlow[1], this.heroGlow[2], 0.8, -Math.atan2(this.aimZ, this.aimX));
    if (this.rage > 0) r.sprite(3, CELL.glow, this.px, 1, this.pz, 2.5, 1, 0.3, 0.3, 0.35);

    // союзники
    const m = this.minions.f;
    for (let i = 0; i < this.minions.n; i++) {
      ps.t = t;
      ps.move = 1;
      ps.aim = 0;
      ps.phase = i;
      drawMinion(m.x[i], m.z[i], m.yaw[i], ps);
      r.sprite(0, CELL.disc, m.x[i], 0.03, m.z[i], 0.7, 0, 0, 0, 0.4);
    }
    const dn = (this.flag('drone') ? 1 : 0) + (this.flag('drone2') ? 1 : 0);
    for (let k = 0; k < dn; k++) {
      const a = this.droneAng + (k / dn) * TAU;
      const x = this.px + Math.cos(a) * 1.8;
      const z = this.pz + Math.sin(a) * 1.8;
      r.sprite(3, CELL.glow, x, 2, z, 1, 1, 0.82, 0.3, 0.8);
      r.sprite(2, CELL.hexring, x, 2, z, 0.6, 1, 0.9, 0.5, 1, t * 4);
      r.sprite(0, CELL.disc, x, 0.03, z, 0.5, 0, 0, 0, 0.3);
    }
    for (const d of this.decoys) {
      ps.t = t;
      ps.move = 0;
      ps.aim = 0;
      drawHero(this.hero.look, d.x, d.z, this.yaw, ps);
      r.sprite(3, CELL.glow, d.x, 1, d.z, 3, this.heroGlow[0], this.heroGlow[1], this.heroGlow[2], 0.5 + Math.sin(t * 20) * 0.2);
    }

    // снаряды
    const bf = this.b.f;
    for (let i = 0; i < this.b.n; i++) {
      const kind = bf.kind[i];
      if (kind === 1) {
        const k = Math.min(1, bf.life[i] * 3);
        r.sprite(3, CELL.flame, bf.x[i], bf.y[i], bf.z[i], bf.size[i] * 1.3, 1, 0.55 + 0.3 * k, 0.2, 0.75 * k, Math.random());
        continue;
      }
      r.sprite(3, CELL.glow, bf.x[i], bf.y[i], bf.z[i], bf.size[i] * 2.2, bf.r[i], bf.g[i], bf.b[i], 0.9);
      r.sprite(3, CELL.disc, bf.x[i], bf.y[i], bf.z[i], bf.size[i] * 0.7, 1, 1, 1, 1);
      r.sprite(0, CELL.disc, bf.x[i], 0.03, bf.z[i], bf.size[i] * 0.6, 0, 0, 0, 0.25);
    }
    const sf = this.s.f;
    for (let i = 0; i < this.s.n; i++) {
      r.sprite(3, CELL.glow, sf.x[i], 1, sf.z[i], 1.1, sf.r[i], sf.g[i], sf.b[i], 1);
      r.sprite(2, CELL.disc, sf.x[i], 1, sf.z[i], 0.45, sf.r[i] * 0.6 + 0.4, sf.g[i] * 0.6 + 0.4, sf.b[i] * 0.6 + 0.4, 1);
      r.sprite(0, CELL.disc, sf.x[i], 0.03, sf.z[i], 0.4, 0, 0, 0, 0.3);
    }

    // опыт и предметы
    const g = this.gems.f;
    for (let i = 0; i < this.gems.n; i++) {
      if (Math.abs(g.x[i] - cam.x) > view || Math.abs(g.z[i] - cam.z) > view) continue;
      const big = g.val[i] >= 5;
      const y = 0.45 + Math.sin(t * 4 + g.x[i]) * 0.1;
      r.sprite(2, CELL.gem, g.x[i], y, g.z[i], big ? 0.7 : 0.48, big ? 1 : 0.6, big ? 0.82 : 0.85, big ? 0.3 : 1, 1);
      r.sprite(3, CELL.glow, g.x[i], y, g.z[i], big ? 1 : 0.7, big ? 1 : 0.5, big ? 0.8 : 0.75, big ? 0.3 : 1, 0.22);
    }
    for (const p of this.pickups) {
      switch (p.kind) {
        case 'coin':
          r.sprite(2, CELL.coin, p.x, 0.6 + Math.sin(t * 5 + p.x) * 0.1, p.z, 0.55, 1, 0.82, 0.3, 1, t * 3);
          r.sprite(3, CELL.glow, p.x, 0.6, p.z, 1, 1, 0.8, 0.3, 0.4);
          break;
        case 'heal':
          drawHealOrb(p.x, p.z, t);
          r.sprite(3, CELL.glow, p.x, 0.5, p.z, 1.6, 1, 0.3, 0.4, 0.5);
          break;
        case 'chest':
          drawChest(p.x, p.z, t, p.val > 0);
          r.sprite(1, CELL.glow, p.x, 0.04, p.z, 4, 1, 0.8, 0.3, 0.4 + Math.sin(t * 4) * 0.15);
          break;
        case 'shrine':
          drawShrine(p.x, p.z, t, [1, 0.8, 0.3]);
          r.sprite(1, CELL.hexring, p.x, 0.05, p.z, 2.6, 1, 0.8, 0.3, 0.7, t);
          r.sprite(3, CELL.glow, p.x, 2.6, p.z, 3, 1, 0.8, 0.3, 0.6);
          break;
        case 'fountain':
          drawFountain(p.x, p.z, t);
          r.sprite(1, CELL.ring, p.x, 0.05, p.z, 2.4, 1, 0.3, 0.4, 0.6);
          break;
      }
    }

    // опасные зоны врагов: кольцо-предупреждение, затем заливка
    for (const h of this.hazards) {
      if (h.delay > 0) {
        const k = 1 - h.delay / h.max;
        r.sprite(1, CELL.ring, h.x, 0.05, h.z, h.r, h.c[0], h.c[1], h.c[2], 0.8);
        r.sprite(0, CELL.disc, h.x, 0.04, h.z, h.r * k, h.c[0], h.c[1], h.c[2], 0.35);
      } else {
        r.sprite(1, CELL.glow, h.x, 0.05, h.z, h.r * 2, h.c[0], h.c[1], h.c[2], 0.9);
      }
    }
    for (const z of this.zones) r.sprite(1, CELL.glow, z.x, 0.05, z.z, z.r * 2.2, z.c[0], z.c[1], z.c[2], Math.min(0.7, z.life));

    this.fx.draw(r);
    r.tint = this.hurtT > 0 ? [1, 1 - this.hurtT * 0.25, 1 - this.hurtT * 0.25] : [1, 1, 1];
    r.end();

    // HUD — не чаще 15 раз в секунду
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 1 / 15;
      const left = Math.max(0, RUN_TIME - this.time);
      const phase = Math.min(3, Math.floor(this.time / PHASE) + 1);
      this.ui.timer(left, phase, this.bossSpawned ? 'Финальный бой' : `Фаза ${phase}`);
      this.ui.hp(this.hp, this.stats.maxHp);
      this.ui.xp(this.xp / this.need, this.level);
      this.ui.coins(this.coins);
      this.ui.skill(Math.max(0, this.skillCd) / (this.hero.skill.cd * (1 - Math.min(0.6, this.stats.skillCd))));
      this.ui.dodge(Math.max(0, this.dodgeCd) / 3);
      const marks: { x: number; y: number; color: string }[] = [];
      const pr = { x: 0, y: 0, ok: false };
      const W = r.canvas.clientWidth;
      const H = r.canvas.clientHeight;
      const add = (x: number, z: number, color: string) => {
        project(cam.vp, x, 1, z, W, H, pr);
        if (pr.ok && pr.x > 30 && pr.x < W - 30 && pr.y > 30 && pr.y < H - 30) return;
        marks.push({ x: pr.ok ? pr.x : W - pr.x, y: pr.ok ? pr.y : H - pr.y, color });
      };
      for (const p of this.pickups) if (p.kind !== 'coin' && p.kind !== 'heal') add(p.x, p.z, p.kind === 'fountain' ? '#ff5a7a' : '#ffd24a');
      for (let i = 0; i < this.e.n; i++) {
        if (f.type[i] === BOSS) add(f.x[i], f.z[i], '#ff2d55');
        else if (f.type[i] === GOB) add(f.x[i], f.z[i], '#ffd24a');
        else if (f.elite[i] === 2) add(f.x[i], f.z[i], '#ff8a1a');
      }
      this.ui.markers(marks);
    }
  }

  private bar(x: number, y: number, z: number, frac: number, c: RGB) {
    const r = this.r;
    const v = r.cam.view;
    const w = 1.4;
    r.sprite(2, CELL.square, x, y, z, 0.12, 0.05, 0.03, 0.08, 0.9, 0, 1);
    // ширину задаём набором маленьких квадратов вдоль горизонтали экрана
    const n = 10;
    for (let k = 0; k < n; k++) {
      const o = -w / 2 + (k + 0.5) * (w / n);
      const on = k / n < frac;
      r.sprite(2, CELL.square, x + v[0] * o, y + v[4] * o, z + v[8] * o, 0.075, on ? c[0] : 0.12, on ? c[1] : 0.08, on ? c[2] : 0.1, 0.95);
    }
  }
}
