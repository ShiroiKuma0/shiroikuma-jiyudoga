<template>
  <div
    v-if="visible"
    class="skuiTabStrip"
    :class="{ dragging: draggingId !== '' }"
    role="tablist"
    @wheel="handleWheel"
  >
    <button
      v-if="showScrollers"
      class="scroller"
      :disabled="!canScrollStart"
      :title="t('SKUI.Tabs.Scroll tabs left')"
      @click="scrollStrip(-1)"
    >
      <FontAwesomeIcon :icon="['fas', 'chevron-left']" />
    </button>
    <div
      ref="tabsRow"
      class="tabs"
      @scroll.passive="updateScrollState"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeId, dragged: tab.id === draggingId }"
        role="tab"
        tabindex="0"
        :aria-selected="tab.id === activeId"
        :title="labelFor(tab)"
        @pointerdown="startPress($event, tab)"
        @click="handleClick(tab)"
        @keydown.enter="activateTab(tab.id)"
        @keydown.space.prevent="activateTab(tab.id)"
        @auxclick.middle.prevent="closeTab(tab.id)"
      >
        <span class="label">{{ labelFor(tab) }}</span>
        <button
          class="close"
          :title="t('SKUI.Tabs.Close tab')"
          @click.stop="closeTab(tab.id)"
        >
          <FontAwesomeIcon :icon="['fas', 'times']" />
        </button>
      </div>
    </div>
    <button
      v-if="showScrollers"
      class="scroller"
      :disabled="!canScrollEnd"
      :title="t('SKUI.Tabs.Scroll tabs right')"
      @click="scrollStrip(1)"
    >
      <FontAwesomeIcon :icon="['fas', 'chevron-right']" />
    </button>
    <button
      class="newTab"
      :title="t('SKUI.Tabs.New tab')"
      @click="openLandingTab"
    >
      <FontAwesomeIcon :icon="['fas', 'plus']" />
    </button>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import store from '../../store/index'
import { activateTab, closeTab, moveTab, openLandingTab, tabsState } from '../../helpers/skuiTabs'

const { t } = useI18n()

const tabs = computed(() => tabsState.tabs)
const activeId = computed(() => tabsState.activeId)
const tabsRow = useTemplateRef('tabsRow')

/** @type {import('vue').ComputedRef<boolean>} */
const alwaysShow = computed(() => store.getters.getSkuiTabsAlwaysShow)

// With one tab the app looks exactly as it always did; opening a second reveals the strip.
const visible = computed(() => tabsState.ready && (tabsState.tabs.length > 1 || alwaysShow.value))

/**
 * @param {import('../../helpers/skuiTabs').SkuiTab} tab
 */
function labelFor(tab) {
  return tab.title.length > 0 ? tab.title : tab.path
}

/*
 * Scrolling the strip.
 *
 * A folder shrinks with its neighbours only down to the floor the CSS gives it, and the row
 * scrolls from there -- so with enough tabs open there is always something off the end. A finger
 * swipes it. A wheel anywhere over the strip rolls it sideways. The desktop has neither, so a
 * chevron appears at each end, and the open folder is pulled back into view whenever the strip
 * moves to another one.
 */

/** How much of the visible row one press of a chevron travels... */
const SCROLL_STEP_FRACTION = 0.8

/** ...but never less than this, so a narrow strip still moves by a folder or so. */
const MIN_SCROLL_STEP_PX = 120

/** Sub-pixel row widths mean "at the end" is never exactly the last pixel. */
const EDGE_TOLERANCE_PX = 1

/** The breathing room a revealed folder keeps from the edge -- the row's own start padding. */
const REVEAL_MARGIN_PX = 8

const canScrollStart = ref(false)
const canScrollEnd = ref(false)

// the chevrons are the desktop's swipe; a finger already has one, and on the phone the two
// buttons would be eating a strip that has far less room to give
const showScrollers = computed(() =>
  !process.env.IS_ANDROID && (canScrollStart.value || canScrollEnd.value)
)

function updateScrollState() {
  const row = tabsRow.value

  if (!row) {
    canScrollStart.value = false
    canScrollEnd.value = false
    return
  }

  canScrollStart.value = row.scrollLeft > EDGE_TOLERANCE_PX
  canScrollEnd.value = row.scrollLeft < row.scrollWidth - row.clientWidth - EDGE_TOLERANCE_PX
}

/**
 * @param {number} direction -1 towards the first folder, 1 towards the last
 */
function scrollStrip(direction) {
  const row = tabsRow.value
  if (!row) { return }

  row.scrollBy({
    left: direction * Math.max(row.clientWidth * SCROLL_STEP_FRACTION, MIN_SCROLL_STEP_PX),
    behavior: 'smooth'
  })
}

/**
 * A mouse wheel only says up and down, and over a row that can only go sideways that is what it
 * means; a touchpad and a tilt wheel say sideways themselves, so whichever axis is the larger is
 * the one being asked for.
 *
 * @param {WheelEvent} event
 */
function handleWheel(event) {
  const row = tabsRow.value
  if (!row) { return }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) { return }

  // this app only ever sees pixels, both platforms being Chromium, but a wheel is allowed to
  // report lines or pages and three of either would be a strip that barely twitches
  const pixels = event.deltaMode === 1
    ? delta * 16
    : event.deltaMode === 2 ? delta * row.clientWidth : delta

  const before = row.scrollLeft
  row.scrollLeft = before + pixels

  // claim the gesture only if the strip actually moved: at either end it belongs to the page
  if (row.scrollLeft !== before) { event.preventDefault() }
}

/**
 * Put the open folder where it can be seen -- switching tabs with Ctrl+Tab, or opening one next
 * to a tab near the end, otherwise lands on a folder that is off the edge of a scrolled strip.
 * Instantly, not smoothly: the strip should already be showing the tab by the time the page
 * behind it changes.
 */
function revealActiveTab() {
  const row = tabsRow.value
  if (!row) { return }

  const index = tabs.value.findIndex(tab => tab.id === activeId.value)
  if (index === -1) { return }

  const element = row.querySelectorAll('.tab')[index]
  if (!element) { return }

  // offsetLeft is measured from the row, which is the same origin scrollLeft counts from
  const start = element.offsetLeft - REVEAL_MARGIN_PX
  const end = element.offsetLeft + element.offsetWidth + REVEAL_MARGIN_PX - row.clientWidth

  if (row.scrollLeft > start) {
    row.scrollLeft = start
  } else if (row.scrollLeft < end) {
    row.scrollLeft = end
  }
}

/** @type {ResizeObserver|null} */
let rowObserver = null

// the row only exists while the strip is visible, so the observer follows the element rather
// than the component: a second tab opening is what brings both into being
watch(tabsRow, (row) => {
  rowObserver?.disconnect()
  rowObserver = null

  if (!row) {
    updateScrollState()
    return
  }

  rowObserver = new ResizeObserver(updateScrollState)
  rowObserver.observe(row)

  updateScrollState()
  revealActiveTab()
}, { immediate: true })

// a tab opening, closing or finally learning its name all change how much there is to scroll;
// the observer above sees the row resize, not the folders inside it
watch(tabs, updateScrollState, { deep: true, flush: 'post' })

watch(activeId, () => {
  revealActiveTab()
  updateScrollState()
}, { flush: 'post' })

/*
 * Dragging a tab along the strip reorders it.
 *
 * The two pointers are told apart on purpose. A MOUSE drag is a drag from the first few pixels,
 * the way every browser's tab strip behaves. A FINGER is not: a swipe along the strip scrolls it
 * once the tabs outgrow the row, and that gesture has to keep working -- so a touch drag starts
 * only after a press that stays still, and the first move before that hands the gesture back to
 * the scroller.
 *
 * There is no floating ghost of the dragged tab: the strip reorders live under the pointer, so
 * the tab is always already where it would land, and the folder it is drawn as never leaves the
 * drawer. That also means nothing has to be measured twice or animated back into place.
 */

/** How far a mouse travels before a press becomes a drag rather than a click. */
const DRAG_SLOP_PX = 6

/** How long a finger has to stay put instead, before the strip stops scrolling and picks it up. */
const TOUCH_HOLD_MS = 350

/** ...and how far it may stray while it waits. */
const TOUCH_SLOP_PX = 8

const draggingId = ref('')

/** @type {{ id: string, pointerId: number, startX: number, touch: boolean, armed: boolean }|null} */
let press = null

/** @type {ReturnType<typeof setTimeout>|null} */
let holdTimer = null

/** set the moment a drag begins, so the click that ends it does not also switch tabs */
let dragged = false

/**
 * @param {TouchEvent} event
 */
function preventTouchScroll(event) {
  // The finger was still while the hold elapsed, so the scroller has not claimed the gesture yet
  // and this is what stops it claiming the moves that follow. A non-passive listener is the only
  // way to say so: `touch-action` is read when the gesture starts, long before we know it is one.
  if (event.cancelable) { event.preventDefault() }
}

function beginDrag() {
  if (press === null || draggingId.value !== '') { return }

  draggingId.value = press.id
  dragged = true

  if (press.touch) {
    window.addEventListener('touchmove', preventTouchScroll, { passive: false })
  }
}

/**
 * Walk the dragged tab past a neighbour once the pointer is beyond that neighbour's middle --
 * the midpoint, not its edge, so a tab resting on a boundary does not flicker between two places.
 *
 * @param {number} pointerX
 */
function reorderAt(pointerX) {
  const row = tabsRow.value
  if (!row) { return }

  const index = tabs.value.findIndex(tab => tab.id === draggingId.value)
  if (index === -1) { return }

  const elements = row.querySelectorAll('.tab')
  const next = elements[index + 1]
  const previous = elements[index - 1]

  if (next) {
    const rect = next.getBoundingClientRect()

    if (pointerX > rect.left + rect.width / 2) {
      moveTab(draggingId.value, index + 1)
      return
    }
  }

  if (previous) {
    const rect = previous.getBoundingClientRect()

    if (pointerX < rect.right - rect.width / 2) {
      moveTab(draggingId.value, index - 1)
    }
  }
}

/**
 * @param {PointerEvent} event
 */
function handlePointerMove(event) {
  if (press === null || event.pointerId !== press.pointerId) { return }

  const travelled = Math.abs(event.clientX - press.startX)

  if (!press.armed) {
    // moved before the hold elapsed: the reader is scrolling the strip, not picking a tab up
    if (travelled > TOUCH_SLOP_PX) { endPress() }
    return
  }

  if (draggingId.value === '') {
    if (travelled < DRAG_SLOP_PX) { return }

    beginDrag()
  }

  reorderAt(event.clientX)
}

function endPress() {
  if (holdTimer !== null) {
    clearTimeout(holdTimer)
    holdTimer = null
  }

  press = null
  draggingId.value = ''

  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', endPress)
  window.removeEventListener('pointercancel', endPress)
  window.removeEventListener('touchmove', preventTouchScroll)
}

/**
 * @param {PointerEvent} event
 * @param {import('../../helpers/skuiTabs').SkuiTab} tab
 */
function startPress(event, tab) {
  endPress()
  dragged = false

  // the close button is its own target, and only the primary button drags
  if (event.button !== 0) { return }
  if (event.target instanceof Element && event.target.closest('.close') !== null) { return }

  const touch = event.pointerType !== 'mouse'

  press = {
    id: tab.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    touch,
    armed: !touch
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', endPress)
  window.addEventListener('pointercancel', endPress)

  if (touch) {
    holdTimer = setTimeout(() => {
      holdTimer = null

      if (press !== null) {
        press.armed = true
        beginDrag()
      }
    }, TOUCH_HOLD_MS)
  }
}

/**
 * @param {import('../../helpers/skuiTabs').SkuiTab} tab
 */
function handleClick(tab) {
  if (dragged) {
    dragged = false
    return
  }

  activateTab(tab.id)
}

onBeforeUnmount(() => {
  endPress()
  rowObserver?.disconnect()
})
</script>

<style scoped src="./SkuiTabStrip.css" />
