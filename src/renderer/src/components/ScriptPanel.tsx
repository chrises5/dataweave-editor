import React from 'react'
import { Editor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { useEditorStore } from '../store'
import { Button } from './ui/button'
import { DATAWEAVE_LANGUAGE_ID, dwLanguageConfig, dwMonarchTokens } from '../lib/dataweave-lang'

function registerDataWeaveLanguage(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === DATAWEAVE_LANGUAGE_ID)) return
  monaco.languages.register({ id: DATAWEAVE_LANGUAGE_ID, extensions: ['.dwl', '.dw'] })
  monaco.languages.setLanguageConfiguration(DATAWEAVE_LANGUAGE_ID, dwLanguageConfig)
  monaco.languages.setMonarchTokensProvider(DATAWEAVE_LANGUAGE_ID, dwMonarchTokens)
}

export function ScriptPanel(): React.JSX.Element {
  const script = useEditorStore((s) => s.script)
  const setScript = useEditorStore((s) => s.setScript)
  const run = useEditorStore((s) => s.run)
  const running = useEditorStore((s) => s.running)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-xs font-semibold">Script</span>
        <Button
          size="sm"
          onClick={run}
          disabled={running}
          className="h-7 px-4 text-xs"
        >
          {running ? 'Running...' : 'Run (\u2318\u21B5)'}
        </Button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage={DATAWEAVE_LANGUAGE_ID}
          beforeMount={registerDataWeaveLanguage}
          value={script}
          onChange={(val) => setScript(val ?? '')}
          options={{
            minimap: { enabled: false },
            automaticLayout: true,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  )
}
