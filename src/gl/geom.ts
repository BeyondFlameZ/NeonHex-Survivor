// Генераторы низкополигональной геометрии: позиции, нормали, индексы
export interface Geom {
  pos: number[];
  nrm: number[];
  idx: number[];
}

export const emptyGeom = (): Geom => ({ pos: [], nrm: [], idx: [] });

export function box(w = 1, h = 1, d = 1): Geom {
  const g = emptyGeom();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z]]],
    [[0, 0, -1], [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]]],
  ];
  for (const [n, vs] of faces) {
    const b = g.pos.length / 3;
    for (const v of vs) {
      g.pos.push(v[0], v[1], v[2]);
      g.nrm.push(n[0], n[1], n[2]);
    }
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return g;
}

// цилиндр вдоль Y от 0 до h; rt/rb — радиусы сверху/снизу
export function cyl(rt = 0.5, rb = 0.5, h = 1, seg = 10, caps = true): Geom {
  const g = emptyGeom();
  const slope = (rb - rt) / h;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const nl = Math.hypot(1, slope);
    g.pos.push(c * rb, 0, s * rb, c * rt, h, s * rt);
    g.nrm.push(c / nl, slope / nl, s / nl, c / nl, slope / nl, s / nl);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  if (caps) {
    for (const [y, r, ny] of [[h, rt, 1], [0, rb, -1]] as const) {
      if (r <= 0) continue;
      const c0 = g.pos.length / 3;
      g.pos.push(0, y, 0);
      g.nrm.push(0, ny, 0);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        g.pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        g.nrm.push(0, ny, 0);
      }
      for (let i = 0; i < seg; i++) {
        if (ny > 0) g.idx.push(c0, c0 + i + 2, c0 + i + 1);
        else g.idx.push(c0, c0 + i + 1, c0 + i + 2);
      }
    }
  }
  return g;
}

export function sphere(r = 0.5, seg = 12, rings = 8, squashY = 1): Geom {
  const g = emptyGeom();
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const phi = v * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const th = u * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      g.pos.push(x * r, y * r * squashY, z * r);
      const nl = Math.hypot(x, y / squashY, z) || 1;
      g.nrm.push(x / nl, y / squashY / nl, z / nl);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      g.idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return g;
}

// капсула вдоль Y от 0 до h (полная высота), радиус r
export function capsule(r = 0.3, h = 1, seg = 10, rings = 4): Geom {
  const g = emptyGeom();
  const mid = Math.max(0, h - 2 * r);
  const rowsTop: number[] = [];
  const total = rings * 2 + 1;
  for (let j = 0; j <= total; j++) {
    let y: number, rr: number, ny: number;
    if (j <= rings) {
      const phi = (j / rings) * (Math.PI / 2);
      rr = Math.sin(phi) * r;
      ny = Math.cos(phi);
      y = r + mid + Math.cos(phi) * r;
    } else {
      const phi = ((j - rings - 1) / rings) * (Math.PI / 2) + Math.PI / 2;
      rr = Math.sin(phi) * r;
      ny = Math.cos(phi);
      y = r + Math.cos(phi) * r;
    }
    rowsTop.push(y);
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      g.pos.push(c * rr, y, s * rr);
      const nx = c * Math.sqrt(Math.max(0, 1 - ny * ny));
      const nz = s * Math.sqrt(Math.max(0, 1 - ny * ny));
      g.nrm.push(nx, ny, nz);
    }
  }
  for (let j = 0; j < total; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      g.idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return g;
}

export function cone(r = 0.5, h = 1, seg = 10): Geom {
  return cyl(0.001, r, h, seg, true);
}

// плоскость XZ, нормаль вверх
export function plane(w = 1, d = 1): Geom {
  return {
    pos: [-w / 2, 0, -d / 2, -w / 2, 0, d / 2, w / 2, 0, d / 2, w / 2, 0, -d / 2],
    nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    idx: [0, 1, 2, 0, 2, 3],
  };
}

export function torus(R = 0.5, r = 0.1, seg = 16, tube = 6): Geom {
  const g = emptyGeom();
  for (let j = 0; j <= tube; j++) {
    const v = (j / tube) * Math.PI * 2;
    for (let i = 0; i <= seg; i++) {
      const u = (i / seg) * Math.PI * 2;
      const cx = Math.cos(u), sz = Math.sin(u);
      g.pos.push((R + r * Math.cos(v)) * cx, r * Math.sin(v), (R + r * Math.cos(v)) * sz);
      g.nrm.push(Math.cos(v) * cx, Math.sin(v), Math.cos(v) * sz);
    }
  }
  for (let j = 0; j < tube; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      g.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

// сдвиг/масштаб/поворот вокруг Y копии геометрии
export function xform(src: Geom, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0): Geom {
  const g = emptyGeom();
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cz = Math.cos(rz), szn = Math.sin(rz);
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    // Z, затем X, затем Y
    let x1 = x * cz - y * szn, y1 = x * szn + y * cz, z1 = z;
    const y2 = y1 * cx - z1 * sxn, z2 = y1 * sxn + z1 * cx;
    y1 = y2;
    z1 = z2;
    const x3 = x1 * cy + z1 * syn, z3 = -x1 * syn + z1 * cy;
    x1 = x3;
    return [x1, y1, z3];
  };
  for (let i = 0; i < src.pos.length; i += 3) {
    const p = rot(src.pos[i] * sx, src.pos[i + 1] * sy, src.pos[i + 2] * sz);
    g.pos.push(p[0] + tx, p[1] + ty, p[2] + tz);
    const n = rot(src.nrm[i] / sx, src.nrm[i + 1] / sy, src.nrm[i + 2] / sz);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    g.nrm.push(n[0] / l, n[1] / l, n[2] / l);
  }
  g.idx = [...src.idx];
  return g;
}

export function merge(...parts: Geom[]): Geom {
  const g = emptyGeom();
  for (const p of parts) {
    const b = g.pos.length / 3;
    g.pos.push(...p.pos);
    g.nrm.push(...p.nrm);
    for (const i of p.idx) g.idx.push(i + b);
  }
  return g;
}
