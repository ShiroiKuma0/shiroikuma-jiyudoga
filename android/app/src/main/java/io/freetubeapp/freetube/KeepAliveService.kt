package io.freetubeapp.freetube

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.IBinder
import androidx.core.app.NotificationManagerCompat

class KeepAliveService : Service() {
  companion object {
    private const val CHANNEL_ID = "keep_alive"

    /**
     * Fork (白い熊 自由動画): running in the background is opt-in, and OFF by default.
     *
     * Upstream started this service unconditionally from `MainActivity.onCreate`, so the
     * app held a foreground service — and showed its notification — from the first launch
     * onwards, with no setting anywhere to stop it. The switch now lives in
     * Settings › General.
     *
     * The flag is kept in its own SharedPreferences file rather than in the app's settings
     * store, because `MainActivity.onCreate` has to answer "start it?" long before the
     * WebView — and with it the nedb settings database — has loaded.
     */
    private const val PREFS = "jiyudoga_background"
    private const val KEY_ENABLED = "keep_alive_enabled"

    private fun prefs(context: Context): SharedPreferences =
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Default OFF — nothing stays alive in the background until 白い熊 asks for it. */
    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
      prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun intent(context: Context): Intent = Intent(context, KeepAliveService::class.java)
  }
  override fun onBind(intent: Intent?): IBinder? {
    TODO("Not yet implemented")
  }
  override fun onCreate() {
    super.onCreate()
    val notificationManager = NotificationManagerCompat.from(applicationContext)
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.keep_alive_channel),
      NotificationManager.IMPORTANCE_MIN
    )
    notificationManager.createNotificationChannel(channel)

    startForeground(1,
      Notification.Builder(this.applicationContext, CHANNEL_ID)
        .setContentTitle(getString(R.string.keep_alive_notification, getString(R.string.app_name)))
        .setCategory(Notification.CATEGORY_SERVICE)
        .setSmallIcon(R.drawable.ic_media_notification_icon)
        .build())
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    return START_STICKY
  }
  override fun startForegroundService(service: Intent?): ComponentName? {
    return super.startForegroundService(service)
  }
}
