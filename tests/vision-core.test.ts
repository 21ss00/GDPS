import { expect, test } from "vitest";
import { FretMap, NO_HAND } from "../src/vision-core";

test("hits the calibration points", () => {
  const m = new FretMap(); m.calibrate(0.1, 0.5);
  expect(m.fretAt(0.1)).toBeCloseTo(0, 2); expect(m.fretAt(0.5)).toBeCloseTo(12, 1);
});
test("monotonic and log-spaced", () => {
  const m = new FretMap(); m.calibrate(0.1, 0.5);
  let prev = -1;
  for (let i = 0; i < 30; i++) { const f = m.fretAt(0.1 + (0.45 * i) / 29); expect(f).toBeGreaterThan(prev); prev = f; }
  const xAt = (n: number) => 0.1 + 0.8 * (1 - 2 ** (-n / 12));
  expect(m.fretAt(xAt(5))).toBeCloseTo(5, 0);
  expect(xAt(6) - xAt(5)).toBeGreaterThan(xAt(11) - xAt(10));
});
test("works when the neck points left", () => {
  const m = new FretMap(); m.calibrate(0.9, 0.5);
  expect(m.fretAt(0.9)).toBeCloseTo(0, 2); expect(m.fretAt(0.5)).toBeCloseTo(12, 1);
});
test("clamps and rejects a degenerate calibration", () => {
  const m = new FretMap(); m.calibrate(0.1, 0.5);
  expect(m.fretAt(-1)).toBe(0); expect(m.fretAt(5)).toBe(15);
  expect(() => m.calibrate(0.3, 0.3)).toThrow();
});
test("NO_HAND is an absent hand", () => {
  expect(NO_HAND).toEqual({ present: false, fret: null, landmarks: [] });
});
