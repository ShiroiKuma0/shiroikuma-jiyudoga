#!/usr/bin/env bash
# Canonical fork build for shiroikuma-jiyudoga: ALWAYS builds BOTH artifacts —
#   1. GNU/Linux amd64 .deb   (Electron, electron-builder)
#   2. Android arm64-v8a .apk (WebView wrapper, Gradle, signed release)
# copies them to ~/tmp/ with fork naming, then bumps BUILD_NUMBER.
#
# Fork versioning: versionName = <upstream package.json version>+<BUILD_NUMBER>, with the
# counter zero-padded to three digits (global rule: artifact lists sort in build order).
# Android versionCode = (maj*10000 + min*100 + patch) * 10000 + BUILD_NUMBER (unpadded).
set -euo pipefail
cd "$(dirname "$0")/.."

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME="$HOME/android-sdk"

BUILD_NUMBER=$(sed -n 's/^BUILD_NUMBER=//p' android/gradle.properties)
VERSION=$(node -p "require('./package.json').version")
printf -v PADDED '%03d' "$BUILD_NUMBER"
FORKVER="${VERSION}+${PADDED}"

echo ">>> Building shiroikuma-jiyudoga ${FORKVER} (deb + apk)"

# --- GNU/Linux amd64 .deb -------------------------------------------------
pnpm run pack
node _scripts/build-fork-deb.mjs
DEB="build/shiroikuma-jiyudoga_${FORKVER}_amd64.deb"
[ -f "$DEB" ] || { echo "!!! deb not found: $DEB" >&2; exit 1; }

# --- Android arm64-v8a .apk ----------------------------------------------
pnpm run pack:android
(cd android && ./gradlew assembleRelease --console=plain < /dev/null)
APK=android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "!!! apk not found: $APK" >&2; exit 1; }

# --- Deliver to ~/tmp -----------------------------------------------------
cp "$DEB" ~/tmp/
cp "$APK" ~/tmp/"shiroikuma-jiyudoga_${FORKVER}_arm64-v8a.apk"

# --- Bump BUILD_NUMBER ----------------------------------------------------
sed -i "s/^BUILD_NUMBER=.*/BUILD_NUMBER=$((BUILD_NUMBER + 1))/" android/gradle.properties

echo ">>> ~/tmp/shiroikuma-jiyudoga_${FORKVER}_amd64.deb"
echo ">>> ~/tmp/shiroikuma-jiyudoga_${FORKVER}_arm64-v8a.apk"
echo ">>> versionCode $(( ( $(echo "$VERSION" | awk -F. '{print $1*10000 + $2*100 + $3}') * 10000 ) + BUILD_NUMBER ))"
echo ">>> BUILD_NUMBER bumped to $((BUILD_NUMBER + 1))"
