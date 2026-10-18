import { shortTokens } from './cost'
import { DEFAULTS, TRACK } from './svg'
import { tone } from './usage'
import type { Palette } from '../types'

// The pane's dashboard on a surface that draws pictures: the rings inside
// one another with their figures, the three counts written large, and where
// the week's tokens went as one bar each. Text in a pane cannot be made
// larger, so what is large is drawn. An image cannot name a theme key: the
// figures take a dark ink on a light page and a light one on a dark page,
// and a mid grey where the page says neither.

export const DASH_WIDTH = 280
// The desktop tells a mod its width in cells; a cell is about 9.3 pixels.
const CELL_PX = 9.3
const MIN_WIDTH = 180
const MAX_WIDTH = 520
// Narrower than this, the rings stand above their words and the counts go
// one under another.
const SIDE_BY_SIDE = 300
const ACROSS = 260

export const dashWidth = (columns: number) =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(columns * CELL_PX)))
const FONT = 'Segoe UI, system-ui, sans-serif'
const INK = '<style>.v{fill:#59606b}@media (prefers-color-scheme:dark){.v{fill:#dfe2e7}}@media (prefers-color-scheme:light){.v{fill:#1f2328}}</style>'
// The colours of the parts of a bar, the most first; the rest are grey.
const PARTS = ['#7c8cff', '#4eba65', '#ffc107', '#d97757']
const RING_WIDTH = 9
const RING_STEP = 12
const RING_OUTER = 56
const CENTER = 66
const NAME_CHARS = 26

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${INK}${body}</svg>`

const clip = (name: string) => (name.length > NAME_CHARS ? `${name.slice(0, NAME_CHARS - 1)}…` : name)

export type Gauge = { name: string; percent: number | null; lines: string[] }

// A ring per figure, the first outermost, and beside them each figure's name,
// its percentage large in its level's colour, and what more it says. Where
// the pane is narrow the words go beneath the rings.
export const ringsSvg = (gauges: readonly Gauge[], palette: Palette = DEFAULTS, width = DASH_WIDTH) => {
  const isBeside = width >= SIDE_BY_SIDE || width === DASH_WIDTH
  const left = isBeside ? 146 : 0
  const below = isBeside ? 0 : 2 * CENTER + 10
  const shift = isBeside ? 0 : width / 2 - CENTER
  const blocks = gauges.map(gauge => 22 + 14 * gauge.lines.length)
  const said = blocks.reduce((sum, block) => sum + block, 0) + 8 * (gauges.length - 1) + 4
  const height = isBeside ? Math.max(2 * CENTER, said) : below + said
  const rings = gauges
    .map(({ percent }, index) => {
      const radius = RING_OUTER - RING_STEP * index
      const rim = 2 * Math.PI * radius
      const drawn = (rim * Math.min(100, Math.max(0, percent ?? 0))) / 100
      const track = `<circle cx="${CENTER}" cy="${CENTER}" r="${radius}" fill="none" stroke="${TRACK}" stroke-opacity=".22" stroke-width="${RING_WIDTH}"/>`

      return drawn <= 0
        ? track
        : `${track}<circle cx="${CENTER}" cy="${CENTER}" r="${radius}" fill="none" stroke="${palette[tone(percent ?? 0)]}" stroke-width="${RING_WIDTH}" stroke-linecap="round" stroke-dasharray="${drawn.toFixed(2)} ${rim.toFixed(2)}" transform="rotate(-90 ${CENTER} ${CENTER})"/>`
    })
    .join('')
  let top = below + 2
  const words = gauges
    .map(({ name, percent, lines }, index) => {
      const y = top + 18
      const said = [
        `<text x="${left}" y="${y}" font-size="12" fill="${TRACK}">${escape(name)}</text>`,
        `<text x="${width}" y="${y}" font-size="20" font-weight="600" text-anchor="end" fill="${percent === null ? TRACK : palette[tone(percent)]}">${percent === null ? '--' : `${Math.round(percent)}%`}</text>`,
        ...lines.map((line, at) => `<text x="${left}" y="${y + 15 + 14 * at}" font-size="11" fill="${TRACK}">${escape(line)}</text>`),
      ].join('')

      top += (blocks[index] ?? 0) + 8

      return said
    })
    .join('')

  return {
    source: svg(width, height, (shift === 0 ? rings : `<g transform="translate(${shift} 0)">${rings}</g>`) + words),
    alt: gauges
      .map(({ name, percent, lines }) => [`${name} ${percent === null ? '--' : `${Math.round(percent)}%`}`, ...lines].join(', '))
      .join('; '),
    width,
    height,
  }
}

// Counts written large, side by side, each under its name; where the pane is
// narrow, one under another, the name at the left and the count at the right.
export const figuresSvg = (figures: readonly { name: string; value: string }[], width = DASH_WIDTH) => {
  const slot = width / Math.max(1, figures.length)
  const isAcross = width >= ACROSS
  const height = isAcross ? 52 : 26 * figures.length
  const body = figures
    .map(({ name, value }, index) =>
      isAcross
        ? `<text x="${index * slot}" y="14" font-size="11" fill="${TRACK}">${escape(name)}</text><text class="v" x="${index * slot}" y="42" font-size="24" font-weight="600">${escape(value)}</text>`
        : `<text x="0" y="${18 + 26 * index}" font-size="12" fill="${TRACK}">${escape(name)}</text><text class="v" x="${width}" y="${19 + 26 * index}" font-size="19" font-weight="600" text-anchor="end">${escape(value)}</text>`,
    )
    .join('')

  return {
    source: svg(width, height, body),
    alt: figures.map(({ name, value }) => `${name} ${value}`).join(', '),
    width,
    height,
  }
}

// Where tokens went: one bar in parts, the most first, four named and the
// rest as one, with a line beneath for each part.
export const splitSvg = (title: string, parts: readonly { name: string; total: number }[], width = DASH_WIDTH) => {
  const named = parts.slice(0, PARTS.length)
  const rest = parts.slice(PARTS.length).reduce((sum, part) => sum + part.total, 0)
  const shown = rest > 0 ? [...named, { name: 'other', total: rest }] : named
  const whole = shown.reduce((sum, part) => sum + part.total, 0)
  const colour = (index: number) => PARTS[index] ?? TRACK
  let x = 0
  const bar = shown
    .map(({ total }, index) => {
      const wide = whole === 0 ? 0 : (width * total) / whole
      const drawn = `<rect x="${x.toFixed(1)}" y="18" width="${Math.max(0, wide - 2).toFixed(1)}" height="12" rx="3" fill="${colour(index)}"/>`

      x += wide

      return drawn
    })
    .join('')
  const legend = shown
    .map(
      ({ name, total }, index) =>
        `<rect x="0" y="${42 + 18 * index}" width="10" height="10" rx="2" fill="${colour(index)}"/><text class="v" x="16" y="${51 + 18 * index}" font-size="12">${escape(clip(name))}</text><text class="v" x="${width}" y="${51 + 18 * index}" font-size="12" text-anchor="end">${shortTokens(total)}</text>`,
    )
    .join('')
  const height = 40 + 18 * shown.length

  return {
    source: svg(width, height, `<text x="0" y="12" font-size="11" fill="${TRACK}">${escape(title)}</text>${bar}${legend}`),
    alt: `${title}: ${shown.map(({ name, total }) => `${name} ${shortTokens(total)}`).join(', ')}`,
    width,
    height,
  }
}
