
import android from 'android'
import { awaitAsyncResult } from './jsinterface'

export async function generatePOToken(videoId, sessionContext) {
  const id = android.generatePOToken(videoId, sessionContext)
  return await awaitAsyncResult(id)
}

export async function runDecipherScript(id, code) {
  return JSON.parse(await awaitAsyncResult(android.runDecipherScript(id, code)))
}