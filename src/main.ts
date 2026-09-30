import { MicError, checkSupport, listInputs, startMic } from "./audioIn";
import { Session } from "./session";
import { SynthError, createWebSynth } from "./synth";
import { drawOverlay, type ViewState } from "./ui";
import { VisionTracker } from "./vision";
import { FretMap, NO_HAND } from "./vision-core";
import { SAMPLE_RATE } from "./config";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status"), warnEl = $("warn"), canvas = $<HTMLCanvasElement>("view"), video = $<HTMLVideoElement>("cam-video");
const startBtn = $<HTMLButtonElement>("start"), testBtn = $<HTMLButtonElement>("test");
const nutBtn = $<HTMLButtonElement>("nut"), f12Btn = $<HTMLButtonElement>("f12");
const micSel = $<HTMLSelectElement>("mic"), outSel = $<HTMLSelectElement>("out"), camBox = $<HTMLInputElement>("cam");

const view: ViewState = { prior: NO_HAND, event: null, latencyMs: null, level: 0, status: "", audioPathMs: null };
const fretMap = new FretMap();
let nutX: number | null = null, cameraStarted = false, listening = false;

function say(text: string, isError = false): void { statusEl.textContent = text; statusEl.className = isError ? "err" : ""; }
function warn(text: string | null): void { warnEl.textContent = text ?? ""; warnEl.hidden = !text; }
function loop(): void { drawOverlay(canvas, video.srcObject ? video : null, view); requestAnimationFrame(loop); }

const session = new Session(
  {
    createContext: async (rate) => {
      const opts = { latencyHint: "interactive" as const };
      try { return new AudioContext(rate ? { ...opts, sampleRate: rate } : opts); } catch { return new AudioContext(opts); }
    },
    createSynth: (ctx) => createWebSynth(ctx as AudioContext, `${import.meta.env.BASE_URL}soundfont/guitar.sf2`),
    startMic: (ctx, deviceId, onBlock) => startMic(ctx as AudioContext, deviceId, onBlock),
  },
  {
    onEvent: (event, ms) => { view.event = event; view.latencyMs = ms; },
    onLevel: (level) => { view.level = level; },
    getPrior: () => view.prior,
  },
);

async function fillMics(selectedId?: string): Promise<void> {
  try {
    const inputs = await listInputs();
    micSel.replaceChildren(...inputs.map((d) => Object.assign(document.createElement("option"), { value: d.deviceId, textContent: d.label })));
    if (selectedId && inputs.some((d) => d.deviceId === selectedId)) micSel.value = selectedId;
  } catch { /* labels need permission; the list is refreshed once capture starts */ }
}

async function fillOutputs(ctx: AudioContext): Promise<void> {
  if (!("setSinkId" in AudioContext.prototype)) return;
  const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
  outSel.replaceChildren(...outs.map((d) => Object.assign(document.createElement("option"), { value: d.deviceId, textContent: d.label || "Speakers" })));
  $("outwrap").hidden = outs.length < 2;
  outSel.onchange = () => (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(outSel.value)
    .catch((e: Error) => say(`Could not switch output: ${e.message}`, true));
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  warn(null);
  try {
    say("Loading the guitar sound…");
    await session.prepare(SAMPLE_RATE);
    testBtn.disabled = false; // the synth is usable even if the microphone then fails
    const { label, rateWarning, deviceId } = await session.startListening(micSel.value || undefined);
    listening = true;
    await fillMics(deviceId);
    await fillOutputs(session.audioContext as AudioContext).catch(() => {}); // the output picker is a convenience
    warn(rateWarning);
    say(`Listening on: ${label}. Play something.`);
    if (camBox.checked && !cameraStarted) await startCamera();
  } catch (e) {
    say(e instanceof MicError || e instanceof SynthError ? e.message : `Something went wrong: ${(e as Error).message}`, true);
    startBtn.disabled = false; // let the user fix it and try again; what already loaded is reused
  }
}

micSel.onchange = async () => {
  if (!listening) return; // before Start the list has no real device ids yet
  try {
    const mic = await session.switchMic(micSel.value);
    say(`Listening on: ${mic.label}. Play something.`);
  } catch (e) {
    say(e instanceof MicError ? e.message : `Could not switch microphone: ${(e as Error).message}`, true);
  }
};

async function startCamera(): Promise<void> {
  cameraStarted = true;
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await video.play();
  } catch {
    video.srcObject = null;
    say("No camera available - continuing with audio only.");
    return;
  }
  const tracker = await VisionTracker.create(video, fretMap);
  if ("error" in tracker) { say(tracker.error); return; }
  nutBtn.disabled = f12Btn.disabled = false;
  const tick = () => { view.prior = tracker.update(performance.now()); requestAnimationFrame(tick); };
  tick();
}

function fingertipX(): number | null { return view.prior.present ? (view.prior.landmarks[8]?.[0] ?? null) : null; }
nutBtn.onclick = () => { nutX = fingertipX(); say(nutX === null ? "Show your hand to the camera first." : "Nut marked. Now put your finger on the 12th fret and press “Mark 12th fret”."); };
f12Btn.onclick = () => {
  const x = fingertipX();
  if (nutX === null || x === null) { say("Mark the nut first, with your hand in view.", true); return; }
  try { fretMap.calibrate(nutX, x); say("Calibrated."); } catch (e) { say((e as Error).message, true); }
};
testBtn.onclick = () => {
  session.synthHandle?.playChord([40, 47, 52, 55, 59, 64]); // E minor strum
  setTimeout(() => session.synthHandle?.stopAll(), 2500);
};
startBtn.onclick = () => void start();
window.addEventListener("pagehide", () => void session.stop());

setInterval(() => { view.audioPathMs = listening ? session.audioPathMs : null; }, 500);

const unsupported = checkSupport({
  secure: window.isSecureContext,
  hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
  hasAudioWorklet: typeof AudioWorkletNode !== "undefined",
  hasAudioContext: typeof AudioContext !== "undefined",
});
if (unsupported) { warn(unsupported); startBtn.disabled = true; }
void fillMics();
loop();
