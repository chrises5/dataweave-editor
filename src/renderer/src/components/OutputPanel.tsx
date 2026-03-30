import React from 'react'
import { Editor } from '@monaco-editor/react'
import { useEditorStore } from '../store'

export function OutputPanel(): React.JSX.Element {
  const output = useEditorStore((s) => s.output)
  const error = useEditorStore((s) => s.error)

  const displayValue = error ?? output
  const hasError = error !== null

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center px-3 py-2 border-b border-border ${hasError ? 'bg-red-100 text-red-800' : 'bg-muted/50'}`}
      >
        <span className="text-xs font-semibold">{hasError ? 'Error' : 'Output'}</span>
      </div>
      <div className="flex-1">
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
    </div>
  )
}
