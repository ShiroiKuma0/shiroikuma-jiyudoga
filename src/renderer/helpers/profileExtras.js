// The fork's own fields on a profile document — the starred videos and the Similar
// tab's tuning (blocked channels, rejected videos, learned terms, seed channels).
//
// They live on the profile so they travel with it: the Android backup writes profile
// documents whole, and the desktop "FreeTube subscriptions" file is one JSON profile
// per line. Both round trips therefore carry them, provided the import merges them —
// which is what the merge functions here are for.

// A seed channel that produced this many rejected recommendations stops seeding
export const SIMILAR_SEED_DEMERIT_LIMIT = 3

// Rejecting a video only blames its seeds when the provenance is narrow: a video
// recommended by seeds from many different channels says nothing about any one of them
export const SIMILAR_MAX_SEEDS_TO_BLAME = 2

/**
 * Stored as arrays, never as objects keyed by term: nedb rejects field names
 * containing a ".", which both Latin words and CJK bigrams can contain.
 */
export function emptySimilarTuning() {
  return {
    blockedChannels: [],
    blockedVideos: [],
    negativeTerms: [],
    seedChannels: []
  }
}

/**
 * @param {object} [similarTuning]
 */
export function withSimilarTuningDefaults(similarTuning) {
  return { ...emptySimilarTuning(), ...(similarTuning ?? {}) }
}

/**
 * @param {any[]} base
 * @param {any[]} incoming
 * @param {string} idKey
 */
function unionBy(base, incoming, idKey) {
  const merged = []
  const seen = new Set()

  for (const entry of [...base, ...incoming]) {
    const id = entry?.[idKey]

    if (id == null || seen.has(id)) { continue }

    seen.add(id)
    merged.push({ ...entry })
  }

  return merged
}

/**
 * @param {any[]} [base]
 * @param {any[]} [incoming]
 */
export function mergeStarredVideos(base, incoming) {
  return unionBy(base ?? [], incoming ?? [], 'videoId')
}

/**
 * Unions two lists of deletion tombstones, keeping the LATEST `at` per key — unlike
 * `unionBy`, where first-seen wins. A tombstone is a claim about *when* something was
 * removed, and the sync merge decides by comparing that instant against the far side's
 * `addedAt` / `timeStarred`, so keeping the older of two claims would let a stale
 * re-add win and the entry would come back.
 * @param {any[]} [base]
 * @param {any[]} [incoming]
 * @param {string} idKey
 */
export function mergeTombstones(base, incoming, idKey) {
  const latest = new Map()

  for (const entry of [...(base ?? []), ...(incoming ?? [])]) {
    const id = entry?.[idKey]

    if (id == null) { continue }

    const existing = latest.get(id)

    if (existing == null || (entry.at ?? 0) > (existing.at ?? 0)) {
      latest.set(id, { ...entry })
    }
  }

  return Array.from(latest.values())
}

/**
 * Unions two tunings. Term weights and seed demerits are combined with max() rather
 * than by adding: importing the same backup twice must not inflate what the profile
 * has learned, and the entries those numbers count (rejected videos) are themselves
 * deduplicated by id.
 * @param {object} [base]
 * @param {object} [incoming]
 */
export function mergeSimilarTuning(base, incoming) {
  const a = withSimilarTuningDefaults(base)
  const b = withSimilarTuningDefaults(incoming)

  const termWeights = new Map()

  for (const { term, weight } of [...a.negativeTerms, ...b.negativeTerms]) {
    termWeights.set(term, Math.max(termWeights.get(term) ?? 0, weight))
  }

  const seedChannels = []
  const seedById = new Map()

  for (const seed of [...a.seedChannels, ...b.seedChannels]) {
    const existing = seedById.get(seed.id)

    if (existing == null) {
      const copy = { ...seed }
      seedById.set(seed.id, copy)
      seedChannels.push(copy)
    } else {
      existing.demerits = Math.max(existing.demerits ?? 0, seed.demerits ?? 0)
      existing.blocked = existing.blocked || seed.blocked
      existing.name ||= seed.name
    }
  }

  return {
    blockedChannels: unionBy(a.blockedChannels, b.blockedChannels, 'id'),
    blockedVideos: unionBy(a.blockedVideos, b.blockedVideos, 'videoId'),
    negativeTerms: Array.from(termWeights, ([term, weight]) => ({ term, weight })),
    seedChannels
  }
}
