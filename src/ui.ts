import type { Event } from "./fusion";
import type { HandPrior } from "./vision-core";

export interface ViewState { prior: HandPrior; event: Event | null; latencyMs: number | null; level: number; status: string; audioPathMs: number | null }

const LATENCY_BUDGET_MS = { note: 80, chord: 250 };

export function drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement | null, v: ViewState): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const { width: w, height: h } = canvas;
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  if (video && video.readyState >= 2) g.drawImage(video, 0, 0, w, h);
  if (v.prior.present) {
    g.fillStyle = "#5ad88a";
    for (const [x, y] of v.prior.landmarks) if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { g.beginPath(); g.arc(x * w, y * h, 4, 0, 7); g.fill(); }
  }
  g.font = "bold 40px system-ui"; g.fillStyle = v.event ? "#ffbe3c" : "#aaa";
  g.fillText(v.event ? `${v.event.name}` : "listening…", 14, 48);
  g.font = "16px system-ui"; g.fillStyle = "#ddd";
  if (v.event) g.fillText(`${v.event.kind}, confidence ${v.event.confidence.toFixed(2)}`, 14, 74);
  if (v.latencyMs !== null) {
    const budget = LATENCY_BUDGET_MS[v.event?.kind ?? "note"];
    g.fillStyle = v.latencyMs <= budget ? "#5ad88a" : "#ff6b6b";
    g.fillText(`decision ${v.latencyMs.toFixed(0)} ms`, 14, 98);
  }
  if (v.audioPathMs !== null) { g.fillStyle = "#ddd"; g.fillText(`browser audio path ~${v.audioPathMs.toFixed(0)} ms`, 14, 120); }
  g.fillStyle = "#ddd";
  g.fillText(v.prior.present ? `hand: fret ~${v.prior.fret === null ? "?" : v.prior.fret.toFixed(1)}` : "no hand - audio only", 14, h - 34);
  g.strokeStyle = "#888"; g.strokeRect(10, h - 26, w - 20, 10);
  g.fillStyle = "#5ad88a"; g.fillRect(10, h - 26, Math.min(1, v.level / 0.1) * (w - 20), 10);
}
