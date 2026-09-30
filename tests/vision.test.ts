import { expect, test, vi } from "vitest";
import { VisionTracker } from "../src/vision";
import { FretMap, NO_HAND } from "../src/vision-core";

const hand = (x: number) => Array.from({ length: 21 }, (_, i) => ({ x: i === 8 ? x : 0.5, y: 0.5, z: 0 }));
function fake(handsPerCall: { x: number }[][]) {
  let call = 0;
  const detectForVideo = vi.fn(() => ({ landmarks: (handsPerCall[Math.min(call++, handsPerCall.length - 1)] ?? []).map((h) => hand(h.x)) }));
  const video = { readyState: 4, currentTime: 0 } as unknown as HTMLVideoElement;
  const tracker = new VisionTracker(video, { detectForVideo, close: vi.fn() } as never, new FretMap());
  return { tracker, video: video as { currentTime: number }, detectForVideo };
}

test("the hand nearest the nut is the fretting hand", () => {
  const { tracker } = fake([[{ x: 0.45 }, { x: 0.15 }]]);
  const p = tracker.update(1);
  expect(p.present).toBe(true);
  expect(p.landmarks[8][0]).toBeCloseTo(0.15, 5);
  expect(p.fret).toBeLessThan(3);
});

test("no hands gives NO_HAND; a detector that throws gives NO_HAND", () => {
  expect(fake([[]]).tracker.update(1)).toEqual(NO_HAND);
  const t = new VisionTracker({ readyState: 4, currentTime: 0 } as never, { detectForVideo: () => { throw new Error("boom"); }, close() {} } as never, new FretMap());
  expect(t.update(1)).toEqual(NO_HAND);
});

test("a video frame that has not changed is not analysed twice", () => {
  const { tracker, video, detectForVideo } = fake([[{ x: 0.2 }]]);
  video.currentTime = 1.0;
  const first = tracker.update(10);
  video.currentTime = 1.0; // the camera has not delivered a new frame
  const second = tracker.update(26);
  expect(detectForVideo).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
  video.currentTime = 1.033;
  tracker.update(43);
  expect(detectForVideo).toHaveBeenCalledTimes(2);
});
