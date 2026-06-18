import type { Clip, Project } from '../types'
import { buildDrawtextFilter } from './text'

// Pure functions that build ffmpeg invocations from a Project. The same
// functions are used by the web app (ffmpeg.wasm) and the CLI (system
// ffmpeg), so a change to the pipeline automatically benefits both.

export const FONT_FILENAME = 'Inter-Regular.ttf'
export const FPS = 30

// Per-clip args: trim, fade in/out (video + audio), burn in text
// overlay. Audio fade is applied even though the recorder has no audio,
// because future versions might and the ffmpeg call handles it cheaply.
export function buildTrimFadeArgs(clip: Clip, index: number): string[] {
  const inName = `input_${index}.mp4`
  const outName = `clip_${index}.mp4`
  const dur = clip.trimEnd - clip.trimStart
  const fadeOutStart = Math.max(0, dur - clip.fadeOut)

  const videoFilters: string[] = []
  if (clip.fadeIn > 0) {
    videoFilters.push(`fade=in:0:${Math.round(clip.fadeIn * FPS)}`)
  }
  if (clip.fadeOut > 0) {
    videoFilters.push(`fade=out:${Math.round(fadeOutStart * FPS)}:${Math.round(clip.fadeOut * FPS)}`)
  }
  if (clip.text && clip.text.content) {
    videoFilters.push(buildDrawtextFilter(clip.text, FONT_FILENAME))
  }

  const args: string[] = [
    '-y',
    '-i', inName,
    '-ss', clip.trimStart.toFixed(3),
    '-to', clip.trimEnd.toFixed(3),
  ]

  if (videoFilters.length > 0) {
    args.push('-vf', videoFilters.join(','))
  }

  // Audio fades (applies even if input has no audio — ffmpeg ignores).
  const audioFilters: string[] = []
  if (clip.fadeIn > 0) {
    audioFilters.push(`afade=in:st=0:d=${clip.fadeIn.toFixed(3)}`)
  }
  if (clip.fadeOut > 0) {
    audioFilters.push(`afade=out:st=${fadeOutStart.toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`)
  }
  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','))
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    outName,
  )
  return args
}

// Build the contents of a concat list file for ffmpeg's concat demuxer.
// Each line is `file 'clip_N.mp4'`.
export function buildConcatList(project: Project): string {
  return project.clips.map((_, i) => `file 'clip_${i}.mp4'`).join('\n') + '\n'
}

// Concat all per-clip outputs into a single video. Stream-copy so we
// don't re-encode (faster, no quality loss).
export function buildConcatArgs(): string[] {
  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat_list.txt',
    '-c', 'copy',
    'output.mp4',
  ]
}

// Mix the project audio track over the concatenated video. The video
// stream is copied (no re-encode); the audio is the project track with
// the configured volume applied. -shortest makes the output end at the
// shorter of the two streams.
export function buildMixArgs(project: Project): string[] {
  return [
    '-y',
    '-i', 'output.mp4',
    '-i', 'audio',
    '-filter:a', `volume=${project.audio?.volume ?? 1}`,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    'final.mp4',
  ]
}

// Returns the final output filename inside the ffmpeg virtual FS.
export function finalOutputName(project: Project): string {
  return project.audio ? 'final.mp4' : 'output.mp4'
}
