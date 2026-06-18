import type { Clip } from '../types'

interface Props {
  clips: Clip[]
  selectedClipId: string | null
  onSelect: (id: string) => void
}

export function Timeline({ clips, selectedClipId, onSelect }: Props) {
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

  return (
    <div className="timeline-inner">
      <h2>Timeline ({totalDuration.toFixed(1)}s)</h2>
      <div className="timeline-strip">
        {clips.map(clip => {
          const visible = clip.trimEnd - clip.trimStart
          const widthPct = totalDuration > 0 ? (visible / totalDuration) * 100 : 0
          const selected = clip.id === selectedClipId
          return (
            <div
              key={clip.id}
              className={'timeline-clip' + (selected ? ' selected' : '')}
              style={{ width: `${widthPct}%` }}
              onClick={() => onSelect(clip.id)}
              title={`${clip.filename} (${visible.toFixed(1)}s)`}
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
