/**
 * 白い熊 自由動画 — the hover bubble that finishes a clamped title.
 *
 * A grid tile caps its title at `--sk-grid-title-lines` lines, so a long video name ends in an
 * ellipsis and there is no way to read the rest of it short of opening the video. Hovering the
 * title now floats the whole string above it.
 *
 * Driven from ONE pair of document-level listeners, the way the context menu is: every title in
 * the app is already an `<h3 class="h3Title">` inside a list item, so no tile, row or view needs
 * to know this exists. The bubble is raised only when the title is ACTUALLY truncated — a name
 * that fits is a name you can already read, and a bubble repeating it would be noise over every
 * tile in the grid.
 *
 * Desktop only, and mouse only. Android has no hover (a long press there belongs to the context
 * menu), and a stylus or finger on a desktop touchscreen would otherwise raise a bubble that no
 * subsequent "leave" event ever dismisses.
 */

import { reactive } from 'vue'

/** The titles we offer to complete: every list item's heading (video, playlist, channel, hashtag). */
const TITLE_SELECTOR = '.h3Title'

/** Hovered this long before the bubble appears, so a glance across a grid raises nothing. */
const HOVER_DELAY_MS = 350

/** A line-clamped box overflows vertically, a single-line ellipsis horizontally; 1px is rounding. */
const OVERFLOW_SLOP_PX = 1

export const titleTooltipState = reactive({
  /** @type {boolean} */
  open: false,
  /** @type {string} */
  text: '',
  /** @type {{ top: number, bottom: number, left: number, right: number }|null} */
  anchor: null
})

/**
 * @param {Element} element
 */
function isTruncated(element) {
  return element.scrollHeight - element.clientHeight > OVERFLOW_SLOP_PX ||
    element.scrollWidth - element.clientWidth > OVERFLOW_SLOP_PX
}

/** @type {ReturnType<typeof setTimeout>|null} */
let hoverTimer = null

/** @type {Element|null} */
let hoveredTitle = null

function cancelPending() {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

export function closeTitleTooltip() {
  cancelPending()
  hoveredTitle = null
  titleTooltipState.open = false
  titleTooltipState.text = ''
  titleTooltipState.anchor = null
}

/**
 * @param {Element} element
 */
function openTitleTooltip(element) {
  const { top, bottom, left, right } = element.getBoundingClientRect()

  // the rect is kept, not the element: the bubble places itself against the title's box and
  // never reaches back into the page, and a closed bubble must not pin a detached tile alive
  titleTooltipState.text = element.textContent.trim()
  titleTooltipState.anchor = { top, bottom, left, right }
  titleTooltipState.open = true
}

/**
 * Every move in the document decides which title (if any) the pointer is over, so leaving a
 * title for the rest of the page dismisses the bubble without a second listener.
 *
 * @param {PointerEvent} event
 */
function handlePointerOver(event) {
  if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) { return }

  const element = event.target.closest(TITLE_SELECTOR)
  if (element === hoveredTitle) { return }

  closeTitleTooltip()

  if (element === null || !isTruncated(element)) { return }

  hoveredTitle = element
  hoverTimer = setTimeout(() => {
    hoverTimer = null

    // the grid can re-render under a resting pointer, which leaves us holding a tile that is no
    // longer in the document
    if (hoveredTitle === element && element.isConnected) {
      openTitleTooltip(element)
    }
  }, HOVER_DELAY_MS)
}

/**
 * The pointer leaving the window raises no `pointerover` at all, so the bubble would otherwise
 * stay behind on a title nobody is pointing at any more.
 *
 * @param {PointerEvent} event
 */
function handlePointerOut(event) {
  if (event.relatedTarget === null) { closeTitleTooltip() }
}

export function registerTitleTooltipTriggers() {
  if (process.env.IS_ANDROID) { return }

  document.addEventListener('pointerover', handlePointerOver)
  document.addEventListener('pointerout', handlePointerOut)
  document.addEventListener('pointerdown', closeTitleTooltip)

  // the anchor is a rect in viewport coordinates, so anything that moves the page under it
  // (a scroll, a resize, a Ctrl+wheel grid zoom) invalidates the bubble's placement
  window.addEventListener('scroll', closeTitleTooltip, true)
  window.addEventListener('resize', closeTitleTooltip)
  window.addEventListener('wheel', closeTitleTooltip, { passive: true })
}

export function unregisterTitleTooltipTriggers() {
  if (process.env.IS_ANDROID) { return }

  document.removeEventListener('pointerover', handlePointerOver)
  document.removeEventListener('pointerout', handlePointerOut)
  document.removeEventListener('pointerdown', closeTitleTooltip)

  window.removeEventListener('scroll', closeTitleTooltip, true)
  window.removeEventListener('resize', closeTitleTooltip)
  window.removeEventListener('wheel', closeTitleTooltip)

  closeTitleTooltip()
}
