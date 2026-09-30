import { expect, test } from "vitest";
import { OnsetDetector } from "../src/onset";
import { SR, blocks, noise, pluck, silenceThen, strum, withNoise } from "./signals";

function fireTimes(x: Float32Array): number[] {
  const det = new OnsetDetector(SR, 512);
  const out: number[] = [];
  blocks(x).forEach((b, i) => { if (det.process(b)) out.push(((i + 1) * 512) / SR); });
  return out;
}
const EM = [40, 47, 52, 56, 59, 64];

test("a pluck fires once, promptly", () => {
  const t = fireTimes(silenceThen(pluck(52), 0.5));
  expect(t).toHaveLength(1);
  expect(t[0]).toBeGreaterThanOrEqual(0.5); expect(t[0]).toBeLessThanOrEqual(0.525);
});
test("silence and quiet room noise fire nothing", () => {
  expect(fireTimes(new Float32Array(SR * 2))).toEqual([]);
  expect(fireTimes(noise(0.002, 2))).toEqual([]);
});
test("steady noise never fires at any level", () => {
  for (const level of [0.005, 0.02, 0.05, 0.1]) expect(fireTimes(noise(level, 3)), String(level)).toEqual([]);
});
test("two plucks fire twice", () => {
  const a = silenceThen(pluck(52, 0.5), 0.3), b = pluck(59, 1.0);
  const x = new Float32Array(a.length + b.length); x.set(a); x.set(b, a.length);
  expect(fireTimes(x)).toHaveLength(2);
});
test("a strum fires once, not once per string", () => {
  expect(fireTimes(silenceThen(strum(EM), 0.5))).toHaveLength(1);
});
// Measured over 40 seeds (same algorithm and constants as the Python app): clean at 30 dB SNR; at 10-20 dB
// white noise the pluck is still found on time ~97% of the time, but ~10-25% of plucks also get a phantom
// extra onset. The tests pin that measured behaviour; see the ledger for the follow-up.
test("a pluck in light noise (30 dB) fires exactly once, on time, for every seed", () => {
  for (let seed = 0; seed < 20; seed++) {
    const t = fireTimes(withNoise(silenceThen(pluck(52), 0.5), 30, seed));
    expect(t, `seed ${seed}`).toHaveLength(1);
    expect(t[0]).toBeGreaterThanOrEqual(0.5); expect(t[0]).toBeLessThanOrEqual(0.53);
  }
});
test("a pluck in heavy noise (10 dB) is still detected on time in at least 90% of cases", () => {
  let found = 0;
  const N = 30;
  for (let seed = 0; seed < N; seed++) {
    const t = fireTimes(withNoise(silenceThen(pluck(52), 0.5), 10, seed));
    if (t.some((v) => v >= 0.5 && v <= 0.53)) found++;
  }
  expect(found).toBeGreaterThanOrEqual(Math.ceil(0.9 * N));
});
test("a second strum right after a muted one is detected", () => {
  const first = silenceThen(strum(EM, 0.015, 0.12), 0.3), second = strum([45, 52, 57, 61, 64], 0.015, 1.0);
  const x = new Float32Array(first.length + second.length); x.set(first); x.set(second, first.length);
  const t = fireTimes(x);
  expect(t).toHaveLength(2); expect(t[1]).toBeGreaterThanOrEqual(0.42); expect(t[1]).toBeLessThanOrEqual(0.46);
});
test("a re-strum over a ringing chord is detected", () => {
  const ring = silenceThen(strum(EM, 0.015, 2.0), 0.3), again = strum([45, 52, 57, 61, 64], 0.015, 1.0);
  const start = Math.floor(0.55 * SR);
  for (let i = 0; i < again.length && start + i < ring.length; i++) ring[start + i] += again[i];
  const t = fireTimes(ring.subarray(0, Math.floor(2.3 * SR)));
  expect(t).toHaveLength(2); expect(t[1]).toBeGreaterThanOrEqual(0.55); expect(t[1]).toBeLessThanOrEqual(0.59);
});
test("reset clears state", () => {
  const det = new OnsetDetector(SR, 512);
  for (const b of blocks(silenceThen(pluck(52), 0.3))) det.process(b);
  det.reset();
  expect(blocks(silenceThen(pluck(52), 0.3)).filter((b) => det.process(b))).toHaveLength(1);
});
