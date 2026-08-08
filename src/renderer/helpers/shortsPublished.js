import { parseYouTubeRSSFeed } from './subscriptions'
import { getChannelPlaylistId } from './utils'
import { invidiousFetch } from './api/invidious'

/**
 * Fork (白い熊 自由動画): publication dates for a channel page's Shorts tab.
 *
 * Neither backend gives the shorts shelf a date — the local API's `ShortsLockupView` carries
 * none (see `parseShort` in api/local.js), and Invidious's is wrong often enough that
 * `getInvidiousChannelShorts` deletes it outright (iv-org/invidious#3801). So a channel's
 * Shorts tab showed view counts alone, while its Videos tab showed "2 days ago".
 *
 * The channel's shorts *feed* does carry a date per entry, and it is the very feed the
 * Subscriptions → Shorts tab already reads, so the two tabs end up quoting one source. It
 * covers the newest ~15 shorts; anything older simply keeps no date, which the tile already
 * renders by leaving the line out.
 *
 * The feed is fetched from the same place the rest of the page is: youtube.com on the local
 * API, the instance's own feed proxy on Invidious — never the other way round.
 */

/**
 * Per channel+sort, for the session: the tab is left and re-entered often, and the dates
 * cannot go stale in a way that matters (a short's publication date never changes).
 * @type {Map<string, Map<string, number>>}
 */
const dateCache = new Map()

/**
 * @param {string} channelId
 * @param {string} sortBy
 */
function cacheKey(channelId, sortBy) {
  return `${channelId}:${sortBy === 'popular' ? 'popular' : 'newest'}`
}

/**
 * What is already known, without touching the network — for continuations, which are older
 * than the feed window anyway and must not cost a request each.
 * @param {string} channelId
 * @param {string} sortBy
 * @returns {Map<string, number>}
 */
export function cachedShortsPublishedDates(channelId, sortBy) {
  return dateCache.get(cacheKey(channelId, sortBy)) ?? new Map()
}

/**
 * @param {string} channelId
 * @param {string} sortBy 'newest' | 'popular' | 'oldest' — 'popular' has its own feed, the
 *        others read the newest one
 * @param {string} [invidiousInstanceUrl] set when the page is being served by Invidious, so
 *        the feed is fetched through the instance instead of from youtube.com
 * @returns {Promise<Map<string, number>>} videoId → published, empty when nothing could be read
 */
export async function fetchShortsPublishedDates(channelId, sortBy, invidiousInstanceUrl) {
  const key = cacheKey(channelId, sortBy)
  const cached = dateCache.get(key)

  if (cached != null) { return cached }

  const dates = new Map()

  try {
    const playlistId = getChannelPlaylistId(channelId, 'shorts', sortBy)

    const response = invidiousInstanceUrl
      ? await invidiousFetch(`${invidiousInstanceUrl}/feed/playlist/${playlistId}`)
      : await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`)

    if (response.ok) {
      const { videos } = await parseYouTubeRSSFeed(await response.text(), channelId)

      for (const video of videos) {
        if (typeof video.published === 'number' && !isNaN(video.published)) {
          dates.set(video.videoId, video.published)
        }
      }
    }
  } catch (error) {
    // A date is a nicety: a channel without a shorts feed, an offline moment or an instance
    // that does not proxy feeds must all leave the tab exactly as it was before.
    console.error(error)
  }

  dateCache.set(key, dates)

  return dates
}

/**
 * @param {object[]} shorts
 * @param {Map<string, number>} dates
 * @returns {object[]} the same shorts, with `published` filled in where a date was found
 */
export function withShortsPublishedDates(shorts, dates) {
  if (dates.size === 0) { return shorts }

  return shorts.map((short) => {
    const published = dates.get(short.videoId)

    return published == null ? short : { ...short, published }
  })
}
