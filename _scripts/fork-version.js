const path = require('path')
const { readFileSync } = require('fs')

// Fork (shiroikuma-jiyudoga) version identity for the webpack bundles — the single source of
// the `process.env.FORK_VERSION` string shown in-app. FORK_VERSION and BUILD_NUMBER live in the
// repo-root fork.properties, shared with the Gradle and deb builds, so the version displayed
// inside the app is always exactly the one in the APK's versionName and the artifact filenames.
const forkProperties = readFileSync(path.join(__dirname, '../fork.properties'), 'utf8')
const buildNumber = /^BUILD_NUMBER=(\d+)$/m.exec(forkProperties)[1]
const baseVersion = /^FORK_VERSION=(.+)$/m.exec(forkProperties)[1].trim()

// the counter is zero-padded to three digits everywhere it appears (global rule)
const forkVersion = `${baseVersion}+${buildNumber.padStart(3, '0')}`

module.exports = { forkVersion }
