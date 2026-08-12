package io.freetubeapp.freetube.webviews

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.freetubeapp.freetube.R
import io.freetubeapp.freetube.activities.FreeTubeActivity
import io.freetubeapp.freetube.helpers.WindowInsetsControllerWrapper
import io.freetubeapp.freetube.javascript.FreeTubeJavaScriptInterface
import io.freetubeapp.freetube.javascript.dispatchEvent
import org.json.JSONObject

@SuppressLint("ViewConstructor")
class FreeTubeWebView (
  context: FreeTubeActivity
) : BackgroundPlayWebView(context, null) {
  private val windowInsetsControllerWrapper = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && windowInsetsController != null) {
    WindowInsetsControllerWrapper(windowInsetsController)
  } else {
    WindowInsetsControllerWrapper(context.windowInsetsController)
  }
  val jsInterface = FreeTubeJavaScriptInterface(context, this)

  val onConsoleMessage: (JSONObject) -> Unit = { messageData: JSONObject ->
    context.state.consoleMessages.add(messageData)
    dispatchEvent("console-message", "data", messageData)
  }

  companion object {
    /**
     * A desktop agent built around the WebView's OWN Chromium version, rather than a hardcoded
     * string: the engine really is that build, so only the platform is restated, and the version
     * keeps pace as the system WebView updates instead of ageing into a lie.
     */
    fun desktopUserAgent(context: Context): String {
      val chromeVersion = Regex("Chrome/([\\d.]+)")
        .find(WebSettings.getDefaultUserAgent(context))
        ?.groupValues?.get(1)
        ?: "114.0.0.0"
      return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/$chromeVersion Safari/537.36"
    }
  }

  init {
    layoutParams = LayoutParams(MATCH_PARENT, MATCH_PARENT)
    setBackgroundColor(Color.TRANSPARENT)

    // BackgroundPlayWebView refuses cookies from here on, but builds before that fix may have
    // persisted some — inert once they can no longer be sent, yet still tracking identifiers
    // sitting on disk. Purge them once per launch; a no-op on every run after the first.
    CookieManager.getInstance().apply {
      removeAllCookies(null)
      flush()
    }

    // Present as a desktop browser. YouTube picks the client it serves from the user agent, and
    // the stock WebView agent says "Mobile" — so www.youtube.com/watch returns the MWEB page.
    // That was harmless until FreeTube 0.25.2: since #9607 the local API builds its entire
    // Innertube session out of the ytcfg embedded in that HTML, so a mobile page silently makes
    // the whole session MWEB while the player, the BotGuard/poToken flow and the rest of
    // upstream's code all assume WEB. Electron gets WEB for free; this is how Android does.
    // Only this WebView is changed — the BotGuard WebView keeps the stock agent, since claiming
    // desktop Linux inside an Android WebView is exactly the inconsistency it fingerprints for.
    settings.userAgentString = desktopUserAgent(context)

    @SuppressLint("SetJavaScriptEnabled")
    settings.javaScriptEnabled = true
    // add the JavaScript interface
    addJavascriptInterface(jsInterface, "Android")

    // this is the 🥃 special sauce that makes local api streaming a possibility
    @Suppress("DEPRECATION")
    settings.allowUniversalAccessFromFileURLs = true
    @Suppress("DEPRECATION")
    settings.allowFileAccessFromFileURLs = true
    // allow playlist ▶auto-play in background
    settings.mediaPlaybackRequiresUserGesture = false

    webViewClient = object: WebViewClient() {
      override fun onPageFinished(view: WebView?, url: String?) {
        context.state.currentPage = url
        super.onPageFinished(view, url)
      }
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        if (request?.url?.scheme == "file") {
          // don't send file url requests to a web browser (it will crash the app)
          return true
        }

        val regex = context.getString(R.string.youtube_regex)

        val urlString = request?.url?.toString()
        if (urlString != null && Regex(regex).containsMatchIn(urlString)) {
          dispatchEvent("youtube-link", "link", urlString)
          return true
        }
        // send all requests to a real web browser
        context.startActivity(
          Intent(Intent.ACTION_VIEW, request?.url)
        )
        return true
      }
    }

    var fullscreenView: View? = null
    webChromeClient = object: ConsoleLogChromeClient({ message ->
      onConsoleMessage(message)
    }) {
      override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        if (view != null) {
          val viewGroup = (parent as ViewGroup)

          // hide system ui
          viewGroup.fitsSystemWindows = false

          windowInsetsControllerWrapper.hide(WindowInsetsCompat.Type.systemBars())
          windowInsetsControllerWrapper.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

          viewGroup.addView(view)
          fullscreenView = view
          dispatchEvent("start-fullscreen")
        }
      }

      override fun onHideCustomView() {
        val viewGroup = (parent as ViewGroup)

        // show system ui
        viewGroup.fitsSystemWindows = true
        windowInsetsControllerWrapper.show(WindowInsetsCompat.Type.systemBars())

        viewGroup.removeView(fullscreenView)
        dispatchEvent("end-fullscreen")
      }
    }
  }

  fun generateBgWebview(): BotGuardWebView {
    return BotGuardWebView(context, onConsoleMessage)
  }

  fun generateSigWebview(): SigWebView {
    val view = SigWebView(context, jsInterface.jsCommunicator, onConsoleMessage)
    val viewGroup = (parent as ViewGroup)
    viewGroup.addView(view)
    view.visibility = GONE
    return view
  }
}
