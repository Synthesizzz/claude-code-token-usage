import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { loudest } from '../hooks/alerts'
import { CRAB_ROWS, STAGE_PX, crabSvg, daysOf, moodOf, stageSvg, toneOf, SHARP_CRAB_ROWS, crabCells } from '../hooks/crab'
import { widthOf } from '../hooks/fit'
import type { Fitted, Wish } from '../hooks/fit'
import { apply, defaults } from '../hooks/style'
import type { Notice } from '../types'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const band = (isWorking = false, maxRows = 10) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows, bodyColumns: 120, ...SITE },
  }) as const
const reading = (fiveHour: number) => ({
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: fiveHour,
      resetsAt: new Date(NOW + 2 * HOUR + 14 * MINUTE).toISOString(),
    },
    { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(NOW + 60 * HOUR).toISOString() },
  ],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})
// The engine beneath the mod: a clock the test moves, a store in memory,
// toasts kept to be counted, and an empty band.
const world = (
  on: On,
  toasts: string[] = [],
  env: Readonly<Record<string, string>> = { OS: 'Windows_NT' },
  // Counts the programs the mod starts.
  seen: { runs: number } = { runs: 0 },
) => {
  const kept = new Map<string, unknown>()
  const clock = mock.clock(on, { now: NOW })

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
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  mock.env(on, env)
  on('process.run', () => {
    seen.runs += 1

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return clock
}
const notice = (kind: Notice['kind']): Notice => ({
  kind,
  title: kind,
  text: '',
  line: kind,
  bar: { name: '', value: 0, label: '', status: '' },
})

test('every pose is a 16 by 12 drawing of blocks that moves, and holds still on request', () => {
  for (const mood of ['half', 'near', 'jail', 'pace', 'context', 'ask', 'sleep'] as const) {
    const drawn = crabSvg(mood, 'Crab: news')

    expect(drawn.source).toContain('viewBox="0 0 16 12"')
    expect(drawn.source).toContain('shape-rendering="crispEdges"')
    expect(drawn.source).toContain('#d97757')
    expect(drawn.source).toContain('@keyframes')
    expect(drawn.source).toContain('prefers-reduced-motion')
    expect(drawn.alt).toBe('Crab: news')
  }
})

test('each kind of notice has its pose: a limit reached puts the crab in jail', () => {
  expect(
    (['half', 'near', 'full', 'pace', 'back', 'context'] as const).map(moodOf),
  ).toEqual(['half', 'near', 'jail', 'pace', 'back', 'context'])
})

test('in jail the crab stands upright behind five bars and two rails', () => {
  const jailed = crabSvg('jail', 'Crab: limit').source

  expect(jailed.split('fill="#9aa0aa"')).toHaveLength(8)
  expect(jailed).not.toContain('rotate(180')
  // A bar stands between the eyes, not over one.
  expect(jailed).toContain('x="7.5" y="0.5" width="1"')
})

test('at work the crab sits at a laptop: a wider drawing, three lines of code typing out', () => {
  const working = crabSvg('work', 'context 42%, working', {
    success: '#00aa00',
    warning: '#aaaa00',
    error: '#aa0000',
  })

  expect(working.source).toContain('viewBox="0 0 27.5 12"')
  expect(working.source).toContain('width="55" height="24"')
  expect(working.source).toContain('class="c1"')
  expect(working.source).toContain('class="c2"')
  expect(working.source).toContain('class="c3"')
  expect(working.source).toContain('#00aa00')
  expect(working.source).toContain('#aaaa00')
  expect(working.source).toContain('infinite')
  expect(working.alt).toBe('context 42%, working')
})

test('a window back from its limit drinks a potion and is washed clean', () => {
  const healed = crabSvg('back', 'Crab: reset', {
    success: '#00aa00',
    warning: '#aaaa00',
    error: '#aa0000',
  }).source

  // Two blocks of room above the crab, for what rises off it.
  expect(healed).toContain('viewBox="0 -2 16 14"')
  expect(healed).toContain('width="48" height="42"')
  // The bottle in the level's red, tipped to the mouth now and then.
  expect(healed).toContain('class="pt"')
  expect(healed).toContain('#aa0000')
  // Three plus signs in the calm colour rise off it; a wash of the same
  // colour passes over the body, and is not there at rest.
  expect(healed.split('class="pl').length - 1).toBe(3)
  expect(healed).toContain('#00aa00')
  expect(healed).toContain('class="gl" x="4" y="3" width="8" height="6" fill="#00aa00" opacity="0"')
  expect(crabSvg('near', 'Crab: near').source).toContain('#3f9be0')
})

test('news that calls the person back has a pose with a thing in it that says so', () => {
  const done = crabSvg('done', 'Crab: done').source
  const ask = crabSvg('ask', 'Crab: ask').source
  const allow = crabSvg('allow', 'Crab: allow').source
  const sleep = crabSvg('sleep', 'Crab: sleep').source

  // Done: a green board on a post beside the crab, a white tick of four blocks.
  expect(done).toContain('viewBox="0 0 23 12"')
  expect(done).toContain('width="69" height="36"')
  expect(done).toContain('class="bd"')
  expect(done.split('fill="#ffffff"').length - 1).toBe(4)
  // A question: a question mark in the warning colour, bobbing.
  expect(ask).toContain('class="qm"')
  expect(ask.split('fill="#b07f00"').length - 1).toBe(4)
  // Leave to go on: a barrier of five stripes on a post, shut.
  expect(allow).toContain('viewBox="0 0 23 12"')
  expect(allow).toContain('class="gt"')
  expect(allow.split('fill="#e04f63"').length - 1).toBe(3)
  // Waiting long: eyes shut, arms drawn in, two z's rising.
  expect(sleep).toContain('<rect x="5" y="6" width="2" height="1" fill="#1f1e1d"/>')
  expect(sleep.split('class="sn').length - 1).toBe(2)
})

test('on the stage the crab stands on the usage bar, where the usage is', () => {
  const near = stageSvg('near', 86, 'Crab: near', undefined, 'still')

  expect(STAGE_PX).toEqual({ width: 208, height: 54 })
  expect(near.source).toContain('width="208" height="54" viewBox="0 0 208 54"')
  // The bar is 192 long from 8: 86% of it is lit, in the colour of its level.
  expect(near.source).toContain('<rect x="8" y="40" width="165.1" height="6" rx="3" fill="#e04f63"/>')
  // The crab's middle is over the end of what is lit, its feet on the bar.
  expect(near.source).toContain('<g transform="translate(149.1 7) scale(3)" shape-rendering="crispEdges">')
  expect(near.source).toContain('class="dp"')
  expect(near.alt).toBe('Crab: near')
  // It never stands off the stage at either end, and nothing is lit at zero.
  expect(stageSvg('back', 2, 'x', undefined, 'still').source).toContain('translate(0 7) scale(3)')
  expect(stageSvg('jail', 140, 'x', undefined, 'still').source).toContain('translate(160 7) scale(3)')
  expect(stageSvg('back', 0, 'x', undefined, 'still').source).not.toContain('y="40" width="0')
})

test('the crab peeks up out of the ground, looks about, pops up and sways; it walks off to the right', () => {
  const coming = stageSvg('near', 86, 'x', undefined, 'in').source
  const going = stageSvg('near', 86, 'x', undefined, 'out').source
  const standing = stageSvg('near', 86, 'x', undefined, 'still').source

  // Below the ground (its own 36 down) and out of sight under it, then half
  // up, looking left and right, then up with a squash.
  expect(coming).toContain('@keyframes zw{0%{transform:translateY(36px)}35%{transform:translateY(18px)}')
  expect(coming).toContain('rotate(-6deg)')
  expect(coming).toContain('<clipPath id="zc"><rect x="0" y="0" width="208" height="43"/></clipPath>')
  expect(coming).toContain('<g clip-path="url(#zc)"><g class="zw">')
  // Once up, it sways on its feet until it leaves.
  expect(coming).toContain('.zh{transform-box:fill-box;transform-origin:50% 100%;animation:zh 1s ease-in-out 1.6s infinite}')
  expect(coming).toContain('@keyframes zh{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}')
  // No more walking on from the left.
  expect(coming).not.toContain('@keyframes zw{from{transform:translateX')
  expect(coming).not.toContain('@keyframes zo')
  // Off the right edge: the stage's 208 less its place, and a little.
  expect(going).toContain('@keyframes zo{to{transform:translateX(62.9px)}}')
  expect(going).not.toContain('@keyframes zw')
  expect(going).not.toContain('clip-path')
  expect(standing).not.toContain('@keyframes zw')
  expect(standing).not.toContain('@keyframes zo')
  expect(coming).toContain('prefers-reduced-motion')
})

test('the terminal crab is three rows of blocks, each as wide as the others', () => {
  expect(CRAB_ROWS).toHaveLength(3)
  expect(new Set(CRAB_ROWS.map(row => [...row].length)).size).toBe(1)
})

test('of several notices at once the crab speaks the gravest', () => {
  expect(loudest([notice('half'), notice('context'), notice('near')])?.kind).toBe('near')
  expect(loudest([notice('back'), notice('pace')])?.kind).toBe('pace')
  expect(loudest([notice('near'), notice('full')])?.kind).toBe('full')
  expect(loudest([])).toBeNull()
})

test('a wider figure for the context costs the row its width', () => {
  const wish: Wish = {
    layout: 'rings',
    context: { used: '42%', word: 'context' },
    windows: [{ name: '5-hour', brief: '5h', used: '31%', clock: '2h14m' }],
    usedWord: 'used',
    leftWord: 'left',
    eta: null,
    cost: null,
    action: null,
  }
  const full: Fitted = {
    layout: 'rings',
    hasContextWord: true,
    hasWords: true,
    hasClock: true,
    windows: 1,
    hasEta: true,
    hasCost: true,
  }
  const atWork = { ...wish, context: { used: '42%', word: 'context', figure: 55 } }

  // 33 pixels more, at 9.3 pixels a cell.
  expect((widthOf(atWork, full) - widthOf(wish, full)).toFixed(3)).toBe((33 / 9.3).toFixed(3))
})

test('crab is a part to switch off and on, and a preset leaves it as it was', () => {
  const off = apply(defaults({}), 'crab off')

  if (!('style' in off)) {
    throw new Error('crab off changed no style')
  }

  expect(off.text).toBe('crab: off.')
  expect(off.style.hidden).toEqual(['crab'])

  const looked = apply(off.style, 'timeline')

  expect('style' in looked && looked.style.hidden.includes('crab')).toBe(true)
  expect(apply(off.style, 'crab on')).toMatchObject({ style: { hidden: [] } })
})

test('a notice brings the crab walking on above the band, with its words and an OK', async ($, on) => {
  const clock = world(on)

  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const first = async () => (await ui.findAll({ type: 'Svg' }))[0]
  const [stage, context] = await ui.findAll({ type: 'Svg' })

  expect(stage?.props.alt).toBe('Crab: 5-hour window at 86%')
  expect([stage?.props.width, stage?.props.height]).toEqual([208, 54])
  expect(String(stage?.props.source)).toContain('class="dp"')
  expect(String(stage?.props.source)).toContain('@keyframes zw')
  expect(String(stage?.props.source)).toContain('translate(149.1 7)')
  expect(context?.props.alt).toBe('context 42%')
  expect((await ui.find({ type: 'Text', text: '5-hour window at 86%' }))?.props.weight).toBe('semibold')
  expect(await ui.find({ type: 'Text', text: 'Resets in 2h14m.' })).toBeDefined()

  // Sent away, its words and buttons go at once, so the press shows and
  // cannot be pressed again; the crab walks off before the row goes.
  await ui.press({ key: 'crab-ok' })
  expect(String((await first())?.props.source)).toContain('@keyframes zo')
  expect(await ui.find({ type: 'Text', text: '5-hour window at 86%' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'crab-ok' })).toBeUndefined()

  await clock.advance(600)
  expect((await first())?.props.alt).toBe('context 42%, Crab standing by')
  expect(await ui.find({ type: 'Text', text: '5-hour window at 86%' })).toBeUndefined()
})

test('the crab leaves by itself after eight seconds, walking off', async ($, on) => {
  const clock = world(on)

  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const first = async () => (await ui.findAll({ type: 'Svg' }))[0]

  await clock.advance(7000)
  expect(String((await first())?.props.source)).toContain('@keyframes zw')

  await clock.advance(1000)
  expect((await first())?.props.alt).toBe('Crab: 5-hour window at 86%')
  expect(String((await first())?.props.source)).toContain('@keyframes zo')

  await clock.advance(600)
  expect((await first())?.props.alt).toBe('context 42%, Crab standing by')
})

test('a desktop session hands the notice for outside the app to the notification hooks', async ($, on) => {
  const notified: string[] = []
  const seen = { runs: 0 }

  world(on, [], { OS: 'Windows_NT' }, seen)
  on('ui.notify', (_, e) => {
    notified.push(`${e.title}: ${e.text}`)

    return { value: { isSent: false, reason: 'no-surface' } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  // A function hook cannot start PowerShell there: the mod's command hook does.
  expect(notified).toEqual(['5-hour window at 86%: Resets in 2h14m.'])
  expect(seen.runs).toBe(0)
  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })).text).toContain(
    'Last notification outside the app: handed to the notification hooks.',
  )
})

test('the script that notifies outside the app is told when the crab is switched off', async ($, on) => {
  const written: Record<string, string> = {}

  world(on, [], { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' })
  on('fs.write', (_, e) => {
    // The engine hands the path over in the machine's own separators.
    written[e.path.replaceAll('\\', '/')] = e.text

    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const path = 'C:/Users/me/.claude/token-usage/notify.json'

  expect(Object.keys(written)).toEqual([path])
  expect(JSON.parse(written[path] ?? '')).toMatchObject({ isOn: true })

  await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
  expect(JSON.parse(written[path] ?? '')).toMatchObject({ isOn: false })

  await $.command.run({ ...TYPED, command: 'tokens', args: 'crab on' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts off' })
  expect(JSON.parse(written[path] ?? '')).toMatchObject({ isOn: false })
})

test('a limit reached shows the crab in jail', async ($, on) => {
  world(on)
  await $.session.measure(reading(90))
  await $.session.measure(reading(100))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const [crab] = await ui.findAll({ type: 'Svg' })

  expect(crab?.props.alt).toBe('Crab: 5-hour limit reached')
  expect(String(crab?.props.source).split('fill="#9aa0aa"')).toHaveLength(8)
})

test('with the crab switched off a notice is a toast alone', async ($, on) => {
  const toasts: string[] = []

  world(on, toasts)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'crab off' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(true) })
  const [context] = await ui.findAll({ type: 'Svg' })

  expect(toasts).toEqual(['5-hour window at 86%, resets in 2h14m'])
  expect(context?.props.alt).toBe('context 42%')
  expect(String(context?.props.source)).not.toContain('class="c1"')
})

test('a desktop session lets the crab speak in place of the toast; a terminal keeps both', async ($, on) => {
  const toasts: string[] = []

  world(on, toasts)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))
  expect(toasts).toEqual([])

  // A session's first reading is where the person came in, so it says nothing.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(reading(86))
  await $.session.measure(reading(101))
  expect(toasts).toEqual(['5-hour limit reached, back in 2h14m'])
})

test('alerts switched off keep the crab away too', async ($, on) => {
  world(on)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts off' })
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })

  expect((await ui.findAll({ type: 'Svg' }))[0]?.props.alt).toBe('context 42%, Crab standing by')
})

test('the test alert brings the crab too', async ($, on) => {
  world(on)
  await $.session.measure(reading(30))
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })

  expect((await ui.findAll({ type: 'Svg' }))[0]?.props.alt).toBe(
    'Crab: Test alert: 5-hour window at 86%',
  )
})

test('while a turn runs the crab works at its laptop where the context ring was', async ($, on) => {
  world(on)
  await $.session.measure(reading(30))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band(true) })
  const [working] = await ui.findAll({ type: 'Svg' })

  expect(working?.props.alt).toBe('context 42%, working')
  expect([working?.props.width, working?.props.height]).toEqual([55, 24])
  expect(String(working?.props.source)).toContain('class="c1"')
  // The figure beside it is still there to read.
  expect((await ui.find({ type: 'Text', text: '42%' }))?.props.weight).toBe('semibold')

  await ui.redraw(band(false).props)
  const [resting] = await ui.findAll({ type: 'Svg' })

  // Done, it stands by there, as wide as it sleeps.
  expect(resting?.props.alt).toBe('context 42%, Crab standing by')
  expect([resting?.props.width, resting?.props.height]).toEqual([32, 24])
})

test('a terminal draws the crab in blocks beside the notice, when it has the rows', async ($, on) => {
  world(on)
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  // Five rows: the crab in block characters, in the colour of its news.
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(false, 5) })

  for (const row of CRAB_ROWS) {
    expect(await ui.find({ type: 'Text', text: row })).toBeDefined()
  }

  expect((await ui.find({ type: 'Text', text: CRAB_ROWS[0] }))?.props.color).toBe('error')
  expect(toneOf('back')).toBe('success')
  expect((await ui.find({ type: 'Text', text: '5-hour window at 86%' }))?.props.weight).toBe('semibold')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)

  const short = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(false, 3) })

  expect(await short.find({ type: 'Text', text: CRAB_ROWS[0] })).toBeUndefined()
})

test('a terminal with six rows draws the crab in half blocks, two pixels a cell, its eyes dark', async ($, on) => {
  world(on)
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band(false, 6) })
  const texts = await ui.findAll({ type: 'Text' })

  expect(await ui.find({ type: 'Text', text: CRAB_ROWS[0] })).toBeUndefined()
  expect(texts.some(({ text, props }) => text.includes('▀') && props.backgroundColor === '#1f1e1d')).toBe(true)
  expect(crabCells()).toHaveLength(SHARP_CRAB_ROWS)
  expect(crabCells().every(row => row.reduce((width, { text }) => width + [...text].length, 0) === 16)).toBe(true)
  expect((await ui.find({ type: 'Text', text: '5-hour window at 86%' }))?.props.weight).toBe('semibold')
})

// The 5-hour window steady at 20%, the weekly one at a given level.
const weekly = (percent: number) => ({
  ...reading(20),
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: 20,
      resetsAt: new Date(NOW + 2 * HOUR + 14 * MINUTE).toISOString(),
    },
    { kind: 'seven_day', percentUsed: percent, resetsAt: new Date(NOW + 60 * HOUR).toISOString() },
  ],
})

test('the weekly crab stands on seven cells named for their days, a calendar beside it', () => {
  const week = stageSvg('near', 86, 'x', undefined, 'still', {
    cells: 7,
    gone: 81,
    days: ['T', 'F', 'S', 'S', 'M', 'T', 'W'],
  })
  const five = stageSvg('near', 86, 'x', undefined, 'still', { cells: 5, gone: 55, days: null })

  expect([week.width, week.height]).toEqual([208, 64])
  expect(week.source).toContain('viewBox="0 0 208 64"')
  expect(week.source.split('fill-opacity=".28"').length - 1).toBe(7)
  expect(week.source.split('<text').length - 1).toBe(7)
  expect(week.source).toContain('>W</text>')
  expect(week.source).toContain('class="cal"')
  // Now: 81% of 192 from 8, less half the tick's width.
  expect(week.source).toContain('<rect x="162.5" y="35" width="2" height="16" rx="1"')
  // The calendar takes room at the right: the crab stops short of it.
  expect(week.source).toContain('translate(138 7) scale(3)')

  expect([five.width, five.height]).toEqual([208, 54])
  expect(five.source.split('fill-opacity=".28"').length - 1).toBe(5)
  expect(five.source).not.toContain('<text')
  expect(five.source).not.toContain('class="cal"')
})

test('the days of a weekly window are the weekdays its cells fall on', () => {
  // Wednesday 14 October 2026, 15:00 local: the last cell is that Wednesday.
  expect(daysOf(new Date(2026, 9, 14, 15, 0).toISOString(), 7)).toEqual(['T', 'F', 'S', 'S', 'M', 'T', 'W'])
  expect(daysOf(null, 7)).toBeNull()
})

test('a weekly notice stands the crab on the week, a 5-hour one on the hours', async ($, on) => {
  world(on)
  await $.session.measure(weekly(84))
  await $.session.measure(weekly(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const [stage] = await ui.findAll({ type: 'Svg' })

  expect(stage?.props.alt).toBe('Crab: Weekly window at 86%')
  expect([stage?.props.width, stage?.props.height]).toEqual([208, 64])
  expect(String(stage?.props.source).split('fill-opacity=".28"').length - 1).toBe(7)
  expect(String(stage?.props.source)).toContain('class="cal"')
})

test('the 5-hour notice stands on five cells, with no calendar', async ($, on) => {
  world(on)
  await $.session.measure(reading(84))
  await $.session.measure(reading(86))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const [stage] = await ui.findAll({ type: 'Svg' })

  expect([stage?.props.width, stage?.props.height]).toEqual([208, 54])
  expect(String(stage?.props.source).split('fill-opacity=".28"').length - 1).toBe(5)
  expect(String(stage?.props.source)).not.toContain('class="cal"')
})

test('alerts test week raises the weekly sample', async ($, on) => {
  world(on)
  await $.session.measure(weekly(30))

  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test week' })).text).toContain(
    'Test alert raised for the weekly window.',
  )

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...band() })
  const [stage] = await ui.findAll({ type: 'Svg' })

  expect(stage?.props.alt).toBe('Crab: Test alert: Weekly window at 86%')
  expect(String(stage?.props.source)).toContain('class="cal"')
})
