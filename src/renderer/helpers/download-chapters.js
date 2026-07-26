// Matroska chapter writing. mediabunny has no chapter API, so we build the
// EBML `Chapters` element ourselves and splice it into the finished file.
//
// Placement is the whole problem. Appending it after the Cues — where nothing
// else has to move — produces a structurally valid file that no player reads:
// ffmpeg and mkvtoolnix parse level-1 elements only up to the first Cluster and
// then resolve anything later through the SeekHead, whose entry list mediabunny
// writes at a fixed size we cannot extend. So the element goes in immediately
// *before* the first Cluster, where the normal header parse finds it.
//
// That shifts every byte after the insertion point, which two things reference:
// the SeekHead's stored position of the Cues, and each CueClusterPosition
// inside the Cues. Both are corrected here. Everything ahead of the insertion
// point — SeekHead, Info, Tracks, and their recorded positions — is untouched,
// and the SeekHead is rewritten strictly in place so its own length (and hence
// those positions) cannot change.

const ID_SEGMENT = 0x18538067
const ID_SEEK_HEAD = 0x114d9b74
const ID_SEEK = 0x4dbb
const ID_SEEK_ID = 0x53ab
const ID_SEEK_POSITION = 0x53ac
const ID_CLUSTER = 0x1f43b675
const ID_CUES = 0x1c53bb6b
const ID_CUE_POINT = 0xbb
const ID_CUE_TRACK_POSITIONS = 0xb7
const ID_CUE_CLUSTER_POSITION = 0xf1

const ID_CHAPTERS = 0x1043a770
const ID_EDITION_ENTRY = 0x45b9
const ID_EDITION_FLAG_DEFAULT = 0x45db
const ID_CHAPTER_ATOM = 0xb6
const ID_CHAPTER_UID = 0x73c4
const ID_CHAPTER_TIME_START = 0x91
const ID_CHAPTER_TIME_END = 0x92
const ID_CHAPTER_DISPLAY = 0x80
const ID_CHAP_STRING = 0x85
const ID_CHAP_LANGUAGE = 0x437c

/**
 * Element IDs carry their own length marker, so they go out as-is.
 * @param {number} id
 * @returns {number[]}
 */
function idBytes(id) {
  const bytes = []
  for (let shift = 24; shift >= 0; shift -= 8) {
    const byte = (id >>> shift) & 0xff
    if (bytes.length > 0 || byte !== 0) { bytes.push(byte) }
  }
  return bytes.length > 0 ? bytes : [0]
}

/**
 * EBML data size: the leading marker bit encodes the field's own width.
 * @param {number} size
 * @returns {number[]}
 */
function sizeBytes(size) {
  let width = 1
  // a size of all ones means "unknown", so such a value needs the next width up
  while (width < 8 && BigInt(size) >= (1n << BigInt(7 * width)) - 1n) { width++ }
  return encodeSizeAtWidth(size, width)
}

/**
 * @param {number} size
 * @param {number} width
 * @returns {number[]}
 */
function encodeSizeAtWidth(size, width) {
  const bytes = []
  let value = BigInt(size) | (1n << BigInt(7 * width))
  for (let i = 0; i < width; i++) {
    bytes.unshift(Number(value & 0xffn))
    value >>= 8n
  }
  return bytes
}

/**
 * Minimal big-endian unsigned integer, as Matroska stores uints.
 * @param {number | bigint} value
 * @returns {number[]}
 */
function uintBytes(value) {
  let remaining = BigInt(value)
  if (remaining < 0n) { remaining = 0n }
  const bytes = []
  do {
    bytes.unshift(Number(remaining & 0xffn))
    remaining >>= 8n
  } while (remaining > 0n)
  return bytes
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function readUint(bytes, start, end) {
  let value = 0n
  for (let i = start; i < end; i++) { value = (value << 8n) | BigInt(bytes[i]) }
  return Number(value)
}

/**
 * @param {number} id
 * @param {number[] | Uint8Array} payload
 * @returns {number[]}
 */
function element(id, payload) {
  return [...idBytes(id), ...sizeBytes(payload.length), ...payload]
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function utf8(text) {
  return new TextEncoder().encode(text)
}

/**
 * Reads an EBML variable-length integer.
 * @param {Uint8Array} bytes
 * @param {number} position
 * @param {boolean} keepMarker element IDs keep their marker bit, sizes drop it
 */
function readVint(bytes, position, keepMarker) {
  const first = bytes[position]
  if (first === undefined || first === 0) {
    throw new Error('malformed EBML: invalid variable-length integer')
  }

  let width = 1
  while (width <= 8 && (first & (0x80 >> (width - 1))) === 0) { width++ }
  if (width > 8) {
    throw new Error('malformed EBML: oversized variable-length integer')
  }

  let value = BigInt(keepMarker ? first : first & (0xff >> width))
  for (let i = 1; i < width; i++) {
    value = (value << 8n) | BigInt(bytes[position + i])
  }

  return { value, width, unknown: !keepMarker && value === (1n << BigInt(7 * width)) - 1n }
}

/**
 * Splits a range of EBML into its direct children.
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @returns {{ id: number, start: number, dataStart: number, dataEnd: number }[]}
 */
function parseChildren(bytes, start, end) {
  const children = []
  let position = start

  while (position < end) {
    const id = readVint(bytes, position, true)
    const size = readVint(bytes, position + id.width, false)
    const dataStart = position + id.width + size.width
    const dataEnd = size.unknown ? end : dataStart + Number(size.value)
    if (dataEnd > end) {
      throw new Error('malformed Matroska: child element overruns its parent')
    }
    children.push({ id: Number(id.value), start: position, dataStart, dataEnd })
    position = dataEnd
  }

  return children
}

/**
 * Builds the complete `Chapters` element.
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} chapters
 * @param {string} [language] ISO 639-2/T code stored on each display entry
 * @returns {Uint8Array}
 */
export function buildChaptersElement(chapters, language = 'und') {
  const atoms = []

  chapters.forEach((chapter, index) => {
    const startNs = Math.max(0, Math.round(chapter.startSeconds * 1e9))
    const parts = [
      // ChapterUID must be non-zero
      ...element(ID_CHAPTER_UID, uintBytes(index + 1)),
      ...element(ID_CHAPTER_TIME_START, uintBytes(startNs))
    ]

    if (typeof chapter.endSeconds === 'number' && isFinite(chapter.endSeconds)) {
      const endNs = Math.max(startNs, Math.round(chapter.endSeconds * 1e9))
      parts.push(...element(ID_CHAPTER_TIME_END, uintBytes(endNs)))
    }

    // newlines in a chapter string are legal but render badly in players
    const title = (chapter.title ?? '').replaceAll(/[\r\n]+/g, ' ').trim()
    parts.push(...element(ID_CHAPTER_DISPLAY, [
      ...element(ID_CHAP_STRING, utf8(title)),
      ...element(ID_CHAP_LANGUAGE, utf8(language))
    ]))

    atoms.push(...element(ID_CHAPTER_ATOM, parts))
  })

  const edition = element(ID_EDITION_ENTRY, [
    ...element(ID_EDITION_FLAG_DEFAULT, uintBytes(1)),
    ...atoms
  ])

  return new Uint8Array(element(ID_CHAPTERS, edition))
}

/**
 * Rewrites the SeekHead's recorded Cues position, in place and at its original
 * width, so the element's length is guaranteed not to change.
 * @param {Uint8Array} bytes the whole file; mutated
 * @param {{ dataStart: number, dataEnd: number }} seekHead
 * @param {number} delta
 */
function shiftSeekHeadCuesPosition(bytes, seekHead, delta) {
  const cuesId = idBytes(ID_CUES)

  for (const seek of parseChildren(bytes, seekHead.dataStart, seekHead.dataEnd)) {
    if (seek.id !== ID_SEEK) { continue }

    const fields = parseChildren(bytes, seek.dataStart, seek.dataEnd)
    const seekId = fields.find((field) => field.id === ID_SEEK_ID)
    const seekPosition = fields.find((field) => field.id === ID_SEEK_POSITION)
    if (seekId === undefined || seekPosition === undefined) { continue }

    const target = bytes.subarray(seekId.dataStart, seekId.dataEnd)
    if (target.length !== cuesId.length || !cuesId.every((byte, index) => byte === target[index])) {
      continue
    }

    const width = seekPosition.dataEnd - seekPosition.dataStart
    const shifted = readUint(bytes, seekPosition.dataStart, seekPosition.dataEnd) + delta
    const encoded = uintBytes(shifted)
    if (encoded.length > width) {
      throw new Error('cannot shift chapters in: the SeekHead position field is too narrow')
    }

    // left-pad with zero bytes to keep the original width
    bytes.fill(0, seekPosition.dataStart, seekPosition.dataEnd)
    bytes.set(encoded, seekPosition.dataEnd - encoded.length)
  }
}

/**
 * Re-encodes the Cues element with every cluster position shifted.
 * @param {Uint8Array} bytes
 * @param {{ dataStart: number, dataEnd: number }} cues
 * @param {number} delta
 * @returns {Uint8Array}
 */
function shiftCues(bytes, cues, delta) {
  const transform = (start, end) => {
    const parts = []

    for (const child of parseChildren(bytes, start, end)) {
      if (child.id === ID_CUE_CLUSTER_POSITION) {
        const shifted = readUint(bytes, child.dataStart, child.dataEnd) + delta
        parts.push(...element(child.id, uintBytes(shifted)))
      } else if (child.id === ID_CUE_POINT || child.id === ID_CUE_TRACK_POSITIONS) {
        parts.push(...element(child.id, transform(child.dataStart, child.dataEnd)))
      } else {
        // CueRelativePosition and friends are relative to their cluster, so
        // they survive the shift untouched
        parts.push(...element(child.id, bytes.subarray(child.dataStart, child.dataEnd)))
      }
    }

    return parts
  }

  return new Uint8Array(element(ID_CUES, transform(cues.dataStart, cues.dataEnd)))
}

/**
 * Inserts a `Chapters` element into a finished Matroska file, ahead of the
 * first cluster, correcting the offsets the insertion invalidates.
 * @param {Uint8Array} mkvBytes
 * @param {{ title: string, startSeconds: number, endSeconds?: number }[]} chapters
 * @param {string} [language]
 * @returns {Uint8Array} the file with chapters (the input, unchanged, if there are none)
 */
export function insertChapters(mkvBytes, chapters, language = 'und') {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return mkvBytes
  }

  // skip the EBML header to reach the Segment
  const headerId = readVint(mkvBytes, 0, true)
  const headerSize = readVint(mkvBytes, headerId.width, false)
  const segmentStart = headerId.width + headerSize.width + Number(headerSize.value)

  const segmentId = readVint(mkvBytes, segmentStart, true)
  if (Number(segmentId.value) !== ID_SEGMENT) {
    throw new Error('malformed Matroska: no Segment after the EBML header')
  }

  const sizeFieldAt = segmentStart + segmentId.width
  const segmentSize = readVint(mkvBytes, sizeFieldAt, false)
  const segmentDataStart = sizeFieldAt + segmentSize.width
  const segmentDataEnd = segmentSize.unknown
    ? mkvBytes.length
    : segmentDataStart + Number(segmentSize.value)

  const children = parseChildren(mkvBytes, segmentDataStart, segmentDataEnd)
  const firstCluster = children.find((child) => child.id === ID_CLUSTER)
  const seekHead = children.find((child) => child.id === ID_SEEK_HEAD)
  const cues = children.find((child) => child.id === ID_CUES)

  const chaptersElement = buildChaptersElement(chapters, language)
  const delta = chaptersElement.length

  // no clusters means nothing can shift — put it at the end of the Segment
  const insertAt = firstCluster?.start ?? segmentDataEnd

  const head = mkvBytes.slice(0, insertAt)
  const tail = mkvBytes.slice(insertAt, segmentDataEnd)
  const trailing = mkvBytes.subarray(segmentDataEnd)

  if (seekHead !== undefined && cues !== undefined && firstCluster !== undefined) {
    shiftSeekHeadCuesPosition(head, seekHead, delta)
  }

  // Cues sits after the insertion point, so its cluster pointers move with it
  let tailBytes = tail
  if (cues !== undefined && firstCluster !== undefined && cues.start >= insertAt) {
    const rebuiltCues = shiftCues(mkvBytes, cues, delta)
    const beforeCues = mkvBytes.subarray(insertAt, cues.start)
    const afterCues = mkvBytes.subarray(cues.dataEnd, segmentDataEnd)

    tailBytes = new Uint8Array(beforeCues.length + rebuiltCues.length + afterCues.length)
    tailBytes.set(beforeCues, 0)
    tailBytes.set(rebuiltCues, beforeCues.length)
    tailBytes.set(afterCues, beforeCues.length + rebuiltCues.length)
  }

  const result = new Uint8Array(head.length + chaptersElement.length + tailBytes.length + trailing.length)
  result.set(head, 0)
  result.set(chaptersElement, head.length)
  result.set(tailBytes, head.length + chaptersElement.length)
  result.set(trailing, head.length + chaptersElement.length + tailBytes.length)

  if (!segmentSize.unknown) {
    // rewrite at the original width so nothing downstream moves
    const newSize = (segmentDataEnd - segmentDataStart) + chaptersElement.length +
      (tailBytes.length - tail.length)
    const capacity = (1n << BigInt(7 * segmentSize.width)) - 1n
    if (BigInt(newSize) >= capacity) {
      throw new Error('cannot insert chapters: the Segment size field would overflow')
    }
    result.set(encodeSizeAtWidth(newSize, segmentSize.width), sizeFieldAt)
  }

  return result
}
