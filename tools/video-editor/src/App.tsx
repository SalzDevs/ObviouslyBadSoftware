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
    </div>
  )
}

export default App
