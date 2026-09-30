import { expect, test } from "vitest";
import { BLOCK_SIZE, MIDI_MAX, MIDI_MIN, SAMPLE_RATE, TUNING_MIDI, cfg } from "../src/config";

test("tuning is E standard", () => expect([...TUNING_MIDI]).toEqual([40, 45, 50, 55, 59, 64]));
test("block is under 15 ms", () => expect(BLOCK_SIZE / SAMPLE_RATE).toBeLessThan(0.015));
test("range is ordered", () => expect(MIDI_MIN).toBeLessThan(MIDI_MAX));
test("thresholds match the desktop app", () => {
  expect(cfg.noiseGateRms).toBe(0.004);
  expect(cfg.minConfidence).toBe(0.55);
});
