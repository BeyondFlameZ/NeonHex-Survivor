// Минимальная математика: матрицы 4×4 по столбцам (как в WebGL)
export type M4 = Float32Array;

export const m4 = () => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

export function ident(o: M4) {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

export function mul(o: M4, a: M4, b: M4) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return o;
}

export function perspective(o: M4, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function lookAt(o: M4, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  // up = (0,1,0)
  let xx = zz, xy = 0, xz = -zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez);
  o[13] = -(yx * ex + yy * ey + yz * ez);
  o[14] = -(zx * ex + zy * ey + zz * ez);
  o[15] = 1;
  return o;
}

// TRS: перенос, поворот вокруг Y, масштаб — самый частый случай для сущностей
export function trs(o: M4, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number) {
  const c = Math.cos(ry), s = Math.sin(ry);
  o[0] = c * sx; o[1] = 0; o[2] = -s * sx; o[3] = 0;
  o[4] = 0; o[5] = sy; o[6] = 0; o[7] = 0;
  o[8] = s * sz; o[9] = 0; o[10] = c * sz; o[11] = 0;
  o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
  return o;
}

// локальная матрица части: сдвиг к шарниру, поворот X→Y→Z, сдвиг от шарнира, масштаб
const tmpA = m4();
const tmpB = m4();
export function part(o: M4, px: number, py: number, pz: number, rx: number, ry: number, rz: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number) {
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + syn * sxn * szn, r01 = cx * szn, r02 = -syn * cz + cy * sxn * szn;
  const r10 = -cy * szn + syn * sxn * cz, r11 = cx * cz, r12 = syn * szn + cy * sxn * cz;
  const r20 = syn * cx, r21 = -sxn, r22 = cy * cx;
  o[0] = r00 * sx; o[1] = r01 * sx; o[2] = r02 * sx; o[3] = 0;
  o[4] = r10 * sy; o[5] = r11 * sy; o[6] = r12 * sy; o[7] = 0;
  o[8] = r20 * sz; o[9] = r21 * sz; o[10] = r22 * sz; o[11] = 0;
  o[12] = px + r00 * ox + r10 * oy + r20 * oz;
  o[13] = py + r01 * ox + r11 * oy + r21 * oz;
  o[14] = pz + r02 * ox + r12 * oy + r22 * oz;
  o[15] = 1;
  void tmpA;
  void tmpB;
  return o;
}

// проекция точки мира в экранные координаты (CSS-пиксели)
export function project(vp: M4, x: number, y: number, z: number, w: number, h: number, out: { x: number; y: number; ok: boolean }) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  out.ok = cw > 0;
  out.x = ((cx / cw) * 0.5 + 0.5) * w;
  out.y = (1 - ((cy / cw) * 0.5 + 0.5)) * h;
  return out;
}
