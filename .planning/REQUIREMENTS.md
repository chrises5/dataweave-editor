# Requirements: DataWeave Editor

**Defined:** 2026-03-30
**Core Value:** Run DataWeave transformations locally against unlimited-size inputs with the same ergonomics as the hosted MuleSoft playground.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Execution

- [x] **EXEC-01**: User can execute a DataWeave transformation via local DataWeave CLI
- [x] **EXEC-02**: User sees compile and runtime errors with line numbers when transformation fails
- [x] **EXEC-03**: User triggers execution via Run button or keyboard shortcut
- [x] **EXEC-04**: App remembers last script, inputs, and module folder across launches

### Editor

- [x] **EDIT-01**: Script editor highlights DataWeave syntax (Monaco + custom Monarch tokenizer)
- [ ] **EDIT-02**: User can configure a folder path for custom .dwl module imports
- [x] **EDIT-03**: User can view log() output in a dedicated log viewer panel

### Input

- [x] **INPT-01**: User can create multiple named inputs (payload, attributes, vars) dynamically
- [x] **INPT-02**: Each input has a MIME type selector (JSON, XML, CSV, YAML, text, URL-encoded, multipart)
- [x] **INPT-03**: User can load input values from files on disk with no size limit
- [x] **INPT-04**: User can paste or type input values directly for small payloads

### Layout

- [x] **LAYT-01**: App displays a 3-panel layout: Input panel, Script panel, Output panel
- [x] **LAYT-02**: Output panel displays transformation result with format based on script's output directive
- [x] **LAYT-03**: App runs as a standalone desktop application (Electron)

### Tabs (Phase 5)

- [x] **TAB-01**: User can create, switch, rename, and close session tabs in a horizontal tab bar above the panels
- [x] **TAB-02**: Each tab is a fully independent workspace (own script, inputs, output, logs, error state, panel sizes)
- [x] **TAB-03**: All tabs persist across app restarts (scripts and inputs restored; output/logs cleared)

### Theme (Phase 6)

- [x] **THEME-01**: User can toggle between dark and light mode via a UI button and keyboard shortcut (Cmd+Shift+D)
- [x] **THEME-02**: Dark mode matches VS Code Dark+ appearance; Monaco editors switch between vs-dark and vs themes in sync
- [x] **THEME-03**: Theme preference persists across app restarts via electron-conf

### Settings & Keybindings (Phase 9)

- [x] **SET-01**: Settings persist across app restarts via electron-conf store
- [x] **SET-02**: IPC channels (settings:get, settings:set) bridge main and renderer processes
- [x] **SET-03**: Zustand store hydrates settings from electron-conf at startup
- [x] **SET-04**: Font size keybindings (Cmd/Ctrl +/-/0) change editor font size immediately
- [x] **SET-05**: Gear icon in SessionTabBar opens a settings modal dialog
- [x] **SET-06**: Font size, tab size, insert spaces, and auto-run delay are configurable in settings dialog
- [x] **SET-07**: Changes in settings dialog apply immediately without a save button
- [x] **SET-08**: All Monaco editors (Script, Input, Output) use store-driven fontSize/tabSize/insertSpaces
- [x] **SET-09**: Ctrl+F find widget close button tooltip does not flicker

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Editor Enhancements

- **EDIT-04**: DataWeave autocomplete / IntelliSense via Language Server
- **EDIT-05**: AutoPreview toggle (auto-execute on save/debounce)

### Quality of Life

- **QOL-01**: Output copy-to-clipboard button
- **QOL-02**: Execution time display
- **QOL-03**: API Reference panel (inline docs)
- **QOL-04**: Save/load scripts (.dwl) to/from disk
- **QOL-05**: Export session as .zip (script + input files)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cloud/hosted deployment | Strictly local tool |
| Collaborative editing | No server, local-only |
| Tutorial/learning content | Target is experienced MuleSoft devs |
| Save output to file | Display only per user decision |
| MUnit test generation | Different workflow, handled by Anypoint Studio |
| Real-time auto-execute (default) | CLI startup latency makes this frustrating |
| OAuth/magic link login | No auth needed for local tool |
| Multi-user support | Single-user desktop app |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXEC-01 | Phase 1 | Complete |
| EXEC-02 | Phase 1 | Complete |
| EXEC-03 | Phase 2 | Complete |
| EXEC-04 | Phase 4 | Complete |
| EDIT-01 | Phase 4 | Complete |
| EDIT-02 | Phase 4 | Pending |
| EDIT-03 | Phase 4 | Complete |
| INPT-01 | Phase 3 | Complete |
| INPT-02 | Phase 3 | Complete |
| INPT-03 | Phase 3 | Complete |
| INPT-04 | Phase 3 | Complete |
| LAYT-01 | Phase 3 | Complete |
| LAYT-02 | Phase 3 | Complete |
| LAYT-03 | Phase 2 | Complete |
| TAB-01 | Phase 5 | Complete |
| TAB-02 | Phase 5 | Complete |
| TAB-03 | Phase 5 | Complete |
| THEME-01 | Phase 6 | Complete |
| THEME-02 | Phase 6 | Complete |
| THEME-03 | Phase 6 | Complete |
| SET-01 | Phase 9 | Complete |
| SET-02 | Phase 9 | Complete |
| SET-03 | Phase 9 | Complete |
| SET-04 | Phase 9 | Complete |
| SET-05 | Phase 9 | Complete |
| SET-06 | Phase 9 | Complete |
| SET-07 | Phase 9 | Complete |
| SET-08 | Phase 9 | Complete |
| SET-09 | Phase 9 | Complete |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-04-01 after Phase 9 completion*
