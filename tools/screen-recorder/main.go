// Command screen-recorder captures the selected display to an MP4 file
// using ffmpeg as the encoder.
//
// Usage:
//
//	screen-recorder [flags]
//
// In its default mode it arms, shows a 3-second countdown, and starts
// recording. Ctrl+C stops and finalizes the file. The MP4 and a JSON
// sidecar with metadata land in ./recordings/ by default.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"time"

	"github.com/kbinani/screenshot"
)

// Exit codes returned to the shell. Stable; agents rely on them.
const (
	exitOK               = 0
	exitGenericError     = 1
	exitFFmpegMissing    = 2
	exitPermissionDenied = 3
	exitBadFlags         = 4
)

type flags struct {
	now          bool
	output       string
	duration     time.Duration
	display      int
	fps          int
	codec        string
	width        int
	height       int
	bitrate      string
	countdown    int
	quiet        bool
	noSidecar    bool
	listDisplays bool
	selfTest     bool
}

type exitError struct {
	code int
	err  error
}

func (e *exitError) Error() string { return e.err.Error() }
func (e *exitError) Unwrap() error { return e.err }

func parseFlags() (*flags, error) {
	f := &flags{}
	flag.BoolVar(&f.now, "now", false, "skip the arm + countdown, start recording immediately")
	flag.StringVar(&f.output, "output", "", "output file path (default: ./recordings/recording-<timestamp>.mp4)")
	flag.StringVar(&f.output, "o", "", "alias for --output")
	flag.DurationVar(&f.duration, "duration", 0, "auto-stop after this duration (e.g. 30s, 5m). 0 = run until Ctrl+C")
	flag.IntVar(&f.display, "display", 0, "display index (use --list-displays to see available)")
	flag.IntVar(&f.fps, "fps", 30, "frame rate (frames per second)")
	flag.StringVar(&f.codec, "codec", "h264", "video codec: h264 or h265")
	flag.IntVar(&f.width, "width", 0, "capture width in pixels (0 = native)")
	flag.IntVar(&f.height, "height", 0, "capture height in pixels (0 = native)")
	flag.StringVar(&f.bitrate, "bitrate", "", "video bitrate (e.g. 8M). empty = codec + resolution default")
	flag.IntVar(&f.countdown, "countdown", 3, "countdown seconds before recording starts (0 = skip)")
	flag.BoolVar(&f.quiet, "quiet", false, "suppress the per-second elapsed-time line")
	flag.BoolVar(&f.quiet, "q", false, "alias for --quiet")
	flag.BoolVar(&f.noSidecar, "no-sidecar", false, "skip writing the JSON sidecar")
	flag.BoolVar(&f.listDisplays, "list-displays", false, "print available displays as JSON and exit")
	flag.BoolVar(&f.selfTest, "self-test", false, "record 2s to a temp file, verify it opens with ffprobe, print OK or error")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "screen-recorder — capture the display to MP4 via ffmpeg\n\n")
		fmt.Fprintf(os.Stderr, "Usage of %s:\n", os.Args[0])
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExit codes:\n")
		fmt.Fprintf(os.Stderr, "  0  success\n")
		fmt.Fprintf(os.Stderr, "  1  generic error\n")
		fmt.Fprintf(os.Stderr, "  2  ffmpeg not found on PATH\n")
		fmt.Fprintf(os.Stderr, "  3  screen recording permission denied\n")
		fmt.Fprintf(os.Stderr, "  4  invalid flags\n")
	}

	flag.Parse()

	if f.fps <= 0 {
		return nil, fmt.Errorf("--fps must be positive, got %d", f.fps)
	}
	if f.codec != "h264" && f.codec != "h265" {
		return nil, fmt.Errorf("--codec must be h264 or h265, got %q", f.codec)
	}
	if f.countdown < 0 {
		return nil, fmt.Errorf("--countdown must be >= 0, got %d", f.countdown)
	}
	if f.width < 0 || f.height < 0 {
		return nil, fmt.Errorf("--width and --height must be >= 0")
	}

	return f, nil
}

// findFFmpeg returns the absolute path to ffmpeg, or an error with install
// instructions if it isn't on PATH.
func findFFmpeg() (string, error) {
	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", fmt.Errorf("ffmpeg not found on PATH\n\ninstall:\n  macOS:  brew install ffmpeg\n  Linux:  apt install ffmpeg (or equivalent)\n  verify: ffmpeg -version")
	}
	return path, nil
}

type displayInfo struct {
	Index     int    `json:"index"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Bounds    string `json:"bounds"`
	IsPrimary bool   `json:"is_primary"`
}

func listDisplays() error {
	n := screenshot.NumActiveDisplays()
	if n == 0 {
		return errors.New("no active displays found")
	}
	displays := make([]displayInfo, 0, n)
	for i := 0; i < n; i++ {
		b := screenshot.GetDisplayBounds(i)
		displays = append(displays, displayInfo{
			Index:     i,
			Width:     b.Dx(),
			Height:    b.Dy(),
			Bounds:    fmt.Sprintf("%d,%d %dx%d", b.Min.X, b.Min.Y, b.Dx(), b.Dy()),
			IsPrimary: i == 0,
		})
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(displays)
}

func main() {
	f, err := parseFlags()
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		fmt.Fprintln(os.Stderr, "try --help for usage")
		os.Exit(exitBadFlags)
	}

	if f.listDisplays {
		if err := listDisplays(); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(exitGenericError)
		}
		os.Exit(exitOK)
	}

	if _, err := findFFmpeg(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(exitFFmpegMissing)
	}

	// The recording path lands in the next commit. For now, scaffold only —
	// print the parsed flags so we can confirm parsing works end-to-end.
	fmt.Fprintf(os.Stderr, "screen recorder scaffold ready\n")
	fmt.Fprintf(os.Stderr, "  output:     %q\n", f.output)
	fmt.Fprintf(os.Stderr, "  duration:   %v\n", f.duration)
	fmt.Fprintf(os.Stderr, "  fps:        %d\n", f.fps)
	fmt.Fprintf(os.Stderr, "  codec:      %s\n", f.codec)
	fmt.Fprintf(os.Stderr, "  countdown:  %d\n", f.countdown)
}
