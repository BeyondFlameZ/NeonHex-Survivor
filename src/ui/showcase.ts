import type { Renderer } from '../gl/renderer.js';
import { CELL, makeGround } from '../gl/textures.js';
import { heroById } from '../game/heroes.js';
import { drawHero, drawProp, rgb, type Pose } from '../game/models.js';

// 3D-витрина хаба: герой стоит на ночной крыше, вокруг фонари и дома с горящими окнами
export class Showcase {
  private t = 0;
  hero = 'volt';
  private pose: Pose = { t: 0, move: 0, aim: 0, hit: 0, phase: 0 };
  private spin = 0;

  constructor(private r: Renderer) {}

  enter() {
    const r = this.r;
    r.setGround(makeGround({ kind: 'slab', base: '#3a4250', dark: '#262c36', light: '#465060', line: '#161a20', glow: '#3ef0ff' }), 6, 80);
    r.bounds = [-40, -40, 40, 40];
    r.fog = [0.1, 0.12, 0.2];
    r.clear = [0.1, 0.12, 0.2];
    r.fogRange = [14, 40];
    r.tint = [1, 1, 1];
    r.cam.pitch = 0.2;
    r.cam.dist = 8.6;
    r.cam.fov = 0.62;
  }

  rotate(d: number) {
    this.spin += d;
  }

  frame(dt: number, offsetX = 0) {
    const r = this.r;
    this.t += dt;
    const t = this.t;
    r.cam.x = -offsetX;
    r.cam.y = 1.05;
    r.cam.z = 0;
    r.cam.yaw = Math.sin(t * 0.15) * 0.12;
    r.begin();
    const h = heroById(this.hero);
    const glow = rgb(h.look.glow);
    this.pose.t = t;
    this.pose.aim = (Math.sin(t * 0.6) + 1) * 0.15;
    drawHero(h.look, 0, 0, 0.35 + this.spin + Math.sin(t * 0.4) * 0.15, this.pose, 1, Math.sin(t * 2) * 0.02);
    r.sprite(0, CELL.disc, 0, 0.03, 0, 1.3, 0, 0, 0, 0.5);
    r.sprite(1, CELL.hexring, 0, 0.05, 0, 1.7, glow[0], glow[1], glow[2], 0.55, t * 0.4);
    r.sprite(1, CELL.glow, 0, 0.04, 0, 5, glow[0], glow[1], glow[2], 0.18);
    for (let k = 0; k < 6; k++) {
      const a = t * 0.6 + k;
      r.sprite(3, CELL.glow, Math.cos(a) * 1.3, 0.4 + ((t * 0.5 + k * 0.3) % 2), Math.sin(a) * 1.3, 0.18, glow[0], glow[1], glow[2], 0.8);
    }
    const A = rgb('#4a5260');
    const B = rgb('#2a2e38');
    const lamp = rgb('#ffd27a');
    drawProp('lamp', -4.5, -3, 0, 1, A, B, lamp, t);
    r.sprite(3, CELL.glow, -3.8, 2.85, -3, 2.4, 1, 0.82, 0.48, 0.7);
    drawProp('crate', 3.6, -2.2, 0.4, 1, rgb('#7a5a3a'), B, lamp, t);
    drawProp('crate', 4.4, -3.4, 0.1, 0.8, rgb('#6a4a2a'), B, lamp, t);
    drawProp('barrel', -3.2, -1.2, 0, 0.9, rgb('#3a5a8a'), B, rgb('#3ef0ff'), t);
    drawProp('skylight', 0.5, -7, Math.PI / 2, 1, rgb('#9a8a76'), rgb('#6a5a48'), rgb('#3ef0ff'), t);
    for (let k = -3; k <= 3; k++) drawProp('house', k * 9, -16, 0, 1, rgb(['#4a3a40', '#3a4050', '#504038'][(k + 3) % 3]), rgb('#22262e'), rgb(k % 2 ? '#ffd27a' : '#7dffd8'), t, 8.5, 6);
    r.end();
  }
}
