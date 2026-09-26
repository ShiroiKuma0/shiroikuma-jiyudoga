/**
 * 白い熊 自由動画 — tabs.
 *
 * Holding several videos at once used to mean several OS windows on the desktop, and was simply
 * impossible on the phone. A tab here is a *place in the app* — a feed, a channel, a search, a
 * watch page — which is exactly what a second window gave, so tabs replace the need for one.
 *
 * Three things are worth knowing before changing any of this.
 *
 * **Only the active tab is alive.** A background tab is a remembered route and scroll position,
 * nothing more. That is not a shortcut: a live watch page owns a Shaka player, a comment
 * section, the media session, the Android media notification and a pile of document-level
 * listeners, all of which assume they are the only one. Keeping N of them would mean guarding
 * every one of those singletons and buffering N videos in a WebView that gets killed for less.
 * Switching back re-opens the page, which resumes from the watch progress the app already
 * stores — so switching tabs and restarting the app behave identically, and the persistence
 * below is honest rather than approximate.
 *
 * **There are no per-tab history stacks — the one history is read per tab instead.** A tab
 * switch is a normal `router.push` carrying the tab's id in the history entry's state, and
 * every entry is additionally tied, by its Navigation API key, to the tab it belongs to.
 * Back and forward then mean "the nearest entry THIS tab left behind", and the window's own
 * gestures — the arrows, Alt+Left, the phone's hardware back — are caught before they move and
 * sent the same way. So a tab remembers where it has been without a second history
 * implementation to keep in step with the first, and a tab that has been nowhere (one just
 * opened beside another) has a back arrow that is simply disabled rather than a doorway into
 * whatever tab was open before it. See the "where back goes" section below.
 *
 * **Only one window owns the list.** `skuiTabs` is an ordinary setting, so a write is broadcast
 * to every other window through SYNC_SETTINGS; nothing reads that value after boot, and a
 * satellite window (opened by "Open in a New Window") is marked as not owning the list, so it
 * keeps its single tab to itself instead of overwriting the strip it was opened from.
 */

import { reactive, watch } from 'vue'

import router from '../router/index'
import store from '../store/index'
import { routeNamesItself, translateWindowTitle } from './strings'
import { debounce } from './utils'

/** A restored file this long is a runaway, not a session. */
const MAX_RESTORED_TABS = 50

const PERSIST_DEBOUNCE_MS = 500
const SCROLL_DEBOUNCE_MS = 400

/**
 * @typedef {object} SkuiTab
 * @property {string} id
 * @property {string} path in-app route path
 * @property {{[key: string]: string}} query in-app route query
 * @property {string} title what the strip shows
 * @property {number} scrollY where the page was left
 */

export const tabsState = reactive({
  /** @type {SkuiTab[]} */
  tabs: [],
  /** @type {string} */
  activeId: '',
  /** hydrated from the setting; nothing below does anything until this is true */
  ready: false,
  /** whether this window is the one that persists the list */
  owns: false,
  /** whether the active tab has anywhere of its own to go back to... */
  canBack: false,
  /** ...or forward to; both drive the top bar's arrows */
  canForward: false
})

/** @returns {SkuiTab|undefined} */
export function activeTab() {
  return tabsState.tabs.find(tab => tab.id === tabsState.activeId)
}

function newTabId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {{ path: string, query?: object, title?: string, scrollY?: number }} options
 * @returns {SkuiTab}
 */
function makeTab({ path, query = {}, title = '', scrollY = 0 }) {
  return { id: newTabId(), path, query: normaliseQuery(query), title, scrollY }
}

/**
 * Route queries can hold arrays and nulls; the strip and the router only ever need strings.
 * @param {object} query
 * @returns {{[key: string]: string}}
 */
function normaliseQuery(query) {
  const normalised = {}

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null) { normalised[key] = String(value) }
  }

  return normalised
}

/**
 * @param {object} a
 * @param {object} b
 */
function sameQuery(a, b) {
  const aKeys = Object.keys(a ?? {})
  const bKeys = Object.keys(b ?? {})

  return aKeys.length === bKeys.length && aKeys.every(key => String(a[key]) === String(b[key]))
}

const persist = debounce(() => {
  if (!tabsState.owns) { return }

  store.dispatch('updateSkuiTabs', JSON.stringify({
    activeId: tabsState.activeId,
    tabs: tabsState.tabs
  }))
}, PERSIST_DEBOUNCE_MS)

/**
 * @param {unknown} raw
 * @returns {SkuiTab|null}
 */
function restoreTab(raw) {
  if (raw === null || typeof raw !== 'object') { return null }

  const { id, path, query, title, scrollY } = raw

  if (typeof path !== 'string' || path.charAt(0) !== '/') { return null }

  return {
    id: typeof id === 'string' && id.length > 0 ? id : newTabId(),
    path,
    query: normaliseQuery(typeof query === 'object' ? query : {}),
    title: typeof title === 'string' ? title : '',
    scrollY: Number.isFinite(scrollY) ? scrollY : 0
  }
}

/**
 * Read the saved session back, and say where the app should open.
 *
 * @param {{ currentPath: string, currentQuery: object, landingPath: string }} options
 * @returns {Promise<SkuiTab>} the tab the app should show
 */
export async function hydrateTabs({ currentPath, currentQuery, landingPath }) {
  let owns = true

  if (process.env.IS_ELECTRON) {
    // a satellite window keeps its single tab to itself
    try {
      owns = await window.ftElectron.isMainWindow()
    } catch {
      owns = false
    }
  }

  tabsState.owns = owns

  /** @type {SkuiTab[]} */
  let restored = []
  let savedActiveId = ''

  if (owns) {
    try {
      const parsed = JSON.parse(store.getters.getSkuiTabs)

      if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.tabs)) {
        restored = parsed.tabs.slice(0, MAX_RESTORED_TABS).map(restoreTab).filter(tab => tab !== null)
        savedActiveId = typeof parsed.activeId === 'string' ? parsed.activeId : ''
      }
    } catch {
      restored = []
    }
  }

  // The app normally boots at '/'. Anything else is a deep link or a satellite window, and
  // that route wins — but the other tabs are still restored around it rather than thrown away.
  const bootedIntoARoute = currentPath !== '/' && currentPath !== ''

  if (bootedIntoARoute) {
    const deepLinked = makeTab({ path: currentPath, query: currentQuery })
    tabsState.tabs = owns ? [...restored, deepLinked] : [deepLinked]
    tabsState.activeId = deepLinked.id
  } else if (restored.length > 0) {
    tabsState.tabs = restored
    tabsState.activeId = restored.some(tab => tab.id === savedActiveId) ? savedActiveId : restored[0].id
  } else {
    tabsState.tabs = [makeTab({ path: landingPath })]
    tabsState.activeId = tabsState.tabs[0].id
  }

  tabsState.ready = true

  return activeTab()
}

/**
 * Where the router should send the page for a tab. The tab's id rides in the history entry so
 * `afterEach` can tell a tab switch from ordinary navigation, and its scroll position rides
 * along so `scrollBehavior` can restore it without this module and the router importing each
 * other.
 *
 * @param {SkuiTab} tab
 */
export function routeForTab(tab) {
  return {
    path: tab.path,
    query: tab.query,
    state: { skuiTab: tab.id, skuiScroll: tab.scrollY }
  }
}

/**
 * How long a tab switch keeps trying to put the page back where it was left. The router's
 * scrollBehavior fires 500ms after the navigation and is often too early: a watch page is still
 * a loader at that point, a few hundred pixels tall, so scrolling to 2000 silently clamps to 0.
 * Waiting for the page to actually grow is the only reliable signal.
 */
const SCROLL_RESTORE_MS = 4000

let restoringScroll = false

/** @type {(() => void)|null} detaches the in-flight restore's listeners */
let stopScrollRestore = null

function rememberScroll() {
  // while a restore is in flight the page is passing through positions that are not where the
  // tab was left; recording those would destroy the position we are trying to reach
  if (restoringScroll) { return }

  const tab = activeTab()

  if (tab) { tab.scrollY = window.scrollY }
}

/**
 * Put the page back where the tab was left, once it is tall enough to hold that position.
 * Gives up the moment 白い熊 scrolls: the gesture, not the restore, is what should win.
 *
 * @param {number} targetY
 */
function restoreScroll(targetY) {
  if (!(targetY > 0)) { return }

  const deadline = Date.now() + SCROLL_RESTORE_MS
  restoringScroll = true

  const stop = () => {
    restoringScroll = false
    stopScrollRestore = null
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
  }

  stopScrollRestore = stop

  // a programmatic scroll raises none of these, so they mean the reader has taken over
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)

  const step = () => {
    if (!restoringScroll) { return }

    if (document.documentElement.scrollHeight - window.innerHeight >= targetY) {
      window.scrollTo(0, targetY)
      stop()
      return
    }

    if (Date.now() > deadline) {
      stop()
      return
    }

    window.requestAnimationFrame(step)
  }

  window.requestAnimationFrame(step)
}

/**
 * The name a route gives itself -- empty for a page named by its CONTENT (a video, a channel, a
 * search), whose name arrives later with the page's data.
 *
 * @param {import('vue-router').RouteLocationNormalized} route
 * @returns {string}
 */
function routeOwnName(route) {
  return routeNamesItself(route.path) ? translateWindowTitle(route.meta?.title) ?? '' : ''
}

/**
 * What the page currently on screen calls itself: its route's own name where it has one, the
 * app title otherwise.
 *
 * @param {import('vue-router').RouteLocationNormalized} route
 * @returns {string}
 */
function nameForRoute(route) {
  const own = routeOwnName(route)
  if (own.length > 0) { return own }

  const title = store.getters.getAppTitle

  return typeof title === 'string' ? title : ''
}

/**
 * A tab with no name of its own -- one opened by the + button or Ctrl+T -- takes the name of the
 * page it is showing.
 *
 * @param {SkuiTab} tab
 */
function adoptAppTitle(tab) {
  const name = nameForRoute(router.currentRoute.value)

  if (name.length > 0) {
    tab.title = name
    persist()
  }
}

/**
 * @param {string} id
 */
export function activateTab(id) {
  if (id === tabsState.activeId) { return }

  const tab = tabsState.tabs.find(candidate => candidate.id === id)
  if (!tab) { return }

  rememberScroll()
  tabsState.activeId = id
  persist()

  const current = router.currentRoute.value

  // The router refuses to navigate to where it already is, so two tabs holding the same page
  // would leave the history entry still naming the one being left. Stamp the entry directly
  // rather than ask for a navigation that cannot happen.
  if (current.path === tab.path && sameQuery(tab.query, current.query)) {
    window.history.replaceState(
      { ...window.history.state, skuiTab: tab.id, skuiScroll: tab.scrollY },
      ''
    )

    if (tab.title.length === 0) { adoptAppTitle(tab) }

    // no navigation happened, so `afterEach` will not fire: hand the entry over here instead
    stampCurrentEntry(tab.title.length > 0 ? tab.title : undefined)
    refreshTabHistoryReach()
    return
  }

  router.push(routeForTab(tab))
}

/**
 * Where a tab being opened belongs.
 *
 * At the far right, by default: the strip grows at the end it is read to, and nothing already
 * open moves -- which matters because the tab you are closing, and the ones either side of it,
 * stay exactly where your hand left them. Beside the tab it was opened from is the other half
 * of the setting, and is what every new tab here used to do.
 *
 * @returns {number}
 */
function indexForNewTab() {
  if (store.getters.getSkuiTabsNewTabPosition !== 'next') { return tabsState.tabs.length }

  const activeIndex = tabsState.tabs.findIndex(candidate => candidate.id === tabsState.activeId)

  return activeIndex === -1 ? tabsState.tabs.length : activeIndex + 1
}

/**
 * @param {{ path: string, query?: object, title?: string }} location
 * @param {{ activate?: boolean }} [options]
 * @returns {SkuiTab}
 */
export function openTab(location, { activate = false } = {}) {
  const tab = makeTab(location)

  tabsState.tabs.splice(indexForNewTab(), 0, tab)
  persist()

  if (activate) { activateTab(tab.id) }

  return tab
}

/**
 * Put a tab somewhere else in the strip. The order is the reader's, so it is remembered like
 * everything else about a tab.
 *
 * @param {string} id
 * @param {number} index where it should land; anything outside the strip is pulled back into it
 */
export function moveTab(id, index) {
  const from = tabsState.tabs.findIndex(tab => tab.id === id)
  if (from === -1) { return }

  const to = Math.max(0, Math.min(index, tabsState.tabs.length - 1))
  if (to === from) { return }

  const [tab] = tabsState.tabs.splice(from, 1)
  tabsState.tabs.splice(to, 0, tab)
  persist()
}

/**
 * @param {string} id
 */
export function closeTab(id) {
  const index = tabsState.tabs.findIndex(tab => tab.id === id)
  if (index === -1) { return }

  const wasActive = id === tabsState.activeId
  tabsState.tabs.splice(index, 1)

  // there is always a tab; closing the last one leaves an empty one at the landing page
  if (tabsState.tabs.length === 0) {
    const fresh = makeTab({ path: '/' + store.getters.getLandingPage })
    tabsState.tabs.push(fresh)
    tabsState.activeId = ''
    persist()
    activateTab(fresh.id)
    return
  }

  persist()

  if (wasActive) {
    const neighbour = tabsState.tabs[Math.min(index, tabsState.tabs.length - 1)]
    tabsState.activeId = ''
    activateTab(neighbour.id)
  }
}

export function closeActiveTab() {
  if (tabsState.activeId) { closeTab(tabsState.activeId) }
}

/**
 * @param {number} offset -1 for the previous tab, 1 for the next; wraps around
 */
export function cycleTab(offset) {
  if (tabsState.tabs.length < 2) { return }

  const index = tabsState.tabs.findIndex(tab => tab.id === tabsState.activeId)
  const next = (index + offset + tabsState.tabs.length) % tabsState.tabs.length

  activateTab(tabsState.tabs[next].id)
}

export function openLandingTab() {
  openTab({ path: '/' + store.getters.getLandingPage }, { activate: true })
}

/*
 * ---------------------------------------------------------------------------------------------
 * Where "back" goes.
 *
 * There is one history — the window's — and every tab's pages are in it, interleaved in the
 * order they were actually visited. Walking it straight is what tabs make wrong: the entry
 * behind a video you opened in a new tab is not that tab's previous page, it is whatever the
 * tab you opened it FROM was showing, so back used to jump to another tab (白い熊, 2026-09-20).
 *
 * So each entry is stamped with the tab it belongs to, and back and forward mean "the nearest
 * entry this tab left behind" — reached in ONE traversal, over any other tab's entries lying
 * between, which are never rendered on the way. A tab that has been nowhere has nothing behind
 * it and its arrow is disabled; it never becomes a doorway into the tab it was opened beside.
 *
 * All of it rests on the Navigation API, because `history` alone cannot say ANYTHING about an
 * entry the app is not standing on: `navigation.entries()` hands over the whole list with an
 * identifier per entry, and a traversal names the entry it is about to land on before it lands.
 * Firefox and Safari have none of it; in a browser build without the API everything here stands
 * down and the arrows behave as they always did (the desktop app and the phone's WebView are
 * both Chromium, so both have it).
 *
 * One listener covers every gesture the window itself can make — the top bar's arrows go
 * through `goBackInTab` directly, but Alt+Left, the phone's hardware back button and anything
 * else the platform wires to history all arrive as a cancelable `traverse`, before the history
 * moves, and are redirected there too.
 * ---------------------------------------------------------------------------------------------
 */

/** @type {Navigation|undefined} */
const navigationApi = window.navigation

/** Whether this build can scope back and forward to a tab at all. */
export const hasTabHistory = navigationApi != null

/** How many of the tab's own pages the arrows' dropdown lists. */
const TAB_HISTORY_MENU_LIMIT = 15

/** set while the traversal in flight is one WE asked for, which needs no second opinion */
let traversing = false

/**
 * Which tab each history entry belongs to, and what its page is called, kept against the
 * entry's `key` — the identifier of its SLOT in the history, which survives every rewrite of
 * that slot.
 *
 * The obvious home for this is the entry's own Navigation API state, and that was the first
 * attempt. It does not survive: vue-router calls `history.replaceState` on the page it is
 * LEAVING (to record its scroll position) before pushing the new one, and a classic replace
 * wipes the navigation state of the slot it rewrites. Every page therefore lost its stamp the
 * moment it was left — the exact entries back has to recognise — and back sailed past them all
 * to the last one the app had never navigated away from. The key stays put through all of it.
 *
 * @type {Map<string, { tab: string, label: string }>}
 */
const entryOwners = new Map()

/** Past this the map is holding keys for entries the window has long since dropped. */
const MAX_REMEMBERED_ENTRIES = 100

/**
 * @param {string} key
 * @returns {string} the id of the tab the entry belongs to, empty for one we never stamped
 */
function tabOfEntry(key) {
  return entryOwners.get(key)?.tab ?? ''
}

/**
 * Stamp the entry the app is standing on with the tab it belongs to, and with what the page is
 * called — the arrows' dropdown lists the tab's own pages by name, and an entry's name is only
 * knowable while it is the one on screen.
 *
 * @param {string} [label]
 */
function stampCurrentEntry(label) {
  if (!hasTabHistory || tabsState.activeId === '') { return }

  const current = navigationApi.currentEntry
  if (!current) { return }

  entryOwners.set(current.key, {
    tab: tabsState.activeId,
    label: label ?? entryOwners.get(current.key)?.label ?? ''
  })

  if (entryOwners.size > MAX_REMEMBERED_ENTRIES) {
    const alive = new Set(navigationApi.entries().map(entry => entry.key))

    for (const key of entryOwners.keys()) {
      if (!alive.has(key)) { entryOwners.delete(key) }
    }
  }
}

/**
 * The nearest entry that way belonging to the active tab.
 *
 * @param {-1|1} direction
 * @returns {NavigationHistoryEntry|null}
 */
function neighbourInTab(direction) {
  if (!hasTabHistory) { return null }

  const entries = navigationApi.entries()
  const here = navigationApi.currentEntry?.index ?? -1

  if (here < 0) { return null }

  for (let index = here + direction; index >= 0 && index < entries.length; index += direction) {
    if (tabOfEntry(entries[index].key) === tabsState.activeId) { return entries[index] }
  }

  return null
}

/**
 * @param {NavigationHistoryEntry} entry
 * @returns {boolean} whether the traversal was actually started
 */
function traverseToEntry(entry) {
  let traversal

  traversing = true

  try {
    traversal = navigationApi.traverseTo(entry.key)
  } catch {
    // the entry went away between reading the list and asking for it
    traversing = false
    return false
  }

  const done = () => { traversing = false }

  traversal.committed.then(done, done)

  // a traversal can be superseded by a later one; there is nothing here to do about that, but
  // the rejection has to be taken or it surfaces as an unhandled one
  traversal.finished.catch(() => {})

  return true
}

/**
 * A back gesture out of a fullscreen video means "leave fullscreen", and nothing else — it is
 * the only way out that does not need the controls the video is covering.
 *
 * @returns {boolean} whether that is what just happened
 */
function leaveFullscreen() {
  if (document.fullscreenElement == null) { return false }

  document.exitFullscreen().catch(() => {})

  return true
}

function refreshTabHistoryReach() {
  tabsState.canBack = neighbourInTab(-1) !== null
  tabsState.canForward = neighbourInTab(1) !== null
}

/**
 * @returns {boolean} whether the gesture was answered
 */
export function goBackInTab() {
  if (leaveFullscreen()) { return true }

  const previous = neighbourInTab(-1)

  return previous !== null && traverseToEntry(previous)
}

/**
 * @returns {boolean} whether the gesture was answered
 */
export function goForwardInTab() {
  const next = neighbourInTab(1)

  return next !== null && traverseToEntry(next)
}

/**
 * Jump straight to one of the tab's own pages, as picked from the arrows' dropdown.
 *
 * @param {string} key
 */
export function goToTabEntry(key) {
  if (!hasTabHistory || key === navigationApi.currentEntry?.key) { return }

  const entry = navigationApi.entries().find(candidate => candidate.key === key)

  if (entry) { traverseToEntry(entry) }
}

/**
 * The active tab's own pages, newest first, for the dropdown behind the arrows. Only this tab's
 * — the list is the thing that used to offer another tab's pages by name.
 *
 * @returns {{ label: string, value: string, active: boolean }[]}
 */
export function tabHistoryOptions() {
  if (!hasTabHistory) { return [] }

  const here = navigationApi.currentEntry?.index ?? -1
  const mine = navigationApi.entries().filter(entry => tabOfEntry(entry.key) === tabsState.activeId)

  // a long-lived tab can outgrow the menu, so keep the window around where it is standing
  const position = mine.findIndex(entry => entry.index === here)
  const start = Math.max(0, Math.min(
    position - (TAB_HISTORY_MENU_LIMIT >> 1),
    mine.length - TAB_HISTORY_MENU_LIMIT
  ))

  return mine
    .slice(start, start + TAB_HISTORY_MENU_LIMIT)
    .reverse()
    .map(entry => ({
      label: entryOwners.get(entry.key)?.label || decodeURIComponent(entry.url.split('#')[1] ?? ''),
      value: entry.key,
      active: entry.index === here
    }))
}

/**
 * Every back and forward the window itself can make arrives here as a cancelable traversal,
 * BEFORE the history moves — which is what lets it be sent somewhere else without the wrong
 * page ever being rendered.
 *
 * @param {NavigateEvent} event
 */
function handleTraversal(event) {
  if (event.navigationType !== 'traverse' || traversing || !event.cancelable) { return }

  if (document.fullscreenElement != null) {
    event.preventDefault()
    leaveFullscreen()
    return
  }

  const here = navigationApi.currentEntry?.index ?? -1
  const there = event.destination.index

  // already this tab's own page: exactly where back or forward should land
  if (there < 0 || tabOfEntry(event.destination.key) === tabsState.activeId) { return }

  event.preventDefault()

  const target = neighbourInTab(there < here ? -1 : 1)

  if (target !== null) {
    // Out of the event, and out of the task it is dispatched in: a traversal started from
    // inside the one it is replacing is dropped on the floor — the cancellation has not
    // finished happening yet, so there is nothing yet to traverse from.
    setTimeout(() => traverseToEntry(target), 0)
  } else if (process.env.IS_ANDROID && event.userInitiated && there < here) {
    // the phone's back button at the bottom of this tab's history: leave the app, the way back
    // has always ended, rather than dying in 白い熊's hand
    Android.moveAppToBack()
  }
}

const rememberScrollSoon = debounce(() => {
  rememberScroll()
  persist()
}, SCROLL_DEBOUNCE_MS)

/**
 * True while a navigation is in flight. The title watcher below needs it: leaving a watch page
 * awaits the player's destruction in `beforeRouteLeave`, and the view is still alive and still
 * setting the app title during that wait — long after the strip has moved to the tab being
 * switched to. Without this, the video's title lands on the tab you just switched *to*.
 */
let navigating = false

export function registerTabRouting() {
  router.beforeEach((to, from, next) => {
    navigating = true
    // leaving mid-restore abandons it; the tab keeps the position it was actually left at
    stopScrollRestore?.()
    next()
  })

  router.afterEach((to, from, failure) => {
    navigating = false

    // a refused navigation changed nothing, so there is nothing here to follow
    if (failure || !tabsState.ready) { return }

    const switchedTo = window.history.state?.skuiTab
    let wasTabSwitch = false

    if (typeof switchedTo === 'string' && tabsState.tabs.some(tab => tab.id === switchedTo)) {
      wasTabSwitch = true
      tabsState.activeId = switchedTo
    }

    const tab = activeTab()
    if (!tab) { return }

    if (wasTabSwitch) { restoreScroll(tab.scrollY) }

    // A tab switch lands on the location the tab already held, so anything else is the user
    // navigating inside this tab -- follow it, and start the new page at the top.
    if (tab.path !== to.path || !sameQuery(tab.query, to.query)) {
      tab.path = to.path
      tab.query = normaliseQuery(to.query)
      tab.scrollY = 0
    }

    // A page that names itself is named HERE, from the route it just landed on, rather than
    // waiting for a title to arrive from somewhere.
    const ownName = routeOwnName(to)
    if (ownName.length > 0) { tab.title = ownName }

    // the entry the app now stands on belongs to this tab -- that stamp is the whole of what
    // back and forward read
    stampCurrentEntry(tab.title.length > 0 ? tab.title : undefined)
    refreshTabHistoryReach()

    persist()
  })

  if (hasTabHistory) {
    navigationApi.addEventListener('navigate', handleTraversal)

    // a traversal that went through untouched still moved the tab's reach
    navigationApi.addEventListener('currententrychange', refreshTabHistoryReach)

    // the entry the app booted on gets no `afterEach` of its own when the restored tab is
    // already the route the router resolved
    stampCurrentEntry(activeTab()?.title || undefined)
    refreshTabHistoryReach()
  }

  window.addEventListener('scroll', rememberScrollSoon, { passive: true })

  // the page title the app already maintains is the best name a tab can have, and it arrives
  // late on a watch page, once the video has loaded
  watch(() => store.getters.getAppTitle, (title) => {
    if (navigating) { return }

    // A page that names itself can only ever be called that. Anything else arriving while it is
    // on screen was fetched for a page that has since been left -- switch to a video and back
    // before it loads, and its name landed on the feed you returned to (白い熊, 2026-09-19).
    // The view that sets it late is guarded too (Watch.js `updateTitle`); this is the backstop.
    // It is an equality rather than a blanket refusal because the route's own name is
    // translated, and the locale loads after the first navigation: App.vue commits the name
    // again once it does, and that commit has to be let through.
    const ownName = routeOwnName(router.currentRoute.value)
    if (ownName.length > 0 && title !== ownName) { return }

    const tab = activeTab()

    if (tab && typeof title === 'string' && title.length > 0 && tab.title !== title) {
      tab.title = title
      stampCurrentEntry(title)
      persist()
    }
  })
}
