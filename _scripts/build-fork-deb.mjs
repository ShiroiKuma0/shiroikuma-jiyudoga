import { Arch, build, Platform } from 'electron-builder'
import config from './ebuilder.config.mjs'
import forkVersionModule from './fork-version.js'

// Fork (shiroikuma-jiyudoga) GNU/Linux amd64 .deb build.
// The versionName — FORK_VERSION + both upstream-base pins + the zero-padded counter — comes from
// _scripts/fork-version.js, the same module the webpack bundles use for `process.env.FORK_VERSION`.
// Sharing it is load-bearing, not tidiness: the in-app updater compares the running version
// against the newest GitHub release tag positionally, so a bundle whose version lacks the pins
// reads every published release as newer (see the comment there). FORK_VERSION and BUILD_NUMBER
// live in the repo-root fork.properties, shared with the Gradle build, so the deb and the apk are
// always built as the same version — even when the bump came from the Android upstream alone and
// nothing here changed functionally.
const { forkVersion } = forkVersionModule

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
