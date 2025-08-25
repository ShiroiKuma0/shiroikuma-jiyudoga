
import { getDataDirectory, readFile, writeFile } from '../src/renderer/helpers/android'

export function createInstance(_kwargs) {
  return {
    async getItem(key) {
      const dataLocation = await getDataDirectory()
      if (dataLocation.directory !== 'data://') {
        if (key in dataLocation.files) {
          return await readFile(dataLocation.files[key])
        }
      }
      const data = await readFile(`data://${key}`)
      return data
    },
    async setItem(key, value) {
      const dataLocation = await getDataDirectory()
      if (dataLocation.directory !== 'data://') {
        if (key in dataLocation.files) {
          await writeFile(dataLocation.files[key], value)
          return
        }
      }
      await writeFile(`data://${key}`, value)
    }
  }
}
