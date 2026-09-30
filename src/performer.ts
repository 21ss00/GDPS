import type { Event } from "./fusion";

export interface SynthLike {
  noteOn(midi: number, velocity?: number): void;
  noteOff(midi: number): void;
  playChord(midis: number[], velocity?: number, staggerS?: number): void;
  stopPending(): void;
}

const FEEDBACK_WINDOW_S = 0.35; // speaker mode: a same-pitch event this soon is our own output
const QUIET_RELEASE_S = 0.25; // guitar must be quiet this long before notes are released
const MAX_HOLD_S = 6.0;

export class Performer {
  current: Event | null = null;
  speakerMode: boolean;
  private readonly releaseLevel: number;
  private playedAt = 0; private quietFor = 0; private heldFor = 0;

  constructor(private synth: SynthLike, opts: { speakerMode?: boolean; releaseLevel?: number } = {}) {
    this.speakerMode = opts.speakerMode ?? false;
    this.releaseLevel = opts.releaseLevel ?? 0.006;
  }

  /** Play an event. Returns false if dropped as a speaker-feedback echo. */
  handle(event: Event, nowS: number): boolean {
    const cur = this.current;
    if (this.speakerMode && cur && nowS - this.playedAt < FEEDBACK_WINDOW_S
        && cur.midi.length === event.midi.length && cur.midi.every((m, i) => m === event.midi[i])) return false;
    this.release(); // release FIRST, so a shared pitch is not silenced right after it starts
    if (event.kind === "chord") this.synth.playChord(event.midi);
    else this.synth.noteOn(event.midi[0]);
    this.current = event;
    this.playedAt = nowS;
    this.quietFor = this.heldFor = 0;
    return true;
  }

  /** Call once per audio block with the mic level; releases notes when playing stops. */
  tick(level: number, dt: number): void {
    if (!this.current) return;
    this.heldFor += dt;
    this.quietFor = level < this.releaseLevel ? this.quietFor + dt : 0;
    if (this.quietFor >= QUIET_RELEASE_S || this.heldFor >= MAX_HOLD_S) this.release();
  }

  private release(): void {
    if (!this.current) return;
    this.synth.stopPending();
    for (const m of this.current.midi) this.synth.noteOff(m);
    this.current = null;
  }
}
