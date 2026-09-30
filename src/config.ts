export const SAMPLE_RATE = 44100;
export const BLOCK_SIZE = 512;
export const TUNING_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export const MIDI_MIN = 40; // E2
export const MIDI_MAX = 88; // E6

/** Mutable so the UI can change the noise gate live. */
export const cfg = { noiseGateRms: 0.004, minConfidence: 0.55 };
