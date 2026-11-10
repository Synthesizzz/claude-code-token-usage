import { expect, test } from 'claude-code/testing'

import { FLEET_TTL, OPEN_MS, cellWidth, fleetRows, isOpen, labelOf, phaseOf, saneEntry, uniqueLabels, wakeTokens } from '../hooks/fleet'
import type { FleetEntry } from '../types'

// The rules that read every session's fleet file.

const MINUTE = 60_000
const NOW = new Date(2026, 10, 10, 21, 0).getTime()
const entry = (id: string, more: Partial<FleetEntry> = {}): FleetEntry => ({
  id,
  cwd: 'D:/work/hub',
  label: `hub · ${id}`,
  at: NOW - MINUTE,
  startedAt: null,
  tokens: 200_000,
  model: 'claude-opus-5-5',
  ttl: FLEET_TTL,
  isWorking: false,
  ended: null,
  hostId: null,
  ...more,
})

test('a file not shaped as an entry reads as none, and missing fields as empty', () => {
  expect(saneEntry('nonsense')).toBe(null)
  expect(saneEntry({ id: 'a' })).toBe(null)
  expect(saneEntry({ id: '', at: 1 })).toBe(null)
  expect(saneEntry({ id: 'a', at: 5, tokens: 'x', isWorking: 'yes' })).toEqual({
    id: 'a',
    cwd: '',
    label: '',
    at: 5,
    startedAt: null,
    tokens: null,
    model: null,
    ttl: null,
    isWorking: false,
    ended: null,
    hostId: null,
  })
  expect(saneEntry({ id: 'a', at: 5, hostId: 'local_abc' })?.hostId).toBe('local_abc')
  expect(saneEntry({ id: 'a', at: 5, hostId: 7 })?.hostId).toBe(null)
})

test("a label is the folder and the first prompt's start, without the harness's tags and notes", () => {
  expect(labelOf('D:\\hub', 'Continue the fleet work')).toBe('hub · Continue the fleet work')
  expect(labelOf('/home/me/app/', '[rollover จาก local_x เวลา 20:57] Continue the unit')).toBe('app · Continue the unit')
  expect(labelOf('/home/me/app', '<system-reminder>ignore this</system-reminder>  fix   the band')).toBe('app · fix the band')
  expect(labelOf('/home/me/app', '<system-reminder>only this</system-reminder>')).toBe('app')
  expect(labelOf('', 'hello')).toBe('(no folder) · hello')
})

test('a session started from another is named by its task, not by the background it was handed', () => {
  const handed = [
    'Background (from the session that started this one):',
    'The band work is half done.',
    '',
    'Task:',
    '[rollover จาก local_x เวลา 21:31]',
    "Continue the unit's work from the handoff",
  ].join('\n')

  expect(labelOf('D:/work/hub', handed)).toBe("hub · Continue the unit's wor…")
  // Background with no task line: the background's own text, without its heading.
  expect(labelOf('/x/app', 'Background (from the session that started this one):\nFix the band')).toBe('app · Fix the band')
})

test('a long prompt is cut at 24 cells, a Thai one by its cells and never between a letter and its marks', () => {
  const long = labelOf('/x/app', 'a'.repeat(40))

  expect(long).toBe(`app · ${'a'.repeat(23)}…`)

  const thai = labelOf('/x/app', 'ทำต่อจากที่ค้างไว้เมื่อวานนี้ให้เสร็จก่อนสอบสัปดาห์หน้า')
  const said = thai.slice('app · '.length)

  expect(cellWidth(said)).toBeLessThanOrEqual(24)
  expect(said.endsWith('…')).toBe(true)
  // The cut keeps whole letters: what stands before the ellipsis is the prompt's own start.
  expect('ทำต่อจากที่ค้างไว้เมื่อวานนี้ให้เสร็จก่อนสอบสัปดาห์หน้า'.startsWith(said.slice(0, -1))).toBe(true)
  expect(cellWidth('ที่')).toBe(1)
})

test('two sessions with one label carry the start of their ids', () => {
  const labels = uniqueLabels([entry('abcd1234', { label: 'hub' }), entry('wxyz9876', { label: 'hub' }), entry('solo', { label: 'other' })])

  expect(labels.get('abcd1234')).toBe('hub ·abcd')
  expect(labels.get('wxyz9876')).toBe('hub ·wxyz')
  expect(labels.get('solo')).toBe('other')
  expect(uniqueLabels([entry('a', { label: '', cwd: '/x/app' })]).get('a')).toBe('app')
})

test('a session is open until it ends, or six hours after its last reply or the start of its turn', () => {
  expect(isOpen(entry('a'), NOW)).toBe(true)
  expect(isOpen(entry('a', { ended: NOW - MINUTE }), NOW)).toBe(false)
  expect(isOpen(entry('a', { at: NOW - OPEN_MS - MINUTE }), NOW)).toBe(false)
  // A turn begun after a long pause is open while it runs.
  expect(isOpen(entry('a', { at: NOW - OPEN_MS - MINUTE, isWorking: true, startedAt: NOW - MINUTE }), NOW)).toBe(true)
  // A turn that never ended, its process gone, drops out six hours on.
  expect(isOpen(entry('a', { isWorking: true, startedAt: NOW - OPEN_MS - MINUTE }), NOW)).toBe(false)
})

test('the phase follows the cache since the last reply, an hour where its time is not learned', () => {
  expect(phaseOf(entry('a', { isWorking: true }), NOW).phase).toBe('working')
  expect(phaseOf(entry('a', { at: NOW - 5_000 }), NOW)).toEqual({ phase: 'warm', left: FLEET_TTL - 5_000 })
  expect(phaseOf(entry('a', { at: NOW - 10 * MINUTE }), NOW)).toEqual({ phase: 'warm', left: 50 * MINUTE })
  expect(phaseOf(entry('a', { at: NOW - 59 * MINUTE }), NOW)).toEqual({ phase: 'near', left: MINUTE })
  expect(phaseOf(entry('a', { at: NOW - 61 * MINUTE }), NOW)).toEqual({ phase: 'gone', left: null })
  expect(phaseOf(entry('a', { at: NOW - 61 * MINUTE, ttl: null }), NOW).phase).toBe('gone')
  expect(phaseOf(entry('a', { at: NOW - 6 * MINUTE, ttl: 5 * MINUTE }), NOW).phase).toBe('gone')
})

test('waking a lapsed cache re-writes the context; a warm one reads it', () => {
  // Opus 5.5: a read a twentieth, an hour's write twice the input price.
  expect(wakeTokens(entry('a'), 'gone')).toBe(400_000)
  expect(wakeTokens(entry('a'), 'warm')).toBe(10_000)
  expect(wakeTokens(entry('a', { ttl: 5 * MINUTE }), 'gone')).toBe(250_000)
  expect(wakeTokens(entry('a'), 'working')).toBe(null)
  expect(wakeTokens(entry('a', { tokens: null }), 'gone')).toBe(null)
})

test('the open sessions go working, near, warm, lapsed, the latest first within each', () => {
  const rows = fleetRows(
    [
      entry('gone', { at: NOW - 2 * 60 * MINUTE }),
      entry('warm-old', { at: NOW - 20 * MINUTE }),
      entry('warm-new', { at: NOW - 2 * MINUTE }),
      entry('near', { at: NOW - 59 * MINUTE }),
      entry('working', { isWorking: true, startedAt: NOW - MINUTE }),
      entry('ended', { ended: NOW - MINUTE }),
    ],
    NOW,
    'warm-new',
  )

  expect(rows.map(row => row.id)).toEqual(['working', 'near', 'warm-new', 'warm-old', 'gone'])
  expect(rows.find(row => row.id === 'warm-new')?.isOwn).toBe(true)
  expect(rows.find(row => row.id === 'gone')).toMatchObject({ phase: 'gone', wake: 400_000, since: 2 * 60 * MINUTE })
})
