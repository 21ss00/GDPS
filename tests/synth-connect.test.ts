import { afterEach, expect, test, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("spessasynth_lib", () => ({
  WorkletSynthesizer: class {
    soundBankManager = { addSoundBank: async () => {} };
    isReady = Promise.resolve();
    programChange() {}
    noteOn() {}
    noteOff() {}
    connect(node: unknown) { connect(node); }
  },
}));

import { createWebSynth } from "../src/synth";

afterEach(() => { vi.unstubAllGlobals(); connect.mockClear(); });

test("the synthesizer output is connected to the speakers (otherwise the site is silent)", async () => {
  vi.stubGlobal("fetch", async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const ctx = { destination: { tag: "destination" }, audioWorklet: { addModule: vi.fn(async () => {}) } };
  await createWebSynth(ctx as unknown as AudioContext, "/x.sf2");
  expect(connect).toHaveBeenCalledTimes(1);
  expect(connect).toHaveBeenCalledWith(ctx.destination);
});
