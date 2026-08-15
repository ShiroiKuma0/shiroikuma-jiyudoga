<template>
  <!-- Kept in RELEASE builds too: our own builds ARE release builds, and the WebView's
       console is otherwise unreachable — it never lands in logcat, and remote debugging
       is off. This viewer is the only way to see a JS error on a real device.
       Desktop shows it as well: DevTools is reachable there, but only live, so it is no
       help for a failure noticed after the fact — main keeps the same buffer, and writes
       it to disk besides. -->
  <div>
    <FtPrompt
      v-if="shown"
      :label="t('Log Viewer.Console Log')"
      :inert="hidden"
      :fullscreen="true"
      @click="hideLogViewer"
    >
      <div
        class="logs-wrapper"
        :data-theme="theme"
      >
        <div class="logs">
          <div
            v-for="log in logsReversed"
            :key="log.key"
            :class="[log.level.toLowerCase(), { selected: selectedKeys.has(log.key) }]"
            role="button"
            tabindex="0"
            @click="toggleSelected(log.key)"
            @keydown.enter.space.prevent="toggleSelected(log.key)"
          >
            <FontAwesomeIcon
              v-if="getFaIconFromLevel(log.level) !== null"
              class="level"
              :icon="['fas', getFaIconFromLevel(log.level)]"
            />
            <!-- eslint-disable vue/no-v-html -->
            <span
              class="content"
              v-html="log.content"
            />
            <!-- eslint-enable vue/no-v-html -->
            <span class="source">{{ `${removeQueryString(log.sourceId)}:${log.lineNumber}` }}</span>
            <span class="timestamp">{{ new Date(log.timestamp).toISOString() }}</span>
          </div>
        </div>
        <div class="actions-container">
          <p
            v-if="logPath"
            class="log-path"
          >
            {{ logPath }}
          </p>
          <FtFlexBox>
            <FtButton
              :label="`Copy selected (${selectedKeys.size})`"
              :text-color="null"
              :background-color="null"
              @click="copySelected"
            />
            <FtButton
              label="Copy all"
              :text-color="null"
              :background-color="null"
              @click="copyAll"
            />
            <FtButton
              :label="t('Close')"
              :text-color="null"
              :background-color="null"
              @click="hideLogViewer"
            />
          </FtFlexBox>
        </div>
      </div>
    </FtPrompt>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import android from 'android'
import store from '../../store/index'
import FtFlexBox from '../ft-flex-box/ft-flex-box.vue'
import FtPrompt from '../FtPrompt/FtPrompt.vue'
import FtButton from '../FtButton/FtButton.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { isColourDark } from '../../helpers/android/utils'
import { getConsoleLogs } from '../../helpers/android/system'
import { copyToClipboard, showToast } from '../../helpers/utils'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const {
  logLimit
} = defineProps({
  logLimit: {
    // 50 dropped the interesting entry before it could be read: a single shaka
    // stack trace is one entry, and the cause usually sits well above it.
    type: Number,
    default: 250
  }
})

function getThemeFromBody() {
  const bodyStyle = getComputedStyle(document.body)
  const text = bodyStyle.getPropertyValue('--primary-text-color')
  const isDark = isColourDark(text)
  return isDark ? 'dark' : 'light'
}

function getFaIconFromLevel(level) {
  switch (level) {
    case 'WARNING':
      return 'triangle-exclamation'
    case 'ERROR':
      return 'circle-xmark'
    default:
      return null
  }
}

function removeQueryString(path) {
  if (path.indexOf('?') !== -1) {
    return path.split('?')[0]
  } else {
    return path
  }
}

function onLightModeEnabled() {
  if (store.getters.getBaseTheme === 'system') {
    theme.value = 'light'
  }
}

function onDarkModeEnabled() {
  if (store.getters.getBaseTheme === 'system') {
    theme.value = 'dark'
  }
}

/**
 * Keeps the untouched text in `raw` alongside the HTML that gets rendered: the copy
 * buttons need the original, and `content` is escaped and line-broken beyond recovery.
 * Applied to the backfilled entries too, which previously reached v-html unescaped.
 */
function decorateLog(data) {
  const raw = data.content ?? ''
  return {
    ...data,
    raw,
    content: raw
      // sanitise html
      .replaceAll('&', '&amp;')
      .replaceAll('/', '&#47;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      // format text line breaks and tabs into html (for youtube.js errors)
      .replaceAll('\n', '<br/>')
      .replaceAll('\t', '&nbsp;&nbsp;')
      .replaceAll('  ', '&nbsp;&nbsp;')
  }
}

function onConsoleMessage({ data }) {
  if ('content' in data && data.content !== null) {
    if (data.content.indexOf('found in') === -1 && data.content.indexOf('---> <FtaLogViewer>') === -1) {
      // don't show errors related to the log viewer (creates infinite loop)
      if (!logs.value.some(log => log.key === data.key)) {
        if (logs.value.length > logLimit) {
          logs.value = logs.value.slice(logs.value.length - logLimit)
        }
        logs.value.push(decorateLog(data))
      }
    }
  }
}

function toggleSelected(key) {
  const next = new Set(selectedKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  selectedKeys.value = next
}

function formatLog(log) {
  const timestamp = new Date(log.timestamp).toISOString()
  const source = `${removeQueryString(log.sourceId)}:${log.lineNumber}`
  return `[${timestamp}] ${log.level} ${source}\n${log.raw ?? ''}`
}

/** @param {object[]} entries newest first, as rendered */
function copyLogs(entries, description) {
  if (entries.length === 0) {
    showToast('Tap entries to select them first')
    return
  }
  // Oldest first once copied, so a pasted excerpt reads in the order things happened.
  const text = entries.slice().reverse().map(formatLog).join('\n\n')
  const message = `${description}: ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} copied`

  if (usingAndroid) {
    android.copyToClipboard('console log', text)
    showToast(message)
  } else {
    copyToClipboard(text, { messageOnSuccess: message })
  }
}

function copySelected() {
  copyLogs(logsReversed.value.filter(log => selectedKeys.value.has(log.key)), 'Selected')
}

function copyAll() {
  copyLogs(logsReversed.value, 'All')
}

function hideLogViewer() {
  store.dispatch('hideLogViewer')
}

const usingAndroid = process.env.IS_ANDROID
const theme = ref(getThemeFromBody())
const logs = ref([])
/** Desktop only — where main writes the on-disk copy, shown so it can be found later. */
const logPath = ref('')
/** @type {(() => void) | null} */
let unsubscribeLog = null
/** Keys of the entries tapped for a partial copy. @type {import('vue').Ref<Set<string>>} */
const selectedKeys = ref(new Set())

const baseTheme = computed(function () {
  return store.getters.getBaseTheme
})

watch(baseTheme, () => {
  theme.value = getThemeFromBody()
})

const logsReversed = computed(function () {
  const result = []
  for (let i = logs.value.length - 1; i >= 0; i--) {
    result.push(logs.value[i])
  }
  return result
})

const shown = computed(() => {
  return store.getters.getShowLogViewer
})

const hidden = computed(() => {
  return !store.getters.getShowLogViewer
})

onMounted(async () => {
  if (usingAndroid) {
    window.addEventListener('enabled-light-mode', onLightModeEnabled)
    window.addEventListener('enabled-dark-mode', onDarkModeEnabled)
    // when mounted, backfill the logs so far
    logs.value.push(...getConsoleLogs().map(decorateLog))
    window.addEventListener('console-message', onConsoleMessage)
  } else if (process.env.IS_ELECTRON) {
    // Desktop keeps the same buffer in the main process — a console message has to be caught
    // there for the log to include the ones Chromium reports on the renderer's behalf, a 401
    // on a media URL among them. The entries arrive in the same shape the WebView sends, so
    // everything above this is shared.
    logs.value.push(...(await window.ftElectron.getRendererLogs()).map(decorateLog))
    unsubscribeLog = window.ftElectron.onRendererLogMessage(entry => onConsoleMessage({ data: entry }))
    logPath.value = await window.ftElectron.getRendererLogPath()
  }
})

onBeforeUnmount(() => {
  if (usingAndroid) {
    window.removeEventListener('enabled-light-mode', onLightModeEnabled)
    window.removeEventListener('enabled-dark-mode', onDarkModeEnabled)
    window.removeEventListener('console-message', onConsoleMessage)
  } else {
    unsubscribeLog?.()
  }
})

</script>
<style scoped src="./FtaLogViewer.css" />
