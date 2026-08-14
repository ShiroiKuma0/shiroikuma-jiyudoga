import store from '../../store/index'

/**
 * 白い熊 自由動画: the desktop's side of the device sync, as the renderer sees it.
 *
 * The desktop is the courier — it is the only device that reaches across — so it has
 * both the local file operations and the two remote ones. All of it lives in the main
 * process (`src/main/sync.js`); this is only the bridge.
 */

/**
 * The peer settings travel WITH each courier call rather than being read in the main
 * process. A setting only gains a row in the datastore once it has been changed, so
 * reading one from there returns `undefined` for everything still at its default — the
 * store is the only place that knows what the defaults are.
 */
function peerConfig() {
  return {
    host: store.getters.getSkuiSyncHost,
    port: store.getters.getSkuiSyncPort,
    args: store.getters.getSkuiSyncSshArgs,
    remoteDir: store.getters.getSkuiSyncRemoteDir
  }
}

/**
 * @returns {Promise<null>} desktop has no permission to ask for
 */
export async function ensureReady() {
  return null
}

/**
 * @param {string} fileName
 * @returns {Promise<string | null>}
 */
export function readFile(fileName) {
  return window.ftElectron.deviceSyncReadSnapshot(fileName)
}

/**
 * @param {string} fileName
 * @param {string} contents
 */
export function writeFile(fileName, contents) {
  return window.ftElectron.deviceSyncWriteSnapshot(fileName, contents)
}

/**
 * @param {string} peerFileName
 * @returns {Promise<'fetched' | 'absent' | 'no-peer'>}
 */
export function pullFromPeer(peerFileName) {
  return window.ftElectron.deviceSyncPullPeer(peerFileName, peerConfig())
}

/**
 * @param {string} ownFileName
 * @param {string} contents
 * @returns {Promise<'pushed' | 'no-peer'>}
 */
export function pushToPeer(ownFileName, contents) {
  return window.ftElectron.deviceSyncPushOwn(ownFileName, contents, peerConfig())
}

/**
 * @param {string} stamp
 */
export function backupDatastores(stamp) {
  return window.ftElectron.deviceSyncBackupDatastores(stamp)
}
