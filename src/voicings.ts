import { TUNING_MIDI } from "./config";

export type Quality = "maj" | "min" | "7" | "maj7" | "m7" | "sus2" | "sus4" | "5";
export type Frets = (number | null)[];
export interface Voicing { name: string; rootPc: number; quality: Quality; frets: Frets }

export const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SUFFIX: Record<Quality, string> = {
  maj: "", min: "m", "7": "7", maj7: "maj7", m7: "m7", sus2: "sus2", sus4: "sus4", "5": "5",
};

export function voicingMidi(v: Voicing): number[] {
  const out: number[] = [];
  v.frets.forEach((f, i) => { if (f !== null) out.push(TUNING_MIDI[i] + f); });
  return out.sort((a, b) => a - b);
}

export function minFret(v: Voicing): number {
  const fretted = v.frets.filter((f): f is number => !!f);
  return fretted.length ? Math.min(...fretted) : 0;
}

const N = null;
const OPEN: [number, [Quality, Frets][]][] = [
  [4, [["maj", [0, 2, 2, 1, 0, 0]], ["min", [0, 2, 2, 0, 0, 0]], ["7", [0, 2, 0, 1, 0, 0]], ["m7", [0, 2, 0, 0, 0, 0]],
       ["maj7", [0, 2, 1, 1, 0, 0]], ["sus4", [0, 2, 2, 2, 0, 0]], ["5", [0, 2, 2, N, N, N]]]],
  [9, [["maj", [N, 0, 2, 2, 2, 0]], ["min", [N, 0, 2, 2, 1, 0]], ["7", [N, 0, 2, 0, 2, 0]], ["m7", [N, 0, 2, 0, 1, 0]],
       ["maj7", [N, 0, 2, 1, 2, 0]], ["sus2", [N, 0, 2, 2, 0, 0]], ["sus4", [N, 0, 2, 2, 3, 0]], ["5", [N, 0, 2, 2, N, N]]]],
  [2, [["maj", [N, N, 0, 2, 3, 2]], ["min", [N, N, 0, 2, 3, 1]], ["7", [N, N, 0, 2, 1, 2]], ["m7", [N, N, 0, 2, 1, 1]],
       ["maj7", [N, N, 0, 2, 2, 2]], ["sus2", [N, N, 0, 2, 3, 0]], ["sus4", [N, N, 0, 2, 3, 3]], ["5", [N, N, 0, 2, 3, N]]]],
  [7, [["maj", [3, 2, 0, 0, 0, 3]], ["7", [3, 2, 0, 0, 0, 1]], ["maj7", [3, 2, 0, 0, 0, 2]]]],
  [0, [["maj", [N, 3, 2, 0, 1, 0]], ["maj7", [N, 3, 2, 0, 0, 0]], ["7", [N, 3, 2, 3, 1, 0]]]],
  [11, [["7", [N, 2, 1, 2, 0, 2]]]],
];
const E_SHAPE: [Quality, Frets][] = [
  ["maj", [0, 2, 2, 1, 0, 0]], ["min", [0, 2, 2, 0, 0, 0]], ["7", [0, 2, 0, 1, 0, 0]], ["m7", [0, 2, 0, 0, 0, 0]],
  ["maj7", [0, 2, 1, 1, 0, 0]], ["sus4", [0, 2, 2, 2, 0, 0]], ["5", [0, 2, 2, N, N, N]],
];
const A_SHAPE: [Quality, Frets][] = [
  ["maj", [N, 0, 2, 2, 2, 0]], ["min", [N, 0, 2, 2, 1, 0]], ["7", [N, 0, 2, 0, 2, 0]], ["m7", [N, 0, 2, 0, 1, 0]],
  ["maj7", [N, 0, 2, 1, 2, 0]], ["sus2", [N, 0, 2, 2, 0, 0]], ["sus4", [N, 0, 2, 2, 3, 0]], ["5", [N, 0, 2, 2, N, N]],
];

const name = (rootPc: number, q: Quality, at?: number) => ROOT_NAMES[rootPc] + SUFFIX[q] + (at === undefined ? "" : `@${at}`);
const shift = (f: Frets, by: number): Frets => f.map((x) => (x === null ? null : x + by));

let cache: Voicing[] | null = null;
export function chordLibrary(): Voicing[] {
  if (cache) return [...cache];
  const out: Voicing[] = [];
  for (const [rootPc, shapes] of OPEN) for (const [q, frets] of shapes) out.push({ name: name(rootPc, q), rootPc, quality: q, frets });
  for (let fret = 1; fret <= 12; fret++) {
    for (const [basePc, shapes] of [[4, E_SHAPE], [9, A_SHAPE]] as const) {
      const rootPc = (basePc + fret) % 12;
      for (const [q, frets] of shapes) out.push({ name: name(rootPc, q, fret), rootPc, quality: q, frets: shift(frets, fret) });
    }
  }
  cache = out;
  return [...out];
}
