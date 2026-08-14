package io.freetubeapp.freetube.helpers

import android.webkit.WebView

/**
 * Present as a desktop browser. YouTube picks the client it serves from the user agent, and the
 * stock WebView agent says "Mobile" — so www.youtube.com/watch returns the MWEB page. That was
 * harmless until FreeTube 0.25.2: since #9607 the local API builds its entire Innertube session
 * out of the ytcfg embedded in that HTML, so a mobile page silently makes the whole session MWEB
 * while the player, the BotGuard/poToken flow and the rest of upstream's code all assume WEB.
 * Electron gets WEB for free; this is how Android does.
 *
 * Only the main WebView is spoofed — the BotGuard WebView keeps the stock agent, since claiming
 * desktop Linux from inside an Android WebView is exactly the inconsistency it fingerprints for.
 *
 * The agent is built around the WebView's OWN Chromium version rather than a hardcoded string:
 * the engine really is that build, so only the platform is restated, and the version keeps pace
 * as the system WebView updates instead of ageing into a lie.
 */
fun WebView.spoofDesktopUserAgent() {
  val chromeVersion = Regex("Chrome/([\\d.]+)")
    .find(settings.userAgentString)
    ?.groupValues?.get(1)
    ?: "114.0.0.0"
  settings.userAgentString =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/$chromeVersion Safari/537.36"
}
