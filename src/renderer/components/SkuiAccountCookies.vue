<template>
  <div
    class="skuiDownloadOverlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="skuiDownloadBox">
      <h3 class="skuiDownloadTitle">
        {{ expired
          ? t('SKUI.Account.Dialog.Expired title')
          : ageRestricted ? t('SKUI.Account.Dialog.Age restricted title') : t('SKUI.Account.Dialog.Title') }}
      </h3>

      <p
        v-if="ageRestricted && !expired"
        class="skuiDownloadBody"
      >
        {{ t('SKUI.Account.Dialog.Age restricted') }}
      </p>

      <p
        v-if="expired"
        class="skuiDownloadBody"
      >
        {{ t('SKUI.Account.Dialog.Expired') }}
      </p>

      <p class="skuiDownloadBody skuiAccountPrivate">
        {{ t('SKUI.Account.Dialog.Private') }}
      </p>

      <ol class="skuiAccountSteps">
        <li>{{ t('SKUI.Account.Dialog.Step allow') }}</li>
        <li>{{ t('SKUI.Account.Dialog.Step window') }}</li>
        <li>{{ t('SKUI.Account.Dialog.Step export') }}</li>
        <li>{{ t('SKUI.Account.Dialog.Step close') }}</li>
        <li>{{ IS_ANDROID ? t('SKUI.Account.Dialog.Step import phone') : t('SKUI.Account.Dialog.Step import') }}</li>
      </ol>

      <p
        v-if="error"
        class="skuiDownloadBody skuiAccountError"
      >
        {{ error }}
      </p>

      <div class="skuiDownloadActions">
        <button
          class="skuiPill"
          type="button"
          @click="emit('close')"
        >
          {{ expired || ageRestricted ? t('SKUI.Account.Dialog.Later') : t('SKUI.Download.Cancel') }}
        </button>
        <span class="skuiActionSpacer" />
        <button
          class="skuiPill skuiPillPrimary"
          type="button"
          :disabled="busy"
          @click="importCookies"
        >
          {{ t('SKUI.Account.Import') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// How to get YouTube cookies that last, and the button that takes them in.
// Shown by the settings page's Import button, and by the watch page on its own
// when an age-restricted video meets no imported cookies, or once YouTube stops
// honouring the imported session.

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { importYoutubeCookies } from '../helpers/youtube-account'
import { showToast } from '../helpers/utils'

defineProps({
  /** the imported session was signed out: say so above the instructions */
  expired: {
    type: Boolean,
    default: false
  },
  /** opened by an age-restricted video with no cookies imported: say why first */
  ageRestricted: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['imported', 'close'])

const { t } = useI18n()

const IS_ANDROID = process.env.IS_ANDROID

const busy = ref(false)
const error = ref('')

async function importCookies() {
  busy.value = true
  error.value = ''

  try {
    const status = await importYoutubeCookies()
    if (status !== null) {
      showToast(t('SKUI.Account.Import done'))
      emit('imported', status)
    }
  } catch (caught) {
    error.value = caught.message === 'no-login-cookies'
      ? t('SKUI.Account.No login cookies')
      : t('SKUI.Account.Import failed', { message: caught.message ?? caught })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped src="./SkuiDownloadProgress.css" />
<style scoped>
.skuiAccountPrivate {
  font-weight: 700;
}

.skuiAccountSteps {
  color: var(--primary-color);
  font-size: 0.9em;
  margin-block: 10px 0;
  padding-inline-start: 1.6em;
}

.skuiAccountSteps li {
  padding-block: 0.2em;
}

.skuiAccountError {
  color: var(--skui-warn);
  font-weight: 700;
}

.skuiActionSpacer {
  flex: 1 1 auto;
}

.skuiPillPrimary {
  font-weight: 700;
}
</style>
