<template>
  <button
    class="btn ripple"
    :class="{
      pill: true,
      pillMain: isMain,
      pillDanger: isDanger,
      pillDialog: inPrompt
    }"
    :data-settings-search-label="label"
    @click="click"
  >
    <slot>
      <FontAwesomeIcon
        v-if="icon"
        :icon="icon"
      />
      {{ label }}
    </slot>
  </button>
</template>

<script setup>
import { computed, inject } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

import { PROMPT_PILLS } from '../FtPrompt/promptPills'

const props = defineProps({
  label: {
    type: String,
    default: ''
  },
  textColor: {
    type: String,
    default: 'var(--text-with-accent-color)'
  },
  backgroundColor: {
    type: String,
    default: 'var(--accent-color)'
  },
  icon: {
    type: Array,
    default: null
  },
  /** the main action of a dialog: a 3 px frame and bold text (black-yellow-theme pills) */
  main: {
    type: Boolean,
    default: false
  }
})

/**
 * Every button is an outlined pill, never filled (black-yellow-theme, "Pills"): frame and label
 * over the ground behind it, all three from the Buttons roles (the Dialogs roles inside an
 * FtPrompt) — see skui-theme.css. The colours upstream passes in are read only for what they
 * MEAN: its destructive red makes the pill a red-framed one, and the fill it reserves for the
 * one emphasised action of a block (`--primary-color`) makes the pill the main one, 3 px and
 * bold. Every other button is a regular 1.25 px pill, the bare-text ones included.
 */
const inPrompt = inject(PROMPT_PILLS, false)

const isDanger = computed(() => props.backgroundColor === 'var(--destructive-color)')
const isMain = computed(() => props.main || (!inPrompt && props.backgroundColor === 'var(--primary-color)'))

const emit = defineEmits(['click'])

function click() {
  emit('click')
}
</script>

<style scoped src="./FtButton.css" />
