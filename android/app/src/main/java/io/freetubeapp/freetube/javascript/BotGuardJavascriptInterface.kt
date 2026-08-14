package io.freetubeapp.freetube.javascript

import android.webkit.JavascriptInterface
import io.freetubeapp.freetube.helpers.Promise

class BotGuardJavascriptInterface {
  lateinit var resolve: (String) -> Unit
  lateinit var reject: (String) -> Unit
  var promise: Promise<String, String> = Promise {
    resolve, reject ->
      this.resolve = resolve
      this.reject = reject
  }

  /**
   * Request bodies parked for BotGuardWebView's shouldInterceptRequest, which reconstructs the
   * request by hand and cannot see the body Blink is holding. Upstream dropped this along with
   * its fetch shim; we keep both, because src/botGuardScript.js stays at FreeTube's version and
   * that one still POSTs /att/get through fetch when the interpreter URL is missing.
   */
  val pendingRequestBodies: MutableMap<String, String> = mutableMapOf()

  @JavascriptInterface
  fun queueBody(id: String, body: String) {
    pendingRequestBodies[id] = body
  }

  @JavascriptInterface
  fun returnToken(token: String) {
    resolve(token)
  }

  @JavascriptInterface
  fun rejectToken(error: String) {
    reject(error)
  }

  fun onReturn(callback: (String) -> Unit) {
    promise.then(callback)
  }

  fun onReject(callback: (String) -> Unit) {
    promise.catch(callback)
  }
}
