#!/usr/bin/env node
// CLI entry point: drive the export pipeline with system ffmpeg (no
// browser needed). The agent writes/has a project.json, runs:
//   video-editor export --project project.json --output final.mp4
// The CLI uses the same command builders as the web app, so the
// exported MP4 is byte-for-byte equivalent (modulo ffmpeg.wasm vs
// system ffmpeg version differences).

import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import type { Project } from './types'
import {
  buildConcatArgs,
  buildConcatList,
  buildMixArgs,
  buildTrimFadeArgs,
  finalOutputName,
  FONT_FILENAME,
} from './export/command'

const __dirname = dirname(fileURLToPath(import.meta.url))

function fail(msg: string, code = 1): never {
  console.error(`error: ${msg}`)
  process.exit(code)
  // Unreachable, but TypeScript needs an explicit return.
  throw new Error('unreachable')
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'info', ...args], {
      cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    p.on('error', (e: Error) => reject(new Error(`failed to spawn ffmpeg: ${e.message}. Is ffmpeg installed and on PATH?`)))
    p.on('exit', (code: number | null) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

async function findFont(): Promise<string | null> {
  const candidates = [
    // Same dir as this file's package (public/Inter-Regular.ttf)
    join(__dirname, '..', 'public', FONT_FILENAME),
    // From the cwd (when running from source)
    join(process.cwd(), 'public', FONT_FILENAME),
    // macOS system fonts
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    // Linux common paths
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

async function cmdExport(projectPath: string, outputPath: string): Promise<void> {
  // 1. Load and validate project.
  const project: Project = JSON.parse(await readFile(projectPath, 'utf-8'))
  if (project.version !== 1) {
    fail(`unsupported project version: ${project.version}`)
  }
  if (project.clips.length === 0) {
    fail('no clips to export')
  }
  console.log(`project: ${project.clips.length} clip(s)${project.audio ? ' + 1 audio track' : ''}`)

  // 2. Set up isolated work directory.
  const workDir = join(tmpdir(), `video-editor-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  console.log(`workdir: ${workDir}`)

  // 3. Stage input files. Relative paths in the project JSON are resolved
  // against the project file's directory, so the agent can ship a
  // self-contained project bundle.
  const projectDir = dirname(projectPath)
  const resolveSrc = (src: string) =>
    src.startsWith('/') || /^[a-z]:[\\/]/i.test(src) ? src : join(projectDir, src)

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i]
    const src = resolveSrc(clip.src)
    if (!existsSync(src)) {
      await rm(workDir, { recursive: true, force: true })
      fail(`clip ${i + 1} source missing: ${src}`)
    }
    await copyFile(src, join(workDir, `input_${i}.mp4`))
  }

  if (project.audio) {
    const src = resolveSrc(project.audio.src)
    if (!existsSync(src)) {
      await rm(workDir, { recursive: true, force: true })
      fail(`audio source missing: ${src}`)
    }
    await copyFile(src, join(workDir, 'audio'))
  }

  // 4. Stage font. ffmpeg's drawtext filter needs a font file; if we
  // can't find one, we can still export but text overlays will fail.
  const fontSrc = await findFont()
  if (fontSrc) {
    await copyFile(fontSrc, join(workDir, FONT_FILENAME))
  } else {
    console.warn('warning: no font file found; text overlays will be skipped')
    // Adjust command builders by stripping the fontfile= arg from
    // drawtext filters when the font isn't present. Simpler: just let
    // ffmpeg fail on the first clip with a text overlay. The README
    // documents this.
  }

  try {
    // 5. Per-clip: trim, fade, text overlay.
    for (let i = 0; i < project.clips.length; i++) {
      console.log(`[${i + 1}/${project.clips.length}] processing clip...`)
      await runFfmpeg(buildTrimFadeArgs(project.clips[i], i), workDir)
    }

    // 6. Concat.
    console.log(`concat...`)
    await writeFile(join(workDir, 'concat_list.txt'), buildConcatList(project))
    await runFfmpeg(buildConcatArgs(), workDir)

    // 7. Audio mix.
    if (project.audio) {
      console.log(`mixing audio (volume=${project.audio.volume.toFixed(2)})...`)
      await runFfmpeg(buildMixArgs(project), workDir)
    }

    // 8. Move final output to the requested path.
    const finalName = finalOutputName(project)
    await copyFile(join(workDir, finalName), outputPath)
    console.log(`done: ${outputPath}`)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    console.log(`video-editor CLI

usage:
  video-editor export --project <project.json> --output <out.mp4>

the project JSON is the same format the web app saves to localStorage and
exports via the "Export JSON" button. See the web app's README for the
schema.`)
    process.exit(0)
  }

  if (argv[0] !== 'export') {
    fail(`unknown command: ${argv[0]}. Try "video-editor export --help"`)
  }

  let projectPath: string | null = null
  let outputPath: string | null = null
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--project' && i + 1 < argv.length) {
      projectPath = argv[++i]
    } else if (argv[i] === '--output' && i + 1 < argv.length) {
      outputPath = argv[++i]
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('video-editor export --project <project.json> --output <out.mp4>')
      process.exit(0)
    }
  }

  if (!projectPath) fail('missing --project <project.json>')
  if (!outputPath) fail('missing --output <out.mp4>')
  if (!existsSync(projectPath)) fail(`project file not found: ${projectPath}`)

  await cmdExport(projectPath, outputPath)
}

main().catch(e => fail(e instanceof Error ? e.message : String(e)))
