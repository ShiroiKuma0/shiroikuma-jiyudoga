package io.freetubeapp.freetube.backup

/**
 * One selectable part of a backup.
 *
 * @param id      stable id — the `<id>.json` entry name inside the ZIP and the value
 *                accepted in the automation contract's `items` extra
 * @param label   human label shown in the picker and reported by `LIST_CATEGORIES`
 * @param parent  id of the category this one is a sub-option of (null = top level)
 * @param store   nedb datastore the documents come from (null = a parent with no own data)
 * @param defaultSelected whether the item starts TICKED in a picker — this app's answer to
 *                state rather than the picker's to guess (the contract's optional fourth
 *                `LIST_CATEGORIES` field, `on`/`off`). Fifth parameter on purpose: [store]
 *                already holds the fourth position in every existing entry. Everything here
 *                is `on` — nothing this app exports is large, derived AND re-creatable.
 */
data class BackupCategory(
  val id: String,
  val label: String,
  val parent: String?,
  val store: String?,
  val defaultSelected: Boolean = true
)

/**
 * Fork (白い熊 自由動画): the category model of the app's one backup archive.
 *
 * This is the SINGLE source of truth — the Export/Import panel in the UI settings page
 * renders whatever this lists (via the JS interface), and the headless
 * `LIST_CATEGORIES` broadcast reports the same lines. Nothing duplicates it in JS.
 *
 * Every settings key lands in exactly one slice; unknown (e.g. newly synced upstream)
 * keys fall through to `settings.general`, so a backup can never silently drop a setting.
 */
object StateCategories {

  const val SETTINGS_STORE = "settings"

  private const val GENERAL = "settings.general"
  private const val APPEARANCE = "settings.appearance"
  private const val PLAYER = "settings.player"
  private const val SUBSCRIPTIONS = "settings.subscriptions"
  private const val DISTRACTION = "settings.distraction"
  private const val PRIVACY = "settings.privacy"
  private const val SPONSORBLOCK = "settings.sponsorblock"
  private const val EXTERNAL = "settings.external"
  private const val PROXY = "settings.proxy"
  private const val DOWNLOADS = "settings.downloads"

  val ALL: List<BackupCategory> = listOf(
    BackupCategory("settings", "App settings", null, null),
    BackupCategory(GENERAL, "General (locale, region, backend, start page)", "settings", SETTINGS_STORE),
    BackupCategory(APPEARANCE, "Appearance & 白い熊 UI (theme, colours, fonts, grid)", "settings", SETTINGS_STORE),
    BackupCategory(PLAYER, "Player (playback, quality, captions, volume)", "settings", SETTINGS_STORE),
    BackupCategory(SUBSCRIPTIONS, "Subscriptions & feeds", "settings", SETTINGS_STORE),
    BackupCategory(DISTRACTION, "Distraction free (hidden elements)", "settings", SETTINGS_STORE),
    BackupCategory(PRIVACY, "Privacy, history & parental control", "settings", SETTINGS_STORE),
    BackupCategory(SPONSORBLOCK, "SponsorBlock", "settings", SETTINGS_STORE),
    BackupCategory(EXTERNAL, "External player", "settings", SETTINGS_STORE),
    BackupCategory(PROXY, "Proxy", "settings", SETTINGS_STORE),
    BackupCategory(DOWNLOADS, "Screenshots & study export", "settings", SETTINGS_STORE),
    BackupCategory("profiles", "Profiles, subscriptions, starred videos & Similar tuning", null, "profiles"),
    BackupCategory("playlists", "Playlists", null, "playlists"),
    BackupCategory("history", "Watch history", null, "history"),
    BackupCategory("search-history", "Search history", null, "search-history")
  )

  /** Categories that actually carry documents (a parent contributes only through its children). */
  val LEAVES: List<BackupCategory> = ALL.filter { it.store != null }

  fun byId(id: String): BackupCategory? = ALL.firstOrNull { it.id == id }

  fun childrenOf(id: String): List<BackupCategory> = ALL.filter { it.parent == id }

  /**
   * Expands a selection to the leaves it covers: a parent stands for all of its children,
   * a child for exactly itself. Preserves [ALL] order so archives are deterministic.
   */
  fun expand(ids: Collection<String>): List<BackupCategory> {
    val wanted = LinkedHashSet<String>()
    for (id in ids) {
      val category = byId(id) ?: continue
      if (category.store != null) {
        wanted.add(category.id)
      }
      childrenOf(category.id).forEach { wanted.add(it.id) }
    }
    return LEAVES.filter { it.id in wanted }
  }

  fun unknown(ids: Collection<String>): List<String> = ids.filter { byId(it) == null }

  // ---- settings key → slice -------------------------------------------------------------

  /** Keys whose slice the prefix rules below would get wrong. */
  private val EXACT: Map<String, String> = mapOf(
    // subscriptions — the `hide…`/`default…` prefixes would drag these elsewhere
    "defaultProfile" to SUBSCRIPTIONS,
    "fetchSubscriptionsAutomatically" to SUBSCRIPTIONS,
    "hideActiveSubscriptions" to SUBSCRIPTIONS,
    "hideSubscriptionsVideos" to SUBSCRIPTIONS,
    "hideSubscriptionsShorts" to SUBSCRIPTIONS,
    "hideSubscriptionsLive" to SUBSCRIPTIONS,
    "hideSubscriptionsCommunity" to SUBSCRIPTIONS,
    "hideWatchedSubs" to SUBSCRIPTIONS,
    "onlyShowLatestFromChannel" to SUBSCRIPTIONS,
    "onlyShowLatestFromChannelNumber" to SUBSCRIPTIONS,
    "unsubscriptionPopupStatus" to SUBSCRIPTIONS,
    "useRssFeeds" to SUBSCRIPTIONS,
    // appearance
    "baseTheme" to APPEARANCE,
    "mainColor" to APPEARANCE,
    "secColor" to APPEARANCE,
    "barColor" to APPEARANCE,
    "listType" to APPEARANCE,
    "thumbnailPreference" to APPEARANCE,
    "blurThumbnails" to APPEARANCE,
    "expandSideBar" to APPEARANCE,
    "hideLabelsSideBar" to APPEARANCE,
    "disableSmoothScrolling" to APPEARANCE,
    "tapHighlight" to APPEARANCE,
    "uiScale" to APPEARANCE,
    "uiScaleAndroid" to APPEARANCE,
    "useUiScale" to APPEARANCE,
    // player
    "displayVideoPlayButton" to PLAYER,
    "enableSubtitlesByDefault" to PLAYER,
    "enterFullscreenOnDisplayRotate" to PLAYER,
    "maxVideoPlaybackRate" to PLAYER,
    "playNextVideo" to PLAYER,
    "hideChapters" to PLAYER,
    // privacy
    "rememberHistory" to PRIVACY,
    "rememberSearchHistory" to PRIVACY,
    "watchedProgressSavingMode" to PRIVACY,
    "saveVideoHistoryWithLastViewedPlaylist" to PRIVACY,
    "showFamilyFriendlyOnly" to PRIVACY,
    "settingsPassword" to PRIVACY,
    // proxy / sponsorblock / external — the odd ones out of their prefix families
    "useProxy" to PROXY,
    "useSponsorBlock" to SPONSORBLOCK,
    "enableScreenshot" to DOWNLOADS,
    // general — `default…`/`hide…`/`show…` would misfile these
    "defaultInvidiousInstance" to GENERAL,
    "hideToTrayOnMinimize" to GENERAL,
    "showAddedExternalPlayerCustomArgs" to EXTERNAL
  )

  /** Checked in order, after [EXACT] misses. */
  private val PREFIXES: List<Pair<String, String>> = listOf(
    "skui" to APPEARANCE,
    "sponsorBlock" to SPONSORBLOCK,
    "externalPlayer" to EXTERNAL,
    "proxy" to PROXY,
    "screenshot" to DOWNLOADS,
    "study" to DOWNLOADS,
    "autoplay" to PLAYER,
    "video" to PLAYER,
    "default" to PLAYER,
    "hide" to DISTRACTION,
    "show" to DISTRACTION,
    "channelsHidden" to DISTRACTION,
    "forbiddenTitles" to DISTRACTION,
    "disableChannelLinks" to DISTRACTION
  )

  /** The slice a settings key belongs to; anything unrecognised joins General. */
  fun sliceFor(key: String): String {
    EXACT[key]?.let { return it }
    PREFIXES.firstOrNull { key.startsWith(it.first) }?.let { return it.second }
    return GENERAL
  }
}
