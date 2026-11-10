import { expect, test } from 'claude-code/testing'

import { WIDE_BAR_PX, fit, stackFor, told, widthOf } from '../hooks/fit'
import type { Fitted, Wish } from '../hooks/fit'

const WISH: Wish = {
  layout: 'rings',
  context: { used: '42%', word: 'context' },
  windows: [
    { name: '5-hour', brief: '5h', used: '31%', clock: '2h14m' },
    { name: 'Weekly', brief: 'Week', used: '90%', clock: '4d 6h' },
  ],
  usedWord: 'used',
  leftWord: 'left',
  eta: '↗ 5H full in 59m',
  cost: '$1.84',
  action: null,
}
const FULL: Fitted = {
  layout: 'rings',
  hasContextWord: true,
  hasWords: true,
  hasClock: true,
  windows: 2,
  hasEta: true,
  hasCost: true,
}
const LAYOUTS = ['rings', 'bars', 'compact', 'frames', 'stack'] as const
// One step narrower than what was just drawn.
const tighter = (wish: Wish, drawn: Fitted) => fit(wish, widthOf(wish, drawn) - 0.01)

test('a band with room draws everything it was asked for', () => {
  for (const layout of LAYOUTS) {
    expect(fit({ ...WISH, layout }, 400)).toEqual({ ...FULL, layout })
  }
})

test('the cost is the first to go, then the word beside the context, then the forecast', () => {
  const noCost = tighter(WISH, FULL)
  const noWord = tighter(WISH, noCost)
  const noEta = tighter(WISH, noWord)

  expect(noCost).toEqual({ ...FULL, hasCost: false })
  expect(noWord).toEqual({ ...FULL, hasCost: false, hasContextWord: false })
  expect(noEta).toEqual({ ...FULL, hasCost: false, hasContextWord: false, hasEta: false })
})

test('what is drawn fits the width it was given, down to the context alone', () => {
  for (const layout of LAYOUTS) {
    const wish = { ...WISH, layout }

    for (let columns = 140; columns >= 0; columns -= 1) {
      const drawn = fit(wish, columns)

      // Past the last step nothing more can go: the context is never dropped.
      expect(widthOf(wish, drawn) <= columns || drawn.windows === 0).toBe(true)
    }
  }
})

test('parts go in one order at every width: cost, context word, forecast, words, countdown, windows', () => {
  for (const layout of LAYOUTS) {
    const wish = { ...WISH, layout }

    for (let columns = 140; columns >= 0; columns -= 1) {
      const drawn = fit(wish, columns)

      if (drawn.hasCost) expect(drawn.hasContextWord).toBe(true)
      if (drawn.hasContextWord) expect(drawn.hasEta).toBe(true)
      if (drawn.hasEta) expect(drawn.hasWords && drawn.hasClock).toBe(true)
      if (!drawn.hasClock) expect(drawn.hasWords).toBe(false)
      if (drawn.windows < 2) expect(drawn.hasClock).toBe(false)
      // A layout too wide falls back to the tightest one, never to another.
      expect([layout, 'compact']).toContain(drawn.layout)
    }
  }
})

test('a narrower band never draws more than a wider one did', () => {
  for (const layout of LAYOUTS) {
    const wish = { ...WISH, layout }
    let before = widthOf(wish, fit(wish, 140))

    for (let columns = 139; columns >= 0; columns -= 1) {
      const width = widthOf(wish, fit(wish, columns))

      expect(width <= before).toBe(true)
      before = width
    }
  }
})

test('both countdowns survive at the width of a narrow desktop window', () => {
  for (const layout of LAYOUTS) {
    const drawn = fit({ ...WISH, layout }, 56)

    expect(drawn.hasClock).toBe(true)
    expect(drawn.windows).toBe(2)
  }
})

test('a band with no context, forecast or cost fits by the same steps', () => {
  const bare = { ...WISH, context: null, eta: null, cost: null }

  expect(fit(bare, 400).windows).toBe(2)
  expect(fit(bare, 0).windows).toBe(0)
  expect(widthOf(bare, fit(bare, 0))).toBe(0)
})

test('told says how wide the band is and what was left out', () => {
  expect(told(WISH, FULL, 120)).toBe('Band: 120 columns wide, drawn as rings in full.')
  expect(told(WISH, { ...FULL, hasCost: false, hasEta: false }, 58)).toBe(
    'Band: 58 columns wide, drawn as rings without cost, forecast.',
  )
  expect(
    told(
      WISH,
      { ...FULL, layout: 'compact', hasCost: false, hasEta: false, hasContextWord: false, windows: 1, hasClock: false, hasWords: false },
      12,
    ),
  ).toBe(
    'Band: 12 columns wide, drawn as compact (rings is too wide) without cost, the context word, forecast, words, countdowns, 1 window.',
  )
})

test('told leaves out what was never asked for', () => {
  const bare = { ...WISH, eta: null, cost: null }

  expect(told(bare, { ...FULL, hasCost: false, hasEta: false }, 58)).toBe(
    'Band: 58 columns wide, drawn as rings in full.',
  )
})

test('a button beside the context takes its room and is never given up', () => {
  const pressed = { ...WISH, action: 'Compact' }

  expect(widthOf(pressed, FULL) > widthOf(WISH, FULL) + 'Compact'.length * 0.5).toBe(true)
  // With the button the same band runs out of room sooner.
  expect(fit(pressed, widthOf(WISH, FULL)).hasCost).toBe(false)
  expect(widthOf(pressed, fit(pressed, 0)) > widthOf(WISH, fit(WISH, 0))).toBe(true)
})

test("the stack's bars take the room a narrow pane leaves, and give up \"left\" under their floor", () => {
  const windows = [
    { name: '5h', used: '50%', clock: '1h 3m' },
    { name: 'Week', used: '47%', clock: '3d 11h' },
  ]

  expect(stackFor(80, windows, 'left')).toEqual({ bar: WIDE_BAR_PX, hasWords: true })

  const narrow = stackFor(36, windows, 'left')

  expect(narrow.hasWords).toBe(true)
  expect(narrow.bar).toBeLessThan(WIDE_BAR_PX)
  expect(narrow.bar).toBeGreaterThanOrEqual(56)
  expect(stackFor(20, windows, 'left')).toEqual({ bar: 56, hasWords: false })
})
