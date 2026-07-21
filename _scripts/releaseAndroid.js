// script to trigger release
// #region Imports
const { version } = require('../package.json')
const { promisify } = require('util')
const { fetch } = require('undici')
const { get } = require('prompt')
const { exec } = require('child_process')
const { randomUUID } = require('crypto')
const { writeFile, rm, readFile } = require('fs/promises')
// #endregion
;(async (get, exec) => {
  const givenArguments = { dryRun: false }
  for (let arg of process.argv) {
    if (arg.startsWith('--version-number=')) {
      givenArguments.versionNumber = arg.split('--version-number=')[1]
    }
    if (arg.startsWith('--number-of-commits=')) {
      givenArguments.numberOfCommits = parseInt(arg.split('--number-of-commits=')[1])
    }
    if (arg === '--dry-run') {
      givenArguments.dryRun = true
    }
    if (arg.startsWith('--f=')) {
      givenArguments.message = arg.split('--f=')[1]
    }
  }
  if (givenArguments.dryRun) {
    console.log('starting dry run')
  }
  const releases = await fetch('https://api.github.com/repos/MarmadileManteater/FreeTubeCordova/releases')
  /** @type {Array<{tag_name: string}>} */
  const releasesJSON = await releases.json()
  // #region Version Number
  const latestTag = releasesJSON[0].tag_name
  const [ _latestMajor, _latestMinor, _latestPatch, latestRun ] = latestTag.split('.')
  const [ currentMajor, currentMinor, currentPatch ] = version.split('.')
  const latestRunNumber = parseInt(latestRun)
  const currentRunNumber = latestRunNumber + 1
  const defaultVersionNumber = `${currentMajor}.${currentMinor}.${currentPatch}.${currentRunNumber}`
  // get version number from either the props or a prompt
  let { versionNumber } = ('versionNumber' in givenArguments) ? givenArguments : await get({
    properties: {
      versionNumber: {
        pattern: /[0-9]*?.[0-9]*?.[0-9]*?.[0-9]*/,
        message: 'Version number to release with',
        default: defaultVersionNumber
      }
    }
  })
  const buildNumber = versionNumber.split('.').at(-1)
  if (versionNumber === 'default') {
    versionNumber = defaultVersionNumber
  }
  // #endregion
  if (!('message' in givenArguments)) {
    // #region Latest Git History
    const gitDiff = (await exec('git log origin/development...origin/release')).stdout
    const numberOfCommits = ('numberOfCommits' in givenArguments) ? givenArguments.numberOfCommits : 3
    let accumulator = 0
    let mostRecentCommits = ''
    for (let line of gitDiff.split('\n')) {
      if (line.trim() === '') {
        continue
      }
      if (line.startsWith('commit ')) {
        mostRecentCommits += `\n`
        accumulator++
      }
      if (accumulator < numberOfCommits + 1) {
        mostRecentCommits += `${line}\n`
      }
    }
    mostRecentCommits = mostRecentCommits.trim()
    // #endregion
    givenArguments.message = mostRecentCommits
  } else {
    // message is in given arguments (a file was passed that needs to be read)
    givenArguments.message = await readFile(givenArguments.message)
  }
  const commitMessage = `**Release ${versionNumber}**

  ${givenArguments.message}

  ...

  **Full Changelog**: https://github.com/MarmadileManteater/FreeTubeCordova/compare/${latestTag}...${versionNumber}`
  // #region Commit changes to release branch
  if (!givenArguments.dryRun) {
    const fileId = randomUUID()
    await writeFile(`commit_message_${fileId}.txt`, commitMessage)
    await exec('git pull')
    await exec('git checkout release')
    await exec('git merge origin/development --no-commit --no-ff')
    await exec(`git commit -F commit_message_${fileId}.txt`)
    await rm(`commit_message_${fileId}.txt`)
  } else {
    // is a dry run
    console.log(commitMessage)
    console.log('------')
    console.log('nothing committed: dry run')
  }
  // #endregion

})(promisify(get), promisify(exec))

