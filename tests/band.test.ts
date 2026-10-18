import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'token-usage'
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const band = (bodyColumns: number, isWorking = false) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns, ...SITE },
  }) as const
const PANE = {
  component: 'Pane',
  requestId: 'tokens',
  props: {
    title: 'Token usage',
    isFocused: false,
    bodyColumns: 28,
    placement: 'dock',
    ...SITE,
  },
} as const
const at = (ms: number) => new Date(ms).toISOString()
const measure = (fiveHour: number, resets?: { fiveHour: number; sevenDay: number }) => ({
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: fiveHour,
      ...(resets && { resetsAt: at(resets.fiveHour) }),
    },
    {
      kind: 'seven_day',
      percentUsed: 12,
      ...(resets && { resetsAt: at(resets.sevenDay) }),
    },
  ],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
const RESETS = {
  fiveHour: NOW + 2 * HOUR + 14 * MINUTE,
  sevenDay: NOW + 4 * DAY + 6 * HOUR,
}
// The engine beneath the mod: a clock the test moves, and an empty band.
const world = (on: On) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  mock.store(on)

  return mock.clock(on, { now: NOW })
}

test('band counts down to each window reset on every surface', async ($, on) => {
  world(on)
  await $.session.measure(measure(31, RESETS))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(80) })
    expect(await ui.find({ type: 'Text', text: '2h14m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '4d 6h' })).toBeDefined()
  }
})

test('band holds the countdown slot with a dash while a window names no reset', async ($, on) => {
  world(on)
  await $.session.measure(measure(31))

  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(80) })
    expect(await ui.findAll({ type: 'Text', text: '--' })).toHaveLength(2)
  }
})

test('the countdown moves on with the clock', async ($, on) => {
  const clock = world(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(31, RESETS))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(80) })
  expect(await ui.find({ type: 'Text', text: '2h14m' })).toBeDefined()

  await clock.advance(MINUTE)
  expect(await ui.find({ type: 'Text', text: '2h13m' })).toBeDefined()
})

test('band forecasts the window that fills before it resets', async ($, on) => {
  const clock = world(on)
  await $.session.measure(measure(31, RESETS))
  await clock.advance(10 * MINUTE)
  await $.session.measure({ ...measure(41, RESETS), changed: ['rateLimits'] })

  for (const surface of ['terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(80) })
    expect(await ui.find({ type: 'Text', text: '↗ 5H full in 59m' })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: '↗' })).toHaveLength(1)
  }
})

test('band forecasts nothing when the reset comes first', async ($, on) => {
  const clock = world(on)
  const soon = { ...RESETS, fiveHour: NOW + 30 * MINUTE }
  await $.session.measure(measure(31, soon))
  await clock.advance(10 * MINUTE)
  await $.session.measure({ ...measure(41, soon), changed: ['rateLimits'] })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(80) })
  expect(await ui.find({ type: 'Text', text: '41%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↗' })).toBeUndefined()
})

test('a narrow band gives up cost, countdowns and the later window, never the context', async ($, on) => {
  world(on)
  await $.session.measure(measure(31, RESETS))
  const drawn = async (columns: number) => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'vscode', ...band(columns) })
    const has = async (text: string) =>
      (await ui.find({ type: 'Text', text })) !== undefined

    return {
      context: await has('42%'),
      fiveHour: await has('5H'),
      sevenDay: await has('7D'),
      countdown: await has('2h14m'),
      cost: await has('$0.00 API today'),
    }
  }

  expect(await drawn(50)).toEqual({
    context: true,
    fiveHour: true,
    sevenDay: true,
    countdown: true,
    cost: false,
  })
  expect(await drawn(40)).toEqual({
    context: true,
    fiveHour: true,
    sevenDay: true,
    countdown: false,
    cost: false,
  })
  expect(await drawn(25)).toEqual({
    context: true,
    fiveHour: true,
    sevenDay: false,
    countdown: false,
    cost: false,
  })
  expect(await drawn(12)).toEqual({
    context: true,
    fiveHour: false,
    sevenDay: false,
    countdown: false,
    cost: false,
  })
})

test('the context ring spins while a turn runs and rests on the fill', async ($, on) => {
  world(on)
  await $.session.measure(measure(31, RESETS))

  // The desktop draws a vector ring instead: tests/desktop.test.ts.
  for (const surface of ['terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(80, true) })
    expect((await ui.find({ type: 'Text', in: 'ctx' }))?.text).toBe('◴')

    await ui.advance(120)
    expect((await ui.find({ type: 'Text', in: 'ctx' }))?.text).toBe('◷')

    await ui.redraw(band(80).props)
    expect((await ui.find({ type: 'Text', in: 'ctx' }))?.text).toBe('◑')

    await ui.advance(600)
    expect((await ui.find({ type: 'Text', in: 'ctx' }))?.text).toBe('◑')
  }
})

test('a surface with no client region draws the context ring at rest', async ($, on) => {
  world(on)
  await $.session.measure(measure(31, RESETS))

  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(80, true) })
    expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: '◑' })).toBeDefined()
  }
})

test('pane draws a ring per figure with its reset and forecast', async ($, on) => {
  const clock = world(on)
  await $.session.measure(measure(31, RESETS))
  await clock.advance(10 * MINUTE)
  await $.session.measure({ ...measure(41, RESETS), changed: ['rateLimits'] })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })
  // 42% of context: the four cells of the top lit, in the calm colour.
  const top = await ui.find({ type: 'Text', text: '⢀⠤⠤⡀' })
  expect(top?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: 'reset 2h04m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'reset 4d 5h' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'full in 59m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '84,000 / 200,000' })).toBeDefined()

  // The desktop draws the rings inside one another, and says the same in the alt.
  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
  const rings = (await desktop.findAll({ type: 'Svg' }))[0]

  expect(String(rings?.props.alt)).toMatch(/^CTX 42%, 84,000 \/ 200,000; 5H 41%, reset 2h04m.*, full in 59m; 7D \d+%, reset 4d 5h/)
  expect((await desktop.findAll({ type: 'Text' })).some(({ text }) => text === '⢀⠤⠤⡀')).toBe(false)
})
