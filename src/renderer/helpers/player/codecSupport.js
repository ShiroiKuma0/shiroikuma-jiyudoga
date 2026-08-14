/**
 * Keeps codecs the platform cannot actually play out of the manifests we hand shaka.
 *
 * `MediaSource.isTypeSupported` is the check that governs `addSourceBuffer`, and it is not
 * always what shaka's own support filtering concludes. On an Android WebView with no AV1
 * decoder, MediaCapabilities still reports av01 as decodable, so those variants survive
 * filtering and then throw out of `addSourceBuffer` — shaka error 3015
 * (MEDIA_SOURCE_OPERATION_THREW), which FreeTube reports as "Unable to play DASH formats"
 * before falling back to legacy progressive formats. A modern upload no longer has any, so
 * the video simply refuses to start. Measured on a Kirin device, 2026-08-14: every
 * `video/mp4; codecs="av01.*"` string returns false here while avc1, vp9, opus and mp4a
 * all return true.
 *
 * Dropping them at manifest-build time costs nothing where the codec IS supported: on
 * desktop nothing matches and the filter is inert.
 */

/** @type {Map<string, boolean>} */
const supportCache = new Map()

/**
 * @param {string} mimeType a full type with codecs, e.g. `video/mp4; codecs="av01.0.05M.08"`
 * @returns {boolean}
 */
export function isPlayableMimeType(mimeType) {
  let supported = supportCache.get(mimeType)

  if (supported === undefined) {
    try {
      supported = MediaSource.isTypeSupported(mimeType)
    } catch {
      // No MediaSource to ask (or it rejected the string outright): assume playable rather
      // than filter on an answer we do not have.
      supported = true
    }
    supportCache.set(mimeType, supported)
  }

  return supported
}

/**
 * @param {string} mimeType
 * @returns {'audio'|'video'}
 */
function trackKind(mimeType) {
  return mimeType.startsWith('audio/') ? 'audio' : 'video'
}

/**
 * Builds the predicate the manifest builders use to reject formats, from the full set of
 * types a video offers.
 *
 * A format is rejected only while a playable one of the same kind survives: stripping a
 * track type down to nothing would trade a recoverable error for an empty manifest, which
 * is strictly worse than letting shaka try and fail.
 *
 * @param {Iterable<string>} mimeTypes every format's full mime type, both kinds
 * @returns {(mimeType: string) => boolean} true when the format should be rejected
 */
export function createUnplayableFormatFilter(mimeTypes) {
  /** @type {Set<'audio'|'video'>} */
  const playableKinds = new Set()

  for (const mimeType of mimeTypes) {
    if (isPlayableMimeType(mimeType)) {
      playableKinds.add(trackKind(mimeType))
    }
  }

  return (mimeType) => !isPlayableMimeType(mimeType) && playableKinds.has(trackKind(mimeType))
}
