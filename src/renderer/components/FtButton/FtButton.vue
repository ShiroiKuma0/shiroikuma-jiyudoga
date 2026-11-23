<template>
  <button
    class="btn ripple"
    :class="{ pill: inPrompt, pillMain: inPrompt && main }"
    :data-settings-search-label="label"
    :style="inPrompt ? pillStyle : {
      color: textColor,
      backgroundColor: backgroundColor,
      borderColor: backgroundColor
    }"
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
 * Inside a dialog (FtPrompt) every button is an outlined pill, never filled (black-yellow-theme,
 * "Pills"): the accent frame and label over the dialog's own background. A button that asked for
 * a colour of its own — the destructive red above all — lends it to the frame and the label.
 */
const inPrompt = inject(PROMPT_PILLS, false)

const pillStyle = computed(() => {
  const own = props.backgroundColor

  if (own === 'var(--destructive-color)') {
    return { color: 'var(--skui-warn, var(--destructive-color))', borderColor: 'var(--skui-warn, var(--destructive-color))' }
  }

  if (own && own !== 'var(--accent-color)') {
    return { color: own, borderColor: own }
  }

  return { color: 'var(--primary-text-color)', borderColor: 'var(--primary-color)' }
})

const emit = defineEmits(['click'])

function click() {
  emit('click')
}
</script>

<style scoped src="./FtButton.css" />
