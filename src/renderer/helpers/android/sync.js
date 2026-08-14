import android from 'android'
import { awaitAsyncResult } from './jsinterface'

/**
 * 白い熊 自由動画: the JS side of the phone's device-sync file access.
 *
 * Deliberately thin — the phone's entire part in the sync is reading one file and
 * writing another. Everything else (the merge, the triggers) is the shared renderer
 * code both platforms run, and the transfer belongs to the desktop app.
 */

/**
 * @returns {boolean} whether All-Files-Access has been granted
 */
export function hasStorageAccess() {
  return android.hasAllFilesAccess()
}

export function requestStorageAccess() {
  android.requestAllFilesAccess()
}

/**
 * @param {string} directory
 * @param {string} name
 * @returns {Promise<string | null>} null when the other device has not published yet
 */
export async function readSyncFile(directory, name) {
  const contents = await awaitAsyncResult(android.readSyncFile(directory, name))

  return contents === '' ? null : contents
}

/**
 * @param {string} directory
 * @param {string} name
 * @param {string} contents
 * @returns {Promise<string>} the absolute path written
 */
export function writeSyncFile(directory, name, contents) {
  return awaitAsyncResult(android.writeSyncFile(directory, name, contents))
}

/**
 * @param {string} directory
 * @param {string} stamp `yyyy-MM-dd_HH-mm-ss`
 * @returns {Promise<string>} the backup directory
 */
export function backupDatastores(directory, stamp) {
  return awaitAsyncResult(android.backupSyncDatastores(directory, stamp))
}
