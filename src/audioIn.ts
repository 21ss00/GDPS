import { BLOCK_SIZE, SAMPLE_RATE } from "./config";

// public/capture-processor.js is hard-wired to 512-sample blocks; fail loudly if the two ever drift apart.
if (BLOCK_SIZE !== 512) throw new Error("capture-processor.js is hard-wired to 512-sample blocks");

export class MicError extends Error {}

export function friendlyMicError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError": case "SecurityError":
      return "Microphone access was blocked. Click the lock icon in the address bar, allow the microphone, and press Start again.";
    case "NotFoundError": case "DevicesNotFoundError":
      return "No microphone was found. Plug one in (or pick another input) and press Start again.";
    case "NotReadableError": case "TrackStartError":
      return "The microphone is in use by another app. Close it there and press Start again.";
    case "OverconstrainedError":
      return "The selected microphone is not available. Choose a different input.";
    default:
      return "Could not start the microphone.";
  }
}

export function checkSampleRate(ctx: { sampleRate: number }): string | null {
  return ctx.sampleRate === SAMPLE_RATE
    ? null
    : `This browser is running audio at ${ctx.sampleRate} Hz, not ${SAMPLE_RATE} Hz, so detection may be off.`;
}

export async function listInputs(): Promise<{ deviceId: string; label: string }[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

export async function startMic(
  ctx: AudioContext,
  deviceId: string | undefined,
  onBlock: (b: Float32Array) => void,
): Promise<{ stop(): void; label: string; inputLatencyMs: number }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
      },
    });
  } catch (e) {
    throw new MicError(friendlyMicError(e));
  }
  try {
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-processor.js`);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "capture-processor", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (ev: MessageEvent<Float32Array>) => onBlock(ev.data);
    const mute = ctx.createGain();
    mute.gain.value = 0; // the worklet must be pulled by the graph, but must not be audible
    source.connect(node); node.connect(mute); mute.connect(ctx.destination);
    const track = stream.getAudioTracks()[0];
    const latency = (track?.getSettings?.() as { latency?: number } | undefined)?.latency ?? 0;
    return {
      label: track?.label ?? "microphone",
      inputLatencyMs: latency * 1000,
      stop() { node.port.onmessage = null; source.disconnect(); node.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw new MicError(`Could not start audio capture: ${(e as Error).message}`);
  }
}
