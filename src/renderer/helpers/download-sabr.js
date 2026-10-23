// SABR source for the download button: the same server-driven stream the
// player plays from, opened a second time for the download.
//
// YouTube increasingly serves videos *only* this way — no progressive format, no
// adaptive format with a fetchable URL, and direct URLs from other clients cut
// off after the first few hundred kilobytes without a poToken. The watch page
// already holds everything a SABR session needs (the streaming URL, the
// ustreamer config, the poToken it generated, the client identity), so the
// download reuses it through googlevideo's SabrStream, which hands back the
// chosen video and audio formats as two ReadableStreams. Those feed mediabunny
// directly, so the file is remuxed while it arrives and never held in memory.

import { SabrStream } from 'googlevideo/sabr-stream'
import { EnabledTrackTypes } from 'googlevideo/utils'
import { ALL_FORMATS, Input, ReadableStreamSource } from 'mediabunny'

/**
 * The adaptive format fields the download needs, captured on the watch page
 * alongside `sabrData` (see Watch.js `createLocalSabrManifest`).
 * @typedef {import('googlevideo/shared-types').SabrFormat & { fps?: number, colorTransfer?: string }} DownloadSabrFormat
 */

const HDR_TRANSFERS = new Set(['SMPTE2084', 'ARIB_STD_B67', 'COLOR_TRANSFER_CHARACTERISTICS_SMPTEST2084', 'COLOR_TRANSFER_CHARACTERISTICS_ARIB_STD_B67'])

/**
 * Same height and frame rate: VP9 first, then H.264, AV1 last — AV1 is decoded
 * in software on many phones, which a 1080p file then stutters through.
 * @param {string} mimeType
 */
function codecRank(mimeType) {
  if (mimeType.includes('vp9') || mimeType.includes('vp09')) { return 3 }
  if (mimeType.includes('avc1')) { return 2 }
  return 1
}

/**
 * bestvideo: the highest resolution, then frame rate, then codec, then bitrate.
 * HDR is passed over while an SDR stream exists — tone-mapping in a desktop or
 * phone player is hit and miss.
 * @param {DownloadSabrFormat[]} formats
 */
export function pickSabrVideo(formats) {
  const video = formats.filter((format) => (format.mimeType ?? '').startsWith('video/'))
  const sdr = video.filter((format) => !HDR_TRANSFERS.has(format.colorTransfer ?? ''))

  return (sdr.length > 0 ? sdr : video).sort((a, b) =>
    (b.height ?? 0) - (a.height ?? 0) ||
    (b.fps ?? 0) - (a.fps ?? 0) ||
    codecRank(b.mimeType ?? '') - codecRank(a.mimeType ?? '') ||
    (b.bitrate ?? 0) - (a.bitrate ?? 0)
  )[0] ?? null
}

/**
 * bestaudio: the original track (not a dub, an audio description or a
 * dynamic-range-compressed copy), highest bitrate.
 * @param {DownloadSabrFormat[]} formats
 */
export function pickSabrAudio(formats) {
  const audio = formats.filter((format) => (format.mimeType ?? '').startsWith('audio/'))
  const plain = audio.filter((format) =>
    !format.isDrc && !format.isDescriptive && !format.isDubbed && !format.isAutoDubbed && !format.isSecondary
  )
  const pool = plain.length > 0 ? plain : audio
  const original = pool.filter((format) => format.isOriginal)

  return (original.length > 0 ? original : pool)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0] ?? null
}

/**
 * Starts the SABR session and wraps its two streams as mediabunny inputs.
 * @param {object} input
 * @param {{ url: string, poToken: string, ustreamerConfig: string, clientInfo: object }} input.sabrData
 * @param {DownloadSabrFormat[]} input.formats
 * @param {boolean} [input.audioOnly] fetch the audio alone (a music track); `videoInput` is then null
 * @param {DownloadSabrFormat[]} [input.audioPool] the formats the audio is picked from, when narrower than `formats`
 * @param {(received: number) => void} [input.onBytes] running total over both streams
 * @returns {Promise<{
 *   videoInput: Input | null,
 *   audioInput: Input,
 *   video: DownloadSabrFormat,
 *   audio: DownloadSabrFormat,
 *   totalBytes: number,
 *   durationSeconds: number,
 *   abort: () => void
 * }>}
 */
export async function openSabrDownload({ sabrData, formats, audioOnly = false, audioPool, onBytes }) {
  // audio only: SabrStream still wants a video format, which it then marks as
  // already buffered and never requests — the smallest one will do
  const video = audioOnly
    ? formats.filter((format) => (format.mimeType ?? '').startsWith('video/'))
      .sort((a, b) => (a.height ?? 0) - (b.height ?? 0) || (a.bitrate ?? 0) - (b.bitrate ?? 0))[0] ?? null
    : pickSabrVideo(formats)
  const audio = pickSabrAudio(audioPool ?? formats)

  if (video === null || audio === null) {
    throw new Error('no SABR video/audio format to download')
  }

  const durationMs = audioOnly
    ? Number(audio.approxDurationMs) || Infinity
    : Math.min(Number(video.approxDurationMs) || Infinity, Number(audio.approxDurationMs) || Infinity)

  const stream = new SabrStream({
    // SabrStream calls this as its own method; the browser's fetch throws "Illegal
    // invocation" unless it is called on window, so it gets a bound wrapper
    fetch: (input, init) => fetch(input, init),
    serverAbrStreamingUrl: sabrData.url,
    videoPlaybackUstreamerConfig: sabrData.ustreamerConfig,
    poToken: sabrData.poToken,
    clientInfo: sabrData.clientInfo,
    formats,
    durationMs: isFinite(durationMs) ? durationMs : undefined
  })

  stream.on('reloadPlayerResponse', () => {
    console.warn('SABR download: the server asked for a player reload; the session is no longer usable')
  })

  // the unused video stream is left alone rather than cancelled: SabrStream
  // closes it when it finishes, which throws on a cancelled stream
  const { videoStream, audioStream } = await stream.start({
    videoFormat: video,
    audioFormat: audio,
    enabledTrackTypes: audioOnly ? EnabledTrackTypes.AUDIO_ONLY : EnabledTrackTypes.VIDEO_AND_AUDIO
  })

  let received = 0
  const counted = (readable) => readable.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      onBytes?.(received)
      controller.enqueue(chunk)
    }
  }))

  return {
    videoInput: audioOnly ? null : new Input({ formats: ALL_FORMATS, source: new ReadableStreamSource(counted(videoStream)) }),
    audioInput: new Input({ formats: ALL_FORMATS, source: new ReadableStreamSource(counted(audioStream)) }),
    video,
    audio,
    totalBytes: (audioOnly ? 0 : Number(video.contentLength) || 0) + (Number(audio.contentLength) || 0),
    durationSeconds: isFinite(durationMs) ? durationMs / 1000 : 0,
    abort: () => stream.abort()
  }
}
