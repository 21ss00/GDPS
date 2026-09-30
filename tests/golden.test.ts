import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Engine } from "../src/engine";
import { SR, blocks } from "./signals";

type Ev = { kind: string; midi: number[]; name: string; t: number };
const dir = new URL("./golden/", import.meta.url);
const manifest: { name: string; file: string; events: Ev[] }[] = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));

describe("TypeScript engine matches the Python reference", () => {
  for (const s of manifest) {
    test(s.name, () => {
      const raw = readFileSync(new URL(s.file, dir));
      const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      const eng = new Engine(SR, 512), got: Ev[] = [];
      blocks(x).forEach((b, i) => { for (const e of eng.process(b)) got.push({ kind: e.kind, midi: e.midi, name: e.name, t: ((i + 1) * 512) / SR }); });
      expect(got.map(({ kind, midi, name }) => ({ kind, midi, name }))).toEqual(s.events.map(({ kind, midi, name }) => ({ kind, midi, name })));
      got.forEach((e, i) => expect(Math.abs(e.t - s.events[i].t), `${s.name} event ${i} timing`).toBeLessThanOrEqual((2 * 512) / SR));
    });
  }
});
