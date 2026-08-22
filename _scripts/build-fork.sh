#!/usr/bin/env bash
# Canonical fork build for shiroikuma-jiyudoga: ALWAYS builds ALL THREE artifacts —
#   1. GNU/Linux amd64 .deb   (Electron, electron-builder)
#   2. Windows x64 .zip       (same Electron bundles, packaged for Windows 11)
#   3. Android arm64-v8a .apk (WebView wrapper, Gradle, signed release)
# copies them to ~/tmp/ with fork naming, then bumps BUILD_NUMBER.
#
# Fork versioning: versionName = <FORK_VERSION><FreeTube pin><FreeTubeAndroid pin>+<BUILD_NUMBER>,
# each pin being +<base commit date>.<HH-MM>.g<8-char base sha> (UTC, `+` opening each top-level
# group, the pin's own date, time and sha dot-joined) and the counter zero-padded to three
# digits (global rule: artifact lists sort in build order). FORK_VERSION is the higher of our two
# upstreams' versions and may carry FreeTubeAndroid's fourth "respin" component — see
# fork.properties, which holds it together with BUILD_NUMBER. Both upstreams are git-tracking, so
# both are pinned, FreeTube first (global git-versioning rule).
# Android versionCode = ((maj*10000 + min*100 + patch) * 10 + respin) * 1000 + BUILD_NUMBER.
set -euo pipefail
cd "$(dirname "$0")/.."

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME="$HOME/android-sdk"

BUILD_NUMBER=$(sed -n 's/^BUILD_NUMBER=//p' fork.properties)
VERSION=$(sed -n 's/^FORK_VERSION=//p' fork.properties)
printf -v PADDED '%03d' "$BUILD_NUMBER"

# Upstream-base pins — BOTH upstreams are git-tracking, so both get one. Neither upstream's
# version literal identifies the commit we actually contain: master mirrors FreeTube's
# *development tip*, and we merge FreeTubeAndroid's `development` branch rather than its tags.
# Each sha is `git merge-base HEAD <ref>` — the upstream commit our layer sits on — NOT our own
# HEAD (already covered by +N) and NOT the ref's tip (which overstates it when custom has not
# merged the new tip yet). Each date is that commit's own committer date, never build time, so
# every build on one base shares a pin while names still sort chronologically.
# Order is fixed: FreeTube first, FreeTubeAndroid second. The pins are independent — a missing
# ref drops only its own pin. The build must never fail over a missing sha: a pin degrades to
# +g<sha> without a timestamp and vanishes entirely without git.
#
# The timestamp carries HH-MM as well as the date (白い熊, 2026-08-12): a bare date ties whenever
# two syncs land on one day, and the next field along is the random sha. TZ=UTC with format-local:
# renders UTC — plain format: would use the commit's own offset, which this script did until then.
fork_pin() {                 # $1 = upstream ref; echoes "+<date>.<HH-MM>.g<sha>", "+g<sha>", or ""
  local ref="$1" sha stamp
  sha=$(git merge-base HEAD "$ref" 2>/dev/null | cut -c1-8) || sha=""
  [ ${#sha} -eq 8 ] || { echo ""; return 0; }
  stamp=$(TZ=UTC git show -s --format=%cd --date=format-local:%Y-%m-%d.%H-%M "$sha" 2>/dev/null) || stamp=""
  if [ ${#stamp} -eq 16 ]; then echo "+${stamp}.g${sha}"; else echo "+g${sha}"; fi
}

# The FreeTubeAndroid pin must name FreeTubeAndroid work, not history the two upstreams SHARE.
# Their `development` regularly merges FreeTube's own development into itself, so until we have
# merged their branch the newest commit we have in common with it is a FREETUBE commit. Pinning
# that would name the wrong upstream and would drift on every FreeTube sync, so drop the pin
# instead: no pin is honest, a wrong one is not.
fork_pin_android() {         # $1 = upstream ref; echoes a pin, or "" while only history is shared
  local ref="$1" mb
  mb=$(git merge-base HEAD "$ref" 2>/dev/null) || mb=""
  [ -n "$mb" ] || { echo ""; return 0; }
  if git rev-parse --verify -q master >/dev/null 2>&1 &&
     git merge-base --is-ancestor "$mb" master 2>/dev/null; then
    echo ""; return 0        # shared FreeTube history — their branch is not in our layer yet
  fi
  fork_pin "$ref"
}

PIN="$(fork_pin master)$(fork_pin_android android/development)"

FORKVER="${VERSION}${PIN}+${PADDED}"

echo ">>> Building shiroikuma-jiyudoga ${FORKVER} (deb + win zip + apk)"

# --- GNU/Linux amd64 .deb -------------------------------------------------
pnpm run pack
node _scripts/build-fork-deb.mjs
DEB="build/shiroikuma-jiyudoga_${FORKVER}_amd64.deb"
[ -f "$DEB" ] || { echo "!!! deb not found: $DEB" >&2; exit 1; }

# --- Windows x64 .zip -----------------------------------------------------
# Reuses the dist/ the deb just consumed, so no second desktop webpack run. The archive is built
# by the .mjs itself rather than by an electron-builder `zip` target, because every file must sit
# inside ONE top-level directory named after the artifact (白い熊, 2026-08-22) and ArchiveTarget
# hardcodes the opposite for Windows.
node _scripts/build-fork-win.mjs
WINZIP="build/shiroikuma-jiyudoga_${FORKVER}_win-x64.zip"
[ -f "$WINZIP" ] || { echo "!!! windows zip not found: $WINZIP" >&2; exit 1; }

# --- Android arm64-v8a .apk ----------------------------------------------
pnpm run pack:android
(cd android && ./gradlew assembleRelease --console=plain < /dev/null)
APK=android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "!!! apk not found: $APK" >&2; exit 1; }

# --- Deliver to ~/tmp -----------------------------------------------------
cp "$DEB" ~/tmp/
cp "$WINZIP" ~/tmp/
cp "$APK" ~/tmp/"shiroikuma-jiyudoga_${FORKVER}_arm64-v8a.apk"

# --- Bump BUILD_NUMBER ----------------------------------------------------
sed -i "s/^BUILD_NUMBER=.*/BUILD_NUMBER=$((BUILD_NUMBER + 1))/" fork.properties

VERSION_CODE=$(awk -F. -v n="$BUILD_NUMBER" \
  '{ r = (NF >= 4 ? $4 : 0); print ((($1*10000 + $2*100 + $3) * 10) + r) * 1000 + n }' <<< "$VERSION")

echo ">>> ~/tmp/shiroikuma-jiyudoga_${FORKVER}_amd64.deb"
echo ">>> ~/tmp/shiroikuma-jiyudoga_${FORKVER}_win-x64.zip"
echo ">>> ~/tmp/shiroikuma-jiyudoga_${FORKVER}_arm64-v8a.apk"
echo ">>> versionCode ${VERSION_CODE}"
echo ">>> BUILD_NUMBER bumped to $((BUILD_NUMBER + 1))"
