// Muxing for the download button: passthrough-remuxes the fetched streams into
// a single Matroska file with the video's chapters embedded. No re-encoding.
//
// Two shapes are handled. `bestvideo+bestaudio` gives a video-only and an
// audio-only stream that have to be interleaved into one file — which is also
// why the output is Matroska rather than mp4: YouTube pairs an mp4/AVC video
// with a WebM/Opus audio, a combination mp4 cannot legally hold. A progressive
// stream arrives already muxed and is simply passed through the same path.
//
// Chapters are spliced in afterwards by ../download-chapters.js, mediabunny
// having no chapter API of its own.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MkvOutputFormat,
  Output
} from 'mediabunny'

import { insertChapters } from './download-chapters'
import { toIso6392 } from './study-mux'

/**
 * Remuxes one or two streams into Matroska with chapters.
 * @param {object} options
 * @param {Blob} options.videoBlob video-only, or a progressive stream carrying both
 * @param {Blob | null} [options.audioBlob] the separate audio stream, when there is one
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} [options.chapters]
 * @param {string} [options.language] BCP-47 language of the audio
 * @param {(fraction: number) => void} [options.onProgress] 0..1 over the remux
 * @returns {Promise<Blob>} the mkv file
 */
export async function muxDownloadMkv({ videoBlob, audioBlob = null, chapters = [], language, onProgress }) {
  const videoInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) })
  const videoTrack = await videoInput.getPrimaryVideoTrack()

  if (videoTrack === null) {
    throw new Error('no video track in the downloaded stream')
  }

  // separate audio stream when the formats were adaptive, otherwise whatever
  // the progressive stream carries
  const audioInput = audioBlob !== null
    ? new Input({ formats: ALL_FORMATS, source: new BlobSource(audioBlob) })
    : videoInput
  const audioTrack = await audioInput.getPrimaryAudioTrack()

  const duration = await videoInput.computeDuration()
  const languageCode = toIso6392(language)

  const output = new Output({ format: new MkvOutputFormat(), target: new BufferTarget() })

  // frame rate → Matroska DefaultDuration (players use it for frame pacing;
  // mkvmerge-produced files always carry it)
  const videoStats = await videoTrack.computePacketStats(120)

  const videoSource = new EncodedVideoPacketSource(videoTrack.codec)
  output.addVideoTrack(videoSource, { frameRate: videoStats.averagePacketRate })

  let audioSource = null
  if (audioTrack !== null) {
    audioSource = new EncodedAudioPacketSource(audioTrack.codec)
    output.addAudioTrack(audioSource, { languageCode })
  }

  await output.start()

  const tracks = []
  const pushTrack = async (track, source, isVideo) => {
    const sink = new EncodedPacketSink(track)
    const packet = await sink.getFirstPacket()
    tracks.push({
      sink,
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

  // interleaved passthrough of the encoded packets, in timestamp order
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

    if (next.isVideo && duration > 0 && onProgress) {
      const fraction = Math.min(1, next.packet.timestamp / duration)
      if (fraction - lastReportedFraction >= 0.02) {
        lastReportedFraction = fraction
        onProgress(fraction)
      }
    }

    next.packet = await next.sink.getNextPacket(next.packet)
  }

  await output.finalize()

  const withChapters = insertChapters(new Uint8Array(output.target.buffer), chapters, languageCode)
  onProgress?.(1)

  return new Blob([withChapters], { type: 'video/x-matroska' })
}
