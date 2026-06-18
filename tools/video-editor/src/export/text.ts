import type { TextOverlay } from '../types'

// Escape a string for safe inclusion in an ffmpeg drawtext filter. The
// text appears inside single quotes; we need to escape backslashes and
// single quotes so ffmpeg doesn't mis-parse the filter.
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')   // backslash -> double backslash
    .replace(/'/g, "\\'")     // single quote -> escaped quote
    .replace(/:/g, '\\:')     // colon -> escaped (defensive)
    .replace(/%/g, '\\%')      // percent -> escaped (drawtext expansion)
}

// Build the drawtext filter for a single text overlay. The output is a
// single -vf fragment that can be joined with other filters by comma.
export function buildDrawtextFilter(t: TextOverlay, fontFile: string): string {
  const text = escapeDrawtext(t.content)
  const size = Math.max(8, Math.min(400, Math.round(t.fontSize)))
  const color = t.color || 'white'

  // Position math: anchor the text to top/center/bottom. ffmpeg's
  // drawtext x/y are the top-left of the text box; we use expressions
  // so the text is centered horizontally regardless of width.
  let yExpr: string
  if (t.position === 'top') {
    yExpr = `max(20\\, h*0.08)`   // 8% from top, with a 20px floor
  } else if (t.position === 'bottom') {
    yExpr = `h - text_h - max(20\\, h*0.08)`
  } else {
    // center
    yExpr = `(h - text_h) / 2`
  }
  const xExpr = `(w - text_w) / 2`

  return `drawtext=text='${text}':fontfile=${fontFile}:fontsize=${size}:fontcolor=${color}:x=${xExpr}:y=${yExpr}`
}
