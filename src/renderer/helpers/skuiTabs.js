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
 * **There are no per-tab history stacks.** A tab switch is a normal `router.push` carrying the
 * tab's id in the history entry's state. `afterEach` reads it back: present means the entry was
 * a tab switch, absent means the user navigated inside the tab that was already active. The
 * existing back/forward arrows and the Android hardware back button then walk tab switches and
 * in-tab navigation together, in the order things actually happened, and land on the right tab
 * on the way — with no second navigation implementation to keep in step with the first.
 *
 * **Only one window owns the list.** `skuiTabs` is an ordinary setting, so a write is broadcast
 * to every other window through SYNC_SETTINGS; nothing reads that value after boot, and a
 * satellite window (opened by "Open in a New Window") is marked as not owning the list, so it
 * keeps its single tab to itself instead of overwriting the strip it was opened from.
 */

import { reactive, watch } from 'vue'

import router from '../router/index'
import store from '../store/index'
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
  owns: false
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
 * A tab with no name of its own -- one opened by the + button or Ctrl+T -- takes the page title
 * the app is already showing.
 *
 * @param {SkuiTab} tab
 */
function adoptAppTitle(tab) {
  const title = store.getters.getAppTitle

  if (typeof title === 'string' && title.length > 0) {
    tab.title = title
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
    return
  }

  router.push(routeForTab(tab))
}

/**
 * @param {{ path: string, query?: object, title?: string }} location
 * @param {{ activate?: boolean }} [options]
 * @returns {SkuiTab}
 */
export function openTab(location, { activate = false } = {}) {
  const tab = makeTab(location)
  const activeIndex = tabsState.tabs.findIndex(candidate => candidate.id === tabsState.activeId)

  // a new tab belongs next to the one it was opened from, the way every browser does it
  tabsState.tabs.splice(activeIndex === -1 ? tabsState.tabs.length : activeIndex + 1, 0, tab)
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

    persist()
  })

  window.addEventListener('scroll', rememberScrollSoon, { passive: true })

  // the page title the app already maintains is the best name a tab can have, and it arrives
  // late on a watch page, once the video has loaded
  watch(() => store.getters.getAppTitle, (title) => {
    if (navigating) { return }

    const tab = activeTab()

    if (tab && typeof title === 'string' && title.length > 0 && tab.title !== title) {
      tab.title = title
      persist()
    }
  })
}
