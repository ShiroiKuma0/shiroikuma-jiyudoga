<template>
  <div class="skuiRow">
    <button
      class="skuiRowHeader"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="skuiRowLabel">{{ $t('SKUI.Font family') }}</span>
      <span
        class="skuiFontCurrent"
        :style="currentFontStyle"
      >{{ currentFontLabel }}</span>
    </button>
    <div
      v-if="expanded"
      class="skuiFontEditor"
    >
      <div class="skuiFontList">
        <button
          v-for="option in fontOptions"
          :key="option.value"
          type="button"
          class="skuiFontOption"
          :class="{ skuiFontSelected: option.value === font.family }"
          :style="fontStyleFor(option.value)"
          @click="setFamily(option.value)"
        >
          {{ option.label }}
        </button>
        <button
          type="button"
          class="skuiFontOption skuiFontImport"
          @click="importFont"
        >
          {{ $t('SKUI.Import font file') }}
        </button>
      </div>
      <SkuiSliderRow
        class="skuiIndent1"
        :label="$t('SKUI.Font weight')"
        :model-value="font.weight"
        :min="0"
        :max="900"
        :step="100"
        :zero-label="$t('SKUI.Default')"
        @preview="value => $emit('update-font', { weight: value }, false)"
        @commit="value => $emit('update-font', { weight: value }, true)"
      />
      <SkuiSliderRow
        class="skuiIndent1"
        :label="$t('SKUI.Font & UI size')"
        :model-value="font.size"
        :min="50"
        :max="200"
        :step="5"
        unit="%"
        @preview="value => $emit('update-font', { size: value }, false)"
        @commit="value => $emit('update-font', { size: value }, true)"
      />
      <p
        class="skuiFontSample skuiIndent1"
        :style="sampleStyle"
      >
        {{ SKUI_FONT_SAMPLE }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import android from 'android'
import SkuiSliderRow from './SkuiSliderRow.vue'
import { SKUI_FONT_SAMPLE, cssFontFamily } from '../../helpers/skui'
import { requestOpenDialog } from '../../helpers/android/dialogs'
import { awaitAsyncResult } from '../../helpers/android/jsinterface'
import { showToast } from '../../helpers/utils'

const props = defineProps({
  /** resolved font {family, weight, size} */
  font: {
    type: Object,
    required: true
  },
  /** [{name, data, format}] */
  customFonts: {
    type: Array,
    default: () => []
  },
  /** resolved text color css value for the sample line */
  sampleColor: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update-font', 'add-font'])

const { t } = useI18n()

const expanded = ref(false)

const fontOptions = computed(() => {
  return [
    { value: '', label: t('SKUI.Default') },
    { value: '@monospace', label: t('SKUI.Monospace') },
    ...props.customFonts.map(customFont => ({ value: customFont.name, label: customFont.name }))
  ]
})

const currentFontLabel = computed(() => {
  return fontOptions.value.find(option => option.value === props.font.family)?.label ?? props.font.family
})

function fontStyleFor(family) {
  const cssFamily = cssFontFamily(family)
  return cssFamily ? { fontFamily: cssFamily } : {}
}

const currentFontStyle = computed(() => fontStyleFor(props.font.family))

const sampleStyle = computed(() => {
  return {
    ...fontStyleFor(props.font.family),
    fontWeight: props.font.weight > 0 ? `${props.font.weight}` : undefined,
    color: props.sampleColor,
  }
})

function setFamily(family) {
  emit('update-font', { family }, true)
}

/**
 * Pick a font file and return its raw bytes as base64.
 * Fonts are binary, so the shared readFileWithPicker (which decodes text)
 * cannot be used: Android goes through the readFileBase64 JS-interface
 * method, desktop reads an ArrayBuffer from the file picker.
 * @returns {Promise<{filename: string, base64: string} | null>}
 */
async function pickFontFile() {
  if (process.env.IS_ANDROID) {
    const response = await requestOpenDialog(['*/*'])
    if (response.canceled) { return null }
    const base64 = await awaitAsyncResult(android.readFileBase64(response.uri))
    return { filename: response.name, base64 }
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      excludeAcceptAllOption: true,
      multiple: false,
      id: 'skui-fonts',
      types: [{
        description: t('SKUI.Font file'),
        accept: { 'font/ttf': ['.ttf'], 'font/otf': ['.otf'] }
      }],
    })
    const file = await handle.getFile()
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
    }
    return { filename: file.name, base64: btoa(binary) }
  } catch (error) {
    if (error.name === 'AbortError') { return null }
    throw error
  }
}

async function importFont() {
  const picked = await pickFontFile()
  if (picked === null) { return }

  const extension = picked.filename.split('.').at(-1).toLowerCase()
  if (extension !== 'ttf' && extension !== 'otf') {
    showToast(t('SKUI.Only ttf and otf fonts are supported'))
    return
  }

  const name = picked.filename.replace(/\.(ttf|otf)$/i, '')
  emit('add-font', { name, data: picked.base64, format: extension })
}
</script>

<style scoped src="./SkuiRows.css" />
