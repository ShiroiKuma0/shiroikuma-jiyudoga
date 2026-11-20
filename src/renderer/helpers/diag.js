import { computed, reactive } from 'vue'
import android from 'android'

/**
 * 白い熊 UI settings › Diagnostics, the renderer's side. The switches and the files belong to the
 * platform — `src/main/diag.js` on the desktop, `diag/Diag.kt` on the phone — because both have
 * to know whether to record before this page has loaded anything. Everything here is a thin
 * client of those, plus a cached copy of the switches so `diag()` costs nothing while a kind
 * is off.
 *
 * Every kind is OFF by default: nothing is written until 白い熊 turns it on.
 */

/** In the order the settings page shows them, each under its own subsection, with its row icon and role. */
export const DIAG_KINDS = [
  // what the player and the stream did: playhead rewinds, SABR segments and sessions, decoder stalls
  { key: 'playback', group: 'Playback', icon: 'film', role: 'view' },
  // every device-sync run: what was read, merged and sent, and why one failed
  { key: 'sync', group: 'Sync', icon: 'exchange-alt', role: 'connect' },
  // every warning and error the app prints, including the ones Chromium reports on its behalf
  { key: 'console', group: 'App', icon: 'terminal', role: 'view' },
]

export const diagState = reactive({
  on: Object.fromEntries(DIAG_KINDS.map(kind => [kind.key, false])),
  keepDays: 0,
  directory: '',
})

/** True while any kind is recording — the desktop top bar shows a dot for it. */
export const diagRecording = computed(() => Object.values(diagState.on).some(Boolean))

const SUPPORTED = !!process.env.IS_ANDROID || !!process.env.IS_ELECTRON

export async function refreshDiagState() {
  if (!SUPPORTED) return

  try {
    const state = process.env.IS_ANDROID
      ? JSON.parse(android.diagGetState())
      : await window.ftElectron.diagGetState()

    for (const kind of DIAG_KINDS) {
      diagState.on[kind.key] = state.on?.[kind.key] === true
    }

    diagState.keepDays = state.keepDays ?? 0
    diagState.directory = state.directory ?? ''
  } catch { }
}

let started = false

/** Loads the switches and follows them: another window, or the phone's notification, can change them. */
export function startDiag() {
  if (!SUPPORTED || started) return

  started = true
  refreshDiagState()

  if (process.env.IS_ANDROID) {
    window.addEventListener('diag-changed', refreshDiagState)
  } else {
    window.ftElectron.onDiagChanged(refreshDiagState)
  }
}

/**
 * One entry into today's file of `kind` — when its switch is on; otherwise nothing at all happens.
 * Multi-line text stays one entry (continuation lines are indented in the file).
 * @param {'playback' | 'sync' | 'console'} kind
 * @param {string | (() => string)} text a function is only called when the kind is on
 */
export function diag(kind, text) {
  if (!diagState.on[kind]) return

  try {
    const line = typeof text === 'function' ? text() : text

    if (process.env.IS_ANDROID) {
      android.diagAppend(kind, line)
    } else if (process.env.IS_ELECTRON) {
      window.ftElectron.diagAppend(kind, line)
    }
  } catch {
    // diagnostics must never be the reason anything else fails
  }
}

/**
 * For the lines that also belong in the console: printed as a warning (so the log viewer and the
 * console kind have it) AND written to `kind`.
 * @param {'playback' | 'sync'} kind
 * @param {string} text
 * @param {...any} extra printed as-is, written as text (an Error, a value)
 */
export function diagWarn(kind, text, ...extra) {
  console.warn(text, ...extra)
  diag(kind, () => withExtra(text, extra))
}

/**
 * @param {string} text
 * @param {any[]} extra
 */
function withExtra(text, extra) {
  if (extra.length === 0) return text

  return [text, ...extra.map(value => value instanceof Error ? (value.stack ?? String(value)) : String(value))].join('\n')
}

/**
 * As {@link diagWarn}, printed as an error.
 * @param {'playback' | 'sync'} kind
 * @param {string} text
 * @param {...any} extra
 */
export function diagError(kind, text, ...extra) {
  console.error(text, ...extra)
  diag(kind, () => withExtra(text, extra))
}

/**
 * @param {string} kind
 * @param {boolean} value
 */
export async function setDiagKind(kind, value) {
  if (!SUPPORTED) return

  const version = process.env.FORK_VERSION ?? ''

  if (process.env.IS_ANDROID) {
    android.diagSetKind(kind, value, version)
  } else {
    await window.ftElectron.diagSetKind(kind, value, version)
  }

  await refreshDiagState()
}

/** @param {number} days 0 keeps everything */
export async function setDiagKeepDays(days) {
  if (!SUPPORTED) return

  if (process.env.IS_ANDROID) {
    android.diagSetKeepDays(days)
  } else {
    await window.ftElectron.diagSetKeepDays(days)
  }

  await refreshDiagState()
}

/** @returns {Promise<number>} the mark's number, 0 when nothing is recording */
export async function diagMark() {
  if (!SUPPORTED) return 0

  return process.env.IS_ANDROID
    ? android.diagMark()
    : await window.ftElectron.diagMark()
}

/**
 * @typedef {{
 *   files: number, bytes: number, first: number, last: number,
 *   days: Record<string, [number, number]>,
 *   kinds: Record<string, { files: number, bytes: number, first: number, last: number }>
 * }} DiagSummary
 */

/** @returns {Promise<DiagSummary | null>} */
export async function diagSummary() {
  if (!SUPPORTED) return null

  try {
    return process.env.IS_ANDROID
      ? JSON.parse(android.diagSummary())
      : await window.ftElectron.diagSummary()
  } catch {
    return null
  }
}

/** Applies Keep for N days. @returns {Promise<number>} files removed */
export async function diagCleanup() {
  if (!SUPPORTED) return 0

  return process.env.IS_ANDROID
    ? android.diagCleanup()
    : await window.ftElectron.diagCleanup()
}

/** @returns {Promise<number>} files removed */
export async function diagPurge() {
  if (!SUPPORTED) return 0

  return process.env.IS_ANDROID
    ? android.diagPurge()
    : await window.ftElectron.diagPurge()
}

/**
 * Copies every file into a new dated subdirectory of a directory picked each time.
 * @returns {Promise<string | null>} where it went, null when cancelled or nothing was recorded
 */
export async function diagExport() {
  if (!SUPPORTED) return null

  if (process.env.IS_ANDROID) {
    const { awaitAsyncResult } = await import('./android/jsinterface')
    const result = await awaitAsyncResult(android.diagExport())

    return result === 'USER_CANCELED' || result === '' ? null : result
  }

  const result = await window.ftElectron.diagExport()

  return result?.path ?? null
}

/** Android: the share sheet with every file. @returns {boolean} false when nothing is recorded */
export function diagShare() {
  return process.env.IS_ANDROID ? android.diagShare() : false
}

/** Desktop: the diag directory in the file manager. */
export async function diagOpenDirectory() {
  if (process.env.IS_ELECTRON) {
    await window.ftElectron.diagOpenDirectory()
  }
}
