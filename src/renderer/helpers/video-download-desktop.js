// Download button (desktop/Electron): same pipeline as the Android path. The
// file is written by the main process while it is being muxed — into a hidden
// `.part` file in the download folder, renamed to its real name only once it is
// complete — and the folder is asked for once on the first download and
// remembered afterwards.

import { VideoDownloadError, runDownload } from './download-common'
import { buildDownloadFilename } from './download-filename'
import store from '../store/index'

/**
 * Opens the output file in the download folder.
 * @param {string} fileName
 * @returns {Promise<import('./download-mux').DownloadSink>}
 */
async function openDesktopSink(fileName) {
  const id = await window.ftElectron.downloadFileOpen(fileName)

  if (id === null || typeof id !== 'string') {
    // the one-time folder prompt was cancelled
    throw new VideoDownloadError('canceled')
  }

  return {
    write: async (position, data) => {
      // IPC clones a typed array's whole backing buffer, so send just the view
      const bytes = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice()
      await window.ftElectron.downloadFileWrite(id, position, bytes)
    },
    finish: async () => await window.ftElectron.downloadFileFinish(id),
    abort: async () => await window.ftElectron.downloadFileAbort(id)
  }
}

/**
 * Runs the whole download: stream selection → fetch → mkv remux with chapters
 * and subtitles → written into the download folder as it is muxed.
 * @param {object} input
 * @param {object[]} [input.adaptiveFormats]
 * @param {object[]} [input.legacyFormats]
 * @param {string} input.videoId
 * @param {object | null} [input.sabrData]
 * @param {import('./download-sabr').DownloadSabrFormat[]} [input.sabrFormats]
 * @param {string} input.title
 * @param {string} input.channel
 * @param {number} [input.published]
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [input.chapters]
 * @param {string} [input.language]
 * @param {import('./download-subtitles').SubtitleTrackChoice[]} [input.subtitleTracks]
 * @param {(stage: string, fraction: number, detail?: object) => void} [input.onProgress]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{ fileName: string, filePath: string, resolution: string, failedSubtitles: string[] }>}
 */
export async function downloadVideoDesktop({ title, channel, published, videoId, ...rest }) {
  let fileName = ''

  const { location, resolution, failedSubtitles } = await runDownload({
    ...rest,
    videoId,
    openSink: (resolution) => {
      fileName = buildDownloadFilename(
        store.getters.getDownloadFilenameTemplate,
        { title, channel, published, videoId, resolution, ext: 'mkv' },
        store.getters.getDownloadMaxFilenameBytes
      )
      return openDesktopSink(fileName)
    }
  })

  return { fileName, filePath: location, resolution, failedSubtitles }
}
