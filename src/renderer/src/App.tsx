import { useEffect } from 'react'
import { useEditorStore } from './store'

export function App(): React.JSX.Element {
  const { script, inputs, output, error, running, setScript, updateInput, run } = useEditorStore()

  useEffect(() => {
    const cleanup = window.api.onRun(() => {
      useEditorStore.getState().run()
    })
    return cleanup
  }, [])

  const firstInput = inputs[0]

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: 'monospace',
        margin: 0,
        padding: 0
      }}
    >
      {/* Input Panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #ccc'
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #ccc',
            fontSize: '12px',
            fontWeight: 'bold',
            background: '#f5f5f5'
          }}
        >
          Input (JSON)
        </div>
        <textarea
          value={firstInput?.content ?? ''}
          onChange={(e) => firstInput && updateInput(firstInput.id, { content: e.target.value })}
          placeholder='{"key": "value"}'
          spellCheck={false}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '13px',
            outline: 'none'
          }}
        />
      </div>

      {/* Script Panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #ccc'
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #ccc',
            fontSize: '12px',
            fontWeight: 'bold',
            background: '#f5f5f5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>Script</span>
          <button
            onClick={run}
            disabled={running}
            style={{
              padding: '4px 16px',
              fontSize: '12px',
              cursor: running ? 'not-allowed' : 'pointer',
              background: running ? '#ccc' : '#0078d4',
              color: 'white',
              border: 'none',
              borderRadius: '3px'
            }}
          >
            {running ? 'Running...' : 'Run (\u2318\u21B5)'}
          </button>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={'%dw 2.0\noutput application/json\n---\npayload'}
          spellCheck={false}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '13px',
            outline: 'none'
          }}
        />
      </div>

      {/* Output Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #ccc',
            fontSize: '12px',
            fontWeight: 'bold',
            background: error ? '#fdd' : '#f5f5f5'
          }}
        >
          {error ? 'Error' : 'Output'}
        </div>
        <textarea
          value={error ? error : output}
          readOnly
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '13px',
            outline: 'none',
            color: error ? '#c00' : 'inherit',
            background: error ? '#fff5f5' : 'white'
          }}
        />
      </div>
    </div>
  )
}

export default App
