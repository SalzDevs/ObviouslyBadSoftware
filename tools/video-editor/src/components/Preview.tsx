import type { Clip } from '../types'

interface Props {
  clip: Clip | null
}

export function Preview({ clip }: Props) {
  if (!clip) {
    return (
      <div className="preview-inner">
        <h2>Preview</h2>
        <p className="empty">no clip selected</p>
      </div>
    )
  }

  const t = clip.text
  const positionStyle = t
    ? t.position === 'top'
      ? { top: '8%' }
      : t.position === 'bottom'
        ? { bottom: '8%' }
        : { top: '50%', transform: 'translateY(-50%)' }
    : {}

  return (
    <div className="preview-inner">
      <h2>Preview</h2>
      <div className="video-wrap">
        <video
          key={clip.id}
          src={clip.src}
          controls
          preload="metadata"
        />
        {t && t.content && (
          <div
            className="text-overlay"
            style={{
              ...positionStyle,
              color: t.color,
              fontSize: `${t.fontSize}px`,
            }}
          >
            {t.content}
          </div>
        )}
      </div>
      <p className="preview-meta">
        {clip.filename} &middot; {clip.duration.toFixed(1)}s
      </p>
    </div>
  )
}
