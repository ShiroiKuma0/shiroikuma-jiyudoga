<!--
  The jump index on top of the 白い熊 UI settings page (black-yellow-theme, "Long settings
  pages"): a wrapping flow of small outlined chips, one per section, in the page's order. Each
  chip carries its section's icon in the section's colour at the left of its label, and is
  exactly as wide as its content — variable length, never a uniform width (白い熊, 2026-11-23).
  A TAP unfolds that section and scrolls to it; a LONG-PRESS lifts the chip into a drag: a
  copy follows the finger and the chips reorder LIVE under it (白い熊, 2026-11-19 — reordering
  only on drop is not enough); the sections below follow on the drop.
  Pointer events rather than HTML drag and drop, because the chips wrap (a flow reorder, not a
  list) and because the same code has to work under a finger in the Android WebView.
-->
<template>
  <div
    ref="grid"
    class="skuiIndex"
    role="list"
  >
    <button
      v-for="section in shown"
      :key="section.key"
      :data-key="section.key"
      class="skuiIndexChip"
      :class="{ skuiIndexChipSlot: dragKey === section.key }"
      type="button"
      role="listitem"
      @pointerdown="onPointerDown($event, section.key)"
      @contextmenu.prevent
      @keydown.enter.prevent="jump(section.key)"
    >
      <FontAwesomeIcon
        :icon="['fas', section.icon]"
        class="skuiIndexIcon"
        :class="`skuiSectionColor-${section.color}`"
      />
      <span class="skuiIndexLabel">{{ section.title }}</span>
    </button>
  </div>
  <Teleport to="body">
    <div
      v-if="ghost"
      class="skuiIndexChip skuiIndexGhost"
      :style="{
        left: `${ghost.x}px`,
        top: `${ghost.y}px`,
        width: `${ghost.width}px`,
        height: `${ghost.height}px`
      }"
      aria-hidden="true"
    >
      <FontAwesomeIcon
        :icon="['fas', ghost.icon]"
        class="skuiIndexIcon"
        :class="`skuiSectionColor-${ghost.color}`"
      />
      <span class="skuiIndexLabel">{{ ghost.title }}</span>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { useSkuiPageLayout } from '../../helpers/skuiPageLayout'

const LONG_PRESS_MS = 450
/** a finger that wanders further than this before the long press is a scroll, not a press */
const MOVE_TOLERANCE_PX = 8

const layout = useSkuiPageLayout()
const grid = useTemplateRef('grid')

/** While dragging: the order as it is under the finger right now — the chips render from it. */
const preview = ref(null)
const dragKey = ref(null)
/** The lifted copy that follows the finger; the chip's own slot stays in the flow, hollow. */
const ghost = ref(null)

const shown = computed(() => preview.value ?? layout.ordered.value)

let pressTimer = null
let pressStart = null
let pressKey = null
let grabOffset = null
let moved = false
/** the chip the last live swap pushed aside — see onPointerMove */
let lastDisplacedKey = null

/** @param {string} key */
async function jump(key) {
  layout.open(key)
  await nextTick()
  document.getElementById(`skui-section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/*
 * The move and the release are followed on the WINDOW, not on the chip: during a live reorder
 * Vue moves chips around in the DOM, and a chip that is moved loses its pointer capture — the
 * rest of the gesture would then go nowhere.
 */
function listen() {
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', cancel)
}

function unlisten() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', cancel)
}

/**
 * @param {PointerEvent} event
 * @param {string} key
 */
function onPointerDown(event, key) {
  if (event.button !== 0) return

  reset()
  pressStart = { x: event.clientX, y: event.clientY }
  pressKey = key
  moved = false

  const chip = event.currentTarget
  listen()

  pressTimer = setTimeout(() => {
    pressTimer = null
    lift(chip, key)
  }, LONG_PRESS_MS)
}

/**
 * @param {HTMLElement} chip
 * @param {string} key
 */
function lift(chip, key) {
  const rect = chip.getBoundingClientRect()
  grabOffset = { x: pressStart.x - rect.left, y: pressStart.y - rect.top }

  dragKey.value = key
  preview.value = layout.ordered.value.slice()
  ghost.value = {
    title: layout.meta(key).title,
    icon: layout.meta(key).icon,
    color: layout.meta(key).color,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  }

  navigator.vibrate?.(20)
}

/** @param {PointerEvent} event */
function onPointerMove(event) {
  if (pressStart === null) return

  if (dragKey.value === null) {
    if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > MOVE_TOLERANCE_PX) {
      moved = true
      clearTimeout(pressTimer)
      pressTimer = null
    }
    return
  }

  event.preventDefault()

  ghost.value = {
    ...ghost.value,
    x: event.clientX - grabOffset.x,
    y: event.clientY - grabOffset.y
  }

  const target = targetIndex(event.clientX, event.clientY)
  const from = preview.value.findIndex(section => section.key === dragKey.value)

  if (target === null || target === from) {
    // over a gap or the dragged chip's own slot: whatever was displaced last may be taken again
    lastDisplacedKey = null
    return
  }

  // The chips are of different lengths, so after a swap the chip that was just displaced can
  // land under the finger again and would swap straight back, flapping on every move. It is
  // skipped until the finger has left it.
  const displacedKey = preview.value[target].key
  if (displacedKey === lastDisplacedKey) return
  lastDisplacedKey = displacedKey

  const next = preview.value.slice()
  const [dragged] = next.splice(from, 1)
  next.splice(target, 0, dragged)
  preview.value = next
}

/**
 * The slot the finger is over, in the current (live) order: the chip whose box holds the point
 * takes the dragged one's place (onPointerMove guards the swap against flapping).
 * Past the last chip (to its right on the last row, or below the grid) means the end; over a gap
 * between chips means "stay".
 * @param {number} x
 * @param {number} y
 * @returns {number | null}
 */
function targetIndex(x, y) {
  const chips = [...grid.value.querySelectorAll('.skuiIndexChip')]

  for (let i = 0; i < chips.length; i++) {
    const rect = chips[i].getBoundingClientRect()

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i
    }
  }

  const last = chips.at(-1)?.getBoundingClientRect()

  if (last && (y > last.bottom || (y >= last.top && x > last.right))) {
    return chips.length - 1
  }

  return null
}

function onPointerUp() {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }

  if (dragKey.value !== null) {
    layout.setOrder(preview.value.map(section => section.key))
  } else if (!moved && pressKey !== null) {
    jump(pressKey)
  }

  reset()
}

function cancel() {
  reset()
}

function reset() {
  lastDisplacedKey = null
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }

  unlisten()
  dragKey.value = null
  preview.value = null
  ghost.value = null
  pressStart = null
  pressKey = null
  grabOffset = null
  moved = false
}

onBeforeUnmount(reset)
</script>

<style scoped>
.skuiIndex {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-block: 0.4em 0.6em;
  margin-inline: 1em;
  order: 0;
}

.skuiIndexChip {
  align-items: center;
  background: none;
  border: 1.25px solid var(--skui-button-frame);
  border-radius: 100px;
  color: var(--skui-button-text);
  cursor: pointer;
  display: inline-flex;

  /* as wide as its icon, its label and its padding — never stretched, never a fixed width */
  flex: 0 0 auto;
  font: inherit;
  font-size: 0.85em;
  gap: 0.45em;
  max-inline-size: 100%;
  overflow: hidden;
  padding-block: 4px;
  padding-inline: 0.8em;
  /* a long press must lift the chip, not scroll the page or select its text */
  touch-action: none;
  user-select: none;
  white-space: nowrap;
}

.skuiIndexChip:hover,
.skuiIndexChip:focus-visible {
  background-color: var(--skui-menu-hover);
}

/* the section's icon, sized by the chip's label */
.skuiIndexIcon {
  flex: 0 0 auto;
  font-size: 1.25em;
}

.skuiIndexLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* the dragged chip's place in the flow while it is lifted: a hollow dashed slot */
.skuiIndexChipSlot {
  border-style: dashed;
  color: transparent;
}

.skuiIndexChipSlot .skuiIndexIcon {
  visibility: hidden;
}

/* lifted: the copy under the finger is the one heavy thing on the grid */
.skuiIndexGhost {
  align-items: center;
  background-color: var(--skui-button-ground);
  border-width: 3px;
  box-shadow: 0 4px 14px var(--skui-dialog-scrim);
  box-sizing: border-box;
  cursor: grabbing;
  display: flex;
  font-family: inherit;
  font-weight: 700;
  justify-content: center;
  pointer-events: none;
  position: fixed;
  z-index: 300;
}

/* the seven section-icon colours — settable roles (helpers/skui.js, "Section icons") */
.skuiSectionColor-base { color: var(--skui-section-base); }
.skuiSectionColor-controls { color: var(--skui-section-controls); }
.skuiSectionColor-words { color: var(--skui-section-words); }
.skuiSectionColor-frame { color: var(--skui-section-frame); }
.skuiSectionColor-reach { color: var(--skui-section-reach); }
.skuiSectionColor-warning { color: var(--skui-section-warning); }
.skuiSectionColor-flash { color: var(--skui-section-flash); }
</style>
