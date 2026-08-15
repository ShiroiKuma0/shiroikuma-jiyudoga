# Changelog

This file carries **both** histories: 白い熊 自由動画's own releases, and — beneath them, whenever
either upstream starts shipping one — the upstream changelog, untouched. Neither
[FreeTube](https://github.com/FreeTubeApp/FreeTube) nor
[FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid) keeps a `CHANGELOG.md` in
its tree today (their history lives in their GitHub releases), so for now the fork's history is the
whole file. Our block always stays at the very top, so an upstream file arriving later inserts
below it and merges cleanly.

Entries are **per-release deltas** — only the first fork release, `0.25.1+7`, lists everything the
fork adds to stock. Each entry names the two upstream commits the build sits on; releases up to
`0.25.1.1+001` predate the base pins, and those up to `0.25.1+37` predate the zero-padded counter.
Both are left exactly as published.

---

## 白い熊 自由動画 `0.25.2+2026-08-12.19-51.g3fff3fd3+2026-08-12.20-35.gc42fee2c+025` — 2026-08-15

Built on FreeTube `3fff3fd3` (2026-08-12) + FreeTubeAndroid `c42fee2c` (2026-08-12) — neither
upstream moved since `+017`. One correction: an icon that said the wrong thing.

### Device sync

- **The sync control no longer wears the refresh button's glyph.** It was drawn with the same
  circle of arrows FreeTube's feed-refresh button uses — which floats a few centimetres away on
  the same screen, so two identical icons stood for two different actions: one merges state with
  the other device, the other fetches new videos from YouTube. The circle of arrows is the
  universal "reload" and belongs to the refresh button, so the sync control is the one that
  moved: a straight **⇄** with the word **Sync** (同期 in Japanese) beside it, behind a hairline
  that separates it from the grid sliders it shares the heading with.
- **The glyph and the word are one button** — a single hit target, a single hover, so the word
  is not a decoration you can click at and miss.
- **The working state is a pulse rather than a spin.** A straight double arrow that rotates
  reads as broken rather than as busy. The red mark for a sync that did not land is unchanged,
  as is the motionless fallback when the system asks for reduced motion.

## 白い熊 自由動画 `0.25.2+2026-08-12.19-51.g3fff3fd3+2026-08-12.20-35.gc42fee2c+024` — 2026-08-14

Built on FreeTube `3fff3fd3` (2026-08-12) + FreeTubeAndroid `c42fee2c` (2026-08-12) — neither
upstream moved since `+017`. One feature: the phone and the PC now keep the same watch history,
subscriptions and starred videos, without anyone exporting a zip.

### Device sync

- **History with watch progress, subscriptions across every profile, and starred videos now
  converge between the phone and the PC.** A video begun on one device resumes at the right
  position on the other; a channel subscribed on the PC appears on the phone. Playlists and
  search history are deliberately out of scope for this pass.
- **Each device publishes one snapshot of its own state and absorbs the other's** —
  `jiyudoga-phone.json` and `jiyudoga-pc.json`, in `/sdcard/jiyudoga-sync` on the phone and the
  app's own data folder on the PC. Neither device ever writes the other's file, so there is no
  file-level conflict to resolve.
- **The desktop is the only device that reaches across**, using the system `ssh` — one connection
  per direction, with an atomic rename on the far side so the phone can never read a half-written
  snapshot, and no dependency on `sftp-server`, which Termux does not always install. The phone
  opens no network connection at all, so syncing cannot hold its WiFi radio awake.
- **The two apps never have to be awake at the same moment.** Because the phone's snapshot is an
  ordinary file on shared storage, the PC can collect what the phone published hours after the
  phone's app was closed — the property that makes this converge in real use.
- **Merging is last-writer-wins per record**, decided by a new modification stamp rather than by
  which snapshot arrived last. The stamp had to be added because upstream's watch-progress write
  never touched `timeWatched`, so a video watched *further* on one device looked *older* than the
  same video on the other, and the stale position would have won.
- **Deletions are remembered rather than inferred.** Unsubscribing a channel, unstarring a video
  or clearing a history entry leaves a tombstone, so the removal propagates instead of the entry
  being handed back by the other device on the next sync. Tombstones are pruned after 180 days and
  ride along with profile export.
- **Nothing is written unless it would actually change something.** Comparing content rather than
  timestamps is what stops the two devices trading identical records back and forth forever, and
  it means a settled pair syncs silently.
- **No restart on either side** — the specific failing of the Export / Import route this replaces.
  Everything is applied through the app's ordinary machinery, so the open window updates in place.
- **Both databases are copied aside before the first merge**, once per device. Unioning two
  databases that have never met is the one step that syncing again cannot undo.
- **Triggers**: opening the app, returning to it, and about five seconds after the last
  watch-progress write. No background polling and no timer.
- **A sync button sits in the Subscriptions and History headings** — the two pages the sync is
  actually about — spinning while it runs, reddening if the last attempt did not land, and
  reporting what it merged. It is hidden entirely while the sync is switched off.
- **Settings**: a 同期 section in the 白い熊 UI page. Every value that names a machine is empty or
  generic by default and is excluded from backups, so nothing about one particular setup travels.
  `ssh` reads `~/.ssh/config` itself, so host aliases, keys and agents remain the user's own; a
  port is passed only when one is deliberately set, because forcing one overrides that config and
  makes an already-trusted phone look like an unknown host.

## 白い熊 自由動画 `0.25.2+2026-08-12.19-51.g3fff3fd3+2026-08-12.20-35.gc42fee2c+017` — 2026-08-14

Built on FreeTube `3fff3fd3` (2026-08-12) + FreeTubeAndroid `c42fee2c` (2026-08-12) — **both**
upstreams synced. The headline is that Android video playback works again.

- **Videos play on Android again.** Opening a subscription video left the watch page at `0:00`
  with no duration and a Play button that did nothing; the console said `Unable to play DASH
  formats. Reverting to legacy formats…`, and a video published that day has no legacy formats to
  revert to. Underneath was shaka error 3015 (`MEDIA_SOURCE_OPERATION_THREW`) — its wrapper for an
  exception thrown out of `addSourceBuffer` while the MediaSource was healthy, i.e. the WebView
  refusing a codec. Measured on-device, every `video/mp4; codecs="av01.*"` comes back false from
  `MediaSource.isTypeSupported` while avc1, vp9, opus and mp4a all come back true, and the device
  carries no AV1 decoder. Those variants survived shaka's own filtering anyway, because that asks
  MediaCapabilities, which reports AV1 as decodable in software — and `addSourceBuffer` is the one
  that decides. FreeTube 0.25.2's SABR path made it certain to bite: `av01` is first in
  `VIDEO_CODEC_PRIORITIES`, so AV1 was not merely offered but preferred. Both manifest builders now
  ask MediaSource directly and drop what it refuses — but only while a playable format of the same
  kind survives, since stripping a track type to nothing would trade a recoverable error for an
  empty manifest. Older uploads were unaffected throughout, because they still carry a progressive
  itag and quietly played on the fallback path, which is what made this look video-specific rather
  than app-wide.
- **The console log is readable, and shipped.** Every WebView console message was already captured,
  but the viewer was gated behind `!IS_RELEASE` — which every build we ship is — so a JS error on a
  real phone could not be seen at all: `ConsoleLogChromeClient` keeps the messages out of logcat,
  and remote debugging is off. The gate was in three places (the sidebar entry, the "More" entry,
  and the component's own root `v-if`, which would have rendered nothing even had the action been
  reachable); all three are gone. Entries are now tappable to select, with **Copy selected** and
  **Copy all** beside Close, copying through the native clipboard bridge — the shared helper needs
  a secure context and `file://` is not one, so it could only ever report that it cannot reach the
  clipboard. Copied text is the untouched original, oldest-first, each entry stamped with its time,
  level and source. Retention went 50 → 250 entries, since one shaka stack trace is a single entry
  and the cause sits well above it.
- **Both upstreams synced.** FreeTube brings a Tamil translation update. FreeTubeAndroid brings
  their own fix for the same 0.25.2 integrity-token breakage this fork had already fixed on
  2026-08-12, so the merge keeps the stronger half of each: their `Promise`-based BotGuard
  interface with a real reject path, their proper attestation document, and their
  `spoofDesktopUserAgent` as the home for our desktop agent — against our 15-second timeout (now
  guarding their reject path too, since `rejectToken` covers scripts that throw, not a WebView that
  never runs one), our fetch shim, and our agent composed from the WebView's own Chrome version
  with a fallback, so a user-agent that fails to match cannot silently leave the session on MWEB.
  `src/botGuardScript.js` deliberately stays at FreeTube's version: it is shared with the desktop
  build, and their rewrite swaps the interpreter fetch for a `<script>` tag with no error listener,
  which would hang the deb's poToken path. Keeping it also means keeping `BotGuardWebView`'s
  body-queueing, because that script still POSTs `/att/get` through fetch when the interpreter URL
  is absent and `shouldInterceptRequest` cannot see a request body.
- **The version carries both pins again.** FreeTubeAndroid merged FreeTube's `development` into
  their branch, which moved our merge-base onto a FreeTube commit and tripped the shared-history
  guard — a build made then would have dropped the FreeTubeAndroid pin entirely and sorted *below*
  `+011` for an upstream-tracking updater, reading as a downgrade. Syncing their branch restores it.
- **Two sources of console noise removed.** The Android soft file read is documented as returning
  `''` when a file does not exist, but warned with the exception anyway — and `data-location.json`
  only exists once the data directory has been moved, so every launch logged several screens of
  Java `FileNotFoundException` stack trace, burying whatever the log was open for. That one outcome
  is now silent; every other failure still warns. Separately, shaka 5's deprecated
  `preferredVideoCodecs` warned on every load, and is migrated to `preferredVideo` using the exact
  entries shaka's own compatibility shim builds, so the VR codec path is unchanged.

---

## 白い熊 自由動画 `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+011` — 2026-08-12

Built on FreeTube `86401956` (2026-08-11) + FreeTubeAndroid `4623e4a6` (2026-08-06) — the same two
upstream commits as `+010`. **Neither artifact changes functionally**: this release brings the
fork's own documentation back in line with the version it has been building since `+008`.

- **The versioning is now described as it is actually built.** Version strings moved to `+`-grouped,
  minute-resolution UTC pins in `+008`, and every description of them stayed on the previous
  dot-joined `.<date>.g<sha>` form: the README's versioning section, complete with an old-form
  example; the headers of two of the three build entry points; and both project build skills, which
  are what a fresh session reads before it builds or syncs anything. Two of those also still named
  FreeTubeAndroid's `release` branch, abandoned for `development` on 2026-08-02.
- **The README no longer describes the update check backwards.** It said the check sorts the
  upstream pins ahead of the build counter — the rule `+010` inverted, and had to: pins identify the
  commits a build sits on and cannot order builds, so both are now stripped from either side and the
  verdict comes from the version and the `+NNN` counter alone.

Earlier entries are left as published; each describes the form that shipped at its own version.

---

## 白い熊 自由動画 `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+010` — 2026-08-12

Built on FreeTube `86401956` (2026-08-11) + FreeTubeAndroid `4623e4a6` (2026-08-06) — the same two
upstream commits as `+009`. The in-app update check stops offering builds older than the one
running. Both artifacts are affected: the checker is shared code.

- **The update banner no longer offers a stale release.** On startup, `+010` was told that `+006` —
  a release from that same morning — was "now available". The version comparison split both strings
  on every `.`, `+` and `-` and aligned the segments positionally, so the verdict was reached inside
  an **upstream-base pin** and never got as far as the build counter. Pins identify the upstream
  commits a build sits on; they were never meant to order builds, and they cannot: their shape has
  changed twice, and rendering their timestamps in UTC in `+008` moved the same FreeTube commit's
  pin *backwards* from `2026-08-12` to `2026-08-11` — precisely the segment being compared. Builds
  are now ordered by the two fields that actually order them, the version and the `+NNN` counter,
  with the pins stripped from both sides first (in the current `+`-grouped shape, the legacy
  dot-joined one that older tags still carry, and the degraded `+g<sha>` form).
- **The newest release is now identified, not assumed.** The checker asked GitHub for one release
  and trusted it to be the latest. That list is documented as reverse chronological but does not
  arrive that way — ours returns `+006` ahead of both `+009` and `+008`, ordered by neither date nor
  id — so even a correct comparison was being handed the wrong release. A page of ten is fetched
  instead, drafts and prereleases dropped, and the newest picked by the same comparison.

---

## 白い熊 自由動画 `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+009` — 2026-08-12

Built on FreeTube `86401956` (2026-08-11) + FreeTubeAndroid `4623e4a6` (2026-08-06) — the same two
upstream commits as `+008`. A single follow-up fix to the collapsed Android search box that shipped
there; the desktop build is functionally unchanged, since the new code is compiled out of it.

- **A link opened with the app no longer lands under the search panel.** The collapsed search is a
  fixed overlay drawn **on top** of the page, and the only things that ever took it down were the
  magnifying glass itself and a submitted search — so a single tap kept it up for the whole life of
  the WebView, across every navigation. `MainActivity` is `singleTask`: a YouTube link opened with
  the app resumes that same page instead of reloading it, so the watch view was simply drawn
  underneath a panel opened at some earlier point, covering the top of the content and the side
  nav's Subscriptions row. Any navigation now closes the panel, watched on the route's full path so
  the desktop pays nothing for it, and the incoming link closes it directly as well — a link can
  resolve to the page already on screen, where nothing navigates and the watcher would never fire.

---

## 白い熊 自由動画 `0.25.2+2026-08-11.21-55.g86401956+2026-08-06.17-02.g4623e4a6+008` — 2026-08-12

Built on FreeTube `86401956` (2026-08-11) + FreeTubeAndroid `4623e4a6` (2026-08-06) — the same two
upstream commits `+006` sits on. Only their rendering changed, along with the top bar finally
saying which build is running.

- **The running version is on the main page.** The top bar never showed it. It now sits to the
  **right** of 白い熊 自由動画 — beside the name, not under it — at a fixed 12 px, split on the `+`
  group separators into unbreakable spans so a line break can only ever fall between groups, which
  lands the 62-character string on two lines. Two things had to be dealt with to get there. The
  WebView loads the page scaled down, so Chrome's font boosting inflated the block to roughly 1.5×
  the size asked for — four lines, hanging out of the 60 px bar — until `text-size-adjust: none`
  made 12 px mean 12 px. And our `_icons/text*Small.svg` set `白い熊` / `自由動画` at `x=0` in 15 px
  type on a 100 px canvas, so ~40 px of the logo's text box is empty: the box is cut to the glyph
  run and drawn from the left, and the logo's trailing padding drops from 25 px to 8 px, leaving
  the version flush against the name. The desktop hides it below 1250 px, where the bar's fixed
  440 px search column would start pushing the profile selector off the edge.
- **Android's search bar is a magnifying glass.** Upstream collapses the search box only below
  680 px and the WebView viewport is far wider, so the phone permanently carried a 440 px search
  field — exactly the room the version needed. The bar now shows a single glass button, ordered
  **after** the app name and version rather than before them; tapping it drops the search field
  full-width under the bar with the caret already in it, so the keyboard comes straight up, and
  submitting a search closes it again. The desktop keeps its search bar untouched.
- **Version strings group with `+` and pin to the minute.** Two upstream syncs in one day left two
  builds sharing a pin date, and the next field the sort reaches is the random sha — so the newer
  artifact landed wherever its hex happened to fall, even when the build counters differed
  (`g6c6f1aab+002` sorts before `g6d6f1aab+001`). Each pin now carries `HH-MM`, and `+` opens each
  top-level group — each pin, then the counter — while a pin's own date, time and sha stay
  dot-joined, since all three describe one commit. Both timestamps are now built from the raw epoch
  in **UTC** instead of each commit's own timezone, which is why FreeTube's pin reads
  `2026-08-11.21-55` here and `2026-08-12` in `+006`: the same commit `86401956`, rendered
  honestly. `~` was rejected as the group separator on three counts — `git check-ref-format`
  refuses it in a refname, so no release could ever be tagged; at `0x7E` it sorts above every
  digit; and dpkg reads it as the pre-release marker, ranking every fork build below bare upstream.
  `_` is not a legal character in a Debian version at all. All three entry points —
  `_scripts/fork-version.js`, `_scripts/build-fork.sh` and `android/app/build.gradle.kts` — were
  changed together and verified to emit identical strings.

---

## 白い熊 自由動画 `0.25.2.2026-08-12.g86401956.2026-08-06.g4623e4a6+006` — 2026-08-12

Built on FreeTube `86401956` (2026-08-12) + FreeTubeAndroid `4623e4a6` (2026-08-06).
FreeTube's `0.25.2` hotfix reworks how a video is started, and that one change broke playback on
Android outright and quietly turned the phone into a cookie-bearing client. Both are fixed here,
along with a third fault the rework merely exposed.

- **No YouTube tracking cookies on Android.** Since FreeTube's #9607 the local API fetches
  `youtube.com/watch` itself, and YouTube answers with **six `Set-Cookie` headers** —
  `VISITOR_INFO1_LIVE`, `__Secure-YENID`, `__Secure-YEC`, `VISITOR_PRIVACY_METADATA`, `YSC`, two
  of them expiring in 2027. Upstream deletes them in Electron's `onHeadersReceived`, which has no
  Android counterpart, so on the phone they were stored in the WebView jar and replayed on every
  later request. Every WebView the app creates now refuses cookies outright — `setAcceptCookie`
  blocks sending as well as accepting — third-party cookies are blocked per WebView, and whatever
  earlier builds persisted is purged once at launch. Nothing in the app logs in or reads
  `document.cookie`, so nothing is given up. Confirmed on-device, not inferred: `acceptCookie=false`
  and an empty jar across a session with working playback, against a request proven to carry all
  six headers.
- **Playback no longer hangs on the loading spinner.** BotGuard's fetch shim appends its
  interpreter `<script>` to `document.body`, but that document is two inline `<script>`s, so the
  shim runs while the parser is still inside `<head>` and `document.body` is `null`. It had always
  been wrong and never mattered: BotGuard used to fetch its challenge from `/att/get` first, and
  that round trip gave parsing time to reach `<body>`. #9607 passes the challenge in as an argument
  instead, so the fetch now lands immediately and throws. The script is appended to a node that
  exists, and its `load` listener is attached **before** the append, so a cached script can no
  longer fire the event with nothing listening — the same class of silent hang.
- **A failed poToken degrades instead of hanging.** BotGuard only ever reports success, so when its
  script died the Kotlin promise had no way to settle and the awaiting watch page waited for ever —
  an error that presented as an endless spinner rather than a message. It now times out after 15 s
  and rejects, which the caller already handles by playing untokenised.
- **YouTube serves the desktop client again.** YouTube picks what it serves from the user agent,
  and the stock WebView agent says `Mobile`, so `youtube.com/watch` returned the **MWEB** page.
  Harmless until #9607 built the whole Innertube session out of that page's `ytcfg` — leaving the
  session `MWEB` while the player, the poToken flow and the rest of upstream assume `WEB`. The main
  WebView now presents a desktop agent built around its **own** Chromium version, so it stays
  truthful about the engine and ages with the system WebView. The BotGuard WebView deliberately
  keeps the stock agent: claiming desktop Linux from inside an Android WebView is precisely the
  inconsistency it fingerprints for.
- **Adapted our Android poToken path to the new BotGuard contract.** `botGuardScript` grew from
  `(videoId, context)` to `(videoId, context, initialAttestationData, ytConfig)`; the widening runs
  the whole length of the chain — `local.js`, `potokens.js`, the `@JavascriptInterface` and the
  runtime script-baking in `FreeTubeJavaScriptInterface.kt`. The branch also had to be re-plumbed
  off the `webInnertube` session the rework deletes, onto the HTML-derived session and the
  standalone player.
- **From upstream** (FreeTube `0.25.2`, a hotfix for the `Reloading player according to SABR
  request` errors): the poToken challenge and `ytcfg` are now read out of the watch-page HTML, with
  `/player` and `/next` taken from it too when present (#9607, with `bgutils-js` `4.0.2` → `4.0.3`);
  the fabricated session sets a screen width rather than a time zone (#9627); **Disable channel
  links** now also covers the subscription avatars in the side nav and on Subscribed Channels
  (#9395); Norwegian Bokmål translations. Our long-press-Settings deep link and upstream's new
  channel-link guard now sit side by side in `SideNav.vue`.
- **Housekeeping**: `runDecipherScript` no longer wraps an async Promise executor — the repo's own
  pre-commit `eslint` gate rejected the file as soon as this sync touched it — and its timeout is
  cleared on both paths instead of leaking.
- FreeTube released `0.25.2`, which outranks FreeTubeAndroid's `0.25.1.1` respin, so `FORK_VERSION`
  becomes `0.25.2` and the counter resets to `1`; this is the sixth build at that version. The
  respin component drops without a phantom downgrade — `0.25.2` sorts above `0.25.1.1` for `dpkg`
  and the `versionCode` rises across the reset all the same (`25011021` → `25020006`).
  FreeTubeAndroid did not move, so its pin holds at `2026-08-06.g4623e4a6`.

## 白い熊 自由動画 `0.25.1.1.2026-08-11.g1cec704e.2026-08-06.g4623e4a6+021` — 2026-08-11

Built on FreeTube `1cec704e` (2026-08-11) + FreeTubeAndroid `4623e4a6` (2026-08-06).
A **pure upstream-sync release** — no fork work, and no patch needed re-porting. It carries the two
FreeTube syncs made since `+019`, because the `+020` build was never published.

- **Quiz posts whose options wrap no longer stretch the radio circle** (FreeTube #9609). The marker
  is barred from shrinking as a flex child, so an option running to a second line leaves it round
  instead of squashing it into an ellipse; two now-unused classes leave `FtCommunityPoll`'s CSS
  with it.
- **Runtime dependencies**: Electron `43.2.0` → `43.3.0` (#9613) and Vue `3.5.40` → `3.5.41`
  (#9614), both patch-level. The Electron bump reaches the `.deb` alone — the Android build is a
  native WebView wrapper, not an Electron one. swiper `14.0.7` → `14.1.0` (#9615) rides along,
  unused by our layer.
- **Build tooling only**, with no runtime effect: terser `5.49.1` → `5.49.2` (#9616), postcss
  `8.5.25` → `8.5.26` (#9612), eslint `10.8.0` → `10.8.1` with eslint-plugin-yml `3.8.0` → `3.8.1`
  (#9611), and `globals` joining upstream's eslint dependabot group (#9610).
- FreeTubeAndroid did not move, so its pin holds at `2026-08-06.g4623e4a6`. Neither upstream
  released, so `FORK_VERSION` stays `0.25.1.1` and the counter continues. Android `versionCode`
  `25011021`.

## 白い熊 自由動画 `0.25.1.1.2026-08-10.g3b675980.2026-08-06.g4623e4a6+019` — 2026-08-10

Built on FreeTube `3b675980` (2026-08-10) + FreeTubeAndroid `4623e4a6` (2026-08-06).
A **pure upstream-sync release** — no fork work, and no patch needed re-porting.

- **Opening a playlist from a user playlist no longer loads the view twice** (FreeTube #9525). The
  route watcher resets the view state before the debounced fetch, and the three
  `selectedUserPlaylist` watchers are gated behind `isUserPlaylistRequested`, so user-playlist store
  churn stops re-firing `getPlaylistInfo` for a remote playlist. The flicker goes with it.
- **Translations**: English (United Kingdom) back to 100 % (987 strings — the always-on viewing
  modes, the settings-file import/export block, "Move Video to the Top/Bottom", "Loading replies"),
  and Bulgarian now names itself `Български` in the language picker. Both files are ones this fork
  rebrands; the incoming lines sit elsewhere in each, so all 25 白い熊 自由動画 strings survived
  untouched on both sides.
- FreeTubeAndroid did not move, so its pin holds at `2026-08-06.g4623e4a6`. Neither upstream
  released, so `FORK_VERSION` stays `0.25.1.1` and the counter continues. Android `versionCode`
  `25011019`.

## 白い熊 自由動画 `0.25.1.1.2026-08-08.g6bd8b322.2026-08-06.g4623e4a6+018` — 2026-08-09

Built on FreeTube `6bd8b322` (2026-08-08) + FreeTubeAndroid `4623e4a6` (2026-08-06) — unchanged
since `+014`, so this is fork work only.

- **Hide upcoming**, a feed-filter rule that is not about profiles: premieres and scheduled streams
  can be thinned out of the feed, saved into a pill like every other rule. It filters videos rather
  than channels, so applying it never refetches the feed or disturbs the Similar tab's seeds, and it
  runs before the per-channel caps so a capped group spends its slots on videos that actually play.
  Upcoming means the backend's `isUpcoming`/premiere flag **plus** a premiere date still in the
  future — the date alone would wrongly hide videos Invidious still stamps with an old
  `premiereTimestamp`.
- **Editing a saved pill**: right-click on the desktop, or keep holding past the delete window on
  Android, opens it in the panel prefilled and outlined dashed; the edit applies live and saving
  rewrites the pill in place, keeping its position and staying applied. Touch deliberately avoids
  `contextmenu` (Android raises it mid-hold, where it would steal the drag and the delete) and uses
  a second press timer instead.
- **A new view starts at the top**: switching profile or pill returns the Subscriptions view to the
  top and drops the extra pages it had loaded. Scoped to that view, so applying a pill while
  watching a video does not yank the page around.

## 白い熊 自由動画 `0.25.1.1.2026-08-08.g6bd8b322.2026-08-06.g4623e4a6+017` — 2026-08-08

Built on FreeTube `6bd8b322` (2026-08-08) + FreeTubeAndroid `4623e4a6` (2026-08-06).

- **Feed filter pills** — set algebra over the profiles, saved as named pills in the top bar. Each
  profile cycles **neutral → + → − → cap N**: `+` contributes its channels, `−` removes them, and
  `cap N` keeps a flooding group in the feed at its N newest videos per channel (composing with
  "only show latest from channel" — the tighter limit wins). A cap implies inclusion, membership
  grants no exemption from a cap, and where two capped groups share a channel the more permissive
  cap wins. Tap to apply, hold to drag-reorder, hold and release to delete with tap-to-undo. The
  panel edits a live draft with a mandatory name, so what is applied is always either nothing or
  exactly one named pill — never an invisible filter. It is a **view mask, not a profile**: only the
  Subscriptions feed tabs and the Similar tab's seeds read it, so subscribing, starring and the
  channel lists never depend on what is being viewed.
- **全 — a settable name for the "All Channels" bubble**, applied everywhere the profile is shown.
- **Publication dates on a channel's Shorts tab**, which neither backend provides directly.

## 白い熊 自由動画 `0.25.1.1.2026-08-08.g6bd8b322.2026-08-06.g4623e4a6+014` — 2026-08-08

Built on FreeTube `6bd8b322` (2026-08-08) + FreeTubeAndroid `4623e4a6` (2026-08-06).

- **The Similar tab now takes correction.** Two always-visible buttons on every tile (no hover gate,
  so they work on the phone): **⊘ never show this channel here** and **👎 fewer videos like this**.
  "Fewer like this" hides the video, learns the words its title was phrased with, and blames the
  seed that produced it — seeds only when provenance is narrow (at most two seed channels), and a
  seed retires after three rejections. Learning is conservative: CJK bigrams plus Latin words (so
  Japanese needs no tokeniser), and a candidate hides only on two matching terms with combined
  weight three.
- **Ranking by agreement**: candidates keep their seeds and how many distinct seeds agreed on them,
  and the tab ranks by that first, date second, with a minimum-agreement threshold and a plain
  newest-first mode available.
- **Provenance on every tile** — a "Because of `<channel>`" line, plus "Stop basing suggestions on
  `<channel>`" in the ⋮ menu.
- **Starred videos now seed**, up to six of the twenty — the profile's only explicit "more of this".
- Everything is **undoable** from its toast, scoped **per profile** (All Channels read alongside),
  and **reviewable** in a new *Similar tab* section of the UI settings page.
- **Export / import now really carries everything.**
- Upstream sync: FreeTube `f70dac7a` → `6bd8b322`.

## 白い熊 自由動画 `0.25.1.1.2026-08-06.gf70dac7a.2026-08-06.g4623e4a6+011` — 2026-08-06

Built on FreeTube `f70dac7a` (2026-08-06) + FreeTubeAndroid `4623e4a6` (2026-08-06).
A **pure upstream-sync release**, and unlike `+010` not Android-only — both fixes are
renderer-side, so the `.deb` and the APK each gain them.

- **Tag inputs no longer duplicate a tag** when click or Enter is spammed: `FtInputTags` awaited its
  async add without guarding re-entry, so a fast second press re-ran the handler before the list had
  updated. An `isUpdating` ref gates it and disables the input, released in a `finally` so a failed
  add cannot wedge the field (FreeTube #9511).
- **Playlists holding only some of the videos being copied are selectable again**: the predicate is
  split, so only playlists already holding **every** video are disabled (FreeTube #9560).
- Welsh, Chinese (Traditional), Russian, Slovak and Basque translation updates. Two touched lines
  this fork rebrands and were resolved to keep 白い熊 自由動画 while taking upstream's improvement —
  Slovak's real translation of *Popout Live Chat*, and zh-TW's CJK/Latin spacing.

## 白い熊 自由動画 `0.25.1.1.2026-08-03.gf6991367.2026-08-03.gc5f69328+010` — 2026-08-04

Built on FreeTube `f6991367` (2026-08-03) + FreeTubeAndroid `c5f69328` (2026-08-03). Android-only.

- **The launcher icon draws at 85.5 % of its former size** — it sat noticeably larger than its
  neighbours. Both adaptive-icon layers (`<foreground>` and `<monochrome>`) wrap the artwork in an
  `<inset>` of 7.25 % per side inside the same 108 dp canvas. The vector
  `drawable/ic_launcher_foreground.xml` is deliberately untouched, because `values-night-v31` and
  `values-night-v33` reuse it as `windowSplashScreenAnimatedIcon` — scaling its paths would have
  shrunk the Android 12+ splash icon too.

## 白い熊 自由動画 `0.25.1.1.2026-08-03.gf6991367.2026-08-03.gc5f69328+008` — 2026-08-03

Built on FreeTube `f6991367` (2026-08-03) + FreeTubeAndroid `c5f69328` (2026-08-03).
A **pure upstream-sync build** — both upstreams moved, nothing in the fork's own layer changed, and
both merges applied without a conflict.

- **The BotGuard WebView starts with a cold cache** (FreeTubeAndroid `c5f69328`): it clears its
  cache in its `init` block, so every PO-token generation begins clean instead of inheriting stale
  BotGuard assets that yield a token YouTube rejects. Not free — `WebView.clearCache()` is
  documented as per-application, so the main WebView's resource cache is dropped with it and
  thumbnails and API responses are re-fetched more often. Android-only; desktop is untouched.
- FreeTube contributed two Weblate commits (Azerbaijani 49.8 % → 50.7 %), no code.

## 白い熊 自由動画 `0.25.1.1.2026-08-02.gdc7c4e2e.2026-07-30.gfea7a050+007` — 2026-08-03

Built on FreeTube `dc7c4e2e` (2026-08-02) + FreeTubeAndroid `fea7a050` (2026-07-30). Neither
upstream moved; fork work only.

- **Running in the background is now opt-in, and off by default.** The Android layer started its
  keep-alive **foreground service** unconditionally from `MainActivity.onCreate`, holding it (and
  its mandatory notification) from first launch with no way to stop it — inherited upstream
  behaviour. It is now a switch in Settings › General that starts and stops the service
  immediately. The flag lives in its own `SharedPreferences` file, because `onCreate` must answer
  "start it?" long before the WebView and the nedb settings database have loaded. Trade-off, stated
  in the tooltip: that service is what stopped Android killing the backgrounded app, so playback
  after leaving the app may now be cut short. The media-controls notification is separate.
- **The notification says which app it belongs to** — it read "FreeTube is running in the
  background.", the last user-visible `FreeTube` string in the app. It now interpolates `app_name`
  from string resources, so it cannot drift from the launcher label; its channel is
  「バックグラウンド実行」.
- **Fixed: the Show Tap Highlight row printed its own key** — the Android-only toggle asked for
  `General Settings.Show Tap Highlight`, one level above where its neighbours live and undefined in
  every locale. Repointed and defined in `en-US` and `ja`.

## 白い熊 自由動画 `0.25.1.1.2026-08-02.gdc7c4e2e.2026-07-30.gfea7a050+005` — 2026-08-02

Built on FreeTube `dc7c4e2e` (2026-08-02, up from `435ac348`) + FreeTubeAndroid `fea7a050`
(2026-07-30).

- **Fixed: every release looked like an update.** `+003` and `+004` showed a permanent "Version … is
  now available!" banner advertising a release *older* than the one running. The update check
  splits on `.`/`+`/`-` and compares segments positionally — and the version compiled into the app
  lacked the pins, because the commit that introduced them taught the three artifact build entry
  points and missed the module feeding `process.env.FORK_VERSION` into the webpack bundles. So the
  pin's **year** was compared against the **build counter** (`2026 > 4`) and the comparison returned
  "newer" every time, in perpetuity, for any published release. The version string is now computed
  in one place for both the bundles and the `.deb`, so the pins sort ahead of the counter: newer
  upstream wins with a lower counter, older loses with a higher one. Side effect: the About page
  matches the artifact filenames again.
- FreeTube brought Azerbaijani translation updates only.

## 白い熊 自由動画 `0.25.1.1.2026-08-02.g435ac348.2026-07-30.gfea7a050+003` — 2026-08-02

Built on FreeTube `435ac348` (2026-08-02) + FreeTubeAndroid `fea7a050` (2026-07-30).

- **The version now names both upstream base commits.** Both upstreams are tracked by branch, not by
  release, so no version literal said which commit a build contained — FreeTube's `0.25.1` stands
  still across hundreds of development commits. The versionName carries one **base pin** per
  upstream, `.<base commit date>.g<8-char sha>` from `git merge-base HEAD <ref>`, FreeTube first.
  The date is the base commit's own committer date, never build time, so builds on one base share a
  pin and names still sort chronologically. Pins are recomputed from git by every build entry point
  and never stored, degrading independently (no date → `.g<sha>`, no ref → that pin dropped, no git
  → none), so a build never fails over a missing sha. `versionCode` is untouched.
- **A shared-history guard** suppresses the FreeTubeAndroid pin while its merge-base is an ancestor
  of `master`: their `development` merges FreeTube's into itself, so before their branch is merged
  the newest shared commit is a *FreeTube* one, and pinning it would name the wrong upstream.
- **Upstream tracking switched to FreeTubeAndroid's `development`** branch, where their current work
  lands, instead of `release`.

## 白い熊 自由動画 `0.25.1.1+001` — 2026-08-02

- **A versioning release: no functional change.** The same code as `0.25.1+039`, rebuilt and
  republished under a version that says what it contains — `FORK_VERSION` adopts FreeTubeAndroid's
  `0.25.1.1` release tag, the higher of the two upstreams' versions, so the updater sees no phantom
  update. The counter resets to `001`, and the `versionCode` respin digit keeps the code rising
  across that reset.

## 白い熊 自由動画 `0.25.1+039` — 2026-08-01

- **A dual-upstream sync release**: 72 FreeTube `development` commits, plus FreeTubeAndroid's
  `0.25.1.1` — their **Kotlin refactor** of the Android wrapper — merged and adapted to the current
  FreeTube, keeping the desktop Electron build alive alongside it.
- Packaging work to match.

## 白い熊 自由動画 `0.25.1+37` — 2026-07-30

- **The 保存復元 backup contract gains two things**: every category now states whether it starts
  ticked (`id⇥label⇥parent⇥on|off`) instead of leaving the picker to assume, and an export can be
  **cancelled for real** — a token-gated `CANCEL_EXPORT` raises a volatile flag the write loop
  checks between entries, and the half-written archive is deleted on every non-success path.

## 白い熊 自由動画 `0.25.1+36` — 2026-07-30

- **A channel's tab survives Back.** Watching a video from a channel's Shorts tab and pressing Back
  dropped you on the channel's *first* tab — Home, or Videos where there is no home data — and the
  same went for Live, Playlists and Posts. The selected tab now lives in the history entry itself,
  so Back returns exactly where you left.

## 白い熊 自由動画 `0.25.1+35` — 2026-07-26

- **A video download button** on the watch page, writing a Matroska file with YouTube's **chapters
  embedded** as a real `Chapters` element ahead of the first cluster (every shifted byte offset
  corrected), so mpv, VLC and mpvEx list and seek them. Filenames come from an editable `yt-dlp`
  style template with a live preview, into a folder asked for once.

## 白い熊 自由動画 `0.25.1+34` — 2026-07-25

- **The UI settings page gets the futokxkb page look**: thin full-width accent hairlines between
  sections, headings underlined to the text width, a 1 / 1.5 / 2 / 2.5 em indent ladder.
- **Export / Import** as its first section: a SAF backup folder, the newest backup queried on open,
  a category checklist (`settings` as a parent over ten slices, plus profiles, playlists, history
  and search history) and an ArcaneChat-style action row. The core is **Kotlin, not JS** — it folds
  the append-only nedb `.db` files into one timestamped zip (`manifest.json` + `<category-id>.json`),
  so the export works headlessly with no Activity; the panel is a thin client of the same core.
  Import appends nedb lines (upsert per `_id`) and asks for a restart. `subscription-cache` is
  deliberately not exportable.
- **The 保存復元 automation contract** so a sister automation app can trigger that backup
  unattended: token-gated `EXPORT_STATE` / `LIST_CATEGORIES` broadcasts, with the token and backup
  folder in their own prefs file, never in the zip.
- **A long press on the hamburger** opens the UI settings page directly; **black system bars**.

## 白い熊 自由動画 `0.25.1+29` — 2026-07-25

- **Starring works again on every profile** — it silently died after the first starred video.
- **The launch splash is black** instead of grey, on both the light and the dark system theme.

## 白い熊 自由動画 `0.25.1+27` — 2026-07-22

- **The language-study export**: one tap turns a video into a subtitled `.mkv` and opens it in the
  study player — shiroikuma-jisho on Android (SAF folder + explicit intent), shiroikuma-yosuga on
  the desktop (folder asked once through the main process, then spawned on the file). The subtitle
  engine builds study SRTs from the caption track's own timing (`fmt=json3` word timing, `fmt=srt`
  fallback) on an **ASR-skeleton** architecture: native cue timing is never repositioned, while a
  verbatim transcript in the description is DP-aligned and text-spliced per cue over its covered
  region, so homophone-kanji errors are corrected (陰安 → 円安) and nothing spoken is dropped. Cues
  split at 。！？「」・ with times interpolated from real token timestamps, gap extension is
  speech-rate-capped so music and silence stay bare, `[音楽]`-style tags are filtered, and the
  output is one `<date> <title>.mkv` — the progressive stream remuxed without re-encoding through a
  patched `mediabunny` at mkvmerge parity — carrying an `aligned` and an `asr` track.
- **Android local-API repairs**: n/sig evaluation and poToken.
- **Grid tuning sliders** next to the Subscriptions heading — thumbnail width, title font size,
  title max lines (the bases the zoom multiplies) — plus a Profile Select row-padding slider.
- **Theatre mode on Android**, pinned into the player's bottom row in the compact layout and applied
  at every viewport width (upstream gated it at ≥1051 px, so it silently no-opped on the scaled
  WebView viewport).

## 白い熊 自由動画 `0.25.1+9` — 2026-07-22

- **The Similar tab** — per-profile channel discovery: a date-descending feed of watch-next
  recommendations from channels the profile does not follow, seeded from the newest ~20 cached
  subscription videos (max 2 per channel, so seeds cost no extra requests), fetched 6-way
  concurrently, session-cached per seed and per profile, deduplicated and filtered of subscribed
  channels. Local API through a next-endpoint-only helper (no player setup, no poToken) with
  Invidious fallback.
- **Starred videos + the Starred tab**: a ☆/★ toggle on the watch page, per profile, mirroring
  subscription semantics (star → active profile **and** All Channels; unstar in All Channels removes
  everywhere). Stored on the profile documents, so it rides along with profile export and sync. Gold
  badge bottom-left on every tile; the tab lists videos and shorts together, newest-starred first.
- **Original-language video descriptions**: the same next-endpoint machinery auto-translates
  descriptions. When the player title and the next-endpoint title differ — the reliable signal that
  translation is active — the watch page shows the untranslated player description instead, still
  autolinked. Local API path only.

## 白い熊 自由動画 `0.25.1+7` — 2026-07-21

The first fork release: FreeTube `0.25.1` (development tip) with the FreeTubeAndroid `0.24.1.1`
Android layer grafted on, both artifacts built from one repo.

- **Original-language video titles.** YouTube auto-translates titles server-side by request
  language with no opt-out. Every visible tile — search, subscriptions, channel pages, playlists,
  trending, recommendations, community posts — resolves its untranslated title through oEmbed
  (session-cached, max 6 concurrent, fetched only for tiles that become visible, silent fallback for
  deleted/private/no-embed videos), and the watch page prefers the player response's
  `basic_info.title` over the auto-translated `next`-endpoint title. The Invidious watch path is
  restored the same way. Side effect: history and playlist entries save original titles.
- **Live grid zoom.** `Ctrl` + wheel on the desktop (Chromium reports laptop-touchpad pinch as a
  Ctrl-wheel, so pinch works too) and two-finger pinch on Android, applied live during the gesture.
  One 0.4×–3× scale drives tile minimum width, title and info line, with the column count reflowing;
  persisted per device with a debounced write, and ignored over the player, which keeps Ctrl-wheel
  for playback rate.
- **The 白い熊 自由動画 UI settings layer (skui)** as the first Settings section, in the sister-repo
  ThemeActivity style: Section → Group → Slot over Foundation, Typography, Top bar, Side nav, Cards
  & links, Shape & lines. Defaults inherit from the foundation colours (background `#000000`,
  text/accent/border `#FFFF00`) — secondary text = text @ 60 %, hover = text @ 12 % — and only
  explicit overrides persist, each with a reset and an overridden marker. Colour rows carry four
  RGBA sliders over a checkerboard, an old/new preview pair and app-wide recent-colour boxes; fonts
  can be imported as external `.ttf`/`.otf` and render in their own glyphs (Android gained a
  `readFileBase64` JS-interface method so binary fonts survive the transfer); border, roundness and
  divider sliders go down to 0. Everything previews live and persists on release.
- **Dual-artifact packaging**: a GNU/Linux amd64 `.deb` and a signed Android arm64-v8a APK from one
  repo, at one version, with the app id `shiroikuma.jiyudoga` so it installs side-by-side.
