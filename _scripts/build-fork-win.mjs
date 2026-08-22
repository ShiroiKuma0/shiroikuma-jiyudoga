import { execFileSync } from 'child_process'
import { existsSync, renameSync, rmSync, unlinkSync } from 'fs'
import path from 'path'
import { Arch, build, Platform } from 'electron-builder'
import config from './ebuilder.config.mjs'
import forkVersionModule from './fork-version.js'

// Fork (shiroikuma-jiyudoga) Windows x64 .zip build — the sibling of build-fork-deb.mjs.
//
// The ZIP is deliberately the only Windows target. Nothing in this fork needs the NSIS installer:
// there is no electron-updater (the in-app check is the android fork's, repointed at our repo, and
// it only links to the releases page), and `freetube://` is claimed at runtime by
// app.setAsDefaultProtocolClient, not by installer registry keys. NSIS would also cost a Wine round
// trip on this machine — electron-builder builds the uninstaller by RUNNING the installer under
// Wine — whereas zip needs nothing beyond what a Linux build already downloads. The exe resource
// edit (icon + VERSIONINFO) is pure JS via `resedit`, so no Wine there either.
//
// The versionName — FORK_VERSION + both upstream-base pins + the zero-padded counter — comes from
// _scripts/fork-version.js, the same module the webpack bundles and the .deb use, so all three
// artifacts of one build carry the same version, and the version shown in the top bar is exactly
// the one in the file name.
const { forkVersion } = forkVersionModule

// One stem for the archive AND for the directory inside it: everything must extract into a single
// top-level folder named after the artifact (白い熊, 2026-08-22). electron-builder's own `zip`
// target cannot do this — ArchiveTarget hardcodes `withoutDir = !isMac`, so a Windows zip always
// has its files at the archive root and unpacking one scatters ~76 entries into whatever directory
// the user happened to be in. So we build the unpacked tree with the `dir` target and archive it
// ourselves, which also spares a second compression pass.
const stem = `shiroikuma-jiyudoga_${forkVersion}_win-x64`

const buildDir = path.resolve(import.meta.dirname, '..', 'build')
const unpackedDir = path.join(buildDir, 'win-unpacked')
const stagedDir = path.join(buildDir, stem)
const outFile = path.join(buildDir, `${stem}.zip`)

/** @type {import('electron-builder').Configuration} */
const forkConfig = {
  ...config,
  appId: 'shiroikuma.jiyudoga',
  extraMetadata: {
    name: 'shiroikuma-jiyudoga',
    version: forkVersion,
  },
  win: {
    ...config.win,

    // Names the exe (`shiroikuma-jiyudoga.exe`) exactly as `linux.executableName` names the Linux
    // binary. Without it the exe would be named after productName — `白い熊 自由動画.exe`, which is
    // valid on NTFS but awkward everywhere a path is typed. It does NOT affect app.getName(), which
    // comes from extraMetadata.name above, so the profile still lands in %APPDATA%\shiroikuma-jiyudoga.
    executableName: 'shiroikuma-jiyudoga',

    // Our own icon, generated from _icons/iconColor.png. The .ico that upstream ships was deleted
    // from this branch by the FreeTubeAndroid merge (c7e7e7e78), and restoring theirs would have put
    // FreeTube's face on our exe. It must carry a 256x256 entry: electron-builder validates that in
    // pure JS and passes the file straight through, so a valid .ico here means no icon-converter
    // toolset is downloaded.
    icon: '_icons/icon.ico',

    // `dir` stops at build/win-unpacked — the exe is still renamed, icon-patched and stamped with
    // the VERSIONINFO, since all of that happens while packaging, before any target runs. We take
    // over from there. No artifactName: nothing here expands one any more.
    target: ['dir'],
  },
}

await build({
  targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64),
  config: forkConfig,
  publish: 'never',
})

// Archive `build/<stem>/` rather than `build/win-unpacked/`, so the directory recorded in every
// entry path is the one that must appear on extraction. The rename is within one filesystem, so it
// costs nothing, and it is undone afterwards: electron-builder rebuilds win-unpacked in place on
// the next run and would otherwise re-download Electron into a directory that had wandered off.
if (existsSync(stagedDir)) {
  // only ever a leftover from a run that died between the two renames — never a delivered artifact,
  // which lives in ~/tmp and is never touched from here
  rmSync(stagedDir, { recursive: true })
}
renameSync(unpackedDir, stagedDir)

try {
  // 7za updates an existing archive rather than replacing it, so a stale zip from an earlier run of
  // the SAME version would be merged into, not overwritten. electron-builder unlinks first for the
  // same reason (targets/archive.js).
  if (existsSync(outFile)) {
    unlinkSync(outFile)
  }

  // `-mx=7 -mtc=off -mm=Deflate -mcu` is exactly what electron-builder passes for a default-
  // compression zip, so the artifact stays byte-comparable to the one its own target produced.
  // The fallbacks matter only if p7zip is ever missing from the machine.
  const candidates = [
    ['7za', ['a', '-mx=7', '-mtc=off', '-mm=Deflate', '-mcu', outFile, stem]],
    ['7z', ['a', '-mx=7', '-mtc=off', '-mm=Deflate', '-mcu', outFile, stem]],
    ['zip', ['-r', '-q', '-7', outFile, stem]],
  ]

  let archived = false
  for (const [tool, args] of candidates) {
    try {
      execFileSync(tool, args, { cwd: buildDir, stdio: ['ignore', 'ignore', 'inherit'] })
      archived = true
      break
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  if (!archived) {
    throw new Error('no archiver found: install p7zip-full (7za) or zip')
  }
} finally {
  renameSync(stagedDir, unpackedDir)
}

console.log(outFile)
