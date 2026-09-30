import { cfg } from "./config";
import { hann, rfftMag, rms } from "./dsp";

const FRAME = 1024;
const LOG_GAIN = 20;
const RECENT_BLOCKS = 8; // ~90 ms of flux history
const JUMP_RATIO = 2.0;
const FLUX_FLOOR = 20.0;
const BAND_HZ: [number, number] = [80, 3000];
const WARMUP_BLOCKS = 3;
const REFRACTORY_S = 0.08; // merges the strings of a strum into one onset

export class OnsetDetector {
  private readonly window = hann(FRAME);
  private readonly lo: number;
  private readonly hi: number;
  private readonly refractory: number;
  private buf = new Float32Array(FRAME);
  private prev = new Float64Array(FRAME / 2 + 1);
  private recent: number[] = [];
  private seen = 0;
  private cooldown = 0;

  constructor(readonly sr = 44100, readonly block = 512) {
    this.lo = Math.floor((BAND_HZ[0] * FRAME) / sr);
    this.hi = Math.floor((BAND_HZ[1] * FRAME) / sr);
    this.refractory = Math.max(1, Math.round((REFRACTORY_S * sr) / block));
  }

  reset(): void {
    this.buf = new Float32Array(FRAME);
    this.prev = new Float64Array(FRAME / 2 + 1);
    this.recent = [];
    this.seen = 0;
    this.cooldown = 0;
  }

  /** Feed one block; true if a new note/strum attack begins in it. */
  process(block: Float32Array): boolean {
    const n = block.length;
    this.buf.copyWithin(0, n);
    this.buf.set(block, FRAME - n);
    const x = new Float64Array(FRAME);
    for (let i = 0; i < FRAME; i++) x[i] = this.buf[i] * this.window[i];
    const mag = rfftMag(x, FRAME);
    let flux = 0;
    for (let k = 0; k < mag.length; k++) {
      const lm = Math.log1p(mag[k] * LOG_GAIN);
      if (k >= this.lo && k < this.hi) flux += Math.max(0, lm - this.prev[k]);
      this.prev[k] = lm;
    }
    const recentMean = this.recent.length ? this.recent.reduce((a, b) => a + b, 0) / this.recent.length : 0;
    const threshold = Math.max(FLUX_FLOOR, JUMP_RATIO * recentMean);
    this.recent.push(flux);
    if (this.recent.length > RECENT_BLOCKS) this.recent.shift();
    this.seen++;

    if (this.seen <= WARMUP_BLOCKS) return false;
    if (this.cooldown > 0) { this.cooldown--; return false; }
    if (rms(block) > cfg.noiseGateRms && flux > threshold) {
      this.cooldown = this.refractory;
      return true;
    }
    return false;
  }
}
