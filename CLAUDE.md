<!-- GSD:project-start source:PROJECT.md -->
## Project

**DataWeave Editor**

A local desktop application that replicates the MuleSoft DataWeave Playground experience but runs entirely on the user's machine. It provides a 3-panel editor (Input, Script, Output) for writing and testing DataWeave transformations against real production-sized payloads with no size limits. Aimed at MuleSoft developers who need to iterate on DataWeave scripts locally with full control over inputs, custom modules, and file-based workflows.

**Core Value:** Run DataWeave transformations locally against unlimited-size inputs with the same ergonomics as the hosted MuleSoft playground.

### Constraints

- **Runtime**: Must run DataWeave locally — no network calls to MuleSoft services for execution
- **Platform**: Desktop app (Electron or Tauri) — needs native file system access for large payloads and module loading
- **Input size**: No artificial limits on input payload size — the key differentiator over the hosted playground
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Electron | ~41.x (latest stable) | Desktop app shell | Bundled Chromium guarantees consistent rendering. Monaco Editor requires `unsafe-eval` which Tauri cannot safely allow in its default CSP model without weakening the security boundary. For a developer tool running local user code this tradeoff matters less, but Electron eliminates the entire class of WebView compatibility uncertainty. Node.js in the main process also makes spawning `dw` CLI processes trivially simple. |
| React | 19.x | UI component framework | Industry standard for complex component-heavy UIs. Strong TypeScript support. The 3-panel split-pane layout, dynamic input list, MIME type selectors, and async execution state map naturally to React's component model. All major editor wrappers (Monaco, CodeMirror) have mature React bindings. |
| TypeScript | ~5.7.x | Type safety across frontend and Electron main process | Catches interface errors between panels, IPC call signatures, and DataWeave execution results at compile time rather than runtime. |
| Vite | ~6.x | Frontend bundler and dev server | Official Tauri and Electron starters both default to Vite. Fast HMR, native ESM, and `?worker` syntax for Monaco web worker configuration. Required for correct Monaco web worker bundling. |
| Monaco Editor | 0.55.x | Code editor for Script panel and Input/Output panels | The same editor engine as VS Code. Provides syntax highlighting (extensible to DataWeave via Monarch tokenizer), large-document performance, find/replace, keyboard shortcuts developers already know. Handles very large payloads in the output panel without freezing. |
| Zustand | 5.x | Application state management | 1KB, minimal boilerplate, no reducers/actions. The app state is fundamentally a small set of shared data: input slots, active MIME types, script content, execution result, running flag. Zustand stores handle this with one-liners. Redux would be over-engineered; React Context alone causes too many re-renders when execution results update. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@monaco-editor/react` | 4.6.x (stable) | React wrapper for Monaco Editor | Use for all three editor panels (Input, Script, Output). Handles lifecycle and avoids webpack/Vite conflicts. Pin `monaco-editor` to 0.55.x to match. |
| `monaco-editor-workers` | 0.55.x | Pre-bundled Monaco web workers for Vite | Required. Monaco's language workers (JSON, TypeScript, etc.) need explicit configuration in Vite builds. This package provides them as ES modules compatible with Vite's `?worker` import. Without it Monaco silently falls back to main-thread execution causing UI freezes. |
| `tailwindcss` | v4.x | Utility-first CSS | Rapid UI iteration for the editor chrome — panels, toolbars, MIME selectors, status bar. shadcn/ui components (below) require it. |
| `shadcn/ui` | current (Tailwind v4 branch) | Accessible unstyled component primitives | Provides Select (MIME type picker), Button, Tabs, Input, Dialog without importing a heavy component library. Components are copied into the source tree so they stay customizable. |
| `allotment` | ~1.20.x | Resizable split panes | React-native resizable pane library. Handles the 3-panel horizontal layout (Input | Script | Output) and inner vertical splits. Actively maintained, lighter than `react-split-pane` which is abandoned. |
| `electron-store` | ~10.x | Persisted settings | Saves user preferences: last-opened script path, module folder path, panel sizes, MIME type defaults. Wraps Electron's `app.getPath('userData')`. |
| `zod` | ~3.x | Schema validation for IPC payloads | Validates inputs sent over Electron IPC (script content, input slots, paths) before passing to CLI. Cheap insurance against corrupted state reaching the `dw` process. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `electron-vite` | Unified Vite config for Electron main + renderer processes | Use `electron-vite` (not plain Vite + custom scripts) — it handles the dual-process build (main process CommonJS, renderer ESM) and HMR in development automatically. Maintained by the `electron-forge`-adjacent community. |
| `electron-builder` | Cross-platform packaging and installers | Creates `.dmg` (macOS), `.exe`/NSIS (Windows), `.AppImage`/`.deb` (Linux). Handles code signing hooks, auto-update channels. More battle-tested than `electron-forge` for complex sidecar bundling scenarios. |
| ESLint + `typescript-eslint` | Linting | Standard; configure with the flat config format introduced in ESLint 9. |
| Prettier | Formatting | Configure once, run on save. |
| Vitest | Unit tests for utility functions | Vite-native test runner. Use for pure DataWeave execution utilities, MIME type handling logic, input slot state. Do not use for Electron IPC integration tests (those need a running Electron instance). |
## DataWeave Execution Architecture
### CLI Invocation Pattern
| Flag | Purpose |
|------|---------|
| `-i <name>=<file>` | Named input variable bound to a file. Supports all MIME types the CLI understands. |
| `--path` / `-p` | Directory or JAR to search for `.dwl` module files. Use this to point at the user's custom module library folder. |
| `--output` / `-o` | Write result to file instead of stdout. Use a temp file path; read it back in the main process. |
| `-m` | Fully-qualified mapping name for file-based scripts (e.g., `MyTransform`). |
### Input Handling for Large Payloads
### Custom Module Support
### MIME Type Mapping
| MIME Type | Temp File Extension |
|-----------|-------------------|
| `application/json` | `.json` |
| `application/xml` | `.xml` |
| `text/csv` | `.csv` |
| `application/yaml` | `.yaml` |
| `text/plain` | `.txt` |
| `application/x-www-form-urlencoded` | `.txt` (URL-encoded body) |
| `multipart/form-data` | Requires investigation — CLI support unconfirmed (LOW confidence) |
| Java objects | Not natively supported by CLI; requires custom Java interop (LOW confidence) |
## Installation
# Scaffold project
# Core UI
# shadcn/ui (CLI-based, not a traditional npm install)
# Supporting
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Electron | Tauri 2.0 | If app has no heavy JS components. Tauri requires relaxing CSP with `unsafe-eval` for Monaco Editor; the system WebView (WebKit on macOS, WebKitGTK on Linux) adds platform-specific rendering risk for a code editor. For a Rust-fluent team building a lightweight app, Tauri wins on bundle size. For this project the rendering consistency guarantee of Electron's Chromium outweighs the size advantage. |
| Monaco Editor | CodeMirror 6 | If bundle size is critical or custom language extension needs are lightweight. CodeMirror 6 is ~300KB vs Monaco's ~5-10MB; its modular architecture makes DataWeave tokenizer implementation possible. However CodeMirror requires significantly more manual work to reach feature parity (multi-cursor, find/replace, minimap) and has no pre-built VS Code-like keybindings. For a developer tool where users expect VS Code ergonomics, Monaco wins. |
| `electron-vite` | Plain Vite + custom scripts | If you need unusual main-process bundling. `electron-vite` handles the dual-context build (CommonJS main, ESM renderer) without manual config. |
| `electron-builder` | `electron-forge` | If you want more opinionated scaffold tooling. `electron-forge` has better first-run DX; `electron-builder` has more production packaging options and is better documented for sidecar binary bundling. |
| `allotment` | `react-resizable-panels` | Either works; `react-resizable-panels` (by the React team's Brian Vaughn) is equally maintained. Choose based on which API feels more natural. `allotment` has a simpler API for horizontal splits. |
| Zustand | Jotai | If state is truly atomic (individual pieces independent). For this app, input slots + execution result + settings form a cohesive unit that benefits from a single store rather than scattered atoms. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Tauri + Monaco (naively) | Requires `unsafe-eval` in CSP and web worker configuration in system WebViews. On macOS, WebKit does not guarantee the same JS engine behavior as Chromium for complex editor scenarios. This is solvable but adds risk and maintenance surface. | Electron |
| `react-monaco-editor` (the other wrapper) | Two competing React wrappers exist: `react-monaco-editor` (older, requires webpack for workers) and `@monaco-editor/react` (newer, Vite-compatible). The latter is the correct choice for Vite projects. | `@monaco-editor/react` |
| Inline script content passed to `dw` via shell args | Shell argument length limits (typically ~2MB on macOS/Linux) will silently truncate or reject large scripts. Pass scripts as temp files. | Temp file pattern via `--main` flag |
| Embedding the DataWeave Java runtime directly | The DataWeave runtime is deeply entangled with the Mule runtime. There is no clean public "embed the DW engine in a JVM app" API. The CLI is the supported interface. Bundling a JVM also adds 50-200MB to the installer. | `dw` CLI as sidecar |
| Redux | 30x more boilerplate than Zustand for the same outcome. Middleware, reducers, actions, selectors — all unnecessary for an app with ~5 pieces of shared state. | Zustand |
| MUI / Ant Design / Chakra UI | Heavy component libraries when you only need 4-5 primitives (Select, Button, Tabs, Dialog). shadcn/ui copies only the components you need with zero runtime overhead. | shadcn/ui |
## Stack Patterns by Variant
- Bundle the `dw` binary as an Electron sidecar inside the app using `electron-builder`'s `extraResources` field
- The DataWeave CLI is BSD-3-Clause licensed, so bundling is permitted
- Target triples: `dw-x64-darwin`, `dw-arm64-darwin`, `dw-x64-win32`, `dw-x64-linux`
- Detect at startup: try `dw --version`; fall back to bundled binary path
- The `--path` flag accepts JAR files in addition to directories
- The UI module path picker should allow selecting both files and directories
- Research required: verify JAR loading behavior in the native CLI (confirmed for the Java version; native binary status MEDIUM confidence)
- Use `dw run --main <qualified-name> --path <script-dir>` instead of inline script
- This avoids shell escaping issues with complex multi-line scripts
- Write the script to a temp `.dwl` file and pass its directory as `--path`
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@monaco-editor/react@4.6.x` | `monaco-editor@0.55.x`, React 18 or 19 | v4.7.0-rc.0 adds React 19 support; use stable 4.6.x until it reaches GA |
| `monaco-editor-workers@0.55.x` | `monaco-editor@0.55.x` | Must match monaco-editor minor version exactly |
| `tailwindcss@v4` | shadcn/ui (Tailwind v4 branch, Feb 2025+) | shadcn/ui fully supports Tailwind v4 as of Feb 2025 update; uses OKLCH colors |
| Zustand 5.x | React 18+ only | Dropped React 17 support. React 19 compatible. |
| `electron-vite` | Electron 28+ | Check electron-vite releases for current Electron version support |
| `electron-builder` | Electron 28+ | Actively maintained; supports latest Electron stable |
## Sources
- [DoltHub: Electron vs. Tauri (Nov 2025)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/) — framework comparison, MEDIUM confidence
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) — Tauri 2.0 released Oct 2, 2024, HIGH confidence
- [Tauri Sidecar / Embedding External Binaries](https://v2.tauri.app/develop/sidecar/) — sidecar configuration, HIGH confidence
- [tauri-apps/tauri Discussion #9595 — WebWorkers in Tauri](https://github.com/orgs/tauri-apps/discussions/9595) — Monaco WebWorker/CSP issue confirmed, MEDIUM confidence
- [mulesoft/data-weave-cli GitHub](https://github.com/mulesoft/data-weave-cli) — v1.0.36, `--path` flag, BSD-3-Clause, HIGH confidence
- [Omni3Tech/data-weave-native](https://github.com/Omni3Tech/data-weave-native) — `--path` / `-p` flag documented, Graal native binary, MEDIUM confidence
- [monaco-editor npm](https://www.npmjs.com/package/monaco-editor) — latest stable 0.55.x, HIGH confidence
- [@monaco-editor/react npm](https://www.npmjs.com/package/@monaco-editor/react) — v4.6.x stable, v4.7.0-rc.0 for React 19, MEDIUM confidence
- [monaco-editor-workers npm](https://www.npmjs.com/package/monaco-editor-workers) — Vite worker bundling solution, MEDIUM confidence
- [vite-plugin-monaco-editor](https://github.com/vdesjs/vite-plugin-monaco-editor) — alternative worker approach, LOW confidence (less maintained)
- [Tailwind CSS v4.0](https://tailwindcss.com/blog/tailwindcss-v4) — v4 stable, HIGH confidence
- [shadcn/ui Tailwind v4 support (Feb 2025)](https://ui.shadcn.com/docs/changelog/2025-02-tailwind-v4) — confirmed Tailwind v4 + React 19, HIGH confidence
- [Zustand v5 announcement](https://pmnd.rs/blog/announcing-zustand-v5) — v5.0.12 latest, React 18+ required, HIGH confidence
- [Electron 41 releases](https://www.electronjs.org/blog) — current stable ~41.x, HIGH confidence
- [Monaco Editor custom language / Monarch tokenizer](https://microsoft.github.io/monaco-editor/monarch.html) — DataWeave syntax highlighting approach, HIGH confidence
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
