// All sound is synthesized with the Web Audio API — no asset files. Payouts are
// bright bell tones; the jackpot is a quick ascending arpeggio; a looping chiptune
// plays bouncy arcade music underneath it all. AudioContext is created lazily on
// first user gesture so browsers don't block it.

// Equal-tempered note frequencies (Hz) used by the music sequencer.
const NOTE: Record<string, number> = {
  F2: 87.31, G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81,
  F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

// A cheerful 4-bar loop (C – G – Am – F), eighth-note grid. "-" is a rest.
const LEAD = [
  "G4", "C5", "E5", "G5", "E5", "C5", "E5", "G5", // C
  "G4", "B4", "D5", "G5", "D5", "B4", "D5", "G5", // G
  "A4", "C5", "E5", "A5", "E5", "C5", "E5", "A5", // Am
  "F4", "A4", "C5", "F5", "C5", "A4", "C5", "F5", // F
];
const BASS = [
  "C3", "-", "C3", "-", "G2", "-", "C3", "-",
  "G2", "-", "G2", "-", "D3", "-", "G2", "-",
  "A2", "-", "A2", "-", "E3", "-", "A2", "-",
  "F2", "-", "F2", "-", "C3", "-", "F2", "-",
];
const MUSIC_BPM = 130;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: { bus: GainNode; timer: number; nextTime: number; step: number } | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  // Call from a user gesture to unlock audio.
  resume() {
    this.ensure();
  }

  // ---- Looping arcade music --------------------------------------------------
  // Starts a self-scheduling chiptune. Idempotent: safe to call on every gesture.
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.music) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.2); // gentle fade-in
    bus.connect(this.master);
    this.music = { bus, timer: 0, nextTime: ctx.currentTime + 0.08, step: 0 };
    this.scheduleMusic();
  }

  stopMusic() {
    if (!this.music) return;
    window.clearTimeout(this.music.timer);
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.music.bus.gain.cancelScheduledValues(now);
      this.music.bus.gain.setValueAtTime(this.music.bus.gain.value, now);
      this.music.bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    }
    this.music = null;
  }

  // Look-ahead scheduler: queue any notes due in the next 200ms, then re-arm.
  private scheduleMusic = () => {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !m) return;
    const stepDur = 60 / MUSIC_BPM / 2; // eighth-note grid
    while (m.nextTime < ctx.currentTime + 0.2) {
      const lead = LEAD[m.step % LEAD.length];
      const bass = BASS[m.step % BASS.length];
      if (lead !== "-") this.voice(NOTE[lead], m.nextTime, "square", stepDur * 0.9, 0.18, m.bus);
      if (bass !== "-") this.voice(NOTE[bass], m.nextTime, "triangle", stepDur * 1.8, 0.3, m.bus);
      m.nextTime += stepDur;
      m.step++;
    }
    m.timer = window.setTimeout(this.scheduleMusic, 25);
  };

  // One percussive synth note with a quick attack and exponential decay.
  private voice(freq: number, t: number, type: OscillatorType, dur: number, peak: number, dest: GainNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Bright two-note "cha-ching" when a coin banks.
  payout() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = now + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  jackpot() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  }

  // Soft "plink" when a coin is dropped.
  drop() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);
  }
}
