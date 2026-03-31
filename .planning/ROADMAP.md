# Roadmap: DataWeave Editor

## Current Milestone: v1

### Phase 1: CLI Feasibility Spike
- **Goal:** Validate DataWeave CLI as viable execution engine
- **Status:** Complete

### Phase 2: Desktop Shell and Execution Core
- **Goal:** Electron app with CLI execution integration
- **Status:** Complete

### Phase 3: 3-Panel UI and Input System
- **Goal:** Build the 3-panel layout with dynamic input slots
- **Status:** Complete

### Phase 4: Editor Polish, Modules, Session Persistence
- **Goal:** Syntax highlighting, log viewer, session persistence
- **Status:** Complete

### Phase 5: Tabs for Multiple Sessions
- **Goal:** Multiple independent session tabs
- **Status:** Complete

### Phase 6: Toggleable Dark Mode
- **Goal:** VS Code Dark+ theme toggle with persistence
- **Status:** Complete

### Phase 7: JVM Sidecar for DataWeave Execution
- **Goal:** Replace CLI with embedded JVM sidecar for faster execution
- **Status:** In progress

### Phase 8: AST-based DataWeave Formatter
- **Goal:** Replace heuristic line-based formatter with recursive-descent parser, AST, and Doc-algebra pretty-printer for correct, maintainable DataWeave formatting
- **Depends on:** None (independent of Phase 7)
- **Status:** In progress (2/3 plans complete)
- **Plans:** 3 plans

Plans:
- [x] 08-01-PLAN.md — Lexer and AST type definitions
- [x] 08-02-PLAN.md — Recursive-descent Pratt parser
- [ ] 08-03-PLAN.md — Doc-algebra printer, V2 entry point, and ScriptPanel wiring
