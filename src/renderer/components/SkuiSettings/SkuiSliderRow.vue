<template>
  <div class="skuiRow skuiSliderLine">
    <FontAwesomeIcon
      :icon="['fas', icon]"
      class="skuiRowIcon"
    />
    <span class="skuiRowLabel">{{ label }}</span>
    <input
      class="skuiRange"
      type="range"
      :aria-label="label"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="$emit('preview', parseFloat($event.target.value))"
      @change="$emit('commit', parseFloat($event.target.value))"
    >
    <span class="skuiChannelValue">{{ displayValue }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** the row's icon (black-yellow-theme: every settings row carries one) */
  icon: {
    type: String,
    default: 'sliders-h'
  },
  label: {
    type: String,
    required: true
  },
  modelValue: {
    type: Number,
    required: true
  },
  min: {
    type: Number,
    required: true
  },
  max: {
    type: Number,
    required: true
  },
  step: {
    type: Number,
    default: 1
  },
  unit: {
    type: String,
    default: ''
  },
  /** label shown when the value is 0 (e.g. "default") */
  zeroLabel: {
    type: String,
    default: null
  }
})

defineEmits(['preview', 'commit'])

const displayValue = computed(() => {
  if (props.zeroLabel !== null && props.modelValue === 0) { return props.zeroLabel }
  return `${props.modelValue}${props.unit}`
})
</script>

<style scoped src="./SkuiRows.css" />
