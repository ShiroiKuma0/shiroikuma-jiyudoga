<!-- eslint-disable @intlify/vue-i18n/no-dynamic-keys -->
<!--
  白い熊 UI settings › Diagnostics (diagnostics-ui-settings, the convention every 白い熊 app
  follows): every diagnostic behind its own switch, all off by default, grouped by theme; then
  marking, then what has been recorded — stored, kept for N days, export, share / open, purge.
  The switches and the files belong to the platform (helpers/diag.js explains why).
-->
<template>
  <SkuiFoldSection
    section-key="diagnostics"
    :title="$t('SKUI.Diag.Section')"
  >
    <p class="skuiEntrySummary skuiIndent1">
      {{ $t('SKUI.Diag.Description') }}
    </p>

    <template
      v-for="kind in DIAG_KINDS"
      :key="kind.key"
    >
      <h5 class="skuiGroupTitle skuiIndent1">
        {{ $t(`SKUI.Diag.Groups.${kind.group}`) }}
      </h5>
      <label class="skuiEntryRow skuiIndent2">
        <FontAwesomeIcon
          :icon="['fas', kind.icon]"
          :class="`skuiRowIcon skuiRole-${kind.role}`"
        />
        <span class="skuiEntryText">
          <span class="skuiEntryTitle">{{ $t(`SKUI.Diag.Kinds.${kind.key}`) }}</span>
          <span class="skuiEntrySummary">{{ $t(`SKUI.Diag.Kinds.${kind.key} description`) }}</span>
        </span>
        <input
          class="skuiEntrySwitch"
          type="checkbox"
          :checked="diagState.on[kind.key]"
          @change="toggle(kind.key, $event.target.checked)"
        >
      </label>
    </template>

    <h5 class="skuiGroupTitle skuiIndent1">
      {{ $t('SKUI.Diag.Groups.Recording') }}
    </h5>
    <div class="skuiPillRow skuiIndent2">
      <button
        class="skuiPill"
        type="button"
        :disabled="!diagRecording"
        @click="mark"
      >
        <FontAwesomeIcon
          :icon="['fas', 'map-pin']"
          class="skuiRowIcon skuiRole-message"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Mark') }}</span>
      </button>
      <span class="skuiEntrySummary skuiPillSummary">
        {{ IS_ANDROID ? $t('SKUI.Diag.Mark description Android') : $t('SKUI.Diag.Mark description desktop') }}
      </span>
    </div>
    <div class="skuiPillRow skuiIndent2">
      <button
        class="skuiPill"
        type="button"
        :disabled="!diagRecording"
        @click="allOff"
      >
        <FontAwesomeIcon
          :icon="['fas', 'power-off']"
          class="skuiRowIcon skuiRole-block"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Turn all off') }}</span>
      </button>
    </div>

    <h5 class="skuiGroupTitle skuiIndent1">
      {{ $t('SKUI.Diag.Groups.Recorded') }}
    </h5>
    <div class="skuiEntryRow skuiIndent2">
      <FontAwesomeIcon
        :icon="['fas', 'database']"
        class="skuiRowIcon skuiRole-view"
      />
      <span class="skuiEntryText">
        <span class="skuiEntryTitle">{{ $t('SKUI.Diag.Stored') }}</span>
        <span class="skuiEntrySummary">{{ storedText }}</span>
        <span
          v-if="diagState.directory"
          class="skuiEntrySummary"
        >{{ diagState.directory }}</span>
      </span>
    </div>
    <SkuiSliderRow
      class="skuiIndent2"
      icon="calendar-days"
      :label="$t('SKUI.Diag.Keep for days')"
      :model-value="keepDays"
      :min="0"
      :max="MAX_KEEP_DAYS"
      :unit="$t('SKUI.Diag.days unit')"
      :zero-label="$t('SKUI.Diag.Keep everything')"
      @preview="value => keepDays = value"
      @commit="commitKeepDays"
    />
    <div class="skuiPillRow skuiIndent2">
      <button
        class="skuiPill skuiPillMain skuiPillOpens"
        type="button"
        :disabled="busy || nothingStored"
        @click="exportFiles"
      >
        <FontAwesomeIcon
          :icon="['fas', 'file-export']"
          class="skuiRowIcon skuiRole-share"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Export') }}</span>
      </button>
      <span class="skuiEntrySummary skuiPillSummary">{{ $t('SKUI.Diag.Export description') }}</span>
    </div>
    <div class="skuiPillRow skuiIndent2">
      <button
        v-if="IS_ANDROID"
        class="skuiPill skuiPillOpens"
        type="button"
        :disabled="nothingStored"
        @click="share"
      >
        <FontAwesomeIcon
          :icon="['fas', 'share-alt']"
          class="skuiRowIcon skuiRole-share"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Share') }}</span>
      </button>
      <button
        v-else
        class="skuiPill skuiPillOpens"
        type="button"
        @click="openDirectory"
      >
        <FontAwesomeIcon
          :icon="['fas', 'hard-drive']"
          class="skuiRowIcon skuiRole-view"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Open directory') }}</span>
      </button>
    </div>
    <div class="skuiPillRow skuiIndent2">
      <button
        class="skuiPill skuiPillDanger"
        type="button"
        :disabled="busy || nothingStored"
        @click="askPurge"
      >
        <FontAwesomeIcon
          :icon="['fas', 'trash']"
          class="skuiRowIcon skuiRole-delete"
        />
        <span class="skuiPillLabel">{{ $t('SKUI.Diag.Purge') }}</span>
      </button>
    </div>

    <FtPrompt
      v-if="purgePromptShown"
      :label="$t('SKUI.Diag.Purge confirm', { files: summary?.files ?? 0, size: formatBytes(summary?.bytes ?? 0) })"
      :option-names="purgeOptionNames"
      :option-values="PURGE_OPTION_VALUES"
      is-first-option-destructive
      @click="handlePurgePrompt"
    >
      <template #label="{ labelId }">
        <h2
          :id="labelId"
          class="center"
        >
          {{ $t('SKUI.Diag.Purge confirm', { files: summary?.files ?? 0, size: formatBytes(summary?.bytes ?? 0) }) }}
        </h2>
        <p class="skuiPurgeDetail">
          {{ purgeDetail }}
        </p>
      </template>
    </FtPrompt>
  </SkuiFoldSection>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FtPrompt from '../FtPrompt/FtPrompt.vue'
import SkuiFoldSection from './SkuiFoldSection.vue'
import SkuiSliderRow from './SkuiSliderRow.vue'

import {
  DIAG_KINDS,
  diagCleanup,
  diagExport,
  diagMark,
  diagOpenDirectory,
  diagPurge,
  diagRecording,
  diagShare,
  diagState,
  diagSummary,
  refreshDiagState,
  setDiagKeepDays,
  setDiagKind,
} from '../../helpers/diag'
import { showToast } from '../../helpers/utils'

const IS_ANDROID = !!process.env.IS_ANDROID
const MAX_KEEP_DAYS = 60
const PURGE_OPTION_VALUES = ['delete', 'cancel']

const { t } = useI18n()

/** @type {import('vue').Ref<import('../../helpers/diag').DiagSummary | null>} */
const summary = ref(null)
const busy = ref(false)
const purgePromptShown = ref(false)
const keepDays = ref(diagState.keepDays)

watch(() => diagState.keepDays, value => { keepDays.value = value })

async function refreshSummary() {
  summary.value = await diagSummary()
}

onMounted(async () => {
  await refreshDiagState()
  await refreshSummary()
})

// Keep for N days takes effect on leaving the page (and at every start), not while the slider moves.
onBeforeUnmount(() => {
  diagCleanup()
})

const nothingStored = computed(() => (summary.value?.files ?? 0) === 0)

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** @param {number} millis */
function formatTime(millis) {
  const date = new Date(millis)
  const pad = number => String(number).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** @param {number} millis */
function formatClock(millis) {
  const date = new Date(millis)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const storedText = computed(() => {
  const value = summary.value

  if (value === null || value.files === 0) return t('SKUI.Diag.Nothing stored')

  return t('SKUI.Diag.Stored summary', {
    files: value.files,
    size: formatBytes(value.bytes),
    days: Object.keys(value.days).length,
    from: formatTime(value.first),
    to: formatTime(value.last)
  })
})

/** Exactly what Purge would delete: per kind, then per day with its time span. */
const purgeDetail = computed(() => {
  const value = summary.value

  if (value === null) return ''

  const kinds = Object.entries(value.kinds).map(([kind, info]) =>
    // eslint-disable-next-line @intlify/vue-i18n/no-dynamic-keys
    `${t(`SKUI.Diag.Kinds.${kind}`)}: ${info.files} · ${formatBytes(info.bytes)} · ${formatTime(info.first)} – ${formatTime(info.last)}`
  )
  const days = Object.entries(value.days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, [start, end]]) => `${day}  ${formatClock(start)}–${formatClock(end)}`)

  return [...kinds, '', ...days].join('\n')
})

const purgeOptionNames = computed(() => [t('SKUI.Diag.Delete forever'), t('Cancel')])

/**
 * @param {string} kind
 * @param {boolean} value
 */
async function toggle(kind, value) {
  await setDiagKind(kind, value)
  await refreshSummary()
}

async function mark() {
  const number = await diagMark()

  showToast(number > 0 ? t('SKUI.Diag.Marked', { number }) : t('SKUI.Diag.Nothing recording'))
  await refreshSummary()
}

async function allOff() {
  for (const kind of DIAG_KINDS) {
    if (diagState.on[kind.key]) {
      await setDiagKind(kind.key, false)
    }
  }

  await refreshSummary()
}

/** @param {number} value */
async function commitKeepDays(value) {
  keepDays.value = value
  await setDiagKeepDays(Math.round(value))
}

async function exportFiles() {
  busy.value = true

  try {
    const where = await diagExport()

    if (where !== null) {
      showToast(t('SKUI.Diag.Exported', { where }))
    }
  } catch (error) {
    showToast(t('SKUI.Diag.Export failed', { message: String(error) }))
  } finally {
    busy.value = false
  }
}

function share() {
  if (!diagShare()) {
    showToast(t('SKUI.Diag.Nothing stored'))
  }
}

function openDirectory() {
  diagOpenDirectory()
}

async function askPurge() {
  await refreshSummary()

  if (!nothingStored.value) {
    purgePromptShown.value = true
  }
}

/** @param {'delete' | 'cancel' | null} option */
async function handlePurgePrompt(option) {
  purgePromptShown.value = false

  if (option !== 'delete') return

  busy.value = true

  try {
    const removed = await diagPurge()

    showToast(t('SKUI.Diag.Purged', { files: removed }))
  } finally {
    busy.value = false
    await refreshSummary()
  }
}
</script>

<style scoped src="./SkuiSettings.css" />
<style scoped>
.skuiPurgeDetail {
  font-family: monospace;
  font-size: 0.85em;
  text-align: start;
  white-space: pre-line;
}
</style>
