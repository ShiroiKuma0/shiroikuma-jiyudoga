import android from 'android'

/**
 *
 * @param {string} id the result of a js interface async function
 * @returns {Promise<string>}
 */
export function awaitAsyncResult(id) {
  return new Promise((resolve, reject) => {
    const resolveWrapper = () => {
      resolve(android.getSyncMessage(id))
      window.removeEventListener(`${id}-resolve`, resolveWrapper)
      window.removeEventListener(`${id}-reject`, rejectWrapper)
    }
    window.addEventListener(`${id}-resolve`, resolveWrapper)
    const rejectWrapper = () => {
      reject(android.getSyncMessage(id))
      window.removeEventListener(`${id}-resolve`, resolveWrapper)
      window.removeEventListener(`${id}-reject`, rejectWrapper)
    }
    window.addEventListener(`${id}-reject`, rejectWrapper)
  })
}

/**
 * Like `awaitAsyncResult`, but also listens for `${id}-progress` events
 * (emitted by natives that report progress, e.g. `downloadToUri`).
 * @param {string} id the result of a js interface async function
 * @param {(progress: any) => void} [onProgress] receives the parsed progress payload
 * @returns {Promise<string>}
 */
export function awaitAsyncResultWithProgress(id, onProgress) {
  return new Promise((resolve, reject) => {
    const progressWrapper = () => {
      const message = android.getProgress(id)
      if (message !== '' && onProgress) {
        try {
          onProgress(JSON.parse(message))
        } catch { }
      }
    }
    const cleanup = () => {
      window.removeEventListener(`${id}-resolve`, resolveWrapper)
      window.removeEventListener(`${id}-reject`, rejectWrapper)
      window.removeEventListener(`${id}-progress`, progressWrapper)
    }
    const resolveWrapper = () => {
      resolve(android.getSyncMessage(id))
      cleanup()
    }
    const rejectWrapper = () => {
      reject(android.getSyncMessage(id))
      cleanup()
    }
    window.addEventListener(`${id}-resolve`, resolveWrapper)
    window.addEventListener(`${id}-reject`, rejectWrapper)
    window.addEventListener(`${id}-progress`, progressWrapper)
  })
}
