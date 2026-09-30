import { CLEAN_NOTE_CONF, analyze, type Candidate } from "./analyzer";
import { fuse, type Event } from "./fusion";
import { OnsetDetector } from "./onset";
import { NO_HAND, type HandPrior } from "./vision-core";

const NOTE_DELAY_S = 0.05; // wait after an onset before the single-note analysis
const CHORD_DELAY_S = 0.18; // wait before the chord analysis
const KEEP_S = 1.0; // audio history kept

/** Block-driven detection state machine. No devices: live mode and tests share it. */
export class Engine {
  lastLatencyS: number | null = null;
  private readonly onset: OnsetDetector;
  private buf = new Float32Array(0);
  private bufStart = 0; // absolute index of buf[0]
  private total = 0; // samples seen
  private t0: number | null = null; // absolute index of the pending onset's block
  private stage: "idle" | "note" | "chord" = "idle";

  constructor(readonly sr = 44100, readonly block = 512, private priorSource: () => HandPrior = () => NO_HAND) {
    this.onset = new OnsetDetector(sr, block);
  }

  get bufferedSamples(): number { return this.buf.length; }

  process(block: Float32Array): Event[] {
    this.append(block);
    if (this.onset.process(block)) {
      this.t0 = this.total - block.length;
      this.stage = "note"; // a new onset always supersedes whatever was pending
    }
    if (this.stage === "idle" || this.t0 === null) return [];

    const elapsed = this.total - this.t0;
    if (this.stage === "note" && elapsed >= Math.floor(NOTE_DELAY_S * this.sr)) {
      const cands = analyze(this.window(Math.floor(NOTE_DELAY_S * this.sr)), this.sr);
      if (cands.length && cands[0].kind === "note" && cands[0].confidence >= CLEAN_NOTE_CONF) return this.emit(cands, elapsed);
      this.stage = "chord";
    }
    if (this.stage === "chord" && elapsed >= Math.floor(CHORD_DELAY_S * this.sr)) {
      return this.emit(analyze(this.window(elapsed), this.sr), elapsed);
    }
    return [];
  }

  private append(block: Float32Array): void {
    const merged = new Float32Array(this.buf.length + block.length);
    merged.set(this.buf); merged.set(block, this.buf.length);
    this.buf = merged;
    this.total += block.length;
    let keepFrom = this.total - Math.floor(KEEP_S * this.sr);
    if (this.t0 !== null) keepFrom = Math.min(keepFrom, this.t0);
    const drop = keepFrom - this.bufStart;
    if (drop > 0) { this.buf = this.buf.slice(drop); this.bufStart += drop; }
  }

  private window(length: number): Float32Array {
    const start = (this.t0 as number) - this.bufStart;
    return this.buf.subarray(start, start + length);
  }

  private emit(cands: Candidate[], elapsed: number): Event[] {
    this.stage = "idle";
    this.t0 = null; // nothing pending, so the buffer may be trimmed again
    let prior: HandPrior;
    try { prior = this.priorSource(); } catch { prior = NO_HAND; }
    const event = fuse(cands, prior);
    if (!event) return [];
    this.lastLatencyS = elapsed / this.sr;
    return [event];
  }
}
