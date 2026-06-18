import { fetchFile } from '@ffmpeg/util'
import type { Project } from '../types'
import { loadFFmpeg, type FfmpegCallbacks } from './ffmpeg-wasm'
import {
  buildConcatArgs,
  buildConcatList,
  buildMixArgs,
  buildTrimFadeArgs,
  finalOutputName,
} from './command'

export type ExportStep = 'loading' | `clip-${number}` | 'concat' | 'audio' | 'done'

export interface ExportCallbacks extends FfmpegCallbacks {
  onStep?: (step: ExportStep) => void
  onClipProgress?: (index: number, total: number) => void
}

export interface ExportResult {
  blob: Blob
  filename: string
  sizeBytes: number
}

// Run the full 3-step export: per-clip trim/fade/text → concat → audio
// mix. Returns a Blob ready for download. Throws on ffmpeg errors.
export async function runExport(
  project: Project,
  callbacks: ExportCallbacks = {},
): Promise<ExportResult> {
  if (project.clips.length === 0) {
    throw new Error('no clips to export')
  }

  callbacks.onStep?.('loading')
  const ffmpeg = await loadFFmpeg(callbacks)

  // Write input files into the virtual FS.
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i]
    const data = await fetchFile(clip.src)
    await ffmpeg.writeFile(`input_${i}.mp4`, data)
  }

  // Per-clip: trim, fade, text overlay burn-in.
  for (let i = 0; i < project.clips.length; i++) {
    callbacks.onStep?.(`clip-${i}` as ExportStep)
    callbacks.onClipProgress?.(i, project.clips.length)
    const args = buildTrimFadeArgs(project.clips[i], i)
    await ffmpeg.exec(args)
  }
  callbacks.onClipProgress?.(project.clips.length, project.clips.length)

  // Concat.
  callbacks.onStep?.('concat')
  await ffmpeg.writeFile('concat_list.txt', buildConcatList(project))
  await ffmpeg.exec(buildConcatArgs())

  // Audio mix.
  if (project.audio) {
    callbacks.onStep?.('audio')
    const audioData = await fetchFile(project.audio.src)
    // ffmpeg's input filename needs a known extension; we always
    // write as "audio" (no extension) and let buildMixArgs refer to it.
    await ffmpeg.writeFile('audio', audioData)
    await ffmpeg.exec(buildMixArgs(project))
  }

  callbacks.onStep?.('done')
  const outName = finalOutputName(project)
  const data = await ffmpeg.readFile(outName)
  // Cast through BlobPart: ffmpeg.wasm returns FileData (Uint8Array |
  // string) but the buffer can be a SharedArrayBuffer in cross-origin
  // isolated contexts, which TypeScript's BlobPart rejects. Wrap in a
  // fresh ArrayBuffer-backed view so the Blob is happy.
  const bytes = data instanceof Uint8Array
    ? new Uint8Array(data)
    : new TextEncoder().encode(String(data))
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' })

  return {
    blob,
    filename: outName,
    sizeBytes: blob.size,
  }
}
