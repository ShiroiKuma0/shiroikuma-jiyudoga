// Discovery of "similar" videos for the Similar subscriptions tab.
//
// Seeds are the newest videos already present in the subscription video cache
// for the active profile (no extra requests needed to pick them). For every
// seed we fetch YouTube's "watch next" recommendations and keep only videos
// from channels the profile is not subscribed to, giving a date-ordered feed
// of related content from potential new channels.

import { getLocalVideoRecommendations } from './api/local'
import { invidiousGetVideoInformation } from './api/invidious'

const MAX_SEEDS = 20
const MAX_SEEDS_PER_CHANNEL = 2
const MAX_CONCURRENT_REQUESTS = 6

// Session caches (cleared on app restart)
// seed videoId -> recommendation array
const seedRecommendationsCache = new Map()
// profileId -> { videos: array, timestamp: number }
const profileResultsCache = new Map()

/**
 * Picks the newest cached subscription videos as recommendation seeds,
 * capped per channel so prolific channels don't dominate the results.
 * @param {{ videos: any[] }[]} cacheEntries video cache entries of the active profile's channels
 * @returns {string[]} seed video ids, newest first
 */
export function pickSimilarSeeds(cacheEntries) {
  const videos = cacheEntries
    .flatMap(cacheEntry => cacheEntry.videos ?? [])
    .filter(video => video.videoId && typeof video.published === 'number' && !video.liveNow && !video.isUpcoming)
    .sort((a, b) => b.published - a.published)

  const perChannel = new Map()
  const seeds = []

  for (const video of videos) {
    const channelCount = perChannel.get(video.authorId) ?? 0
    if (channelCount >= MAX_SEEDS_PER_CHANNEL) { continue }

    perChannel.set(video.authorId, channelCount + 1)
    seeds.push(video.videoId)

    if (seeds.length >= MAX_SEEDS) { break }
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
 * @param {string[]} seeds
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
      const seed = seeds[index]

      if (!force && seedRecommendationsCache.has(seed)) {
        results[index] = seedRecommendationsCache.get(seed)
      } else {
        const recommendations = await fetchRecommendationsForSeed(seed, { preferLocal, fallback })
        seedRecommendationsCache.set(seed, recommendations)
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
 * from channels the profile is already subscribed to.
 * @param {any[][]} recommendationsPerSeed
 * @param {Set<string>} subscribedChannelIds
 */
export function assembleSimilarVideoList(recommendationsPerSeed, subscribedChannelIds) {
  const byVideoId = new Map()

  for (const recommendations of recommendationsPerSeed) {
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

      if (!byVideoId.has(video.videoId)) {
        byVideoId.set(video.videoId, video)
      }
    }
  }

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
