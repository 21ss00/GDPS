export interface HandPrior { present: boolean; fret: number | null; landmarks: [number, number][] }
export const NO_HAND: HandPrior = { present: false, fret: null, landmarks: [] };

const MAX_FRET = 15;

/** Maps a horizontal image position to a fret number, calibrated with the nut and the 12th fret. */
export class FretMap {
  private nutX = 0;
  private scaleLen = 1;
  constructor(nutX = 0.1, fret12X = 0.5) { this.calibrate(nutX, fret12X); }

  calibrate(nutX: number, fret12X: number): void {
    if (Math.abs(fret12X - nutX) < 1e-3) throw new Error("nut and 12th fret positions must differ");
    this.nutX = nutX;
    this.scaleLen = 2 * (fret12X - nutX); // signed: encodes which way the neck points
  }

  fretAt(x: number): number {
    const u = (x - this.nutX) / this.scaleLen;
    if (u <= 0) return 0;
    if (u >= 0.75) return MAX_FRET; // beyond the 24th fret
    return Math.min(MAX_FRET, -12 * Math.log2(1 - u));
  }
}
