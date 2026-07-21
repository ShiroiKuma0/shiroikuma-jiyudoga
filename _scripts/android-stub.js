// Desktop stand-in for the `android` webpack external, which the Android build
// maps to the WebView's injected `Android` JS interface. Every call site is
// guarded by `process.env.IS_ANDROID`, so this value is never used on desktop;
// it only has to make the static `import android from 'android'` resolvable.
module.exports = undefined
