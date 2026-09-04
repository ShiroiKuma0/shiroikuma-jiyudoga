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

  /*
   * Every write here is `commit()`, never `apply()`.
   *
   * `apply()` is asynchronous: it updates the in-memory map and writes to disk later. That was
   * survivable while the gate defaulted to CLOSED — a lost write left automation off, which is
   * the safe direction. Contract v2 defaults it to OPEN, so a lost write of `false` now falls
   * back to ON: 白い熊 turns this app's automation off, the process is killed before the write
   * lands, and the door is open again with the switch showing off. The same reasoning covers the
   * token and the directory: a token shown but not stored is one that will never match.
   */

  private const val PREFS = "jiyudoga_backup"
  private const val KEY_ENABLED = "automation_enabled"
  private const val KEY_REQUIRE_TOKEN = "automation_require_token"
  private const val KEY_TOKEN = "automation_token"
  private const val KEY_DIR_URI = "backup_dir_uri"

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /**
   * Contract v2: default **ON**.
   *
   * v1 shipped closed, gated on a 48-character secret 白い熊 pasted from here into the caller.
   * A pasted secret cannot survive a wipe, and the case this now exists for is 応用管理 restoring
   * apps *and their data* onto a clean phone, where nothing has been configured and nobody has
   * pasted anything. A gate that only works once the phone is already set up is no gate for
   * setting the phone up. The switch stays because it is the only way to close this app off
   * again — a feature that can be turned on but never off is one 白い熊 cannot retreat from.
   */
  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, true)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).commit()
  }

  /** Contract v2: default **OFF**. The data door checks the caller's identity either way. */
  fun requiresToken(context: Context): Boolean =
    prefs(context).getBoolean(KEY_REQUIRE_TOKEN, false)

  fun setRequiresToken(context: Context, required: Boolean) {
    prefs(context).edit().putBoolean(KEY_REQUIRE_TOKEN, required).commit()
  }

  /**
   * The whole gate, in one place — both doors call this and nothing else.
   *
   * Written once rather than as two checks at each entry point, because that is how "disabled"
   * and "bad token" drift apart across forty-two apps.
   *
   * **A token handed to an app that does not require one is IGNORED, never an error.** Tokens
   * live in task arguments and workspace variables that outlive the setting they were pasted
   * for; a caller still sending one — configured last year, or because another app in the batch
   * does want one — must be served. Refusing it would turn "白い熊 turned a switch off" into
   * "half the batch mysteriously fails", which is the friction the switch exists to remove.
   *
   * @return null to proceed, otherwise the exact `ERROR:` string to answer with.
   */
  fun refuse(context: Context, candidate: String?): String? = when {
    !isEnabled(context) -> "ERROR:automation disabled"
    requiresToken(context) && !matches(context, candidate) -> "ERROR:bad token"
    else -> null
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
    prefs(context).edit().putString(KEY_TOKEN, token).commit()
    return token
  }

  /**
   * Constant-time comparison — a timing oracle on a broadcast is still an oracle. Only consulted
   * when the token is actually required; see [refuse].
   */
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
    prefs(context).edit().putString(KEY_DIR_URI, uri).commit()
  }
}
