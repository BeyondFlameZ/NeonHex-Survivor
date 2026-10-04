import type { Geom } from './geom.js';
import { lookAt, m4, mul, perspective, type M4 } from './math.js';

// Мультяшный рендер на чистом WebGL2:
//  • тун-освещение (3 ступени света) + контровой свет по краю + собственное свечение
//  • чёрный контур методом «вывернутой оболочки»
//  • всё рисуется инстансами: одна модель — один вызов на кадр, сколько бы врагов ни было
//  • спрайты (частицы, свечение, цифры урона) и декали на земле (тени, лужи, круги)

const FPI = 20; // floats на инстанс: mat4 (16) + цвет rgb + свечение

const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iM3;
layout(location=6) in vec4 iCol;
uniform mat4 uVP;
uniform float uOutline;
out vec3 vN;
out vec3 vW;
out vec4 vCol;
void main(){
  mat4 M = mat4(iM0,iM1,iM2,iM3);
  vec4 w = M * vec4(aPos,1.0);
  vec3 n = normalize(mat3(M) * aNrm);
  w.xyz += n * uOutline;
  vN = n; vW = w.xyz; vCol = iCol;
  gl_Position = uVP * w;
}`;

const LIT_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec4 vCol;
uniform vec3 uLight;
uniform vec3 uEye;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform float uOutlinePass;
uniform vec3 uTint;
out vec4 o;
void main(){
  if (uOutlinePass > 0.5) { o = vec4(vCol.rgb * 0.12 + vec3(0.02,0.01,0.04), 1.0); return; }
  vec3 n = normalize(vN);
  float d = dot(n, uLight);
  float t = smoothstep(0.02, 0.08, d) * 0.35 + smoothstep(0.45, 0.52, d) * 0.25;
  vec3 v = normalize(uEye - vW);
  float rim = smoothstep(0.62, 0.72, 1.0 - max(dot(n, v), 0.0)) * 0.22 * step(0.0, d + 0.3);
  vec3 c = vCol.rgb * (0.52 + t) * uTint + rim;
  c = mix(c, vCol.rgb * 1.35 + 0.1, clamp(vCol.a, 0.0, 1.0));
  float dist = distance(vW.xz, uEye.xz);
  c = mix(c, uFog, smoothstep(uFogRange.x, uFogRange.y, dist) * 0.85);
  o = vec4(c, 1.0);
}`;

const GROUND_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform float uTile;
out vec2 vUV; out vec3 vW;
void main(){ vW = aPos; vUV = aPos.xz / uTile; gl_Position = uVP * vec4(aPos,1.0); }`;

const GROUND_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vW;
uniform sampler2D uTex;
uniform vec3 uEye;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform vec3 uTint;
uniform vec4 uBounds;
out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb * uTint;
  float edge = min(min(vW.x - uBounds.x, uBounds.z - vW.x), min(vW.z - uBounds.y, uBounds.w - vW.z));
  c *= mix(0.45, 1.0, smoothstep(-2.0, 6.0, edge));
  float dist = distance(vW.xz, uEye.xz);
  c = mix(c, uFog, smoothstep(uFogRange.x, uFogRange.y, dist) * 0.85);
  o = vec4(c, 1.0);
}`;

// спрайт: per-instance pos(xyz) size, color rgba, uv-ячейка атласа + поворот + режим (0 билборд, 1 декаль на земле)
const SPR_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPos;
layout(location=2) in vec4 iCol;
layout(location=3) in vec4 iCell;
uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vUV; out vec4 vCol;
void main(){
  float c = cos(iCell.z), s = sin(iCell.z);
  vec2 k = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c) * iPos.w;
  vec3 w;
  if (iCell.w > 0.5) w = iPos.xyz + vec3(k.x * iCell.w, 0.0, k.y);
  else w = iPos.xyz + uRight * k.x + uUp * k.y;
  vec2 uv = aCorner * 0.5 + 0.5;
  vUV = (iCell.xy + vec2(uv.x, 1.0 - uv.y)) / 8.0;
  vCol = iCol;
  gl_Position = uVP * vec4(w, 1.0);
}`;

const SPR_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol;
uniform sampler2D uAtlas;
out vec4 o;
void main(){
  vec4 t = texture(uAtlas, vUV);
  o = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
  if (o.a < 0.01) discard;
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)!;
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

interface MeshRec {
  vao: WebGLVertexArrayObject;
  count: number;
  inst: WebGLBuffer;
  cap: number;
  data: Float32Array;
  n: number;
  outline: boolean;
}

interface SprBatch {
  data: Float32Array;
  n: number;
  cap: number;
  buf: WebGLBuffer;
  vao: WebGLVertexArrayObject;
}

export class Camera {
  x = 0;
  y = 0;
  z = 0;
  dist = 26;
  pitch = 1.0; // радианы от горизонта
  yaw = 0;
  fov = 0.7;
  readonly view = m4();
  readonly proj = m4();
  readonly vp = m4();
  ex = 0;
  ey = 0;
  ez = 0;
  update(aspect: number) {
    this.ex = this.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
    this.ey = this.y + Math.sin(this.pitch) * this.dist;
    this.ez = this.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
    lookAt(this.view, this.ex, this.ey, this.ez, this.x, this.y, this.z);
    perspective(this.proj, this.fov, aspect, 0.5, 400);
    mul(this.vp, this.proj, this.view);
  }
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly cam = new Camera();
  private lit;
  private ground;
  private spr;
  private meshes: MeshRec[] = [];
  private batches: SprBatch[];
  private groundVao: WebGLVertexArrayObject | null = null;
  private groundCount = 0;
  private groundTex: WebGLTexture | null = null;
  private groundTile = 8;
  private atlas: WebGLTexture;
  private quad: WebGLBuffer;
  bounds: [number, number, number, number] = [-50, -50, 50, 50];
  light: [number, number, number] = [-0.45, 0.8, 0.4];
  fog: [number, number, number] = [0.06, 0.05, 0.1];
  fogRange: [number, number] = [30, 70];
  tint: [number, number, number] = [1, 1, 1];
  clear: [number, number, number] = [0.04, 0.03, 0.07];
  outlineWidth = 0.045;
  dpr = 1;
  fixedSize = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: canvas.dataset.keep === '1' });
    if (!gl) throw new Error('WebGL2 недоступен');
    this.gl = gl;
    this.lit = compile(gl, LIT_VS, LIT_FS);
    this.ground = compile(gl, GROUND_VS, GROUND_FS);
    this.spr = compile(gl, SPR_VS, SPR_FS);
    this.atlas = this.texture(atlas, false);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    // 0 — тени/декали (alpha), 1 — свечение на земле (add), 2 — билборды alpha, 3 — билборды add
    this.batches = [0, 1, 2, 3].map(() => this.makeBatch());
    gl.enable(gl.DEPTH_TEST);
  }

  texture(src: HTMLCanvasElement, repeat: boolean) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  private makeBatch(): SprBatch {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const cap = 2048;
    gl.bufferData(gl.ARRAY_BUFFER, cap * 12 * 4, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(1 + k);
      gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 48, k * 16);
      gl.vertexAttribDivisor(1 + k, 1);
    }
    gl.bindVertexArray(null);
    return { data: new Float32Array(cap * 12), n: 0, cap, buf, vao };
  }

  // загрузка геометрии; возвращает id модели
  mesh(g: Geom, outline = true): number {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.nrm), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = g.pos.length / 3 > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(g.idx) : new Uint16Array(g.idx), gl.STATIC_DRAW);
    const inst = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    const cap = 64;
    gl.bufferData(gl.ARRAY_BUFFER, cap * FPI * 4, gl.DYNAMIC_DRAW);
    this.instAttribs();
    gl.bindVertexArray(null);
    const rec: MeshRec = { vao, count: g.idx.length, inst, cap, data: new Float32Array(cap * FPI), n: 0, outline };
    (rec as MeshRec & { big: boolean }).big = big;
    this.meshes.push(rec);
    return this.meshes.length - 1;
  }

  private instAttribs() {
    const gl = this.gl;
    for (let k = 0; k < 5; k++) {
      gl.enableVertexAttribArray(2 + k);
      gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, FPI * 4, k * 16);
      gl.vertexAttribDivisor(2 + k, 1);
    }
  }

  setGround(tex: HTMLCanvasElement, tile: number, size: number) {
    const gl = this.gl;
    if (this.groundTex) gl.deleteTexture(this.groundTex);
    this.groundTex = this.texture(tex, true);
    this.groundTile = tile;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const h = size / 2;
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-h, 0, -h, -h, 0, h, h, 0, h, -h, 0, -h, h, 0, h, h, 0, -h]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.groundVao = vao;
    this.groundCount = 6;
  }

  // ---------- кадр ----------

  begin() {
    for (const m of this.meshes) m.n = 0;
    for (const b of this.batches) b.n = 0;
  }

  // положить экземпляр модели с готовой матрицей
  put(id: number, M: M4, r: number, g: number, b: number, glow = 0) {
    const m = this.meshes[id];
    if (m.n >= m.cap) this.grow(m);
    const o = m.n * FPI;
    m.data.set(M, o);
    m.data[o + 16] = r;
    m.data[o + 17] = g;
    m.data[o + 18] = b;
    m.data[o + 19] = glow;
    m.n++;
  }

  private grow(m: MeshRec) {
    const gl = this.gl;
    m.cap *= 2;
    const d = new Float32Array(m.cap * FPI);
    d.set(m.data);
    m.data = d;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.inst);
    gl.bufferData(gl.ARRAY_BUFFER, m.cap * FPI * 4, gl.DYNAMIC_DRAW);
  }

  // спрайт из атласа 8×8: cell — номер ячейки; layer 0 декаль-тень, 1 декаль-свет, 2 билборд, 3 билборд-свет
  sprite(layer: number, cell: number, x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, rot = 0, stretch = 1) {
    const B = this.batches[layer];
    if (B.n >= B.cap) {
      const gl = this.gl;
      B.cap *= 2;
      const d = new Float32Array(B.cap * 12);
      d.set(B.data);
      B.data = d;
      gl.bindBuffer(gl.ARRAY_BUFFER, B.buf);
      gl.bufferData(gl.ARRAY_BUFFER, B.cap * 12 * 4, gl.DYNAMIC_DRAW);
    }
    const o = B.n * 12;
    const d = B.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = size;
    d[o + 4] = r;
    d[o + 5] = g;
    d[o + 6] = b;
    d[o + 7] = a;
    d[o + 8] = cell % 8;
    d[o + 9] = Math.floor(cell / 8);
    d[o + 10] = rot;
    d[o + 11] = layer < 2 ? stretch : 0;
    B.n++;
  }

  resize() {
    const c = this.canvas;
    const w = Math.round(c.clientWidth * this.dpr);
    const h = Math.round(c.clientHeight * this.dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  end() {
    const gl = this.gl;
    if (!this.fixedSize) this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const cam = this.cam;
    cam.update(this.canvas.width / Math.max(1, this.canvas.height));
    gl.clearColor(this.clear[0], this.clear[1], this.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const L = this.light;
    const ll = Math.hypot(L[0], L[1], L[2]);

    // земля
    if (this.groundVao && this.groundTex) {
      const P = this.ground;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, cam.vp);
      gl.uniform1f(P.u.uTile, this.groundTile);
      gl.uniform3f(P.u.uEye, cam.ex, cam.ey, cam.ez);
      gl.uniform3fv(P.u.uFog, this.fog);
      gl.uniform2fv(P.u.uFogRange, this.fogRange);
      gl.uniform3fv(P.u.uTint, this.tint);
      gl.uniform4fv(P.u.uBounds, this.bounds);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
      gl.uniform1i(P.u.uTex, 0);
      gl.bindVertexArray(this.groundVao);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, this.groundCount);
    }

    // декали на земле: тени и круги (без записи глубины)
    this.drawSprites(0, false);
    this.drawSprites(1, true);

    // модели: контур, затем заливка
    const P = this.lit;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, cam.vp);
    gl.uniform3f(P.u.uLight, L[0] / ll, L[1] / ll, L[2] / ll);
    gl.uniform3f(P.u.uEye, cam.ex, cam.ey, cam.ez);
    gl.uniform3fv(P.u.uFog, this.fog);
    gl.uniform2fv(P.u.uFogRange, this.fogRange);
    gl.uniform3fv(P.u.uTint, this.tint);
    gl.enable(gl.CULL_FACE);
    for (const m of this.meshes) {
      if (!m.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, m.n * FPI);
    }
    const idxType = (m: MeshRec) => ((m as MeshRec & { big?: boolean }).big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT);
    gl.cullFace(gl.FRONT);
    gl.uniform1f(P.u.uOutline, this.outlineWidth);
    gl.uniform1f(P.u.uOutlinePass, 1);
    for (const m of this.meshes) {
      if (!m.n || !m.outline) continue;
      gl.bindVertexArray(m.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, idxType(m), 0, m.n);
    }
    gl.cullFace(gl.BACK);
    gl.uniform1f(P.u.uOutline, 0);
    gl.uniform1f(P.u.uOutlinePass, 0);
    for (const m of this.meshes) {
      if (!m.n) continue;
      gl.bindVertexArray(m.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, idxType(m), 0, m.n);
    }
    gl.disable(gl.CULL_FACE);

    // билборды: частицы, свечение, цифры
    this.drawSprites(2, false);
    this.drawSprites(3, true);
    gl.bindVertexArray(null);
  }

  private drawSprites(layer: number, additive: boolean) {
    const B = this.batches[layer];
    if (!B.n) return;
    const gl = this.gl;
    const P = this.spr;
    gl.useProgram(P.p);
    const v = this.cam.view;
    gl.uniformMatrix4fv(P.u.uVP, false, this.cam.vp);
    gl.uniform3f(P.u.uRight, v[0], v[4], v[8]);
    gl.uniform3f(P.u.uUp, v[1], v[5], v[9]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(P.u.uAtlas, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, B.data, 0, B.n * 12);
    gl.enable(gl.BLEND);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (layer < 2) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -4);
    }
    gl.bindVertexArray(B.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, B.n);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
