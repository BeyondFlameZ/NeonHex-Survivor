import { Container, Sprite, Texture } from 'pixi.js';
import { CFG, COL } from './config';

const PX = CFG.px;
const MAXD = 4;
const LIFE = 0.65;

interface Item {
  c: Container;
  d: Sprite[];
}

// Цифры собираются из спрайтов пиксельного шрифта — никаких Text-объектов, всё в пуле.
export class DamageNumbers {
  n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private crit: Uint8Array;
  private items: Item[] = [];

  constructor(
    private cap: number,
    layer: Container,
    private digits: Texture[],
  ) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.crit = new Uint8Array(cap);
    for (let i = 0; i < cap; i++) {
      const c = new Container();
      c.visible = false;
      const d: Sprite[] = [];
      for (let k = 0; k < MAXD; k++) {
        const s = new Sprite(digits[0]);
        s.anchor.set(0.5);
        c.addChild(s);
        d.push(s);
      }
      layer.addChild(c);
      this.items.push({ c, d });
    }
  }

  add(x: number, y: number, value: number, crit: boolean) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const it = this.items[i];
    const str = String(Math.min(9999, Math.max(1, Math.round(value))));
    const len = str.length;
    for (let k = 0; k < MAXD; k++) {
      const s = it.d[k];
      if (k < len) {
        s.visible = true;
        s.texture = this.digits[str.charCodeAt(k) - 48];
        s.position.set((k - (len - 1) / 2) * 4, 0);
        s.tint = crit ? COL.gold : 0xffffff;
      } else {
        s.visible = false;
      }
    }
    it.c.visible = true;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = (Math.random() - 0.5) * 60;
    this.vy[i] = crit ? -150 : -110;
    this.life[i] = LIFE;
    this.crit[i] = crit ? 1 : 0;
  }

  update(dt: number) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.vy[i] += 340 * dt;
      this.vx[i] *= 0.95;
    }
  }

  render() {
    for (let i = 0; i < this.n; i++) {
      const c = this.items[i].c;
      const age = LIFE - this.life[i];
      const base = this.crit[i] ? PX * 2 : PX;
      c.scale.set(age < 0.08 ? base * 1.5 : base);
      c.position.set(Math.round(this.x[i]), Math.round(this.y[i]));
      c.alpha = Math.min(1, this.life[i] / 0.2);
    }
  }

  private kill(i: number) {
    const j = --this.n;
    if (i !== j) {
      this.x[i] = this.x[j];
      this.y[i] = this.y[j];
      this.vx[i] = this.vx[j];
      this.vy[i] = this.vy[j];
      this.life[i] = this.life[j];
      this.crit[i] = this.crit[j];
      const t = this.items[i];
      this.items[i] = this.items[j];
      this.items[j] = t;
    }
    this.items[j].c.visible = false;
  }
}
