/**
 * 白い熊 自由動画 — the in-app context menu's state and the gestures that raise it.
 *
 * Desktop used to get a NATIVE Electron menu here, which Chromium draws outside the web
 * contents: it could never wear the fork's accent frame, and Android had no menu at all,
 * because a long press on a tile ran no app code whatsoever. One HTML menu now serves both,
 * raised from a single pair of document-level listeners — every target we care about is
 * already an `<a href="#/…">`, so no tile, row or view needs to know about this.
 *
 * The two gestures are deliberately different:
 *
 *  - Desktop listens for `contextmenu` and calls `preventDefault()`, which stops Blink from
 *    asking the browser process for the native menu. `shouldShowMenu` in src/main/index.js
 *    refuses the same links a second time, so exactly one menu appears even if that ever
 *    changes.
 *
 *  - Android drives the press from `pointerdown` + a timer, NEVER from `contextmenu`: the
 *    WebView fires that mid-hold and would steal the gesture, which is the same lesson the
 *    feed-filter pills and the hamburger long-press already record.
 */

import { markRaw, reactive } from 'vue'

import { resolveLinkTarget } from './skuiLinkTargets'

/** Held this long without moving, a press on a link opens the menu. */
const LONG_PRESS_MS = 500

/** Pointer travel that counts as "the finger moved" rather than a press in place. */
const MOVE_SLOP_PX = 8

export const contextMenuState = reactive({
  /** @type {boolean} */
  open: false,
  /** @type {number} */
  x: 0,
  /** @type {number} */
  y: 0,
  /** @type {import('./skuiLinkTargets').SkuiLinkTarget|null} */
  target: null
})

/**
 * @param {{ x: number, y: number, target: import('./skuiLinkTargets').SkuiLinkTarget }} options
 */
export function openContextMenu({ x, y, target }) {
  contextMenuState.x = x
  contextMenuState.y = y
  // markRaw, not decoration: the target's query object goes to the main process for "Open in a
  // New Window", and a Proxy cannot be structured-cloned across IPC -- reactive() would wrap it
  // in one and the send would throw where nothing is watching. The target is read-only data
  // anyway, so there is nothing here worth making reactive.
  contextMenuState.target = markRaw(target)
  contextMenuState.open = true
}

export function closeContextMenu() {
  contextMenuState.open = false
  contextMenuState.target = null
}

/**
 * The player owns its own right-click menu (playback rate, stats for nerds), and a press inside
 * an editable field belongs to the platform so that spellcheck and paste keep working.
 *
 * @param {EventTarget|null} eventTarget
 */
function isClaimedByAnotherSurface(eventTarget) {
  if (!(eventTarget instanceof Element)) { return true }

  return eventTarget.closest('.ftVideoPlayer, input, textarea, [contenteditable="true"]') !== null
}

/**
 * @param {MouseEvent} event
 */
function handleContextMenuEvent(event) {
  if (isClaimedByAnotherSurface(event.target)) { return }

  const target = resolveLinkTarget(event.target)
  if (target === null) { return }

  event.preventDefault()
  openContextMenu({ x: event.clientX, y: event.clientY, target })
}

let longPressTimer = null
let longPressFired = false
let longPressStartX = 0
let longPressStartY = 0

function cancelLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

/**
 * @param {PointerEvent} event
 */
function handlePointerDown(event) {
  cancelLongPress()
  longPressFired = false

  if (isClaimedByAnotherSurface(event.target)) { return }

  const target = resolveLinkTarget(event.target)
  if (target === null) { return }

  longPressStartX = event.clientX
  longPressStartY = event.clientY

  longPressTimer = setTimeout(() => {
    longPressTimer = null
    longPressFired = true
    openContextMenu({ x: longPressStartX, y: longPressStartY, target })
  }, LONG_PRESS_MS)
}

/**
 * @param {PointerEvent} event
 */
function handlePointerMove(event) {
  if (longPressTimer === null) { return }

  if (Math.abs(event.clientX - longPressStartX) > MOVE_SLOP_PX ||
      Math.abs(event.clientY - longPressStartY) > MOVE_SLOP_PX) {
    cancelLongPress()
  }
}

/**
 * The press ends in a click on the link, which would navigate away from the page the menu was
 * just opened over. Swallow that one click in the capture phase, before the anchor sees it.
 *
 * @param {MouseEvent} event
 */
function handleClickCapture(event) {
  if (!longPressFired) { return }

  longPressFired = false
  event.preventDefault()
  event.stopPropagation()
}

export function registerContextMenuTriggers() {
  if (process.env.IS_ANDROID) {
    document.addEventListener('pointerdown', handlePointerDown, { passive: true })
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerup', cancelLongPress, { passive: true })
    document.addEventListener('pointercancel', cancelLongPress, { passive: true })
    document.addEventListener('scroll', cancelLongPress, { capture: true, passive: true })
    document.addEventListener('click', handleClickCapture, { capture: true })
  } else {
    document.addEventListener('contextmenu', handleContextMenuEvent)
  }
}

export function unregisterContextMenuTriggers() {
  if (process.env.IS_ANDROID) {
    cancelLongPress()
    document.removeEventListener('pointerdown', handlePointerDown)
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', cancelLongPress)
    document.removeEventListener('pointercancel', cancelLongPress)
    document.removeEventListener('scroll', cancelLongPress, { capture: true })
    document.removeEventListener('click', handleClickCapture, { capture: true })
  } else {
    document.removeEventListener('contextmenu', handleContextMenuEvent)
  }
}
