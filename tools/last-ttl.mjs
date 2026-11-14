// How long the prompt cache lasts, as the last reply that wrote to it set it.
//
// Each reply the transcript holds says what it wrote to the cache, split by
// how long the entry lasts (`ephemeral_5m_input_tokens`,
// `ephemeral_1h_input_tokens`). A hook's usage gives only the total, so the
// mod runs this on the transcript after a turn that wrote to the cache.
//
// A transcript runs to hundreds of megabytes, so only its end is read: the
// last 256 KB, then wider, up to 4 MB, while no reply in it wrote to the
// cache. Prints `{ "ttl": <ms>, "at": <ms> }`, or `null` where none did.
//
// node tools/last-ttl.mjs <transcript.jsonl>

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WINDOWS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

// One line's reading: the time its cache write lasts, the larger share
// deciding where a reply wrote both, and when it was written. Null for a line
// that is no main-thread reply, or wrote nothing to the cache.
export const lineTtl = line => {
  if (!line.includes('"assistant"')) {
    return null
  }

  let entry

  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }

  if (entry?.type !== 'assistant' || entry.isSidechain === true) {
    return null
  }

  const written = entry.message?.usage?.cache_creation
  const short = Number(written?.ephemeral_5m_input_tokens ?? 0)
  const long = Number(written?.ephemeral_1h_input_tokens ?? 0)
  const at = Date.parse(entry.timestamp)

  if (!(short > 0 || long > 0) || !Number.isFinite(at)) {
    return null
  }

  return { ttl: long >= short ? HOUR_MS : 5 * MINUTE_MS, at }
}

// The newest reading in a piece of the file. A piece that does not start the
// file starts mid-line, and that line is passed over.
export const lastTtl = (text, isWhole) => {
  const lines = text.split('\n')

  if (!isWhole) {
    lines.shift()
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const reading = lineTtl(lines[i])

    if (reading !== null) {
      return reading
    }
  }

  return null
}

export const readTail = (path, windows = WINDOWS) => {
  const fd = openSync(path, 'r')

  try {
    const size = fstatSync(fd).size

    for (const window of windows) {
      const length = Math.min(size, window)
      const piece = Buffer.alloc(length)

      readSync(fd, piece, 0, length, size - length)
      const reading = lastTtl(piece.toString('utf8'), length === size)

      if (reading !== null || length === size) {
        return reading
      }
    }

    return null
  } finally {
    closeSync(fd)
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const path = process.argv[2]

  if (path === undefined) {
    process.stderr.write('usage: node last-ttl.mjs <transcript.jsonl>\n')
    process.exit(2)
  }

  process.stdout.write(`${JSON.stringify(readTail(path))}\n`)
}
