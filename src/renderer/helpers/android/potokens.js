
import android from 'android'
import { awaitAsyncResult } from './jsinterface'

export async function generatePOTokens(videoId, visitorData, sessionContext) {
  const id = android.generatePOTokens(videoId, visitorData, sessionContext)
  const data = JSON.parse(await awaitAsyncResult(id))
  return data
}