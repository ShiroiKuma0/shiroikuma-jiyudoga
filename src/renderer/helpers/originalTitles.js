// YouTube auto-translates video titles server-side based on the request's UI language
// (hl) and offers no per-request opt-out, so list endpoints (search, browse, next)
// return e.g. Japanese and Russian titles translated into English. The oEmbed endpoint
// is the only lightweight public surface that always returns the untranslated original
// title, so video tiles resolve their titles through here (cached, concurrency-limited).

const cache = new Map()

const MAX_CONCURRENT_REQUESTS = 6
let activeRequests = 0
const pendingRequests = []

function processQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && pendingRequests.length > 0) {
    activeRequests++
    const run = pendingRequests.shift()
    run()
  }
}

async function fetchOriginalTitle(videoId) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`

  const response = await fetch(url)
  if (!response.ok) {
    // embedding disabled, deleted, private or unpublished video — no original title available
    return null
  }

  const title = (await response.json()).title?.trim()
  return title || null
}

/**
 * Resolves the original (untranslated) title of a video via YouTube's oEmbed endpoint.
 * Results are cached for the session; failed network attempts are retried on the next call.
 * @param {string} videoId
 * @returns {Promise<string | null>} the original title, or null if it could not be determined
 */
export function getOriginalTitle(videoId) {
  if (!videoId || typeof videoId !== 'string') {
    return Promise.resolve(null)
  }

  if (cache.has(videoId)) {
    return cache.get(videoId)
  }

  if (cache.size >= 10_000) {
    cache.clear()
  }

  const promise = new Promise((resolve) => {
    pendingRequests.push(() => {
      fetchOriginalTitle(videoId)
        .catch(() => {
          // network failure — allow a later attempt
          cache.delete(videoId)
          return null
        })
        .then((title) => {
          activeRequests--
          processQueue()
          resolve(title)
        })
    })
    processQueue()
  })

  cache.set(videoId, promise)
  return promise
}
