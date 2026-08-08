<template>
  <SubscriptionsTabUi
    v-if="!showSeedHint"
    :is-loading="isLoading"
    :video-list="videoList"
    :last-refresh-timestamp="lastRefreshTimestamp"
    :attempted-fetch="attemptedFetch"
    :title="t('Global.Similar')"
    @refresh="loadSimilarFromRemote(true)"
  />
  <p
    v-else
    class="seedHint"
  >
    {{ t('Subscriptions.Similar Needs Videos') }}
  </p>
</template>

<script setup>
import { computed, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SubscriptionsTabUi from './SubscriptionsTabUi/SubscriptionsTabUi.vue'

import store from '../store/index'

import { getRelativeTimeFromDate, showToast } from '../helpers/utils'
import {
  assembleSimilarVideoList,
  cacheSimilarResults,
  fetchSimilarForSeeds,
  getCachedSimilarResults,
  pickSimilarSeeds
} from '../helpers/similarVideos'
import {
  extractTerms,
  matchNegativeTerms,
  negativeTermMap,
  shouldHideForTerms
} from '../helpers/similarTerms'
import { updateVideoListAfterProcessing } from '../helpers/subscriptions'

const { t } = useI18n()

const UNDO_TOAST_MS = 10000

const isLoading = ref(true)
// everything the seeds turned up, before the profile's blocklists are applied
const rawCandidates = shallowRef([])
const attemptedFetch = ref(false)
/** @type {import('vue').Ref<number | null>} */
const lastRefreshSuccessTimestamp = ref(null)

/** @type {import('vue').ComputedRef<'local' | 'invidious'>} */
const backendPreference = computed(() => store.getters.getBackendPreference)

/** @type {import('vue').ComputedRef<boolean>} */
const backendFallback = computed(() => store.getters.getBackendFallback)

/** @type {import('vue').ComputedRef<boolean>} */
const subscriptionCacheReady = computed(() => store.getters.getSubscriptionCacheReady)

/** @type {import('vue').ComputedRef<boolean>} */
const fetchSubscriptionsAutomatically = computed(() => store.getters.getFetchSubscriptionsAutomatically)

const activeProfileId = computed(() => store.getters.getActiveProfile._id)

const activeSubscriptionList = computed(() => store.getters.getActiveProfile.subscriptions)

/** @type {import('vue').ComputedRef<Set<string>>} */
const blockedChannelIds = computed(() => store.getters.getSimilarBlockedChannelIdSet)

/** @type {import('vue').ComputedRef<Set<string>>} */
const blockedVideoIds = computed(() => store.getters.getSimilarBlockedVideoIdSet)

/** @type {import('vue').ComputedRef<Set<string>>} */
const blockedSeedChannelIds = computed(() => store.getters.getSimilarBlockedSeedChannelIdSet)

const negativeTerms = computed(() => negativeTermMap(store.getters.getSimilarNegativeTerms))

/** @type {import('vue').ComputedRef<string>} */
const similarSort = computed(() => store.getters.getSkuiSimilarSort)

/** @type {import('vue').ComputedRef<number>} */
const minAgreement = computed(() => store.getters.getSkuiSimilarMinAgreement)

const cacheEntriesForAllActiveProfileChannels = computed(() => {
  const videoCache = store.getters.getVideoCache
  const entries = []

  activeSubscriptionList.value.forEach((channel) => {
    const cacheEntry = videoCache[channel.id]

    if (cacheEntry != null) {
      entries.push(cacheEntry)
    }
  })

  return entries
})

const seeds = computed(() => {
  return pickSimilarSeeds(cacheEntriesForAllActiveProfileChannels.value, {
    starredVideos: store.getters.getActiveProfileStarredVideos,
    blockedSeedChannelIds: blockedSeedChannelIds.value
  })
})

// Applied against the store rather than baked into the fetched list, so blocking
// a channel or a video removes it from the tab straight away
const videoList = computed(() => {
  const terms = negativeTerms.value

  const filtered = rawCandidates.value.filter((video) => {
    if (blockedChannelIds.value.has(video.authorId) || blockedVideoIds.value.has(video.videoId)) {
      return false
    }

    if ((video.similarAgreement ?? 1) < minAgreement.value) {
      return false
    }

    // A blocked seed channel stops seeding on the next refresh, but its existing
    // suggestions have to go now — except where another seed also vouches for them
    const videoSeeds = video.similarSeeds ?? []

    if (videoSeeds.length > 0 && videoSeeds.every(seed => blockedSeedChannelIds.value.has(seed.authorId))) {
      return false
    }

    if (terms.size > 0 && shouldHideForTerms(matchNegativeTerms(similarTermsOf(video), terms))) {
      return false
    }

    return true
  })

  if (similarSort.value === 'newest') {
    return filtered.sort((a, b) => b.published - a.published)
  }

  return filtered.sort((a, b) => {
    return (b.similarAgreement ?? 1) - (a.similarAgreement ?? 1) || b.published - a.published
  })
})

// Seeds come from the starred videos and the subscription video cache, so the
// Videos tab has to have been loaded at least once before anything can be found
const showSeedHint = computed(() => {
  return !isLoading.value &&
    activeSubscriptionList.value.length > 0 &&
    seeds.value.length === 0
})

const lastRefreshTimestamp = computed(() => {
  if (lastRefreshSuccessTimestamp.value) {
    return getRelativeTimeFromDate(lastRefreshSuccessTimestamp.value, true)
  }

  return ''
})

watch(activeSubscriptionList, () => {
  lastRefreshSuccessTimestamp.value = null
  isLoading.value = true
  loadSimilarSometimes()
}, { deep: true })

if (!subscriptionCacheReady.value) {
  watch(subscriptionCacheReady, () => {
    loadSimilarSometimes()
  })
}

onMounted(() => {
  loadSimilarSometimes()
})

// Picked up by FtListVideo, which shows the block buttons and the provenance
// line only for tiles rendered inside this tab
provide('similarTabControls', {
  blockChannel,
  rejectVideo,
  blockSeedChannel
})

/**
 * Terms are cached on the candidate, as the filter reruns on every store change.
 * @param {any} video
 */
function similarTermsOf(video) {
  video.similarTerms ??= extractTerms(video.title, video.author)

  return video.similarTerms
}

/**
 * @param {any} video
 * @returns {{ id: string, name: string }[]} the channels of the seeds that produced it
 */
function seedChannelsOf(video) {
  const byId = new Map()

  for (const seed of video.similarSeeds ?? []) {
    if (seed.authorId != null && !byId.has(seed.authorId)) {
      byId.set(seed.authorId, { id: seed.authorId, name: seed.author ?? '' })
    }
  }

  return Array.from(byId.values())
}

/**
 * @param {any} video
 */
function blockChannel(video) {
  store.dispatch('blockSimilarChannel', { id: video.authorId, name: video.author })

  showToast(t('Subscriptions.Similar Channel Blocked', { channel: video.author }), UNDO_TOAST_MS, () => {
    store.dispatch('unblockSimilarChannel', video.authorId)
  })
}

/**
 * @param {any} video
 */
function rejectVideo(video) {
  store.dispatch('rejectSimilarVideo', {
    video: {
      videoId: video.videoId,
      title: video.title,
      author: video.author,
      authorId: video.authorId
    },
    seedChannels: seedChannelsOf(video)
  })

  showToast(t('Subscriptions.Similar Video Rejected'), UNDO_TOAST_MS, () => {
    store.dispatch('unrejectSimilarVideo', video.videoId)
  })
}

/**
 * @param {{ authorId: string, author: string }} seed
 */
function blockSeedChannel(seed) {
  store.dispatch('blockSimilarSeedChannel', { id: seed.authorId, name: seed.author })

  showToast(t('Subscriptions.Similar Seed Blocked', { channel: seed.author }), UNDO_TOAST_MS, () => {
    store.dispatch('clearSimilarSeedChannel', seed.authorId)
  })
}

function loadSimilarSometimes() {
  // Can only pick seeds reliably when the cache is ready
  if (!subscriptionCacheReady.value) { return }

  const cached = getCachedSimilarResults(activeProfileId.value)

  if (cached !== null) {
    rawCandidates.value = cached.videos
    lastRefreshSuccessTimestamp.value = cached.timestamp
    attemptedFetch.value = true
    isLoading.value = false
    return
  }

  if (fetchSubscriptionsAutomatically.value && seeds.value.length > 0) {
    loadSimilarFromRemote()
    return
  }

  rawCandidates.value = []
  attemptedFetch.value = false
  isLoading.value = false
}

/**
 * @param {boolean} force bypass the per-seed session cache (manual refresh)
 */
async function loadSimilarFromRemote(force = false) {
  const seedList = seeds.value
  const profileId = activeProfileId.value

  if (seedList.length === 0) {
    isLoading.value = false
    rawCandidates.value = []
    return
  }

  isLoading.value = true
  attemptedFetch.value = true

  store.commit('setShowProgressBar', true)
  store.commit('setProgressBarPercentage', 0)

  const preferLocal = !!process.env.SUPPORTS_LOCAL_API && backendPreference.value !== 'invidious'

  const recommendationsPerSeed = await fetchSimilarForSeeds(
    seedList,
    { preferLocal, fallback: backendFallback.value, force },
    (completedCount) => {
      store.commit('setProgressBarPercentage', (completedCount / seedList.length) * 100)
    }
  )

  const subscribedChannelIds = store.getters.getActiveProfileSubscribedChannelIdSet
  const assembled = assembleSimilarVideoList(recommendationsPerSeed, seedList, subscribedChannelIds)

  rawCandidates.value = updateVideoListAfterProcessing(assembled)
  cacheSimilarResults(profileId, rawCandidates.value)
  lastRefreshSuccessTimestamp.value = Date.now()
  isLoading.value = false
  store.commit('setShowProgressBar', false)
}
</script>

<style scoped>
.seedHint {
  text-align: center;
}
</style>
