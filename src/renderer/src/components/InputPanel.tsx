import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../store'
import { InputSlotComponent } from './InputSlotComponent'
import { Button } from './ui/button'

export function InputPanel(): React.JSX.Element {
  const activeSessionId = useEditorStore((s) => s.activeSessionId)
  const inputs = useEditorStore((s) => s.sessions[s.activeSessionId]?.inputs ?? [])
  const addInput = useEditorStore((s) => s.addInput)
  const removeInput = useEditorStore((s) => s.removeInput)
  const updateInput = useEditorStore((s) => s.updateInput)
  const [activeSlotId, setActiveSlotId] = useState<string>(inputs[0]?.id ?? '1')
  const [editingId, setEditingId] = useState<string | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  // Reset active slot when session changes
  useEffect(() => {
    setActiveSlotId(inputs[0]?.id ?? '1')
  }, [activeSessionId])

  const activeSlot = inputs.find((s) => s.id === activeSlotId) ?? inputs[0]

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  const handleAdd = (): void => {
    addInput()
    const newInputs = useEditorStore.getState().sessions[useEditorStore.getState().activeSessionId]?.inputs ?? []
    setActiveSlotId(newInputs[newInputs.length - 1].id)
  }

  const handleRemove = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    if (activeSlotId === id) {
      const idx = inputs.findIndex((s) => s.id === id)
      const next = inputs[idx - 1] ?? inputs[idx + 1]
      if (next) setActiveSlotId(next.id)
    }
    removeInput(id)
  }

  const commitRename = (id: string, value: string): void => {
    updateInput(id, { name: value.trim() || 'unnamed' })
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar with slot names + Add button */}
      <div className="flex items-center gap-1 px-3 h-10 border-b border-border bg-muted/30 overflow-x-auto">
        {inputs.map((slot) => (
          <div
            key={slot.id}
            onClick={() => setActiveSlotId(slot.id)}
            onDoubleClick={() => setEditingId(slot.id)}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-t border border-b-0 border-border whitespace-nowrap cursor-pointer ${
              activeSlot?.id === slot.id
                ? 'bg-background font-semibold'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {editingId === slot.id ? (
              <input
                ref={editRef}
                defaultValue={slot.name}
                className="w-20 bg-transparent outline-none border-b border-primary text-xs"
                onBlur={(e) => commitRename(slot.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(slot.id, e.currentTarget.value)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{slot.name || 'unnamed'}{slot.filePath ? ' (file)' : ''}</span>
            )}
            {inputs.length > 1 && editingId !== slot.id && (
              <X
                className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                onClick={(e) => handleRemove(e, slot.id)}
              />
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleAdd}
        >
          +
        </Button>
      </div>

      {/* Active slot content */}
      <div className="flex-1">
        {activeSlot && (
          <InputSlotComponent key={activeSlot.id} slot={activeSlot} />
        )}
      </div>
    </div>
  )
}
