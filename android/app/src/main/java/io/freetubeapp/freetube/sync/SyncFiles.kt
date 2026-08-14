package io.freetubeapp.freetube.sync

import android.content.Context
import android.os.Build
import android.os.Environment
import io.freetubeapp.freetube.backup.NedbFile
import io.freetubeapp.freetube.helpers.SafPaths
import io.freetubeapp.freetube.helpers.readBytes
import java.io.File

/**
 * Fork (白い熊 自由動画): the phone's half of the device sync — two files in a directory
 * on shared storage, and nothing else.
 *
 * The phone never opens a network connection. It publishes `jiyudoga-phone.json` and
 * reads `jiyudoga-pc.json`, and the desktop app moves both over ssh whenever it happens
 * to be running. That is the whole point of putting them on `/sdcard`: the PC can collect
 * what the phone published hours after the app was closed, so the two devices converge
 * without ever having to be awake at the same moment.
 *
 * A plain path rather than a SAF tree, because a SAF document uri has no address an ssh
 * session could open. That costs the All-Files-Access grant, which the manifest already
 * declares and `FreeTubeJavaScriptInterface.requestAllFilesAccess` already asks for.
 */
object SyncFiles {

  class NoStorageAccess : Exception("all-files access has not been granted")
  class UnsafeName : Exception("not a sync file name")

  /** No separators and no traversal: the name is joined onto a configured directory. */
  private val SAFE_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]*$")

  fun hasAccess(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

  private fun resolve(directory: String, name: String): File {
    if (!SAFE_NAME.matches(name) || name.contains("..")) {
      throw UnsafeName()
    }
    if (!hasAccess()) {
      throw NoStorageAccess()
    }
    return File(SafPaths.normalisePath(directory), name)
  }

  /** null when the other device has never published — the ordinary state at first run. */
  fun read(directory: String, name: String): String? {
    val file = resolve(directory, name)
    if (!file.isFile) {
      return null
    }
    return file.readText(Charsets.UTF_8)
  }

  /**
   * Writes through a `.part` file and renames, so neither the desktop's ssh `cat` nor a
   * later read of our own can ever pick up a half-written snapshot.
   */
  fun write(directory: String, name: String, contents: String): String {
    val file = resolve(directory, name)
    file.parentFile?.mkdirs()

    val part = File(file.parentFile, "${file.name}.part")
    part.writeText(contents, Charsets.UTF_8)

    if (!part.renameTo(file)) {
      // some shared-storage providers refuse a rename over an existing file
      file.writeText(contents, Charsets.UTF_8)
      part.delete()
    }

    return file.absolutePath
  }

  private fun rawBytes(context: Context, store: String): ByteArray? =
    when (val location = NedbFile.locate(context, store)) {
      is NedbFile.Location.Local -> if (location.file.isFile) location.file.readBytes() else null
      is NedbFile.Location.Document -> context.contentResolver.readBytes(location.uri)
    }

  /**
   * Copies the datastores aside before this device's database is ever merged with
   * another's. That first union is the one step of the feature that syncing again cannot
   * undo. Follows a relocated data directory, since `NedbFile` knows where the stores
   * actually are.
   */
  fun backupDatastores(context: Context, directory: String, stamp: String): String {
    val target = File(SafPaths.normalisePath(directory), "pre-sync-backup-$stamp")
    if (!hasAccess()) {
      throw NoStorageAccess()
    }
    target.mkdirs()

    for (store in listOf("history", "profiles")) {
      val bytes = rawBytes(context, store) ?: continue
      File(target, "$store.db").writeBytes(bytes)
    }

    return target.absolutePath
  }
}
