import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { barSvg, paceSvg, paletteOf, ringSvg } from '../hooks/svg'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const band = (isWorking: boolean) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 80, ...SITE },
  }) as const
const MEASURE = {
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: 31,
      resetsAt: new Date(NOW + 2 * HOUR + 14 * MINUTE).toISOString(),
    },
    { kind: 'seven_day', percentUsed: 90 },
  ],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
}
const DEFAULTS = { success: '#3a9a53', warning: '#b07f00', error: '#e04f63' }
const world = (on: On) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: 'beneath' })
  })
}

test('ringSvg draws the arc as long as the percentage, in the colour of its level', () => {
  const half = ringSvg(50, 'context', false)

  // The rim is 2π × 9.5 = 59.69 long: half of it is drawn.
  expect(half.source).toContain('stroke-dasharray="29.85 59.69"')
  expect(half.source).toContain('#3a9a53')
  expect(half.alt).toBe('context 50%')
  expect(ringSvg(70, '5h', false).source).toContain('#b07f00')
  expect(ringSvg(90, '7d', false).source).toContain('#e04f63')
  expect(ringSvg(140, '7d', false).source).toContain('stroke-dasharray="59.69 59.69"')
})

test('ringSvg of nothing used is the bare track, with no dot at the top', () => {
  const empty = ringSvg(0, 'context', false)

  expect(empty.source).not.toContain('stroke-dasharray')
  expect(empty.alt).toBe('context 0%')
})

test('ringSvg of an unknown percentage is the bare track', () => {
  const unknown = ringSvg(null, 'context', false)

  expect(unknown.source).not.toContain('stroke-dasharray')
  expect(unknown.alt).toBe('context unknown')
})

test('ringSvg orbits only while a turn runs, and not for a reader who asked for less motion', () => {
  const working = ringSvg(42, 'context', true).source

  expect(working).toContain('@keyframes')
  expect(working).toContain('prefers-reduced-motion')
  expect(ringSvg(42, 'context', false).source).not.toContain('animation')
})

test('ringSvg paints with the palette it is given', () => {
  const palette = paletteOf({ colorOk: '#00ffaa', colorWarn: '#ABC', colorFull: '#123456' })

  expect(ringSvg(10, 'context', false, palette).source).toContain('#00ffaa')
  expect(ringSvg(10, 'context', false, palette).source).not.toContain('#3a9a53')
  expect(ringSvg(70, '5h', false, palette).source).toContain('#ABC')
  expect(ringSvg(90, '7d', false, palette).source).toContain('#123456')
})

test('paletteOf keeps the default for a value that is no hex colour', () => {
  expect(paletteOf({})).toEqual(DEFAULTS)
  expect(
    paletteOf({ colorOk: 'red"/><script>', colorWarn: '', colorFull: '#12345' }),
  ).toEqual(DEFAULTS)
})

test('paceSvg draws what is used outside and the time gone inside', () => {
  const pace = paceSvg(50, 25, '5-hour')

  // The rims are 2π × 13.5 = 84.82 and 2π × 8 = 50.27 long.
  expect(pace.source).toContain('stroke-dasharray="42.41 84.82"')
  expect(pace.source).toContain('stroke-dasharray="12.57 50.27"')
  expect(pace.source).toContain('#3a9a53')
  expect(pace.alt).toBe('5-hour 50% used, 25% of the window gone')
})

test('paceSvg of a window with no known reset has no inner arc', () => {
  const pace = paceSvg(90, null, 'Weekly')

  expect(pace.source.match(/stroke-dasharray/g)).toHaveLength(1)
  expect(pace.alt).toBe('Weekly 90% used')
})

test('barSvg has a cell per hour or day, filled as far as is used, with a tick at now', () => {
  const hours = barSvg(5, 60, 50, '5h')
  const days = barSvg(7, 10, null, 'Week')

  expect(hours.source.match(/fill-opacity=".28"/g)).toHaveLength(5)
  expect(days.source.match(/fill-opacity=".28"/g)).toHaveLength(7)
  expect(hours.source).toContain('#b07f00')
  // The bar is 92 wide: now stands at half of it.
  expect(hours.source).toContain('x="45.0" y="3"')
  expect(days.source).not.toContain('y="3"')
  expect(hours.alt).toBe('5h 60% used, 50% of the window gone')
  expect(days.alt).toBe('Week 10% used')
})

test('the desktop band draws each window as a double ring, its countdown in bold', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(false) })
  const rings = await ui.findAll({ type: 'Svg' })

  // 2h14m of five hours are left: 55% of the window is gone.
  expect(rings.map(ring => ring.props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5-hour 31% used, 55% of the window gone',
    'Weekly 90% used',
  ])
  expect(String(rings[2]?.props.source)).toContain('#e04f63')
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: '42%' }))?.props.weight).toBe('semibold')
  expect(await ui.find({ type: 'Text', text: 'context' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '2h14m' }))?.props.weight).toBe('semibold')
  expect(await ui.find({ type: 'Text', text: '5-hour, 31% used' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Weekly, 90% used' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
})

const narrow = (bodyColumns: number) =>
  ({
    plugin: PLUGIN,
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...band(false).props, bodyColumns },
  }) as const

test('a desktop band short of room drops the cost and the words before any figure', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount(narrow(44))

  expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'context' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'left' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '5-hour 31%' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '2h14m' }))?.props.weight).toBe('semibold')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(3)
})

test('a desktop band too narrow for its layout falls back to the tight one and keeps the countdown', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount(narrow(33))

  expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5h 31% used',
    'Week 90% used',
  ])
  expect(await ui.find({ type: 'Text', text: '2h14m' })).toBeDefined()
})

test('the narrowest desktop band is the context alone', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount(narrow(10))

  expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual(['context 42%, Crab standing by'])
  expect((await ui.find({ type: 'Text', text: '42%' }))?.props.weight).toBe('semibold')
})

test('a window with no known reset draws no countdown and no dash on the desktop', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(false) })

  expect(await ui.findAll({ type: 'Text', text: '--' })).toHaveLength(0)
  // Only the five-hour window knows when it resets.
  expect(await ui.findAll({ type: 'Text', text: 'left' })).toHaveLength(1)
})

test('the bars style draws each window as a bar of hour or day cells', { options: { style: 'bars' } }, async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(false) })
  const drawn = await ui.findAll({ type: 'Svg' })

  expect(drawn.map(svg => svg.props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5h 31% used, 55% of the window gone',
    'Week 90% used',
  ])
  expect(String(drawn[1]?.props.source).match(/fill-opacity=".28"/g)).toHaveLength(5)
  expect(String(drawn[2]?.props.source).match(/fill-opacity=".28"/g)).toHaveLength(7)
  expect((await ui.find({ type: 'Text', text: '2h14m' }))?.props.weight).toBe('semibold')
  expect((await ui.find({ type: 'Text', text: '31%' }))?.props.weight).toBe('semibold')
  expect(await ui.find({ type: 'Text', text: 'Week' })).toBeDefined()
})

test('the desktop figures take the colours set in the options', { options: { colorFull: '#123456' } }, async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(false) })
  const rings = await ui.findAll({ type: 'Svg' })

  // Between turns the crab stands where the context ring was: the 5-hour
  // ring shows the untouched colour.
  expect(String(rings[1]?.props.source)).toContain('#3a9a53')
  expect(String(rings[2]?.props.source)).toContain('#123456')
  expect(String(rings[2]?.props.source)).not.toContain('#e04f63')
})

test('on the desktop only the context ring orbits, and only while a turn runs', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  // The ring is drawn where the crab is not.
  await $.command.run({ ...TYPED, command: 'tokens', args: 'hide crab' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(true) })
  const moving = (await ui.findAll({ type: 'Svg' })).map(ring =>
    String(ring.props.source).includes('@keyframes'),
  )
  expect(moving).toEqual([true, false, false])

  await ui.redraw(band(false).props)
  const resting = (await ui.findAll({ type: 'Svg' })).map(ring =>
    String(ring.props.source).includes('@keyframes'),
  )
  expect(resting).toEqual([false, false, false])
})

test('a terminal has no vector element: it keeps the glyph ring', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(false) })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(1)
})
