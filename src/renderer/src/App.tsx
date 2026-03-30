import React, { useEffect, useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useEditorStore, hydrateFromPersistence } from './store'
import { InputPanel } from './components/InputPanel'
import { ScriptPanel } from './components/ScriptPanel'
import { OutputPanel } from './components/OutputPanel'
import { SessionTabBar } from './components/SessionTabBar'

export function App(): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)

  const activeSessionId = useEditorStore((s) => s.activeSessionId)
  const panelSizes = useEditorStore((s) => s.sessions[s.activeSessionId]?.panelSizes ?? [])

  // Run shortcut listener
  useEffect(() => {
    const cleanup = window.api.onRun(() => {
      useEditorStore.getState().run()
    })
    return cleanup
  }, [])

  // Tab keyboard shortcut listeners
  useEffect(() => {
    const cleanups = [
      window.api.onTabNew(() => useEditorStore.getState().addSession()),
      window.api.onTabClose(() => {
        const { activeSessionId: sid } = useEditorStore.getState()
        useEditorStore.getState().removeSession(sid)
      }),
      window.api.onTabNext(() => useEditorStore.getState().nextTab()),
      window.api.onTabPrev(() => useEditorStore.getState().prevTab()),
    ]
    return () => cleanups.forEach((c) => c())
  }, [])

  // Hydration
  useEffect(() => {
    hydrateFromPersistence().then(() => {
      setLoaded(true)
    })
  }, [])

  const handleDragEnd = useCallback(
    (sizes: number[]) => {
      // Persist panel sizes to active session
      const store = useEditorStore.getState()
      const id = store.activeSessionId
      useEditorStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [id]: { ...state.sessions[id], panelSizes: sizes },
        },
      }))
      // Persist to disk
      const updatedStore = useEditorStore.getState()
      window.api.setSessions({
        sessions: updatedStore.sessionOrder
          .filter((sid) => updatedStore.sessions[sid])
          .map((sid) => {
            const s = updatedStore.sessions[sid]
            return {
              id: s.id,
              name: s.name,
              script: s.script,
              inputs: s.inputs.map(({ id: iid, name, mimeType, content, filePath }) => ({
                id: iid,
                name,
                mimeType,
                content: filePath ? '' : content,
              })),
              panelSizes: s.panelSizes,
            }
          }),
        activeSessionIndex: Math.max(0, updatedStore.sessionOrder.indexOf(id)),
      })
    },
    []
  )

  return (
    <div className="h-screen flex flex-col">
      <SessionTabBar />
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Allotment
            key={activeSessionId}
            defaultSizes={panelSizes.length === 3 ? panelSizes : undefined}
            onDragEnd={handleDragEnd}
          >
            <Allotment.Pane minSize={200}>
              <div className="h-full">
                <InputPanel />
              </div>
            </Allotment.Pane>
            <Allotment.Pane minSize={200}>
              <div className="h-full">
                <ScriptPanel />
              </div>
            </Allotment.Pane>
            <Allotment.Pane minSize={200}>
              <div className="h-full">
                <OutputPanel />
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      )}
    </div>
  )
}

export default App
