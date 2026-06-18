# screen-recorder

A small CLI that records the screen to MP4 using ffmpeg as the encoder. Built for my own use; intentionally minimal.

## Requirements

- **ffmpeg** on PATH. Install with `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux).
- **macOS only:** grant Screen Recording permission to your terminal app at System Settings → Privacy & Security → Screen Recording.
- A display. The primary is captured by default; use `--list-displays` to see available indices.

## Build

```bash
cd tools/screen-recorder
go build -o screen-recorder .
```

The binary is a single static-ish Go executable. ffmpeg is invoked as a subprocess, so it must be installed separately.

## Usage

Default: arm, show a 3-second countdown, record, Ctrl+C to stop.

```bash
./screen-recorder
```

Skip the countdown and start immediately:

```bash
./screen-recorder --now
```

Auto-stop after a duration:

```bash
./screen-recorder --now --duration 30s
```

Pick the output path:

```bash
./screen-recorder --now --duration 1m --output ~/Desktop/recording.mp4
```

Enumerate displays (the index is what `--display` takes):

```bash
./screen-recorder --list-displays
```

Run the readiness check (records 2s, verifies with ffprobe, prints `OK`):

```bash
./screen-recorder --self-test
```

For the full flag list: `./screen-recorder --help`.

## Output

The MP4 lands wherever `--output` points (default `./recordings/recording-<timestamp>.mp4`). A JSON sidecar with recording metadata lands next to it (same basename, `.json` extension). Pass `--no-sidecar` to skip the sidecar. Default filenames auto-suffix `-1`, `-2`, ... on collision; an explicit `--output` errors on collision rather than overwriting.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | generic error |
| 2 | ffmpeg not found on PATH |
| 3 | Screen Recording permission denied |
| 4 | invalid flags |

## Known limitations

- **Effective fps is lower than requested.** On macOS, `kbinani/screenshot` can only sustain roughly 24 fps at the display's native resolution. Requesting `--fps 30` delivers about 80% of the requested duration: a 10 s recording comes out around 8 s. The MP4 still declares 30 fps; ffprobe will report the wall-clock duration. If exact duration matters, use `--fps 24`.
- **No audio.** This tool records video only. Pair it with a separate audio recorder.
- **No pause/resume.** One invocation produces one continuous file. To "pause", stop and start a new recording and concatenate later.
- **macOS only for actual capture.** Builds on Linux and Windows but capture is macOS-tested. (The `kbinani/screenshot` library supports other platforms; I just haven't.)
- **No retry on transient errors.** If kbinani returns one bad frame, the recording aborts. Frame-level retry would be a future addition.
