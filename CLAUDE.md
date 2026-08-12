# CLAUDE.md — guide for Claude Code in this repo

**shiroikuma-jiyudoga** (白い熊 自由動画) — 白い熊's fork of
[FreeTube](https://github.com/FreeTubeApp/FreeTube), a private desktop YouTube client
(Electron + Vue 3), with the Android packaging layer of
[FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid) (a native Kotlin
WebView wrapper, formerly "FreeTubeCordova") grafted on and adapted by us. **Every build
produces BOTH artifacts**: a GNU/Linux amd64 `.deb` (Tuxedo OS) and a signed Android
arm64-v8a APK.

## Read this first

Before any work, read **`.claude/skills/build-fork/SKILL.md`** (canonical build of both
artifacts) and **`.claude/skills/upstream-new-version/SKILL.md`** (dual-upstream sync — with
its mandatory ⛔ proceed gate).

## Fork workflow

### Remotes & branches
- `origin` → `git@github.com:ShiroiKuma0/shiroikuma-jiyudoga` (push here).
- `upstream` → `https://github.com/FreeTubeApp/FreeTube` (fetch only). `master` mirrors its
  **`development` tip** (not release tags — we ride slightly ahead of the beta), ff-only.
- `android` → `https://github.com/MarmadileManteater/FreeTubeAndroid` (fetch only). We follow
  their **`development`** branch — that is where their current work lands; `release` lags it and
  the two have genuinely diverged (as of 2026-08-02: 108 commits only on `release`, 75 only on
  `development`, neither containing the other). We **merge** `android/development` into `custom`
  and adapt it to the current FreeTube ourselves. Note their `development` periodically merges
  FreeTube's own `development` into itself, so the two upstreams share history — see the pin
  guard under **Upstream tracking** below.
- `custom` — all our work. **Merge-based, not rebase-based** (the android graft is a merge
  commit; rebasing would flatten it). New FreeTube → `git merge master` into `custom`.
  Audit our layer with `git log --first-parent custom` or `git diff master...custom`.
- **Upstream tracking: `git`** — for **both** upstreams. `master` mirrors FreeTube's *development
  tip*, and we merge FreeTubeAndroid's `development` **branch** rather than its tags, so neither
  version literal identifies the commit we actually contain. The fork versionName therefore
  carries one pin per upstream, FreeTube first:
  `<FORK_VERSION>+<FT date>.<HH-MM>.g<FT sha>+<FTA date>.<HH-MM>.g<FTA sha>+<BUILD_NUMBER, 3 digits>`
  — e.g. `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+007`. One `+` opens each
  top-level group (each pin, then the counter); a pin's own date, time and sha stay dot-joined,
  since all three describe one commit. The `HH-MM` and the `+` grouping arrived 2026-08-12,
  together with a fix to render both timestamps in **UTC** rather than each commit's own timezone.
  Each sha is
  `git merge-base HEAD <ref>` (`master` / `android/development`) — the upstream commit our layer
  sits on, not our HEAD and not the ref's tip. Each pin moves **only** when that upstream is
  synced, which is the "this upstream has not moved" signal; a missing ref drops only its own pin.
  **Shared-history guard:** the FreeTubeAndroid pin is emitted only when its merge-base is *not*
  an ancestor of `master`. Their `development` merges FreeTube's `development` into itself, so
  before we have merged their branch the newest commit in common is a **FreeTube** one — pinning
  that would name the wrong upstream and drift on FreeTube syncs, so the pin is dropped instead.
  That guard has been satisfied since `android/development` was merged into `custom` on
  2026-08-02 (`f749ac02a`), so **both pins are present**: the FreeTubeAndroid merge-base is their
  own tip `fea7a050`, which is not an ancestor of `master`. See the global **`git-versioning`**
  skill.

### Our customizations (identity + build)
| What | Value | Where |
| --- | --- | --- |
| Android app id | `shiroikuma.jiyudoga` | `android/gradle.properties` → `APP_ID` |
| Android namespace | `io.freetubeapp.freetube` (**unchanged** from the android fork — never rename) | `android/app/build.gradle.kts` |
| Desktop appId / deb package | `shiroikuma.jiyudoga` / `shiroikuma-jiyudoga` | `_scripts/build-fork-deb.mjs` |
| App label | `白い熊 自由動画` | `android/app/src/main/res/values/strings.xml` → `app_name`; desktop branding TBD in rebrand pass |
| Version | `<FORK_VERSION>+<FT date>.<HH-MM>.g<FT sha>+<FTA date>.<HH-MM>.g<FTA sha>+<NNN>`, where **`FORK_VERSION` is the HIGHER of our two upstreams' versions** — FreeTube's `package.json` version (`0.25.1`) vs FreeTubeAndroid's release tag (`0.25.1.1`), adopted after merging *either* upstream. FreeTubeAndroid's fourth component is its packaging respin of the same FreeTube base, not a FreeTube version component (their own `package.json` still reads `0.25.1`); adopting it keeps our version describing what the build contains, so kakutoku sees no phantom update. **Both artifacts always carry the same version**, even when a bump came from the Android side alone and the deb is functionally unchanged — with one cosmetic exception outside our control: the deb's internal *control-field* version renders **both** pins' dates *and times* with tildes (`…2026~08~11.21~55.g86401956+2026~08~06.17~02.g4623e4a6…`), because electron-builder rewrites `-` to `~` for deb/rpm targets (`LinuxTargetHelper.getSanitizedVersion`) — the `+` group separators pass through untouched, and `dpkg --validate-version` accepts the result (re-verified 2026-08-12). Both **filenames** keep the hyphens (they expand from the raw `appInfo.version`), and `dpkg --compare-versions` orders the tilde form correctly, so upgrades are unaffected. Not a bug — do not "fix" it. `package.json` stays upstream's — never edit it. The counter is **zero-padded to three digits** (global rule: artifact lists sort in build order) in the versionName, the deb version and both filenames, and **resets to 1 on EVERY `FORK_VERSION` change**; Android versionCode `((maj*10000+min*100+patch)*10+respin)*1000+N` stays unpadded (0.25.1+039 → 25010039, 0.25.1.1+001 → 25011001) — the respin owns a digit so the code still rises across a respin bump despite the counter reset. The two `+<date>.<HH-MM>.g<sha>` **upstream-base pins** (see **Upstream tracking: `git`** above) are never stored — all three entry points recompute them from git at build time and degrade per-pin (`+g<sha>` with no timestamp, that pin omitted entirely with no ref, nothing at all with no git) so a build never fails over a missing sha. They leave `versionCode` untouched and each moves only on its own upstream's sync, independently of the counter reset. `FORK_VERSION` **keeps its respin component** even though the FreeTubeAndroid pin now identifies that side exactly — dropping it would regress `0.25.1.1` → `0.25.1` (a phantom downgrade for kakutoku) and zero the versionCode respin digit. The respin orders; the pin identifies | `fork.properties` (repo root: `FORK_VERSION` + `BUILD_NUMBER`), `android/app/build.gradle.kts` fork block, `_scripts/build-fork.sh`, `_scripts/build-fork-deb.mjs` |
| Signing | gitignored `keystore.properties` → `~/.android-keystores/shiroikuma-jiyudoga.jks` (alias `jiyudoga`) | `android/app/build.gradle.kts` |
| Artifacts | `~/tmp/shiroikuma-jiyudoga_<ver>_amd64.deb` + `..._arm64-v8a.apk` | `_scripts/build-fork.sh` |
| Desktop-build repairs for the android layer | `android$` stub alias + `IS_ANDROID:false` defines (main/renderer/web webpack configs), guarded require in `src/datastores/index.js`, `_scripts/android-stub.js` | `_scripts/` |
| Android-layer 0.25 adaptations | `useI18n` from `vue-i18n` (the fork's `use-i18n-polyfill` was deleted upstream); dead `showSaveDialog` removed from `helpers/utils.js`; `pack:android` uses `pnpm run` not `run-s` | those files |
| Original-language video titles (no auto-translation) | every tile resolves its title via YouTube oEmbed (cached, max 6 concurrent, fires only for visible tiles); watch page prefers `basic_info.title` (player videoDetails = untranslated) over `primary_info` (next endpoint = auto-translated); Invidious watch path also restored via oEmbed | `src/renderer/helpers/originalTitles.js`, `FtListVideo.vue` setup, `views/Watch/Watch.js` |
| Original-language video descriptions | descriptions get auto-translated by the same next-endpoint machinery; when `basic_info.title` ≠ `primary_info.title` (= translation active) the watch page uses the untranslated plain `basic_info.short_description` (autolinked; loses channel/hashtag links) instead of the `secondary_info` runs; local API path only — Invidious fallback path keeps whatever its instance returns | `views/Watch/Watch.js` |
| Full-width unframed content views | `inline-size: 85%` caps removed from the browsing views' `.card` (+ mobile 90% overrides); skui border rule no longer frames `.card` (settings sections keep it) | those views' css, `helpers/skui.js` |
| Live grid zoom + grid sliders popup | Ctrl+wheel (desktop; touchpad pinch too) / two-finger pinch (Android) scales tiles via `--sk-grid-scale` (0.4–3, persisted `skuiGridScale`, debounced DB write); ignored over the player. Sliders-icon popup next to the Subscriptions heading (`SkuiGridControls.vue`) sets the BASES the scale multiplies: `skuiGridThumbWidth` (px → `--sk-grid-thumb-base`), `skuiGridTitleSize` (px → `--sk-grid-title-base`, info line = 0.72×), `skuiGridTitleLines` (title `-webkit-line-clamp` → `--sk-grid-title-lines`). Profile Select rows: `--sk-profile-row-pad` from `skuiProfileRowPadding`, slider at the dropdown's bottom | `App.vue` (vars applied on body), `SkuiGridControls.vue`, `FtAutoGrid.css`, `_ft-list-item.scss`, `FtProfileSelector.vue/.css`, `store/modules/settings.js` |
| Theatre mode on Android + width-independent theatre | player control layout decides by width (≤634 px) on every platform (upstream forced compact on all touch devices); `ft_theatre_mode` is PINNED into the bottom row even in the compact layout (full window stays in the overflow — redundant with fullscreen on Android); `.useTheatreMode` applies the theatre grid at EVERY viewport width (upstream gated ≥1051 px, silently no-opping on the scaled WebView viewport) — video full row, Up Next moves below beside the description | `ft-shaka-video-player.js`, `views/Watch/Watch.scss` |
| "Similar" subscriptions tab (channel discovery) | per-profile date-descending feed of YouTube watch-next recommendations, seeded from the newest ~20 cached subscription videos (≤2 per channel), deduped, channels already in the profile filtered out; 6-way-concurrent fetch, session-cached per seed + per profile; local API (`getLocalVideoRecommendations`, next-endpoint only, no player/poToken) with Invidious fallback | `SubscriptionsSimilar.vue`, `helpers/similarVideos.js`, `helpers/api/local.js` |
| Starred videos + "Starred" subscriptions tab | star toggle button (☆/★) before "+" on the watch page; starring writes to the active profile AND the All Channels profile (unstar in All Channels removes everywhere) — stored as `starredVideos` on the profile docs, so it rides along with profile export/sync; gold star badge bottom-left on any tile of a starred video; Starred tab lists them (videos + shorts together) newest-starred first | `SubscriptionsStarred.vue`, `WatchVideoInfo.vue`, `FtListVideo.vue`, `store/modules/profiles.js` (`starVideo`/`unstarVideo`), `_ft-list-item.scss` |
| Study export to shiroikuma-jisho (Android) | graduation-cap button on the watch page: builds study SRTs from the caption track (timedtext `fmt=json3` word timing, `fmt=srt` fallback) — ASR-skeleton architecture: the caption track's native cue timing is NEVER repositioned; the description is DP-aligned and, per cue, the verbatim-covered region (exact runs ≥3 chars, region coverage ≥60 %) is text-SPLICED with the description slice (ASR prefix/suffix kept — nothing spoken drops; homophones inside runs corrected); cues split at logical points (。！？・」・「) with times interpolated from real token timestamps; gap extension speech-rate-capped (CJK ≈170 ms/char + slack — music/silence stays bare); `[音楽]`-style sound tags filtered; output: a SINGLE `<YYYY-MM-DD> <title>.mkv` — progressive mp4 remuxed (no re-encode) via PATCHED `mediabunny` (`patches/mediabunny.patch`: subtitle CodecID `S_TEXT/UTF8` not WEBVTT, NO subtitle CodecPrivate, NO BlockAdditions — mkvmerge-parity, validated against 白い熊's known-good daily jisho mkvs 2026-07-22; plus `frameRate` metadata → video DefaultDuration) with tracks `aligned` (default) + `asr`; in-memory chunked-Range download (≤400 MB guard); stream pick muxed itag 18/22 (Invidious `formatStreams` fallback); Android: SAF-picked study folder (`studyDirectoryTree` setting) + explicit intent `shiroikuma.jisho.intent.action.STUDY_VIDEO` (contract in jisho repo's `hand-off.md`); DESKTOP: same pipeline, folder asked once via main-process picker on first write (`studyFolderPath` setting, IPC `WRITE_TO_STUDY_FOLDER` returns the path, protected against renderer writes like the screenshot folder), then spawns `/usr/bin/shiroikuma-yosuga <file>` via IPC `OPEN_IN_YOSUGA` (path restricted to the study folder) — no hand-off needed | `helpers/study-subtitles.js` + `study-mux.js` + `study-export-common.js` (pure/shared), `helpers/android/study-export.js`, `helpers/study-export-desktop.js`, `FreeTubeJavaScriptInterface.kt`, `src/main/index.js` + `src/preload/interface.js` IPC, `Watch.js` `handleStudyExport`, manifest `<queries>` |
| UI settings page: kxkb look + Export/Import + 保存復元 automation (Android) | The 白い熊 UI settings page is laid out after the futokxkb Keyboard UI page — thin full-width accent hairline between sections, headings underlined to the TEXT width (`inline-block` + `border-block-end`), 1 / 1.5 / 2 / 2.5 em indent ladder (kxkb's 36/54/72/90 dp). Its FIRST section is Export / Import (Kōjiki flow): a SAF backup folder (red when unset, on the page row and in the panel), the newest backup queried on open, a category checklist with `settings` as a parent over ten logical slices plus profiles / playlists / history / search history, and an ArcaneChat action row (round pills, Cancel alone left, Import + Export right). Finished export/import raises a black/yellow-bordered info dialog whose OK (or `Later`/`Restart now`) closes the whole chain — dialog, panel and the UI settings page; failures leave the panel open. The two automation rows (switch, default OFF + tap-to-copy token with Regenerate) sit inside that same section. The export CORE is Kotlin, not JS — it folds the append-only nedb `.db` files (honouring a relocated data dir via `data-location.json`) into ONE `shiroikuma-jiyudoga_<yyyy-MM-dd_HH-mm-ss>.zip` (`manifest.json` + `<category-id>.json`), so the token-gated `EXPORT_STATE` / `LIST_CATEGORIES` broadcasts work headlessly with no Activity; the panel is a thin JS client of the same core, and `StateCategories` is the single source of truth for the category list. Import APPENDS nedb lines (upsert per `_id`) and asks for a restart. `subscription-cache` is deliberately not exportable. Token + backup folder live in the `jiyudoga_backup` prefs file, never in the ZIP. `LIST_CATEGORIES` emits the contract's fourth field (`id⇥label⇥parent⇥on|off`, third field empty at top level) from `BackupCategory.defaultSelected` — all `on` here, and the in-app picker seeds its ticks from the same flag. A third action `CANCEL_EXPORT` (token-gated, optional `reply_id`, answers NOTHING — not even a gate error, since a reply would carry the export's `reply_id`) raises a `@Volatile` flag in `ExportControl` that the write loop checks between entries; `BackupWriter` deletes the incomplete file on every non-success path (no `.part` intermediate — SAF `createFile` rewrites the extension from the MIME type), and the export replies `ERROR:cancelled`. Both export paths register with `ExportControl`, so the panel's run is cancellable too. Desktop shows the restyle but not the Export/Import section. | `backup/StateCategories.kt` + `StateBackup.kt` + `NedbFile.kt` + `BackupWriter.kt` + `AutomationAuth.kt` + `StateExportReceiver.kt`, `helpers/SafPaths.kt`, `FreeTubeJavaScriptInterface.kt` backup region, `SkuiSettings.vue/.css`, `SkuiExportImport.vue/.css`, manifest receiver + `MANAGE_EXTERNAL_STORAGE` |
| Version in the top bar + collapsed Android search | the running `process.env.FORK_VERSION` sits BESIDE the app name (not under it, as in mahōjūtan), at a fixed **12 px** — never an `em`, since the bar is a fixed 60 px — split on the `+` group separators into nowrap spans, so it may only wrap between groups: `36ch` caps it to two groups per line, i.e. two lines. **`text-size-adjust: none` is mandatory**: the WebView loads the page scaled down, and Chrome's font boosting inflated the block ~1.5× into four lines hanging out of the bar. It sits FLUSH against the name — `.logoText` is cut from 100 px to 64 px and drawn `left top`, because our `_icons/text*Small.svg` set `白い熊`/`自由動画` at `x=0` in 15 px type on a 100 px canvas (≈40 px of dead space), and the logo's trailing padding drops 25 px → 8 px. Desktop hides the version at ≤1250 px, where the bar's fixed 440 px search column would otherwise push the profile selector off the edge; it keeps its min-content width (no `min-inline-size: 0`), so a tight bar widens the side column rather than clipping the string. Android instead COLLAPSES the search box to its magnifying glass at every width (`collapsedSearch` class ⇐ `process.env.IS_ANDROID`) — upstream only does that below 680 px and the WebView viewport is far wider — expanding into the same fixed overlay below the bar, focused on open; the glass is `order: 1` so it follows the name+version instead of preceding them, and that freed column is the room the version occupies | `TopNav.vue`, `TopNav.scss` |

### Build commands
```bash
_scripts/build-fork.sh          # canonical: BOTH artifacts → ~/tmp + BUILD_NUMBER bump
# individual pieces (no copy / no bump):
pnpm run pack && node _scripts/build-fork-deb.mjs           # deb only
pnpm run pack:android && (cd android && ./gradlew assembleRelease)  # apk only
```

### Toolchain
- **pnpm** standalone at `~/.local/share/pnpm` (`export PNPM_HOME="$HOME/.local/share/pnpm"; export PATH="$PNPM_HOME:$PATH"`), **Node 24** via `pnpm env use --global 24` (host node is 18; upstream CI uses 24).
- **JDK 21** at `/usr/lib/jvm/java-21-openjdk-amd64` (host default java is 11 — always set `JAVA_HOME`). Android SDK at `~/android-sdk`.
- Android: Gradle wrapper 8.7, AGP 8.5.2, Kotlin 1.9.24, compileSdk/targetSdk 34, minSdk 29, arm64-v8a only.
- `pnpm install` needs network for the git-hosted `@seald-io/nedb` (MarmadileManteater's fork — the Android storage backend hooks into it).

## Architecture notes

- Desktop: upstream FreeTube — Electron main (`src/main/`), preload contextBridge
  (`src/preload/`), Vue 3 renderer (`src/renderer/`), nedb datastores (`src/datastores/`).
- Android: `android/` is a native Kotlin WebView app loading the webpack `web` bundle from
  `android/app/src/main/assets/` (generated by `pnpm run pack:android`, gitignored). The JS
  talks to Kotlin via the injected `Android` JS interface — webpack maps the `android` module
  to it (`externals` in `_scripts/webpack.android.config.js`); desktop builds alias it to
  `_scripts/android-stub.js` and prune all `process.env.IS_ANDROID` branches at compile time.
- Android-specific renderer code: `src/renderer/helpers/android/*`, `FtaLogViewer`,
  IS_ANDROID branches in `helpers/utils.js`, `DataSettings`, `Watch`, player, settings store.

## Hard rules
- **Never commit or push on your own.** Build and let 白い熊 test; commit/push only on an
  explicit **"Push"**.
- **Never `adb install`/`adb uninstall`** unless a skill explicitly authorizes it; every
  `adb push` goes to `/sdcard/tmp/` only; adb always UNSANDBOXED; disconnect wireless adb
  after every delivery batch (global rules).
- **The ⛔ proceed gate** in upstream-new-version is mandatory: descriptive new-features
  table first, 白い熊's "proceed" before any branch is touched.
- **No Claude attribution** in commits or PRs — no `Co-Authored-By: Claude`, no "Generated
  with Claude Code". End commit messages at the last line of the body.
- Keep our changes a small, legible layer: prefer porting our patch to upstream's new
  structure over forcing old diffs.
