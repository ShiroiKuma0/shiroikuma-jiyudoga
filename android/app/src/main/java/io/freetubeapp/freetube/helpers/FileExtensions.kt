package io.freetubeapp.freetube.helpers

import java.io.File
import java.io.FileInputStream
import java.nio.charset.Charset

enum class WriteMode {
  Truncate,
  Append
}

fun File.readText(): String {
  return FileInputStream(this).bufferedReader().use { it.readText() }
}

fun File.writeText(content: String, writeMode: WriteMode = WriteMode.Truncate, createIfDoesntExist: Boolean = true) {
  if (!this.exists() && createIfDoesntExist) {
    createNewFile()
  }
  if (writeMode == WriteMode.Truncate) {
    writeText(content, Charset.forName("utf-8"))
  } else {
    appendText(content, Charset.forName("utf-8"))
  }
}
