import { expect, test } from 'claude-code/testing'

import { shareSvg, weekSvg } from '../hooks/chart'
import { DASH_WIDTH, dashWidth, figuresSvg, ringsSvg, splitSvg } from '../hooks/dash'

// The pane's dashboard: what is large is drawn, and every picture says in its
// alt what it shows, for a reader who cannot see it.

const GAUGES = [
  { name: 'CTX', percent: 74, lines: ['148,000 / 200,000'] },
  { name: '5H', percent: 63, lines: ['reset 2h14m, at 16:14', 'full in 59m'] },
  { name: '7D', percent: 41, lines: ['reset 2d 4h, at Sun 18:00'] },
]

test('the rings sit inside one another, each figure in its level\'s colour, and the alt says them all', () => {
  const drawn = ringsSvg(GAUGES)

  expect(drawn.width).toBe(DASH_WIDTH)
  expect(drawn.alt).toBe(
    'CTX 74%, 148,000 / 200,000; 5H 63%, reset 2h14m, at 16:14, full in 59m; 7D 41%, reset 2d 4h, at Sun 18:00',
  )
  // Three tracks and three arcs, outermost first.
  expect(drawn.source.match(/<circle /g)).toHaveLength(6)
  expect(drawn.source).toContain('r="56"')
  expect(drawn.source).toContain('r="32"')
  // 74% and 63% at the warning level, 41% calm.
  expect(drawn.source.split('fill="#b07f00">').length - 1).toBe(2)
  expect(drawn.source).toContain('fill="#3a9a53">41%</text>')
  expect(drawn.source).toContain('>full in 59m</text>')
})

test('a figure with no reading has an empty ring and says --', () => {
  const drawn = ringsSvg([{ name: 'CTX', percent: null, lines: [] }])

  expect(drawn.source.match(/<circle /g)).toHaveLength(1)
  expect(drawn.source).toContain('>--</text>')
  expect(drawn.alt).toBe('CTX --')
})

test('the counts are written large, in an ink that follows the page', () => {
  const drawn = figuresSvg([
    { name: 'this session', value: '198k' },
    { name: 'today', value: '1.5M' },
    { name: 'last 7 days', value: '13.9M' },
  ])

  expect(drawn.alt).toBe('this session 198k, today 1.5M, last 7 days 13.9M')
  expect(drawn.source).toContain('font-size="24"')
  expect(drawn.source).toContain('prefers-color-scheme:dark')
  expect(drawn.source).toContain('class="v"')
})

test('where tokens went is one bar in parts, four named, the rest as one', () => {
  const parts = ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) => ({ name, total: (6 - index) * 1000 }))
  const drawn = splitSvg('By project', parts)

  expect(drawn.alt).toBe('By project: a 6.0k, b 5.0k, c 4.0k, d 3.0k, other 3.0k')
  expect(drawn.source.match(/<rect /g)).toHaveLength(10)
  expect(drawn.height).toBe(40 + 18 * 5)
})

// The pictures take the width of the pane: about 9.3 pixels a cell.

test('the width follows the pane, within bounds', () => {
  expect(dashWidth(40)).toBe(372)
  expect(dashWidth(10)).toBe(180)
  expect(dashWidth(200)).toBe(520)
})

test('where the pane is narrow the rings stand above their words, and the counts go one under another', () => {
  const wide = ringsSvg(GAUGES, undefined, 372)
  const narrow = ringsSvg(GAUGES, undefined, 220)

  expect(wide.width).toBe(372)
  expect(wide.height).toBe(142)
  expect(wide.source).toContain('x="146"')
  expect(narrow.width).toBe(220)
  expect(narrow.height).toBeGreaterThan(132 + 3 * 22)
  expect(narrow.source).not.toContain('x="146"')
  expect(narrow.alt).toBe(wide.alt)

  const counts = [
    { name: 'this session', value: '198k' },
    { name: 'today', value: '1.5M' },
    { name: 'last 7 days', value: '13.9M' },
  ]

  expect(figuresSvg(counts, 372).height).toBe(52)
  expect(figuresSvg(counts, 220).height).toBe(3 * 26)
  expect(splitSvg('By project', [{ name: 'a', total: 1 }], 400).source).toContain('width="400"')
  expect(weekSvg([{ name: 'Mon', value: 1 }], 350).source).toContain('width="350"')
  expect(shareSvg(50, undefined, 350).source).toContain('width="350"')
  expect(shareSvg(50, undefined, 350).source).toContain('<rect width="175"')
})

test('a long name is cut short, and what the markup cannot hold is escaped', () => {
  const drawn = splitSvg('By project', [{ name: 'a-very-long-project-name-that-runs-on<&>', total: 10 }])

  expect(drawn.source).toContain('a-very-long-project-name-…')
  expect(drawn.source).not.toContain('<&>')
  expect(ringsSvg([{ name: '<x>', percent: 10, lines: ['a & b'] }]).source).toContain('&lt;x&gt;')
})
