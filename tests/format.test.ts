import { expect, test } from 'claude-code/testing'

import {
  brief,
  cellsOf,
  countdown,
  elapsed,
  etaMs,
  forecast,
  pie,
  record,
  ring,
  title,
} from '../hooks/usage'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

test('pie picks the quarter nearest the percentage', () => {
  expect(pie(0)).toBe('○')
  expect(pie(12)).toBe('○')
  expect(pie(31)).toBe('◔')
  expect(pie(42)).toBe('◑')
  expect(pie(70)).toBe('◕')
  expect(pie(88)).toBe('●')
  expect(pie(140)).toBe('●')
})

test('countdown shortens to the two largest units', () => {
  expect(countdown(-5)).toBe('<1m')
  expect(countdown(59_000)).toBe('<1m')
  expect(countdown(14 * MINUTE)).toBe('14m')
  expect(countdown(2 * HOUR + 14 * MINUTE)).toBe('2h14m')
  expect(countdown(2 * HOUR + 4 * MINUTE)).toBe('2h04m')
  expect(countdown(4 * DAY + 6 * HOUR + 59 * MINUTE)).toBe('4d 6h')
})

test('record keeps one sample per level and starts over when the window resets', () => {
  const first = record([], { at: 0, percent: 10 })
  expect(first).toEqual([{ at: 0, percent: 10 }])

  const same = record(first, { at: MINUTE, percent: 10 })
  expect(same).toEqual([{ at: 0, percent: 10 }])

  const grown = record(same, { at: 2 * MINUTE, percent: 12 })
  expect(grown).toHaveLength(2)

  expect(record(grown, { at: 3 * MINUTE, percent: 1 })).toEqual([
    { at: 3 * MINUTE, percent: 1 },
  ])
})

test('record drops samples older than thirty minutes and keeps at most sixty', () => {
  const old = record([{ at: 0, percent: 1 }], { at: 31 * MINUTE, percent: 2 })
  expect(old).toEqual([{ at: 31 * MINUTE, percent: 2 }])

  let samples = [{ at: 0, percent: 0 }]
  for (let i = 1; i <= 80; i += 1) {
    samples = record(samples, { at: i * 1000, percent: i })
  }
  expect(samples).toHaveLength(60)
  expect(samples.at(-1)).toEqual({ at: 80_000, percent: 80 })
})

test('etaMs projects the time left at the measured rate', () => {
  const samples = [
    { at: 0, percent: 40 },
    { at: 10 * MINUTE, percent: 50 },
  ]

  // 10 points in 10 minutes: the 50 left take 50 minutes.
  expect(etaMs(samples, 10 * MINUTE)).toBe(50 * MINUTE)
})

test('etaMs declines without five minutes of data or a whole point of growth', () => {
  expect(etaMs([], 0)).toBeNull()
  expect(etaMs([{ at: 0, percent: 40 }], 20 * MINUTE)).toBeNull()
  expect(
    etaMs(
      [
        { at: 0, percent: 40 },
        { at: 2 * MINUTE, percent: 50 },
      ],
      2 * MINUTE,
    ),
  ).toBeNull()
  expect(
    etaMs(
      [
        { at: 0, percent: 40 },
        { at: 10 * MINUTE, percent: 40.5 },
      ],
      10 * MINUTE,
    ),
  ).toBeNull()
})

test('etaMs ignores growth that ended more than thirty minutes ago', () => {
  const samples = [
    { at: 0, percent: 40 },
    { at: 10 * MINUTE, percent: 50 },
  ]

  expect(etaMs(samples, 45 * MINUTE)).toBeNull()
})

test('ring lights a tenth of its rim per ten points, clockwise from the top left', () => {
  const [top = [], middle = [], bottom = []] = ring(42)

  expect(top.map(cell => cell.text).join('')).toBe('⢀⠤⠤⡀')
  expect(top.map(cell => cell.kind)).toEqual(['on', 'on', 'on', 'on'])
  expect(middle.map(cell => cell.text)).toEqual(['⡇', '42', '⢸'])
  expect(middle.map(cell => cell.kind)).toEqual(['off', 'label', 'off'])
  expect(bottom.map(cell => cell.text).join('')).toBe('⠈⠒⠒⠁')
  expect(bottom.map(cell => cell.kind)).toEqual(['off', 'off', 'off', 'off'])
})

test('ring closes at a hundred and keeps its label two cells wide', () => {
  const [top = [], middle = [], bottom = []] = ring(100)

  expect([...top, ...bottom].every(cell => cell.kind === 'on')).toBe(true)
  expect(middle.map(cell => cell.kind)).toEqual(['on', 'label', 'on'])
  expect(middle[1]?.text).toBe('!!')
  expect(ring(7)[1]?.[1]?.text).toBe(' 7')
  // 55%: the top, the right side, then the bottom from the right.
  expect(ring(55)[1]?.map(cell => cell.kind)).toEqual(['off', 'label', 'on'])
  expect(ring(60)[2]?.map(cell => cell.kind)).toEqual(['off', 'off', 'off', 'on'])
})

test('ring of an unknown percentage is dark and says so', () => {
  const rows = ring(null)

  expect(rows.flat().some(cell => cell.kind === 'on')).toBe(false)
  expect(rows[1]?.[1]?.text).toBe('--')
})

const BURNING = [
  { at: 0, percent: 40 },
  { at: 10 * MINUTE, percent: 50 },
]
const at = (ms: number) => new Date(ms).toISOString()

test('forecast is the time to full when that comes before the reset', () => {
  const limit = {
    kind: 'five_hour',
    percentUsed: 50,
    resetsAt: at(3 * HOUR),
    samples: BURNING,
  }

  expect(forecast(limit, 10 * MINUTE)).toBe(50 * MINUTE)
  expect(forecast({ ...limit, resetsAt: null }, 10 * MINUTE)).toBe(50 * MINUTE)
})

test('forecast is silent when the window resets first', () => {
  const limit = {
    kind: 'five_hour',
    percentUsed: 50,
    resetsAt: at(40 * MINUTE),
    samples: BURNING,
  }

  expect(forecast(limit, 10 * MINUTE)).toBeNull()
})

test('forecast is silent past five hours, where half an hour of slope says little', () => {
  const limit = {
    kind: 'seven_day',
    percentUsed: 13,
    resetsAt: at(4 * DAY),
    samples: [
      { at: 0, percent: 12 },
      { at: 10 * MINUTE, percent: 13 },
    ],
  }

  expect(forecast(limit, 10 * MINUTE)).toBeNull()
})

// A long window is read at the pace of the window so far: half an hour of
// slope says little about a week.

test("a weekly window that fills before its reset at the week's pace says when", () => {
  const now = 10 * DAY
  // Half the week gone, 70% used: 20% a day, so 30% more in a day and a half.
  const limit = { kind: 'seven_day', percentUsed: 70, resetsAt: at(now + 3.5 * DAY), samples: [] }

  expect(forecast(limit, now)).toBe(1.5 * DAY)
})

test("a weekly window says nothing where the week's pace fills it after the reset, or too early to tell", () => {
  const now = 10 * DAY

  expect(forecast({ kind: 'seven_day', percentUsed: 40, resetsAt: at(now + 3.5 * DAY), samples: [] }, now)).toBeNull()
  // Under half a day into the week, the pace is not yet one.
  expect(forecast({ kind: 'seven_day', percentUsed: 30, resetsAt: at(now + 6.8 * DAY), samples: [] }, now)).toBeNull()
  expect(forecast({ kind: 'seven_day', percentUsed: 70, resetsAt: null, samples: [] }, now)).toBeNull()
  // A five-hour window keeps to its own slope.
  expect(forecast({ kind: 'five_hour', percentUsed: 70, resetsAt: at(now + 2 * HOUR), samples: [] }, now)).toBeNull()
})

test('elapsed is the share of its window a limit has spent', () => {
  const window = (kind: string, left: number) => ({
    kind,
    percentUsed: 0,
    resetsAt: at(left),
    samples: [],
  })

  expect(elapsed(window('five_hour', 2 * HOUR + 30 * MINUTE), 0)).toBe(50)
  expect(elapsed(window('seven_day', 3.5 * DAY), 0)).toBe(50)
  expect(elapsed(window('five_hour', 9 * HOUR), 0)).toBe(0)
  expect(elapsed(window('five_hour', -HOUR), 0)).toBe(100)
})

test('elapsed is unknown without a reset, or for a window of no known length', () => {
  const window = { kind: 'five_hour', percentUsed: 0, resetsAt: null, samples: [] }

  expect(elapsed(window, 0)).toBeNull()
  expect(elapsed({ ...window, kind: 'monthly', resetsAt: at(HOUR) }, 0)).toBeNull()
})

test('a window is named in words, briefly, and by its hours or days', () => {
  expect([title('five_hour'), brief('five_hour'), cellsOf('five_hour')]).toEqual(['5-hour', '5h', 5])
  expect([title('seven_day'), brief('seven_day'), cellsOf('seven_day')]).toEqual(['Weekly', 'Week', 7])
  expect([title('monthly'), brief('monthly'), cellsOf('monthly')]).toEqual(['monthly', 'monthly', 1])
})
