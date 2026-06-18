import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { Action } from '../state'
import type { AudioTrack } from '../types'

interface Props {
  audio: AudioTrack | undefined
  dispatch: (action: Action) => void
  onNewProject: () => void
  onExport: () => void
  onExportProjectJson: () => void
}

export function TopBar({ audio, dispatch, onNewProject, onExport, onExportProjectJson }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      // Caller is responsible for surfacing errors; for now we just drop.
      e.target.value = ''
      return
    }
    dispatch({
      type: 'SET_AUDIO',
      audio: {
        src: URL.createObjectURL(file),
        filename: file.name,
        volume: 0.8,
      },
    })
    e.target.value = ''
  }

  return (
    <header className="topbar">
      <span className="project-name">Untitled</span>
      <button onClick={onNewProject} title="discard current project and start fresh">New project</button>

      <div className="topbar-spacer" />

      {audio ? (
        <div className="audio-control" title={audio.filename}>
          <span className="audio-label">🎵 {audio.filename}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={audio.volume}
            onChange={e => dispatch({
              type: 'SET_AUDIO',
              audio: { ...audio, volume: parseFloat(e.target.value) },
            })}
            title="audio track volume"
          />
          <button
            className="audio-remove"
            onClick={() => dispatch({ type: 'SET_AUDIO', audio: undefined })}
            title="remove audio track"
          >
            ×
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()}>+ Add audio</button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={onFile}
      />

      <button onClick={onExportProjectJson} title="save the project JSON to a file (for the CLI)">
        Export JSON
      </button>
      <button className="primary" onClick={onExport} disabled={!audio && false /* always enabled for v1 */}>
        Export MP4
      </button>
    </header>
  )
}
