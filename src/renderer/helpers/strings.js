import i18n from '../i18n/index'

/**
 * This will return true if a string is null, undefined or empty.
 * @param {string|null|undefined} _string the string to process
 * @returns {boolean} whether the string is empty or not
 */
export function isNullOrEmpty(_string) {
  return _string == null || _string === ''
}

/**
 * Is KeyboardEvent.key a printable char
 * @param {string} eventKey the string from KeyboardEvent.key to process
 * @returns {boolean} whether the string from KeyboardEvent.key is a printable char or not
 */
export function isKeyboardEventKeyPrintableChar(eventKey) {
  // Most printable chars are all strings with length 1 (except Unicode)
  // https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
  // https://www.w3.org/TR/DOM-Level-3-Events-key/
  if (eventKey.length === 1) { return true }
  // Emoji
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape
  if (/\p{Emoji_Presentation}/u.test(eventKey)) { return true }

  return false
}

/**
 * @param {string} title
 */
export function translateWindowTitle(title) {
  switch (title) {
    case 'Subscriptions':
      return i18n.global.t('Subscriptions.Subscriptions')
    case 'Channels':
      return i18n.global.t('Channels.Title')
    case 'Trending':
      return i18n.global.t('Trending.Trending')
    case 'Most Popular':
      return i18n.global.t('Most Popular')
    case 'Your Playlists':
      return i18n.global.t('User Playlists.Your Playlists')
    case 'History':
      return i18n.global.t('History.History')
    case 'Settings':
      return i18n.global.t('Settings.Settings')
    case 'About':
      return i18n.global.t('About.About')
    case 'Profile Settings':
      return i18n.global.t('Profile.Profile Settings')
    case 'Playlist':
      return i18n.global.t('Playlist.Playlist')
    default:
      return null
  }
}

/**
 * 白い熊 自由動画: whether a route names itself -- its title is the one its `meta.title` carries,
 * translated, and nothing a view fetches can improve on it. The routes excluded below are named
 * by their CONTENT instead: a video's, a channel's or a playlist's name arrives with the page's
 * data, asynchronously and often long after the page was opened.
 *
 * The distinction is what keeps a late title off a page it does not belong to -- App.vue names
 * the window with it, and helpers/skuiTabs.js names the tab.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function routeNamesItself(path) {
  return !path.startsWith('/channel/') &&
    !path.startsWith('/watch/') &&
    !path.startsWith('/hashtag/') &&
    !path.startsWith('/playlist/') &&
    !path.startsWith('/search/')
}

/**
 * Returns the first user-perceived character,
 * respecting language specific rules and
 * emojis made up of multiple codepoints
 * like flags, families and skin tone modifiers.
 * @param {string} text
 * @param {string} locale
 * @returns {string}
 */
export function getFirstCharacter(text, locale) {
  if (text.length === 0) {
    return ''
  }

  const segmenter = new Intl.Segmenter([locale, 'en'], { granularity: 'grapheme' })

  // Use iterator directly as we only need the first segment
  const firstSegment = segmenter.segment(text)[Symbol.iterator]().next().value
  return firstSegment.segment
}
