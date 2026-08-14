import * as db from '../index'

/**
 * Fork (白い熊 自由動画): how long a deletion is remembered.
 *
 * The device-to-device sync (see `renderer/helpers/sync/`) merges two snapshots by
 * taking the newer fact per record, so a *removed* record and one the other device
 * never had look identical — an unsubscribe or a cleared history entry would simply
 * come back on the next sync. Deletions therefore live on as tombstones and are only
 * really dropped once both devices have certainly seen them.
 */
const SYNC_TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000

/**
 * @param {import('@seald-io/nedb')} datastore
 */
function pruneTombstones(datastore) {
  return datastore.removeAsync(
    { _deleted: true, syncUpdatedAt: { $lt: Date.now() - SYNC_TOMBSTONE_TTL } },
    { multi: true }
  )
}

class Settings {
  static async find() {
    const currentLocale = await db.settings.findOneAsync({ _id: 'currentLocale' })

    // In FreeTube 0.21.3 and earlier the locales 'en-GB', 'es-AR' and 'nb-NO' had underscores instead of a hyphens
    // This is a one time migration for users that are using one of those locales
    if (currentLocale?.value.includes('_')) {
      await this.upsert('currentLocale', currentLocale.value.replace('_', '-'))
    }

    // In FreeTube 0.22.0 and earlier the external player arguments were displayed in a text box,
    // with the user manually entering `;` to separate the different arguments.
    // This is a one time migration that converts the old string to a JSON array
    const externalPlayerCustomArgs = await db.settings.findOneAsync({ _id: 'externalPlayerCustomArgs' })

    if (externalPlayerCustomArgs && !externalPlayerCustomArgs.value.startsWith('[')) {
      let newValue = '[]'

      if (externalPlayerCustomArgs.value.length > 0) {
        newValue = JSON.stringify(externalPlayerCustomArgs.value.split(';'))
      }

      await this.upsert('externalPlayerCustomArgs', newValue)
    }

    // In FreeTube 0.23.0, the "Enable Theatre Mode by Default" setting was incoporated as an option
    // of the "Default Viewing Mode" setting. This is a one time migration to preserve users'
    // Theater Mode preference through this change.
    const defaultTheatreMode = await db.settings.findOneAsync({ _id: 'defaultTheatreMode' })

    if (defaultTheatreMode) {
      if (defaultTheatreMode.value) {
        await this.upsert('defaultViewingMode', 'theatre')
      }

      await db.settings.removeAsync({ _id: 'defaultTheatreMode' })
    }

    const saveWatchedProgress = await db.settings.findOneAsync({ _id: 'saveWatchedProgress' })
    const watchedProgressSavingMode = await db.settings.findOneAsync({ _id: 'watchedProgressSavingMode' })
    if (saveWatchedProgress && !watchedProgressSavingMode) {
      if (!saveWatchedProgress.value) {
        await this.upsert('watchedProgressSavingMode', 'never')
      }

      await db.settings.removeAsync({ _id: 'saveWatchedProgress' })
    }

    // In FreeTube 0.24.0, the "Screenshot Mode" setting only had two options that were represented as a toggle named "Ask path"
    // This is a one time migration to preserve users' Screenshot prompt preference through this change.
    const screenshotAskPath = await db.settings.findOneAsync({ _id: 'screenshotAskPath' })

    if (screenshotAskPath) {
      await this.upsert('screenshotMode', screenshotAskPath.value ? 'prompt_folder' : 'default_folder')
      await db.settings.removeAsync({ _id: 'screenshotAskPath' })
    }

    return db.settings.findAsync({ _id: { $ne: 'bounds' } })
  }

  static upsert(_id, value) {
    return db.settings.updateAsync({ _id }, { _id, value }, { upsert: true })
  }

  // ******************** //
  // Unique Electron main process handlers
  static _findAppReadyRelatedSettings() {
    return db.settings.findAsync({
      _id: {
        $in: [
          'disableSmoothScrolling',
          'useProxy',
          'proxyProtocol',
          'proxyHostname',
          'proxyPort',
          'backendFallback',
          'backendPreference',
          'hideToTrayOnMinimize'
        ]
      }
    })
  }

  static _findOne(_id) {
    return db.settings.findOneAsync({ _id })
  }

  static _findSidenavSettings() {
    return {
      hideTrendingVideos: db.settings.findOneAsync({ _id: 'hideTrendingVideos' }),
      hidePopularVideos: db.settings.findOneAsync({ _id: 'hidePopularVideos' }),
      hidePlaylists: db.settings.findOneAsync({ _id: 'hidePlaylists' }),
    }
  }

  static _updateBounds(value) {
    return db.settings.updateAsync({ _id: 'bounds' }, { _id: 'bounds', value }, { upsert: true })
  }
  // ******************** //
}

class History {
  static async find() {
    await pruneTombstones(db.history)

    return db.history.findAsync({ _deleted: { $ne: true } }).sort({ timeWatched: -1 })
  }

  /**
   * Fork (白い熊 自由動画): everything, tombstones included. Only the sync snapshot
   * wants this — `find` deliberately hides the tombstones from the rest of the app.
   */
  static findForSync() {
    return db.history.findAsync({})
  }

  static upsert(record) {
    return db.history.updateAsync(
      { videoId: record.videoId },
      // a full document replace, so a tombstone for a re-watched video is simply gone
      { ...record, syncUpdatedAt: Date.now() },
      { upsert: true }
    )
  }

  static async overwrite(records) {
    await db.history.removeAsync({}, { multi: true })

    const now = Date.now()

    // a stamp the records already carry wins: an import brings the far side's own
    // modification times, and those are what the merge has to compare against
    await db.history.insertAsync(records.map((record) => ({ syncUpdatedAt: now, ...record })))
  }

  static updateWatchProgress(videoId, watchProgress) {
    return db.history.updateAsync({ videoId }, { $set: { watchProgress, syncUpdatedAt: Date.now() } }, { upsert: true })
  }

  static updateLastViewedPlaylist(videoId, lastViewedPlaylistId, lastViewedPlaylistType, lastViewedPlaylistItemId) {
    return db.history.updateAsync({ videoId }, { $set: { lastViewedPlaylistId, lastViewedPlaylistType, lastViewedPlaylistItemId, syncUpdatedAt: Date.now() } }, { upsert: true })
  }

  static delete(videoId) {
    // replaces the document rather than removing it, leaving a bare tombstone
    return db.history.updateAsync(
      { videoId },
      { videoId, _deleted: true, syncUpdatedAt: Date.now() },
      { upsert: true }
    )
  }

  static async deleteAll() {
    const records = await db.history.findAsync({ _deleted: { $ne: true } })
    const now = Date.now()

    await db.history.removeAsync({}, { multi: true })

    if (records.length > 0) {
      await db.history.insertAsync(records.map(({ videoId }) => ({ videoId, _deleted: true, syncUpdatedAt: now })))
    }
  }
}

class Profiles {
  static create(profile) {
    return db.profiles.insertAsync(profile)
  }

  static find() {
    return db.profiles.findAsync({})
  }

  static upsert(profile) {
    return db.profiles.updateAsync({ _id: profile._id }, profile, { upsert: true })
  }

  static addChannelToProfiles(channel, profileIds) {
    if (profileIds.length === 1) {
      return db.profiles.updateAsync(
        { _id: profileIds[0] },
        { $push: { subscriptions: channel } }
      )
    } else {
      return db.profiles.updateAsync(
        { _id: { $in: profileIds } },
        { $push: { subscriptions: channel } },
        { multi: true }
      )
    }
  }

  static removeChannelFromProfiles(channelId, profileIds, removedAt = Date.now()) {
    // Fork (白い熊 自由動画): the `$push` is the tombstone that makes an unsubscribe
    // survive a sync — without it the other device's snapshot just hands the channel
    // back. `$push` creates the array when the profile has never had one. The caller
    // supplies the stamp so the store's copy and this one cannot disagree.
    const modifier = {
      $pull: { subscriptions: { id: channelId } },
      $push: { subscriptionsRemoved: { id: channelId, at: removedAt } }
    }

    if (profileIds.length === 1) {
      return db.profiles.updateAsync(
        { _id: profileIds[0] },
        modifier
      )
    } else {
      return db.profiles.updateAsync(
        { _id: { $in: profileIds } },
        modifier,
        { multi: true }
      )
    }
  }

  static delete(id) {
    return db.profiles.removeAsync({ _id: id })
  }
}

class Playlists {
  static create(playlists) {
    return db.playlists.insertAsync(playlists)
  }

  static find() {
    return db.playlists.findAsync({})
  }

  static upsert(playlist) {
    return db.playlists.updateAsync({ _id: playlist._id }, { $set: playlist }, { upsert: true })
  }

  static upsertVideoByPlaylistId(_id, lastUpdatedAt, videoData) {
    return db.playlists.updateAsync(
      { _id },
      {
        $push: { videos: videoData },
        $set: { lastUpdatedAt }
      },
      { upsert: true }
    )
  }

  static upsertVideosByPlaylistId(_id, lastUpdatedAt, videos) {
    return db.playlists.updateAsync(
      { _id },
      {
        $push: { videos: { $each: videos } },
        $set: { lastUpdatedAt }
      },
      { upsert: true }
    )
  }

  static delete(_id) {
    return db.playlists.removeAsync({ _id, protected: { $ne: true } })
  }

  static deleteVideoIdByPlaylistId(_id, lastUpdatedAt, videoId, playlistItemId) {
    if (playlistItemId != null) {
      return db.playlists.updateAsync(
        { _id },
        {
          $pull: { videos: { playlistItemId } },
          $set: { lastUpdatedAt }
        },
        { upsert: true }
      )
    } else if (videoId != null) {
      return db.playlists.updateAsync(
        { _id },
        {
          $pull: { videos: { videoId } },
          $set: { lastUpdatedAt }
        },
        { upsert: true }
      )
    } else {
      throw new Error(`Both videoId & playlistItemId are absent, _id: ${_id}`)
    }
  }

  static deleteVideoIdsByPlaylistId(_id, lastUpdatedAt, playlistItemIds) {
    return db.playlists.updateAsync(
      { _id },
      {
        $pull: { videos: { playlistItemId: { $in: playlistItemIds } } },
        $set: { lastUpdatedAt }
      },
      { upsert: true }
    )
  }

  static deleteAllVideosByPlaylistId(_id) {
    return db.playlists.updateAsync(
      { _id },
      { $set: { videos: [] } },
      { upsert: true }
    )
  }

  static deleteMultiple(ids) {
    return db.playlists.removeAsync({ _id: { $in: ids }, protected: { $ne: true } })
  }

  static deleteAll() {
    return db.playlists.removeAsync({}, { multi: true })
  }
}

class SearchHistory {
  static find() {
    return db.searchHistory.findAsync({}).sort({ lastUpdatedAt: -1 })
  }

  static upsert(searchHistoryEntry) {
    return db.searchHistory.updateAsync({ _id: searchHistoryEntry._id }, searchHistoryEntry, { upsert: true })
  }

  static async overwrite(records) {
    await db.searchHistory.removeAsync({}, { multi: true })

    await db.searchHistory.insertAsync(records)
  }

  static delete(_id) {
    return db.searchHistory.removeAsync({ _id: _id })
  }

  static deleteAll() {
    return db.searchHistory.removeAsync({}, { multi: true })
  }
}

class SubscriptionCache {
  static find() {
    return db.subscriptionCache.findAsync({})
  }

  static updateVideosByChannelId(channelId, entries, timestamp) {
    return db.subscriptionCache.updateAsync(
      { _id: channelId },
      { $set: { videos: entries, videosTimestamp: timestamp } },
      { upsert: true }
    )
  }

  static updateLiveStreamsByChannelId(channelId, entries, timestamp) {
    return db.subscriptionCache.updateAsync(
      { _id: channelId },
      { $set: { liveStreams: entries, liveStreamsTimestamp: timestamp } },
      { upsert: true }
    )
  }

  static updateShortsByChannelId(channelId, entries, timestamp) {
    return db.subscriptionCache.updateAsync(
      { _id: channelId },
      { $set: { shorts: entries, shortsTimestamp: timestamp } },
      { upsert: true }
    )
  }

  static async updateShortsWithChannelPageShortsByChannelId(channelId, entries) {
    const doc = await db.subscriptionCache.findOneAsync({ _id: channelId }, { shorts: 1 })

    if (!Array.isArray(doc?.shorts)) {
      return
    }

    let hasUpdates = false

    doc.shorts.forEach(cachedVideo => {
      const channelVideo = entries.find(short => cachedVideo.videoId === short.videoId)
      if (!channelVideo) { return }

      hasUpdates = true

      // authorId probably never changes, so we don't need to update that
      cachedVideo.title = channelVideo.title
      cachedVideo.author = channelVideo.author

      // as the channel shorts page only has compact view counts for numbers above 1000 e.g. 12k
      // and the RSS feeds include an exact value, we only want to overwrite it when the number is larger than the cached value
      // 12345 vs 12000 => 12345
      // 12345 vs 15000 => 15000
      if (channelVideo.viewCount > cachedVideo.viewCount) {
        cachedVideo.viewCount = channelVideo.viewCount
      }
    })

    if (hasUpdates) {
      await db.subscriptionCache.updateAsync(
        { _id: channelId },
        { $set: { shorts: doc.shorts } }
      )
    }
  }

  static updateCommunityPostsByChannelId(channelId, entries, timestamp) {
    return db.subscriptionCache.updateAsync(
      { _id: channelId },
      { $set: { communityPosts: entries, communityPostsTimestamp: timestamp } },
      { upsert: true }
    )
  }

  static deleteMultipleChannels(channelIds) {
    return db.subscriptionCache.removeAsync({ _id: { $in: channelIds } }, { multi: true })
  }

  static deleteAll() {
    return db.subscriptionCache.removeAsync({}, { multi: true })
  }
}

function loadDatastores() {
  return Promise.allSettled([
    db.settings.loadDatabaseAsync(),
    db.history.loadDatabaseAsync(),
    db.profiles.loadDatabaseAsync(),
    db.playlists.loadDatabaseAsync(),
    db.searchHistory.loadDatabaseAsync(),
    db.subscriptionCache.loadDatabaseAsync(),
  ])
}

function compactAllDatastores() {
  return Promise.allSettled([
    db.settings.compactDatafileAsync(),
    db.history.compactDatafileAsync(),
    db.profiles.compactDatafileAsync(),
    db.playlists.compactDatafileAsync(),
    db.searchHistory.compactDatafileAsync(),
    db.subscriptionCache.compactDatafileAsync(),
  ])
}

export {
  Settings as settings,
  History as history,
  Profiles as profiles,
  Playlists as playlists,
  SearchHistory as searchHistory,
  SubscriptionCache as subscriptionCache,

  loadDatastores,
  compactAllDatastores,
}
