import { afterEach, expect, test, vi } from "vitest";
import { MicError, checkSampleRate, friendlyMicError, startMic } from "../src/audioIn";

afterEach(() => vi.unstubAllGlobals());
const domErr = (name: string) => Object.assign(new Error(name), { name });

test("permission denied gets a readable message", () => {
  expect(friendlyMicError(domErr("NotAllowedError"))).toMatch(/allow|permission|blocked/i);
});
test("no microphone gets a readable message", () => {
  expect(friendlyMicError(domErr("NotFoundError"))).toMatch(/no microphone|not found/i);
});
test("in use, overconstrained and unknown errors are readable", () => {
  expect(friendlyMicError(domErr("NotReadableError"))).toMatch(/in use|another/i);
  expect(friendlyMicError(domErr("OverconstrainedError"))).toMatch(/selected|device/i);
  expect(friendlyMicError("weird")).toMatch(/microphone/i);
});
test("a non-44.1 kHz context is reported; 44.1 kHz is fine", () => {
  expect(checkSampleRate({ sampleRate: 48000 })).toMatch(/48000/);
  expect(checkSampleRate({ sampleRate: 44100 })).toBeNull();
});
test("startMic turns a denied permission into a MicError and never loads the worklet", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.reject(domErr("NotAllowedError")) } });
  const addModule = vi.fn();
  const ctx = { audioWorklet: { addModule }, sampleRate: 44100 } as unknown as AudioContext;
  await expect(startMic(ctx, undefined, () => {})).rejects.toBeInstanceOf(MicError);
  expect(addModule).not.toHaveBeenCalled();
});
test("startMic asks for raw, unprocessed audio", async () => {
  const gum = vi.fn(() => Promise.reject(domErr("NotFoundError")));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
  await startMic({ audioWorklet: { addModule: vi.fn() } } as unknown as AudioContext, "abc", () => {}).catch(() => {});
  const audio = (gum.mock.calls[0] as unknown as [{ audio: Record<string, unknown> }])[0].audio;
  expect(audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, deviceId: { exact: "abc" } });
});

import { checkSupport } from "../src/audioIn";

const ok = { secure: true, hasMediaDevices: true, hasAudioWorklet: true, hasAudioContext: true };
test("a capable browser has no support message", () => expect(checkSupport(ok)).toBeNull());
test("each missing capability gets a specific message", () => {
  expect(checkSupport({ ...ok, secure: false })).toMatch(/https|secure/i);
  expect(checkSupport({ ...ok, hasMediaDevices: false })).toMatch(/microphone/i);
  expect(checkSupport({ ...ok, hasAudioWorklet: false })).toMatch(/Chrome|Edge|Firefox|browser/i);
  expect(checkSupport({ ...ok, hasAudioContext: false })).toMatch(/Chrome|Edge|Firefox|browser/i);
});
test("MicError carries a code so callers can tell failures apart", () => {
  expect(new MicError("x", "capture-setup").code).toBe("capture-setup");
  expect(new MicError("x").code).toBe("other");
});
