import { beforeEach, expect, test, vi } from "vitest";
import { MicError } from "../src/audioIn";
import type { Event } from "../src/fusion";
import { Session, type AudioCtxLike, type MicHandle, type SessionDeps } from "../src/session";
import { NO_HAND } from "../src/vision-core";
import { SR, blocks, pluck, silenceThen } from "./signals";

class FakeCtx implements AudioCtxLike {
  closed = false; resumed = false; baseLatency = 0.01; outputLatency = 0.02;
  constructor(public sampleRate: number) {}
  async resume() { this.resumed = true; }
  async close() { this.closed = true; }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mic = MicHandle & { deviceId: string | undefined; push(b: Float32Array): void; stop: any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ctxs: FakeCtx[], mics: Mic[], synth: any;
let deps: SessionDeps, events: [Event, number][], levels: number[];
let micFailures: (MicError | Error)[], defaultRate: number;

const newSession = () => new Session(deps, { onEvent: (e, ms) => events.push([e, ms]), onLevel: (l) => levels.push(l), getPrior: () => NO_HAND });

beforeEach(() => {
  ctxs = []; mics = []; events = []; levels = []; micFailures = []; defaultRate = 48000;
  synth = { noteOn: vi.fn(), noteOff: vi.fn(), playChord: vi.fn(), stopPending: vi.fn(), stopAll: vi.fn() };
  deps = {
    createContext: vi.fn(async (rate?: number) => { const c = new FakeCtx(rate ?? defaultRate); ctxs.push(c); return c; }),
    createSynth: vi.fn(async () => synth),
    startMic: vi.fn(async (_ctx, deviceId, onBlock) => {
      const failure = micFailures.shift();
      if (failure) throw failure;
      const m: Mic = { label: `mic ${mics.length}`, inputLatencyMs: 5, deviceId, stop: vi.fn(), push: onBlock };
      mics.push(m);
      return m;
    }),
  };
});

test("start creates a 44.1 kHz context, resumes it and loads the synth", async () => {
  const s = newSession();
  await s.startListening();
  expect(deps.createContext).toHaveBeenCalledWith(44100);
  expect(ctxs[0].resumed).toBe(true);
  expect(deps.createSynth).toHaveBeenCalledTimes(1);
});

test("a failed mic start keeps the context and synth, and a retry reuses them", async () => {
  micFailures.push(new MicError("blocked", "permission"));
  const s = newSession();
  await expect(s.startListening()).rejects.toThrow("blocked");
  expect(ctxs[0].closed).toBe(false);
  await s.startListening();
  expect(deps.createContext).toHaveBeenCalledTimes(1);
  expect(deps.createSynth).toHaveBeenCalledTimes(1);
  expect(mics).toHaveLength(1);
});

test("if the synth cannot load the context is closed, not leaked", async () => {
  (deps.createSynth as any).mockRejectedValueOnce(new Error("no sf2"));
  const s = newSession();
  await expect(s.startListening()).rejects.toThrow("no sf2");
  expect(ctxs[0].closed).toBe(true);
});

test("the engine runs at the context's real sample rate", async () => {
  defaultRate = 44100;
  const s = newSession();
  await s.startListening();
  expect(s.engine!.sr).toBe(44100);
  const s2 = newSession();
  (deps.createContext as any).mockImplementationOnce(async () => { const c = new FakeCtx(48000); ctxs.push(c); return c; });
  await s2.startListening();
  expect(s2.engine!.sr).toBe(48000);
});

test("the sample-rate warning is returned, and only when the rate is wrong", async () => {
  (deps.createContext as any).mockImplementationOnce(async () => { const c = new FakeCtx(48000); ctxs.push(c); return c; });
  expect((await newSession().startListening()).rateWarning).toMatch(/48000/);
  (deps.createContext as any).mockImplementationOnce(async () => { const c = new FakeCtx(44100); ctxs.push(c); return c; });
  expect((await newSession().startListening()).rateWarning).toBeNull();
});

test("if the browser cannot capture at the forced rate, retry once at the default rate", async () => {
  micFailures.push(new MicError("rate mismatch", "capture-setup"));
  const s = newSession();
  const r = await s.startListening();
  expect((deps.createContext as any).mock.calls.map((c: unknown[]) => c[0])).toEqual([44100, undefined]);
  expect(ctxs[0].closed).toBe(true);
  expect(deps.createSynth).toHaveBeenCalledTimes(2);
  expect(s.engine!.sr).toBe(48000);
  expect(r.rateWarning).toMatch(/48000/);
});

test("a capture failure that is not about the rate is not retried", async () => {
  micFailures.push(new MicError("blocked", "permission"));
  await expect(newSession().startListening()).rejects.toThrow("blocked");
  expect(deps.createContext).toHaveBeenCalledTimes(1);
});

test("changing the microphone restarts capture on the new device and stops the old one", async () => {
  const s = newSession();
  await s.startListening("a");
  await s.switchMic("b");
  expect(mics.map((m) => m.deviceId)).toEqual(["a", "b"]);
  expect(mics[0].stop).toHaveBeenCalledTimes(1);
  expect(mics[1].stop).not.toHaveBeenCalled();
});

test("a failed microphone switch leaves the old capture running", async () => {
  const s = newSession();
  await s.startListening("a");
  micFailures.push(new MicError("gone", "device"));
  await expect(s.switchMic("b")).rejects.toThrow("gone");
  expect(mics[0].stop).not.toHaveBeenCalled();
});

test("audio flows from the mic through the engine to the hooks", async () => {
  defaultRate = 44100;
  const s = newSession();
  await s.startListening();
  for (const b of blocks(silenceThen(pluck(52), 0.5))) mics[0].push(b);
  for (let i = 0; i < 20; i++) mics[0].push(new Float32Array(512));
  expect(events.map(([e]) => e.midi)).toEqual([[52]]);
  expect(events[0][1]).toBeGreaterThan(0);
  expect(levels.length).toBeGreaterThan(0);
  expect(synth.noteOn).toHaveBeenCalledWith(52);
  void SR;
});

test("the audio path latency adds context and mic latency", async () => {
  const s = newSession();
  await s.startListening();
  expect(s.audioPathMs).toBeCloseTo(10 + 20 + 5, 5);
});

test("stop releases everything", async () => {
  const s = newSession();
  await s.startListening();
  await s.stop();
  expect(mics[0].stop).toHaveBeenCalled();
  expect(synth.stopAll).toHaveBeenCalled();
  expect(ctxs[0].closed).toBe(true);
  await s.stop(); // idempotent
});
