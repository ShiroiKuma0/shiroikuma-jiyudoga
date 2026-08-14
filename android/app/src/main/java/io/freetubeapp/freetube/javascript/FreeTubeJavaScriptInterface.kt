package io.freetubeapp.freetube.javascript

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.session.PlaybackState.STATE_PAUSED
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.net.toUri
import androidx.documentfile.provider.DocumentFile
import io.freetubeapp.freetube.KeepAliveService
import io.freetubeapp.freetube.activities.FreeTubeActivity
import io.freetubeapp.freetube.backup.AutomationAuth
import io.freetubeapp.freetube.backup.BackupWriter
import io.freetubeapp.freetube.backup.StateBackup
import io.freetubeapp.freetube.backup.StateCategories
import io.freetubeapp.freetube.helpers.MediaSessionFacade
import io.freetubeapp.freetube.helpers.Promise
import io.freetubeapp.freetube.helpers.SafPaths
import io.freetubeapp.freetube.helpers.WriteMode
import io.freetubeapp.freetube.helpers.getDataDirectory
import io.freetubeapp.freetube.helpers.getFileName
import io.freetubeapp.freetube.helpers.readBytes
import io.freetubeapp.freetube.helpers.readText
import io.freetubeapp.freetube.helpers.resolveAmbiguousUri
import io.freetubeapp.freetube.helpers.writeBytes
import io.freetubeapp.freetube.sync.SyncFiles
import io.freetubeapp.freetube.webviews.FreeTubeWebView
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset
import java.util.UUID.randomUUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

const val DATA_DIRECTORY = "data://"

class FreeTubeJavaScriptInterface(
  private val context: FreeTubeActivity,
  private val webView: FreeTubeWebView
) {
  private val coroutineScope = CoroutineScope(Dispatchers.Main)
  private val mediaSession: MediaSessionFacade = MediaSessionFacade(
    context,
    "media_controls",
    { event ->
      webView.dispatchEvent(event)
    },
    { position ->
      webView.dispatchEvent("media-seek", "position", position)
    }
  )
  val jsCommunicator: AsyncJSCommunicator = AsyncJSCommunicator(webView)

  companion object {
    private const val JISHO_PACKAGE = "shiroikuma.jisho"
    private const val DOWNLOAD_USER_AGENT =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

    /** Generous: BotGuard runs an interpreter it downloads, and this only fires on failure. */
    private const val POTOKEN_TIMEOUT_MS = 15000L
  }

  // region Media Notifications
  /**
   * creates a media notification
   * @param title the track name / video title
   * @param artist the author / channel name
   * @param duration the duration in milliseconds of the video
   * @param thumbnail a URL to the thumbnail for the video
   */
  @JavascriptInterface
  fun createMediaSession(title: String, artist: String, duration: Long = 0, thumbnail: String? = null) {
    mediaSession
      .setMetadata(title, artist, duration, thumbnail)
      .setState(STATE_PAUSED, 0)
      .push()
  }

  /**
   * updates the playback state of a media notification
   */
  @JavascriptInterface
  fun updateMediaSessionState(state: String?, position: String? = null) {
    mediaSession
      .setState(
        state?.toInt(),
        position?.toLong()
      )
  }

  /**
   * updates the track information of a media notification
   */
  @JavascriptInterface
  fun updateMediaSessionData(trackName: String, artist: String, duration: Long, art: String? = null) {
    mediaSession
      .setMetadata(
        trackName,
        artist,
        duration,
        art
      )
  }

  @JavascriptInterface
  fun cancelMediaNotification() {
    mediaSession.cancel()
  }

  // endregion

  // region File Helpers
  /**
   * @param directory a shortened directory uri
   * @return a full directory uri
   */
  @JavascriptInterface
  fun getDirectory(directory: String): String? {
    return if (directory == DATA_DIRECTORY) {
      context.getDataDirectory()
    } else {
      directory
    }
  }

  @JavascriptInterface
  fun revokePermissionForTree(treeUri: String) {
    context.revokeUriPermission(
      treeUri.toUri(),
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    )
  }

  @JavascriptInterface
  fun listFilesInTree(tree: String): String {
    val directory = DocumentFile.fromTreeUri(context, tree.toUri())
    val files = directory?.listFiles()?.joinToString(",") { file ->
      "{ \"uri\": \"${file.uri}\", \"fileName\": \"${file.name}\", \"isFile\": ${file.isFile}, \"isDirectory\": ${file.isDirectory} }"
    }
    return "[${files ?: ""}]"
  }

  @JavascriptInterface
  fun createFileInTree(tree: String, fileName: String): String? {
    val directory = DocumentFile.fromTreeUri(context, tree.toUri())
    return directory?.createFile("*/*", fileName)?.uri?.toString()
  }
  // endregion

  // region IO
  @JavascriptInterface
  fun listFilesInDataDir(): String {
    val directory = context.getDataDirectory()
    return if (directory == null) {
      "[]"
    } else {
      "[${
        File(directory).listFiles()?.joinToString(",") { file ->
          "{ \"uri\": \"$DATA_DIRECTORY${file.name}\", \"fileName\": \"${file.name}\", \"isFile\": ${file.isFile}, \"isDirectory\": ${file.isDirectory} }"
        } ?: ""
      }]"
    }
  }

  /**
   * reads a file from storage
   */
  @JavascriptInterface
  fun readFile(uri: String): String {
    return Promise(coroutineScope) { resolve, reject ->
      val file = context.resolveAmbiguousUri(uri)
      if (file != null) {
        try {
          resolve(context.contentResolver
            .readBytes(file.uri)
            ?.toString(Charset.forName("utf-8")))
        } catch (ex: Throwable) {
          reject(ex.stackTraceToString())
        }
      } else {
        reject("File not found from given uri")
      }
    }.addJsCommunicator(jsCommunicator)
  }

  /**
   * writes a file to storage
   */
  @OptIn(ExperimentalEncodingApi::class)
  @JavascriptInterface
  fun writeFile(uri: String, content: String): String {
    return Promise(coroutineScope) { resolve, reject ->
      val file = context.resolveAmbiguousUri(uri)
      if (file != null) {
        val bytes = if (content.startsWith("data:")) {
          Base64.decode(content.split("base64,")[1])
        } else {
          content.toByteArray()
        }
        context.contentResolver.writeBytes(
          file.uri,
          bytes
        )
        resolve("")
      } else {
        reject("File not found from given uri")
      }
    }.addJsCommunicator(jsCommunicator)
  }

  @OptIn(ExperimentalEncodingApi::class)
  @JavascriptInterface
  fun appendFile(uri: String, content: String): String {
    return Promise(coroutineScope) { resolve, reject ->
      val file = context.resolveAmbiguousUri(uri)
      if (file != null) {
        val bytes = if (content.startsWith("data:")) {
          Base64.decode(content.split("base64,")[1])
        } else {
          content.toByteArray()
        }
        context.contentResolver.writeBytes(
          file.uri,
          bytes,
          WriteMode.Append
        )
        resolve("")
      } else {
        reject("File not found from given uri")
      }
    }.addJsCommunicator(jsCommunicator)
  }
  // endregion

  // region Dialogs
  /**
   * requests a save dialog, resolves a js promise when done, resolves with `USER_CANCELED` if the user cancels
   * @return a js promise id
   */
  @JavascriptInterface
  fun requestSaveDialog(fileName: String, fileType: String): String {
    return Promise(coroutineScope) { resolve, reject ->
      context.launchIntent(
        Intent(Intent.ACTION_CREATE_DOCUMENT)
          .addCategory(Intent.CATEGORY_OPENABLE)
          .setType(fileType)
          .putExtra(Intent.EXTRA_TITLE, fileName)
      ).then {
        if (it?.resultCode == Activity.RESULT_CANCELED) {
          resolve("USER_CANCELED")
        }
        try {
          val payload = JSONObject()
          payload.put("uri", it?.data?.data)
          resolve(payload)
        } catch (ex: Exception) {
          reject(ex.toString())
        }
      }
    }.addJsCommunicator(jsCommunicator)
  }

  @JavascriptInterface
  fun requestOpenDialog(fileTypes: String): String {
    return Promise(coroutineScope) { resolve, reject ->
      context.launchIntent(
        Intent(Intent.ACTION_GET_CONTENT)
          .setType("*/*")
          .putExtra(Intent.EXTRA_MIME_TYPES, fileTypes.split(",").toTypedArray())
      ).then {
        if (it?.resultCode == Activity.RESULT_CANCELED) {
          resolve("USER_CANCELED")
        }
        try {
          val uri = it?.data?.data
          if (uri != null) {
            val mimeType = context.contentResolver.getType(uri)
            val fileName = context.contentResolver.getFileName(uri)
            val payload = JSONObject()
            payload.put("uri", uri)
            payload.put("type", mimeType)
            payload.put("fileName", fileName)
            resolve(payload)
          } else {
            reject("Uri from intent was null")
          }
        } catch (ex: Exception) {
          reject(ex.toString())
        }
      }
    }.addJsCommunicator(jsCommunicator)
  }

  @JavascriptInterface
  fun requestDirectoryAccessDialog(): String {
    return Promise(coroutineScope) { resolve, reject ->
      context.launchIntent(
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
      ).then {
        if (it?.resultCode == Activity.RESULT_CANCELED) {
          resolve("USER_CANCELED")
        }
        try {
          val uri = it?.data?.data
          if (uri != null) {
            context.contentResolver.takePersistableUriPermission(
              uri,
              Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
            resolve(uri)
          } else {
            reject("Uri from intent was null")
          }
        } catch (ex: Exception) {
          reject(ex.toString())
        }
      }
    }.addJsCommunicator(jsCommunicator)
  }

  // endregion

  // region Study export (jisho hand-off)

  /**
   * Streams a URL into a content uri on a background coroutine, with progress
   * events. Uses chunked Range requests (googlevideo throttles single long
   * GETs) and returns a promise id resolving to the number of bytes written.
   */
  @JavascriptInterface
  fun downloadToUri(url: String, uri: String): String {
    val id = "${randomUUID()}"
    coroutineScope.launch(Dispatchers.IO) {
      try {
        var totalBytes = -1L
        var written = 0L
        var lastReportedBytes = 0L
        val chunkSize = 9L * 1024L * 1024L
        var singleRequest = false

        context.contentResolver.openOutputStream(uri.toUri(), "wt")!!.use { output ->
          while (totalBytes < 0 || written < totalBytes) {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = true
            connection.setRequestProperty("User-Agent", DOWNLOAD_USER_AGENT)
            if (!singleRequest) {
              connection.setRequestProperty("Range", "bytes=$written-${written + chunkSize - 1}")
            }
            connection.connect()

            val code = connection.responseCode
            if (code == 200) {
              // server ignored the Range header, read everything in one go
              singleRequest = true
            } else if (code != 206) {
              connection.disconnect()
              throw Exception("HTTP $code while downloading")
            }

            if (totalBytes < 0) {
              totalBytes = if (code == 206) {
                connection.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: -2L
              } else {
                connection.contentLengthLong
              }
            }

            connection.inputStream.use { input ->
              val buffer = ByteArray(64 * 1024)
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                output.write(buffer, 0, read)
                written += read
                if (written - lastReportedBytes >= 512 * 1024) {
                  lastReportedBytes = written
                  jsCommunicator.progress(id, "{ \"bytes\": $written, \"total\": $totalBytes }")
                }
              }
            }
            connection.disconnect()

            // unknown total length: a single (possibly ranged) response is all we get
            if (singleRequest || totalBytes == -2L) break
          }
        }

        if (written == 0L) {
          throw Exception("downloaded 0 bytes")
        }
        jsCommunicator.resolve(id, "$written")
      } catch (ex: Exception) {
        try {
          DocumentFile.fromSingleUri(context, uri.toUri())?.delete()
        } catch (_: Exception) {}
        jsCommunicator.reject(id, ex.stackTraceToString())
      }
    }
    return id
  }

  /**
   * pulls the latest progress message of a pending promise ("" when none)
   */
  @JavascriptInterface
  fun getProgress(id: String): String {
    return try {
      jsCommunicator.getSyncMessage("$id-progress") ?: ""
    } catch (ex: Exception) {
      ""
    }
  }

  @JavascriptInterface
  fun isJishoInstalled(): Boolean {
    return try {
      context.packageManager.getPackageInfo(JISHO_PACKAGE, 0)
      true
    } catch (ex: Exception) {
      false
    }
  }

  /**
   * Hands a downloaded study video over to shiroikuma-jisho via an explicit
   * intent (contract documented in jisho's hand-off.md).
   */
  @JavascriptInterface
  fun openStudyVideoInJisho(videoPath: String, subtitlePath: String, studyDir: String, title: String, videoId: String): String {
    return try {
      val intent = Intent("shiroikuma.jisho.intent.action.STUDY_VIDEO")
      intent.setClassName(JISHO_PACKAGE, "$JISHO_PACKAGE.MainActivity")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      intent.putExtra("path", videoPath)
      intent.putExtra("subtitlePath", subtitlePath)
      intent.putExtra("studyDir", studyDir)
      intent.putExtra("title", title)
      intent.putExtra("videoId", videoId)
      intent.putExtra("source", "jiyudoga")
      context.startActivity(intent)
      "ok"
    } catch (ex: Exception) {
      "error: $ex"
    }
  }

  // endregion

  // region Backup (Export / Import + 保存復元 automation)

  /**
   * The one category model, straight out of [StateCategories] — the Export/Import panel in
   * the UI settings page renders whatever this returns, so nothing is duplicated in JS.
   */
  @JavascriptInterface
  fun listBackupCategories(): String {
    val list = JSONArray()
    StateCategories.ALL.forEach { category ->
      list.put(
        JSONObject()
          .put("id", category.id)
          .put("label", category.label)
          .put("parent", category.parent ?: JSONObject.NULL)
          .put("leaf", category.store != null)
          .put("defaultSelected", category.defaultSelected)
      )
    }
    return list.toString()
  }

  /** `{}` when unset, otherwise `{ tree, path, name }` of the configured backup folder. */
  @JavascriptInterface
  fun getBackupDirectory(): String {
    val tree = AutomationAuth.directoryUri(context) ?: return "{}"
    val directory = BackupWriter.configuredDirectory(context)
    val path = SafPaths.treeUriToPath(tree)
    return JSONObject()
      .put("tree", tree)
      .put("path", path)
      .put("name", directory?.name ?: path.substringAfterLast('/').ifEmpty { tree })
      .put("valid", directory != null)
      .toString()
  }

  /** SAF folder picker; resolves the tree uri (already persisted) or `USER_CANCELED`. */
  @JavascriptInterface
  fun pickBackupDirectory(): String {
    val id = "${randomUUID()}"
    context.launchIntent(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)).then { result ->
      try {
        val uri = result?.data?.data
        if (result?.resultCode == Activity.RESULT_CANCELED || uri == null) {
          jsCommunicator.resolve(id, "USER_CANCELED")
        } else {
          context.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
          )
          AutomationAuth.setDirectoryUri(context, uri.toString())
          jsCommunicator.resolve(id, uri.toString())
        }
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.stackTraceToString())
      }
    }
    return id
  }

  /**
   * The newest backup in the configured folder — the page queries this on open so the
   * "last export" line is always current. `{}` when there is no folder or no backup.
   */
  @JavascriptInterface
  fun getLatestBackup(): String {
    val directory = BackupWriter.configuredDirectory(context) ?: return "{}"
    val newest = runCatching {
      directory.listFiles()
        .filter { it.isFile && StateBackup.isBackupName(it.name ?: "") }
        .maxByOrNull { it.lastModified() }
    }.getOrNull() ?: return "{}"
    return JSONObject()
      .put("name", newest.name)
      .put("timestamp", newest.lastModified())
      .put("bytes", newest.length())
      .toString()
  }

  /**
   * Writes ONE zip holding the selected categories into the configured folder.
   * Resolves `{ name, path, bytes, human, categories }`.
   */
  @JavascriptInterface
  fun exportState(items: String): String {
    val id = "${randomUUID()}"
    val ids = items.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val written = BackupWriter.write(context, ids)
        jsCommunicator.resolve(
          id,
          JSONObject()
            .put("name", written.path.substringAfterLast('/'))
            .put("path", written.path)
            .put("bytes", written.bytes)
            .put("human", StateBackup.humanSize(written.bytes))
            .put("categories", written.categories)
            .toString()
        )
      } catch (ex: BackupWriter.NoDirectory) {
        jsCommunicator.reject(id, "no-directory")
      } catch (ex: BackupWriter.NoStorageAccess) {
        jsCommunicator.reject(id, "no-storage-access")
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.message ?: ex.javaClass.simpleName)
      }
    }
    return id
  }

  /** Restores the selected categories a picked archive carries. Resolves a summary. */
  @JavascriptInterface
  fun importState(uri: String, items: String): String {
    val id = "${randomUUID()}"
    val ids = items.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val bytes = context.contentResolver.readBytes(uri.toUri())
          ?: throw Exception("could not read the picked archive")
        jsCommunicator.resolve(id, StateBackup.import(context, bytes, ids))
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.message ?: ex.javaClass.simpleName)
      }
    }
    return id
  }

  @JavascriptInterface
  fun hasAllFilesAccess(): Boolean = BackupWriter.hasAllFilesAccess()

  /** Opens the system All-Files-Access screen (needed only for `path` overrides). */
  @JavascriptInterface
  fun requestAllFilesAccess() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return
    }
    context.runOnUiThread {
      try {
        context.startActivity(
          Intent(
            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            "package:${context.packageName}".toUri()
          )
        )
      } catch (ex: Exception) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
      }
    }
  }

  @JavascriptInterface
  fun isAutomationEnabled(): Boolean = AutomationAuth.isEnabled(context)

  @JavascriptInterface
  fun setAutomationEnabled(enabled: Boolean) = AutomationAuth.setEnabled(context, enabled)

  @JavascriptInterface
  fun getAutomationToken(): String = AutomationAuth.token(context)

  @JavascriptInterface
  fun regenerateAutomationToken(): String = AutomationAuth.regenerate(context)

  /** On the UI thread: some OEM clipboards raise their own toast when the clip is set. */
  @JavascriptInterface
  fun copyToClipboard(label: String, text: String) {
    context.runOnUiThread {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
    }
  }

  // endregion

  // region Device sync

  /**
   * Fork (白い熊 自由動画): the phone's side of the device sync is only ever these three
   * calls — read the file the desktop published, publish our own, and copy the datastores
   * aside before the first merge. No socket is opened here, by design: the desktop app is
   * the courier, so nothing about syncing can hold the WiFi radio awake.
   */
  @JavascriptInterface
  fun readSyncFile(directory: String, name: String): String {
    val id = "${randomUUID()}"
    coroutineScope.launch(Dispatchers.IO) {
      try {
        // an empty string rather than a rejection: the other device simply not having
        // published yet is the ordinary state, not a failure
        jsCommunicator.resolve(id, SyncFiles.read(directory, name) ?: "")
      } catch (ex: SyncFiles.NoStorageAccess) {
        jsCommunicator.reject(id, "no-storage-access")
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.message ?: ex.javaClass.simpleName)
      }
    }
    return id
  }

  @JavascriptInterface
  fun writeSyncFile(directory: String, name: String, contents: String): String {
    val id = "${randomUUID()}"
    coroutineScope.launch(Dispatchers.IO) {
      try {
        jsCommunicator.resolve(id, SyncFiles.write(directory, name, contents))
      } catch (ex: SyncFiles.NoStorageAccess) {
        jsCommunicator.reject(id, "no-storage-access")
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.message ?: ex.javaClass.simpleName)
      }
    }
    return id
  }

  @JavascriptInterface
  fun backupSyncDatastores(directory: String, stamp: String): String {
    val id = "${randomUUID()}"
    coroutineScope.launch(Dispatchers.IO) {
      try {
        jsCommunicator.resolve(id, SyncFiles.backupDatastores(context, directory, stamp))
      } catch (ex: SyncFiles.NoStorageAccess) {
        jsCommunicator.reject(id, "no-storage-access")
      } catch (ex: Exception) {
        jsCommunicator.reject(id, ex.message ?: ex.javaClass.simpleName)
      }
    }
    return id
  }

  // endregion

  // region System

  @JavascriptInterface
  fun openExternalLink(url: String) {
    context.startActivity(
      Intent(Intent.ACTION_VIEW, url.toUri())
    )
  }

  @JavascriptInterface
  fun getLogs(): String {
    var logs = "["
    for (message in context.state.consoleMessages) {
      logs += "${message},"
    }
    // get rid of trailing comma
    if (logs.length > 1) {
      logs = logs.substring(0, logs.length - 1)
    }
    logs += "]"
    return logs
  }

  @JavascriptInterface
  fun restart() {
    context.restart()
  }

  /**
   * hides the splashscreen
   */
  @JavascriptInterface
  fun hideSplashScreen() {
    context.state.showSplashScreen = false
  }

  @JavascriptInterface
  fun enableKeepScreenOn() {
    context.setKeepScreenOn(true)
  }

  @JavascriptInterface
  fun disableKeepScreenOn() {
    context.setKeepScreenOn(false)
  }

  /**
   * Fork (白い熊 自由動画): the Settings › General switch for the keep-alive foreground
   * service. The flag is read back by `MainActivity.onCreate` on the next launch; flipping
   * it here starts or stops the service straight away, so the notification appears and
   * disappears with the switch.
   */
  @JavascriptInterface
  fun isKeepAliveEnabled(): Boolean = KeepAliveService.isEnabled(context)

  @JavascriptInterface
  fun setKeepAliveEnabled(enabled: Boolean) {
    KeepAliveService.setEnabled(context, enabled)
    context.runOnUiThread {
      if (enabled) {
        context.startService(KeepAliveService.intent(context))
      } else {
        context.stopService(KeepAliveService.intent(context))
      }
    }
  }

  /**
   * used on the JS side for async js communication
   */
  @JavascriptInterface
  fun getSyncMessage(promise: String): String? {
    return jsCommunicator.getSyncMessage(promise)
  }

  /**
   *
   */
  @JavascriptInterface
  fun themeSystemUi(navigationHex: String, statusHex: String, navigationDarkMode: Boolean  = true,  statusDarkMode: Boolean = true) {
    context.themeSystemUi(navigationHex, statusHex, navigationDarkMode, statusDarkMode)
  }

  @JavascriptInterface
  fun getSystemTheme(): String {
    return if (context.state.darkMode) {
      "dark"
    } else {
      "light"
    }
  }

  @JavascriptInterface
  fun isAppPaused(): Boolean {
    return context.state.paused
  }

  @JavascriptInterface
  fun enterPromptMode() {
    webView.isVerticalScrollBarEnabled = false
    context.state.isInAPrompt = true
  }

  @JavascriptInterface
  fun exitPromptMode() {
    webView.isVerticalScrollBarEnabled = true
    context.state.isInAPrompt = false
  }

  @JavascriptInterface
  fun setScale(scale: Int) {
    webView.setScale(scale / 100.0, context)
  }

  // endregion

  // region Data Extraction

  private fun getBotGuardScript(
    videoId: String,
    sessionContext: String,
    initialAttestationData: String,
    ytConfig: String
  ): String {
    val script = context.assets.readText("botGuardScript.js")
    val functionName = script.split("export{")[1].split(" as default};")[0]
    val exportSection = "export{${functionName} as default};"
    val bakedScript =
      script.replace(exportSection, "; ${functionName}(\"$videoId\", $sessionContext, $initialAttestationData, $ytConfig)")
    return bakedScript
  }

  @JavascriptInterface
  fun generatePOToken(
    videoId: String,
    sessionContext: String,
    initialAttestationData: String,
    ytConfig: String
  ): String {
    return Promise(coroutineScope) { resolve, reject ->
      webView.post {
        try {
          val bgScript = getBotGuardScript(videoId, sessionContext, initialAttestationData, ytConfig)
          val bgWv = webView.generateBgWebview()

          // Upstream's rejectToken path reports the failures BotGuard itself throws, but a
          // WebView that never runs the script at all — a blocked request, a load that dies —
          // still reports nothing, and this promise would stay pending for ever with the watch
          // page spinning on a token that was never coming. Time it out: the caller treats a
          // missing content poToken as non-fatal and plays untokenised, far better than hanging.
          val settled = AtomicBoolean(false)
          val onTimeout = Runnable {
            if (settled.compareAndSet(false, true)) {
              bgWv.destroy()
              reject("BotGuard timed out after ${POTOKEN_TIMEOUT_MS}ms generating the poToken")
            }
          }
          webView.postDelayed(onTimeout, POTOKEN_TIMEOUT_MS)

          bgWv.jsInterface.onReturn {
            run {
              webView.post {
                if (settled.compareAndSet(false, true)) {
                  webView.removeCallbacks(onTimeout)
                  resolve(it)
                  bgWv.destroy()
                }
              }
            }
          }
          bgWv.jsInterface.onReject {
            run {
              webView.post {
                if (settled.compareAndSet(false, true)) {
                  webView.removeCallbacks(onTimeout)
                  reject(it)
                  bgWv.destroy()
                }
              }
            }
          }
          webView.post {
            bgWv.loadDataWithBaseURL(
              "https://www.youtube.com/",
              "<!DOCTYPE html>" +
                "<html lang=\"en\">" +
                "<head>" +
                "<title></title>" +
                "</head>" +
                "<body>" +
                // We keep src/botGuardScript.js at upstream FreeTube's version rather than taking
                // FreeTubeAndroid's script-tag rewrite of it: that file is shared with the desktop
                // build, which runs it in an offscreen WebContentsView and works as it stands.
                // Android's problem is only that the interpreter lives on www.google.com, so a
                // cross-origin fetch cannot read the response back — so shim fetch here instead,
                // loading it as a <script> and handing `new Function()` a harmless stub to run.
                "<script>\n" +
                "window.ofetch = window.fetch\n" +
                "window.fetch = async (url, data) => {\n" +
                "  if (url.startsWith('https://www.google.com/')) {\n" +
                "    return new Promise((resolve, _) => {\n" +
                "    const script = document.createElement('script')\n" +
                "    script.src = url\n" +
                "    script.async = true\n" +
                // Attach the listener BEFORE appending: appending starts the load, so a cached
                // script could otherwise fire `load` with nothing listening and hang the promise.
                "     script.addEventListener('load', () => {\n" +
                "       resolve({ text: () => '() => {}' })\n" +
                "     })\n" +
                // Defensive now that the document carries a real <body>: append to whatever node
                // the parser has actually reached. Before this document grew one, document.body
                // was null here and the append threw, hanging playback on a spinner.
                "    const parent = document.body || document.head || document.documentElement\n" +
                "    parent.appendChild(script)\n" +
                "    })\n" +
                "  }\n" +
                // shouldInterceptRequest cannot see a request body, so pass it over the bridge and
                // tag the request; BotGuardWebView writes it back out. Only the /att/get fallback
                // needs this — GenerateIT is handed to the WebView untouched, body and all.
                "  const id = crypto.randomUUID()\n" +
                "  if (data && 'body' in data) {" +
                "    Android.queueBody(id, data.body)\n" +
                "    data.headers['x-fta-request-id'] = id\n" +
                "  }" +
                "  return await window.ofetch(url, data)\n" +
                "}</script>" +
                "<script>${bgScript}.then((TOKEN_RESULT) => { console.log(`Your potoken is \${TOKEN_RESULT}`); Android.returnToken(TOKEN_RESULT) }).catch((error) => { Android.rejectToken(error.toString()) })</script>" +
                "</body>" +
                "</html>",
              "text/html",
              "utf-8",
              null
            )
          }
        } catch (exception: Exception) {
          reject(exception.message ?: exception.javaClass.name)
        }
      }
    }.addJsCommunicator(jsCommunicator)
  }

  @JavascriptInterface
  fun runDecipherScript(id: String, code: String, timeout: String): String {
    webView.post {
      webView.generateSigWebview()
        .onLoad = {
          // pass data to other webview
          jsInterface.jsCommunicator.resolve(id, code)
          // dispatch event to read data
          dispatchEvent("message", "id", id)
          // when timeout is called, clean up webview
          postDelayed({
            destroy()
          }, timeout.toLong())
      }
    }
    return id
  }

  // endregion
}
