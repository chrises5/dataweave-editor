import { create } from 'zustand'
import type { InputSlot, ExecutePayload } from './types'

let nextId = 2  // id '1' used by default slot

interface EditorStore {
  script: string
  inputs: InputSlot[]
  output: string
  error: string | null
  running: boolean
  logs: string[]
  logPanelOpen: boolean
  setScript: (s: string) => void
  addInput: () => void
  removeInput: (id: string) => void
  updateInput: (id: string, patch: Partial<InputSlot>) => void
  run: () => Promise<void>
  setLogs: (logs: string[]) => void
  toggleLogPanel: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  script: '%dw 2.0\noutput application/json\n---\npayload',
  inputs: [
    { id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }
  ],
  output: '',
  error: null,
  running: false,
  logs: [],
  logPanelOpen: false,
  setScript: (script) => set({ script }),
  setLogs: (logs) => set({ logs }),
  toggleLogPanel: () => set((state) => ({ logPanelOpen: !state.logPanelOpen })),
  addInput: () => {
    const id = String(nextId++)
    set((state) => ({
      inputs: [...state.inputs, {
        id,
        name: `var${id}`,
        mimeType: 'application/json',
        content: ''
      }]
    }))
  },
  removeInput: (id) => {
    set((state) => ({
      inputs: state.inputs.filter((s) => s.id !== id)
    }))
  },
  updateInput: (id, patch) => {
    set((state) => ({
      inputs: state.inputs.map((s) => s.id === id ? { ...s, ...patch } : s)
    }))
  },
  run: async () => {
    const { script, inputs } = get()
    set({ running: true, error: null, output: '' })
    try {
      const payload: ExecutePayload = {
        script,
        inputs: inputs.map(({ name, mimeType, content, filePath }) => ({
          name,
          mimeType,
          content: filePath ? null : content,
          filePath: filePath ?? null
        }))
      }
      const result = await window.api.execute(payload)
      if (result.ok) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
        const logs = (result.logs ?? []).map((l: string) => `[${timestamp}] ${l}`)
        set({ output: result.output ?? '', running: false, logs, error: null })
      } else {
        set({ error: result.error ?? 'Unknown error', running: false, logs: [] })
      }
    } catch (err) {
      set({ error: String(err), running: false })
    }
  }
}))
