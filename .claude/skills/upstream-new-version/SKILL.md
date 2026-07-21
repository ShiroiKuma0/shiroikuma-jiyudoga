---
name: upstream-new-version
description: Sync this fork with its TWO upstreams — FreeTubeApp/FreeTube (desktop, master mirrors its development tip) and MarmadileManteater/FreeTubeAndroid (the Android layer grafted onto custom). Use when 白い熊 says a new upstream version is out, asks to update/sync to upstream, check for new FreeTube/FreeTubeAndroid versions, or bump to the latest upstream — then build the new +1 (deb + apk).
---

# Sync shiroikuma-jiyudoga with new upstream versions (dual upstream)

This fork has **two** upstreams:

| Remote | Repo | Role |
| --- | --- | --- |
| `upstream` | https://github.com/FreeTubeApp/FreeTube | The app itself. `master` mirrors its **`development` branch tip** (always slightly ahead of the latest beta release), fast-forward only. |
| `android` | https://github.com/MarmadileManteater/FreeTubeAndroid | The Android/WebView packaging layer (native Kotlin wrapper + `src/renderer/helpers/android/*` + `_scripts/webpack.android.config.js`). Its `release` branch is where its upstream-sync work lands; its `development` branch is slower-moving. We **merge** its `release` branch into `custom` and adapt it to the current FreeTube ourselves. |

`custom` carries: the android-layer graft (a merge), the desktop-build repairs for that
layer (android stub alias, `IS_ANDROID` defines, guarded require in `src/datastores/index.js`),
our identity/versioning/signing, and all feature patches.

> **`custom` is merge-based, not rebase-based.** The android graft is a merge commit;
> `git rebase` would flatten it and re-surface every resolved conflict. On a new FreeTube
> version we **merge `master` into `custom`**. Audit our layer with
> `git log --first-parent custom` or `git diff master...custom`.

## Steps

### 1. Check BOTH upstreams

```bash
git fetch upstream --tags
git fetch android --tags
# FreeTube: new work our master doesn't have
git log --oneline master..upstream/development | head -50
# FreeTubeAndroid: new work beyond what we last merged
git log --oneline $(git merge-base custom android/release)..android/release
```

Also check their releases: `gh api 'repos/FreeTubeApp/FreeTube/releases?per_page=3'` (all are
flagged pre-release, so `/releases/latest` 404s) and
`gh api repos/MarmadileManteater/FreeTubeAndroid/releases/latest`.
If neither has anything new, stop and report "already current".

### 2. ⛔ PROCEED GATE — new-features table BEFORE any rebasing/merging (hard rule)

**Before touching any branch**, present 白い熊 a **descriptive table of the new features**
introduced by the new upstream version(s), and **wait for an explicit "proceed"**. Build the
table from `git log master..upstream/development` (and the GitHub release notes of any new
release tags in that range; same for FreeTubeAndroid). Format:

| Area | Change | What it means for us |
| --- | --- | --- |
| (player, UI, API, …) | short description of the feature/fix | impact on our patches / android layer |

Do **not** advance `master`, merge, or build until 白い熊 answers "proceed".

### 3a. New FreeTube version

1. `git checkout master && git merge --ff-only upstream/development && git push origin master`
2. `git checkout custom && git merge master`
3. Resolve conflicts so **all** our customizations survive (see the table in `CLAUDE.md`).
   Conflict hotspots: `package.json` (keep upstream dep versions; keep our
   `pack:android*` scripts, the MarmadileManteater `@seald-io/nedb` git dep and `core-js`),
   `_scripts/webpack.*.config.js` (our android stub alias + `IS_ANDROID` defines),
   `src/renderer/helpers/utils.js`, `src/renderer/helpers/android/*`,
   `src/datastores/index.js` (guarded require), `src/renderer/store/modules/settings.js`.
4. **Adapt the (old) android layer to the new FreeTube**: upstream refactors routinely break
   the android helpers even without textual conflicts (e.g. 0.25 deleted
   `composables/use-i18n-polyfill` → android files now import `useI18n` from `vue-i18n`).
   Compile-verify all bundles: `pnpm run pack` **and** `pnpm run pack:android`.
5. Reset `BUILD_NUMBER=1` in `android/gradle.properties`.

### 3b. New FreeTubeAndroid version

1. On `custom`: `git merge android/release`
2. Resolve so upstream-FreeTube code wins wherever FreeTubeAndroid's copy lags (their release
   branch is typically one FreeTube minor behind us — prefer HEAD for shared app code; take
   their side for the android layer itself: `android/`, `src/renderer/helpers/android/*`,
   `_scripts/*android*`, `static/locales-android/`).
3. Re-check the desktop build still compiles (their layer historically breaks it — that is
   why the android stub alias and the datastores guarded require exist; keep them).
4. Compile-verify both: `pnpm run pack` and `pnpm run pack:android`.
5. `BUILD_NUMBER` keeps counting (only a new **FreeTube** version resets it to 1).

### 4. Verify our customizations are intact

Run through the customization table in `CLAUDE.md` (app id `shiroikuma.jiyudoga`, label
`白い熊 自由動画`, fork version scheme, signing, black-yellow icon, our branding/links, all
feature patches).

### 5. Build the new +1

Build **both** artifacts via the **build-fork** skill (`_scripts/build-fork.sh`), which
delivers to `~/tmp/` and bumps `BUILD_NUMBER`. Deliver the APK per the global
**/after-build** flow.

### 6. Stop

Let 白い熊 test. Commit/push only on their explicit **"Push"**. `master` pushes fast-forward;
`custom` is merge-based, so a normal `git push origin custom` suffices (no force needed).

## Hard rules
- The ⛔ proceed gate in step 2 is mandatory — never merge before 白い熊 says "proceed".
- Never commit/push unprompted; wait for "Push". Never `adb install`/`adb uninstall` unless the
  repo/global skills say otherwise.
- No Claude attribution in commits (see `CLAUDE.md`).
