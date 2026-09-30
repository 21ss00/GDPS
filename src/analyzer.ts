import { MIDI_MAX, MIDI_MIN, cfg } from "./config";
import { rms } from "./dsp";
import { ROOT_NAMES, type Voicing } from "./voicings";

export interface Candidate {
  kind: "note" | "chord";
  midi: number[];
  name: string;
  confidence: number;
  voicing?: Voicing;
}

export const YIN_THRESHOLD = 0.15;
export const MIN_WINDOW = 1800; // samples; two periods of the lowest string
export const CLEAN_NOTE_CONF = 0.85; // YIN confidence at which a window is one clean note

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const noteName = (midi: number) => `${ROOT_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/** YIN pitch estimate limited to the guitar range. Returns [Hz, confidence 0-1]. */
export function estimatePitch(window: Float32Array, sr: number): [number, number] {
  const tauMin = Math.floor(sr / midiToHz(MIDI_MAX + 1));
  const tauMax = Math.floor(sr / midiToHz(MIDI_MIN - 1)) + 2;
  if (window.length < MIN_WINDOW || window.length < 2 * tauMax) return [0, 0];
  const x = window;
  const w = x.length - tauMax;
  // d(tau) = sum_{j<w} (x[j] - x[j+tau])^2
  const d = new Float64Array(tauMax + 1);
  let e0 = 0;
  for (let j = 0; j < w; j++) e0 += x[j] * x[j];
  for (let tau = 1; tau <= tauMax; tau++) {
    let cross = 0, shifted = 0;
    for (let j = 0; j < w; j++) { cross += x[j] * x[j + tau]; shifted += x[j + tau] * x[j + tau]; }
    d[tau] = e0 + shifted - 2 * cross;
  }
  const cmnd = new Float64Array(tauMax + 1).fill(1);
  let cum = 0;
  for (let t = 1; t <= tauMax; t++) { cum += d[t]; cmnd[t] = (d[t] * t) / Math.max(cum, 1e-12); }

  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    tau = tauMin;
    for (let t = tauMin; t < tauMax; t++) if (cmnd[t] < cmnd[tau]) tau = t;
  }
  const conf = Math.min(1, Math.max(0, 1 - cmnd[tau]));
  let tauF = tau;
  if (tau >= 1 && tau < tauMax) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1], denom = a - 2 * b + c;
    const shift = Math.abs(denom) > 1e-12 ? (0.5 * (a - c)) / denom : 0;
    tauF = tau + Math.min(1, Math.max(-1, shift));
  }
  return [sr / tauF, conf];
}

export function analyze(window: Float32Array, sr: number): Candidate[] {
  if (window.length < MIN_WINDOW || rms(window) < cfg.noiseGateRms) return [];
  const [hz, conf] = estimatePitch(window, sr);
  if (hz > 0 && conf >= cfg.minConfidence) {
    const midi = Math.round(hzToMidi(hz));
    if (midi >= MIDI_MIN && midi <= MIDI_MAX) return [{ kind: "note", midi: [midi], name: noteName(midi), confidence: conf }];
  }
  return [];
}
