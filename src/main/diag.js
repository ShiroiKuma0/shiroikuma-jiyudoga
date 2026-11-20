import { app, dialog, shell } from 'electron'
import path from 'path'
import { appendFile, copyFile, mkdir, open, readdir, readFile, rm, rmdir, stat, utimes, writeFile } from 'fs/promises'

/**
 * 白い熊 UI settings › Diagnostics, the desktop half (the phone's is `diag/Diag.kt`).
 *
 * Every diagnostic the app writes sits behind its own switch, all OFF by default — off means the
 * line is never written. Everything goes to `<userData>/diag/`, one file per kind per day:
 * `jiyudoga-<kind>_<yyyy-MM-dd>.txt`, local dates, each line stamped with the local clock. Never
 * `.log` — on the phone EMUI deletes those as junk, and the two platforms share one layout so an
 * export from either reads the same.
 *
 * The switches live HERE, in main, rather than in the settings database: the console capture in
 * `rendererLog.js` has to know whether to write before the renderer has loaded its settings, and a
 * failure during startup is exactly the kind that needs recording.
 */

/** In the order the settings page shows them. */
export const DIAG_KINDS = ['playback', 'sync', 'console']

const PREFIX = 'jiyudoga-'
const EXT = '.txt'
const FILE_PATTERN = /^jiyudoga-([a-z]+)_(\d{4}-\d{2}-\d{2})\.txt$/

/** A runaway logger stops at this much per kind per day rather than filling the disk. */
const MAX_DAY_BYTES = 64 * 1024 * 1024
const FLUSH_DELAY_MS = 1000

let state = { on: {}, keepDays: 0, marks: 0 }
let loaded = false

/** @type {Map<string, string[]>} kind → lines waiting for the next flush */
const pending = new Map()
let flushTimer = null

/** @type {(() => void) | null} told whenever a switch changes, to keep every window in step */
let onChange = null

export function diagDirectory() {
  return path.join(app.getPath('userData'), 'diag')
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'diag-settings.json')
}

function pad(number, width = 2) {
  return String(number).padStart(width, '0')
}

/** @param {Date} date */
function localDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** @param {Date} date */
function localClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function fileFor(kind, day) {
  return path.join(diagDirectory(), `${PREFIX}${kind}_${day}${EXT}`)
}

/**
 * One entry as it lands in the file: the clock, two spaces, the text — continuation lines
 * indented so a multi-line entry (a stack, a state dump) stays visibly one entry.
 * @param {string} text
 * @param {Date} date
 */
function formatLine(text, date) {
  return `${localClock(date)}  ${String(text).replaceAll('\n', '\n    ')}\n`
}

async function saveState() {
  try {
    await writeFile(settingsFile(), JSON.stringify(state))
  } catch { }
}

/**
 * Loads the switches, moves the old always-on `logs/renderer.log` in, and applies the retention.
 * @param {() => void} changeListener
 */
export async function initDiag(changeListener) {
  onChange = changeListener

  try {
    const stored = JSON.parse(await readFile(settingsFile(), 'utf8'))

    state = {
      on: typeof stored.on === 'object' && stored.on !== null ? stored.on : {},
      keepDays: Number.isInteger(stored.keepDays) && stored.keepDays > 0 ? stored.keepDays : 0,
      marks: Number.isInteger(stored.marks) ? stored.marks : 0
    }
  } catch { }

  loaded = true

  try {
    await migrateRendererLog()
  } catch { }

  try {
    await cleanupDiag()
  } catch { }
}

export function isDiagOn(kind) {
  return state.on[kind] === true
}

export function getDiagState() {
  return {
    on: Object.fromEntries(DIAG_KINDS.map(kind => [kind, isDiagOn(kind)])),
    keepDays: state.keepDays,
    directory: diagDirectory()
  }
}

/**
 * @param {string} kind
 * @param {boolean} value
 * @param {string} version the running FORK_VERSION, which only the renderer knows
 */
export async function setDiagKind(kind, value, version) {
  if (!DIAG_KINDS.includes(kind)) return

  if (!value && isDiagOn(kind)) {
    appendDiag(kind, `diag ${kind} off`)
    await flushDiag()
  }

  state.on[kind] = value === true
  await saveState()

  if (value) {
    appendDiag(kind, `diag ${kind} on, ${version}`)
  }

  onChange?.()
}

export async function setDiagKeepDays(days) {
  state.keepDays = Number.isInteger(days) && days > 0 ? days : 0
  await saveState()
  onChange?.()
}

/**
 * One entry into today's file of `kind` — when its switch is on, and never in anyone's way.
 * @param {string} kind
 * @param {string} text
 */
export function appendDiag(kind, text) {
  if (!loaded || !isDiagOn(kind)) return

  const lines = pending.get(kind) ?? []
  lines.push(formatLine(text, new Date()))
  pending.set(kind, lines)

  if (flushTimer === null) {
    flushTimer = setTimeout(flushDiag, FLUSH_DELAY_MS)
    // never hold the process open just to write a line
    flushTimer.unref?.()
  }
}

/**
 * Writes everything buffered. Each flush opens the file afresh, so one deleted under us (a purge,
 * a hand in a file manager) is simply started again instead of swallowing every later line.
 */
export async function flushDiag() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  if (pending.size === 0) return

  const batches = [...pending.entries()]
  pending.clear()

  const day = localDay(new Date())

  try {
    await mkdir(diagDirectory(), { recursive: true })
  } catch {
    return
  }

  for (const [kind, lines] of batches) {
    const file = fileFor(kind, day)

    try {
      const size = await stat(file).then(info => info.size, () => 0)

      if (size > MAX_DAY_BYTES) continue

      await appendFile(file, lines.join(''))
    } catch {
      // diagnostics must never be the reason anything else fails
    }
  }
}

/**
 * A numbered marker in every file being recorded — “something happened here”.
 * @returns {Promise<number>} the mark's number, 0 when nothing is recording
 */
export async function markDiag() {
  const recording = DIAG_KINDS.filter(isDiagOn)

  if (recording.length === 0) return 0

  state.marks += 1
  await saveState()

  for (const kind of recording) {
    appendDiag(kind, `mark #${state.marks}`)
  }

  await flushDiag()

  return state.marks
}

/** Today's console file, when the console is being recorded — what the log viewer points at. */
export function consoleDiagPath() {
  return isDiagOn('console') ? fileFor('console', localDay(new Date())) : ''
}

async function listDiagFiles() {
  let names

  try {
    names = await readdir(diagDirectory())
  } catch {
    return []
  }

  return names
    .map(name => ({ name, match: FILE_PATTERN.exec(name) }))
    .filter(entry => entry.match !== null)
    .map(entry => ({ name: entry.name, kind: entry.match[1], day: entry.match[2], path: path.join(diagDirectory(), entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The time of a file's first line: the day from its name, the clock from the line. */
async function firstTime(file) {
  let handle = null

  try {
    handle = await open(file.path, 'r')

    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0)
    const clock = /^(\d{2}):(\d{2}):(\d{2})/.exec(buffer.toString('utf8', 0, bytesRead))

    if (!clock) return 0

    const [year, month, date] = file.day.split('-').map(Number)
    return new Date(year, month - 1, date, Number(clock[1]), Number(clock[2]), Number(clock[3])).getTime()
  } catch {
    return 0
  } finally {
    await handle?.close()
  }
}

/**
 * What is stored: totals, the span of each day and the files of each kind — for the Stored row
 * and the purge warning, which states exactly what would go.
 */
export async function summarizeDiag() {
  await flushDiag()

  const summary = { files: 0, bytes: 0, first: 0, last: 0, days: {}, kinds: {} }

  for (const file of await listDiagFiles()) {
    let info

    try {
      info = await stat(file.path)
    } catch {
      continue
    }

    const end = info.mtimeMs
    const begun = await firstTime(file)
    const start = begun > 0 && begun <= end ? begun : end

    summary.files += 1
    summary.bytes += info.size
    summary.first = summary.first === 0 ? start : Math.min(summary.first, start)
    summary.last = Math.max(summary.last, end)

    const span = summary.days[file.day] ?? [start, end]
    summary.days[file.day] = [Math.min(span[0], start), Math.max(span[1], end)]

    const kind = summary.kinds[file.kind] ?? { files: 0, bytes: 0, first: start, last: end }
    summary.kinds[file.kind] = {
      files: kind.files + 1,
      bytes: kind.bytes + info.size,
      first: Math.min(kind.first, start),
      last: Math.max(kind.last, end)
    }
  }

  return summary
}

/** Deletes the files of days older than the kept ones. @returns {Promise<number>} how many went */
export async function cleanupDiag() {
  if (state.keepDays <= 0) return 0

  const oldest = new Date()
  oldest.setDate(oldest.getDate() - (state.keepDays - 1))
  const oldestKept = localDay(oldest)

  let removed = 0

  for (const file of await listDiagFiles()) {
    if (file.day < oldestKept) {
      try {
        await rm(file.path)
        removed += 1
      } catch { }
    }
  }

  return removed
}

/** Deletes everything recorded. @returns {Promise<number>} how many files went */
export async function purgeDiag() {
  pending.clear()

  let removed = 0

  for (const file of await listDiagFiles()) {
    try {
      await rm(file.path)
      removed += 1
    } catch { }
  }

  return removed
}

/**
 * Copies every file into a new `yyyy-MM-dd_HH-mm-ss_jiyudoga-diag` subdirectory of a directory
 * picked each time.
 * @param {Electron.BrowserWindow | null} window
 * @returns {Promise<{ path: string, files: number } | null>} null when cancelled or empty
 */
export async function exportDiag(window) {
  await flushDiag()

  const files = await listDiagFiles()

  if (files.length === 0) return null

  const options = {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: app.getPath('downloads')
  }

  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) return null

  const now = new Date()
  const stamp = `${localDay(now)}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const into = path.join(result.filePaths[0], `${stamp}_jiyudoga-diag`)

  await mkdir(into, { recursive: true })

  for (const file of files) {
    await copyFile(file.path, path.join(into, file.name))
  }

  return { path: into, files: files.length }
}

/** Opens the diag directory in the file manager — the desktop's stand-in for Android's Share. */
export async function openDiagDirectory() {
  await mkdir(diagDirectory(), { recursive: true })
  return shell.openPath(diagDirectory())
}

// ---- moving the old always-on log in ----

const OLD_ENTRY_HEADER = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\] (.*)$/

/**
 * Until 2026-11-19 the desktop wrote every renderer warning and error to `logs/renderer.log`
 * (rotated to `.1`), always on. Its entries are sorted into the console files of the local day
 * they happened on, in front of anything already recorded for that day, and the old files go.
 */
async function migrateRendererLog() {
  const logsDirectory = path.join(app.getPath('userData'), 'logs')
  const sources = ['renderer.log.1', 'renderer.log'].map(name => path.join(logsDirectory, name))

  /** @type {Map<string, string[]>} */
  const byDay = new Map()
  /** @type {Map<string, number>} each day's last entry, which becomes its file's modification time */
  const lastByDay = new Map()
  const migrated = []

  for (const source of sources) {
    let text

    try {
      text = await readFile(source, 'utf8')
    } catch {
      continue
    }

    migrated.push(source)

    let day = null
    let entry = []

    const finish = () => {
      if (day !== null && entry.length > 0) {
        const lines = byDay.get(day) ?? []
        lines.push(entry.join('\n') + '\n')
        byDay.set(day, lines)
      }
      entry = []
    }

    for (const line of text.split('\n')) {
      const header = OLD_ENTRY_HEADER.exec(line)

      if (header) {
        finish()
        const date = new Date(header[1])
        day = localDay(date)
        lastByDay.set(day, Math.max(lastByDay.get(day) ?? 0, date.getTime()))
        entry.push(`${localClock(date)}  ${header[2]}`)
      } else if (line !== '' && day !== null) {
        entry.push(line)
      }
    }

    finish()
  }

  if (migrated.length === 0) return

  await mkdir(diagDirectory(), { recursive: true })

  for (const [day, entries] of byDay) {
    const target = fileFor('console', day)
    const existing = await readFile(target, 'utf8').catch(() => '')
    const existingTime = await stat(target).then(info => info.mtimeMs, () => 0)

    await writeFile(target, entries.join('') + existing)

    // the summary reads a day's end from the modification time: keep it the day's, not today's
    const last = Math.max(lastByDay.get(day) ?? 0, existingTime)
    if (last > 0) {
      await utimes(target, new Date(last), new Date(last)).catch(() => { })
    }
  }

  // only reached when every write above succeeded — a failure throws first and keeps the old files
  for (const source of migrated) {
    await rm(source).catch(() => { })
  }

  // only if nothing else lives there
  await rmdir(logsDirectory).catch(() => { })
}
