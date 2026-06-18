import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { Clip } from '../types'
import type { Action } from '../state'

interface Props {
  clips: Clip[]
  dispatch: (action: Action) => void
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('failed to read video metadata'))
    }
    video.src = url
  })
}

async function fileToClip(file: File): Promise<Clip> {
  const duration = await getVideoDuration(file)
  return {
    id: crypto.randomUUID(),
    src: URL.createObjectURL(file),
    filename: file.name,
    duration,
    trimStart: 0,
    trimEnd: duration,
    fadeIn: 0,
    fadeOut: 0,
    text: undefined,
  }
}

export function MediaBin({ clips, dispatch }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    setError(null)
    const newClips: Clip[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) {
        setError(`not a video file: ${file.name}`)
        continue
      }
      try {
        newClips.push(await fileToClip(file))
      } catch (e) {
        setError(`failed to import ${file.name}: ${e instanceof Error ? e.message : e}`)
      }
    }
    if (newClips.length) dispatch({ type: 'ADD_CLIPS', clips: newClips })
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  return (
    <div
      className={'media-bin-inner' + (dragOver ? ' drag-over' : '')}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <h2>Media bin</h2>
      <button
        className="upload-button"
        onClick={() => inputRef.current?.click()}
      >
        + add video
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      {error && <div className="error">{error}</div>}
      {clips.length === 0 ? (
        <p className="empty">drop video files here</p>
      ) : (
        <ul className="clip-list">
          {clips.map(clip => (
            <li key={clip.id} className="clip-item" title={clip.filename}>
              <span className="clip-name">{clip.filename}</span>
              <span className="clip-duration">{clip.duration.toFixed(1)}s</span>
              <button
                className="clip-remove"
                onClick={() => dispatch({ type: 'REMOVE_CLIP', id: clip.id })}
                title="remove from project"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
