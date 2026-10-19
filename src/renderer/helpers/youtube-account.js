// The YouTube account used for age-restricted videos, as the renderer sees it.
//
// The imported cookies never reach this side: they stay in the Electron main
// process (src/main/youtubeAccount.js) or in Kotlin (account/YoutubeAccount.kt),
// which send a request as the account when asked. All the renderer gets back is
// the response — and whether YouTube signed the export out on the way.

import android from 'android'
import { awaitAsyncResult } from './android/jsinterface'

/**
 * @typedef {object} YoutubeAccountStatus
 * @property {boolean} present
 * @property {number} importedAt
 * @property {boolean} signedOut YouTube deleted the session in a response: the export needs redoing
 */

/** @returns {Promise<YoutubeAccountStatus>} */
export async function getYoutubeAccountStatus() {
  if (process.env.IS_ELECTRON) {
    return await window.ftElectron.youtubeAccountStatus()
  }

  if (process.env.IS_ANDROID) {
    return JSON.parse(android.youtubeAccountStatus())
  }

  return { present: false, importedAt: 0, signedOut: false }
}

/** @returns {Promise<boolean>} */
export async function hasYoutubeAccount() {
  try {
    return (await getYoutubeAccountStatus()).present
  } catch {
    return false
  }
}

/**
 * Asks for a cookies.txt and stores its YouTube login.
 * @returns {Promise<YoutubeAccountStatus | null>} null when the picker was cancelled
 * @throws {Error} `no-login-cookies` when the file holds no signed-in YouTube session
 */
export async function importYoutubeCookies() {
  if (process.env.IS_ELECTRON) {
    try {
      return await window.ftElectron.youtubeAccountImport()
    } catch (error) {
      // ipcRenderer.invoke prefixes the main-process message
      throw new Error(error.message.includes('no-login-cookies') ? 'no-login-cookies' : error.message, { cause: error })
    }
  }

  if (process.env.IS_ANDROID) {
    let result
    try {
      result = await awaitAsyncResult(android.importYoutubeCookies())
    } catch (message) {
      // the bridge rejects with the bare message
      throw new Error(String(message), { cause: message })
    }
    return result === 'USER_CANCELED' ? null : JSON.parse(result)
  }

  return null
}

export async function forgetYoutubeCookies() {
  if (process.env.IS_ELECTRON) {
    await window.ftElectron.youtubeAccountForget()
  } else if (process.env.IS_ANDROID) {
    android.forgetYoutubeCookies()
  }
}

/**
 * Sends a request to www.youtube.com signed in as the account.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [init]
 * @returns {Promise<{ status: number, contentType: string, body: string, signedOut: boolean }>}
 */
export async function accountFetch(url, init = {}) {
  const request = {
    method: init.method ?? 'GET',
    headers: { ...init.headers },
    body: init.body
  }

  if (process.env.IS_ELECTRON) {
    // main sends its session's user agent
    return await window.ftElectron.youtubeAccountFetch(url, request)
  }

  if (process.env.IS_ANDROID) {
    // Kotlin's HttpURLConnection would otherwise announce itself as Dalvik
    request.headers['User-Agent'] = navigator.userAgent
    return JSON.parse(await awaitAsyncResult(android.youtubeAccountFetch(url, JSON.stringify(request))))
  }

  throw new Error('no-account')
}
