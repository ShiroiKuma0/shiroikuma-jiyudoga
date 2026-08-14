import { MAIN_PROFILE_ID } from '../../../constants'
import { DBProfileHandlers } from '../../../datastores/handlers/index'
import { calculateColorLuminance, getRandomColor } from '../../helpers/colors'
import {
  feedFilterIsEmpty,
  feedFilterSignature,
  parseFeedFilter,
  parseFeedFilterPresets,
  resolveFeedChannels
} from '../../helpers/feedFilter'
import {
  SIMILAR_MAX_SEEDS_TO_BLAME,
  SIMILAR_SEED_DEMERIT_LIMIT,
  emptySimilarTuning,
  withSimilarTuningDefaults
} from '../../helpers/profileExtras'
import { extractTerms } from '../../helpers/similarTerms'
import { deepCopy } from '../../helpers/utils'

/**
 * The tunings that apply while browsing: the active profile's own, plus the
 * "All Channels" one, which therefore acts as the global list.
 * @param {object} state
 * @param {object} getters
 */
function effectiveSimilarTunings(state, getters) {
  const activeProfile = getters.getActiveProfile
  const tunings = []

  if (activeProfile?.similarTuning != null) {
    tunings.push(activeProfile.similarTuning)
  }

  // The all channels profile is always the first profile in the array
  const mainProfile = state.profileList[0]

  if (mainProfile != null && mainProfile._id !== activeProfile?._id && mainProfile.similarTuning != null) {
    tunings.push(mainProfile.similarTuning)
  }

  return tunings
}

/**
 * Applies `mutate` to the active profile's tuning and persists the profile. Writes
 * always go to the active profile — the same rule as starring — so a topic profile
 * learns for itself, while what is taught in "All Channels" applies everywhere.
 * @param {{ dispatch: Function, getters: object }} context
 * @param {(tuning: object) => void} mutate
 */
async function writeSimilarTuning({ dispatch, getters }, mutate) {
  // deepCopy first: the profile on the store is a reactive proxy and cloning a
  // proxy for the IPC call throws, silently losing the write (see starVideo)
  const profileCopy = deepCopy(getters.getActiveProfile)

  profileCopy.similarTuning = withSimilarTuningDefaults(profileCopy.similarTuning)

  mutate(profileCopy.similarTuning)

  await dispatch('updateProfile', profileCopy)
}

/**
 * Memo for the feed filter resolution, keyed on everything that can change the answer.
 * A refresh rewrites the profiles through `batchUpdateSubscriptionDetails` (fresh names and
 * thumbnails), which would otherwise hand the feed tabs a new channel array every time and
 * re-fire the watcher they reload on. Channel membership is what the feed actually reads,
 * so profile id + subscription count is enough to notice a real change.
 */
let feedResolutionSignature = null
let feedResolution = { channels: [], capByChannelId: new Map() }

/**
 * @param {object} state
 * @param {object} getters
 */
function resolveFeed(state, getters) {
  const filter = getters.getFeedFilter

  const signature = [
    state.activeProfile,
    feedFilterSignature(filter),
    state.profileList.map((profile) => `${profile._id}:${profile.subscriptions.length}`).join(',')
  ].join('|')

  if (signature !== feedResolutionSignature) {
    feedResolutionSignature = signature
    feedResolution = resolveFeedChannels(state.profileList, getters.getActiveProfile, filter)
  }

  return feedResolution
}

const state = {
  profileList: [{
    _id: MAIN_PROFILE_ID,
    name: 'All Channels',
    bgColor: '#000000',
    textColor: '#FFFFFF',
    subscriptions: []
  }],
  activeProfile: MAIN_PROFILE_ID
}

const getters = {
  getProfileList: (state) => {
    return state.profileList
  },

  getActiveProfile: (state) => {
    const activeProfileId = state.activeProfile
    return state.profileList.find((profile) => {
      return profile._id === activeProfileId
    })
  },

  profileById: (state) => (id) => {
    return state.profileList.find(p => p._id === id)
  },

  getSubscribedChannelIdSet: (state) => {
    // The all channels profile is always the first profile in the array
    const mainProfile = state.profileList[0]

    return mainProfile.subscriptions.reduce((set, channel) => set.add(channel.id), new Set())
  },

  getActiveProfileSubscribedChannelIdSet: (_state, getters) => {
    return getters.getActiveProfile.subscriptions.reduce((set, channel) => set.add(channel.id), new Set())
  },

  // The feed filter: a view mask over the profiles, read by the Subscriptions feed tabs
  // only. Everything with write semantics (subscribing, starring, Similar tuning) keeps
  // using the active profile, so where a change lands never depends on the current view.
  getFeedFilter: (_state, getters) => {
    return parseFeedFilter(getters.getSkuiFeedFilter)
  },

  getFeedFilterPresets: (_state, getters) => {
    return parseFeedFilterPresets(getters.getSkuiFeedFilterPresets)
  },

  getFeedFilterActive: (_state, getters) => {
    return !feedFilterIsEmpty(getters.getFeedFilter)
  },

  getFeedResolution: (state, getters) => {
    return resolveFeed(state, getters)
  },

  getFeedSubscriptions: (_state, getters) => {
    return getters.getFeedResolution.channels
  },

  getFeedChannelCaps: (_state, getters) => {
    return getters.getFeedResolution.capByChannelId
  },

  getFeedHideUpcoming: (_state, getters) => {
    return getters.getFeedFilter.hideUpcoming
  },

  // Identity of the view the feed tabs are showing. It changes when a pill is applied or
  // dropped and when the profile is switched, which is exactly when a feed read from the
  // top is a different feed — so the tabs page it from the beginning again.
  getFeedViewKey: (state, getters) => {
    const filter = getters.getFeedFilter

    return `${state.activeProfile}|${feedFilterSignature(filter)}|${filter.hideUpcoming ? 'u' : ''}`
  },

  getActiveProfileStarredVideos: (_state, getters) => {
    return getters.getActiveProfile?.starredVideos ?? []
  },

  getStarredVideoIdSet: (_state, getters) => {
    return getters.getActiveProfileStarredVideos.reduce((set, video) => set.add(video.videoId), new Set())
  },

  // What the Similar tab has been told to stop showing. Edits are always written to
  // the active profile, but "All Channels" is read alongside it, so a block made
  // there applies to every profile.
  getActiveProfileSimilarTuning: (_state, getters) => {
    return withSimilarTuningDefaults(getters.getActiveProfile?.similarTuning)
  },

  getSimilarBlockedChannelIdSet: (state, getters) => {
    const set = new Set()

    for (const tuning of effectiveSimilarTunings(state, getters)) {
      for (const channel of tuning.blockedChannels ?? []) { set.add(channel.id) }
    }

    return set
  },

  getSimilarBlockedVideoIdSet: (state, getters) => {
    const set = new Set()

    for (const tuning of effectiveSimilarTunings(state, getters)) {
      for (const video of tuning.blockedVideos ?? []) { set.add(video.videoId) }
    }

    return set
  },

  getSimilarNegativeTerms: (state, getters) => {
    const weights = new Map()

    for (const tuning of effectiveSimilarTunings(state, getters)) {
      for (const { term, weight } of tuning.negativeTerms ?? []) {
        weights.set(term, (weights.get(term) ?? 0) + weight)
      }
    }

    return Array.from(weights, ([term, weight]) => ({ term, weight }))
  },

  getSimilarBlockedSeedChannelIdSet: (state, getters) => {
    const set = new Set()

    for (const tuning of effectiveSimilarTunings(state, getters)) {
      for (const channel of tuning.seedChannels ?? []) {
        if (channel.blocked || (channel.demerits ?? 0) >= SIMILAR_SEED_DEMERIT_LIMIT) {
          set.add(channel.id)
        }
      }
    }

    return set
  },
}

const collator = new Intl.Collator(undefined, {
  usage: 'sort',
  caseFirst: 'upper',
  sensitivity: 'case',
  numeric: true
})

function profileSort(a, b) {
  if (a._id === MAIN_PROFILE_ID) return -1
  if (b._id === MAIN_PROFILE_ID) return 1

  const nameA = a.name.normalize('NFC')
  const nameB = b.name.normalize('NFC')

  return collator.compare(nameA, nameB)
}

const actions = {
  async grabAllProfiles({ rootState, commit, state }, defaultName = null) {
    let profiles
    try {
      profiles = await DBProfileHandlers.find()
    } catch (errMessage) {
      console.error(errMessage)
      return
    }

    if (!Array.isArray(profiles)) return

    if (profiles.length === 0) {
      // Create a default profile and persist it
      const randomColor = getRandomColor().value
      const textColor = calculateColorLuminance(randomColor)
      const defaultProfile = {
        _id: MAIN_PROFILE_ID,
        name: defaultName,
        bgColor: randomColor,
        textColor: textColor,
        subscriptions: []
      }

      try {
        await DBProfileHandlers.create(defaultProfile)
        commit('setProfileList', [defaultProfile])
      } catch (errMessage) {
        console.error(errMessage)
      }

      return
    }

    // We want the primary profile to always be first
    // So sort with that then sort alphabetically by profile name
    profiles = profiles.sort(profileSort)

    if (state.profileList.length < profiles.length) {
      const profile = profiles.find((profile) => {
        return profile._id === rootState.settings.defaultProfile
      })

      if (profile) {
        commit('setActiveProfile', profile._id)
      }
    }

    commit('setProfileList', profiles)
  },

  async batchUpdateSubscriptionDetails({ dispatch, state }, channels) {
    if (channels.length === 0) { return }

    const profileList = state.profileList

    for (const profile of profileList) {
      // Only copied if something has actually changed, in which case this variable will be replaced with the copy.
      let currentProfile = profile
      let profileUpdated = false

      for (const { channelThumbnailUrl, channelName, channelId } of channels) {
        let channel = currentProfile.subscriptions.find((channel) => {
          return channel.id === channelId
        }) ?? null

        if (channel === null) { continue }

        if (channel.name !== channelName && channelName != null) {
          if (!profileUpdated) {
            const index = currentProfile.subscriptions.indexOf(channel)

            currentProfile = deepCopy(currentProfile)
            channel = currentProfile.subscriptions[index]
            profileUpdated = true
          }

          channel.name = channelName
        }

        if (channelThumbnailUrl) {
          const thumbnail = channelThumbnailUrl
            // change thumbnail size if different
            .replace(/=s\d*/, '=s176')
            // If this is an Invidious URL, convert it to a YouTube one
            .replace(/^https?:\/\/[^/]+\/ggpht/, 'https://yt3.googleusercontent.com')

          if (channel.thumbnail !== thumbnail) {
            if (!profileUpdated) {
              const index = currentProfile.subscriptions.indexOf(channel)

              currentProfile = deepCopy(currentProfile)
              channel = currentProfile.subscriptions[index]
              profileUpdated = true
            }

            channel.thumbnail = thumbnail
          }
        }
      }

      if (profileUpdated) {
        await dispatch('updateProfile', currentProfile)
      }
    }
  },

  async updateSubscriptionDetails({ dispatch, state }, { channelThumbnailUrl, channelName, channelId }) {
    const thumbnail = channelThumbnailUrl
      // change thumbnail size if different
      ?.replace(/=s\d*/, '=s176')
      // If this is an Invidious URL, convert it to a YouTube one
      .replace(/^https?:\/\/[^/]+\/ggpht/, 'https://yt3.googleusercontent.com') ??
      null
    const profileList = state.profileList

    for (const profile of profileList) {
      const index = profile.subscriptions.findIndex((channel) => {
        return channel.id === channelId
      })

      if (index === -1) { continue }

      // Only copied when something has actually changed
      let currentProfileCopy

      if (channelName != null && profile.subscriptions[index].name !== channelName) {
        if (currentProfileCopy === undefined) {
          currentProfileCopy = deepCopy(profile)
        }

        currentProfileCopy.subscriptions[index].name = channelName
      }

      if (thumbnail != null && profile.subscriptions[index].thumbnail !== thumbnail) {
        if (currentProfileCopy === undefined) {
          currentProfileCopy = deepCopy(profile)
        }

        currentProfileCopy.subscriptions[index].thumbnail = thumbnail
      }

      if (currentProfileCopy !== undefined) {
        await dispatch('updateProfile', currentProfileCopy)
      } else { // channel has not been updated, stop iterating through profiles
        break
      }
    }
  },

  async createProfile({ commit }, profile) {
    try {
      const newProfile = await DBProfileHandlers.create(profile)
      commit('addProfileToList', newProfile)
    } catch (errMessage) {
      console.error(errMessage)
    }
  },

  async updateProfile({ commit }, profile) {
    try {
      await DBProfileHandlers.upsert(profile)
      commit('upsertProfileToList', profile)
    } catch (errMessage) {
      console.error(errMessage)
    }
  },

  async addChannelToProfiles({ commit }, { channel, profileIds }) {
    // If this is an Invidious URL, convert it to a YouTube one
    if (!channel.thumbnail.startsWith('https://yt3.googleusercontent.com/')) {
      channel.thumbnail = channel.thumbnail.replace(/^https?:\/\/[^/]+\/ggpht/, 'https://yt3.googleusercontent.com')
    }

    // 白い熊 自由動画: stamped here rather than in the datastore handler so the store's
    // own copy carries it too — `updateProfile` writes the whole profile document back
    // from memory, and an unstamped copy would erase the stamp on the next star or
    // thumbnail refresh. The sync merge weighs this against `subscriptionsRemoved.at`.
    channel.addedAt = Date.now()

    try {
      await DBProfileHandlers.addChannelToProfiles(channel, profileIds)
      commit('addChannelToProfiles', { channel, profileIds })
    } catch (errMessage) {
      console.error(errMessage)
    }
  },

  async removeChannelFromProfiles({ commit }, { channelId, profileIds }) {
    // 白い熊 自由動画: one stamp for the datastore's tombstone and the store copy alike
    const removedAt = Date.now()

    try {
      await DBProfileHandlers.removeChannelFromProfiles(channelId, profileIds, removedAt)
      commit('removeChannelFromProfiles', { channelId, profileIds, removedAt })
    } catch (errMessage) {
      console.error(errMessage)
    }
  },

  async removeProfile({ commit }, profileId) {
    try {
      await DBProfileHandlers.delete(profileId)
      commit('removeProfileFromList', profileId)
    } catch (errMessage) {
      console.error(errMessage)
    }
  },

  updateActiveProfile({ commit }, id) {
    commit('setActiveProfile', id)
  },

  // Mirrors the subscription semantics: starring adds the video to the active
  // profile and to the "All Channels" profile, unstarring removes it from the
  // active profile only, unless the active profile is "All Channels", in which
  // case it is removed everywhere.
  async starVideo({ dispatch, state }, videoData) {
    // Everything that ends up on the profile has to survive the structured clone
    // of the IPC call to the main process, so it must be built from the deep copy:
    // the entries on the store's own profiles are reactive proxies, and cloning a
    // proxy throws "An object could not be cloned", which silently loses the write.
    const entry = deepCopy({ ...videoData, timeStarred: Date.now() })

    for (const profile of state.profileList) {
      if (profile._id !== state.activeProfile && profile._id !== MAIN_PROFILE_ID) { continue }

      if ((profile.starredVideos ?? []).some((video) => video.videoId === entry.videoId)) { continue }

      const profileCopy = deepCopy(profile)
      profileCopy.starredVideos = [...(profileCopy.starredVideos ?? []), entry]
      // starring again retires its own tombstone, so the array stays bounded
      profileCopy.starredRemoved = (profileCopy.starredRemoved ?? []).filter((removed) => removed.videoId !== entry.videoId)
      await dispatch('updateProfile', profileCopy)
    }
  },

  async unstarVideo({ dispatch, state }, videoId) {
    const activeProfileIsMain = state.activeProfile === MAIN_PROFILE_ID
    const removedAt = Date.now()

    for (const profile of state.profileList) {
      if (!activeProfileIsMain && profile._id !== state.activeProfile) { continue }

      if (!(profile.starredVideos ?? []).some((video) => video.videoId === videoId)) { continue }

      const profileCopy = deepCopy(profile)
      profileCopy.starredVideos = profileCopy.starredVideos.filter((video) => video.videoId !== videoId)
      // 白い熊 自由動画: the tombstone the sync merge weighs against the entry's
      // `timeStarred` on the other device, so an unstar is not simply undone
      profileCopy.starredRemoved = [
        ...(profileCopy.starredRemoved ?? []).filter((removed) => removed.videoId !== videoId),
        { videoId, at: removedAt }
      ]
      await dispatch('updateProfile', profileCopy)
    }
  },

  async blockSimilarChannel({ dispatch, getters }, { id, name }) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      if (tuning.blockedChannels.some((channel) => channel.id === id)) { return }

      tuning.blockedChannels.push({ id, name, blockedAt: Date.now() })
    })
  },

  async unblockSimilarChannel({ dispatch, getters }, id) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      tuning.blockedChannels = tuning.blockedChannels.filter((channel) => channel.id !== id)
    })
  },

  /**
   * "Less like this": hides the video, learns the terms it was phrased with and
   * blames the seeds that produced it. The terms and seeds it contributed are
   * stored on the entry, so undoing takes back exactly what this rejection added.
   */
  async rejectSimilarVideo({ dispatch, getters }, { video, seedChannels = [] }) {
    const terms = extractTerms(video.title, video.author)

    const blamedSeeds = seedChannels.length > 0 && seedChannels.length <= SIMILAR_MAX_SEEDS_TO_BLAME
      ? seedChannels
      : []

    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      if (tuning.blockedVideos.some((blocked) => blocked.videoId === video.videoId)) { return }

      tuning.blockedVideos.push({
        videoId: video.videoId,
        title: video.title ?? '',
        author: video.author ?? '',
        authorId: video.authorId ?? '',
        blockedAt: Date.now(),
        terms,
        seedChannelIds: blamedSeeds.map((seed) => seed.id)
      })

      for (const term of terms) {
        const existing = tuning.negativeTerms.find((entry) => entry.term === term)

        if (existing) {
          existing.weight++
        } else {
          tuning.negativeTerms.push({ term, weight: 1 })
        }
      }

      for (const seed of blamedSeeds) {
        const existing = tuning.seedChannels.find((entry) => entry.id === seed.id)

        if (existing) {
          existing.demerits = (existing.demerits ?? 0) + 1
        } else {
          tuning.seedChannels.push({ id: seed.id, name: seed.name ?? '', demerits: 1, blocked: false })
        }
      }
    })
  },

  async unrejectSimilarVideo({ dispatch, getters }, videoId) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      const entry = tuning.blockedVideos.find((blocked) => blocked.videoId === videoId)

      if (entry == null) { return }

      tuning.blockedVideos = tuning.blockedVideos.filter((blocked) => blocked.videoId !== videoId)

      for (const term of entry.terms ?? []) {
        const existing = tuning.negativeTerms.find((negative) => negative.term === term)

        if (existing) { existing.weight-- }
      }

      tuning.negativeTerms = tuning.negativeTerms.filter((negative) => negative.weight > 0)

      for (const seedChannelId of entry.seedChannelIds ?? []) {
        const existing = tuning.seedChannels.find((seed) => seed.id === seedChannelId)

        if (existing) { existing.demerits = Math.max(0, (existing.demerits ?? 0) - 1) }
      }

      tuning.seedChannels = tuning.seedChannels.filter((seed) => seed.blocked || seed.demerits > 0)
    })
  },

  async blockSimilarSeedChannel({ dispatch, getters }, { id, name }) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      const existing = tuning.seedChannels.find((seed) => seed.id === id)

      if (existing) {
        existing.blocked = true
      } else {
        tuning.seedChannels.push({ id, name: name ?? '', demerits: 0, blocked: true })
      }
    })
  },

  async clearSimilarSeedChannel({ dispatch, getters }, id) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      tuning.seedChannels = tuning.seedChannels.filter((seed) => seed.id !== id)
    })
  },

  async clearSimilarNegativeTerm({ dispatch, getters }, term) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      tuning.negativeTerms = tuning.negativeTerms.filter((negative) => negative.term !== term)
    })
  },

  async resetSimilarTuning({ dispatch, getters }) {
    await writeSimilarTuning({ dispatch, getters }, (tuning) => {
      Object.assign(tuning, emptySimilarTuning())
    })
  }
}

const mutations = {
  setProfileList(state, profileList) {
    state.profileList = profileList
  },

  setActiveProfile(state, activeProfile) {
    state.activeProfile = activeProfile
  },

  addProfileToList(state, profile) {
    state.profileList.push(profile)
    state.profileList.sort(profileSort)
  },

  upsertProfileToList(state, updatedProfile) {
    const i = state.profileList.findIndex((p) => {
      return p._id === updatedProfile._id
    })

    if (i === -1) {
      state.profileList.push(updatedProfile)
    } else {
      state.profileList.splice(i, 1, updatedProfile)
    }

    state.profileList.sort(profileSort)
  },

  addChannelToProfiles(state, { channel, profileIds }) {
    for (const id of profileIds) {
      state.profileList.find(profile => profile._id === id).subscriptions.push(channel)
    }
  },

  removeChannelFromProfiles(state, { channelId, profileIds, removedAt }) {
    for (const id of profileIds) {
      const profile = state.profileList.find(profile => profile._id === id)

      // use filter instead of splice in case the subscription appears multiple times
      // https://github.com/FreeTubeApp/FreeTube/pull/3468#discussion_r1179290877
      profile.subscriptions = profile.subscriptions.filter(channel => channel.id !== channelId)

      // 白い熊 自由動画: mirror the datastore's tombstone into the store copy, or the
      // next whole-document write from memory would drop it and the unsubscribe would
      // be undone by the other device on the following sync
      profile.subscriptionsRemoved = [
        ...(profile.subscriptionsRemoved ?? []).filter(entry => entry.id !== channelId),
        { id: channelId, at: removedAt }
      ]
    }
  },

  removeProfileFromList(state, profileId) {
    const i = state.profileList.findIndex((profile) => {
      return profile._id === profileId
    })

    state.profileList.splice(i, 1)
  }
}

export default {
  state,
  getters,
  actions,
  mutations
}
