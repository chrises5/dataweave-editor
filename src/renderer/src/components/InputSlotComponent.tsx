import React from 'react'
import { Editor } from '@monaco-editor/react'
import { useEditorStore } from '../store'
import { MIME_OPTIONS } from '../types'
import type { InputSlot } from '../types'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

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
  const removeInput = useEditorStore((s) => s.removeInput)
  const inputs = useEditorStore((s) => s.inputs)
  const canRemove = inputs.length > 1

  const handleLoadFile = async (): Promise<void> => {
    const result = await window.api.openFile()
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      const fileName = filePath.split('/').pop() ?? filePath
      updateInput(slot.id, { filePath, fileName, content: '' })
    }
  }

  const handleClearFile = (): void => {
    updateInput(slot.id, { filePath: undefined, fileName: undefined, content: '' })
  }

  const editorLanguage = MIME_TO_LANGUAGE[slot.mimeType] ?? 'plaintext'

  return (
    <div className="flex flex-col h-full">
      {/* Slot toolbar: name, MIME selector, file button, remove button */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <input
          type="text"
          value={slot.name}
          onChange={(e) => updateInput(slot.id, { name: e.target.value })}
          className="h-7 w-28 px-2 text-xs border border-border rounded bg-background"
          placeholder="name"
        />
        <Select
          value={slot.mimeType}
          onValueChange={(v) => updateInput(slot.id, { mimeType: v as string })}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleLoadFile}>
          Load File
        </Button>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => removeInput(slot.id)}
          >
            Remove
          </Button>
        )}
      </div>

      {/* Content area: Monaco editor OR file indicator */}
      <div className="flex-1">
        {slot.filePath ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <span>File loaded:</span>
            <span className="font-mono text-xs font-semibold">{slot.fileName}</span>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClearFile}>
              Clear File
            </Button>
          </div>
        ) : (
          <Editor
            height="100%"
            language={editorLanguage}
            value={slot.content}
            onChange={(val) => updateInput(slot.id, { content: val ?? '' })}
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
        )}
      </div>
    </div>
  )
}
