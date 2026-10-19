// Platform-independent half of the download button: choosing which streams to
// fetch, fetching them, and remuxing into the Matroska file that gets written.
// The Android and desktop paths differ only in where the file goes — each hands
// in an `openSink` that opens a file in its download folder.
//
// Stream choice mirrors `yt-dlp -f bestvideo+bestaudio`. SABR comes first: it is
// how the player itself receives the video, YouTube increasingly offers nothing
// else, and it is streamed — remuxed while it arrives and written straight to
// disk, so neither length nor resolution is capped by memory. When the session
// is not on SABR, or SABR fails, the older ladder follows: the highest
// video-only plus audio-only URLs, Invidious's adaptive list, then the
// progressive muxed stream (around 720p at most). Those are fetched into memory
// before the remux, which is why that path keeps a size cap. Whatever tier
// answers, the output is the same single mkv with chapters, plus whichever
// subtitle tracks were picked.

import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

import { invidiousGetVideoInformation } from './api/invidious'
import { fetchRangedBlob } from './ranged-download'
import { muxDownloadMkv } from './download-mux'
import { openSabrDownload } from './download-sabr'
import { fetchDownloadSubtitles } from './download-subtitles'

// Only the ranged-URL path holds its streams in renderer memory (the SABR path
// and every output are streamed), so this caps that path alone.
export const MAX_DOWNLOAD_BYTES = 700 * 1024 * 1024

// A SABR session that gives up after its retries ends its streams as if they
// were complete, so the remuxed video is checked against the expected duration.
const COMPLETENESS_SLACK_SECONDS = 3

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
 * @param {number} videoEndSeconds
 * @param {number} durationSeconds
 */
function isComplete(videoEndSeconds, durationSeconds) {
  if (!(durationSeconds > 0)) { return true }
  return videoEndSeconds >= durationSeconds - Math.max(COMPLETENESS_SLACK_SECONDS, durationSeconds * 0.005)
}

/**
 * Wraps a sink so a failed disk write is recognisable afterwards: it is the one
 * failure that no other source can fix, so it ends the attempt outright.
 * @param {import('./download-mux').DownloadSink} sink
 */
function guardSink(sink) {
  const guarded = {
    writeError: null,
    write: async (position, data) => {
      try {
        await sink.write(position, data)
      } catch (error) {
        guarded.writeError = error
        throw error
      }
    },
    finish: () => sink.finish(),
    abort: () => sink.abort()
  }
  return guarded
}

/**
 * Downloads, remuxes and writes, trying SABR and then each URL plan until one
 * delivers.
 * @param {object} input
 * @param {object[]} [input.adaptiveFormats]
 * @param {object[]} [input.legacyFormats]
 * @param {string} input.videoId
 * @param {{ url: string, poToken: string, ustreamerConfig: string, clientInfo: object } | null} [input.sabrData] the watch page's SABR session
 * @param {import('./download-sabr').DownloadSabrFormat[]} [input.sabrFormats]
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [input.chapters]
 * @param {string} [input.language]
 * @param {import('./download-subtitles').SubtitleTrackChoice[]} [input.subtitleTracks] caption tracks to embed
 * @param {(resolution: string) => Promise<import('./download-mux').DownloadSink>} input.openSink opens the output file
 * @param {(stage: 'downloading' | 'muxing' | 'writing', fraction: number, detail?: { received: number, total: number }) => void} [input.onProgress]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{ location: string, resolution: string, source: string, failedSubtitles: string[] }>}
 */
export async function runDownload({
  adaptiveFormats,
  legacyFormats,
  videoId,
  sabrData = null,
  sabrFormats = [],
  chapters = [],
  language,
  subtitleTracks = [],
  openSink,
  onProgress,
  signal
}) {
  // small and quick next to the streams, so fetched first — a cancel or an
  // unfetchable track shows up before hundreds of megabytes have been pulled
  const { subtitles, failed: failedSubtitles } = await fetchDownloadSubtitles(subtitleTracks)
  if (signal?.aborted) { throw new VideoDownloadError('canceled') }

  const muxOptions = { chapters, subtitles }
  let lastError = null

  /**
   * Opens the file, remuxes into it and keeps it only if it is complete.
   * @returns {Promise<string>} the sink's final name or path
   */
  const muxInto = async (resolution, muxInput, durationSeconds) => {
    const sink = guardSink(await openSink(resolution))

    try {
      const { videoEndSeconds } = await muxDownloadMkv({ language, ...muxOptions, ...muxInput, sink, durationSeconds })

      if (signal?.aborted) { throw new VideoDownloadError('canceled') }
      if (!isComplete(videoEndSeconds, durationSeconds)) {
        throw new Error(`stream ended early: ${videoEndSeconds.toFixed(1)} of ${durationSeconds.toFixed(1)} s`)
      }

      onProgress?.('writing', 0)
      const location = await sink.finish()
      onProgress?.('writing', 1)
      return location
    } catch (error) {
      await sink.abort().catch((abortError) => console.error('removing the partial download failed', abortError))

      if (sink.writeError !== null) {
        throw new VideoDownloadError('write-failed', String(sink.writeError))
      }
      throw error
    }
  }

  // 1. SABR — the player's own stream, remuxed and written while it arrives
  if (sabrData && sabrFormats.length > 0) {
    let session = null
    const onAbort = () => session?.abort()
    signal?.addEventListener('abort', onAbort)

    try {
      let total = 0
      session = await openSabrDownload({
        sabrData,
        formats: sabrFormats,
        onBytes: (received) => {
          onProgress?.('downloading', total > 0 ? Math.min(1, received / total) : 0, { received, total })
        }
      })
      total = session.totalBytes
      if (signal?.aborted) { session.abort() }

      const resolution = session.video.qualityLabel || (session.video.height ? `${session.video.height}p` : '')

      const location = await muxInto(resolution, {
        videoInput: session.videoInput,
        audioInput: session.audioInput,
        frameRate: session.video.fps,
        // the audio format names its own language where YouTube knows it
        language: session.audio.language || language
      }, session.durationSeconds)

      return { location, resolution, source: 'SABR', failedSubtitles }
    } catch (error) {
      session?.abort()
      if (signal?.aborted) { throw new VideoDownloadError('canceled') }
      if (error instanceof VideoDownloadError) { throw error }

      console.error('SABR download failed, trying the direct stream URLs', error)
      lastError = error
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  // 2. direct URLs — fetched into memory, then remuxed and written
  const plans = await buildDownloadPlans({ adaptiveFormats, legacyFormats, videoId })

  if (plans.length === 0) {
    throw lastError === null
      ? new VideoDownloadError('no-format')
      : new VideoDownloadError('download-failed', String(lastError))
  }

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

      const videoInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) })
      const audioInput = audioBlob !== null
        ? new Input({ formats: ALL_FORMATS, source: new BlobSource(audioBlob) })
        : null
      const resolution = plan.video.qualityLabel || (plan.video.height ? `${plan.video.height}p` : '')

      const location = await muxInto(resolution, {
        videoInput,
        audioInput,
        onProgress: (fraction) => onProgress?.('muxing', fraction)
      }, await videoInput.computeDuration())

      return { location, resolution, source: plan.source, failedSubtitles }
    } catch (error) {
      if (error instanceof VideoDownloadError && (error.code === 'video-too-large' || error.code === 'write-failed' || error.code === 'canceled')) { throw error }
      if (signal?.aborted) { throw new VideoDownloadError('canceled') }

      console.error(`download via ${plan.source} failed, trying the next source`, error)
      lastError = error
    }
  }

  throw new VideoDownloadError('download-failed', String(lastError))
}
