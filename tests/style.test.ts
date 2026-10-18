import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { PALETTES, apply, defaults, paletteFor, sane, words } from '../hooks/style'
import { TYPED } from './kit'

const PLUGIN = 'token-usage'
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, ...SITE },
} as const
const PICKER = {
  component: 'Pane',
  requestId: 'tokens-style',
  props: {
    title: 'Token usage style',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock',
    ...SITE,
  },
} as const
const MEASURE = {
  context: { window: 200000, tokens: 84000, percent: 42 },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: 31,
      resetsAt: new Date(NOW + 2 * HOUR + 14 * MINUTE).toISOString(),
    },
    { kind: 'seven_day', percentUsed: 90 },
  ],
  cost: { usd: 1.84 },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
}
const BASE = defaults({})
// The engine beneath the mod: a clock, a pane that opens, an empty band, and
// a store the test can look into (the kit's own keeps what it holds to itself).
type Run = { argv: readonly string[]; env: Record<string, string> }
const world = (
  on: On,
  stored: Readonly<Record<string, unknown>> = {},
  runs: Run[] = [],
  os: string | null = 'Windows_NT',
) => {
  const kept = new Map(Object.entries(stored))

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
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.env(on, os === null ? {} : { OS: os })
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, env: e.init?.env ?? {} })

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
    const { Text } = beneath.ui.resolve(e)

    return Text({ children: '' })
  })

  return kept
}
const styled = (outcome: ReturnType<typeof apply>) => {
  if (!('style' in outcome)) {
    throw new Error(`no style in ${JSON.stringify(outcome)}`)
  }

  return outcome.style
}

test('the defaults are the double rings in the classic colours, everything shown', () => {
  expect(BASE).toEqual({
    layout: 'rings',
    palette: 'classic',
    colors: {},
    labels: 'auto',
    hidden: [],
    notify: 'both',
    hasEarlyAlert: false,
    budget: null,
    weekBudget: null,
    monthBudget: null,
    projectBudgets: {},
    isPrivate: true,
    quiet: null,
    hasPopup: true,
    background: null,
  })
})

test('help sets out the words by what they do, a line each; an unknown word points to it', () => {
  const help = apply(BASE, 'help')

  const lines = 'text' in help ? help.text.split('\n') : []

  // The six words of every day first, then the settings, then the checks.
  expect(lines.slice(0, 3)).toEqual([
    '/tokens words:',
    '  main: (nothing) for the usage pane, style for its buttons, agents, context, list, help',
    'settings, most also a button in /tokens style:',
  ])
  expect(lines.slice(-2)).toEqual(['checks:', '  alerts test [week|cache|lapsed]'])
  expect('text' in help && help.text).toContain('\n  look: a preset (classic, timeline, quiet, neon, split), layout <rings|bars|compact|frames|stack>')
  expect('text' in help && help.text).toContain('\n  parts: show|hide <context|countdown|forecast|cost|alerts|crab|breakdown>')
  expect('text' in help && help.text).toContain('alerts popup <on|off>, alerts privacy <on|off>, alerts quiet <from-to|off>')
  expect('text' in help && help.text).toContain('\n  data: export, tidy [now], reset')
  expect('text' in help && help.text).toContain('color background <#hex|off>')
  expect(apply(BASE, 'sparkles')).toEqual({ text: 'Unknown: "sparkles". /tokens help lists the words; /tokens style has a button for each.' })
  // The list says what is chosen, and where the words are.
  expect(apply(BASE, 'list')).toMatchObject({ text: expect.stringMatching(/\. \/tokens help lists the words\.$/) })
})

test("a project's budget is a name and dollars a day; a name may have spaces", () => {
  const set = apply(BASE, 'budget project my shop 5')

  expect(set).toMatchObject({ style: { projectBudgets: { 'my shop': 5 } }, text: 'budget: $5.00 a day for my shop.' })

  const style = 'style' in set ? set.style : BASE

  expect(apply(style, 'budget project my shop off')).toMatchObject({ style: { projectBudgets: {} }, text: 'budget for my shop: off.' })
  expect(apply(BASE, 'budget project 5')).toEqual({ text: 'A project budget is a name and dollars a day, or off: budget project here 5.' })
  expect(apply(style, 'list')).toMatchObject({ text: expect.stringContaining('budget $5.00 a day for my shop') })
  expect(sane({ ...style, projectBudgets: { 'my shop': 5, bad: -1, worse: 'x' } })?.projectBudgets).toEqual({ 'my shop': 5 })
  expect(sane(BASE)?.projectBudgets).toEqual({})
})

test('a monthly budget is dollars a month, or off', () => {
  const set = apply(BASE, 'budget month 200')

  expect(set).toMatchObject({ style: { monthBudget: 200 }, text: 'budget: $200.00 a month.' })

  const style = 'style' in set ? set.style : BASE

  expect(apply(style, 'list')).toMatchObject({ text: expect.stringContaining('budget $200.00 a month') })
  expect(apply(style, 'budget month off')).toMatchObject({ style: { monthBudget: null }, text: 'monthly budget: off.' })
  expect(apply(BASE, 'budget month lots')).toEqual({ text: 'A monthly budget is dollars a month, or off: budget month 200.' })
  expect(sane({ ...style, monthBudget: -4 })?.monthBudget).toBeNull()
})

test('export is a word of its own', () => {
  expect(apply(BASE, 'export')).toEqual({ export: true })
})

test('tidy says, and tidy now does', () => {
  expect(apply(BASE, 'tidy')).toEqual({ tidy: false })
  expect(apply(BASE, 'tidy now')).toEqual({ tidy: true })
})

test('the defaults take the layout and the colours the options name', () => {
  const fromOptions = defaults({ style: 'bars', colorFull: '#123456', colorOk: 'red' })

  expect(fromOptions.layout).toBe('bars')
  expect(paletteFor(fromOptions)).toEqual({
    success: '#3a9a53',
    warning: '#b07f00',
    error: '#123456',
  })
  expect(defaults({ style: 'nonsense' }).layout).toBe('rings')
})

test('a preset word sets the layout, palette, labels and parts at once', () => {
  expect(styled(apply(BASE, 'quiet'))).toEqual({
    ...BASE,
    layout: 'compact',
    palette: 'mono',
    labels: 'short',
    hidden: ['cost'],
  })
  // Where alerts go is the person's own choice: a preset leaves it alone.
  expect(styled(apply(styled(apply(BASE, 'alerts app')), 'neon')).notify).toBe('app')
})

test('a layout is set by its name alone or after the word layout', () => {
  expect(styled(apply(BASE, 'bars'))).toEqual({ ...BASE, layout: 'bars' })
  expect(styled(apply(BASE, 'layout stack')).layout).toBe('stack')
  expect(styled(apply(BASE, '  Layout  FRAMES ')).layout).toBe('frames')
})

test('a palette word replaces the colours and a colour word overrides one level', () => {
  const ocean = styled(apply(BASE, 'palette ocean'))

  expect(paletteFor(ocean)).toEqual({
    success: '#1d8fc4',
    warning: '#9a62e6',
    error: '#e03c6e',
  })

  const tuned = styled(apply(ocean, 'color warn #ABCDEF'))

  expect(paletteFor(tuned)).toEqual({
    success: '#1d8fc4',
    warning: '#ABCDEF',
    error: '#e03c6e',
  })
  // Choosing a palette again drops the override.
  expect(paletteFor(styled(apply(tuned, 'palette sunset'))).warning).toBe('#e5583f')
})

test('a colour that is no hex colour changes nothing and says so', () => {
  const outcome = apply(BASE, 'color warn red')

  expect('style' in outcome).toBe(false)
  expect('text' in outcome && outcome.text).toContain('#')
})

test('a background is set for the desktop band, kept, listed, and switched off again', () => {
  const green = styled(apply(BASE, 'color background #1f3b2d'))

  expect(BASE.background).toBeNull()
  expect(green.background).toBe('#1f3b2d')
  expect(apply(BASE, 'color background #1f3b2d')).toMatchObject({ text: 'Background: #1f3b2d.' })
  expect(sane(green)?.background).toBe('#1f3b2d')
  expect(apply(green, 'list')).toMatchObject({ text: expect.stringContaining('background #1f3b2d') })
  // A palette or a look of its own leaves the background as it was.
  expect(styled(apply(green, 'palette ocean')).background).toBe('#1f3b2d')
  expect(styled(apply(green, 'color background off')).background).toBeNull()
  // A style kept before backgrounds had a place, or one holding no colour, has none.
  const { background, ...older } = green

  expect(sane(older)?.background).toBeNull()
  expect(sane({ ...green, background: 'green' })?.background).toBeNull()
  expect('style' in apply(BASE, 'color background green')).toBe(false)
})

test('a background white text reads poorly on is set, and says so', () => {
  expect(apply(BASE, 'color background #f5f5f5')).toMatchObject({
    style: { background: '#f5f5f5' },
    text: expect.stringContaining('White text reads poorly on it'),
  })
  expect(apply(BASE, 'color background #1f3b2d')).not.toMatchObject({ text: expect.stringContaining('reads poorly') })
})

test('the desktop band draws its background behind everything it shows; the terminal draws none', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const plain = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  expect((await plain.findAll({ type: 'Box' }))[0]?.props.backgroundColor).toBeUndefined()
  await plain.unmount()
  await $.command.run({ ...TYPED, command: 'tokens', args: 'color background #1f3b2d' })

  const desktop = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })

  // Out to the frame's sides, the padding giving the row its width back.
  expect((await desktop.findAll({ type: 'Box' }))[0]?.props).toMatchObject({ backgroundColor: '#1f3b2d', marginX: -1, paddingX: 1, paddingY: 1 })

  const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })

  expect((await terminal.findAll({ type: 'Box' })).some(({ props }) => props.backgroundColor === '#1f3b2d')).toBe(false)
})

test('a part is switched off and on again', () => {
  const off = styled(apply(BASE, 'cost off'))

  expect(off.hidden).toEqual(['cost'])
  // Kept in the order the parts are listed, whichever went first.
  expect(styled(apply(off, 'forecast off')).hidden).toEqual(['forecast', 'cost'])
  expect(styled(apply(off, 'cost on')).hidden).toEqual([])
})

test('show and hide switch a part; context alone still opens its pane', () => {
  expect(apply(BASE, 'hide context')).toEqual(apply(BASE, 'context off'))
  expect(styled(apply(BASE, 'hide context')).hidden).toEqual(['context'])
  expect(apply(BASE, 'hide context')).toMatchObject({ text: 'context: off.' })
  expect(styled(apply(styled(apply(BASE, 'hide crab')), 'show crab')).hidden).toEqual([])
  expect(apply(BASE, 'context')).toEqual({ open: 'context' })
  expect(apply(BASE, 'hide sparkles')).toMatchObject({ text: expect.stringContaining('Unknown') })
  expect(apply(BASE, 'show')).toMatchObject({ text: expect.stringContaining('Unknown') })
})

test('a window is named by the label set chosen, or by what suits the layout', () => {
  const named = (labels: string, layout = 'rings') =>
    words({ ...BASE, layout, labels } as typeof BASE)

  expect(named('auto').name('five_hour')).toBe('5-hour')
  expect(named('auto', 'bars').name('five_hour')).toBe('5h')
  expect(named('auto', 'compact').name('seven_day')).toBe('Week')
  expect(named('caps').name('seven_day')).toBe('7D')
  expect(named('caps').context).toBe('CTX')
  expect(named('thai').name('five_hour')).toBe('5 ชม.')
  expect(named('thai').left).toBe('เหลือ')
  expect(named('long').name('monthly')).toBe('monthly')
})

test('the bare command opens the usage pane and the word style the picker', () => {
  expect(apply(BASE, '')).toEqual({ open: 'usage' })
  expect(apply(BASE, '   ')).toEqual({ open: 'usage' })
  expect(apply(BASE, ' Style ')).toEqual({ open: 'style' })
})

test('reset asks for the defaults back, list says what is chosen', () => {
  expect('reset' in apply(BASE, 'reset')).toBe(true)

  const listed = apply(styled(apply(BASE, 'neon')), 'list')

  expect('text' in listed && listed.text).toContain('layout rings')
  expect('text' in listed && listed.text).toContain('palette ocean')
  expect('style' in listed).toBe(false)
})

test('an unknown word changes nothing and says what can be typed', () => {
  const outcome = apply(BASE, 'purple')

  expect('style' in outcome).toBe(false)
  expect('text' in outcome && outcome.text).toContain('purple')
  expect('text' in outcome && outcome.text).toContain('/tokens help')
})

test('sane lets a stored style through and nothing that is not one', () => {
  const kept = styled(apply(styled(apply(BASE, 'split')), 'color ok #00ffaa'))

  expect(sane(JSON.parse(JSON.stringify(kept)))).toEqual(kept)
  expect(sane('junk')).toBeNull()
  expect(sane({ ...kept, layout: 'spiral' })).toBeNull()
  expect(sane({ ...kept, colors: { success: 'red"/>' }, hidden: ['cost', 'nope'] })).toEqual({
    ...kept,
    colors: {},
    hidden: ['cost'],
  })
})

test('the tokens command switches the desktop band and keeps the choice in the store', async ($, on) => {
  const kept = world(on)
  await $.session.measure(MEASURE)

  const answer = await $.command.run({ ...TYPED, command: 'tokens', args: 'bars' })
  expect(answer.text).toContain('bars')

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const drawn = await ui.findAll({ type: 'Svg' })

  expect(drawn.map(svg => svg.props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5h 31% used, 55% of the window gone',
    'Week 90% used',
  ])
  expect(kept.get('style')).toEqual({ ...BASE, layout: 'bars' })
})

test('a style kept in the store is the one a new session draws', async ($, on) => {
  world(on, { style: { ...BASE, layout: 'compact', palette: 'ocean', labels: 'caps' } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const drawn = await ui.findAll({ type: 'Svg' })

  expect(drawn.map(svg => svg.props.alt)).toEqual(['CTX 42%, Crab standing by', '5H 31% used', '7D 90% used'])
  // 31% is the calm level: the ocean palette's first colour, as a dot.
  expect(String(drawn[1]?.props.source)).toContain('#1d8fc4')
  expect(String(drawn[1]?.props.source)).toContain('width="8"')
  expect(await ui.find({ type: 'Text', text: '2h14m' })).toBeDefined()
})

test('frames draws each window in a bordered box with its own ring', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'layout frames' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const boxes = await ui.findAll({ type: 'Box' })

  expect(boxes.filter(box => box.props.borderStyle === 'round')).toHaveLength(2)
  expect((await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)).toEqual([
    'context 42%, Crab standing by',
    '5-hour 31%',
    'Weekly 90%',
  ])
  expect((await ui.find({ type: 'Text', text: '2h14m' }))?.props.weight).toBe('semibold')
})

test('stack draws a wide bar per window, one under the other', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'stack' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const drawn = await ui.findAll({ type: 'Svg' })

  expect(drawn).toHaveLength(3)
  expect(String(drawn[1]?.props.source)).toContain('width="160"')
  expect(String(drawn[1]?.props.source).match(/fill-opacity=".28"/g)).toHaveLength(5)
  expect(String(drawn[2]?.props.source).match(/fill-opacity=".28"/g)).toHaveLength(7)
  expect(drawn[1]?.props.width).toBe(160)
})

test('a part switched off is not drawn, on any surface', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'cost off' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'countdown off' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'context off' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '$0.00 API today' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '2h14m' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '42%' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '31%' })).toBeDefined()
  }
})

test('the picker has a button for every choice the words make, the newer ones too', async ($, on) => {
  world(on)
  // With an API key: a subscription's picker has no budgets.
  await $.session.measure({ ...MEASURE, rateLimits: [] })

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PICKER })
  const variant = async (text: string) => (await picker.find({ type: 'Button', text }))?.props.variant

  for (const heading of ['Budget a week', 'Outside the app', 'Data']) {
    expect(await picker.find({ type: 'Text', text: heading })).toBeDefined()
  }

  await picker.press({ key: 'projectBudget-$2' })
  expect(JSON.stringify(await $.command.run({ ...TYPED, command: 'tokens', args: 'list' }))).toContain('budget $2.00 a day for (no folder)')
  await picker.press({ key: 'weekBudget-$50' })
  expect(await variant('$50 a week')).toBe('primary')
  expect(JSON.stringify(await $.command.run({ ...TYPED, command: 'tokens', args: 'list' }))).toContain('budget $50.00 a week')

  expect(await variant('popup')).toBe('primary')
  await picker.press({ key: 'popup' })
  expect(await variant('popup')).toBe('secondary')

  expect(await variant('privacy')).toBe('primary')
  await picker.press({ key: 'quiet-22-8' })
  expect(await variant('22–8')).toBe('primary')
  await picker.press({ key: 'quiet-off' })
  expect(await variant('no quiet hours')).toBe('primary')

  expect(await picker.find({ type: 'Button', text: 'export' })).toBeDefined()
  expect(await picker.find({ type: 'Button', text: 'old files' })).toBeDefined()
})

test('on a subscription the picker has no budgets, and the words still set one', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PICKER })

  for (const heading of ['Budget a day', 'Budget a week', 'Budget a month']) {
    expect(await picker.find({ type: 'Text', text: heading })).toBeUndefined()
  }

  expect(await picker.find({ type: 'Text', text: 'Outside the app' })).toBeDefined()
  expect(await $.command.run({ ...TYPED, command: 'tokens', args: 'budget week 50' })).toMatchObject({ text: expect.stringContaining('$50.00 a week') })
})

test('the picker draws the look in force as the band does, and each other look under its button', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PICKER })
  // The kit drops hover props: the hidden looks are found by their keys, the
  // scope a pointer on their buttons opens.
  const peeks = async () =>
    (await picker.findAll({ type: 'Box' })).filter(({ props }) => String(props.key ?? '').startsWith('peek-'))

  expect(await picker.find({ type: 'Text', text: 'Look: rings · classic, the classic preset' })).toBeDefined()
  expect((await picker.findAll({ type: 'Svg' })).slice(0, 3).map(({ props }) => props.alt)).toEqual([
    'context 42%',
    '5-hour 31% used, 55% of the window gone',
    'Weekly 90% used',
  ])

  // Every look not in force waits hidden, opened by the pointer on its button.
  expect((await peeks()).map(({ props }) => [props.key, props.display])).toEqual([
    ...['bars', 'compact', 'frames', 'stack'].map(name => [`peek-layout-${name}`, 'none']),
    ...['ocean', 'sunset', 'mono', 'forest', 'berry', 'ice', 'ember', 'mint', 'safe', 'okabe'].map(name => [`peek-palette-${name}`, 'none']),
  ])
  expect(await picker.find({ type: 'Text', text: 'bars · classic, not chosen yet' })).toBeDefined()
  expect(await picker.find({ type: 'Text', text: 'rings · ocean, not chosen yet' })).toBeDefined()

  // Pressed, it is the look in force, and the one before waits in its place.
  await picker.press({ key: 'layout-bars' })
  // A look no preset makes names none.
  expect(await picker.find({ type: 'Text', text: 'Look: bars · classic' })).toBeDefined()
  expect(await picker.find({ type: 'Text', text: 'preset' })).toBeUndefined()
  expect((await peeks()).map(({ props }) => props.key)).toContain('peek-layout-rings')
  expect((await peeks()).map(({ props }) => props.key)).not.toContain('peek-layout-bars')
})

test("in a narrow pane the look's stack fits: its bars give way to the room", async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'split' })

  const widths = async (bodyColumns: number) => {
    const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PICKER, props: { ...PICKER.props, bodyColumns } })
    const bar = (await picker.findAll({ type: 'Svg' })).find(({ props }) => String(props.alt).startsWith('5-hour'))

    await picker.unmount()

    return Number(bar?.props.width)
  }

  expect(await widths(90)).toBe(160)
  expect(await widths(40)).toBeLessThan(160)
  expect(await widths(40)).toBeGreaterThanOrEqual(56)
})

test('tokens style opens the picker, and a press there changes the band', async ($, on) => {
  const kept = world(on)
  await $.session.measure(MEASURE)

  const answer = await $.command.run({ ...TYPED, command: 'tokens', args: 'style' })
  expect(answer.text).toContain('style')

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PICKER })
  expect((await picker.find({ type: 'Button', text: 'rings' }))?.props.variant).toBe('primary')
  expect((await picker.find({ type: 'Button', text: 'bars' }))?.props.variant).toBe('secondary')

  await picker.press({ key: 'layout-bars' })
  expect((await picker.find({ type: 'Button', text: 'bars' }))?.props.variant).toBe('primary')

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  expect((await ui.findAll({ type: 'Svg' }))[1]?.props.alt).toBe(
    '5h 31% used, 55% of the window gone',
  )
  expect(kept.get('style')).toEqual({ ...BASE, layout: 'bars' })
})

test('reset drops the kept style and the band is the default again', async ($, on) => {
  const kept = world(on)
  await $.session.measure(MEASURE)
  await $.command.run({ ...TYPED, command: 'tokens', args: 'neon' })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'reset' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const drawn = await ui.findAll({ type: 'Svg' })

  expect(drawn[1]?.props.alt).toBe('5-hour 31% used, 55% of the window gone')
  expect(String(drawn[1]?.props.source)).toContain('#3a9a53')
  expect(kept.has('style')).toBe(false)
})

test('the style option may name any layout', { options: { style: 'compact' } }, async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  expect((await ui.findAll({ type: 'Svg' }))[1]?.props.alt).toBe('5h 31% used')
})

test('no part of the desktop band gives up width: a narrow band wraps, nothing overlaps', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  for (const name of ['rings', 'bars', 'compact', 'frames', 'stack']) {
    await $.command.run({ ...TYPED, command: 'tokens', args: `layout ${name}` })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    const boxes = await ui.findAll({ type: 'Box' })

    expect(boxes.filter(box => box.props.flexWrap === 'wrap')).toHaveLength(1)
    // The context, the windows and the cost each keep the width of what they hold.
    expect(boxes.filter(box => box.props.flexShrink === 0).length >= 3).toBe(true)
  }
})

const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (one: string, other: string) => {
  const [low = 0, high = 0] = [luminance(one), luminance(other)].sort((a, b) => a - b)

  return (high + 0.05) / (low + 0.05)
}
const DARK_BAND = '#232528'
const LIGHT_BAND = '#faf9f5'

test('there are eleven palettes, each of three different colours that read on the dark band', () => {
  expect(Object.keys(PALETTES)).toEqual([
    'classic',
    'ocean',
    'sunset',
    'mono',
    'forest',
    'berry',
    'ice',
    'ember',
    'mint',
    'safe',
    'okabe',
  ])

  for (const palette of Object.values(PALETTES)) {
    const colours = [palette.success, palette.warning, palette.error]

    expect(new Set(colours).size).toBe(3)

    for (const colour of colours) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrast(colour, DARK_BAND) >= 3).toBe(true)
    }
  }
})

test('every palette reads on the light band too', () => {
  for (const palette of Object.values(PALETTES)) {
    for (const colour of Object.values(palette)) {
      expect(contrast(colour, LIGHT_BAND) >= 3).toBe(true)
    }
  }
})

const climbing = (fiveHour: number) => ({
  ...MEASURE,
  rateLimits: [{ ...MEASURE.rateLimits[0], kind: 'five_hour', percentUsed: fiveHour }, ...MEASURE.rateLimits.slice(1)],
  changed: ['rateLimits' as const],
})

test('a window climbing past 85% raises one toast', async ($, on) => {
  world(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))
  expect(toasts).toEqual(['5-hour window at 86%, resets in 2h14m'])

  await $.session.measure(climbing(93))
  expect(toasts).toHaveLength(1)
})

test('no toast is raised while alerts are switched off', async ($, on) => {
  world(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts off' })).text).toContain('alerts: off')
  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))
  expect(toasts).toEqual([])
})

test('tokens list says how wide the desktop band is and what it left out', async ($, on) => {
  world(on)
  await $.session.measure(MEASURE)

  await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })).text).toContain(
    'Band: 80 columns wide, drawn as rings in full.',
  )

  await $.ui.mount({
    plugin: PLUGIN,
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...BAND.props, bodyColumns: 52 },
  })
  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })).text).toContain(
    'Band: 52 columns wide, drawn as rings without cost, the context word.',
  )
})

test('the alerts words choose where a notice goes and whether 60% is one', () => {
  expect(styled(apply(BASE, 'alerts windows')).notify).toBe('windows')
  expect(styled(apply(BASE, 'alerts app')).notify).toBe('app')
  expect(styled(apply(styled(apply(BASE, 'alerts app')), 'alerts both')).notify).toBe('both')
  expect(styled(apply(BASE, 'alerts 60 on')).hasEarlyAlert).toBe(true)
  expect(styled(apply(styled(apply(BASE, 'alerts 60 on')), 'alerts 60 off')).hasEarlyAlert).toBe(false)
  expect(styled(apply(BASE, 'alerts off')).hidden).toEqual(['alerts'])
  expect('style' in apply(BASE, 'alerts sometimes')).toBe(false)
})

test('a style stored before alerts had a place still loads, with the defaults for them', () => {
  const { notify, hasEarlyAlert, ...old } = BASE

  expect(notify).toBe('both')
  expect(sane({ ...old, layout: 'bars' })).toEqual({ ...BASE, layout: 'bars' })
  expect(sane({ ...BASE, notify: 'pigeon', hasEarlyAlert: 'yes' })).toEqual(BASE)
  expect(hasEarlyAlert).toBe(false)
})

test('a notice goes to Windows too, its words handed over by environment', async ($, on) => {
  const runs: Run[] = []
  const toasts: string[] = []

  world(on, {}, runs)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))

  expect(toasts).toEqual(['5-hour window at 86%, resets in 2h14m'])
  expect(runs).toHaveLength(1)
  expect(runs[0]?.argv[0]).toBe('powershell')
  // The script is fixed text: nothing a window is named is spliced into it.
  expect(runs[0]?.argv.join(' ')).not.toContain('5-hour')
  expect(runs[0]?.env).toEqual({
    TOKEN_USAGE_TITLE: '5-hour window at 86%',
    TOKEN_USAGE_TEXT: 'Resets in 2h14m.',
    TOKEN_USAGE_BAR_NAME: '5-hour window',
    TOKEN_USAGE_BAR_VALUE: '0.86',
    TOKEN_USAGE_BAR_LABEL: '86%',
    TOKEN_USAGE_BAR_STATUS: 'resets in 2h14m',
  })
})

test('alerts app keeps a notice in the app, alerts windows keeps it out', async ($, on) => {
  const runs: Run[] = []
  const toasts: string[] = []

  world(on, {}, runs)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts app' })
  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))
  expect([toasts.length, runs.length]).toEqual([1, 0])

  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts windows' })
  await $.session.measure(climbing(100))
  expect([toasts.length, runs.length]).toEqual([1, 1])
  expect(runs[0]?.env.TOKEN_USAGE_TITLE).toBe('5-hour limit reached')
})

test('off Windows a notice goes by the person\'s own notification channel', async ($, on) => {
  const runs: Run[] = []
  const notified: string[] = []

  world(on, {}, runs, null)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', (_, e) => {
    notified.push(`${e.title}: ${e.text}`)

    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))

  expect(runs).toHaveLength(0)
  expect(notified).toEqual(['token-usage: 5-hour window at 86%. Resets in 2h14m.'])
})

test('tokens list says how the last notification outside the app went', async ($, on) => {
  world(on)
  on('ui.toast', () => ({ value: undefined }))
  await $.session.measure(climbing(80))
  await $.session.measure(climbing(86))

  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'list' })).text).toContain(
    'Last notification outside the app: sent.',
  )
})

const crowded = { ...MEASURE, context: { window: 200000, tokens: 164000, percent: 82 } }

test('a context past 80% puts a Compact button in the band, and a press compacts', async ($, on) => {
  let compactions = 0

  world(on)
  on('session.compact', () => {
    compactions += 1

    return { skip: 'the test stops here' }
  })
  await $.session.measure(MEASURE)

  for (const surface of ['terminal', 'desktop'] as const) {
    const calm = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await calm.find({ type: 'Button', text: 'Compact' })).toBeUndefined()
  }

  await $.session.measure(crowded)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Button', text: 'Compact' })).toBeDefined()
    await ui.press({ key: 'compact' })
  }

  expect(compactions).toBe(2)
})

test('a Compact the engine refuses says the engine\'s reason', async ($, on) => {
  const toasts: string[] = []

  world(on)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.compact', () => {
    throw new Error('the summary request failed')
  })
  await $.session.measure(MEASURE)
  await $.session.measure(crowded)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  await ui.press({ key: 'compact' })

  // A hook that throws is skipped and the compaction goes on beneath it, where
  // the test engine fails: whatever it says is what the toast says.
  expect(toasts.at(-1)).toMatch(/^Compact did not run: \S/)
  expect(toasts).not.toContain('Compact has to wait until the turn ends.')
})

test('where the session cannot compact from a hook, Compact runs the person\'s /compact', async ($, on) => {
  const toasts: string[] = []
  const ran: string[] = []

  world(on)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  // The engine of a headless session: the call is refused, the command runs.
  on('session.compact', () => {
    throw new Error('not available in a headless (-p / SDK) session yet')
  })
  on('command.run', { command: 'compact' }, (_, e) => {
    ran.push(`/${e.command} ${e.args}`.trim())

    return { text: '' }
  })
  await $.session.measure(MEASURE)
  await $.session.measure(crowded)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  await ui.press({ key: 'compact' })

  expect(ran).toEqual(['/compact'])
  expect(toasts.filter(text => text.startsWith('Compact'))).toEqual([])
})

test('a Compact pressed while a turn runs says to wait, and does not ask the engine', async ($, on) => {
  const toasts: string[] = []
  let asked = 0

  world(on)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.compact', () => {
    asked += 1

    return { skip: 'not reached' }
  })
  await $.session.measure(MEASURE)
  await $.session.measure(crowded)

  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'desktop',
    ...BAND,
    props: { ...BAND.props, isWorking: true },
  })
  await ui.press({ key: 'compact' })

  expect(toasts.at(-1)).toBe('Claude is still working: press Compact again when the turn ends.')
  expect(asked).toBe(0)
})

test('a Compact a hook vetoes says why', async ($, on) => {
  const toasts: string[] = []

  world(on)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.compact', () => ({ skip: 'a hook said no' }))
  await $.session.measure(MEASURE)
  await $.session.measure(crowded)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  await ui.press({ key: 'compact' })

  expect(toasts.at(-1)).toBe('Compact skipped: a hook said no')
})

test('alerts test raises a sample notice in both places and says how it went', async ($, on) => {
  const runs: Run[] = []
  const toasts: string[] = []

  world(on, {}, runs)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const answer = await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test' })

  expect(toasts).toEqual(['Test alert: 5-hour window at 86%, resets in 2h14m'])
  expect(runs).toHaveLength(1)
  expect(runs[0]?.env.TOKEN_USAGE_TITLE).toBe('Test alert: 5-hour window at 86%')
  expect(answer.text).toBe('Test alert raised. Last notification outside the app: sent.')
})

test('alerts test raises nothing outside the app when alerts stay in it', async ($, on) => {
  const runs: Run[] = []

  world(on, {}, runs)
  on('ui.toast', () => ({ value: undefined }))
  await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts app' })

  expect((await $.command.run({ ...TYPED, command: 'tokens', args: 'alerts test' })).text).toBe(
    'Test alert raised.',
  )
  expect(runs).toHaveLength(0)
})
