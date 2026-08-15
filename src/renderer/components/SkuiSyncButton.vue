<template>
  <span
    v-if="syncEnabled"
    class="skuiSyncButton"
    :class="{ syncing: busy, failed: lastFailed }"
  >
    <span
      class="divider"
      aria-hidden="true"
    />
    <button
      class="trigger"
      :title="buttonTitle"
      :disabled="busy"
      @click="sync"
    >
      <FontAwesomeIcon
        class="icon"
        :icon="['fas', 'exchange-alt']"
      />
      <span class="label">{{ t('SKUI.Sync.Label') }}</span>
    </button>
  </span>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

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
 *
 * It is deliberately NOT a circle of arrows. Upstream's feed-refresh button sits a few
 * centimetres away in the floating widget and owns that glyph — universally "reload" —
 * so two identical circles meant two different things on one screen. This one is the
 * straight exchange pair with the word beside it, and a hairline keeps it off the
 * grid-sliders popup it shares the heading with (白い熊, 2026-08-15).
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

  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-inline-start: 8px;
  vertical-align: middle;
}

/* separates the sync control from whatever tool icon precedes it — the grid-sliders
   popup on Subscriptions, the heading text itself on History */
.divider {
  inline-size: 1px;
  block-size: 1.1em;
  background-color: var(--tertiary-text-color);
  opacity: 55%;
}

/* one hit target for the glyph and the word together, styled like FtIconButton's
   base-no-default theme rather than borrowing the component, which only carries a
   dropdown we do not use */
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 0;
  border-radius: 20px;
  background-color: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  transition: background 0.15s ease-out;
}

.trigger:hover:not(:disabled),
.trigger:focus-visible {
  background-color: var(--side-nav-hover-color);
  color: var(--side-nav-hover-text-color);
}

.trigger:disabled {
  cursor: default;
}

.icon {
  font-size: 20px;
}

/* the heading is large; the word only has to name the button, not compete with it */
.label {
  font-size: 0.62em;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* a straight double arrow cannot spin — turning it reads as broken rather than busy —
   so the working state is a pulse instead */
.skuiSyncButton.syncing .trigger {
  animation: skuiSyncPulse 1.1s ease-in-out infinite;
}

/* a quiet mark that the last attempt did not land — the detail lives in Settings */
.skuiSyncButton.failed .trigger {
  color: var(--skui-warn);
}

@keyframes skuiSyncPulse {
  0%,
  100% {
    opacity: 100%;
  }

  50% {
    opacity: 40%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skuiSyncButton.syncing .trigger {
    animation: none;
    opacity: 60%;
  }
}
</style>
