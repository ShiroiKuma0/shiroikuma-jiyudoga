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
// the counter is zero-padded to three digits so artifact lists sort in build order
const forkVersion = `${baseVersion}+${buildNumber.padStart(3, '0')}`

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
