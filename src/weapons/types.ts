import type { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { SCHOOLS, type SchoolId } from '../schools';

// флаги для Game.hit / Game.aoe
export const F_NOFX = 1; // без вспышки/искр на попадании
export const F_NONUM = 2; // без цифры урона (криты всё равно показываются)
export const F_NOKB = 4; // без отбрасывания
export const F_NOSET = 8; // не триггерить сет-бонусы (защита от рекурсии)

export interface WeaponDef {
  id: string;
  school: SchoolId;
  name: string;
  tag: string; // 3 символа для иконки в HUD
  desc: string;
  perks: string[]; // описания уровней 2..8
  evo: { name: string; desc: string };
  make(g: Game): Weapon;
}

export interface Weapon {
  readonly def: WeaponDef;
  level: number;
  evolved: boolean;
  update(dt: number): void;
  draw(fx: Graphics, ground: Graphics): void;
  onKill?(x: number, y: number, j: number): void;
  onDash?(): void;
}

export abstract class BaseWeapon implements Weapon {
  level = 1;
  evolved = false;
  protected timer = 0.3;
  protected readonly elem: number;
  protected readonly color: number;

  constructor(
    readonly def: WeaponDef,
    protected g: Game,
  ) {
    this.elem = SCHOOLS[def.school].elem;
    this.color = SCHOOLS[def.school].color;
  }

  abstract update(dt: number): void;

  draw(_fx: Graphics, _ground: Graphics) {}

  // 1, если уровень >= n — удобно для лестниц вида 1 + lv(2) + lv(5)
  protected lv(n: number) {
    return this.level >= n ? 1 : 0;
  }

  protected cooldown(base: number) {
    return base * this.g.cdMul();
  }

  protected dmg(base: number) {
    return base * this.g.dmgMul(this.elem);
  }
}
