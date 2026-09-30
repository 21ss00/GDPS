import { expect, test } from "vitest";
import type { Candidate } from "../src/analyzer";
import { cfg } from "../src/config";
import { fuse } from "../src/fusion";
import { NO_HAND, type HandPrior } from "../src/vision-core";
import { chordLibrary, voicingMidi } from "../src/voicings";

const LIB = new Map(chordLibrary().map((v) => [v.name, v]));
const chord = (name: string, conf: number): Candidate => ({ kind: "chord", midi: voicingMidi(LIB.get(name)!), name, confidence: conf, voicing: LIB.get(name)! });
const note = (midi: number, conf: number, name = "x"): Candidate => ({ kind: "note", midi: [midi], name, confidence: conf });
const hand = (fret: number | null): HandPrior => ({ present: true, fret, landmarks: [] });

test("no candidates, or below min confidence, gives null", () => {
  expect(fuse([], NO_HAND)).toBeNull();
  expect(fuse([note(64, cfg.minConfidence - 0.01)], NO_HAND)).toBeNull();
});
test("without a hand the audio winner wins", () => {
  const e = fuse([chord("E", 0.95), chord("E@12", 0.94)], NO_HAND)!;
  expect([e.name, e.kind, e.confidence]).toEqual(["E", "chord", 0.95]);
});
test("the prior breaks a near tie toward the fret region", () => {
  const a = chord("E", 0.95), b = chord("E@12", 0.94);
  expect(fuse([a, b], hand(0.5))!.name).toBe("E");
  expect(fuse([a, b], hand(12))!.name).toBe("E@12");
});
test("the prior cannot overturn a clear audio winner or promote a weak candidate", () => {
  expect(fuse([chord("E", 0.95), chord("E@12", 0.8)], hand(12))!.name).toBe("E");
  expect(fuse([chord("E", 0.6), chord("E@12", cfg.minConfidence - 0.02)], hand(12))!.name).toBe("E");
  expect(fuse([chord("E@12", cfg.minConfidence - 0.02)], hand(12))).toBeNull();
});
test("the prior can pick the octave for a note", () => {
  const low = note(52, 0.9, "E3"), high = note(64, 0.89, "E4");
  expect(fuse([low, high], hand(12))!.name).toBe("E3");
  expect(fuse([low, high], hand(0))!.name).toBe("E4");
});
test("a hand with no fret is ignored", () => {
  expect(fuse([chord("E", 0.95), chord("E@12", 0.94)], hand(null))!.name).toBe("E");
});
