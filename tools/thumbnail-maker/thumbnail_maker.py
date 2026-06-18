"""Thumbnail maker CLI: generate a 1280x720 YouTube thumbnail with
SalzDevs-style defaults (black background, bold white title, optional
green code snippet, optional top-left logo). Uses Pillow for rendering.

Usage:
    thumbnail_maker.py --title "Hello world" --output thumb.png
    thumbnail_maker.py --title "v0.1" --code "git tag v0.1" --output out.png
    thumbnail_maker.py --self-test   # writes /tmp/thumbnail-selftest.png
"""
import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

__version__ = "0.1.0"

# Exit codes, stable for agentic use.
EXIT_OK = 0
EXIT_GENERIC = 1
EXIT_BAD_FLAGS = 4

# Thumbnail geometry. YouTube's recommended thumb size is 1280x720.
THUMBNAIL_SIZE = (1280, 720)

# Title font: ~120pt, white, bold, top-center.
TITLE_FONT_SIZE = 120
TITLE_COLOR = (255, 255, 255)
TITLE_TOP_MARGIN = 200
TITLE_SIDE_PADDING = 80
TITLE_LINE_GAP = 16

# Code snippet: ~28pt, terminal green, bottom area, monospace block.
CODE_FONT_SIZE = 28
CODE_LINE_HEIGHT = 40
CODE_COLOR = (56, 220, 80)         # terminal green
CODE_SIDE_PADDING = 60
CODE_BOTTOM_MARGIN = 100

# Logo: composited in the top-left if --logo is provided.
LOGO_TARGET_SIZE = (140, 140)
LOGO_PADDING = 32

# Background.
BG_COLOR = (0, 0, 0)

# Font search paths, in priority order. The first existing path is used.
# We try Inter Bold → Arial Bold (macOS fallback) → DejaVu Bold (Linux
# fallback) for the title; the same idea for the code font.
TITLE_FONT_PATHS = [
    "Inter-Bold.ttf",
    "fonts/Inter-Bold.ttf",
    str(Path.home() / ".cache/salzdevs-thumbnail-maker/Inter-Bold.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]

CODE_FONT_PATHS = [
    "JetBrainsMono-Regular.ttf",
    "fonts/JetBrainsMono-Regular.ttf",
    str(Path.home() / ".cache/salzdevs-thumbnail-maker/JetBrainsMono-Regular.ttf"),
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]


def find_font(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def load_font(paths, size, role):
    found = find_font(paths)
    if found:
        try:
            return ImageFont.truetype(found, size)
        except Exception as e:
            print(f"warning: failed to load {role} font {found!r}: {e}", file=sys.stderr)
    print(
        f"warning: no {role} font found (tried {len(paths)} paths); using Pillow default. "
        f"Pass --{role}-font to override.",
        file=sys.stderr,
    )
    return ImageFont.load_default()


def wrap_text(text, font, max_width, draw):
    """Wrap text to fit max_width pixels. Splits on whitespace; honors
    hard line breaks (\\n) in the input."""
    out = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            out.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = current + " " + word
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current = candidate
            else:
                out.append(current)
                current = word
        out.append(current)
    return out


def render_title(draw, text, font):
    """Draw the title centered horizontally near the top. Returns the y
    position where the title block ends (for layout reference)."""
    max_w = THUMBNAIL_SIZE[0] - 2 * TITLE_SIDE_PADDING
    lines = wrap_text(text, font, max_w, draw)
    line_h = TITLE_FONT_SIZE + TITLE_LINE_GAP
    y = TITLE_TOP_MARGIN
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_w = bbox[2] - bbox[0]
        x = (THUMBNAIL_SIZE[0] - text_w) // 2
        draw.text((x, y), line, font=font, fill=TITLE_COLOR)
        y += line_h
    return y


def render_code(draw, text, font):
    """Draw the code snippet at the bottom, left-aligned with a side pad.
    Multi-line text is preserved."""
    lines = text.split("\n")
    total_h = len(lines) * CODE_LINE_HEIGHT
    y = THUMBNAIL_SIZE[1] - CODE_BOTTOM_MARGIN - total_h
    for line in lines:
        draw.text((CODE_SIDE_PADDING, y), line, font=font, fill=CODE_COLOR)
        y += CODE_LINE_HEIGHT


def render_logo(img, logo_path):
    """Composite a logo PNG in the top-left. Resized to LOGO_TARGET_SIZE
    while preserving aspect ratio; preserves alpha for proper compositing."""
    logo = Image.open(logo_path).convert("RGBA")
    logo.thumbnail(LOGO_TARGET_SIZE, Image.Resampling.LANCZOS)
    img.paste(logo, (LOGO_PADDING, LOGO_PADDING), logo)


def make_thumbnail(title, code, output, logo, title_font_path=None, code_font_path=None):
    img = Image.new("RGB", THUMBNAIL_SIZE, BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_paths = [title_font_path] if title_font_path else TITLE_FONT_PATHS
    code_paths = [code_font_path] if code_font_path else CODE_FONT_PATHS
    title_font = load_font(title_paths, TITLE_FONT_SIZE, "title")
    code_font = load_font(code_paths, CODE_FONT_SIZE, "code")

    render_title(draw, title, title_font)

    if code:
        render_code(draw, code, code_font)

    if logo:
        try:
            render_logo(img, logo)
        except Exception as e:
            print(f"warning: failed to load logo {logo!r}: {e}", file=sys.stderr)

    # Ensure the output directory exists, then save.
    out_dir = os.path.dirname(os.path.abspath(output))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    img.save(output, "PNG", optimize=True)
    print(f"saved: {output}")


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="thumbnail-maker",
        description="Generate a 1280x720 YouTube thumbnail (SalzDevs style).",
    )
    parser.add_argument("--title", help="title text (1-4 words, wraps if longer)")
    parser.add_argument("--code", default=None, help="optional code snippet, multi-line")
    parser.add_argument("--output", "-o", help="output PNG path")
    parser.add_argument("--logo", default=None, help="optional logo image (PNG with alpha)")
    parser.add_argument("--title-font", default=None, help="path to a TTF/OTF for the title (overrides default)")
    parser.add_argument("--code-font", default=None, help="path to a TTF/OTF for the code (overrides default)")
    parser.add_argument("--self-test", action="store_true",
                        help="generate a test thumbnail at /tmp/thumbnail-selftest.png and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        make_thumbnail(
            title="Self Test",
            code="# hello from\n# thumbnail-maker",
            output="/tmp/thumbnail-selftest.png",
            logo=None,
        )
        sys.exit(EXIT_OK)

    if not args.title:
        print("error: --title is required (or use --self-test)", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)
    if not args.output:
        print("error: --output is required (or use --self-test)", file=sys.stderr)
        sys.exit(EXIT_BAD_FLAGS)

    make_thumbnail(
        title=args.title,
        code=args.code,
        output=args.output,
        logo=args.logo,
        title_font_path=args.title_font,
        code_font_path=args.code_font,
    )
    sys.exit(EXIT_OK)


if __name__ == "__main__":
    main()
