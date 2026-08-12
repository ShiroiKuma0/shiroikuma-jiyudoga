const path = require('path')
const { readFileSync } = require('fs')
const { execFileSync } = require('child_process')

// Fork (shiroikuma-jiyudoga) version identity — the SINGLE JavaScript source of the fork
// versionName, used both for the `process.env.FORK_VERSION` string compiled into the webpack
// bundles (shown in-app) and for the .deb built by _scripts/build-fork-deb.mjs. FORK_VERSION and
// BUILD_NUMBER live in the repo-root fork.properties, shared with the Gradle and deb builds, so
// the version displayed inside the app is always exactly the one in the APK's versionName and the
// artifact filenames.
//
// The upstream-base pins are part of this string so the bundles report exactly the versionName in
// the APK and the artifact filenames (the top bar shows it). They are NOT ordering material: the
// in-app updater compares only FORK_VERSION and the build counter, and `versionNumberGt`
// (src/renderer/helpers/android/utils.js) strips the pins from BOTH sides before comparing. It
// has to — pins are not monotonic. The old comparison aligned every dot/plus/dash segment
// POSITIONALLY, which read a pin year against a build counter (`2026` vs `4`, every release newer
// forever — the false banner on 0.25.1.1+004, 2026-08-02) and then, once both sides were pinned,
// let the stale +006 release outrank the running +010 because switching these timestamps to UTC
// had moved that same commit's pin date BACKWARDS from 2026-08-12 to 2026-08-11 (2026-08-12).
const forkProperties = readFileSync(path.join(__dirname, '../fork.properties'), 'utf8')
const buildNumber = /^BUILD_NUMBER=(\d+)$/m.exec(forkProperties)[1]
const baseVersion = /^FORK_VERSION=(.+)$/m.exec(forkProperties)[1].trim()

// Upstream-base pins, identical to the ones _scripts/build-fork.sh and android/app/build.gradle.kts
// compute, so the bundles, the deb and the apk all carry the same version. BOTH upstreams are
// git-tracking: master mirrors FreeTube's development tip, and we merge FreeTubeAndroid's
// `development` branch rather than its tags, so neither version literal identifies the commit we
// contain. Each sha is the merge-base of HEAD and the ref (the upstream commit our layer sits on)
// and each date is that commit's own committer date, never build time. FreeTube first,
// FreeTubeAndroid second; the pins are independent, and this must never fail the build — it
// degrades quietly.
function gitOutput (...args) {
  try {
    return execFileSync('git', args, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch (e) {
    console.log(`Git command [git ${args.join(' ')}] failed [${e}]`)
    return ''
  }
}

function gitSucceeds (...args) {
  try {
    execFileSync('git', args, { cwd: path.join(__dirname, '..'), stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// The timestamp carries HH-MM as well as the date (白い熊, 2026-08-12): a bare date ties whenever
// two syncs land on one day, and the next field along is the random sha, so the newer build sorts
// anywhere. Built from the raw epoch so it is UTC — `--date=format:` would render the commit's own
// offset, which this file did until then. `+` opens each top-level group, the pin's own date, time
// and sha staying dot-joined since all three describe one commit.
function forkPin (ref) {
  const sha = gitOutput('merge-base', 'HEAD', ref).slice(0, 8)
  if (sha.length !== 8) {
    return ''
  }
  const epoch = gitOutput('show', '-s', '--format=%ct', sha)
  // 2026-08-01T09:40:12.000Z -> 2026-08-01.09-40
  const stamp = /^\d+$/.test(epoch)
    ? new Date(parseInt(epoch, 10) * 1000).toISOString().slice(0, 16).replace('T', '.').replace(':', '-')
    : ''
  return stamp.length === 16 ? `+${stamp}.g${sha}` : `+g${sha}`
}

// The FreeTubeAndroid pin must name FreeTubeAndroid work, not history the two upstreams SHARE.
// Their `development` merges FreeTube's own development into itself, so until we have merged their
// branch the newest commit in common is a FreeTube one — pinning it would name the wrong upstream.
function forkPinAndroid (ref) {
  const mergeBase = gitOutput('merge-base', 'HEAD', ref)
  if (mergeBase.length === 0) {
    return ''
  }
  if (gitSucceeds('rev-parse', '--verify', '-q', 'master') &&
      gitSucceeds('merge-base', '--is-ancestor', mergeBase, 'master')) {
    return ''
  }
  return forkPin(ref)
}

const upstreamPin = `${forkPin('master')}${forkPinAndroid('android/development')}`

// the counter is zero-padded to three digits everywhere it appears (global rule)
const forkVersion = `${baseVersion}${upstreamPin}+${buildNumber.padStart(3, '0')}`

module.exports = { forkVersion }
