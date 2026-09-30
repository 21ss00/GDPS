import type { Candidate } from "./analyzer";
import { TUNING_MIDI, cfg } from "./config";
import type { HandPrior } from "./vision-core";
import { minFret } from "./voicings";

const PRIOR_WEIGHT = 0.06; // smaller than any real audio gap: the prior only breaks ties
const FRET_TOLERANCE = 4.0;
const MAX_PLAYABLE_FRET = 15;

export interface Event { kind: "note" | "chord"; midi: number[]; name: string; confidence: number }

function closeness(c: Candidate, prior: HandPrior): number {
  if (!prior.present || prior.fret === null) return 0;
  const frets = c.kind === "chord" && c.voicing
    ? [minFret(c.voicing)]
    : TUNING_MIDI.map((open) => c.midi[0] - open).filter((f) => f >= 0 && f <= MAX_PLAYABLE_FRET);
  if (!frets.length) return 0;
  return Math.max(...frets.map((f) => Math.max(0, 1 - Math.abs(f - prior.fret!) / FRET_TOLERANCE)));
}

export function fuse(candidates: Candidate[], prior: HandPrior, minConfidence = cfg.minConfidence): Event | null {
  const viable = candidates.filter((c) => c.confidence >= minConfidence);
  if (!viable.length) return null;
  let best = viable[0], bestScore = -Infinity;
  for (const c of viable) {
    const score = c.confidence + PRIOR_WEIGHT * closeness(c, prior);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return { kind: best.kind, midi: best.midi, name: best.name, confidence: best.confidence };
}
