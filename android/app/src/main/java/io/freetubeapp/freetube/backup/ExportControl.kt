package io.freetubeapp.freetube.backup

/**
 * Fork (白い熊 自由動画): cooperative cancellation for a running export.
 *
 * The 保存復元 contract gained `CANCEL_EXPORT` (2026-07-28) after a cancelled export ran to
 * the end and delivered a backup 白い熊 had already stopped. The cancel arrives on the
 * exported receiver — a third-party app cannot start our (correctly unexported) service —
 * and only raises a flag here: the write loop unwinds at the next entry boundary, never
 * mid-`write()`, and [BackupWriter] deletes the partial file so the backup directory is
 * left exactly as it was found.
 *
 * Two exports at once are forbidden by the contract, so one flag is enough; the optional
 * `reply_id` merely stops a stale cancel from killing a later run.
 *
 * Both export paths register here — the token-gated broadcast and the Export/Import panel
 * alike — so there is one way to unwind, whoever asks.
 */
object ExportControl {

  /** Thrown out of the write loop once a cancel has been requested. */
  class Cancelled : Exception("cancelled")

  @Volatile
  private var activeId: String? = null

  @Volatile
  private var cancelled = false

  /** Marks an export as running. [replyId] is "" for callers that carry no request id. */
  @Synchronized
  fun begin(replyId: String) {
    activeId = replyId
    cancelled = false
  }

  @Synchronized
  fun end() {
    activeId = null
    cancelled = false
  }

  /**
   * Asks the running export to stop. A silent no-op when nothing runs (or has already
   * finished), and when [replyId] names a different request than the one in flight.
   *
   * @return true when a running export was actually flagged
   */
  @Synchronized
  fun cancel(replyId: String?): Boolean {
    val active = activeId ?: return false
    if (!replyId.isNullOrEmpty() && active.isNotEmpty() && replyId != active) {
      return false
    }
    cancelled = true
    return true
  }

  /** The write loop's unwind point — called between entries, never mid-write. */
  fun throwIfCancelled() {
    if (cancelled) {
      throw Cancelled()
    }
  }
}
