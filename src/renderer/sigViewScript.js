// This runs in the sigView webview
window.addEventListener('message', (event) => {
  const id = event.id
  const code = Android.readSync(id)
  Android.postMessage(
    id,
    // eslint-disable-next-line no-new-func
    JSON.stringify(new Function(code)())
  )
})
