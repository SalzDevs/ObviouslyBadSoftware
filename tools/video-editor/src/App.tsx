import { useEffect, useReducer, useState } from 'react'
import './App.css'
import {
  initialProject,
  loadProject,
  projectReducer,
  saveProject,
} from './state'

function App() {
  const [project, dispatch] = useReducer(projectReducer, initialProject)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

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
      <header className="topbar">
        <span className="project-name">Untitled</span>
        <button onClick={() => dispatch({ type: 'NEW_PROJECT' })}>New project</button>
        <div className="topbar-spacer" />
        <span className="audio-status">no audio</span>
        <button disabled>Export</button>
      </header>

      <main className="workspace">
        <section className="panel media-bin">
          <h2>Media bin</h2>
          <p className="empty">drag video files here</p>
        </section>

        <section className="panel preview">
          <h2>Preview</h2>
          <p className="empty">no clip selected</p>
        </section>

        <section className="panel timeline">
          <h2>Timeline</h2>
          <p className="empty">no clips</p>
        </section>

        <section className="panel inspector">
          <h2>Inspector</h2>
          <p className="empty">select a clip to edit {selectedClipId ? `(${selectedClipId})` : ''}</p>
        </section>
      </main>
    </div>
  )
}

export default App
