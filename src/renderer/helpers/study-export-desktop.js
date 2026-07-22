// Study export (desktop/Electron): builds the same single mkv as the Android
// path and opens it in shiroikuma-yosuga (the Memento fork). The study folder
// is asked for once (main-process folder picker on first write) and then
// reused; no hand-off protocol needed — yosuga is simply launched with the
// file.

import { buildStudySubtitles } from './study-subtitles'
import { muxStudyMkv } from './study-mux'
import {
  StudyExportError,
  buildStudyBaseName,
  fetchCaptionData,
  fetchVideoBlob,
  pickCaptionTrack,
  pickStreamUrl
} from './study-export-common'

/**
 * Runs the full export: subtitles → video download → mkv remux with embedded
 * subtitle tracks → write into the study folder → open in yosuga.
 * @param {object} input
 * @param {{ id: string, url: string, language: string, isAutotranslated?: boolean }[]} input.captions
 * @param {{ url: string, itag?: number | string }[]} input.legacyFormats
 * @param {string} input.description plain (untranslated) video description
 * @param {string} input.videoId
 * @param {string} input.title
 * @param {number} [input.published]
 * @param {(fraction: number) => void} [input.onProgress] 0..1 over the whole export
 * @returns {Promise<{ aligned: boolean, baseName: string }>}
 */
export async function exportForStudyDesktop({ captions, legacyFormats, description, videoId, title, published, onProgress }) {
  const track = pickCaptionTrack(captions)
  if (track === null) {
    throw new StudyExportError('no-captions')
  }

  // subtitles first: cheap and fails fast, nothing is written on abort
  const captionData = await fetchCaptionData(track.url)
  const subtitles = buildStudySubtitles({ ...captionData, description })

  const streamUrl = await pickStreamUrl(legacyFormats, videoId)

  const videoBlob = await fetchVideoBlob(streamUrl, (fraction) => onProgress?.(fraction * 0.7))

  const mkvBlob = await muxStudyMkv({
    videoBlob,
    primarySrt: subtitles.primarySrt,
    asrSrt: subtitles.asrSrt,
    language: track.language,
    onProgress: (fraction) => onProgress?.(0.7 + fraction * 0.25)
  })

  const baseName = buildStudyBaseName(published, title, videoId)

  const filePath = await window.ftElectron.writeToStudyFolder(
    `${baseName}.mkv`,
    await mkvBlob.arrayBuffer()
  )

  if (filePath === null || typeof filePath !== 'string') {
    // the one-time folder prompt was cancelled
    throw new StudyExportError('canceled')
  }

  onProgress?.(1)

  const opened = await window.ftElectron.openInYosuga(filePath)
  if (!opened) {
    throw new StudyExportError('yosuga-failed')
  }

  return { aligned: subtitles.aligned, baseName: `${baseName}.mkv` }
}
