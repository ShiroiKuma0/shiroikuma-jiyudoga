<div align="center">

<img src="_icons/512x512.png" width="120" alt="白い熊 自由動画 app icon" />

# 白い熊 自由動画

**A private YouTube client — on the desktop *and* on the phone, from one repo.**

白い熊's fork of [FreeTube](https://github.com/FreeTubeApp/FreeTube) (AGPL-3.0) with the
Android layer of [FreeTubeAndroid](https://github.com/MarmadileManteater/FreeTubeAndroid)
grafted on and maintained against the current FreeTube development tip. Every release builds
**both** artifacts:

- **GNU/Linux amd64 `.deb`** (Electron; installable on Tuxedo OS / Ubuntu / Debian)
- **Android arm64-v8a APK** (native Kotlin WebView wrapper; installs side-by-side with any
  other client as package `shiroikuma.jiyudoga`)

**📥 Releases: [all releases & downloads »](https://github.com/ShiroiKuma0/shiroikuma-jiyudoga/releases)**

</div>

---

## What this fork is

- **Tracks FreeTube's `development` branch** — always slightly ahead of the latest beta.
- **Dual upstream**: the desktop app comes from FreeTubeApp/FreeTube; the Android packaging
  layer comes from MarmadileManteater/FreeTubeAndroid and is adapted to the current FreeTube
  by this fork (including keeping the desktop Electron build alive, which the Android fork
  had dropped).
- **Rebranded** as 白い熊 自由動画 with a black-yellow outline-traced icon.
- Versioning: `<upstream version>+<build>` (e.g. `0.25.1+1`); Android
  `versionCode = (maj*10000 + min*100 + patch) * 10000 + build`.

## Branch model

| Branch | Role |
| --- | --- |
| `master` | Mirror of `FreeTubeApp/FreeTube` `development`, fast-forward only |
| `custom` | The fork: Android-layer graft + adaptations + branding + features |

## Building

```bash
_scripts/build-fork.sh   # builds BOTH: .deb (amd64) and signed .apk (arm64-v8a)
```

See `CLAUDE.md` for the toolchain details (pnpm + Node 24, JDK 21, Android SDK).

## License

[AGPL-3.0-or-later](LICENSE), same as upstream FreeTube.
