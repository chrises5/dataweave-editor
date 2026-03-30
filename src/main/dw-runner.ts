import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, rm, access, constants } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import stripAnsi from 'strip-ansi'

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
  error?: string
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

export async function getDwPath(): Promise<string> {
  if (!app.isPackaged) {
    return 'dw'
  }
  const bundled = join(process.resourcesPath, 'bin', 'dw')
  try {
    await access(bundled, constants.X_OK)
    return bundled
  } catch {
    return 'dw'
  }
}

export async function executeDw(payload: ExecutePayload): Promise<DwResult> {
  const dir = await mkdtemp(join(tmpdir(), 'dw-'))
  const scriptPath = join(dir, 'transform.dwl')
  try {
    await writeFile(scriptPath, payload.script, 'utf8')

    const inputArgs: string[] = []
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

    const dwPath = await getDwPath()
    const { stdout } = await execFileAsync(
      dwPath,
      ['run', ...inputArgs, '-f', scriptPath],
      { timeout: 30_000, encoding: 'utf8' }
    )
    return { ok: true, output: stdout }
  } catch (err: unknown) {
    const anyErr = err as { stderr?: string; message?: string }
    const raw: string = anyErr.stderr ?? anyErr.message ?? String(err)
    const cleaned = stripAnsi(raw)
      .split('\n')
      .filter((line: string) => line.includes('[ERROR]'))
      .join('\n')
      .trim()
    return { ok: false, error: cleaned || stripAnsi(raw) }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
