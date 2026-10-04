import { buzz, setHaptics } from './native.js';

// Весь звук синтезируется на лету: ни одного аудиофайла.
// Эффекты — короткие осцилляторы и шум с огибающими, музыка — генеративный эмбиент по ладу локации.

type Wave = OscillatorType;

interface Theme {
  root: number;
  scale: number[];
  bpm: number;
  chords: [number, number[]][];
}

const MINOR: [number, number[]][] = [
  [0, [0, 3, 7]],
  [8, [0, 4, 7]],
  [5, [0, 3, 7]],
  [3, [0, 4, 7]],
];
const DARK: [number, number[]][] = [
  [0, [0, 3, 7]],
  [1, [0, 4, 7]],
  [0, [0, 3, 7]],
  [10, [0, 3, 7]],
];

// 0..4 — локации, 5 — меню
const THEMES: Theme[] = [
  { root: 110, scale: [0, 3, 5, 7, 10], bpm: 72, chords: MINOR },
  { root: 73.42, scale: [0, 1, 5, 7, 8], bpm: 84, chords: DARK },
  { root: 82.41, scale: [0, 2, 3, 7, 8], bpm: 62, chords: MINOR },
  { root: 65.41, scale: [0, 3, 6, 7, 10], bpm: 78, chords: DARK },
  { root: 92.5, scale: [0, 1, 3, 6, 7, 8], bpm: 68, chords: DARK },
  { root: 98, scale: [0, 3, 7, 10], bpm: 52, chords: MINOR },
];

const ELEM_HIT: [Wave, number, number][] = [
  ['square', 1400, 500],
  ['sawtooth', 500, 180],
  ['triangle', 1800, 900],
  ['sine', 320, 140],
  ['square', 260, 120],
  ['square', 900, 1800],
];

const semi = (f: number, s: number) => f * Math.pow(2, s / 12);

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private voices = 0;
  private gemChain = 0;
  private gemT = 0;
  private music: Music | null = null;
  private theme = -1;
  private vol = { music: 0.6, sfx: 0.8 };

  // iOS разрешает звук только после касания — вызываем из обработчика жеста
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.sfxBus.connect(comp).connect(this.master);
      this.musicBus.connect(this.master);
      this.setVolumes(this.vol.music, this.vol.sfx);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
      if (this.theme >= 0) this.startMusic(this.theme);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setHaptics(on: boolean) {
    setHaptics(on);
  }

  setVolumes(music: number, sfx: number) {
    this.vol = { music, sfx };
    if (!this.ctx) return;
    this.musicBus.gain.value = music * 0.5;
    this.sfxBus.gain.value = sfx * 0.7;
  }

  duck(on: boolean) {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.vol.music * (on ? 0.18 : 0.5), this.ctx.currentTime, 0.2);
  }

  startMusic(theme: number) {
    this.theme = theme;
    if (!this.ctx) return;
    this.music?.stop();
    this.music = new Music(this.ctx, this.musicBus, THEMES[theme] ?? THEMES[5]);
  }

  stopMusic() {
    this.music?.stop();
    this.music = null;
    this.theme = -1;
  }

  intensity(v: number) {
    this.music?.setIntensity(v);
  }

  // ---------- примитивы ----------

  private ready(name: string, gap: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.vol.sfx <= 0 || this.voices > 28) return false;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(type: Wave, f0: number, f1: number, dur: number, gain: number, at = 0, attack = 0.004) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    this.voices++;
    o.onended = () => this.voices--;
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, at = 0, q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    this.voices++;
    src.onended = () => this.voices--;
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------- игровые события ----------

  hit(elem: number) {
    if (!this.ready('hit' + elem, 0.055)) return;
    const [w, a, b] = ELEM_HIT[elem] ?? ELEM_HIT[0];
    const p = 0.9 + Math.random() * 0.2;
    this.tone(w, a * p, b * p, 0.07, 0.05);
    this.hiss(0.04, 0.04, 'highpass', 3000, 1500);
  }

  crit() {
    if (!this.ready('crit', 0.08)) return;
    this.tone('triangle', 1600, 2600, 0.09, 0.08);
    this.hiss(0.06, 0.06, 'bandpass', 5000, 2500, 0, 2);
  }

  kill() {
    if (!this.ready('kill', 0.035)) return;
    this.tone('sine', 150 + Math.random() * 40, 45, 0.12, 0.12);
    this.hiss(0.08, 0.05, 'lowpass', 900, 200);
  }

  boom(big = false) {
    if (big) buzz('light');
    if (!this.ready('boom', big ? 0.05 : 0.12)) return;
    this.hiss(big ? 0.7 : 0.4, big ? 0.35 : 0.22, 'lowpass', 1400, 80);
    this.tone('sine', big ? 110 : 90, 30, big ? 0.6 : 0.35, big ? 0.35 : 0.2);
  }

  gem() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.currentTime - this.gemT > 0.4) this.gemChain = 0;
    this.gemT = ctx.currentTime;
    if (!this.ready('gem', 0.03)) return;
    const n = this.gemChain++ % 12;
    this.tone('sine', semi(880, n), semi(900, n), 0.06, 0.04);
  }

  shard() {
    if (!this.ready('shard', 0.04)) return;
    this.tone('triangle', 1320, 1760, 0.12, 0.07);
    this.tone('sine', 2640, 2640, 0.15, 0.03, 0.04);
  }

  eshot() {
    if (!this.ready('eshot', 0.09)) return;
    this.tone('sawtooth', 420, 220, 0.1, 0.035);
  }

  hurt() {
    buzz('medium');
    if (!this.ready('hurt', 0.15)) return;
    this.tone('sawtooth', 240, 70, 0.22, 0.16);
    this.hiss(0.15, 0.1, 'lowpass', 2000, 300);
  }

  dash() {
    if (!this.ready('dash', 0.1)) return;
    this.hiss(0.22, 0.12, 'bandpass', 500, 3000, 0, 3);
  }

  levelup() {
    buzz('light');
    if (!this.ready('levelup', 0.3)) return;
    [0, 4, 7, 12].forEach((s, k) => this.tone('triangle', semi(523, s), semi(523, s), 0.3, 0.09, k * 0.07, 0.01));
  }

  evolve() {
    buzz('heavy');
    if (!this.ready('evolve', 0.5)) return;
    [0, 7, 12, 16, 19, 24].forEach((s, k) => this.tone('square', semi(392, s), semi(392, s), 0.4, 0.05, k * 0.06, 0.01));
    this.hiss(0.8, 0.08, 'highpass', 6000, 9000);
  }

  chest() {
    if (!this.ready('chest', 0.3)) return;
    [0, 5, 9, 12, 17].forEach((s, k) => this.tone('sine', semi(880, s), semi(880, s), 0.5, 0.06, k * 0.05, 0.005));
  }

  legendary() {
    buzz('heavy');
    if (!this.ready('legendary', 0.5)) return;
    [0, 4, 7, 11, 14].forEach((s, k) => this.tone('triangle', semi(330, s), semi(330, s), 1.2, 0.07, k * 0.09, 0.02));
    this.tone('sine', 82, 80, 1.2, 0.15);
  }

  shrine() {
    if (!this.ready('shrine', 0.5)) return;
    [0, 7, 12, 15].forEach((s) => this.tone('sawtooth', semi(196, s), semi(196, s), 1.1, 0.035, 0, 0.25));
  }

  heal() {
    if (!this.ready('heal', 0.3)) return;
    [0, 4, 7].forEach((s, k) => this.tone('sine', semi(660, s), semi(700, s), 0.35, 0.06, k * 0.06));
  }

  horde() {
    if (!this.ready('horde', 1)) return;
    this.tone('sawtooth', 110, 98, 1.1, 0.12, 0, 0.15);
    this.tone('sawtooth', 165, 147, 1.1, 0.07, 0, 0.15);
  }

  boss() {
    buzz('heavy');
    if (!this.ready('boss', 1)) return;
    this.tone('sawtooth', 70, 40, 1.8, 0.25, 0, 0.2);
    this.tone('sawtooth', 71.5, 41, 1.8, 0.2, 0, 0.2);
    this.hiss(1.6, 0.2, 'lowpass', 600, 60);
  }

  goblin() {
    if (!this.ready('goblin', 1)) return;
    [12, 7, 12, 19].forEach((s, k) => this.tone('square', semi(440, s), semi(440, s), 0.08, 0.05, k * 0.07));
  }

  victory() {
    if (!this.ready('victory', 1)) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => this.tone('triangle', semi(392, s), semi(392, s), 0.6, 0.08, k * 0.1, 0.01));
  }

  defeat() {
    if (!this.ready('defeat', 1)) return;
    [0, -3, -7, -12].forEach((s, k) => this.tone('sawtooth', semi(220, s), semi(210, s), 0.6, 0.08, k * 0.2, 0.02));
  }

  click() {
    if (!this.ready('click', 0.04)) return;
    this.tone('triangle', 1200, 900, 0.05, 0.05);
  }
}

// генеративный эмбиент: гул, медленные аккорды, редкие колокола с эхом; на боссе — пульс
class Music {
  private out: GainNode;
  private timer: number;
  private next: number;
  private beat = 0;
  private hot = 0;
  private drone: OscillatorNode[] = [];
  private bellBus: GainNode;

  constructor(
    private ctx: AudioContext,
    dest: GainNode,
    private th: Theme,
  ) {
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
    this.out.connect(dest);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    const dg = ctx.createGain();
    dg.gain.value = 0.16;
    lp.connect(dg).connect(this.out);
    for (const det of [0, 0.4, 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = semi(th.root, det);
      o.connect(lp);
      o.start();
      this.drone.push(o);
    }
    this.drone.push(lfo);

    // колокола уходят в эхо
    this.bellBus = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / th.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2200;
    this.bellBus.connect(this.out);
    this.bellBus.connect(delay);
    delay.connect(dl).connect(fb).connect(delay);
    dl.connect(this.out);

    this.next = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  setIntensity(v: number) {
    this.hot = v;
  }

  stop() {
    window.clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    for (const o of this.drone) o.stop(t + 1.3);
    window.setTimeout(() => this.out.disconnect(), 1500);
  }

  private note(type: OscillatorType, f: number, t: number, dur: number, gain: number, attack: number, dest: AudioNode) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private schedule() {
    const ctx = this.ctx;
    const spb = 60 / this.th.bpm / (this.hot > 0 ? 1.5 : 1);
    while (this.next < ctx.currentTime + 0.35) {
      const t = this.next;
      const b = this.beat++;
      const [chordRoot, triad] = this.th.chords[Math.floor(b / 8) % this.th.chords.length];

      if (b % 8 === 0) {
        for (const s of triad) {
          this.note('sawtooth', semi(this.th.root * 2, chordRoot + s), t, spb * 8.5, 0.022, spb * 2, this.out);
          this.note('sine', semi(this.th.root * 2, chordRoot + s + 12), t, spb * 8.5, 0.02, spb * 2, this.out);
        }
      }
      if (Math.random() < (this.hot > 0 ? 0.55 : 0.32)) {
        const sc = this.th.scale;
        const deg = sc[(Math.random() * sc.length) | 0] + (Math.random() < 0.4 ? 12 : 0);
        this.note('triangle', semi(this.th.root * 4, deg), t, spb * 3, 0.05, 0.005, this.bellBus);
      }
      if (this.hot > 0) {
        this.note('sine', 58, t, 0.25, 0.4, 0.005, this.out);
        if (b % 2 === 1) this.note('square', semi(this.th.root, chordRoot), t, 0.15, 0.03, 0.005, this.out);
      }
      this.next += spb;
    }
  }
}
