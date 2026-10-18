import { expect, mock, test } from 'claude-code/testing'
import { barCellsFor, eighths } from '../hooks/usage'

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, ...SITE },
} as const
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
const MEASURE = {
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 31 },
    { kind: 'seven_day', percentUsed: 12 },
  ],
  cost: { usd: 1.84 },
  changed: ['context', 'rateLimits', 'cost'],
} as const

test('band draws the measured figures on every surface', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })
  await $.session.measure({
    ...MEASURE,
    rateLimits: [...MEASURE.rateLimits],
    changed: [...MEASURE.changed],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
    // `5H` in a terminal's row, `5-hour` beside the desktop's ring.
    expect(await ui.find({ type: 'Text', text: /5-?h/i })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '31%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeDefined()
  }
})

test('band keeps what the hooks beneath it draw', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: 'beneath' })
  })
  await $.session.measure({
    ...MEASURE,
    rateLimits: [...MEASURE.rateLimits],
    changed: [...MEASURE.changed],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
  }
})

test('pane lists the last main-thread turn, not a subagent turn', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.measure({
    ...MEASURE,
    rateLimits: [...MEASURE.rateLimits],
    changed: [...MEASURE.changed],
  })
  const turn = {
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
  } as const
  await $.turn.complete({
    ...turn,
    turnId: 't1',
    usage: {
      model: 'm',
      input_tokens: 18204,
      output_tokens: 3112,
      cache_read_input_tokens: 112480,
      cache_creation_input_tokens: 4096,
    },
  })
  await $.turn.complete({
    ...turn,
    turnId: 't2',
    agentId: 'a1',
    usage: {
      model: 'm',
      input_tokens: 7,
      output_tokens: 7,
      cache_read_input_tokens: 7,
      cache_creation_input_tokens: 7,
    },
  })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '18,204' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '112,480' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '84,000 / 200,000' })).toBeDefined()

  // The desktop says the last turn on one line.
  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect(await desktop.find({ type: 'Text', text: /^last turn 137k · in 18,204 · out 3,112 · cache read 112,480 · write 4,096$/ })).toBeDefined()
})

// The terminal's bars: eighths of a cell, the time gone marked, room permitting.

test('a terminal bar fills by eighths, marks the cell of the time gone, and takes only room left over', () => {
  expect(eighths(42, null, 8)).toEqual([{ text: '███▍    ', isNow: false }])
  expect(eighths(31, 40, 8)).toEqual([
    { text: '██▌', isNow: false },
    { text: ' ', isNow: true },
    { text: '    ', isNow: false },
  ])
  expect(eighths(100, 100, 6).map(({ text }) => text).join('')).toBe('██████')
  // Two windows: a bar of 10 asks 11 + 9 + 9 cells.
  expect(barCellsFor(29, 2)).toBe(10)
  expect(barCellsFor(28, 2)).toBe(8)
  expect(barCellsFor(17, 2)).toBe(6)
  expect(barCellsFor(16, 2)).toBe(0)
})
