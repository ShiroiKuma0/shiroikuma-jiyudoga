<!-- eslint-disable @intlify/vue-i18n/no-dynamic-keys -->
<template>
  <FtSettingsSection
    :title="$t('SKUI.Title')"
  >
    <div class="skuiPage">
      <!--
        Export / Import comes first, as its own separated section — the sister-app
        convention (白い熊 考直's UI page). The two automation rows belong INSIDE it,
        directly below the export rows, so backup lives in one place in every app.
      -->
      <section
        v-if="IS_ANDROID"
        class="skuiSection"
      >
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Backup.Export / Import') }}
        </h4>
        <button
          class="skuiEntryRow skuiIndent1"
          type="button"
          @click="panelOpen = true"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Export / Import…') }}</span>
            <span
              class="skuiEntrySummary"
              :class="{ skuiWarn: backupDirectoryName === null }"
            >
              {{ backupDirectoryName ?? $t('SKUI.Backup.No backup directory set') }}
            </span>
          </span>
        </button>
        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Automation export') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Backup.Automation export description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="automationEnabled"
            @change="updateAutomationEnabled($event.target.checked)"
          >
        </label>
        <div class="skuiEntryRow skuiIndent1">
          <button
            class="skuiEntryText"
            type="button"
            @click="copyAutomationToken"
          >
            <span class="skuiEntryTitle">{{ $t('SKUI.Backup.Automation token') }}</span>
            <span class="skuiEntrySummary">{{ abbreviatedToken }}</span>
          </button>
          <button
            class="skuiEntryAction"
            type="button"
            @click="regenerateAutomationToken"
          >
            {{ $t('SKUI.Backup.Regenerate') }}
          </button>
        </div>
      </section>

      <!--
        Device sync. Each device publishes ONE file describing its own state and reads
        the other's; the desktop app carries both over ssh. The rows split by platform
        because the phone's part is deliberately tiny — it has a folder and nothing
        else, since it never reaches across and so can never hold the radio awake.
      -->
      <section class="skuiSection">
        <hr
          v-if="IS_ANDROID"
          class="skuiSectionRule"
        >
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Sync.Section') }}
        </h4>
        <p class="skuiEntrySummary skuiIndent1">
          {{ $t('SKUI.Sync.Description') }}
        </p>

        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Enable') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Enable description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="syncEnabled"
            @change="updateSyncEnabled($event.target.checked)"
          >
        </label>

        <div class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Status') }}</span>
            <span
              class="skuiEntrySummary"
              :class="{ skuiWarn: syncStatusIsProblem }"
            >
              {{ syncStatusText }}
            </span>
          </span>
          <button
            class="skuiEntryAction"
            type="button"
            :disabled="syncBusy"
            @click="syncNow"
          >
            {{ syncBusy ? $t('SKUI.Sync.Syncing') : $t('SKUI.Sync.Sync now') }}
          </button>
        </div>

        <!-- the phone: a real path, and the grant that makes it reachable -->
        <template v-if="IS_ANDROID">
          <div
            v-if="!syncStorageGranted"
            class="skuiEntryRow skuiIndent1"
          >
            <span class="skuiEntryText">
              <span class="skuiEntrySummary skuiWarn">{{ $t('SKUI.Sync.No storage access') }}</span>
            </span>
            <button
              class="skuiEntryAction"
              type="button"
              @click="grantSyncStorage"
            >
              {{ $t('SKUI.Sync.Grant access') }}
            </button>
          </div>

          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Sync folder') }}</span>
              <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Sync folder description') }}</span>
            </span>
          </div>
          <input
            class="skuiEntryInput skuiIndent2"
            type="text"
            spellcheck="false"
            :value="syncAndroidDir"
            :aria-label="$t('SKUI.Sync.Sync folder')"
            @change="updateSyncPath('updateSkuiSyncAndroidDir', $event.target.value, '/sdcard/jiyudoga-sync')"
          >
        </template>

        <!-- the PC: it is the courier, so the ssh details live only here -->
        <template v-else>
          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Phone host') }}</span>
              <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Phone host description') }}</span>
            </span>
          </div>
          <input
            class="skuiEntryInput skuiIndent2"
            type="text"
            spellcheck="false"
            :value="syncHost"
            :aria-label="$t('SKUI.Sync.Phone host')"
            @change="updateSyncText('updateSkuiSyncHost', $event.target.value)"
          >

          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Phone port') }}</span>
              <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Phone port description') }}</span>
            </span>
            <input
              class="skuiEntryNumber"
              type="number"
              min="0"
              max="65535"
              :value="syncPort"
              :aria-label="$t('SKUI.Sync.Phone port')"
              @change="updateSyncPort($event.target.value)"
            >
          </div>

          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Ssh arguments') }}</span>
              <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Ssh arguments description') }}</span>
            </span>
          </div>
          <input
            class="skuiEntryInput skuiIndent2"
            type="text"
            spellcheck="false"
            :value="syncSshArgs"
            :aria-label="$t('SKUI.Sync.Ssh arguments')"
            @change="updateSyncText('updateSkuiSyncSshArgs', $event.target.value)"
          >

          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Phone folder') }}</span>
            </span>
          </div>
          <input
            class="skuiEntryInput skuiIndent2"
            type="text"
            spellcheck="false"
            :value="syncRemoteDir"
            :aria-label="$t('SKUI.Sync.Phone folder')"
            @change="updateSyncPath('updateSkuiSyncRemoteDir', $event.target.value, '/sdcard/jiyudoga-sync')"
          >

          <div class="skuiEntryRow skuiIndent1">
            <span class="skuiEntryText">
              <span class="skuiEntryTitle">{{ $t('SKUI.Sync.Local folder') }}</span>
              <span class="skuiEntrySummary">{{ $t('SKUI.Sync.Local folder default') }}</span>
            </span>
          </div>
          <input
            class="skuiEntryInput skuiIndent2"
            type="text"
            spellcheck="false"
            :value="syncLocalDir"
            :aria-label="$t('SKUI.Sync.Local folder')"
            @change="updateSyncText('updateSkuiSyncLocalDir', $event.target.value)"
          >
        </template>

        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Sync.On start') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Sync.On start description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="syncOnStart"
            @change="updateSyncFlag('updateSkuiSyncOnStart', $event.target.checked)"
          >
        </label>

        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Sync.After watch') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Sync.After watch description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="syncAfterWatch"
            @change="updateSyncFlag('updateSkuiSyncAfterWatch', $event.target.checked)"
          >
        </label>
      </section>

      <!--
        Video download: where the watch page's download button puts files and what
        it calls them. The folder is asked for on the first download either way —
        on Android with the SAF picker, on desktop from the main process — so this
        section is where it gets reviewed and changed afterwards.
      -->
      <section class="skuiSection">
        <hr class="skuiSectionRule">
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Download.Section') }}
        </h4>
        <p class="skuiEntrySummary skuiIndent1">
          {{ $t('SKUI.Download.Description') }}
        </p>

        <button
          v-if="IS_ANDROID"
          class="skuiEntryRow skuiIndent1"
          type="button"
          @click="chooseDownloadDirectory"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Download.Download folder') }}</span>
            <span
              class="skuiEntrySummary"
              :class="{ skuiWarn: downloadDirectoryLabel === null }"
            >
              {{ downloadDirectoryLabel ?? $t('SKUI.Download.No download directory set') }}
            </span>
          </span>
          <span class="skuiEntryAction">{{ $t('SKUI.Download.Choose…') }}</span>
        </button>
        <div
          v-else
          class="skuiEntryRow skuiIndent1"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Download.Download folder') }}</span>
            <span
              class="skuiEntrySummary"
              :class="{ skuiWarn: downloadDirectoryLabel === null }"
            >
              {{ downloadDirectoryLabel ?? $t('SKUI.Download.No download directory set') }}
            </span>
          </span>
        </div>

        <div class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Download.Filename template') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Download.Tokens') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Download.Date format hint') }}</span>
          </span>
        </div>
        <input
          class="skuiEntryInput skuiIndent2"
          type="text"
          spellcheck="false"
          :value="filenameTemplate"
          :aria-label="$t('SKUI.Download.Filename template')"
          @change="updateFilenameTemplate($event.target.value)"
        >
        <p class="skuiEntrySummary skuiIndent2">
          {{ $t('SKUI.Download.Preview', { name: filenamePreview }) }}
        </p>

        <div class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Download.Max filename length') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Download.Bytes', { count: maxFilenameBytes }) }}</span>
          </span>
          <input
            class="skuiEntryNumber"
            type="number"
            min="40"
            max="255"
            step="1"
            :value="maxFilenameBytes"
            :aria-label="$t('SKUI.Download.Max filename length')"
            @change="updateMaxFilenameBytes($event.target.value)"
          >
        </div>
      </section>

      <!--
        Subscriptions: the filter itself lives in the top bar (the funnel next to the
        profile bubble), because it is a view you switch while browsing. What belongs
        here is the one profile name the app owns rather than the user.
      -->
      <section class="skuiSection">
        <hr class="skuiSectionRule">
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Subscriptions.Section') }}
        </h4>
        <p class="skuiEntrySummary skuiIndent1">
          {{ $t('SKUI.Subscriptions.Description') }}
        </p>

        <div class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Subscriptions.All Channels label') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Subscriptions.All Channels label description') }}</span>
          </span>
        </div>
        <input
          class="skuiEntryInput skuiIndent2"
          type="text"
          spellcheck="false"
          maxlength="24"
          :value="allChannelsLabel"
          :aria-label="$t('SKUI.Subscriptions.All Channels label')"
          @change="updateAllChannelsLabel($event.target.value)"
        >
      </section>

      <!--
        Similar tab: what the discovery feed has been taught in the active profile.
        Everything here is stored on the profile itself, so it travels with profile
        export/import like the starred videos do.
      -->
      <section class="skuiSection">
        <hr class="skuiSectionRule">
        <h4 class="skuiSectionTitle">
          {{ $t('SKUI.Similar.Section') }}
        </h4>
        <p class="skuiEntrySummary skuiIndent1">
          {{ $t('SKUI.Similar.Description') }}
        </p>

        <label class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Similar.Rank by agreement') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Similar.Rank by agreement description') }}</span>
          </span>
          <input
            class="skuiEntrySwitch"
            type="checkbox"
            :checked="similarSortByAgreement"
            @change="updateSimilarSort($event.target.checked)"
          >
        </label>

        <div class="skuiEntryRow skuiIndent1">
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Similar.Minimum agreement') }}</span>
            <span class="skuiEntrySummary">{{ $t('SKUI.Similar.Minimum agreement description') }}</span>
          </span>
          <input
            class="skuiEntryNumber"
            type="number"
            min="1"
            max="5"
            step="1"
            :value="similarMinAgreement"
            :aria-label="$t('SKUI.Similar.Minimum agreement')"
            @change="updateSimilarMinAgreement($event.target.value)"
          >
        </div>

        <h5 class="skuiGroupTitle skuiIndent1">
          {{ $t('SKUI.Similar.Blocked channels') }}
        </h5>
        <p
          v-if="similarBlockedChannels.length === 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.Nothing yet') }}
        </p>
        <div
          v-for="channel in similarBlockedChannels"
          :key="channel.id"
          class="skuiEntryRow skuiIndent2"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ channel.name || channel.id }}</span>
          </span>
          <button
            class="skuiEntryAction"
            type="button"
            @click="unblockSimilarChannel(channel.id)"
          >
            {{ $t('SKUI.Similar.Remove') }}
          </button>
        </div>

        <h5 class="skuiGroupTitle skuiIndent1">
          {{ $t('SKUI.Similar.Rejected videos') }}
        </h5>
        <p
          v-if="similarBlockedVideos.length === 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.Nothing yet') }}
        </p>
        <div
          v-for="video in similarBlockedVideos"
          :key="video.videoId"
          class="skuiEntryRow skuiIndent2"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ video.title || video.videoId }}</span>
            <span class="skuiEntrySummary">{{ video.author }}</span>
          </span>
          <button
            class="skuiEntryAction"
            type="button"
            @click="unrejectSimilarVideo(video.videoId)"
          >
            {{ $t('SKUI.Similar.Remove') }}
          </button>
        </div>
        <p
          v-if="similarBlockedVideosHidden > 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.And more', { count: similarBlockedVideosHidden }) }}
        </p>

        <h5 class="skuiGroupTitle skuiIndent1">
          {{ $t('SKUI.Similar.Learned words') }}
        </h5>
        <p
          v-if="similarTerms.length === 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.Nothing yet') }}
        </p>
        <div
          v-else
          class="skuiTermList skuiIndent2"
        >
          <button
            v-for="term in similarTerms"
            :key="term.term"
            class="skuiTermChip"
            type="button"
            :title="$t('SKUI.Similar.Remove')"
            @click="clearSimilarNegativeTerm(term.term)"
          >
            {{ term.term }}
            <span class="skuiTermWeight">{{ $t('SKUI.Similar.Term weight', { count: term.weight }) }}</span>
          </button>
        </div>
        <p
          v-if="similarTermsHidden > 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.And more', { count: similarTermsHidden }) }}
        </p>

        <h5 class="skuiGroupTitle skuiIndent1">
          {{ $t('SKUI.Similar.Suggestion sources') }}
        </h5>
        <p
          v-if="similarSeedChannels.length === 0"
          class="skuiEntrySummary skuiIndent2"
        >
          {{ $t('SKUI.Similar.Nothing yet') }}
        </p>
        <div
          v-for="seed in similarSeedChannels"
          :key="seed.id"
          class="skuiEntryRow skuiIndent2"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ seed.name || seed.id }}</span>
            <span class="skuiEntrySummary">
              {{ similarBlockedSeedChannelIds.has(seed.id)
                ? $t('SKUI.Similar.Seed blocked')
                : $t('SKUI.Similar.Seed demerits', { count: seed.demerits ?? 0 }) }}
            </span>
          </span>
          <button
            class="skuiEntryAction"
            type="button"
            @click="clearSimilarSeedChannel(seed.id)"
          >
            {{ $t('SKUI.Similar.Remove') }}
          </button>
        </div>

        <button
          class="skuiEntryRow skuiIndent1"
          type="button"
          @click="resetSimilarTuning"
        >
          <span class="skuiEntryText">
            <span class="skuiEntryTitle">{{ $t('SKUI.Similar.Reset') }}</span>
          </span>
        </button>
      </section>

      <section
        v-for="section in SKUI_SECTIONS"
        :key="section.key"
        class="skuiSection"
      >
        <hr class="skuiSectionRule">
        <h4 class="skuiSectionTitle">
          {{ $t(`SKUI.Sections.${section.key}`) }}
        </h4>
        <template
          v-for="group in section.groups"
          :key="group.key ?? 'main'"
        >
          <h5
            v-if="group.key !== null"
            class="skuiGroupTitle skuiIndent1"
          >
            {{ $t(`SKUI.Groups.${group.key}`) }}
          </h5>
          <template
            v-for="slot in group.slots"
            :key="slot.key"
          >
            <SkuiColorRow
              v-if="slot.kind === 'color'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :label="$t(`SKUI.Slots.${slot.key}`)"
              :model-color="resolvedColors[slot.key]"
              :is-overridden="slot.key in themeColors"
              :recent-colors="recentColors"
              @preview="color => previewColor(slot.key, color)"
              @commit="color => commitColor(slot.key, color)"
              @reset="resetColor(slot.key)"
            />
            <SkuiSliderRow
              v-else-if="slot.kind === 'dimen'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :label="$t(`SKUI.Slots.${slot.key}`)"
              :model-value="resolvedDims[slot.key]"
              :min="slot.min"
              :max="slot.max"
              :step="slot.step"
              :unit="slot.unit"
              @preview="value => previewDim(slot.key, value)"
              @commit="value => commitDim(slot.key, value)"
            />
            <SkuiFontRow
              v-else-if="slot.kind === 'font'"
              :class="group.key === null ? 'skuiIndent1' : 'skuiIndent2'"
              :font="resolvedFont"
              :custom-fonts="customFonts"
              :sample-color="sampleColor"
              @update-font="updateFont"
              @add-font="addFont"
            />
          </template>
        </template>
      </section>
    </div>

    <SkuiExportImport
      v-if="panelOpen"
      @close="closePanel"
      @close-chain="closeChain"
    />
  </FtSettingsSection>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import android from 'android'
import { hasStorageAccess, requestStorageAccess } from '../../helpers/android/sync'
import { runSync } from '../../helpers/sync/index'

import FtSettingsSection from '../FtSettingsSection/FtSettingsSection.vue'
import SkuiColorRow from './SkuiColorRow.vue'
import SkuiExportImport from './SkuiExportImport.vue'
import SkuiFontRow from './SkuiFontRow.vue'
import SkuiSliderRow from './SkuiSliderRow.vue'

import { showToast } from '../../helpers/utils'
import {
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_MAX_FILENAME_BYTES,
  buildDownloadFilename
} from '../../helpers/download-filename'
import store from '../../store/index'
import {
  SKUI_RECENT_COLORS_MAX,
  SKUI_SECTIONS,
  applySkuiTheme,
  colorToString,
  cssRgba,
  parseColor,
  parseTheme,
  resolveColors,
  resolveDims,
  resolveFont,
} from '../../helpers/skui'

const IS_ANDROID = !!process.env.IS_ANDROID

const { t } = useI18n()
const router = useRouter()

const panelOpen = ref(false)
const backupDirectoryName = ref(null)
const automationEnabled = ref(false)
const automationToken = ref('')

// Queried on opening the page, and again whenever the panel writes something, so the
// folder row and the panel's "last backup" line never show a stale answer.
function refreshBackupState() {
  if (!IS_ANDROID) { return }

  const directory = JSON.parse(android.getBackupDirectory())
  backupDirectoryName.value = directory.tree ? directory.name : null
  automationEnabled.value = android.isAutomationEnabled()
  automationToken.value = android.getAutomationToken()
}

onMounted(refreshBackupState)

// ---- Device sync ----

const syncEnabled = computed(() => store.getters.getSkuiSyncEnabled)
const syncOnStart = computed(() => store.getters.getSkuiSyncOnStart)
const syncAfterWatch = computed(() => store.getters.getSkuiSyncAfterWatch)
const syncAndroidDir = computed(() => store.getters.getSkuiSyncAndroidDir)
const syncHost = computed(() => store.getters.getSkuiSyncHost)
const syncPort = computed(() => store.getters.getSkuiSyncPort)
const syncSshArgs = computed(() => store.getters.getSkuiSyncSshArgs)
const syncRemoteDir = computed(() => store.getters.getSkuiSyncRemoteDir)
const syncLocalDir = computed(() => store.getters.getSkuiSyncLocalDir)

const syncBusy = ref(false)
const syncStorageGranted = ref(true)

function refreshSyncStorageState() {
  if (!IS_ANDROID) { return }

  syncStorageGranted.value = hasStorageAccess()
}

onMounted(refreshSyncStorageState)

function grantSyncStorage() {
  requestStorageAccess()
}

const syncStatusIsProblem = computed(() => {
  const result = store.getters.getSkuiSyncLastResult

  return result.startsWith('error') || result === 'no-peer' ||
    result === 'no-storage-access' || result === 'no-directory'
})

const syncStatusText = computed(() => {
  const result = store.getters.getSkuiSyncLastResult
  const lastRun = store.getters.getSkuiSyncLastRun

  if (result === '' || lastRun === 0) { return t('SKUI.Sync.Never') }

  const when = new Date(lastRun).toLocaleString()

  if (result.startsWith('error')) {
    return t('SKUI.Sync.Failed', { message: result.replace(/^error:\s*/, '') })
  }

  if (result === 'no-peer') { return t('SKUI.Sync.No peer') }
  if (result === 'no-storage-access') { return t('SKUI.Sync.No storage access') }
  if (result === 'no-directory') { return t('SKUI.Sync.No directory') }

  if (result.startsWith('ok:')) {
    return t('SKUI.Sync.Merged', { count: result.slice(3), when })
  }

  return t('SKUI.Sync.Up to date', { when })
})

async function syncNow() {
  syncBusy.value = true

  try {
    await runSync('manual')
  } finally {
    syncBusy.value = false
    refreshSyncStorageState()
  }
}

/**
 * @param {boolean} value
 */
function updateSyncEnabled(value) {
  store.dispatch('updateSkuiSyncEnabled', value)

  if (value) {
    refreshSyncStorageState()
  }
}

/**
 * @param {string} action
 * @param {boolean} value
 */
function updateSyncFlag(action, value) {
  store.dispatch(action, value)
}

/**
 * @param {string} action
 * @param {string} value
 */
function updateSyncText(action, value) {
  store.dispatch(action, value.trim())
}

/**
 * A path that has been emptied falls back to the default rather than to nothing: an
 * empty sync folder would silently stop the sync with no visible cause.
 * @param {string} action
 * @param {string} value
 * @param {string} fallback
 */
function updateSyncPath(action, value, fallback) {
  store.dispatch(action, value.trim().replace(/\/+$/, '') || fallback)
}

/**
 * @param {string} value
 */
function updateSyncPort(value) {
  const parsed = Number.parseInt(value, 10)

  // 0 is the useful default, not a rejected value: it means "say nothing about the
  // port", which lets a Host block in ~/.ssh/config supply its own
  store.dispatch('updateSkuiSyncPort', Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : 0)
}

// ---- Similar tab ----

// Long lists are truncated: rejecting videos adds entries faster than anyone wants
// to scroll, and the point of the list is to spot and undo a mistaken tap
const SIMILAR_LIST_LIMIT = 40

const similarTuning = computed(() => store.getters.getActiveProfileSimilarTuning)

/** @type {import('vue').ComputedRef<Set<string>>} */
const similarBlockedSeedChannelIds = computed(() => store.getters.getSimilarBlockedSeedChannelIdSet)

const similarSortByAgreement = computed(() => store.getters.getSkuiSimilarSort === 'agreement')

const similarMinAgreement = computed(() => store.getters.getSkuiSimilarMinAgreement)

const similarBlockedChannels = computed(() => {
  return [...similarTuning.value.blockedChannels].sort((a, b) => (b.blockedAt ?? 0) - (a.blockedAt ?? 0))
})

const allSimilarBlockedVideos = computed(() => {
  return [...similarTuning.value.blockedVideos].sort((a, b) => (b.blockedAt ?? 0) - (a.blockedAt ?? 0))
})

const similarBlockedVideos = computed(() => allSimilarBlockedVideos.value.slice(0, SIMILAR_LIST_LIMIT))

const similarBlockedVideosHidden = computed(() => {
  return Math.max(0, allSimilarBlockedVideos.value.length - similarBlockedVideos.value.length)
})

const allSimilarTerms = computed(() => {
  return [...similarTuning.value.negativeTerms].sort((a, b) => b.weight - a.weight)
})

const similarTerms = computed(() => allSimilarTerms.value.slice(0, SIMILAR_LIST_LIMIT))

const similarTermsHidden = computed(() => {
  return Math.max(0, allSimilarTerms.value.length - similarTerms.value.length)
})

const similarSeedChannels = computed(() => {
  return [...similarTuning.value.seedChannels].sort((a, b) => (b.demerits ?? 0) - (a.demerits ?? 0))
})

/**
 * @param {boolean} byAgreement
 */
function updateSimilarSort(byAgreement) {
  store.dispatch('updateSkuiSimilarSort', byAgreement ? 'agreement' : 'newest')
}

/**
 * @param {string} value
 */
function updateSimilarMinAgreement(value) {
  const parsed = parseInt(value)

  store.dispatch('updateSkuiSimilarMinAgreement', isNaN(parsed) ? 1 : Math.min(5, Math.max(1, parsed)))
}

/**
 * @param {string} channelId
 */
function unblockSimilarChannel(channelId) {
  store.dispatch('unblockSimilarChannel', channelId)
}

/**
 * @param {string} videoId
 */
function unrejectSimilarVideo(videoId) {
  store.dispatch('unrejectSimilarVideo', videoId)
}

/**
 * @param {string} term
 */
function clearSimilarNegativeTerm(term) {
  store.dispatch('clearSimilarNegativeTerm', term)
}

/**
 * @param {string} channelId
 */
function clearSimilarSeedChannel(channelId) {
  store.dispatch('clearSimilarSeedChannel', channelId)
}

function resetSimilarTuning() {
  store.dispatch('resetSimilarTuning')

  showToast(t('SKUI.Similar.Reset done'))
}

// ---- subscriptions ----

const allChannelsLabel = computed(() => store.getters.getSkuiAllChannelsLabel)

/**
 * @param {string} value
 */
function updateAllChannelsLabel(value) {
  store.dispatch('updateSkuiAllChannelsLabel', value.trim())
}

// ---- video download ----

const filenameTemplate = computed(() => store.getters.getDownloadFilenameTemplate)
const maxFilenameBytes = computed(() => store.getters.getDownloadMaxFilenameBytes)

const downloadDirectoryLabel = computed(() => {
  if (!IS_ANDROID) {
    // set by the main-process picker on the first download
    return store.getters.getDownloadFolderPath || null
  }

  const tree = store.getters.getDownloadDirectoryTree
  if (!tree) { return null }

  // a device folder resolves to a real path; anything else (cloud providers)
  // has only the tree uri to show
  return android.treeUriToPath(tree) || decodeURIComponent(tree)
})

// what the current template would produce, so the effect of an edit is visible
// without downloading anything
const filenamePreview = computed(() => buildDownloadFilename(
  filenameTemplate.value,
  {
    title: 'Some rather long video title that shows where the truncation falls',
    channel: 'Channel Name',
    published: Date.parse('2022-07-02T12:00:00'),
    videoId: 'c70sYunZ3jI',
    resolution: '1080p',
    ext: 'mkv'
  },
  maxFilenameBytes.value
))

async function chooseDownloadDirectory() {
  const { awaitAsyncResult } = await import('../../helpers/android/jsinterface')
  const response = await awaitAsyncResult(android.requestDirectoryAccessDialog())

  if (response === 'USER_CANCELED') { return }

  store.dispatch('updateDownloadDirectoryTree', response)
}

/**
 * @param {string} value
 */
function updateFilenameTemplate(value) {
  store.dispatch('updateDownloadFilenameTemplate', value.trim() || DEFAULT_FILENAME_TEMPLATE)
}

/**
 * @param {string} value
 */
function updateMaxFilenameBytes(value) {
  const parsed = Number.parseInt(value, 10)

  store.dispatch(
    'updateDownloadMaxFilenameBytes',
    Number.isFinite(parsed) ? Math.min(255, Math.max(40, parsed)) : DEFAULT_MAX_FILENAME_BYTES
  )
}

const abbreviatedToken = computed(() => {
  const token = automationToken.value
  if (token.length <= 20) { return token }
  return `${token.slice(0, 8)}…${token.slice(-8)}`
})

/**
 * @param {boolean} enabled
 */
function updateAutomationEnabled(enabled) {
  android.setAutomationEnabled(enabled)
  automationEnabled.value = enabled
}

function copyAutomationToken() {
  android.copyToClipboard('automation token', automationToken.value)
  showToast(t('SKUI.Backup.Token copied'))
}

function regenerateAutomationToken() {
  automationToken.value = android.regenerateAutomationToken()
  showToast(t('SKUI.Backup.Token regenerated'))
}

function closePanel() {
  panelOpen.value = false
  refreshBackupState()
}

/**
 * A finished export or import closes the whole chain: the info dialog (already gone by
 * now), the Export/Import panel, and the UI settings page itself.
 */
function closeChain() {
  panelOpen.value = false
  router.back()
}

const theme = computed(() => parseTheme(store.getters.getSkuiTheme))
const themeColors = computed(() => theme.value.colors ?? {})
const resolvedColors = computed(() => resolveColors(theme.value))
const resolvedDims = computed(() => resolveDims(theme.value))
const resolvedFont = computed(() => resolveFont(theme.value))
const sampleColor = computed(() => cssRgba(resolvedColors.value.text))

const customFonts = computed(() => {
  try {
    const parsed = JSON.parse(store.getters.getSkuiCustomFonts)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

const recentColors = computed(() => {
  try {
    const parsed = JSON.parse(store.getters.getSkuiRecentColors)
    return (Array.isArray(parsed) ? parsed : []).map(value => parseColor(value)).filter(color => color !== null)
  } catch {
    return []
  }
})

/**
 * Live preview: commit the mutated theme to the store WITHOUT persisting
 * (mutation only) — the App-level watcher restyles the whole app instantly.
 * Persist (dispatch) happens on slider release / explicit actions.
 * @param {object} nextTheme
 * @param {boolean} persist
 */
function pushTheme(nextTheme, persist) {
  const json = JSON.stringify(nextTheme)
  if (persist) {
    store.dispatch('updateSkuiTheme', json)
  } else {
    store.commit('setSkuiTheme', json)
  }
}

function themeWithColor(slotKey, color) {
  const next = { ...theme.value, colors: { ...themeColors.value } }
  next.colors[slotKey] = colorToString(color)
  return next
}

function previewColor(slotKey, color) {
  pushTheme(themeWithColor(slotKey, color), false)
}

function commitColor(slotKey, color) {
  pushTheme(themeWithColor(slotKey, color), true)
  addRecentColor(color)
}

function resetColor(slotKey) {
  const next = { ...theme.value, colors: { ...themeColors.value } }
  delete next.colors[slotKey]
  pushTheme(next, true)
}

function addRecentColor(color) {
  const value = colorToString(color)
  const next = [value]
  for (const existing of recentColors.value) {
    const existingValue = colorToString(existing)
    if (existingValue !== value && next.length < SKUI_RECENT_COLORS_MAX) {
      next.push(existingValue)
    }
  }
  store.dispatch('updateSkuiRecentColors', JSON.stringify(next))
}

function themeWithDim(slotKey, value) {
  const next = { ...theme.value, dims: { ...(theme.value.dims ?? {}) } }
  next.dims[slotKey] = value
  return next
}

function previewDim(slotKey, value) {
  pushTheme(themeWithDim(slotKey, value), false)
}

function commitDim(slotKey, value) {
  pushTheme(themeWithDim(slotKey, value), true)
}

function updateFont(partial, persist) {
  const next = { ...theme.value, font: { ...(theme.value.font ?? {}), ...partial } }
  pushTheme(next, persist)
}

function addFont(font) {
  const withoutDuplicate = customFonts.value.filter(existing => existing.name !== font.name)
  const nextFonts = [...withoutDuplicate, font]
  store.dispatch('updateSkuiCustomFonts', JSON.stringify(nextFonts))
  // register the @font-face immediately so the picker and sample render it
  applySkuiTheme(theme.value, nextFonts)
  updateFont({ family: font.name }, true)
}
</script>

<style scoped src="./SkuiSettings.css" />
