package io.freetubeapp.freetube.diag

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import io.freetubeapp.freetube.R

/** The recording notification's two actions: Mark and Turn all off. Not exported — only our own PendingIntents reach it. */
class DiagReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Diag.init(context)
    when (intent.action) {
      Diag.ACTION_MARK -> {
        val number = Diag.mark(context, "the notification")
        if (number > 0) {
          Toast.makeText(context, context.getString(R.string.diag_marked, number), Toast.LENGTH_SHORT).show()
        }
      }
      Diag.ACTION_ALL_OFF -> Diag.allOff(context)
    }
  }
}
