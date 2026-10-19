// Matroska chapter writing. mediabunny has no chapter API, so the EBML
// `Chapters` element is built here and handed to the muxer, which our patch
// (patches/mediabunny.patch, `chaptersElement` option) writes into the segment
// header immediately *before* the first Cluster.
//
// Placement is the whole problem. Appended after the Cues it would give a
// structurally valid file that no player reads: ffmpeg and mkvtoolnix parse
// level-1 elements only up to the first Cluster and then resolve anything later
// through the SeekHead, which carries no Chapters entry. Written by the muxer
// itself, every position it records afterwards — SeekHead, Cues, cluster
// offsets — already accounts for it, which also lets the file stream straight
// to disk instead of being spliced in memory once finished.

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
