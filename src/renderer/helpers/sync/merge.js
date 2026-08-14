/**
 * 白い熊 自由動画 — merging the other device's snapshot into this one.
 *
 * Pure: it reads two plain states and returns a plan of writes. No datastore, no
 * platform, no I/O — which is why the desktop and the phone can run the identical
 * merge, and why it can be reasoned about on its own.
 *
 * The rule throughout is last-writer-wins per record, decided by a modification stamp
 * rather than by which snapshot arrived last. A deletion is a fact like any other and
 * carries its own instant (see the tombstones in `datastores/handlers/base.js`),
 * because a record that is merely *absent* from the far side is indistinguishable
 * from one that was deliberately removed there.
 *
 * A plan entry is emitted only when it would genuinely change local content. That is
 * what stops the two devices handing the same records back and forth forever:
 * applying a record restamps it locally, so this device then looks "newer" than the
 * one it copied from — but the content matches, so the far side plans nothing.
 */

/**
 * Records written before this feature existed have no stamp, so the instant the video
 * was watched stands in for one. That makes the first sync a plain union, which is
 * what it should be.
 * @param {object} record
 */
function historyStamp(record) {
  return record.syncUpdatedAt ?? record.timeWatched ?? 0
}

/**
 * The fields a sync is actually about. Deliberately not the whole record: view counts
 * and descriptions are re-fetched independently on each device and would differ
 * forever, so comparing them would mean rewriting the history on every single sync.
 * @param {object} a
 * @param {object} b
 */
function sameWatchState(a, b) {
  return (a.watchProgress ?? 0) === (b.watchProgress ?? 0) &&
    (a.timeWatched ?? 0) === (b.timeWatched ?? 0)
}

/**
 * `_id` is per-device: nedb refuses to change one on an existing document, so a record
 * copied from the far side must arrive without it and be matched on `videoId` instead.
 * @param {object} record
 */
function forUpsert(record) {
  const { _id, _deleted, ...rest } = record

  return rest
}

/**
 * @param {any[]} [base]
 * @param {any[]} [incoming]
 * @param {string} idKey
 */
function unionTombstones(base, incoming, idKey) {
  const latest = new Map()

  for (const tombstone of [...(base ?? []), ...(incoming ?? [])]) {
    const id = tombstone?.[idKey]

    if (id == null) { continue }

    const existing = latest.get(id)

    if (existing === undefined || (tombstone.at ?? 0) > (existing.at ?? 0)) {
      latest.set(id, { ...tombstone })
    }
  }

  return Array.from(latest.values())
}

/**
 * @param {any[]} [tombstones]
 * @param {string} idKey
 */
function tombstoneStamps(tombstones, idKey) {
  const stamps = new Map()

  for (const tombstone of tombstones ?? []) {
    if (tombstone?.[idKey] == null) { continue }

    stamps.set(tombstone[idKey], tombstone.at ?? 0)
  }

  return stamps
}

/**
 * Merges one list of entries and its tombstones against the far side's, in place on a
 * copy. Subscriptions and starred videos are the same problem twice over — an id, an
 * instant it was added, and a list of removals — so they share this.
 * @param {any[]} entries the local list, mutated
 * @param {string} idKey
 * @param {string} stampKey the field holding when the entry was added
 * @param {any[]} [remoteEntries]
 * @param {Map<string, number>} localRemovedAt
 * @param {Map<string, number>} remoteRemovedAt
 * @returns {boolean} whether anything actually changed
 */
function mergeEntries(entries, idKey, stampKey, remoteEntries, localRemovedAt, remoteRemovedAt) {
  let changed = false

  const localStamps = new Map(entries.map((entry) => [entry[idKey], entry[stampKey] ?? 0]))

  // what the far side has and we do not — unless we removed it later than it added it
  for (const entry of remoteEntries ?? []) {
    const id = entry?.[idKey]

    if (id == null || localStamps.has(id)) { continue }

    const removedAt = localRemovedAt.get(id)

    if (removedAt !== undefined && removedAt >= (entry[stampKey] ?? 0)) { continue }

    entries.push({ ...entry })
    changed = true
  }

  // what the far side removed — unless we added it back afterwards
  for (const [id, at] of remoteRemovedAt) {
    const index = entries.findIndex((entry) => entry[idKey] === id)

    if (index === -1) { continue }

    if ((entries[index][stampKey] ?? 0) >= at) { continue }

    entries.splice(index, 1)
    changed = true
  }

  return changed
}

/**
 * @param {object} localProfile
 * @param {object} remoteProfile
 * @returns {object | null} the document to write, or null when nothing changed
 */
function mergeProfile(localProfile, remoteProfile) {
  const subscriptions = [...(localProfile.subscriptions ?? [])]
  const starredVideos = [...(localProfile.starredVideos ?? [])]

  const subscriptionsChanged = mergeEntries(
    subscriptions,
    'id',
    'addedAt',
    remoteProfile.subscriptions,
    tombstoneStamps(localProfile.subscriptionsRemoved, 'id'),
    tombstoneStamps(remoteProfile.subscriptionsRemoved, 'id')
  )

  const starredChanged = mergeEntries(
    starredVideos,
    'videoId',
    'timeStarred',
    remoteProfile.starredVideos,
    tombstoneStamps(localProfile.starredRemoved, 'videoId'),
    tombstoneStamps(remoteProfile.starredRemoved, 'videoId')
  )

  if (!subscriptionsChanged && !starredChanged) { return null }

  // The name and the colours are deliberately left alone: they are the one thing that
  // is reasonable to want different on each device, and nothing about a subscription
  // list implies the profile should be renamed to match.
  return {
    ...localProfile,
    subscriptions,
    starredVideos,
    subscriptionsRemoved: unionTombstones(localProfile.subscriptionsRemoved, remoteProfile.subscriptionsRemoved, 'id'),
    starredRemoved: unionTombstones(localProfile.starredRemoved, remoteProfile.starredRemoved, 'videoId')
  }
}

/**
 * @param {object} remoteProfile
 */
function newProfileFrom(remoteProfile) {
  return {
    _id: remoteProfile._id,
    name: remoteProfile.name,
    bgColor: remoteProfile.bgColor,
    textColor: remoteProfile.textColor,
    subscriptions: remoteProfile.subscriptions ?? [],
    subscriptionsRemoved: remoteProfile.subscriptionsRemoved ?? [],
    starredVideos: remoteProfile.starredVideos ?? [],
    starredRemoved: remoteProfile.starredRemoved ?? []
  }
}

/**
 * @param {{ history: any[], profiles: any[] }} local this device, tombstones included
 * @param {{ history: any[], profiles: any[] }} remote the snapshot the other published
 * @returns {{
 *   historyUpserts: any[],
 *   historyDeletions: string[],
 *   profileUpdates: any[],
 *   profileCreations: any[],
 *   changeCount: number
 * }}
 */
export function planMerge(local, remote) {
  const historyUpserts = []
  const historyDeletions = []
  const profileUpdates = []
  const profileCreations = []

  const localHistory = new Map()

  for (const record of local.history) {
    if (record?.videoId == null) { continue }

    localHistory.set(record.videoId, record)
  }

  for (const remoteRecord of remote.history) {
    if (remoteRecord?.videoId == null) { continue }

    const localRecord = localHistory.get(remoteRecord.videoId)

    if (localRecord !== undefined && historyStamp(remoteRecord) <= historyStamp(localRecord)) { continue }

    if (remoteRecord._deleted) {
      // nothing to erase if we never had it — and the tombstone itself is not worth
      // storing, since our snapshot's silence says the same thing
      if (localRecord !== undefined && !localRecord._deleted) {
        historyDeletions.push(remoteRecord.videoId)
      }

      continue
    }

    if (localRecord !== undefined && !localRecord._deleted && sameWatchState(localRecord, remoteRecord)) { continue }

    historyUpserts.push(forUpsert(remoteRecord))
  }

  const localById = new Map()
  const localByName = new Map()

  for (const profile of local.profiles) {
    localById.set(profile._id, profile)

    if (!localByName.has(profile.name)) {
      localByName.set(profile.name, profile)
    }
  }

  for (const remoteProfile of remote.profiles) {
    if (remoteProfile?._id == null) { continue }

    // Matched by id first — "All Channels" has the same fixed id on every device, so
    // the profile that matters always lines up. A profile created separately on each
    // device has two different ids, and its name is the only thing left to go on.
    const localProfile = localById.get(remoteProfile._id) ?? localByName.get(remoteProfile.name)

    if (localProfile === undefined) {
      profileCreations.push(newProfileFrom(remoteProfile))
      continue
    }

    const merged = mergeProfile(localProfile, remoteProfile)

    if (merged !== null) {
      profileUpdates.push(merged)
    }
  }

  return {
    historyUpserts,
    historyDeletions,
    profileUpdates,
    profileCreations,
    changeCount: historyUpserts.length + historyDeletions.length + profileUpdates.length + profileCreations.length
  }
}
