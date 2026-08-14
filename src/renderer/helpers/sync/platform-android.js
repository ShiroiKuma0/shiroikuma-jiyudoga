import store from '../../store/index'
import {
  backupDatastores as nativeBackupDatastores,
  hasStorageAccess,
  readSyncFile,
  writeSyncFile
} from '../android/sync'

/**
 * 白い熊 自由動画: the phone's side of the device sync.
 *
 * There is no courier here, on purpose. The phone reads and writes two files in a
 * directory on shared storage and nothing more, so syncing can never hold the WiFi
 * radio awake — the desktop app collects what was published whenever it next runs,
 * even long after this app was closed.
 */

function directory() {
  return store.getters.getSkuiSyncAndroidDir
}

/**
 * @returns {Promise<string | null>} a reason the sync cannot run, or null
 */
export async function ensureReady() {
  if (typeof directory() !== 'string' || directory().length === 0) { return 'no-directory' }

  // the directory has to be a real path so ssh can address it from the other side,
  // and a real path outside our own sandbox needs the All-Files-Access grant
  return hasStorageAccess() ? null : 'no-storage-access'
}

/**
 * @param {string} fileName
 * @returns {Promise<string | null>}
 */
export function readFile(fileName) {
  return readSyncFile(directory(), fileName)
}

/**
 * @param {string} fileName
 * @param {string} contents
 */
export function writeFile(fileName, contents) {
  return writeSyncFile(directory(), fileName, contents)
}

/**
 * @returns {Promise<'unsupported'>} the phone never fetches; the desktop delivers
 */
export async function pullFromPeer() {
  return 'unsupported'
}

/**
 * @returns {Promise<'unsupported'>}
 */
export async function pushToPeer() {
  return 'unsupported'
}

/**
 * @param {string} stamp
 */
export function backupDatastores(stamp) {
  return nativeBackupDatastores(directory(), stamp)
}
