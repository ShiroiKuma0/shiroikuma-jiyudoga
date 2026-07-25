package io.freetubeapp.freetube.backup

import android.content.Context
import android.net.Uri
import io.freetubeapp.freetube.helpers.WriteMode
import io.freetubeapp.freetube.helpers.readBytes
import io.freetubeapp.freetube.helpers.writeBytes
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Fork (白い熊 自由動画): minimal reader/writer for the nedb datastores the renderer keeps
 * (`settings.db`, `profiles.db`, …).
 *
 * nedb's on-disk format is append-only JSON lines: one document per line, the LAST line
 * carrying an `_id` wins, and a line with `$$deleted` removes it. Index bookkeeping lines
 * (`$$indexCreated`) are not documents.
 *
 * Import therefore APPENDS lines — exactly what nedb itself does for an update — so a
 * running WebView never loses the restored data: the datastore is only rewritten wholesale
 * on compaction, which this build never schedules.
 *
 * The store files are NOT necessarily in the app's own data directory: Data Settings lets
 * the data directory be moved to a SAF tree, and the mapping then lives in
 * `data-location.json` (written by `helpers/android/storage.js`). Resolution follows that
 * file, or nothing headless would find the real database after a move.
 */
object NedbFile {

  private const val DATA_LOCATION = "data-location.json"

  /** Where a datastore actually lives — a plain file, or a document in a picked tree. */
  sealed class Location {
    data class Local(val file: File) : Location()
    data class Document(val uri: Uri) : Location()
  }

  /** `/storage/emulated/0/Android/data/<pkg>` — the app's own (default) data directory. */
  fun defaultDataDir(context: Context): File = context.getExternalFilesDir(null)!!.parentFile!!

  fun locate(context: Context, store: String): Location {
    val fileName = "$store.db"
    val fallback = Location.Local(File(defaultDataDir(context), fileName))

    val locationFile = File(defaultDataDir(context), DATA_LOCATION)
    if (!locationFile.isFile) {
      return fallback
    }

    val mapped = runCatching {
      val files = JSONObject(locationFile.readText()).optJSONArray("files") ?: return@runCatching null
      for (i in 0 until files.length()) {
        val entry = files.optJSONObject(i) ?: continue
        if (entry.optString("fileName") == fileName) {
          return@runCatching entry.optString("uri").takeIf { it.isNotEmpty() }
        }
      }
      null
    }.getOrNull() ?: return fallback

    // `data://<name>` is the renderer's shorthand for the app's own data directory
    return if (mapped.startsWith("data://")) {
      Location.Local(File(defaultDataDir(context), mapped.removePrefix("data://")))
    } else {
      Location.Document(Uri.parse(mapped))
    }
  }

  /** Folds one datastore down to its live documents, keyed by `_id`, in file order. */
  fun read(context: Context, store: String): LinkedHashMap<String, JSONObject> {
    val text = when (val location = locate(context, store)) {
      is Location.Local ->
        if (location.file.isFile) location.file.readText() else ""
      is Location.Document ->
        runCatching { String(context.contentResolver.readBytes(location.uri), Charsets.UTF_8) }
          .getOrDefault("")
    }

    val docs = LinkedHashMap<String, JSONObject>()
    text.lineSequence().forEach { line ->
      val trimmed = line.trim()
      if (trimmed.isEmpty()) {
        return@forEach
      }
      val doc = try { JSONObject(trimmed) } catch (_: Exception) { return@forEach }
      if (doc.has("\$\$indexCreated") || doc.has("\$\$indexRemoved")) {
        return@forEach
      }
      val id = if (doc.has("_id")) doc.get("_id").toString() else return@forEach
      if (doc.optBoolean("\$\$deleted", false)) docs.remove(id) else docs[id] = doc
    }
    return docs
  }

  /** Appends documents as new nedb lines (last line wins, so this is an upsert per `_id`). */
  fun append(context: Context, store: String, docs: List<JSONObject>) {
    if (docs.isEmpty()) {
      return
    }
    val bytes = buildString {
      docs.forEach { append(it.toString()).append('\n') }
    }.toByteArray(Charsets.UTF_8)

    when (val location = locate(context, store)) {
      is Location.Local -> {
        location.file.parentFile?.mkdirs()
        FileOutputStream(location.file, true).use { it.write(bytes) }
      }
      is Location.Document ->
        context.contentResolver.writeBytes(location.uri, bytes, WriteMode.Append)
    }
  }
}
