/**
 * Fork (白い熊 自由動画): the feed filter — set algebra over the profiles.
 *
 * The profiles are already named channel sets, so a narrower feed does not need a new
 * hand-curated profile: it is expressed as `+`/`−` over the profiles that exist, plus a
 * `cap N` state that keeps a loud group present but thinned to its N newest videos per
 * channel. The result is a view mask; the active profile stays the write target for
 * subscribing, starring and Similar tuning.
 *
 * Pure on purpose — no store, no Vue — so the rules below are the whole story.
 */

export const FEED_FILTER_NEUTRAL = 'neutral'
export const FEED_FILTER_INCLUDE = 'include'
export const FEED_FILTER_EXCLUDE = 'exclude'
export const FEED_FILTER_CAP = 'cap'

/** The order a row cycles through when tapped. */
const STATE_CYCLE = [FEED_FILTER_NEUTRAL, FEED_FILTER_INCLUDE, FEED_FILTER_EXCLUDE, FEED_FILTER_CAP]

export const FEED_FILTER_DEFAULT_CAP = 2
export const FEED_FILTER_MAX_CAP = 20

/**
 * @typedef {object} FeedFilter
 * @property {string[]} include profile ids contributing their channels
 * @property {string[]} exclude profile ids whose channels are removed
 * @property {Record<string, number>} caps profile id → max videos per channel
 * @property {string|null} presetId the preset this filter was applied from, if unedited since
 */

/** @returns {FeedFilter} */
export function emptyFeedFilter() {
  return { include: [], exclude: [], caps: {}, presetId: null }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asIdArray(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id.length > 0) : []
}

/**
 * Reads the stored JSON, tolerating anything (an old shape, a hand-edited setting, garbage)
 * by falling back to the empty filter, which behaves exactly like no filter at all.
 * @param {string|object|null|undefined} json
 * @returns {FeedFilter}
 */
export function parseFeedFilter(json) {
  let raw

  try {
    raw = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    raw = null
  }

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyFeedFilter()
  }

  const exclude = asIdArray(raw.exclude)
  const excludeSet = new Set(exclude)

  /** @type {Record<string, number>} */
  const caps = {}

  if (raw.caps != null && typeof raw.caps === 'object') {
    for (const [id, value] of Object.entries(raw.caps)) {
      const cap = Math.trunc(Number(value))

      if (Number.isFinite(cap) && cap > 0 && !excludeSet.has(id)) {
        caps[id] = Math.min(cap, FEED_FILTER_MAX_CAP)
      }
    }
  }

  // The states are exclusive per profile: a duplicate id keeps its strictest meaning
  const include = asIdArray(raw.include).filter((id) => !excludeSet.has(id) && caps[id] == null)

  return {
    include: Array.from(new Set(include)),
    exclude: Array.from(excludeSet),
    caps,
    presetId: typeof raw.presetId === 'string' ? raw.presetId : null
  }
}

/**
 * @param {FeedFilter} filter
 */
export function feedFilterIsEmpty(filter) {
  return filter.include.length === 0 &&
    filter.exclude.length === 0 &&
    Object.keys(filter.caps).length === 0
}

/**
 * @param {FeedFilter} filter
 * @param {string} profileId
 * @returns {typeof FEED_FILTER_NEUTRAL | typeof FEED_FILTER_INCLUDE | typeof FEED_FILTER_EXCLUDE | typeof FEED_FILTER_CAP}
 */
export function stateForProfile(filter, profileId) {
  if (filter.caps[profileId] != null) { return FEED_FILTER_CAP }
  if (filter.exclude.includes(profileId)) { return FEED_FILTER_EXCLUDE }
  if (filter.include.includes(profileId)) { return FEED_FILTER_INCLUDE }

  return FEED_FILTER_NEUTRAL
}

/**
 * Puts one profile into one state, returning a new filter. Any manual edit drops the
 * preset link, so the button badge stops claiming a preset the filter no longer matches.
 * @param {FeedFilter} filter
 * @param {string} profileId
 * @param {string} state
 * @param {number} [cap]
 * @returns {FeedFilter}
 */
export function withProfileState(filter, profileId, state, cap = FEED_FILTER_DEFAULT_CAP) {
  const next = {
    include: filter.include.filter((id) => id !== profileId),
    exclude: filter.exclude.filter((id) => id !== profileId),
    caps: Object.fromEntries(Object.entries(filter.caps).filter(([id]) => id !== profileId)),
    presetId: null
  }

  switch (state) {
    case FEED_FILTER_INCLUDE:
      next.include.push(profileId)
      break
    case FEED_FILTER_EXCLUDE:
      next.exclude.push(profileId)
      break
    case FEED_FILTER_CAP:
      next.caps[profileId] = Math.min(Math.max(1, Math.trunc(cap) || FEED_FILTER_DEFAULT_CAP), FEED_FILTER_MAX_CAP)
      break
  }

  return next
}

/**
 * @param {FeedFilter} filter
 * @param {string} profileId
 * @returns {FeedFilter}
 */
export function cycleProfileState(filter, profileId) {
  const current = stateForProfile(filter, profileId)
  const next = STATE_CYCLE[(STATE_CYCLE.indexOf(current) + 1) % STATE_CYCLE.length]

  return withProfileState(filter, profileId, next)
}

/**
 * Resolves the filter against the profiles into the channels the feed tabs should fetch and
 * show, plus the per-channel video caps to apply afterwards.
 *
 * - the base is every `+` profile **and** every capped profile (a cap means "include, but
 *   thinned"); with none of either, the base is the active profile, so an empty filter
 *   behaves exactly like today and `− news` alone means "whatever is active, minus news"
 * - every channel of every `−` profile is then removed
 * - a channel appearing in several profiles is kept once, first occurrence winning
 * - caps come only from capped profiles: membership through `+` grants no exemption,
 *   otherwise `+ All Channels` would silently cancel every cap. Where two capped profiles
 *   share a channel, the more permissive cap wins
 * - ids of deleted profiles are skipped
 *
 * @param {object[]} profileList
 * @param {object|undefined} activeProfile
 * @param {FeedFilter} filter
 * @returns {{ channels: object[], capByChannelId: Map<string, number> }}
 */
export function resolveFeedChannels(profileList, activeProfile, filter) {
  const byId = new Map(profileList.map((profile) => [profile._id, profile]))

  /** @type {object[]} */
  const baseProfiles = []

  for (const id of filter.include) {
    const profile = byId.get(id)
    if (profile != null) { baseProfiles.push(profile) }
  }

  for (const id of Object.keys(filter.caps)) {
    const profile = byId.get(id)
    if (profile != null) { baseProfiles.push(profile) }
  }

  const excludedChannelIds = new Set()

  for (const id of filter.exclude) {
    const profile = byId.get(id)
    if (profile == null) { continue }

    for (const channel of profile.subscriptions) {
      excludedChannelIds.add(channel.id)
    }
  }

  const sources = baseProfiles.length > 0
    ? baseProfiles
    : (activeProfile != null ? [activeProfile] : [])

  /** @type {object[]} */
  const channels = []
  const kept = new Set()

  for (const profile of sources) {
    for (const channel of profile.subscriptions) {
      if (kept.has(channel.id) || excludedChannelIds.has(channel.id)) { continue }

      kept.add(channel.id)
      channels.push(channel)
    }
  }

  /** @type {Map<string, number>} */
  const capByChannelId = new Map()

  for (const [id, cap] of Object.entries(filter.caps)) {
    const profile = byId.get(id)
    if (profile == null) { continue }

    for (const channel of profile.subscriptions) {
      if (!kept.has(channel.id)) { continue }

      const existing = capByChannelId.get(channel.id)

      if (existing == null || cap > existing) {
        capByChannelId.set(channel.id, cap)
      }
    }
  }

  return { channels, capByChannelId }
}

/**
 * @typedef {object} FeedFilterPreset
 * @property {string} id
 * @property {string} name
 * @property {string[]} include
 * @property {string[]} exclude
 * @property {Record<string, number>} caps
 */

/**
 * @param {string|object[]|null|undefined} json
 * @returns {FeedFilterPreset[]}
 */
export function parseFeedFilterPresets(json) {
  let raw

  try {
    raw = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    raw = null
  }

  if (!Array.isArray(raw)) { return [] }

  return raw
    .filter((preset) => preset != null && typeof preset === 'object' && typeof preset.name === 'string')
    .map((preset) => {
      const { include, exclude, caps } = parseFeedFilter(preset)

      return {
        id: typeof preset.id === 'string' && preset.id.length > 0 ? preset.id : newPresetId(),
        name: preset.name,
        include,
        exclude,
        caps
      }
    })
}

export function newPresetId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {FeedFilterPreset} preset
 * @returns {FeedFilter}
 */
export function feedFilterFromPreset(preset) {
  return {
    include: [...preset.include],
    exclude: [...preset.exclude],
    caps: { ...preset.caps },
    presetId: preset.id
  }
}

/**
 * Stable identity of what a filter actually selects — the preset link is deliberately left
 * out, so two ways of arriving at the same view share a signature.
 * @param {FeedFilter} filter
 */
export function feedFilterSignature(filter) {
  return JSON.stringify([
    [...filter.include].sort(),
    [...filter.exclude].sort(),
    Object.entries(filter.caps).sort(([a], [b]) => (a < b ? -1 : 1))
  ])
}
