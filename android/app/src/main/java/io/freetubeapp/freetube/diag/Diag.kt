package io.freetubeapp.freetube.diag

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import io.freetubeapp.freetube.R
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * 白い熊 UI settings › Diagnostics, the phone's half (the desktop's is `src/main/diag.js`, with the
 * same file layout). Every diagnostic sits behind its own switch, all OFF by default — off means the
 * line is never written. The same contract as 白い熊 地図's `ChizuDiag` and 電話's `Diag`.
 *
 * Everything goes to the app's own diag directory, `Android/data/<app id>/files/diag/` (readable with
 * adb, gone with the app): one file per kind per day, `jiyudoga-<kind>_<yyyy-MM-dd>.txt`. Never
 * `.log`: EMUI's nightly clean-up deletes every `*.log` under `Android/data` as junk. Each write opens
 * and closes the file, so one deleted under us is simply started again.
 *
 * The switches live here, in prefs, rather than in the web app's settings: the WebView console is
 * captured from its first line, before the page has loaded anything, and the notification's Turn
 * all off has to work with no page involved.
 */
object Diag {
  /** In the order the settings page shows them; the page owns the titles. */
  val KINDS = listOf("playback", "sync", "console")

  const val ACTION_MARK = "shiroikuma.jiyudoga.action.DIAG_MARK"
  const val ACTION_ALL_OFF = "shiroikuma.jiyudoga.action.DIAG_ALL_OFF"

  private const val PREFS = "jiyudoga_diag"
  private const val DIR = "diag"
  private const val PREFIX = "jiyudoga-"
  private const val EXT = ".txt"
  private const val KEY_KEEP_DAYS = "keep_days"
  private const val KEY_MARKS = "marks"
  private const val CHANNEL = "jiyudoga_diag"
  private const val NOTIFICATION_ID = 0xD1A6
  private const val MAX_DAY_BYTES = 64L * 1024 * 1024
  private val FILE_PATTERN = Regex("^jiyudoga-([a-z]+)_(\\d{4}-\\d{2}-\\d{2})\\.txt$")

  // written from the JS bridge thread, read from every thread that logs
  private val on = ConcurrentHashMap<String, Boolean>()

  @Volatile
  private var app: Context? = null

  /** Told whenever a switch changes outside the page (the notification), so the page can follow. */
  @Volatile
  var onChange: (() -> Unit)? = null

  /** Loads the switches and applies the retention. Safe to call more than once. */
  @Synchronized
  fun init(context: Context) {
    if (app != null) return
    val c = context.applicationContext
    app = c
    val prefs = prefs(c)
    KINDS.forEach { on[it] = prefs.getBoolean(it, false) }
    updateNotification(c)
    Thread({ runCatching { cleanup(c) } }, "jiyudoga-diag-cleanup").apply { isDaemon = true }.start()
  }

  fun isOn(kind: String) = on[kind] == true

  private fun anyOn() = on.values.any { it }

  fun set(context: Context, kind: String, value: Boolean, version: String) {
    if (kind !in KINDS) return
    if (!value && isOn(kind)) write(kind, "diag $kind off")
    on[kind] = value
    prefs(context).edit().putBoolean(kind, value).apply()
    updateNotification(context)
    if (value) write(kind, "diag $kind on, $version")
  }

  /** One entry into [kind]'s file of today — when its switch is on, and never in the caller's way. */
  fun log(kind: String, text: String) {
    if (isOn(kind)) write(kind, text)
  }

  @Synchronized
  private fun write(kind: String, text: String) {
    try {
      val dir = dir(app) ?: return
      val now = Date()
      val file = File(dir, "$PREFIX${kind}_${day(now)}$EXT")
      if (file.length() > MAX_DAY_BYTES) return
      // continuation lines indented, so a multi-line entry stays visibly one entry
      file.appendText("${SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(now)}  ${text.replace("\n", "\n    ")}\n")
    } catch (ignored: Exception) {
      // diagnostics must never be the reason anything else fails
    }
  }

  private fun day(date: Date) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

  fun dir(context: Context?): File? {
    val base = (context ?: app)?.getExternalFilesDir(null) ?: return null
    return File(base, DIR).takeIf { it.isDirectory || it.mkdirs() }
  }

  private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun state(context: Context): JSONObject {
    val switches = JSONObject()
    KINDS.forEach { switches.put(it, isOn(it)) }
    return JSONObject()
      .put("on", switches)
      .put("keepDays", getKeepDays(context))
      .put("directory", dir(context)?.absolutePath ?: "")
  }

  // ---- what is stored ----

  /** The diag files, oldest name first — only ours, by name. */
  private fun files(context: Context): List<File> =
    dir(context)?.listFiles { f -> f.isFile && FILE_PATTERN.matches(f.name) }?.sortedBy { it.name }.orEmpty()

  // The time of a file's first line: the day from its name, the clock from the line.
  private fun firstTime(file: File, day: String): Long = runCatching {
    val clock = file.bufferedReader().use { it.readLine() }?.take(8) ?: return 0
    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).parse("$day $clock")?.time ?: 0
  }.getOrDefault(0)

  /** The same shape as the desktop's `summarizeDiag`: totals, each day's span, each kind's files. */
  fun summary(context: Context): JSONObject {
    var count = 0
    var bytes = 0L
    var first = 0L
    var last = 0L
    val days = JSONObject()
    val kinds = JSONObject()
    files(context).forEach { file ->
      val match = FILE_PATTERN.matchEntire(file.name) ?: return@forEach
      val (kind, day) = match.destructured
      val end = file.lastModified()
      val start = firstTime(file, day).takeIf { it in 1..end } ?: end
      count++
      bytes += file.length()
      first = if (first == 0L) start else minOf(first, start)
      last = maxOf(last, end)
      val span = days.optJSONArray(day)
      days.put(day, JSONArray().put(minOf(span?.optLong(0) ?: start, start)).put(maxOf(span?.optLong(1) ?: end, end)))
      val k = kinds.optJSONObject(kind)
      kinds.put(kind, JSONObject()
        .put("files", (k?.optInt("files") ?: 0) + 1)
        .put("bytes", (k?.optLong("bytes") ?: 0L) + file.length())
        .put("first", minOf(k?.optLong("first") ?: start, start))
        .put("last", maxOf(k?.optLong("last") ?: end, end)))
    }
    return JSONObject()
      .put("files", count)
      .put("bytes", bytes)
      .put("first", first)
      .put("last", last)
      .put("days", days)
      .put("kinds", kinds)
  }

  // ---- keeping, purging ----

  /** Days of data kept; 0 keeps everything (the default). */
  fun getKeepDays(context: Context) = prefs(context).getInt(KEY_KEEP_DAYS, 0)

  fun setKeepDays(context: Context, days: Int) {
    prefs(context).edit().putInt(KEY_KEEP_DAYS, days.coerceAtLeast(0)).apply()
  }

  /** Deletes the files of days older than the kept ones; returns how many went. */
  fun cleanup(context: Context): Int {
    val keep = getKeepDays(context)
    if (keep <= 0) return 0
    val oldest = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, -(keep - 1)) }
    val oldestKept = day(oldest.time)
    return files(context).count { file ->
      val day = FILE_PATTERN.matchEntire(file.name)?.groupValues?.get(2)
      day != null && day < oldestKept && file.delete()
    }
  }

  /** Deletes everything recorded; returns how many files went. */
  @Synchronized
  fun purge(context: Context): Int = files(context).count { it.delete() }

  // ---- export, share ----

  /** Copies every file into a new dated subdirectory of [tree]; returns its name, null when nothing could be written. */
  fun exportTo(context: Context, tree: Uri): String? {
    val all = files(context)
    if (all.isEmpty()) return null
    val parent = DocumentFile.fromTreeUri(context, tree) ?: return null
    val name = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(Date()) + "_jiyudoga-diag"
    val into = parent.createDirectory(name) ?: return null
    all.forEach { file ->
      val out = into.createFile("text/plain", file.name) ?: return@forEach
      context.contentResolver.openOutputStream(out.uri)?.use { stream -> file.inputStream().use { it.copyTo(stream) } }
    }
    return name
  }

  /** A share of every file through the app's file provider; null when nothing is recorded. */
  fun shareIntent(context: Context): Intent? {
    val uris = files(context).map { FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", it) }
    if (uris.isEmpty()) return null
    val send = Intent(Intent.ACTION_SEND_MULTIPLE)
      .setType("text/plain")
      .putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return Intent.createChooser(send, null)
  }

  // ---- marking, the recording notification ----

  /** A numbered marker in every file being recorded: “something happened here”. 0 when nothing records. */
  fun mark(context: Context, from: String): Int {
    if (!anyOn()) return 0
    val prefs = prefs(context)
    val number = prefs.getInt(KEY_MARKS, 0) + 1
    prefs.edit().putInt(KEY_MARKS, number).apply()
    KINDS.filter { isOn(it) }.forEach { write(it, "mark #$number from $from") }
    return number
  }

  /** While any switch is on, an ongoing notification says so, with Mark and Turn all off. */
  fun updateNotification(context: Context) {
    val c = context.applicationContext
    try {
      val manager = NotificationManagerCompat.from(c)
      if (!anyOn()) {
        manager.cancel(NOTIFICATION_ID)
        return
      }
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, c.getString(R.string.diag_channel), NotificationManager.IMPORTANCE_LOW)
      )
      val which = KINDS.filter { isOn(it) }.joinToString(", ") { kindTitle(c, it) }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      fun action(code: Int, action: String) =
        PendingIntent.getBroadcast(c, code, Intent(action).setClass(c, DiagReceiver::class.java), flags)
      val builder = NotificationCompat.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.ic_media_notification_icon)
        .setContentTitle(c.getString(R.string.diag_recording))
        .setContentText(which)
        .setStyle(NotificationCompat.BigTextStyle().bigText(which))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .addAction(0, c.getString(R.string.diag_mark), action(1, ACTION_MARK))
        .addAction(0, c.getString(R.string.diag_all_off), action(2, ACTION_ALL_OFF))
      c.packageManager.getLaunchIntentForPackage(c.packageName)?.let {
        builder.setContentIntent(PendingIntent.getActivity(c, 3, it, flags))
      }
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (ignored: Exception) {
      // no notification permission: recording goes on regardless
    }
  }

  private fun kindTitle(context: Context, kind: String) = when (kind) {
    "playback" -> context.getString(R.string.diag_kind_playback)
    "sync" -> context.getString(R.string.diag_kind_sync)
    "console" -> context.getString(R.string.diag_kind_console)
    else -> kind
  }

  fun allOff(context: Context) {
    val edit = prefs(context).edit()
    KINDS.forEach { kind ->
      if (isOn(kind)) write(kind, "diag $kind off from the notification")
      on[kind] = false
      edit.putBoolean(kind, false)
    }
    edit.apply()
    updateNotification(context)
    onChange?.invoke()
  }
}
