// Platform-independent pieces of the study export: caption track selection
// and fetching, stream selection, the in-memory ranged download and the
// filename convention. Used by the Android (jisho) and desktop (yosuga)
// export paths.

import { invidiousGetVideoInformation } from './api/invidious'
import { fetchRangedBlob } from './ranged-download'

// keep renderer memory in check — the whole file passes through the muxer
export const MAX_VIDEO_BYTES = 400 * 1024 * 1024

/**
 * Thrown for expected, user-facing failure conditions.
 */
export class StudyExportError extends Error {
  /**
   * @param {'canceled' | 'jisho-not-installed' | 'no-study-dir' | 'no-captions' | 'captions-fetch-failed' | 'no-format' | 'download-failed' | 'video-too-large' | 'intent-failed' | 'yosuga-failed'} code
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
export function pickCaptionTrack(captions) {
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
export async function fetchCaptionData(trackUrl) {
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
export async function pickStreamUrl(legacyFormats, videoId) {
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
 * Downloads the progressive stream into memory.
 * @param {string} url
 * @param {(fraction: number) => void} [onProgress] 0..1
 * @returns {Promise<Blob>}
 */
export async function fetchVideoBlob(url, onProgress) {
  let blob

  try {
    blob = await fetchRangedBlob(url, {
      maxBytes: MAX_VIDEO_BYTES,
      tooLargeError: () => new StudyExportError('video-too-large'),
      onProgress: (received, total) => {
        if (total > 0 && onProgress) {
          onProgress(Math.min(1, received / total))
        }
      }
    })
  } catch (error) {
    if (error instanceof StudyExportError) { throw error }
    console.error('study video download failed', error)
    throw new StudyExportError('download-failed', String(error))
  }

  onProgress?.(1)
  return blob
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
