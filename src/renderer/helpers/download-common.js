// Platform-independent half of the download button: choosing which streams to
// fetch, fetching them, and remuxing into the Matroska file that gets written.
// The Android and desktop paths differ only in where the finished file goes.
//
// Stream choice mirrors `yt-dlp -f bestvideo+bestaudio` where YouTube lets us:
// the highest video-only stream plus the highest audio-only one. That is not
// always on offer. Modern sessions serve playback over SABR, where adaptive
// formats carry no directly fetchable URL at all, so the ladder falls back —
// Invidious's adaptive list, then the progressive muxed stream, which is always
// available but caps out around 720p. Whatever tier answers, the output is the
// same single mkv with chapters.

import { invidiousGetVideoInformation } from './api/invidious'
import { fetchRangedBlob } from './ranged-download'
import { muxDownloadMkv } from './download-mux'

// The file passes through renderer memory twice — once as the fetched streams,
// once as the muxed output — so this is well below what the device can hold.
export const MAX_DOWNLOAD_BYTES = 700 * 1024 * 1024

/**
 * Thrown for expected, user-facing failure conditions.
 */
export class VideoDownloadError extends Error {
  /**
   * @param {'canceled' | 'no-download-dir' | 'no-format' | 'download-failed' | 'video-too-large' | 'write-failed'} code
   * @param {string} [detail]
   */
  constructor(code, detail = '') {
    super(detail === '' ? code : `${code}: ${detail}`)
    this.code = code
  }
}

/**
 * @typedef {object} DownloadStream
 * @property {string} url
 * @property {boolean} hasVideo
 * @property {boolean} hasAudio
 * @property {number} height
 * @property {number} bitrate
 * @property {string} qualityLabel
 */

/**
 * @param {string} mimeType
 */
function describesVideo(mimeType) {
  return (mimeType ?? '').startsWith('video/')
}

/**
 * Adaptive video entries are video-only; progressive ones announce both codecs.
 * @param {string} mimeType
 */
function carriesAudio(mimeType) {
  const value = mimeType ?? ''
  if (value.startsWith('audio/')) { return true }
  // e.g. 'video/mp4; codecs="avc1.42001E, mp4a.40.2"'
  return /codecs="[^"]*,/.test(value)
}

/**
 * @param {object[]} formats
 * @param {'local' | 'invidious'} shape
 * @returns {DownloadStream[]}
 */
function normalizeFormats(formats, shape) {
  return (formats ?? [])
    .map((format) => {
      const mimeType = shape === 'local' ? format.mimeType : format.type
      const url = format.url

      if (!url) { return null }

      return {
        url,
        hasVideo: describesVideo(mimeType),
        hasAudio: carriesAudio(mimeType),
        height: Number(format.height ?? String(format.resolution ?? '').replace('p', '')) || 0,
        bitrate: Number(format.bitrate) || 0,
        qualityLabel: format.qualityLabel ?? (format.height ? `${format.height}p` : '')
      }
    })
    .filter((stream) => stream !== null)
}

/**
 * @param {DownloadStream[]} streams
 */
function bestVideoOnly(streams) {
  return streams
    .filter((stream) => stream.hasVideo && !stream.hasAudio)
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0] ?? null
}

/**
 * @param {DownloadStream[]} streams
 */
function bestAudioOnly(streams) {
  return streams
    .filter((stream) => !stream.hasVideo && stream.hasAudio)
    .sort((a, b) => b.bitrate - a.bitrate)[0] ?? null
}

/**
 * @param {DownloadStream[]} streams
 */
function bestProgressive(streams) {
  return streams
    .filter((stream) => stream.hasVideo && stream.hasAudio)
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0] ?? null
}

/**
 * Builds the ordered list of things to try, best first.
 * @param {object} input
 * @param {object[]} [input.adaptiveFormats] local adaptive formats, when they carry URLs
 * @param {object[]} [input.legacyFormats] local progressive formats
 * @param {string} input.videoId
 * @returns {Promise<{ video: DownloadStream, audio: DownloadStream | null, source: string }[]>}
 */
export async function buildDownloadPlans({ adaptiveFormats, legacyFormats, videoId }) {
  const plans = []

  const addPair = (streams, source) => {
    const video = bestVideoOnly(streams)
    const audio = bestAudioOnly(streams)
    if (video !== null && audio !== null) {
      plans.push({ video, audio, source })
    }
  }

  const addProgressive = (streams, source) => {
    const progressive = bestProgressive(streams)
    if (progressive !== null) {
      plans.push({ video: progressive, audio: null, source })
    }
  }

  const localAdaptive = normalizeFormats(adaptiveFormats, 'local')
  const localLegacy = normalizeFormats(legacyFormats, 'local')

  addPair(localAdaptive, 'local adaptive')
  addProgressive(localLegacy, 'local progressive')

  // Invidious is asked for only if the local session gave us nothing usable,
  // since it costs a request to a third-party instance
  if (plans.length === 0 || plans.every((plan) => plan.audio === null)) {
    try {
      const result = await invidiousGetVideoInformation(videoId)
      addPair(normalizeFormats(result?.adaptiveFormats, 'invidious'), 'Invidious adaptive')
      addProgressive(normalizeFormats(result?.formatStreams, 'invidious'), 'Invidious progressive')
    } catch (error) {
      console.error('Invidious fallback for the download failed', error)
    }
  }

  // keep the separate-stream plans ahead of the progressive ones regardless of
  // which tier produced them — quality beats convenience here
  return plans.sort((a, b) => (a.audio === null ? 1 : 0) - (b.audio === null ? 1 : 0))
}

/**
 * Downloads and remuxes, trying each plan until one delivers.
 * @param {object} input
 * @param {object[]} [input.adaptiveFormats]
 * @param {object[]} [input.legacyFormats]
 * @param {string} input.videoId
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [input.chapters]
 * @param {string} [input.language]
 * @param {(stage: 'downloading' | 'muxing' | 'writing', fraction: number, detail?: { received: number, total: number }) => void} [input.onProgress]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{ blob: Blob, resolution: string, separateStreams: boolean }>}
 */
export async function buildDownloadFile({
  adaptiveFormats,
  legacyFormats,
  videoId,
  chapters = [],
  language,
  onProgress,
  signal
}) {
  const plans = await buildDownloadPlans({ adaptiveFormats, legacyFormats, videoId })

  if (plans.length === 0) {
    throw new VideoDownloadError('no-format')
  }

  let lastError = null

  for (const plan of plans) {
    try {
      let videoReceived = 0
      let audioReceived = 0
      let videoTotal = 0
      let audioTotal = 0

      const report = () => {
        const total = videoTotal + audioTotal
        const received = videoReceived + audioReceived
        onProgress?.('downloading', total > 0 ? Math.min(1, received / total) : 0, { received, total })
      }

      const videoBlob = await fetchRangedBlob(plan.video.url, {
        maxBytes: MAX_DOWNLOAD_BYTES,
        signal,
        tooLargeError: () => new VideoDownloadError('video-too-large'),
        onProgress: (received, total) => {
          videoReceived = received
          videoTotal = total > 0 ? total : 0
          report()
        }
      })

      let audioBlob = null
      if (plan.audio !== null) {
        audioBlob = await fetchRangedBlob(plan.audio.url, {
          maxBytes: MAX_DOWNLOAD_BYTES - videoBlob.size,
          signal,
          tooLargeError: () => new VideoDownloadError('video-too-large'),
          onProgress: (received, total) => {
            audioReceived = received
            audioTotal = total > 0 ? total : 0
            report()
          }
        })
      }

      onProgress?.('downloading', 1)

      const blob = await muxDownloadMkv({
        videoBlob,
        audioBlob,
        chapters,
        language,
        onProgress: (fraction) => onProgress?.('muxing', fraction)
      })

      return {
        blob,
        resolution: plan.video.qualityLabel || (plan.video.height ? `${plan.video.height}p` : ''),
        separateStreams: plan.audio !== null,
        source: plan.source
      }
    } catch (error) {
      if (error instanceof VideoDownloadError && error.code === 'video-too-large') { throw error }
      if (signal?.aborted) { throw new VideoDownloadError('canceled') }

      console.error(`download via ${plan.source} failed, trying the next source`, error)
      lastError = error
    }
  }

  throw new VideoDownloadError('download-failed', String(lastError))
}
