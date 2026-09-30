import type { SynthLike } from "./performer";

export class SynthError extends Error {}

export async function fetchSoundFont(url: string, fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  let res: Response;
  try { res = await fetchImpl(url); } catch (e) { throw new SynthError(`Could not download the guitar sound (${url}): ${(e as Error).message}`); }
  if (!res.ok) throw new SynthError(`Could not download the guitar sound (${url}): HTTP ${res.status}`);
  return res.arrayBuffer();
}

export interface Backend {
  noteOn(channel: number, midi: number, velocity: number): void;
  noteOff(channel: number, midi: number): void;
}

const CHANNEL = 0;

export class WebSynth implements SynthLike {
  sounding = new Set<number>();
  private chord: number[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private backend: Backend) {}

  noteOn(midi: number, velocity = 100): void { this.backend.noteOn(CHANNEL, midi, velocity); this.sounding.add(midi); }
  noteOff(midi: number): void { this.backend.noteOff(CHANNEL, midi); this.sounding.delete(midi); }

  /** Release the previous chord, then strum `midis` low to high. */
  playChord(midis: number[], velocity = 100, staggerS = 0.015): void {
    this.stopPending();
    for (const m of this.chord) this.noteOff(m);
    this.chord = [...midis];
    [...midis].sort((a, b) => a - b).forEach((m, i) => {
      const delay = i * staggerS;
      if (delay <= 0) { this.noteOn(m, velocity); return; }
      const t = setTimeout(() => { this.timers.delete(t); this.noteOn(m, velocity); }, delay * 1000);
      this.timers.add(t);
    });
  }

  stopPending(): void { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  stopAll(): void {
    this.stopPending();
    for (const m of [...this.sounding]) this.noteOff(m);
    this.chord = [];
  }
}

/** Browser only: load the SoundFont into a SpessaSynth worklet synthesizer. */
export async function createWebSynth(ctx: AudioContext, sfUrl: string): Promise<WebSynth> {
  const [{ WorkletSynthesizer }, sf] = await Promise.all([import("spessasynth_lib"), fetchSoundFont(sfUrl)]);
  try {
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}spessasynth_processor.min.js`);
    const synth = new WorkletSynthesizer(ctx);
    synth.connect(ctx.destination); // the library does not connect its output itself: without this the site is silent
    await synth.soundBankManager.addSoundBank(sf, "guitar");
    await synth.isReady;
    synth.programChange(CHANNEL, 0);
    return new WebSynth({
      noteOn: (c, m, v) => synth.noteOn(c, m, v),
      noteOff: (c, m) => synth.noteOff(c, m),
    });
  } catch (e) {
    throw new SynthError(`Could not start the guitar synthesizer: ${(e as Error).message}`);
  }
}
