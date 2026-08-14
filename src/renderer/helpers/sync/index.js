import store from '../../store/index'
import { planMerge } from './merge'
import {
  OWN_ROLE,
  PEER_ROLE,
  buildSnapshot,
  parseSnapshot,
  readLocalState,
  snapshotFileName
} from './snapshot'

/**
 * 白い熊 自由動画 — the device sync, driven from the renderer on both platforms.
 *
 * Keeping the whole of it here rather than splitting the desktop half into the main
 * process is what makes the two builds behave identically, and it is also why nothing
 * needs restarting after a merge: every write goes through the ordinary store actions,
 * so the open window updates in place and other windows hear about it through the
 * multi-window bus that already exists. Only the two things a renderer genuinely
 * cannot do — touch the disk, and reach the phone — are delegated, to `platform-*.js`.
 */

const OWN_FILE = snapshotFileName(OWN_ROLE)
const PEER_FILE = snapshotFileName(PEER_ROLE)

/**
 * A ternary on `process.env.IS_ANDROID` rather than a runtime lookup: the flag is
 * substituted at build time, so each build keeps only its own half.
 */
let platformModule = null

function platform() {
  if (platformModule === null) {
    platformModule = process.env.IS_ANDROID
      ? import('./platform-android')
      : import('./platform-desktop')
  }

  return platformModule
}

let running = false
let pendingTimer = null

/** The last snapshot written locally, and the last one the peer was given. */
let lastPublished = null
let lastPushed = null

/**
 * An error that crossed the IPC boundary arrives wrapped — "Error invoking remote
 * method 'device-sync-push-own': Error: …" — which buries the sentence that actually
 * says what went wrong. The status row has one line; give it the sentence.
 *
 * Named `errorReason` rather than `reason` because both callers already have a
 * `reason` parameter, which would shadow it and turn every error path into a
 * "reason is not a function" of its own.
 * @param {unknown} error
 */
function errorReason(error) {
  const message = error?.message ?? `${error}`

  return message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(Error|Exception):\s*/, '')
    .trim()
}

/**
 * Two snapshots say the same thing when only the instant they were written differs.
 * @param {object} snapshot
 */
function comparable(snapshot) {
  return JSON.stringify({ ...snapshot, writtenAt: 0 })
}

/**
 * @returns {string} `yyyy-MM-dd_HH-mm-ss`, local time
 */
function timestamp() {
  const now = new Date()
  const pad = (value) => `${value}`.padStart(2, '0')

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
}

/**
 * The first merge is the one step syncing again cannot undo — it unions two databases
 * that have never met — so the datastores are copied aside before it happens, once.
 */
async function backupOnce() {
  if (store.getters.getSkuiSyncBackedUp) { return }

  const api = await platform()

  await api.backupDatastores(timestamp())
  await store.dispatch('updateSkuiSyncBackedUp', true)
}

/**
 * Applies the merge through the ordinary actions, so the caches, the open window and
 * any other window all follow along without a reload.
 * @param {ReturnType<typeof planMerge>} plan
 */
async function applyPlan(plan) {
  for (const record of plan.historyUpserts) {
    await store.dispatch('updateHistory', record)
  }

  for (const videoId of plan.historyDeletions) {
    await store.dispatch('removeFromHistory', videoId)
  }

  for (const profile of plan.profileCreations) {
    await store.dispatch('createProfile', profile)
  }

  for (const profile of plan.profileUpdates) {
    await store.dispatch('updateProfile', profile)
  }

  // Re-read the history rather than trust the cache the upserts just left behind.
  // `upsertToHistoryCache` unshifts every record to the FRONT — right for a video you
  // have just watched, wrong for a merge, which would otherwise leave the list in the
  // order records happened to arrive instead of by date watched. The datastore is
  // already correct; this is only the view catching up, and `grabHistory` reads it back
  // through the same sorted query the app starts with.
  //
  // Profiles need no equivalent: `upsertProfileToList` and `addProfileToList` both
  // re-sort the list themselves.
  if (plan.historyUpserts.length > 0) {
    await store.dispatch('grabHistory')
  }
}

/**
 * Status is only persisted when it actually says something new. A sync fires after
 * every video, and nedb appends a line per write — recording an identical "ok" every
 * few minutes would grow settings.db for nothing.
 * @param {string} result
 * @param {boolean} force
 */
async function recordStatus(result, force) {
  if (!force && store.getters.getSkuiSyncLastResult === result) { return }

  await store.dispatch('updateSkuiSyncLastResult', result)
  await store.dispatch('updateSkuiSyncLastRun', Date.now())
}

async function performSync(reason) {
  const api = await platform()

  const blocked = await api.ensureReady()

  if (blocked !== null) {
    await recordStatus(blocked, reason === 'manual')
    return { status: blocked }
  }

  // The courier's inbound leg: collect whatever the phone published, even if the phone
  // itself has not been running for hours. Desktop only — see platform-android.
  //
  // An unreachable phone must not abandon the rest of the run: the file it published
  // last time is still on disk and worth merging, and our own snapshot still wants
  // writing. So the courier's failures are carried, not thrown.
  let courierError = null
  let fetched = 'unsupported'

  try {
    fetched = await api.pullFromPeer(PEER_FILE)
  } catch (error) {
    courierError = errorReason(error)
  }

  const remote = parseSnapshot(await api.readFile(PEER_FILE))

  let changeCount = 0

  if (remote !== null) {
    await backupOnce()

    const plan = planMerge(await readLocalState(), remote)

    changeCount = plan.changeCount

    await applyPlan(plan)
  }

  // publish our own view — read back after applying, so it already includes whatever
  // was just merged in and the peer needs only one round to converge
  const snapshot = buildSnapshot(await readLocalState())
  const text = JSON.stringify(snapshot)
  const signature = comparable(snapshot)

  if (signature !== lastPublished) {
    await api.writeFile(OWN_FILE, text)
    lastPublished = signature
  }

  // the courier's outbound leg
  let delivered = 'unsupported'

  if (signature !== lastPushed) {
    try {
      delivered = await api.pushToPeer(OWN_FILE, text)

      if (delivered === 'pushed') {
        lastPushed = signature
      }
    } catch (error) {
      courierError = errorReason(error)
    }
  }

  const noPeer = fetched === 'no-peer' || delivered === 'no-peer'

  let result

  if (courierError !== null) {
    result = `error: ${courierError}`
  } else if (noPeer) {
    result = 'no-peer'
  } else {
    result = changeCount > 0 ? `ok:${changeCount}` : 'ok'
  }

  await recordStatus(result, reason === 'manual' || changeCount > 0)

  return { status: result, changeCount }
}

/**
 * @param {string} [reason] 'start' | 'resume' | 'watch' | 'manual'
 */
export async function runSync(reason = 'manual') {
  if (running) { return { status: 'busy' } }
  if (!store.getters.getSkuiSyncEnabled) { return { status: 'disabled' } }

  // the per-trigger switches are read here rather than where the listeners are armed,
  // so a trigger set up before the settings loaded still honours them
  if ((reason === 'start' || reason === 'resume') && !store.getters.getSkuiSyncOnStart) {
    return { status: 'disabled' }
  }

  if (reason === 'watch' && !store.getters.getSkuiSyncAfterWatch) {
    return { status: 'disabled' }
  }

  running = true

  try {
    return await performSync(reason)
  } catch (error) {
    const message = errorReason(error)

    console.error('[device sync]', error)
    await recordStatus(`error: ${message}`, true)

    return { status: 'error', message }
  } finally {
    running = false
  }
}

/**
 * Coalesces the triggers: leaving a video writes watch progress repeatedly, and a
 * resume can arrive alongside a start. Whether the sync is switched on is decided when
 * the timer fires, not when it is set, because a trigger can be armed before the
 * settings have finished loading.
 * @param {string} reason
 * @param {number} [delayMs]
 */
export function scheduleSync(reason, delayMs = 5000) {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
  }

  pendingTimer = setTimeout(() => {
    pendingTimer = null
    runSync(reason)
  }, delayMs)
}

/**
 * Called once, from App.vue.
 */
export function registerSyncTriggers() {
  if (process.env.IS_ANDROID) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') { return }

      scheduleSync('resume', 1500)
    })
  } else {
    // window focus, which is exactly the moment 白い熊 sits down at the PC — and so
    // the moment to go and collect whatever the phone published in the meantime
    window.addEventListener('focus', () => scheduleSync('resume', 1500))
  }

  // long enough that the datastores and the settings are certainly loaded
  scheduleSync('start', 4000)
}
