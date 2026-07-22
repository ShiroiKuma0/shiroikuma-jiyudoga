package io.freetubeapp.freetube.javascript

import android.webkit.WebView

class AsyncJSCommunicator(givenWebView: WebView) {
  private val webView = givenWebView
  private var syncMessages: MutableMap<String, String> = HashMap()

  /**
   * resolves a js promise given the id
   */
  fun resolve(id: String, message: String) {
    syncMessages[id] = message
    webView.dispatchEvent("$id-resolve")
  }

  /**
   * rejects a js promise given the id
   */
  fun reject(id: String, message: String) {
    syncMessages[id] = message
    webView.dispatchEvent("$id-reject")
  }

  /**
   * emits a progress update for a pending js promise; the latest message wins
   */
  fun progress(id: String, message: String) {
    syncMessages["$id-progress"] = message
    webView.dispatchEvent("$id-progress")
  }

  fun getSyncMessage(promise: String): String {
    val value = syncMessages[promise]
    syncMessages.remove(promise)
    return value!!
  }
}
