import React, { useEffect, useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useEditorStore, hydrateFromPersistence } from './store'
import { InputPanel } from './components/InputPanel'
import { ScriptPanel } from './components/ScriptPanel'
import { OutputPanel } from './components/OutputPanel'

export function App(): React.JSX.Element {
  const [panelSizes, setPanelSizes] = useState<number[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const cleanup = window.api.onRun(() => {
      useEditorStore.getState().run()
    })
    return cleanup
  }, [])

  useEffect(() => {
    hydrateFromPersistence().then(({ panelSizes: sizes }) => {
      if (sizes.length === 3) setPanelSizes(sizes)
      setLoaded(true)
    })
  }, [])

  const handleDragEnd = useCallback((sizes: number[]) => {
    setPanelSizes(sizes)
    window.api.setSession({ panelSizes: sizes })
  }, [])

  return (
    <div className="h-screen">
      {!loaded ? (
        <div className="h-screen flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
      ) : (
        <Allotment
          defaultSizes={panelSizes ?? undefined}
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
      )}
    </div>
  )
}

export default App
