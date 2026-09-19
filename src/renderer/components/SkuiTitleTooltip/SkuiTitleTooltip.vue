<template>
  <div
    v-if="state.open"
    ref="bubble"
    class="skuiTitleTooltip"
    role="tooltip"
    :style="position"
  >
    {{ state.text }}
  </div>
</template>

<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { titleTooltipState } from '../../helpers/skuiTitleTooltip'

const state = titleTooltipState
const bubble = useTemplateRef('bubble')

/** Clearance between the bubble and the title it completes. */
const GAP_PX = 8

/** Distance kept from the window edge when the bubble has to be nudged back inside. */
const EDGE_MARGIN_PX = 8

const left = ref(0)
const top = ref(0)
const placed = ref(false)

const position = computed(() => ({
  insetInlineStart: `${left.value}px`,
  insetBlockStart: `${top.value}px`,
  // the box has to be in the document before it can be measured, and an unplaced bubble would
  // flash in the window's top corner for that one frame
  visibility: placed.value ? 'visible' : 'hidden'
}))

/**
 * Above the title, as asked — flipped below only when there is no room up there, and always
 * pulled back inside the window.
 *
 * @param {HTMLElement} element
 * @param {{ top: number, bottom: number, left: number, right: number }} anchor
 */
function positionAgainst(element, anchor) {
  const { offsetWidth, offsetHeight } = element

  const above = anchor.top - GAP_PX - offsetHeight
  top.value = above >= EDGE_MARGIN_PX
    ? above
    : Math.min(anchor.bottom + GAP_PX, window.innerHeight - EDGE_MARGIN_PX - offsetHeight)

  const centred = (anchor.left + anchor.right) / 2 - offsetWidth / 2
  left.value = Math.max(
    EDGE_MARGIN_PX,
    Math.min(centred, window.innerWidth - EDGE_MARGIN_PX - offsetWidth)
  )
}

async function place() {
  placed.value = false

  await nextTick()

  const element = bubble.value
  const anchor = state.anchor
  if (!element || anchor === null) { return }

  positionAgainst(element, anchor)
  placed.value = true

  // Measured a second time one frame on: a box whose size settles only after that first layout
  // -- a skui custom font arriving late, a stylesheet applied a beat after the element -- would
  // otherwise keep a position computed for a size it no longer has, which is how a bubble ends
  // up lying across the very title it is completing. A correction this early is invisible.
  requestAnimationFrame(() => {
    if (state.open && bubble.value === element && state.anchor === anchor) {
      positionAgainst(element, anchor)
    }
  })
}

watch(() => state.open, (open) => {
  if (open) { place() }
})
</script>

<style scoped src="./SkuiTitleTooltip.css" />
