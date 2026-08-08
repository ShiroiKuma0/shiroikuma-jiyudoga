<template>
  <div class="skuiFeedFilter">
    <div
      ref="stripRef"
      class="pillStrip"
    >
      <button
        v-for="pill in visiblePills"
        :key="pill.id"
        class="pill"
        :class="{
          pillSelected: pill.id === appliedPresetId,
          pillGrabbed: pill.id === grabbedId
        }"
        :title="t('SKUI.Feed filter.Pill hint')"
        dir="auto"
        @pointerdown="startPress($event, pill)"
        @pointermove="movePress($event)"
        @pointerup="endPress($event)"
        @pointercancel="cancelPress"
        @click="applyPill($event, pill)"
        @contextmenu.prevent
      >
        {{ pill.name }}
      </button>
    </div>
    <button
      ref="newButton"
      class="pill newPill"
      :class="{ pillSelected: panelShown }"
      :title="t('SKUI.Feed filter.New filter')"
      :aria-label="t('SKUI.Feed filter.New filter')"
      :aria-expanded="panelShown"
      :aria-controls="id + 'panel'"
      @click="togglePanel"
      @mousedown="handleIconMouseDown"
    >
      <FontAwesomeIcon :icon="['fas', 'plus']" />
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
        {{ t('SKUI.Feed filter.New filter') }}
      </h3>
      <p class="panelLegend">
        {{ t('SKUI.Feed filter.Legend') }}
      </p>

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

      <div class="panelCount">
        <span class="viewCount">{{ t('SKUI.Feed filter.Channels in view', { count: channelCount }) }}</span>
        <button
          class="clearButton"
          :disabled="!filterActive"
          @click="clearRows"
        >
          {{ t('SKUI.Feed filter.Clear') }}
        </button>
      </div>

      <div class="panelFooter">
        <input
          v-model="pillName"
          type="text"
          class="nameInput"
          spellcheck="false"
          :placeholder="t('SKUI.Feed filter.Filter name')"
          :aria-label="t('SKUI.Feed filter.Filter name')"
          :maxlength="24"
          @keydown.enter="createPill"
        >
        <button
          class="footerButton"
          @click="cancelPanel"
        >
          {{ t('SKUI.Feed filter.Cancel') }}
        </button>
        <button
          class="footerButton createButton"
          :disabled="!canCreate"
          @click="createPill"
        >
          {{ t('SKUI.Feed filter.Create') }}
        </button>
      </div>
    </FtCard>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue'
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
import { debounce, showToast } from '../../helpers/utils'
import { getFirstCharacter } from '../../helpers/strings'
import { useProfileLabel } from '../../composables/profileLabel'

/**
 * Fork (白い熊 自由動画): the feed filter — a strip of named filter pills in the top bar.
 *
 * Every pill is a saved combination of +/−/cap over the profiles (the algebra lives in
 * helpers/feedFilter.js); tapping one applies it, so switching between "japan-news only" and
 * "everything but the news" is one tap rather than a profile full of hand-picked channels.
 *
 * The invariant the UI rests on: what is applied is always either nothing or exactly ONE
 * pill, and that pill is visibly selected. The + button therefore edits a draft — it applies
 * live so the channel count and the feed can be judged while choosing — and the draft is
 * either named and kept as a pill, or reverted when the panel is dismissed.
 *
 * Gestures on a pill: tap applies, long-press picks it up. Moving while held reorders the
 * strip; letting go without moving deletes the pill, with a tap-to-undo toast, the same
 * bargain the Similar tab's rejections make.
 */

const LONG_PRESS_MS = 500
/** Pointer travel that counts as "the finger moved" rather than a press in place. */
const MOVE_SLOP_PX = 8

const { locale, t } = useI18n()
const { profileDisplayName } = useProfileLabel()

const id = useId()

const panelShown = ref(false)
let mouseDownOnIcon = false

const pillName = ref('')

/** The filter as it stood when the panel was opened, restored if the draft is abandoned. */
let filterBeforePanel = null

const profileList = computed(() => store.getters.getProfileList)
const filter = computed(() => store.getters.getFeedFilter)
const pills = computed(() => store.getters.getFeedFilterPresets)
const filterActive = computed(() => store.getters.getFeedFilterActive)
const channelCount = computed(() => store.getters.getFeedSubscriptions.length)

const appliedPresetId = computed(() => filter.value.presetId)

const canCreate = computed(() => pillName.value.trim().length > 0 && filterActive.value)

/** While a pill is held, the strip renders this order instead, so a drag is visible as it happens. */
const dragOrder = ref(null)
const grabbedId = ref(null)

const visiblePills = computed(() => dragOrder.value ?? pills.value)

/** @type {import('vue').ComputedRef<Record<string, string>>} */
const profileInitials = computed(() => {
  const locale_ = locale.value

  return profileList.value.reduce((initials, profile) => {
    const name = profileDisplayName(profile)
    initials[profile._id] = name ? getFirstCharacter(name, locale_) : ''

    return initials
  }, {})
})

// ---- the applied filter -------------------------------------------------------------

// live in-memory commit while the cap is being typed, persisted once it settles
const persistFilter = debounce((json) => store.dispatch('updateSkuiFeedFilter', json), 500)

/**
 * @param {import('../../helpers/feedFilter').FeedFilter} next
 * @param {boolean} [debounced] for the cap field, which fires per keystroke
 */
function writeFilter(next, debounced = false) {
  writeFilterJson(JSON.stringify(next), debounced)
}

/**
 * @param {string} json
 * @param {boolean} [debounced]
 */
function writeFilterJson(json, debounced = false) {
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

function clearRows() {
  writeFilter(emptyFeedFilter())
}

// ---- the pills ----------------------------------------------------------------------

/**
 * @param {import('../../helpers/feedFilter').FeedFilterPreset[]} next
 */
function writePills(next) {
  store.dispatch('updateSkuiFeedFilterPresets', JSON.stringify(next))
}

/**
 * A tap applies the pill; tapping the selected one again puts the plain profile back, so the
 * strip never becomes a state you cannot leave with the same finger you entered it with.
 * @param {MouseEvent} event
 * @param {import('../../helpers/feedFilter').FeedFilterPreset} pill
 */
function applyPill(event, pill) {
  // the click that ends a long press is not a tap
  if (pressHandled) {
    pressHandled = false
    return
  }

  if (pill.id === appliedPresetId.value) {
    writeFilter(emptyFeedFilter())
  } else {
    writeFilter(feedFilterFromPreset(pill))
  }
}

/**
 * @param {import('../../helpers/feedFilter').FeedFilterPreset} pill
 */
function deletePill(pill) {
  const index = pills.value.findIndex((entry) => entry.id === pill.id)

  if (index === -1) { return }

  const remaining = pills.value.filter((entry) => entry.id !== pill.id)

  writePills(remaining)

  if (appliedPresetId.value === pill.id) {
    writeFilter(emptyFeedFilter())
  }

  showToast(t('SKUI.Feed filter.Deleted', { name: pill.name }), 10000, () => {
    // back at the same place in the strip, not appended to the end
    const restored = [...store.getters.getFeedFilterPresets]
    restored.splice(Math.min(index, restored.length), 0, pill)
    writePills(restored)
  })
}

function createPill() {
  if (!canCreate.value) { return }

  const name = pillName.value.trim()
  const existing = pills.value.find((entry) => entry.name === name)
  const presetId = existing?.id ?? newPresetId()

  const entry = {
    id: presetId,
    name,
    include: [...filter.value.include],
    exclude: [...filter.value.exclude],
    caps: { ...filter.value.caps }
  }

  writePills(existing != null
    ? pills.value.map((pill) => (pill.id === presetId ? entry : pill))
    : [...pills.value, entry])

  // the draft becomes the pill, so it stays applied and shows up selected
  writeFilter({ ...filter.value, presetId })

  filterBeforePanel = null
  panelShown.value = false
}

// ---- press, drag and drop ------------------------------------------------------------

/** Set once a long press has been dealt with, so the click it produces is ignored. */
let pressHandled = false
let pressTimer = null
let pressStartX = 0
let pressMoved = false
/** @type {import('../../helpers/feedFilter').FeedFilterPreset|null} */
let pressedPill = null

// Once a pill is held, the strip must not scroll under the finger. touchmove has to be
// cancelled non-passively for that, which no template listener can do.
function blockScroll(event) {
  event.preventDefault()
}

/**
 * @param {PointerEvent} event
 * @param {import('../../helpers/feedFilter').FeedFilterPreset} pill
 */
function startPress(event, pill) {
  if (event.button != null && event.button > 0) { return }

  pressedPill = pill
  pressStartX = event.clientX
  pressMoved = false
  pressHandled = false

  const target = event.currentTarget

  pressTimer = setTimeout(() => {
    pressTimer = null
    grabbedId.value = pill.id
    dragOrder.value = [...pills.value]

    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // capture is a nicety; without it the drag still follows pointermove on the pill
    }

    document.addEventListener('touchmove', blockScroll, { passive: false })
  }, LONG_PRESS_MS)
}

/**
 * @param {PointerEvent} event
 */
function movePress(event) {
  if (pressedPill == null) { return }

  if (Math.abs(event.clientX - pressStartX) > MOVE_SLOP_PX) {
    pressMoved = true

    // a swipe that started before the hold matured is the strip being scrolled
    if (pressTimer !== null) {
      clearTimeout(pressTimer)
      pressTimer = null
      pressedPill = null
      return
    }
  }

  if (grabbedId.value == null) { return }

  reorderTo(event.clientX)
}

/**
 * Moves the held pill to wherever the pointer is, by asking the strip which pill sits under
 * it. Reordering the rendered list is the whole animation — the pill follows the finger
 * because it is genuinely in a new place.
 * @param {number} clientX
 */
function reorderTo(clientX) {
  const order = dragOrder.value
  const strip = stripRef.value

  if (order == null || strip == null) { return }

  const from = order.findIndex((pill) => pill.id === grabbedId.value)

  if (from === -1) { return }

  const rects = Array.from(strip.children, (child) => child.getBoundingClientRect())

  let to = from

  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index]

    if (clientX >= rect.left && clientX <= rect.right) {
      to = index
      break
    }

    if (index === 0 && clientX < rect.left) { to = 0 }
    if (index === rects.length - 1 && clientX > rect.right) { to = index }
  }

  if (to === from) { return }

  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  dragOrder.value = next
  pressMoved = true
}

/**
 * @param {PointerEvent} event
 */
function endPress(event) {
  if (pressTimer !== null) {
    // released before the hold matured: an ordinary tap, handled by the click
    clearTimeout(pressTimer)
    pressTimer = null
    pressedPill = null
    return
  }

  if (grabbedId.value == null) {
    pressedPill = null
    return
  }

  const pill = pressedPill
  const order = dragOrder.value

  releaseGrab(event)

  if (pressMoved) {
    if (order != null) { writePills(order) }
  } else if (pill != null) {
    // held in place and let go: the delete gesture, undoable from the toast
    deletePill(pill)
  }

  pressHandled = true
  pressedPill = null
}

function cancelPress() {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }

  if (grabbedId.value != null) {
    releaseGrab()
    pressHandled = true
  }

  pressedPill = null
}

/**
 * @param {PointerEvent} [event]
 */
function releaseGrab(event) {
  document.removeEventListener('touchmove', blockScroll)

  if (event != null) {
    try {
      event.currentTarget?.releasePointerCapture(event.pointerId)
    } catch {
      // already released with the pointer
    }
  }

  grabbedId.value = null
  dragOrder.value = null
}

onBeforeUnmount(() => {
  if (pressTimer !== null) { clearTimeout(pressTimer) }

  document.removeEventListener('touchmove', blockScroll)
})

// ---- the panel ------------------------------------------------------------------------

const stripRef = useTemplateRef('stripRef')
const panelRef = useTemplateRef('panelRef')
const newButton = useTemplateRef('newButton')

function togglePanel() {
  if (panelShown.value) {
    cancelPanel()
    return
  }

  // the draft starts from whatever is applied, so a variation of the current view is a
  // couple of taps rather than a rebuild
  filterBeforePanel = store.getters.getSkuiFeedFilter
  pillName.value = ''
  panelShown.value = true

  nextTick(() => {
    panelRef.value?.$el?.focus()
  })
}

function cancelPanel() {
  if (filterBeforePanel != null) {
    writeFilterJson(filterBeforePanel)
    filterBeforePanel = null
  }

  panelShown.value = false
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
    cancelPanel()
  }
}

function handlePanelEscape() {
  newButton.value?.focus()
  cancelPanel()
}
</script>

<style scoped src="./SkuiFeedFilter.css" />
