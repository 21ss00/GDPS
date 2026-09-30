import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { NO_HAND, type FretMap, type HandPrior } from "./vision-core";

const INDEX_FINGERTIP = 8;

export class VisionTracker {
  private lastTs = -1;
  private constructor(private video: HTMLVideoElement, private landmarker: HandLandmarker, private fretMap: FretMap) {}

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

  /** The fretting hand is the one whose index fingertip is nearest the nut. */
  update(nowMs: number): HandPrior {
    try {
      if (this.video.readyState < 2 || nowMs <= this.lastTs) return NO_HAND;
      this.lastTs = nowMs;
      const hands = this.landmarker.detectForVideo(this.video, nowMs).landmarks;
      if (!hands.length) return NO_HAND;
      const best = hands.reduce((a, b) => (this.fretMap.fretAt(a[INDEX_FINGERTIP].x) <= this.fretMap.fretAt(b[INDEX_FINGERTIP].x) ? a : b));
      return { present: true, fret: this.fretMap.fretAt(best[INDEX_FINGERTIP].x), landmarks: best.map((p) => [p.x, p.y] as [number, number]) };
    } catch {
      return NO_HAND;
    }
  }

  close(): void { try { this.landmarker.close(); } catch { /* already closed */ } }
}
