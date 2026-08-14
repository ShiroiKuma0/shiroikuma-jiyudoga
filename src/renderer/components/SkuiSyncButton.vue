<template>
  <span
    v-if="syncEnabled"
    class="skuiSyncButton"
    :class="{ syncing: busy, failed: lastFailed }"
  >
    <FtIconButton
      :title="buttonTitle"
      :icon="['fas', 'sync']"
      theme="base-no-default"
      :size="20"
      :use-shadow="false"
      :disabled="busy"
      @click="sync"
    />
  </span>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FtIconButton from './FtIconButton/FtIconButton.vue'

import store from '../store/index'

import { runSync } from '../helpers/sync/index'
import { showToast } from '../helpers/utils'

/**
 * 白い熊 自由動画: sync-now, next to the Subscriptions and History headings — the two
 * pages whose contents the sync is actually about, so it can be reached where the
 * question "is this current?" arises rather than only from the settings page.
 *
 * Hidden entirely while the sync is switched off: an icon that cannot do anything is
 * worse than no icon.
 */

const { t } = useI18n()

const busy = ref(false)

const syncEnabled = computed(() => store.getters.getSkuiSyncEnabled)

const lastResult = computed(() => store.getters.getSkuiSyncLastResult)

const lastFailed = computed(() => {
  return lastResult.value.startsWith('error') || lastResult.value === 'no-peer' ||
    lastResult.value === 'no-storage-access' || lastResult.value === 'no-directory'
})

const buttonTitle = computed(() => {
  if (busy.value) { return t('SKUI.Sync.Syncing') }

  const lastRun = store.getters.getSkuiSyncLastRun

  if (lastResult.value === '' || lastRun === 0) { return t('SKUI.Sync.Sync now') }

  // the settings page owns the full status; the tooltip only has to say enough to
  // decide whether pressing it is worthwhile
  return `${t('SKUI.Sync.Sync now')} — ${new Date(lastRun).toLocaleString()}`
})

async function sync() {
  if (busy.value) { return }

  busy.value = true

  try {
    const { status, changeCount = 0 } = await runSync('manual')

    // Only 'ok' and 'ok:<n>' are successes. Everything else — a missing peer, a
    // withheld storage grant, an ssh failure — has to read as a failure here, or a
    // sync that moved nothing because it never ran would look like agreement.
    if (status === 'busy' || status === 'disabled') { return }

    if (!status.startsWith('ok')) {
      showToast(t('SKUI.Sync.Toast failed'))
    } else if (changeCount > 0) {
      showToast(t('SKUI.Sync.Toast merged', { count: changeCount }))
    } else {
      showToast(t('SKUI.Sync.Toast up to date'))
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.skuiSyncButton {
  /* the same red the 白い熊 settings page marks a missing backup folder with; declared
     here because that page defines it on its own root, not globally */
  --skui-warn: #f66;

  display: inline-block;
  margin-inline-start: 8px;
  vertical-align: middle;
}

/* the icon is a circle of arrows, so turning it is the obvious "working" state */
.skuiSyncButton.syncing :deep(svg) {
  animation: skuiSyncSpin 1.1s linear infinite;
}

/* a quiet mark that the last attempt did not land — the detail lives in Settings */
.skuiSyncButton.failed :deep(svg) {
  color: var(--skui-warn);
}

@keyframes skuiSyncSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skuiSyncButton.syncing :deep(svg) {
    animation: none;
    opacity: 60%;
  }
}
</style>
