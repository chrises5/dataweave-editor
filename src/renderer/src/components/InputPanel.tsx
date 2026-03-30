import React, { useState } from 'react'
import { useEditorStore } from '../store'
import { InputSlotComponent } from './InputSlotComponent'
import { Button } from './ui/button'

export function InputPanel(): React.JSX.Element {
  const inputs = useEditorStore((s) => s.inputs)
  const addInput = useEditorStore((s) => s.addInput)
  const [activeSlotId, setActiveSlotId] = useState<string>(inputs[0]?.id ?? '1')

  // If active slot was removed, fall back to first slot
  const activeSlot = inputs.find((s) => s.id === activeSlotId) ?? inputs[0]

  const handleAdd = (): void => {
    addInput()
    // Zustand updates are synchronous — get the new state immediately
    const newInputs = useEditorStore.getState().inputs
    setActiveSlotId(newInputs[newInputs.length - 1].id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar with slot names + Add button */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30 overflow-x-auto">
        {inputs.map((slot) => (
          <button
            key={slot.id}
            onClick={() => setActiveSlotId(slot.id)}
            className={`px-3 py-1 text-xs rounded-t border border-b-0 border-border whitespace-nowrap ${
              activeSlot?.id === slot.id
                ? 'bg-background font-semibold'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {slot.name || 'unnamed'}
            {slot.filePath ? ' (file)' : ''}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleAdd}
        >
          + Add
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
