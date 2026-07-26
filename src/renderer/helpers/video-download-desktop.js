// Download button (desktop/Electron): same pipeline as the Android path, but
// the file goes into a folder the main process asks for once on the first
// download and remembers afterwards.

import { VideoDownloadError, buildDownloadFile } from './download-common'
import { buildDownloadFilename } from './download-filename'
import store from '../store/index'

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
 * @returns {Promise<{ fileName: string, filePath: string, resolution: string, separateStreams: boolean }>}
 */
export async function downloadVideoDesktop({
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

  const filePath = await window.ftElectron.writeToDownloadFolder(fileName, await blob.arrayBuffer())

  if (filePath === null || typeof filePath !== 'string') {
    // the one-time folder prompt was cancelled
    throw new VideoDownloadError('canceled')
  }

  onProgress?.('writing', 1)

  return { fileName, filePath, resolution, separateStreams }
}
