import { MicError, checkSampleRate, listInputs, startMic } from "./audioIn";
import { BLOCK_SIZE, SAMPLE_RATE } from "./config";
import { rms } from "./dsp";
import { Engine } from "./engine";
import type { Event } from "./fusion";
import { Performer } from "./performer";
import { SynthError, createWebSynth, type WebSynth } from "./synth";
import { drawOverlay, type ViewState } from "./ui";
import { VisionTracker } from "./vision";
import { FretMap, NO_HAND } from "./vision-core";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status"), canvas = $<HTMLCanvasElement>("view"), video = $<HTMLVideoElement>("cam-video");
const startBtn = $<HTMLButtonElement>("start"), testBtn = $<HTMLButtonElement>("test");
const nutBtn = $<HTMLButtonElement>("nut"), f12Btn = $<HTMLButtonElement>("f12");
const micSel = $<HTMLSelectElement>("mic"), outSel = $<HTMLSelectElement>("out"), camBox = $<HTMLInputElement>("cam");

const view: ViewState = { prior: NO_HAND, event: null, latencyMs: null, level: 0, status: "" };
const fretMap = new FretMap();
let synth: WebSynth | null = null, ctx: AudioContext | null = null, nutX: number | null = null;

function say(text: string, isError = false): void { statusEl.textContent = text; statusEl.className = isError ? "err" : ""; }
function loop(): void { drawOverlay(canvas, video.srcObject ? video : null, view); requestAnimationFrame(loop); }

async function refreshMics(): Promise<void> {
  try {
    const inputs = await listInputs();
    const keep = micSel.value;
    micSel.replaceChildren(...inputs.map((d) => Object.assign(document.createElement("option"), { value: d.deviceId, textContent: d.label })));
    if (keep) micSel.value = keep;
    // default to the webcam mic if the user has one, as on the desktop app
    const w1 = inputs.find((d) => /w1/i.test(d.label));
    if (w1 && !keep) micSel.value = w1.deviceId;
  } catch { /* labels need permission; the list refreshes after Start */ }
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  try {
    say("Loading the guitar sound…");
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });
    await ctx.resume();
    const rateWarning = checkSampleRate(ctx);
    synth = await createWebSynth(ctx, `${import.meta.env.BASE_URL}soundfont/guitar.sf2`);
    testBtn.disabled = false;

    if ("setSinkId" in AudioContext.prototype) {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
      outSel.replaceChildren(...outs.map((d) => Object.assign(document.createElement("option"), { value: d.deviceId, textContent: d.label || "Speakers" })));
      $("outwrap").hidden = outs.length < 2;
      outSel.onchange = () => (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(outSel.value).catch((e) => say(`Could not switch output: ${e.message}`, true));
    }

    const engine = new Engine(SAMPLE_RATE, BLOCK_SIZE, () => view.prior);
    const performer = new Performer(synth, { speakerMode: false });
    const dt = BLOCK_SIZE / SAMPLE_RATE;
    const mic = await startMic(ctx, micSel.value || undefined, (block) => {
      const level = rms(block);
      view.level = level;
      for (const event of engine.process(block)) {
        if (performer.handle(event, performance.now() / 1000)) { view.event = event as Event; view.latencyMs = (engine.lastLatencyS ?? 0) * 1000; }
      }
      performer.tick(level, dt);
    });
    await refreshMics();
    say(rateWarning ?? `Listening on: ${mic.label}. Play something.`, rateWarning !== null);

    if (camBox.checked) await startCamera();
  } catch (e) {
    const msg = e instanceof MicError || e instanceof SynthError ? e.message : `Something went wrong: ${(e as Error).message}`;
    say(msg, true);
    startBtn.disabled = false; // let the user fix it and try again
  }
}

async function startCamera(): Promise<void> {
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
  synth?.playChord([40, 47, 52, 55, 59, 64]); // E minor strum
  setTimeout(() => synth?.stopAll(), 2500);
};
startBtn.onclick = () => void start();

void refreshMics();
loop();
