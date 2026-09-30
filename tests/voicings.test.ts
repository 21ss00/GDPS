import { expect, test } from "vitest";
import { chordLibrary, minFret, voicingMidi, type Voicing } from "../src/voicings";

const INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], "5": [0, 7],
};

test("open E major midi", () => {
  const v: Voicing = { name: "E", rootPc: 4, quality: "maj", frets: [0, 2, 2, 1, 0, 0] };
  expect(voicingMidi(v)).toEqual([40, 47, 52, 56, 59, 64]);
});
test("muted strings are skipped", () => {
  const v: Voicing = { name: "Am", rootPc: 9, quality: "min", frets: [null, 0, 2, 2, 1, 0] };
  expect(voicingMidi(v)).toEqual([45, 52, 57, 60, 64]);
});
test("minFret ignores open strings", () => {
  expect(minFret({ name: "E", rootPc: 4, quality: "maj", frets: [0, 2, 2, 1, 0, 0] })).toBe(1);
  expect(minFret({ name: "Em", rootPc: 4, quality: "min", frets: [0, 0, 0, 0, 0, 0] })).toBe(0);
});
test("every voicing is well formed and matches its quality", () => {
  for (const v of chordLibrary()) {
    expect(v.frets).toHaveLength(6);
    const notes = voicingMidi(v);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    const rel = new Set(notes.map((n) => (((n - v.rootPc) % 12) + 12) % 12));
    for (const r of rel) expect(INTERVALS[v.quality], v.name).toContain(r);
    expect(rel.has(0), `${v.name} lacks root`).toBe(true);
  }
});
test("all 12 roots x 8 qualities exist", () => {
  const have = new Set(chordLibrary().map((v) => `${v.rootPc}:${v.quality}`));
  for (let r = 0; r < 12; r++) for (const q of Object.keys(INTERVALS)) expect(have.has(`${r}:${q}`), `${r}:${q}`).toBe(true);
});
test("names are unique and no voicing goes above fret 15", () => {
  const lib = chordLibrary();
  expect(new Set(lib.map((v) => v.name)).size).toBe(lib.length);
  for (const v of lib) expect(Math.max(...v.frets.filter((f): f is number => f !== null))).toBeLessThanOrEqual(15);
});
