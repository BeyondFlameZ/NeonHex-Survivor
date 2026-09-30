// Хеш-сетка на связных списках: head[cell] -> первый индекс, next[i] -> следующий в той же ячейке.
// Пересобирается каждый тик за O(n), без аллокаций.
export class SpatialGrid {
  readonly head: Int32Array;
  readonly next: Int32Array;
  ox = 0;
  oy = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell: number,
    capacity: number,
  ) {
    this.head = new Int32Array(cols * rows);
    this.next = new Int32Array(capacity);
  }

  reset(cx: number, cy: number) {
    this.ox = cx - (this.cols * this.cell) / 2;
    this.oy = cy - (this.rows * this.cell) / 2;
    this.head.fill(-1);
  }

  insert(i: number, x: number, y: number) {
    const cx = Math.floor((x - this.ox) / this.cell);
    const cy = Math.floor((y - this.oy) / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) {
      this.next[i] = -1;
      return;
    }
    const c = cy * this.cols + cx;
    this.next[i] = this.head[c];
    this.head[c] = i;
  }

  cellX(x: number) { return Math.floor((x - this.ox) / this.cell); }
  cellY(y: number) { return Math.floor((y - this.oy) / this.cell); }
}
