import React, { useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useEditorStore } from './store'
import { InputPanel } from './components/InputPanel'
import { ScriptPanel } from './components/ScriptPanel'
import { OutputPanel } from './components/OutputPanel'

export function App(): React.JSX.Element {
  useEffect(() => {
    const cleanup = window.api.onRun(() => {
      useEditorStore.getState().run()
    })
    return cleanup
  }, [])

  return (
    <div className="h-screen">
      <Allotment>
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
  )
}

export default App
