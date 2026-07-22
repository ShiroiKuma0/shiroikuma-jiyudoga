<div align="center">

<img src="_icons/512x512.png" width="120" alt="白い熊 自由動画 app icon" />

# 白い熊 自由動画

**A private YouTube client — on the desktop *and* on the phone, from one repo.**

白い熊's fork of [FreeTube](https://github.com/FreeTubeApp/FreeTube) (AGPL-3.0) with the
Android layer of [FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid)
grafted on and maintained against the current FreeTube development tip, plus **major
additions**: a one-tap **language-study export** (subtitled mkv into
[shiroikuma-jisho](https://github.com/ShiroiKuma0/shiroikumanojisho) /
[shiroikuma-yosuga](https://github.com/ShiroiKuma0/shiroikuma-yosuga)), original-language
titles & descriptions, a channel-discovery **Similar** tab, per-profile video **starring**,
live grid zoom with tuning sliders, theatre mode on Android, full-width views, and a
sister-repo-style UI theming layer. Every release builds **both** artifacts:

- **GNU/Linux amd64 `.deb`** (Electron; installable on Tuxedo OS / Ubuntu / Debian)
- **Android arm64-v8a APK** (native Kotlin WebView wrapper; installs side-by-side with any
  other client as package `shiroikuma.jiyudoga`)

**📥 Latest release: [`0.25.1+27`](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases/latest)** — [all releases & downloads »](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases)

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
the way down to 0 — everything previewed live as you drag.

## 🔄 Own update channel

The built-in update check points at this repo's releases (with a version comparison that
understands the `<upstream>+<build>` scheme), so both the desktop app and the APK announce
new fork builds — never a stale upstream version.

---

## What this fork is

- **Tracks FreeTube's `development` branch** — always slightly ahead of the latest beta.
- **Dual upstream**: the desktop app comes from FreeTubeApp/FreeTube; the Android packaging
  layer comes from MarmadileManteater/FreeTubeAndroid and is adapted to the current FreeTube
  by this fork (including keeping the desktop Electron build alive, which the Android fork
  had dropped).
- **Rebranded** as 白い熊 自由動画 with a black-yellow outline-traced icon.
- Versioning: `<upstream version>+<build>` (e.g. `0.25.1+27`); Android
  `versionCode = (maj*10000 + min*100 + patch) * 10000 + build`.

## Branch model

| Branch | Role |
| --- | --- |
| `master` | Mirror of `FreeTubeApp/FreeTube` `development`, fast-forward only |
| `custom` | The fork: Android-layer graft + adaptations + branding + features |

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
