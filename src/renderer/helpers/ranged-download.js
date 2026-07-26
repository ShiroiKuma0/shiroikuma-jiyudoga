// Chunked ranged download of a googlevideo stream.
//
// The chunking is not optional: googlevideo throttles a single long GET down to
// roughly playback speed, so a whole-file request crawls. Requesting bounded
// ranges keeps each response short enough to be served at full rate. Servers
// that ignore the Range header are detected and read as one stream instead.
//
// Shared by the study export and the download button.

const DOWNLOAD_CHUNK_BYTES = 9 * 1024 * 1024

/**
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.maxBytes] refuse anything larger; the whole file
 *   passes through renderer memory on its way to the muxer
 * @param {(received: number, total: number) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {() => Error} [options.tooLargeError] thrown when maxBytes is exceeded
 * @returns {Promise<Blob>}
 */
export async function fetchRangedBlob(url, { maxBytes = Infinity, onProgress, signal, tooLargeError } = {}) {
  const chunks = []
  let received = 0
  let totalBytes = -1
  let singleRequest = false

  const tooLarge = () => tooLargeError?.() ?? new Error('stream is too large to download')

  while (totalBytes < 0 || received < totalBytes) {
    const headers = {}
    if (!singleRequest) {
      headers.Range = `bytes=${received}-${received + DOWNLOAD_CHUNK_BYTES - 1}`
    }

    const response = await fetch(url, { headers, signal })

    if (response.status === 200) {
      // server ignored the Range header — one long response
      singleRequest = true
    } else if (response.status !== 206) {
      throw new Error(`HTTP ${response.status} while downloading`)
    }

    if (totalBytes < 0) {
      if (response.status === 206) {
        const contentRange = response.headers.get('Content-Range')
        totalBytes = Number(contentRange?.split('/')[1]) || -2
      } else {
        totalBytes = Number(response.headers.get('Content-Length')) || -2
      }

      if (totalBytes > maxBytes) {
        throw tooLarge()
      }
    }

    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) { break }
      chunks.push(value)
      received += value.byteLength
      if (received > maxBytes) {
        throw tooLarge()
      }
      onProgress?.(received, totalBytes)
    }

    if (singleRequest || totalBytes === -2) { break }
  }

  if (received === 0) {
    throw new Error('downloaded 0 bytes')
  }

  return new Blob(chunks)
}
