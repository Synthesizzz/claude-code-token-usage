import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { shareSvg, weekSvg } from '../hooks/chart'
import {
  EMPTY,
  NO_SHARE,
  add,
  budgetNews,
  cacheShare,
  counted,
  dayOf,
  exportCsv,
  modelName,
  pool,
  saneLedger,
  saneShare,
  spark,
  heavyLine,
  heavyThreshold,
  sessionSummary,
  monthLine,
  usd,
  monthNews,
  monthOf,
  monthSpent,
  projectNews,
  spend,
  spentSince,
  tips,
  weekNews,
  weekOf,
  weekSpent,
  today,
  week,
} from '../hooks/cost'
import { widthOf } from '../hooks/fit'
import type { Fitted, Wish } from '../hooks/fit'
import { apply, defaults, sane } from '../hooks/style'
import type { Ledger, Share } from '../types'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
// Noon, local time, so a test never sits on the edge of a day.
const NOW = new Date(2026, 9, 13, 12, 0).getTime()
const DAY = 24 * 60 * 60_000
const TODAY = dayOf(NOW)
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
const reading = (usd: number) => ({
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  cost: { usd },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
const ledgerOf = (usd: number, levels: number[] = []): Ledger => ({
  days: { [TODAY]: usd },
  told: { day: TODAY, levels },
})
// The engine beneath the mod: a clock, a store the test can read, a session
// that starts with no cost yet, toasts kept, an empty band.
// With `files`, a disk under the person's home folder: each file's text and
// when it was last written, by its path with forward slashes.
type Disk = Record<string, { text: string; mtimeMs: number }>
const world = (
  on: On,
  stored: Readonly<Record<string, unknown>> = {},
  toasts: string[] = [],
  files?: Disk,
) => {
  const kept = new Map(Object.entries(stored))
  const session = { usd: undefined as number | undefined, id: 'mine', ran: [] as string[][] }

  mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    kept.delete(e.key)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [],
      ...(session.usd === undefined ? {} : { cost: { usd: session.usd } }),
    },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.env(on, files === undefined ? { OS: 'Windows_NT' } : { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' })

  if (files !== undefined) {
    const slashed = (path: string) => path.replaceAll('\\', '/')

    on('session.id', () => ({ value: session.id }))
    on('fs.write', (_, e) => {
      files[slashed(e.path)] = { text: e.text, mtimeMs: NOW }

      return { value: undefined }
    })
    on('fs.read', (_, e) => {
      const file = files[slashed(e.path)]

      if (file === undefined) {
        throw new Error(`ENOENT: ${e.path}`)
      }

      return { value: file.text }
    })
    on('fs.list', (_, e) => {
      const folder = `${slashed(e.path)}/`
      const names = Object.keys(files).filter(path => path.startsWith(folder))

      if (names.length === 0) {
        throw new Error(`ENOENT: ${e.path}`)
      }

      return {
        value: names.map(path => ({
          name: path.slice(folder.length),
          kind: 'file' as const,
          size: files[path]?.text.length ?? 0,
          mtimeMs: files[path]?.mtimeMs ?? 0,
          isLink: false,
        })),
      }
    })
  }
  on('process.run', (_, e) => {
    session.ran.push([...e.argv])

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return { kept, session }
}
const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const turn = (id: string) =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId: id,
    usage: {
      model: 'm',
      input_tokens: 900,
      output_tokens: 300,
      cache_read_input_tokens: 9100,
      cache_creation_input_tokens: 0,
    },
  }) as const

test('a day is named by the local date', () => {
  expect(dayOf(new Date(2026, 9, 13, 23, 59).getTime())).toBe('2026-10-13')
  expect(dayOf(new Date(2026, 9, 14, 0, 0).getTime())).toBe('2026-10-14')
  expect(dayOf(new Date(2026, 0, 5, 9, 0).getTime())).toBe('2026-01-05')
})

test('what a reading adds is its cost over the one before', () => {
  // No reading before: this is where the person came in, so nothing is added.
  expect(spentSince(null, 5)).toBe(0)
  // A session that had no cost yet began at nothing.
  expect(spentSince({ usd: null }, 0.12)).toBe(0.12)
  expect(spentSince({ usd: 1 }, 1.5)).toBe(0.5)
  // A cost that fell was started over: all of it is new.
  expect(spentSince({ usd: 3 }, 0.4)).toBe(0.4)
  expect(spentSince({ usd: 1 }, null)).toBe(0)
})

test('the ledger adds to the day, and lets go of days a month old', () => {
  const once = add(EMPTY, NOW, 0.1)
  const twice = add(once, NOW, 0.2)
  const later = add(twice, NOW + 32 * DAY, 1)

  expect(twice.days).toEqual({ [TODAY]: 0.3 })
  expect(today(twice, NOW)).toBe(0.3)
  expect(today(twice, NOW + DAY)).toBe(0)
  expect(later.days).toEqual({ [dayOf(NOW + 32 * DAY)]: 1 })
})

test('a ledger kept in an unknown shape is an empty one', () => {
  expect(saneLedger(undefined)).toEqual(EMPTY)
  expect(saneLedger({ days: { [TODAY]: 'much', '2026-10-12': 2 }, told: 7 })).toEqual({
    days: { '2026-10-12': 2 },
    told: { day: '', levels: [] },
  })
  expect(saneLedger(ledgerOf(4, [80]))).toEqual(ledgerOf(4, [80]))
})

// Each session keeps its own counts, and the day is their sum: no session
// ever writes over another's.

test("a session's own share adds what it spent and counted to the day", () => {
  const spent = spend(spend(NO_SHARE, NOW, 0.1), NOW, 0.2)
  const both = counted(counted(spent, NOW, 'shop', 1200, 'claude-opus-5-5'), NOW, 'notes', 300, 'claude-haiku-5-5')

  expect(both).toEqual({
    days: { [TODAY]: 0.3 },
    tokens: { [TODAY]: 1500 },
    projects: { [TODAY]: { shop: 1200, notes: 300 } },
    models: { [TODAY]: { 'claude-opus-5-5': 1200, 'claude-haiku-5-5': 300 } },
    spent: {},
  })
  expect(spend(both, NOW + 32 * DAY, 1).days).toEqual({ [dayOf(NOW + 32 * DAY)]: 1 })
})

test("the day is the sum of every session's share, days a month old let go", () => {
  const mine: Share = {
    days: { [TODAY]: 1.25 },
    tokens: { [TODAY]: 1000 },
    projects: { [TODAY]: { shop: 1000 } },
    models: { [TODAY]: { opus: 1000 } },
    spent: {},
  }
  const theirs: Share = {
    days: { [TODAY]: 2.5, [dayOf(NOW - DAY)]: 4, [dayOf(NOW - 40 * DAY)]: 9 },
    tokens: { [TODAY]: 500 },
    projects: { [TODAY]: { shop: 200, notes: 300 } },
    models: { [TODAY]: { opus: 200, haiku: 300 }, [dayOf(NOW - 40 * DAY)]: { opus: 9 } },
    spent: {},
  }

  expect(pool([mine, theirs], NOW)).toEqual({
    days: { [TODAY]: 3.75, [dayOf(NOW - DAY)]: 4 },
    tokens: { [TODAY]: 1500 },
    projects: { [TODAY]: { shop: 1200, notes: 300 } },
    models: { [TODAY]: { opus: 1200, haiku: 300 } },
    spent: {},
  })
  expect(pool([], NOW)).toEqual(NO_SHARE)
})

test('a share kept in an unknown shape keeps only its sums', () => {
  expect(saneShare(undefined)).toEqual(NO_SHARE)
  expect(saneShare('{')).toEqual(NO_SHARE)
  expect(saneShare({ days: { [TODAY]: 'much', '2026-10-12': 2 }, tokens: [3], projects: { [TODAY]: { shop: -1, notes: 4 } } })).toEqual({
    days: { '2026-10-12': 2 },
    tokens: {},
    projects: { [TODAY]: { notes: 4 } },
    models: {},
    spent: {},
  })
})

test('the export is a row a day, oldest first, with its dollars and tokens', () => {
  const share: Share = {
    days: { [TODAY]: 1.5, [dayOf(NOW - DAY)]: 0.25 },
    tokens: { [TODAY]: 12000, [dayOf(NOW - 2 * DAY)]: 300 },
    projects: {},
    models: {},
    spent: {},
  }

  expect(exportCsv(share)).toBe(
    [
      'day,usd,tokens',
      `${dayOf(NOW - 2 * DAY)},0.0000,300`,
      `${dayOf(NOW - DAY)},0.2500,0`,
      `${TODAY},1.5000,12000`,
      '',
    ].join('\n'),
  )
  expect(exportCsv(NO_SHARE)).toBe('day,usd,tokens\n')
})

// A project's own budget: dollars a day, said once a day at 80% and at all.

test('what a reading cost goes on its project too, and the projects are summed', () => {
  const spent = spend(spend(NO_SHARE, NOW, 0.5, 'shop'), NOW, 0.25, 'notes')

  expect(spent.spent).toEqual({ [TODAY]: { shop: 0.5, notes: 0.25 } })
  expect(spend(NO_SHARE, NOW, 0.5).spent).toEqual({})
  expect(pool([spent, spend(NO_SHARE, NOW, 1, 'shop')], NOW).spent).toEqual({ [TODAY]: { shop: 1.5, notes: 0.25 } })
})

test("a project's budget is news at 80% and when spent, once a day, each project apart", () => {
  const none = { day: '', levels: {} }
  const spent = { [TODAY]: { shop: 4.1, notes: 1 } }
  const near = projectNews(spent, NOW, { shop: 5, notes: 10 }, none)

  expect(near.notices.map(({ kind, title, line }) => ({ kind, title, line }))).toEqual([
    { kind: 'budget', title: 'shop today at 82% of $5.00', line: 'shop today at 82% of $5.00, $0.90 left' },
  ])
  expect(near.told).toEqual({ day: TODAY, levels: { shop: [80] } })
  expect(projectNews(spent, NOW, { shop: 5 }, near.told).notices).toEqual([])

  const over = projectNews({ [TODAY]: { shop: 5.2 } }, NOW, { shop: 5 }, near.told)

  expect(over.notices.map(({ kind, line }) => ({ kind, line }))).toEqual([
    { kind: 'spent', line: "shop's budget of $5.00 is spent: $5.20 so far" },
  ])
  // A new day is told afresh; a project with no budget says nothing.
  expect(projectNews({ [dayOf(NOW + DAY)]: { shop: 4.5 } }, NOW + DAY, { shop: 5 }, over.told).notices).toHaveLength(1)
  expect(projectNews(spent, NOW, {}, none)).toEqual({ notices: [], told: none })
})

// The month: its dollars so far, and a budget said once a month.

test('the month so far sums its own days only, and says a day on average', () => {
  const days = { [TODAY]: 3, [dayOf(NOW - DAY)]: 2, '2026-09-30': 50 }

  expect(monthOf(NOW)).toBe(TODAY.slice(0, 7))
  expect(monthSpent(days, NOW)).toBe(5)
  expect(monthLine(days, NOW).line).toBe(`${new Date(NOW).getDate()} days · ${usd(5 / new Date(NOW).getDate())} a day`)
})

test("a month's budget is news at 80% and when spent, once a month", () => {
  const none = { month: '', levels: [] }
  const near = monthNews({ [TODAY]: 170 }, NOW, 200, none)

  expect(near.notices.map(({ kind, line }) => ({ kind, line }))).toEqual([
    { kind: 'budget', line: "This month's cost at 85% of $200.00, $30.00 left" },
  ])
  expect(monthNews({ [TODAY]: 175 }, NOW, 200, near.told).notices).toEqual([])
  expect(monthNews({ [TODAY]: 210 }, NOW, 200, near.told).notices.map(({ line }) => line)).toEqual([
    "This month's budget of $200.00 is spent: $210.00 so far",
  ])
  expect(monthNews({ [TODAY]: 210 }, NOW, null, none)).toEqual({ notices: [], told: none })
})

test('a model is named short: no claude- before it, no date after it', () => {
  expect(modelName('claude-opus-5-5')).toBe('opus-5-5')
  expect(modelName('claude-sonnet-4-5-20250929')).toBe('sonnet-4-5')
  expect(modelName('gpt-x')).toBe('gpt-x')
  expect(modelName('')).toBe('(unknown model)')
})

test('the week is seven days, oldest first, today last, a day of nothing at zero', () => {
  const kept: Ledger = {
    days: { [TODAY]: 6.2, [dayOf(NOW - 2 * DAY)]: 12.6, [dayOf(NOW - 9 * DAY)]: 99 },
    told: { day: '', levels: [] },
  }
  const days = week(kept.days, NOW)

  expect(days.map(({ value }) => value)).toEqual([0, 0, 0, 0, 12.6, 0, 6.2])
  // 13 October 2026 is a Tuesday.
  expect(days.map(({ name }) => name)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'])
  expect(spark(days)).toBe('▁▁▁▁█▁▄')
})

test('a budget is news at 80% and at 100%, each once a day', () => {
  expect(budgetNews(ledgerOf(7.9), NOW, 10).notices).toEqual([])

  const near = budgetNews(ledgerOf(8.1), NOW, 10)

  expect(near.notices).toEqual([
    {
      kind: 'budget',
      title: "Today's cost at 81% of $10.00",
      text: '$1.90 left today.',
      line: "Today's cost at 81% of $10.00, $1.90 left",
      bar: { name: "Today's budget", value: 0.81, label: '81%', status: '$1.90 left' },
    },
  ])
  expect(near.ledger.told).toEqual({ day: TODAY, levels: [80] })
  expect(budgetNews({ ...near.ledger, days: { [TODAY]: 9 } }, NOW, 10).notices).toEqual([])

  const over = budgetNews({ ...near.ledger, days: { [TODAY]: 10.42 } }, NOW, 10)

  expect(over.notices).toEqual([
    {
      kind: 'spent',
      title: "Today's budget of $10.00 is spent",
      text: 'Today so far: $10.42.',
      line: "Today's budget of $10.00 is spent: $10.42 so far",
      bar: { name: "Today's budget", value: 1, label: '104%', status: '$10.42 so far' },
    },
  ])
  expect(over.ledger.told.levels).toEqual([80, 100])
})

test('a jump over both lines names the budget spent alone, and a new day starts over', () => {
  const jumped = budgetNews(ledgerOf(12), NOW, 10)

  expect(jumped.notices.map(({ kind }) => kind)).toEqual(['spent'])
  expect(jumped.ledger.told.levels).toEqual([80, 100])

  const tomorrow = budgetNews(add(jumped.ledger, NOW + DAY, 8.5), NOW + DAY, 10)

  expect(tomorrow.notices.map(({ kind }) => kind)).toEqual(['budget'])
  expect(tomorrow.ledger.told).toEqual({ day: dayOf(NOW + DAY), levels: [80] })
})

test('with no budget nothing is news and nothing is noted', () => {
  const kept = ledgerOf(500)

  expect(budgetNews(kept, NOW, null)).toEqual({ notices: [], ledger: kept })
})

test('the cache share is what of a turn\'s input was read from the cache', () => {
  expect(cacheShare({ input: 900, output: 300, cacheRead: 9100, cacheWrite: 0 })).toBe(91)
  expect(cacheShare({ input: 500, output: 1, cacheRead: 250, cacheWrite: 250 })).toBe(25)
  expect(cacheShare({ input: 0, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeNull()
  expect(cacheShare(null)).toBeNull()
})

test('a budget is set in dollars a day, or switched off', () => {
  const base = defaults({})
  const set = apply(base, 'budget 10')

  expect(base.budget).toBeNull()
  expect(set).toMatchObject({ style: { budget: 10 }, text: 'budget: $10.00 a day.' })
  expect(apply({ ...base, budget: 10 }, 'budget off')).toMatchObject({
    style: { budget: null },
    text: 'budget: off.',
  })
  expect('style' in apply(base, 'budget -3')).toBe(false)
  expect('style' in apply(base, 'budget lots')).toBe(false)
  expect(apply({ ...base, budget: 2.5 }, 'list')).toMatchObject({ text: expect.stringContaining('budget $2.50 a day') })
  // A look leaves the budget as it was.
  expect(apply({ ...base, budget: 10 }, 'timeline')).toMatchObject({ style: { budget: 10 } })
})

test('a kept style holds its budget, and one kept before budgets has none', () => {
  const base = defaults({})
  const { budget: _, ...older } = base

  expect(sane({ ...base, budget: 7 })?.budget).toBe(7)
  expect(sane(older)?.budget).toBeNull()
  expect(sane({ ...base, budget: -1 })?.budget).toBeNull()
})

test('the week is drawn as seven bars with their days, today in the crab\'s colour', () => {
  const days = week({ [TODAY]: 6_200_000, [dayOf(NOW - 2 * DAY)]: 12_600_000 }, NOW)
  const drawn = weekSvg(days)

  expect(drawn.source.split('<rect')).toHaveLength(8)
  expect(drawn.source.split('<text')).toHaveLength(8)
  expect(drawn.source.split('#d97757')).toHaveLength(2)
  expect(drawn.source).toContain('>Tue</text>')
  expect(drawn.alt).toBe('Tokens per day, last 7 days: highest 12.6M, today 6.2M')
  // A week of nothing still draws: no bar is sized by a division by zero.
  expect(weekSvg(week({}, NOW)).source).not.toContain('NaN')
})
test('the cache share is drawn as a bar filled that far', () => {
  const drawn = shareSvg(91)

  expect(drawn.alt).toBe('91% of input read from cache')
  expect(drawn.source).toContain('width="182"')
})

test('a ring before the cost widens the row by the ring and its gap', () => {
  const wish: Wish = {
    layout: 'rings',
    context: { used: '42%', word: 'context' },
    windows: [],
    usedWord: 'used',
    leftWord: 'left',
    eta: null,
    cost: '$6.20 today',
    action: null,
  }
  const full: Fitted = {
    layout: 'rings',
    hasContextWord: true,
    hasWords: true,
    hasClock: true,
    windows: 0,
    hasEta: true,
    hasCost: true,
  }

  expect((widthOf({ ...wish, costFigure: 22 }, full) - widthOf(wish, full)).toFixed(3)).toBe(
    (22 / 9.3 + 1).toFixed(3),
  )
})

test('the band shows what today has cost, counted from the first reading on', async ($, on) => {
  const { kept } = world(on)

  // The first reading is where the person came in: it adds nothing.
  await $.session.measure(reading(1))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeDefined()

  await $.session.measure(reading(1.5))
  expect(await ui.find({ type: 'Text', text: '$0.50 API today' })).toBeDefined()
  expect((kept.get('ledger') as Ledger | undefined)?.days ?? {}).toEqual({})

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await desktop.find({ type: 'Text', text: '$0.50 API today' })).toBeDefined()
})

test('a new session adds to what other sessions spent today, and counts its cost whole', async ($, on) => {
  const { kept } = world(on, { ledger: ledgerOf(4) })

  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(0.25))
  expect(await ui.find({ type: 'Text', text: '$4.25 API today' })).toBeDefined()
  expect(kept.get('ledger')).toMatchObject({ days: { [TODAY]: 4 } })
})

// Sessions that spend at once: each writes a file of its own, and the day is
// read from all of them, so none is ever written over.
const SESSIONS = 'C:/Users/me/.claude/token-usage/sessions'
const shareOf = (usd: number) => JSON.stringify({ days: { [TODAY]: usd }, tokens: {}, projects: {} })

test("each session spends into a file of its own, and the day sums every session's", async ($, on) => {
  const files: Disk = { [`${SESSIONS}/other.json`]: { text: shareOf(2), mtimeMs: NOW } }
  const { kept } = world(on, {}, [], files)

  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  // A session that had no cost yet counts its first reading whole.
  await $.session.measure(reading(1))
  await $.session.measure(reading(1.5))
  expect(await ui.find({ type: 'Text', text: '$3.50 API today' })).toBeDefined()
  expect(JSON.parse(files[`${SESSIONS}/mine.json`]?.text ?? '')).toEqual({
    days: { [TODAY]: 1.5 },
    tokens: {},
    projects: {},
    models: {},
    spent: { [TODAY]: { '(no folder)': 1.5 } },
  })
  expect(files[`${SESSIONS}/other.json`]?.text).toBe(shareOf(2))
  expect((kept.get('ledger') as Ledger | undefined)?.days ?? {}).toEqual({})
})

test('what another session spends meanwhile is counted, never written over', async ($, on) => {
  const files: Disk = { [`${SESSIONS}/other.json`]: { text: shareOf(2), mtimeMs: NOW } }

  world(on, {}, [], files)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(1))
  // The other session spends in the same instant as this one.
  files[`${SESSIONS}/other.json`] = { text: shareOf(3), mtimeMs: NOW + 1 }
  await $.session.measure(reading(1.5))
  expect(await ui.find({ type: 'Text', text: '$4.50 API today' })).toBeDefined()
  expect(files[`${SESSIONS}/other.json`]?.text).toBe(shareOf(3))
})

test('what was kept before sessions had files of their own still counts', async ($, on) => {
  const files: Disk = { [`${SESSIONS}/other.json`]: { text: shareOf(2), mtimeMs: NOW } }
  const { kept } = world(on, { ledger: ledgerOf(4) }, [], files)

  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(0.25))
  expect(await ui.find({ type: 'Text', text: '$6.25 API today' })).toBeDefined()
  expect(kept.get('ledger')).toMatchObject({ days: { [TODAY]: 4 } })
})

test('a file that cannot be read, or one untouched for a month, is passed over', async ($, on) => {
  const files: Disk = {
    [`${SESSIONS}/torn.json`]: { text: '{"days":', mtimeMs: NOW },
    [`${SESSIONS}/old.json`]: { text: shareOf(9), mtimeMs: NOW - 40 * DAY },
    [`${SESSIONS}/notes.txt`]: { text: shareOf(9), mtimeMs: NOW },
  }

  world(on, {}, [], files)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(1))
  await $.session.measure(reading(1.75))
  expect(await ui.find({ type: 'Text', text: '$1.75 API today' })).toBeDefined()
})

test('after /clear the session counts under its new id, and the old file is counted once', async ($, on) => {
  const files: Disk = {}
  const { session } = world(on, {}, [], files)

  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(1))
  // /clear: the process goes on under a new id, with no session.start.
  session.id = 'next'
  await $.session.measure(reading(1.25))
  expect(JSON.parse(files[`${SESSIONS}/mine.json`]?.text ?? '').days).toEqual({ [TODAY]: 1 })
  expect(JSON.parse(files[`${SESSIONS}/next.json`]?.text ?? '').days).toEqual({ [TODAY]: 0.25 })
  expect(await ui.find({ type: 'Text', text: '$1.25 API today' })).toBeDefined()
})

// The session files of the past stay on the disk: /tokens tidy says how
// many are no longer read, and with `now` deletes them.

test('tidy says what is no longer read, and deletes it only when asked', async ($, on) => {
  const old = NOW - 40 * DAY
  const files: Disk = {
    [`${SESSIONS}/mine.json`]: { text: shareOf(1), mtimeMs: old },
    [`${SESSIONS}/gone-1.json`]: { text: shareOf(1), mtimeMs: old },
    [`${SESSIONS}/gone-2.json`]: { text: shareOf(1), mtimeMs: old },
    [`${SESSIONS}/recent.json`]: { text: shareOf(1), mtimeMs: NOW - 2 * DAY },
    [`${SESSIONS}/notes.txt`]: { text: 'x', mtimeMs: old },
    [`${SESSIONS}/it's.json`]: { text: shareOf(1), mtimeMs: old },
  }
  const { session } = world(on, {}, [], files)

  await $.session.start(START)

  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'tidy' })

  expect(JSON.stringify(said)).toContain('2 session files untouched for over 31 days')
  expect(JSON.stringify(said)).toContain('/tokens tidy now')
  expect(session.ran).toEqual([])

  const done = await $.command.run({ ...TYPED, command: 'tokens', args: 'tidy now' })

  expect(session.ran).toHaveLength(1)
  expect(session.ran[0]?.slice(0, 3)).toEqual(['powershell', '-NoProfile', '-Command'])
  // Only the two: never this session's own, a recent one, another kind of file
  // or a name that is not an id.
  expect(session.ran[0]?.[3]).toBe(
    "Remove-Item -LiteralPath 'C:\\Users\\me/.claude/token-usage/sessions/gone-1.json','C:\\Users\\me/.claude/token-usage/sessions/gone-2.json'",
  )
  expect(JSON.stringify(done)).toContain('Deleted 2 old session files')
})

test('tidy with nothing old says so', async ($, on) => {
  const { session } = world(on, {}, [], { [`${SESSIONS}/recent.json`]: { text: shareOf(1), mtimeMs: NOW } })

  await $.session.start(START)
  expect(JSON.stringify(await $.command.run({ ...TYPED, command: 'tokens', args: 'tidy now' }))).toContain('Nothing to tidy')
  expect(session.ran).toEqual([])
})

test('a session started again goes on from its own file', async ($, on) => {
  const files: Disk = { [`${SESSIONS}/mine.json`]: { text: shareOf(1.2), mtimeMs: NOW } }
  const { session } = world(on, {}, [], files)

  // Started again with the cost it had: its first reading adds nothing.
  session.usd = 5
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  await $.session.measure(reading(5))
  await $.session.measure(reading(5.3))
  expect(await ui.find({ type: 'Text', text: '$1.50 API today' })).toBeDefined()
  expect(JSON.parse(files[`${SESSIONS}/mine.json`]?.text ?? '').days).toEqual({ [TODAY]: 1.5 })
})

// Tips: what the counts already say, two lines at most.
const quietWeek = [1, 1, 1, 1, 1, 1, 1].map(value => ({ name: 'd', value: value * 100_000 }))

test('a tip says when little of the last turn came from the cache', () => {
  const turn = { input: 30_000, output: 1000, cacheRead: 10_000, cacheWrite: 0 }

  expect(tips({ turn, percent: 20, days: quietWeek })).toEqual([
    "Only 25% of the last turn's input came from the cache: a long pause, or a change early in the conversation, makes a turn pay for its whole input again.",
  ])
  // A small turn says nothing; nor does one read mostly from the cache.
  expect(tips({ turn: { ...turn, input: 2000, cacheRead: 0 }, percent: 20, days: quietWeek })).toEqual([])
  expect(tips({ turn: { ...turn, cacheRead: 300_000 }, percent: 20, days: quietWeek })).toEqual([])
})

test('a tip says when the context is full, and when today is far above the week', () => {
  const busy = [...quietWeek.slice(0, 6), { name: 'd', value: 450_000 }]

  expect(tips({ turn: null, percent: 72, days: quietWeek })).toEqual([
    'Context at 72%: /compact before a big task, so the turns after it read less.',
  ])
  expect(tips({ turn: null, percent: 10, days: busy })).toEqual([
    'Today is 4.5× your daily average of the last six days (100k).',
  ])
  // Two at most, the most pressing first.
  const turn = { input: 30_000, output: 0, cacheRead: 0, cacheWrite: 0 }

  expect(tips({ turn, percent: 90, days: busy })).toHaveLength(2)
  expect(tips({ turn, percent: 90, days: busy })[0]).toMatch(/^Context at 90%/)
  expect(tips({ turn: null, percent: null, days: week({}, NOW) })).toEqual([])
})

// The end of a session: what it counted and spent, beside the sessions of
// the last seven days.
const shareWith = (tokens: number, usd = 0): Share => ({
  days: usd === 0 ? {} : { [TODAY]: usd },
  tokens: { [TODAY]: tokens },
  projects: {},
  models: {},
  spent: {},
})

test('a session ends with what it counted and spent, beside the average session of the week', () => {
  expect(sessionSummary(shareWith(412_000, 1.2), [shareWith(200_000), shareWith(400_000)], NOW)).toBe(
    'This session: 412k tokens, $1.20, 1.4× your average session this week (300k).',
  )
  // Sessions older than the week, or that counted nothing, are not in the average.
  const old: Share = { ...NO_SHARE, tokens: { [dayOf(NOW - 9 * DAY)]: 5_000_000 } }

  expect(sessionSummary(shareWith(9000), [old, NO_SHARE], NOW)).toBe('This session: 9.0k tokens, $0.00.')
  expect(sessionSummary(NO_SHARE, [shareWith(1000)], NOW)).toBeNull()
})

// On a subscription no dollar is billed: the figures are the API's price of
// the tokens, and every one says so.
test("on a subscription each dollar figure is named for the API's price", () => {
  const none = { day: '', levels: [] }

  expect(budgetNews(ledgerOf(8.1), NOW, 10, true).notices[0]?.line).toBe("Today's API worth at 81% of $10.00, $1.90 left")
  expect(budgetNews(ledgerOf(10.42), NOW, 10, true).notices[0]?.title).toBe("Today's budget of $10.00 is used at API prices")
  expect(monthNews({ [TODAY]: 170 }, NOW, 200, { month: '', levels: [] }, true).notices[0]?.title).toBe(
    "This month's API worth at 85% of $200.00",
  )
  expect(monthNews({ [TODAY]: 210 }, NOW, 200, { month: '', levels: [] }, true).notices[0]?.line).toBe(
    "This month's budget of $200.00 is used at API prices: $210.00 so far",
  )
  expect(projectNews({ [TODAY]: { shop: 4.2 } }, NOW, { shop: 5 }, none as never, true).notices[0]?.title).toBe(
    "shop's API worth today at 84% of $5.00",
  )
  expect(sessionSummary(shareWith(9000, 1.2), [], NOW, true)).toBe('This session: 9.0k tokens, $1.20 at API prices.')
  // Paid by the token, the words stay as they were.
  expect(budgetNews(ledgerOf(8.1), NOW, 10).notices[0]?.line).toBe("Today's cost at 81% of $10.00, $1.90 left")
})

test('with no 5-hour or weekly window, an API key, the band says what today has cost', async ($, on) => {
  world(on)

  const billed = (usd: number) => ({ ...reading(usd), rateLimits: [] })

  await $.session.measure(billed(1))
  await $.session.measure(billed(1.5))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: '$0.50 today' })).toBeDefined()
})

test("on a subscription the pane's month says its dollars are the API's price", async ($, on) => {
  world(on, { ledger: ledgerOf(4) })
  await $.session.start(START)
  await $.session.measure(reading(1))

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE })
    const words = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)

    expect(words.some(text => text.trim() === 'this month at API prices')).toBe(true)
    expect(words.map(text => text.trim())).toContain('Your plan does not bill these.')
    await pane.unmount()
  }
})

// A turn far heavier than usual: five times the median of the last turns, or
// a floor where there are few.

test('a turn is heavy past five times the usual, and never under a floor', () => {
  expect(heavyThreshold([])).toBe(500_000)
  expect(heavyThreshold([10_000, 20_000])).toBe(500_000)
  // A median of 80k: five times is 400k.
  expect(heavyThreshold([60_000, 80_000, 90_000, 200_000, 70_000])).toBe(400_000)
  // Small turns keep the floor.
  expect(heavyThreshold([5000, 6000, 7000])).toBe(300_000)
})

test('the heavy turn is said with its tokens beside the usual', () => {
  expect(heavyLine(1_200_000, [60_000, 80_000, 90_000])).toEqual({
    title: 'This turn has used 1.2M tokens',
    text: '15× a usual turn (80.0k). Esc stops it.',
  })
  expect(heavyLine(600_000, [])).toEqual({ title: 'This turn has used 600k tokens', text: 'Esc stops it.' })
})

// The week runs Monday to Sunday, local time. NOW is Tuesday 13 October 2026.
const MONDAY = new Date(2026, 9, 12, 12, 0).getTime()

test('the week starts on its Monday, and its cost is what Monday to today spent', () => {
  expect(weekOf(NOW)).toBe(dayOf(MONDAY))
  expect(weekOf(MONDAY)).toBe(dayOf(MONDAY))
  expect(weekOf(new Date(2026, 9, 18, 23, 0).getTime())).toBe(dayOf(MONDAY))
  expect(weekOf(new Date(2026, 9, 19, 0, 30).getTime())).toBe(dayOf(new Date(2026, 9, 19).getTime()))
  expect(weekSpent({ [TODAY]: 2, [dayOf(MONDAY)]: 3, [dayOf(MONDAY - DAY)]: 40 }, NOW)).toBe(5)
})

test("the week's budget is news at 80% and when spent, once a week each", () => {
  const none = { week: '', levels: [] }

  expect(weekNews({ [TODAY]: 30 }, NOW, null, none)).toEqual({ notices: [], told: none })
  expect(weekNews({ [TODAY]: 30 }, NOW, 50, none).notices).toEqual([])

  const near = weekNews({ [TODAY]: 21, [dayOf(MONDAY)]: 20 }, NOW, 50, none)

  expect(near.notices.map(({ kind, title }) => ({ kind, title }))).toEqual([
    { kind: 'budget', title: "This week's cost at 82% of $50.00" },
  ])
  expect(near.told).toEqual({ week: dayOf(MONDAY), levels: [80] })
  expect(weekNews({ [TODAY]: 45 }, NOW, 50, near.told).notices).toEqual([])

  const spent = weekNews({ [TODAY]: 52 }, NOW, 50, near.told)

  expect(spent.notices.map(({ kind, title }) => ({ kind, title }))).toEqual([
    { kind: 'spent', title: "This week's budget of $50.00 is spent" },
  ])
  // A new week is told afresh.
  const next = weekNews({ [dayOf(NOW + 7 * DAY)]: 45 }, NOW + 7 * DAY, 50, spent.told)

  expect(next.told).toEqual({ week: weekOf(NOW + 7 * DAY), levels: [80] })
})

test('a weekly budget is set beside the daily one, and said in the list', () => {
  const base = defaults({})

  expect(base.weekBudget).toBeNull()
  expect(apply(base, 'budget week 50')).toMatchObject({ style: { weekBudget: 50 }, text: 'budget: $50.00 a week.' })
  expect(apply({ ...base, weekBudget: 50 }, 'budget week off')).toMatchObject({
    style: { weekBudget: null },
    text: 'weekly budget: off.',
  })
  expect(apply(base, 'budget week lots')).toEqual({ text: 'A weekly budget is dollars a week, or off: budget week 50.' })
  expect(apply({ ...base, weekBudget: 50 }, 'list')).toMatchObject({ text: expect.stringContaining('budget $50.00 a week') })
  expect(sane({ ...base, weekBudget: 50 })?.weekBudget).toBe(50)
  const { weekBudget, ...older } = { ...base, weekBudget: 50 }
  expect(sane(older)?.weekBudget).toBeNull()
})

test("the crab says when the week's budget is nearly spent", async ($, on) => {
  const toasts: string[] = []
  const { kept } = world(on, { ledger: { days: { [dayOf(MONDAY)]: 39 }, told: { day: '', levels: [] } } }, toasts)

  await $.command.run({ ...TYPED, command: 'tokens', args: 'budget week 50' })
  await $.session.start({ ...START, surface: 'terminal' })
  await $.session.measure(reading(1.5))
  expect(toasts).toEqual(["This week's API worth at 81% of $50.00, $9.50 left"])
  expect(kept.get('weekTold')).toEqual({ week: dayOf(MONDAY), levels: [80] })

  await $.session.measure(reading(2))
  expect(toasts).toHaveLength(1)
})

test("in a narrow band the crab's words wrap and give way, and its OK stays", async ($, on) => {
  const toasts: string[] = []

  world(on, { ledger: ledgerOf(7.6) }, toasts)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'budget 10' })
  await $.session.start(START)
  await $.session.measure(reading(0.5))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND, props: { ...BAND.props, bodyColumns: 40 } } as never)
  const title = await ui.find({ type: 'Text', text: "Today's API worth at 81% of $10.00" })

  expect(title?.props.wrap).toBe('wrap')
  expect(await ui.find({ type: 'Button', text: 'OK' })).toBeDefined()
})

test("a project's budget is set for the folder the session runs in, and the crab says when it is near", async ($, on) => {
  const toasts: string[] = []
  const { kept } = world(on, {}, toasts)

  await $.session.start({ ...START, cwd: 'C:/work/shop', surface: 'terminal' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'budget project here 2' })
  expect(JSON.stringify(await $.command.run({ ...TYPED, command: 'tokens', args: 'list' }))).toContain('budget $2.00 a day for shop')
  await $.session.measure(reading(1.7))
  expect(toasts).toEqual(["shop's API worth today at 85% of $2.00, $0.30 left"])
  expect(kept.get('projectTold')).toEqual({ day: TODAY, levels: { shop: [80] } })
})

test('a budget puts its ring before the cost, and the crab says when it is nearly spent', async ($, on) => {
  const toasts: string[] = []
  const { kept } = world(on, { ledger: ledgerOf(7.6) }, toasts)

  await $.command.run({ ...TYPED, command: 'tokens', args: 'budget 10' })
  await $.session.start({ ...START, surface: 'terminal' })
  await $.session.measure(reading(0.5))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const alts = async () => (await ui.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))

  expect(toasts).toEqual(["Today's API worth at 81% of $10.00, $1.90 left"])
  expect(await alts()).toEqual([
    "Crab: Today's API worth at 81% of $10.00",
    'context 42%',
    '5-hour 31% used',
    "Today's budget 81%",
  ])
  expect(kept.get('ledger')).toMatchObject({ told: { day: TODAY, levels: [80] } })

  await $.session.measure(reading(3))
  expect((await alts())[0]).toBe("Crab: Today's budget of $10.00 is used at API prices")
  expect(String((await ui.findAll({ type: 'Svg' }))[0]?.props.source).split('fill="#9aa0aa"')).toHaveLength(8)
  expect(toasts).toHaveLength(2)

  // Told already today: more spending says nothing more.
  await $.session.measure(reading(4))
  expect(toasts).toHaveLength(2)
})

test('with no budget the cost stands alone in the band', async ($, on) => {
  world(on)
  await $.session.measure(reading(1))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect((await ui.findAll({ type: 'Svg' })).map(({ props }) => props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5-hour 31% used',
  ])
})

