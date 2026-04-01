import { create } from 'zustand'
import type { InputSlot, ExecutePayload, PersistedSessionData, LiveSessionData } from './types'

function applyThemeToDOM(theme: 'light' | 'dark'): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const DEFAULT_SCRIPT = '%dw 2.0\noutput application/json\n---\npayload'
const SLOT_NAMES = ['payload', 'vars', 'attributes']
const DEFAULT_INPUT: InputSlot = { id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }

function getNextInputId(inputs: InputSlot[]): string {
  const maxId = inputs.reduce((max, s) => Math.max(max, parseInt(s.id, 10) || 0), 0)
  return String(maxId + 1)
}

function createDefaultSession(name: string): LiveSessionData {
  return {
    id: crypto.randomUUID(),
    name,
    script: DEFAULT_SCRIPT,
    inputs: [{ ...DEFAULT_INPUT }],
    panelSizes: [],
    output: '',
    error: null,
    running: false,
    logs: [],
    logPanelOpen: false,
  }
}

interface EditorStore {
  sessions: Record<string, LiveSessionData>
  activeSessionId: string
  sessionOrder: string[]
  theme: 'light' | 'dark'
  autoRun: boolean

  // Settings (persisted via electron-conf in main process)
  fontSize: number
  tabSize: number
  insertSpaces: boolean
  autoRunDelay: number

  // Settings actions
  setFontSize: (size: number) => void
  setTabSize: (size: number) => void
  setInsertSpaces: (value: boolean) => void
  setAutoRunDelay: (delay: number) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void

  // Theme
  toggleTheme: () => void
  toggleAutoRun: () => void

  // Session management
  addSession: () => void
  removeSession: (id: string) => void
  switchSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  nextTab: () => void
  prevTab: () => void

  // Per-session actions (operate on active session)
  setScript: (s: string) => void
  addInput: () => void
  removeInput: (id: string) => void
  updateInput: (id: string, patch: Partial<InputSlot>) => void
  run: (options?: { silent?: boolean }) => Promise<void>
  setLogs: (logs: string[]) => void
  toggleLogPanel: () => void
}

// Bootstrap initial session so store is never empty
const _initial = createDefaultSession('Session 1')

export const useEditorStore = create<EditorStore>((set, get) => {
  const persistSessions = (): void => {
    const { sessions, sessionOrder, activeSessionId } = get()
    const ordered: PersistedSessionData[] = sessionOrder
      .filter((id) => sessions[id])
      .map((id) => {
        const s = sessions[id]
        return {
          id: s.id,
          name: s.name,
          script: s.script,
          inputs: s.inputs.map(({ id: iid, name, mimeType, content, filePath }) => ({
            id: iid, name, mimeType,
            content: filePath ? '' : content,
          })),
          panelSizes: s.panelSizes,
        }
      })
    const activeIndex = sessionOrder.indexOf(activeSessionId)
    window.api.setSessions({
      sessions: ordered,
      activeSessionIndex: Math.max(0, activeIndex),
    })
  }

  return {
    sessions: { [_initial.id]: _initial },
    activeSessionId: _initial.id,
    sessionOrder: [_initial.id],
    theme: 'light',
    autoRun: false,
    fontSize: 12,
    tabSize: 2,
    insertSpaces: true,
    autoRunDelay: 1000,

    setFontSize: (size: number) => {
      const clamped = Math.max(8, Math.min(32, size))
      set({ fontSize: clamped })
      window.api.setSettings({ fontSize: clamped })
    },

    setTabSize: (size: number) => {
      const clamped = Math.max(1, Math.min(8, size))
      set({ tabSize: clamped })
      window.api.setSettings({ tabSize: clamped })
    },

    setInsertSpaces: (value: boolean) => {
      set({ insertSpaces: value })
      window.api.setSettings({ insertSpaces: value })
    },

    setAutoRunDelay: (delay: number) => {
      const clamped = Math.max(200, Math.min(5000, Math.round(delay / 100) * 100))
      set({ autoRunDelay: clamped })
      window.api.setSettings({ autoRunDelay: clamped })
    },

    increaseFontSize: () => {
      const current = get().fontSize
      const next = Math.min(32, current + 1)
      set({ fontSize: next })
      window.api.setSettings({ fontSize: next })
    },

    decreaseFontSize: () => {
      const current = get().fontSize
      const next = Math.max(8, current - 1)
      set({ fontSize: next })
      window.api.setSettings({ fontSize: next })
    },

    resetFontSize: () => {
      set({ fontSize: 12 })
      window.api.setSettings({ fontSize: 12 })
    },

    toggleTheme: () => {
      const newTheme = get().theme === 'dark' ? 'light' : 'dark'
      set({ theme: newTheme })
      applyThemeToDOM(newTheme)
      window.api.setTheme(newTheme)
    },

    toggleAutoRun: () => {
      set((state) => ({ autoRun: !state.autoRun }))
    },

    addSession: () => {
      const { sessions, sessionOrder } = get()
      const maxNum = sessionOrder.reduce((max, id) => {
        const match = sessions[id]?.name.match(/^Session (\d+)$/)
        return match ? Math.max(max, parseInt(match[1])) : max
      }, 0)
      const newSession = createDefaultSession(`Session ${maxNum + 1}`)
      set((state) => ({
        sessions: { ...state.sessions, [newSession.id]: newSession },
        sessionOrder: [...state.sessionOrder, newSession.id],
        activeSessionId: newSession.id,
      }))
      persistSessions()
    },

    removeSession: (id) => {
      const { sessionOrder, activeSessionId } = get()
      if (sessionOrder.length === 1) {
        // D-11: last tab — create fresh session first, then remove old
        const fresh = createDefaultSession('Session 1')
        set((state) => {
          const newSessions = { ...state.sessions, [fresh.id]: fresh }
          delete newSessions[id]
          return {
            sessions: newSessions,
            sessionOrder: [fresh.id],
            activeSessionId: fresh.id,
          }
        })
        persistSessions()
        return
      }
      const idx = sessionOrder.indexOf(id)
      const newOrder = sessionOrder.filter((sid) => sid !== id)
      const newActiveId = id === activeSessionId
        ? (newOrder[Math.min(idx, newOrder.length - 1)] ?? newOrder[0])
        : activeSessionId
      set((state) => {
        const newSessions = { ...state.sessions }
        delete newSessions[id]
        return { sessions: newSessions, sessionOrder: newOrder, activeSessionId: newActiveId }
      })
      persistSessions()
    },

    switchSession: (id) => {
      set({ activeSessionId: id })
      persistSessions()
    },

    renameSession: (id, name) => {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: { ...state.sessions[id], name: name.trim() || 'unnamed' },
        },
      }))
      persistSessions()
    },

    nextTab: () => {
      const { sessionOrder, activeSessionId } = get()
      const idx = sessionOrder.indexOf(activeSessionId)
      const nextIdx = (idx + 1) % sessionOrder.length
      set({ activeSessionId: sessionOrder[nextIdx] })
      persistSessions()
    },

    prevTab: () => {
      const { sessionOrder, activeSessionId } = get()
      const idx = sessionOrder.indexOf(activeSessionId)
      const prevIdx = (idx - 1 + sessionOrder.length) % sessionOrder.length
      set({ activeSessionId: sessionOrder[prevIdx] })
      persistSessions()
    },

    setScript: (script) => {
      set((state) => {
        const id = state.activeSessionId
        return {
          sessions: {
            ...state.sessions,
            [id]: { ...state.sessions[id], script },
          },
        }
      })
      persistSessions()
    },

    setLogs: (logs) => {
      set((state) => {
        const id = state.activeSessionId
        return {
          sessions: {
            ...state.sessions,
            [id]: { ...state.sessions[id], logs },
          },
        }
      })
    },

    toggleLogPanel: () => {
      set((state) => {
        const id = state.activeSessionId
        const session = state.sessions[id]
        return {
          sessions: {
            ...state.sessions,
            [id]: { ...session, logPanelOpen: !session.logPanelOpen },
          },
        }
      })
    },

    addInput: () => {
      set((state) => {
        const id = state.activeSessionId
        const session = state.sessions[id]
        const newId = getNextInputId(session.inputs)
        const idx = session.inputs.length
        const name = idx < SLOT_NAMES.length ? SLOT_NAMES[idx] : `var${idx - SLOT_NAMES.length + 1}`
        return {
          sessions: {
            ...state.sessions,
            [id]: {
              ...session,
              inputs: [...session.inputs, { id: newId, name, mimeType: 'application/json', content: '{}' }],
            },
          },
        }
      })
      persistSessions()
    },

    removeInput: (inputId) => {
      set((state) => {
        const id = state.activeSessionId
        const session = state.sessions[id]
        return {
          sessions: {
            ...state.sessions,
            [id]: {
              ...session,
              inputs: session.inputs.filter((s) => s.id !== inputId),
            },
          },
        }
      })
      persistSessions()
    },

    updateInput: (inputId, patch) => {
      set((state) => {
        const id = state.activeSessionId
        const session = state.sessions[id]
        return {
          sessions: {
            ...state.sessions,
            [id]: {
              ...session,
              inputs: session.inputs.map((s) => s.id === inputId ? { ...s, ...patch } : s),
            },
          },
        }
      })
      persistSessions()
    },

    run: async (options) => {
      const silent = options?.silent ?? false
      const { sessions, activeSessionId } = get()
      const session = sessions[activeSessionId]
      const { script, inputs } = session
      if (!silent) {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [activeSessionId]: { ...state.sessions[activeSessionId], running: true, error: null, output: '' },
          },
        }))
      }
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
          set((state) => ({
            sessions: {
              ...state.sessions,
              [activeSessionId]: { ...state.sessions[activeSessionId], output: result.output ?? '', running: false, logs, error: null },
            },
          }))
        } else {
          set((state) => ({
            sessions: {
              ...state.sessions,
              [activeSessionId]: { ...state.sessions[activeSessionId], error: result.error ?? 'Unknown error', running: false, logs: [] },
            },
          }))
        }
      } catch (err) {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [activeSessionId]: { ...state.sessions[activeSessionId], error: String(err), running: false },
          },
        }))
      }
    }
  }
})

function loadSessionsIntoStore(persisted: PersistedSessionData[], activeIndex: number): void {
  if (persisted.length === 0) {
    const fresh = createDefaultSession('Session 1')
    useEditorStore.setState({
      sessions: { [fresh.id]: fresh },
      sessionOrder: [fresh.id],
      activeSessionId: fresh.id,
    })
    return
  }

  const sessions: Record<string, LiveSessionData> = {}
  const sessionOrder: string[] = []

  for (const s of persisted) {
    const live: LiveSessionData = {
      ...s,
      inputs: s.inputs.map((inp, i) => ({ ...inp, id: String(i + 1) })),
      output: '',
      error: null,
      running: false,
      logs: [],
      logPanelOpen: false,
    }
    sessions[s.id] = live
    sessionOrder.push(s.id)
  }

  const safeIndex = Math.min(activeIndex, sessionOrder.length - 1)
  useEditorStore.setState({
    sessions,
    sessionOrder,
    activeSessionId: sessionOrder[safeIndex] ?? sessionOrder[0],
  })
}

export async function hydrateFromPersistence(): Promise<void> {
  try {
    const savedTheme = await window.api.getTheme()
    const theme = savedTheme === 'dark' ? 'dark' : 'light'
    useEditorStore.setState({ theme })
    applyThemeToDOM(theme)

    // Load settings
    try {
      const settings = await window.api.getSettings()
      if (settings) {
        useEditorStore.setState({
          fontSize: settings.fontSize ?? 12,
          tabSize: settings.tabSize ?? 2,
          insertSpaces: settings.insertSpaces ?? true,
          autoRunDelay: settings.autoRunDelay ?? 1000,
        })
      }
    } catch {
      // use defaults silently
    }

    const saved = await window.api.getSessions()

    // Migration: detect old single-session format (no .sessions array)
    if (!saved || !Array.isArray(saved.sessions) || saved.sessions.length === 0) {
      const oldState = saved as unknown as { script?: string; inputs?: Array<{ id: string; name: string; mimeType: string; content: string }>; panelSizes?: number[] }
      const migrated: PersistedSessionData = {
        id: crypto.randomUUID(),
        name: 'Session 1',
        script: oldState?.script ?? DEFAULT_SCRIPT,
        inputs: oldState?.inputs ?? [{ id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }],
        panelSizes: oldState?.panelSizes ?? [],
      }
      await window.api.setSessions({ sessions: [migrated], activeSessionIndex: 0 })
      loadSessionsIntoStore([migrated], 0)
      return
    }

    loadSessionsIntoStore(saved.sessions, saved.activeSessionIndex ?? 0)
  } catch {
    loadSessionsIntoStore([], 0)
  }
}
