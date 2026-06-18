// Project schema — shared between the web app and the CLI. The web app
// mutates it via the reducer in state.ts; the CLI reads it from a JSON
// file and runs the export pipeline. Bump `version` on breaking changes
// so saved projects from older versions can be detected and rejected.

export type TextPosition = 'top' | 'center' | 'bottom'
export type TextPreset = 'title' | 'watermark' | 'lower-third' | 'custom'

export interface TextOverlay {
  content: string
  position: TextPosition
  preset: TextPreset
  fontSize: number   // px
  color: string      // hex, e.g. "#ffffff"
  startTime: number  // seconds, relative to clip start
  endTime: number    // seconds, relative to clip start
}

export interface Clip {
  id: string
  src: string          // object URL of the imported file
  filename: string
  duration: number     // seconds (full, before trim)
  trimStart: number    // seconds
  trimEnd: number      // seconds
  fadeIn: number       // seconds
  fadeOut: number      // seconds
  text?: TextOverlay
}

export interface AudioTrack {
  src: string          // object URL
  filename: string
  volume: number       // 0.0 - 1.0
}

export interface Project {
  version: 1
  clips: Clip[]
  audio?: AudioTrack
}

export const PROJECT_VERSION = 1
