import { cpSync, mkdirSync, existsSync } from "node:fs";

const from = (p) => new URL(`../node_modules/${p}`, import.meta.url);
const to = (p) => new URL(`../public/${p}`, import.meta.url);
mkdirSync(to("mediapipe"), { recursive: true });
cpSync(from("spessasynth_lib/dist/spessasynth_processor.min.js"), to("spessasynth_processor.min.js"));
cpSync(from("@mediapipe/tasks-vision/wasm"), to("mediapipe/wasm"), { recursive: true });
for (const f of ["spessasynth_processor.min.js", "mediapipe/wasm/vision_wasm_internal.wasm"]) {
  if (!existsSync(to(f))) throw new Error(`copy-assets failed: ${f}`);
}
console.log("assets copied");
