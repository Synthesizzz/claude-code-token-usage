import { expect, test } from 'claude-code/testing'

import { isCrowded, review } from '../hooks/alerts'
import { WEIGHT } from '../hooks/usage'
import type { Alerted } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const at = (ms: number) => new Date(ms).toISOString()
const reading = (
  fiveHour: number,
  sevenDay = 20,
  context: number | null = 30,
  samples: { at: number; percent: number }[] = [],
) => ({
  at: 0,
  tokens: null,
  window: 200000,
  percent: context,
  usd: null,
  unread: [] as string[],
  limits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: at(2 * HOUR + 14 * MINUTE), samples },
    { kind: 'seven_day', percentUsed: sevenDay, resetsAt: null, samples: [] },
  ],
})
// A run of readings, each judged against the one before with what was said so far.
const run = (readings: ReturnType<typeof reading>[], hasEarlyAlert = false, now = 0) => {
  let memory: Alerted = {}
  let before: ReturnType<typeof reading> | null = null
  const said: string[][] = []

  for (const after of readings) {
    const judged = review(before, after, memory, now, hasEarlyAlert)

    said.push(judged.notices.map(notice => notice.line))
    memory = judged.memory
    before = after
  }

  return said
}

test('a window climbing past 85% is news once, with a bar of how full it is', () => {
  const { notices } = review(reading(84), reading(86), {}, 0, false)

  expect(notices).toEqual([
    {
      kind: 'near',
      title: '5-hour window at 86%',
      text: 'Resets in 2h14m.',
      line: '5-hour window at 86%, resets in 2h14m',
      bar: { name: '5-hour window', value: 0.86, label: '86%', status: 'resets in 2h14m' },
      window: 'five_hour',
    },
  ])
})

test('a first reading says nothing, however full, and is not news later', () => {
  expect(run([reading(95), reading(96)])).toEqual([[], []])
})

test('a reading that dips under the line and comes back is not news twice', () => {
  expect(run([reading(84), reading(85.2), reading(84.9), reading(85.1)])).toEqual([
    [],
    ['5-hour window at 85%, resets in 2h14m'],
    [],
    [],
  ])
})

test('a jump over several lines names the highest one alone', () => {
  expect(run([reading(50), reading(100)])).toEqual([[], ['5-hour limit reached, back in 2h14m']])
})

test('the limit reached is news after the window was already called near', () => {
  expect(run([reading(80), reading(90), reading(100)])).toEqual([
    [],
    ['5-hour window at 90%, resets in 2h14m'],
    ['5-hour limit reached, back in 2h14m'],
  ])
})

test('60% is news only when the early alert is on', () => {
  expect(run([reading(55), reading(61)])).toEqual([[], []])
  expect(run([reading(55), reading(61)], true)).toEqual([
    [],
    ['5-hour window at 61%, resets in 2h14m'],
  ])
})

test('a window that resets after it was near is news, and can be news again', () => {
  expect(run([reading(80), reading(90), reading(3), reading(60), reading(88)])).toEqual([
    [],
    ['5-hour window at 90%, resets in 2h14m'],
    ['5-hour window reset: the full allowance is back'],
    [],
    ['5-hour window at 88%, resets in 2h14m'],
  ])
})

test('a window that resets from a calm level is not news', () => {
  expect(run([reading(40), reading(2)])).toEqual([[], []])
})

test('the weekly window is named as one and says nothing of a reset it does not know', () => {
  expect(run([reading(10, 80), reading(10, 85)])).toEqual([[], ['Weekly window at 85%']])
})

test('a window that will fill before it resets is news once', () => {
  // 20 points in 10 minutes: at 70% the rest is gone in 15 minutes.
  const now = 10 * MINUTE
  const burning = [
    { at: 0, percent: 50 },
    { at: now, percent: 70 },
  ]

  expect(
    run([reading(50), reading(70, 20, 30, burning), reading(72, 20, 30, burning)], false, now),
  ).toEqual([[], ['5-hour window fills in 15m at this pace'], []])
})

test('a line crossed says it alone: no pace notice in the same reading', () => {
  const now = 10 * MINUTE
  const burning = [
    { at: 0, percent: 60 },
    { at: now, percent: 86 },
  ]

  expect(run([reading(60), reading(86, 20, 30, burning)], false, now)[1]).toEqual([
    '5-hour window at 86%, resets in 2h04m',
  ])
})

test('the context past 80% is news, and again after it was compacted', () => {
  expect(
    run([
      reading(10, 20, 79),
      reading(10, 20, 81),
      reading(10, 20, 84),
      reading(10, 20, 30),
      reading(10, 20, 82),
    ]),
  ).toEqual([
    [],
    ['Context at 81%: compact before the next long task'],
    [],
    [],
    ['Context at 82%: compact before the next long task'],
  ])
})

test('an unknown context is never news', () => {
  expect(run([reading(10, 20, null), reading(10, 20, null)])).toEqual([[], []])
})

// The context on a 1M window, by its size: a share of it says little.
const sized = (tokens: number | null, window = 1_000_000) => ({
  ...reading(10, 20, tokens === null ? null : (tokens / window) * 100),
  tokens,
  window,
})
const runSized = (readings: ReturnType<typeof sized>[], weight: typeof WEIGHT | null = WEIGHT) => {
  let memory: Alerted = {}
  let before: ReturnType<typeof sized> | null = null
  const said: string[][] = []

  for (const after of readings) {
    const judged = review(before, after, memory, 0, false, weight)

    said.push(judged.notices.map(notice => notice.line))
    memory = judged.memory
    before = after
  }

  return said
}

test('a context crowds at 400k or at 80% of its window, whichever comes first', () => {
  expect(isCrowded(400_000, 40, WEIGHT)).toBe(true)
  expect(isCrowded(399_999, 40, WEIGHT)).toBe(false)
  expect(isCrowded(170_000, 85, WEIGHT)).toBe(true)
  expect(isCrowded(null, 80, WEIGHT)).toBe(true)
  expect(isCrowded(null, 79, WEIGHT)).toBe(false)
  expect(isCrowded(null, null, WEIGHT)).toBe(false)
  // Weight off: the share alone.
  expect(isCrowded(500_000, 50, null)).toBe(false)
  expect(isCrowded(800_000, 80, null)).toBe(true)
  expect(isCrowded(320_000, 32, { warn: 150_000, full: 300_000 })).toBe(true)
})

test('a context past 400k on a 1M window is news once a crossing, said in k, and again after a compaction', () => {
  expect(runSized([sized(390_000), sized(401_000), sized(420_000), sized(450_000), sized(120_000), sized(410_000)])).toEqual([
    [],
    ['Context at 401k (40%): compact before the next long task'],
    [],
    [],
    [],
    ['Context at 410k (41%): compact before the next long task'],
  ])

  const { notices } = review(sized(390_000), sized(401_000), {}, 0, false, WEIGHT)

  expect(notices[0]).toMatchObject({
    kind: 'context',
    title: 'Context at 401k',
    text: 'Press Compact in the band, or run /compact.',
    bar: { name: 'Context', label: '401k' },
  })
})

test('with the weight off a context on a 1M window is news only at 80%', () => {
  expect(runSized([sized(390_000), sized(450_000), sized(810_000)], null)).toEqual([
    [],
    [],
    ['Context at 810k (81%): compact before the next long task'],
  ])
})

test('a context whose size is not known yet is news by its share, as before', () => {
  expect(runSized([sized(null), { ...sized(null), percent: 82 }])).toEqual([[], ['Context at 82%: compact before the next long task']])
})
