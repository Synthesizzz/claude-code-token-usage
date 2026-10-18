import type { Motion, Palette } from '../types'
import { tone } from './usage'

// The vector figures of the surfaces that draw one: the context ring, with a
// dot that orbits the rim while a turn runs, and a window as a double ring or
// as a bar of cells.

const BOX = 26
const RADIUS = 9.5
const STROKE = 3.2
const ORBIT_MS = 1100
const PACE_BOX = 34
const BAR = 92
const BAR_HEIGHT = 22
const CELL_GAP = 2.5
// The pulse: a slow breath near a reset; at the reset a drain, then one ripple.
const BREATH = '1.8s'
const DRAIN = '.9s'
const RIPPLE = '1s ease-out .8s forwards'
const DOT = 8
// An image cannot name a theme key: these read on a dark and a light page,
// 3 to 1 on each.
export const DEFAULTS: Palette = {
  success: '#3a9a53',
  warning: '#b07f00',
  error: '#e04f63',
}
export const TRACK = '#8b919c'
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

// A colour goes into the markup as written: only a hex colour is let through.
export const isHex = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value)

export const paletteOf = (options: Readonly<Record<string, unknown>>): Palette => {
  const pick = (value: unknown, fallback: string) => (isHex(value) ? value : fallback)

  return {
    success: pick(options.colorOk, DEFAULTS.success),
    warning: pick(options.colorWarn, DEFAULTS.warning),
    error: pick(options.colorFull, DEFAULTS.error),
  }
}

const circle = (center: number, radius: number, width: number, attributes: string) =>
  `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke-width="${width}" ${attributes}/>`

const track = (center: number, radius: number, width: number) =>
  circle(center, radius, width, `stroke="${TRACK}" stroke-opacity=".28"`)

// Nothing is drawn at zero: a round cap on an empty dash is a dot.
const arc = (
  center: number,
  radius: number,
  width: number,
  percent: number | null,
  color: string,
  extra = 'stroke-linecap="round"',
) => {
  if (percent === null || percent <= 0) {
    return ''
  }

  const rim = 2 * Math.PI * radius
  const drawn = (rim * Math.min(100, percent)) / 100

  return circle(
    center,
    radius,
    width,
    `stroke="${color}" ${extra} stroke-dasharray="${drawn.toFixed(2)} ${rim.toFixed(2)}" transform="rotate(-90 ${center} ${center})"`,
  )
}

// A reader who asked for less motion sees the figure at rest: what only
// moves is held still, what only exists to move is not drawn.
const moving = (rules: string, still: string, gone: string) =>
  `<style>${rules}@media (prefers-reduced-motion:reduce){${still}{animation:none}${gone}{display:none}}</style>`

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`

const spent = (name: string, used: number, gone: number | null) =>
  `${name} ${Math.round(used)}% used${gone === null ? '' : `, ${Math.round(gone)}% of the window gone`}`

export const ringSvg = (
  percent: number | null,
  name: string,
  isWorking: boolean,
  palette: Palette = DEFAULTS,
) => {
  const center = BOX / 2
  const color = palette[tone(percent ?? 0)]
  const orbit = isWorking
    ? [
        `<style>.o{transform-origin:${center}px ${center}px;animation:o ${ORBIT_MS}ms linear infinite}`,
        '@keyframes o{to{transform:rotate(360deg)}}',
        '@media (prefers-reduced-motion:reduce){.o{animation:none}}</style>',
        `<circle class="o" cx="${center}" cy="${center - RADIUS}" r="2" fill="#fff" stroke="${color}"/>`,
      ].join('')
    : ''

  return {
    source: svg(
      BOX,
      BOX,
      `${track(center, RADIUS, STROKE)}${arc(center, RADIUS, STROKE, percent, color)}${orbit}`,
    ),
    alt: `${name} ${percent === null ? 'unknown' : `${Math.round(percent)}%`}`,
  }
}

// A window as two rings: what is used outside, the time gone inside. The
// outer arc ahead of the inner one is a window burning faster than its time.
export const paceSvg = (
  used: number,
  gone: number | null,
  name: string,
  palette: Palette = DEFAULTS,
  motion?: Motion,
) => {
  const center = PACE_BOX / 2
  const outer = (2 * Math.PI * 13.5).toFixed(2)
  const inner = (2 * Math.PI * 8).toFixed(2)
  const color = palette[tone(used)]
  const isNear = motion?.kind === 'near'
  const extras =
    motion?.kind === 'reset'
      ? [
          moving(
            `.o{animation:d ${DRAIN} ease-in forwards}@keyframes d{to{stroke-dasharray:0 ${outer}}}.i{animation:e ${DRAIN} ease-in forwards}@keyframes e{to{stroke-dasharray:0 ${inner}}}.r{transform-origin:${center}px ${center}px;animation:r ${RIPPLE}}@keyframes r{from{transform:scale(.35);opacity:.9}to{transform:scale(1);opacity:0}}`,
            '.none',
            '.o,.i,.r',
          ),
          // What was used, and the whole of the time, run out over the new
          // reading. A flat cap: a round one leaves a dot when the dash is gone.
          arc(center, 13.5, 3.4, motion.from, palette[tone(motion.from)], 'class="o"'),
          arc(center, 8, 2, 100, TRACK, 'class="i"'),
          circle(center, 14.5, 2, `class="r" stroke="${palette.success}" opacity="0"`),
        ]
      : isNear
        ? [moving(`.u{animation:b ${BREATH} ease-in-out infinite}@keyframes b{50%{opacity:.4}}`, '.u', '.none')]
        : []

  return {
    source: svg(
      PACE_BOX,
      PACE_BOX,
      [
        track(center, 13.5, 3.4),
        arc(center, 13.5, 3.4, used, color, `${isNear ? 'class="u" ' : ''}stroke-linecap="round"`),
        track(center, 8, 2),
        arc(center, 8, 2, gone, TRACK),
        ...extras,
      ].join(''),
    ),
    alt: spent(name, used, gone),
  }
}

// A window as a bar, a cell per hour or day: the fill is what is used, the
// tick is now.
export const barSvg = (
  cells: number,
  used: number,
  gone: number | null,
  name: string,
  palette: Palette = DEFAULTS,
  width: number = BAR,
  motion?: Motion,
) => {
  const cell = width / cells
  const span = cell - CELL_GAP
  const isNear = motion?.kind === 'near'
  const rect = (x: number, wide: number, fill: string) =>
    `<rect x="${x.toFixed(1)}" y="7" width="${wide.toFixed(1)}" height="8" rx="2.5" fill="${fill}"`
  // The cells lit up to a percentage, each as far as the fill reaches into it.
  const lit = (percent: number, fill: string, mark = '') => {
    const filled = (width * Math.min(100, Math.max(0, percent))) / 100

    return Array.from({ length: cells }, (_, index) => {
      const reach = Math.max(0, Math.min(span, filled - index * cell))

      return reach > 0 ? `${rect(index * cell, reach, fill)}${mark}/>` : ''
    }).join('')
  }
  const tracks = Array.from(
    { length: cells },
    (_, index) => `${rect(index * cell, span, TRACK)} fill-opacity=".28"/>`,
  ).join('')
  const at = gone === null ? null : Math.min(width - 1.5, Math.max(0, (width * gone) / 100 - 1))
  const now =
    at === null
      ? ''
      : `<rect x="${at.toFixed(1)}" y="3" width="2" height="16" rx="1" fill="${TRACK}" class="k"/>`
  const extras =
    motion?.kind === 'reset'
      ? [
          moving(
            `.o{transform-origin:0 0;animation:d ${DRAIN} ease-in forwards}@keyframes d{to{transform:scaleX(0)}}.k{animation:m ${DRAIN} ease-in}@keyframes m{from{transform:translateX(${(width - 1.5 - (at ?? 0)).toFixed(1)}px)}}.r{transform-origin:0 0;animation:r ${RIPPLE}}@keyframes r{from{transform:scaleX(.05);opacity:.9}to{transform:scaleX(1);opacity:0}}`,
            '.k',
            '.o,.r',
          ),
          // What was used runs out over the new reading, then one ripple.
          `<g class="o">${lit(motion.from, palette[tone(motion.from)])}</g>`,
          `${rect(0, width - CELL_GAP, palette.success)} class="r" opacity="0"/>`,
        ]
      : isNear
        ? [moving(`.u{animation:b ${BREATH} ease-in-out infinite}@keyframes b{50%{opacity:.4}}`, '.u', '.none')]
        : []

  return {
    source: svg(
      width,
      BAR_HEIGHT,
      [tracks, lit(used, palette[tone(used)], isNear ? ' class="u"' : ''), ...extras, now].join(''),
    ),
    alt: spent(name, used, gone),
  }
}

// A window as a dot in the colour of its level, for a layout of text alone.
export const dotSvg = (used: number, name: string, palette: Palette = DEFAULTS) => ({
  source: svg(
    DOT,
    DOT,
    `<circle cx="${DOT / 2}" cy="${DOT / 2}" r="${DOT / 2}" fill="${palette[tone(used)]}"/>`,
  ),
  alt: spent(name, used, null),
})
