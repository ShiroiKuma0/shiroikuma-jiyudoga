import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { Arch, build, Platform } from 'electron-builder'
import config from './ebuilder.config.mjs'

// Fork (shiroikuma-jiyudoga) GNU/Linux amd64 .deb build.
// FORK_VERSION and BUILD_NUMBER are shared with the Android build and live in the repo-root
// fork.properties, so the deb and the apk are always built as the same version — even when the
// bump came from the Android upstream alone and nothing here changed functionally.
const forkProperties = readFileSync('fork.properties', 'utf8')
const buildNumber = /^BUILD_NUMBER=(\d+)$/m.exec(forkProperties)[1]
const baseVersion = /^FORK_VERSION=(.+)$/m.exec(forkProperties)[1].trim()

// Upstream-base pins, identical to the ones _scripts/build-fork.sh and android/app/build.gradle.kts
// compute, so the deb and the apk keep carrying the same version. BOTH upstreams are git-tracking:
// master mirrors FreeTube's development tip, and we merge FreeTubeAndroid's `release` branch rather
// than its tags, so neither version literal identifies the commit we contain. Each sha is the
// merge-base of HEAD and the ref (the upstream commit our layer sits on) and each date is that
// commit's own committer date, never build time. FreeTube first, FreeTubeAndroid second; the pins
// are independent, and this must never fail the build — it degrades quietly.
function gitOutput (...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch (e) {
    console.log(`Git command [git ${args.join(' ')}] failed [${e}]`)
    return ''
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

function gitSucceeds (...args) {
  try {
    execFileSync('git', args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
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

// the counter is zero-padded to three digits so artifact lists sort in build order
const forkVersion = `${baseVersion}${upstreamPin}+${buildNumber.padStart(3, '0')}`

/** @type {import('electron-builder').Configuration} */
const forkConfig = {
  ...config,
  appId: 'shiroikuma.jiyudoga',
  extraMetadata: {
    name: 'shiroikuma-jiyudoga',
    version: forkVersion,
  },
  linux: {
    ...config.linux,
    executableName: 'shiroikuma-jiyudoga',
    target: ['deb'],
  },
  deb: {
    ...config.deb,
    // eslint-disable-next-line no-template-curly-in-string -- electron-builder template, not a JS template literal
    artifactName: 'shiroikuma-jiyudoga_${version}_amd64.deb',
  },
}

const output = await build({
  targets: Platform.LINUX.createTarget(['deb'], Arch.x64),
  config: forkConfig,
  publish: 'never',
})
console.log(output)
