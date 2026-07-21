<template>
  <div>
    <FtCard class="card">
      <h2>
        <FontAwesomeIcon
          :icon="['fas', 'info-circle']"
          class="headingIcon"
        />
        {{ $t("About.About") }}
      </h2>
      <section class="brand">
        <FtLogoFull class="logo" />
        <div class="version">
          {{ versionNumber }} {{ $t("About.Beta") }}
        </div>
      </section>
      <section class="about-chunks">
        <figure
          v-for="chunk in chunks"
          :key="chunk.title"
          class="chunk"
        >
          <FontAwesomeIcon
            class="icon"
            :icon="chunk.icon"
          />
          <h3 class="title">
            {{ chunk.title }}
          </h3>
          <div
            v-safer-html="chunk.content"
            class="content"
          />
        </figure>
      </section>
    </FtCard>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import FtCard from '../../components/ft-card/ft-card.vue'
import FtLogoFull from '../../components/FtLogoFull/FtLogoFull.vue'
import { vSaferHtml } from '../../directives/vSaferHtml.js'

import packageDetails from '../../../../package.json'

const { t } = useI18n()

const versionNumber = `v${process.env.FORK_VERSION || packageDetails.version}`

const chunks = computed(() => [
  {
    icon: ['fab', 'github'],
    title: t('About.Source code'),
    content: `<a href="https://github.com/ShiroiKuma0/shiroikuma-jiyudoga">GitHub: shiroikuma-jiyudoga</a><br>${t('About.Licensed under the {licenseLink}', { licenseLink: `<a href="https://www.gnu.org/licenses/agpl-3.0.en.html">${t('About.AGPLv3')}</a>` })}.<br/>白い熊 自由動画 — 白い熊's fork of FreeTube with the FreeTubeAndroid layer grafted on, built for GNU/Linux (amd64 .deb) and Android (arm64-v8a APK).`
  },
  {
    icon: ['fas', 'file-download'],
    title: t('About.Downloads / Changelog'),
    content: `<a href="https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases">${t('About.GitHub releases')}</a>`
  },
  {
    icon: ['fas', 'exclamation-circle'],
    title: t('About.Report a problem'),
    content: `<a href="https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/issues">${t('About.GitHub issues')}</a><br>${t('About.Please check for duplicates before posting')}`
  }
])
</script>

<style scoped src="./About.css" />
