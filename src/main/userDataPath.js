import { app } from 'electron'
import path from 'path'

// Electron appends the app name to the per-user config directory ONLY when that name is
// ASCII. Our productName is `白い熊 自由動画`, so from Electron 43 (upstream bumped 42.5.2
// -> 43.1.1 in 9b4a94a1f) `app.getPath('userData')` silently returns the config root
// ITSELF: on 2026-08-19 a release build wrote all six nedb stores and the whole Chromium
// profile straight into ~/.config and started from an empty subscription list, while the
// real profile sat untouched one directory below. `app.getName()` is correct throughout —
// it is only the default path derivation that drops it.
//
// Restore the intended directory. This is deliberately a no-op unless the collapse has
// actually happened, so platforms that resolve the name correctly keep their own path, and
// the repaired path is byte-identical to the one older Electron produced — the existing
// profile is picked up with no migration and no export/import.
//
// This module is imported FIRST by src/main/index.js, before `../datastores/handlers/base`:
// the datastores read `app.getPath('userData')` at module-evaluation time, and `setPath`
// must also land before the app is ready, so the fix cannot live in a later statement.
const appData = app.getPath('appData')

if (path.resolve(app.getPath('userData')) === path.resolve(appData)) {
  app.setPath('userData', path.join(appData, app.getName()))
}
