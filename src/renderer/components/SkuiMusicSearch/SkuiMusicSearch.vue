<template>
  <FtCard class="card">
    <h2>
      <FontAwesomeIcon
        :icon="['fas', 'music']"
        class="headingIcon"
      />
      {{ t('SKUI.Music.Heading') }}
    </h2>
    <div
      class="chips"
      role="tablist"
    >
      <button
        class="chip"
        :class="{ selected: selectedChip === '' }"
        role="tab"
        :aria-selected="selectedChip === ''"
        @click="selectChip('')"
      >
        {{ t('SKUI.Music.All') }}
      </button>
      <button
        v-for="chip in chips"
        :key="chip.label"
        class="chip"
        :class="{ selected: selectedChip === chip.label }"
        role="tab"
        :aria-selected="selectedChip === chip.label"
        @click="selectChip(chip.label)"
      >
        {{ chipLabel(chip.label) }}
      </button>
    </div>
    <FtLoader v-if="isLoading" />
    <template v-else>
      <p
        v-if="sections.length === 0"
        class="message"
      >
        {{ t('SKUI.Music.No Results') }}
      </p>
      <section
        v-for="section in sections"
        :key="section.category"
        class="section"
      >
        <h3
          v-if="selectedChip === ''"
          class="sectionHeading"
        >
          <button
            v-if="chipFor(section.category)"
            class="sectionLink"
            @click="selectChip(chipFor(section.category).label)"
          >
            {{ categoryLabel(section.category) }}
            <FontAwesomeIcon :icon="['fas', 'chevron-right']" />
          </button>
          <template v-else>
            {{ categoryLabel(section.category) }}
          </template>
        </h3>
        <FtElementList :data="section.items" />
      </section>
      <FtAutoLoadNextPageWrapper
        v-if="continuation !== null && !isNextPageLoading"
        @load-next-page="nextPage"
      >
        <div
          class="getNextPage"
          role="button"
          tabindex="0"
          @click="nextPage"
          @keydown.enter.space.prevent="nextPage"
        >
          <FontAwesomeIcon :icon="['fas', 'music']" /> {{ t('Search Filters.Fetch more results') }}
        </div>
      </FtAutoLoadNextPageWrapper>
    </template>
  </FtCard>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import FtAutoLoadNextPageWrapper from '../FtAutoLoadNextPageWrapper.vue'
import FtCard from '../ft-card/ft-card.vue'
import FtElementList from '../FtElementList/FtElementList.vue'
import FtLoader from '../FtLoader/FtLoader.vue'

import store from '../../store/index'
import { copyToClipboard, showToast } from '../../helpers/utils'
import { getCachedMusicSearch, rememberMusicSearch, searchMusic, searchMusicContinuation } from '../../helpers/music-search'

const props = defineProps({
  query: {
    type: String,
    required: true
  }
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// the chip YouTube Music labels the category with ('Songs', 'Albums', …); '' = the top results
const selectedChip = computed(() => typeof route.query.musicChip === 'string' ? route.query.musicChip : '')

const isLoading = ref(true)
const isNextPageLoading = ref(false)
/** @type {import('vue').ShallowRef<import('../../helpers/music-search').MusicChip[]>} */
const chips = shallowRef([])
/** @type {import('vue').ShallowRef<import('../../helpers/music-search').MusicSection[]>} */
const sections = shallowRef([])
/** @type {import('vue').ShallowRef<object | null>} */
const continuation = shallowRef(null)

let generation = 0

/** @type {import('vue').ComputedRef<boolean>} */
const showFamilyFriendlyOnly = computed(() => store.getters.getShowFamilyFriendlyOnly)

const categoryLabels = computed(() => ({
  top: t('SKUI.Music.Top result'),
  song: t('SKUI.Music.Categories.Songs'),
  video: t('SKUI.Music.Categories.Videos'),
  album: t('SKUI.Music.Categories.Albums'),
  artist: t('SKUI.Music.Categories.Artists'),
  profile: t('SKUI.Music.Categories.Profiles'),
  playlist: t('SKUI.Music.Categories.Playlists'),
  podcast: t('SKUI.Music.Categories.Podcasts'),
  episode: t('SKUI.Music.Categories.Episodes')
}))

// YouTube's chip texts (the session is English) → ours
const chipLabels = computed(() => ({
  Songs: t('SKUI.Music.Categories.Songs'),
  Videos: t('SKUI.Music.Categories.Videos'),
  Albums: t('SKUI.Music.Categories.Albums'),
  Artists: t('SKUI.Music.Categories.Artists'),
  Profiles: t('SKUI.Music.Categories.Profiles'),
  'Community playlists': t('SKUI.Music.Categories.Community playlists'),
  'Featured playlists': t('SKUI.Music.Categories.Featured playlists'),
  Podcasts: t('SKUI.Music.Categories.Podcasts'),
  Episodes: t('SKUI.Music.Categories.Episodes')
}))

/**
 * @param {string} category
 */
function categoryLabel(category) {
  return categoryLabels.value[category] ?? category
}

/**
 * YouTube's chip text, translated where we know it.
 * @param {string} label
 */
function chipLabel(label) {
  return chipLabels.value[label] ?? label
}

/**
 * @param {string} category
 */
function chipFor(category) {
  return chips.value.find((chip) => chip.category === category) ?? null
}

/**
 * @param {string} params
 */
async function fetchResults(params) {
  const cached = getCachedMusicSearch(props.query, params)
  if (cached) { return cached }

  const result = await searchMusic(props.query, params, showFamilyFriendlyOnly.value)
  rememberMusicSearch(props.query, params, result)
  return result
}

async function load() {
  const current = ++generation
  isLoading.value = true

  try {
    // the top results come first in any case: they carry the chips a category needs
    const top = await fetchResults('')
    let result = top

    if (selectedChip.value !== '') {
      const chip = top.chips.find((candidate) => candidate.label === selectedChip.value)
      if (chip) {
        result = await fetchResults(chip.params)
      }
    }

    if (current !== generation) { return }

    chips.value = top.chips
    sections.value = result.sections
    continuation.value = result.continuation
  } catch (error) {
    if (current !== generation) { return }
    console.error('YouTube Music search failed', error)

    showToast(`${t('Local API Error (Click to copy)')}: ${error}`, 10000, () => {
      copyToClipboard(String(error))
    })
    sections.value = []
    continuation.value = null
  } finally {
    if (current === generation) {
      isLoading.value = false
    }
  }
}

/**
 * @param {string} label '' for the top results
 */
function selectChip(label) {
  if (label === selectedChip.value) { return }

  const query = { ...route.query }
  if (label === '') {
    delete query.musicChip
  } else {
    query.musicChip = label
  }
  router.replace({ query })
}

async function nextPage() {
  if (isNextPageLoading.value || continuation.value === null) { return }

  const current = generation
  const query = props.query
  const params = chips.value.find((chip) => chip.label === selectedChip.value)?.params ?? ''
  isNextPageLoading.value = true

  try {
    const { items, continuation: next } = await searchMusicContinuation(continuation.value)
    if (current !== generation) { return }

    // a filtered search is one category, so one section
    const [section] = sections.value
    const merged = section
      ? [{ ...section, items: section.items.concat(items) }]
      : []

    sections.value = merged
    continuation.value = next

    const cached = getCachedMusicSearch(query, params)
    if (cached) {
      rememberMusicSearch(query, params, { ...cached, sections: merged, continuation: next })
    }
  } catch (error) {
    console.error('YouTube Music search continuation failed', error)
    showToast(`${t('Local API Error (Click to copy)')}: ${error}`, 10000, () => {
      copyToClipboard(String(error))
    })
  } finally {
    isNextPageLoading.value = false
  }
}

watch(() => [props.query, selectedChip.value], load)
onMounted(load)
</script>

<style scoped src="./SkuiMusicSearch.css" />
