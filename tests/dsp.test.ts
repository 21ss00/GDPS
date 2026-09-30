import { expect, test } from "vitest";
import { fft, hann, median, rfftMag, rms } from "../src/dsp";

test("rfftMag peaks at the sine's bin and matches a naive DFT", () => {
  const n = 64, k = 5;
  const x = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * k * i) / n));
  const mag = rfftMag(x, n);
  expect(mag.indexOf(Math.max(...mag))).toBe(k);
  for (const bin of [0, 3, 5, 9, 32]) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += x[i] * Math.cos((2 * Math.PI * bin * i) / n); im -= x[i] * Math.sin((2 * Math.PI * bin * i) / n); }
    expect(mag[bin]).toBeCloseTo(Math.hypot(re, im), 8);
  }
});
test("rfftMag zero-pads to nfft", () => {
  expect(rfftMag(new Float64Array(100), 256)).toHaveLength(129);
});
test("fft rejects non power-of-two", () => {
  expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow();
});
test("hann is symmetric like np.hanning", () => {
  const w = hann(5);
  expect(w[0]).toBeCloseTo(0, 12); expect(w[2]).toBeCloseTo(1, 12); expect(w[1]).toBeCloseTo(w[3], 12);
  expect(hann(1)[0]).toBe(1);
});
test("median and rms", () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 12);
  expect(rms([])).toBe(0);
});
