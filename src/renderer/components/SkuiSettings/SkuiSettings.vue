<!-- eslint-disable @intlify/vue-i18n/no-dynamic-keys -->
<template>
  <FtSettingsSection
    :title="$t('SKUI.Title')"
  >
    <div class="skuiPage">
      <!--
        Export / Import comes first, as its own separated section — the sister-app
        convention (白い熊 考直's UI page). The two automation rows belong INSIDE it,
        directly below the export rows, so backup lives in one place in every app.
      -->
      <section
        v-if="IS_ANDROID"
        class="skuiSection"
      >
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Backup.Export / Import') }}
        </h4>
        <button
          class="skuiEntryRow skuiIndent1"
          type="button"
          @click="panelOpen = true"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Export / Import…') }}</span>
            <span
              class="skuiEntrySummary"
              :class="{ skuiWarn: backupDirectoryName === null }"
            >
              {{ backupDirectoryName ?? $t('SKUI.Backup.No backup directory set') }}
            </span>
          </span>
        </button>
        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Automation export') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Backup.Automation export description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="automationEnabled"
            @change="updateAutomationEnabled($event.target.checked)"
          >
        </label>
        <div class="skuiEntryRow skuiIndent1">
          <button
            class="skuiEntryText"
            type="button"
            @click="copyAutomationToken"
          >
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Automation token') }}</span>
            <span class="skuiEntrySummary">{{ abbreviatedToken }}</span>
          </button>
          <button
            class="skuiEntryAction"
            type="button"
            @click="regenerateAutomationToken"
          >
            {{ $t('SKUI.Backup.Regenerate') }}
          </button>
        </div>
      </section>

      <section
        v-for="(section, index) in SKUI_SECTIONS"
        :key="section.key"
        class="skuiSection"
      >
        <hr
          v-if="index > 0 || IS_ANDROID"
          class="skuiSectionRule"
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

    <SkuiExportImport
      v-if="panelOpen"
      @close="closePanel"
      @close-chain="closeChain"
    />
  </FtSettingsSection>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import android from 'android'

import FtSettingsSection from '../FtSettingsSection/FtSettingsSection.vue'
import SkuiColorRow from './SkuiColorRow.vue'
import SkuiExportImport from './SkuiExportImport.vue'
import SkuiFontRow from './SkuiFontRow.vue'
import SkuiSliderRow from './SkuiSliderRow.vue'

import { showToast } from '../../helpers/utils'
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

const IS_ANDROID = !!process.env.IS_ANDROID

const { t } = useI18n()
const router = useRouter()

const panelOpen = ref(false)
const backupDirectoryName = ref(null)
const automationEnabled = ref(false)
const automationToken = ref('')

// Queried on opening the page, and again whenever the panel writes something, so the
// folder row and the panel's "last backup" line never show a stale answer.
function refreshBackupState() {
  if (!IS_ANDROID) { return }

  const directory = JSON.parse(android.getBackupDirectory())
  backupDirectoryName.value = directory.tree ? directory.name : null
  automationEnabled.value = android.isAutomationEnabled()
  automationToken.value = android.getAutomationToken()
}

onMounted(refreshBackupState)

const abbreviatedToken = computed(() => {
  const token = automationToken.value
  if (token.length <= 20) { return token }
  return `${token.slice(0, 8)}…${token.slice(-8)}`
})

/**
 * @param {boolean} enabled
 */
function updateAutomationEnabled(enabled) {
  android.setAutomationEnabled(enabled)
  automationEnabled.value = enabled
}

function copyAutomationToken() {
  android.copyToClipboard('automation token', automationToken.value)
  showToast(t('SKUI.Backup.Token copied'))
}

function regenerateAutomationToken() {
  automationToken.value = android.regenerateAutomationToken()
  showToast(t('SKUI.Backup.Token regenerated'))
}

function closePanel() {
  panelOpen.value = false
  refreshBackupState()
}

/**
 * A finished export or import closes the whole chain: the info dialog (already gone by
 * now), the Export/Import panel, and the UI settings page itself.
 */
function closeChain() {
  panelOpen.value = false
  router.back()
}

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
