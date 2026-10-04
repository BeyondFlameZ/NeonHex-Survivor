// Атлас 8×8 ячеек по 64 px и текстуры пола — всё рисуется в canvas при запуске
export const CELL = {
  digit0: 0,
  disc: 10,
  glow: 11,
  star: 12,
  ring: 13,
  streak: 14,
  smoke: 15,
  gem: 16,
  square: 17,
  plus: 18,
  hexring: 20,
  bolt: 22,
  flame: 23,
  heart: 24,
  coin: 25,
  chevron: 26,
} as const;

function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

export function makeAtlas() {
  const S = 64;
  const { c, g } = cv(S * 8, S * 8);
  const at = (cell: number, draw: (cx: number, cy: number) => void) => {
    const x = (cell % 8) * S;
    const y = Math.floor(cell / 8) * S;
    g.save();
    g.beginPath();
    g.rect(x, y, S, S);
    g.clip();
    draw(x + S / 2, y + S / 2);
    g.restore();
  };
  // цифры: белые, толстая тёмная обводка
  for (let n = 0; n < 10; n++) {
    at(n, (cx, cy) => {
      g.font = '900 52px "Arial Black", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(10,6,20,1)';
      g.strokeText(String(n), cx, cy + 3);
      g.fillStyle = '#fff';
      g.fillText(String(n), cx, cy + 3);
    });
  }
  const radial = (cell: number, stops: [number, string][], r = S / 2) =>
    at(cell, (cx, cy) => {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr;
      g.fillRect(cx - S / 2, cy - S / 2, S, S);
    });
  radial(CELL.disc, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  radial(CELL.glow, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  radial(CELL.smoke, [[0, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  at(CELL.star, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k % 2 ? 7 : 30;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
  });
  at(CELL.ring, (cx, cy) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 26, 0, Math.PI * 2);
    g.stroke();
  });
  at(CELL.hexring, (cx, cy) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      g.lineTo(cx + Math.cos(a) * 27, cy + Math.sin(a) * 27);
    }
    g.stroke();
  });
  at(CELL.streak, (cx, cy) => {
    const gr = g.createLinearGradient(cx - 30, cy, cx + 30, cy);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(cx, cy, 30, 9, 0, 0, Math.PI * 2);
    g.fill();
  });
  at(CELL.gem, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(cx, cy - 28);
    g.lineTo(cx + 18, cy);
    g.lineTo(cx, cy + 28);
    g.lineTo(cx - 18, cy);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(cx, cy - 28);
    g.lineTo(cx + 18, cy);
    g.lineTo(cx, cy + 28);
    g.closePath();
    g.fill();
  });
  at(CELL.square, (cx, cy) => {
    g.fillStyle = '#fff';
    g.fillRect(cx - S / 2, cy - S / 2, S, S);
  });
  at(CELL.plus, (cx, cy) => {
    g.fillStyle = '#fff';
    g.fillRect(cx - 7, cy - 24, 14, 48);
    g.fillRect(cx - 24, cy - 7, 48, 14);
  });
  at(CELL.bolt, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(cx + 6, cy - 30);
    g.lineTo(cx - 14, cy + 4);
    g.lineTo(cx, cy + 4);
    g.lineTo(cx - 6, cy + 30);
    g.lineTo(cx + 14, cy - 6);
    g.lineTo(cx, cy - 6);
    g.closePath();
    g.fill();
  });
  at(CELL.flame, (cx, cy) => {
    const gr = g.createRadialGradient(cx, cy + 10, 2, cx, cy + 4, 28);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx, cy - 30);
    g.quadraticCurveTo(cx + 26, cy + 4, cx, cy + 28);
    g.quadraticCurveTo(cx - 26, cy + 4, cx, cy - 30);
    g.fill();
  });
  at(CELL.heart, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(cx, cy + 24);
    g.bezierCurveTo(cx - 34, cy, cx - 22, cy - 28, cx, cy - 12);
    g.bezierCurveTo(cx + 22, cy - 28, cx + 34, cy, cx, cy + 24);
    g.fill();
  });
  at(CELL.coin, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      g.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
    }
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(cx - 4, cy - 14, 8, 28);
  });
  at(CELL.chevron, (cx, cy) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(cx - 20, cy - 18);
    g.lineTo(cx + 22, cy);
    g.lineTo(cx - 20, cy + 18);
    g.lineTo(cx - 10, cy);
    g.closePath();
    g.fill();
  });
  return c;
}

// ---------- мультяшные полы: крупные плиты с фаской и неоновыми деталями ----------

export interface GroundStyle {
  base: string;
  dark: string;
  light: string;
  line: string;
  glow: string;
  kind: 'slab' | 'basalt' | 'ice' | 'flesh' | 'marble';
}

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function makeGround(st: GroundStyle) {
  const S = 512;
  const { c, g } = cv(S, S);
  const r = rng(st.kind.length * 977 + 13);
  g.fillStyle = st.line;
  g.fillRect(0, 0, S, S);
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  const tile = (x: number, y: number, w: number, h: number, rad: number) => {
    const col = r() < 0.5 ? st.base : r() < 0.5 ? st.light : st.base;
    wrap((ox, oy) => {
      g.fillStyle = st.dark;
      g.beginPath();
      g.roundRect(x + ox + 3, y + oy + 5, w - 6, h - 6, rad);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(x + ox + 3, y + oy + 3, w - 6, h - 7, rad);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.roundRect(x + ox + 6, y + oy + 5, w - 12, 6, 3);
      g.fill();
    });
  };
  if (st.kind === 'slab' || st.kind === 'marble') {
    const n = st.kind === 'marble' ? 4 : 4;
    const step = S / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const off = st.kind === 'slab' && j % 2 ? step / 2 : 0;
        tile(i * step + off, j * step, step, step, 10);
      }
    }
    if (st.kind === 'marble') {
      g.strokeStyle = st.glow;
      g.globalAlpha = 0.7;
      g.lineWidth = 3;
      for (const [cx, cy] of [[128, 128], [384, 384]]) {
        g.beginPath();
        g.arc(cx, cy, 30, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
        }
        g.closePath();
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  } else {
    // «камни» неправильной формы: сетка с дрожанием углов
    const n = st.kind === 'flesh' ? 6 : 5;
    const step = S / n;
    const pts: [number, number][][] = [];
    for (let j = 0; j <= n; j++) {
      pts.push([]);
      for (let i = 0; i <= n; i++) {
        const edge = i === 0 || j === 0 || i === n || j === n;
        const jx = edge ? 0 : (r() - 0.5) * step * 0.5;
        const jy = edge ? 0 : (r() - 0.5) * step * 0.5;
        pts[j].push([i * step + jx, j * step + jy]);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
        const col = [st.base, st.light, st.base, st.dark][(i * 3 + j * 5) % 4];
        const shrink = (k: number, d: number): [number, number] => {
          const mx = (q[0][0] + q[2][0]) / 2;
          const my = (q[0][1] + q[2][1]) / 2;
          return [q[k][0] + (mx - q[k][0]) * d, q[k][1] + (my - q[k][1]) * d];
        };
        g.fillStyle = st.kind === 'flesh' ? col : col;
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const p = shrink(k, 0.08);
          g.lineTo(p[0], p[1]);
        }
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.09)';
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const p = shrink(k, 0.3);
          g.lineTo(p[0] - 2, p[1] - 3);
        }
        g.closePath();
        g.fill();
      }
    }
  }
  // светящиеся трещины
  g.strokeStyle = st.glow;
  g.lineCap = 'round';
  for (let k = 0; k < (st.kind === 'basalt' ? 6 : 2); k++) {
    let x = r() * S;
    let y = r() * S;
    let ang = r() * Math.PI * 2;
    g.lineWidth = st.kind === 'basalt' ? 4 : 2;
    g.globalAlpha = st.kind === 'basalt' ? 0.95 : 0.45;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang) * 16;
      y += Math.sin(ang) * 16;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // мелкие камушки и пятна
  for (let k = 0; k < 40; k++) {
    g.fillStyle = r() < 0.5 ? st.dark : st.light;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(r() * S, r() * S, 2 + r() * 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}
