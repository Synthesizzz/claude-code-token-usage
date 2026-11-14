import { expect, test } from 'claude-code/testing'

import { AFTER_COMPACT, COMPACT_COST, keepSteps, nextMove, payback, quietSoon, saneSteps } from '../hooks/next'
import type { Seen } from '../hooks/next'
import { WEIGHT } from '../hooks/usage'

// The band's one next move, row by row of its rule.

const at = (hour: number, minute = 0) => new Date(2026, 10, 10, hour, minute).getTime()
const seen = (tokens: number | null, more: Partial<Seen> = {}): Seen => ({
  tokens,
  percent: tokens === null ? null : (tokens / 1_000_000) * 100,
  weight: WEIGHT,
  isWorking: false,
  cache: null,
  quietSoon: false,
  isSoon: false,
  handoff: '',
  hasCommand: false,
  payback: null,
  ...more,
})
const keyOf = (value: Seen) => nextMove(value)?.key ?? null

test('a running turn compacts after it where the context is full, else waits', () => {
  expect(nextMove(seen(410_000, { isWorking: true }))).toMatchObject({ key: 'compactAfter', label: 'Compact after' })
  expect(keyOf(seen(250_000, { isWorking: true, quietSoon: true }))).toBe(null)
})

test('a lapsed cache over 50k compacts under 250k, a hand-off message or not', () => {
  expect(nextMove(seen(120_000, { cache: { phase: 'gone' }, handoff: 'Write a handoff.' }))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(nextMove(seen(249_999, { cache: { phase: 'gone' }, hasCommand: true }))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(nextMove(seen(120_000, { cache: { phase: 'gone' } }))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(keyOf(seen(40_000, { cache: { phase: 'gone' } }))).toBe(null)
})

test('a lapsed cache at 250k or more hands off with a message, else compacts', () => {
  expect(nextMove(seen(250_000, { cache: { phase: 'gone' }, handoff: 'Write a handoff.' }))).toMatchObject({ key: 'fresh', label: 'Hand off' })
  expect(nextMove(seen(260_000, { cache: { phase: 'gone' } }))).toMatchObject({ key: 'compact', label: 'Compact' })
})

test('Hand off waits for 250k on every path: the lapse, the full context and Park', () => {
  // A small window is full by its share well under 250k: it compacts.
  const small = { percent: 90, cache: null }
  expect(nextMove(seen(180_000, { ...small, handoff: 'Write a handoff.' }))).toMatchObject({ key: 'compact' })
  // Park before quiet hours: under 250k a compaction, from it Park.
  const heavy = (tokens: number) => seen(tokens, { percent: 80, quietSoon: true, handoff: 'Write a handoff.' })
  expect(nextMove(heavy(200_000))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(nextMove(heavy(250_000))).toMatchObject({ key: 'park', label: 'Park' })
  expect(nextMove(heavy(250_000))?.reason).toContain('Park sends your hand-off message')
})

// Decisions 2026-11-14: where the handoff mod is there its card owns 250k and
// more, so the band offers no move there; under it, Compact as ever.
test('with /handoff there, 250k or more has no move on any path, a message set or not', () => {
  const handed = (tokens: number, more: Partial<Seen> = {}) => seen(tokens, { hasCommand: true, handoff: 'Write a handoff.', ...more })

  expect(keyOf(handed(250_000, { cache: { phase: 'gone' } }))).toBe(null)
  expect(keyOf(handed(260_000, { percent: 80, quietSoon: true }))).toBe(null)
  expect(keyOf(handed(260_000, { percent: 80, cache: { phase: 'near' } }))).toBe(null)
  expect(keyOf(handed(410_000))).toBe(null)
  expect(keyOf(handed(410_000, { isWorking: true }))).toBe(null)
  expect(keyOf(handed(300_000, { payback: 1 }))).toBe(null)
  expect(keyOf(handed(260_000, { isSoon: true }))).toBe(null)
})

test('with /handoff there, under 250k the move is Compact, never Hand off or Park', () => {
  const handed = (tokens: number, more: Partial<Seen> = {}) => seen(tokens, { hasCommand: true, handoff: 'Write a handoff.', ...more })

  expect(nextMove(handed(249_999, { cache: { phase: 'gone' } }))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(nextMove(handed(200_000, { percent: 80, quietSoon: true }))).toMatchObject({ key: 'compact', label: 'Compact' })
  expect(nextMove(handed(180_000, { percent: 90 }))).toMatchObject({ key: 'compact' })
  expect(nextMove(handed(180_000, { percent: 90, isWorking: true }))).toMatchObject({ key: 'compactAfter' })
  // The size unknown, it cannot be the card's: Compact.
  expect(nextMove(seen(null, { percent: 95, hasCommand: true }))).toMatchObject({ key: 'compact' })
})

test('a context filling within a few turns compacts, as the primary', () => {
  expect(nextMove(seen(150_000, { isSoon: true }))).toMatchObject({ key: 'compact', isPrimary: true })
})

test('under the warning size there is no move', () => {
  expect(keyOf(seen(150_000))).toBe(null)
  expect(keyOf(seen(150_000, { quietSoon: true, cache: { phase: 'near' } }))).toBe(null)
  expect(keyOf(seen(null))).toBe(null)
})

test('a heavy context parks before quiet hours or a lapse, or compacts with no hand-off message', () => {
  expect(nextMove(seen(250_000, { quietSoon: true, handoff: 'Write a handoff.' }))).toMatchObject({ key: 'park', label: 'Park' })
  expect(nextMove(seen(250_000, { cache: { phase: 'near' }, handoff: 'Write a handoff.' }))?.reason).toContain('The cache lapses soon')
  expect(nextMove(seen(250_000, { quietSoon: true }))).toMatchObject({ key: 'compact', label: 'Compact' })
})

test('a full context hands off, or compacts with no hand-off message', () => {
  expect(nextMove(seen(410_000, { handoff: 'Write a handoff.' }))).toMatchObject({ key: 'fresh', label: 'Hand off' })
  expect(nextMove(seen(410_000))).toMatchObject({ key: 'compact', isPrimary: false })
  expect(nextMove(seen(410_000))?.reason).toContain('410k')
})

test('a heavy context compacts where it pays back within 3 turns, else carries on', () => {
  expect(nextMove(seen(300_000, { payback: 2 }))?.reason).toContain('pays back in 2 turns')
  expect(nextMove(seen(300_000, { payback: 1 }))?.reason).toContain('pays back in 1 turn.')
  expect(keyOf(seen(300_000, { payback: 4 }))).toBe(null)
  expect(keyOf(seen(300_000))).toBe(null)
})

test('a small window at 85% is full by its share, and heavy at 70%', () => {
  const small = (tokens: number, more: Partial<Seen> = {}) => seen(tokens, { percent: (tokens / 200_000) * 100, ...more })

  expect(keyOf(small(170_000))).toBe('compact')
  expect(keyOf(small(150_000, { payback: 2 }))).toBe('compact')
  expect(keyOf(small(120_000, { payback: 2 }))).toBe(null)
})

test('with the weight off the share alone judges it', () => {
  expect(keyOf(seen(500_000, { weight: null, percent: 50 }))).toBe(null)
  expect(keyOf(seen(500_000, { weight: null, percent: 82 }))).toBe('compact')
})

test('quiet hours are soon within 30 minutes of their start, not once begun', () => {
  const night = { from: 22, to: 8 }

  expect(quietSoon(night, at(21, 40))).toBe(true)
  expect(quietSoon(night, at(21, 20))).toBe(false)
  expect(quietSoon(night, at(23, 0))).toBe(false)
  expect(quietSoon(night, at(7, 50))).toBe(false)
  expect(quietSoon({ from: 0, to: 6 }, at(23, 45))).toBe(true)
  expect(quietSoon({ from: 0, to: 6 }, at(12, 0))).toBe(false)
  expect(quietSoon(null, at(21, 40))).toBe(false)
})

test("a compaction's payback weighs the session's own turns, or 3 steps where it has none", () => {
  const read = 0.05
  const perStep = (400_000 - AFTER_COMPACT) * read

  expect(payback(400_000, [], read)).toBe(Math.ceil(COMPACT_COST / (perStep * 3)))
  expect(payback(400_000, [10, 12, 14], read)).toBe(Math.ceil(COMPACT_COST / (perStep * 12)))
  expect(payback(120_000, [10], read)).toBe(null)
  expect(payback(null, [10], read)).toBe(null)
})

test('the steps per turn kept are whole counts, the latest five', () => {
  expect(saneSteps('nonsense')).toEqual([])
  expect(saneSteps([3, -1, 2.5, 7, 'x'])).toEqual([3, 7])
  expect(keepSteps([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6])
})
