<template>
  <div
    class="skuiDownloadOverlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    @click.self="emit('cancel')"
    @keydown.esc="emit('cancel')"
  >
    <div class="skuiDownloadBox">
      <h3 class="skuiDownloadTitle">
        {{ t('SKUI.Download.Subtitles Title') }}
      </h3>

      <p class="skuiDownloadBody">
        {{ t('SKUI.Download.Subtitles Body') }}
      </p>

      <div class="skuiSubtitleList">
        <label
          v-for="track in rows"
          :key="track.key"
          class="skuiCheck"
        >
          <input
            type="checkbox"
            :checked="selected.has(track.key)"
            @change="toggle(track.key, $event.target.checked)"
          >
          <span>{{ track.label }}</span>
        </label>
      </div>

      <div class="skuiDownloadActions">
        <button
          class="skuiPill"
          type="button"
          @click="emit('cancel')"
        >
          {{ t('SKUI.Download.Cancel') }}
        </button>
        <span class="skuiActionSpacer" />
        <button
          class="skuiPill skuiPillPrimary"
          type="button"
          @click="start"
        >
          {{ selected.size > 0
            ? t('SKUI.Download.Download With Subtitles', { count: selected.size }, selected.size)
            : t('SKUI.Download.Download Without Subtitles') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import store from '../store/index'

const props = defineProps({
  /** @type {import('../helpers/download-subtitles').SubtitleTrackChoice[]} */
  tracks: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['start', 'cancel'])

const { t } = useI18n()

/**
 * Stable across videos, so last time's ticks can be offered again: the same
 * language means the same choice, kept apart by where the track came from.
 * @param {import('../helpers/download-subtitles').SubtitleTrackChoice} track
 */
function trackKey(track) {
  if (track.isAutotranslated) { return `t:${track.language}` }
  // Invidious tracks carry no vss_id — only the label gives ASR away
  if (track.id?.startsWith('a.') || (!track.id && /auto-generated/i.test(track.label))) {
    return `a:${track.language}`
  }
  return track.language
}

const rows = computed(() => {
  const seen = new Set()
  return props.tracks
    .map((track) => ({ ...track, key: trackKey(track) }))
    .filter((track) => {
      if (seen.has(track.key)) { return false }
      seen.add(track.key)
      return true
    })
})

const remembered = new Set(store.getters.getDownloadSubtitleChoice.split(',').filter((key) => key !== ''))

const selected = ref(new Set(rows.value.filter((track) => remembered.has(track.key)).map((track) => track.key)))

/**
 * @param {string} key
 * @param {boolean} checked
 */
function toggle(key, checked) {
  const next = new Set(selected.value)
  if (checked) {
    next.add(key)
  } else {
    next.delete(key)
  }
  selected.value = next
}

function start() {
  store.dispatch('updateDownloadSubtitleChoice', [...selected.value].join(','))
  // emitted in list order, which is the order the tracks land in the file
  emit('start', rows.value
    .filter((track) => selected.value.has(track.key))
    .map(({ key, ...track }) => track))
}
</script>

<style scoped src="./SkuiDownloadProgress.css" />
<style scoped>
.skuiSubtitleList {
  margin-block-start: 12px;
}

.skuiCheck {
  align-items: center;
  color: var(--primary-color);
  cursor: pointer;
  display: flex;
  gap: 0.55em;
  padding-block: 0.28em;
}

.skuiCheck input {
  accent-color: var(--primary-color);
  block-size: 1.05em;
  flex: 0 0 auto;
  inline-size: 1.05em;
  margin: 0;
}

.skuiActionSpacer {
  flex: 1 1 auto;
}

.skuiPillPrimary {
  font-weight: 700;
}
</style>
