package io.freetubeapp.freetube.helpers

import android.net.Uri

class AmbiguousFileUri {
  private var exception: Exception? = null
  private var contentUriResult: Uri? = null
  private var dataUriResult: String? = null
  constructor(stringUri: String) {
    if (stringUri.startsWith("content://")) {
      try {
        // content uri
        contentUriResult = Uri.parse(stringUri)
      } catch (ex: Exception) {
        exception = ex
      }
    }
    if (stringUri.startsWith("data://")) {
      dataUriResult = stringUri.split("data://")[1]
    }
  }
  fun ifContentUri(func: (Uri) -> Unit): AmbiguousFileUri {
    if (contentUriResult != null && exception == null) {
      func(contentUriResult!!)
    }
    return this
  }
  fun ifDataUri(func: (String) -> Unit): AmbiguousFileUri {
    if (dataUriResult != null && exception == null) {
      func(dataUriResult!!)
    }
    return this
  }
  fun catch(func: (Exception) -> Unit): AmbiguousFileUri {
    if (exception != null) {
      func(exception!!)
    }
    return this
  }
}
