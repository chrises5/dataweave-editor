import React from 'react'
import { Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'
import { useEditorStore } from '../store'

export function SettingsDialog(): React.JSX.Element {
  const fontSize = useEditorStore((s) => s.fontSize)
  const tabSize = useEditorStore((s) => s.tabSize)
  const insertSpaces = useEditorStore((s) => s.insertSpaces)
  const autoRunDelay = useEditorStore((s) => s.autoRunDelay)
  const setFontSize = useEditorStore((s) => s.setFontSize)
  const setTabSize = useEditorStore((s) => s.setTabSize)
  const setInsertSpaces = useEditorStore((s) => s.setInsertSpaces)
  const setAutoRunDelay = useEditorStore((s) => s.setAutoRunDelay)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          title="Settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {/* Editor section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Editor</h3>
            {/* Font Size */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground" htmlFor="settings-font-size">
                Font Size
              </label>
              <input
                id="settings-font-size"
                type="number"
                min={8}
                max={32}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-20 h-8 px-2 text-sm rounded border border-input bg-background text-foreground"
              />
            </div>
            {/* Tab Size */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground" htmlFor="settings-tab-size">
                Tab Size
              </label>
              <input
                id="settings-tab-size"
                type="number"
                min={1}
                max={8}
                value={tabSize}
                onChange={(e) => setTabSize(Number(e.target.value))}
                className="w-20 h-8 px-2 text-sm rounded border border-input bg-background text-foreground"
              />
            </div>
            {/* Insert Spaces */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground" htmlFor="settings-insert-spaces">
                Insert Spaces
              </label>
              <input
                id="settings-insert-spaces"
                type="checkbox"
                checked={insertSpaces}
                onChange={(e) => setInsertSpaces(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </div>
          </div>
          {/* Auto-run section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Auto-run</h3>
            {/* Auto-run Delay */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground" htmlFor="settings-auto-run-delay">
                Auto-run Delay
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="settings-auto-run-delay"
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={autoRunDelay}
                  onChange={(e) => setAutoRunDelay(Number(e.target.value))}
                  className="w-20 h-8 px-2 text-sm rounded border border-input bg-background text-foreground"
                />
                <span className="text-sm text-muted-foreground">ms</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
