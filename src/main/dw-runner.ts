import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, readFile, rm, access, constants } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')

const execFileAsync = promisify(execFile)

export interface ExecuteInputSlot {
  name: string
  mimeType: string
  content: string | null
  filePath: string | null
}

export interface ExecutePayload {
  script: string
  inputs: ExecuteInputSlot[]
}

export interface DwResult {
  ok: boolean
  output?: string
  logs?: string[]    // parsed log() lines from stdout (when using -o flag)
  error?: string
}

export interface DwDiagnostic {
  message: string
  line: number
  column: number
}

export interface DwValidateResult {
  ok: boolean
  diagnostics: DwDiagnostic[]
}

function parseLogLines(raw: string): string[] {
  if (!raw.trim()) return []
  return raw.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
}

const MIME_TO_EXT: Record<string, string> = {
  'application/json': '.json',
  'application/xml': '.xml',
  'text/csv': '.csv',
  'application/yaml': '.yaml',
  'text/plain': '.txt',
  'application/x-www-form-urlencoded': '.txt',
  'multipart/form-data': '.multipart',
}

const DW_SEARCH_PATHS = [
  '/opt/homebrew/bin/dw',
  '/usr/local/bin/dw',
  join(process.env.HOME ?? '', '.local/bin/dw'),
]

export async function getDwPath(): Promise<string | null> {
  if (!app.isPackaged) {
    return 'dw'
  }
  // Check bundled binary first
  const bundled = join(process.resourcesPath, 'bin', 'dw')
  try {
    await access(bundled, constants.X_OK)
    return bundled
  } catch {
    // Search common install locations
    for (const p of DW_SEARCH_PATHS) {
      try {
        await access(p, constants.X_OK)
        return p
      } catch { /* continue */ }
    }
    return null
  }
}

const HEADER_RE = /^(%dw\s[\d.]+\s*\n(?:(?:output|input|import|ns)\b[^\n]*\n)*)(?=---|\S)/m

const PREAMBLE = 'fun p(s)=s\n'
const PREAMBLE_LINES = PREAMBLE.split('\n').length - 1 // 1

function injectPreamble(script: string): { script: string; injected: boolean } {
  const match = script.match(HEADER_RE)
  if (match) {
    const headerEnd = match.index! + match[0].length
    return { script: script.slice(0, headerEnd) + PREAMBLE + script.slice(headerEnd), injected: true }
  }
  return { script, injected: false }
}

export async function executeDw(payload: ExecutePayload): Promise<DwResult> {
  const dwPath = await getDwPath()
  if (!dwPath) {
    return {
      ok: false,
      error: 'DataWeave CLI (dw) not found.\n\nInstall it with: brew install mulesoft/data-weave-cli/dw\n\nOr download from: https://github.com/mulesoft/data-weave-cli'
    }
  }

  const prepared = injectPreamble(payload.script)
  const dir = await mkdtemp(join(tmpdir(), 'dw-'))
  const scriptPath = join(dir, 'transform.dwl')
  try {
    await writeFile(scriptPath, prepared.script, 'utf8')

    // Always provide a correlationId variable (UUID)
    const correlationIdPath = join(dir, 'correlationId.txt')
    await writeFile(correlationIdPath, randomUUID(), 'utf8')
    const inputArgs: string[] = ['-i', `correlationId=${correlationIdPath}`]

    for (const slot of payload.inputs) {
      let inputPath: string
      if (slot.filePath) {
        inputPath = slot.filePath
      } else {
        const ext = MIME_TO_EXT[slot.mimeType] ?? '.txt'
        inputPath = join(dir, `${slot.name}${ext}`)
        await writeFile(inputPath, slot.content ?? '', 'utf8')
      }
      inputArgs.push('-i', `${slot.name}=${inputPath}`)
    }

    const outputPath = join(dir, 'output.txt')
    const { stdout } = await execFileAsync(
      dwPath,
      ['run', ...inputArgs, '-f', scriptPath, '-o', outputPath],
      { timeout: 30_000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )
    const rawLogs = stripAnsi(stdout)
    const output = await readFile(outputPath, 'utf8').catch(() => '')
    return { ok: true, output, logs: parseLogLines(rawLogs) }
  } catch (err: unknown) {
    const anyErr = err as { stderr?: string; message?: string }
    const raw: string = anyErr.stderr ?? anyErr.message ?? String(err)
    const lines = stripAnsi(raw).split('\n')
    const firstErrorIdx = lines.findIndex((line: string) => line.includes('[ERROR]'))
    let cleaned = firstErrorIdx >= 0
      ? lines.slice(firstErrorIdx).join('\n').trim()
      : raw.trim()
    if (prepared.injected) {
      cleaned = adjustErrorLineNumbers(cleaned, -PREAMBLE_LINES)
    }
    return { ok: false, error: cleaned || stripAnsi(raw) }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function adjustErrorLineNumbers(text: string, offset: number): string {
  // Adjust "(line: N, column:M)" references
  return text.replace(/\(line:\s*(\d+)/g, (_, n) => `(line: ${Math.max(1, parseInt(n, 10) + offset)}`)
    // Adjust "N| code" source line references
    .replace(/^(\d+)\|/gm, (_, n) => `${Math.max(1, parseInt(n, 10) + offset)}|`)
}

const LOC_RE = /\(line:\s*(\d+),\s*column:\s*(\d+)\)/

function parseDiagnostics(raw: string): DwDiagnostic[] {
  const cleaned = stripAnsi(raw)
  // Split into individual error blocks separated by the [ERROR] prefix
  const blocks = cleaned.split(/(?=\[ERROR])/).filter((b) => b.includes('[ERROR]'))
  const diagnostics: DwDiagnostic[] = []

  for (const block of blocks) {
    const firstLine = block.split('\n')[0]
    const msg = firstLine.replace(/^\[ERROR]\s*/, '').trim()
    if (!msg) continue

    // Find location line within this block
    const locMatch = block.match(LOC_RE)
    diagnostics.push({
      message: msg,
      line: locMatch ? parseInt(locMatch[1], 10) : 1,
      column: locMatch ? parseInt(locMatch[2], 10) : 1,
    })
  }

  return diagnostics
}

export async function validateDw(script: string, inputNames: string[]): Promise<DwValidateResult> {
  const dwPath = await getDwPath()
  if (!dwPath) return { ok: true, diagnostics: [] }

  const prepared = injectPreamble(script)
  const dir = await mkdtemp(join(tmpdir(), 'dw-val-'))
  const scriptPath = join(dir, 'transform.dwl')
  try {
    await writeFile(scriptPath, prepared.script, 'utf8')
    const inputArgs = inputNames.flatMap((name) => ['-i', name])
    await execFileAsync(dwPath, ['validate', ...inputArgs, '-f', scriptPath], {
      timeout: 10_000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { ok: true, diagnostics: [] }
  } catch (err: unknown) {
    const anyErr = err as { stderr?: string; message?: string }
    const raw: string = anyErr.stderr ?? anyErr.message ?? String(err)
    const diagnostics = parseDiagnostics(raw)
    if (prepared.injected) {
      for (const d of diagnostics) {
        d.line = Math.max(1, d.line - PREAMBLE_LINES)
      }
    }
    return { ok: diagnostics.length === 0, diagnostics }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
