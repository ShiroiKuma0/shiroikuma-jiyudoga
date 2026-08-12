import android from 'android'
import { awaitAsyncResult } from './jsinterface'
import i18n from '../../i18n'

export async function generatePOToken(videoId, sessionContext, initialAttestationData, ytConfig) {
  const id = android.generatePOToken(videoId, sessionContext, initialAttestationData, ytConfig)
  return await awaitAsyncResult(id)
}

export function runDecipherScript(id, code, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(i18n.global.t('Decipher Script Timed Out')))
    }, timeout)

    awaitAsyncResult(android.runDecipherScript(id, code, timeout))
      .then(result => {
        clearTimeout(timer)
        resolve(JSON.parse(result))
      })
      .catch(ex => {
        clearTimeout(timer)
        reject(ex)
      })
  })
}
