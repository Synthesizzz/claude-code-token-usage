import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { barSvg, paceSvg } from '../hooks/svg'
import { resets } from '../hooks/usage'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, ...SITE },
} as const
const reading = (fiveHour: number, left: number) => ({
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(NOW + left).toISOString() },
    { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(NOW + 60 * HOUR).toISOString() },
  ],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
// The engine beneath the mod: a clock the test moves, toasts and a store that
// keep nothing.
const world = (on: On) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return mock.clock(on, { now: NOW })
}
const snapshot = (fiveHour: number) => ({
  at: 0,
  unread: [] as string[],
  tokens: null,
  window: 200000,
  percent: null,
  usd: null,
  limits: [{ kind: 'five_hour', percentUsed: fiveHour, resetsAt: null, samples: [] }],
})

test('a figure at rest has no motion in it', () => {
  expect(paceSvg(91, 98, '5-hour').source).not.toContain('@keyframes')
  expect(barSvg(5, 91, 98, '5h').source).not.toContain('@keyframes')
})

test('a ring near its reset breathes, and holds still for a reader who asked for less motion', () => {
  const near = paceSvg(91, 98, '5-hour', undefined, { kind: 'near' })

  expect(near.source).toContain('@keyframes')
  expect(near.source).toContain('infinite')
  expect(near.source).toContain('prefers-reduced-motion')
  expect(near.alt).toBe('5-hour 91% used, 98% of the window gone')
})

test('a ring that just reset drains what was used away, once, and rings in the calm colour', () => {
  const fresh = paceSvg(2, 1, '5-hour', undefined, { kind: 'reset', from: 91 })

  // The old arc, 91% of a rim of 84.82, in the colour it had: it runs out.
  expect(fresh.source).toContain('stroke-dasharray="77.19 84.82"')
  expect(fresh.source).toContain('#e04f63')
  expect(fresh.source).toContain('forwards')
  expect(fresh.source).not.toContain('infinite')
  // The new reading stands under it, and the ripple is the calm colour.
  expect(fresh.source).toContain('stroke-dasharray="1.70 84.82"')
  expect(fresh.source).toContain('#3a9a53')
  expect(fresh.source).toContain('prefers-reduced-motion')
})

test('a bar near its reset breathes, and one that just reset drains once', () => {
  const near = barSvg(5, 91, 98, '5h', undefined, undefined, { kind: 'near' })
  const fresh = barSvg(5, 2, 1, '5h', undefined, undefined, { kind: 'reset', from: 91 })

  expect(near.source).toContain('infinite')
  expect(near.source).toContain('prefers-reduced-motion')
  expect(fresh.source).toContain('forwards')
  expect(fresh.source).not.toContain('infinite')
  expect(fresh.source).toContain('scaleX')
  expect(fresh.source).toContain('#e04f63')
  expect(fresh.source).toContain('#3a9a53')
})

test('a window has reset when its reading falls by more than ten points', () => {
  expect(resets(snapshot(90), snapshot(3))).toEqual([{ kind: 'five_hour', from: 90 }])
  expect(resets(snapshot(85.2), snapshot(84.9))).toEqual([])
  expect(resets(snapshot(40), snapshot(60))).toEqual([])
  expect(resets(null, snapshot(3))).toEqual([])
})

test('a window five minutes from its reset breathes in the rings and in the bars', async ($, on) => {
  world(on)
  await $.session.measure(reading(91, 4 * MINUTE))

  for (const layout of ['rings', 'bars', 'stack'] as const) {
    await $.command.run({ ...TYPED, command: 'tokens', args: `layout ${layout}` })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    const [, fiveHour, sevenDay] = await ui.findAll({ type: 'Svg' })

    expect(String(fiveHour?.props.source)).toContain('infinite')
    // The weekly window is days from its reset: it rests.
    expect(String(sevenDay?.props.source)).not.toContain('@keyframes')
  }
})

test('a window far from its reset rests', async ($, on) => {
  world(on)
  await $.session.measure(reading(91, 2 * HOUR))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(String((await ui.findAll({ type: 'Svg' }))[1]?.props.source)).not.toContain('@keyframes')
})

test('a window that just reset plays its reset once, then rests', async ($, on) => {
  const clock = world(on)

  await $.session.measure(reading(91, 4 * MINUTE))
  await clock.advance(5 * MINUTE)
  await $.session.measure(reading(3, 5 * HOUR + 5 * MINUTE))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  // The reset is news as well, so the crab stands in a row above: the
  // window is found by what it is, not by where it is.
  const fiveHour = async () =>
    String(
      (await ui.findAll({ type: 'Svg' })).find(({ props }) =>
        String(props.alt).startsWith('5-hour'),
      )?.props.source,
    )
  const playing = await fiveHour()

  expect(playing).toContain('forwards')
  expect(playing).toContain('stroke-dasharray="77.19 84.82"')

  await clock.advance(4000)
  expect(await fiveHour()).not.toContain('@keyframes')
})
