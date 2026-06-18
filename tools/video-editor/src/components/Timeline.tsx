import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Clip } from '../types'
import type { Action } from '../state'

interface Props {
  clips: Clip[]
  selectedClipId: string | null
  onSelect: (id: string) => void
  dispatch: (action: Action) => void
}

type DropSide = 'left' | 'right'

export function Timeline({ clips, selectedClipId, onSelect, dispatch }: Props) {
  const [dragOver, setDragOver] = useState<{ id: string; side: DropSide } | null>(null)

  if (clips.length === 0) {
    return (
      <div className="timeline-inner">
        <h2>Timeline</h2>
        <p className="empty">no clips</p>
      </div>
    )
  }

  const totalDuration = clips.reduce(
    (sum, c) => sum + (c.trimEnd - c.trimStart),
    0,
  )

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    const side: DropSide = e.clientX < midpoint ? 'left' : 'right'
    setDragOver({ id, side })
  }

  const onDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    setDragOver(null)
    if (!draggedId || draggedId === targetId) return
    const from = clips.findIndex(c => c.id === draggedId)
    let to = clips.findIndex(c => c.id === targetId)
    if (from < 0 || to < 0) return
    // If dropping on the right side, insert AFTER the target.
    if (dragOver?.side === 'right') to += 1
    // Adjust for the removal of the source if it was before the target.
    if (from < to) to -= 1
    if (from === to) return
    dispatch({ type: 'REORDER_CLIPS', from, to })
  }

  return (
    <div className="timeline-inner">
      <h2>Timeline ({totalDuration.toFixed(1)}s)</h2>
      <div className="timeline-strip">
        {clips.map(clip => {
          const visible = clip.trimEnd - clip.trimStart
          const widthPct = totalDuration > 0 ? (visible / totalDuration) * 100 : 0
          const selected = clip.id === selectedClipId
          const isDragTarget = dragOver?.id === clip.id
          const dropClass = isDragTarget
            ? dragOver.side === 'left' ? ' drop-left' : ' drop-right'
            : ''
          return (
            <div
              key={clip.id}
              className={'timeline-clip' + (selected ? ' selected' : '') + dropClass}
              style={{ width: `${widthPct}%` }}
              draggable
              onDragStart={e => onDragStart(e, clip.id)}
              onDragOver={e => onDragOver(e, clip.id)}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => onDrop(e, clip.id)}
              onClick={() => onSelect(clip.id)}
              title={`${clip.filename} (${visible.toFixed(1)}s) — drag to reorder`}
            >
              <span className="timeline-clip-name">{clip.filename}</span>
              <span className="timeline-clip-duration">{visible.toFixed(1)}s</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
