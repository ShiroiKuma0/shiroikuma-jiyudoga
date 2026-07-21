<template>
  <div class="skuiRow">
    <button
      class="skuiRowHeader"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="skuiRowLabel">{{ label }}</span>
      <span
        v-if="isOverridden"
        class="skuiOverriddenMark"
        aria-hidden="true"
      />
      <span class="skuiSwatchFrame">
        <span
          class="skuiSwatch"
          :style="{ backgroundColor: cssValue }"
        />
      </span>
    </button>
    <div
      v-if="expanded"
      class="skuiColorEditor"
    >
      <div
        v-if="recentColors.length > 0"
        class="skuiRecentRow"
      >
        <button
          v-for="(recent, index) in recentColors"
          :key="index"
          type="button"
          class="skuiSwatchFrame skuiRecentSwatch"
          :title="$t('SKUI.Recent color')"
          @click="applyRecent(recent)"
        >
          <span
            class="skuiSwatch"
            :style="{ backgroundColor: cssRgba(recent) }"
          />
        </button>
      </div>
      <div class="skuiPreviewPair">
        <span
          class="skuiPreviewHalf"
          :style="{ backgroundColor: cssRgba(originalColor) }"
        >{{ $t('SKUI.Old') }}</span>
        <span
          class="skuiPreviewHalf"
          :style="{ backgroundColor: cssValue }"
        >{{ $t('SKUI.New') }}</span>
      </div>
      <div
        v-for="channel in CHANNELS"
        :key="channel.index"
        class="skuiSliderLine"
      >
        <span class="skuiChannelLabel">{{ channel.label }}</span>
        <input
          class="skuiRange"
          type="range"
          :aria-label="channel.label"
          :min="0"
          :max="channel.max"
          :step="channel.step"
          :value="color[channel.index]"
          @input="onSlide(channel.index, $event.target.value)"
          @change="onCommit"
        >
        <span class="skuiChannelValue">{{ color[channel.index] }}</span>
      </div>
      <button
        type="button"
        class="skuiResetButton"
        @click="reset"
      >
        {{ $t('SKUI.Reset to default') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

import { cssRgba } from '../../helpers/skui'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  /** resolved [r, g, b, a] currently in effect */
  modelColor: {
    type: Array,
    required: true
  },
  isOverridden: {
    type: Boolean,
    required: true
  },
  /** array of [r, g, b, a] */
  recentColors: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['preview', 'commit', 'reset'])

const CHANNELS = [
  { index: 0, label: 'R', max: 255, step: 1 },
  { index: 1, label: 'G', max: 255, step: 1 },
  { index: 2, label: 'B', max: 255, step: 1 },
  { index: 3, label: 'A', max: 1, step: 0.01 },
]

const expanded = ref(false)
const originalColor = [...props.modelColor]

const color = computed(() => props.modelColor)
const cssValue = computed(() => cssRgba(props.modelColor))

function onSlide(index, rawValue) {
  const next = [...props.modelColor]
  next[index] = index === 3 ? Math.round(parseFloat(rawValue) * 100) / 100 : parseInt(rawValue)
  emit('preview', next)
}

function onCommit() {
  emit('commit', [...props.modelColor])
}

function applyRecent(recent) {
  emit('preview', [...recent])
  emit('commit', [...recent])
}

function reset() {
  emit('reset')
}
</script>

<style scoped src="./SkuiRows.css" />
