// 白い熊 自由動画: a YouTube account for age-restricted videos.
//
// YouTube only plays an age-restricted video to a signed-in, age-verified account,
// and the app never signs in. What it can do is borrow a session the user exported
// from a browser as a Netscape `cookies.txt` (the format yt-dlp reads). Those
// cookies ARE the login, so they stay here in the main process: the renderer can
// import, inspect and forget them, and ask for a request to www.youtube.com to be
// sent as the account, but it never sees a cookie value.
//
// The account is used for nothing else. Browsing, search and every other video
// stay anonymous; the watch page only comes here after YouTube answered "Sign in
// to confirm your age" (see getLocalVideoInfo in helpers/api/local.js).
//
// Requests go out through their own in-memory session, not the default one: the
// default session's header hooks blank the Cookie header of watch-page requests
// and its jar holds the anonymous CONSENT cookies. `credentials: 'omit'` keeps
// Chromium's own jar out of it, so the Cookie header sent is exactly ours.

import { app, session } from 'electron'
import { createHash } from 'crypto'
import asyncFs from 'fs/promises'
import path from 'path'

const ORIGIN = 'https://www.youtube.com'

// without these YouTube treats the export as signed out; SAPISID also signs the
// Authorization header
const REQUIRED_COOKIES = ['SAPISID', 'SID']

// a Set-Cookie that deletes one of these is YouTube signing the session out
const SESSION_COOKIES = new Set([
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID', 'LOGIN_INFO'
])

/**
 * @typedef {object} AccountState
 * @property {Record<string, string>} cookies
 * @property {number} importedAt
 * @property {boolean} signedOut YouTube deleted the session cookies in a response
 */

/** @type {AccountState | null | undefined} undefined until first read */
let state

/** @type {import('electron').Session | null} */
let accountSession = null

function statePath() {
  return path.join(app.getPath('userData'), 'youtube-account.json')
}

/** @returns {Promise<AccountState | null>} */
async function loadState() {
  if (state !== undefined) { return state }

  try {
    state = JSON.parse(await asyncFs.readFile(statePath(), 'utf8'))
  } catch {
    state = null
  }

  return state
}

/** @param {AccountState | null} next */
async function saveState(next) {
  state = next

  if (next === null) {
    await asyncFs.rm(statePath(), { force: true })
    return
  }

  // written aside and renamed, so a crash never leaves half a login on disk;
  // owner-only, since it is one
  const part = `${statePath()}.part`
  await asyncFs.writeFile(part, JSON.stringify(next), { mode: 0o600 })
  await asyncFs.rename(part, statePath())
}

/**
 * Netscape cookie file → the www.youtube.com cookies, by name. Firefox marks
 * HttpOnly cookies with a `#HttpOnly_` prefix on the domain instead of a column.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseCookiesTxt(text) {
  /** @type {Record<string, string>} */
  const cookies = {}
  const now = Date.now() / 1000

  for (let line of text.split(/\r?\n/)) {
    if (line.startsWith('#HttpOnly_')) {
      line = line.slice('#HttpOnly_'.length)
    } else if (line.startsWith('#') || line.trim() === '') {
      continue
    }

    const fields = line.split('\t')
    if (fields.length < 7) { continue }

    const [domain, , , , expires, name, value] = fields
    const host = domain.replace(/^\./, '')

    if (host !== 'youtube.com' && host !== 'www.youtube.com') { continue }

    const expiry = Number(expires)
    if (expiry > 0 && expiry < now) { continue }

    cookies[name] = value
  }

  return cookies
}

/**
 * @returns {Promise<{ present: boolean, importedAt: number, signedOut: boolean }>}
 */
export async function getAccountStatus() {
  const current = await loadState()

  return {
    present: current !== null,
    importedAt: current?.importedAt ?? 0,
    signedOut: current?.signedOut ?? false
  }
}

/**
 * @param {string} text the contents of a cookies.txt
 * @returns {Promise<{ present: boolean, importedAt: number, signedOut: boolean }>}
 */
export async function importCookies(text) {
  const cookies = parseCookiesTxt(text)

  if (REQUIRED_COOKIES.some((name) => !cookies[name])) {
    throw new Error('no-login-cookies')
  }

  await saveState({ cookies, importedAt: Date.now(), signedOut: false })
  return await getAccountStatus()
}

export async function forgetCookies() {
  await saveState(null)
}

function getAccountSession(userAgent, proxyUrl) {
  if (accountSession === null) {
    accountSession = session.fromPartition('youtube-account', { cache: false })

    accountSession.setPermissionCheckHandler(() => false)
    // eslint-disable-next-line n/no-callback-literal
    accountSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false))

    // net.fetch refuses to set these itself
    accountSession.webRequest.onBeforeSendHeaders({ urls: [`${ORIGIN}/*`] }, ({ requestHeaders, url }, callback) => {
      if (url.startsWith(`${ORIGIN}/youtubei/`)) {
        requestHeaders.Referer = `${ORIGIN}/`
        requestHeaders.Origin = ORIGIN
        requestHeaders['Sec-Fetch-Site'] = 'same-origin'
        requestHeaders['Sec-Fetch-Mode'] = 'same-origin'
      } else {
        requestHeaders['Sec-Fetch-Dest'] = 'document'
        requestHeaders['Sec-Fetch-Mode'] = 'navigate'
        requestHeaders['Sec-Fetch-Site'] = 'none'
        requestHeaders['Sec-Fetch-User'] = '?1'
      }

      // eslint-disable-next-line n/no-callback-literal
      callback({ requestHeaders })
    })
  }

  // the default session's agent, minus anything a header cannot carry
  accountSession.setUserAgent(userAgent.split(' ').filter((part) => /^[\x20-\x7e]*$/.test(part)).join(' '))
  accountSession.setProxy(proxyUrl ? { proxyRules: proxyUrl } : { mode: 'direct' })

  return accountSession
}

/**
 * The SAPISIDHASH family: SHA-1 over "<seconds> <cookie> <origin>", one entry per
 * API cookie the browser holds — what the YouTube web client sends signed in.
 * @param {Record<string, string>} cookies
 */
function authorizationHeader(cookies) {
  const seconds = Math.floor(Date.now() / 1000)
  const schemes = [
    ['SAPISIDHASH', cookies.SAPISID],
    ['SAPISID1PHASH', cookies['__Secure-1PAPISID']],
    ['SAPISID3PHASH', cookies['__Secure-3PAPISID']]
  ]

  return schemes
    .filter(([, value]) => value)
    .map(([scheme, value]) => {
      const hash = createHash('sha1').update(`${seconds} ${value} ${ORIGIN}`).digest('hex')
      return `${scheme} ${seconds}_${hash}`
    })
    .join(' ')
}

/**
 * Splits a combined Set-Cookie header. Commas also occur inside Expires dates,
 * so only a comma followed by a new `name=` starts another cookie.
 * @param {string | null} header
 */
function splitSetCookie(header) {
  return header ? header.split(/,(?=\s*[^;,=\s]+=)/) : []
}

/**
 * Keeps the stored session current: YouTube refreshes some cookies in its
 * responses, and a deleted session cookie means it signed the export out.
 * @param {string | null} header
 */
async function applySetCookie(header) {
  const current = await loadState()
  if (current === null) { return }

  let changed = false

  for (const entry of splitSetCookie(header)) {
    const [pair, ...attributes] = entry.split(';')
    const separator = pair.indexOf('=')
    if (separator < 1) { continue }

    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()

    const expires = attributes.find((attribute) => /^\s*expires=/i.test(attribute))
    const maxAge = attributes.find((attribute) => /^\s*max-age=/i.test(attribute))
    const deleted = value === '' ||
      (maxAge !== undefined && Number(maxAge.split('=')[1]) <= 0) ||
      (expires !== undefined && Date.parse(expires.split('=')[1]) < Date.now())

    if (deleted) {
      if (SESSION_COOKIES.has(name) && !current.signedOut) {
        // the stored cookies are kept: they are useless now, but forgetting them
        // is the user's call, and the status line tells them to re-export
        current.signedOut = true
        changed = true
      }
    } else if (current.cookies[name] !== value && !current.signedOut) {
      current.cookies[name] = value
      changed = true
    }
  }

  if (changed) {
    await saveState(current)
  }
}

/**
 * Sends one request to www.youtube.com as the account.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} init
 * @param {string} userAgent
 * @param {string | undefined} proxyUrl
 * @returns {Promise<{ status: number, contentType: string, body: string, signedOut: boolean }>}
 */
export async function accountFetch(url, init, userAgent, proxyUrl) {
  const current = await loadState()

  if (current === null) {
    throw new Error('no-account')
  }

  if (!url.startsWith(`${ORIGIN}/`)) {
    throw new Error('Only www.youtube.com is reachable as the account')
  }

  // the session's user agent is the one used; a header must be Latin-1 anyway
  const { 'User-Agent': _, ...requestHeaders } = init.headers ?? {}

  const headers = {
    ...requestHeaders,
    Cookie: Object.entries(current.cookies).map(([name, value]) => `${name}=${value}`).join('; '),
    Authorization: authorizationHeader(current.cookies),
    'X-Origin': ORIGIN,
    'X-Goog-AuthUser': '0',
    'X-Youtube-Bootstrap-Logged-In': 'true'
  }

  const response = await getAccountSession(userAgent, proxyUrl).fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
    credentials: 'omit',
    redirect: 'manual'
  })

  await applySetCookie(response.headers.get('set-cookie'))

  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
    signedOut: state?.signedOut ?? false
  }
}
