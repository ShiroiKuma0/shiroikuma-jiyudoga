// YouTube Music search: what music.youtube.com shows for a query, turned into
// the list items the rest of the app already renders.
//
// YouTube Music answers an unfiltered query with a "top result" card and one
// mixed list (songs, albums, artists, videos, playlists, podcasts, episodes,
// profiles), and offers one chip per category; a chip's own search params
// return that category alone, page after page. Both are kept as YouTube sends
// them: the mixed list is grouped into its categories in the order they first
// appear, and each category heading leads to its chip.
//
// Everything maps onto an existing tile: songs, videos and episodes are videos
// (watch page — where a song's download saves the Ogg, see download-music.js),
// albums are playlists (the album's own `OLAK5uy_…` playlist), community
// playlists and podcasts are playlists, artists and profiles are channels.

import { getLocalMusicSearch } from './api/local'

/**
 * @typedef {'top' | 'song' | 'video' | 'album' | 'artist' | 'profile' | 'playlist' | 'podcast' | 'episode'} MusicCategory
 */

/**
 * @typedef {object} MusicChip
 * @property {string} label YouTube's own chip text
 * @property {string} params the search params that select this category
 * @property {MusicCategory | null} category
 */

/**
 * @typedef {object} MusicSection
 * @property {MusicCategory} category
 * @property {object[]} items list items for FtElementList
 */

// chip text → category; the session is English, so the chips are too
const CHIP_CATEGORIES = new Map([
  ['Songs', 'song'],
  ['Videos', 'video'],
  ['Albums', 'album'],
  ['Artists', 'artist'],
  ['Profiles', 'profile'],
  ['Community playlists', 'playlist'],
  ['Featured playlists', 'playlist'],
  ['Podcasts', 'podcast'],
  ['Episodes', 'episode']
])

/**
 * @param {{ url: string, width?: number }[] | undefined} thumbnails
 */
function largestThumbnail(thumbnails) {
  const best = (thumbnails ?? []).reduce((a, b) => ((b.width ?? 0) > (a?.width ?? 0) ? b : a), null)
  return best?.url?.replace(/^\/\//, 'https://') ?? ''
}

/**
 * @param {{ name: string, channel_id?: string }[] | undefined} people
 */
function joinNames(people) {
  return (people ?? []).map((person) => person.name).filter((name) => name).join(', ')
}

/**
 * @param {import('youtubei.js').YTNodes.MusicResponsiveListItem} item
 * @param {MusicCategory} category
 */
function videoTile(item, category) {
  const videoId = item.id ?? item.overlay?.content?.endpoint?.payload?.videoId
  if (!videoId) { return null }

  const people = item.artists?.length ? item.artists : item.authors
  const firstChannel = people?.find((person) => person.channel_id)

  return {
    type: 'video',
    dataSource: 'local',
    videoId,
    title: item.title ?? '',
    author: joinNames(people) || item.author?.name || '',
    authorId: firstChannel?.channel_id ?? item.author?.channel_id,
    lengthSeconds: item.duration?.seconds > 0 ? item.duration.seconds : '',
    // the album a song is on, or a video's view count, where the list shows a description
    description: category === 'song' ? item.album?.name : item.views,
    liveNow: false,
    isUpcoming: false
  }
}

/**
 * @param {import('youtubei.js').YTNodes.MusicResponsiveListItem} item
 */
function playlistTile(item) {
  const playlistId = item.overlay?.content?.endpoint?.payload?.playlistId ??
    (item.id?.startsWith('VL') ? item.id.slice(2) : null)
  if (!playlistId) { return null }

  const author = item.author ?? item.authors?.[0]

  return {
    type: 'playlist',
    dataSource: 'local',
    playlistId,
    title: item.title ?? '',
    thumbnail: largestThumbnail(item.thumbnails),
    // an album's year is what tells its editions apart
    channelName: [author?.name, item.year].filter((part) => part).join(' · '),
    channelId: author?.channel_id
  }
}

/**
 * @param {import('youtubei.js').YTNodes.MusicResponsiveListItem} item
 */
function channelTile(item) {
  if (!item.id) { return null }

  // "Profile • @handle" / "Artist • 1.13M monthly audience"
  const details = (item.subtitle?.toString() ?? '').split(' • ').slice(1)
  const handle = details.find((part) => part.startsWith('@')) ?? null

  return {
    type: 'channel',
    dataSource: 'local',
    id: item.id,
    name: item.name ?? item.title ?? '',
    thumbnail: largestThumbnail(item.thumbnails),
    subscribers: null,
    videos: null,
    handle,
    descriptionShort: details.filter((part) => part !== handle).join(' • ')
  }
}

/**
 * @param {import('youtubei.js').YTNodes.MusicResponsiveListItem} item
 * @returns {{ category: MusicCategory, item: object } | null}
 */
function parseItem(item) {
  if (item?.type !== 'MusicResponsiveListItem') { return null }

  /** @type {MusicCategory} */
  let category
  let tile

  switch (item.item_type) {
    case 'song':
      category = 'song'
      tile = videoTile(item, category)
      break
    case 'video':
    case 'unknown':
      category = 'video'
      tile = videoTile(item, category)
      break
    case 'non_music_track':
      category = 'episode'
      tile = videoTile(item, category)
      break
    case 'album':
      category = 'album'
      tile = playlistTile(item)
      break
    case 'playlist':
      category = 'playlist'
      tile = playlistTile(item)
      break
    case 'podcast_show':
      category = 'podcast'
      tile = playlistTile(item)
      break
    case 'artist':
    case 'library_artist':
      category = (item.subtitle?.toString() ?? '').startsWith('Profile') ? 'profile' : 'artist'
      tile = channelTile(item)
      break
    default:
      return null
  }

  return tile ? { category, item: tile } : null
}

/**
 * The top result card: a song or video to play, or an artist.
 * @param {import('youtubei.js').YTNodes.MusicCardShelf} card
 */
function parseTopCard(card) {
  const payload = card.on_tap?.payload ?? {}
  const runs = card.subtitle?.runs ?? []
  const artists = runs.filter((run) => run.endpoint?.payload?.browseId?.startsWith('UC'))

  if (payload.videoId) {
    return {
      type: 'video',
      dataSource: 'local',
      videoId: payload.videoId,
      title: card.title?.toString() ?? '',
      author: artists.map((run) => run.text).join(', '),
      authorId: artists[0]?.endpoint.payload.browseId,
      lengthSeconds: '',
      liveNow: false,
      isUpcoming: false
    }
  }

  // an album opens as its own playlist, which the card's play overlay names
  const playlistId = card.thumbnail_overlay?.content?.endpoint?.payload?.playlistId
  if (payload.browseId?.startsWith('MPRE') && playlistId) {
    return {
      type: 'playlist',
      dataSource: 'local',
      playlistId,
      title: card.title?.toString() ?? '',
      thumbnail: largestThumbnail(card.thumbnail?.contents),
      channelName: artists.map((run) => run.text).join(', '),
      channelId: artists[0]?.endpoint.payload.browseId
    }
  }

  if (payload.browseId?.startsWith('UC')) {
    return {
      type: 'channel',
      dataSource: 'local',
      id: payload.browseId,
      name: card.title?.toString() ?? '',
      thumbnail: largestThumbnail(card.thumbnail?.contents),
      subscribers: null,
      videos: null,
      handle: null,
      descriptionShort: card.subtitle?.toString() ?? ''
    }
  }

  return null
}

/**
 * @param {object[]} nodes
 */
function parseItems(nodes) {
  return (nodes ?? []).map(parseItem).filter((entry) => entry !== null)
}

/**
 * Runs a search: the mixed top results without `params`, one category with them.
 * @param {string} query
 * @param {string} [params] a chip's params
 * @param {boolean} [safetyMode]
 * @returns {Promise<{ chips: MusicChip[], sections: MusicSection[], continuation: object | null }>}
 */
export async function searchMusic(query, params, safetyMode = false) {
  const search = await getLocalMusicSearch(query, params || undefined, safetyMode)

  const chips = (search.header?.chips ?? [])
    .filter((chip) => chip.endpoint?.payload?.params)
    .map((chip) => ({
      label: chip.text,
      params: chip.endpoint.payload.params,
      category: CHIP_CATEGORIES.get(chip.text) ?? null
    }))

  /** @type {Map<MusicCategory, object[]>} */
  const grouped = new Map()
  const add = (category, item) => {
    if (!grouped.has(category)) { grouped.set(category, []) }
    grouped.get(category).push(item)
  }

  for (const node of search.contents ?? []) {
    if (node.type === 'MusicCardShelf') {
      const top = parseTopCard(node)
      if (top !== null) { add('top', top) }
      for (const { category, item } of parseItems(node.contents)) { add(category, item) }
    } else if (node.type === 'MusicShelf' || node.type === 'ItemSection') {
      for (const { category, item } of parseItems(node.contents)) { add(category, item) }
    }
  }

  return {
    chips,
    sections: [...grouped].map(([category, items]) => ({ category, items })),
    continuation: search.has_continuation ? search : null
  }
}

// results stay for the session, so coming back from a song to its search is
// instant and keeps the pages already loaded
const MAX_CACHED_SEARCHES = 30

/** @type {Map<string, { chips: MusicChip[], sections: MusicSection[], continuation: object | null }>} */
const resultCache = new Map()

/**
 * @param {string} query
 * @param {string} params
 */
export function getCachedMusicSearch(query, params) {
  return resultCache.get(`${query}\n${params}`) ?? null
}

/**
 * @param {string} query
 * @param {string} params
 * @param {{ chips: MusicChip[], sections: MusicSection[], continuation: object | null }} result
 */
export function rememberMusicSearch(query, params, result) {
  const key = `${query}\n${params}`
  resultCache.delete(key)
  resultCache.set(key, result)

  if (resultCache.size > MAX_CACHED_SEARCHES) {
    resultCache.delete(resultCache.keys().next().value)
  }
}

/**
 * The next page of a category.
 * @param {object} continuation what `searchMusic` or a previous call returned
 * @returns {Promise<{ items: object[], continuation: object | null }>}
 */
export async function searchMusicContinuation(continuation) {
  const next = await continuation.getContinuation()

  return {
    items: parseItems(next.contents?.contents).map((entry) => entry.item),
    continuation: next.has_continuation ? next : null
  }
}
