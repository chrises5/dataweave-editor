import { create } from 'zustand'
import type { InputSlot, ExecutePayload } from './types'

let nextId = 2  // id '1' used by default slot

const DEFAULT_SCRIPT = '%dw 2.0\noutput application/json\n---\npayload'
const DEFAULT_INPUT: InputSlot = { id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }

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
  newSession: () => Promise<void>
}

export const useEditorStore = create<EditorStore>((set, get) => {
  // Helper to persist current inputs (strips filePath/fileName per D-12)
  const persistInputs = (): void => {
    const inputs = get().inputs.map(({ id, name, mimeType, content, filePath }) => ({
      id, name, mimeType,
      content: filePath ? '' : content,  // D-12: file-loaded slots persist as empty
    }))
    window.api.setSession({ inputs })
  }

  return {
    script: DEFAULT_SCRIPT,
    inputs: [{ ...DEFAULT_INPUT }],
    output: '',
    error: null,
    running: false,
    logs: [],
    logPanelOpen: false,
    setScript: (script) => {
      set({ script })
      window.api.setSession({ script })
    },
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
      persistInputs()
    },
    removeInput: (id) => {
      set((state) => ({
        inputs: state.inputs.filter((s) => s.id !== id)
      }))
      persistInputs()
    },
    updateInput: (id, patch) => {
      set((state) => ({
        inputs: state.inputs.map((s) => s.id === id ? { ...s, ...patch } : s)
      }))
      persistInputs()
    },
    newSession: async () => {
      await window.api.clearSession()
      nextId = 2
      set({
        script: DEFAULT_SCRIPT,
        inputs: [{ ...DEFAULT_INPUT }],
        output: '',
        error: null,
        logs: [],
        logPanelOpen: false,
      })
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
  }
})

export async function hydrateFromPersistence(): Promise<{ panelSizes: number[] }> {
  try {
    const saved = await window.api.getSession()
    if (saved && saved.script) {
      useEditorStore.setState({
        script: saved.script,
        inputs: (saved.inputs ?? []).map((s: { id: string; name: string; mimeType: string; content: string }, i: number) => ({
          ...s,
          id: String(i + 1),
        })),
      })
      // Update nextId to avoid collisions with restored inputs
      nextId = (saved.inputs ?? []).length + 1
    }
    return { panelSizes: saved?.panelSizes ?? [] }
  } catch {
    // D-14: silently fall back to defaults
    return { panelSizes: [] }
  }
}
