import React, { useRef, useCallback, useEffect } from 'react'
import { Editor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../store'
import { Button } from './ui/button'
import { DATAWEAVE_LANGUAGE_ID, dwLanguageConfig, dwMonarchTokens, registerDwCompletionProvider } from '../lib/dataweave-lang'
import { formatDataWeave, formatDataWeaveRange } from '../lib/dataweave-formatter-v2'

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
  const fontSize = useEditorStore((s) => s.fontSize)
  const tabSize = useEditorStore((s) => s.tabSize)
  const insertSpaces = useEditorStore((s) => s.insertSpaces)
  const autoRunDelay = useEditorStore((s) => s.autoRunDelay)
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
  const autoRunDelayRef = useRef(autoRunDelay)
  autoRunDelayRef.current = autoRunDelay
  const tabSizeRef = useRef(tabSize)
  tabSizeRef.current = tabSize

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
    }, autoRunDelayRef.current)
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
      // Shift+Alt+F via action (also in command palette)
      // eslint-disable-next-line no-bitwise
      ed.addAction({
        id: 'format-dataweave',
        label: 'Format Document',
        keybindings: [
          monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        ],
        run: (e) => {
          const model = e.getModel()
          if (!model) return
          const selection = e.getSelection()
          const hasSelection = selection && !selection.isEmpty()

          if (hasSelection) {
            const result = formatDataWeaveRange(
              model.getValue(),
              selection.startLineNumber,
              selection.endLineNumber,
              { indentSize: tabSizeRef.current },
            )
            if (result) {
              const replaceRange = new monaco.Range(
                result.startLine, 1,
                result.endLine, model.getLineMaxColumn(result.endLine),
              )
              e.executeEdits('format', [{ range: replaceRange, text: result.text }])
            }
          } else {
            const formatted = formatDataWeave(model.getValue(), { indentSize: tabSizeRef.current })
            const fullRange = model.getFullModelRange()
            e.executeEdits('format', [{ range: fullRange, text: formatted }])
          }
        },
      })
    },
    []
  )

  // Cmd+Shift+F via Electron main process (only act if this editor has focus)
  useEffect(() => {
    return window.api.onFormat(() => {
      const ed = editorRef.current
      const monaco = monacoRef.current
      if (!ed || !monaco || !ed.hasWidgetFocus()) return
      const model = ed.getModel()
      if (!model) return
      const selection = ed.getSelection()
      const hasSelection = selection && !selection.isEmpty()

      if (hasSelection) {
        const result = formatDataWeaveRange(
          model.getValue(),
          selection.startLineNumber,
          selection.endLineNumber,
          { indentSize: tabSizeRef.current },
        )
        if (result) {
          const replaceRange = new monaco.Range(
            result.startLine, 1,
            result.endLine, model.getLineMaxColumn(result.endLine),
          )
          ed.executeEdits('format', [{ range: replaceRange, text: result.text }])
        }
      } else {
        const formatted = formatDataWeave(model.getValue(), { indentSize: tabSizeRef.current })
        const fullRange = model.getFullModelRange()
        ed.executeEdits('format', [{ range: fullRange, text: formatted }])
      }
    })
  }, [])

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
            fontSize,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize,
            insertSpaces,
          }}
        />
      </div>
    </div>
  )
}
