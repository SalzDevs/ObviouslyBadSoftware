import { useEffect, useReducer, useState } from 'react'
import './App.css'
import {
  initialProject,
  loadProject,
  projectReducer,
  saveProject,
} from './state'
import { MediaBin } from './components/MediaBin'
import { Preview } from './components/Preview'
import { Timeline } from './components/Timeline'
import { Inspector } from './components/Inspector'
import { TopBar } from './components/TopBar'
import { ExportModal } from './components/ExportModal'

function App() {
  const [project, dispatch] = useReducer(projectReducer, initialProject)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Auto-load the saved project on mount, then auto-save on every change.
  useEffect(() => {
    const saved = loadProject()
    if (saved) dispatch({ type: 'LOAD_PROJECT', project: saved })
    setHydrated(true)
    setSelectedClipId(null)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveProject(project)
  }, [project, hydrated])

  return (
    <div className="app">
      <TopBar
        audio={project.audio}
        dispatch={dispatch}
        onNewProject={() => {
          if (project.clips.length > 0 || project.audio) {
            if (!confirm('Discard current project? Unsaved edits will be lost.')) return
          }
          dispatch({ type: 'NEW_PROJECT' })
          setSelectedClipId(null)
        }}
        onExport={() => setExporting(true)}
        onExportProjectJson={() => {
          const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'project.json'
          a.click()
          URL.revokeObjectURL(url)
        }}
      />

      <main className="workspace">
        <section className="panel media-bin">
          <MediaBin clips={project.clips} dispatch={dispatch} />
        </section>

        <section className="panel preview">
          <Preview
            clip={project.clips.find(c => c.id === selectedClipId) ?? null}
          />
        </section>

        <section className="panel timeline">
          <Timeline
            clips={project.clips}
            selectedClipId={selectedClipId}
            onSelect={setSelectedClipId}
            dispatch={dispatch}
          />
        </section>

        <section className="panel inspector">
          {(() => {
            const idx = project.clips.findIndex(c => c.id === selectedClipId)
            return (
              <Inspector
                clip={idx >= 0 ? project.clips[idx] : null}
                index={idx}
                total={project.clips.length}
                dispatch={dispatch}
              />
            )
          })()}
        </section>
      </main>

      {exporting && (
        <ExportModal
          project={project}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  )
}

export default App
