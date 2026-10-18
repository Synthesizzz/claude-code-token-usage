import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { WARM_TEXT, cacheHints, cacheLine, cacheNotice, cachePhase, cacheRates, cacheWord, hasLapsedActions, judgePause, keepPauses, learnedTtl } from '../hooks/cache'
import { TYPED } from './kit'

// Warn before the prompt cache lapses: the time it lasts is learned from the
// pauses themselves, as the first response after each says what it read.

const MINUTE = 60_000
const read = (cacheRead: number, input = 2000, cacheWrite = 0) => ({ input, output: 100, cacheRead, cacheWrite })

test('a pause is kept where the next turn read most of its input from the cache, lapsed where it read little', () => {
  expect(judgePause(4 * MINUTE, 140_000, read(138_000), 10)).toEqual({ gap: 4 * MINUTE, isKept: true, at: 10 })
  expect(judgePause(7 * MINUTE, 140_000, read(1000, 2000, 139_000), 10)).toEqual({ gap: 7 * MINUTE, isKept: false, at: 10 })
  // A share between says neither.
  expect(judgePause(5 * MINUTE, 140_000, read(50_000, 2000, 90_000), 10)).toBeNull()
  // A small context says little; a context that shrank was compacted or cleared.
  expect(judgePause(5 * MINUTE, 8000, read(0, 8000), 10)).toBeNull()
  expect(judgePause(5 * MINUTE, 140_000, read(0, 30_000), 10)).toBeNull()
})

test('the cache lasts 5 minutes or an hour: the one the pauses kept and lapsed leave room for', () => {
  const pauses = [
    { gap: 2 * MINUTE, isKept: true, at: 1 },
    { gap: 4.5 * MINUTE, isKept: true, at: 2 },
    { gap: 6 * MINUTE, isKept: false, at: 3 },
    { gap: 12 * MINUTE, isKept: false, at: 4 },
    // A lapse under a kept pause was something else: a change early in the
    // conversation, not the time.
    { gap: 1 * MINUTE, isKept: false, at: 5 },
  ]

  // Kept through 4m30s, lapsed after 6m: the 5 minutes.
  expect(learnedTtl(pauses)).toEqual({ ttl: 5 * MINUTE, kept: 4.5 * MINUTE, pauses: 5 })
  // Kept through 4m30s and no lapse: it may be either, so none yet.
  expect(learnedTtl(pauses.filter(({ isKept }) => isKept))).toEqual({ ttl: null, kept: 4.5 * MINUTE, pauses: 2 })
  expect(learnedTtl([])).toEqual({ ttl: null, kept: 0, pauses: 0 })
  // This machine's: kept through 24m, lapsed after 4h31m. The hour, not 4h31m.
  const hour = [
    { gap: 24.2 * MINUTE, isKept: true, at: 1 },
    { gap: 271.4 * MINUTE, isKept: false, at: 2 },
  ]

  expect(learnedTtl(hour).ttl).toBe(60 * MINUTE)
  // Kept through 24m alone rules out the 5 minutes already.
  expect(learnedTtl(hour.slice(0, 1)).ttl).toBe(60 * MINUTE)
  // A range that holds both is the shorter: a warning early beats one late.
  expect(learnedTtl([{ gap: 3 * MINUTE, isKept: true, at: 1 }, { gap: 90 * MINUTE, isKept: false, at: 2 }]).ttl).toBe(5 * MINUTE)
  // One that holds neither keeps its own end.
  expect(learnedTtl([{ gap: 10 * MINUTE, isKept: true, at: 1 }, { gap: 20 * MINUTE, isKept: false, at: 2 }]).ttl).toBe(20 * MINUTE)
  expect(learnedTtl([{ gap: 70 * MINUTE, isKept: true, at: 1 }]).ttl).toBeNull()
})

test('fifty pauses are kept, the latest', () => {
  const many = Array.from({ length: 60 }, (_, at) => ({ gap: MINUTE, isKept: true, at }))

  expect(keepPauses(many.slice(0, 59), many[59]!).map(({ at }) => at)).toEqual(many.slice(10).map(({ at }) => at))
})

test('the band says nothing just after a turn, counts down calm, warns near the end, and says when it lapsed', () => {
  const ttl = 5 * MINUTE

  expect(cachePhase(10_000, ttl)).toBeNull()
  expect(cachePhase(60_000, null)).toBeNull()
  expect(cachePhase(60_000, ttl)).toEqual({ phase: 'calm', left: 4 * MINUTE })
  expect(cachePhase(3.5 * MINUTE, ttl)).toEqual({ phase: 'near', left: 1.5 * MINUTE })
  expect(cachePhase(6 * MINUTE, ttl)).toEqual({ phase: 'gone', left: 0 })
  // A cache of two minutes is near for its last 40%.
  expect(cachePhase(80_000, 2 * MINUTE)?.phase).toBe('near')
  expect(cachePhase(60_000, 2 * MINUTE)?.phase).toBe('calm')

  expect(cacheWord({ phase: 'calm', left: 4 * MINUTE + 50_000 }, 148_000)).toBe('cache 4m')
  expect(cacheWord({ phase: 'near', left: 90_000 }, 148_000)).toBe('cache lapses in 1m30s')
  expect(cacheWord({ phase: 'near', left: 45_000 }, 148_000)).toBe('cache lapses in 45s')
  expect(cacheWord({ phase: 'gone', left: 0 }, 148_000)).toBe('cache lapsed · next turn re-reads 148k')
  expect(cacheWord({ phase: 'gone', left: 0 }, null)).toBe('cache lapsed')
})

test('before the lapse the crab offers a way out: compact a large context, keep a small one warm', () => {
  const keys = (context: number | null) => (cacheNotice(90_000, 5 * MINUTE, context).choices ?? []).map(({ key }) => key)

  expect(keys(148_000)).toEqual(['compact', 'warm', 'lapse'])
  expect(cacheNotice(90_000, 5 * MINUTE, 148_000).text).toBe("Leaving? Compact now while it's cached: the next turn re-reads a summary, not 148k.")
  expect(keys(30_000)).toEqual(['warm', 'lapse', 'compact'])
  expect(keys(null)).toEqual(['warm', 'lapse', 'compact'])

  // Once lapsed, the band's ways out stand for a large context alone.
  expect(hasLapsedActions({ phase: 'gone' }, 140_000)).toBe(true)
  expect(hasLapsedActions({ phase: 'gone' }, 30_000)).toBe(false)
  expect(hasLapsedActions({ phase: 'near' }, 140_000)).toBe(false)
  expect(hasLapsedActions(null, 140_000)).toBe(false)

  // Each says what it costs at the API's price, in tokens at the full input
  // price: where the cache's time is not learned yet, an hour's write.
  expect(cacheHints(148_000).lapse).toBe('Nothing is sent. Your next turn writes 148k to the cache again (about 296k at full price).')
  expect(cacheHints(148_000).why).toContain('20 times a cached step')
  expect(cacheHints(null).lapse).toBe('Nothing is sent. Your next turn writes the context to the cache again.')
  expect(cacheNotice(90_000, 5 * MINUTE, 148_000).choices?.every(({ hint }) => typeof hint === 'string')).toBe(true)
})

test("a cache read is priced by the model's own rate, a write by how long the cache lasts", () => {
  // Opus 5.5 and Sonnet 5.5 read at a twentieth, by id, display name or a
  // context-window suffix alike.
  expect(cacheRates('claude-sonnet-5-5', 60 * MINUTE)).toEqual({ read: 0.05, write: 2 })
  expect(cacheRates('claude-sonnet-5-5', 5 * MINUTE)).toEqual({ read: 0.05, write: 1.25 })
  expect(cacheRates('Claude Sonnet 5.5', null)).toEqual({ read: 0.05, write: 2 })
  expect(cacheRates('claude-opus-5-5', 60 * MINUTE)).toEqual({ read: 0.05, write: 2 })
  expect(cacheRates('claude-opus-5-5[1m]', 60 * MINUTE)).toEqual({ read: 0.05, write: 2 })
  expect(cacheRates('Claude Fable 5.1', null)).toEqual({ read: 0.025, write: 2 })
  expect(cacheRates('claude-mythos-5-1', 60 * MINUTE)).toEqual({ read: 0.025, write: 2 })
  // Haiku 5.5, Fable 5 and a model not known read at the usual tenth; no
  // model yet, the usual tenth too.
  expect(cacheRates('claude-haiku-5-5', 5 * MINUTE)).toEqual({ read: 0.1, write: 1.25 })
  expect(cacheRates('claude-fable-5', 60 * MINUTE)).toEqual({ read: 0.1, write: 2 })
  expect(cacheRates('some-other-model', 60 * MINUTE)).toEqual({ read: 0.1, write: 2 })
  expect(cacheRates(null, null)).toEqual({ read: 0.1, write: 2 })

  const short = cacheHints(148_000, { rates: cacheRates('claude-haiku-5-5', 5 * MINUTE) })

  expect(short.lapse).toBe('Nothing is sent. Your next turn writes 148k to the cache again (about 185k at full price).')
  expect(short.why).toContain('12 times a cached step')
  expect(short.compact).toContain('read at a tenth of the price')

  const sonnet = cacheHints(148_000, { rates: cacheRates('claude-sonnet-5-5', 5 * MINUTE) })

  expect(sonnet.why).toContain('25 times a cached step')
  expect(sonnet.compact).toContain('read at a twentieth of the price')
  expect(sonnet.warm).toContain('(about 7.4k at full price)')
  expect(cacheHints(148_000, { rates: cacheRates('claude-opus-5-5', 60 * MINUTE) }).why).toContain('40 times a cached step')
  expect(cacheHints(148_000, { rates: cacheRates('claude-opus-5-5', 60 * MINUTE) }).compact).toContain('read at a twentieth of the price')

  const fable = cacheHints(148_000, { rates: cacheRates('claude-fable-5-1', 60 * MINUTE) })

  expect(fable.why).toContain('80 times a cached step')
  expect(fable.compact).toContain('read at a fortieth of the price')
  expect(fable.warm).toContain('(about 3.7k at full price)')
  // A resumed session's own dollars go beside a write's tokens.
  expect(cacheHints(148_000, { usd: 4.01 }).gone).toContain('(about 296k at full price, $4.01 at API price)')
})

test('the pane says what was learned, or how long the cache has lasted so far', () => {
  expect(cacheLine({ ttl: 5 * MINUTE, kept: 4.5 * MINUTE, pauses: 9 })).toBe('cache lapses after ~5m idle · learned from 9 pauses')
  expect(cacheLine({ ttl: null, kept: 12 * MINUTE, pauses: 3 })).toBe('cache kept through 12m idle so far · 3 pauses')
  expect(cacheLine({ ttl: 60 * MINUTE, kept: 24 * MINUTE, pauses: 42 })).toBe('cache lapses after ~1h idle · learned from 42 pauses')
  expect(cacheLine({ ttl: 271 * MINUTE, kept: 24 * MINUTE, pauses: 42 })).toBe('cache lapses after ~4h31m idle · learned from 42 pauses')
  expect(cacheLine({ ttl: null, kept: 0, pauses: 0 })).toBeNull()
})

// In the session.

const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, ...SITE },
} as const
const usage = (input: number, cacheRead: number, cacheWrite: number) => ({
  model: 'm',
  input_tokens: input,
  output_tokens: 100,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})
const world = (on: On, stored: Record<string, unknown> = {}) => {
  const kept = new Map(Object.entries(stored))
  const clock = mock.clock(on, { now: new Date(2026, 9, 16, 12, 0).getTime() })
  const answers = new Map<number, ReturnType<typeof usage>>()

  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })
  on('turn.step', async function* (_, e) {
    const used = answers.get(e.index) ?? usage(2000, 0, 0)

    yield { kind: 'stop', stopReason: 'end_turn', usage: used } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: used }
  })
  const step = async (turnId: string, index: number, used: ReturnType<typeof usage>) => {
    answers.set(index, used)

    const stream = $step(turnId, index)
    let next = await stream.next()

    while (next.done !== true) {
      next = await stream.next()
    }
  }
  let $step: (turnId: string, index: number) => AsyncGenerator<unknown, unknown> = () => {
    throw new Error('unset')
  }

  return {
    kept,
    clock,
    step,
    bind: (run: (turnId: string, index: number) => AsyncGenerator<unknown, unknown>) => {
      $step = run
    },
  }
}
const measure = (tokens: number) => ({
  context: { window: 200000, tokens, percent: Math.round(tokens / 2000) },
  rateLimits: [],
  changed: ['context' as const],
})
const done = (turnId: string) =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId,
    usage: { model: 'm', input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }) as const
const words = async (ui: { findAll: (query: { type: 'Text' }) => Promise<readonly { text: string; props: Record<string, unknown> }[]> }) =>
  await ui.findAll({ type: 'Text' })

test('the session learns the cache from its pauses, and the band counts down to the lapse', { timeoutMs: 20_000 }, async ($, on) => {
  const { kept, clock, step, bind } = world(on)

  bind((turnId, index) => $.turn.step({ turnId, index, model: 'm', messageCount: 3 } as never))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(140_000))
  await $.turn.complete(done('t1'))

  // A pause of 4 minutes, the cache kept; then one of 7, the cache lapsed.
  await clock.advance(4 * MINUTE)
  await step('t2', 0, usage(2000, 138_000, 0))
  await $.turn.complete(done('t2'))
  await clock.advance(7 * MINUTE)
  await step('t3', 0, usage(2000, 0, 138_000))
  await $.turn.complete(done('t3'))
  expect(kept.get('cachePauses')).toMatchObject([
    { gap: 4 * MINUTE, isKept: true },
    { gap: 7 * MINUTE, isKept: false },
  ])

  // Now idle: the band counts down from what was learned, the 5 minutes
  // that kept through 4 and lapsed after 7.
  await clock.advance(2 * MINUTE)

  const calm = await words(await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND }))
  const said = calm.find(({ text }) => text.startsWith('cache '))

  expect(said?.text).toBe('cache 3m')
  expect(said?.props.dimColor).toBe(true)

  await clock.advance(2 * MINUTE)

  const near = await words(await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND }))
  const warned = near.find(({ text }) => text.startsWith('cache '))

  expect(warned?.text).toBe('cache lapses in 1m00s')
  expect(warned?.props.color).toBe('warning')

  await clock.advance(2 * MINUTE)

  const lapsed = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND, requestId: 'b2' } as never)
  const gone = await words(lapsed)

  expect(gone.find(({ text }) => text.startsWith('cache '))?.text).toBe('cache lapsed · next turn re-reads 140k')
  // The next turn would re-read all 140k: start fresh, or compact first.
  expect(await lapsed.find({ type: 'Button', key: 'fresh' })).toBeDefined()
  expect(await lapsed.find({ type: 'Button', key: 'compact' })).toBeDefined()

  // On the desktop the pointer on each opens what it does and costs.
  const desk = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND, requestId: 'b3' } as never)

  expect((await desk.find({ type: 'Box', key: 'hint-fresh' }))?.props.display).toBe('none')
  expect((await desk.find({ type: 'Box', key: 'hint-compact' }))?.props.display).toBe('none')
  expect(await desk.find({ type: 'Text', text: 'The cache has lapsed' })).toBeDefined()
})

test('a turn that runs says nothing of the cache', async ($, on) => {
  const { clock, step, bind } = world(on, { cachePauses: [{ gap: 5 * MINUTE, isKept: false, at: 0 }, { gap: MINUTE, isKept: true, at: 0 }] })

  bind((turnId, index) => $.turn.step({ turnId, index, model: 'm', messageCount: 3 } as never))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(140_000))
  await $.turn.complete(done('t1'))
  await clock.advance(2 * MINUTE)

  const working = await words(
    await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } } as never),
  )

  expect(working.some(({ text }) => text.startsWith('cache '))).toBe(false)
  void step
})

// The crab sleeps through a pause where the context ring is.

test('two minutes after a turn the crab sleeps where the ring is, and a turn wakes it', async ($, on) => {
  const { clock } = world(on)
  const asleep = async (surface: 'terminal' | 'desktop', isWorking = false) => {
    const band = await $.ui.mount({ plugin: 'token-usage', surface, ...BAND, props: { ...BAND.props, isWorking } })
    const svgs = await band.findAll({ type: 'Svg' })
    const said = (await words(band)).map(({ text }) => text)

    await band.unmount()

    return surface === 'desktop' ? svgs.some(({ props }) => String(props.alt).includes('Crab asleep')) : said.includes('ᶻᶻ')
  }

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  await $.turn.complete(done('t1'))
  await clock.advance(MINUTE)
  expect(await asleep('desktop')).toBe(false)
  expect(await asleep('terminal')).toBe(false)
  await clock.advance(MINUTE)
  expect(await asleep('desktop')).toBe(true)
  expect(await asleep('terminal')).toBe(true)
  // A turn that runs puts it back to work; the crab switched off sleeps nowhere.
  expect(await asleep('desktop', true)).toBe(false)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
  expect(await asleep('desktop')).toBe(false)
})

test('until it sleeps the crab stands by where the ring is; a session begun or cleared starts it over', async ($, on) => {
  const { clock } = world(on)
  const figure = async (isWorking = false) => {
    const band = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND, props: { ...BAND.props, isWorking } })
    const [first] = await band.findAll({ type: 'Svg' })

    await band.unmount()

    return String(first?.props.alt)
  }

  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  // Begun, before any turn: standing by, and asleep two minutes on.
  expect(await figure()).toContain('Crab standing by')
  await clock.advance(2 * MINUTE)
  expect(await figure()).toContain('Crab asleep')
  // A turn puts it to work; once the turn ends it stands by again.
  expect(await figure(true)).toContain('working')
  await $.turn.complete(done('t1'))
  expect(await figure()).toContain('Crab standing by')
  await clock.advance(2 * MINUTE)
  expect(await figure()).toContain('Crab asleep')
  // A /clear starts it over, though no turn has ended in the new session.
  await $.session.end({ reason: 'clear', sessionId: 'mine', resume: { id: 'mine' } } as never)
  await clock.advance(2000)
  expect(await figure()).toContain('Crab standing by')
  // With no pause counted down, the band's clock moves each half minute.
  await clock.advance(2 * MINUTE + 30_000)
  expect(await figure()).toContain('Crab asleep')
  // Switched off, the ring is there throughout.
  await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
  expect(await figure()).not.toContain('Crab')
})

// Once a pause, two minutes before the lapse, the crab says so in the app.

test('two minutes before the cache lapses the crab says so once; a turn begun before it says nothing', async ($, on) => {
  const learned = [
    { gap: 4 * MINUTE, isKept: true, at: 0 },
    { gap: 7 * MINUTE, isKept: false, at: 0 },
  ]
  const { clock, step, bind } = world(on, { cachePauses: learned })
  const crabSays = async () => {
    const band = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })
    const said = (await words(band)).map(({ text }) => text)

    await band.unmount()

    return said.filter(text => text.startsWith('Cache lapses in') || text.startsWith('Leaving?'))
  }
  const submitted: string[] = []
  const forks: string[] = []

  on('prompt.submit', (_, e) => (submitted.push(e.text), { text: e.text }) as never)
  on('model.fork', (_, e) => {
    forks.push(e.prompt)

    return { value: { isAnswered: true, text: 'warm', usage: usage(10, 84_000, 200) } } as never
  })

  bind((turnId, index) => $.turn.step({ turnId, index, model: 'm', messageCount: 3 } as never))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  await $.turn.complete(done('t1'))
  // The cache lasts 5 minutes: at 3 the crab comes.
  await clock.advance(3 * MINUTE)
  expect(await crabSays()).toEqual(['Cache lapses in 2m', "Leaving? Compact now while it's cached: the next turn re-reads a summary, not 84.0k."])

  // The choices stand past a word's time, and Keep warm reads the cache quietly.
  await clock.advance(30_000)

  const offer = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })

  expect((await offer.find({ type: 'Button', key: 'choice-compact' }))?.props.variant).toBe('primary')
  // The pointer on a choice opens what it does and costs, hidden till then.
  // The test kit drops every `hover` prop, so the reveal itself is checked in
  // the app: here, that each hint is drawn hidden with its words.
  expect((await offer.find({ type: 'Box', key: 'hint-choice-warm' }))?.props.display).toBe('none')
  expect(await offer.find({ type: 'Text', text: /^Reads 84\.0k from the cache once \(about 8\.4k at full price\), without a turn: nothing shows in the conversation/ })).toBeDefined()
  expect((await offer.find({ type: 'Box', key: 'hint-cache' }))?.props.display).toBe('none')
  await offer.press({ key: 'choice-warm' })
  await offer.unmount()
  expect(forks).toEqual(['Reply with the single word: warm'])
  expect(submitted).toEqual([])

  // The next pause is cut short by a turn: nothing is said of it.
  await step('t2', 0, usage(2000, 82_000, 0))
  await $.turn.complete(done('t2'))
  await clock.advance(20 * MINUTE)
  await step('t3', 0, usage(2000, 0, 82_000))
  await $.turn.complete(done('t3'))
  await clock.advance(MINUTE)
  await step('t4', 0, usage(2000, 82_000, 0))
  await clock.advance(5 * MINUTE)
  expect(await crabSays()).toEqual([])
})

// Keep warm reads the cache with a fork: no turn, and the cache's time starts over.

type Engine = Parameters<TestBody>[0]

const warmWorld = (on: On, answers: unknown[]) => {
  const learned = [
    { gap: 4 * MINUTE, isKept: true, at: 0 },
    { gap: 7 * MINUTE, isKept: false, at: 0 },
  ]
  const made = world(on, { cachePauses: learned })
  const forks: number[] = []
  const toasts: string[] = []
  const submitted: string[] = []

  on('model.fork', () => {
    forks.push(forks.length)

    return { value: answers.shift() } as never
  })
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }) as never)
  on('prompt.submit', (_, e) => (submitted.push(e.text), { text: e.text }) as never)

  return { ...made, forks, toasts, submitted }
}
const answered = (read: number, written: number) => ({ isAnswered: true, text: 'warm', usage: usage(10, read, written) })
const startAndPause = async ($: Engine, bind: (run: (turnId: string, index: number) => AsyncGenerator<unknown, unknown>) => void) => {
  bind((turnId, index) => $.turn.step({ turnId, index, model: 'm', messageCount: 3 } as never))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  await $.turn.complete(done('t1'))
}
const pressWarm = async ($: Engine) => {
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test cache' })

  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })

  await band.press({ key: 'choice-warm' })
  await band.unmount()
}
const cacheSays = async ($: Engine) => {
  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })
  const said = (await words(band)).map(({ text }) => text).filter(text => text.startsWith('cache '))

  await band.unmount()

  return said
}

test("Keep warm reads the cache with a fork, no turn, and the cache's time starts over from it", async ($, on) => {
  const { clock, bind, forks, toasts, submitted } = warmWorld(on, [answered(84_000, 200)])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  expect(forks).toHaveLength(1)
  expect(submitted).toEqual([])
  expect(toasts).toContain('Cache kept warm: read 84.0k (about 8.4k at full price).')

  // Five and a half minutes after the turn the cache would have lapsed; from
  // the ping, it has two minutes and a half left.
  await clock.advance(2.5 * MINUTE)
  expect(await cacheSays($)).toEqual(['cache 2m'])
})

// Seen live: 30 seconds after a turn, the first fork read part of a 77k
// context and wrote 32k of its own; the next fork read all of it.
test('a first ping that reads the cache and writes a block of its own kept it warm, and says what it wrote', async ($, on) => {
  const { clock, bind, toasts } = warmWorld(on, [answered(44_400, 32_200)])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  expect(toasts.some(text => /^Cache kept warm: read 44\.4k \(about 4\.4k at full price\), wrote 32\.2k once \(about [\d.]+k\)\.$/.test(text))).toBe(true)
  expect(toasts.some(text => text.startsWith('The cache had already lapsed'))).toBe(false)
  // The cache's time starts over from the ping, as for any warm ping.
  await clock.advance(2.5 * MINUTE)
  expect((await cacheSays($))[0]).not.toMatch(/^cache lapsed/)
})

test('Keep warm with no pause to keep says so, and sends nothing', async ($, on) => {
  const { forks, toasts } = warmWorld(on, [answered(84_000, 200)])

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  await pressWarm($)
  expect(forks).toHaveLength(0)
  expect(toasts).toContain('Nothing to keep warm now: Keep warm works in a pause after a reply.')
})

test('a ping that finds the cache gone says so, and the countdown stands', async ($, on) => {
  const { clock, bind, toasts } = warmWorld(on, [answered(0, 84_000)])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  expect(toasts).toContain('The cache had already lapsed: the ping wrote 84.0k.')
  await clock.advance(2.5 * MINUTE)
  expect((await cacheSays($))[0]).toMatch(/^cache lapsed/)
})

test('a busy API is tried once more half a minute on, while the cache has the time', async ($, on) => {
  const busy = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded' }
  const { clock, bind, forks, toasts } = warmWorld(on, [busy, answered(84_000, 200)])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  expect(toasts).toContain('The API is busy: Keep warm tries again in 30 seconds.')
  expect(forks).toHaveLength(1)
  await clock.advance(30_000)
  expect(forks).toHaveLength(2)
  expect(toasts).toContain('Cache kept warm: read 84.0k (about 8.4k at full price).')
})

test('a second busy reply, or one with nothing to fork, says why and stops', async ($, on) => {
  const busy = { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit' }
  const { clock, bind, forks, toasts } = warmWorld(on, [busy, busy, { isAnswered: false, reason: 'nothing-to-fork' }])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  await clock.advance(30_000)
  expect(forks).toHaveLength(2)
  expect(toasts).toContain('Keep warm failed: the API call failed (429).')
  await pressWarm($)
  expect(toasts).toContain('Nothing to keep warm yet: this conversation has no reply.')
})

test('a ping whose pause lapses short of the learned time did not hold the cache: Keep warm sends a turn from then on', async ($, on) => {
  const { clock, bind, step, kept, toasts, submitted } = warmWorld(on, [answered(84_000, 200)])

  await startAndPause($, bind)
  await clock.advance(3 * MINUTE)
  await pressWarm($)
  // Four minutes after the ping, inside the cache's five, the next turn finds
  // it gone: the fork kept the cache a shorter time.
  await clock.advance(4 * MINUTE)
  await step('t2', 0, usage(2000, 0, 84_000))
  await $.turn.complete(done('t2'))
  expect(toasts.some(text => text.startsWith("Keep warm's quiet ping did not hold the cache"))).toBe(true)
  expect(kept.get('forkShort')).toBe(true)
  // Nor is that pause learned from: the cache still lasts five minutes.
  expect((kept.get('cachePauses') as unknown[]).length).toBe(2)

  await clock.advance(3 * MINUTE)
  await pressWarm($)
  expect(submitted).toEqual([WARM_TEXT])
})

// A resumed session's cache: counted from its last reply, before any turn.

const HOUR_LEARNED = [
  { gap: 24 * MINUTE, isKept: true, at: 0 },
  { gap: 271 * MINUTE, isKept: false, at: 0 },
]
const resumed = async ($: Engine, on: On, fields: Record<string, unknown>) => {
  on('classic.SessionStart', () => ({}) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(84_000))
  await $.classic.SessionStart({ source: 'resume', ...fields } as never)

  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })
  const said = (await words(band)).map(({ text }) => text)
  const fresh = await band.find({ type: 'Button', key: 'fresh' })

  await band.unmount()

  return { said, hasFresh: fresh !== undefined }
}

test("a session resumed two hours on says its cache has lapsed, with what re-writing it costs, before any turn", async ($, on) => {
  world(on, { cachePauses: HOUR_LEARNED })

  const { said, hasFresh } = await resumed($, on, {
    seconds_since_last_response: 7200,
    context_tokens: 148_000,
    prompt_cache_likely_expired: true,
    estimated_cache_write_usd: 4.01,
  })

  expect(said).toContain('cache lapsed · next turn re-reads 148k')
  expect(hasFresh).toBe(true)
  expect(said.some(text => text.includes('(about 296k at full price, $4.01 at API price)'))).toBe(true)
})

test('a session resumed ten minutes on counts the hour down from its last reply', async ($, on) => {
  world(on, { cachePauses: HOUR_LEARNED })

  const { said, hasFresh } = await resumed($, on, { seconds_since_last_response: 600, context_tokens: 148_000 })

  expect(said).toContain('cache 50m')
  expect(hasFresh).toBe(false)
})

test("with the cache's time not learned yet, the engine's word that it lapsed stands; a small context gets no ways out", async ($, on) => {
  world(on)

  const { said, hasFresh } = await resumed($, on, {
    seconds_since_last_response: 7200,
    context_tokens: 30_000,
    prompt_cache_likely_expired: true,
  })

  expect(said).toContain('cache lapsed · next turn re-reads 30.0k')
  expect(hasFresh).toBe(false)
})

test('a fresh start seeds nothing', async ($, on) => {
  world(on, { cachePauses: HOUR_LEARNED })

  const { said } = await resumed($, on, { source: 'startup' })

  expect(said.some(text => text.startsWith('cache '))).toBe(false)
})

// The cache's notices on demand, to see their buttons and hints at once.

// A terminal has no pointer: the hints are written under the buttons. A
// terminal too narrow for the crab still has the warning and its buttons.
const terminalBand = (bodyColumns: number, maxRows: number, requestId: string) =>
  ({ plugin: 'token-usage', surface: 'terminal', ...BAND, requestId, props: { ...BAND.props, bodyColumns, maxRows } }) as never

test('a terminal writes what each cache choice does under its buttons, where it has the rows', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(140_000))
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test cache' })

  const tall = await $.ui.mount(terminalBand(120, 10, 't1'))
  const hints = (await words(tall)).map(({ text }) => text).filter(text => /^\d (Compact now|Keep warm|Let it lapse): /.test(text))

  expect(hints).toHaveLength(3)
  expect(hints[0]?.startsWith('1 Compact now: ')).toBe(true)
  expect(hints.some(text => text.startsWith('2 Keep warm: Reads '))).toBe(true)
  await tall.unmount()

  // A short band keeps its rows for the buttons.
  const short = await $.ui.mount(terminalBand(120, 6, 't2'))

  expect((await words(short)).some(({ text }) => text.startsWith('2 Keep warm: '))).toBe(false)
  expect(await short.find({ type: 'Button', key: 'choice-warm' })).toBeDefined()
})

test('a terminal too narrow for the crab still brings the cache warning and its buttons', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(140_000))
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test cache' })

  const narrow = await $.ui.mount(terminalBand(36, 40, 't3'))
  const said = (await words(narrow)).map(({ text }) => text)

  expect(said).toContain('Cache lapses in 2m')
  expect(said.some(text => text.includes('▀') || text.includes('▄'))).toBe(false)

  for (const key of ['choice-compact', 'choice-warm', 'choice-lapse', 'crab-ok']) {
    expect(await narrow.find({ type: 'Button', key })).toBeDefined()
  }

  // Wrapped that narrow, the hints would push the figures out of view.
  expect(said.some(text => text.startsWith('1 Keep warm: '))).toBe(false)
  expect(said.some(text => text.startsWith('CTX'))).toBe(true)
})

test('alerts test cache brings the warning now, and alerts test lapsed shows the lapsed band for a minute', async ($, on) => {
  const { clock } = world(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(140_000))

  const warned = await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test cache' })

  expect(warned.text).toBe('Test cache warning raised: its buttons stand for two minutes, and a press does what it says.')

  const crab = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })

  expect(await crab.find({ type: 'Text', text: 'Cache lapses in 2m' })).toBeDefined()
  expect((await crab.find({ type: 'Button', key: 'choice-compact' }))?.props.variant).toBe('primary')
  expect((await crab.find({ type: 'Box', key: 'hint-choice-warm' }))?.props.display).toBe('none')
  await crab.unmount()

  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test lapsed' })

  const lapsed = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND, requestId: 'b4' } as never)

  expect((await words(lapsed)).find(({ text }) => text.startsWith('cache '))?.text).toBe('cache lapsed · next turn re-reads 140k')
  expect(await lapsed.find({ type: 'Button', key: 'fresh' })).toBeDefined()
  expect((await lapsed.find({ type: 'Box', key: 'hint-fresh' }))?.props.display).toBe('none')
  await lapsed.unmount()

  // A minute on, the band is as it was.
  await clock.advance(61_000)

  const after = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND, requestId: 'b5' } as never)

  expect(await after.find({ type: 'Button', key: 'fresh' })).toBeUndefined()
})
