package io.freetubeapp.freetube.backup

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Fork (白い熊 自由動画): the 保存復元 state-export automation contract.
 *
 * 自由作業盤 (`shiroikuma.jiyusagyoban`) fires a token-gated broadcast at every sister app
 * in one batch run; each app exports itself headlessly and replies with the written path
 * and size. The wire contract is documented in that project's hand-off; the constraints
 * that look like they could be simplified are hard won on 白い熊's Mate XT:
 *
 * - the reply is a FRESH BROADCAST, never a `ResultReceiver`/`PendingIntent`/`Messenger`
 *   (EMUI will not reliably carry a live Binder into another app's manifest receiver);
 * - the ordered-broadcast result is set too, but is never the only reply (EMUI severs it);
 * - `FLAG_INCLUDE_STOPPED_PACKAGES` matters, or a backgrounded caller never hears us.
 */
class StateExportReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "StateExport"
    private const val PROGRESS_INTERVAL_MS = 500L
  }

  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    val action = intent.action ?: return

    val replyAction = intent.getStringExtra("reply_action")
    val replyPackage = intent.getStringExtra("reply_package")
    val replyId = intent.getStringExtra("reply_id") ?: ""
    val replied = AtomicBoolean(false)

    val pendingResult = goAsync()

    // Exactly one terminal reply per request, whichever path gets there first.
    val reply: (String) -> Unit = { result ->
      if (replied.compareAndSet(false, true)) {
        Log.i(TAG, "$action → $result")
        if (!replyAction.isNullOrEmpty() && !replyPackage.isNullOrEmpty()) {
          runCatching {
            app.sendBroadcast(
              Intent(replyAction).apply {
                setPackage(replyPackage)
                addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES)
                putExtra("reply_id", replyId)
                putExtra("result", result)
              }
            )
          }
        }
        runCatching { pendingResult.resultData = result }
        runCatching { pendingResult.finish() }
      }
    }

    // CANCEL_EXPORT is fire-and-forget: it answers NOTHING, not even a gate error — a reply
    // would carry the cancelled export's own reply_id and could be mistaken for its outcome.
    val isCancel = action.endsWith(".action.CANCEL_EXPORT")
    val finishQuietly: () -> Unit = {
      if (replied.compareAndSet(false, true)) {
        runCatching { pendingResult.finish() }
      }
    }

    if (!AutomationAuth.isEnabled(app)) {
      if (isCancel) finishQuietly() else reply("ERROR:automation disabled")
      return
    }
    if (!AutomationAuth.matches(app, intent.getStringExtra("token"))) {
      if (isCancel) finishQuietly() else reply("ERROR:bad token")
      return
    }

    when {
      action.endsWith(".action.LIST_CATEGORIES") -> reply(listCategories())
      action.endsWith(".action.EXPORT_STATE") -> runExport(app, intent, replyId, replyPackage, reply)
      isCancel -> {
        // An absent reply_id means "the export you are running", which is unambiguous.
        // Nothing running (or already finished) is a silent no-op, never an error.
        val flagged = ExportControl.cancel(replyId.ifEmpty { null })
        Log.i(TAG, "$action → ${if (flagged) "cancelling" else "nothing running"}")
        finishQuietly()
      }
      else -> reply("ERROR:unknown action")
    }
  }

  /**
   * `OK:` + one `id<TAB>label<TAB>parent<TAB>on|off` line per category — the contract's
   * fourth field says whether the item starts ticked, and the third stays EMPTY for a
   * top-level item so the flag keeps its position.
   */
  private fun listCategories(): String =
    "OK:" + StateCategories.ALL.joinToString("\n") { category ->
      val default = if (category.defaultSelected) "on" else "off"
      "${category.id}\t${category.label}\t${category.parent ?: ""}\t$default"
    }

  private fun runExport(
    app: Context,
    intent: Intent,
    replyId: String,
    replyPackage: String?,
    reply: (String) -> Unit
  ) {
    val items = intent.getStringExtra("items")
      ?.split(',')
      ?.map { it.trim() }
      ?.filter { it.isNotEmpty() }
      ?: emptyList()

    val unknown = StateCategories.unknown(items)
    if (unknown.isNotEmpty()) {
      reply("ERROR:unknown category in items: ${unknown.joinToString(",")}")
      return
    }

    val progressAction = intent.getStringExtra("progress_action")
    val pathOverride = intent.getStringExtra("path")
    val label = app.getString(io.freetubeapp.freetube.R.string.app_name)
    var lastProgressAt = 0L

    val progress = StateBackup.Progress { text, current, total, unit ->
      if (progressAction.isNullOrEmpty() || replyPackage.isNullOrEmpty()) {
        return@Progress
      }
      val now = System.currentTimeMillis()
      if (now - lastProgressAt < PROGRESS_INTERVAL_MS) {
        return@Progress
      }
      lastProgressAt = now
      runCatching {
        app.sendBroadcast(
          Intent(progressAction).apply {
            setPackage(replyPackage)
            addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES)
            putExtra("reply_id", replyId)
            putExtra("app", label)
            putExtra("text", text)
            putExtra("current", current)
            putExtra("total", total)
            putExtra("unit", unit)
          }
        )
      }
    }

    // A plain worker thread rather than a coroutine — this module carries no
    // kotlinx-coroutines dependency, and goAsync() already holds the broadcast open.
    Thread {
      try {
        val written = BackupWriter.write(app, items, pathOverride, progress, replyId)

        // always a final progress line at completion, throttling notwithstanding
        lastProgressAt = 0L
        progress.report(
          "categories ${written.categories}/${written.categories} — done",
          written.categories.toLong(),
          written.categories.toLong(),
          "categories"
        )

        reply(
          "OK:${written.path}|${written.bytes}|${StateBackup.humanSize(written.bytes)}|" +
            "${written.categories} categories"
        )
      } catch (_: ExportControl.Cancelled) {
        // The partial file is already gone (BackupWriter's cleanup path). This terminal
        // reply goes out even though nobody may still be listening: it is what proves the
        // run ended rather than carrying on unseen.
        reply("ERROR:cancelled")
      } catch (_: BackupWriter.NoDirectory) {
        reply("ERROR:no-directory")
      } catch (_: BackupWriter.NoStorageAccess) {
        reply("ERROR:no-storage-access")
      } catch (exception: Exception) {
        Log.w(TAG, "export failed", exception)
        reply("ERROR:${exception.message ?: exception.javaClass.simpleName}")
      }
    }.start()
  }
}
