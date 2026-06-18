import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { FONT_FILENAME } from './command'

// Lazy singleton: ffmpeg.wasm is ~30MB to download and takes a few
// seconds to instantiate. We only want to pay that cost once per page
// load, then reuse the instance for subsequent exports.
let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

export interface FfmpegCallbacks {
  onLog?: (message: string) => void
  onProgress?: (info: { progress: number; time: number }) => void
}

export async function loadFFmpeg(callbacks: FfmpegCallbacks = {}): Promise<FFmpeg> {
  if (instance) return instance
  if (loading) return loading

  loading = (async () => {
    const f = new FFmpeg()
    if (callbacks.onLog) f.on('log', ({ message }) => callbacks.onLog!(message))
    if (callbacks.onProgress) f.on('progress', info => callbacks.onProgress!(info))

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
    await f.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    // Bundle the font file once so the drawtext filter can find it.
    // Public/Inter-Regular.ttf is fetched on first export; the bytes
    // are written to the ffmpeg virtual FS under FONT_FILENAME so the
    // drawtext filter's fontfile= matches.
    const fontBytes = await fetchFile(`/${FONT_FILENAME}`)
    await f.writeFile(FONT_FILENAME, fontBytes)

    instance = f
    return f
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

export function isLoaded(): boolean {
  return instance !== null
}
