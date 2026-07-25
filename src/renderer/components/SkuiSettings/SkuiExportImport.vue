<template>
  <Teleport to=".app">
    <div
      class="skuiOverlay"
      tabindex="-1"
      @click.self="cancel"
      @keydown.enter.self="cancel"
      @keydown.esc="cancel"
    >
      <div
        class="skuiPanel"
        role="dialog"
        aria-modal="true"
      >
        <h2 class="skuiPanelTitle">
          {{ $t('SKUI.Backup.Export / Import') }}
        </h2>
        <p class="skuiPanelDesc">
          {{ $t('SKUI.Backup.Panel description') }}
        </p>

        <!--
          Only relevant once automation is on: without All-Files-Access a sister-app run
          that names an absolute `path` outside our folder cannot be honoured, and the
          backup lands in our own folder instead of the shared one.
        -->
        <template v-if="needsAllFilesAccess">
          <p class="skuiStatus skuiWarn">
            {{ $t('SKUI.Backup.All files access needed') }}
          </p>
          <button
            class="skuiPill"
            type="button"
            @click="grantAllFilesAccess"
          >
            {{ $t('SKUI.Backup.Grant access') }}
          </button>
        </template>

        <button
          class="skuiDirBox"
          type="button"
          @click="pickDirectory"
        >
          <span class="skuiDirLabel">{{ $t('SKUI.Backup.Backup folder') }}</span>
          <span
            class="skuiDirValue"
            :class="directory === null ? 'skuiWarn' : 'skuiOk'"
          >
            {{ directory?.name ?? $t('SKUI.Backup.No backup directory set') }}
          </span>
        </button>

        <p
          class="skuiStatus"
          :class="{ skuiWarn: statusIsWarning, skuiOk: !statusIsWarning }"
        >
          {{ statusText }}
        </p>

        <hr class="skuiPanelRule">

        <label class="skuiCheck skuiCheckAll">
          <input
            type="checkbox"
            :checked="allSelected"
            @change="toggleAll($event.target.checked)"
          >
          <span>{{ $t('SKUI.Backup.Select all') }}</span>
        </label>

        <label
          v-for="category in categories"
          :key="category.id"
          class="skuiCheck"
          :class="{ skuiCheckChild: category.parent !== null }"
        >
          <input
            type="checkbox"
            :checked="isChecked(category)"
            @change="toggleCategory(category, $event.target.checked)"
          >
          <span>{{ category.label }}</span>
        </label>

        <hr class="skuiPanelRule">

        <div class="skuiActions">
          <button
            class="skuiPill"
            type="button"
            :disabled="busy"
            @click="cancel"
          >
            {{ $t('SKUI.Backup.Cancel') }}
          </button>
          <span class="skuiActionSpacer" />
          <button
            class="skuiPill"
            type="button"
            :disabled="busy"
            @click="startImport"
          >
            {{ $t('SKUI.Backup.Import') }}
          </button>
          <button
            class="skuiPill"
            type="button"
            :disabled="busy"
            @click="startExport"
          >
            {{ $t('SKUI.Backup.Export') }}
          </button>
        </div>
      </div>

      <div
        v-if="info !== null"
        class="skuiInfoOverlay"
      >
        <div
          class="skuiInfoBox"
          role="alertdialog"
          aria-modal="true"
        >
          <h3 class="skuiInfoTitle">
            {{ info.title }}
          </h3>
          <p class="skuiInfoBody">
            {{ info.body }}
          </p>
          <div class="skuiInfoActions">
            <button
              v-if="info.kind === 'imported'"
              class="skuiPill"
              type="button"
              @click="acknowledgeInfo"
            >
              {{ $t('SKUI.Backup.Later') }}
            </button>
            <button
              v-if="info.kind === 'imported'"
              class="skuiPill"
              type="button"
              @click="restartApp"
            >
              {{ $t('SKUI.Backup.Restart now') }}
            </button>
            <button
              v-else
              class="skuiPill"
              type="button"
              @click="acknowledgeInfo"
            >
              {{ $t('SKUI.Backup.OK') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import android from 'android'

import { awaitAsyncResult } from '../../helpers/android/jsinterface'

const { t } = useI18n()

/**
 * `close` — dismiss the panel only (a failure leaves everything else standing).
 * `closeChain` — a finished export/import: dismiss the panel AND the UI settings page.
 */
const emit = defineEmits(['close', 'closeChain'])

/** @type {import('vue').Ref<{ id: string, label: string, parent: string | null, leaf: boolean }[]>} */
const categories = ref([])
const selected = ref(new Set())

/** @type {import('vue').Ref<{ tree: string, path: string, name: string } | null>} */
const directory = ref(null)
/** @type {import('vue').Ref<{ name: string, timestamp: number } | null>} */
const latest = ref(null)

const busy = ref(false)
const needsAllFilesAccess = ref(false)
/** @type {import('vue').Ref<{ kind: string, title: string, body: string } | null>} */
const info = ref(null)

const leaves = computed(() => categories.value.filter(category => category.leaf))
const allSelected = computed(() => leaves.value.length > 0 && leaves.value.every(leaf => selected.value.has(leaf.id)))

/** The last-export line: red while there is nothing to restore from, yellow once there is. */
const statusIsWarning = computed(() => directory.value === null || latest.value === null)

const statusText = computed(() => {
  if (busy.value) { return t('SKUI.Backup.Working') }
  if (directory.value === null) { return t('SKUI.Backup.No backup directory set') }
  if (latest.value === null) { return t('SKUI.Backup.No backup in this folder yet') }
  return t('SKUI.Backup.Last backup', { when: formatTimestamp(latest.value.timestamp), name: latest.value.name })
})

onMounted(() => {
  categories.value = JSON.parse(android.listBackupCategories())
  selected.value = new Set(leaves.value.map(leaf => leaf.id))
  refresh()
})

/** Re-reads the folder and the newest backup in it — done on open and after every write. */
function refresh() {
  const parsed = JSON.parse(android.getBackupDirectory())
  directory.value = parsed.tree ? parsed : null

  const newest = directory.value === null ? {} : JSON.parse(android.getLatestBackup())
  latest.value = newest.name ? newest : null

  needsAllFilesAccess.value = android.isAutomationEnabled() && !android.hasAllFilesAccess()
}

function grantAllFilesAccess() {
  android.requestAllFilesAccess()
}

/**
 * @param {number} timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// ---- selection ----

/** A parent is ticked when every child of it is; sub-options follow their parent's toggle. */
function isChecked(category) {
  if (category.leaf) { return selected.value.has(category.id) }
  return childrenOf(category.id).every(child => selected.value.has(child.id))
}

function childrenOf(id) {
  return categories.value.filter(category => category.parent === id)
}

function toggleCategory(category, checked) {
  const next = new Set(selected.value)
  const affected = category.leaf ? [category] : childrenOf(category.id)
  for (const one of affected) {
    if (checked) { next.add(one.id) } else { next.delete(one.id) }
  }
  selected.value = next
}

function toggleAll(checked) {
  selected.value = checked ? new Set(leaves.value.map(leaf => leaf.id)) : new Set()
}

// ---- folder ----

async function pickDirectory() {
  const response = await awaitAsyncResult(android.pickBackupDirectory())
  if (response === 'USER_CANCELED') { return false }
  refresh()
  return true
}

// ---- export / import ----

async function startExport() {
  if (selected.value.size === 0) {
    showFailure(t('SKUI.Backup.Export failed'), t('SKUI.Backup.No categories selected'))
    return
  }
  if (directory.value === null && !await pickDirectory()) { return }

  busy.value = true
  try {
    const written = JSON.parse(await awaitAsyncResult(android.exportState([...selected.value].join(','))))
    refresh()
    info.value = {
      kind: 'exported',
      title: t('SKUI.Backup.Export finished'),
      body: `${written.name}\n${written.human} · ${t('SKUI.Backup.N categories', { count: written.categories })}\n${written.path}`
    }
  } catch (error) {
    showFailure(t('SKUI.Backup.Export failed'), `${error}`)
  } finally {
    busy.value = false
  }
}

async function startImport() {
  if (selected.value.size === 0) {
    showFailure(t('SKUI.Backup.Import failed'), t('SKUI.Backup.No categories selected'))
    return
  }

  const picked = await awaitAsyncResult(android.requestOpenDialog('application/zip,application/octet-stream,*/*'))
  if (picked === 'USER_CANCELED') { return }

  busy.value = true
  try {
    const summary = await awaitAsyncResult(android.importState(JSON.parse(picked).uri, [...selected.value].join(',')))
    info.value = {
      kind: 'imported',
      title: t('SKUI.Backup.Import finished'),
      body: `${summary}\n\n${t('SKUI.Backup.Restart hint')}`
    }
  } catch (error) {
    showFailure(t('SKUI.Backup.Import failed'), `${error}`)
  } finally {
    busy.value = false
  }
}

function showFailure(title, body) {
  info.value = { kind: 'failed', title, body }
}

/**
 * Acknowledging a FINISHED export or import closes the whole chain — the info dialog, the
 * panel beneath it and the UI settings page. A failure only dismisses the dialog, so the
 * panel stays put and the run can be retried.
 */
function acknowledgeInfo() {
  const finished = info.value?.kind !== 'failed'
  info.value = null
  if (finished) { emit('closeChain') }
}

function restartApp() {
  android.restart()
}

function cancel() {
  if (info.value === null && !busy.value) { emit('close') }
}
</script>

<style scoped src="./SkuiExportImport.css" />
