import type { Action } from '../state'
import type { Clip, TextOverlay, TextPreset } from '../types'

interface Props {
  clip: Clip | null
  dispatch: (action: Action) => void
}

const PRESETS: { value: TextPreset; label: string; size: number; position: TextOverlay['position']; color: string }[] = [
  { value: 'title', label: 'Title', size: 64, position: 'center', color: '#ffffff' },
  { value: 'watermark', label: 'Watermark', size: 24, position: 'bottom', color: '#ffffff' },
  { value: 'lower-third', label: 'Lower third', size: 32, position: 'bottom', color: '#ffffff' },
  { value: 'custom', label: 'Custom...', size: 32, position: 'center', color: '#ffffff' },
]

function NumberField({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 0.1}
        onChange={e => {
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

export function Inspector({ clip, dispatch }: Props) {
  if (!clip) {
    return (
      <div className="inspector-inner">
        <h2>Inspector</h2>
        <p className="empty">select a clip to edit</p>
      </div>
    )
  }

  const update = (patch: Partial<Clip>) =>
    dispatch({ type: 'UPDATE_CLIP', id: clip.id, patch })

  const updateText = (patch: Partial<TextOverlay>) => {
    const current = clip.text ?? defaultText(clip)
    const next = { ...current, ...patch }
    update({ text: next.preset === 'custom' || next.content ? next : undefined })
  }

  const setPreset = (preset: TextPreset) => {
    const cfg = PRESETS.find(p => p.value === preset)!
    if (preset === 'custom') {
      const current = clip.text ?? defaultText(clip)
      update({ text: { ...current, preset, fontSize: current.fontSize, color: current.color } })
    } else {
      const current = clip.text
      update({
        text: {
          content: current?.content ?? '',
          position: cfg.position,
          preset,
          fontSize: cfg.size,
          color: cfg.color,
          startTime: current?.startTime ?? 0,
          endTime: current?.endTime ?? (clip.trimEnd - clip.trimStart),
        },
      })
    }
  }

  const hasText = !!clip.text
  const currentPreset = clip.text?.preset ?? 'title'

  return (
    <div className="inspector-inner">
      <h2>Inspector</h2>
      <div className="inspector-section">
        <div className="inspector-filename" title={clip.filename}>{clip.filename}</div>
        <div className="inspector-duration">duration: {clip.duration.toFixed(2)}s</div>
      </div>

      <div className="inspector-section">
        <h3>Trim</h3>
        <NumberField
          label="start (s)"
          value={clip.trimStart}
          min={0}
          max={clip.trimEnd - 0.1}
          onChange={v => update({ trimStart: Math.max(0, Math.min(v, clip.trimEnd - 0.1)) })}
        />
        <NumberField
          label="end (s)"
          value={clip.trimEnd}
          min={clip.trimStart + 0.1}
          max={clip.duration}
          onChange={v => update({ trimEnd: Math.max(clip.trimStart + 0.1, Math.min(v, clip.duration)) })}
        />
      </div>

      <div className="inspector-section">
        <h3>Fade</h3>
        <NumberField
          label="fade in (s)"
          value={clip.fadeIn}
          min={0}
          max={clip.trimEnd - clip.trimStart}
          onChange={v => update({ fadeIn: Math.max(0, v) })}
        />
        <NumberField
          label="fade out (s)"
          value={clip.fadeOut}
          min={0}
          max={clip.trimEnd - clip.trimStart}
          onChange={v => update({ fadeOut: Math.max(0, v) })}
        />
      </div>

      <div className="inspector-section">
        <h3>Text overlay</h3>
        <label className="field">
          <span className="field-label">preset</span>
          <select
            value={currentPreset}
            onChange={e => setPreset(e.target.value as TextPreset)}
          >
            {PRESETS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        {hasText && (
          <>
            <label className="field">
              <span className="field-label">content</span>
              <textarea
                value={clip.text!.content}
                rows={2}
                onChange={e => updateText({ content: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">position</span>
              <select
                value={clip.text!.position}
                onChange={e => updateText({ position: e.target.value as TextOverlay['position'] })}
              >
                <option value="top">top</option>
                <option value="center">center</option>
                <option value="bottom">bottom</option>
              </select>
            </label>
            {currentPreset === 'custom' && (
              <>
                <NumberField
                  label="font size (px)"
                  value={clip.text!.fontSize}
                  min={8}
                  max={200}
                  step={1}
                  onChange={v => updateText({ fontSize: v })}
                />
                <label className="field">
                  <span className="field-label">color</span>
                  <input
                    type="color"
                    value={clip.text!.color}
                    onChange={e => updateText({ color: e.target.value })}
                  />
                </label>
              </>
            )}
            <button onClick={() => update({ text: undefined })}>Remove overlay</button>
          </>
        )}
        {!hasText && (
          <button onClick={() => setPreset('title')}>Add overlay</button>
        )}
      </div>
    </div>
  )
}

function defaultText(clip: Clip): TextOverlay {
  return {
    content: '',
    position: 'center',
    preset: 'title',
    fontSize: 64,
    color: '#ffffff',
    startTime: 0,
    endTime: clip.trimEnd - clip.trimStart,
  }
}
