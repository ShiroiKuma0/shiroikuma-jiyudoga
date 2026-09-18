/**
 * 白い熊 自由動画 — turning a link in the page into something the context menu can act on.
 *
 * Every place in the app that points at a video, channel, playlist, hashtag or post does it
 * with a `RouterLink`, i.e. an `<a href="…#/watch/…">`. That one shape is what lets a single
 * document-level listener serve tiles, recommendations, search results, playlist rows and
 * description links without any of those components knowing about the menu.
 *
 * The external-URL builders below mirror `transformURL` in `src/main/index.js`, which is what
 * the NATIVE context menu used before we took the in-app links off it. One deliberate
 * difference: Invidious links are built against the instance actually in use, not
 * `redirect.invidious.io`, so that the right-click menu and the tile's own ⋮ menu hand out the
 * same link for the same video.
 */

import store from '../store/index'

/** Route prefixes the menu knows how to talk about. Anything else is left to the browser. */
const KNOWN_ROUTES = new Set(['watch', 'channel', 'playlist', 'hashtag', 'post'])

/**
 * @typedef {object} SkuiLinkTarget
 * @property {'watch'|'channel'|'playlist'|'hashtag'|'post'} kind
 * @property {string} id the route parameter — video id, channel id, playlist id, …
 * @property {string} path the in-app route path, ready for `router.push`
 * @property {{[key: string]: string}} query the in-app route query
 * @property {string} title best-effort label for the link, used to name a new tab
 * @property {string|null} imageUrl set when the press landed on an image inside the link
 */

/**
 * Is this href a route inside our own page, rather than an external link?
 *
 * The app is served from `app://bundle/index.html` (packaged) or `http://localhost:9080`
 * (development) and routes live in the hash, so "in-app" means: same document, and there is a
 * hash. Comparing against `window.location` rather than a hardcoded origin keeps both cases
 * and any future move working.
 *
 * @param {string} href
 * @returns {URL|null} the parsed URL when it is one of ours, otherwise null
 */
function parseInAppUrl(href) {
  if (!href) { return null }

  let url
  try {
    url = new URL(href, window.location.href)
  } catch {
    return null
  }

  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
    return null
  }

  return url.hash.length > 1 ? url : null
}

/**
 * Describe the link under the pointer, or return null if it is not one the menu handles.
 *
 * @param {EventTarget|null} eventTarget the element the press landed on
 * @returns {SkuiLinkTarget|null}
 */
export function resolveLinkTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) { return null }

  const anchor = eventTarget.closest('a[href]')
  if (anchor === null) { return null }

  const url = parseInAppUrl(anchor.getAttribute('href') ?? anchor.href)
  if (url === null) { return null }

  const [routePath, queryString] = url.hash.slice(1).split('?')
  const [route, id] = routePath.split('/').filter(part => part.length > 0)

  if (!KNOWN_ROUTES.has(route) || !id) { return null }

  const query = {}
  for (const [key, value] of new URLSearchParams(queryString ?? '')) {
    query[key] = value
  }

  // The visible text is the video/channel title on every tile; on a thumbnail-only link there
  // is none, so fall back to the image's alt text and finally to the id.
  // A tile thumbnail carries overlays (duration, watched bar) on top of the image, so a press
  // often lands beside it rather than on it -- hence the second look inside the link itself.
  const image = eventTarget.closest('img') ?? anchor.querySelector('img')
  const title = (anchor.textContent ?? '').trim() ||
    (image?.getAttribute('alt') ?? '').trim() ||
    decodeURIComponent(id)

  return {
    kind: route,
    id: decodeURIComponent(id),
    path: routePath,
    query,
    title,
    imageUrl: image?.currentSrc || image?.src || null
  }
}

/**
 * The equivalent YouTube or Invidious URL for a target.
 *
 * @param {SkuiLinkTarget} target
 * @param {boolean} toYouTube YouTube when true, the current Invidious instance when false
 * @returns {string}
 */
export function externalUrlForTarget(target, toYouTube) {
  const origin = toYouTube
    ? 'https://www.youtube.com'
    : store.getters.getCurrentInvidiousInstanceUrl

  switch (target.kind) {
    case 'channel':
      return `${origin}/channel/${target.id}`
    case 'hashtag':
      return `${origin}/hashtag/${target.id}`
    case 'playlist':
      return `${origin}/playlist?list=${target.id}`
    case 'post': {
      const authorId = target.query.authorId

      if (authorId) {
        return toYouTube
          ? `${origin}/channel/${authorId}/community?lb=${target.id}`
          : `${origin}/post/${target.id}?ucid=${authorId}`
      }

      return `${origin}/post/${target.id}`
    }
    case 'watch': {
      const url = toYouTube
        ? new URL(`https://youtu.be/${target.id}`)
        : new URL(`${origin}/watch?v=${target.id}`)

      const params = new URLSearchParams(url.search)
      let hasParams = false

      // user playlists only exist on this machine, so they are never worth putting in a link
      if (target.query.playlistId && target.query.playlistType !== 'user') {
        params.set('list', target.query.playlistId)
        hasParams = true
      }

      if (target.query.timestamp) {
        params.set('t', target.query.timestamp)
        hasParams = true
      }

      if (hasParams) {
        url.search = params.toString()
      }

      return url.toString()
    }
    default:
      return ''
  }
}
