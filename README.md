<div align="center">

<img src="_icons/512x512.png" width="120" alt="白い熊 自由動画 app icon" />

# 白い熊 自由動画

**A private YouTube client — on the desktop *and* on the phone, from one repo.**

白い熊's fork of [FreeTube](https://github.com/FreeTubeApp/FreeTube) (AGPL-3.0) with the
Android layer of [FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid)
grafted on and maintained against the current FreeTube development tip, plus **major
additions**: a one-tap **language-study export** (subtitled mkv into
[shiroikuma-jisho](https://github.com/ShiroiKuma0/shiroikumanojisho) /
[shiroikuma-yosuga](https://github.com/ShiroiKuma0/shiroikuma-yosuga)), a **video download**
button that writes chapter-preserving mkv files, original-language titles & descriptions, a
channel-discovery **Similar** tab, per-profile video **starring**, live grid zoom with tuning
sliders, theatre mode on Android, full-width views, a sister-repo-style UI theming layer, and
a **one-zip backup** of the whole app that a sister automation app can trigger unattended.
Every release builds **both** artifacts:

- **GNU/Linux amd64 `.deb`** (Electron; installable on Tuxedo OS / Ubuntu / Debian)
- **Android arm64-v8a APK** (native Kotlin WebView wrapper; installs side-by-side with any
  other client as package `shiroikuma.jiyudoga`)

**📥 Latest release: [`0.25.1.1.2026-08-02.g435ac348.2026-07-30.gfea7a050+003`](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases/latest)** — [all releases & downloads »](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases)

</div>

---

## 🎓 One-tap language-study export

The killer feature for language learners: a graduation-cap button on every watch page turns
the video into study material. It downloads the clip and builds **two subtitle tracks** from
YouTube's caption timing — the raw auto-captions, and (when the description carries a
verbatim transcript, as Japanese news channels do) a **corrected track** where the ASR's
homophone-kanji errors are spliced away using the description text, per cue, without ever
touching the native timing. Everything is muxed into a single standard `.mkv` (SubRip
tracks, mkvmerge-grade structure) saved to your study folder — then the right study player
opens automatically: **shiroikuma-jisho** on Android (via intent), **shiroikuma-yosuga**
(our Memento fork) on the desktop. Replay line by line, tap words for dictionary lookups —
from news feed to language lesson in one tap.

## ⬇️ Download videos — as mkv, with the chapters intact

A download button sits beside the share icon on every watch page. It grabs the best
video-only and audio-only streams YouTube will hand over — the `bestvideo+bestaudio` of
`yt-dlp`, and the reason the output is Matroska, since YouTube pairs mp4/AVC video with
WebM/Opus audio, a combination mp4 cannot legally hold — and passthrough-remuxes them into
one file without re-encoding a single frame. When a session serves playback over SABR and
hands out no fetchable stream URLs, it falls back through Invidious to the muxed progressive
stream rather than failing.

The point of the exercise is **chapters**. YouTube's chapter markers are written into the
file as a real Matroska `Chapters` element, so mpv, VLC and mpvEx list them, mark them on the
seekbar and jump between them. Getting that right meant hand-building the EBML and putting it
*ahead of the first cluster* — players parse level-1 elements only that far and resolve
anything later through a fixed-size SeekHead — then correcting every byte offset the
insertion shifts.

Files land in a folder you're asked for once (SAF picker on Android, native picker on the
desktop) under a **`yt-dlp` style filename template** you can edit, previewed live in the UI
settings page:

```
%(title)s %(upload_date)s (%(channel)s).%(ext)s
→ Monster Kettlebell Workout Motivation. Lift 100kg … 2022-07-02 (WestportBattlebells).mkv
```

## 🈶 Original-language titles & descriptions

YouTube silently translates video titles — and descriptions — server-side into the request
language: a Japanese or Russian video shows up with a machine-translated English title and
description. This fork restores the **original text everywhere**: every visible video tile
resolves its untranslated title through YouTube's oEmbed endpoint (cached, throttled, zero
extra requests for tiles you never scroll to), and the watch page reads the player
response, which always carries the original — title *and* description (links and
timestamps stay clickable). Watch a trilingual feed — 日本語, русский, English — and every
word is the one its creator wrote.

## 🧭 Similar tab — discover channels per topic

Every profile groups subscriptions by topic; the new **Similar** tab in Subscriptions turns
that into a discovery engine. It takes the newest videos across the profile's channels,
collects YouTube's "watch next" recommendations for them, throws away everything you're
already subscribed to, and shows the rest as a date-ordered grid — related videos from
**channels you don't know yet**, matched to the profile's topic. Visit one, like it,
subscribe it into the profile.

## ⭐ Star videos, per profile

A star button on the watch page (in front of "+") marks any video or short as starred in
the active profile. Starred videos carry a gold star on their tile thumbnails, and the
**Starred** tab collects them per profile, newest-starred first — a lightweight favorites
layer that travels with your profiles on export and sync.

## 🔍 Live grid zoom + tuning sliders

Resize the video grid **on the fly**: `Ctrl` + mouse wheel on the desktop (laptop touchpad
pinch works too), two-finger pinch on Android. Thumbnails, titles and info lines scale
together and the column count reflows; the chosen size (0.4×–3×) persists per device. A
sliders popup next to the Subscriptions heading tunes the bases the zoom multiplies:
thumbnail width, title font size and **title max lines** (so big fonts don't make tiles
arbitrarily tall) — plus a matching slider for the Profile Select row padding, right in the
dropdown.

## 🎭 Theatre mode everywhere

Theatre mode works on Android exactly like on the PC — pinned into the player's bottom row,
functional at every viewport width (upstream silently disabled it on scaled mobile
viewports): the video stretches across the full row and Up Next moves below.

## 🖥️ Full-width, unframed views

No wasted flanks: the browsing views — subscriptions, trending, search, channels, playlists,
history — fill the whole window instead of a bordered 85 %-wide card.

## 🎨 白い熊 自由動画 UI settings layer

A first-class Settings section in the sister-repo (denwa / messeji) style: foundation colors
(black `#000000` / yellow `#FFFF00`) with every other slot inheriting until overridden, RGBA
slider color rows with recent-color boxes, external `.ttf`/`.otf` font import with live
glyph preview, font-weight and UI-size sliders, and border / roundness / divider widths all
the way down to 0 — everything previewed live as you drag. The page itself is laid out like
the futokxkb keyboard UI page: thin hairlines between sections and headings underlined to
the width of the text, never the row. A long press on the hamburger opens it directly.

## 💾 One-zip backup, unattended if you want it

Export / Import sits at the top of that page, in the Kōjiki flow: pick a backup folder once,
tick what you want, and the **entire** app — every setting, sliced into ten logical groups,
plus profiles with their subscriptions and stars, playlists, watch history and search
history — lands in a single timestamped `.zip`. Import merges it back and offers a restart.
The same export runs **headlessly**: sister apps can fire a token-gated intent at it, and
自由作業盤 backs up every app on the phone in one run, each reporting live counts and the
path and size it wrote. The export core is native, so it works with no window open at all.
Every item states whether it starts ticked rather than leaving the picker to guess, and a
中止 is a **real** cancel — the run unwinds at the next entry boundary and the half-written
archive is deleted, so a stopped backup leaves the folder exactly as it found it.

## 🔄 Own update channel

The built-in update check points at this repo's releases (with a version comparison that
understands the `<upstream>+<build>` scheme), so both the desktop app and the APK announce
new fork builds — never a stale upstream version.

---

## What this fork is

- **Tracks both upstreams' `development` branches** — FreeTube's, always slightly ahead of the
  latest beta, and FreeTubeAndroid's, where their current work lands.
- **Dual upstream**: the desktop app comes from FreeTubeApp/FreeTube; the Android packaging
  layer comes from MarmadileManteater/FreeTubeAndroid and is adapted to the current FreeTube
  by this fork (including keeping the desktop Electron build alive, which the Android fork
  had dropped).
- **Rebranded** as 白い熊 自由動画 with a black-yellow outline-traced icon.
- Versioning: `<FORK_VERSION><FreeTube pin><FreeTubeAndroid pin>+<build>`, e.g.
  `0.25.1.1.2026-08-02.g435ac348.2026-07-30.gfea7a050+003`.

  **`FORK_VERSION` is the higher of the two upstreams' versions** — FreeTube's `package.json`
  version and FreeTubeAndroid's release tag — adopted after merging either (their fourth
  component is a packaging respin of the same FreeTube base, not a FreeTube version component).

  Because both upstreams are tracked **by branch, not by release**, neither version literal says
  which commit a build actually contains: FreeTube's `0.25.1` stands still across hundreds of
  development commits. So each upstream contributes a **base pin**,
  `.<base commit date>.g<8-char sha>` — the commit our layer sits on, from
  `git merge-base HEAD <ref>`, FreeTube first. The date is the base commit's own committer date,
  never build time, so every build on one base shares a pin and version names still sort
  chronologically. Pins are recomputed from git at build time and never stored; each moves only
  when *its* upstream is synced, which is exactly the "this upstream has not moved" signal.

  Both artifacts always carry the same version, even when only one upstream moved. (One cosmetic
  exception: the `.deb`'s internal control field renders the pins' dates with `~` instead of `-`,
  because electron-builder sanitises `-` for deb/rpm targets. Both filenames keep the hyphens, and
  the ordering is unaffected.)

  The build counter is zero-padded to three digits so releases and artifacts sort in build order,
  and **resets on every `FORK_VERSION` change**; Android
  `versionCode = ((maj*10000 + min*100 + patch) * 10 + respin) * 1000 + build` is untouched by the
  pins and keeps rising across that reset (`0.25.1+039` → `25010039`,
  `0.25.1.1.…+003` → `25011003`). Tags up to `0.25.1+37` predate the padding and those up to
  `0.25.1.1+001` predate the pins; both are left exactly as published.

## Branch model

| Branch | Role |
| --- | --- |
| `master` | Mirror of `FreeTubeApp/FreeTube` `development`, fast-forward only |
| `custom` | The fork: Android-layer graft + adaptations + branding + features |

Upstream refs the version pins are measured against:

| Upstream | Ref we follow | Pin |
| --- | --- | --- |
| `FreeTubeApp/FreeTube` | `development` (via local `master`) | first |
| `MarmadileManteater/FreeTubeAndroid` | `development` | second |

## Built on FreeTube

A fork of [FreeTube](https://github.com/FreeTubeApp/FreeTube) and
[FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid) (app id
`shiroikuma.jiyudoga`, so it coexists with the official builds). All credit for the
underlying private YouTube client — local subscriptions, no Google account, SponsorBlock,
DeArrow, Invidious support — goes to those projects. The code remains under
[AGPL-3.0-or-later](LICENSE).

## Building

```bash
_scripts/build-fork.sh   # builds BOTH: .deb (amd64) and signed .apk (arm64-v8a)
```

See `CLAUDE.md` for the toolchain details (pnpm + Node 24, JDK 21, Android SDK).
