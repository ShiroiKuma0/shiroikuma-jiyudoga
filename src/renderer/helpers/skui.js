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
 * The role table (black-yellow-theme, "Colours — nothing hard-coded, every item settable").
 *
 * Section → group → slot. Labels are i18n keys under SKUI (Sections / Groups / Slots).
 * kind: 'color' | 'dimen' | 'font'. Every colour the app draws is a slot here: one key, one
 * default, one swatch row on the UI page, in the section of the item it colours. `icon` is the
 * row's FontAwesome glyph and `tint` the icon role it is drawn in (what the row is about).
 *
 * This file is the only place where a colour is written out: the two primaries above and the
 * colours that carry a meaning below, each exactly once. Every other default is derived from
 * another role in `DEFAULTS`, so changing a foundation colour still cascades to every role
 * that has no value of its own.
 *
 * `section` on a section entry is one of the seven section-icon colours (see SECTION_COLORS):
 * what kind of thing the section is, drawn on its heading and on its chip.
 */
const color = (key, icon = 'palette', tint = 'view') => ({ key, kind: 'color', icon, tint })

export const SKUI_SECTIONS = [
  {
    key: 'Foundation',
    icon: 'palette',
    section: 'base',
    groups: [{
      key: null,
      slots: [
        color('background', 'border-all'),
        color('text', 'font'),
        color('secondaryText', 'font'),
        color('accent'),
        color('border', 'border-all'),
      ]
    }]
  },
  {
    key: 'Typography',
    icon: 'font',
    section: 'words',
    groups: [{
      key: null,
      slots: [
        { key: 'appFont', kind: 'font' },
      ]
    }]
  },
  {
    key: 'Text',
    icon: 'file-lines',
    section: 'words',
    groups: [{
      key: null,
      slots: [
        color('titleText', 'font'),
        color('tertiaryText', 'font'),
        color('selectionBg', 'clone'),
        color('selectionText', 'font'),
        color('focusRing', 'dot-circle'),
      ]
    }]
  },
  {
    key: 'Buttons',
    icon: 'circle-play',
    section: 'controls',
    groups: [
      {
        key: null,
        slots: [
          color('buttonText', 'font'),
          color('buttonFrame', 'border-all'),
          color('buttonGround'),
          color('buttonMainText', 'font'),
          color('buttonMainFrame', 'border-all'),
          color('buttonDanger', 'trash', 'delete'),
          color('buttonRipple', 'dot-circle'),
        ]
      },
      {
        key: 'Icon buttons',
        slots: [
          color('iconButtonGlyph', 'ellipsis-h'),
          color('iconButtonHover', 'ellipsis-h'),
          color('iconButtonDanger', 'trash', 'delete'),
        ]
      },
    ]
  },
  {
    key: 'Dialogs',
    icon: 'message',
    section: 'reach',
    groups: [{
      key: null,
      slots: [
        color('dialogGround'),
        color('dialogFrame', 'border-all'),
        color('dialogTitle', 'font'),
        color('dialogText', 'font'),
        color('dialogScrim', 'clone'),
        color('dialogButtonText', 'font'),
        color('dialogButtonFrame', 'border-all'),
      ]
    }]
  },
  {
    key: 'Switches',
    icon: 'power-off',
    section: 'controls',
    groups: [{
      key: null,
      slots: [
        color('switchOn', 'power-off', 'connect'),
        color('switchOff', 'power-off'),
        color('switchLabel', 'font'),
      ]
    }]
  },
  {
    key: 'Marks',
    icon: 'check',
    section: 'controls',
    groups: [{
      key: null,
      slots: [
        color('checkOn', 'check'),
        color('checkOff', 'check'),
        color('checkLabel', 'font'),
        color('radioOn', 'dot-circle'),
        color('radioOff', 'dot-circle'),
      ]
    }]
  },
  {
    key: 'Fields',
    icon: 'keyboard',
    section: 'words',
    groups: [
      {
        key: null,
        slots: [
          color('fieldText', 'font'),
          color('fieldGround'),
          color('fieldFrame', 'border-all'),
          color('fieldPlaceholder', 'font'),
        ]
      },
      {
        key: 'Pickers',
        slots: [
          color('selectText', 'font'),
          color('selectGround'),
          color('selectFrame', 'border-all'),
        ]
      },
      {
        key: 'Sliders',
        slots: [
          color('sliderTrack', 'sliders-h'),
          color('sliderThumb', 'sliders-h'),
        ]
      },
    ]
  },
  {
    key: 'Menus',
    icon: 'bars',
    section: 'reach',
    groups: [
      {
        key: null,
        slots: [
          color('menuGround'),
          color('menuFrame', 'border-all'),
          color('menuLabel', 'font'),
          color('menuRowFrame', 'border-all'),
          color('menuHover', 'clone'),
          color('menuDivider', 'bars'),
          color('menuHeader', 'font'),
        ]
      },
      {
        key: 'Row icons',
        slots: [
          color('roleConnect', 'plug', 'connect'),
          color('roleMessage', 'message', 'message'),
          color('roleContact', 'circle-user', 'contact'),
          color('roleShare', 'share-alt', 'share'),
          color('roleView', 'eye', 'view'),
          color('roleBlock', 'ban', 'block'),
          color('roleDelete', 'trash', 'delete'),
        ]
      },
    ]
  },
  {
    key: 'Lists',
    icon: 'list',
    section: 'frame',
    groups: [{
      key: null,
      slots: [
        color('tileTitle', 'font'),
        color('tileInfo', 'font'),
        color('tileBadgeGround', 'clock'),
        color('tileBadgeText', 'clock'),
        color('tileProgress', 'bars-progress'),
        color('tileStar', 'star'),
        color('listDivider', 'bars'),
      ]
    }]
  },
  {
    key: 'Top bar',
    icon: 'window-maximize',
    section: 'frame',
    groups: [
      {
        key: 'Bar',
        slots: [
          color('topBarBg'),
          color('topBarText', 'font'),
        ]
      },
      {
        key: 'Search bar',
        slots: [
          color('searchFill', 'search'),
          color('searchText', 'search'),
          color('searchBorder', 'search'),
        ]
      },
      {
        key: 'Tab strip',
        slots: [
          color('tabActiveGround', 'table-columns'),
          color('tabActiveText', 'table-columns'),
          color('tabIdleText', 'table-columns'),
          color('tabFrame', 'table-columns'),
        ]
      },
    ]
  },
  {
    key: 'Side nav',
    icon: 'table-columns',
    section: 'frame',
    groups: [{
      key: null,
      slots: [
        color('sideNavBg'),
        color('sideNavText', 'font'),
        color('sideNavHover', 'clone'),
        color('sideNavActive', 'clone'),
        color('scrollbar', 'grip'),
        color('scrollbarHover', 'grip'),
      ]
    }]
  },
  {
    key: 'Cards & links',
    icon: 'clone',
    section: 'frame',
    groups: [{
      key: null,
      slots: [
        color('cardBg'),
        color('secondaryCardBg'),
        color('linkColor', 'link'),
        color('linkVisited', 'link'),
      ]
    }]
  },
  {
    key: 'Toasts',
    icon: 'comment',
    section: 'flash',
    groups: [
      {
        key: null,
        slots: [
          color('toastGround'),
          color('toastText', 'font'),
          color('toastFrame', 'border-all'),
        ]
      },
      {
        key: 'Tooltips',
        slots: [
          color('tooltipGround'),
          color('tooltipText', 'font'),
          color('tooltipFrame', 'border-all'),
        ]
      },
    ]
  },
  {
    key: 'Player',
    icon: 'play',
    section: 'base',
    groups: [{
      key: null,
      slots: [
        color('playerMenuGround'),
        color('playerMenuText', 'font'),
        color('playerMenuFrame', 'border-all'),
        color('playerSeek', 'bars-progress'),
        color('playerOverlayGround', 'clone'),
        color('playerOverlayText', 'font'),
      ]
    }]
  },
  {
    key: 'Shape & lines',
    icon: 'ruler-horizontal',
    section: 'frame',
    groups: [{
      key: null,
      slots: [
        { key: 'borderWidth', kind: 'dimen', min: 0, max: 10, step: 1, unit: 'px' },
        { key: 'roundness', kind: 'dimen', min: 0, max: 24, step: 1, unit: 'px' },
        { key: 'dividerWidth', kind: 'dimen', min: 0, max: 8, step: 1, unit: 'px' },
      ]
    }]
  },
  // the UI page's own roles; the key stays 'Roles' so a stored order and fold state keep it
  {
    key: 'Roles',
    icon: 'sliders-h',
    section: 'base',
    groups: [
      {
        key: 'Settings page',
        slots: [
          color('note', 'info-circle'),
          color('divider', 'bars'),
          color('warning', 'triangle-exclamation', 'delete'),
        ]
      },
      {
        key: 'Section icons',
        slots: [
          color('sectionBase', 'palette'),
          color('sectionControls', 'power-off'),
          color('sectionWords', 'font'),
          color('sectionFrame', 'border-all'),
          color('sectionReach', 'share-alt'),
          color('sectionWarning', 'triangle-exclamation'),
          color('sectionFlash', 'comment'),
        ]
      },
    ]
  },
]

/** The icon roles a row can name, and the CSS variable each one sets. */
export const SKUI_ROLE_VARS = {
  connect: '--skui-role-connect',
  message: '--skui-role-message',
  contact: '--skui-role-contact',
  share: '--skui-role-share',
  view: '--skui-role-view',
  block: '--skui-role-block',
  delete: '--skui-role-delete',
}

/** The seven section-icon colours, each with one meaning, and the slot that holds it. */
export const SKUI_SECTION_COLORS = {
  base: 'sectionBase',
  controls: 'sectionControls',
  words: 'sectionWords',
  frame: 'sectionFrame',
  reach: 'sectionReach',
  warning: 'sectionWarning',
  flash: 'sectionFlash',
}

// ── The only colour literals besides the two primaries: colours that carry a meaning ──────────
// (白い熊, 2026-11-23: no violet, no magenta, blues neon and far apart, green heavy)
const MEANING_GREEN = [0, 165, 80, 1] // #00A550 — connects; controls
const MEANING_HEAVY_BLUE = [0, 102, 255, 1] // #0066FF — writes a message; the frame and its boxes
const MEANING_LIGHT_BLUE = [0, 176, 255, 1] // #00B0FF — a person; words
const MEANING_ORANGE = [255, 128, 0, 1] // #FF8000 — copies, shares, exports; the app reaches out
const MEANING_ROSE = [255, 61, 127, 1] // #FF3D7F — blocks; a brief flash
const MEANING_RED = [255, 0, 0, 1] // #FF0000 — deletes; warning
/** the checkerboard behind a swatch, so that alpha shows — a tool of the picker, not a surface */
export const SKUI_CHECKER = ['#999', '#666']

/**
 * Opaque, `t` of the way from `from` to `to` — the theme's darker yellows are deliberate
 * colours, not faded ones (a dimmed alpha reads as disabled).
 * @param {number[]} from
 * @param {number[]} to
 * @param {number} t
 */
function mix(from, to, t) {
  return [0, 1, 2].map(i => Math.round(from[i] + (to[i] - from[i]) * t)).concat(1)
}

/** @param {number[]} c @param {number} a */
function withAlpha(c, a) {
  return [c[0], c[1], c[2], Math.round(a * 100) / 100]
}

/**
 * Black or white, whichever reads better ON the given fill (WCAG relative
 * luminance, crossover at L = 0.179 where both contrasts are equal).
 * @param {number[]} c [r, g, b, a]
 * @returns {number[]}
 */
function textOn(c) {
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  return luminance > 0.179 ? [0, 0, 0, 1] : [255, 255, 255, 1]
}

/**
 * Every role's default, by INHERITANCE: `r` resolves another role (its override, or its own
 * default), so a role follows the one it names until it is set on its own.
 * @type {Record<string, (r: (key: string) => number[]) => number[]>}
 */
const DEFAULTS = {
  // foundation
  background: () => SKUI_BLACK,
  text: () => SKUI_YELLOW,
  secondaryText: r => withAlpha(r('text'), r('text')[3] * 0.6),
  accent: r => r('text'),
  border: r => r('text'),

  // text
  titleText: r => r('text'),
  tertiaryText: r => r('text'),
  selectionBg: r => r('accent'),
  selectionText: r => r('background'),
  focusRing: r => r('accent'),

  // buttons — a pill is never filled: the ground is what shows through
  buttonText: r => r('text'),
  buttonFrame: r => r('accent'),
  buttonGround: r => r('background'),
  buttonMainText: r => r('buttonText'),
  buttonMainFrame: r => r('buttonFrame'),
  buttonDanger: r => r('roleDelete'),
  buttonRipple: r => withAlpha(r('accent'), 0.3),
  iconButtonGlyph: r => r('text'),
  iconButtonHover: r => withAlpha(r('text'), 0.12),
  iconButtonDanger: r => r('roleDelete'),

  // dialogs
  dialogGround: r => r('cardBg'),
  dialogFrame: r => r('accent'),
  dialogTitle: r => r('text'),
  dialogText: r => r('text'),
  dialogScrim: r => withAlpha(r('background'), 0.7),
  dialogButtonText: r => r('buttonText'),
  dialogButtonFrame: r => r('buttonFrame'),

  // switches — #8C8C00 off: darker, not fainter, so it is never taken for a note
  switchOn: r => r('accent'),
  switchOff: r => mix(r('background'), r('accent'), 0.55),
  switchLabel: r => r('text'),

  // selection marks
  checkOn: r => r('accent'),
  checkOff: r => mix(r('background'), r('accent'), 0.55),
  checkLabel: r => r('text'),
  radioOn: r => r('accent'),
  radioOff: r => mix(r('background'), r('accent'), 0.55),

  // fields, pickers, sliders
  fieldText: r => r('text'),
  fieldGround: r => r('background'),
  fieldFrame: r => r('border'),
  fieldPlaceholder: r => r('note'),
  selectText: r => r('text'),
  selectGround: r => r('background'),
  selectFrame: r => r('border'),
  sliderTrack: r => mix(r('background'), r('accent'), 0.55),
  sliderThumb: r => r('accent'),

  // menus
  menuGround: r => r('background'),
  menuFrame: r => r('accent'),
  menuLabel: r => r('text'),
  menuRowFrame: r => r('accent'),
  menuHover: r => withAlpha(r('text'), 0.12),
  menuDivider: r => r('divider'),
  menuHeader: r => r('note'),
  roleConnect: () => MEANING_GREEN,
  roleMessage: () => MEANING_HEAVY_BLUE,
  roleContact: () => MEANING_LIGHT_BLUE,
  roleShare: () => MEANING_ORANGE,
  roleView: r => r('accent'),
  roleBlock: () => MEANING_ROSE,
  roleDelete: r => r('warning'),

  // lists and tiles
  tileTitle: r => r('text'),
  tileInfo: r => r('secondaryText'),
  tileBadgeGround: r => withAlpha(r('background'), 0.8),
  tileBadgeText: r => r('text'),
  tileProgress: r => r('accent'),
  tileStar: r => r('accent'),
  listDivider: r => r('divider'),

  // bars
  topBarBg: r => r('background'),
  topBarText: r => r('text'),
  searchFill: r => r('background'),
  searchText: r => r('text'),
  searchBorder: r => r('border'),
  tabActiveGround: r => r('background'),
  tabActiveText: r => r('text'),
  tabIdleText: r => mix(r('background'), r('text'), 0.78),
  tabFrame: r => r('accent'),
  sideNavBg: r => r('background'),
  sideNavText: r => r('text'),
  sideNavHover: r => withAlpha(r('text'), 0.12),
  sideNavActive: r => withAlpha(r('text'), 0.24),
  scrollbar: r => r('secondaryText'),
  scrollbarHover: r => r('text'),

  // cards and links
  cardBg: r => r('background'),
  secondaryCardBg: r => withAlpha(r('background'), 0.75),
  linkColor: r => r('accent'),
  linkVisited: r => r('linkColor'),

  // toasts and tooltips
  toastGround: r => r('background'),
  toastText: r => r('text'),
  toastFrame: r => r('accent'),
  tooltipGround: r => r('background'),
  tooltipText: r => r('text'),
  tooltipFrame: r => r('accent'),

  // the player's own menus and readouts
  playerMenuGround: r => withAlpha(r('background'), 0.92),
  playerMenuText: r => r('text'),
  playerMenuFrame: r => r('accent'),
  playerSeek: r => r('accent'),
  playerOverlayGround: r => withAlpha(r('background'), 0.7),
  playerOverlayText: r => r('text'),

  // the UI page: dim gold #C8C800 for explanations and their rule, #B3B300 for the lines
  note: r => mix(r('background'), r('text'), 0.78),
  divider: r => mix(r('background'), r('accent'), 0.70),
  warning: () => MEANING_RED,
  sectionBase: r => r('accent'),
  sectionControls: () => MEANING_GREEN,
  sectionWords: () => MEANING_LIGHT_BLUE,
  sectionFrame: () => MEANING_HEAVY_BLUE,
  sectionReach: () => MEANING_ORANGE,
  sectionWarning: () => MEANING_RED,
  sectionFlash: () => MEANING_ROSE,
}

/**
 * @param {string} slotKey
 * @param {(key: string) => number[]} resolved resolver for other slots
 * @returns {number[]} [r, g, b, a]
 */
function slotDefault(slotKey, resolved) {
  const own = DEFAULTS[slotKey]
  return own ? own(resolved) : SKUI_YELLOW
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

  const hover = cssRgba(withAlpha(colors.accent, Math.max(0, colors.accent[3] - 0.2)))
  const active = cssRgba(withAlpha(colors.accent, Math.max(0, colors.accent[3] - 0.35)))
  const dangerHover = cssRgba(withAlpha(colors.roleDelete, Math.max(0, colors.roleDelete[3] - 0.2)))
  const dangerActive = cssRgba(withAlpha(colors.roleDelete, Math.max(0, colors.roleDelete[3] - 0.35)))

  // The mixed way (白い熊, 2026-11-23): upstream's stylesheets are not edited for colour — they
  // keep naming their own variables, and every one of those variables is fed from a role here.
  // Inline on body, so they beat every theme class of themes.css.
  const vars = {
    '--bg-color': c('background'),
    '--primary-text-color': c('text'),
    '--title-color': c('titleText'),
    '--tertiary-text-color': c('tertiaryText'),
    '--secondary-text-color': c('secondaryText'),
    '--primary-color': c('accent'),
    '--primary-color-hover': hover,
    '--primary-color-active': active,
    // upstream's "secondary colour" is our accent too: a fresh install keeps its Blue otherwise
    '--accent-color': c('accent'),
    '--accent-color-hover': hover,
    '--accent-color-active': active,
    '--accent-color-light': c('accent'),
    '--accent-color-visited': c('linkVisited'),
    '--accent-color-rgb': `${colors.accent[0]} ${colors.accent[1]} ${colors.accent[2]}`,
    '--accent-color-opacity1': cssRgba(withAlpha(colors.accent, 0.04)),
    '--accent-color-opacity2': cssRgba(withAlpha(colors.accent, 0.12)),
    '--accent-color-opacity3': cssRgba(withAlpha(colors.accent, 0.16)),
    '--accent-color-opacity4': cssRgba(withAlpha(colors.accent, 0.24)),
    // text drawn ON an accent fill, where upstream still fills something we do not restyle
    '--text-with-main-color': cssRgba(textOn(colors.accent)),
    '--text-with-accent-color': cssRgba(textOn(colors.accent)),
    '--link-color': c('linkColor'),
    '--link-visited-color': c('linkVisited'),
    '--card-bg-color': c('cardBg'),
    '--secondary-card-bg-color': c('secondaryCardBg'),
    '--search-bar-color': c('searchFill'),
    '--instance-menu-color': c('menuGround'),
    '--side-nav-color': c('sideNavBg'),
    '--side-nav-hover-color': c('sideNavHover'),
    '--side-nav-active-color': c('sideNavActive'),
    '--side-nav-hover-text-color': c('sideNavText'),
    '--side-nav-active-text-color': c('sideNavText'),
    '--scrollbar-color': c('scrollbar'),
    '--scrollbar-color-hover': c('scrollbarHover'),
    '--scrollbar-text-color-hover': c('scrollbarHover'),
    '--favorite-icon-color': c('tileStar'),
    '--primary-shadow-color': c('listDivider'),
    '--primary-border-color': c('border'),
    '--primary-input-color': c('dialogScrim'),
    '--destructive-color': c('roleDelete'),
    '--destructive-text-color': cssRgba(textOn(colors.roleDelete)),
    '--destructive-hover-color': dangerHover,
    '--destructive-active-color': dangerActive,
    '--red-500': c('warning'),
    '--logo-primary-color': c('topBarText'),
    '--logo-secondary-color': c('topBarText'),
    '--logo-tertiary-color': c('topBarText'),
    // the name the page's styles have used for the warning role since before the table
    '--skui-warn': c('warning'),
  }

  // every role under its own name, for the fork's stylesheets: --skui-<key in kebab case>
  for (const key of Object.keys(colors)) {
    vars[`--skui-${key.replaceAll(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = c(key)
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
  rules.push(
    // content cards fill the window unframed; only settings sections keep the border
    `.settingsSection { ${borderCss} border-radius: ${dims.roundness}px !important; }`,
    // pills and round icon buttons keep their own shape; fields and pickers follow the slider
    `.ft-input-component .ft-input, .select { border-radius: ${dims.roundness}px !important; }`,
    ...(dims.borderWidth > 0
      ? [`.searchContainer .ft-input-component { outline: ${dims.borderWidth}px solid var(--skui-search-border); }`]
      : []),
    dims.dividerWidth > 0
      ? `hr { border: none; border-block-start: ${dims.dividerWidth}px solid var(--skui-list-divider); }`
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
