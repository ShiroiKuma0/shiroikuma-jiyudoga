<template>
  <div class="skuiFeedFilter">
    <button
      ref="iconButton"
      class="filterButton"
      :class="{ filterOn: filterActive }"
      :title="t('SKUI.Feed filter.Feed filter')"
      :aria-label="t('SKUI.Feed filter.Feed filter')"
      :aria-expanded="panelShown"
      :aria-controls="id + 'panel'"
      @click="togglePanel"
      @mousedown="handleIconMouseDown"
    >
      <FontAwesomeIcon
        class="filterIcon"
        :icon="['fas', 'filter']"
      />
      <span
        v-if="badge"
        class="filterBadge"
        dir="auto"
      >{{ badge }}</span>
    </button>
    <FtCard
      v-show="panelShown"
      :id="id + 'panel'"
      ref="panelRef"
      class="filterPanel"
      tabindex="-1"
      @focusout="handlePanelFocusOut"
      @keydown.esc.stop="handlePanelEscape"
    >
      <h3 class="panelTitle">
        {{ t('SKUI.Feed filter.Feed filter') }}
      </h3>
      <p class="panelLegend">
        {{ t('SKUI.Feed filter.Legend') }}
      </p>

      <div class="presetRow">
        <span
          v-for="preset in presets"
          :key="preset.id"
          class="presetChip"
          :class="{ presetApplied: preset.id === filter.presetId }"
        >
          <button
            class="presetApply"
            :title="t('SKUI.Feed filter.Apply preset')"
            @click="applyPreset(preset)"
          >{{ preset.name }}</button>
          <button
            class="presetDelete"
            :title="t('SKUI.Feed filter.Delete preset')"
            :aria-label="t('SKUI.Feed filter.Delete preset')"
            @click="deletePreset(preset)"
          >
            <FontAwesomeIcon :icon="['fas', 'xmark']" />
          </button>
        </span>
        <button
          v-if="!naming"
          class="presetSave"
          @click="startNaming"
        >
          <FontAwesomeIcon :icon="['fas', 'plus']" />
          {{ t('SKUI.Feed filter.Save current') }}
        </button>
        <span
          v-else
          class="presetNaming"
        >
          <input
            ref="nameInput"
            v-model="presetName"
            type="text"
            class="presetNameInput"
            :placeholder="t('SKUI.Feed filter.Preset name')"
            :aria-label="t('SKUI.Feed filter.Preset name')"
            :maxlength="24"
            @keydown.enter="savePreset"
            @keydown.esc.stop="cancelNaming"
          >
          <button
            class="presetSave"
            @click="savePreset"
          >
            {{ t('SKUI.Feed filter.Save') }}
          </button>
        </span>
      </div>

      <div class="profileRows">
        <div
          v-for="profile in profileList"
          :key="profile._id"
          class="profileRow"
        >
          <button
            class="rowMain"
            :title="t('SKUI.Feed filter.Cycle state')"
            @click="cycleProfile(profile._id)"
          >
            <span
              class="stateChip"
              :class="'state-' + stateOf(profile._id)"
            >{{ stateGlyph(profile._id) }}</span>
            <span
              class="profileBubble"
              :style="{ background: profile.bgColor, color: profile.textColor }"
            >{{ profileInitials[profile._id] }}</span>
            <span
              class="profileName"
              dir="auto"
            >{{ profileDisplayName(profile) }}</span>
            <span class="channelCount">{{ profile.subscriptions.length }}</span>
          </button>
          <input
            v-if="stateOf(profile._id) === FEED_FILTER_CAP"
            type="number"
            class="capInput"
            min="1"
            :max="FEED_FILTER_MAX_CAP"
            :value="filter.caps[profile._id]"
            :title="t('SKUI.Feed filter.Max per channel')"
            :aria-label="t('SKUI.Feed filter.Max per channel')"
            @input="setCap(profile._id, $event.target.value)"
          >
        </div>
      </div>

      <div class="panelFooter">
        <span class="viewCount">{{ t('SKUI.Feed filter.Channels in view', { count: channelCount }) }}</span>
        <button
          class="clearButton"
          :disabled="!filterActive"
          @click="clearFilter"
        >
          {{ t('SKUI.Feed filter.Clear') }}
        </button>
      </div>
    </FtCard>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import FtCard from '../ft-card/ft-card.vue'

import store from '../../store/index'

import {
  FEED_FILTER_CAP,
  FEED_FILTER_DEFAULT_CAP,
  FEED_FILTER_EXCLUDE,
  FEED_FILTER_INCLUDE,
  FEED_FILTER_MAX_CAP,
  cycleProfileState,
  emptyFeedFilter,
  feedFilterFromPreset,
  newPresetId,
  stateForProfile,
  withProfileState
} from '../../helpers/feedFilter'
import { debounce } from '../../helpers/utils'
import { getFirstCharacter } from '../../helpers/strings'
import { useProfileLabel } from '../../composables/profileLabel'

/**
 * Fork (白い熊 自由動画): the feed filter panel, next to the profile bubble.
 *
 * Each row cycles a profile through neutral → + → − → cap, and the resulting set algebra
 * (see helpers/feedFilter.js) is what the Subscriptions feed tabs read. Saving the current
 * combination under a name turns it into a one-tap view — "0", "1", 朝 — without creating
 * a profile that would then have to be kept in sync channel by channel.
 */

const { locale, t } = useI18n()
const { profileDisplayName } = useProfileLabel()

const id = useId()

const panelShown = ref(false)
let mouseDownOnIcon = false

const naming = ref(false)
const presetName = ref('')

const profileList = computed(() => store.getters.getProfileList)
const filter = computed(() => store.getters.getFeedFilter)
const presets = computed(() => store.getters.getFeedFilterPresets)
const filterActive = computed(() => store.getters.getFeedFilterActive)
const channelCount = computed(() => store.getters.getFeedSubscriptions.length)

/** @type {import('vue').ComputedRef<Record<string, string>>} */
const profileInitials = computed(() => {
  const locale_ = locale.value

  return profileList.value.reduce((initials, profile) => {
    const name = profileDisplayName(profile)
    initials[profile._id] = name ? getFirstCharacter(name, locale_) : ''

    return initials
  }, {})
})

// The applied preset names the view; without one, the number of profiles the filter
// speaks about is at least an honest "something is on" indicator
const badge = computed(() => {
  if (!filterActive.value) { return '' }

  const preset = presets.value.find((entry) => entry.id === filter.value.presetId)

  if (preset != null && preset.name.length > 0) {
    return getFirstCharacter(preset.name, locale.value)
  }

  return String(filter.value.include.length + filter.value.exclude.length + Object.keys(filter.value.caps).length)
})

/**
 * @param {string} profileId
 */
function stateOf(profileId) {
  return stateForProfile(filter.value, profileId)
}

/**
 * @param {string} profileId
 */
function stateGlyph(profileId) {
  switch (stateOf(profileId)) {
    case FEED_FILTER_INCLUDE:
      return '+'
    case FEED_FILTER_EXCLUDE:
      return '−'
    case FEED_FILTER_CAP:
      return String(filter.value.caps[profileId])
    default:
      return '·'
  }
}

// live in-memory commit while the cap is being typed, persisted once it settles
const persistFilter = debounce((json) => store.dispatch('updateSkuiFeedFilter', json), 500)

/**
 * @param {import('../../helpers/feedFilter').FeedFilter} next
 * @param {boolean} [debounced] for the cap field, which fires per keystroke
 */
function writeFilter(next, debounced = false) {
  const json = JSON.stringify(next)

  store.commit('setSkuiFeedFilter', json)

  if (debounced) {
    persistFilter(json)
  } else {
    store.dispatch('updateSkuiFeedFilter', json)
  }
}

/**
 * @param {string} profileId
 */
function cycleProfile(profileId) {
  writeFilter(cycleProfileState(filter.value, profileId))
}

/**
 * @param {string} profileId
 * @param {string} rawValue
 */
function setCap(profileId, rawValue) {
  const parsed = Math.trunc(Number(rawValue))
  const cap = Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, FEED_FILTER_MAX_CAP)
    : FEED_FILTER_DEFAULT_CAP

  writeFilter(withProfileState(filter.value, profileId, FEED_FILTER_CAP, cap), true)
}

function clearFilter() {
  writeFilter(emptyFeedFilter())
}

/**
 * @param {import('../../helpers/feedFilter').FeedFilterPreset} preset
 */
function applyPreset(preset) {
  writeFilter(feedFilterFromPreset(preset))
  panelShown.value = false
}

/**
 * @param {import('../../helpers/feedFilter').FeedFilterPreset} preset
 */
function deletePreset(preset) {
  const remaining = presets.value.filter((entry) => entry.id !== preset.id)

  store.dispatch('updateSkuiFeedFilterPresets', JSON.stringify(remaining))

  if (filter.value.presetId === preset.id) {
    writeFilter({ ...filter.value, presetId: null })
  }
}

const nameInput = useTemplateRef('nameInput')

function startNaming() {
  naming.value = true
  presetName.value = ''
  nextTick(() => nameInput.value?.focus())
}

function cancelNaming() {
  naming.value = false
  presetName.value = ''
}

// Saving under an existing name replaces that preset, so a view can be corrected
// without collecting duplicates
function savePreset() {
  const name = presetName.value.trim()

  if (name.length === 0) { return }

  const existing = presets.value.find((entry) => entry.name === name)
  const presetId = existing?.id ?? newPresetId()

  const entry = {
    id: presetId,
    name,
    include: [...filter.value.include],
    exclude: [...filter.value.exclude],
    caps: { ...filter.value.caps }
  }

  const next = existing != null
    ? presets.value.map((preset) => (preset.id === presetId ? entry : preset))
    : [...presets.value, entry]

  store.dispatch('updateSkuiFeedFilterPresets', JSON.stringify(next))
  writeFilter({ ...filter.value, presetId })

  cancelNaming()
}

const panelRef = useTemplateRef('panelRef')
const iconButton = useTemplateRef('iconButton')

function togglePanel() {
  panelShown.value = !panelShown.value

  if (panelShown.value) {
    // focus the panel so it can hide itself again when focus leaves
    nextTick(() => {
      panelRef.value?.$el?.focus()
    })
  }
}

function handleIconMouseDown() {
  if (panelShown.value) {
    mouseDownOnIcon = true
  }
}

function handlePanelFocusOut() {
  if (mouseDownOnIcon) {
    mouseDownOnIcon = false
  } else if (!panelRef.value?.$el.matches(':focus-within')) {
    panelShown.value = false
  }
}

function handlePanelEscape() {
  iconButton.value?.focus()
  // handlePanelFocusOut will hide the panel for us
}
</script>

<style scoped src="./SkuiFeedFilter.css" />
