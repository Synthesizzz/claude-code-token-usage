import type { On, SessionCompactInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { addProject, byProject, dayOf, keepTurn, saneProjects, saneTurns, shortTokens } from '../hooks/cost'
import { apply, defaults, sane } from '../hooks/style'
import { clockAt, isQuiet, turnsLeft } from '../hooks/usage'
import type { Style } from '../types'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// Noon and eleven at night, local time, so a test never sits on the edge of
// a day or of quiet hours.
const NOON = new Date(2026, 9, 13, 12, 0).getTime()
const NIGHT = new Date(2026, 9, 13, 23, 0).getTime()
const TODAY = dayOf(NOON)
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, ...SITE },
} as const
const PANE = {
  component: 'Pane',
  requestId: 'tokens',
  props: { title: 'Token usage', isFocused: false, bodyColumns: 48, placement: 'dock', ...SITE },
} as const
const SHOP = 'C:\\work\\shop'
const reading = (usd: number, context = 42, five = 31, resetsAt?: number) => ({
  context: { window: 200000, tokens: context * 2000, percent: context },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: five,
      ...(resetsAt === undefined ? {} : { resetsAt: new Date(resetsAt).toISOString() }),
    },
  ],
  cost: { usd },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
// A subagent's turn: a thousand tokens of its own.
const subTurn = (id: string) =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId: id,
    agentId: 'sub',
    usage: { model: 'm', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 850, cache_creation_input_tokens: 0 },
  }) as const
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
const START = { cwd: SHOP, surface: 'desktop', isInteractive: true } as const
// The file of this session's own counts.
const MINE = 'C:/Users/me/.claude/token-usage/sessions/mine.json'

// The engine beneath the mod: a clock, a store the test can read, a session
// whose cost the test sets, the notify switch file, toasts, notifications
// and PowerShell runs kept, an empty band.
const world = (on: On, now = NOON, stored: Readonly<Record<string, unknown>> = {}) => {
  const kept = new Map(Object.entries(stored))
  const session = { usd: undefined as number | undefined }
  const seen = { toasts: [] as string[], notified: [] as string[], runs: 0, written: {} as Record<string, string>, usages: 0 }

  const clock = mock.clock(on, { now })
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
  on('session.usage', () => {
    seen.usages += 1

    return {
      value: {
        startedAt: 0,
        context: { window: 200000 },
        rateLimits: [],
        ...(session.usd === undefined ? {} : { cost: { usd: session.usd } }),
      },
    }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' })
  on('fs.write', (_, e) => {
    seen.written[e.path.replaceAll('\\', '/')] = e.text

    return { value: undefined }
  })
  // What was written reads back, and a folder lists the files written in it.
  on('fs.read', (_, e) => {
    const text = seen.written[e.path.replaceAll('\\', '/')]

    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: text }
  })
  on('fs.list', (_, e) => {
    const folder = `${e.path.replaceAll('\\', '/')}/`

    return {
      value: Object.keys(seen.written)
        .filter(path => path.startsWith(folder) && !path.slice(folder.length).includes('/'))
        .map(path => ({ name: path.slice(folder.length), kind: 'file' as const, size: 1, mtimeMs: clock.now(), isLink: false })),
    }
  })
  on('session.id', () => ({ value: 'mine' }))
  on('process.run', () => {
    seen.runs += 1

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.notify', (_, e) => {
    seen.notified.push(e.text)

    return { value: { isSent: false as const, reason: 'no-channel' as const } }
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return { kept, session, seen, clock }
}
// A tool call as the engine raises it, through one plain signature: the
// checker gives up weighing every tool's overload for each call in a file
// this long.
const callOf = ($: { tool: { call: unknown } }) => $.tool.call as (input: Record<string, unknown>) => Promise<unknown>
const SWITCH = 'C:/Users/me/.claude/token-usage/notify.json'
const pad = (value: number) => String(value).padStart(2, '0')
const hhmm = (at: number) => `${pad(new Date(at).getHours())}:${pad(new Date(at).getMinutes())}`

// What follows a label in a pane: the value on the other side of its row.
const altsOf = async (pane: { findAll: (query: { type: 'Svg' }) => Promise<readonly { props: Record<string, unknown> }[]> }) =>
  (await pane.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))
// Whether these texts come one after another in the pane, as a table row's
// cells do.
const follows = async (pane: { findAll: (query: { type: 'Text' }) => Promise<readonly { text: string }[]> }, cells: string[]) => {
  const texts = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)

  return texts.some((_, at) => cells.every((cell, offset) => texts[at + offset] === cell))
}
const valueOf = async (pane: { findAll: (query: { type: 'Text' }) => Promise<readonly { text: string }[]> }, label: string) => {
  const texts = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)
  const index = texts.indexOf(label)

  return index === -1 ? undefined : texts[index + 1]
}

// The context forecast.

test('the context fills in as many turns as its last climbs say', () => {
  expect(turnsLeft([40, 50, 60])).toBe(4)
  expect(turnsLeft([70, 80, 90])).toBe(1)
  // Only the last three climbs count.
  expect(turnsLeft([10, 11, 30, 50, 70])).toBe(1)
})

test('a context with too few turns, or none climbing, has no forecast', () => {
  expect(turnsLeft([])).toBeNull()
  expect(turnsLeft([60])).toBeNull()
  expect(turnsLeft([50, 50])).toBeNull()
})

test('a context that fell was compacted: the turns before it are not counted', () => {
  expect(turnsLeft([60, 80, 20, 30])).toBe(7)
  expect(turnsLeft([60, 80, 20])).toBeNull()
})

test('Compact turns primary when the context fills within three turns, before it is crowded', async ($, on) => {
  world(on)

  for (const [index, percent] of [50, 60, 70].entries()) {
    await $.session.measure(reading(1, percent))
    await $.turn.complete(turn(`t${index}`))
  }

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    const button = await ui.find({ type: 'Button', text: 'Compact' })

    expect(button?.props.variant).toBe('primary')
  }
})

// A /compact over a conversation of one message.
const TALK: SessionCompactInput = { trigger: 'manual', messages: [{ role: 'user', text: 'A long talk.', toolUses: [] }] }

test('a compaction redraws the context at once, with no turn after it', async ($, on) => {
  world(on)
  on('session.compact', () => ({ messages: [{ role: 'user', text: 'The summary.', toolUses: [] }], tokensAfter: 24000 }))
  await $.session.measure(reading(1, 89))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeDefined()
  await $.session.compact(TALK)
  expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeUndefined()
})

test('a compaction skipped leaves the context as it was', async ($, on) => {
  world(on)
  on('session.compact', () => ({ skip: 'off' }))
  await $.session.measure(reading(1, 89))
  await $.session.compact(TALK)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await ui.find({ type: 'Text', text: '89%' })).toBeDefined()
})

test('a crowded context far from full keeps the plain Compact', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 81))
  await $.turn.complete(turn('t1'))
  await $.session.measure(reading(1, 82))
  await $.turn.complete(turn('t2'))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect((await ui.find({ type: 'Button', text: 'Compact' }))?.props.variant).not.toBe('primary')
})

test('a context climbing slowly shows no Compact before it is crowded', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 40))
  await $.turn.complete(turn('t1'))
  await $.session.measure(reading(1, 42))
  await $.turn.complete(turn('t2'))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeUndefined()
})

// The reset in clock time.

test('a time is the clock of the day, with the weekday where it is not today', () => {
  expect(clockAt(new Date(2026, 9, 13, 15, 20).getTime(), NOON)).toBe('15:20')
  expect(clockAt(new Date(2026, 9, 13, 9, 5).getTime(), NOON)).toBe('09:05')
  expect(clockAt(new Date(2026, 9, 15, 7, 0).getTime(), NOON)).toBe('Thu 07:00')
})

test('the pane gives each reset in clock time too', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 42, 31, NOON + 2 * HOUR + 14 * MINUTE))

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await pane.find({ type: 'Text', text: 'reset 2h14m, at 14:14' })).toBeDefined()

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect((await altsOf(desktop))[0]).toContain('reset 2h14m, at 14:14')
})

test('a 5-hour window past 85% says when a big task can start, in the forecast\'s place', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 42, 88, NOON + HOUR + 20 * MINUTE))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: 'big task? after 13:20' })).toBeDefined()
  }
})

test('a 5-hour window under 85%, or with no reset known, gives no such word', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 42, 84, NOON + HOUR))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await ui.findAll({ type: 'Text' })).some(({ text }) => text.startsWith('big task'))).toBe(false)

  await $.session.measure(reading(1, 42, 90))
  expect((await ui.findAll({ type: 'Text' })).some(({ text }) => text.startsWith('big task'))).toBe(false)
})

// Privacy and quiet hours: the words of /tokens.

test('privacy is on from the start, and the words switch it', () => {
  const style = defaults({})

  expect(style.isPrivate).toBe(true)

  const off = apply(style, 'privacy off')

  expect(off).toEqual({ style: { ...style, isPrivate: false }, text: 'privacy: off.' })
  expect(apply({ ...style, isPrivate: false }, 'privacy on')).toEqual({ style, text: 'privacy: on.' })
  expect(apply(style, 'privacy maybe')).toEqual({ text: 'Privacy is on or off: alerts privacy off.' })
})

test('quiet hours are set from one hour to another, or switched off', () => {
  const style = defaults({})

  expect(style.quiet).toBeNull()
  expect(apply(style, 'quiet 22-8')).toEqual({
    style: { ...style, quiet: { from: 22, to: 8 } },
    text: 'quiet: 22:00 to 08:00.',
  })
  expect(apply({ ...style, quiet: { from: 22, to: 8 } }, 'quiet off')).toEqual({
    style,
    text: 'quiet: off.',
  })

  // The word alone is still the preset of that name.
  expect(apply(style, 'quiet')).toMatchObject({ text: 'Style: quiet.' })

  for (const wrong of ['quiet 25-8', 'quiet 8-8', 'quiet ten', 'quiet 1.5-3']) {
    expect(apply(style, wrong)).toEqual({
      text: 'Quiet hours run from one hour of the day to another, or off: alerts quiet 22-8.',
    })
  }
})

test("the crab's own window is on from the start, and the words switch it", () => {
  const style = defaults({})

  expect(style.hasPopup).toBe(true)

  const off = apply(style, 'popup off')

  expect(off).toEqual({ style: { ...style, hasPopup: false }, text: 'popup: off.' })
  expect(apply({ ...style, hasPopup: false }, 'popup on')).toEqual({ style, text: 'popup: on.' })
  expect(apply(style, 'popup maybe')).toEqual({ text: 'The popup is on or off: alerts popup off.' })
  expect(apply({ ...style, hasPopup: false }, 'list')).toMatchObject({ text: expect.stringContaining('popup off') })
})

test('the notification outside the app is set under alerts; the words alone still work', () => {
  const style = defaults({})

  expect(apply(style, 'alerts popup off')).toEqual(apply(style, 'popup off'))
  expect(apply(style, 'alerts privacy off')).toEqual(apply(style, 'privacy off'))
  expect(apply(style, 'alerts quiet 22-8')).toEqual(apply(style, 'quiet 22-8'))
  expect(apply(style, 'Alerts Quiet OFF')).toEqual({ style, text: 'quiet: off.' })
  expect(apply(style, 'alerts quiet 22-8')).toMatchObject({ style: { quiet: { from: 22, to: 8 } } })
  // Without hours it asks for them: only `quiet` alone is the preset.
  expect(apply(style, 'alerts quiet')).toEqual({
    text: 'Quiet hours run from one hour of the day to another, or off: alerts quiet 22-8.',
  })
  expect(apply(style, 'alerts popup')).toEqual({ text: 'The popup is on or off: alerts popup off.' })
})

test('a kept style holds the popup; one kept before it had a place has it on', () => {
  const style: Style = { ...defaults({}), hasPopup: false }
  const { hasPopup, ...older } = style

  expect(sane(style)).toEqual(style)
  expect(sane(older)).toEqual({ ...style, hasPopup: true })
})

test('a kept style holds privacy and quiet hours; one kept before them has the defaults', () => {
  const style: Style = { ...defaults({}), isPrivate: false, quiet: { from: 23, to: 6 } }
  const { isPrivate, quiet, ...older } = style

  expect(sane(style)).toEqual(style)
  expect(sane(older)).toEqual({ ...style, isPrivate: true, quiet: null })
  expect(sane({ ...style, quiet: { from: 30, to: 6 } })?.quiet).toBeNull()
  expect(sane({ ...style, quiet: 'night' })?.quiet).toBeNull()
})

test('quiet hours hold from their first hour up to their last, across midnight too', () => {
  const at = (hour: number) => new Date(2026, 9, 13, hour, 30).getTime()

  expect(isQuiet(null, at(23))).toBe(false)
  expect(isQuiet({ from: 22, to: 8 }, at(23))).toBe(true)
  expect(isQuiet({ from: 22, to: 8 }, at(7))).toBe(true)
  expect(isQuiet({ from: 22, to: 8 }, at(8))).toBe(false)
  expect(isQuiet({ from: 22, to: 8 }, at(12))).toBe(false)
  expect(isQuiet({ from: 1, to: 5 }, at(3))).toBe(true)
  expect(isQuiet({ from: 1, to: 5 }, at(6))).toBe(false)
})

test('the script that notifies outside the app is told of privacy, quiet hours and the popup', async ($, on) => {
  const { seen } = world(on)

  await $.session.start(START)
  expect(JSON.parse(seen.written[SWITCH] ?? '')).toEqual({ isOn: true, isPrivate: true, quiet: null, hasPopup: true })

  await $.command.run({ ...TYPED, command: 'tokens', args: 'privacy off' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'quiet 22-8' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'popup off' })
  expect(JSON.parse(seen.written[SWITCH] ?? '')).toEqual({
    isOn: true,
    isPrivate: false,
    quiet: { from: 22, to: 8 },
    hasPopup: false,
  })
})

// Quiet hours in the band and outside the app.

test('in quiet hours the crab sleeps in the band and says until when', async ($, on) => {
  world(on, NIGHT)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'quiet 22-8' })
  await $.session.measure(reading(1))

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const alts = (await desktop.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))

  expect(alts).toContain('Crab asleep: quiet until 08:00')
  expect(await desktop.find({ type: 'Text', text: 'quiet until 08:00' })).toBeDefined()

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await terminal.find({ type: 'Text', text: 'quiet until 08:00' })).toBeDefined()
})

test('outside quiet hours the band says nothing of them', async ($, on) => {
  world(on, NOON)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'quiet 22-8' })
  await $.session.measure(reading(1))

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect((await desktop.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))).not.toContain(
    'Crab asleep: quiet until 08:00',
  )
  expect(await desktop.find({ type: 'Text', text: 'quiet until 08:00' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`in quiet hours an alert stays in the app: nothing goes out to Windows (${surface})`, async ($, on) => {
    const { seen } = world(on, NIGHT)

    await $.command.run({ ...TYPED, command: 'tokens', args: 'quiet 22-8' })
    await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
    await $.session.start({ ...START, surface })
    await $.session.measure(reading(1, 42, 50))
    await $.session.measure(reading(1, 42, 86))

    expect(seen.runs).toBe(0)
    expect(seen.notified).toEqual([])
    expect(seen.toasts.length).toBeGreaterThan(0)
  })

  test(`outside quiet hours the same alert goes out to Windows (${surface})`, async ($, on) => {
    const { seen } = world(on, NOON)

    await $.command.run({ ...TYPED, command: 'tokens', args: 'quiet 22-8' })
    await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
    await $.session.start({ ...START, surface })
    await $.session.measure(reading(1, 42, 50))
    await $.session.measure(reading(1, 42, 86))

    expect(seen.runs + seen.notified.length).toBeGreaterThan(0)
  })
}

// The cost by project.

test('the project ledger adds to the day under the project, and lets go of old days', () => {
  const old = dayOf(NOON - 40 * DAY)
  const once = addProject({ [old]: { shop: 3 } }, NOON, 'shop', 0.5)

  expect(once).toEqual({ [TODAY]: { shop: 0.5 } })
  expect(addProject(once, NOON, 'shop', 0.25)).toEqual({ [TODAY]: { shop: 0.75 } })
  expect(addProject(once, NOON, 'notes', 1)).toEqual({ [TODAY]: { shop: 0.5, notes: 1 } })
})

test('a project ledger kept in an unknown shape keeps only its sums', () => {
  expect(saneProjects(null)).toEqual({})
  expect(saneProjects({ [TODAY]: { shop: 1, bad: 'x', worse: -2 }, x: 4 })).toEqual({ [TODAY]: { shop: 1 } })
})

test('the week by project adds the last seven days, most first, five at most', () => {
  const projects: Record<string, Record<string, number>> = {
    [TODAY]: { a: 1, b: 2 },
    [dayOf(NOON - 3 * DAY)]: { a: 4, c: 0.5, d: 0.4, e: 0.3, f: 0.2 },
    [dayOf(NOON - 9 * DAY)]: { g: 50 },
  }

  expect(byProject(projects, NOON)).toEqual([
    { name: 'a', total: 5 },
    { name: 'b', total: 2 },
    { name: 'c', total: 0.5 },
    { name: 'd', total: 0.4 },
    { name: 'e', total: 0.3 },
  ])
})
test('the pane sets out the tokens of the last seven days by project, this one counted from its folder', async ($, on) => {
  const { kept, seen } = world(on, NOON, { projectTokens: { [TODAY]: { notes: 5000, 'token-usage': 4_100_000 } } })

  await $.session.start(START)
  await $.turn.complete(subTurn('s1'))
  await $.turn.complete(turn('t1'))
  // A subagent's tokens count to the project too, in the session's own file;
  // what was kept before is left as it was, and counted beside it.
  expect(JSON.parse(seen.written[MINE] ?? '').projects).toEqual({ [TODAY]: { shop: 11_300 } })
  expect(kept.get('projectTokens')).toEqual({ [TODAY]: { notes: 5000, 'token-usage': 4_100_000 } })

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await pane.find({ type: 'Text', text: 'Last 7 days by project' })).toBeDefined()
  expect(await valueOf(pane, '  token-usage')).toBe('4.1M')
  expect(await valueOf(pane, '  shop')).toBe('11.3k')
  expect(await valueOf(pane, '  notes')).toBe('5.0k')

  // The desktop draws one bar in parts.
  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect(await altsOf(desktop)).toContain('By project: token-usage 4.1M, shop 11.3k, notes 5.0k')
})
test('the pane sets out the tokens of the last seven days by model, a subagent\'s under its own', async ($, on) => {
  const { seen } = world(on, NOON)
  const as = (shown: ReturnType<typeof turn> | ReturnType<typeof subTurn>, model: string) => ({ ...shown, usage: { ...shown.usage, model } })

  await $.session.start(START)
  await $.turn.complete(as(subTurn('s1'), 'claude-haiku-5-5'))
  await $.turn.complete(as(turn('t1'), 'claude-opus-5-5'))
  expect(JSON.parse(seen.written[MINE] ?? '').models).toEqual({
    [TODAY]: { 'claude-haiku-5-5': 1000, 'claude-opus-5-5': 10_300 },
  })

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await pane.find({ type: 'Text', text: 'Last 7 days by model' })).toBeDefined()
  expect(await valueOf(pane, '  opus-5-5')).toBe('10.3k')
  expect(await valueOf(pane, '  haiku-5-5')).toBe('1.0k')

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect(await altsOf(desktop)).toContain('By model: opus-5-5 10.3k, haiku-5-5 1.0k')
})

test('/tokens export writes the days as CSV and every count as JSON beside the mod\'s files', async ($, on) => {
  const { seen } = world(on, NOON, { tokenDays: { [TODAY]: 1_000_000 } })

  await $.session.start(START)
  await $.turn.complete(turn('t1'))

  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'export' })
  const csv = seen.written[`C:/Users/me/.claude/token-usage/export-${TODAY}.csv`]
  const json = JSON.parse(seen.written[`C:/Users/me/.claude/token-usage/export-${TODAY}.json`] ?? '{}')

  expect(csv).toBe(`day,usd,tokens\n${TODAY},0.0000,1010300\n`)
  expect(json.tokens).toEqual({ [TODAY]: 1_010_300 })
  expect(json.projects).toEqual({ [TODAY]: { shop: 10_300 } })
  expect(json.models).toEqual({ [TODAY]: { m: 10_300 } })
  expect(JSON.stringify(said)).toContain(`export-${TODAY}.csv`)
})

test('a session that ends says what it counted, and the next one shows it in the pane', async ($, on) => {
  const { seen, kept } = world(on, NOON)

  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(START)
  await $.turn.complete(turn('t1'))
  await $.session.end({ reason: 'clear', sessionId: 'mine', resume: { id: 'mine' } } as never)
  expect(seen.toasts).toContain('This session: 10.3k tokens, $0.00.')
  expect(kept.get('lastSession')).toMatchObject({ line: 'This session: 10.3k tokens, $0.00.', project: 'shop' })

  await $.session.start(START)

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  const lines = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)

  expect(lines.at(-1)).toMatch(/^  Last session \(shop, \d\d:\d\d\): 10\.3k tokens, \$0\.00\.$/)

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect((await desktop.findAll({ type: 'Text' })).map(({ text }) => text).at(-1)).toMatch(/^Last session \(shop, /)
})

// A turn far heavier than usual is said while it runs.

const step = (index: number, tokens: number, agentId?: string) => ({
  turnId: 'tx',
  index,
  model: 'm',
  messageCount: 1,
  ...(agentId === undefined ? {} : { agentId }),
})

test('a heavy turn offers the choices that fit; Stop now ends the turn and asks what next', async ($, on) => {
  world(on, NOON)
  const aborted: string[] = []
  const submitted: string[] = []
  const sizes = new Map<number, number>()

  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.abort', (_, e) => (aborted.push(e.turnId), { value: undefined }))
  on('prompt.submit', (_, e) => (submitted.push(e.text), { text: e.text }) as never)
  on('turn.step', async function* (_, e) {
    const tokens = sizes.get(e.index) ?? 0
    // Read from the cache: a heavy turn whose cache lapsed offers no stop, its cost paid already.
    const usage = { model: 'm', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const run = async (index: number, tokens: number) => {
    sizes.set(index, tokens)

    const stream = $.turn.step(step(index, tokens) as never)
    let read = await stream.next()

    while (read.done !== true) {
      read = await stream.next()
    }
  }

  await $.session.start(START)

  for (const id of ['t1', 't2', 't3']) {
    await $.turn.complete(turn(id))
  }

  await $.turn.start({ turnId: 'main-1', text: 'go' } as never)
  await run(0, 400_000)

  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const first = await band.find({ type: 'Button', key: 'choice-keep' })

  // All of it was the context re-read: keep going is first, then stop, or the line raised.
  expect(first?.props.variant).toBe('primary')
  expect(first?.props.hotkey).toBe('1')
  expect(await band.find({ type: 'Button', key: 'choice-raise' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^context re-read 100%/ })).toBeDefined()

  await band.press({ key: 'choice-stop' })
  expect(aborted).toEqual(['main-1'])
  await band.unmount()

  const after = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await after.find({ type: 'Text', text: 'Stopped after 400k tokens. What next?' })).toBeDefined()
  // The context is light: start fresh first; or go on where it stopped.
  expect((await after.find({ type: 'Button', key: 'choice-fresh' }))?.props.variant).toBe('primary')
  await after.press({ key: 'choice-continue' })
  expect(submitted).toEqual(['Continue where you stopped.'])
})

test('a pressed choice sends its notice away at once, and Compact runs once the press has answered', async ($, on) => {
  const { clock } = world(on, NOON)
  const sizes = new Map<number, number>()
  let compactions = 0

  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.abort', () => ({ value: undefined }))
  on('session.compact', () => {
    compactions += 1

    return { messages: [{ role: 'user', text: 'The summary.', toolUses: [] }], tokensAfter: 24000 }
  })
  on('turn.step', async function* (_, e) {
    // Read from the cache, so the heavy turn offers a stop.
    const usage = { model: 'm', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: sizes.get(e.index) ?? 0, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const run = async (index: number, tokens: number) => {
    sizes.set(index, tokens)

    const stream = $.turn.step(step(index, tokens) as never)
    let read = await stream.next()

    while (read.done !== true) {
      read = await stream.next()
    }
  }

  await $.session.start(START)

  for (const id of ['t1', 't2', 't3']) {
    await $.turn.complete(turn(id))
  }

  await $.turn.start({ turnId: 'main-1', text: 'go' } as never)
  await run(0, 400_000)

  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  await band.press({ key: 'choice-stop' })
  await band.unmount()

  const stopped = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  await stopped.press({ key: 'choice-compact' })
  // The press has answered before the compaction, which can outlast a press's budget.
  expect(compactions).toBe(0)
  await stopped.unmount()
  await clock.advance(2000)
  expect(compactions).toBe(1)

  // The question was answered: it has gone, long before its time was up.
  const after = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect(await after.find({ type: 'Text', text: /^Stopped after/ })).toBeUndefined()
  expect(await after.find({ type: 'Button', key: 'choice-fresh' })).toBeUndefined()
})

test('a /clear sets the new session up again, as no session.start fires for it', async ($, on) => {
  const { seen, clock } = world(on, NOON)

  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(START)

  const measured = seen.usages

  await $.session.end({ reason: 'clear', sessionId: 'mine', resume: { id: 'mine' } } as never)
  await clock.advance(2000)
  expect(seen.usages).toBeGreaterThan(measured)
})

test('a turn far heavier than usual is said while it runs, once, and the next turn starts over', async ($, on) => {
  const { seen } = world(on, NOON)
  const sizes = new Map<number, number>()

  on('turn.step', async function* (_, e) {
    const tokens = sizes.get(e.index) ?? 0
    const usage = { model: 'm', input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'm', input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
  })
  const run = async (index: number, tokens: number, agentId?: string) => {
    sizes.set(index, tokens)

    const stream = $.turn.step(step(index, tokens, agentId) as never)
    let read = await stream.next()

    // The pieces of the response pass through untouched; the result ends it.
    while (read.done !== true) {
      read = await stream.next()
    }

    return read.value
  }

  // In a terminal, where a notice is a toast.
  await $.session.start({ ...START, surface: 'terminal' })

  // Three usual turns of 10.3k each.
  for (const id of ['t1', 't2', 't3']) {
    await $.turn.complete(turn(id))
  }

  expect(seen.toasts).toEqual([])
  await run(0, 200_000)
  expect(seen.toasts).toEqual([])
  // A subagent's steps count toward the turn it runs in.
  const result = await run(1, 150_000, 'sub')

  expect(result.usage?.input_tokens).toBe(150_000)
  expect(seen.toasts).toEqual(["This turn has used 350k tokens · 34× a usual turn (10.3k). The cache had lapsed: 57% of it was read anew, and that is paid already: stopping won't get it back. Compact after, and the next lapse re-reads less."])
  await run(2, 400_000)
  expect(seen.toasts).toHaveLength(1)

  await $.turn.complete(turn('t4'))
  await run(0, 200_000)
  expect(seen.toasts).toHaveLength(1)
})

test("a usual turn is what the last sessions' turns were, kept across sessions", async ($, on) => {
  const { seen, kept } = world(on, NOON, { typicalTurns: [80_000, 80_000, 80_000] })
  const sizes = new Map<number, number>()

  on('turn.step', async function* (_, e) {
    const tokens = sizes.get(e.index) ?? 0
    const usage = { model: 'm', input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const run = async (index: number, tokens: number) => {
    sizes.set(index, tokens)

    const stream = $.turn.step(step(index, tokens) as never)
    let read = await stream.next()

    while (read.done !== true) {
      read = await stream.next()
    }
  }

  await $.session.start({ ...START, surface: 'terminal' })
  // The first turn of a new session goes by the sessions before it: five
  // times 80k is 400k, not the 500k a session with no history has.
  await run(0, 350_000)
  expect(seen.toasts).toEqual([])
  await run(1, 100_000)
  expect(seen.toasts).toEqual(["This turn has used 450k tokens · 6× a usual turn (80.0k). The cache had lapsed: 100% of it was read anew, and that is paid already: stopping won't get it back. Compact after, and the next lapse re-reads less."])

  await $.turn.complete(turn('t1'))
  expect(kept.get('typicalTurns')).toEqual([80_000, 80_000, 80_000, 10_300])
})

test('the share read from the cache is green from half, yellow from a fifth, red under it', async ($, on) => {
  world(on, NOON)
  await $.session.start(START)
  await $.session.measure(reading(1))

  const with_ = (cacheRead: number) => ({ ...turn('t'), usage: { ...turn('t').usage, input_tokens: 10_000 - cacheRead, cache_read_input_tokens: cacheRead } })

  for (const [cacheRead, color] of [[6000, 'success'], [2500, 'warning'], [1000, 'error']] as const) {
    await $.turn.complete(with_(cacheRead))

    for (const surface of ['desktop', 'terminal'] as const) {
      const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE })
      const shown = await pane.findAll({ type: 'Text' })
      const figure = shown[shown.findIndex(({ text }) => text.trim() === 'read from cache') + 1]

      expect([surface, figure?.props.color]).toEqual([surface, color])
      await pane.unmount()
    }
  }
})

test('the table of heavy turns gives the project its room before the tools', async ($, on) => {
  world(on, NOON, {
    heavyTurns: [{ at: NOON - HOUR, tokens: 2_100_000, project: 'dwh-project-touchgrass', tools: { Bash: 12, Read: 9, Edit: 4 } }],
  })
  await $.session.start(START)
  await $.session.measure(reading(1))

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 60 } } as never)
  const boxes = await pane.findAll({ type: 'Box' })

  // The longest project, 22 cells, has its room; the tools take the rest.
  expect(boxes.some(({ props }) => props.width === 22)).toBe(true)
})

test('the pane gives tips from the counts', async ($, on) => {
  world(on, NOON)
  await $.session.start(START)
  await $.session.measure({ ...reading(1), context: { window: 200000, tokens: 150000, percent: 75 } })

  // Under the rings, before the counts, on both surfaces.
  for (const surface of ['terminal', 'desktop'] as const) {
    const shown = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE })
    const texts = (await shown.findAll({ type: 'Text' })).map(({ text }) => text)
    const tip = texts.findIndex(text => text.startsWith('Context at 75%'))

    expect(tip).toBeGreaterThan(-1)
    expect(texts[tip - 1]).toBe('●')
  }
})

test('the heaviest turns of the day are kept, five at most, other days let go', () => {
  const at = (hour: number) => new Date(2026, 9, 13, hour, 0).getTime()
  const entry = (hour: number, tokens: number) => ({ at: at(hour), tokens, project: 'shop', tools: {} })
  let kept = saneTurns(null)

  for (const [hour, tokens] of [[8, 100], [9, 500], [10, 200], [11, 400], [12, 300], [13, 50], [14, 600]] as const) {
    kept = keepTurn(kept, entry(hour, tokens), NOON)
  }

  expect(kept.map(({ tokens }) => tokens)).toEqual([600, 500, 400, 300, 200])
  expect(keepTurn([{ ...entry(9, 9000), at: NOON - DAY }], entry(10, 100), NOON)).toEqual([entry(10, 100)])
  expect(saneTurns([entry(9, 1), { at: 'x' }, { ...entry(9, -1) }, { ...entry(9, 1), tools: { Bash: 'x' } }])).toEqual([
    entry(9, 1),
    { ...entry(9, 1), tools: {} },
  ])
})
test('the pane names the heaviest turns today, across sessions, with their tools', async ($, on) => {
  const { kept } = world(on, NOON, {
    heavyTurns: [{ at: NOON - HOUR, tokens: 2_100_000, project: 'notes', tools: { Read: 3 } }],
  })

  await $.session.start(START)
  await callOf($)({ tool: 'Bash', command: 'ls' })
  await callOf($)({ tool: 'Edit', file_path: 'a', old_string: 'x', new_string: 'y' })
  await callOf($)({ tool: 'Bash', command: 'pwd' })
  // A subagent's tools are its own; its tokens count to the turn it ran in.
  // The engine stamps a subagent's call with its id; the kit takes the stamp as given.
  await callOf($)({ tool: 'Grep', pattern: 'x', agentId: 'sub' })
  await $.turn.complete(subTurn('s1'))
  await $.turn.complete(turn('t1'))

  expect(kept.get('heavyTurns')).toEqual([
    { at: NOON - HOUR, tokens: 2_100_000, project: 'notes', tools: { Read: 3 } },
    { at: NOON, tokens: 11_300, project: 'shop', tools: { Bash: 2, Edit: 1 } },
  ])

  for (const surface of ['desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE })

    // A table: time, project, tools, tokens, under a row that names them.
    expect(await pane.find({ type: 'Text', text: 'Heaviest turns today' })).toBeDefined()
    expect(await follows(pane, ['time', 'project', 'tools', 'tokens'])).toBe(true)
    expect(await follows(pane, [hhmm(NOON - HOUR), 'notes', 'Read×3', '2.1M'])).toBe(true)
    expect(await follows(pane, [hhmm(NOON), 'shop', 'Bash×2 Edit', '11.3k'])).toBe(true)
    await pane.unmount()
  }

  // A narrow pane leaves the tools out.
  const narrow = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE, requestId: 'tokens', props: { ...PANE.props, bodyColumns: 28 } } as never)

  expect(await follows(narrow, ['time', 'project', 'tokens'])).toBe(true)
  expect(await follows(narrow, [hhmm(NOON), 'shop', '11.3k'])).toBe(true)

  // The next turn starts its count over.
  await callOf($)({ tool: 'Read', file_path: 'a' })
  await $.turn.complete(turn('t2'))
  expect((kept.get('heavyTurns') as { tools: unknown }[]).at(-1)?.tools).toEqual({ Read: 1 })
})
test('an MCP tool is named in a turn by its own last name', async ($, on) => {
  const { session } = world(on)

  session.usd = 1
  await $.session.start(START)
  await callOf($)({ tool: 'mcp__ccd_settings__set_setting', key: 'k', value: 'v' })
  await callOf($)({ tool: 'mcp__ccd_settings__set_setting', key: 'k', value: 'v' })
  await callOf($)({ tool: 'Bash', command: 'ls' })
  session.usd = 1.3
  await $.turn.complete(turn('t1'))

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await follows(pane, [hhmm(NOON), 'shop', 'set_setting×2 Bash', '10.3k'])).toBe(true)
})

test('with no turn today the pane leaves the heaviest turns out', async ($, on) => {
  world(on)
  await $.session.measure(reading(1))

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await pane.find({ type: 'Text', text: 'Heaviest turns today' })).toBeUndefined()
})
// A measurement with no rate-limit reading.

const unread = (usd: number) => ({ ...reading(usd), rateLimits: [], changed: ['cost' as const] })

test('a measurement with no rate-limit reading keeps the windows already held', async ($, on) => {
  world(on)
  await $.session.measure(reading(1, 42, 31, NOON + 2 * HOUR))
  await $.session.measure(unread(1.2))

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect((await desktop.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))).toContain(
    '5-hour 31% used, 60% of the window gone',
  )

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await terminal.find({ type: 'Text', text: '5H' })).toBeDefined()
})

test('a held window whose reset has passed is let go when no reading comes', async ($, on) => {
  const { clock } = world(on)

  await $.session.measure(reading(1, 42, 31, NOON + MINUTE))
  await clock.advance(2 * MINUTE)
  await $.session.measure(unread(1.2))

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect(await terminal.find({ type: 'Text', text: '5H' })).toBeUndefined()
})

// The pane in tokens; the band keeps its dollars.

test('tokens are said short: as they are under a thousand, then in k, then in M', () => {
  expect(shortTokens(950)).toBe('950')
  expect(shortTokens(2400)).toBe('2.4k')
  expect(shortTokens(412_345)).toBe('412k')
  expect(shortTokens(1_234_567)).toBe('1.2M')
  expect(shortTokens(181_000_000)).toBe('181.0M')
})

test('a subagent counts under its agent type, a run on its first turn, and the pane sets them out', async ($, on) => {
  const { seen } = world(on, NOON)
  const as = (id: string) => ({ ...subTurn(id), agentId: id })

  // The engine lists the session's agents with the type each was spawned as.
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: 'find the band', status: 'completed' },
      { id: 'a2', type: 'Explore', description: 'map the tests', status: 'completed' },
      { id: 'a3', type: 'Plan', description: 'plan the month', status: 'completed' },
    ] as never,
  }))
  await $.session.start(START)
  await $.turn.complete(as('a1'))
  await $.turn.complete(as('a1'))
  await $.turn.complete(as('a2'))
  await $.turn.complete(as('a3'))
  await $.turn.complete(turn('t1'))

  const kept = JSON.parse(seen.written[MINE] ?? '')

  expect(kept.agents).toEqual({ [TODAY]: { Explore: 3000, Plan: 1000 } })
  expect(kept.runs).toEqual({ [TODAY]: { Explore: 2, Plan: 1 } })

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await valueOf(terminal, '  Explore ×2')).toBe('3.0k')
  expect(await valueOf(terminal, '  Plan ×1')).toBe('1.0k')
  // 4.0k of the 14.3k counted this week.
  expect(await terminal.find({ type: 'Text', text: '  28% of every token counted' })).toBeDefined()

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })

  expect(await altsOf(desktop)).toContain('By subagent: Explore ×2 3.0k, Plan ×1 1.0k')
})

test('the pane counts tokens: the session, the last turn, today, the week; its only dollars are the month', async ($, on) => {
  const yesterday = dayOf(NOON - DAY)
  const { kept, seen } = world(on, NOON, { tokenDays: { [TODAY]: 1_000_000, [yesterday]: 2_000_000 } })

  await $.command.run({ ...TYPED, command: 'tokens', args: 'budget 10' })
  await $.session.start(START)
  await $.session.measure(reading(1))
  await $.turn.complete(subTurn('s1'))
  await $.turn.complete(turn('t1'))
  expect(JSON.parse(seen.written[MINE] ?? '').tokens).toEqual({ [TODAY]: 11_300 })
  expect(kept.get('tokenDays')).toEqual({ [TODAY]: 1_000_000, [yesterday]: 2_000_000 })

  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
  const texts = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)
  const alts = await altsOf(pane)

  // The counts are drawn large, the week and the cache beneath them.
  expect(alts.slice(1)).toEqual([
    'this session 11.3k, today 1.0M, last 7 days 3.0M',
    'Tokens per day, last 7 days: highest 2.0M, today 1.0M',
    '91% of input read from cache',
    'By project: shop 11.3k',
    'By model: m 11.3k',
    // A subagent the engine no longer lists is counted under the plain name.
    'By subagent: subagent ×1 1.0k',
  ])
  expect(texts.some(text => text.startsWith('last turn 10.3k'))).toBe(true)
  // The share on a line of its own, the bar beneath it as wide as the pane,
  // the figure in the colour of its level.
  expect(await follows(pane, ['read from cache', '91%'])).toBe(true)
  expect((await pane.find({ type: 'Text', text: '91%' }))?.props.color).toBe('success')
  const svgs = await pane.findAll({ type: 'Svg' })

  expect(svgs.find(({ props }) => props.alt === '91% of input read from cache')?.props.width).toBe(svgs[0]?.props.width)
  // Dollars only for the month so far: the day's budget is the band's.
  expect([...texts, ...alts].filter(text => text.includes('$'))).toEqual(['$1.00', '13 days · $0.08 a day'])
  expect([...texts, ...alts].filter(text => text.includes('budget'))).toEqual([])

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PANE })

  expect(await terminal.find({ type: 'Text', text: '▁▁▁▁▁█▅' })).toBeDefined()
  expect(await valueOf(terminal, '  this session')).toBe('11.3k')
  expect(await valueOf(terminal, '  last turn')).toBe('10.3k')
  expect(await valueOf(terminal, '  today')).toBe('1.0M')
  expect(await valueOf(terminal, '  last 7 days')).toBe('3.0M')

  // The band still says what the day cost.
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await band.findAll({ type: 'Text' })).some(({ text }) => text.endsWith(' today') && text.startsWith('$'))).toBe(true)
})
