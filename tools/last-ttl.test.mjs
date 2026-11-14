// node --test tools/last-ttl.test.mjs
//
// The tail reader on transcripts made here: what the last reply that wrote to
// the cache set, read from the file's end alone.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { WINDOWS, lastTtl, lineTtl, readTail } from './last-ttl.mjs'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const folder = mkdtempSync(join(tmpdir(), 'last-ttl-'))

after(() => rmSync(folder, { recursive: true, force: true }))

const reply = (at, short, long, more = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: new Date(at).toISOString(),
    message: { id: `msg_${at}`, role: 'assistant', usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 70_000, cache_creation_input_tokens: short + long, cache_creation: { ephemeral_5m_input_tokens: short, ephemeral_1h_input_tokens: long } } },
    ...more,
  })

const user = text => JSON.stringify({ type: 'user', timestamp: '2026-11-14T11:00:00.000Z', message: { role: 'user', content: text } })

const file = (name, text) => {
  const path = join(folder, name)

  writeFileSync(path, text)

  return path
}

const T1 = Date.parse('2026-11-14T11:26:04.439Z')
const T2 = Date.parse('2026-11-14T11:30:00.000Z')

test('a reply that wrote to the hour cache reads as the hour, one that wrote to the five-minute cache as five minutes', () => {
  assert.deepEqual(lineTtl(reply(T1, 0, 122)), { ttl: HOUR, at: T1 })
  assert.deepEqual(lineTtl(reply(T1, 300, 0)), { ttl: 5 * MINUTE, at: T1 })
  // Both: the larger share decides.
  assert.deepEqual(lineTtl(reply(T1, 10, 900)), { ttl: HOUR, at: T1 })
  assert.deepEqual(lineTtl(reply(T1, 900, 10)), { ttl: 5 * MINUTE, at: T1 })
})

test('a line that is no main-thread reply writing to the cache reads as nothing', () => {
  assert.equal(lineTtl(reply(T1, 0, 0)), null)
  assert.equal(lineTtl(reply(T1, 0, 500, { isSidechain: true })), null)
  assert.equal(lineTtl(user('"assistant" said so')), null)
  assert.equal(lineTtl('{"type":"assistant", cut off'), null)
  assert.equal(lineTtl(JSON.stringify({ type: 'assistant', timestamp: 'never', message: { usage: { cache_creation: { ephemeral_1h_input_tokens: 5 } } } })), null)
  // The total alone, as older transcripts kept it, does not say the time.
  assert.equal(lineTtl(JSON.stringify({ type: 'assistant', timestamp: '2026-11-14T11:00:00Z', message: { usage: { cache_creation_input_tokens: 500 } } })), null)
})

test('the newest reply that wrote to the cache wins, past later replies that only read it', () => {
  const text = [reply(T1, 300, 0), reply(T2, 0, 800), reply(T2 + 1000, 0, 0), user('next'), ''].join('\n')

  assert.deepEqual(lastTtl(text, true), { ttl: HOUR, at: T2 })
})

test('a piece cut from the middle passes over its first line, which starts mid-line', () => {
  const whole = reply(T1, 300, 0)
  // The tail of a five-minute line, still valid JSON once cut at a brace.
  const cut = whole.slice(whole.indexOf('{', 10))

  assert.equal(lastTtl(cut, false), null)
  assert.deepEqual(lastTtl(`${cut}\n${reply(T2, 0, 40)}`, false), { ttl: HOUR, at: T2 })
})

test('a transcript read from its end: the last reply that wrote to the cache', () => {
  const path = file('small.jsonl', [user('hi'), reply(T1, 300, 0), user('again'), reply(T2, 0, 122), reply(T2 + 5, 0, 0), ''].join('\n'))

  assert.deepEqual(readTail(path), { ttl: HOUR, at: T2 })
})

test('a transcript over 4 MiB is read from its end, and a reply past the first window widens the read', () => {
  const filler = `${user('x'.repeat(1000))}\n`.repeat(Math.ceil((5 * 1024 * 1024) / 1100))
  const near = file('big-near.jsonl', `${reply(T1, 0, 900)}\n${filler}${reply(T2, 300, 0)}\n${user('last')}\n`)

  assert.ok(filler.length > 4 * 1024 * 1024)
  assert.deepEqual(readTail(near), { ttl: 5 * MINUTE, at: T2 })

  // 600 KB of user lines after the reply: past the 256 KB window, inside 1 MB.
  const tail = `${user('y'.repeat(1000))}\n`.repeat(560)
  const wide = file('big-wide.jsonl', `${filler}${reply(T2, 0, 700)}\n${tail}`)

  assert.ok(tail.length > WINDOWS[0] && tail.length < WINDOWS[1])
  assert.deepEqual(readTail(wide), { ttl: HOUR, at: T2 })

  // A reply only past 4 MB from the end is not looked for.
  const far = file('big-far.jsonl', `${reply(T2, 0, 700)}\n${filler}`)

  assert.equal(readTail(far), null)
})

test('a transcript with no reply, or none that wrote to the cache, reads as nothing', () => {
  assert.equal(readTail(file('none.jsonl', `${user('hi')}\n${user('again')}\n`)), null)
  assert.equal(readTail(file('reads.jsonl', `${user('hi')}\n${reply(T1, 0, 0)}\n`)), null)
  assert.equal(readTail(file('empty.jsonl', '')), null)
})

test('a missing transcript throws, for the caller to read as no reading', () => {
  assert.throws(() => readTail(join(folder, 'gone.jsonl')))
})
