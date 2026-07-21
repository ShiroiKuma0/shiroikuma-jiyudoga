import { readFileSync } from 'fs'
import { Arch, build, Platform } from 'electron-builder'
import config from './ebuilder.config.mjs'

// Fork (shiroikuma-jiyudoga) GNU/Linux amd64 .deb build.
// BUILD_NUMBER is shared with the Android build and lives in android/gradle.properties.
const buildNumber = /^BUILD_NUMBER=(\d+)$/m.exec(readFileSync('android/gradle.properties', 'utf8'))[1]
const upstreamVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
const forkVersion = `${upstreamVersion}+${buildNumber}`

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
