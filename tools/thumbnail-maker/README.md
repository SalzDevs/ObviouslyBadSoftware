# thumbnail-maker

A small CLI that generates a 1280x720 YouTube thumbnail in SalzDevs style: black background, bold white title at the top, optional green code snippet at the bottom, optional logo in the top-left. Uses Pillow. Built for my own use; intentionally minimal.

## Requirements

- **Python 3.11+**
- **Pillow** — `pip install Pillow` (or `pip install --break-system-packages Pillow` on a fresh Homebrew Python).

That's it. The tool falls back to system fonts (Arial Bold on macOS, DejaVu Bold on Linux) when Inter / JetBrains Mono aren't found locally. No network access required for normal use.

## Run

```bash
cd tools/thumbnail-maker
/opt/homebrew/bin/python3 thumbnail_maker.py --title "Hello world" --output thumb.png
```

Symlink or alias for convenience:

```bash
ln -s "$(pwd)/thumbnail_maker.py" /usr/local/bin/thumbnail-maker
thumbnail-maker --title "Hello world" --output thumb.png
```

## Usage

Minimum: title + output path.

```bash
thumbnail-maker --title "v0.1.0" --output thumb.png
```

Add an optional code snippet (multi-line, monospace, green):

```bash
thumbnail-maker --title "OBVIOUSLY BAD" --code '
$ git push
Permission denied
$ ' --output thumb.png
```

Add an optional logo (PNG with alpha; resized to fit 140×140 in the top-left):

```bash
thumbnail-maker --title "SalzDevs" --logo ./salzdevs-logo.png --output thumb.png
```

Override the default fonts:

```bash
thumbnail-maker --title "Custom" \
  --title-font ~/fonts/Inter-Bold.ttf \
  --code-font ~/fonts/JetBrainsMono-Regular.ttf \
  --output thumb.png
```

Run the readiness check (writes a test thumbnail, prints the path):

```bash
thumbnail-maker --self-test
```

For the full flag list: `thumbnail-maker --help`.

## Output

- 1280×720 PNG (YouTube recommended thumbnail size)
- Black background
- Title in bold white, top-center, ~120pt; wraps to multiple lines if longer than ~4 words
- Code (if `--code` is set) in monospace green, bottom-left, multi-line
- Logo (if `--logo` is set) in the top-left, ~140×140

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | generic error |
| 4 | invalid flags |

## Default font fallback

In priority order, the tool tries:

- **Title:** `Inter-Bold.ttf` (local / `~/.cache/...`) → `Arial Bold.ttf` (macOS) → `DejaVuSans-Bold.ttf` (Linux).
- **Code:** `JetBrainsMono-Regular.ttf` (local / `~/.cache/...`) → `Andale Mono.ttf` (macOS) → `Menlo.ttc` (macOS) → `DejaVuSansMono.ttf` (Linux).

To use a specific font, pass `--title-font` / `--code-font` with the path to a TTF/OTF. To install Inter / JetBrains Mono permanently:

```bash
brew tap homebrew/cask-fonts
brew install --cask font-inter font-jetbrains-mono
```

## Known limitations

- **Title length is enforced by you, not the tool.** The spec says 1-4 words. Longer titles wrap to multiple lines and can overflow the thumbnail. Pass a longer title and you'll see why.
- **No font auto-download.** The tool uses whatever is on disk. If neither Inter nor Arial Bold is found, it falls back to Pillow's tiny default bitmap font, which looks bad. Install a font or pass `--title-font`.
- **No logo generation.** Pass your own PNG. There's no built-in "SalzDevs" logo because the project is a tool, not a brand.
- **No color customization.** The SalzDevs palette (black / white / green) is baked in. If you want a different scheme, edit the constants in `thumbnail_maker.py` — the relevant lines are at the top of the file.
- **macOS-only for actual use.** Builds and runs on Linux/Windows; the macOS font paths in `TITLE_FONT_PATHS` / `CODE_FONT_PATHS` will simply be skipped on those platforms, falling through to the Linux paths or the default.
