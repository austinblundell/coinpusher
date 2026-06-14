// All sound is synthesized with the Web Audio API — no asset files. Coin clinks
// are bandpassed metallic pings; payouts are bright bell tones; the jackpot is a
// quick ascending arpeggio. AudioContext is created lazily on first user gesture
// so browsers don't block it.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastClink = 0;
  private clinkBudget = 0;
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

  // Metallic coin contact. Throttled and budgeted so a cascade doesn't machine-gun.
  clink(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    // Refill a small budget over time; cap simultaneous clinks.
    this.clinkBudget = Math.min(6, this.clinkBudget + (now - this.lastClink) * 14);
    this.lastClink = now;
    if (this.clinkBudget < 1) return;
    this.clinkBudget -= 1;

    const osc = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "triangle";
    const base = 1700 + Math.random() * 1400;
    osc.frequency.value = base;
    bp.type = "bandpass";
    bp.frequency.value = base;
    bp.Q.value = 6;
    const vol = Math.min(0.22, 0.06 + intensity * 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.15);
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
