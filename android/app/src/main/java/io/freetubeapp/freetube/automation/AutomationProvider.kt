package io.freetubeapp.freetube.automation

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import io.freetubeapp.freetube.backup.AutomationAuth
import io.freetubeapp.freetube.backup.ExportControl
import io.freetubeapp.freetube.backup.StateCategories

/**
 * Fork (白い熊 自由動画): the contract v2 data door — export this app's own state, and put it
 * back, for a caller we can identify.
 *
 * ## Why a provider and not the broadcast receiver next to it
 *
 * **A broadcast cannot tell you who sent it.** v1's answer to that was a shared secret, which
 * cannot survive the wipe this feature exists to recover from. A provider gets the caller's
 * identity from the framework — see [AutomationCallers] for what is checked and why a
 * `shiroikuma.*` prefix would have been strictly weaker than the token it replaced.
 *
 * **A list needs a synchronous answer.** 応用管理 draws a row per installed app before any export
 * exists; a broadcast round trip per app to fill a list is the wrong shape.
 *
 * ## What does NOT happen here
 *
 * The payload. `call()` validates, starts a foreground service and returns — tens of megabytes
 * over minutes inside a binder call would block the caller, report no progress, refuse
 * cancellation and die silently if this process were killed. The bytes go through a file
 * descriptor the caller opened; the terminal answer comes back on the broadcast the family
 * already proved on EMUI.
 *
 * ## `import` lives ONLY here
 *
 * It never gets a broadcast action. An import overwrites this app's data, and the §1 receiver is
 * `exported="true"` with no permission — an import there would let any app on the phone wipe any
 * sister app's history, playlists and profiles.
 */
class AutomationProvider : ContentProvider() {

  override fun onCreate(): Boolean = true

  /**
   * Every method answers a [Bundle] with [KEY_RESULT] — `OK…` or `ERROR:…`, the same vocabulary
   * the broadcast contract uses, so a caller has one grammar to parse rather than two.
   *
   * A refusal is returned, never thrown: an exception across a binder reaches the caller as a
   * `RuntimeException` carrying our stack trace, which tells 白い熊 nothing and tells a
   * misbehaving caller rather more than it should.
   */
  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    val ctx = context?.applicationContext ?: return fail("ERROR:not ready")

    // WHO, before WHAT. A caller we cannot identify gets the same answer whatever it asked for.
    when (val verdict = AutomationCallers.verify(ctx, callingPackage)) {
      is AutomationCallers.Verdict.Refused -> return fail(verdict.why)
      AutomationCallers.Verdict.Allowed -> Unit
    }
    // Then this app's own switches. A token is ignored unless this app asks for one.
    AutomationAuth.refuse(ctx, extras?.getString(KEY_TOKEN))?.let { return fail(it) }

    return when (method) {
      METHOD_DESCRIBE -> ok(describe(ctx))
      METHOD_EXPORT -> start(ctx, extras, importing = false)
      METHOD_IMPORT -> start(ctx, extras, importing = true)
      METHOD_CANCEL -> {
        val id = extras?.getString(KEY_JOB_ID)
        AutomationJobs.cancel(id)
        // The write loop unwinds on ExportControl — the same flag CANCEL_EXPORT raises on the
        // broadcast door. One way to stop, whoever asks.
        ExportControl.cancel(id)
        ok("OK:cancelled")
      }
      else -> fail("ERROR:unknown method: $method")
    }
  }

  /**
   * What this app would export, answered without exporting anything.
   *
   * Returned from the call rather than written into the archive, deliberately: 応用管理 must draw
   * a row before an export exists, and at restore must judge compatibility **before** streaming
   * an archive into an app that would reject it — which it cannot do if the header is buried
   * inside an encrypted archive.
   */
  private fun describe(ctx: Context): String {
    val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
    @Suppress("DEPRECATION") val code = info.versionCode
    // The leaves actually written, not the parent groups: `contains` is rendered verbatim to
    // 白い熊, and "settings" over ten slices tells them less than the slices do.
    val contains = StateCategories.ALL
      .filter { it.defaultSelected && it.store != null }
      .joinToString(",") { "\"${it.label}\"" }

    return "OK:" + """
      {"app_id":"${ctx.packageName}",
       "version_code":$code,
       "version_name":"${info.versionName.orEmpty()}",
       "format":$FORMAT,
       "min_format_readable":$MIN_FORMAT_READABLE,
       "requires_launch_first":false,
       "contains":[$contains]}
    """.trimIndent().replace("\n", "")
  }

  /**
   * Hand the descriptor to a foreground service and get out of the way.
   *
   * The descriptor is **duplicated** first: the one in [extras] belongs to the binder transaction
   * and is closed the moment `call()` returns, so a service reading it afterwards would find it
   * shut — a bug that only shows under load.
   *
   * And if the service will not start, the dup is closed and the job dropped **before** we
   * answer. `startForegroundService` from a binder call is a background start, and on API 31+ it
   * can be refused outright with `ForegroundServiceStartNotAllowedException` unless the app is
   * exempt from battery optimisation. Without this the caller's open file is stranded in a map
   * nothing will ever read, and the exception crosses the binder as a stack trace instead of a
   * refusal. (The reference implementation leaked on exactly this path.)
   */
  private fun start(ctx: Context, extras: Bundle?, importing: Boolean): Bundle {
    @Suppress("DEPRECATION")
    val fd = extras?.getParcelable<ParcelFileDescriptor>(KEY_FD)
      ?: return fail("ERROR:no descriptor")
    val dup = runCatching { fd.dup() }.getOrNull() ?: return fail("ERROR:descriptor unusable")

    val jobId = AutomationJobs.begin()
    val failure = AutomationDataService.start(ctx, jobId, dup, importing, extras)

    if (failure != null) {
      AutomationJobs.finish(jobId)
      runCatching { dup.close() }
      return fail("ERROR:$failure")
    }
    return ok("OK:$jobId")
  }

  private fun ok(result: String) = Bundle().apply { putString(KEY_RESULT, result) }
  private fun fail(why: String) = Bundle().apply { putString(KEY_RESULT, why) }

  // A provider that is only ever `call()`ed still has to answer these. Refusing loudly beats
  // returning an empty cursor, which reads downstream as "there is no data" rather than
  // "wrong door".
  override fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor =
    throw UnsupportedOperationException("automation is call() only")

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri =
    throw UnsupportedOperationException("automation is call() only")

  override fun delete(uri: Uri, s: String?, a: Array<String>?): Int =
    throw UnsupportedOperationException("automation is call() only")

  override fun update(u: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int =
    throw UnsupportedOperationException("automation is call() only")

  companion object {
    const val METHOD_DESCRIBE = "describe"
    const val METHOD_EXPORT = "export"
    const val METHOD_IMPORT = "import"
    const val METHOD_CANCEL = "cancel"

    const val KEY_RESULT = "result"
    const val KEY_FD = "fd"
    const val KEY_TOKEN = "token"
    const val KEY_JOB_ID = "job_id"
    const val KEY_ITEMS = "items"
    const val KEY_REPLY_ACTION = "reply_action"
    const val KEY_REPLY_PACKAGE = "reply_package"
    const val KEY_PROGRESS_ACTION = "progress_action"

    /** This app's archive format. Bumped when an older build could no longer read what we write. */
    const val FORMAT = 1

    /**
     * The oldest archive this build can still read.
     *
     * Version skew has a direction: old data into a newer app is normally fine, because an app
     * migrates its own storage; newer data into an older app is not. This is what lets a caller
     * refuse the second case at discovery time, before anything is streamed.
     */
    const val MIN_FORMAT_READABLE = 1
  }
}
