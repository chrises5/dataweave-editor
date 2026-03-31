import React, { useState, useCallback } from 'react'
import { Editor } from '@monaco-editor/react'
import { useEditorStore } from '../store'
import type { InputSlot } from '../types'
import { Button } from './ui/button'

interface Props {
  slot: InputSlot
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
  const [dragging, setDragging] = useState(false)

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
          onChange={(val) => updateInput(slot.id, { content: val ?? '', filePath: undefined, fileName: undefined })}
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
