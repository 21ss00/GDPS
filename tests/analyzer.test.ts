import { expect, test } from "vitest";
import { MIDI_MAX, MIDI_MIN } from "../src/config";
import { analyze, estimatePitch } from "../src/analyzer";
import { SR, midiToHz, noise, pluck, withNoise } from "./signals";

const NOTE_WINDOW = Math.floor(0.05 * SR);

test("every note in range is identified as a single note", () => {
  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    const c = analyze(pluck(m).subarray(0, NOTE_WINDOW), SR);
    expect(c.length, `no candidate for ${m}`).toBeGreaterThan(0);
    expect(c[0].kind, String(m)).toBe("note");
    expect(c[0].midi, String(m)).toEqual([m]);
  }
});
test("pitch is accurate in Hz with high confidence", () => {
  const [hz, conf] = estimatePitch(pluck(52).subarray(0, NOTE_WINDOW), SR);
  expect(Math.abs(hz - midiToHz(52)) / midiToHz(52)).toBeLessThan(0.01);
  expect(conf).toBeGreaterThan(0.8);
});
test("silence, white noise and quiet room noise give nothing", () => {
  expect(analyze(new Float32Array(NOTE_WINDOW), SR)).toEqual([]);
  expect(analyze(noise(0.05, 0.05, 0).subarray(0, NOTE_WINDOW), SR)).toEqual([]);
  expect(analyze(noise(0.001, 0.05, 3).subarray(0, NOTE_WINDOW), SR)).toEqual([]);
});
test("notes survive 10 dB noise", () => {
  for (let m = 52; m < 77; m += 3) {
    const c = analyze(withNoise(pluck(m), 10).subarray(0, NOTE_WINDOW), SR);
    expect(c[0]?.midi, String(m)).toEqual([m]);
  }
});
test("a too-short window gives nothing instead of crashing", () => {
  expect(analyze(pluck(52).subarray(0, 200), SR)).toEqual([]);
});
test("candidate fields", () => {
  const c = analyze(pluck(64).subarray(0, NOTE_WINDOW), SR)[0];
  expect(c.name).toBe("E4");
  expect(c.confidence).toBeGreaterThan(0); expect(c.confidence).toBeLessThanOrEqual(1);
  expect(c.voicing).toBeUndefined();
});

// ---- chords (Task 6) ----
import { cfg } from "../src/config";
import { chordLibrary, voicingMidi } from "../src/voicings";
import { strum } from "./signals";

const CHORD_WINDOW = Math.floor(0.2 * SR);
const LIB = new Map(chordLibrary().map((v) => [v.name, v]));
const TEST_CHORDS = ["E", "A", "D", "G", "C", "Am", "Em", "Dm", "F@1", "B7", "Cmaj7", "Asus2"];
const chordAudio = (name: string, snr?: number) => {
  const x = strum(voicingMidi(LIB.get(name)!));
  return (snr === undefined ? x : withNoise(x, snr)).subarray(0, CHORD_WINDOW);
};

test("chord root and quality are identified", () => {
  for (const name of TEST_CHORDS) {
    const c = analyze(chordAudio(name), SR);
    expect(c[0]?.kind, name).toBe("chord");
    const want = LIB.get(name)!, got = c[0].voicing!;
    expect([got.rootPc, got.quality], `${name} -> ${got.name}`).toEqual([want.rootPc, want.quality]);
  }
});
test("the exact voicing is within the top five", () => {
  for (const name of TEST_CHORDS) {
    const names = analyze(chordAudio(name), SR).slice(0, 5).map((c) => c.voicing!.name);
    expect(names, name).toContain(name);
  }
});
test("chords survive 10 dB noise", () => {
  for (const name of ["E", "Am", "G", "D", "C", "Em"]) {
    const c = analyze(chordAudio(name, 10), SR), want = LIB.get(name)!;
    expect(c[0]?.kind, name).toBe("chord");
    expect([c[0].voicing!.rootPc, c[0].voicing!.quality], name).toEqual([want.rootPc, want.quality]);
  }
});
// A power chord (root + fifth) is nearly indistinguishable from the matching major shape. Measured over 30 pluck
// seeds in the Python reference: open E5 gets the right root 30/30 but root+quality only 22/30.
test("an open power chord gets the right root (its quality is ambiguous)", () => {
  const c = analyze(chordAudio("E5"), SR);
  expect(c[0]?.kind).toBe("chord");
  expect(c[0].voicing!.rootPc).toBe(LIB.get("E5")!.rootPc);
});
test("a single note never returns a chord, at either window length", () => {
  for (const m of [40, 45, 52, 59, 64, 71, 76, 88])
    for (const n of [NOTE_WINDOW, CHORD_WINDOW]) {
      const c = analyze(pluck(m).subarray(0, n), SR);
      expect(c.length, `${m}/${n}`).toBeGreaterThan(0);
      expect(c.every((x) => x.kind === "note"), `${m}/${n}`).toBe(true);
    }
});
test("chord candidates carry their voicing's midi and a real confidence", () => {
  const c = analyze(chordAudio("Am"), SR)[0];
  expect(c.midi).toEqual(voicingMidi(c.voicing!));
  expect(c.confidence).toBeGreaterThanOrEqual(cfg.minConfidence);
});
test("room noise gives no chord", () => {
  expect(analyze(noise(0.05, 0.2, 5).subarray(0, CHORD_WINDOW), SR)).toEqual([]);
});
