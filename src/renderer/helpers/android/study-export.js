// Study export (Android): builds study SRTs from the current video's caption
// track, downloads the muxed video, remuxes it into a single Matroska file
// with the subtitle tracks embedded (S_TEXT/UTF8), writes it into the
// user-chosen study folder and hands it over to shiroikuma-jisho via an
// explicit intent. The contract is documented in the jisho repo's hand-off.md.
//
// The platform-independent pieces live in ../study-export-common.js (shared
// with the desktop/yosuga path).

import android from 'android'
import { awaitAsyncResult } from './jsinterface'
import { writeFile } from './storage'
import { buildStudySubtitles } from '../study-subtitles'
import { muxStudyMkv } from '../study-mux'
import {
  StudyExportError,
  buildStudyBaseName,
  fetchCaptionData,
  fetchVideoBlob,
  pickCaptionTrack,
  pickStreamUrl
} from '../study-export-common'
import store from '../../store/index'

export { StudyExportError, buildStudyBaseName }

/**
 * Ensures a study directory is configured, prompting with the SAF folder
 * picker on first use.
 * @returns {Promise<{ tree: string, dirPath: string }>}
 */
async function ensureStudyDirectory() {
  let tree = store.getters.getStudyDirectoryTree

  if (!tree) {
    const response = await awaitAsyncResult(android.requestDirectoryAccessDialog())
    if (response === 'USER_CANCELED') {
      throw new StudyExportError('canceled')
    }
    tree = response
    store.dispatch('updateStudyDirectoryTree', tree)
  }

  const dirPath = android.treeUriToPath(tree)
  if (dirPath === '') {
    // non-device provider (cloud etc.) — jisho cannot read it, ask again next time
    store.dispatch('updateStudyDirectoryTree', '')
    throw new StudyExportError('no-study-dir')
  }

  return { tree, dirPath }
}

/**
 * Runs the full export: subtitles → video download → mkv remux with embedded
 * subtitle tracks → single-file write → jisho intent.
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
export async function exportForStudy({ captions, legacyFormats, description, videoId, title, published, onProgress }) {
  if (!android.isJishoInstalled()) {
    throw new StudyExportError('jisho-not-installed')
  }

  const { tree, dirPath } = await ensureStudyDirectory()

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

  const mkvUri = android.createOrReplaceFileInTree(tree, `${baseName}.mkv`)
  await writeFile(mkvUri, mkvBlob)

  // clear the separate files of any sidecar-era export of the same video
  android.deleteFileInTree(tree, `${baseName}.mp4`)
  android.deleteFileInTree(tree, `${baseName}.srt`)
  android.deleteFileInTree(tree, `${baseName}.asr.srt`)

  onProgress?.(1)

  const result = android.openStudyVideoInJisho(
    `${dirPath}/${baseName}.mkv`,
    '',
    dirPath,
    title,
    videoId
  )
  if (result !== 'ok') {
    throw new StudyExportError('intent-failed', result)
  }

  return { aligned: subtitles.aligned, baseName: `${baseName}.mkv` }
}
