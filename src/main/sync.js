import { app } from 'electron'
import cp from 'child_process'
import path from 'path'
import asyncFs from 'fs/promises'

import * as baseHandlers from '../datastores/handlers/base'

/**
 * 白い熊 自由動画 — the desktop half of the device sync.
 *
 * The renderer owns the whole of the merge (see `renderer/helpers/sync/`); this file
 * owns only the two things a renderer cannot do — put a file on disk, and reach the
 * phone. The phone itself never opens a network connection, so every remote operation
 * in the design is here:
 *
 *   pull:  ssh … cat <remoteDir>/jiyudoga-phone.json
 *   push:  ssh … 'cat > <remoteDir>/jiyudoga-pc.json.part && mv …part …json'
 *
 * `ssh` rather than `scp`: one connection per direction instead of two, the remote
 * `mv` makes the phone's read atomic so it can never see a half-written snapshot, and
 * it needs no `sftp-server`, which Termux does not always install.
 *
 * Nothing about 白い熊's own setup lives here. The host, port, arguments and remote
 * directory are settings that default to empty or to something generic, and `ssh`
 * reads `~/.ssh/config` itself, so host aliases, keys and agents are the user's own
 * business rather than ours.
 */

/** Anything outside this cannot become part of a remote shell word. */
const SAFE_REMOTE_DIR = /^\/[A-Za-z0-9/._-]*$/

const SSH_TIMEOUT_MS = 20000

/** A snapshot far larger than this is not one; refuse it rather than merge it. */
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024

/**
 * @param {string} id
 */
async function setting(id) {
  return (await baseHandlers.settings._findOne(id))?.value
}

/**
 * @returns {Promise<string>}
 */
async function localDirectory() {
  const configured = await setting('skuiSyncLocalDir')

  const directory = typeof configured === 'string' && configured.length > 0
    ? configured
    : path.join(app.getPath('userData'), 'sync')

  await asyncFs.mkdir(directory, { recursive: true })

  return directory
}

/**
 * @param {string} fileName
 * @returns {Promise<string | null>} the file's contents, or null when there is none
 */
export async function readSnapshot(fileName) {
  const filePath = path.join(await localDirectory(), path.basename(fileName))

  try {
    return await asyncFs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') { return null }

    throw error
  }
}

/**
 * Temp file then rename, so a reader — including the courier — can never pick up a
 * half-written snapshot.
 * @param {string} fileName
 * @param {string} contents
 */
export async function writeSnapshot(fileName, contents) {
  const directory = await localDirectory()
  const filePath = path.join(directory, path.basename(fileName))
  const partPath = `${filePath}.part`

  await asyncFs.writeFile(partPath, contents, 'utf-8')
  await asyncFs.rename(partPath, filePath)

  return filePath
}

/**
 * Copies the datastores aside before the very first merge of this device's database
 * with another's. That union is the one step of the whole feature that cannot be
 * undone by syncing again, so it is worth a few megabytes.
 * @param {string} stamp `yyyy-MM-dd_HH-mm-ss`, formed by the caller in local time
 */
export async function backupDatastores(stamp) {
  const target = path.join(await localDirectory(), `pre-sync-backup-${stamp}`)

  await asyncFs.mkdir(target, { recursive: true })

  for (const name of ['history.db', 'profiles.db']) {
    try {
      await asyncFs.copyFile(path.join(app.getPath('userData'), name), path.join(target, name))
    } catch (error) {
      if (error.code !== 'ENOENT') { throw error }
    }
  }

  return target
}

/**
 * Normalises and vets the peer configuration the RENDERER passes in.
 *
 * It is passed rather than read here on purpose. A setting only gains a row in the
 * datastore once it has been changed, so reading one from this side yields `undefined`
 * for every value still at its default — which is how an untouched
 * `skuiSyncRemoteDir` arrived here as an empty string and was rejected as unsafe. The
 * renderer's store holds the defaults, so the renderer is the one that knows them.
 *
 * Validation stays here regardless: this is the side that builds a remote command.
 * @param {{ host?: string, port?: number, args?: string, remoteDir?: string }} [config]
 * @returns {{ host: string, port: number, args: string[], remoteDir: string } | null}
 */
function peer(config) {
  const host = config?.host

  if (typeof host !== 'string' || host.trim().length === 0) { return null }

  const remoteDir = (config.remoteDir ?? '').toString().trim().replace(/\/+$/, '')

  if (!SAFE_REMOTE_DIR.test(remoteDir)) {
    throw new Error(`refusing an unsafe remote directory: "${remoteDir}"`)
  }

  const port = Number.parseInt(config.port, 10)

  const extra = (config.args ?? '').toString().trim()

  return {
    host: host.trim(),
    // 0 (or nonsense) means: pass no -p at all, so ssh uses its own configuration
    port: Number.isFinite(port) && port > 0 ? port : 0,
    // split on whitespace only: this is an argv array, never a shell line, so there
    // is nothing here that quoting could protect against
    args: extra.length > 0 ? extra.split(/\s+/) : [],
    remoteDir
  }
}

/**
 * Runs `ssh` with an argv array and no shell of our own, so nothing in a setting can
 * be read as a command on this side. The single remote command word is quoted for the
 * shell that sshd will start.
 * @param {{ host: string, port: number, args: string[] }} target
 * @param {string} remoteCommand
 * @param {string} [input] piped to the remote command's stdin
 * @returns {Promise<string>} the remote command's stdout
 */
function runSsh(target, remoteCommand, input) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(
      'ssh',
      [
        '-C',
        // Only when one was actually chosen. `-p` overrides the Port a `Host` block in
        // ~/.ssh/config sets, and known_hosts is keyed by host AND port — so forcing a
        // port silently turns an already-trusted phone into an unknown host.
        ...(target.port > 0 ? ['-p', String(target.port)] : []),
        // never hang an unattended sync on a password or a host-key question
        '-o', 'BatchMode=yes',
        '-o', `ConnectTimeout=${Math.round(SSH_TIMEOUT_MS / 1000)}`,
        ...target.args,
        target.host,
        remoteCommand
      ],
      { shell: false }
    )

    let stdout = ''
    let stderr = ''
    let settled = false

    // ssh often exits before it has read our stdin — an unresolvable host, a refused
    // connection, a host key it will not accept under BatchMode — and writing a
    // snapshot into that dead pipe raises EPIPE on the STREAM, which the ChildProcess
    // 'error' handler below never sees. Unhandled, a stream error in the main process
    // is fatal: Electron tears the app down with a "JavaScript error occurred in the
    // main process" dialog. Swallowing it loses nothing, because why ssh failed is
    // already coming back through the exit code and stderr.
    //
    // It hides only when the payload is small: anything under the 64 KB pipe buffer is
    // accepted by the kernel and never fails, so an empty history syncs happily and a
    // real one kills the app.
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on('error', () => {})
    }

    const timer = setTimeout(() => {
      settled = true
      child.kill('SIGKILL')
      reject(new Error('ssh timed out'))
    }, SSH_TIMEOUT_MS)

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk

      if (stdout.length > MAX_SNAPSHOT_BYTES) {
        child.kill('SIGKILL')
      }
    })

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk) => { stderr += chunk })

    child.once('error', (error) => {
      if (settled) { return }

      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.once('close', (code) => {
      if (settled) { return }

      settled = true
      clearTimeout(timer)

      if (code === 0) {
        resolve(stdout)
      } else {
        const message = stderr.trim() || `ssh exited with ${code}`

        // BatchMode cannot answer "are you sure you want to continue connecting?", so
        // an untrusted key is a dead end rather than a prompt. Say what clears it —
        // the answer is a one-off in a terminal, not a setting in this app.
        if (/host key verification failed/i.test(message)) {
          reject(new Error(
            `${message} Connect once by hand to accept the key: ssh ` +
            `${target.port > 0 ? `-p ${target.port} ` : ''}${target.host}`
          ))
          return
        }

        reject(new Error(message))
      }
    })

    if (input !== undefined) {
      child.stdin.end(input, 'utf-8')
    } else {
      child.stdin.end()
    }
  })
}

/**
 * Fetches the phone's snapshot and leaves it in the local directory. A phone that has
 * never published one is not an error — there is simply nothing to merge yet.
 * @param {string} fileName
 * @param {object} [config] the peer settings, from the renderer's store
 * @returns {Promise<'fetched' | 'absent' | 'no-peer'>}
 */
export async function pullPeerSnapshot(fileName, config) {
  const target = peer(config)

  if (target === null) { return 'no-peer' }

  const remotePath = `${target.remoteDir}/${path.basename(fileName)}`

  let contents

  try {
    contents = await runSsh(target, `cat ${remotePath}`)
  } catch (error) {
    // `cat` on a file that is not there is the ordinary state before the phone's
    // first publish, not a failure worth showing
    if (/No such file or directory/i.test(error.message)) { return 'absent' }

    throw error
  }

  if (contents.length === 0) { return 'absent' }

  await writeSnapshot(fileName, contents)

  return 'fetched'
}

/**
 * @param {string} fileName
 * @param {string} contents
 * @param {object} [config] the peer settings, from the renderer's store
 * @returns {Promise<'pushed' | 'no-peer'>}
 */
export async function pushOwnSnapshot(fileName, contents, config) {
  const target = peer(config)

  if (target === null) { return 'no-peer' }

  const remotePath = `${target.remoteDir}/${path.basename(fileName)}`

  await runSsh(
    target,
    `mkdir -p ${target.remoteDir} && cat > ${remotePath}.part && mv ${remotePath}.part ${remotePath}`,
    contents
  )

  return 'pushed'
}
