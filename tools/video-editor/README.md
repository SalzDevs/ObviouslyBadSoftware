# video-editor

A small web-based video editor (React + Vite) for assembling screen recordings, voice clips, and background music into a final MP4. The export pipeline is also available as a headless CLI for agents.

Built for my own use; intentionally minimal. The tools that go *into* this editor (screen recordings, voice recordings) are the other tools in this repo.

## What's in the box

- **Web app** — drag in 2-3 clips, reorder them, trim, fade, add text overlays, add a background audio track, preview the whole sequence, export to MP4 via `ffmpeg.wasm`.
- **CLI** — `video-editor export --project project.json --output out.mp4` runs the same 3-step export pipeline against a project JSON file. The same project the web app exports via "Export JSON" is what the CLI consumes. So an agent can drive the editor without a browser.

## Run the web app

```bash
cd tools/video-editor
npm install
npm run dev
```

Open `http://localhost:5173` in a Chromium-based browser (needed for SharedArrayBuffer / ffmpeg.wasm).

## Use the CLI

The CLI lives in the same package; `npm run cli` invokes it.

```bash
cd tools/video-editor
npm run cli -- export --project /path/to/project.json --output /path/to/final.mp4
```

The CLI uses **system ffmpeg** (`ffmpeg` on `$PATH`), not ffmpeg.wasm, and requires:
- The project JSON (see "Project JSON schema" below)
- All `src` paths in the project must point to files that exist on disk
- Relative `src` paths are resolved against the project JSON's directory, so a project bundle (`project.json` + `clips/` + `audio.mp3` in one folder) is self-contained

The CLI exit codes mirror the web app's: `0` success, `1` generic error, `4` invalid flags.

## Project JSON schema

The web app auto-saves a `Project` to `localStorage` on every change. The "Export JSON" button in the top bar downloads the same data as a file for the CLI.

```ts
type Project = {
  version: 1
  clips: Clip[]
  audio?: AudioTrack
}

type Clip = {
  id: string
  src: string         // file path (relative to the project JSON, or absolute)
  filename: string
  duration: number    // seconds
  trimStart: number
  trimEnd: number
  fadeIn: number
  fadeOut: number
  text?: TextOverlay
}

type TextOverlay = {
  content: string
  position: 'top' | 'center' | 'bottom'
  preset: 'title' | 'watermark' | 'lower-third' | 'custom'
  fontSize: number    // px
  color: string       // hex
  startTime: number   // seconds, relative to clip start (currently preview-ignored)
  endTime: number
}

type AudioTrack = {
  src: string         // file path
  filename: string
  volume: number      // 0.0 - 1.0
}
```

`startTime` / `endTime` on text overlays are reserved for the export pipeline. The web preview currently shows the overlay whenever the clip is selected and `text.content` is non-empty, regardless of the time range.

## Export pipeline (both web and CLI)

The export is a 3-step ffmpeg pipeline:

1. **Per-clip** — `ffmpeg -ss trimStart -to trimEnd -vf "fade=in:...,fade=out:...,drawtext=..." clip_N.mp4`
2. **Concat** — `ffmpeg -f concat -safe 0 -i concat_list.txt -c copy output.mp4`
3. **Audio mix** — `ffmpeg -i output.mp4 -i audio -filter:a "volume=V" -c:v copy -shortest final.mp4` (skipped if no audio track)

The web app loads ffmpeg.wasm from the unpkg CDN on first export. The CLI shells out to system ffmpeg. The exact ffmpeg invocations are in `src/export/command.ts` and are shared between the two.

## Build

```bash
npm run build     # type-check + vite build → dist/
npm run preview   # serve dist/ locally
```

## Requirements

- **Node 20+** and **npm**
- **Web app:** Chromium 110+ (for SharedArrayBuffer + ffmpeg.wasm)
- **CLI:** system **ffmpeg** on `$PATH` (`brew install ffmpeg` on macOS)
- **Both:** the project JSON's `src` paths must point to readable files

## Known limitations

- **ffmpeg.wasm is slow.** A 30-second export can take 2-3 minutes of CPU time in the browser. The export modal shows step-by-step progress. For faster exports, use the CLI.
- **No thumbnails in the MediaBin.** Spec says filename + duration only. Generating thumbnails would require ffmpeg.wasm to run at import time, which would slow down every drag-in.
- **No waveform for the audio track.** A volume slider is the only control. Waveform is v2.
- **No clip splitting.** A clip can be trimmed (start/end) but not split in the middle. If you need a cut, add the same clip twice and trim each differently.
- **Text overlay preview is fake.** The web preview renders the text as a CSS `<div>` over the video. The real text burn-in happens at export time via ffmpeg's `drawtext` filter. They look the same but the CSS one is approximate.
- **File bytes don't persist.** The auto-save stores clip filenames + trim/fade/text settings in `localStorage`, but the actual video bytes (File objects, object URLs) die with the page. On reload, the project re-hydrates but you'll need to re-drag the same files. The web app shows which clips are missing.
- **Per-clip audio fades are sent to ffmpeg even when the source has no audio.** Harmless, but the export log will show `afade` lines for clips with no audio track.
- **The CLI uses system ffmpeg; the web app uses ffmpeg.wasm.** Same command builders, different runtimes. The output MP4s may differ slightly in encoder defaults. For pixel-identical output, build the project in the web app, then export the same project with the CLI on a machine whose ffmpeg matches the wasm core.
