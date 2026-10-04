// Двойной стик: левая половина — плавающий стик движения, справа — прицел/огонь, кнопки умения и рывка
export class Input {
  mx = 0;
  mz = 0;
  ax = 0;
  az = 1;
  aiming = false;
  auto = true;
  private moveId = -1;
  private aimId = -1;
  private ox = 0;
  private oy = 0;
  private jx = 0;
  private jy = 0;
  private keys = new Set<string>();
  private dodgeQ = false;
  private skillQ = false;
  private base: HTMLElement;
  private knob: HTMLElement;
  private aimPad: HTMLElement;
  private aimKnob: HTMLElement;

  constructor(zone: HTMLElement) {
    this.base = document.getElementById('joy')!;
    this.knob = document.getElementById('joy-knob')!;
    this.aimPad = document.getElementById('aim')!;
    this.aimKnob = document.getElementById('aim-knob')!;
    const R = 62;

    zone.addEventListener('pointerdown', (e) => {
      if (this.moveId !== -1 || e.clientX > window.innerWidth * 0.55) return;
      this.moveId = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.jx = this.jy = 0;
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
    });
    this.aimPad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.aimId = e.pointerId;
      this.aimPad.setPointerCapture?.(e.pointerId);
      this.aimFrom(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.moveId) {
        let dx = e.clientX - this.ox;
        let dy = e.clientY - this.oy;
        const l = Math.hypot(dx, dy);
        if (l > R) {
          dx = (dx / l) * R;
          dy = (dy / l) * R;
        }
        this.jx = dx / R;
        this.jy = dy / R;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (e.pointerId === this.aimId) this.aimFrom(e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.moveId) {
        this.moveId = -1;
        this.jx = this.jy = 0;
        this.base.classList.remove('on');
      }
      if (e.pointerId === this.aimId) {
        this.aimId = -1;
        this.aiming = false;
        this.aimKnob.style.transform = 'translate(-50%,-50%)';
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    const btn = (id: string, fn: () => void) => {
      document.getElementById(id)!.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    btn('btn-dodge', () => (this.dodgeQ = true));
    btn('btn-skill', () => (this.skillQ = true));
    btn('btn-auto', () => this.setAuto(!this.auto));

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ShiftLeft') this.dodgeQ = true;
      if (e.code === 'KeyQ' || e.code === 'KeyE') this.skillQ = true;
      if (e.code === 'KeyF') this.setAuto(!this.auto);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private aimFrom(x: number, y: number) {
    const r = this.aimPad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = x - cx;
    let dy = y - cy;
    const l = Math.hypot(dx, dy);
    const R = r.width / 2;
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    this.aimKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (l > 12) {
      this.ax = dx / (l || 1);
      this.az = dy / (l || 1);
      this.aiming = true;
    } else this.aiming = false;
  }

  setAuto(v: boolean) {
    this.auto = v;
    document.getElementById('btn-auto')!.classList.toggle('on', v);
  }

  poll() {
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyA')) kx -= 1;
    if (this.keys.has('KeyD')) kx += 1;
    if (this.keys.has('KeyW')) kz -= 1;
    if (this.keys.has('KeyS')) kz += 1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      this.mx = kx / l;
      this.mz = kz / l;
    } else {
      this.mx = this.jx;
      this.mz = this.jy;
    }
    let ax = 0;
    let az = 0;
    if (this.keys.has('ArrowLeft')) ax -= 1;
    if (this.keys.has('ArrowRight')) ax += 1;
    if (this.keys.has('ArrowUp')) az -= 1;
    if (this.keys.has('ArrowDown')) az += 1;
    if (ax || az) {
      const l = Math.hypot(ax, az);
      this.ax = ax / l;
      this.az = az / l;
      this.aiming = true;
    } else if (this.aimId === -1) this.aiming = false;
  }

  consumeDodge() {
    const v = this.dodgeQ;
    this.dodgeQ = false;
    return v;
  }

  consumeSkill() {
    const v = this.skillQ;
    this.skillQ = false;
    return v;
  }

  reset() {
    this.moveId = this.aimId = -1;
    this.jx = this.jy = this.mx = this.mz = 0;
    this.aiming = false;
    this.keys.clear();
    this.dodgeQ = this.skillQ = false;
    this.base.classList.remove('on');
  }

  // для автотестов: управлять героем из скрипта
  drive(mx: number, mz: number) {
    this.jx = mx;
    this.jy = mz;
  }
}
