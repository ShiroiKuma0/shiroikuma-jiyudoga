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
// The upstream-base pins MUST be part of this string. The in-app updater compares the running
// version against the newest GitHub release tag with `versionNumberGt`, which aligns dotted
// segments POSITIONALLY — so a pin-less local version compares its build counter against the
// tag's pin YEAR (`4` vs `2026`) and every published release looks newer forever. That was the
// false "update available" banner seen on 0.25.1.1+004 (2026-08-02): c433e0d88 added the pins to
// build-fork.sh, build-fork-deb.mjs and build.gradle.kts but not here, so the bundles kept
// reporting the bare `0.25.1.1+004`. Both sides of that comparison must carry the same shape.
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

function forkPin (ref) {
  const sha = gitOutput('merge-base', 'HEAD', ref).slice(0, 8)
  if (sha.length !== 8) {
    return ''
  }
  const date = gitOutput('show', '-s', '--format=%cd', '--date=format:%Y-%m-%d', sha)
  return date.length === 10 ? `.${date}.g${sha}` : `.g${sha}`
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
