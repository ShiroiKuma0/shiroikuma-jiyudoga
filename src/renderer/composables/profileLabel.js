import { useI18n } from 'vue-i18n'

import store from '../store/index'

import { MAIN_PROFILE_ID } from '../../constants'

/**
 * Fork (白い熊 自由動画): what a profile is called on screen.
 *
 * Every profile but one carries its own name; "All Channels" is a fixed id whose name is
 * translated instead, which left its bubble showing whatever letter the locale starts with
 * ("A" in English). The `skuiAllChannelsLabel` setting overrides that one name — set to
 * `全`, the bubble reads 全 — and this composable is the single place that applies it, so
 * the bubble, the profile list, the profile settings and the feed filter panel agree.
 */
export function useProfileLabel() {
  const { t } = useI18n()

  /**
   * @param {{ _id: string, name: string }} profile
   */
  function profileDisplayName(profile) {
    if (profile?._id !== MAIN_PROFILE_ID) {
      return profile?.name ?? ''
    }

    return store.getters.getSkuiAllChannelsLabel || t('Profile.All Channels')
  }

  /**
   * For the places that only have the "is this the main profile" flag rather than the profile.
   * @param {boolean} isMainProfile
   * @param {string} profileName
   */
  function displayNameFor(isMainProfile, profileName) {
    return isMainProfile
      ? (store.getters.getSkuiAllChannelsLabel || t('Profile.All Channels'))
      : profileName
  }

  return { profileDisplayName, displayNameFor }
}
