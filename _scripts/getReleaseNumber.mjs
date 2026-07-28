import { fetch } from 'undici'
import packageJSON from '../package.json' with { type: 'json' }

const latestRelease = await (await fetch('https://api.github.com/repos/MarmadileManteater/FreetubeAndroid/releases?per_page=1'))
console.log(latestRelease)
