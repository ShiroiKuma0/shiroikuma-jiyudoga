package io.freetubeapp.freetube.javascript

import android.util.JsonReader
import android.webkit.JavascriptInterface
import android.webkit.WebView
import io.freetubeapp.freetube.MainActivity
import io.freetubeapp.freetube.webviews.SigWebView
import org.json.JSONObject

class SigWebViewJavascriptInterface(
  webView: SigWebView,
  private val remoteJSCommunicator: AsyncJSCommunicator
) {
  val jsCommunicator = AsyncJSCommunicator(webView)

  @JavascriptInterface
  fun readSync(id: String): String {
    return jsCommunicator.getSyncMessage(id)
  }

  @JavascriptInterface
  fun postMessage(id: String, message: String) {
    remoteJSCommunicator.resolve(id, message)
  }
}
