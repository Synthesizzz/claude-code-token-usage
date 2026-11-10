import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { TYPED } from './kit'

// The fleet on the disk: each session's own file through its life, every
// session's read back, the summary, and what /tokens fleet says.

const MINUTE = 60_000
const NOW = new Date(2026, 10, 10, 21, 0).getTime()
const MODEL = 'claude-opus-5-5'
const HOME = 'C:/Users/me'
const DIR = `${HOME}/.claude/token-usage/fleet`
const SUMMARY = `${HOME}/.claude/token-usage/fleet.json`
const usage = { model: MODEL, input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const sized = (tokens: number) => ({
  context: { window: 1_000_000, tokens, percent: tokens / 10_000 },
  rateLimits: [],
  changed: ['context' as const],
})
const done = (turnId: string, agentId?: string) =>
  ({ answer: '', durationMs: 1, isAborted: false, reason: 'answer', turnId, usage, ...(agentId === undefined ? {} : { agentId }) }) as const

type Files = Record<string, { text: string; mtimeMs: number }>

const world = (on: On, files: Files, session: { id: string; refuse?: boolean; host?: string }) => {
  const clock = mock.clock(on, { now: NOW })
  const slashed = (path: string) => path.replaceAll(String.fromCharCode(92), '/')

  mock.store(on)
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:/Users/me', ...(session.host === undefined ? {} : { CLAUDE_CODE_HOST_SESSION_ID: session.host }) })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: session.id }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.compact', () => ({ messages: [{ role: 'user', text: 'The summary.', toolUses: [] }], tokensAfter: 24_000 }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.write', (_, e) => {
    if (session.refuse === true && slashed(e.path).includes('/fleet')) {
      throw new Error('EACCES')
    }

    files[slashed(e.path)] = { text: e.text, mtimeMs: clock.now() }

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
    const names = Object.keys(files).filter(path => path.startsWith(folder) && !path.slice(folder.length).includes('/'))

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
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return { clock }
}
const own = (files: Files, id: string) => JSON.parse(files[`${DIR}/${id}.json`]?.text ?? 'null')
const other = (id: string, more: Record<string, unknown>) => ({
  text: JSON.stringify({
    id,
    cwd: 'D:/work/app',
    label: `app · ${id}`,
    at: NOW - MINUTE,
    startedAt: null,
    tokens: 200_000,
    model: MODEL,
    ttl: 60 * MINUTE,
    isWorking: false,
    ended: null,
    ...more,
  }),
  mtimeMs: NOW - MINUTE,
})

test("a session's file follows it: open, working, its first prompt's name, the reply, a compaction, its end", async ($, on) => {
  const files: Files = {}
  const { clock } = world(on, files, { id: 'mine' })

  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  expect(own(files, 'mine')).toMatchObject({ id: 'mine', cwd: 'D:/work/hub', label: '', at: NOW, isWorking: false, ended: null, hostId: null })

  await $.turn.start({ turnId: 'main-1', text: '[rollover จาก local_x] Continue the fleet' } as never)
  expect(own(files, 'mine')).toMatchObject({ isWorking: true, startedAt: NOW, label: 'hub · Continue the fleet' })

  // A subagent's turn neither names the session nor ends its work.
  await $.turn.start({ turnId: 'sub-1', text: 'Read the files', agentId: 'a1' } as never)
  await $.turn.complete(done('sub-1', 'a1'))
  expect(own(files, 'mine')).toMatchObject({ isWorking: true, label: 'hub · Continue the fleet' })

  await $.session.measure(sized(250_000))
  await clock.advance(MINUTE)
  await $.turn.complete(done('main-1'))
  expect(own(files, 'mine')).toMatchObject({ isWorking: false, startedAt: null, at: NOW + MINUTE, tokens: 250_000 })

  // The second prompt keeps the first one's name.
  await $.turn.start({ turnId: 'main-2', text: 'Something else' } as never)
  expect(own(files, 'mine').label).toBe('hub · Continue the fleet')
  await $.turn.complete(done('main-2'))

  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'A long talk.', toolUses: [] }] })
  expect(own(files, 'mine').tokens).toBe(24_000)

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'mine' } as never)
  expect(own(files, 'mine').ended).toBe(clock.now())
  expect(JSON.parse(files[SUMMARY]?.text ?? '{}').sessions).toEqual([])
})

test('a /clear ends the old id and the new one joins; a file left ended is opened again', async ($, on) => {
  const files: Files = { [`${DIR}/next.json`]: other('next', { ended: NOW - 60 * MINUTE }) }
  const session = { id: 'mine' }
  const { clock } = world(on, files, session)

  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  await $.session.end({ reason: 'clear', sessionId: 'mine', resume: { id: 'next' } } as never)
  session.id = 'next'
  await clock.advance(2000)

  expect(own(files, 'mine').ended).toBe(NOW)
  expect(own(files, 'next').ended).toBe(null)

  const said = (await $.command.run({ ...TYPED, command: 'tokens', args: 'fleet' })).text ?? ''

  expect(said).toBe('Fleet: only this session is open.')
})

test('every open session is read back into the summary and /tokens fleet; an ended or half-written file is not', async ($, on) => {
  const files: Files = {
    [`${DIR}/warm1.json`]: other('warm1', { at: NOW - 10 * MINUTE, label: 'app · warm one' }),
    [`${DIR}/gone1.json`]: other('gone1', { at: NOW - 3 * 60 * MINUTE, label: 'app · gone one', tokens: 300_000 }),
    [`${DIR}/ended1.json`]: other('ended1', { ended: NOW - MINUTE }),
    [`${DIR}/half.json`]: { text: '{"id":"half","at":', mtimeMs: NOW },
  }

  world(on, files, { id: 'mine', host: 'local_mine' })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  expect(own(files, 'mine').hostId).toBe('local_mine')
  await $.turn.start({ turnId: 'main-1', text: 'Fleet check' } as never)
  await $.session.measure(sized(120_000))
  await $.turn.complete(done('main-1'))

  const summary = JSON.parse(files[SUMMARY]?.text ?? '{}')

  expect(summary.writtenAt).toBe(NOW)
  expect(summary.sessions.map((row: { id: string }) => row.id).sort()).toEqual(['gone1', 'mine', 'warm1'])
  expect(summary.sessions.find((row: { id: string }) => row.id === 'gone1')).toMatchObject({ phase: 'gone', wakeTokens: 600_000, ttl: 60 * MINUTE })
  // The app's own id rides along, so a program that knows a session by it finds the row; a file from before has none.
  expect(summary.sessions.find((row: { id: string }) => row.id === 'mine')).toMatchObject({ hostId: 'local_mine' })
  expect(summary.sessions.find((row: { id: string }) => row.id === 'warm1')).toMatchObject({ hostId: null })

  const said = (await $.command.run({ ...TYPED, command: 'tokens', args: 'fleet' })).text ?? ''

  expect(said).toContain('Fleet: 3 open sessions.')
  expect(said).toContain('- ● hub · Fleet check (this) · cache 1h · context 120k')
  expect(said).toContain('- ● app · warm one · cache 50m · context 200k · wake ~10.0k')
  expect(said).toContain('- ○ app · gone one · lapsed 2h ago · context 300k · wake ~600k')
  expect(said).not.toContain('ended1')
  expect(said.includes(String.fromCharCode(92))).toBe(false)
})

test('a disk that refuses the fleet leaves every hook working', async ($, on) => {
  const files: Files = {}

  world(on, files, { id: 'mine', refuse: true })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 'main-1', text: 'go' } as never)
  await $.turn.complete(done('main-1'))
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'mine' } as never)

  expect(Object.keys(files).filter(path => path.includes('/fleet'))).toEqual([])
  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'fleet' })).text).toBe('Fleet: only this session is open.')
})

test('`fleet off` and `hide fleet` hide the dots, and a preset keeps them hidden', async ($, on) => {
  world(on, {}, { id: 'mine' })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })

  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'fleet off' })).text).toContain('fleet')
  await $.command.run({ ...TYPED, command: 'tokens', args: 'neon' })

  const listed = (await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })).text ?? ''

  expect(listed).toContain('fleet')
})

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const bandAt = (bodyColumns: number, maxRows = 10) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, ...SITE },
  }) as const
const others = (count: number): Files =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${DIR}/s${index}.json`,
      other(`s${index}`, { at: NOW - (index === 0 ? 59 : index === 1 ? 3 * 60 : 10) * MINUTE, label: `app · s${index}` }),
    ]),
  )
const dotTexts = async (ui: { findAll: (query: { type: 'Text' }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Text' })).filter(({ text }) => ['●', '◉', '○'].includes(text))

test('alone, the band draws no dots; with others, a dot each in its phase, and a hint each on the desktop', async ($, on) => {
  const alone: Files = {}

  world(on, alone, { id: 'mine' })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  await $.session.measure(sized(120_000))

  const solo = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...bandAt(160) })

  expect(await dotTexts(solo)).toEqual([])
  await solo.unmount()

  Object.assign(alone, others(2))
  await $.turn.start({ turnId: 'main-1', text: 'Fleet' } as never)
  await $.turn.complete(done('main-1'))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...bandAt(160) })
  const drawn = await dotTexts(ui)

  // Near first, then the warm (this one), then the lapsed.
  expect(drawn.map(({ text }) => text)).toEqual(['●', '●', '○'])
  expect(drawn[0]?.props.color).toBe('warning')
  expect(drawn[1]?.props.color).toBe('success')
  expect(drawn[2]?.props.dimColor).toBe(true)
  expect((await ui.find({ type: 'Box', key: 'hint-fleet-0' }))?.props.display).toBe('none')
  expect((await ui.findAll({ type: 'Text' })).some(({ text }) => text === 'app · s0')).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).some(({ text }) => text.startsWith('lapses in 1m · context 200k · wake ~10.0k'))).toBe(true)
  expect(await ui.find({ type: 'Box', key: 'hint-fleet-3' })).toBe(undefined)
})

test('eight sessions draw six dots and say the rest; hidden, none', async ($, on) => {
  world(on, others(7), { id: 'mine' })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })
  await $.session.measure(sized(120_000))
  await $.turn.start({ turnId: 'main-1', text: 'Fleet' } as never)
  await $.turn.complete(done('main-1'))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...bandAt(160) })

  expect((await dotTexts(ui)).length).toBe(6)
  expect((await ui.findAll({ type: 'Text' })).some(({ text }) => text === '+2')).toBe(true)
  await ui.unmount()

  await $.command.run({ ...TYPED, command: 'tokens', args: 'hide fleet' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'neon' })

  const hidden = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...bandAt(160) })

  expect(await dotTexts(hidden)).toEqual([])
})

test('a terminal band draws the dots where they fit, and gives them up first where it is narrow', async ($, on) => {
  world(on, others(2), { id: 'mine' })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'terminal', isInteractive: true })
  await $.session.measure(sized(120_000))
  await $.turn.start({ turnId: 'main-1', text: 'Fleet' } as never)
  await $.turn.complete(done('main-1'))

  const wide = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt(120, 1) })

  expect((await dotTexts(wide)).length).toBe(3)
  await wide.unmount()

  const narrow = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt(16, 1) })

  expect(await dotTexts(narrow)).toEqual([])
  // What the terminal draws past its row is the size alone: the context still shows.
  expect((await narrow.findAll({ type: 'Text' })).some(({ text }) => text.includes('120k'))).toBe(true)
})

test('tidy deletes fleet files quiet for over a week, and leaves the shares and the recent ones', async ($, on) => {
  const DAY = 24 * 60 * MINUTE
  const files: Files = {
    [`${DIR}/old1.json`]: { ...other('old1', { ended: NOW - 9 * DAY }), mtimeMs: NOW - 9 * DAY },
    [`${DIR}/recent.json`]: { ...other('recent', {}), mtimeMs: NOW - DAY },
    [`${HOME}/.claude/token-usage/sessions/share.json`]: { text: '{}', mtimeMs: NOW - 9 * DAY },
  }
  const ran: string[][] = []

  world(on, files, { id: 'mine' })
  on('process.run', (_, e) => {
    ran.push([...e.argv])

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: 'D:/work/hub', surface: 'desktop', isInteractive: true })

  const said = (await $.command.run({ ...TYPED, command: 'tokens', args: 'tidy' })).text ?? ''

  expect(said).toContain('1 fleet file quiet for over 7 days')
  expect(said).not.toContain('session file')

  const done = (await $.command.run({ ...TYPED, command: 'tokens', args: 'tidy now' })).text ?? ''

  expect(ran).toHaveLength(1)
  expect(ran[0]?.[3]).toContain('/.claude/token-usage/fleet/old1.json')
  expect(ran[0]?.[3]).not.toContain('recent.json')
  expect(ran[0]?.[3]).not.toContain('share.json')
  expect(done).toContain('Deleted 1 old session file')
})
