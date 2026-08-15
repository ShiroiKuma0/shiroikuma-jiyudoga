import { app } from 'electron'
import path from 'path'
import { appendFile, mkdir, rename, stat } from 'fs/promises'

/**
 * Persists the renderer's console to disk and keeps the most recent entries in memory for the
 * in-app viewer.
 *
 * The desktop build had nowhere to read a console message from after the fact. DevTools shows
 * them live, but nothing outlives a reload, let alone a restart — so a failure only noticed
 * minutes later (a player that stopped mid-video and would not restart) had to be caught
 * red-handed to be diagnosed at all. Android has had FtaLogViewer for the same reason, its
 * WebView console being otherwise unreachable; this is the desktop half of that idea, with the
 * addition that this one survives the app closing.
 *
 * Capture happens in the MAIN process rather than by wrapping `console` in the renderer,
 * because `webContents`'s own `console-message` also carries what Chromium reports on the
 * renderer's behalf — "Failed to load resource: the server responded with a status of 401" and
 * its kind, which no `console.*` wrapper can see, and which is exactly the line that identifies
 * a streaming session YouTube has invalidated.
 */

/**
 * Only these are kept. `info` and `debug` are almost entirely third-party chatter, and the
 * point of the file is to still be readable weeks later.
 */
const KEPT_LEVELS = new Set(['warning', 'error'])

/** Electron's level names in the uppercase form FtaLogViewer already styles and icons. */
const LEVEL_NAMES = {
  error: 'ERROR',
  warning: 'WARNING',
  info: 'LOG',
  debug: 'DEBUG'
}

/** Matches FtaLogViewer's own limit — a shaka stack trace is one entry, and the cause sits above it. */
const RING_LIMIT = 250

const MAX_BYTES = 2 * 1024 * 1024
const FLUSH_DELAY_MS = 2000

/** @type {object[]} oldest first */
const ring = []

/** @type {string[]} */
let pending = []
let flushTimer = null
let counter = 0
let logFile = null

function getLogFile() {
  if (logFile === null) {
    logFile = path.join(app.getPath('userData'), 'logs', 'renderer.log')
  }

  return logFile
}

function formatEntry(entry) {
  // Continuation lines are indented so a stack trace stays visibly part of its own entry
  // rather than reading as a run of separate ones.
  const body = entry.content.replaceAll('\n', '\n    ')

  return `[${new Date(entry.timestamp).toISOString()}] ${entry.level} ${entry.sourceId}:${entry.lineNumber}\n    ${body}\n`
}

async function flush() {
  flushTimer = null

  if (pending.length === 0) {
    return
  }

  const text = pending.join('')
  pending = []

  const file = getLogFile()

  try {
    await mkdir(path.dirname(file), { recursive: true })
    await appendFile(file, text)

    const { size } = await stat(file)

    if (size > MAX_BYTES) {
      // One generation back covers "it broke a little while ago" without letting the logs
      // grow without bound.
      await rename(file, `${file}.1`)
    }
  } catch {
    // Logging must never be able to take the app down, and there is nowhere useful to report
    // a failure to log to.
  }
}

function scheduleFlush() {
  if (flushTimer === null) {
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS)

    // Never hold the process open just to write a log line.
    flushTimer.unref?.()
  }
}

/**
 * Starts capturing one window's console output.
 * @param {Electron.WebContents} webContents
 * @param {((entry: object) => void)?} onEntry called for each kept entry, to push it to a live viewer
 */
export function attachRendererLog(webContents, onEntry = null) {
  webContents.on('console-message', (details) => {
    if (!KEPT_LEVELS.has(details.level)) {
      return
    }

    const entry = {
      key: `${Date.now()}-${counter++}`,
      level: LEVEL_NAMES[details.level] ?? details.level.toUpperCase(),
      content: details.message ?? '',
      sourceId: details.sourceId ?? '',
      lineNumber: details.lineNumber ?? 0,
      timestamp: Date.now()
    }

    ring.push(entry)
    if (ring.length > RING_LIMIT) {
      ring.splice(0, ring.length - RING_LIMIT)
    }

    pending.push(formatEntry(entry))
    scheduleFlush()

    onEntry?.(entry)
  })
}

/**
 * The entries still in memory, oldest first — what a viewer opening now should backfill with.
 * @returns {object[]}
 */
export function getRendererLogs() {
  return ring.slice()
}

/** Writes anything still buffered. Called on quit, so the last words before a crash survive. */
export function flushRendererLog() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
  }

  return flush()
}

/**
 * Where the log is written, so the app can tell you where to look.
 * @returns {string}
 */
export function getRendererLogPath() {
  return getLogFile()
}
