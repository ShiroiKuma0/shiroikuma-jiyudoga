// Study subtitles: builds SRT files from YouTube timedtext data for the
// jisho study export.
//
// Architecture (v2, "ASR skeleton"): the caption (usually auto-generated)
// track defines the cue skeleton — its native event timing is the most
// reliable timing we have and is NEVER repositioned. When the video
// description contains verbatim speech (e.g. ANN news transcripts), only the
// TEXT inside a skeleton cue is substituted; timing stays the skeleton's.
// Cues are then split at logical points (。！？, quote boundaries), with the
// split times interpolated from the real token timestamps inside each cue.
//
// Pure functions, no platform APIs — shared by the Android export path and
// (later) the desktop Memento path.

/**
 * @typedef {object} Token
 * @property {string} text
 * @property {number} startMs
 * @property {number} endMs
 *
 * @typedef {object} Cue
 * @property {string} text
 * @property {number} startMs
 * @property {number} endMs
 */

// YouTube ASR sound-event tags ([音楽], [拍手], [Music], 【笑い】, ♪ …) —
// not speech: they must neither appear as subtitles nor bound the timing of
// real speech around them
const SOUND_EVENT_REGEX = /^[\s♪〜~]*(\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）)[\s♪〜~]*$/

/**
 * @param {string} text
 * @returns {boolean}
 */
function isSoundEventText(text) {
  const trimmed = text.trim()
  return trimmed !== '' && (SOUND_EVENT_REGEX.test(trimmed) || /^[♪〜~\s]+$/.test(trimmed))
}

/**
 * Parses a timedtext json3 document into word-level tokens, dropping the
 * rolling-caption artifacts (newline placeholder events, repeated segments,
 * out-of-order rollups) and non-speech sound-event tags.
 * @param {string | object} json3
 * @returns {Token[]}
 */
export function parseJson3(json3) {
  const data = typeof json3 === 'string' ? JSON.parse(json3) : json3

  const events = (data.events ?? [])
    .filter((event) => Array.isArray(event.segs))
    .sort((a, b) => a.tStartMs - b.tStartMs)

  /** @type {Token[]} */
  const tokens = []
  const seen = new Set()

  for (const event of events) {
    const eventEnd = event.tStartMs + (event.dDurationMs ?? 0)

    for (const seg of event.segs) {
      const text = seg.utf8 ?? ''
      if (text.trim() === '' || isSoundEventText(text)) { continue }

      const startMs = event.tStartMs + (seg.tOffsetMs ?? 0)

      const key = `${startMs}|${text}`
      if (seen.has(key)) { continue }
      seen.add(key)

      if (tokens.length > 0 && startMs < tokens[tokens.length - 1].startMs) { continue }

      tokens.push({ text, startMs, endMs: Math.max(eventEnd, startMs + 100) })
    }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    tokens[i].endMs = Math.max(tokens[i].startMs + 100, Math.min(tokens[i].endMs, tokens[i + 1].startMs))
  }

  return tokens
}

/**
 * Parses an SRT document into cue-level tokens (fallback when json3 is not
 * served — coarser timing, same downstream handling).
 * @param {string} srtText
 * @returns {Token[]}
 */
export function parseSrtToTokens(srtText) {
  const tokens = []
  const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/

  for (const block of srtText.replaceAll('\r', '').split(/\n\n+/)) {
    const lines = block.split('\n').filter((line) => line !== '')
    const timeLineIndex = lines.findIndex((line) => timeRegex.test(line))
    if (timeLineIndex === -1) { continue }

    const m = lines[timeLineIndex].match(timeRegex)
    const startMs = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4]
    const endMs = ((+m[5] * 60 + +m[6]) * 60 + +m[7]) * 1000 + +m[8]
    const text = lines.slice(timeLineIndex + 1).join(' ').trim()
    if (text === '' || isSoundEventText(text)) { continue }

    tokens.push({ text, startMs, endMs: Math.max(endMs, startMs + 100) })
  }

  return tokens.sort((a, b) => a.startMs - b.startMs)
}

const NON_CONTENT_CHAR_REGEX = /[\s\p{P}\p{S}]/u

/**
 * NFKC-normalizes a string and returns only its content characters
 * (whitespace, punctuation and symbols stripped; phonemic ー is category Lm
 * and therefore kept).
 * @param {string} text
 * @returns {string[]}
 */
function contentChars(text) {
  const chars = []
  for (const char of text.normalize('NFKC')) {
    if (!NON_CONTENT_CHAR_REGEX.test(char)) {
      chars.push(char)
    }
  }
  return chars
}

const CJK_CHAR_REGEX = /[⺀-鿿豈-﫿]/

// speech-rate model: Japanese news/interview speech runs at roughly 5-6
// characters per second, Latin-script speech at roughly 15
const CJK_MS_PER_CHAR = 170
const OTHER_MS_PER_CHAR = 65
const SPEECH_SLACK_MS = 800

/**
 * Estimates how long a cue's text takes to say — the filter that stops
 * subtitles from being extended over trailing music/silence.
 * @param {string} text
 * @returns {number} estimated milliseconds of speech
 */
function estimateSpeechDurationMs(text) {
  let duration = SPEECH_SLACK_MS
  for (const char of contentChars(text)) {
    duration += CJK_CHAR_REGEX.test(char) ? CJK_MS_PER_CHAR : OTHER_MS_PER_CHAR
  }
  return duration
}

/**
 * Extends each cue towards the next one, but never past the estimated end of
 * its own speech — trailing music/silence stays unsubtitled.
 * @param {Cue[]} cues sorted, non-overlapping
 */
function extendCueGaps(cues) {
  for (let i = 0; i < cues.length; i++) {
    const speechEnd = cues[i].startMs + estimateSpeechDurationMs(cues[i].text)
    const target = Math.max(cues[i].endMs, speechEnd)
    cues[i].endMs = i + 1 < cues.length ? Math.min(target, cues[i + 1].startMs - 1) : target
  }
}

// region skeleton

/**
 * @typedef {object} SkeletonCue
 * @property {Token[]} tokens
 * @property {number} startTokenIndex index of tokens[0] in the full token list
 * @property {string} text
 * @property {number} startMs
 * @property {number} endMs
 */

/**
 * Groups tokens into skeleton cues. The cue boundaries and start times are
 * the caption track's own — they are never moved afterwards.
 * @param {Token[]} tokens
 * @param {object} [options]
 * @returns {SkeletonCue[]}
 */
function buildSkeleton(tokens, options = {}) {
  const { maxChars = 48, maxDurMs = 7000, gapBreakMs = 800 } = options

  /** @type {SkeletonCue[]} */
  const cues = []
  let current = null

  const close = () => {
    if (current !== null) {
      if (contentChars(current.text).length > 0) {
        cues.push(current)
      }
      current = null
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]

    if (current !== null) {
      const gap = token.startMs - current.endMs
      const wouldOverflow = (current.text + token.text).length > maxChars ||
        (token.endMs - current.startMs) > maxDurMs
      const sentenceDone = /[。．！？!?]\s*$/.test(current.text)

      if (gap > gapBreakMs || wouldOverflow || sentenceDone) { close() }
    }

    if (current === null) {
      current = {
        tokens: [token],
        startTokenIndex: index,
        text: token.text,
        startMs: token.startMs,
        endMs: token.endMs
      }
    } else {
      current.tokens.push(token)
      current.text += token.text
      current.endMs = token.endMs
    }
  }
  close()

  return cues
}

// endregion

// region logical splitting

const SENTENCE_END_CHARS = '。．！？!?…'
const CLOSING_CHARS = '」』）)"'
const OPENING_CHARS = '「『（("'
const PAUSE_CHARS = '、，,;；・'

/**
 * @typedef {object} Anchor
 * @property {number} c character position (code points)
 * @property {number} t time in ms
 */

/**
 * @param {Anchor[]} anchors sanitized: sorted by c, non-decreasing t
 * @param {number} c
 * @returns {number}
 */
function interpolateTime(anchors, c) {
  let low = anchors[0]
  let high = anchors[anchors.length - 1]

  for (const anchor of anchors) {
    if (anchor.c <= c && anchor.c >= low.c) { low = anchor }
    if (anchor.c >= c && anchor.c < high.c) { high = anchor }
  }

  if (c <= low.c || high.c === low.c) { return low.t }
  if (c >= high.c) { return high.t }
  return low.t + ((high.t - low.t) * (c - low.c)) / (high.c - low.c)
}

/**
 * @param {Anchor[]} anchors
 * @returns {Anchor[]} sorted, deduplicated, monotonic in time
 */
function sanitizeAnchors(anchors) {
  const sorted = [...anchors].sort((a, b) => a.c - b.c)
  const result = []
  for (const anchor of sorted) {
    const previous = result[result.length - 1]
    if (previous && anchor.c === previous.c) { continue }
    const t = previous ? Math.max(anchor.t, previous.t) : anchor.t
    result.push({ c: anchor.c, t })
  }
  return result
}

/**
 * Anchors for a skeleton cue with its native (unsubstituted) text: exact
 * token start times at token boundaries, the (extended) cue end at the end.
 * @param {SkeletonCue} cue
 * @returns {Anchor[]}
 */
function nativeAnchors(cue) {
  const anchors = [{ c: 0, t: cue.startMs }]
  let offset = 0

  for (let k = 0; k < cue.tokens.length; k++) {
    if (k > 0) {
      anchors.push({ c: offset, t: cue.tokens[k].startMs })
    }
    offset += Array.from(cue.tokens[k].text).length
  }

  anchors.push({ c: offset, t: cue.endMs })
  return sanitizeAnchors(anchors)
}

/**
 * Computes the split ranges of a text: primary splits at sentence ends and
 * quote boundaries, secondary splits at pause punctuation for over-long
 * pieces, stub tails merged away.
 * @param {string[]} chars text as code points
 * @param {number} maxChars
 * @returns {[number, number][]} [start, end) ranges
 */
function logicalSplitRanges(chars, maxChars) {
  const breakpoints = new Set([0, chars.length])

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]

    if (SENTENCE_END_CHARS.includes(char)) {
      let j = i + 1
      while (j < chars.length && (CLOSING_CHARS.includes(chars[j]) || /\s/.test(chars[j]))) { j++ }
      breakpoints.add(j)
    } else if ('」』'.includes(char)) {
      // quote closers end a logical unit even without sentence punctuation
      breakpoints.add(i + 1)
    } else if (OPENING_CHARS.includes(char) && i > 0) {
      breakpoints.add(i)
    }
  }

  const sorted = [...breakpoints].sort((a, b) => a - b)

  /** @type {[number, number][]} */
  let ranges = []
  for (let k = 0; k + 1 < sorted.length; k++) {
    if (sorted[k + 1] > sorted[k]) {
      ranges.push([sorted[k], sorted[k + 1]])
    }
  }

  // merge content-less ranges into their neighbor
  ranges = ranges.reduce((accumulator, range) => {
    const previous = accumulator[accumulator.length - 1]
    if (contentChars(chars.slice(range[0], range[1]).join('')).length === 0 && previous) {
      previous[1] = range[1]
    } else {
      accumulator.push(range)
    }
    return accumulator
  }, /** @type {[number, number][]} */ ([]))

  // secondary pass: split over-long ranges at pause punctuation, then hard
  /** @type {[number, number][]} */
  const result = []
  for (const [start, end] of ranges) {
    if (end - start <= maxChars) {
      result.push([start, end])
      continue
    }

    const pieces = []
    let pieceStart = start
    let lastPause = -1
    for (let i = start; i < end; i++) {
      if (PAUSE_CHARS.includes(chars[i])) { lastPause = i }
      if (i - pieceStart + 1 >= maxChars && i + 1 < end) {
        const cut = lastPause > pieceStart ? lastPause + 1 : i + 1
        pieces.push([pieceStart, cut])
        pieceStart = cut
        lastPause = -1
        i = cut - 1
      }
    }
    if (pieceStart < end) { pieces.push([pieceStart, end]) }

    // merge stub tails (e.g. a closing 」。 pushed past the limit)
    while (pieces.length > 1 && contentChars(chars.slice(pieces[pieces.length - 1][0], pieces[pieces.length - 1][1]).join('')).length < 4) {
      const tail = pieces.pop()
      pieces[pieces.length - 1][1] = tail[1]
    }

    result.push(...pieces)
  }

  return result
}

/**
 * Splits a timed text into logical cues, times interpolated from anchors.
 * @param {string} text
 * @param {Anchor[]} anchors
 * @param {number} [maxChars]
 * @returns {Cue[]}
 */
function splitTimedText(text, anchors, maxChars = 48) {
  const chars = Array.from(text)
  const ranges = logicalSplitRanges(chars, maxChars)

  /** @type {Cue[]} */
  const cues = []
  for (const [start, end] of ranges) {
    const pieceText = chars.slice(start, end).join('').trim()
    if (contentChars(pieceText).length === 0) { continue }

    let startMs = Math.round(interpolateTime(anchors, start))
    const endMs = Math.round(interpolateTime(anchors, end))

    const previous = cues[cues.length - 1]
    if (previous && startMs <= previous.endMs) { startMs = previous.endMs + 1 }

    cues.push({ text: pieceText, startMs, endMs: Math.max(endMs, startMs + 200) })
  }

  return cues
}

// endregion

// region description alignment (verbatim text substitution)

const LINE_DROP_REGEX = /https?:\/\/|^[#＃]|チャンネル登録|登録はこちら|お?問い?合わせ|公式(サイト|HP|ホームページ)|Twitter|Instagram|TikTok|Facebook|LINE|[▼►▽↓©℗™]/

/**
 * Extracts the likeliest transcript block from a video description: the
 * longest contiguous run of lines that survive the boilerplate filter.
 * @param {string} description
 * @returns {string}
 */
function extractTranscriptCandidate(description) {
  const lines = description.replaceAll('\r', '').split('\n')

  let best = []
  let bestLength = 0
  let run = []
  let runLength = 0

  const flush = () => {
    if (runLength > bestLength) {
      best = run
      bestLength = runLength
    }
    run = []
    runLength = 0
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') { continue } // blank lines don't break a transcript block
    if (trimmed.length < 3 || LINE_DROP_REGEX.test(trimmed)) {
      flush()
      continue
    }
    run.push(trimmed)
    runLength += trimmed.length
  }
  flush()

  return best.join('\n')
}

/**
 * Banded character-level edit-distance alignment of the description text (D)
 * against the caption token text (R). Substitutions count as aligned — that
 * is exactly the ASR homophone-kanji error case.
 * @param {string[]} dChars
 * @param {string[]} rChars
 * @returns {Int32Array | null} dToR mapping (-1 = unaligned), null when the
 *   inputs are too large
 */
function alignChars(dChars, rChars) {
  const m = dChars.length
  const n = rChars.length
  if (m === 0 || n === 0 || m > 20000 || n > 40000) { return null }

  const band = Math.max(200, Math.ceil(0.15 * Math.max(m, n)))
  const width = 2 * band + 1
  const INF = 0x3fffffff

  const center = (i) => Math.round((i * n) / m)
  const lo = (i) => Math.max(0, center(i) - band)
  const hi = (i) => Math.min(n, center(i) + band)

  // directions: 0 none, 1 diagonal (match/substitution), 2 up (skip D char), 3 left (skip R char)
  const directions = new Uint8Array((m + 1) * width)
  let previousRow = new Int32Array(width).fill(INF)
  let currentRow = new Int32Array(width).fill(INF)

  for (let j = lo(0); j <= hi(0); j++) {
    previousRow[j - lo(0)] = j
    directions[j - lo(0)] = j === 0 ? 0 : 3
  }

  for (let i = 1; i <= m; i++) {
    currentRow.fill(INF)
    const rowLo = lo(i)
    const rowHi = hi(i)
    const prevLo = lo(i - 1)
    const prevHi = hi(i - 1)

    for (let j = rowLo; j <= rowHi; j++) {
      let bestCost = INF
      let bestDir = 0

      if (j > 0 && j - 1 >= prevLo && j - 1 <= prevHi) {
        const cost = previousRow[j - 1 - prevLo] + (dChars[i - 1] === rChars[j - 1] ? 0 : 1)
        if (cost < bestCost) { bestCost = cost; bestDir = 1 }
      }
      if (j >= prevLo && j <= prevHi) {
        const cost = previousRow[j - prevLo] + 1
        if (cost < bestCost) { bestCost = cost; bestDir = 2 }
      }
      if (j > 0 && j - 1 >= rowLo) {
        const cost = currentRow[j - 1 - rowLo] + 1
        if (cost < bestCost) { bestCost = cost; bestDir = 3 }
      }

      currentRow[j - rowLo] = bestCost
      directions[i * width + (j - rowLo)] = bestDir
    }

    const swap = previousRow
    previousRow = currentRow
    currentRow = swap
  }

  const dToR = new Int32Array(m).fill(-1)
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    const direction = i >= 0 && j >= lo(i) && j <= hi(i) ? directions[i * width + (j - lo(i))] : 0
    if (direction === 1) {
      i--; j--
      dToR[i] = j
    } else if (direction === 2) {
      i--
    } else if (direction === 3) {
      j--
    } else {
      break
    }
  }

  return dToR
}

const MIN_RUN = 3
const MIN_CUE_VERBATIM_COVERAGE = 0.7

/**
 * @typedef {object} DescriptionAlignment
 * @property {string[]} candidateChars candidate text as code points
 * @property {Int32Array} dOrig original candidate position per D char
 * @property {Int32Array} dToR
 * @property {Uint8Array} runCovered per D char: inside an exact run >= MIN_RUN
 * @property {Uint8Array} rVerbatim per R char: matched by a run-covered D char
 * @property {Int32Array} rToD reverse mapping for run-covered chars (-1 otherwise)
 * @property {Int32Array} rTokenIndex source token index per R char
 * @property {Int32Array} rWithinToken content-char offset inside the token per R char
 * @property {Int32Array} rStartOfToken first R index per token (-1 for empty tokens)
 * @property {Int32Array} tokenContentLength content-char count per token
 */

/**
 * Aligns the description against the caption tokens and marks verbatim runs.
 * @param {string} description
 * @param {Token[]} tokens
 * @returns {DescriptionAlignment | null}
 */
function buildDescriptionAlignment(description, tokens) {
  const candidate = extractTranscriptCandidate(description ?? '')
  if (candidate === '') { return null }

  const candidateChars = Array.from(candidate)

  // D: description content chars with their original candidate positions
  const dChars = []
  const dOrigList = []
  candidateChars.forEach((char, position) => {
    for (const normalized of char.normalize('NFKC')) {
      if (!NON_CONTENT_CHAR_REGEX.test(normalized)) {
        dChars.push(normalized)
        dOrigList.push(position)
      }
    }
  })

  // R: caption content chars with token attribution
  const rChars = []
  const rTokenIndexList = []
  const rWithinTokenList = []
  const rStartOfToken = new Int32Array(tokens.length).fill(-1)
  const tokenContentLength = new Int32Array(tokens.length)

  tokens.forEach((token, tokenIndex) => {
    const chars = contentChars(token.text)
    tokenContentLength[tokenIndex] = chars.length
    chars.forEach((char, within) => {
      if (within === 0) { rStartOfToken[tokenIndex] = rChars.length }
      rChars.push(char)
      rTokenIndexList.push(tokenIndex)
      rWithinTokenList.push(within)
    })
  })

  // cheap pre-gate: is the description even plausibly related to the speech?
  const ratio = dChars.length / Math.max(1, rChars.length)
  if (dChars.length < 20 || ratio < 0.3 || ratio > 2.5) { return null }

  const dCharSet = new Set(dChars)
  const rCharSet = new Set(rChars)
  const shared = [...dCharSet].filter((char) => rCharSet.has(char)).length
  if (shared / dCharSet.size < 0.5) { return null }

  const dToR = alignChars(dChars, rChars)
  if (dToR === null) { return null }

  // exact-match runs: verbatim text shares long contiguous runs of identical
  // characters with the captions; topical summaries only scattered singles
  const runCovered = new Uint8Array(dChars.length)
  let runStart = -1

  const closeRun = (endExclusive) => {
    if (runStart !== -1 && endExclusive - runStart >= MIN_RUN) {
      runCovered.fill(1, runStart, endExclusive)
    }
    runStart = -1
  }

  for (let d = 0; d < dChars.length; d++) {
    const r = dToR[d]
    const exact = r !== -1 && dChars[d] === rChars[r]
    const contiguous = runStart !== -1 && d > 0 && dToR[d - 1] === r - 1

    if (!exact) {
      closeRun(d)
    } else if (!contiguous) {
      closeRun(d)
      runStart = d
    }
  }
  closeRun(dChars.length)

  const rVerbatim = new Uint8Array(rChars.length)
  const rToD = new Int32Array(rChars.length).fill(-1)
  for (let d = 0; d < dChars.length; d++) {
    if (dToR[d] !== -1) {
      // every aligned char (matches AND substitutions — the homophone case)
      rToD[dToR[d]] = d
    }
    if (runCovered[d]) {
      rVerbatim[dToR[d]] = 1
    }
  }

  return {
    candidateChars,
    dOrig: Int32Array.from(dOrigList),
    dToR,
    runCovered,
    rVerbatim,
    rToD,
    rTokenIndex: Int32Array.from(rTokenIndexList),
    rWithinToken: Int32Array.from(rWithinTokenList),
    rStartOfToken,
    tokenContentLength
  }
}

/**
 * Attempts to substitute the verbatim-covered region INSIDE a skeleton cue's
 * text with the corresponding description slice, keeping the caption text of
 * the uncovered prefix/suffix — nothing that was spoken is dropped, and the
 * skeleton timing is preserved via anchors on the cue's own tokens.
 * @param {SkeletonCue} cue
 * @param {DescriptionAlignment} alignment
 * @returns {{ text: string, anchors: Anchor[] } | null}
 */
function substituteCueText(cue, alignment) {
  // raw cue characters with their R indices
  const rawChars = []
  const rawToR = []
  let maxR = -1

  cue.tokens.forEach((token, k) => {
    const tokenIndex = cue.startTokenIndex + k
    let r = alignment.rStartOfToken[tokenIndex]
    for (const char of Array.from(token.text)) {
      const contentCount = contentChars(char).length
      if (contentCount > 0 && r !== -1) {
        rawToR.push(r)
        r += contentCount
        if (r - 1 > maxR) { maxR = r - 1 }
      } else {
        rawToR.push(-1)
      }
      rawChars.push(char)
    }
  })

  const contentRs = rawToR.filter((r) => r !== -1)
  if (contentRs.length === 0) { return null }
  const r0 = contentRs[0]
  const r1 = maxR + 1

  // verbatim-covered region [rA..rB] within the cue
  let rA = -1
  let rB = -1
  for (let r = r0; r < r1; r++) {
    if (alignment.rVerbatim[r]) {
      if (rA === -1) { rA = r }
      rB = r
    }
  }
  if (rA === -1) { return null }

  // The region spans first..last verbatim char; homophone errors BETWEEN
  // runs are inside the span and get corrected by the slice. The edges are
  // deliberately not pulled outwards — DP substitutions continue diagonally
  // into unrelated description text, so edge chars without run evidence stay
  // as the caption heard them.
  const regionLength = rB - rA + 1
  let covered = 0
  for (let r = rA; r <= rB; r++) {
    if (alignment.rVerbatim[r]) { covered++ }
  }

  if (
    regionLength < 6 ||
    covered / regionLength < 0.6 ||
    regionLength / (r1 - r0) < MIN_CUE_VERBATIM_COVERAGE * 0.7
  ) { return null }

  const dMin = alignment.rToD[rA]
  const dMax = alignment.rToD[rB]
  if (dMin === -1 || dMax === -1 || dMax < dMin) { return null }

  // description slice in original text, pulled out to natural boundaries
  let origStart = alignment.dOrig[dMin]
  let origEnd = alignment.dOrig[dMax]
  const chars = alignment.candidateChars

  while (
    origEnd + 1 < chars.length &&
    chars[origEnd + 1] !== '\n' &&
    NON_CONTENT_CHAR_REGEX.test(chars[origEnd + 1]) &&
    !OPENING_CHARS.includes(chars[origEnd + 1])
  ) { origEnd++ }

  // include an opening quote/bracket only when its closer is inside the slice
  const CLOSER_OF = { '「': '」', '『': '』', '（': '）', '(': ')', '"': '"' }
  if (origStart > 0 && CLOSER_OF[chars[origStart - 1]] !== undefined) {
    if (chars.slice(origStart, origEnd + 1).includes(CLOSER_OF[chars[origStart - 1]])) {
      origStart--
    }
  }

  const slice = chars.slice(origStart, origEnd + 1).join('').replaceAll('\n', ' ')
  const sliceLength = Array.from(slice).length

  // splice positions in the raw cue text
  let spliceStart = rawChars.length
  let spliceEnd = -1
  for (let i = 0; i < rawChars.length; i++) {
    if (rawToR[i] !== -1 && rawToR[i] >= rA && i < spliceStart) { spliceStart = i }
    if (rawToR[i] !== -1 && rawToR[i] <= rB) { spliceEnd = i }
  }
  if (spliceEnd < spliceStart) { return null }

  const prefix = rawChars.slice(0, spliceStart).join('')
  let suffixStart = spliceEnd + 1
  // avoid doubled punctuation at the joint (slice already ends with 。」 etc.)
  const sliceChars = Array.from(slice)
  if (sliceChars.length > 0 && NON_CONTENT_CHAR_REGEX.test(sliceChars[sliceChars.length - 1])) {
    while (suffixStart < rawChars.length && rawToR[suffixStart] === -1 && NON_CONTENT_CHAR_REGEX.test(rawChars[suffixStart])) {
      suffixStart++
    }
  }
  const suffix = rawChars.slice(suffixStart).join('')
  const prefixLength = spliceStart
  const text = prefix + slice + suffix

  /** @param {number} r */
  const timeAtR = (r) => {
    const tokenIndex = alignment.rTokenIndex[r]
    const localIndex = tokenIndex - cue.startTokenIndex
    const token = cue.tokens[localIndex]
    if (!token) { return cue.startMs }
    // the last token's span runs to the (speech-rate extended) cue end —
    // display-window event durations underrepresent the real speech span
    const tokenEnd = localIndex === cue.tokens.length - 1 ? cue.endMs : token.endMs
    const within = alignment.rWithinToken[r] / Math.max(1, alignment.tokenContentLength[tokenIndex])
    return token.startMs + within * (tokenEnd - token.startMs)
  }

  // anchors: native token boundaries in the prefix/suffix, alignment-derived
  // times inside the substituted slice, skeleton start/end at the edges
  const anchors = [{ c: 0, t: cue.startMs }]

  let offset = 0
  const suffixShift = prefixLength + sliceLength - suffixStart
  cue.tokens.forEach((token, k) => {
    if (k > 0) {
      if (offset < spliceStart) {
        anchors.push({ c: offset, t: token.startMs })
      } else if (offset >= suffixStart) {
        anchors.push({ c: offset + suffixShift, t: token.startMs })
      }
    }
    offset += Array.from(token.text).length
  })

  anchors.push(
    { c: prefixLength, t: timeAtR(rA) },
    { c: prefixLength + sliceLength, t: timeAtR(rB) }
  )

  let lastAnchoredToken = -1
  for (let d = dMin; d <= dMax; d++) {
    const r = alignment.dToR[d]
    if (r === -1 || !alignment.rVerbatim[r]) { continue }
    const tokenIndex = alignment.rTokenIndex[r]
    if (tokenIndex === lastAnchoredToken) { continue }
    lastAnchoredToken = tokenIndex
    anchors.push({ c: prefixLength + (alignment.dOrig[d] - origStart), t: timeAtR(r) })
  }

  anchors.push({ c: prefixLength + sliceLength + Array.from(suffix).length, t: cue.endMs })

  return { text, anchors: sanitizeAnchors(anchors) }
}

// endregion

/**
 * @param {number} ms
 * @returns {string}
 */
function msToSrtTime(ms) {
  const clamped = Math.max(0, Math.round(ms))
  const hours = Math.floor(clamped / 3600000)
  const minutes = Math.floor((clamped % 3600000) / 60000)
  const seconds = Math.floor((clamped % 60000) / 1000)
  const millis = clamped % 1000

  const pad = (value, length = 2) => String(value).padStart(length, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

/**
 * @param {Cue[]} cues
 * @returns {string} SRT document (UTF-8, \n line endings, no BOM)
 */
export function toSrt(cues) {
  return cues
    .map((cue, index) => `${index + 1}\n${msToSrtTime(cue.startMs)} --> ${msToSrtTime(cue.endMs)}\n${cue.text}\n`)
    .join('\n')
}

/**
 * Top-level entry point.
 * @param {object} input
 * @param {string | object} [input.json3] timedtext json3 document
 * @param {string} [input.srt] timedtext srt document (fallback timing source)
 * @param {string} [input.description] plain video description
 * @returns {{ primarySrt: string, asrSrt: string | null, aligned: boolean, stats: object | null }}
 */
export function buildStudySubtitles({ json3, srt, description }) {
  const tokens = (json3 != null ? parseJson3(json3) : parseSrtToTokens(srt ?? ''))
    .filter((token) => !isSoundEventText(token.text))

  if (tokens.length === 0) {
    throw new Error('empty caption track')
  }

  const skeleton = buildSkeleton(tokens)
  extendCueGaps(skeleton)

  /** @type {Cue[]} */
  const asrCues = []
  for (const cue of skeleton) {
    asrCues.push(...splitTimedText(cue.text, nativeAnchors(cue)))
  }
  extendCueGaps(asrCues)

  const alignment = description ? buildDescriptionAlignment(description, tokens) : null

  if (alignment !== null) {
    /** @type {Cue[]} */
    const primaryCues = []
    let substitutedCues = 0

    for (const cue of skeleton) {
      const substitution = substituteCueText(cue, alignment)
      if (substitution !== null) {
        substitutedCues++
        primaryCues.push(...splitTimedText(substitution.text, substitution.anchors))
      } else {
        primaryCues.push(...splitTimedText(cue.text, nativeAnchors(cue)))
      }
    }

    if (substitutedCues > 0) {
      extendCueGaps(primaryCues)
      return {
        primarySrt: toSrt(primaryCues),
        asrSrt: toSrt(asrCues),
        aligned: true,
        stats: { cues: skeleton.length, substitutedCues }
      }
    }
  }

  return {
    primarySrt: toSrt(asrCues),
    asrSrt: null,
    aligned: false,
    stats: null
  }
}
