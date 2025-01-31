package io.freetubeapp.freetube.helpers

import io.freetubeapp.freetube.javascript.AsyncJSCommunicator
import java.util.UUID.randomUUID
import java.util.concurrent.ThreadPoolExecutor

class Promise<T, G> {
  private val successListeners: MutableList<(T) -> Unit> = mutableListOf()
  private var successResult: T? = null
  private val errorListeners: MutableList<(G) -> Unit> = mutableListOf()
  private var errorResult: G? = null
  private val id = "${randomUUID()}"

  constructor(executor: ThreadPoolExecutor, runnable: ((T) -> Unit, (G) -> Unit) -> Unit) {
    executor.run {
      runnable.invoke({
        result ->
        notifySuccess(result)
      }, {
        result ->
        notifyError(result)
      })
    }
  }

  fun addJsCommunicator(communicator: AsyncJSCommunicator) : String {
    then {
      communicator.resolve(id, "$it")
    }
    catch {
      communicator.reject(id, "$it")
    }
    return id
  }

  fun notifySuccess(result: T) {
    successResult = result
    successListeners.forEach {
      listener ->
      listener.invoke(result)
    }
  }

  fun notifyError(result: G) {
    errorResult = result
    errorListeners.forEach {
      listener ->
      listener.invoke(result)
    }
  }

  fun then(listener: (T) -> Unit): Promise<T, G> {
    if (successResult != null) {
      // assume success result won't be unset
      listener(successResult!!)
    } else {
      successListeners.add(listener)
    }
    return this
  }

  fun catch(listener: (G) -> Unit): Promise<T, G> {
    if (errorResult != null) {
      // assume success result won't be unset
      listener(errorResult!!)
    } else {
      errorListeners.add(listener)
    }
    return this
  }
}
