import { DBHistoryHandlers, DBProfileHandlers } from '../../../datastores/handlers/index'

/**
 * 白い熊 自由動画 — the device-to-device sync snapshot.
 *
 * Each device publishes ONE file describing its own state, and reads the other's.
 * Because neither device ever writes the other's file there is no file-level conflict
 * to resolve; the whole problem reduces to merging two snapshots, which `merge.js`
 * does. The desktop app is the only courier — see `main/sync.js` — so the phone never
 * opens a network connection, and its snapshot can be collected over ssh long after
 * the app itself was closed.
 */

/** Bumped only for a change the previous format cannot be read as. */
export const SYNC_FORMAT = 1

/** Kept in step with `SYNC_TOMBSTONE_TTL` in `datastores/handlers/base.js`. */
const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000

/**
 * Which file this build writes, and which it reads. Roles rather than device ids:
 * this is deliberately a two-device design, and a role reads far better in a
 * directory listing than a random identifier would.
 */
export const OWN_ROLE = process.env.IS_ANDROID ? 'phone' : 'pc'
export const PEER_ROLE = process.env.IS_ANDROID ? 'pc' : 'phone'

/**
 * @param {'pc' | 'phone'} role
 */
export function snapshotFileName(role) {
  return `jiyudoga-${role}.json`
}

/**
 * Tombstones that have done their job, or are old enough that both devices have
 * certainly seen them. Dropping a superseded one matters more than the age cut: a
 * channel that was unsubscribed and then subscribed again should stop carrying the
 * record of the removal, or every snapshot grows forever.
 * @param {{ at?: number }[]} [tombstones]
 * @param {string} idKey
 * @param {Map<string, number>} liveStamps id → the instant the live entry was added
 */
function pruneTombstones(tombstones, idKey, liveStamps) {
  const cutoff = Date.now() - TOMBSTONE_TTL

  return (tombstones ?? []).filter((tombstone) => {
    const at = tombstone?.at ?? 0

    if (at < cutoff) { return false }

    const liveStamp = liveStamps.get(tombstone?.[idKey])

    return liveStamp === undefined || liveStamp < at
  })
}

/**
 * @param {any[]} entries
 * @param {string} idKey
 * @param {string} stampKey
 */
function stampsById(entries, idKey, stampKey) {
  const stamps = new Map()

  for (const entry of entries ?? []) {
    if (entry?.[idKey] == null) { continue }

    stamps.set(entry[idKey], entry[stampKey] ?? 0)
  }

  return stamps
}

/**
 * Reads what this device currently holds, straight from the datastores rather than
 * from the store's caches — the caches deliberately hide the deletion tombstones, and
 * those are exactly what a snapshot has to carry.
 * @returns {Promise<{ history: any[], profiles: any[] }>}
 */
export async function readLocalState() {
  const [history, profiles] = await Promise.all([
    DBHistoryHandlers.findForSync(),
    DBProfileHandlers.find()
  ])

  return { history, profiles }
}

/**
 * @param {{ history: any[], profiles: any[] }} state
 */
export function buildSnapshot(state) {
  const cutoff = Date.now() - TOMBSTONE_TTL

  return {
    format: SYNC_FORMAT,
    role: OWN_ROLE,
    writtenAt: Date.now(),

    history: state.history.filter((record) => {
      return !record._deleted || (record.syncUpdatedAt ?? 0) >= cutoff
    }),

    profiles: state.profiles.map((profile) => {
      const subscriptions = profile.subscriptions ?? []
      const starredVideos = profile.starredVideos ?? []

      return {
        _id: profile._id,
        name: profile.name,
        bgColor: profile.bgColor,
        textColor: profile.textColor,
        subscriptions,
        subscriptionsRemoved: pruneTombstones(
          profile.subscriptionsRemoved,
          'id',
          stampsById(subscriptions, 'id', 'addedAt')
        ),
        starredVideos,
        starredRemoved: pruneTombstones(
          profile.starredRemoved,
          'videoId',
          stampsById(starredVideos, 'videoId', 'timeStarred')
        )
      }
    })
  }
}

/**
 * Parses a snapshot the other device published. Returns null for anything that is not
 * one — a truncated transfer, a file from a future format, an unrelated JSON file the
 * directory happened to contain — so the caller can simply skip this round rather
 * than merge nonsense into the database.
 * @param {string} [text]
 */
export function parseSnapshot(text) {
  if (!text) { return null }

  let snapshot

  try {
    snapshot = JSON.parse(text)
  } catch {
    return null
  }

  if (snapshot?.format !== SYNC_FORMAT) { return null }
  if (!Array.isArray(snapshot.history) || !Array.isArray(snapshot.profiles)) { return null }

  return snapshot
}
