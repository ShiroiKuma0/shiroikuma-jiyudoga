/**
 * What each row of the app's action menus is: its icon, the role its icon is coloured by, and
 * whether it opens something (a ›) or deletes (red frame, icon and label) — black-yellow-theme,
 * "Menus — every action row is a full-width pill with its icon".
 *
 * Keyed by the option's `value` (FtIconButton dropdowns) or `action` (SkuiContextMenu), so the
 * call sites that build the menus — most of them upstream's — stay as they are. A menu whose
 * options carry an `active` flag is a pure choice list and is not drawn from this table.
 *
 * The roles are the menu icon roles of the theme (helpers/skui.js, "Row icons"):
 * connect, message, contact, share, view, block, delete.
 * @type {Record<string, { icon: string, role: string, opens?: boolean, destructive?: boolean }>}
 */
export const SKUI_MENU_ITEMS = {
  // the ⋯ menu of a video tile
  history: { icon: 'clock-rotate-left', role: 'view' },
  moveVideoTop: { icon: 'arrow-up', role: 'view' },
  moveVideoBottom: { icon: 'arrow-down', role: 'view' },
  copyYoutube: { icon: 'copy', role: 'share' },
  copyYoutubeEmbed: { icon: 'copy', role: 'share' },
  copyInvidious: { icon: 'copy', role: 'share' },
  copyYoutubeChannel: { icon: 'copy', role: 'share' },
  copyInvidiousChannel: { icon: 'copy', role: 'share' },
  openYoutube: { icon: 'arrow-up-right-from-square', role: 'view', opens: true },
  openYoutubeEmbed: { icon: 'arrow-up-right-from-square', role: 'view', opens: true },
  openInvidious: { icon: 'arrow-up-right-from-square', role: 'view', opens: true },
  openYoutubeChannel: { icon: 'circle-user', role: 'contact', opens: true },
  openInvidiousChannel: { icon: 'circle-user', role: 'contact', opens: true },
  hideChannel: { icon: 'eye-slash', role: 'block' },
  unhideChannel: { icon: 'eye', role: 'view' },
  enableSponsorBlockOnChannel: { icon: 'shield', role: 'connect' },
  disableSponsorBlockOnChannel: { icon: 'shield', role: 'block' },
  blockSimilarSeed: { icon: 'ban', role: 'block' },

  // the format menu of the watch page
  dash: { icon: 'film', role: 'view' },
  legacy: { icon: 'video', role: 'view' },
  audio: { icon: 'music', role: 'message' },

  // the right-click / long-press menu on an in-app link
  newTab: { icon: 'clone', role: 'view', opens: true },
  newWindow: { icon: 'window-maximize', role: 'view', opens: true },
  copyYouTube: { icon: 'copy', role: 'share' },
  saveImage: { icon: 'file-image', role: 'share', opens: true },
  copyImageAddress: { icon: 'link', role: 'share' },
}

const FALLBACK = { icon: 'chevron-right', role: 'view' }

/**
 * @param {string | undefined} key an option's `value` or an entry's `action`
 */
export function skuiMenuItem(key) {
  return SKUI_MENU_ITEMS[key] ?? FALLBACK
}
