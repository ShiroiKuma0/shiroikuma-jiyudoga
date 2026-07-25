package io.freetubeapp.freetube.backup

import android.content.Context
import android.content.SharedPreferences
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Fork (白い熊 自由動画): the token gate for the 保存復元 automation contract, plus the
 * device-local backup directory.
 *
 * Everything here lives in its OWN SharedPreferences file, which no backup category
 * touches — the token must never travel inside an exported ZIP, and the SAF tree uri is
 * meaningless on another device.
 */
object AutomationAuth {

  private const val PREFS = "jiyudoga_backup"
  private const val KEY_ENABLED = "automation_enabled"
  private const val KEY_TOKEN = "automation_token"
  private const val KEY_DIR_URI = "backup_dir_uri"

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Default OFF — nothing is reachable until 白い熊 turns the switch on. */
  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  /** 24 random bytes, hex encoded, generated lazily so the settings row always shows one. */
  fun token(context: Context): String {
    val stored = prefs(context).getString(KEY_TOKEN, null)
    if (!stored.isNullOrEmpty()) {
      return stored
    }
    return regenerate(context)
  }

  fun regenerate(context: Context): String {
    val bytes = ByteArray(24)
    SecureRandom().nextBytes(bytes)
    val token = bytes.joinToString("") { "%02x".format(it) }
    prefs(context).edit().putString(KEY_TOKEN, token).apply()
    return token
  }

  /** Constant-time comparison — a timing oracle on a broadcast is still an oracle. */
  fun matches(context: Context, candidate: String?): Boolean {
    if (candidate.isNullOrEmpty()) {
      return false
    }
    return MessageDigest.isEqual(
      candidate.toByteArray(Charsets.UTF_8),
      token(context).toByteArray(Charsets.UTF_8)
    )
  }

  fun directoryUri(context: Context): String? =
    prefs(context).getString(KEY_DIR_URI, null)?.takeIf { it.isNotEmpty() }

  fun setDirectoryUri(context: Context, uri: String) {
    prefs(context).edit().putString(KEY_DIR_URI, uri).apply()
  }
}
