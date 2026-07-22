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
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SubscriptionsTabUi from './SubscriptionsTabUi/SubscriptionsTabUi.vue'

import store from '../store/index'

import { getRelativeTimeFromDate } from '../helpers/utils'
import {
  assembleSimilarVideoList,
  cacheSimilarResults,
  fetchSimilarForSeeds,
  getCachedSimilarResults,
  pickSimilarSeeds
} from '../helpers/similarVideos'
import { updateVideoListAfterProcessing } from '../helpers/subscriptions'

const { t } = useI18n()

const isLoading = ref(true)
const videoList = shallowRef([])
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

const seeds = computed(() => pickSimilarSeeds(cacheEntriesForAllActiveProfileChannels.value))

// Seeds come from the subscription video cache, so the Videos tab has to have
// been loaded at least once before similar videos can be discovered
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

function loadSimilarSometimes() {
  // Can only pick seeds reliably when the cache is ready
  if (!subscriptionCacheReady.value) { return }

  const cached = getCachedSimilarResults(activeProfileId.value)

  if (cached !== null) {
    videoList.value = cached.videos
    lastRefreshSuccessTimestamp.value = cached.timestamp
    attemptedFetch.value = true
    isLoading.value = false
    return
  }

  if (fetchSubscriptionsAutomatically.value && seeds.value.length > 0) {
    loadSimilarFromRemote()
    return
  }

  videoList.value = []
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
    videoList.value = []
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
  const assembled = assembleSimilarVideoList(recommendationsPerSeed, subscribedChannelIds)

  videoList.value = updateVideoListAfterProcessing(assembled)
  cacheSimilarResults(profileId, videoList.value)
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
