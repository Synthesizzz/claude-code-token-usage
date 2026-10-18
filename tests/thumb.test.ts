import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { PALETTE_GROUPS, PALETTE_NAMES, PALETTES } from '../hooks/style'
import { chipSvg } from '../hooks/thumb'

const PLUGIN = 'token-usage'
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
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
// The engine beneath the mod: a store that keeps what it is handed.
const world = (on: On) => {
  const kept = new Map<string, unknown>()

  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
}

test('chipSvg shows the three colours of a palette, calm to full', () => {
  const chip = chipSvg(PALETTES.sunset, 'sunset')

  expect(chip.source.indexOf('#c17d0e')).toBeGreaterThan(-1)
  expect(chip.source.indexOf('#c17d0e')).toBeLessThan(chip.source.indexOf('#e5583f'))
  expect(chip.source.indexOf('#e5583f')).toBeLessThan(chip.source.indexOf('#d0447f'))
  expect(chip.alt).toBe('sunset palette')
})

test('every palette is in one group of the picker', () => {
  expect(PALETTE_GROUPS.flatMap(({ names }) => names).sort()).toEqual([...PALETTE_NAMES].sort())
})

test('the picker pictures each palette above its button, by where it reads, where vectors are drawn', async ($, on) => {
  world(on)

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const picker = await $.ui.mount({ plugin: PLUGIN, surface, ...PICKER })
    const pictures = await picker.findAll({ type: 'Svg' })

    // Nothing read yet: no look to draw, only the palettes.
    expect(pictures.map(picture => picture.props.alt)).toEqual(
      PALETTE_GROUPS.flatMap(({ names }) => names).map(name => `${name} palette`),
    )
    expect(await picker.findAll({ type: 'Button' })).toHaveLength(67)
    expect([pictures[0]?.props.width, pictures[0]?.props.height]).toEqual([42, 15])
    // The bars stand at the top, with room under them before the name.
    expect(String(pictures[0]?.props.source)).toContain('height="15" viewBox="0 0 42 15"')
    expect(String(pictures[0]?.props.source)).toContain('y="1" width="13" height="8"')

    for (const heading of ['Colour', 'Grey', 'Colour-blind safe']) {
      expect(await picker.find({ type: 'Text', text: heading })).toBeDefined()
    }
  }
})

test('a terminal has no vector element: its picker is buttons alone', async ($, on) => {
  world(on)

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...PICKER })

  expect(await picker.findAll({ type: 'Button' })).toHaveLength(67)
  expect(await picker.find({ type: 'Text', text: 'Layout' })).toBeDefined()
})

test('alerts have their own group in the picker: on or off, where, and from 60%', async ($, on) => {
  world(on)

  const picker = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PICKER })

  expect(await picker.find({ type: 'Text', text: 'Alerts' })).toBeDefined()
  expect((await picker.find({ type: 'Button', text: 'both' }))?.props.variant).toBe('primary')
  expect((await picker.find({ type: 'Button', text: '60%' }))?.props.variant).toBe('secondary')

  await picker.press({ key: 'alerts-windows' })
  await picker.press({ key: 'alerts-60' })
  expect((await picker.find({ type: 'Button', text: 'windows' }))?.props.variant).toBe('primary')
  expect((await picker.find({ type: 'Button', text: 'both' }))?.props.variant).toBe('secondary')
  expect((await picker.find({ type: 'Button', text: '60%' }))?.props.variant).toBe('primary')

  await picker.press({ key: 'alerts-on' })
  expect((await picker.find({ type: 'Button', text: 'on' }))?.props.variant).toBe('secondary')
})
