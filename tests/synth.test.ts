import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SynthError, WebSynth, fetchSoundFont, type Backend } from "../src/synth";

class FakeBackend implements Backend {
  log: string[] = [];
  noteOn(_c: number, m: number, v: number) { this.log.push(`on ${m} ${v}`); }
  noteOff(_c: number, m: number) { this.log.push(`off ${m}`); }
}
let b: FakeBackend, s: WebSynth;
beforeEach(() => { vi.useFakeTimers(); b = new FakeBackend(); s = new WebSynth(b); });
afterEach(() => vi.useRealTimers());

test("noteOn / noteOff track what is sounding", () => {
  s.noteOn(64, 90); expect(s.sounding.has(64)).toBe(true); expect(b.log).toEqual(["on 64 90"]);
  s.noteOff(64); expect(s.sounding.size).toBe(0);
});
test("a chord is strummed low to high with a stagger", () => {
  s.playChord([52, 40, 47], 100, 0.05);
  expect([...s.sounding]).toEqual([40]);
  vi.advanceTimersByTime(60); expect([...s.sounding]).toEqual([40, 47]);
  vi.advanceTimersByTime(60); expect([...s.sounding]).toEqual([40, 47, 52]);
});
test("a second chord releases the first and cancels its unfinished strum", () => {
  s.playChord([40, 47, 52], 100, 0.05);
  s.playChord([45, 52, 57], 100, 0);
  vi.advanceTimersByTime(500);
  expect([...s.sounding].sort((a, c) => a - c)).toEqual([45, 52, 57]);
  expect(b.log.filter((l) => l === "on 47")).toHaveLength(0);
});
test("stopPending cancels notes that have not started; stopAll silences everything", () => {
  s.playChord([40, 47, 52], 100, 0.05);
  s.stopPending(); vi.advanceTimersByTime(500);
  expect([...s.sounding]).toEqual([40]);
  s.stopAll(); expect(s.sounding.size).toBe(0);
});
test("fetchSoundFont names the URL on an HTTP error and on a network failure", async () => {
  await expect(fetchSoundFont("/x.sf2", (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch)).rejects.toThrow(/x\.sf2.*404|404.*x\.sf2/);
  await expect(fetchSoundFont("/y.sf2", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(SynthError);
  const ok = await fetchSoundFont("/z.sf2", (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch);
  expect(ok.byteLength).toBe(8);
});
