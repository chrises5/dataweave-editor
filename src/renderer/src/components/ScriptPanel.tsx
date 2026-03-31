import React, { useRef, useCallback, useEffect } from 'react'
import { Editor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../store'
import { Button } from './ui/button'
import { DATAWEAVE_LANGUAGE_ID, dwLanguageConfig, dwMonarchTokens, registerDwCompletionProvider } from '../lib/dataweave-lang'
import { formatDataWeave } from '../lib/dataweave-formatter-v2'

function registerDataWeaveLanguage(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === DATAWEAVE_LANGUAGE_ID)) return
  monaco.languages.register({ id: DATAWEAVE_LANGUAGE_ID, extensions: ['.dwl', '.dw'] })
  monaco.languages.setLanguageConfiguration(DATAWEAVE_LANGUAGE_ID, dwLanguageConfig)
  monaco.languages.setMonarchTokensProvider(DATAWEAVE_LANGUAGE_ID, dwMonarchTokens)
  registerDwCompletionProvider(monaco)
}

export function ScriptPanel(): React.JSX.Element {
  const script = useEditorStore((s) => s.sessions[s.activeSessionId]?.script ?? '')
  const setScript = useEditorStore((s) => s.setScript)
  const run = useEditorStore((s) => s.run)
  const running = useEditorStore((s) => s.sessions[s.activeSessionId]?.running ?? false)
  const theme = useEditorStore((s) => s.theme)
  const autoRun = useEditorStore((s) => s.autoRun)
  const toggleAutoRun = useEditorStore((s) => s.toggleAutoRun)
  const inputNames = useEditorStore(
    useShallow((s) => s.sessions[s.activeSessionId]?.inputs.map((i) => i.name) ?? [])
  )

  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputNamesRef = useRef(inputNames)
  inputNamesRef.current = inputNames
  const autoRunRef = useRef(autoRun)
  autoRunRef.current = autoRun

  const runValidation = useCallback(async (value: string) => {
    const monaco = monacoRef.current
    const ed = editorRef.current
    if (!monaco || !ed) return
    const model = ed.getModel()
    if (!model) return

    try {
      const result = await window.api.validate(value, inputNamesRef.current)
      // Model may have changed while awaiting
      if (ed.getModel() !== model) return
      const markers = result.diagnostics.map((d) => ({
        severity: monaco.MarkerSeverity.Error,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.column + 1,
      }))
      monaco.editor.setModelMarkers(model, 'dw-validate', markers)
    } catch {
      // validation failed to run — clear markers silently
      const model2 = ed.getModel()
      if (model2) monaco.editor.setModelMarkers(model2, 'dw-validate', [])
    }
  }, [])

  const scheduleValidation = useCallback(
    (value: string) => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current)
      validateTimerRef.current = setTimeout(() => runValidation(value), 500)
    },
    [runValidation]
  )

  const scheduleAutoRun = useCallback(() => {
    if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current)
    autoRunTimerRef.current = setTimeout(() => {
      if (autoRunRef.current) {
        useEditorStore.getState().run({ silent: true })
      }
    }, 1000)
  }, [])

  // Validate on mount, session switch, or input name changes
  const inputNamesKey = inputNames.join(',')
  useEffect(() => {
    if (script) scheduleValidation(script)
  }, [script, inputNamesKey, scheduleValidation])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current)
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current)
    }
  }, [])

  const handleEditorMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = ed
      // Cmd+Shift+F / Ctrl+Shift+F to format DataWeave
      // eslint-disable-next-line no-bitwise
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
        const model = ed.getModel()
        if (!model) return
        const formatted = formatDataWeave(model.getValue())
        const fullRange = model.getFullModelRange()
        ed.executeEdits('format', [{ range: fullRange, text: formatted }])
      })
    },
    []
  )

  const handleChange = useCallback(
    (val: string | undefined) => {
      const v = val ?? ''
      setScript(v)
      scheduleValidation(v)
      if (autoRunRef.current) scheduleAutoRun()
    },
    [setScript, scheduleValidation, scheduleAutoRun]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border bg-muted/50">
        <span className="text-xs font-semibold">Script</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={toggleAutoRun}
              className="accent-primary h-3.5 w-3.5"
            />
            Auto
          </label>
          <Button
            size="sm"
            onClick={run}
            disabled={running}
            className="h-7 px-4 text-xs"
          >
            {running ? 'Running...' : 'Run (\u2318\u21B5)'}
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage={DATAWEAVE_LANGUAGE_ID}
          beforeMount={registerDataWeaveLanguage}
          onMount={handleEditorMount}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          value={script}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            automaticLayout: true,
            fontSize: 12,
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
