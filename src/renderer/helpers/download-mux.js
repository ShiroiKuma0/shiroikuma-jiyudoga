// Muxing for the download button: passthrough-remuxes the fetched streams into
// a single Matroska file with the video's chapters and the picked subtitle
// tracks embedded. No re-encoding.
//
// Two shapes are handled. `bestvideo+bestaudio` gives a video-only and an
// audio-only stream that have to be interleaved into one file — which is also
// why the output is Matroska rather than mp4: YouTube pairs an mp4/AVC video
// with a WebM/Opus audio, a combination mp4 cannot legally hold. A progressive
// stream arrives already muxed and is simply passed through the same path.
//
// Nothing here holds the file. The inputs are mediabunny sources — a Blob for
// the ranged-download path, or a ReadableStreamSource for SABR, which is read
// strictly front to back while it is still arriving — and the output goes
// through a StreamTarget into a `DownloadSink`, i.e. straight to disk. Memory
// use is a few megabytes of chunk buffers however long the video is.
//
// Subtitle tracks go in as SRT (S_TEXT/UTF8 — the patched mediabunny writes its
// 'webvtt' codec that way, mkvmerge style). Chapters are a pre-built element the
// patched muxer places ahead of the first Cluster (../download-chapters.js).

import {
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  MkvOutputFormat,
  Output,
  StreamTarget,
  TextSubtitleSource
} from 'mediabunny'

import { buildChaptersElement } from './download-chapters'
import { toIso6392 } from './study-mux'

/**
 * Where the muxed file goes: positional writes (the muxer seeks back to fill in
 * sizes, the SeekHead and the duration once it knows them), then either
 * `finish` or `abort`.
 * @typedef {object} DownloadSink
 * @property {(position: number, data: Uint8Array) => Promise<void>} write
 * @property {() => Promise<string>} finish closes the file, returns its final name or path
 * @property {() => Promise<void>} abort closes and deletes the partial file
 */

// big enough to keep the number of disk writes (an IPC or JS-bridge call each)
// low, small enough not to matter for memory
const WRITE_CHUNK_SIZE = 4 * 1024 * 1024

/**
 * Remuxes one or two streams into Matroska with chapters and subtitles.
 * @param {object} options
 * @param {import('mediabunny').Input} options.videoInput video-only, or a progressive stream carrying both
 * @param {import('mediabunny').Input | null} [options.audioInput] the separate audio stream, when there is one
 * @param {DownloadSink} options.sink
 * @param {number} [options.durationSeconds] for progress; omitted → no muxing progress
 * @param {number} [options.frameRate] known frame rate; otherwise measured from the first packets
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [options.chapters]
 * @param {string} [options.language] BCP-47 language of the audio
 * @param {{ vtt: string, language: string, name: string }[]} [options.subtitles] in track order; the first is marked default
 * @param {(fraction: number) => void} [options.onProgress] 0..1 over the remux
 * @returns {Promise<{ videoEndSeconds: number }>} how far the video track reached, once every byte has been handed to the sink — a
 *   stream that ended early still muxes cleanly, so the caller compares this with the expected duration
 */
export async function muxDownloadMkv({
  videoInput,
  audioInput = null,
  sink,
  durationSeconds,
  frameRate,
  chapters = [],
  language,
  subtitles = [],
  onProgress
}) {
  const videoTrack = await videoInput.getPrimaryVideoTrack()

  if (videoTrack === null) {
    throw new Error('no video track in the downloaded stream')
  }

  // separate audio stream when the formats were adaptive, otherwise whatever
  // the progressive stream carries
  const audioTrack = await (audioInput ?? videoInput).getPrimaryAudioTrack()

  const languageCode = toIso6392(language)

  const target = new StreamTarget(new WritableStream({
    write: (chunk) => sink.write(chunk.position, chunk.data)
  }), { chunked: true, chunkSize: WRITE_CHUNK_SIZE })

  const output = new Output({
    format: new MkvOutputFormat({
      chaptersElement: chapters.length > 0 ? buildChaptersElement(chapters, languageCode) : undefined
    }),
    target
  })

  // frame rate → Matroska DefaultDuration (players use it for frame pacing;
  // mkvmerge-produced files always carry it). Measuring reads ahead, which a
  // stream source can only rewind within its cache, so a known rate is preferred.
  const videoFrameRate = frameRate > 0
    ? frameRate
    : (await videoTrack.computePacketStats(120)).averagePacketRate

  const videoSource = new EncodedVideoPacketSource(videoTrack.codec)
  output.addVideoTrack(videoSource, { frameRate: videoFrameRate })

  let audioSource = null
  if (audioTrack !== null) {
    audioSource = new EncodedAudioPacketSource(audioTrack.codec)
    output.addAudioTrack(audioSource, { languageCode })
  }

  const subtitleSources = subtitles.map((subtitle, index) => {
    const source = new TextSubtitleSource('webvtt')
    output.addSubtitleTrack(source, {
      languageCode: toIso6392(subtitle.language),
      name: subtitle.name,
      disposition: { default: index === 0 }
    })
    return source
  })

  await output.start()

  // cues are queued up front and the sources closed, so the muxer does not hold
  // back the whole video waiting for further cues
  for (const [index, source] of subtitleSources.entries()) {
    await source.add(subtitles[index].vtt)
    source.close()
  }

  const tracks = []
  const pushTrack = async (track, source, isVideo) => {
    const packetSink = new EncodedPacketSink(track)
    const packet = await packetSink.getFirstPacket()
    tracks.push({
      packetSink,
      source,
      isVideo,
      packet,
      config: await track.getDecoderConfig(),
      // Matroska rejects negative timestamps; mp4 audio tracks routinely start
      // slightly below zero (encoder priming/edit lists) — shift such tracks up
      shift: packet !== null ? Math.max(0, -packet.timestamp) : 0,
      first: true
    })
  }

  await pushTrack(videoTrack, videoSource, true)
  if (audioTrack !== null) {
    await pushTrack(audioTrack, audioSource, false)
  }

  let lastReportedFraction = 0
  let videoEndSeconds = 0

  try {
    // interleaved passthrough of the encoded packets, in timestamp order — which
    // is also the order SABR delivers them in, so neither stream runs far ahead
    while (true) {
      let next = null
      for (const track of tracks) {
        if (track.packet === null) { continue }
        if (next === null || track.packet.timestamp < next.packet.timestamp) { next = track }
      }
      if (next === null) { break }

      const packet = next.shift > 0
        ? next.packet.clone({ timestamp: next.packet.timestamp + next.shift })
        : next.packet

      await next.source.add(packet, next.first ? { decoderConfig: next.config } : undefined)
      next.first = false

      if (next.isVideo) {
        videoEndSeconds = Math.max(videoEndSeconds, next.packet.timestamp + next.packet.duration)
      }

      if (next.isVideo && durationSeconds > 0 && onProgress) {
        const fraction = Math.min(1, next.packet.timestamp / durationSeconds)
        if (fraction - lastReportedFraction >= 0.02) {
          lastReportedFraction = fraction
          onProgress(fraction)
        }
      }

      next.packet = await next.packetSink.getNextPacket(next.packet)
    }

    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  }

  onProgress?.(1)

  return { videoEndSeconds }
}
