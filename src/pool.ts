import { Container, Sprite, Texture } from 'pixi.js';

// Struct-of-arrays пул: плотные Float32Array + заранее созданные спрайты.
// Удаление — swap с последним, спрайты меняются местами вместе с данными.
export class Pool<K extends string> {
  n = 0;
  readonly f: Record<K, Float32Array>;
  readonly sprites: Sprite[] = [];

  constructor(
    readonly cap: number,
    private readonly keys: readonly K[],
    tex: Texture,
    layer: Container,
    blend: 'normal' | 'add' = 'normal',
    private readonly baseScale = 1,
  ) {
    const f = {} as Record<K, Float32Array>;
    for (const k of keys) f[k] = new Float32Array(cap);
    this.f = f;
    for (let i = 0; i < cap; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      s.scale.set(baseScale);
      s.blendMode = blend;
      layer.addChild(s);
      this.sprites.push(s);
    }
  }

  add(): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    const s = this.sprites[i];
    s.visible = true;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.rotation = 0;
    s.scale.set(this.baseScale);
    return i;
  }

  kill(i: number) {
    const j = --this.n;
    if (i !== j) {
      for (const k of this.keys) {
        const a = this.f[k];
        a[i] = a[j];
      }
      const s = this.sprites[i];
      this.sprites[i] = this.sprites[j];
      this.sprites[j] = s;
    }
    this.sprites[j].visible = false;
  }
}
