
import android from 'android'
import { isColourDark } from './utils'

export function updateAndroidTheme(usesMain = false) {
  const bodyStyle = getComputedStyle(document.body)
  const isDark = isColourDark(bodyStyle.getPropertyValue('--primary-text-color'))
  const isDarkTop = usesMain ? isColourDark(bodyStyle.getPropertyValue('--text-with-main-color')) : isDark
  const top = !usesMain ? bodyStyle.getPropertyValue('--card-bg-color') : bodyStyle.getPropertyValue('--primary-color')
  const bottom = bodyStyle.getPropertyValue('--side-nav-color')
  android.themeSystemUi(bottom, top, isDark, isDarkTop)
}

export function getConsoleLogs() {
  return JSON.parse(android.getLogs())
}