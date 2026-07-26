<template>
  <div
    class="skuiDownloadOverlay"
    role="alertdialog"
    aria-modal="true"
  >
    <div class="skuiDownloadBox">
      <h3 class="skuiDownloadTitle">
        {{ title }}
      </h3>

      <p class="skuiDownloadBody">
        {{ body }}
      </p>

      <div
        v-if="!isFinished"
        class="skuiDownloadTrack"
      >
        <div
          class="skuiDownloadBar"
          :style="{ inlineSize: `${Math.round(fraction * 100)}%` }"
        />
      </div>

      <div class="skuiDownloadActions">
        <button
          class="skuiPill"
          type="button"
          @click="dismiss"
        >
          {{ isFinished ? t('SKUI.Download.OK') : t('SKUI.Download.Cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** @type {'downloading' | 'muxing' | 'writing' | 'done' | 'failed'} */
  stage: {
    type: String,
    required: true
  },
  fraction: {
    type: Number,
    default: 0
  },
  received: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  fileName: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['cancel', 'close'])

const { t } = useI18n()

// once it is over the only action left is dismissing the outcome; while it runs
// the same button aborts
const isFinished = computed(() => props.stage === 'done' || props.stage === 'failed')

function dismiss() {
  if (isFinished.value) {
    emit('close')
  } else {
    emit('cancel')
  }
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (!(bytes > 0)) { return '—' }

  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }

  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

const title = computed(() => {
  switch (props.stage) {
    case 'done': return t('SKUI.Download.Finished')
    case 'failed': return t('SKUI.Download.Failed')
    default: return t('SKUI.Download.Downloading')
  }
})

const body = computed(() => {
  switch (props.stage) {
    case 'done':
      return props.fileName
    case 'failed':
      return props.message
    case 'muxing':
      return t('SKUI.Download.Muxing')
    case 'writing':
      return t('SKUI.Download.Writing')
    default:
      return props.total > 0
        ? `${formatBytes(props.received)} / ${formatBytes(props.total)}`
        : formatBytes(props.received)
  }
})
</script>

<style scoped src="./SkuiDownloadProgress.css" />
