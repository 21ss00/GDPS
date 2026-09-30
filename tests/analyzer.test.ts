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
