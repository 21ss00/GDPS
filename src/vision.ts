import { NO_HAND, type FretMap, type HandPrior } from "./vision-core";

const INDEX_FINGERTIP = 8;

/** The part of MediaPipe's HandLandmarker this class needs (lets tests pass a fake). */
export interface LandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): { landmarks: { x: number; y: number }[][] };
  close(): void;
}

export class VisionTracker {
  private lastTs = -1;
  private lastVideoTime = -1;
  private lastPrior: HandPrior = NO_HAND;

  constructor(private video: HTMLVideoElement, private landmarker: LandmarkerLike, private fretMap: FretMap) {}

  static async create(video: HTMLVideoElement, fretMap: FretMap): Promise<VisionTracker | { error: string }> {
    try {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}hand_landmarker.task` },
        runningMode: "VIDEO",
        numHands: 2,
      });
      return new VisionTracker(video, landmarker, fretMap);
    } catch (e) {
      return { error: `Hand tracking could not start (${(e as Error).message}). Continuing with audio only.` };
    }
  }

  /**
   * The fretting hand is the one whose index fingertip is nearest the nut.
   * Called every animation frame, but the camera delivers ~30 fps: an unchanged video frame
   * returns the previous result instead of running the model again.
   */
  update(nowMs: number): HandPrior {
    try {
      if (this.video.readyState < 2) return NO_HAND;
      if (this.video.currentTime === this.lastVideoTime || nowMs <= this.lastTs) return this.lastPrior;
      this.lastVideoTime = this.video.currentTime;
      this.lastTs = nowMs;
      const hands = this.landmarker.detectForVideo(this.video, nowMs).landmarks;
      if (!hands.length) return (this.lastPrior = NO_HAND);
      const best = hands.reduce((a, b) => (this.fretMap.fretAt(a[INDEX_FINGERTIP].x) <= this.fretMap.fretAt(b[INDEX_FINGERTIP].x) ? a : b));
      return (this.lastPrior = {
        present: true,
        fret: this.fretMap.fretAt(best[INDEX_FINGERTIP].x),
        landmarks: best.map((p) => [p.x, p.y] as [number, number]),
      });
    } catch {
      return NO_HAND;
    }
  }

  close(): void { try { this.landmarker.close(); } catch { /* already closed */ } }
}
