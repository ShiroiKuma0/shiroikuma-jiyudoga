<template>
  <div>
    <FtCard class="card">
      <h2>
        <FontAwesomeIcon
          :icon="['fas', 'rss']"
          class="subscriptionIcon"
        />
        {{ $t("Subscriptions.Subscriptions") }}
        <SkuiGridControls />
      </h2>
      <FtFlexBox
        class="tabs"
        role="tablist"
        :aria-label="$t('Subscriptions.Subscriptions Tabs')"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsVideos"
          ref="videosTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'videos'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'videos' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'videos' }"
          @click="changeTab('videos')"
          @keydown.space.enter.prevent="changeTab('videos')"
          @keydown.left.right="focusTab($event, 'videos')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'video']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Videos") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsShorts"
          ref="shortsTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'shorts'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'shorts' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'shorts' }"
          @click="changeTab('shorts')"
          @keydown.space.enter.prevent="changeTab('shorts')"
          @keydown.left.right="focusTab($event, 'shorts')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'clapperboard']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Shorts") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          ref="similarTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'similar'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'similar' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'similar' }"
          @click="changeTab('similar')"
          @keydown.space.enter.prevent="changeTab('similar')"
          @keydown.left.right="focusTab($event, 'similar')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'compass']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Similar") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          ref="starredTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'starred'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'starred' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'starred' }"
          @click="changeTab('starred')"
          @keydown.space.enter.prevent="changeTab('starred')"
          @keydown.left.right="focusTab($event, 'starred')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'star']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Starred") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="!hideSubscriptionsLive"
          ref="liveTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'live'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'live' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'live' }"
          @click="changeTab('live')"
          @keydown.space.enter.prevent="changeTab('live')"
          @keydown.left.right="focusTab($event, 'live')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'tower-broadcast']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Live") }}
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
        <div
          v-if="visibleTabs.includes('community')"
          ref="communityTab"
          class="tab"
          role="tab"
          :aria-selected="currentTab === 'community'"
          aria-controls="subscriptionsPanel"
          :tabindex="currentTab === 'community' ? 0 : -1"
          :class="{ selectedTab: currentTab === 'community' }"
          @click="changeTab('community')"
          @keydown.space.enter.prevent="changeTab('community')"
          @keydown.left.right="focusTab($event, 'community')"
        >
          <FontAwesomeIcon
            :icon="['fa', 'message']"
            class="subscriptionIcon"
          />
          {{ $t("Global.Posts") }}
        </div>
      </FtFlexBox>
      <SubscriptionsVideos
        v-if="currentTab === 'videos'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsShorts
        v-else-if="currentTab === 'shorts'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsSimilar
        v-else-if="currentTab === 'similar'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsStarred
        v-else-if="currentTab === 'starred'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsLive
        v-else-if="currentTab === 'live'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <SubscriptionsPosts
        v-else-if="currentTab === 'community'"
        id="subscriptionsPanel"
        role="tabpanel"
      />
      <p v-else>
        {{ $t("Subscriptions.All Subscription Tabs Hidden", {
          subsection: $t('Settings.Distraction Free Settings.Sections.Subscriptions Page'),
          settingsSection: $t('Settings.Distraction Free Settings.Distraction Free Settings')
        }) }}
      </p>
    </FtCard>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, ref, useTemplateRef, watch } from 'vue'

import FtCard from '../../components/ft-card/ft-card.vue'
import FtFlexBox from '../../components/ft-flex-box/ft-flex-box.vue'
import SkuiGridControls from '../../components/SkuiGridControls.vue'
import SubscriptionsVideos from '../../components/SubscriptionsVideos.vue'
import SubscriptionsLive from '../../components/SubscriptionsLive.vue'
import SubscriptionsShorts from '../../components/SubscriptionsShorts.vue'
import SubscriptionsSimilar from '../../components/SubscriptionsSimilar.vue'
import SubscriptionsStarred from '../../components/SubscriptionsStarred.vue'
import SubscriptionsPosts from '../../components/SubscriptionsPosts.vue'

import store from '../../store/index'

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsVideos = computed(() => {
  return store.getters.getHideSubscriptionsVideos
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsShorts = computed(() => {
  return store.getters.getHideSubscriptionsShorts
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsLive = computed(() => {
  return store.getters.getHideLiveStreams || store.getters.getHideSubscriptionsLive
})

/** @type {import('vue').ComputedRef<boolean>} */
const hideSubscriptionsCommunity = computed(() => {
  return store.getters.getHideSubscriptionsCommunity
})

/** @type {import('vue').ComputedRef<boolean>} */
const useRssFeeds = computed(() => {
  return store.getters.getUseRssFeeds
})

/** @type {import('vue').Ref<'videos' | 'shorts' | 'similar' | 'starred' | 'live' | 'community' | null>} */
const currentTab = ref('videos')

// A profile or a filter pill picked from the top bar replaces the feed under the reader, so
// the scroll position inside the old one is meaningless — every tab starts at the top of
// the new feed. Scoped to this view on purpose: the pills are in the top bar everywhere,
// and applying one while watching a video must not yank that page around.
watch(() => store.getters.getFeedViewKey, () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
})

watch(currentTab, (value) => {
  if (value !== null) {
  // Save last used tab, restore when view mounted again
    sessionStorage.setItem('Subscriptions/currentTab', value)
  } else {
    sessionStorage.removeItem('Subscriptions/currentTab')
  }
})

const visibleTabs = computed(() => {
  /** @type {('videos' | 'shorts' | 'similar' | 'starred' | 'live' | 'community')[]} */
  const tabs = []

  if (!hideSubscriptionsVideos.value) {
    tabs.push('videos')
  }

  if (!hideSubscriptionsShorts.value) {
    tabs.push('shorts')
  }

  tabs.push('similar', 'starred')

  if (!hideSubscriptionsLive.value) {
    tabs.push('live')
  }

  // community does not support rss
  if (!hideSubscriptionsCommunity.value && !useRssFeeds.value) {
    tabs.push('community')
  }

  return tabs
})

watch(visibleTabs, (value) => {
  if (value.length === 0) {
    currentTab.value = null
  } else if (!value.includes(currentTab.value)) {
    currentTab.value = value[0]
  }
})

if (visibleTabs.value.length === 0) {
  currentTab.value = null
} else {
  // Restore currentTab
  const lastCurrentTabId = sessionStorage.getItem('Subscriptions/currentTab')
  if (lastCurrentTabId !== null) {
    changeTab(lastCurrentTabId)
  } else if (!visibleTabs.value.includes(currentTab.value)) {
    currentTab.value = visibleTabs.value[0]
  }
}

/**
 * @param {'videos' | 'shorts' | 'similar' | 'starred' | 'live' | 'community'} tab
 */
function changeTab(tab) {
  if (tab === currentTab.value) {
    return
  }

  if (visibleTabs.value.includes(tab)) {
    currentTab.value = tab
  } else {
    // First visible tab or no tab
    currentTab.value = visibleTabs.value.length > 0 ? visibleTabs.value[0] : null
  }
}

const videosTab = useTemplateRef('videosTab')
const liveTab = useTemplateRef('liveTab')
const shortsTab = useTemplateRef('shortsTab')
const similarTab = useTemplateRef('similarTab')
const starredTab = useTemplateRef('starredTab')
const communityTab = useTemplateRef('communityTab')

/**
 * @param {KeyboardEvent} event
 * @param {'videos' | 'shorts' | 'similar' | 'starred' | 'live' | 'community'} focusedTab
 */
function focusTab(event, focusedTab) {
  if (event.altKey) {
    return
  }

  event.preventDefault()

  const visibleTabsCached = visibleTabs.value

  if (visibleTabsCached.length === 1) {
    store.commit('setOutlinesHidden', false)
    return
  }

  let index = visibleTabsCached.indexOf(focusedTab)

  if (event.key === 'ArrowLeft') {
    index--
  } else {
    index++
  }

  if (index < 0) {
    index = visibleTabsCached.length - 1
  } else if (index > visibleTabsCached.length - 1) {
    index = 0
  }

  switch (visibleTabsCached[index]) {
    case 'videos':
      videosTab.value?.focus()
      break
    case 'live':
      liveTab.value?.focus()
      break
    case 'shorts':
      shortsTab.value?.focus()
      break
    case 'similar':
      similarTab.value?.focus()
      break
    case 'starred':
      starredTab.value?.focus()
      break
    case 'community':
      communityTab.value?.focus()
      break
  }

  store.commit('setOutlinesHidden', false)
}
</script>

<style scoped src="./Subscriptions.css" />
