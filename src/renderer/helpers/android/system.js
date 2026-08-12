import android from 'android'
import { isColourDark, versionNumberGt } from './utils'
import packageDetails from '../../../../package.json'
import { marked } from 'marked'

export function updateAndroidTheme(usesMain = false) {
  const bodyStyle = getComputedStyle(document.body)
  const isDark = isColourDark(bodyStyle.getPropertyValue('--primary-text-color'))
  const isDarkTop = usesMain ? isColourDark(bodyStyle.getPropertyValue('--text-with-main-color')) : isDark
  const top = !usesMain ? bodyStyle.getPropertyValue('--card-bg-color') : bodyStyle.getPropertyValue('--primary-color')
  const bottom = bodyStyle.getPropertyValue('--side-nav-color')
  android.themeSystemUi(bottom, top, isDark, isDarkTop)
}

export function getConsoleLogs() {
  return JSON.parse(android.getLogs())
}

const REPO_ID = 'ShiroiKuma0/shiroikuma-jiyudoga'

/**
 * @typedef ChangeLog
 * @property {string} title
 * @property {string} body
 */

/**
 * @typedef UpdateInfo
 * @property {true} updateAvailable
 * @property {string} version
 * @property {ChangeLog} changeLog
 * @property {string} downloadLink
 */

/**
 * @typedef NoUpdateInfo
 * @property {false} updateAvailable
 */

/**
 *
 * @returns {Promise<UpdateInfo|NoUpdateInfo>}
 */
export async function getUpdateInfo() {
  try {
    const isNightly = packageDetails.version.indexOf('nightly') !== -1

    // A PAGE of releases, not `per_page=1`: GitHub's release list is documented as reverse
    // chronological but does not reliably deliver that — on 2026-08-12 this repo's list put
    // the `+006` release ahead of both `+009` and `+008`, so `[0]` offered a stale build as
    // an update. We pick the newest ourselves with versionNumberGt below.
    const updateUrl = isNightly
      ? `https://api.github.com/repos/${REPO_ID}/actions/runs`
      : `https://api.github.com/repos/${REPO_ID}/releases?per_page=10`

    const response = await fetch(updateUrl)
    const updatesJSON = await response.json()

    let currentVersion
    let latestVersion
    let downloadLink
    let changelogTitle
    let changelogBody

    if (!isNightly) {
      const latestRelease = updatesJSON
        .filter(release => !release.draft && !release.prerelease)
        .reduce((newest, release) => {
          return newest === null || versionNumberGt(release.tag_name, newest.tag_name) ? release : newest
        }, null)

      if (latestRelease === null) {
        return { updateAvailable: false }
      }

      const tagName = latestRelease.tag_name
      currentVersion = process.env.FORK_VERSION || packageDetails.version
      latestVersion = tagName
      changelogTitle = latestRelease.name
      changelogBody = latestRelease.body
        // Link usernames to their GitHub profiles
        .replaceAll(/@(\S+)\b/g, '[@$1](https://github.com/$1)')
        // Shorten pull request links to #1234
        .replaceAll(/https:\/\/github\.com\/ShiroiKuma0\/shiroikuma-jiyudoga\/pull\/(\d+)/g, '[#$1]($&)')
      // Add the title
      changelogBody = `${changelogBody}`
      changelogBody = marked.parse(changelogBody)
      downloadLink = `https://github.com/${REPO_ID}/releases`
    } else if (isNightly) {
      currentVersion = packageDetails.version.split('-nightly-')[1]
      const buildRuns = updatesJSON.workflow_runs.filter(run => run.name === 'Build Android')
      if (buildRuns.length > 0) {
        const latestRun = buildRuns[0]
        latestVersion = latestRun.run_number
        downloadLink = latestRun.html_url
        changelogTitle = `Nightly ${latestVersion}`
        changelogBody = marked.parse(`latest commit:\r\n\`\`\`\r\n${buildRuns[0].head_commit.message}\r\n\`\`\``)
      } else {
        latestVersion = currentVersion
      }
    }

    const updateAvailable = versionNumberGt(latestVersion, currentVersion)
    return {
      updateAvailable,
      version: latestVersion,
      downloadLink,
      changeLog: {
        title: changelogTitle,
        body: changelogBody
      }
    }
  } catch (error) {
    console.error('errored while checking for updates', `https://api.github.com/repos/${REPO_ID}/releases?per_page=1`, error)
    return {
      updateAvailable: false
    }
  }
}
