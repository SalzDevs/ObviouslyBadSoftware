import type { AudioTrack, Clip, Project } from './types'

// Reducer for project state. The web app dispatches actions on user
// interaction; the CLI dispatches LOAD_PROJECT on startup. The reducer
// is pure — no I/O, no side effects — so it's easy to test in isolation.

export type Action =
  | { type: 'ADD_CLIPS'; clips: Clip[] }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'REORDER_CLIPS'; from: number; to: number }
  | { type: 'UPDATE_CLIP'; id: string; patch: Partial<Clip> }
  | { type: 'SET_AUDIO'; audio: AudioTrack | undefined }
  | { type: 'NEW_PROJECT' }
  | { type: 'LOAD_PROJECT'; project: Project }

export const initialProject: Project = {
  version: 1,
  clips: [],
  audio: undefined,
}

export function projectReducer(state: Project, action: Action): Project {
  switch (action.type) {
    case 'ADD_CLIPS':
      return { ...state, clips: [...state.clips, ...action.clips] }

    case 'REMOVE_CLIP': {
      const idx = state.clips.findIndex(c => c.id === action.id)
      if (idx < 0) return state
      const clips = [...state.clips]
      clips.splice(idx, 1)
      return { ...state, clips }
    }

    case 'REORDER_CLIPS': {
      const { from, to } = action
      if (from === to || from < 0 || from >= state.clips.length) return state
      if (to < 0 || to >= state.clips.length) return state
      const clips = [...state.clips]
      const [moved] = clips.splice(from, 1)
      clips.splice(to, 0, moved)
      return { ...state, clips }
    }

    case 'UPDATE_CLIP': {
      const idx = state.clips.findIndex(c => c.id === action.id)
      if (idx < 0) return state
      const clips = [...state.clips]
      clips[idx] = { ...clips[idx], ...action.patch }
      return { ...state, clips }
    }

    case 'SET_AUDIO':
      return { ...state, audio: action.audio }

    case 'NEW_PROJECT':
      return { ...initialProject }

    case 'LOAD_PROJECT':
      return action.project

    default:
      return state
  }
}

// File-byte persistence: the web app auto-saves the Project JSON to
// localStorage. File objects and object URLs are NOT persisted (they die
// with the page), so on reload the user sees clip names + durations but
// must re-drag the actual files. The video editor never silently fails
// because of a missing src — see reattachFiles in components/MediaBin.

export const STORAGE_KEY = 'salzdevs.video-editor.v1'

export function saveProject(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  } catch {
    // Quota exceeded or localStorage disabled — fail silently. The user
    // loses auto-save but can still use the tool; the next render will
    // overwrite the broken entry.
  }
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.version === 1) return parsed as Project
  } catch {
    // Corrupt JSON or storage error — start fresh.
  }
  return null
}
