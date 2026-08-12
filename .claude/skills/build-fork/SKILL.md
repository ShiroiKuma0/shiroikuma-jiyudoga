---
name: build-fork
description: Build BOTH release artifacts of shiroikuma-jiyudoga — the GNU/Linux amd64 .deb (Electron) and the signed Android arm64-v8a APK — into ~/tmp/ with one command, then deliver. Use whenever 白い熊 asks to build the app, build the APK/deb, make a release build, or after ANY functional change.
---

# Build both release artifacts (deb + apk)

This is **shiroikuma-jiyudoga** — 白い熊's fork of FreeTube (desktop Electron) with the
FreeTubeAndroid layer grafted on. Unlike the other sister forks, **every build produces BOTH**:
the GNU/Linux amd64 `.deb` (installable on Tuxedo OS) **and** the Android arm64-v8a APK.

> **ALWAYS build, then ALWAYS deliver — no asking.** After any functional change, build via
> the canonical script and deliver (APK per the global /after-build flow: /adb-check →
> /adb-push or /scp; the .deb stays in ~/tmp/ — mention it in the handover). This does NOT
> commit or push; that still waits for 白い熊's explicit "Push".

## The one command

```bash
_scripts/build-fork.sh
```

It: packs the desktop webpack bundles → builds the deb (`_scripts/build-fork-deb.mjs`,
electron-builder, deb-only, fork naming) → packs the android webpack bundle → builds the
signed release APK (`android/gradlew assembleRelease`) → copies both to `~/tmp/` →
**bumps `BUILD_NUMBER`** in the repo-root `fork.properties`.

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
- `~/tmp/shiroikuma-jiyudoga_<ver>_arm64-v8a.apk` (versionCode
  `((maj*10000+min*100+patch)*10+respin)*1000+N`, e.g. `25011001`)

## Toolchain (all wired inside the script)

- **pnpm** (standalone) at `~/.local/share/pnpm`, **Node 24** via `pnpm env` (host node 18 is too old).
- **JDK 21** at `/usr/lib/jvm/java-21-openjdk-amd64` (host default java 11 breaks Gradle).
- **Android SDK** at `~/android-sdk`; `android/local.properties` has `sdk.dir` (gitignored).
- Signing: gitignored `keystore.properties` (repo root) → `~/.android-keystores/shiroikuma-jiyudoga.jks`, alias `jiyudoga`.

## Notes / invariants

- Every build MUST go through `_scripts/build-fork.sh` so `BUILD_NUMBER` bumps and both
  artifacts stay in lockstep — never ship one without the other, never reuse a `+N`.
- The deb's **control-field** version shows both pins' dates with tildes
  (`0.25.1.1.2026~08~02.gdc7c4e2e.2026~07~30.gfea7a050+007`):
  electron-builder rewrites `-` → `~` for deb/rpm in `LinuxTargetHelper.getSanitizedVersion`.
  Both filenames keep the hyphens, and `dpkg --compare-versions` still orders it correctly.
  Expected, verified 2026-08-02 — not a bug, and not worth dropping the `YYYY-MM-DD` format over.
- If pnpm complains about ignored build scripts, the allow/deny list lives in
  `pnpm-workspace.yaml` (`allowBuilds`). If electron's binary is missing:
  `cd node_modules/electron && node install.js`.
- `pnpm install` needs network for the git-hosted `@seald-io/nedb` (MarmadileManteater fork).
- Never commit/push on your own; artifacts and signing files are gitignored.
- No Claude attribution in commits (see `CLAUDE.md`).
