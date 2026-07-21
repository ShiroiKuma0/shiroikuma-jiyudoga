<!-- eslint-disable @intlify/vue-i18n/no-dynamic-keys -->
<template>
  <FtSettingsSection
    :title="$t('SKUI.Title')"
  >
    <div class="skuiPage">
      <section
        v-for="section in SKUI_SECTIONS"
        :key="section.key"
        class="skuiSection"
      >
        <h4 class="skuiSectionTitle">
          {{ $t(`SKUI.Sections.${section.key}`) }}
        </h4>
        <template
          v-for="group in section.groups"
          :key="group.key ?? 'main'"
        >
          <h5
            v-if="group.key !== null"
            class="skuiGroupTitle skuiIndent1"
          >
            {{ $t(`SKUI.Groups.${group.key}`) }}
          </h5>
          <template
            v-for="slot in group.slots"
            :key="slot.key"
          >
            <SkuiColorRow
              v-if="slot.kind === 'color'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :label="$t(`SKUI.Slots.${slot.key}`)"
              :model-color="resolvedColors[slot.key]"
              :is-overridden="slot.key in themeColors"
              :recent-colors="recentColors"
              @preview="color => previewColor(slot.key, color)"
              @commit="color => commitColor(slot.key, color)"
              @reset="resetColor(slot.key)"
            />
            <SkuiSliderRow
              v-else-if="slot.kind === 'dimen'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :label="$t(`SKUI.Slots.${slot.key}`)"
              :model-value="resolvedDims[slot.key]"
              :min="slot.min"
              :max="slot.max"
              :step="slot.step"
              :unit="slot.unit"
              @preview="value => previewDim(slot.key, value)"
              @commit="value => commitDim(slot.key, value)"
            />
            <SkuiFontRow
              v-else-if="slot.kind === 'font'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :font="resolvedFont"
              :custom-fonts="customFonts"
              :sample-color="sampleColor"
              @update-font="updateFont"
              @add-font="addFont"
            />
          </template>
        </template>
      </section>
    </div>
  </FtSettingsSection>
</template>

<script setup>
import { computed } from 'vue'

import FtSettingsSection from '../FtSettingsSection/FtSettingsSection.vue'
import SkuiColorRow from './SkuiColorRow.vue'
import SkuiFontRow from './SkuiFontRow.vue'
import SkuiSliderRow from './SkuiSliderRow.vue'

import store from '../../store/index'
import {
  SKUI_RECENT_COLORS_MAX,
  SKUI_SECTIONS,
  applySkuiTheme,
  colorToString,
  cssRgba,
  parseColor,
  parseTheme,
  resolveColors,
  resolveDims,
  resolveFont,
} from '../../helpers/skui'

const theme = computed(() => parseTheme(store.getters.getSkuiTheme))
const themeColors = computed(() => theme.value.colors ?? {})
const resolvedColors = computed(() => resolveColors(theme.value))
const resolvedDims = computed(() => resolveDims(theme.value))
const resolvedFont = computed(() => resolveFont(theme.value))
const sampleColor = computed(() => cssRgba(resolvedColors.value.text))

const customFonts = computed(() => {
  try {
    const parsed = JSON.parse(store.getters.getSkuiCustomFonts)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

const recentColors = computed(() => {
  try {
    const parsed = JSON.parse(store.getters.getSkuiRecentColors)
    return (Array.isArray(parsed) ? parsed : []).map(value => parseColor(value)).filter(color => color !== null)
  } catch {
    return []
  }
})

/**
 * Live preview: commit the mutated theme to the store WITHOUT persisting
 * (mutation only) — the App-level watcher restyles the whole app instantly.
 * Persist (dispatch) happens on slider release / explicit actions.
 * @param {object} nextTheme
 * @param {boolean} persist
 */
function pushTheme(nextTheme, persist) {
  const json = JSON.stringify(nextTheme)
  if (persist) {
    store.dispatch('updateSkuiTheme', json)
  } else {
    store.commit('setSkuiTheme', json)
  }
}

function themeWithColor(slotKey, color) {
  const next = { ...theme.value, colors: { ...themeColors.value } }
  next.colors[slotKey] = colorToString(color)
  return next
}

function previewColor(slotKey, color) {
  pushTheme(themeWithColor(slotKey, color), false)
}

function commitColor(slotKey, color) {
  pushTheme(themeWithColor(slotKey, color), true)
  addRecentColor(color)
}

function resetColor(slotKey) {
  const next = { ...theme.value, colors: { ...themeColors.value } }
  delete next.colors[slotKey]
  pushTheme(next, true)
}

function addRecentColor(color) {
  const value = colorToString(color)
  const next = [value]
  for (const existing of recentColors.value) {
    const existingValue = colorToString(existing)
    if (existingValue !== value && next.length < SKUI_RECENT_COLORS_MAX) {
      next.push(existingValue)
    }
  }
  store.dispatch('updateSkuiRecentColors', JSON.stringify(next))
}

function themeWithDim(slotKey, value) {
  const next = { ...theme.value, dims: { ...(theme.value.dims ?? {}) } }
  next.dims[slotKey] = value
  return next
}

function previewDim(slotKey, value) {
  pushTheme(themeWithDim(slotKey, value), false)
}

function commitDim(slotKey, value) {
  pushTheme(themeWithDim(slotKey, value), true)
}

function updateFont(partial, persist) {
  const next = { ...theme.value, font: { ...(theme.value.font ?? {}), ...partial } }
  pushTheme(next, persist)
}

function addFont(font) {
  const withoutDuplicate = customFonts.value.filter(existing => existing.name !== font.name)
  const nextFonts = [...withoutDuplicate, font]
  store.dispatch('updateSkuiCustomFonts', JSON.stringify(nextFonts))
  // register the @font-face immediately so the picker and sample render it
  applySkuiTheme(theme.value, nextFonts)
  updateFont({ family: font.name }, true)
}
</script>

<style scoped src="./SkuiSettings.css" />
