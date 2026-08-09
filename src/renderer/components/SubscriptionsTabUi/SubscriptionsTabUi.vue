<template>
  <div>
    <FtLoader
      v-if="isLoading"
    />
    <div
      v-if="!isLoading && errorChannels.length !== 0"
    >
      <h3> {{ $t("Subscriptions.Error Channels") }}</h3>
      <FtFlexBox>
        <FtChannelBubble
          v-for="channel in errorChannels"
          :key="channel.id"
          :channel-name="channel.name"
          :channel-id="channel.id"
          :channel-thumbnail="channel.thumbnail"
        />
      </FtFlexBox>
    </div>
    <FtFlexBox
      v-if="!isLoading && activeVideoList.length === 0"
    >
      <p
        v-if="!activeProfileHasSubscriptions"
        class="message"
      >
        {{ $t("Subscriptions['Your Subscription list is currently empty. Start adding subscriptions to see them here.']") }}
      </p>
      <p
        v-else-if="!fetchSubscriptionsAutomatically && !attemptedFetch"
        class="message"
      >
        {{ $t("Subscriptions.Disabled Automatic Fetching") }}
      </p>
      <p
        v-else
        class="message"
      >
        {{ isCommunity ? $t("Subscriptions.Empty Posts") : $t("Subscriptions.Empty Channels") }}
      </p>
    </FtFlexBox>
    <FtElementList
      v-if="!isLoading && activeVideoList.length > 0"
      :data="activeVideoList"
      :use-channels-hidden-preference="false"
      :display="isCommunity ? 'list' : ''"
    />
    <FtAutoLoadNextPageWrapper
      v-if="!isLoading && videoList.length > dataLimit"
      @load-next-page="increaseLimit"
    >
      <FtFlexBox>
        <FtButton
          :label="isCommunity ? $t('Subscriptions.Load More Posts') : $t('Subscriptions.Load More Videos')"
          background-color="var(--primary-color)"
          text-color="var(--text-with-main-color)"
          @click="increaseLimit"
        />
      </FtFlexBox>
    </FtAutoLoadNextPageWrapper>

    <FtRefreshWidget
      :disable-refresh="isLoading || !activeProfileHasSubscriptions"
      :last-refresh-timestamp="lastRefreshTimestamp"
      :title="title"
      @click="refresh"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import FtAutoLoadNextPageWrapper from '../FtAutoLoadNextPageWrapper.vue'
import FtButton from '../FtButton/FtButton.vue'
import FtChannelBubble from '../FtChannelBubble/FtChannelBubble.vue'
import FtElementList from '../FtElementList/FtElementList.vue'
import FtFlexBox from '../ft-flex-box/ft-flex-box.vue'
import FtLoader from '../FtLoader/FtLoader.vue'
import FtRefreshWidget from '../FtRefreshWidget/FtRefreshWidget.vue'

import store from '../../store/index'

import { isUpcomingVideo } from '../../helpers/feedFilter'
import { KeyboardShortcuts } from '../../../constants'

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  },
  videoList: {
    type: Array,
    default: () => []
  },
  isCommunity: {
    type: Boolean,
    default: false
  },
  errorChannels: {
    type: Array,
    default: () => []
  },
  attemptedFetch: {
    type: Boolean,
    default: false
  },
  initialDataLimit: {
    type: Number,
    default: 100
  },
  lastRefreshTimestamp: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['refresh'])

const subscriptionLimit = sessionStorage.getItem('subscriptionLimit')

const dataLimit = ref(subscriptionLimit !== null ? parseInt(subscriptionLimit) : props.initialDataLimit)

const activeVideoList = computed(() => {
  if (filteredVideoList.value.length < dataLimit.value) {
    return filteredVideoList.value
  } else {
    return filteredVideoList.value.slice(0, dataLimit.value)
  }
})

// What the feed filter leaves to show — the active profile's own subscriptions when no
// filter is applied, so the empty state reads correctly either way
const activeProfileHasSubscriptions = computed(() => {
  return store.getters.getFeedSubscriptions.length > 0
})

/** @type {import('vue').ComputedRef<boolean>} */
const fetchSubscriptionsAutomatically = computed(() => {
  return store.getters.getFetchSubscriptionsAutomatically
})

const historyCacheById = computed(() => {
  return store.getters.getHistoryCacheById
})

const hideWatchedSubs = computed(() => {
  return store.getters.getHideWatchedSubs
})

const onlyShowLatestFromChannel = computed(() => {
  return store.getters.getOnlyShowLatestFromChannel
})

const onlyShowLatestFromChannelNumber = computed(() => {
  return store.getters.getOnlyShowLatestFromChannelNumber
})

// Per-channel caps from the feed filter: a group marked "cap N" stays in the feed but
// contributes at most its N newest videos per channel
/** @type {import('vue').ComputedRef<Map<string, number>>} */
const feedChannelCaps = computed(() => {
  return store.getters.getFeedChannelCaps
})

// The feed filter's other rule: drop what has not premiered yet
/** @type {import('vue').ComputedRef<boolean>} */
const feedHideUpcoming = computed(() => {
  return store.getters.getFeedHideUpcoming
})

const filteredVideoList = computed(() => {
  if (props.isCommunity) {
    return props.videoList
  }

  let videoList = props.videoList

  if (hideWatchedSubs.value) {
    videoList = videoList.filter((video) => {
      return historyCacheById.value[video.videoId] === undefined
    })
  }

  if (feedHideUpcoming.value) {
    // before the caps, so a capped channel spends its quota on watchable videos
    videoList = videoList.filter((video) => !isUpcomingVideo(video))
  }

  const globalLimit = onlyShowLatestFromChannel.value ? onlyShowLatestFromChannelNumber.value : Infinity
  const caps = feedChannelCaps.value

  if (globalLimit !== Infinity || caps.size > 0) {
    // The list arrives newest first, so counting down the list keeps the newest N
    const shownPerAuthor = new Map()

    videoList = videoList.filter((video) => {
      if (!video.authorId) {
        return true
      }

      // the tighter of the two limits wins; a channel under neither is unlimited
      const limit = Math.min(globalLimit, caps.get(video.authorId) ?? Infinity)

      if (limit === Infinity) {
        return true
      }

      const shown = shownPerAuthor.get(video.authorId) ?? 0

      if (shown >= limit) {
        return false
      }

      shownPerAuthor.set(video.authorId, shown + 1)
      return true
    })
  }

  return videoList
})

function increaseLimit() {
  dataLimit.value += props.initialDataLimit
  sessionStorage.setItem('subscriptionLimit', dataLimit.value.toFixed(0))
}

// Switching the profile or the filter pill hands the tab a different feed, so the extra
// pages loaded into the old one mean nothing: paging starts over. The stored limit goes
// with them, or opening another tab would restore it. (The view scrolls itself back to the
// top — that belongs to the page, not to one tab of it.)
watch(() => store.getters.getFeedViewKey, () => {
  dataLimit.value = props.initialDataLimit
  sessionStorage.removeItem('subscriptionLimit')
})

/**
 * @param {KeyboardEvent} event
 */
function keyboardShortcutHandler(event) {
  if (document.activeElement.classList.contains('ft-input')) {
    return
  }
  // Avoid handling events due to user holding a key (not released)
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat
  if (event.repeat) { return }

  switch (event.key.toLowerCase()) {
    case 'f5':
    case KeyboardShortcuts.APP.SITUATIONAL.REFRESH:
      if (!props.isLoading && activeProfileHasSubscriptions.value) {
        refresh()
      }
      break
  }
}

onMounted(() => {
  document.addEventListener('keydown', keyboardShortcutHandler)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboardShortcutHandler)
})

function refresh() {
  emit('refresh')
}
</script>

<style scoped src="./SubscriptionsTabUi.css" />
