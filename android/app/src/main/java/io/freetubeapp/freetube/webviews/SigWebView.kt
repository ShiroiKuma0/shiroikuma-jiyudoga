package io.freetubeapp.freetube.webviews

import android.content.Context
import android.util.AttributeSet
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import io.freetubeapp.freetube.MainActivity
import io.freetubeapp.freetube.javascript.consoleLog
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class SigWebView @JvmOverloads constructor(
  context: Context, attrs: AttributeSet? = null
) :
// no need to communicate window visibility
  BackgroundPlayWebView(context, attrs) {
  init {
    val mainActivity = (context as MainActivity)
    webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
      ): WebResourceResponse? {
        return null
      }
    }
  }
}
