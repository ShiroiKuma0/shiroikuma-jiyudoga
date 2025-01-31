package io.freetubeapp.freetube.helpers

import android.content.ContentResolver
import android.net.Uri

fun ContentResolver.readBytes(uri: Uri): ByteArray {
  val stream = openInputStream(uri)
  val content = stream!!.readBytes()
  stream.close()
  return content
}

fun ContentResolver.writeBytes(uri: Uri, bytes: ByteArray, writeMode: WriteMode = WriteMode.Truncate) {
  val mode = if (writeMode == WriteMode.Truncate) {
    "wt"
  } else if (writeMode == WriteMode.Append) {
    "wa"
  } else {
    "w"
  }
  val stream = openOutputStream(uri, mode)
  stream!!.write(bytes)
  stream.flush()
  stream.close()
}
