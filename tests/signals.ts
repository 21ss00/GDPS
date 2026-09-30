export const SR = 44100;
export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randn = (rng: () => number) => Math.sqrt(-2 * Math.log(rng() || 1e-12)) * Math.cos(2 * Math.PI * rng());

/** Additive plucked string: 1/k tilt, faster decay for high partials, inharmonicity, comb from pluck position, attack noise. */
export function pluck(midi: number, dur = 1.5, seed = 0): Float32Array {
  const rng = mulberry32(seed + midi);
  const f0 = midiToHz(midi), n = Math.floor(dur * SR);
  const inh = 1.5e-4 * Math.sqrt(110 / Math.max(f0, 110)) + 5e-5;
  const y = new Float64Array(n);
  for (let k = 1; k <= 24; k++) {
    const fk = k * f0 * Math.sqrt(1 + inh * k * k);
    if (fk >= 0.45 * SR) break;
    const amp = (Math.abs(Math.sin(Math.PI * k * 0.17)) + 0.12) / k ** 1.1, rate = 2.2 + 0.55 * k, phase = rng() * 2 * Math.PI;
    for (let i = 0; i < n; i++) y[i] += amp * Math.exp((-rate * i) / SR) * Math.sin((2 * Math.PI * fk * i) / SR + phase);
  }
  const attack = Math.floor(0.004 * SR);
  for (let i = 0; i < attack; i++) y[i] += 0.08 * randn(rng) * (1 - i / attack);
  return normalise(fadeOut(y), 0.5);
}

export function strum(midis: number[], offsetS = 0.015, dur = 1.5): Float32Array {
  const n = Math.floor(dur * SR), out = new Float64Array(n);
  [...midis].sort((a, b) => a - b).forEach((m, i) => {
    const start = Math.floor(i * offsetS * SR), note = pluck(m, dur);
    for (let j = 0; j < note.length && start + j < n; j++) out[start + j] += note[j];
  });
  return normalise(fadeOut(out), 0.5);
}

export function withNoise(x: Float32Array, snrDb: number, seed = 0): Float32Array {
  const rng = mulberry32(seed + 9973);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let s = 0, c = 0;
  for (const v of x) if (Math.abs(v) > 0.01 * peak) { s += v * v; c++; }
  const noiseRms = Math.sqrt(s / c) / 10 ** (snrDb / 20);
  return Float32Array.from(x, (v) => v + noiseRms * randn(rng));
}

export function silenceThen(x: Float32Array, leadS: number): Float32Array {
  const out = new Float32Array(Math.floor(leadS * SR) + x.length);
  out.set(x, Math.floor(leadS * SR));
  return out;
}

export function noise(level: number, seconds: number, seed = 1): Float32Array {
  const rng = mulberry32(seed);
  return Float32Array.from({ length: Math.floor(seconds * SR) }, () => level * randn(rng));
}

export function blocks(x: Float32Array, size = 512): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < x.length; i += size) {
    const b = new Float32Array(size);
    b.set(x.subarray(i, Math.min(i + size, x.length)));
    out.push(b);
  }
  return out;
}

function fadeOut(y: Float64Array): Float64Array {
  const fade = Math.min(y.length, Math.floor(0.05 * SR));
  for (let i = 0; i < fade; i++) y[y.length - fade + i] *= 1 - i / Math.max(1, fade - 1);
  return y;
}
function normalise(y: Float64Array, peakTo: number): Float32Array {
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  return Float32Array.from(y, (v) => (v * peakTo) / peak);
}
