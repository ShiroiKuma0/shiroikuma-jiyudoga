// Download button (Android): fetches the streams, remuxes them into a single
// Matroska file with chapters and subtitles, and writes it into the user-chosen
// download folder while it is being muxed — positional writes through the
// Kotlin bridge, so a long video never sits in the WebView's memory. The folder
// is asked for with the SAF picker on the first download and remembered
// afterwards, the same way the study folder works.

import android from 'android'
import { awaitAsyncResult } from './jsinterface'
import { blobToBase64 } from './utils'
import { VideoDownloadError, runDownload } from '../download-common'
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
 * Creates (or replaces) the output file and opens it for positional writes.
 * SAF derives a document's extension from its MIME type, so there is no `.part`
 * stage here: the file carries its real name from the start and is deleted
 * again if the download does not complete.
 * @param {string} tree
 * @param {string} fileName
 * @returns {import('../download-mux').DownloadSink}
 */
function openAndroidSink(tree, fileName) {
  const id = android.openDownloadFile(tree, fileName)

  if (!id) {
    throw new VideoDownloadError('write-failed', 'could not create the file')
  }

  return {
    write: async (position, data) => {
      // the bridge only carries strings
      await awaitAsyncResult(android.writeDownloadFile(id, position, await blobToBase64(new Blob([data]))))
    },
    finish: async () => {
      if (!android.closeDownloadFile(id)) {
        throw new Error('closing the downloaded file failed')
      }
      return fileName
    },
    abort: async () => {
      android.abortDownloadFile(id)
    }
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
 * @param {import('../download-sabr').DownloadSabrFormat[]} [input.sabrFormats]
 * @param {string} input.title
 * @param {string} input.channel
 * @param {number} [input.published]
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [input.chapters]
 * @param {string} [input.language]
 * @param {import('../download-subtitles').SubtitleTrackChoice[]} [input.subtitleTracks]
 * @param {object | null} [input.musicTags] a YouTube Music track: saves its audio alone, as Ogg Opus (.opus)
 * @param {(stage: string, fraction: number, detail?: object) => void} [input.onProgress]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{ fileName: string, resolution: string, failedSubtitles: string[] }>}
 */
export async function downloadVideoAndroid({ title, channel, published, videoId, ...rest }) {
  const tree = await ensureDownloadDirectory()

  const { location, resolution, failedSubtitles } = await runDownload({
    ...rest,
    videoId,
    openSink: async (resolution, ext) => {
      const fileName = buildDownloadFilename(
        store.getters.getDownloadFilenameTemplate,
        { title, channel, published, videoId, resolution, ext },
        store.getters.getDownloadMaxFilenameBytes
      )
      return openAndroidSink(tree, fileName)
    }
  })

  return { fileName: location, resolution, failedSubtitles }
}
