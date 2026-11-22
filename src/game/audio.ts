/**
 * 100% Procedural Web Audio API Synthesizer for Neon Cube Runner.
 * Generates jump, coin collect, lane switch, speed milestone, and crash effects without external audio files.
 */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 0.8);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playLaneShift(direction: -1 | 1): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    const startFreq = direction > 0 ? 280 : 340;
    const endFreq = direction > 0 ? 440 : 210;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playJump(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(210, now);
    osc1.frequency.exponentialRampToValueAtTime(640, now + 0.16);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(420, now);
    osc2.frequency.exponentialRampToValueAtTime(980, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.21);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.22);
    osc2.stop(now + 0.22);
  }

  public playCoin(streak = 0): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const semitoneShift = Math.min(streak, 8) * 0.5;
    const pitchFactor = Math.pow(2, semitoneShift / 12);
    const notes = [880 * pitchFactor, 1318.51 * pitchFactor];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t0 = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.03, t0 + 0.14);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.19);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
  }

  public playSpeedUp(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const t = now + i * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.075, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playCrash(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Sub-bass impact drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(150, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.45);

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(520, now);
    subFilter.frequency.exponentialRampToValueAtTime(75, now + 0.45);

    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.52);

    // 2. Filtered metallic noise burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1100, now);
      bandpass.frequency.exponentialRampToValueAtTime(180, now + 0.42);
      bandpass.Q.setValueAtTime(1.2, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.26, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      noise.connect(bandpass);
      bandpass.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.48);
    }

    // 3. Dissonant power-down synth
    const downOsc = this.ctx.createOscillator();
    const downGain = this.ctx.createGain();
    downOsc.type = 'square';
    downOsc.frequency.setValueAtTime(310, now);
    downOsc.frequency.exponentialRampToValueAtTime(55, now + 0.38);
    downGain.gain.setValueAtTime(0.08, now);
    downGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    downOsc.connect(downGain);
    downGain.connect(this.ctx.destination);
    downOsc.start(now);
    downOsc.stop(now + 0.42);
  }
}
