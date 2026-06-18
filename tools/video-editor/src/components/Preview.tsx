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
      </div>
      <p className="preview-meta">
        {clip.filename} &middot; {clip.duration.toFixed(1)}s
      </p>
    </div>
  )
}
