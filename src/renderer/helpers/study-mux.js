// Study export muxing: remuxes the downloaded progressive mp4 into a single
// Matroska file with the study subtitle tracks embedded (as S_TEXT/WEBVTT),
// so the study directory holds one file per video. Pure passthrough — no
// re-encoding — via mediabunny.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MkvOutputFormat,
  Output,
  TextSubtitleSource
} from 'mediabunny'

/**
 * @param {string} srt
 * @returns {string} WebVTT document
 */
export function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt.replaceAll(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
}

// Matroska uses ISO 639-2/T codes; caption tracks carry BCP-47 ones
const ISO_639_2 = {
  ja: 'jpn',
  en: 'eng',
  ru: 'rus',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  zh: 'zho',
  ko: 'kor',
  ar: 'ara',
  cs: 'ces',
  pl: 'pol',
  uk: 'ukr',
  nl: 'nld',
  sv: 'swe',
  tr: 'tur'
}

/**
 * @param {string | undefined} bcp47
 * @returns {string}
 */
export function toIso6392(bcp47) {
  return ISO_639_2[(bcp47 ?? '').split('-')[0]] ?? 'und'
}

/**
 * Remuxes an mp4 into Matroska with the subtitle tracks embedded.
 * @param {object} options
 * @param {Blob} options.videoBlob the downloaded progressive mp4
 * @param {string} options.primarySrt
 * @param {string | null} options.asrSrt raw ASR track (when the primary was aligned)
 * @param {string} [options.language] BCP-47 caption language
 * @param {(fraction: number) => void} [options.onProgress] 0..1 over the packet remux
 * @returns {Promise<Blob>} the mkv file
 */
export async function muxStudyMkv({ videoBlob, primarySrt, asrSrt, language, onProgress }) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) })

  const videoTrack = await input.getPrimaryVideoTrack()
  const audioTrack = await input.getPrimaryAudioTrack()
  if (videoTrack === null) {
    throw new Error('no video track in the downloaded stream')
  }

  const duration = await input.computeDuration()
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
    output.addAudioTrack(audioSource)
  }

  const primarySubtitleSource = new TextSubtitleSource('webvtt')
  output.addSubtitleTrack(primarySubtitleSource, {
    languageCode,
    name: asrSrt !== null ? 'aligned' : 'asr',
    disposition: { default: true }
  })

  let asrSubtitleSource = null
  if (asrSrt !== null) {
    asrSubtitleSource = new TextSubtitleSource('webvtt')
    output.addSubtitleTrack(asrSubtitleSource, { languageCode, name: 'asr' })
  }

  await output.start()

  await primarySubtitleSource.add(srtToVtt(primarySrt))
  if (asrSubtitleSource !== null) {
    await asrSubtitleSource.add(srtToVtt(asrSrt))
  }

  // interleaved passthrough of the encoded packets, in timestamp order
  const videoSink = new EncodedPacketSink(videoTrack)
  const audioSink = audioTrack !== null ? new EncodedPacketSink(audioTrack) : null

  const videoConfig = await videoTrack.getDecoderConfig()
  const audioConfig = audioTrack !== null ? await audioTrack.getDecoderConfig() : null

  let videoPacket = await videoSink.getFirstPacket()
  let audioPacket = audioSink !== null ? await audioSink.getFirstPacket() : null

  // Matroska rejects negative timestamps; mp4 audio tracks routinely start
  // slightly below zero (encoder priming/edit lists) — shift such tracks up
  const videoShift = videoPacket !== null ? Math.max(0, -videoPacket.timestamp) : 0
  const audioShift = audioPacket !== null ? Math.max(0, -audioPacket.timestamp) : 0

  const shifted = (packet, shift) => shift > 0 ? packet.clone({ timestamp: packet.timestamp + shift }) : packet

  let firstVideo = true
  let firstAudio = true
  let lastReportedFraction = 0

  while (videoPacket !== null || audioPacket !== null) {
    const videoNext = videoPacket !== null &&
      (audioPacket === null || videoPacket.timestamp <= audioPacket.timestamp)

    if (videoNext) {
      await videoSource.add(shifted(videoPacket, videoShift), firstVideo ? { decoderConfig: videoConfig } : undefined)
      firstVideo = false
      if (duration > 0 && onProgress) {
        const fraction = Math.min(1, videoPacket.timestamp / duration)
        if (fraction - lastReportedFraction >= 0.02) {
          lastReportedFraction = fraction
          onProgress(fraction)
        }
      }
      videoPacket = await videoSink.getNextPacket(videoPacket)
    } else {
      await audioSource.add(shifted(audioPacket, audioShift), firstAudio ? { decoderConfig: audioConfig } : undefined)
      firstAudio = false
      audioPacket = await audioSink.getNextPacket(audioPacket)
    }
  }

  await output.finalize()
  onProgress?.(1)

  return new Blob([output.target.buffer], { type: 'video/x-matroska' })
}
