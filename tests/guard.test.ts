import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { turnTokens } from '../hooks/cost'
import { failedLine, readReading, unreadLine } from '../hooks/usage'
import { TYPED } from './kit'

// The hook API is early access: what Claude Code hands a mod changes between
// releases. A shape the mod does not know is left out and named, never drawn
// as NaN, and the band says what it could not read rather than vanishing.

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, ...SITE },
} as const
const PANE = {
  component: 'Pane',
  requestId: 'tokens',
  props: { title: 'Token usage', isFocused: false, bodyColumns: 40, placement: 'dock', ...SITE },
} as const
const CONTEXT = { window: 200000, tokens: 84000, percent: 42 }
const LIMITS = [{ kind: 'five_hour', percentUsed: 31 }]
const CHANGED = ['context', 'rateLimits', 'cost'] as const
const UNREAD = (names: string) => `token-usage can't read ${names} from this Claude Code: figures may be old`
// A measurement as the test hands it over, whatever its shape.
const odd = (fields: Record<string, unknown>) =>
  ({ context: CONTEXT, rateLimits: LIMITS, cost: { usd: 1 }, changed: [...CHANGED], ...fields }) as never
const world = (on: On) => {
  const clock = mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: 'beneath' })
  })

  return clock
}
const texts = async (ui: { findAll: (query: { type: 'Text' }) => Promise<readonly { text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(({ text }) => text)

test('a reading in the shape the mod knows is read whole, with nothing unread', () => {
  expect(
    readReading(CONTEXT, [{ kind: 'five_hour', percentUsed: 31, resetsAt: '2026-10-16T05:00:00Z' }], { usd: 1.2 }),
  ).toEqual({
    context: { tokens: 84000, window: 200000, percent: 42 },
    limits: [{ kind: 'five_hour', percentUsed: 31, resetsAt: '2026-10-16T05:00:00Z' }],
    usd: 1.2,
    unread: [],
  })
  // No cost yet is no cost, not a shape unknown; no tokens yet is no fill.
  expect(readReading({ window: 200000 }, [], undefined)).toEqual({
    context: { tokens: null, window: 200000, percent: null },
    limits: [],
    usd: null,
    unread: [],
  })
})

test('what is not in the shape the mod knows is left out and named', () => {
  expect(readReading(undefined, { five_hour: 31 }, { usd: 'a lot' })).toEqual({
    context: null,
    limits: null,
    usd: null,
    unread: ['context', 'rateLimits', 'cost'],
  })
  expect(readReading({ window: 200000, percent: Number.NaN }, [], undefined).unread).toEqual(['context'])

  // A window it cannot read is dropped; the others stand.
  const some = readReading(
    CONTEXT,
    [
      { kind: 'five_hour', percentUsed: '31%' },
      { kind: 'seven_day', percentUsed: 12 },
    ],
    undefined,
  )

  expect(some.limits).toEqual([{ kind: 'seven_day', percentUsed: 12, resetsAt: null }])
  expect(some.unread).toEqual(['rateLimits'])
  // With none it can read, the windows are not read at all.
  expect(readReading(CONTEXT, [{ percentUsed: 31 }], undefined).limits).toBeNull()
  // A reset it cannot read is no reset; the window stands.
  expect(readReading(CONTEXT, [{ kind: 'five_hour', percentUsed: 31, resetsAt: 'soon' }], undefined).limits).toEqual([
    { kind: 'five_hour', percentUsed: 31, resetsAt: null },
  ])
})

test('the line about what was not read names it, or is nothing', () => {
  expect(unreadLine([])).toBeNull()
  expect(unreadLine(['rateLimits'])).toBe(UNREAD('rateLimits'))
  expect(unreadLine(['context', 'turn usage'])).toBe(UNREAD('context, turn usage'))
})

test('a hook that failed is said for ten minutes, cut short, then let go', () => {
  const failure = { event: 'session.measure', message: 'TypeError: x is undefined', at: 0 }

  expect(failedLine(null, 0)).toBeNull()
  expect(failedLine(failure, 60_000)).toBe('token-usage: session.measure failed: TypeError: x is undefined')
  expect(failedLine(failure, 11 * 60_000)).toBeNull()
  expect(failedLine({ ...failure, message: 'y'.repeat(200) }, 0)?.length).toBe(80)
})

test("a turn's tokens are read field by field, and a turn with none readable has none", () => {
  expect(
    turnTokens({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 }),
  ).toEqual({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40, isWhole: true })
  expect(turnTokens({ input_tokens: 10, output_tokens: 'many' })).toEqual({
    input: 10,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    isWhole: false,
  })
  expect(turnTokens({ tokens: 99 })).toBeNull()
  expect(turnTokens('lots')).toBeNull()
})

test('windows in a shape it does not know: the band draws the rest and says what it could not read', async ($, on) => {
  world(on)
  await $.session.measure(odd({ rateLimits: { five_hour: 31 } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    const drawn = await texts(ui)

    expect(drawn.some(text => text.includes('42%'))).toBe(true)
    expect(drawn).toContain(UNREAD('rateLimits'))
    expect(drawn).toContain('beneath')
    expect(drawn.some(text => text.includes('NaN'))).toBe(false)
  }

  // A reading it knows again: the line goes.
  await $.session.measure(odd({}))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await texts(ui)).some(text => text.startsWith('token-usage can'))).toBe(false)
})

test('a window it cannot read keeps the one already shown, and no figure is NaN', async ($, on) => {
  world(on)
  await $.session.measure(odd({}))
  await $.session.measure(odd({ rateLimits: [{ kind: 'five_hour', percentUsed: '40%' }] }))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  const drawn = await texts(ui)

  expect(drawn.some(text => text.includes('31%'))).toBe(true)
  expect(drawn.some(text => text.includes('NaN'))).toBe(false)
  expect(drawn).toContain(UNREAD('rateLimits'))
})

test('a context and a cost it cannot read keep what was shown', async ($, on) => {
  world(on)
  await $.session.measure(odd({}))
  await $.session.measure(odd({ context: { size: 'big' }, cost: { dollars: 3 } }))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  const drawn = await texts(ui)

  expect(drawn.some(text => text.includes('42%'))).toBe(true)
  expect(drawn.some(text => text.includes('NaN'))).toBe(false)
  expect(drawn).toContain(UNREAD('context, cost'))
})

test('a turn whose tokens it cannot read counts what it can, and says so', async ($, on) => {
  world(on)
  await $.session.measure(odd({}))
  await $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId: 't1',
    usage: { model: 'm', input_tokens: 1200, output_tokens: 'many' },
  } as never)

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })
  const shown = await texts(pane)

  expect(shown.some(text => text.includes('NaN'))).toBe(false)
  expect(shown.some(text => text.includes('1.2k'))).toBe(true)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await texts(ui)).toContain(UNREAD('turn usage'))
})

// A hook of the mod that fails is skipped by the engine; its .catch notes
// it, lets the hooks beneath run, and the band says which failed and why.

// A store that refuses on the keys named, while `broken.on` says so.
const brokenWorld = (on: On, keys: readonly string[]) => {
  const broken = { on: false }
  const kept = new Map<string, unknown>()
  const clock = world(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('store.get', (_, e) => {
    if (broken.on && keys.includes(e.key)) {
      throw new Error(`store refused ${e.key}`)
    }

    return { value: kept.get(e.key) }
  })
  on('store.set', (_, e) => {
    if (broken.on && keys.includes(e.key)) {
      throw new Error(`store refused ${e.key}`)
    }

    kept.set(e.key, e.value)

    return { value: undefined }
  })

  return { broken, clock }
}

test('a session start that fails is said in the band, and the hooks beneath still run', async ($, on) => {
  const { broken } = brokenWorld(on, ['style'])

  broken.on = true

  const started = await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // The engine's own start ran in the failed hook's place.
  expect(started).toEqual({ cwd: '/' })
  await $.session.measure(odd({}))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  const drawn = await texts(ui)

  expect(drawn.filter(text => text.startsWith('token-usage:'))).toEqual(['token-usage: session.start failed: no implementation for store.get'])
  expect(drawn).toContain('beneath')
})

test('a measurement that fails is said in the band, and the line goes after ten minutes', async ($, on) => {
  const { broken, clock } = brokenWorld(on, ['ledger'])

  await $.session.measure(odd({ cost: { usd: 1 } }))
  broken.on = true
  // A climb in the cost is paid into the ledger, which the store refuses.
  await $.session.measure(odd({ cost: { usd: 2 } }))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await texts(ui)).some(text => text.startsWith('token-usage: session.measure failed:'))).toBe(true)
  await ui.unmount()

  await clock.advance(11 * 60_000)
  broken.on = false
  await $.session.measure(odd({ cost: { usd: 2 } }))

  const later = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await texts(later)).some(text => text.startsWith('token-usage: session.measure failed:'))).toBe(false)
})

test('a /tokens word that fails says so in place of nothing', async ($, on) => {
  const { broken } = brokenWorld(on, ['style'])

  broken.on = true

  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'bars' })

  // A store that refuses is, to the mod, a store with nothing beneath it.
  expect(JSON.stringify(said)).toContain('token-usage could not do that: no implementation for store.set')
})

test('/tokens list says what it could not read', async ($, on) => {
  world(on)
  await $.session.measure(odd({ rateLimits: 'none' }))

  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })

  expect(JSON.stringify(said)).toContain("can't read rateLimits")
})
