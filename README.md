# DataWeave Editor

Local desktop app for writing and testing DataWeave transformations — no size limits, no network calls.

## Install

```bash
brew tap chrises5/tap
brew install --cask dataweave-editor
```

This automatically installs the [DataWeave CLI](https://github.com/mulesoft-labs/data-weave-native) (`dw`) if not already present.

## Features

- 3-panel editor: Input | Script | Output
- DataWeave syntax highlighting (Monarch tokenizer)
- Multiple session tabs (Cmd+T, Cmd+1-9 to switch)
- Dark mode (Cmd+Shift+D)
- Session persistence across restarts
- Log output capture (collapsible panel)
- File drop zone for inputs
- Output syntax highlighting based on output MIME type
- Auto-generated correlationId per execution

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+Enter | Run script |
| Cmd+T | New session tab |
| Cmd+W | Close session tab |
| Cmd+1-9 | Switch to tab by number |
| Cmd+Shift+] | Next tab |
| Cmd+Shift+[ | Previous tab |
| Cmd+Shift+D | Toggle dark mode |

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:mac        # Both arm64 + x64
npm run build:mac-arm64  # Apple Silicon only
npm run build:mac-x64    # Intel only
```

## License

MIT
