import { create } from 'zustand'

interface EditorStore {
  script: string
  input: string
  output: string
  error: string | null
  running: boolean
  setScript: (s: string) => void
  setInput: (s: string) => void
  run: () => Promise<void>
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  script: '%dw 2.0\noutput application/json\n---\npayload',
  input: '{"hello": "world"}',
  output: '',
  error: null,
  running: false,
  setScript: (script) => set({ script }),
  setInput: (input) => set({ input }),
  run: async () => {
    const { script, input } = get()
    set({ running: true, error: null, output: '' })
    try {
      const result = await window.api.execute(script, input)
      if (result.ok) {
        set({ output: result.output ?? '', running: false })
      } else {
        set({ error: result.error ?? 'Unknown error', running: false })
      }
    } catch (err) {
      set({ error: String(err), running: false })
    }
  }
}))
