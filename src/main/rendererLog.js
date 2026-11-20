import { appendDiag, consoleDiagPath, flushDiag } from './diag'

/**
 * Keeps the renderer's most recent console entries in memory for the in-app viewer, and hands
 * each one to the Diagnostics console kind (`diag.js`), which writes it only while that switch
 * is on. Until 2026-11-19 this wrote `logs/renderer.log` unconditionally; `diag.js` moves that
 * file's entries into the console files on the first start.
 *
 * The desktop build had nowhere to read a console message from after the fact. DevTools shows
 * them live, but nothing outlives a reload, let alone a restart — so a failure only noticed
 * minutes later (a player that stopped mid-video and would not restart) had to be caught
 * red-handed to be diagnosed at all. Android has had FtaLogViewer for the same reason, its
 * WebView console being otherwise unreachable; this is the desktop half of that idea, with the
 * addition that this one can survive the app closing.
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

/** @type {object[]} oldest first */
const ring = []

let counter = 0

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

    // On disk only while 白い熊 UI settings › Diagnostics › Console is on (default off).
    appendDiag('console', `${entry.level} ${entry.sourceId}:${entry.lineNumber}\n${entry.content}`)

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
  return flushDiag()
}

/**
 * Where today's console entries are written — empty while the console is not being recorded.
 * @returns {string}
 */
export function getRendererLogPath() {
  return consoleDiagPath()
}
