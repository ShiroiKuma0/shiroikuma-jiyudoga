---
name: build-fork
description: Build ALL THREE release artifacts of shiroikuma-jiyudoga — the GNU/Linux amd64 .deb (Electron), the Windows x64 .zip, and the signed Android arm64-v8a APK — into ~/tmp/ with one command, then deliver. Use whenever 白い熊 asks to build the app, build the APK/deb/Windows zip, make a release build, or after ANY functional change.
---

# Build all three release artifacts (deb + Windows zip + apk)

This is **shiroikuma-jiyudoga** — 白い熊's fork of FreeTube (desktop Electron) with the
FreeTubeAndroid layer grafted on. Unlike the other sister forks, **every build produces ALL
THREE**: the GNU/Linux amd64 `.deb` (installable on Tuxedo OS), the **Windows x64 `.zip`** (for
白い熊's Windows 11 PC, added 2026-08-22) **and** the Android arm64-v8a APK. Never build only
some of them — one version means one set of three.

> **ALWAYS build, then ALWAYS deliver — no asking.** After any functional change, build via
> the canonical script and deliver (APK per the global /after-build flow: /adb-check →
> /adb-push or /scp; the .deb and the Windows .zip stay in ~/tmp/ — mention both in the
> handover). This does NOT commit or push; that still waits for 白い熊's explicit "Push".

## The one command

```bash
_scripts/build-fork.sh
```

It: packs the desktop webpack bundles → builds the deb (`_scripts/build-fork-deb.mjs`,
electron-builder, deb-only, fork naming) → builds the Windows zip from the same `dist/`
(`_scripts/build-fork-win.mjs`) → packs the android webpack bundle → builds the signed release
APK (`android/gradlew assembleRelease`) → copies all three to `~/tmp/` → **bumps `BUILD_NUMBER`**
in the repo-root `fork.properties`.

Outputs (`<ver>` =
`<FORK_VERSION>+<FT date>.<HH-MM>.g<FT sha>+<FTA date>.<HH-MM>.g<FTA sha>+<BUILD_NUMBER>`, e.g.
`0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+010`; `FORK_VERSION` is the higher of
our two upstreams' versions and lives in `fork.properties`, while the two
`+<date>.<HH-MM>.g<sha>` pins name the FreeTube and FreeTubeAndroid commits the build sits on —
`git merge-base HEAD master` and `… HEAD android/development`, in that order — each timestamp being
that commit's own committer time in **UTC**, and both recomputed from git by each entry point,
never stored. A `+` opens each top-level group (each pin, then the counter); a pin's own date, time
and sha stay dot-joined, since all three describe one commit. The FreeTubeAndroid pin is
**suppressed while its merge-base is shared FreeTube history** — but that stopped being the case
when `android/development` was merged on 2026-08-02 (`f749ac02a`), so builds carry **both** pins;
see the global **`git-versioning`** skill):
- `~/tmp/shiroikuma-jiyudoga_<ver>_amd64.deb`
- `~/tmp/shiroikuma-jiyudoga_<ver>_win-x64.zip` (everything inside ONE top-level directory
  `shiroikuma-jiyudoga_<ver>_win-x64/` — see the invariant below)
- `~/tmp/shiroikuma-jiyudoga_<ver>_arm64-v8a.apk` (versionCode
  `((maj*10000+min*100+patch)*10+respin)*1000+N`, e.g. `25011001`)

## Toolchain (all wired inside the script)

- **pnpm** (standalone) at `~/.local/share/pnpm`, **Node 24** via `pnpm env` (host node 18 is too old).
- **JDK 21** at `/usr/lib/jvm/java-21-openjdk-amd64` (host default java 11 breaks Gradle).
- **Android SDK** at `~/android-sdk`; `android/local.properties` has `sdk.dir` (gitignored).
- Signing: gitignored `keystore.properties` (repo root) → `~/.android-keystores/shiroikuma-jiyudoga.jks`, alias `jiyudoga`.

## Notes / invariants

- Every build MUST go through `_scripts/build-fork.sh` so `BUILD_NUMBER` bumps and all three
  artifacts stay in lockstep — never ship one without the others, never reuse a `+N`.
- **Every archive extracts into ONE top-level directory named after the artifact** (白い熊,
  2026-08-22): `shiroikuma-jiyudoga_<ver>_win-x64.zip` contains
  `shiroikuma-jiyudoga_<ver>_win-x64/…` and nothing at the archive root. electron-builder's own
  `zip` target CANNOT do this — `ArchiveTarget` hardcodes `withoutDir = !isMac`, so a Windows zip
  always dumps its ~76 entries at the root. That is why `_scripts/build-fork-win.mjs` builds the
  `dir` target and archives `build/<stem>/` itself (renaming `win-unpacked` aside and back), with
  the same `-mx=7 -mtc=off -mm=Deflate -mcu` electron-builder would have used. Any future archive
  of any kind follows the same rule.
- The deb's **control-field** version shows both pins' dates with tildes
  (`0.25.1.1.2026~08~02.gdc7c4e2e.2026~07~30.gfea7a050+007`):
  electron-builder rewrites `-` → `~` for deb/rpm in `LinuxTargetHelper.getSanitizedVersion`.
  Both filenames keep the hyphens, and `dpkg --compare-versions` still orders it correctly.
  Expected, verified 2026-08-02 — not a bug, and not worth dropping the `YYYY-MM-DD` format over.
- **Windows specifics.** Cross-built from Tuxedo OS; electron-builder downloads the win32-x64
  Electron dist on first use (cached in `~/.cache/electron`), and nothing here is a native module,
  so this is a normal cross-build. The `zip` is the ONLY Windows target on purpose: there is no
  electron-updater in this fork (the in-app check just links to the releases page) and
  `freetube://` is claimed at runtime, so NSIS would buy nothing — and NSIS on Linux needs Wine,
  since electron-builder builds the uninstaller by running the installer under it. Exe resource
  editing is pure JS (`resedit`), so the zip path needs no Wine at all. The exe is
  `shiroikuma-jiyudoga.exe` (`win.executableName`) and wears **our** icon from `_icons/icon.ico`,
  generated from `_icons/iconColor.png` — upstream's `.ico` was deleted from this branch by the
  FreeTubeAndroid merge (`c7e7e7e78`); it must keep a 256×256 entry or electron-builder starts
  downloading an icon-converter toolset. Unsigned, so Windows shows SmartScreen on first run.
  The zip is **never** delivered to the phone — it stays in `~/tmp/` for 白い熊 to move across.
  Two features degrade there: study export writes the mkv but reports "Yosuga Missing" (that
  binary is GNU/Linux only), and device sync needs `ssh` keys set up on the Windows PC.
- If pnpm complains about ignored build scripts, the allow/deny list lives in
  `pnpm-workspace.yaml` (`allowBuilds`). If electron's binary is missing:
  `cd node_modules/electron && node install.js`.
- `pnpm install` needs network for the git-hosted `@seald-io/nedb` (MarmadileManteater fork).
- Never commit/push on your own; artifacts and signing files are gitignored.
- No Claude attribution in commits (see `CLAUDE.md`).
