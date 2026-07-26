// Output filename for downloaded videos, from a yt-dlp-shaped template so the
// muscle memory of `-o '%(title)s %(upload_date)s (%(channel)s).%(ext)s'`
// carries over.
//
// Sanitising is not cosmetic here: Android's /sdcard is FAT-semantics storage
// and simply refuses to create a file whose name contains any of : ? * " < > |
// \ /, which ordinary YouTube titles contain all the time.

export const DEFAULT_FILENAME_TEMPLATE = '%(title)s %(upload_date)s (%(channel)s).%(ext)s'

// ext4, exFAT and F2FS all cap a single path component at 255 bytes
export const DEFAULT_MAX_FILENAME_BYTES = 255

const ILLEGAL_CHARACTERS = /[/\\:*?"<>|]/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g

/**
 * The subset of strftime YouTube metadata can actually fill in.
 * @param {Date} date
 * @param {string} format
 * @returns {string}
 */
function strftime(date, format) {
  const pad = (value) => String(value).padStart(2, '0')

  return format.replaceAll(/%([YmdHMS%])/g, (match, specifier) => {
    switch (specifier) {
      case 'Y': return String(date.getFullYear())
      case 'm': return pad(date.getMonth() + 1)
      case 'd': return pad(date.getDate())
      case 'H': return pad(date.getHours())
      case 'M': return pad(date.getMinutes())
      case 'S': return pad(date.getSeconds())
      case '%': return '%'
      default: return match
    }
  })
}

/**
 * Strips what no filesystem we write to will accept, and tidies the result.
 * @param {string} value
 * @returns {string}
 */
export function sanitizeForFilename(value) {
  return (value ?? '')
    .replaceAll(CONTROL_CHARACTERS, ' ')
    .replaceAll(ILLEGAL_CHARACTERS, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} value
 * @returns {number}
 */
function byteLength(value) {
  return new TextEncoder().encode(value).length
}

/**
 * Shortens to fit a byte budget without splitting a character in half.
 * @param {string} value
 * @param {number} maxBytes
 * @returns {string}
 */
function truncateToBytes(value, maxBytes) {
  if (byteLength(value) <= maxBytes) { return value }

  let result = ''
  let used = 0

  // iterate by code point so surrogate pairs stay intact
  for (const character of value) {
    const size = byteLength(character)
    if (used + size > maxBytes) { break }
    result += character
    used += size
  }

  return result.trimEnd()
}

/**
 * @typedef {object} DownloadMetadata
 * @property {string} title
 * @property {string} channel
 * @property {number} [published] epoch milliseconds
 * @property {string} videoId
 * @property {string} [resolution] e.g. "720p"
 * @property {string} [ext] defaults to "mkv"
 */

/**
 * Renders the template. Unknown tokens are left alone rather than silently
 * blanked, so a typo in the setting is visible in the resulting name.
 * @param {string} template
 * @param {DownloadMetadata} metadata
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function buildDownloadFilename(template, metadata, maxBytes = DEFAULT_MAX_FILENAME_BYTES) {
  const published = typeof metadata.published === 'number' && !isNaN(metadata.published)
    ? new Date(metadata.published)
    : null

  const values = {
    title: sanitizeForFilename(metadata.title) || metadata.videoId,
    channel: sanitizeForFilename(metadata.channel),
    uploader: sanitizeForFilename(metadata.channel),
    id: metadata.videoId ?? '',
    resolution: metadata.resolution ?? '',
    ext: metadata.ext ?? 'mkv'
  }

  const render = (title) => {
    const rendered = (template || DEFAULT_FILENAME_TEMPLATE).replaceAll(
      /%\((\w+)(?:>([^)]*))?\)s/g,
      (match, token, dateFormat) => {
        if (token === 'upload_date') {
          if (published === null) { return '' }
          return strftime(published, dateFormat || '%Y-%m-%d')
        }

        if (token === 'title') { return title }
        return Object.hasOwn(values, token) ? values[token] : match
      }
    )

    // a missing token can leave a double space or a dangling separator behind
    return rendered.replaceAll(/\s+/g, ' ').replaceAll(/\s+\./g, '.').trim()
  }

  const full = render(values.title)
  if (byteLength(full) <= maxBytes) { return full }

  // over budget: shorten the title rather than the tail, so the date, the
  // channel and above all the extension survive
  const overflow = byteLength(full) - maxBytes
  const shortTitle = truncateToBytes(values.title, Math.max(1, byteLength(values.title) - overflow))
  const shortened = render(shortTitle || metadata.videoId)

  // pathological templates (a huge literal, no title token) still get clamped
  return byteLength(shortened) <= maxBytes ? shortened : truncateToBytes(shortened, maxBytes)
}
