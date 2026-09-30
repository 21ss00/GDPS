import { expect, test } from "vitest";
import { Engine } from "../src/engine";
import type { Event } from "../src/fusion";
import { NO_HAND } from "../src/vision-core";
import { chordLibrary, voicingMidi } from "../src/voicings";
import { SR, blocks, noise, pluck, silenceThen, strum } from "./signals";

// Open and barre shapes of one chord share their pitch classes, so audio only pins down root+quality: "Am@5" is an Am.
const base = (name: string) => name.split("@")[0];
const LIB = new Map(chordLibrary().map((v) => [v.name, v]));
function run(x: Float32Array, engine = new Engine(SR, 512), tailS = 0.6): [number, Event][] {
  const full = new Float32Array(x.length + Math.floor(tailS * SR)); full.set(x);
  const out: [number, Event][] = [];
  blocks(full).forEach((b, i) => { for (const e of engine.process(b)) out.push([((i + 1) * 512) / SR, e]); });
  return out;
}
const cat = (...xs: Float32Array[]) => { const o = new Float32Array(xs.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };

test("a pluck fires one note quickly", () => {
  const ev = run(silenceThen(pluck(52), 0.5));
  expect(ev).toHaveLength(1);
  const [t, e] = ev[0];
  expect([e.kind, e.midi]).toEqual(["note", [52]]);
  expect(t).toBeGreaterThanOrEqual(0.5 + 0.03); expect(t).toBeLessThanOrEqual(0.5 + 0.09);
});
test("a strum fires one chord inside the chord budget", () => {
  const ev = run(silenceThen(strum(voicingMidi(LIB.get("Am")!)), 0.5));
  expect(ev).toHaveLength(1);
  expect([ev[0][1].kind, base(ev[0][1].name)]).toEqual(["chord", "Am"]);
  expect(ev[0][0]).toBeGreaterThanOrEqual(0.5 + 0.15); expect(ev[0][0]).toBeLessThanOrEqual(0.5 + 0.25);
});
test("silence and room noise fire nothing", () => {
  expect(run(new Float32Array(SR * 2))).toEqual([]);
  expect(run(noise(0.002, 2, 2))).toEqual([]);
});
test("two plucks fire two events; two strums fire two chords", () => {
  expect(run(cat(silenceThen(pluck(52, 0.5), 0.3), pluck(59, 1.0))).map(([, e]) => e.midi)).toEqual([[52], [59]]);
  const e = voicingMidi(LIB.get("E")!), a = voicingMidi(LIB.get("A")!);
  expect(run(cat(silenceThen(strum(e, 0.015, 0.4), 0.3), strum(a, 0.015, 1.0))).map(([, ev]) => base(ev.name))).toEqual(["E", "A"]);
});
test("a rapid second strum cancels the pending first chord", () => {
  const e = voicingMidi(LIB.get("E")!), a = voicingMidi(LIB.get("A")!);
  expect(run(cat(silenceThen(strum(e, 0.015, 0.12), 0.3), strum(a, 0.015, 1.0))).map(([, ev]) => base(ev.name))).toEqual(["A"]);
});
test("a prior source that throws falls back to no hand and still fires", () => {
  const eng = new Engine(SR, 512, () => { throw new Error("camera exploded"); });
  expect(run(silenceThen(pluck(52), 0.5), eng)[0][1].midi).toEqual([52]);
});
test("the prior is consulted when an event fires", () => {
  let n = 0;
  run(silenceThen(pluck(52), 0.5), new Engine(SR, 512, () => { n++; return NO_HAND; }));
  expect(n).toBeGreaterThan(0);
});
test("last latency is reported in seconds", () => {
  const eng = new Engine(SR, 512);
  run(silenceThen(pluck(52), 0.5), eng);
  expect(eng.lastLatencyS!).toBeGreaterThanOrEqual(0.03); expect(eng.lastLatencyS!).toBeLessThanOrEqual(0.09);
});
test("the buffer stays bounded over a long session after an event", () => {
  const eng = new Engine(SR, 512);
  run(silenceThen(pluck(52), 0.5), eng);
  const quiet = new Float32Array(512);
  for (let i = 0; i < (30 * SR) / 512; i++) eng.process(quiet);
  expect(eng.bufferedSamples).toBeLessThanOrEqual(2 * SR);
});
