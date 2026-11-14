/**
 * Sons sintetizados via WebAudio (sem arquivos de áudio externos, sem
 * problemas de licença). Respeita a configuração "som ativado".
 */
export class SoundFx {
  private ctx: AudioContext | null = null;
  private lastPlay = new Map<string, number>();
  enabled = true;
  volume = 0.25;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** Toca um tom curto. Limita a frequência por tipo de som para evitar ruído. */
  play(kind: 'pop' | 'hit' | 'power' | 'win' | 'coin' | 'boom', minGapMs = 60): void {
    const ac = this.ensure();
    if (!ac) return;
    const now = performance.now();
    if ((this.lastPlay.get(kind) ?? 0) + minGapMs > now) return;
    this.lastPlay.set(kind, now);
    const presets: Record<string, { f0: number; f1: number; dur: number; type: OscillatorType }> = {
      pop: { f0: 520, f1: 880, dur: 0.08, type: 'triangle' },
      hit: { f0: 220, f1: 90, dur: 0.12, type: 'square' },
      power: { f0: 300, f1: 1200, dur: 0.35, type: 'sawtooth' },
      win: { f0: 523, f1: 1046, dur: 0.6, type: 'triangle' },
      coin: { f0: 988, f1: 1319, dur: 0.12, type: 'square' },
      boom: { f0: 140, f1: 40, dur: 0.45, type: 'sawtooth' },
    };
    const p = presets[kind]!;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0, t);
    osc.frequency.exponentialRampToValueAtTime(p.f1, t + p.dur);
    gain.gain.setValueAtTime(this.volume * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
