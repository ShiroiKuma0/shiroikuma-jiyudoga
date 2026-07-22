<template>
  <div>
    <p
      v-if="starredVideos.length === 0"
      class="emptyMessage"
    >
      {{ t('Subscriptions.Empty Starred') }}
    </p>
    <FtElementList
      v-else
      :data="starredVideos"
      :use-channels-hidden-preference="false"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import FtElementList from './FtElementList/FtElementList.vue'

import store from '../store/index'

const { t } = useI18n()

// Most recently starred first
const starredVideos = computed(() => {
  return [...store.getters.getActiveProfileStarredVideos]
    .sort((a, b) => (b.timeStarred ?? 0) - (a.timeStarred ?? 0))
})
</script>

<style scoped>
.emptyMessage {
  text-align: center;
}
</style>
