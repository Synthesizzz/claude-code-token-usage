import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { beneathBand, TYPED, openCard } from './kit'

// The band's one next move in the session: the steps it counts, Park, and
// what /tokens next says.

const PLUGIN = 'token-usage'
const MINUTE = 60_000
const MODEL = 'claude-opus-5-5'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const band = (isWorking = false, bodyColumns = 160) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 10, bodyColumns, ...SITE },
  }) as const
const usage = { model: MODEL, input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const sized = (tokens: number) => ({
  context: { window: 1_000_000, tokens, percent: tokens / 10_000 },
  rateLimits: [],
  changed: ['context' as const],
})
const done = (turnId: string) =>
  ({ answer: '', durationMs: 1, isAborted: false, reason: 'answer', turnId, usage }) as const
const world = (on: On, at = new Date(2026, 10, 10, 12, 0).getTime()) => {
  const clock = mock.clock(on, { now: at })
  const submitted: string[] = []
  const toasts: string[] = []
  let compactions = 0

  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }) as never)
  on('prompt.submit', (_, e) => (submitted.push(e.text), { text: e.text }) as never)
  on('session.compact', () => {
    compactions += 1

    return { skip: 'counted' }
  })
  beneathBand(on)
  on('turn.step', async function* (_, e) {
    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })

  return { clock, submitted, toasts, compactions: () => compactions }
}
const drain = async (stream: AsyncGenerator<unknown, unknown>) => {
  let next = await stream.next()

  while (next.done !== true) {
    next = await stream.next()
  }
}

test('the main thread steps of each turn are counted, a subagent step not, and /tokens next weighs them', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const [turnId, count] of [['t1', 3], ['t2', 7]] as const) {
    for (let index = 0; index < count; index += 1) {
      await drain($.turn.step({ turnId, index, model: MODEL, messageCount: 3 } as never))
    }

    await drain($.turn.step({ turnId: `${turnId}-sub`, index: 0, agentId: 'a1', model: MODEL, messageCount: 3 } as never))
    await $.turn.complete(done(turnId))
  }

  await $.session.measure(sized(410_000))

  const said = (await $.command.run({ ...TYPED, command: 'tokens', args: 'next' })).text ?? ''

  // The median of 3 and 7 steps: 5 a turn.
  expect(said).toContain('(5 steps a turn)')
  expect(said).toContain('Next: Compact.')
  expect(said).toContain('context 410k (41%)')
  expect(said).toContain('per step 20.5k')
  expect(said).toContain('cache:')
  expect(said).toContain('quiet hours: off')
  expect(said.includes(String.fromCharCode(92))).toBe(false)
})

test('/tokens next with a light context says to carry on; a heavy one with no turns yet goes by 3 steps a turn', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(sized(90_000))

  const light = (await $.command.run({ ...TYPED, command: 'tokens', args: 'next' })).text ?? ''

  expect(light).toContain('Next: carry on.')
  expect(light).toContain('compact pays back: not at this size')

  await $.session.measure(sized(410_000))

  const heavy = (await $.command.run({ ...TYPED, command: 'tokens', args: 'next' })).text ?? ''

  expect(heavy).toContain("(3 steps a turn, none of this session's yet)")
})

test('before quiet hours a heavy context parks: the hand-off goes, and the context compacts once its turn ends', async ($, on) => {
  openCard(on)
  const { clock, submitted, compactions } = world(on, new Date(2026, 10, 10, 21, 40).getTime())

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts quiet 22-8' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  await $.session.measure(sized(250_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const button = await ui.find({ type: 'Button', key: 'park' })

  expect(button?.props.label).toBe('Park')
  expect((await ui.find({ type: 'Box', key: 'hint-move' }))?.props.display).toBe('none')
  expect(
    (await ui.findAll({ type: 'Text' })).some(({ text }) => text.startsWith('Quiet hours begin soon. Park sends your hand-off message')),
  ).toBe(true)

  await ui.press({ key: 'park' })
  expect(submitted).toEqual(['Write the handoff now.'])
  expect(compactions()).toBe(0)

  // The hand-off's own turn runs and ends: then the context compacts.
  await drain($.turn.step({ turnId: 'h1', index: 0, model: MODEL, messageCount: 3 } as never))
  await $.turn.complete(done('h1'))
  await clock.advance(MINUTE)

  expect(compactions()).toBe(1)
})

test('Park with no hand-off message is a Compact, and the band says Compact', async ($, on) => {
  openCard(on)
  world(on, new Date(2026, 10, 10, 21, 40).getTime())
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts quiet 22-8' })
  await $.session.measure(sized(250_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })

  expect(await ui.find({ type: 'Button', key: 'park' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('Compact')
})

// A turn running, the band holds Park back: the hand-off would queue behind
// the turn. Under the full size it offers nothing until the turn ends.
test('while a turn runs the band offers no Park', async ($, on) => {
  world(on, new Date(2026, 10, 10, 21, 40).getTime())
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts quiet 22-8' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  await $.session.measure(sized(250_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(true) })

  expect(await ui.find({ type: 'Button', key: 'park' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'compactAfter' })).toBeUndefined()
})

test('a full context hands off where a message is set, on a narrow terminal too', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  await $.session.measure(sized(410_000))

  for (const columns of [160, 80, 60]) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(false, columns) })

    expect((await ui.find({ type: 'Button', key: 'fresh' }))?.props.label).toBe('Hand off')
    await ui.unmount()
  }
})

// Where the handoff mod is there, its card hands off from 250k (Decisions
// 2026-11-14): the band offers no move there, and never Hand off or Park.
// A press runs nothing of the handoff mod's.
const withHandoff = (on: On) => {
  const ran: string[] = []

  on('command.list', () => ({ value: [{ name: 'handoff', description: 'Write a handoff', source: 'plugin', plugin: 'handoff' }] }) as never)
  on('command.run', { command: 'handoff' }, (_, e) => {
    ran.push(`/${e.command} ${e.args}`.trim())

    return { text: 'building' }
  })

  return ran
}
const MOVES = ['fresh', 'park', 'compact', 'compactAfter']

test('with /handoff there, a full context offers no move, a hand-off message set or not', async ($, on) => {
  const { submitted } = world(on)
  const ran = withHandoff(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  await $.session.measure(sized(410_000))

  for (const isWorking of [false, true]) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(isWorking) })

    for (const key of MOVES) {
      expect(await ui.find({ type: 'Button', key })).toBeUndefined()
    }

    expect(await ui.find({ type: 'Box', key: 'hint-move' })).toBeUndefined()
    await ui.unmount()
  }

  const said = (await $.command.run({ ...TYPED, command: 'tokens', args: 'next' })).text ?? ''

  expect(said).toContain('Next: carry on.')
  expect(ran).toEqual([])
  expect(submitted).toEqual([])
})

test('with /handoff there, before quiet hours at 250k the band offers no Park and sends nothing', async ($, on) => {
  const { submitted, compactions } = world(on, new Date(2026, 10, 10, 21, 40).getTime())
  const ran = withHandoff(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts quiet 22-8' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  await $.session.measure(sized(250_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })

  for (const key of MOVES) {
    expect(await ui.find({ type: 'Button', key })).toBeUndefined()
  }

  expect(ran).toEqual([])
  expect(submitted).toEqual([])
  expect(compactions()).toBe(0)
})

test('with /handoff there, under 250k the band offers Compact on every path, never Hand off or Park', async ($, on) => {
  const { compactions } = world(on, new Date(2026, 10, 10, 21, 40).getTime())
  const ran = withHandoff(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts quiet 22-8' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'handoff Write the handoff now.' })
  // Heavy before quiet hours, and full by its share on a small window.
  await $.session.measure({ context: { window: 260_000, tokens: 240_000, percent: 92 }, rateLimits: [], changed: ['context' as const] })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })

  expect(await ui.find({ type: 'Button', key: 'fresh' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'park' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('Compact')
  await ui.press({ key: 'compact' })
  expect(compactions()).toBe(1)
  expect(ran).toEqual([])
})

