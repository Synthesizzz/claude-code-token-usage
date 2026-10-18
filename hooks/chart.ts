import { shortTokens } from './cost'
import { DEFAULTS, TRACK } from './svg'
import type { Palette, Tone } from '../types'

// The pane's pictures: a week of tokens by day as bars, and a share as a bar
// filled that far. Images cannot name a theme key, so the greys and the
// crab's orange are ones that read on a dark and a light page.

const TODAY = '#d97757'
const SLOT = 40
const BAR = 28
const TALL = 58
const BASE = 64
const SHARE = 200

export const WEEK_PX = { width: SLOT * 7, height: 84 }
export const SHARE_PX = { width: SHARE, height: 10 }

// A bar a day, the tallest the full height, today's in the crab's colour.
// A day of nothing keeps a sliver, so the row of days still reads as a row.
export const weekSvg = (days: readonly { name: string; value: number }[], width = WEEK_PX.width) => {
  const top = Math.max(...days.map(day => day.value), 0)
  const last = days.length - 1
  const slot = width / 7
  const bar = Math.min(BAR * 1.5, slot * 0.7)
  const bars = days
    .map(({ name, value: amount }, index) => {
      const tall = Math.max(2, top === 0 ? 0 : (amount / top) * TALL)
      const x = index * slot + (slot - bar) / 2
      const isToday = index === last

      return [
        `<rect x="${x.toFixed(1)}" y="${(BASE - tall).toFixed(1)}" width="${bar.toFixed(1)}" height="${tall.toFixed(1)}" rx="3" fill="${isToday ? TODAY : TRACK}"${isToday ? '' : ' fill-opacity=".55"'}/>`,
        `<text x="${(x + bar / 2).toFixed(1)}" y="80" text-anchor="middle" font-size="11"${isToday ? ' font-weight="700"' : ''} fill="${TRACK}">${name}</text>`,
      ].join('')
    })
    .join('')

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${WEEK_PX.height}" viewBox="0 0 ${width} ${WEEK_PX.height}" font-family="Segoe UI, system-ui, sans-serif">${bars}</svg>`,
    alt: `Tokens per day, last 7 days: highest ${shortTokens(top)}, today ${shortTokens(days[last]?.value ?? 0)}`,
  }
}

export const shareSvg = (percent: number, palette: Palette = DEFAULTS, width = SHARE, tone: Tone = 'success') => {
  const filled = (width * Math.min(100, Math.max(0, percent))) / 100

  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">`,
      `<rect width="${width}" height="10" rx="5" fill="${TRACK}" fill-opacity=".28"/>`,
      filled > 0 ? `<rect width="${filled}" height="10" rx="5" fill="${palette[tone]}"/>` : '',
      '</svg>',
    ].join(''),
    alt: `${Math.round(percent)}% of input read from cache`,
  }
}
