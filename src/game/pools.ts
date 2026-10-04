// Плотные массивы структур: быстро и без мусора для сборщика
export class SoA<K extends string> {
  n = 0;
  readonly f: Record<K, Float32Array>;
  private keys: readonly K[];
  constructor(
    readonly cap: number,
    keys: readonly K[],
  ) {
    this.keys = keys;
    const f = {} as Record<K, Float32Array>;
    for (const k of keys) f[k] = new Float32Array(cap);
    this.f = f;
  }
  add() {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    for (const k of this.keys) this.f[k][i] = 0;
    return i;
  }
  kill(i: number) {
    const j = --this.n;
    if (i !== j) for (const k of this.keys) this.f[k][i] = this.f[k][j];
  }
}

// пространственная сетка для поиска соседей
export class Grid {
  readonly head: Int32Array;
  readonly next: Int32Array;
  constructor(
    readonly cell: number,
    readonly cols: number,
    readonly origin: number,
    cap: number,
  ) {
    this.head = new Int32Array(cols * cols);
    this.next = new Int32Array(cap);
  }
  reset() {
    this.head.fill(-1);
  }
  key(x: number, z: number) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.origin) / this.cell)));
    const cz = Math.max(0, Math.min(this.cols - 1, Math.floor((z - this.origin) / this.cell)));
    return cz * this.cols + cx;
  }
  insert(i: number, x: number, z: number) {
    const k = this.key(x, z);
    this.next[i] = this.head[k];
    this.head[k] = i;
  }
  // обход ячеек, пересекающих круг
  each(x: number, z: number, r: number, cb: (i: number) => void) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r - this.origin) / c));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r - this.origin) / c));
    const z0 = Math.max(0, Math.floor((z - r - this.origin) / c));
    const z1 = Math.min(this.cols - 1, Math.floor((z + r - this.origin) / c));
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cz * this.cols + cx];
        while (i !== -1) {
          cb(i);
          i = this.next[i];
        }
      }
    }
  }
}
