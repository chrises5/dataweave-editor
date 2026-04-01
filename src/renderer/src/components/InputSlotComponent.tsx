import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Editor } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEditorStore } from '../store'
import type { InputSlot } from '../types'
import { Button } from './ui/button'

interface Props {
  slot: InputSlot
}

function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

function formatXml(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('<')) return null
  let indent = 0
  const lines: string[] = []
  // Split on tag boundaries
  const tokens = trimmed.replace(/>\s*</g, '>\n<').split('\n')
  for (const raw of tokens) {
    const token = raw.trim()
    if (!token) continue
    // Closing tag
    if (token.startsWith('</')) {
      indent = Math.max(0, indent - 1)
      lines.push('  '.repeat(indent) + token)
    }
    // Self-closing or processing instruction
    else if (token.endsWith('/>') || token.startsWith('<?')) {
      lines.push('  '.repeat(indent) + token)
    }
    // Opening tag
    else if (token.startsWith('<') && !token.startsWith('<!')) {
      lines.push('  '.repeat(indent) + token)
      // Only increase indent if tag doesn't contain its closing tag on same line
      if (!/<\/[^>]+>\s*$/.test(token)) {
        indent++
      }
    }
    // Content or other
    else {
      lines.push('  '.repeat(indent) + token)
    }
  }
  return lines.join('\n')
}

function formatContent(mimeType: string, text: string): string | null {
  switch (mimeType) {
    case 'application/json':
      return formatJson(text)
    case 'application/xml':
      return formatXml(text)
    default:
      return null
  }
}

// Map MIME types to Monaco language IDs for syntax support
const MIME_TO_LANGUAGE: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'application/yaml': 'yaml',
  'text/csv': 'plaintext',
  'text/plain': 'plaintext',
  'application/x-www-form-urlencoded': 'plaintext',
  'multipart/form-data': 'plaintext',
}

export function InputSlotComponent({ slot }: Props): React.JSX.Element {
  const updateInput = useEditorStore((s) => s.updateInput)
  const theme = useEditorStore((s) => s.theme)
  const fontSize = useEditorStore((s) => s.fontSize)
  const tabSize = useEditorStore((s) => s.tabSize)
  const insertSpaces = useEditorStore((s) => s.insertSpaces)
  const [dragging, setDragging] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const mimeRef = useRef(slot.mimeType)
  mimeRef.current = slot.mimeType

  const handleEditorMount = useCallback((ed: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = ed

    const runFormat = (): void => {
      const model = ed.getModel()
      if (!model) return
      const formatted = formatContent(mimeRef.current, model.getValue())
      if (formatted === null) return
      model.setValue(formatted)
    }

    // Shift+Alt+F via action (also appears in command palette)
    // eslint-disable-next-line no-bitwise
    ed.addAction({
      id: 'format-content',
      label: 'Format Document',
      keybindings: [
        monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF,
      ],
      run: runFormat,
    })
  }, [])

  // Listen for Cmd+Shift+F from Electron main process (only act if this editor has focus)
  useEffect(() => {
    return window.api.onFormat(() => {
      const ed = editorRef.current
      if (!ed || !ed.hasWidgetFocus()) return
      const model = ed.getModel()
      if (!model) return
      const formatted = formatContent(mimeRef.current, model.getValue())
      if (formatted === null) return
      model.setValue(formatted)
    })
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filePath = (file as File & { path?: string }).path
    if (!filePath) return
    const content = await window.api.readFile(filePath)
    const fileName = filePath.split('/').pop() ?? filePath
    updateInput(slot.id, { filePath, fileName, content })
  }, [slot.id, updateInput])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleClearFile = (): void => {
    updateInput(slot.id, { filePath: undefined, fileName: undefined, content: '' })
  }

  const editorLanguage = MIME_TO_LANGUAGE[slot.mimeType] ?? 'plaintext'

  return (
    <div
      className={`flex flex-col h-full relative ${dragging ? 'ring-2 ring-inset ring-primary/50' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 pointer-events-none">
          <span className="text-sm font-medium text-primary/70">Drop file here</span>
        </div>
      )}

      {slot.filePath && (
        <div className="flex items-center gap-2 px-2 h-6 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={slot.fileName}>
            {slot.fileName}
          </span>
          <Button variant="ghost" size="sm" className="h-5 text-xs px-1.5" onClick={handleClearFile}>
            Clear
          </Button>
        </div>
      )}

      {/* Content area: Monaco editor (always shown) */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={editorLanguage}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          value={slot.content}
          onMount={handleEditorMount}
          onChange={(val) => updateInput(slot.id, { content: val ?? '', filePath: undefined, fileName: undefined })}
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
