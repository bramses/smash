# Smash

Smash is a Next.js app that takes text, image, and audio inputs and generates randomized smash canvases. Each smash builds a new composite by slicing text into word chunks, cropping image regions, and sampling audio like a DJ-style mix. Outputs can be downloaded as an image or as a video when audio is present.

## Features
- Text, image, and audio inputs
- Randomized compositing per smash
- DJ-style audio sampling (grid chops, phrases, stutters)
- Audio preview for the latest smash
- Image download (PNG) or video download (WebM)
- Input manager with modal list, previews, and removal
- Keyboard shortcut: press `s` to smash

## Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Usage

1. Add text lines or use “Add random quote”.
2. Upload images and/or audio files.
3. Adjust Smash controls (layers, BPM, grid, etc.).
4. Press **Smash** (or hit `s`).
5. Preview audio if present, then download the image or video.

## Audio Sampling Behavior
- Beat grid is derived from BPM and grid division (1/4, 1/8, 1/16).
- Each audio layer chooses between:
  - Grid chops
  - Longer phrases
  - Optional stutter repeats
- Slight playback-rate variation and short fades are applied.

## Notes
- Video export uses `MediaRecorder` and may depend on browser support. WebM output is expected.
- If video export returns an empty file, try Chrome or Edge first. If it persists, capture console logs and report.

## Project Structure
- `app/page.tsx`: main UI and smash logic

## Roadmap Ideas
- Animated video exports (multi-frame smashes)
- Presets for different smash styles
- Output gallery/history

## License

TBD
