// Sound: a small lo-fi chiptune loop made with Web Audio (no audio files), sound effects,
// and an optional track of your own (a URL) that replaces the loop. Starts only after a click.

export type Sfx = 'clunk' | 'coin' | 'stamp' | 'ring' | 'truck' | 'pop' | 'whoosh' | 'cheer' | 'blip';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Cmaj7 - Am7 - Fmaj7 - G7, two bars each
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const BASS = [36, 33, 29, 31];
const MELODY = [72, -1, 74, 76, -1, 74, 71, -1, 69, -1, 71, 72, -1, 69, 67, -1];

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private el: HTMLAudioElement | null = null;
  private url = '';
  muted = false;
  musicOn = true;
  enabled = false;

  enable() {
    if (this.enabled) { this.ctx?.resume(); return; }
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.55 : 0; this.music.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.enabled = true;
    if (this.url) this.playUrl(); else this.startLoop();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (this.el) this.el.muted = m;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
    if (this.el) { if (on && !this.muted) this.el.play().catch(() => {}); else this.el.pause(); }
  }

  setUrl(url: string) {
    if (url === this.url) return;
    this.url = url;
    if (!this.enabled) return;
    if (url) { this.stopLoop(); this.playUrl(); }
    else { if (this.el) { this.el.pause(); this.el = null; } this.startLoop(); }
  }

  private playUrl() {
    if (this.el) this.el.pause();
    const el = new Audio(this.url);
    el.loop = true; el.volume = 0.5; el.muted = this.muted;
    this.el = el;
    if (this.musicOn) el.play().catch(() => {});
  }

  private startLoop() {
    if (!this.ctx || this.timer) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }
  private stopLoop() { if (this.timer) { clearInterval(this.timer); this.timer = 0; } }

  private schedule() {
    const c = this.ctx!;
    const beat = 60 / 88 / 2;          // eighth notes at 88 bpm
    while (this.nextT < c.currentTime + 0.25) {
      const s = this.step;
      const bar = Math.floor(s / 8) % 8;
      const chord = CHORDS[Math.floor(bar / 2)];
      const t = this.nextT;
      if (s % 8 === 0) this.tone(NOTE(BASS[Math.floor(bar / 2)]), t, beat * 3.5, 'triangle', 0.22);
      if (s % 8 === 4) this.tone(NOTE(BASS[Math.floor(bar / 2)] + 7), t, beat * 1.8, 'triangle', 0.16);
      const arp = chord[s % 4] + 12;
      this.tone(NOTE(arp), t, beat * 0.9, 'square', 0.025);
      const mel = MELODY[s % 16];
      if (bar % 2 === 1 && mel > 0) this.tone(NOTE(mel), t, beat * 1.6, 'triangle', 0.06);
      if (s % 4 === 2) this.noise(t, 0.04, 0.05, 6000);
      if (s % 8 === 0) this.kick(t);
      if (s % 8 === 4) this.noise(t, 0.12, 0.07, 1800);
      this.nextT += beat;
      this.step++;
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, bus?: GainNode) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    o.connect(lp); lp.connect(g); g.connect(bus ?? this.music);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, vol: number, hp: number, bus?: GainNode) {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(bus ?? this.music);
    src.start(t);
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.25);
  }

  sfx(name: Sfx) {
    if (!this.enabled || !this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + 0.01, b = this.sfxBus;
    switch (name) {
      case 'clunk': this.tone(180, t, 0.12, 'square', 0.12, b); this.noise(t, 0.06, 0.12, 400, b); break;
      case 'coin': this.tone(NOTE(88), t, 0.08, 'square', 0.08, b); this.tone(NOTE(93), t + 0.07, 0.3, 'square', 0.08, b); break;
      case 'stamp': this.noise(t, 0.12, 0.35, 120, b); this.tone(90, t, 0.14, 'sine', 0.3, b); break;
      case 'ring':
        for (let i = 0; i < 6; i++) { this.tone(NOTE(84), t + i * 0.09, 0.07, 'square', 0.06, b); this.tone(NOTE(88), t + i * 0.09 + 0.045, 0.07, 'square', 0.06, b); }
        break;
      case 'truck': this.tone(NOTE(76), t, 0.18, 'square', 0.05, b); this.tone(NOTE(76), t + 0.32, 0.18, 'square', 0.05, b); break;
      case 'pop': this.tone(NOTE(79), t, 0.06, 'triangle', 0.12, b); this.tone(NOTE(84), t + 0.05, 0.08, 'triangle', 0.1, b); break;
      case 'whoosh': this.noise(t, 0.35, 0.08, 900, b); break;
      case 'blip': this.tone(NOTE(81), t, 0.05, 'square', 0.05, b); break;
      case 'cheer':
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + i * 0.11, 0.3, 'square', 0.07, b));
        break;
    }
  }
}
