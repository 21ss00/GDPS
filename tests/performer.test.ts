import { beforeEach, expect, test } from "vitest";
import type { Event } from "../src/fusion";
import { Performer, type SynthLike } from "../src/performer";

class FakeSynth implements SynthLike {
  sounding = new Set<number>(); chord: number[] = [];
  noteOn(m: number) { this.sounding.add(m); }
  noteOff(m: number) { this.sounding.delete(m); }
  playChord(ms: number[]) { for (const m of this.chord) this.noteOff(m); this.chord = [...ms]; for (const m of ms) this.noteOn(m); }
  stopPending() {}
}
const note = (m: number): Event => ({ kind: "note", midi: [m], name: "n", confidence: 0.9 });
const chord = (...ms: number[]): Event => ({ kind: "chord", midi: ms, name: "c", confidence: 0.9 });
let s: FakeSynth;
beforeEach(() => { s = new FakeSynth(); });

test("a note event plays the note; a chord plays all its notes", () => {
  const p = new Performer(s);
  expect(p.handle(note(64), 0)).toBe(true);
  expect([...s.sounding]).toEqual([64]);
  p.handle(chord(40, 47, 52), 1);
  expect([...s.sounding].sort()).toEqual([40, 47, 52]);
});
test("a new event releases the previous one, no stuck notes", () => {
  const p = new Performer(s);
  p.handle(chord(40, 47, 52), 0); p.handle(note(64), 1);
  expect([...s.sounding]).toEqual([64]);
  p.handle(chord(45, 52, 57), 2); p.handle(chord(45, 52, 57), 2.3);
  expect([...s.sounding].sort((a, b) => a - b)).toEqual([45, 52, 57]);
});
test("a note followed by a chord sharing its pitch keeps that pitch sounding", () => {
  const p = new Performer(s);
  p.handle(note(40), 0);
  p.handle(chord(40, 47, 52, 56, 59, 64), 1);
  expect(s.sounding.has(40)).toBe(true);
});
test("notes are released once the guitar goes quiet", () => {
  const p = new Performer(s, { releaseLevel: 0.01 });
  p.handle(note(64), 0);
  for (let i = 0; i < 10; i++) p.tick(0.05, 0.1);
  expect([...s.sounding]).toEqual([64]);
  for (let i = 0; i < 4; i++) p.tick(0.001, 0.1);
  expect(s.sounding.size).toBe(0); expect(p.current).toBeNull();
});
test("speaker mode drops a same-pitch echo but not a new pitch or a late repeat", () => {
  const p = new Performer(s, { speakerMode: true });
  expect(p.handle(note(64), 0)).toBe(true);
  expect(p.handle(note(64), 0.2)).toBe(false);
  expect(p.handle(note(59), 0.25)).toBe(true);
  expect(p.handle(note(59), 1.5)).toBe(true);
});
test("headphone mode never drops repeats", () => {
  const p = new Performer(s, { speakerMode: false });
  expect(p.handle(note(64), 0)).toBe(true); expect(p.handle(note(64), 0.2)).toBe(true);
});
