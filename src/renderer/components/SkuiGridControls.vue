<template>
  <span class="skuiGridControls">
    <FtIconButton
      :title="t('Skui Grid.Adjust Grid')"
      :icon="['fas', 'sliders-h']"
      theme="base-no-default"
      :size="20"
      :use-shadow="false"
      @click="panelShown = !panelShown"
    />
    <div
      v-if="panelShown"
      class="panel"
    >
      <div class="row">
        <span class="label">{{ t('Skui Grid.Thumbnail Width') }}</span>
        <input
          type="range"
          min="120"
          max="640"
          step="2"
          :value="thumbWidth"
          :aria-label="t('Skui Grid.Thumbnail Width')"
          @input="setSetting('SkuiGridThumbWidth', $event.target.value)"
        >
        <span class="value">{{ thumbWidth + 'px' }}</span>
      </div>
      <div class="row">
        <span class="label">{{ t('Skui Grid.Title Font Size') }}</span>
        <input
          type="range"
          min="10"
          max="42"
          step="1"
          :value="titleSize"
          :aria-label="t('Skui Grid.Title Font Size')"
          @input="setSetting('SkuiGridTitleSize', $event.target.value)"
        >
        <span class="value">{{ titleSize + 'px' }}</span>
      </div>
      <div class="row">
        <span class="label">{{ t('Skui Grid.Title Max Lines') }}</span>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          :value="titleLines"
          :aria-label="t('Skui Grid.Title Max Lines')"
          @input="setSetting('SkuiGridTitleLines', $event.target.value)"
        >
        <span class="value">{{ titleLines }}</span>
      </div>
    </div>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FtIconButton from './FtIconButton/FtIconButton.vue'

import store from '../store/index'

import { debounce } from '../helpers/utils'

const { t } = useI18n()

const panelShown = ref(false)

const thumbWidth = computed(() => store.getters.getSkuiGridThumbWidth)
const titleSize = computed(() => store.getters.getSkuiGridTitleSize)
const titleLines = computed(() => store.getters.getSkuiGridTitleLines)

// live in-memory commit while dragging, persisted once the slider settles
const persisters = {
  SkuiGridThumbWidth: debounce((value) => store.dispatch('updateSkuiGridThumbWidth', value), 500),
  SkuiGridTitleSize: debounce((value) => store.dispatch('updateSkuiGridTitleSize', value), 500),
  SkuiGridTitleLines: debounce((value) => store.dispatch('updateSkuiGridTitleLines', value), 500)
}

/**
 * @param {'SkuiGridThumbWidth' | 'SkuiGridTitleSize' | 'SkuiGridTitleLines'} key
 * @param {string} rawValue
 */
function setSetting(key, rawValue) {
  const value = Number(rawValue)
  store.commit(`set${key}`, value)
  persisters[key](value)
}
</script>

<style scoped>
.skuiGridControls {
  position: relative;
  display: inline-block;
  margin-inline-start: 8px;
  vertical-align: middle;
}

.panel {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-start: 0;
  z-index: 20;
  min-inline-size: 340px;
  padding: 14px;
  background-color: var(--card-bg-color);
  border: 1px solid var(--primary-color);
  border-radius: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-block: 6px;
  font-size: 15px;
  font-weight: normal;
}

.label {
  flex: 1;
  white-space: nowrap;
}

.row input[type='range'] {
  flex: 2;
  min-inline-size: 120px;
  accent-color: var(--primary-color);
}

.value {
  min-inline-size: 48px;
  text-align: end;
}
</style>
