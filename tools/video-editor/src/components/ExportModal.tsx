import { useEffect, useRef, useState } from 'react'
import { runExport, type ExportStep } from '../export/run'
import type { Project } from '../types'

interface Props {
  project: Project
  onClose: () => void
}

const STEP_LABELS: Record<ExportStep | 'preflight', string> = {
  preflight: 'preparing',
  loading: 'loading ffmpeg.wasm',
  'clip-0': 'processing clip 1/N',
  'clip-1': 'processing clip 2/N',
  'clip-2': 'processing clip 3/N',
  'concat': 'concatenating clips',
  audio: 'mixing audio track',
  done: 'done',
}

function stepLabel(step: ExportStep | 'preflight' | 'error', project: Project): string {
  if (step === 'preflight') return STEP_LABELS.preflight
  if (step === 'error') return 'failed'
  if (step.startsWith('clip-')) {
    const i = parseInt(step.slice(5), 10)
    return `processing clip ${i + 1}/${project.clips.length}`
  }
  return STEP_LABELS[step]
}

export function ExportModal({ project, onClose }: Props) {
  const [step, setStep] = useState<ExportStep | 'preflight' | 'error'>('preflight')
  const [progress, setProgress] = useState(0) // 0..1 within current step
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let cancelled = false
    const onLog = (m: string) => {
      if (cancelled) return
      setLogs(prev => [...prev.slice(-30), m])
    }
    const onProgress = (info: { progress: number }) => {
      if (cancelled) return
      setProgress(Math.max(0, Math.min(1, info.progress)))
    }
    runExport(project, {
      onLog,
      onProgress,
      onStep: s => { if (!cancelled) setStep(s) },
    }).then(result => {
      if (cancelled) return
      setResultUrl(URL.createObjectURL(result.blob))
      setResultSize(result.sizeBytes)
    }).catch(e => {
      if (cancelled) return
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    })
    return () => { cancelled = true }
  }, [project])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const totalSteps = 1 + project.clips.length + 1 + (project.audio ? 1 : 0)
  const currentStepNum = (() => {
    if (step === 'preflight' || step === 'loading') return 0
    if (step === 'done') return totalSteps
    if (step === 'concat') return 1 + project.clips.length
    if (step === 'audio') return 1 + project.clips.length + 1
    if (step === 'error') return 0
    if (step.startsWith('clip-')) {
      return 1 + parseInt(step.slice(5), 10)
    }
    return 0
  })()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export MP4</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="export-step">
            <span className="export-step-num">step {currentStepNum} of {totalSteps}</span>
            <span className="export-step-label">{stepLabel(step, project)}</span>
          </div>

          <div className="export-progress">
            <div
              className="export-progress-bar"
              style={{ width: `${(step === 'done' || step === 'error') ? 100 : Math.round(progress * 100)}%` }}
            />
          </div>

          {error && (
            <div className="export-error">
              <strong>export failed:</strong> {error}
            </div>
          )}

          {resultUrl && (
            <div className="export-done">
              <p>done — {(resultSize / 1024 / 1024).toFixed(2)} MB</p>
              <a
                className="export-download"
                href={resultUrl}
                download={`export-${Date.now()}.mp4`}
              >
                Download MP4
              </a>
            </div>
          )}

          <details className="export-logs">
            <summary>ffmpeg log (last {logs.length} lines)</summary>
            <pre ref={logRef}>{logs.join('\n') || '(no log output yet)'}</pre>
          </details>
        </div>
      </div>
    </div>
  )
}
