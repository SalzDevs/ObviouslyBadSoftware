"""Voice recorder CLI: captures microphone audio to WAV via sounddevice.

Usage:

    voice-recorder [flags]

Default: 3s countdown with a live VU pre-roll, then record, Ctrl+C to
stop. The WAV and a JSON sidecar land in ./recordings/ by default.
"""
import argparse
import json
import os
import sys
from datetime import datetime

import sounddevice as sd

__version__ = "0.1.0"

# Exit codes, stable for agentic use.
EXIT_OK = 0
EXIT_GENERIC = 1
EXIT_FFMPEG_MISSING = 2  # reserved, not used by this tool
EXIT_MIC_ISSUE = 3
EXIT_BAD_FLAGS = 4


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

    print("voice recorder scaffold ready (no recording yet — coming next commit)")
    print(f"  device:      {device_info['name']} (index {device_idx})")
    print(f"  sample rate: {args.sample_rate}")
    print(f"  duration:    {duration}s")
    print(f"  output:      {output_path}")
    print(f"  countdown:   {args.countdown}s")


if __name__ == "__main__":
    main()
