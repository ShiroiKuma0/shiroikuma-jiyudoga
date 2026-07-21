package io.freetubeapp.freetube

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationManagerCompat


class KeepAliveService : Service() {
  companion object {
    private const val CHANNEL_ID = "keep_alive"
  }
  override fun onBind(intent: Intent?): IBinder? {
    TODO("Not yet implemented")
  }
  override fun onCreate() {
    super.onCreate()
    val notificationManager = NotificationManagerCompat.from(applicationContext)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Keep Alive", NotificationManager.IMPORTANCE_MIN)
      notificationManager.createNotificationChannel(channel)
    } else {
      val channel = NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManager.IMPORTANCE_MIN).build()
      notificationManager.createNotificationChannel(channel)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForeground(1,
        Notification.Builder(this.applicationContext, CHANNEL_ID)
          .setContentTitle("FreeTube is running in the background.")
          .setCategory(Notification.CATEGORY_SERVICE)
          .setSmallIcon(R.drawable.ic_media_notification_icon)
          .build())
    } else {
      startForeground(1,
        Notification.Builder(this.applicationContext)
          .setContentTitle("FreeTube is running in the background.")
          .setCategory(Notification.CATEGORY_SERVICE)
          .build())
    }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    return START_STICKY
  }
  override fun startForegroundService(service: Intent?): ComponentName? {
    return super.startForegroundService(service)
  }
}
