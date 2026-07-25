package io.freetubeapp.freetube.helpers

import android.net.Uri
import android.provider.DocumentsContract

/**
 * Fork (白い熊 自由動画): SAF tree ⇄ absolute path helpers, shared by the JS interface
 * (study hand-off) and the headless state-export receiver — the receiver has no
 * Activity, so this cannot live on FreeTubeJavaScriptInterface.
 */
object SafPaths {

  /**
   * Derives the absolute filesystem path of an ExternalStorageProvider tree uri.
   * Returns "" for non-device providers (cloud, network, …), which have no path.
   */
  fun treeUriToPath(tree: String): String {
    val uri = try { Uri.parse(tree) } catch (_: Exception) { return "" }
    if (uri.authority != "com.android.externalstorage.documents") {
      return ""
    }
    val documentId = try { DocumentsContract.getTreeDocumentId(uri) } catch (_: Exception) { return "" }
    val parts = documentId.split(":", limit = 2)
    val volume = parts[0]
    val relativePath = if (parts.size > 1) parts[1] else ""
    val root = if (volume == "primary") "/storage/emulated/0" else "/storage/$volume"
    return if (relativePath.isEmpty()) root else "$root/${relativePath.trimEnd('/')}"
  }

  /** Trailing slashes and a `/sdcard` prefix normalised away, so two paths compare equal. */
  fun normalisePath(path: String): String {
    var p = path.trim().trimEnd('/')
    if (p == "/sdcard" || p.startsWith("/sdcard/")) {
      p = "/storage/emulated/0" + p.removePrefix("/sdcard")
    }
    return p.ifEmpty { "/" }
  }
}
