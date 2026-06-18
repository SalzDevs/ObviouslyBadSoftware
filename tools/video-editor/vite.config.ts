import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ffmpeg.wasm requires cross-origin isolation for SharedArrayBuffer. These
// headers make the dev server COOP/COEP-aware so the @ffmpeg/ffmpeg module
// can spin up its worker without "SharedArrayBuffer is not defined".
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // ffmpeg.wasm ships ESM with .wasm/.js sidecar files; let Vite handle them
  // as assets rather than trying to bundle them through the React plugin.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
