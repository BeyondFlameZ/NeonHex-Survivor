import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { CFG, COL } from './config';
import { SpatialGrid } from './grid';
import type { Hud } from './hud';
import type { Input } from './input';
import { DamageNumbers } from './numbers';
import { Pool } from './pool';
import * as tex from './textures';
import { baseStats, rollChoices, UPGRADES, type Stats } from './upgrades';

type EK = 'x' | 'y' | 'hp' | 'spd' | 'r' | 'xp' | 'flash' | 'kx' | 'ky' | 'dcd' | 'kind' | 'ph';
type BK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'dmg' | 'pierce' | 'last';
type GK = 'x' | 'y' | 'v' | 'val' | 'mag';
type PK = 'x' | 'y' | 'vx' | 'vy' | 'life' | 'max';
type DK = 'x' | 'y' | 'life';
type IK = 'x' | 'y' | 't';
type HK = 'x' | 'y' | 'life' | 'max';

const TAU = Math.PI * 2;
const OCT = Math.PI / 4;
const PX = CFG.px;
const IMPACT_FRAME = 0.04;
const xpNeed = (lvl: number) => Math.round(5 * Math.pow(lvl, 1.35));
const GIB_COLORS = [COL.blood, COL.bloodDark, 0x2e2340];

const SRC_BOLT = 0;
const SRC_DRONE = 1;

export class Game {
  readonly root = new Container();
  private scene = new Container();
  private world = new Container();
  private bg: TilingSprite;
  private light: Sprite;
  private vignette: Sprite;
  private hurtOverlay = new Graphics();

  private enemies: Pool<EK>;
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
  private drones: Sprite[] = [];
  private hpBar = new Graphics();

  // источники света кадра: игрок, снаряды, дроны, вспышки
  private lx = new Float32Array(CFG.maxLights);
  private ly = new Float32Array(CFG.maxLights);
  private lr = new Float32Array(CFG.maxLights);
  private ls = new Float32Array(CFG.maxLights);
  private lc = new Uint32Array(CFG.maxLights);
  private nL = 0;
  // короткоживущие вспышки света
  private fx = new Float32Array(32);
  private fy = new Float32Array(32);
  private fr = new Float32Array(32);
  private fs = new Float32Array(32);
  private fl = new Float32Array(32);
  private fm = new Float32Array(32);
  private fc = new Uint32Array(32);
  private nF = 0;

  private stats: Stats = baseStats();
  private levels: Record<string, number> = {};
  private px = 0;
  private py = 0;
  private face = 1;
  private moving = false;
  private hp: number = CFG.player.hp;
  private xp = 0;
  private level = 1;
  private need = xpNeed(1);
  private kills = 0;
  private time = 0;
  private tick = 0;
  private boltTimer = 0.3;
  private droneAngle = 0;
  private spawnAcc = 0;
  private nextWave = 60;
  private iframes = 0;
  private shake = 0;
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

    this.light = new Sprite(tex.lightTex());
    this.light.anchor.set(0.5);
    this.light.blendMode = 'add';
    this.light.tint = COL.arcane;
    this.light.alpha = 0.2;
    this.light.scale.set(2.4);

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
    const droneLayer = new Container();
    const gibLayer = new Container();
    const sparkLayer = new Container();
    const impactLayer = new Container();
    const numberLayer = new Container();

    this.decals = new Pool<DK>(CFG.maxDecals, ['x', 'y', 'life'], this.splatTex[0], decalLayer, 'normal', PX);
    this.gems = new Pool<GK>(CFG.maxGems, ['x', 'y', 'v', 'val', 'mag'], tex.crystalTex(), gemLayer, 'normal', PX);
    this.enemies = new Pool<EK>(
      CFG.maxEnemies,
      ['x', 'y', 'hp', 'spd', 'r', 'xp', 'flash', 'kx', 'ky', 'dcd', 'kind', 'ph'],
      this.enemyTex[0][0],
      enemyLayer,
      'normal',
      PX,
    );
    this.bullets = new Pool<BK>(
      CFG.maxBullets,
      ['x', 'y', 'vx', 'vy', 'life', 'dmg', 'pierce', 'last'],
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

    // рим-оверлей на слот врага; индекс слота = индекс в пуле, сам спрайт не свапается
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

    const droneT = tex.droneTex();
    for (let k = 0; k < 6; k++) {
      const d = new Sprite(droneT);
      d.anchor.set(0.5);
      d.scale.set(PX);
      d.visible = false;
      droneLayer.addChild(d);
      this.drones.push(d);
    }

    this.world.addChild(
      this.light,
      decalLayer,
      gemLayer,
      enemyLayer,
      rimLayer,
      bulletLayer,
      ghostLayer,
      this.player,
      droneLayer,
      gibLayer,
      sparkLayer,
      impactLayer,
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
  }

  frame(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= CFG.dt) {
      this.update(CFG.dt);
      this.acc -= CFG.dt;
    }
    this.render();
  }

  heal(n: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }

  private update(dt: number) {
    if (this.paused || this.over) return;
    this.input.poll();

    // hitstop: мир замирает на пару кадров, тряска и вспышка продолжают жить
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
      return;
    }

    this.time += dt;
    this.tick++;
    const s = this.stats;
    const mx = this.input.mx;
    const my = this.input.my;

    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.input.consumeDash() && this.dashCd <= 0 && this.dashT <= 0) this.startDash(mx, my);

    if (this.dashT > 0) {
      this.dashT -= dt;
      const v = s.moveSpeed * CFG.dash.mult;
      this.px += this.dashX * v * dt;
      this.py += this.dashY * v * dt;
      if ((this.tick & 1) === 0) this.ghost();
    } else {
      this.px += mx * s.moveSpeed * dt;
      this.py += my * s.moveSpeed * dt;
    }
    this.moving = mx !== 0 || my !== 0 || this.dashT > 0;
    if (this.dashT <= 0) {
      if (mx > 0.05) this.face = 1;
      else if (mx < -0.05) this.face = -1;
    }

    if (this.iframes > 0) this.iframes -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 2.5);
    this.heal(s.regen * dt);

    const e = this.enemies;
    const g = this.grid;
    g.reset(this.px, this.py);
    for (let i = 0; i < e.n; i++) g.insert(i, e.f.x[i], e.f.y[i]);

    this.spawn(dt);
    this.updateEnemies(dt);
    this.fireBolts(dt);
    this.updateBullets(dt);
    this.updateDrones(dt);
    this.reapEnemies();
    this.updateGems(dt);
    this.updateFx(this.sparks, dt, 0.9);
    this.updateFx(this.gibs, dt, 0.86);
    this.updateTimed(this.decals, dt);
    this.updateTimed(this.ghosts, dt);
    this.updateImpacts(dt);
    this.updateFlashes(dt);
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

  private stop(sec: number) {
    // мелкие стопы не чаще раза в 0.3с — иначе при сотне убийств в секунду игра встанет колом
    if (sec < 0.06 && this.time - this.lastStop < 0.3) return;
    this.hitstop = Math.max(this.hitstop, sec);
    this.lastStop = this.time;
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
    const w = this.app.screen.width / this.zoom;
    const h = this.app.screen.height / this.zoom;
    return Math.hypot(w, h) / 2 + 40;
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
  }

  // ---------- враги ----------

  private updateEnemies(dt: number) {
    const n = this.enemies.n;
    const { x, y, hp, spd, r, flash, kx, ky, dcd } = this.enemies.f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const pr = CFG.player.radius;
    const parity = this.tick & 1;

    for (let i = 0; i < n; i++) {
      if (hp[i] <= 0) continue;
      const dx = this.px - x[i];
      const dy = this.py - y[i];
      const d = Math.hypot(dx, dy) || 1;

      if (d > CFG.far) {
        this.ringPoint();
        x[i] = this.tmpX;
        y[i] = this.tmpY;
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
      if (flash[i] > 0) flash[i] -= dt;
      if (dcd[i] > 0) dcd[i] -= dt;

      if (d < r[i] + pr && this.iframes <= 0) {
        this.hp -= CFG.enemy.contactDmg * (1 + this.time / 240);
        this.iframes = CFG.player.iframes;
        this.shake = 6;
        this.hurt = 1;
        this.flash(this.px, this.py, 150, 1, COL.blood, 0.2);
        this.stop(0.07);
      }
    }
  }

  private hit(j: number, dmg: number, nx: number, ny: number, src: number) {
    const f = this.enemies.f;
    const crit = Math.random() < this.stats.crit;
    const d = crit ? dmg * 2.2 : dmg;
    f.hp[j] -= d;
    f.flash[j] = 0.08;
    const kb = 160 * (11 / f.r[j]) * (crit ? 1.8 : 1);
    f.kx[j] += nx * kb;
    f.ky[j] += ny * kb;

    const ix = f.x[j] - nx * f.r[j] * 0.6;
    const iy = f.y[j] - ny * f.r[j] * 0.6 - 4;
    const tint = crit ? COL.gold : src === SRC_BOLT ? COL.arcane : COL.crystal;
    this.impact(ix, iy, tint, crit ? PX * 2 : PX);
    this.flash(ix, iy, crit ? 120 : 64, crit ? 1.1 : 0.6, tint, crit ? 0.16 : 0.08);
    this.numbers.add(f.x[j], f.y[j] - f.r[j] - 8, d, crit);

    const sp = this.sparks;
    const sf = sp.f;
    for (let k = 0; k < (crit ? 5 : 2); k++) {
      const i = sp.add();
      if (i < 0) break;
      const a = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 1.4;
      const v = 90 + Math.random() * 120;
      sf.x[i] = f.x[j];
      sf.y[i] = f.y[j];
      sf.vx[i] = Math.cos(a) * v;
      sf.vy[i] = Math.sin(a) * v;
      sf.life[i] = sf.max[i] = 0.18 + Math.random() * 0.12;
      sp.sprites[i].tint = k === 0 ? 0xffffff : COL.gold;
    }
    if (crit) {
      this.shake = Math.max(this.shake, 2.5);
      this.stop(0.035);
    }
  }

  private reapEnemies() {
    const e = this.enemies;
    const f = e.f;
    for (let i = e.n - 1; i >= 0; i--) {
      if (f.hp[i] > 0) continue;
      this.kills++;
      const kind = f.kind[i];
      this.dropGem(f.x[i], f.y[i], f.xp[i]);
      this.burst(f.x[i], f.y[i], f.r[i], kind);
      if (kind === 2) {
        this.impact(f.x[i], f.y[i], COL.gold, PX * 4);
        this.flash(f.x[i], f.y[i], 220, 1.3, COL.gold, 0.3);
        this.shake = 8;
        this.stop(0.09);
      } else {
        this.flash(f.x[i], f.y[i], 70, 0.7, COL.blood, 0.12);
      }
      e.kill(i);
    }
  }

  // ---------- оружие ----------

  private fireBolts(dt: number) {
    this.boltTimer -= dt;
    if (this.boltTimer > 0) return;

    const e = this.enemies;
    const { x, y, hp } = e.f;
    let best = -1;
    let bestD = CFG.boltRange * CFG.boltRange;
    for (let i = 0; i < e.n; i++) {
      if (hp[i] <= 0) continue;
      const dx = x[i] - this.px;
      const dy = y[i] - this.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    if (best < 0) return;

    const s = this.stats;
    this.boltTimer = s.cooldown;
    const base = Math.atan2(y[best] - this.py, x[best] - this.px);
    const b = this.bullets;
    const bf = b.f;
    for (let k = 0; k < s.boltCount; k++) {
      const j = b.add();
      if (j < 0) break;
      const a = base + (k - (s.boltCount - 1) / 2) * 0.16;
      bf.x[j] = this.px;
      bf.y[j] = this.py - 4;
      bf.vx[j] = Math.cos(a) * s.boltSpeed;
      bf.vy[j] = Math.sin(a) * s.boltSpeed;
      bf.life[j] = 1.1;
      bf.dmg[j] = s.dmg;
      bf.pierce[j] = s.pierce;
      bf.last[j] = -1;
    }
    // вспышка у посоха при выстреле
    this.impact(this.px + Math.cos(base) * 12, this.py - 4 + Math.sin(base) * 12, COL.arcane, PX);
  }

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
      if (trail) this.spark(bx, by, 0, 0, 0.14, COL.arcane);

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
                this.hit(j, f.dmg[k], f.vx[k] / sp, f.vy[k] / sp, SRC_BOLT);
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

  private updateDrones(dt: number) {
    const s = this.stats;
    for (let k = 0; k < this.drones.length; k++) this.drones[k].visible = k < s.drones;
    if (s.drones === 0) return;

    this.droneAngle += dt * 2.8;
    const e = this.enemies.f;
    const g = this.grid;
    const { head, next, cols, rows, cell } = g;
    const R = CFG.drone.orbit;
    const dr = CFG.drone.radius;
    const reach = dr + CFG.enemyMaxR;

    for (let k = 0; k < s.drones; k++) {
      const a = this.droneAngle + (k / s.drones) * TAU;
      const dx = this.px + Math.cos(a) * R;
      const dy = this.py + Math.sin(a) * R;
      this.drones[k].position.set(Math.round(dx), Math.round(dy));
      if ((this.tick & 3) === k % 4) this.spark(dx, dy, 0, 0, 0.2, COL.crystal);

      const x0 = Math.max(0, Math.floor((dx - reach - g.ox) / cell));
      const x1 = Math.min(cols - 1, Math.floor((dx + reach - g.ox) / cell));
      const y0 = Math.max(0, Math.floor((dy - reach - g.oy) / cell));
      const y1 = Math.min(rows - 1, Math.floor((dy + reach - g.oy) / cell));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          let j = head[cy * cols + cx];
          while (j !== -1) {
            if (e.hp[j] > 0 && e.dcd[j] <= 0) {
              const ox = e.x[j] - dx;
              const oy = e.y[j] - dy;
              const rr = dr + e.r[j];
              if (ox * ox + oy * oy < rr * rr) {
                const lx = e.x[j] - this.px;
                const ly = e.y[j] - this.py;
                const len = Math.hypot(lx, ly) || 1;
                this.hit(j, s.droneDmg, lx / len, ly / len, SRC_DRONE);
                e.dcd[j] = 0.35;
              }
            }
            j = next[j];
          }
        }
      }
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
    const pick = this.stats.pickup;
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

  private spark(x: number, y: number, vx: number, vy: number, life: number, tint: number) {
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

  private impact(x: number, y: number, tint: number, scale: number) {
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

  private flash(x: number, y: number, r: number, s: number, color: number, life: number) {
    if (this.nF >= 32) return;
    const i = this.nF++;
    this.fx[i] = x;
    this.fy[i] = y;
    this.fr[i] = r;
    this.fs[i] = s;
    this.fl[i] = this.fm[i] = life;
    this.fc[i] = color;
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

  // ---------- прокачка ----------

  private openLevelUp() {
    const choices = rollChoices(this.levels);
    if (choices.length === 0) {
      this.pending = 0;
      this.heal(Infinity);
      return;
    }
    this.paused = true;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      this.spark(this.px, this.py, Math.cos(a) * 220, Math.sin(a) * 220, 0.4, COL.gold);
    }
    this.impact(this.px, this.py, COL.gold, PX * 4);
    this.flash(this.px, this.py, 240, 1.2, COL.gold, 0.4);
    this.hud.showLevelUp(
      choices.map((u) => ({ id: u.id, name: u.name, desc: u.desc, level: this.levels[u.id] ?? 0, max: u.max })),
      (id) => {
        const u = UPGRADES.find((q) => q.id === id)!;
        u.apply(this.stats, this);
        this.levels[id] = (this.levels[id] ?? 0) + 1;
        this.pending--;
        this.hud.hideLevelUp();
        this.paused = false;
        if (this.pending > 0) this.openLevelUp();
      },
    );
  }

  // ---------- свет ----------

  private pushLight(x: number, y: number, r: number, s: number, c: number) {
    if (this.nL >= CFG.maxLights) return;
    const i = this.nL++;
    this.lx[i] = x;
    this.ly[i] = y;
    this.lr[i] = r;
    this.ls[i] = s;
    this.lc[i] = c;
  }

  private collectLights() {
    this.nL = 0;
    if (!this.over) this.pushLight(this.px, this.py - 6, 170, 0.85, COL.arcane);
    for (let i = 0; i < this.nF; i++) {
      this.pushLight(this.fx[i], this.fy[i], this.fr[i], this.fs[i] * (this.fl[i] / this.fm[i]), this.fc[i]);
    }
    const s = this.stats;
    for (let k = 0; k < s.drones; k++) {
      const d = this.drones[k];
      this.pushLight(d.x, d.y, 80, 0.7, COL.crystal);
    }
    const b = this.bullets;
    for (let i = 0; i < b.n && this.nL < CFG.maxLights; i++) this.pushLight(b.f.x[i], b.f.y[i], 90, 0.8, COL.arcane);
  }

  // ---------- рендер ----------

  private render() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const P = Math.max(2, Math.min(5, Math.round((Math.min(w, h) / 560) * PX)));
    this.zoom = P / PX;
    const z = this.zoom;

    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && !this.paused) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
    }
    const wx = Math.round(w / 2 - this.px * z + sx);
    const wy = Math.round(h / 2 - this.py * z + sy);
    this.world.scale.set(z);
    this.world.position.set(wx, wy);
    this.bg.width = w;
    this.bg.height = h;
    this.bg.tileScale.set(P);
    this.bg.tilePosition.set(wx, wy);

    this.collectLights();
    const nL = this.nL;
    const { lx, ly, lr, ls, lc } = this;

    const t = this.time;
    const halfW = w / 2 / z + 48;
    const halfH = h / 2 / z + 48;
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
      const frame = flashing ? 0 : ((t * 5 + ef.ph[i]) | 0) & 1;
      s.texture = flashing ? frames[2] : frames[frame];
      const sc = kind === 2 ? PX * 2 : PX;
      const flip = ex > this.px ? -1 : 1;
      const rx = Math.round(ex);
      const ry = Math.round(ey);
      s.scale.set(sc * flip, sc);
      s.position.set(rx, ry);

      // суммарный вектор света + цвет самого сильного источника → маска rim под 8 направлений
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

      if (total < 0.04 || flashing) {
        rim.visible = false;
        continue;
      }
      // спрайт отзеркален — зеркалим и направление света в локальные координаты текстуры
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

    const b = this.bullets;
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

    this.light.position.set(this.px, this.py);
    this.light.alpha = 0.18 + Math.sin(t * 2.2) * 0.03;

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
