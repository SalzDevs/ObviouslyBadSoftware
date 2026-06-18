"""Voice recorder CLI: captures microphone audio to WAV via sounddevice.

Usage:

    voice-recorder [flags]

Default: 3s countdown with a live VU pre-roll, then record, Ctrl+C to
stop. The WAV and a JSON sidecar land in ./recordings/ by default.
"""
import argparse
import json
import os
import queue
import signal
import sys
import threading
import time
from datetime import datetime

import numpy as np
import sounddevice as sd
import soundfile as sf

__version__ = "0.1.0"

# Exit codes, stable for agentic use.
EXIT_OK = 0
EXIT_GENERIC = 1
EXIT_FFMPEG_MISSING = 2  # reserved, not used by this tool
EXIT_MIC_ISSUE = 3
EXIT_BAD_FLAGS = 4

# Audio format constants (channels and bit depth are fixed; only sample rate
# and device are configurable via flags).
CHANNELS = 1
SUBTYPE = "PCM_16"
DTYPE = "int16"
BLOCK_SIZE = 1024  # frames per audio callback (~23ms at 44.1kHz)

# VU meter config
VU_WIDTH = 30
VU_DB_FLOOR = -60.0
VU_DB_CEIL = 0.0
VU_PEAK_HOLD_FRAMES = 3      # 150ms hold before decay starts
VU_PEAK_DECAY_PER_FRAME = 2.0 # dB per render frame; 30 frames ≈ 1.5s tail
VU_TARGET_FPS = 20


def parse_flags(argv=None):
    parser = argparse.ArgumentParser(
        prog="voice-recorder",
        description="Capture microphone audio to WAV with a live VU meter.",
    )
    parser.add_argument("--now", action="store_true",
                        help="skip the 3s countdown, start recording immediately")
    parser.add_argument("--output", "-o", default="",
                        help="output WAV path (default: ./recordings/voice-<timestamp>.wav)")
    parser.add_argument("--duration", type=str, default="0",
                        help="auto-stop after this duration (e.g. 30s, 5m). 0 = run until Ctrl+C")
    parser.add_argument("--device", default=None,
                        help="input device name or index (--list-devices to enumerate)")
    parser.add_argument("--sample-rate", type=int, default=44100,
                        help="capture sample rate in Hz (default 44100)")
    parser.add_argument("--countdown", type=int, default=3,
                        help="countdown seconds before recording starts (0 = skip)")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="suppress the VU meter")
    parser.add_argument("--no-sidecar", action="store_true",
                        help="skip writing the JSON sidecar")
    parser.add_argument("--list-devices", action="store_true",
                        help="print available input devices as JSON and exit")
    parser.add_argument("--self-test", action="store_true",
                        help="record 1s to a temp file, verify, print OK or error")
    return parser.parse_args(argv)


def parse_duration(s):
    """Parse '30s' / '5m' / '1h' / '500ms' into seconds. '0' or '' = no auto-stop."""
    s = s.strip().lower()
    if s in ("0", ""):
        return 0.0
    if s.endswith("ms"):
        try:
            return float(s[:-2]) / 1000.0
        except ValueError:
            raise ValueError(f"invalid duration: {s!r}")
    unit = s[-1]
    try:
        n = float(s[:-1])
    except ValueError:
        raise ValueError(f"invalid duration: {s!r}")
    if unit == "s":
        return n
    if unit == "m":
        return n * 60
    if unit == "h":
        return n * 3600
    raise ValueError(f"invalid duration unit (use s, m, h, or ms): {s!r}")


def resolve_output_path(explicit):
    """Return the final WAV path. Default: timestamped file in ./recordings/
    with auto-suffix on collision. Explicit --output: error on collision."""
    if explicit:
        if os.path.exists(explicit):
            raise FileExistsError(f"output file already exists: {explicit}")
        return explicit
    os.makedirs("recordings", exist_ok=True)
    base = f"voice-{datetime.now().strftime('%Y-%m-%dT%H-%M-%S')}.wav"
    candidate = os.path.join("recordings", base)
    i = 1
    while os.path.exists(candidate):
        stem, ext = os.path.splitext(base)
        candidate = os.path.join("recordings", f"{stem}-{i}{ext}")
        i += 1
    return candidate


def list_devices():
    """Print input devices as JSON to stdout. Returns True on success."""
    devices = sd.query_devices()
    inputs = []
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            inputs.append({
                "index": i,
                "name": d["name"],
                "channels": d["max_input_channels"],
                "default_samplerate": d["default_samplerate"],
            })
    if not inputs:
        print("no input devices found", file=sys.stderr)
        return False
    print(json.dumps(inputs, indent=2))
    return True


def resolve_device(spec):
    """Resolve a --device argument (name or index) to (index, info)."""
    if spec is None:
        idx = sd.default.device[0]
        if idx is None or idx < 0:
            raise ValueError("no default input device")
        return idx, sd.query_devices(idx)
    # Try as index
    try:
        idx = int(spec)
        info = sd.query_devices(idx)
        if info["max_input_channels"] < 1:
            raise ValueError(f"device {idx} ({info['name']!r}) is not an input device")
        return idx, info
    except ValueError as e:
        if "not an input device" in str(e) or "invalid device" in str(e):
            raise
    # Match by name (case-insensitive substring)
    devices = sd.query_devices()
    matches = []
    needle = spec.lower()
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0 and needle in d["name"].lower():
            matches.append((i, d))
    if not matches:
        raise ValueError(f"no input device matching {spec!r}")
    if len(matches) > 1:
        names = ", ".join(f"{i}: {d['name']}" for i, d in matches)
        raise ValueError(f"ambiguous device {spec!r}; matches: {names}")
    return matches[0]


def render_vu(db, peak_db, width=VU_WIDTH):
    """Render a single VU meter line in place on the terminal.

    db is the current RMS in dBFS; peak_db is the held peak (may be lower
    than db if a louder frame was just captured). Uses \r + ANSI clear-line
    so the same line overwrites itself on each call.
    """
    def to_pos(d):
        if d <= VU_DB_FLOOR:
            return 0
        if d >= VU_DB_CEIL:
            return width
        return int((d - VU_DB_FLOOR) / (VU_DB_CEIL - VU_DB_FLOOR) * width)

    cur = to_pos(db)
    peak = to_pos(peak_db)
    parts = []
    for i in range(width):
        if i < cur:
            parts.append("█")
        elif i == peak and peak > cur:
            parts.append("│")
        else:
            parts.append("░")
    sys.stdout.write("\r\x1b[2K[" + "".join(parts) + f"] {db:6.1f} dB")
    sys.stdout.flush()


def run_record(args, device_idx, device_info, output_path, duration):
    """Capture microphone audio to WAV. Blocks until duration expires or
    the user hits Ctrl+C. Returns the wall-clock recording duration."""
    q = queue.Queue()
    stop_event = threading.Event()

    def handle_signal(sig, frame):
        stop_event.set()
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    def callback(indata, frames, time_info, status):
        if status:
            # Input overflow or similar — surface it but don't stop.
            print(f"\raudio status: {status}", file=sys.stderr, end="\n")
        q.put(indata.copy())

    # VU state (mutable dict so the helper can update it)
    vu = {"peak_db": VU_DB_FLOOR, "frames_since_peak": VU_PEAK_HOLD_FRAMES,
          "next_render": time.monotonic()}

    def process_frame(data):
        """Write to WAV if recording has started, then update the VU meter."""
        if recording_started.is_set():
            wav.write(data)
        if args.quiet:
            return
        rms = float(np.sqrt(np.mean(data.astype(np.float32) ** 2)))
        db = 20.0 * np.log10(rms / 32768.0) if rms > 0 else VU_DB_FLOOR
        now = time.monotonic()
        if now < vu["next_render"]:
            return
        if db > vu["peak_db"]:
            vu["peak_db"] = db
            vu["frames_since_peak"] = 0
        elif vu["frames_since_peak"] < VU_PEAK_HOLD_FRAMES:
            vu["frames_since_peak"] += 1
        else:
            vu["peak_db"] = max(VU_DB_FLOOR, vu["peak_db"] - VU_PEAK_DECAY_PER_FRAME)
        render_vu(db, vu["peak_db"])
        vu["next_render"] = now + 1.0 / VU_TARGET_FPS

    recording_started = threading.Event()
    started_at = None
    wav = None

    stream = sd.InputStream(
        samplerate=args.sample_rate,
        device=device_idx,
        channels=CHANNELS,
        dtype=DTYPE,
        blocksize=BLOCK_SIZE,
        callback=callback,
    )
    try:
        with stream:
            if not args.quiet:
                sys.stdout.write("\x1b[?25l")  # hide cursor
                sys.stdout.flush()

            # Countdown phase: open the mic, show the VU meter, but don't
            # write to the WAV. Lets the user see the level before talking.
            if not args.now and args.countdown > 0 and not stop_event.is_set():
                sys.stderr.write(f"starting in {args.countdown} seconds... (Ctrl+C to cancel)\n")
                for i in range(args.countdown, 0, -1):
                    if stop_event.is_set():
                        break
                    sys.stderr.write(f"  {i}...\n")
                    sys.stderr.flush()
                    end = time.monotonic() + 1.0
                    while time.monotonic() < end and not stop_event.is_set():
                        try:
                            data = q.get(timeout=0.05)
                            process_frame(data)
                        except queue.Empty:
                            pass
                # Drop any pre-roll audio so the WAV doesn't start with a
                # quarter-second of countdown silence.
                while not q.empty():
                    try:
                        q.get_nowait()
                    except queue.Empty:
                        break

            if stop_event.is_set():
                # Cancelled during countdown — no WAV was ever opened.
                if not args.quiet:
                    sys.stdout.write("\x1b[?25h\n")
                sys.stderr.write("cancelled\n")
                return None, EXIT_OK

            # Now open the WAV and start the duration timer.
            wav = sf.SoundFile(
                output_path, mode="w",
                samplerate=args.sample_rate,
                channels=CHANNELS,
                subtype=SUBTYPE,
            )
            if duration > 0:
                threading.Timer(duration, stop_event.set).start()
            started_at = time.monotonic()
            recording_started.set()

            # Recording loop
            while not stop_event.is_set():
                try:
                    data = q.get(timeout=0.05)
                except queue.Empty:
                    continue
                process_frame(data)

            # Drain anything the callback put on the queue after stop.
            while True:
                try:
                    data = q.get_nowait()
                except queue.Empty:
                    break
                wav.write(data)
    except sd.PortAudioError as e:
        if not args.quiet:
            sys.stdout.write("\x1b[?25h\n")
            sys.stdout.flush()
        print(f"error: audio device error: {e}", file=sys.stderr)
        for path in (output_path, output_path + ".json"):
            try:
                os.remove(path)
            except OSError:
                pass
        return None, EXIT_MIC_ISSUE
    finally:
        if not args.quiet:
            sys.stdout.write("\x1b[?25h\n")
            sys.stdout.flush()
        if wav is not None:
            wav.close()
        signal.signal(signal.SIGINT, signal.SIG_DFL)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)

    if started_at is None:
        return None, EXIT_OK
    return time.monotonic() - started_at, EXIT_OK


def main(argv=None):
    args = parse_flags(argv)

    if args.list_devices:
        if not list_devices():
            sys.exit(EXIT_MIC_ISSUE)
        sys.exit(EXIT_OK)

    if args.self_test:
        print("error: --self-test not yet implemented", file=sys.stderr)
        sys.exit(EXIT_GENERIC)

    # Validate flags
    if args.sample_rate <= 0:
        print(f"error: --sample-rate must be positive, got {args.sample_rate}", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)
    if args.countdown < 0:
        print(f"error: --countdown must be >= 0, got {args.countdown}", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)

    # Parse duration
    try:
        duration = parse_duration(args.duration)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)

    # Resolve device
    try:
        device_idx, device_info = resolve_device(args.device)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)

    # Resolve output path
    try:
        output_path = resolve_output_path(args.output)
    except FileExistsError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(EXIT_GENERIC)

    print(f"recording {device_info['name']} @ {args.sample_rate}Hz to {output_path}")
    actual, code = run_record(args, device_idx, device_info, output_path, duration)
    if code != EXIT_OK:
        sys.exit(code)
    print(f"saved to {output_path} ({actual:.1f}s)")
    print(output_path)
    sys.exit(EXIT_OK)


if __name__ == "__main__":
    main()
