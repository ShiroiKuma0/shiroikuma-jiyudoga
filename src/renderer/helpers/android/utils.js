/**
 * @param {string} filePath
 * @param {string} newFileType
 * @returns {string}
 */
export function replaceFileType(filePath, newFileType) {
  return `${filePath.slice(0, filePath.lastIndexOf('.'))}.${newFileType}`
}

/**
 * @typedef ContentResultsInfo
 * @property {string} trimmedContent the original content, trimmed of whitespace
 * @property {boolean} startsLikeJson whether file content appears to be json-like
 * @property {boolean} startsLikeXml whether file content appears to be xml
 * @property {string} fileType the portion of the file path after the last dot
 * @property {boolean} reportsOpml whether or not the file type is 'opml'
 */

/**
 * @typedef ContentResults
 * @property {'db'|'opml'|string} type the determined real file type
 * @property {ContentResultsInfo} info the information which lead to this conclusion
 */

/**
 * detects the real file type of an `octet-stream` mime-typed file in android
 * @param {string} content
 * @param {string} filePath
 * @returns {ContentResults}
 */
export function detectAmbiguousContent(content, filePath) {
  const trimmedContent = content.trim()
  const startsLikeJson = trimmedContent[0] === '{'
  const startsLikeXml = trimmedContent[0] === '<'
  const fileType = filePath.slice(filePath.lastIndexOf('.'), filePath.length)
  const reportsOpml = fileType.endsWith('opml')
  const type = startsLikeJson && reportsOpml
    ? 'db'
    : startsLikeXml && reportsOpml
      ? 'opml'
      : fileType
  return {
    type,
    info: {
      trimmedContent,
      startsLikeJson,
      startsLikeXml,
      fileType,
      reportsOpml
    }
  }
}

/**
 *
 * @param {string} content
 * @param {string} filePath
 * @returns
 */
export function handleAmbigiousContent(content, filePath) {
  const { type, info } = detectAmbiguousContent(content, filePath)
  if (info.fileType !== type) {
    filePath = replaceFileType(filePath, type)
  }
  return filePath
}

export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function isColourDark(colour) {
  if (colour.length < 7) {
    const char = colour.substring(1, 2)
    colour = `${colour.substring(0, 1)}${char}${char}${char}${char}${char}${char}`
  }
  const diffFromWhite = Math.abs(parseInt('FFFFFF', 16) - parseInt(colour.substring(1, colour.length), 16))
  const diffFromBlack = Math.abs(parseInt('000000', 16) - parseInt(colour.substring(1, colour.length), 16))
  return diffFromBlack > diffFromWhite
}

export function reverseObject(object) {
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, value]) => {
        return [value, key]
      })
  )
}

// Split a fork versionName — `<FORK_VERSION>[+<pin>][+<pin>]+<NNN>`, e.g.
// `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+009` — into the only two
// fields that ORDER builds: FORK_VERSION and the build counter. Everything between them is
// upstream-base pins, which merely IDENTIFY the commits our layer sits on.
function forkVersionOrder(version) {
  const text = `${version}`.trim().replace(/^v/, '')
    // Cut the pins out first — a released tag may carry either shape, since tags published
    // before 2026-08-12 joined their pins with dots (`0.25.2.2026-08-12.g86401956…`) rather
    // than opening each with `+`, and a pin whose timestamp was unavailable degrades to a
    // bare `g<sha>`. Left in, a dot-joined pin's YEAR reads as a fourth version component.
    .replaceAll(/[.+](?:\d{4}-\d{2}-\d{2}(?:\.\d{2}-\d{2})?\.)?g[0-9a-f]{7,}/g, '')
  // the leading dotted numeric run is FORK_VERSION (maj.min.patch[.respin]); the counter is
  // the trailing all-digit `+` group, and resets to 1 on every FORK_VERSION change, so it
  // only ever breaks a tie between equal FORK_VERSIONs
  const base = /^\d+(?:\.\d+)*/.exec(text)
  const counter = /\+(\d+)$/.exec(text)
  return {
    version: base ? base[0].split('.').map(Number) : [],
    counter: counter ? parseInt(counter[1], 10) : 0
  }
}

export function versionNumberGt(versionA, versionB) {
  // The pins must NEVER be compared. They are not monotonic: their shape has changed
  // (dot-joined -> `+`-grouped, bare date -> date + HH-MM) and a pin can move BACKWARDS for
  // the same commit — rendering both timestamps in UTC on 2026-08-12 turned `2026-08-12`
  // into `2026-08-11`. The old comparison aligned every dot/plus/dash segment positionally,
  // so it read a pin year against a build counter (every release newer forever, seen on
  // 0.25.1.1+004, 2026-08-02) and, once both sides carried pins, let the stale `+006`
  // release beat the running `+010` on that reversed pin date alone (2026-08-12).
  const a = forkVersionOrder(versionA)
  const b = forkVersionOrder(versionB)
  // missing segments count as 0, so `0.24.1.1` does not beat `0.25.1` by having more of them
  const length = Math.max(a.version.length, b.version.length)
  for (let i = 0; i < length; i++) {
    const segmentA = a.version[i] ?? 0
    const segmentB = b.version[i] ?? 0
    if (segmentA !== segmentB) { return segmentA > segmentB }
  }
  return a.counter > b.counter
}
