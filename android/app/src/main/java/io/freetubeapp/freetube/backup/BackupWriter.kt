package io.freetubeapp.freetube.backup

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.documentfile.provider.DocumentFile
import io.freetubeapp.freetube.helpers.SafPaths
import java.io.File

/**
 * Fork (白い熊 自由動画): decides WHERE a backup goes and writes it there.
 *
 * Directory precedence is the automation contract's: the `path` extra → the app's
 * configured (SAF) backup directory → [NoDirectory].
 *
 * An arbitrary absolute `path` needs All-Files-Access. Without it we can still honour a
 * `path` that points inside the configured SAF tree (the normal case — 白い熊 points both
 * this app and 自由作業盤 at the same 「[979] バックアップ」 folder); otherwise the contract
 * says to ignore `path` when a SAF directory is configured, and to fail when none is.
 */
object BackupWriter {

  class NoDirectory : Exception("no-directory")
  class NoStorageAccess : Exception("no-storage-access")

  data class Written(val path: String, val bytes: Long, val categories: Int)

  fun hasAllFilesAccess(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

  /** The configured backup directory as a DocumentFile, or null when unset/unreachable. */
  fun configuredDirectory(context: Context): DocumentFile? {
    val uri = AutomationAuth.directoryUri(context) ?: return null
    return runCatching { DocumentFile.fromTreeUri(context, Uri.parse(uri)) }
      .getOrNull()
      ?.takeIf { it.isDirectory }
  }

  /** Absolute path of the configured directory, or "" when it has none (cloud provider). */
  fun configuredPath(context: Context): String {
    val uri = AutomationAuth.directoryUri(context) ?: return ""
    return SafPaths.treeUriToPath(uri)
  }

  /**
   * Runs an export into the resolved destination.
   *
   * A cancelled or failed run must leave the directory EXACTLY as it was found, so the
   * incomplete file is deleted on every non-success path. There is no `<name>.part`
   * intermediate: SAF's `createFile` derives the extension from the MIME type, so a `.part`
   * name is not reliably honoured across providers — deleting the incomplete document
   * reaches the same end state without depending on that.
   *
   * @param pathOverride the automation contract's `path` extra, or null
   * @param replyId      the request a `CANCEL_EXPORT` can name; "" for the in-app panel
   */
  fun write(
    context: Context,
    ids: Collection<String>,
    pathOverride: String? = null,
    progress: StateBackup.Progress? = null,
    replyId: String = ""
  ): Written {
    val name = StateBackup.fileName()

    ExportControl.begin(replyId)
    try {
      if (!pathOverride.isNullOrBlank() && hasAllFilesAccess()) {
        val dir = File(SafPaths.normalisePath(pathOverride))
        if (!dir.isDirectory && !dir.mkdirs()) {
          throw NoStorageAccess()
        }
        val target = File(dir, name)
        val categories = try {
          target.outputStream().use { StateBackup.export(context, ids, it, progress) }
        } catch (failure: Throwable) {
          target.delete()
          throw failure
        }
        return Written(target.absolutePath, target.length(), categories)
      }

      val tree = configuredDirectory(context)
        ?: if (pathOverride.isNullOrBlank()) throw NoDirectory() else throw NoStorageAccess()

      val treePath = configuredPath(context)
      val (dir, dirPath) = resolveInsideTree(tree, treePath, pathOverride)

      val file = dir.createFile("application/zip", name) ?: throw NoStorageAccess()

      val categories = try {
        context.contentResolver.openOutputStream(file.uri)?.use {
          StateBackup.export(context, ids, it, progress)
        } ?: throw NoStorageAccess()
      } catch (failure: Throwable) {
        runCatching { file.delete() }
        throw failure
      }

      val bytes = DocumentFile.fromSingleUri(context, file.uri)?.length()?.takeIf { it > 0 }
        ?: file.length()

      // The reply must carry a real path; a non-device provider (cloud) has none, so the
      // document uri is the honest answer there.
      val path = if (dirPath.isEmpty()) file.uri.toString() else "$dirPath/$name"

      return Written(path, bytes, categories)
    } finally {
      ExportControl.end()
    }
  }

  /**
   * Maps a `path` override onto the configured SAF tree when it points inside it, creating
   * the intermediate directories. A path outside the tree falls back to the tree root —
   * the contract's "ignore `path` when you have a configured SAF directory".
   *
   * @return the directory to write into and its absolute path ("" when it has none)
   */
  private fun resolveInsideTree(
    tree: DocumentFile,
    treePath: String,
    pathOverride: String?
  ): Pair<DocumentFile, String> {
    val root = if (treePath.isEmpty()) "" else SafPaths.normalisePath(treePath)
    if (pathOverride.isNullOrBlank() || root.isEmpty()) {
      return tree to root
    }

    val wanted = SafPaths.normalisePath(pathOverride)
    if (wanted == root || !wanted.startsWith("$root/")) {
      return tree to root
    }

    var current = tree
    var walked = root
    for (segment in wanted.removePrefix("$root/").split('/')) {
      if (segment.isEmpty()) {
        continue
      }
      val existing = current.findFile(segment)
      val next = when {
        existing != null && existing.isDirectory -> existing
        existing != null -> null
        else -> current.createDirectory(segment)
      } ?: return current to walked
      current = next
      walked = "$walked/$segment"
    }
    return current to walked
  }
}
