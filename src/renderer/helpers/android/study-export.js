// Study export (Android): builds study SRTs from the current video's caption
// track, downloads the muxed video, remuxes it into a single Matroska file
// with the subtitle tracks embedded (S_TEXT/UTF8), writes it into the
// user-chosen study folder and hands it over to shiroikuma-jisho via an
// explicit intent. The contract is documented in the jisho repo's hand-off.md.
//
// The mkv structure deliberately mirrors mkvmerge's output (白い熊's daily
// jisho files): SubRip codec, no subtitle CodecPrivate, no BlockAdditions,
// video DefaultDuration — achieved via the patched mediabunny
// (patches/mediabunny.patch) and validated against a known-good reference
// on 2026-07-22 (TESTA/TESTB experiments).

import android from 'android'
import { awaitAsyncResult } from './jsinterface'
import { writeFile } from './storage'
import { buildStudySubtitles } from '../study-subtitles'
import { muxStudyMkv } from '../study-mux'
import { invidiousGetVideoInformation } from '../api/invidious'
import store from '../../store/index'

// keep WebView memory in check — the whole file passes through the muxer
const MAX_VIDEO_BYTES = 400 * 1024 * 1024
const DOWNLOAD_CHUNK_BYTES = 9 * 1024 * 1024

/**
 * Thrown for expected, user-facing failure conditions.
 */
export class StudyExportError extends Error {
  /**
   * @param {'canceled' | 'jisho-not-installed' | 'no-study-dir' | 'no-captions' | 'captions-fetch-failed' | 'no-format' | 'download-failed' | 'video-too-large' | 'intent-failed'} code
   * @param {string} [detail]
   */
  constructor(code, detail = '') {
    super(detail === '' ? code : `${code}: ${detail}`)
    this.code = code
  }
}

/**
 * Picks the caption track to build study subtitles from: a manual track in
 * the video's language beats the ASR track (vss_id "a.xx"), any other manual
 * track beats nothing. Auto-translated pseudo tracks are ignored.
 * @param {{ id: string, url: string, language: string, isAutotranslated?: boolean }[]} captions
 */
function pickCaptionTrack(captions) {
  const realTracks = (captions ?? []).filter((track) => !track.isAutotranslated)

  const asrTrack = realTracks.find((track) => track.id?.startsWith('a.'))
  const manualTracks = realTracks.filter((track) => !track.id?.startsWith('a.'))

  if (asrTrack) {
    const manualSameLanguage = manualTracks.find((track) => track.language === asrTrack.language)
    return manualSameLanguage ?? asrTrack
  }

  return manualTracks[0] ?? null
}

/**
 * Fetches the caption track as json3 (word-level timing), falling back to
 * srt (cue-level — proven to work even when json3 is refused).
 * @param {string} trackUrl the authorized timedtext url from the watch page
 * @returns {Promise<{ json3?: string, srt?: string }>}
 */
async function fetchCaptionData(trackUrl) {
  const fetchFormat = async (format) => {
    const url = new URL(trackUrl)
    url.searchParams.set('fmt', format)

    // repair URLs authorized without a real poToken (potc=1&pot=undefined)
    if (!url.searchParams.get('pot') || url.searchParams.get('pot') === 'undefined') {
      url.searchParams.delete('pot')
      url.searchParams.delete('potc')
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      try {
        const response = await fetch(url.toString())
        if (response.ok) {
          const text = await response.text()
          if (text.trim() !== '') {
            return text
          }
        }
      } catch (error) {
        console.error(`caption ${format} fetch failed`, error)
      }
    }
    return null
  }

  const json3 = await fetchFormat('json3')
  if (json3 !== null) {
    try {
      JSON.parse(json3)
      return { json3 }
    } catch {
      // served something that isn't json3 (e.g. an error page) — fall through
    }
  }

  const srt = await fetchFormat('srt')
  if (srt !== null) {
    return { srt }
  }

  throw new StudyExportError('captions-fetch-failed')
}

/**
 * @param {{ url: string, itag?: number | string }[]} legacyFormats
 * @param {string} videoId
 */
async function pickStreamUrl(legacyFormats, videoId) {
  const formats = [...(legacyFormats ?? [])]

  if (formats.length === 0) {
    // SABR sessions often withhold muxed formats — try Invidious's muxed streams
    try {
      const result = await invidiousGetVideoInformation(videoId)
      formats.push(...(result?.formatStreams ?? []))
    } catch (error) {
      console.error('Invidious fallback for study export failed', error)
    }
  }

  if (formats.length === 0) {
    throw new StudyExportError('no-format')
  }

  const preferred = formats.find((format) => String(format.itag) === '18') ??
    formats.find((format) => String(format.itag) === '22') ??
    formats[0]

  return preferred.url
}

/**
 * Downloads the progressive stream into memory with chunked Range requests
 * (googlevideo throttles single long GETs).
 * @param {string} url
 * @param {(fraction: number) => void} [onProgress] 0..1
 * @returns {Promise<Blob>}
 */
async function fetchVideoBlob(url, onProgress) {
  const chunks = []
  let received = 0
  let totalBytes = -1
  let singleRequest = false

  try {
    while (totalBytes < 0 || received < totalBytes) {
      const headers = {}
      if (!singleRequest) {
        headers.Range = `bytes=${received}-${received + DOWNLOAD_CHUNK_BYTES - 1}`
      }

      const response = await fetch(url, { headers })

      if (response.status === 200) {
        // server ignored the Range header — one long response
        singleRequest = true
      } else if (response.status !== 206) {
        throw new Error(`HTTP ${response.status} while downloading`)
      }

      if (totalBytes < 0) {
        if (response.status === 206) {
          const contentRange = response.headers.get('Content-Range')
          totalBytes = Number(contentRange?.split('/')[1]) || -2
        } else {
          totalBytes = Number(response.headers.get('Content-Length')) || -2
        }

        if (totalBytes > MAX_VIDEO_BYTES) {
          throw new StudyExportError('video-too-large')
        }
      }

      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) { break }
        chunks.push(value)
        received += value.byteLength
        if (received > MAX_VIDEO_BYTES) {
          throw new StudyExportError('video-too-large')
        }
        if (totalBytes > 0 && onProgress) {
          onProgress(Math.min(1, received / totalBytes))
        }
      }

      if (singleRequest || totalBytes === -2) { break }
    }
  } catch (error) {
    if (error instanceof StudyExportError) { throw error }
    console.error('study video download failed', error)
    throw new StudyExportError('download-failed', String(error))
  }

  if (received === 0) {
    throw new StudyExportError('download-failed', 'downloaded 0 bytes')
  }

  onProgress?.(1)
  return new Blob(chunks, { type: 'video/mp4' })
}

/**
 * @param {number | undefined} publishedMs
 * @param {string} title
 * @param {string} videoId
 */
export function buildStudyBaseName(publishedMs, title, videoId) {
  const date = new Date(typeof publishedMs === 'number' && !isNaN(publishedMs) ? publishedMs : Date.now())
  const pad = (value) => String(value).padStart(2, '0')
  const dateString = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  const cleanTitle = (title ?? '')
    .replaceAll(/[/\\:*?"<>|]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()

  return `${dateString} ${cleanTitle === '' ? videoId : cleanTitle}`
}

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
