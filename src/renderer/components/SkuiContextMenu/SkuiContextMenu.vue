<template>
  <div
    v-if="state.open && entries.length > 0"
    ref="menu"
    class="skuiContextMenu"
    role="menu"
    tabindex="-1"
    :style="position"
    @keydown.esc.stop.prevent="close"
  >
    <ul class="list">
      <template
        v-for="(entry, index) in entries"
        :key="index"
      >
        <li
          v-if="entry.type === 'divider'"
          class="listItemDivider"
          role="separator"
        />
        <li
          v-else
          class="listItem"
          role="menuitem"
          tabindex="0"
          @click="run(entry)"
          @keydown.enter.prevent="run(entry)"
          @keydown.space.prevent="run(entry)"
        >
          {{ entry.label }}
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import store from '../../store/index'
import { closeContextMenu, contextMenuState } from '../../helpers/skuiContextMenu'
import { externalUrlForTarget } from '../../helpers/skuiLinkTargets'
import { openTab } from '../../helpers/skuiTabs'
import { copyToClipboard, openInternalPath, showToast } from '../../helpers/utils'

const { t } = useI18n()

const state = contextMenuState
const menu = useTemplateRef('menu')

/** Distance kept between the menu and the window edge when it has to be nudged back inside. */
const EDGE_MARGIN_PX = 8

const left = ref(0)
const top = ref(0)

const position = computed(() => ({
  insetInlineStart: `${left.value}px`,
  insetBlockStart: `${top.value}px`
}))

/** @type {import('vue').ComputedRef<boolean>} */
const hideSharingActions = computed(() => store.getters.getHideSharingActions)

/** @type {import('vue').ComputedRef<boolean>} */
const showInvidiousShareOptions = computed(() => {
  return store.getters.getBackendPreference === 'invidious' || store.getters.getBackendFallback
})

const entries = computed(() => {
  const target = state.target
  if (target === null) { return [] }

  const list = [
    { action: 'newTab', label: t('SKUI.Menu.Open in a new tab') }
  ]

  if (process.env.IS_ELECTRON) {
    list.push({ action: 'newWindow', label: t('SKUI.Menu.Open in a new window') })
  }

  if (!hideSharingActions.value) {
    list.push(
      { type: 'divider' },
      { action: 'copyYouTube', label: t('Video.Copy YouTube Link') },
      ...showInvidiousShareOptions.value
        ? [{ action: 'copyInvidious', label: t('Video.Copy Invidious Link') }]
        : []
    )
  }

  // A tile is mostly thumbnail, so our menu wins over the image and has to carry the two
  // entries the native menu used to provide for it.
  if (target.imageUrl !== null) {
    list.push(
      { type: 'divider' },
      ...process.env.IS_ELECTRON
        ? [{ action: 'saveImage', label: t('SKUI.Menu.Save thumbnail as') }]
        : [],
      { action: 'copyImageAddress', label: t('SKUI.Menu.Copy thumbnail address') }
    )
  }

  return list
})

function close() {
  closeContextMenu()
}

/**
 * @param {{ action: string }} entry
 */
function run(entry) {
  const target = state.target
  close()

  if (target === null) { return }

  switch (entry.action) {
    case 'newTab':
      // in the background, beside the page you are on -- reading side by side is the point
      openTab({ path: target.path, query: target.query, title: target.title })
      break
    case 'newWindow':
      openInternalPath({
        path: target.path,
        // an empty object would still put a bare "?" on the new window's URL
        query: Object.keys(target.query).length > 0 ? target.query : undefined,
        doCreateNewWindow: true
      })
      break
    case 'copyYouTube':
      copyToClipboard(externalUrlForTarget(target, true), {
        messageOnSuccess: t('Share.YouTube URL copied to clipboard')
      })
      break
    case 'copyInvidious':
      copyToClipboard(externalUrlForTarget(target, false), {
        messageOnSuccess: t('Share.Invidious URL copied to clipboard')
      })
      break
    case 'copyImageAddress':
      copyToClipboard(target.imageUrl, {
        messageOnSuccess: t('SKUI.Menu.Thumbnail address copied')
      })
      break
    case 'saveImage':
      if (process.env.IS_ELECTRON) {
        window.ftElectron.saveImageAs(target.imageUrl).catch((error) => {
          console.error(error)
          showToast(t('SKUI.Menu.Thumbnail save failed'))
        })
      }
      break
  }
}

/**
 * Place the menu at the pointer, pulled back inside the window when it would hang off an edge.
 * Measured rather than guessed, because the entry list changes with the target.
 */
async function place() {
  left.value = state.x
  top.value = state.y

  await nextTick()

  const element = menu.value
  if (!element) { return }

  const { offsetWidth, offsetHeight } = element

  if (state.x + offsetWidth > window.innerWidth - EDGE_MARGIN_PX) {
    left.value = Math.max(EDGE_MARGIN_PX, state.x - offsetWidth)
  }

  if (state.y + offsetHeight > window.innerHeight - EDGE_MARGIN_PX) {
    top.value = Math.max(EDGE_MARGIN_PX, state.y - offsetHeight)
  }

  // focus the first entry rather than the menu box, so the keyboard lands somewhere that shows
  // a focus ring and Escape still reaches the box by bubbling
  element.querySelector('.listItem')?.focus()
}

/**
 * @param {Event} event
 */
function swallowClick(event) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * @param {Event} event
 */
function handleOutsidePointerDown(event) {
  if (menu.value && event.target instanceof Node && menu.value.contains(event.target)) { return }

  close()

  // The press that dismisses the menu must dismiss it and nothing else -- without this it goes
  // on to activate whatever the menu was covering, which on a grid of tiles is a video.
  window.addEventListener('click', swallowClick, { capture: true, once: true })

  // ...but a press that raises no click at all (a long press on Android often does not) would
  // leave that listener armed to eat the next real one.
  setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 700)
}

watch(() => state.open, (open) => {
  if (open) {
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
  } else {
    document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
    window.removeEventListener('resize', close)
    window.removeEventListener('scroll', close, true)
  }
})

// the position is watched alongside `open` because a right-click while the menu is already
// open moves it rather than reopening it
watch([() => state.open, () => state.x, () => state.y], () => {
  if (state.open) { place() }
})
</script>

<style scoped src="./SkuiContextMenu.css" />
