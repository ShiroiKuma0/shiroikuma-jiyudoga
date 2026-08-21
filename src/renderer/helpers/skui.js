// 白い熊 自由動画 UI (skui) — the fork's themable UI layer.
//
// Ported conventions from the sister forks (shiroikuma-denwa / shiroikuma-messeji
// ThemeActivity): a Section → Group → Slot model, defaults resolved by
// INHERITANCE from a few foundation colors (background #000000, text/accent
// #FFFF00) so changing a foundation color cascades to every slot that has no
// explicit override. Colors are stored as 'r,g,b,a' strings (a = 0..1);
// only overrides are persisted, in the skuiTheme JSON setting.

/** Foundation defaults: pure black / pure yellow (never material #FFEB3B). */
export const SKUI_BLACK = [0, 0, 0, 1]
export const SKUI_YELLOW = [255, 255, 0, 1]

export const SKUI_RECENT_COLORS_MAX = 5

export const SKUI_FONT_SAMPLE = 'AaIiMmOoQqWw 012 白い熊相撲道 áÁčČďĎéÉ'

/**
 * Section → group → slot model. Labels are i18n keys under SKUI.
 * kind: 'color' | 'dimen' | 'font'
 */
export const SKUI_SECTIONS = [
  {
    key: 'Foundation',
    groups: [{
      key: null,
      slots: [
        { key: 'background', kind: 'color' },
        { key: 'text', kind: 'color' },
        { key: 'secondaryText', kind: 'color' },
        { key: 'accent', kind: 'color' },
        { key: 'border', kind: 'color' },
      ]
    }]
  },
  {
    key: 'Typography',
    groups: [{
      key: null,
      slots: [
        { key: 'appFont', kind: 'font' },
      ]
    }]
  },
  {
    key: 'Top bar',
    groups: [
      {
        key: 'Bar',
        slots: [
          { key: 'topBarBg', kind: 'color' },
          { key: 'topBarText', kind: 'color' },
        ]
      },
      {
        key: 'Search bar',
        slots: [
          { key: 'searchFill', kind: 'color' },
          { key: 'searchText', kind: 'color' },
          { key: 'searchBorder', kind: 'color' },
        ]
      },
    ]
  },
  {
    key: 'Side nav',
    groups: [{
      key: null,
      slots: [
        { key: 'sideNavBg', kind: 'color' },
        { key: 'sideNavText', kind: 'color' },
        { key: 'sideNavHover', kind: 'color' },
        { key: 'sideNavActive', kind: 'color' },
      ]
    }]
  },
  {
    key: 'Cards & links',
    groups: [{
      key: null,
      slots: [
        { key: 'cardBg', kind: 'color' },
        { key: 'secondaryCardBg', kind: 'color' },
        { key: 'linkColor', kind: 'color' },
      ]
    }]
  },
  {
    key: 'Shape & lines',
    groups: [{
      key: null,
      slots: [
        { key: 'borderWidth', kind: 'dimen', min: 0, max: 10, step: 1, unit: 'px' },
        { key: 'roundness', kind: 'dimen', min: 0, max: 24, step: 1, unit: 'px' },
        { key: 'dividerWidth', kind: 'dimen', min: 0, max: 8, step: 1, unit: 'px' },
      ]
    }]
  },
]

/** @param {number[]} c @param {number} a */
function withAlpha(c, a) {
  return [c[0], c[1], c[2], Math.round(a * 100) / 100]
}

/**
 * Inheritance resolver — mirrors the sister forks' themeDefault():
 * every non-foundation slot's default is computed from a foundation color.
 * @param {string} slotKey
 * @param {(key: string) => number[]} resolved resolver for other slots
 * @returns {number[]} [r, g, b, a]
 */
function slotDefault(slotKey, resolved) {
  switch (slotKey) {
    case 'background': return SKUI_BLACK
    case 'text': return SKUI_YELLOW
    case 'secondaryText': return withAlpha(resolved('text'), resolved('text')[3] * 0.6)
    case 'accent': return resolved('text')
    case 'border': return resolved('text')
    case 'topBarBg': return resolved('background')
    case 'topBarText': return resolved('text')
    case 'searchFill': return resolved('background')
    case 'searchText': return resolved('text')
    case 'searchBorder': return resolved('border')
    case 'sideNavBg': return resolved('background')
    case 'sideNavText': return resolved('text')
    case 'sideNavHover': return withAlpha(resolved('text'), 0.12)
    case 'sideNavActive': return withAlpha(resolved('text'), 0.24)
    case 'cardBg': return resolved('background')
    case 'secondaryCardBg': return withAlpha(resolved('background'), 0.75)
    case 'linkColor': return resolved('accent')
    default: return SKUI_YELLOW
  }
}

export const SKUI_DIMEN_DEFAULTS = {
  borderWidth: 1,
  roundness: 4,
  dividerWidth: 1,
}

export const SKUI_FONT_DEFAULTS = {
  family: '',
  weight: 0, // 0 = default
  size: 100, // % UI scale
}

/** @param {string} value 'r,g,b,a' */
export function parseColor(value) {
  const parts = `${value}`.split(',').map(part => parseFloat(part))
  if (parts.length !== 4 || parts.some(part => isNaN(part))) { return null }
  return parts
}

/** @param {number[]} c */
export function colorToString(c) {
  return c.join(',')
}

/** @param {number[]} c */
export function cssRgba(c) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`
}

/**
 * Resolve every slot color from the theme's overrides + inheritance.
 * @param {object} theme parsed skuiTheme
 * @returns {Record<string, number[]>}
 */
export function resolveColors(theme) {
  const overrides = theme?.colors ?? {}
  const cache = {}
  const resolved = (key) => {
    if (cache[key]) { return cache[key] }
    const override = overrides[key] ? parseColor(overrides[key]) : null
    cache[key] = override ?? slotDefault(key, resolved)
    return cache[key]
  }
  for (const section of SKUI_SECTIONS) {
    for (const group of section.groups) {
      for (const slot of group.slots) {
        if (slot.kind === 'color') { resolved(slot.key) }
      }
    }
  }
  return cache
}

/** @param {object} theme */
export function resolveDims(theme) {
  return { ...SKUI_DIMEN_DEFAULTS, ...(theme?.dims ?? {}) }
}

/** @param {object} theme */
export function resolveFont(theme) {
  return { ...SKUI_FONT_DEFAULTS, ...(theme?.font ?? {}) }
}

/** @param {string} json */
export function parseTheme(json) {
  try {
    const parsed = JSON.parse(json)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {string} family stored family value */
export function cssFontFamily(family) {
  if (!family) { return null }
  if (family === '@monospace') { return 'monospace' }
  return `'${family.replaceAll("'", '')}', sans-serif`
}

const STYLE_ELEMENT_ID = 'skui-style'

/**
 * Apply the theme to the live document: CSS variable overrides as body
 * inline styles (they beat every theme class) + a generated <style> tag for
 * @font-face, fonts, borders, radii and dividers. Fully reactive — call on
 * every change for instant preview.
 * @param {object} theme parsed skuiTheme
 * @param {Array<{name: string, data: string, format: string}>} customFonts
 */
export function applySkuiTheme(theme, customFonts = []) {
  const colors = resolveColors(theme)
  const dims = resolveDims(theme)
  const font = resolveFont(theme)
  const body = document.body
  const c = (key) => cssRgba(colors[key])

  const vars = {
    '--bg-color': c('background'),
    '--primary-text-color': c('text'),
    '--title-color': c('text'),
    '--tertiary-text-color': c('text'),
    '--secondary-text-color': c('secondaryText'),
    '--primary-color': c('accent'),
    '--primary-color-hover': cssRgba(withAlpha(colors.accent, Math.max(0, colors.accent[3] - 0.2))),
    '--primary-color-active': cssRgba(withAlpha(colors.accent, Math.max(0, colors.accent[3] - 0.35))),
    '--accent-color-rgb': `${colors.accent[0]} ${colors.accent[1]} ${colors.accent[2]}`,
    '--link-color': c('linkColor'),
    '--link-visited-color': c('linkColor'),
    '--card-bg-color': c('cardBg'),
    '--secondary-card-bg-color': c('secondaryCardBg'),
    '--search-bar-color': c('searchFill'),
    '--side-nav-color': c('sideNavBg'),
    '--side-nav-hover-color': c('sideNavHover'),
    '--side-nav-active-color': c('sideNavActive'),
    '--side-nav-hover-text-color': c('sideNavText'),
    '--side-nav-active-text-color': c('sideNavText'),
    '--scrollbar-color': c('secondaryText'),
    '--scrollbar-color-hover': c('text'),
    '--logo-primary-color': c('text'),
  }
  for (const [name, value] of Object.entries(vars)) {
    body.style.setProperty(name, value)
  }

  const rules = []

  for (const customFont of customFonts) {
    rules.push(`@font-face { font-family: '${customFont.name.replaceAll("'", '')}'; src: url(data:font/${customFont.format};base64,${customFont.data}); }`)
  }

  const family = cssFontFamily(font.family)
  const bodyFont = []
  if (family) { bodyFont.push(`font-family: ${family} !important;`) }
  if (font.weight > 0) { bodyFont.push(`font-weight: ${font.weight};`) }
  if (bodyFont.length > 0) {
    rules.push(`body, body input, body button, body select, body textarea { ${bodyFont.join(' ')} }`)
  }
  if (font.size !== 100) {
    rules.push(`#app { zoom: ${font.size}%; }`)
  }

  const borderCss = dims.borderWidth > 0
    ? `border: ${dims.borderWidth}px solid ${c('border')} !important;`
    : 'border: none !important;'
  // Every floating surface -- menu, dropdown, popover, dialog, toast, tooltip -- carries the
  // fork's accent frame, so a thing that hovers over the page is always outlined and never a
  // borderless slab on black. The width and colour are FIXED (2px / --primary-color) rather
  // than skui's configurable border, deliberately: this is the same "modal language" the
  // Export / Import info dialog and the download-progress box already hardcode, and letting
  // half the popups follow a slider while the other half did not is exactly the drift this
  // rule exists to remove. Transient HUD overlays inside the player (volume/seek indicator,
  // stats-for-nerds) are NOT included -- they are readouts, not surfaces you act on.
  // NOTE: the right-click context menu is a NATIVE Electron menu and cannot be reached from
  // CSS at all; see the comment in src/main/index.js where it is built.
  const popupSurfaces = [
    '.promptCard',                 // every modal built on FtPrompt
    '.iconDropdown',               // the ... menus on tiles, watch page, playlists
    '.profileList',                // profile selector
    '.profileDropdown',            // subscribe button
    '.moreOptionContainer',        // side nav overflow
    '.settingsMenu',               // settings jump menu
    '.toast',                      // toasts
    '.tooltip .text',              // tooltip bubbles
    '.ft-input-component .list',   // search / input suggestions
    '.skuiFeedFilter .filterPanel',
    '.skuiGridControls .panel',
    '.shaka-settings-menu',        // player settings + overflow menus
    '.shaka-overflow-menu',
  ].join(', ')

  rules.push(
    // content cards fill the window unframed; only settings sections keep the border
    `.settingsSection { ${borderCss} border-radius: ${dims.roundness}px !important; }`,
    `${popupSurfaces} { border: 2px solid var(--primary-color) !important; box-sizing: border-box; }`,
    `.btn, .ft-input-component .ft-input, .select { border-radius: ${dims.roundness}px !important; }`,
    `.topNav { background-color: ${c('topBarBg')} !important; }`,
    `.topNav .navIcon, .topNav .navFilterIcon { color: ${c('topBarText')} !important; }`,
    `.searchContainer .ft-input, .searchContainer .ft-input-component { color: ${c('searchText')} !important; }`,
    ...(dims.borderWidth > 0
      ? [`.searchContainer .ft-input-component { outline: ${dims.borderWidth}px solid ${c('searchBorder')}; }`]
      : []),
    `.sideNav .navLabel, .sideNav .navIcon { color: ${c('sideNavText')}; }`,
    dims.dividerWidth > 0
      ? `hr { border: none; border-block-start: ${dims.dividerWidth}px solid ${c('border')}; }`
      : 'hr { border: none; }'
  )

  let styleElement = document.getElementById(STYLE_ELEMENT_ID)
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = STYLE_ELEMENT_ID
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = rules.join('\n')
}
