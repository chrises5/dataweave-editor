import React from 'react'
import { Editor } from '@monaco-editor/react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useEditorStore } from '../store'

export function OutputPanel(): React.JSX.Element {
  const output = useEditorStore((s) => s.output)
  const error = useEditorStore((s) => s.error)
  const logs = useEditorStore((s) => s.logs)
  const logPanelOpen = useEditorStore((s) => s.logPanelOpen)
  const toggleLogPanel = useEditorStore((s) => s.toggleLogPanel)

  const displayValue = error ?? output
  const hasError = error !== null

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center px-3 py-2 border-b border-border ${hasError ? 'bg-red-100 text-red-800' : 'bg-muted/50'}`}
      >
        <span className="text-xs font-semibold">{hasError ? 'Error' : 'Output'}</span>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          value={displayValue}
          options={{
            readOnly: true,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
      {/* Collapsible log panel (D-06: below output editor, D-07: collapsed by default) */}
      <div className="border-t border-border">
        <button
          className="flex items-center gap-1 w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
          onClick={toggleLogPanel}
        >
          {logPanelOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>Logs ({logs.length})</span>
        </button>
        {logPanelOpen && (
          <div className="max-h-48 overflow-y-auto font-mono text-xs p-2 space-y-0.5 bg-muted/30">
            {logs.length === 0
              ? <span className="text-muted-foreground">No log output</span>
              : logs.map((line, i) => (
                  <div key={i} className="text-foreground/80 whitespace-pre-wrap">{line}</div>
                ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
