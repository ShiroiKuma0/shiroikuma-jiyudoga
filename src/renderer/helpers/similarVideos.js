// Discovery of "similar" videos for the Similar subscriptions tab.
//
// Seeds are the profile's starred videos plus the newest videos already present
// in the subscription video cache (no extra requests needed to pick them). For
// every seed we fetch YouTube's "watch next" recommendations and keep only videos
// from channels the profile is not subscribed to, giving a feed of related content
// from potential new channels.
//
// Every candidate remembers which seeds produced it: the number of distinct seeds
// is the relevance signal the tab ranks by, and the seed channels are what the
// "stop seeding from this channel" action acts on.

import { getLocalVideoRecommendations } from './api/local'
import { invidiousGetVideoInformation } from './api/invidious'

const MAX_SEEDS = 20
const MAX_SEEDS_PER_CHANNEL = 2
const MAX_CONCURRENT_REQUESTS = 6

// How many of the seeds are reserved for starred videos — the profile's only
// explicit "more of this" signal, so it is worth a fixed share of the budget
const MAX_STARRED_SEEDS = 6

// Session caches (cleared on app restart)
// seed videoId -> recommendation array
const seedRecommendationsCache = new Map()
// profileId -> { videos: array, timestamp: number }
const profileResultsCache = new Map()

/**
 * @typedef {{ videoId: string, authorId: string, author: string }} SimilarSeed
 */

/**
 * Picks the recommendation seeds: the newest starred videos first (up to their
 * quota), then the newest cached subscription videos, capped per channel so
 * prolific channels don't dominate the results and skipping the channels that
 * have been told to stop seeding.
 * @param {{ videos: any[] }[]} cacheEntries video cache entries of the active profile's channels
 * @param {{ starredVideos?: any[], blockedSeedChannelIds?: Set<string> }} [options]
 * @returns {SimilarSeed[]} seeds, starred first, then newest first
 */
export function pickSimilarSeeds(cacheEntries, options = {}) {
  const { starredVideos = [], blockedSeedChannelIds = new Set() } = options

  const perChannel = new Map()
  const seeds = []
  const seenVideoIds = new Set()

  /**
   * @param {any} video
   */
  function addSeed(video) {
    if (!video.videoId || seenVideoIds.has(video.videoId)) { return false }
    if (blockedSeedChannelIds.has(video.authorId)) { return false }

    const channelCount = perChannel.get(video.authorId) ?? 0
    if (channelCount >= MAX_SEEDS_PER_CHANNEL) { return false }

    perChannel.set(video.authorId, channelCount + 1)
    seenVideoIds.add(video.videoId)
    seeds.push({ videoId: video.videoId, authorId: video.authorId, author: video.author })

    return true
  }

  const starred = [...starredVideos]
    .filter(video => !video.liveNow && !video.isUpcoming)
    .sort((a, b) => (b.timeStarred ?? 0) - (a.timeStarred ?? 0))

  for (const video of starred) {
    if (seeds.length >= MAX_STARRED_SEEDS) { break }

    addSeed(video)
  }

  const cachedVideos = cacheEntries
    .flatMap(cacheEntry => cacheEntry.videos ?? [])
    .filter(video => video.videoId && typeof video.published === 'number' && !video.liveNow && !video.isUpcoming)
    .sort((a, b) => b.published - a.published)

  for (const video of cachedVideos) {
    if (seeds.length >= MAX_SEEDS) { break }

    addSeed(video)
  }

  return seeds
}

/**
 * @param {string} videoId
 */
async function getInvidiousVideoRecommendations(videoId) {
  const result = await invidiousGetVideoInformation(videoId)

  const recommendations = result?.recommendedVideos ?? []

  recommendations.forEach((video) => {
    video.type = 'video'

    // The recommended videos currently use yyyy-mm-ddThh:mm:ss for the published timestamp
    // whereas the rest of the API uses unix timestamps, correct that here
    if (typeof video.published === 'string') {
      video.published = Date.parse(video.published)
    }
  })

  return recommendations
}

/**
 * Fetches recommendations for one seed video, respecting the backend
 * preference and falling back to the other backend when allowed.
 * @param {string} videoId
 * @param {{ preferLocal: boolean, fallback: boolean }} backendOptions
 */
async function fetchRecommendationsForSeed(videoId, { preferLocal, fallback }) {
  const primary = preferLocal ? getLocalVideoRecommendations : getInvidiousVideoRecommendations
  const secondary = preferLocal ? getInvidiousVideoRecommendations : getLocalVideoRecommendations

  try {
    return await primary(videoId)
  } catch (error) {
    console.error(error)

    if (!fallback) { return [] }

    try {
      return await secondary(videoId)
    } catch (fallbackError) {
      console.error(fallbackError)
      return []
    }
  }
}

/**
 * Fetches the recommendations for all seeds with limited concurrency.
 * @param {SimilarSeed[]} seeds
 * @param {{ preferLocal: boolean, fallback: boolean, force: boolean }} options
 * @param {(completedCount: number) => void} [progressCallback]
 * @returns {Promise<any[][]>} one recommendation array per seed
 */
export async function fetchSimilarForSeeds(seeds, { preferLocal, fallback, force = false }, progressCallback) {
  const results = []
  let nextIndex = 0
  let completedCount = 0

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, seeds.length) }, async () => {
    while (nextIndex < seeds.length) {
      const index = nextIndex++
      const seedVideoId = seeds[index].videoId

      if (!force && seedRecommendationsCache.has(seedVideoId)) {
        results[index] = seedRecommendationsCache.get(seedVideoId)
      } else {
        const recommendations = await fetchRecommendationsForSeed(seedVideoId, { preferLocal, fallback })
        seedRecommendationsCache.set(seedVideoId, recommendations)
        results[index] = recommendations
      }

      completedCount++
      progressCallback?.(completedCount)
    }
  })

  await Promise.all(workers)

  return results
}

/**
 * Merges per-seed recommendations into one deduplicated list, dropping videos
 * from channels the profile is already subscribed to. Each entry keeps the seeds
 * that produced it (`similarSeeds`) and how many distinct seeds agreed on it
 * (`similarAgreement`), which is what the tab ranks by.
 *
 * The profile's blocklists are deliberately NOT applied here: filtering happens
 * downstream against the store, so blocking a channel or a video removes it from
 * the list immediately, without refetching anything.
 * @param {any[][]} recommendationsPerSeed
 * @param {SimilarSeed[]} seeds same order as `recommendationsPerSeed`
 * @param {Set<string>} subscribedChannelIds
 */
export function assembleSimilarVideoList(recommendationsPerSeed, seeds, subscribedChannelIds) {
  const byVideoId = new Map()

  recommendationsPerSeed.forEach((recommendations, index) => {
    const seed = seeds[index]

    for (const video of recommendations) {
      if (
        !video.videoId ||
        video.authorId == null ||
        typeof video.published !== 'number' ||
        isNaN(video.published) ||
        subscribedChannelIds.has(video.authorId)
      ) {
        continue
      }

      const existing = byVideoId.get(video.videoId)

      if (existing == null) {
        // copied, as the recommendation objects are shared with the seed cache
        byVideoId.set(video.videoId, { ...video, similarSeeds: [seed], similarAgreement: 1 })
      } else if (!existing.similarSeeds.some(existingSeed => existingSeed.videoId === seed.videoId)) {
        existing.similarSeeds.push(seed)
        existing.similarAgreement++
      }
    }
  })

  return Array.from(byVideoId.values())
}

/**
 * @param {string} profileId
 */
export function getCachedSimilarResults(profileId) {
  return profileResultsCache.get(profileId) ?? null
}

/**
 * @param {string} profileId
 * @param {any[]} videos
 */
export function cacheSimilarResults(profileId, videos) {
  profileResultsCache.set(profileId, { videos, timestamp: Date.now() })
}
