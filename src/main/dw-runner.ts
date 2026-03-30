import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, rm, access, constants } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import stripAnsi from 'strip-ansi'

const execFileAsync = promisify(execFile)

export async function getDwPath(): Promise<string> {
  if (!app.isPackaged) {
    return 'dw' // rely on system PATH in development
  }
  const bundled = join(process.resourcesPath, 'bin', 'dw')
  try {
    await access(bundled, constants.X_OK)
    return bundled
  } catch {
    return 'dw' // fallback to PATH
  }
}

export interface DwResult {
  ok: boolean
  output?: string
  error?: string
}

export async function executeDw(script: string, input: string): Promise<DwResult> {
  const dir = await mkdtemp(join(tmpdir(), 'dw-'))
  const scriptPath = join(dir, 'transform.dwl')
  const inputPath = join(dir, 'payload.json')
  try {
    await writeFile(scriptPath, script, 'utf8')
    await writeFile(inputPath, input, 'utf8')
    const dwPath = await getDwPath()
    const { stdout } = await execFileAsync(
      dwPath,
      ['run', '-i', `payload=${inputPath}`, '-f', scriptPath],
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
