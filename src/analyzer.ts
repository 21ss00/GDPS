import { MIDI_MAX, MIDI_MIN, cfg } from "./config";
import { hann, median, rfftMag, rms } from "./dsp";
import { ROOT_NAMES, chordLibrary, voicingMidi, type Voicing } from "./voicings";

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

const CHORD_MIN_WINDOW = 6000; // ~136 ms; shorter windows cannot resolve chord tones
const CHROMA_LO_HZ = 75, CHROMA_HI_HZ = 2500;
const PEAK_RATIO = 8.0; // a spectral peak must be this many times above the median
const MIN_PEAKS = 4;
const CHORD_MIN_SCORE = 0.8;
const LOW_ZONE_HZ = 260, LOW_ZONE_WEIGHT = 0.3;
const PARTIALS = 6, PARTIAL_DECAY = 0.9;
const MAX_CHORD_CANDIDATES = 8;
const CHORD_MARGIN = 0.03; // a chord must beat the best single-note explanation by this much

const PARTIAL_OFFSETS = Array.from({ length: PARTIALS }, (_, i) => ({
  offset: Math.round(12 * Math.log2(i + 1)), weight: 1 / (i + 1) ** PARTIAL_DECAY, k: i + 1,
}));

/** (all-partials chroma, low-zone chroma) that a set of struck notes should produce. */
function templateVectors(midis: number[]): [Float64Array, Float64Array] {
  const chroma = new Float64Array(12), low = new Float64Array(12);
  for (const m of midis)
    for (const { offset, weight, k } of PARTIAL_OFFSETS) {
      const pc = (((m + offset) % 12) + 12) % 12;
      chroma[pc] += weight;
      if (midiToHz(m) * k < LOW_ZONE_HZ) low[pc] += weight;
    }
  return [chroma, low];
}
const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => Array.from(a).reduce((s, x, i) => s + x * b[i], 0);
/** Cosine; two empty vectors match, one empty does not. */
function cos0(t: ArrayLike<number>, o: ArrayLike<number>): number {
  const nt = norm(t), no = norm(o);
  if (no === 0) return nt === 0 ? 1 : 0;
  return nt === 0 ? 0 : dot(t, o) / (nt * no);
}

let templates: { voicings: Voicing[]; chroma: Float64Array[]; low: Float64Array[] } | null = null;
function getTemplates() {
  if (!templates) {
    const voicings = chordLibrary();
    const vecs = voicings.map((v) => templateVectors(voicingMidi(v)));
    templates = { voicings, chroma: vecs.map((v) => v[0]), low: vecs.map((v) => v[1]) };
  }
  return templates;
}

export function audioFeatures(window: Float32Array, sr: number): { chroma: Float64Array; low: Float64Array; peaks: number } {
  const nfft = 1 << Math.ceil(Math.log2(Math.max(window.length * 2, 16384)));
  let mean = 0;
  for (const v of window) mean += v;
  mean /= window.length;
  const win = hann(window.length);
  const x = Float64Array.from(window, (v, i) => (v - mean) * win[i]);
  const mag = rfftMag(x, nfft);
  const df = sr / nfft;
  const lo = Math.floor(CHROMA_LO_HZ / df), hi = Math.floor(CHROMA_HI_HZ / df);
  const band = mag.subarray(lo, hi);
  const floor = median(band) + 1e-12;
  const chroma = new Float64Array(12), low = new Float64Array(12);
  let peaks = 0;
  for (let i = 1; i < band.length - 1; i++) {
    if (!(band[i] > band[i - 1] && band[i] >= band[i + 1] && band[i] > PEAK_RATIO * floor)) continue;
    peaks++;
    const hz = (lo + i) * df, weight = band[i] ** 0.7;
    const pc = (((12 * Math.log2(hz / 440) + 9) % 12) + 12) % 12; // C = 0
    const p0 = Math.floor(pc) % 12, frac = pc - Math.floor(pc);
    for (const vec of hz < LOW_ZONE_HZ ? [chroma, low] : [chroma]) {
      vec[p0] += weight * (1 - frac); // split between neighbouring pitch classes
      vec[(p0 + 1) % 12] += weight * frac;
    }
  }
  return { chroma, low, peaks };
}

export function matchChords(chroma: Float64Array, low: Float64Array): Candidate[] {
  if (!chroma.some((v) => v > 0)) return [];
  const t = getTemplates();
  const scores = t.voicings.map((_, i) => (1 - LOW_ZONE_WEIGHT) * cos0(t.chroma[i], chroma) + LOW_ZONE_WEIGHT * cos0(t.low[i], low));
  return scores
    .map((s, i) => [s, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_CHORD_CANDIDATES)
    .map(([s, i]) => ({
      kind: "chord" as const, midi: voicingMidi(t.voicings[i]), name: t.voicings[i].name,
      confidence: Math.min(1, Math.max(0, s)), voicing: t.voicings[i],
    }));
}

/** How well the chroma is explained by one note (and its overtones) alone. */
export function singleNoteScore(chroma: Float64Array, midi: number): number {
  return chroma.some((v) => v > 0) ? cos0(templateVectors([midi])[0], chroma) : 0;
}

export function analyze(window: Float32Array, sr: number): Candidate[] {
  if (window.length < MIN_WINDOW || rms(window) < cfg.noiseGateRms) return [];
  const [hz, conf] = estimatePitch(window, sr);
  let note: Candidate | null = null;
  if (hz > 0 && conf >= cfg.minConfidence) {
    const midi = Math.round(hzToMidi(hz));
    if (midi >= MIDI_MIN && midi <= MIDI_MAX) note = { kind: "note", midi: [midi], name: noteName(midi), confidence: conf };
  }
  if (window.length >= CHORD_MIN_WINDOW) {
    const { chroma, low, peaks } = audioFeatures(window, sr);
    const chords = peaks >= MIN_PEAKS ? matchChords(chroma, low).filter((c) => c.confidence >= CHORD_MIN_SCORE) : [];
    if (chords.length) {
      if (note === null || conf < CLEAN_NOTE_CONF) return chords;
      if (chords[0].confidence > singleNoteScore(chroma, note.midi[0]) + CHORD_MARGIN) return chords;
    }
  }
  return note ? [note] : [];
}
