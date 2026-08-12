package io.freetubeapp.freetube.webviews

import android.content.Context
import android.util.AttributeSet
import android.webkit.CookieManager
import android.webkit.WebView

open class BackgroundPlayWebView @JvmOverloads constructor(
  context: Context, attrs: AttributeSet? = null
) : WebView(context, attrs) {
  init {
    // Upstream drops the tracking cookies YouTube hands out on the watch page
    // (src/main/index.js: trackingCookieRequestFilter -> delete responseHeaders['set-cookie']),
    // but that lives in Electron's onHeadersReceived and has no Android counterpart. Since
    // FreeTube 0.25.2 the local API fetches https://www.youtube.com/watch?v=... directly to read
    // ytcfg and the BotGuard challenge out of the HTML, so without this those cookies would be
    // stored in the WebView jar and replayed on every later request — exactly the tracking
    // identity upstream is careful to throw away. Nothing here logs in or reads document.cookie,
    // so refuse cookies outright: setAcceptCookie blocks both sending and accepting, and being a
    // process-wide WebKit setting it covers the BotGuard and sig WebViews too.
    CookieManager.getInstance().apply {
      setAcceptCookie(false)
      setAcceptThirdPartyCookies(this@BackgroundPlayWebView, false)
    }
  }

  private var once: Boolean = false
  override fun onWindowVisibilityChanged(visibility: Int) {
    if (once) return
    if (visibility != GONE) super.onWindowVisibilityChanged(VISIBLE)
    once = true
  }
}
