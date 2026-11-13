import { expect, mock, test } from 'claude-code/testing'
import { WEIGHT, barCellsFor, contextText, contextTone, eighths, stepText } from '../hooks/usage'
import { beneathBand } from './kit'

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, ...SITE },
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
  beneathBand(on)
  await $.session.measure({
    ...MEASURE,
    rateLimits: [...MEASURE.rateLimits],
    changed: [...MEASURE.changed],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '84.0k' })).toBeDefined()
    // `5H` in a terminal's row, `5-hour` beside the desktop's ring.
    expect(await ui.find({ type: 'Text', text: /5-?h/i })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '31%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeDefined()
  }
})

test('band keeps what the hooks beneath it draw', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  beneathBand(on, 'beneath')
  await $.session.measure({
    ...MEASURE,
    rateLimits: [...MEASURE.rateLimits],
    changed: [...MEASURE.changed],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '84.0k' })).toBeDefined()
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

// The context's colour is its weight: what each step reads again, by size,
// not its share of a window that may be a million tokens wide.
test('the context is coloured by its size: yellow from 200k, red from 400k', () => {
  expect(contextTone(150_000, 15, WEIGHT)).toBe('success')
  expect(contextTone(200_000, 20, WEIGHT)).toBe('warning')
  expect(contextTone(374_000, 37, WEIGHT)).toBe('warning')
  expect(contextTone(400_000, 40, WEIGHT)).toBe('error')
  // A size not known yet (a session's start, just after a compaction): its share.
  expect(contextTone(null, 30, WEIGHT)).toBe('success')
  expect(contextTone(null, 70, WEIGHT)).toBe('warning')
  expect(contextTone(null, 90, WEIGHT)).toBe('error')
  expect(contextTone(null, null, WEIGHT)).toBe('success')
  // A window smaller than the sizes: its share still turns it.
  expect(contextTone(170_000, 85, WEIGHT)).toBe('error')
  expect(contextTone(130_000, 65, WEIGHT)).toBe('warning')
  // Weight off: the share alone, at 60% and 85%, as before.
  expect(contextTone(450_000, 45, null)).toBe('success')
  expect(contextTone(610_000, 61, null)).toBe('warning')
  expect(contextTone(850_000, 85, null)).toBe('error')
  // Sizes of the person's own.
  expect(contextTone(260_000, 26, { warn: 250_000, full: 500_000 })).toBe('warning')
  expect(contextTone(240_000, 24, { warn: 250_000, full: 500_000 })).toBe('success')
})

test('the context is said by its size: the desktop adds what a step reads, a terminal keeps one width', () => {
  expect(contextText(374_000, 37)).toBe('374k')
  expect(contextText(84_000, 42)).toBe('84.0k')
  expect(contextText(1_000_000, 100)).toBe('1.0M')
  // A size not known yet says its share, or nothing.
  expect(contextText(null, 37)).toBe('37%')
  expect(contextText(null, null)).toBe('--')
  // A step re-reads the context at the model's cache price: Opus 5.5 a twentieth.
  expect(stepText(374_000, 'claude-opus-5-5')).toBe('18.7k/step')
  expect(stepText(374_000, 'claude-haiku-5-5')).toBe('37.4k/step')
  // No model seen yet, or no size: no price per step.
  expect(stepText(374_000, null)).toBeNull()
  expect(stepText(null, 'claude-opus-5-5')).toBeNull()
})
