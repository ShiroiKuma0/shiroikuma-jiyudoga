package io.freetubeapp.freetube.automation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import io.freetubeapp.freetube.R
import io.freetubeapp.freetube.backup.ExportControl
import io.freetubeapp.freetube.backup.StateBackup
import io.freetubeapp.freetube.backup.StateCategories
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Fork (白い熊 自由動画): where a data export or import driven through [AutomationProvider]
 * actually runs.
 *
 * ## Why a foreground service and not the provider call
 *
 * The call returns in milliseconds; this can run for minutes. Two hard reasons:
 *
 * - **A binder call holds the caller.** 応用管理 is drawing a list; a multi-minute synchronous
 *   call would freeze its UI, report no progress and refuse cancellation.
 * - **A backgrounded app writing for minutes is frozen mid-stream on this phone**, which yields a
 *   truncated archive underneath a success reply — the worst failure available, because it is
 *   indistinguishable from a good backup until the day it is restored.
 *
 * ## The descriptor
 *
 * Already duplicated by [AutomationProvider] before it got here, because the original belongs to
 * the binder transaction and is closed the moment `call()` returns. This service owns the copy
 * and closes it in a `finally` — leaking one holds the caller's file open, and a caller cannot
 * checksum or encrypt a file that is still open.
 *
 * ## Progress
 *
 * §3 applies to this door too, whenever the caller passed a `progress_action`. The **job id is
 * the correlation id**, set in BOTH `job_id` and `reply_id` so one progress reader serves this
 * door and the broadcast one. Including the heartbeat: an app silent for two minutes is presumed
 * dead and its slot failed, so a message goes out at least every 30 s even when the numbers have
 * not moved.
 */
class AutomationDataService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // GOING FOREGROUND IS THE FIRST THING THAT HAPPENS, before any early return, and every extra
    // is read defensively off a nullable intent.
    //
    // Once the provider has called `startForegroundService`, the platform REQUIRES a matching
    // `startForeground` whatever this method then decides to do. The obvious shape — give up
    // early when the job id names nothing — therefore kills the very app being backed up, and a
    // caller retrying with a stale id is exactly how that happens. (Nine ports in this family hit
    // it; the reference implementation had it too.)
    val importing = intent?.getBooleanExtra(EXTRA_IMPORTING, false) ?: false
    val jobId = intent?.getStringExtra(EXTRA_JOB)
    val items = intent?.getStringExtra(AutomationProvider.KEY_ITEMS)
    val replyAction = intent?.getStringExtra(AutomationProvider.KEY_REPLY_ACTION)
    val replyPackage = intent?.getStringExtra(AutomationProvider.KEY_REPLY_PACKAGE)
    val progressAction = intent?.getStringExtra(AutomationProvider.KEY_PROGRESS_ACTION)

    // `specialUse` is an API 34 value: ask for the typed overload only there, take the plain one
    // below it, and trust neither — EMUI reports SDK_INT 31 on a platform based on Android 13, so
    // a version-derived guess is wrong in both directions here.
    val foregrounded = runCatching {
      val note = notification(importing)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, note)
      }
    }

    val fd = jobId?.let { HANDOVER.remove(it) }

    if (foregrounded.isFailure) {
      Log.w(TAG, "startForeground refused", foregrounded.exceptionOrNull())
      runCatching { fd?.close() }
      jobId?.let { AutomationJobs.finish(it) }
      if (jobId != null) {
        sendReply(replyAction, replyPackage, jobId, "ERROR:foreground service refused")
      }
      return stop(startId)
    }

    if (jobId == null || fd == null) {
      // A stale start: the handover was already consumed, or this is a retry of a job that has
      // finished. Nothing to do — and deliberately nothing to SAY, because a reply here would
      // carry the id of a run that is already over and could be mistaken for its outcome. The
      // foreground obligation above has been met, so stopping now is safe.
      Log.i(TAG, "no live job for ${jobId ?: "(missing id)"} — stale start, stopping quietly")
      return stop(startId)
    }

    val replied = AtomicBoolean(false)
    val reply: (String) -> Unit = { result ->
      // Exactly one terminal answer per job, whatever path got here — a synchronous failure and
      // an asynchronous success must never both fire.
      if (replied.compareAndSet(false, true)) {
        Log.i(TAG, "$jobId → $result")
        AutomationJobs.finish(jobId)
        sendReply(replyAction, replyPackage, jobId, result)
      }
    }

    val progress = Reporter(this, jobId, progressAction, replyPackage)

    // A plain worker thread rather than a coroutine — this module carries no kotlinx-coroutines
    // dependency, and the receiver door next door already works this way.
    Thread {
      try {
        progress.start()
        fd.use { open ->
          if (importing) runImport(open, items, reply) else runExport(jobId, open, items, progress, reply)
        }
      } catch (_: ExportControl.Cancelled) {
        reply("ERROR:cancelled")
      } catch (throwable: Throwable) {
        Log.w(TAG, "automation ${if (importing) "import" else "export"} failed", throwable)
        reply("ERROR:${throwable.message ?: throwable.javaClass.simpleName}")
      } finally {
        progress.stop()
        ExportControl.end()
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        stopSelf(startId)
      }
    }.start()

    return START_NOT_STICKY
  }

  private fun runExport(
    jobId: String,
    fd: ParcelFileDescriptor,
    items: String?,
    progress: Reporter,
    reply: (String) -> Unit
  ) {
    val ids = parseItems(items)
    val unknown = StateCategories.unknown(ids)
    if (unknown.isNotEmpty()) {
      reply("ERROR:unknown category in items: ${unknown.joinToString(",")}")
      return
    }

    // The job id doubles as the cancellation id, so a `cancel` through the provider unwinds the
    // same write loop the broadcast door's CANCEL_EXPORT does.
    ExportControl.begin(jobId)

    var written = 0L
    val categories = ParcelFileDescriptor.AutoCloseOutputStream(fd).use { out ->
      // Counted as it goes rather than stat'ed afterwards: the caller owns the file and we may not
      // be able to see it at all — it can be an anonymous pipe, or a descriptor into a directory
      // this app cannot list.
      val counting = object : OutputStream() {
        override fun write(b: Int) {
          out.write(b)
          written++
        }

        override fun write(b: ByteArray, off: Int, len: Int) {
          out.write(b, off, len)
          written += len
        }
      }
      StateBackup.export(this, ids, counting, progress.sink)
    }

    // Always a final message at completion, throttling notwithstanding.
    progress.final("categories $categories/$categories — done", categories.toLong(), "categories")
    reply("OK:$written|${StateBackup.humanSize(written)}|$categories categories")
  }

  /**
   * Read the whole archive before touching anything.
   *
   * [StateBackup.import] wants the bytes, and that is the right shape here for a reason beyond
   * convenience: a partial read that failed halfway would import half an archive, and a
   * half-restored app is worse than one that refused. This fork's archive is nedb JSON — settings,
   * profiles, playlists, history — so it is measured in megabytes rather than the corpora some
   * sister apps carry, and [MAX_IMPORT_BYTES] bounds it rather than trusting the caller.
   */
  private fun runImport(fd: ParcelFileDescriptor, items: String?, reply: (String) -> Unit) {
    val bytes = ParcelFileDescriptor.AutoCloseInputStream(fd).use { stream ->
      stream.readBoundedBytes(MAX_IMPORT_BYTES)
    } ?: run {
      reply("ERROR:archive larger than ${StateBackup.humanSize(MAX_IMPORT_BYTES.toLong())}")
      return
    }
    if (bytes.isEmpty()) {
      reply("ERROR:empty archive")
      return
    }

    val ids = parseItems(items)
    val unknown = StateCategories.unknown(ids)
    if (unknown.isNotEmpty()) {
      reply("ERROR:unknown category in items: ${unknown.joinToString(",")}")
      return
    }

    val summary = StateBackup.import(this, bytes, ids)
    // The caller force-stops us straight after this, deliberately and on its side: a running
    // process writes its cached SharedPreferences back out at orderly shutdown and would silently
    // undo the import that just happened.
    reply("OK:${summary.lines().count { it.isNotBlank() }} restored")
  }

  private fun parseItems(items: String?): List<String> =
    items?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

  /**
   * Reads at most [limit] bytes, or null when the stream carries more.
   *
   * Deliberately not named `readBytes`: `kotlin.io` carries a deprecated
   * `InputStream.readBytes(estimatedSize: Int)` that would win overload resolution here and
   * silently drop the bound — the one thing this exists to enforce.
   */
  private fun java.io.InputStream.readBoundedBytes(limit: Int): ByteArray? {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val read = read(buffer)
      if (read < 0) {
        return out.toByteArray()
      }
      if (out.size() + read > limit) {
        return null
      }
      out.write(buffer, 0, read)
    }
  }

  private fun sendReply(action: String?, target: String?, jobId: String, result: String) {
    if (action.isNullOrEmpty() || target.isNullOrEmpty()) {
      return
    }
    runCatching {
      sendBroadcast(
        Intent(action).apply {
          setPackage(target)
          // Without this a caller that has been backgrounded never hears the answer, and on a
          // clean phone the caller may not have been launched at all.
          addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES)
          putExtra(AutomationProvider.KEY_JOB_ID, jobId)
          putExtra("reply_id", jobId)
          putExtra(AutomationProvider.KEY_RESULT, result)
        }
      )
    }
  }

  private fun notification(importing: Boolean): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    manager?.createNotificationChannel(
      NotificationChannel(CHANNEL, "自動化データ", NotificationManager.IMPORTANCE_LOW)
    )
    return Notification.Builder(this, CHANNEL)
      .setContentTitle(if (importing) "データを戻しています" else "データを書き出しています")
      .setContentText(getString(R.string.app_name))
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .build()
  }

  /**
   * Every exit from [onStartCommand] goes through here, and it drops the foreground state as well
   * as stopping: by the time anything calls this, `startForeground` has already been satisfied.
   */
  private fun stop(startId: Int): Int {
    runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
    stopSelf(startId)
    return START_NOT_STICKY
  }

  /**
   * The §3 progress sender for this door.
   *
   * Parameterised on the correlation id rather than written twice: the broadcast door has its own
   * sender keyed on `reply_id`, and two implementations of the same watchdog drift — the one that
   * drifts always being the one nobody is looking at. Here the job id fills both extras.
   */
  private class Reporter(
    private val service: Service,
    private val jobId: String,
    private val action: String?,
    private val target: String?
  ) {
    @Volatile private var lastSentAt = 0L
    @Volatile private var lastText = "starting"
    @Volatile private var lastCurrent = 0L
    @Volatile private var lastTotal = 0L
    @Volatile private var lastUnit = "categories"
    @Volatile private var running = false
    private var heartbeat: Thread? = null

    val sink = StateBackup.Progress { text, current, total, unit ->
      lastText = text
      lastCurrent = current
      lastTotal = total
      lastUnit = unit
      val now = System.currentTimeMillis()
      if (now - lastSentAt >= THROTTLE_MS) {
        send()
      }
    }

    fun start() {
      if (action.isNullOrEmpty() || target.isNullOrEmpty()) {
        return
      }
      running = true
      // A progress broadcast is also the heartbeat: an app that reports nothing for two minutes is
      // presumed dead and its slot failed, so re-send the last line when the numbers stand still.
      heartbeat = Thread {
        while (running) {
          Thread.sleep(HEARTBEAT_TICK_MS)
          if (running && System.currentTimeMillis() - lastSentAt >= HEARTBEAT_MS) {
            send()
          }
        }
      }.apply { isDaemon = true; start() }
    }

    fun stop() {
      running = false
      heartbeat?.interrupt()
    }

    fun final(text: String, total: Long, unit: String) {
      lastText = text
      lastCurrent = total
      lastTotal = total
      lastUnit = unit
      lastSentAt = 0L
      send()
    }

    private fun send() {
      if (action.isNullOrEmpty() || target.isNullOrEmpty()) {
        return
      }
      lastSentAt = System.currentTimeMillis()
      runCatching {
        service.sendBroadcast(
          Intent(action).apply {
            setPackage(target)
            addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES)
            // Both extras carry the job id, so one progress reader serves both doors.
            putExtra(AutomationProvider.KEY_JOB_ID, jobId)
            putExtra("reply_id", jobId)
            putExtra("app", service.getString(R.string.app_name))
            putExtra("text", lastText)
            putExtra("current", lastCurrent)
            putExtra("total", lastTotal)
            putExtra("unit", lastUnit)
          }
        )
      }
    }

    private companion object {
      const val THROTTLE_MS = 500L
      const val HEARTBEAT_MS = 25_000L
      const val HEARTBEAT_TICK_MS = 5_000L
    }
  }

  companion object {
    private const val TAG = "AutomationData"
    private const val CHANNEL = "automation_data"
    private const val NOTIFICATION_ID = 9714
    private const val EXTRA_JOB = "job"
    private const val EXTRA_IMPORTING = "importing"

    /** Bounded rather than trusting the caller; this fork's archive is nedb JSON, not a corpus. */
    private const val MAX_IMPORT_BYTES = 256 * 1024 * 1024

    /**
     * The descriptor's way across, because an Intent is the wrong vehicle for one.
     *
     * A `ParcelFileDescriptor` in an Intent extra is duplicated by the system on delivery and the
     * copy's lifetime stops being ours to reason about. A map keyed by the job id keeps exactly
     * one open descriptor with exactly one owner — this service, which closes it in a `finally`.
     */
    private val HANDOVER = ConcurrentHashMap<String, ParcelFileDescriptor>()

    /**
     * @return null when the service was asked to start, otherwise the reason it would not.
     *
     * The caller closes the descriptor and drops the job on a failure. `startForegroundService`
     * from a binder call is a background start and API 31+ may refuse it outright unless the app
     * is exempt from battery optimisation — left unhandled, the caller's open file is stranded in
     * [HANDOVER] where nothing will ever read it, and the exception crosses the binder as a stack
     * trace instead of a refusal.
     */
    fun start(
      context: Context,
      jobId: String,
      fd: ParcelFileDescriptor,
      importing: Boolean,
      extras: Bundle?
    ): String? {
      HANDOVER[jobId] = fd
      val attempt = runCatching {
        context.startForegroundService(
          Intent(context, AutomationDataService::class.java).apply {
            putExtra(EXTRA_JOB, jobId)
            putExtra(EXTRA_IMPORTING, importing)
            putExtra(AutomationProvider.KEY_ITEMS, extras?.getString(AutomationProvider.KEY_ITEMS))
            putExtra(
              AutomationProvider.KEY_REPLY_ACTION,
              extras?.getString(AutomationProvider.KEY_REPLY_ACTION)
            )
            putExtra(
              AutomationProvider.KEY_REPLY_PACKAGE,
              extras?.getString(AutomationProvider.KEY_REPLY_PACKAGE)
            )
            putExtra(
              AutomationProvider.KEY_PROGRESS_ACTION,
              extras?.getString(AutomationProvider.KEY_PROGRESS_ACTION)
            )
          }
        )
      }
      if (attempt.isFailure) {
        HANDOVER.remove(jobId)
        val why = attempt.exceptionOrNull()
        Log.w(TAG, "startForegroundService refused", why)
        return why?.javaClass?.simpleName ?: "service would not start"
      }
      return null
    }
  }
}
