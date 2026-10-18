import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { TYPED, callOf } from './kit'

import { jobCrabSvg, jobOf } from '../hooks/crab'
import { DONE_MS, isBusy, joined, lineUp, newTurn, phaseOf, settled, spent, toolLine, used, workedFor } from '../hooks/crew'

// The subagents of a turn, a card each, a crab dressed for its job.

const NOW = new Date(2026, 9, 16, 12, 0).getTime()
const SECOND = 1000

test('a job is read off the agent type by its words, the first that matches', () => {
  expect(jobOf('Explore')).toBe('explorer')
  expect(jobOf('Plan')).toBe('architect')
  expect(jobOf('general-purpose')).toBe('builder')
  expect(jobOf('code-reviewer')).toBe('reviewer')
  expect(jobOf('test-runner')).toBe('scientist')
  // A guide to Claude Code keeps books, though "code" is in its name.
  expect(jobOf('claude-code-guide')).toBe('librarian')
  expect(jobOf('my-agent')).toBe('other')
})

test('the crew is joined at a spawn, counts its tools and tokens, and settles by the agent list', () => {
  let crew = joined({}, 'a1', 'Explore', 'find the band', NOW)

  crew = used(crew, 'a1', 'Read', NOW + SECOND)
  crew = used(crew, 'a1', 'Read', NOW + SECOND)
  crew = used(crew, 'a1', 'mcp__figma__use_figma', NOW + SECOND)
  crew = spent(crew, 'a1', 1200, NOW + 2 * SECOND)
  // One seen first at a tool call joins there, its type read from the list later.
  crew = used(crew, 'a2', 'Grep', NOW + 3 * SECOND)
  expect(crew.a2?.type).toBe('subagent')
  expect(toolLine(crew.a1!)).toBe('Read×2 · use_figma')
  expect(isBusy(crew)).toBe(true)

  crew = settled(crew, [{ id: 'a1', status: 'completed' }, { id: 'a2', type: 'Plan', description: 'plan it', status: 'running' }], NOW + 65 * SECOND)
  expect(crew.a1).toMatchObject({ status: 'completed', endedAt: NOW + 65 * SECOND, tokens: 1200 })
  expect(crew.a2).toMatchObject({ type: 'Plan', description: 'plan it', status: 'running', endedAt: null })
  expect(workedFor(crew.a1!, NOW + 99 * SECOND)).toBe('1m05s')
  expect(lineUp(crew).map(({ id }) => id)).toEqual(['a2', 'a1'])

  // One the list lets go of while it ran has ended.
  crew = settled(crew, [], NOW + 70 * SECOND)
  expect(crew.a2).toMatchObject({ status: 'completed', endedAt: NOW + 70 * SECOND })
  expect(isBusy(crew)).toBe(false)
  expect(newTurn(crew)).toEqual({})

  // One only the list has and still running, a spawn the mod did not see,
  // joins as the list tells it; one only the list has that has ended is a
  // turn before's, which the list keeps a while, and stays out.
  const listedOnly = settled(
    {},
    [
      { id: 'b1', type: 'Plan', description: 'plan it', status: 'running' },
      { id: 'b2', type: 'Explore', description: 'old job', status: 'completed' },
    ],
    NOW,
  )

  expect(listedOnly.b1).toMatchObject({ type: 'Plan', description: 'plan it', status: 'running', endedAt: null })
  expect(listedOnly.b2).toBeUndefined()
})

test('a subagent works, stands done a while, then sleeps; one that failed sweats', () => {
  const mate = { ...joined({}, 'a1', 'Explore', '', NOW).a1!, status: 'completed', endedAt: NOW }

  expect(phaseOf({ ...mate, status: 'running', endedAt: null }, NOW)).toBe('work')
  expect(phaseOf(mate, NOW + DONE_MS - 1)).toBe('done')
  expect(phaseOf(mate, NOW + DONE_MS)).toBe('sleep')
  expect(phaseOf({ ...mate, status: 'failed' }, NOW)).toBe('fail')
  expect(phaseOf({ ...mate, status: 'killed' }, NOW)).toBe('fail')
})

test('the crab of a job wears its hat in every phase, its tool beside it at work and held up when done', () => {
  const work = jobCrabSvg('builder', 'work', 'builder')
  const done = jobCrabSvg('builder', 'done', 'builder')
  const sleep = jobCrabSvg('builder', 'sleep', 'builder')
  const hat = '#ffc107'

  for (const drawn of [work, done, sleep, jobCrabSvg('builder', 'fail', 'builder')]) {
    expect(drawn.source).toContain(hat)
    expect(drawn.source).toContain('prefers-reduced-motion')
  }

  // At work the hammer swings beside it; done, a badge pops and the hammer is held up.
  expect(work.source).toContain('.hm{')
  expect(work.width).toBe(48)
  expect(done.source).toContain('.bg{')
  expect(done.source).toContain('class="hd"')
  expect(done.height).toBeGreaterThan(sleep.height)
  expect(sleep.source).toContain('class="sn"')
  // Every job draws in every phase.
  for (const job of ['explorer', 'architect', 'builder', 'reviewer', 'scientist', 'librarian', 'other'] as const) {
    for (const phase of ['work', 'done', 'sleep', 'fail'] as const) {
      expect(jobCrabSvg(job, phase, job).source.startsWith('<svg')).toBe(true)
    }
  }
})

// In the session.

const SITE = { scroll: { offset: 0, bodyRows: 40 }, view: {} }
const PANE = (bodyColumns = 48) =>
  ({
    component: 'Pane',
    requestId: 'tokens-agents',
    props: { title: 'Token usage', isFocused: false, bodyColumns, placement: 'dock', ...SITE },
  }) as const
const world = (on: On) => {
  const listed: { id: string; type: string; description: string; status: string }[] = []
  const opened: string[] = []
  const clock = mock.clock(on, { now: NOW })
  const kept = new Map<string, unknown>()

  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' })
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  let spawned = 0
  on('agent.spawn', () => ({ model: 'm', agentId: `a${spawned++}` }))
  on('agent.list', () => ({ value: listed.map(agent => ({ ...agent })) as never }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  return { listed, opened, clock }
}
const spawn = (type: string, description: string) =>
  ({ tool_use_id: 'u', prompt: 'go', description, subagentType: type, provider: { kind: 'model' } }) as never
const turn = (agentId: string, tokens: number) =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    reason: 'answer',
    turnId: `t-${agentId}`,
    agentId,
    usage: { model: 'm', input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }) as never

test('/tokens agents opens a pane of the turn subagents, a dressed crab each, as they work, finish and sleep', { timeoutMs: 30_000 }, async ($, on) => {
  const { listed, opened, clock } = world(on)

  await $.session.start({ cwd: 'C:/work/shop', surface: 'desktop', isInteractive: true })
  listed.push({ id: 'a0', type: 'Explore', description: 'find the band', status: 'running' })
  await $.agent.spawn(spawn('Explore', 'find the band'))
  listed.push({ id: 'a1', type: 'Plan', description: 'plan the month', status: 'running' })
  await $.agent.spawn(spawn('Plan', 'plan the month'))
  await callOf($)({ tool: 'Grep', pattern: 'x', agentId: 'a0' })
  await $.turn.complete(turn('a0', 4000))
  await $.turn.complete(turn('a1', 1000))

  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'agents' })

  expect(JSON.stringify(said)).toContain('agents pane opened')
  expect(opened).toEqual(['tokens-agents'])

  const alts = async () => {
    const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE() })
    const svgs = await pane.findAll({ type: 'Svg' })

    await pane.unmount()

    return svgs.map(({ props }) => String(props.alt))
  }

  expect(await alts()).toEqual(['Explore crab, at work', '4.0k tokens', 'Plan crab, at work', '1.0k tokens'])

  // The explorer finishes: done a while, then asleep; the planner fails.
  listed[0]!.status = 'completed'
  listed[1]!.status = 'failed'
  await clock.advance(2 * SECOND)
  expect((await alts()).filter(alt => alt.includes('crab')).sort()).toEqual(['Explore crab, done', 'Plan crab, fail'])
  await clock.advance(DONE_MS)
  expect((await alts()).filter(alt => alt.includes('crab')).sort()).toEqual(['Explore crab, sleep', 'Plan crab, fail'])

  // A terminal says the same in marks, colours and bars of eighths.
  const terminal = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...PANE() })
  const words = (await terminal.findAll({ type: 'Text' })).map(({ text }) => text)

  expect(words).toContain('✕')
  expect(words).toContain('✓')
  expect(words).toContain('Explore')
  expect(words.some(text => text.includes('Grep'))).toBe(true)
  expect(await terminal.findAll({ type: 'Svg' })).toEqual([])
})

test('the agents pane says so when no subagent has run yet', async ($, on) => {
  world(on)

  const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE() })

  expect(await pane.find({ type: 'Text', text: /^No subagent has run yet in this session/ })).toBeDefined()
})

test('a subagent the mod did not see start joins from the agent list when the pane opens, and is watched while it runs', async ($, on) => {
  const { listed, clock } = world(on)

  await $.session.start({ cwd: 'C:/work/shop', surface: 'desktop', isInteractive: true })
  // Spawned before the mod loaded: no agent.spawn reached it.
  listed.push({ id: 'x1', type: 'Explore', description: 'map the hooks', status: 'running' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'agents' })

  const alts = async () => {
    const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE() })
    const seen = (await pane.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))

    await pane.unmount()

    return seen
  }

  expect(await alts()).toContain('Explore crab, at work')

  listed[0]!.status = 'completed'
  await clock.advance(2 * SECOND)
  expect(await alts()).toContain('Explore crab, done')
})

const crabsOf = async ($: Parameters<TestBody>[0]) => {
  const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE() })
  const seen = (await pane.findAll({ type: 'Svg' })).map(({ props }) => String(props.alt))

  await pane.unmount()

  return seen
}

test('a subagent of the turn before stays gone once the next turn spawns, though the agent list still holds it', async ($, on) => {
  const { listed, clock } = world(on)

  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: 'C:/work/shop', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 'main-1', text: 'go' } as never)
  listed.push({ id: 'a0', type: 'Explore', description: 'find the band', status: 'running' })
  await $.agent.spawn(spawn('Explore', 'find the band'))
  listed[0]!.status = 'completed'
  await clock.advance(2 * SECOND)

  await $.turn.start({ turnId: 'main-2', text: 'more' } as never)
  listed.push({ id: 'a1', type: 'Plan', description: 'plan the month', status: 'running' })
  await $.agent.spawn(spawn('Plan', 'plan the month'))
  await clock.advance(2 * SECOND)

  expect((await crabsOf($)).filter(alt => alt.includes('crab'))).toEqual(['Plan crab, at work'])
})

test('a subagent counts its tokens as each of its responses ends, and its turn settles the sum', async ($, on) => {
  const { listed } = world(on)
  const sizes = new Map<number, number>()

  on('turn.step', async function* (_, e) {
    const usage = { model: 'm', input_tokens: sizes.get(e.index) ?? 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const respond = async (index: number, tokens: number) => {
    sizes.set(index, tokens)

    const stream = $.turn.step({ turnId: 't-a0', index, model: 'm', messageCount: 1, agentId: 'a0' } as never)
    let read = await stream.next()

    while (read.done !== true) {
      read = await stream.next()
    }
  }

  await $.session.start({ cwd: 'C:/work/shop', surface: 'desktop', isInteractive: true })
  listed.push({ id: 'a0', type: 'Explore', description: 'find the band', status: 'running' })
  await $.agent.spawn(spawn('Explore', 'find the band'))
  await respond(0, 1000)
  await respond(1, 2000)
  expect(await crabsOf($)).toContain('3.0k tokens')

  // Its turn's own sum stands in place of what the responses counted.
  await $.turn.complete(turn('a0', 3500))
  expect(await crabsOf($)).toContain('3.5k tokens')
})

test('a card says its tokens are processed ones, and beneath them the context its last response read, as Claude Code counts it', async ($, on) => {
  const { listed } = world(on)

  on('turn.step', async function* (_, e) {
    // Each response reads the context so far again: 1k, then 2.4k of it.
    const read = e.index === 0 ? 1000 : 2400
    const usage = { model: 'm', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: read, cache_creation_input_tokens: 0 }

    yield { kind: 'stop', stopReason: 'end_turn', usage } as never

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  const respond = async (index: number) => {
    const stream = $.turn.step({ turnId: 't-a0', index, model: 'm', messageCount: 1, agentId: 'a0' } as never)
    let read = await stream.next()

    while (read.done !== true) {
      read = await stream.next()
    }
  }
  const wordsOn = async (surface: 'desktop' | 'terminal') => {
    const pane = await $.ui.mount({ plugin: 'token-usage', surface, ...PANE() })
    const words = (await pane.findAll({ type: 'Text' })).map(({ text }) => text)

    await pane.unmount()

    return words
  }

  await $.session.start({ cwd: 'C:/work/shop', surface: 'desktop', isInteractive: true })
  listed.push({ id: 'a0', type: 'Explore', description: 'find the band', status: 'running' })
  await $.agent.spawn(spawn('Explore', 'find the band'))
  await respond(0)
  await respond(1)

  const desktop = await wordsOn('desktop')

  // Under its figure, where a long tool line cannot cut them off.
  expect(desktop).toContain('1 running · 3.4k')
  expect(desktop).toContain('processed')
  expect(desktop).toContain('context 2.4k')
  expect(await wordsOn('terminal')).toContain('ctx 2.4k')
})
