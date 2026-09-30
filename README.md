# Guitar Synth (web)

Play an acoustic guitar (standard tuning) near your microphone and hear it played back as a clean electric guitar. The page detects single notes and common chords, and optionally uses your webcam to watch your fretting hand as a hint when the audio is ambiguous.

Everything runs in your browser. No audio or video is uploaded anywhere.

Live at: https://21ss00.github.io/GDPS/

**Use headphones.** Otherwise the microphone hears the synth and re-triggers it.

## Using it

1. Press **Start** and allow the microphone (and camera, if you want hand tracking).
2. Pick your microphone in the dropdown if the default isn't the right one.
3. Play. The window shows the detected note or chord, its confidence and how long the decision took.
4. **Test sound** plays an E minor chord so you can check your headphones.
5. Optional calibration (hand in view): put your index finger on the nut and press *Mark nut*, then on the 12th fret and press *Mark 12th fret*.

Works in current Chrome and Edge; Firefox should work but is less tested.

## What it can and can't do

- Notes from E2 to E6, and major, minor, 7, maj7, m7, sus2, sus4 and power chords on every root, in open and barre shapes.
- Not handled: bends, slides, hammer-ons, vibrato, alternate tunings, muted or percussive strums.
- Known limits, measured on synthetic guitar audio (the real acoustic guitar case still needs live tuning):
  - In a noisy room (white noise at 10-20 dB below the playing) the onset detector can add a phantom extra note to roughly 10-25% of plucks; it is clean at 30 dB.
  - An open power chord (root + fifth) is often indistinguishable from the matching major shape: the root is right, the quality can be wrong.
- Delay: roughly 50-65 ms for notes and 180-200 ms for chords until a decision, plus your browser's audio latency.

## Develop

```bash
npm install
npm run dev      # http://localhost:5400
npm test         # unit tests + golden comparison with the Python reference
npm run build    # static site in dist/
```

`tests/golden/` holds recordings and the events the Python desktop app produces for them; the TypeScript engine must reproduce them exactly. Regenerate with `python scripts/export_golden.py` from the desktop app's folder.

## Publishing and updating

This folder is published to GitHub Pages by the workflow in `.github/workflows/pages.yml`. In the repository's **Settings -> Pages**, set the source to **GitHub Actions**. Every push to `main` rebuilds and redeploys (about a minute).

To change the site: edit files here, commit, and push. Visitors may need a hard refresh (Ctrl+F5) to see the new version because browsers cache files. To roll back, revert the commit and push. Everything in the repository is public.

## Credits

- Guitar sound: [FreePats "FSBS Electric Guitar Clean #1"](https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html), Creative Commons CC0 1.0.
- SoundFont playback: [SpessaSynth](https://github.com/spessasus/spessasynth_lib).
- Hand tracking: [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision).
