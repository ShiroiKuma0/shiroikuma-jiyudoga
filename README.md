<div align="center">

<img src="_icons/512x512.png" width="120" alt="白い熊 自由動画 app icon" />

# 白い熊 自由動画

**A private YouTube client — on the desktop *and* on the phone, from one repo.**

白い熊's fork of [FreeTube](https://github.com/FreeTubeApp/FreeTube) (AGPL-3.0) with the
Android layer of [FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid)
grafted on and maintained against the current FreeTube development tip, plus **major
additions**: original-language video titles, live grid zoom, full-width views, and a
sister-repo-style UI theming layer. Every release builds **both** artifacts:

- **GNU/Linux amd64 `.deb`** (Electron; installable on Tuxedo OS / Ubuntu / Debian)
- **Android arm64-v8a APK** (native Kotlin WebView wrapper; installs side-by-side with any
  other client as package `shiroikuma.jiyudoga`)

**📥 Latest release: [`0.25.1+7`](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases/latest)** — [all releases & downloads »](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases)

</div>

---

## 🈶 Original-language video titles

YouTube silently translates video titles server-side into the request language — a Japanese
or Russian video shows up with a machine-translated English title. This fork restores the
**original title everywhere**: every visible video tile resolves its untranslated title
through YouTube's oEmbed endpoint (cached, throttled, zero extra requests for tiles you
never scroll to), and the watch page reads the player response, which always carries the
original. Watch a trilingual feed — 日本語, русский, English — and every title is the one
its creator wrote.

## 🔍 Live grid zoom

Resize the video grid **on the fly**: `Ctrl` + mouse wheel on the desktop (laptop touchpad
pinch works too), two-finger pinch on Android. Thumbnails, titles and info lines scale
together and the column count reflows; the chosen size (0.4×–3×) persists per device.

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
- Versioning: `<upstream version>+<build>` (e.g. `0.25.1+7`); Android
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
