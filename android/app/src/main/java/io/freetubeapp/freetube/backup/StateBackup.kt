package io.freetubeapp.freetube.backup

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Fork (白い熊 自由動画): the app's ONE backup archive — the whole restorable state of the
 * app in a single ZIP, whatever triggered it.
 *
 * Layout (the sister-app family format):
 * ```
 * manifest.json          format / version / app / appVersion / createdTs / categories
 * <category-id>.json     { "category": …, "store": …, "docs": [ … ] }
 * ```
 *
 * Both callers are thin: the Export/Import panel of the UI settings page goes through the
 * JS interface, the token-gated `EXPORT_STATE` broadcast goes through [StateExportReceiver].
 * Neither owns any export logic of its own.
 */
object StateBackup {

  const val FORMAT = "shiroikuma-state-backup"
  const val VERSION = 1

  /**
   * Mandatory family convention (白い熊, 2026-07-25): every backup this app writes — from
   * the automation path AND from the Export/Import panel — is
   * `shiroikuma-jiyudoga_<yyyy-MM-dd_HH-mm-ss>.zip`. No version, no infix, no suffix:
   * every sister app's backups share one directory and must sort and read uniformly.
   */
  const val EXPORT_PREFIX = "shiroikuma-jiyudoga_"

  /** Progress callback: a countable line plus its structured parts. */
  fun interface Progress {
    fun report(text: String, current: Long, total: Long, unit: String)
  }

  fun timestamp(now: Long = System.currentTimeMillis()): String =
    SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.ROOT).format(Date(now))

  fun fileName(now: Long = System.currentTimeMillis()): String = "$EXPORT_PREFIX${timestamp(now)}.zip"

  /** True for any name this app has ever written, so older backups stay recognised. */
  fun isBackupName(name: String): Boolean =
    name.endsWith(".zip") && name.startsWith("shiroikuma-jiyudoga")

  /** `BuildConfig` is not generated for this module, so read the version back off the package. */
  private fun appVersion(context: Context): String = runCatching {
    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
  }.getOrDefault("")

  fun humanSize(bytes: Long): String = when {
    bytes >= 1_073_741_824L -> String.format(Locale.ROOT, "%.2f GB", bytes / 1_073_741_824.0)
    bytes >= 1_048_576L -> String.format(Locale.ROOT, "%.1f MB", bytes / 1_048_576.0)
    bytes >= 1024L -> String.format(Locale.ROOT, "%.1f kB", bytes / 1024.0)
    else -> "$bytes B"
  }

  // ---- export ----------------------------------------------------------------------------

  /**
   * Writes the selected categories to [out] as one ZIP.
   * @return the number of categories written
   */
  fun export(context: Context, ids: Collection<String>, out: OutputStream, progress: Progress? = null): Int {
    val leaves = if (ids.isEmpty()) StateCategories.LEAVES else StateCategories.expand(ids)
    val stores = HashMap<String, LinkedHashMap<String, JSONObject>>()
    val written = ArrayList<String>()

    ZipOutputStream(out.buffered()).use { zip ->
      leaves.forEachIndexed { index, category ->
        val store = category.store!!
        val docs = stores.getOrPut(store) { NedbFile.read(context, store) }

        val selected = if (store == StateCategories.SETTINGS_STORE) {
          docs.values.filter { StateCategories.sliceFor(it.optString("_id")) == category.id }
        } else {
          docs.values.toList()
        }

        // Documents are streamed one at a time rather than serialised in one blob, so a
        // store with thousands of rows can report real counts while it is being written.
        zip.putNextEntry(ZipEntry("${category.id}.json"))
        zip.write("{\"category\":${JSONObject.quote(category.id)},\"store\":${JSONObject.quote(store)},\"docs\":[".toByteArray(Charsets.UTF_8))
        selected.forEachIndexed { position, doc ->
          if (position > 0) {
            zip.write(",".toByteArray(Charsets.UTF_8))
          }
          zip.write(doc.toString().toByteArray(Charsets.UTF_8))
          if (position % 500 == 499) {
            progress?.report(
              "${category.label} ${position + 1}/${selected.size}",
              (position + 1).toLong(),
              selected.size.toLong(),
              category.label
            )
          }
        }
        zip.write("]}".toByteArray(Charsets.UTF_8))
        zip.closeEntry()
        written.add(category.id)

        progress?.report(
          "categories ${index + 1}/${leaves.size} — ${category.label} (${selected.size})",
          (index + 1).toLong(),
          leaves.size.toLong(),
          "categories"
        )
      }

      val manifest = JSONObject()
        .put("format", FORMAT)
        .put("version", VERSION)
        .put("app", "shiroikuma-jiyudoga")
        .put("appId", context.packageName)
        .put("appVersion", appVersion(context))
        .put("createdTs", System.currentTimeMillis())
        .put("categories", JSONArray(written))

      zip.putNextEntry(ZipEntry("manifest.json"))
      zip.write(manifest.toString().toByteArray(Charsets.UTF_8))
      zip.closeEntry()
    }

    return written.size
  }

  // ---- import ----------------------------------------------------------------------------

  /**
   * Restores the selected categories the archive carries; absent ones are skipped, present
   * ones MERGE per `_id` (settings overwrite by key, list stores gain the archived rows).
   * @return a one-line-per-category summary
   */
  fun import(context: Context, bytes: ByteArray, ids: Collection<String>): String {
    val wanted = if (ids.isEmpty()) {
      StateCategories.LEAVES.map { it.id }.toSet()
    } else {
      StateCategories.expand(ids).map { it.id }.toSet()
    }

    val perStore = LinkedHashMap<String, MutableList<JSONObject>>()
    val summary = ArrayList<String>()

    eachEntry(bytes) { name, content ->
      if (name == "manifest.json" || !name.endsWith(".json")) {
        return@eachEntry
      }
      val id = name.removeSuffix(".json")
      if (id !in wanted) {
        return@eachEntry
      }
      val category = StateCategories.byId(id) ?: return@eachEntry
      val payload = try { JSONObject(String(content, Charsets.UTF_8)) } catch (_: Exception) { return@eachEntry }
      val store = payload.optString("store", category.store ?: return@eachEntry)
      val docs = payload.optJSONArray("docs") ?: JSONArray()

      val target = perStore.getOrPut(store) { ArrayList() }
      for (i in 0 until docs.length()) {
        docs.optJSONObject(i)?.let { target.add(it) }
      }
      summary.add("${category.label}: ${docs.length()}")
    }

    if (summary.isEmpty()) {
      throw IllegalStateException("nothing to restore from this archive")
    }

    for ((store, docs) in perStore) {
      NedbFile.append(context, store, docs)
    }

    return summary.joinToString("\n")
  }

  private inline fun eachEntry(bytes: ByteArray, action: (String, ByteArray) -> Unit) {
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
      while (true) {
        val entry: ZipEntry = zip.nextEntry ?: break
        if (!entry.isDirectory) {
          action(entry.name.substringAfterLast('/'), zip.readBytes())
        }
        zip.closeEntry()
      }
    }
  }
}
