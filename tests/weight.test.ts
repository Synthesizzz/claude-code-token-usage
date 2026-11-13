import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { beneathBand, TYPED } from './kit'

// The band says the context by its weight: its size, coloured from 200k and
// 400k, and on the desktop what each step reads again at the model's price.

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const band = (bodyColumns: number) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns, ...SITE },
  }) as const
const MODEL = 'claude-opus-5-5'
const usage = { model: MODEL, input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const sized = (tokens: number, window = 1_000_000) => ({
  context: { window, tokens, percent: (tokens / window) * 100 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
const world = (on: On) => {
  mock.clock(on, { now: new Date(2026, 10, 10, 12, 0).getTime() })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  beneathBand(on)
  on('turn.step', async function* (_, e) {
    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
}
// One step of a main turn, so the band knows the model.
const stepOnce = async (run: () => AsyncGenerator<unknown, unknown>) => {
  const stream = run()
  let next = await stream.next()

  while (next.done !== true) {
    next = await stream.next()
  }
}
const STEP = '· 18.7k/step'

test('a terminal says the context by its size, in the width the share had, coloured by weight', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await stepOnce(() => $.turn.step({ turnId: 't1', index: 0, model: MODEL, messageCount: 3 } as never))
  await $.session.measure(sized(374_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(120) })
  const drawn = await ui.findAll({ type: 'Text' })

  expect(drawn.some(({ text }) => text === '374k')).toBe(true)
  expect(drawn.some(({ text }) => text.includes('37%'))).toBe(false)
  // A terminal has no room for the price per step.
  expect(drawn.some(({ text }) => text.includes('/step'))).toBe(false)
  // 374k is past 200k: the bar of it is yellow.
  expect(drawn.some(({ props }) => props.color === 'warning')).toBe(true)
})

test('the desktop adds what a step reads once the model is known, and keeps the share in the ring and its hint', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // The crab stands where the ring is: away, the ring is drawn.
  await $.command.run({ ...TYPED, command: 'tokens', args: 'hide crab' })
  await $.session.measure(sized(374_000))

  const before = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(200) })

  expect(await before.find({ type: 'Text', text: '374k' })).toBeDefined()
  // No model seen yet: no price per step.
  expect((await before.findAll({ type: 'Text' })).some(({ text }) => text.includes('/step'))).toBe(false)

  await stepOnce(() => $.turn.step({ turnId: 't1', index: 0, model: MODEL, messageCount: 3 } as never))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(200) })
  const ring = (await ui.findAll({ type: 'Svg' }))[0]

  expect(await ui.find({ type: 'Text', text: '374k' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: STEP })).toBeDefined()
  expect(ring?.props.alt).toBe('context 374k, 37% of the 1.0M window')
  // Yellow, as 374k is past 200k: the classic warning colour.
  expect(String(ring?.props.source)).toContain('#b07f00')
  // The hint under the pointer says the share and what a step costs.
  expect(await ui.find({ type: 'Text', text: 'Context 374k of 1.0M (37%)' })).toBeDefined()
})

test('a narrowing desktop band gives up the price per step before the context word', { timeoutMs: 20_000 }, async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await stepOnce(() => $.turn.step({ turnId: 't1', index: 0, model: MODEL, messageCount: 3 } as never))
  await $.session.measure(sized(374_000))

  const wide = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(200) })

  expect(await wide.find({ type: 'Text', text: STEP })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: 'context' })).toBeDefined()

  let isStepGone = false

  for (let columns = 160; columns >= 16; columns -= 8) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(columns) })
    const hasStep = (await ui.find({ type: 'Text', text: STEP })) !== undefined
    const hasWord = (await ui.find({ type: 'Text', text: 'context' })) !== undefined

    // The step goes first: a word without it is fine, a step without the word is not.
    expect(hasStep && !hasWord).toBe(false)
    isStepGone ||= !hasStep
  }

  expect(isStepGone).toBe(true)
})

// Under 400k the one move is Compact only where it pays back within 3 turns:
// at 250k, with no turns of its own and no model known, it takes 6.
test('a context past 400k on a 1M window offers Compact; well under it, none', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(sized(250_000))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(160) })

    expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeUndefined()
  }

  await $.session.measure(sized(410_000))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...band(160) })

    expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeDefined()
  }
})

test('with the weight off the band still says the size, coloured by the share', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'weight off' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'hide crab' })
  await $.session.measure(sized(450_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(200) })
  const ring = (await ui.findAll({ type: 'Svg' }))[0]

  expect(await ui.find({ type: 'Text', text: '450k' })).toBeDefined()
  // 45% of the window: green, as before.
  expect(String(ring?.props.source)).toContain('#3a9a53')
  expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeUndefined()
})
