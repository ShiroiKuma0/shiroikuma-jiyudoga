package io.freetubeapp.freetube.account

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpCookie
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The YouTube account used for age-restricted videos — Android's half of
 * src/main/youtubeAccount.js, which explains the design. The cookies imported from a
 * Netscape cookies.txt are the login, so they live here and never cross the bridge:
 * the page can import, inspect and forget them and ask for one request to
 * www.youtube.com to be sent as the account.
 *
 * Stored in noBackupFilesDir: kept out of Android's cloud backup, and out of the
 * Export/Import ZIP, which only reads the nedb stores.
 */
object YoutubeAccount {
  private const val ORIGIN = "https://www.youtube.com"
  private const val FILE_NAME = "youtube-account.json"

  private val REQUIRED_COOKIES = listOf("SAPISID", "SID")

  // a Set-Cookie deleting one of these is YouTube signing the session out
  private val SESSION_COOKIES = setOf(
    "SID", "HSID", "SSID", "APISID", "SAPISID",
    "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PAPISID", "__Secure-3PAPISID", "LOGIN_INFO"
  )

  class NoLoginCookiesException : Exception("no-login-cookies")

  private data class State(
    val cookies: LinkedHashMap<String, String>,
    val importedAt: Long,
    var signedOut: Boolean
  )

  private val lock = Any()

  private fun file(context: Context) = File(context.noBackupFilesDir, FILE_NAME)

  private fun load(context: Context): State? {
    val file = file(context)
    if (!file.exists()) return null
    return try {
      val json = JSONObject(file.readText())
      val cookiesJson = json.getJSONObject("cookies")
      val cookies = LinkedHashMap<String, String>()
      for (name in cookiesJson.keys()) {
        cookies[name] = cookiesJson.getString(name)
      }
      State(cookies, json.optLong("importedAt"), json.optBoolean("signedOut"))
    } catch (ex: Exception) {
      null
    }
  }

  private fun save(context: Context, state: State) {
    val json = JSONObject()
    json.put("cookies", JSONObject(state.cookies as Map<*, *>))
    json.put("importedAt", state.importedAt)
    json.put("signedOut", state.signedOut)
    // written aside and renamed, so a crash never leaves half a login on disk
    val part = File(context.noBackupFilesDir, "$FILE_NAME.part")
    part.writeText(json.toString())
    part.renameTo(file(context))
  }

  /** Netscape cookie file → the www.youtube.com cookies, by name. */
  fun parseCookiesTxt(text: String): LinkedHashMap<String, String> {
    val cookies = LinkedHashMap<String, String>()
    val now = System.currentTimeMillis() / 1000

    for (rawLine in text.lines()) {
      val line = when {
        // Firefox marks HttpOnly cookies with a prefix on the domain instead of a column
        rawLine.startsWith("#HttpOnly_") -> rawLine.removePrefix("#HttpOnly_")
        rawLine.startsWith("#") || rawLine.isBlank() -> continue
        else -> rawLine
      }

      val fields = line.trimEnd('\r').split("\t")
      if (fields.size < 7) continue

      val host = fields[0].removePrefix(".")
      if (host != "youtube.com" && host != "www.youtube.com") continue

      val expiry = fields[4].toLongOrNull() ?: 0
      if (expiry in 1 until now) continue

      cookies[fields[5]] = fields[6]
    }

    return cookies
  }

  fun status(context: Context): JSONObject {
    val state = synchronized(lock) { load(context) }
    val json = JSONObject()
    json.put("present", state != null)
    json.put("importedAt", state?.importedAt ?: 0)
    json.put("signedOut", state?.signedOut ?: false)
    return json
  }

  fun import(context: Context, text: String): JSONObject {
    val cookies = parseCookiesTxt(text)
    if (REQUIRED_COOKIES.any { cookies[it].isNullOrEmpty() }) {
      throw NoLoginCookiesException()
    }
    synchronized(lock) {
      save(context, State(cookies, System.currentTimeMillis(), false))
    }
    return status(context)
  }

  fun forget(context: Context) {
    synchronized(lock) {
      file(context).delete()
    }
  }

  /** SHA-1 over "<seconds> <cookie> <origin>", one entry per API cookie — the signed-in web client's Authorization. */
  private fun authorization(cookies: Map<String, String>): String {
    val seconds = System.currentTimeMillis() / 1000
    return listOf(
      "SAPISIDHASH" to cookies["SAPISID"],
      "SAPISID1PHASH" to cookies["__Secure-1PAPISID"],
      "SAPISID3PHASH" to cookies["__Secure-3PAPISID"]
    ).filter { !it.second.isNullOrEmpty() }.joinToString(" ") { (scheme, value) ->
      val digest = MessageDigest.getInstance("SHA-1").digest("$seconds $value $ORIGIN".toByteArray())
      "$scheme ${seconds}_${digest.joinToString("") { "%02x".format(it) }}"
    }
  }

  /** Keeps the stored session current; a deleted session cookie means YouTube signed the export out. */
  private fun applySetCookie(context: Context, headers: List<String>) {
    synchronized(lock) {
      val state = load(context) ?: return
      var changed = false

      for (header in headers) {
        // HttpCookie turns a past Expires into an expired cookie
        val cookie = runCatching { HttpCookie.parse(header) }.getOrNull()?.firstOrNull() ?: continue
        val name = cookie.name
        val value = cookie.value ?: ""
        val deleted = value.isEmpty() || cookie.hasExpired()

        if (deleted) {
          if (SESSION_COOKIES.contains(name) && !state.signedOut) {
            state.signedOut = true
            changed = true
          }
        } else if (!state.signedOut && state.cookies[name] != value) {
          state.cookies[name] = value
          changed = true
        }
      }

      if (changed) save(context, state)
    }
  }

  /**
   * Sends one request to www.youtube.com as the account. Blocking: call it off the main thread.
   * @param init `{ method?, headers?: {…}, body? }`
   * @return `{ status, contentType, body, signedOut }`
   */
  fun fetch(context: Context, url: String, init: JSONObject): JSONObject {
    val state = synchronized(lock) { load(context) } ?: throw Exception("no-account")

    if (!url.startsWith("$ORIGIN/")) {
      throw Exception("Only www.youtube.com is reachable as the account")
    }

    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.instanceFollowRedirects = false
      connection.requestMethod = init.optString("method", "GET")
      connection.connectTimeout = 20000
      connection.readTimeout = 30000

      val headers = init.optJSONObject("headers")
      if (headers != null) {
        for (name in headers.keys()) {
          connection.setRequestProperty(name, headers.getString(name))
        }
      }

      connection.setRequestProperty("Cookie", state.cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
      connection.setRequestProperty("Authorization", authorization(state.cookies))
      connection.setRequestProperty("X-Origin", ORIGIN)
      connection.setRequestProperty("X-Goog-AuthUser", "0")
      connection.setRequestProperty("X-Youtube-Bootstrap-Logged-In", "true")

      if (url.startsWith("$ORIGIN/youtubei/")) {
        connection.setRequestProperty("Origin", ORIGIN)
        connection.setRequestProperty("Referer", "$ORIGIN/")
      }

      val body = if (init.has("body") && !init.isNull("body")) init.getString("body") else null
      if (body != null) {
        connection.doOutput = true
        connection.outputStream.use { it.write(body.toByteArray()) }
      }

      val status = connection.responseCode
      val stream = if (status >= 400) connection.errorStream else connection.inputStream
      val text = stream?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""

      val setCookie = connection.headerFields.entries
        .filter { it.key != null && it.key.equals("Set-Cookie", ignoreCase = true) }
        .flatMap { it.value }
      applySetCookie(context, setCookie)

      val result = JSONObject()
      result.put("status", status)
      result.put("contentType", connection.contentType ?: "")
      result.put("body", text)
      result.put("signedOut", synchronized(lock) { load(context)?.signedOut ?: false })
      return result
    } finally {
      connection.disconnect()
    }
  }
}
