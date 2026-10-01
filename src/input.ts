import { Container, Graphics } from 'pixi.js';

// Плавающий джойстик: палец в любом месте экрана = центр стика. Плюс WASD/стрелки для клавы айпада.
export class Input {
  mx = 0;
  my = 0;
  readonly view = new Container();

  private readonly R = 56;
  private keys = new Set<string>();
  private id = -1;
  private ox = 0;
  private oy = 0;
  private jx = 0;
  private jy = 0;
  private knob: Graphics;
  private dashQ = false;

  constructor(canvas: HTMLCanvasElement) {
    const base = new Graphics()
      .circle(0, 0, this.R)
      .fill({ color: 0x3ef0ff, alpha: 0.06 })
      .circle(0, 0, this.R)
      .stroke({ width: 2, color: 0x3ef0ff, alpha: 0.4 });
    this.knob = new Graphics().circle(0, 0, 22).fill({ color: 0x3ef0ff, alpha: 0.45 });
    this.view.addChild(base, this.knob);
    this.view.visible = false;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.id !== -1) return;
      this.id = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.jx = this.jy = 0;
      this.view.position.set(this.ox, this.oy);
      this.knob.position.set(0, 0);
      this.view.visible = true;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let dx = e.clientX - this.ox;
      let dy = e.clientY - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > this.R) {
        dx *= this.R / d;
        dy *= this.R / d;
      }
      this.jx = dx / this.R;
      this.jy = dy / this.R;
      this.knob.position.set(dx, dy);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = -1;
      this.jx = this.jy = 0;
      this.view.visible = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!e.repeat && (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) this.dashQ = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // между забегами — сбрасываем залипший палец/клавиши
  reset() {
    this.id = -1;
    this.jx = this.jy = 0;
    this.mx = this.my = 0;
    this.keys.clear();
    this.dashQ = false;
    this.view.visible = false;
  }

  queueDash() {
    this.dashQ = true;
  }

  consumeDash() {
    const d = this.dashQ;
    this.dashQ = false;
    return d;
  }

  poll() {
    let x = this.jx;
    let y = this.jy;
    if (this.id === -1) {
      const k = this.keys;
      x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      const l = Math.hypot(x, y);
      if (l > 0) {
        x /= l;
        y /= l;
      }
    } else if (Math.hypot(x, y) < 0.12) {
      x = y = 0;
    }
    this.mx = x;
    this.my = y;
  }
}
