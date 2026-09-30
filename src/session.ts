import { MicError, checkSampleRate } from "./audioIn";
import { BLOCK_SIZE, SAMPLE_RATE } from "./config";
import { rms } from "./dsp";
import { Engine } from "./engine";
import type { Event } from "./fusion";
import { Performer, type SynthLike } from "./performer";
import type { HandPrior } from "./vision-core";

export interface AudioCtxLike {
  sampleRate: number;
  baseLatency?: number;
  outputLatency?: number;
  resume(): Promise<void>;
  close(): Promise<void>;
}
export interface MicHandle { stop(): void; label: string; inputLatencyMs: number; deviceId?: string }
export type StoppableSynth = SynthLike & { stopAll(): void };

export interface SessionDeps {
  /** rate undefined = let the browser choose its default */
  createContext(sampleRate: number | undefined): Promise<AudioCtxLike>;
  createSynth(ctx: AudioCtxLike): Promise<StoppableSynth>;
  startMic(ctx: AudioCtxLike, deviceId: string | undefined, onBlock: (b: Float32Array) => void): Promise<MicHandle>;
}
export interface SessionHooks {
  onEvent(event: Event, decisionMs: number): void;
  onLevel(level: number): void;
  getPrior(): HandPrior;
}

/**
 * Owns the audio context, synth, microphone and detection engine, so the page code stays thin:
 * a failed start keeps what already loaded, a retry reuses it, changing the mic restarts capture,
 * and stop() releases everything.
 */
export class Session {
  engine: Engine | null = null;
  private ctx: AudioCtxLike | null = null;
  private synth: StoppableSynth | null = null;
  private mic: MicHandle | null = null;
  private performer: Performer | null = null;
  private triedDefaultRate = false;

  constructor(private deps: SessionDeps, private hooks: SessionHooks, private now: () => number = () => performance.now()) {}

  get synthHandle(): StoppableSynth | null { return this.synth; }
  get audioContext(): AudioCtxLike | null { return this.ctx; }

  /** Browser audio path: context + output latency and the mic's own input latency, in ms. */
  get audioPathMs(): number {
    return ((this.ctx?.baseLatency ?? 0) + (this.ctx?.outputLatency ?? 0)) * 1000 + (this.mic?.inputLatencyMs ?? 0);
  }

  /** Create the context and load the synth (idempotent; a retry reuses what already loaded). */
  async prepare(rate: number | undefined): Promise<void> { // no default: undefined must mean "browser default"
    if (this.ctx && this.synth) return;
    const ctx = await this.deps.createContext(rate);
    try {
      await ctx.resume();
      this.synth = await this.deps.createSynth(ctx);
    } catch (e) {
      this.synth = null;
      await ctx.close().catch(() => {});
      throw e;
    }
    this.ctx = ctx;
  }

  async startListening(deviceId?: string): Promise<{ label: string; rateWarning: string | null; deviceId?: string }> {
    await this.prepare(SAMPLE_RATE);
    let mic: MicHandle;
    try {
      mic = await this.openMic(deviceId);
    } catch (e) {
      // some browsers cannot capture the mic into a context forced to 44.1 kHz: retry once at the default rate
      if (e instanceof MicError && e.code === "capture-setup" && !this.triedDefaultRate) {
        this.triedDefaultRate = true;
        await this.teardownAudio();
        await this.prepare(undefined);
        mic = await this.openMic(deviceId);
      } else throw e;
    }
    this.mic = mic;
    return { label: mic.label, rateWarning: checkSampleRate(this.ctx as AudioCtxLike), deviceId: mic.deviceId };
  }

  /** Restart capture on another input. The old capture keeps running if the new one cannot start. */
  async switchMic(deviceId: string | undefined): Promise<MicHandle> {
    if (!this.ctx) throw new Error("not started");
    const next = await this.openMic(deviceId);
    const old = this.mic;
    this.mic = next;
    old?.stop();
    return next;
  }

  async stop(): Promise<void> {
    this.mic?.stop();
    this.mic = null;
    await this.teardownAudio();
  }

  private async teardownAudio(): Promise<void> {
    this.synth?.stopAll();
    const ctx = this.ctx;
    this.synth = null; this.ctx = null; this.engine = null; this.performer = null;
    if (ctx) await ctx.close().catch(() => {});
  }

  private openMic(deviceId: string | undefined): Promise<MicHandle> {
    const ctx = this.ctx as AudioCtxLike;
    if (!this.engine) {
      this.engine = new Engine(ctx.sampleRate, BLOCK_SIZE, this.hooks.getPrior);
      this.performer = new Performer(this.synth as StoppableSynth, { speakerMode: false });
    }
    return this.deps.startMic(ctx, deviceId, this.onBlock);
  }

  private onBlock = (block: Float32Array): void => {
    const engine = this.engine, performer = this.performer, ctx = this.ctx;
    if (!engine || !performer || !ctx) return;
    const level = rms(block);
    this.hooks.onLevel(level);
    for (const event of engine.process(block)) {
      if (performer.handle(event, this.now() / 1000)) this.hooks.onEvent(event, (engine.lastLatencyS ?? 0) * 1000);
    }
    performer.tick(level, block.length / ctx.sampleRate);
  };
}
