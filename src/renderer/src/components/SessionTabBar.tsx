import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../store'
import { Button } from './ui/button'

export function SessionTabBar(): React.JSX.Element {
  const sessionOrder = useEditorStore((s) => s.sessionOrder)
  const sessions = useEditorStore((s) => s.sessions)
  const activeSessionId = useEditorStore((s) => s.activeSessionId)
  const addSession = useEditorStore((s) => s.addSession)
  const removeSession = useEditorStore((s) => s.removeSession)
  const switchSession = useEditorStore((s) => s.switchSession)
  const renameSession = useEditorStore((s) => s.renameSession)

  const [editingId, setEditingId] = useState<string | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  const commitRename = (id: string, value: string): void => {
    renameSession(id, value)
    setEditingId(null)
  }

  return (
    <div className="flex items-center gap-1 px-2 h-9 border-b border-border bg-muted/30 overflow-x-auto shrink-0">
      {sessionOrder.map((id) => {
        const session = sessions[id]
        if (!session) return null
        const isActive = id === activeSessionId
        return (
          <div
            key={id}
            onClick={() => switchSession(id)}
            onDoubleClick={() => setEditingId(id)}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-t border border-b-0 border-border whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-background font-semibold'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {editingId === id ? (
              <input
                ref={editRef}
                defaultValue={session.name}
                className="w-20 bg-transparent outline-none border-b border-primary text-xs"
                onBlur={(e) => commitRename(id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(id, e.currentTarget.value)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{session.name}</span>
            )}
            {editingId !== id && (
              <X
                className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  removeSession(id)
                }}
              />
            )}
          </div>
        )
      })}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addSession}>
        +
      </Button>
    </div>
  )
}
