# voice-recorder

A small CLI that records the default microphone to WAV with a live VU meter. Built for my own use; intentionally minimal.

## Requirements

- **Python 3.11+**
- **portaudio** — install with `brew install portaudio` (macOS) or `apt install portaudio19-dev` (Linux).
- **Python deps** — `sounddevice`, `soundfile`, `numpy`. Install with:
  ```
  /opt/homebrew/bin/python3 -m pip install --break-system-packages sounddevice soundfile numpy
  ```
  (Drop `--break-system-packages` on Linux or if you use a venv.)
- **ffprobe** on PATH for `--self-test` (ships with ffmpeg).
- **macOS only:** grant Microphone permission to your terminal app at System Settings → Privacy & Security → Microphone.

## Run

The tool is a single-file Python script. No install step required:

```bash
cd tools/voice-recorder
/opt/homebrew/bin/python3 voice_recorder.py [flags]
```

For convenience, symlink or alias it:

```bash
ln -s "$(pwd)/voice_recorder.py" /usr/local/bin/voice-recorder
# then:
voice-recorder --now --duration 30s
```

Default: 3-second countdown with a live VU pre-roll, then record, Ctrl+C to stop.

## Usage

Skip the countdown and start immediately:

```bash
voice-recorder --now
```

Auto-stop after a duration:

```bash
voice-recorder --now --duration 30s
voice-recorder --now --duration 5m
```

Pick the input device (USB headset, AirPods, etc.):

```bash
voice-recorder --device "AirPods"
voice-recorder --device 1
```

Capture at 48kHz (when matching a 48kHz video timeline):

```bash
voice-recorder --now --duration 1m --sample-rate 48000
```

Enumerate input devices (use the index or name with `--device`):

```bash
voice-recorder --list-devices
```

Run the readiness check (records 1s, verifies with ffprobe, prints `OK`):

```bash
voice-recorder --self-test
```

For the full flag list: `voice-recorder --help`.

## Output

The WAV lands wherever `--output` points (default `./recordings/voice-<timestamp>.wav`). A JSON sidecar with recording metadata lands next to it (same basename, `.json` extension). Pass `--no-sidecar` to skip the sidecar. Default filenames auto-suffix `-1`, `-2`, ... on collision; an explicit `--output` errors on collision rather than overwriting.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | generic error |
| 2 | reserved (not used; ffmpeg is not a dep of this tool) |
| 3 | any microphone issue: no device, permission denied, device busy |
| 4 | invalid flags |

## VU meter

A 30-character ASCII bar (`█` filled, `░` empty) with a peak-hold marker (`│`). Updates at 20fps, in place, with a hidden cursor during recording. dB scale: -60 (silent) to 0 (clipping), log-mapped. Use `--quiet` to suppress.

## Known limitations

- **No audio post-processing.** No noise gate, no normalization, no silence trim. The recorder captures; the video editor (tool #3) handles the rest.
- **Channels and bit depth are fixed** (mono, 16-bit). Adding a flag for either is YAGNI; if you need them, the editor can convert.
- **The VU meter uses ANSI escape codes.** Works in iTerm, Terminal.app, and most Linux terminals. Some embedded terminals strip them; the meter just won't update in place.
- **macOS only for actual capture.** Builds and `--list-devices` work on Linux and Windows; capture is macOS-tested.
- **First-launch permission.** macOS prompts the first time; the tool exits with code 3 and instructions if permission is denied.
