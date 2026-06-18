// Command screen-recorder captures the selected display to an MP4 file
// using ffmpeg as the encoder.
//
// Usage:
//
//	screen-recorder [flags]
//
// In its default mode it arms, shows a 3-second countdown, and starts
// recording. Ctrl+C stops and finalizes the file. The MP4 lands in
// ./recordings/ by default.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
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

// resolveOutputPath returns the final output path. If the user passed an
// explicit --output, use it (error if it already exists). Otherwise generate
// a timestamped filename in ./recordings/ and auto-suffix on collision.
func resolveOutputPath(explicit string) (string, error) {
	if explicit != "" {
		if _, err := os.Stat(explicit); err == nil {
			return "", fmt.Errorf("output file already exists: %s", explicit)
		}
		return explicit, nil
	}
	if err := os.MkdirAll("recordings", 0o755); err != nil {
		return "", fmt.Errorf("create recordings dir: %w", err)
	}
	base := fmt.Sprintf("recording-%s.mp4", time.Now().Format("2006-01-02T15-04-05"))
	candidate := filepath.Join("recordings", base)
	for i := 1; ; i++ {
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate, nil
		}
		ext := filepath.Ext(base)
		stem := strings.TrimSuffix(base, ext)
		candidate = filepath.Join("recordings", fmt.Sprintf("%s-%d%s", stem, i, ext))
	}
}

// defaultBitrate returns a sensible bitrate for the given codec and resolution.
func defaultBitrate(codec string, w, h int) string {
	pixels := w * h
	switch {
	case pixels >= 3840*2160:
		if codec == "h265" {
			return "12M"
		}
		return "24M"
	case pixels >= 1920*1080:
		if codec == "h265" {
			return "4M"
		}
		return "8M"
	default:
		if codec == "h265" {
			return "2M"
		}
		return "4M"
	}
}

// ffmpegArgs returns the argv for the ffmpeg subprocess. Raw RGBA frames
// (kbinani/screenshot's image.RGBA byte order) are piped on stdin and
// ffmpeg transcodes to the chosen codec.
func ffmpegArgs(output string, w, h, fps int, codec, bitrate string) []string {
	var codecName, pixFmt string
	switch codec {
	case "h264":
		codecName = "libx264"
		pixFmt = "yuv420p"
	case "h265":
		codecName = "libx265"
		pixFmt = "yuv420p10le"
	}
	args := []string{
		"-y",
		"-f", "rawvideo",
		"-pix_fmt", "rgba",
		"-s", fmt.Sprintf("%dx%d", w, h),
		"-r", strconv.Itoa(fps),
		"-i", "pipe:0",
		"-c:v", codecName,
		"-preset", "veryfast",
		"-pix_fmt", pixFmt,
	}
	if bitrate != "" {
		args = append(args, "-b:v", bitrate)
	}
	args = append(args,
		"-movflags", "+faststart",
		"-an",
		output,
	)
	return args
}

// runRecord captures the selected display and pipes frames to ffmpeg.
func runRecord(f *flags) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Ctrl+C cancels the whole pipeline.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)
	go func() {
		select {
		case <-ctx.Done():
			return
		case sig := <-sigCh:
			fmt.Fprintf(os.Stderr, "\nreceived %s, finalizing...\n", sig)
			cancel()
		}
	}()

	// Countdown.
	if f.countdown > 0 && !f.now {
		fmt.Fprintf(os.Stderr, "starting in %d seconds... (Ctrl+C to cancel)\n", f.countdown)
		for i := f.countdown; i > 0; i-- {
			fmt.Fprintf(os.Stderr, "%d...\n", i)
			select {
			case <-time.After(time.Second):
			case <-ctx.Done():
				fmt.Fprintln(os.Stderr, "cancelled")
				return nil
			}
		}
	}

	ffmpegPath, err := findFFmpeg()
	if err != nil {
		return &exitError{code: exitFFmpegMissing, err: err}
	}

	bounds := screenshot.GetDisplayBounds(f.display)
	w, h := bounds.Dx(), bounds.Dy()
	if f.width > 0 && f.height > 0 {
		w, h = f.width, f.height
	}

	outputPath, err := resolveOutputPath(f.output)
	if err != nil {
		return &exitError{code: exitGenericError, err: err}
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return &exitError{code: exitGenericError, err: fmt.Errorf("create output dir: %w", err)}
	}

	bitrate := f.bitrate
	if bitrate == "" {
		bitrate = defaultBitrate(f.codec, w, h)
	}

	args := ffmpegArgs(outputPath, w, h, f.fps, f.codec, bitrate)
	ffmpeg := exec.Command(ffmpegPath, args...)
	var ffmpegStderr bytes.Buffer
	ffmpeg.Stderr = &ffmpegStderr

	stdin, err := ffmpeg.StdinPipe()
	if err != nil {
		return &exitError{code: exitGenericError, err: fmt.Errorf("ffmpeg stdin: %w", err)}
	}
	if err := ffmpeg.Start(); err != nil {
		return &exitError{code: exitGenericError, err: fmt.Errorf("start ffmpeg: %w", err)}
	}

	fmt.Fprintf(os.Stderr, "recording %dx%d @ %dfps (%s) to %s\n", w, h, f.fps, f.codec, outputPath)
	recordingStart := time.Now()

	// Auto-stop after --duration.
	if f.duration > 0 {
		go func() {
			select {
			case <-time.After(f.duration):
				cancel()
			case <-ctx.Done():
			}
		}()
	}

	// Per-second elapsed-time line.
	if !f.quiet {
		go func() {
			t := time.NewTicker(time.Second)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					elapsed := time.Since(recordingStart).Round(time.Second)
					fmt.Fprintf(os.Stderr, "  elapsed: %s\n", elapsed)
				}
			}
		}()
	}

	// Capture loop. The ticker enforces the frame rate; we drop frames on
	// slow captures rather than buffering so wall-clock time matches the
	// recording's duration.
	tickInterval := time.Second / time.Duration(f.fps)
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	capture := func() error {
		img, err := screenshot.CaptureRect(bounds)
		if err != nil {
			return fmt.Errorf("capture: %w", err)
		}
		if _, err := stdin.Write(img.Pix); err != nil {
			return fmt.Errorf("write frame: %w", err)
		}
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			stdin.Close()
			if err := ffmpeg.Wait(); err != nil {
				fmt.Fprintf(os.Stderr, "ffmpeg failed: %v\n%s\n", err, ffmpegStderr.String())
				return &exitError{code: exitGenericError, err: err}
			}
			fmt.Fprintf(os.Stderr, "saved to %s (%s)\n", outputPath, time.Since(recordingStart).Round(time.Second))
			fmt.Println(outputPath)
			return nil
		case <-ticker.C:
			if err := capture(); err != nil {
				stdin.Close()
				ffmpeg.Wait()
				return &exitError{code: exitGenericError, err: err}
			}
		}
	}
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

	if f.selfTest {
		// Not implemented yet. Will land in a follow-up commit.
		fmt.Fprintln(os.Stderr, "error: --self-test not yet implemented")
		os.Exit(exitGenericError)
	}

	if err := runRecord(f); err != nil {
		if ee, ok := err.(*exitError); ok {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(ee.code)
		}
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(exitGenericError)
	}
}
