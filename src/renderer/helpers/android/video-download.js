// Download button (Android): fetches the streams, remuxes them into a single
// Matroska file with chapters, and writes it into the user-chosen download
// folder. The folder is asked for with the SAF picker on the first download and
// remembered afterwards, the same way the study folder works.

import android from 'android'
import { awaitAsyncResult } from './jsinterface'
import { writeFile } from './storage'
import { VideoDownloadError, buildDownloadFile } from '../download-common'
import { buildDownloadFilename } from '../download-filename'
import store from '../../store/index'

/**
 * Ensures a download directory is configured, prompting with the SAF folder
 * picker on first use.
 * @returns {Promise<string>} the SAF tree uri
 */
async function ensureDownloadDirectory() {
  const existing = store.getters.getDownloadDirectoryTree
  if (existing) { return existing }

  const response = await awaitAsyncResult(android.requestDirectoryAccessDialog())
  if (response === 'USER_CANCELED') {
    throw new VideoDownloadError('canceled')
  }

  store.dispatch('updateDownloadDirectoryTree', response)
  return response
}

/**
 * Runs the whole download: stream selection → fetch → mkv remux with chapters
 * → write into the download folder.
 * @param {object} input
 * @param {object[]} [input.adaptiveFormats]
 * @param {object[]} [input.legacyFormats]
 * @param {string} input.videoId
 * @param {string} input.title
 * @param {string} input.channel
 * @param {number} [input.published]
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [input.chapters]
 * @param {string} [input.language]
 * @param {(stage: string, fraction: number, detail?: object) => void} [input.onProgress]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{ fileName: string, resolution: string, separateStreams: boolean }>}
 */
export async function downloadVideoAndroid({
  adaptiveFormats,
  legacyFormats,
  videoId,
  title,
  channel,
  published,
  chapters,
  language,
  onProgress,
  signal
}) {
  const tree = await ensureDownloadDirectory()

  const { blob, resolution, separateStreams } = await buildDownloadFile({
    adaptiveFormats,
    legacyFormats,
    videoId,
    chapters,
    language,
    onProgress,
    signal
  })

  const fileName = buildDownloadFilename(
    store.getters.getDownloadFilenameTemplate,
    { title, channel, published, videoId, resolution, ext: 'mkv' },
    store.getters.getDownloadMaxFilenameBytes
  )

  onProgress?.('writing', 0)

  try {
    const fileUri = android.createOrReplaceFileInTree(tree, fileName)
    await writeFile(fileUri, blob)
  } catch (error) {
    console.error('writing the downloaded video failed', error)
    throw new VideoDownloadError('write-failed', String(error))
  }

  onProgress?.('writing', 1)

  return { fileName, resolution, separateStreams }
}
