import React, { useMemo } from 'react'
import { Editor } from '@monaco-editor/react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useEditorStore } from '../store'

const MIME_TO_LANGUAGE: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/csv': 'plaintext',
  'text/csv': 'plaintext',
  'application/yaml': 'yaml',
  'text/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'text/plain': 'plaintext',
  'application/java': 'java',
}

function detectOutputLanguage(script: string): string {
  const match = script.match(/^\s*output\s+([\w/.-]+)/m)
  if (!match) return 'plaintext'
  return MIME_TO_LANGUAGE[match[1]] ?? 'plaintext'
}

export function OutputPanel(): React.JSX.Element {
  const output = useEditorStore((s) => s.sessions[s.activeSessionId]?.output ?? '')
  const error = useEditorStore((s) => s.sessions[s.activeSessionId]?.error ?? null)
  const script = useEditorStore((s) => s.sessions[s.activeSessionId]?.script ?? '')
  const logs = useEditorStore((s) => s.sessions[s.activeSessionId]?.logs ?? [])
  const logPanelOpen = useEditorStore((s) => s.sessions[s.activeSessionId]?.logPanelOpen ?? false)
  const toggleLogPanel = useEditorStore((s) => s.toggleLogPanel)

  const displayValue = error ?? output
  const hasError = error !== null
  const outputLanguage = useMemo(() => (hasError ? 'plaintext' : detectOutputLanguage(script)), [script, hasError])

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center px-3 h-10 border-b border-border ${hasError ? 'bg-red-100 text-red-800' : 'bg-muted/50'}`}
      >
        <span className="text-xs font-semibold">{hasError ? 'Error' : 'Output'}</span>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={outputLanguage}
          value={displayValue}
          options={{
            readOnly: true,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 12,
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
