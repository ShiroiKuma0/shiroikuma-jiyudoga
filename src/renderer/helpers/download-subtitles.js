// Subtitles for the download button: fetches the caption tracks picked in the
// download dialog and normalises each into a clean, sorted cue list, ready to
// embed in the mkv as an SRT (S_TEXT/UTF8) track.
//
// YouTube's own timedtext endpoint is asked for `fmt=srt`: its WebVTT carries
// karaoke timestamps and, for auto-generated tracks, rolling duplicate lines,
// none of which belongs in a plain SRT track. Invidious only serves WebVTT, so
// whatever arrives goes through the same parser and tag stripper either way.

import { fetchCaptionFormat } from './study-export-common'

/**
 * @typedef {object} SubtitleTrackChoice
 * @property {string} [id] vss_id on the local API path ("a.ja" = auto-generated)
 * @property {string} url
 * @property {string} label
 * @property {string} language BCP-47
 * @property {boolean} [isAutotranslated]
 */

/**
 * @typedef {object} DownloadSubtitle
 * @property {string} vtt the cleaned track as a WebVTT document (mediabunny's input)
 * @property {string} language BCP-47
 * @property {string} name track name shown by players
 */

const CUE_TIMING = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/

/**
 * @param {string} value e.g. "00:01:02,345", "01:02.345"
 * @returns {number} milliseconds
 */
function parseTimestamp(value) {
  const [clock, fraction = '0'] = value.replace(',', '.').split('.')
  const parts = clock.split(':').map(Number)
  while (parts.length < 3) { parts.unshift(0) }
  const [hours, minutes, seconds] = parts
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(fraction.padEnd(3, '0').slice(0, 3))
}

/**
 * @param {number} ms
 */
function formatVttTimestamp(ms) {
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&apos;': '\'',
  '&nbsp;': ' ',
  '&lrm;': '',
  '&rlm;': ''
}

/**
 * Reduces a cue body to what SRT renderers understand: plain text plus
 * <i>, <b> and <u>. Voice/class spans, karaoke timestamps and ruby markup go.
 * @param {string} text
 */
function cleanCueText(text) {
  return text
    .replaceAll(/<(?!\/?[ibu]>)[^>]*>/g, '')
    .replaceAll(/&(?:amp|lt|gt|quot|#39|apos|nbsp|lrm|rlm);/g, (entity) => ENTITIES[entity])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * Parses SRT or WebVTT into cues. Lenient about both: SRT counters and WebVTT
 * identifiers, cue settings, NOTE/STYLE blocks are all simply skipped.
 * @param {string} text
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function parseSubtitleCues(text) {
  const cues = []

  const blocks = text
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split(/\n{2,}/)

  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((line) => CUE_TIMING.test(line))
    if (timingIndex === -1) { continue }

    const [, startText, endText] = lines[timingIndex].match(CUE_TIMING)
    const body = cleanCueText(lines.slice(timingIndex + 1).join('\n'))
    if (body === '') { continue }

    const start = parseTimestamp(startText)
    const end = parseTimestamp(endText)
    if (end <= start) { continue }

    cues.push({ start, end, text: body })
  }

  // mediabunny writes every cue as a key packet and refuses one that starts
  // before an earlier one
  return cues.sort((a, b) => a.start - b.start)
}

/**
 * Auto-generated tracks overlap each cue with the next so that players stack
 * them into a rolling two-line display; in a plain SRT track that reads as
 * every line appearing twice. Each cue is cut where the next one begins.
 * @param {{ start: number, end: number, text: string }[]} cues
 */
function removeRollingOverlap(cues) {
  return cues
    .map((cue, index) => {
      const next = cues[index + 1]
      return next !== undefined && next.start < cue.end ? { ...cue, end: next.start } : cue
    })
    .filter((cue) => cue.end > cue.start)
}

/**
 * @param {{ start: number, end: number, text: string }[]} cues
 */
function toVtt(cues) {
  return 'WEBVTT\n\n' + cues
    .map((cue) => `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}\n${cue.text}`)
    .join('\n\n') + '\n'
}

/**
 * @param {string} url
 */
function isYouTubeTimedtext(url) {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith('youtube.com') && parsed.pathname.endsWith('/timedtext')
  } catch {
    return false
  }
}

/**
 * @param {SubtitleTrackChoice} track
 * @returns {Promise<string | null>}
 */
async function fetchTrackText(track) {
  if (isYouTubeTimedtext(track.url)) {
    return await fetchCaptionFormat(track.url, 'srt') ?? await fetchCaptionFormat(track.url, 'vtt')
  }

  try {
    const response = await fetch(track.url)
    return response.ok ? await response.text() : null
  } catch (error) {
    console.error(`subtitle fetch failed for ${track.label}`, error)
    return null
  }
}

/**
 * Fetches the chosen tracks, in the order given. A track that cannot be fetched
 * or holds no cues is left out rather than failing the download.
 * @param {SubtitleTrackChoice[]} tracks
 * @returns {Promise<{ subtitles: DownloadSubtitle[], failed: string[] }>}
 */
export async function fetchDownloadSubtitles(tracks) {
  const results = await Promise.all((tracks ?? []).map(async (track) => {
    const text = await fetchTrackText(track)
    if (text === null) { return null }

    let cues = parseSubtitleCues(text)
    if (track.id?.startsWith('a.')) {
      cues = removeRollingOverlap(cues)
    }
    if (cues.length === 0) { return null }

    return { vtt: toVtt(cues), language: track.language, name: track.label }
  }))

  return {
    subtitles: results.filter((result) => result !== null),
    failed: (tracks ?? []).filter((_, index) => results[index] === null).map((track) => track.label)
  }
}
