import type { Mood, Notice, Palette, Tone } from '../types'
import { DEFAULTS, TRACK } from './svg'
import { tone } from './usage'

// The crab that brings a notice, and works at a laptop while a turn runs.
// Blocks on a grid of 16 by 12, after the creature in Claude Code's banner:
// a body of 8 by 6, two eyes, two arms that end in pincers, four legs. The
// pose, and the thing the crab has with it, say what the news is before the
// words are read.

const CRAB = '#d97757'
const EYE = '#1f1e1d'
const WATER = '#3f9be0'
const IRON = '#9aa0aa'
const SCREEN = '#14161a'
const WHITE = '#ffffff'
// A calendar's page, where a day is still to come.
const PAGE = '#d9dce1'
const WIDE = 16
const TALL = 12
// The laptop stands beside the crab and widens the drawing by this much; a
// post with a board or a barrier on it, by this much.
const DESK = 11.5
const POST = 7
// A block is three pixels where the crab brings news, two where the context
// ring was.
const NEWS_SCALE = 3
const WORK_SCALE = 2
export const CRAB_PX = { width: WIDE * NEWS_SCALE, height: TALL * NEWS_SCALE }
export const WORK_PX = { width: (WIDE + DESK) * WORK_SCALE, height: TALL * WORK_SCALE }
// The stage: the usage bar as the ground the crab walks on. Day letters under
// a weekly window's cells take this much more height; a calendar beside the
// weekly crab, this much more width.
export const STAGE_PX = { width: 208, height: 54 }
const LETTERS_PX = 10
const CALENDAR_PX = 22
const BAR = { left: 8, top: 40, length: 192 }
// The same creature in a terminal's blocks, each row as wide as the others.
export const CRAB_ROWS = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const

const MOODS: Record<Notice['kind'], Mood> = {
  half: 'half',
  near: 'near',
  full: 'jail',
  pace: 'pace',
  back: 'back',
  context: 'context',
  // A budget is a limit the person set: nearly spent sweats, spent is jail.
  budget: 'near',
  spent: 'jail',
  // The cache about to lapse: a reply now keeps it, so it sweats.
  cache: 'near',
}

export const moodOf = (kind: Notice['kind']) => MOODS[kind]

// A terminal colours text by the theme's levels alone: the crab of blocks
// takes the level of its news.
const TONES: Record<Notice['kind'], Tone> = {
  half: 'warning',
  near: 'error',
  full: 'error',
  pace: 'warning',
  back: 'success',
  context: 'warning',
  budget: 'warning',
  spent: 'error',
  cache: 'warning',
}

export const toneOf = (kind: Notice['kind']) => TONES[kind]

const block = (x: number, y: number, wide: number, tall: number, fill = CRAB, name = '') =>
  `<rect${name === '' ? '' : ` class="${name}"`} x="${x}" y="${y}" width="${wide}" height="${tall}" fill="${fill}"/>`

// An arm is a stub from the body and a pincer at its end: held out, raised,
// or drawn in. All are drawn for the left side; the right is their mirror.
const ARMS = {
  down: block(2, 6, 2, 2) + block(0, 5, 2, 1) + block(1, 6, 1, 1) + block(0, 7, 2, 1),
  up: block(2, 4, 2, 2) + block(0, 1, 1, 2) + block(2, 1, 1, 2) + block(0, 3, 3, 1),
  tucked: block(3, 6, 1, 2),
}
const EYES = {
  tall: block(6, 5, 1, 2, EYE) + block(9, 5, 1, 2, EYE),
  wide: block(5, 5, 2, 2, EYE) + block(9, 5, 2, 2, EYE),
  flat: block(5, 6, 2, 1, EYE) + block(9, 6, 2, 1, EYE),
  glad: block(5, 5, 2, 1, EYE) + block(9, 5, 2, 1, EYE),
  // Looking up and to the right, at what stands there.
  aside: block(7, 4, 1, 2, EYE) + block(10, 4, 1, 2, EYE),
}
const LEGS = [4, 6, 9, 11].map((x, index) => block(x, 9, 1, 2, CRAB, `l${index % 2}`)).join('')
const BODY = block(4, 3, 8, 6)

type Pose = {
  arms: readonly [keyof typeof ARMS, keyof typeof ARMS]
  // One pair of eyes, or several in turn: each drawn in a class of its own
  // (e0, e1, ...) for the pose's moves to show one at a time.
  eyes: keyof typeof EYES | readonly (keyof typeof EYES)[]
  // The left arm waves, or the whole crab leans into a run.
  isWaving?: boolean
  lean?: string
  // Blocks the drawing is wider than the crab, for what stands beside it, and
  // taller above it, for what rises off it.
  beside?: number
  above?: number
  // What moves, as the rules of a style sheet.
  moves: string
}

const SHAKE =
  '.all{animation:s 3s linear infinite}@keyframes s{0%,78%,100%{transform:none}82%,90%{transform:translateX(-.4px)}86%,94%{transform:translateX(.4px)}}'
const WAVE =
  '.w{transform-box:fill-box;transform-origin:100% 100%;animation:w .9s ease-in-out infinite}@keyframes w{50%{transform:rotate(-16deg)}}'
// One pair of legs taps: the crab is kept waiting.
const TAP = '.l1{animation:tp .5s steps(2,jump-none) infinite}@keyframes tp{50%{transform:translateY(-.7px)}}'
const POSES: Record<Mood, Pose> = {
  half: { arms: ['up', 'down'], eyes: 'tall', isWaving: true, moves: WAVE },
  near: {
    arms: ['down', 'down'],
    eyes: 'wide',
    moves:
      '.all{animation:s .22s linear infinite}@keyframes s{50%{transform:translateX(.3px)}}.dp{animation:f 1.1s ease-in infinite}@keyframes f{0%{opacity:0;transform:translateY(-1px)}30%{opacity:1}100%{opacity:0;transform:translateY(3px)}}',
  },
  jail: { arms: ['up', 'up'], eyes: 'flat', moves: SHAKE },
  pace: {
    arms: ['down', 'down'],
    eyes: 'tall',
    lean: 'skewX(-10) translate(1.2 0)',
    moves:
      '.l0{animation:a .28s steps(2,jump-none) infinite}.l1{animation:a .28s steps(2,jump-none) infinite reverse}@keyframes a{50%{transform:translateY(-1px)}}.all{animation:b .28s ease-in-out infinite}@keyframes b{50%{transform:translateY(-.4px)}}',
  },
  // A window back from its limit: the crab drinks a healing potion, plus
  // signs rise off it and a wash of the calm colour passes over its body.
  back: {
    arms: ['down', 'up'],
    eyes: 'glad',
    above: 2,
    moves:
      '.pt{transform-origin:13.5px 3.5px;animation:pt 2.4s ease-in-out infinite}@keyframes pt{0%,55%,100%{transform:none}20%,40%{transform:rotate(-28deg)}}.pl{animation:pl 1.8s ease-out infinite}.pm{animation-delay:.6s}.pn{animation-delay:1.2s}@keyframes pl{0%{opacity:0;transform:translateY(2px)}30%{opacity:1}100%{opacity:0;transform:translateY(-2px)}}.gl{animation:gl 2.4s ease-in-out infinite}@keyframes gl{0%,45%,100%{opacity:0}65%{opacity:.45}}.sw{animation:sw 2.4s ease-in infinite}@keyframes sw{0%,45%{opacity:0;transform:none}55%{opacity:.9}100%{opacity:0;transform:translateY(-7px)}}',
  },
  context: {
    arms: ['tucked', 'tucked'],
    eyes: 'tall',
    moves:
      '.all{transform-origin:8px 11px;animation:q 1.3s ease-in-out infinite}@keyframes q{50%{transform:scale(.8,1.06)}}.wl{animation:p 1.3s ease-in-out infinite}.wr{animation:r 1.3s ease-in-out infinite}@keyframes p{50%{transform:translateX(1.3px)}}@keyframes r{50%{transform:translateX(-1.3px)}}',
  },
  work: {
    arms: ['down', 'down'],
    eyes: 'tall',
    beside: DESK,
    moves:
      '.all{animation:b .36s steps(2,jump-none) infinite}@keyframes b{50%{transform:translateY(.35px)}}.c1,.c2,.c3{transform-box:fill-box;transform-origin:0 50%;animation:2.6s steps(5,jump-none) infinite}.c1{animation-name:t1}.c2{animation-name:t2}.c3{animation-name:t3}@keyframes t1{0%{transform:scaleX(0)}25%,100%{transform:scaleX(1)}}@keyframes t2{0%,25%{transform:scaleX(0)}55%,100%{transform:scaleX(1)}}@keyframes t3{0%,55%{transform:scaleX(0)}80%,100%{transform:scaleX(1)}}.cu{animation:k .7s steps(2,jump-none) infinite}@keyframes k{50%{opacity:.1}}',
  },
  // The task is done: a green board with a tick on a post, and a wave.
  done: {
    arms: ['up', 'down'],
    eyes: 'glad',
    isWaving: true,
    beside: POST,
    moves: `${WAVE}.bd{transform-box:fill-box;transform-origin:50% 100%;animation:bd 1.2s ease-in-out infinite}@keyframes bd{50%{transform:scale(1.08)}}`,
  },
  // A question waits: the crab scratches its head under a question mark.
  ask: {
    arms: ['up', 'down'],
    eyes: 'aside',
    isWaving: true,
    moves: `${WAVE}.qm{animation:qm 1s ease-in-out infinite}@keyframes qm{50%{transform:translateY(-.6px)}}`,
  },
  // Leave is needed to go on: the crab waits at a barrier that is shut.
  allow: {
    arms: ['down', 'down'],
    eyes: 'aside',
    beside: POST,
    moves: `${TAP}.gt{transform-box:fill-box;transform-origin:100% 50%;animation:gt 2.5s ease-in-out infinite}@keyframes gt{0%,80%,100%{transform:none}86%,94%{transform:rotate(-4deg)}90%{transform:rotate(2deg)}}`,
  },
  // Nothing to do yet: it breathes and looks ahead, then up at the figures
  // beside it, a blink between, and a pair of legs taps now and then.
  idle: {
    arms: ['down', 'down'],
    eyes: ['tall', 'aside', 'flat'],
    moves:
      '.all{transform-origin:8px 11px;animation:br 3.2s ease-in-out infinite}@keyframes br{50%{transform:scale(1,.96)}}.e0{animation:e0 8s steps(1,end) infinite}.e1{opacity:0;animation:e1 8s steps(1,end) infinite}.e2{opacity:0;animation:e2 8s steps(1,end) infinite}@keyframes e0{0%{opacity:1}44%{opacity:0}96%{opacity:1}}@keyframes e1{0%{opacity:0}46%{opacity:1}92%{opacity:0}}@keyframes e2{0%{opacity:0}44%{opacity:1}46%{opacity:0}92%{opacity:1}96%{opacity:0}}.l1{animation:tp 8s steps(1,end) infinite}@keyframes tp{0%,60%,64%,68%,100%{transform:none}62%,66%{transform:translateY(-.7px)}}',
  },
  // Waiting long after: asleep, breathing, two z's rising.
  sleep: {
    arms: ['tucked', 'tucked'],
    eyes: 'flat',
    moves:
      '.all{transform-origin:8px 11px;animation:br 2.4s ease-in-out infinite}@keyframes br{50%{transform:scale(1,.94)}}.sn{animation:sn 2.4s ease-in infinite}.so{animation-delay:1.2s}@keyframes sn{0%{opacity:0;transform:translate(-1px,1px)}40%{opacity:1}100%{opacity:0;transform:translate(1px,-1.5px)}}',
  },
}

// Five bars and two rails before the crab; one bar stands between its eyes.
const BARS =
  [1.5, 4.5, 7.5, 10.5, 13.5].map(x => block(x, 0.5, 1, 10.5, IRON)).join('') +
  block(1, 0.5, 14, 0.8, IRON) +
  block(1, 10.5, 14, 0.8, IRON)

// A laptop seen from the front, its screen filling with three lines of code.
const laptop = (palette: Palette) =>
  block(16, 2, 10, 7, IRON) +
  block(16.7, 2.7, 8.6, 5.6, SCREEN) +
  block(17.5, 3.5, 5, 0.8, palette.success, 'c1') +
  block(17.5, 5, 6.5, 0.8, WATER, 'c2') +
  block(17.5, 6.5, 3.5, 0.8, palette.warning, 'c3') +
  block(21.6, 6.5, 0.8, 0.8, '#fff', 'cu') +
  block(14.5, 9, 13, 1.2, IRON)

// A plus sign of the kind that rises off what is healed.
const plus = (x: number, y: number, fill: string, name: string) =>
  `<g class="${name}">${block(x, y + 1, 3, 1, fill)}${block(x + 1, y, 1, 3, fill)}</g>`

// The potion in the raised claw, and what it does: at rest the plus signs
// stand and the wash is not there, so a still picture still says "healed".
const potion = (palette: Palette) =>
  `<g class="pt">${block(14, 0, 1, 1.2, IRON)}${block(13, 1.2, 3, 2.8, palette.error)}${block(13.5, 1.7, 0.8, 0.8, WHITE)}</g>` +
  `<rect class="gl" x="4" y="3" width="8" height="6" fill="${palette.success}" opacity="0"/>` +
  `<rect class="sw" x="3" y="9" width="10" height="0.6" fill="${WHITE}" opacity="0"/>` +
  plus(0.5, 0.5, palette.success, 'pl') +
  plus(5.5, -2, palette.success, 'pl pm') +
  plus(9.5, -0.8, palette.success, 'pl pn')

// A z, as a sleeper breathes them out.
const zed = (x: number, y: number, size: number, name: string) =>
  `<g class="${name}">${block(x, y, 3 * size, 0.8 * size, IRON)}${block(x + size, y + 0.9 * size, size, 0.8 * size, IRON)}${block(x, y + 1.8 * size, 3 * size, 0.8 * size, IRON)}</g>`

// What stands around the crab in a pose: drawn over it, and not moved with it.
const around = (mood: Mood, palette: Palette) => {
  switch (mood) {
    case 'near':
      return block(12.5, 1, 1, 1.5, WATER, 'dp')
    case 'jail':
      return BARS
    case 'back':
      return potion(palette)
    case 'context':
      return block(0, 2, 1, 9, TRACK, 'wl') + block(15, 2, 1, 9, TRACK, 'wr')
    case 'work':
      return laptop(palette)
    case 'done':
      return (
        block(18.5, 6.5, 1, 4.5, IRON) +
        `<g class="bd">${block(15.5, 0.5, 7, 6, palette.success)}${[
          [17, 3.2],
          [18, 4.2],
          [19, 3.2],
          [20, 2.2],
        ]
          .map(([x = 0, y = 0]) => block(x, y, 1, 1, WHITE))
          .join('')}</g>`
      )
    case 'ask':
      return `<g class="qm">${block(13, 0, 3, 1, palette.warning)}${block(15, 1, 1, 1, palette.warning)}${block(14, 2, 1, 1, palette.warning)}${block(14, 4, 1, 1, palette.warning)}</g>`
    case 'allow':
      return (
        block(20.5, 4, 1.5, 7, IRON) +
        `<g class="gt">${[13, 14.5, 16, 17.5, 19]
          .map((x, index) => block(x, 4.5, 1.5, 1.4, index % 2 === 0 ? palette.error : WHITE))
          .join('')}</g>`
      )
    case 'sleep':
      return zed(12.5, 0, 1, 'sn') + zed(10.4, 1.2, 0.6, 'sn so')
    default:
      return ''
  }
}

// The crab in a pose, in blocks: what it is made of, how it moves, and the
// room it takes.
const drawn = (mood: Mood, palette: Palette) => {
  const { arms, eyes, isWaving, lean, beside = 0, above = 0, moves } = POSES[mood]
  const left = isWaving === true ? `<g class="w">${ARMS[arms[0]]}</g>` : ARMS[arms[0]]
  const right = `<g transform="translate(${WIDE} 0) scale(-1 1)">${ARMS[arms[1]]}</g>`
  const looks = typeof eyes === 'string' ? EYES[eyes] : eyes.map((name, index) => `<g class="e${index}">${EYES[name]}</g>`).join('')
  const crab = `<g class="all">${left}${right}${BODY}${looks}${LEGS}</g>`

  return {
    wide: WIDE + beside,
    above,
    moves,
    art: `${lean === undefined ? crab : `<g transform="${lean}">${crab}</g>`}${around(mood, palette)}`,
  }
}

// A reader who asked for less motion sees every part where it rests.
const styled = (moves: string) =>
  `<style>${moves}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`

// The crab in a pose, on its own.
export const crabSvg = (mood: Mood, alt: string, palette: Palette = DEFAULTS) => {
  const { wide, above, moves, art } = drawn(mood, palette)
  const scale = mood === 'work' ? WORK_SCALE : NEWS_SCALE
  const tall = TALL + above

  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${wide * scale}" height="${tall * scale}" viewBox="0 ${-above} ${wide} ${tall}" shape-rendering="crispEdges">`,
      styled(moves),
      art,
      '</svg>',
    ].join(''),
    alt,
  }
}

// The crab where the ring is, at the size it works at its laptop, so the row
// keeps its height.
const atRing = (mood: Mood, alt: string, palette: Palette) => {
  const { wide, above, moves, art } = drawn(mood, palette)
  const tall = TALL + above

  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${wide * WORK_SCALE}" height="${tall * WORK_SCALE}" viewBox="0 ${-above} ${wide} ${tall}" shape-rendering="crispEdges">`,
      styled(moves),
      art,
      '</svg>',
    ].join(''),
    alt,
    width: wide * WORK_SCALE,
    height: tall * WORK_SCALE,
  }
}

// Asleep: after a pause, and in quiet hours.
export const napSvg = (alt: string, palette: Palette = DEFAULTS) => atRing('sleep', alt, palette)

// Standing by, between a turn and its nap.
export const idleSvg = (alt: string, palette: Palette = DEFAULTS) => atRing('idle', alt, palette)

const tenth = (value: number) => Number(value.toFixed(1))
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_MS = 24 * 60 * 60_000

// What the crab stands on for a window: a cell an hour for the 5-hour window
// and a day for the weekly one, as the bars layout draws them; where now is
// in it, in percent; and, for the weekly one, the day each cell is.
export type Ground = { cells: number; gone: number | null; days: readonly string[] | null }

// The weekday of each cell of a window that ends at `resetsAt`, read at the
// cell's middle in the person's own time; null while the reset is not known.
export const daysOf = (resetsAt: string | null, cells: number) => {
  const end = resetsAt === null ? Number.NaN : Date.parse(resetsAt)

  if (Number.isNaN(end)) {
    return null
  }

  return Array.from(
    { length: cells },
    (_, index) => LETTERS[new Date(end - (cells - index - 0.5) * DAY_MS).getDay()] ?? '',
  )
}

// A calendar page beside the weekly crab: a red binding, and a pip a day, the
// days gone dark.
const calendar = (gone: number | null, palette: Palette) => {
  const past = gone === null ? 0 : Math.round((Math.min(100, Math.max(0, gone)) / 100) * 7)
  const pips = Array.from({ length: 7 }, (_, index) =>
    block(
      tenth(0.9 + (index % 4) * 1.3),
      tenth(2.6 + Math.floor(index / 4) * 1.5),
      0.9,
      0.9,
      index < past ? EYE : PAGE,
    ),
  ).join('')

  return `<g class="cal">${block(0, 0, 6.2, 6, IRON)}${block(0.3, 1.3, 5.6, 4.4, WHITE)}${block(0, 0, 6.2, 1.2, palette.error)}${pips}</g>`
}

// The floor of the stage: one bar, or a window's cells with now marked on them
// and, for the weekly window, its days under them.
const floor = (reach: number, fill: string, ground: Ground | null) => {
  if (ground === null) {
    return [
      `<rect x="${BAR.left}" y="${BAR.top}" width="${BAR.length}" height="6" rx="3" fill="${TRACK}" fill-opacity=".28"/>`,
      reach > 0
        ? `<rect x="${BAR.left}" y="${BAR.top}" width="${tenth(reach)}" height="6" rx="3" fill="${fill}"/>`
        : '',
    ].join('')
  }

  const cell = BAR.length / ground.cells
  const span = cell - 3
  const cells = Array.from({ length: ground.cells }, (_, index) => {
    const x = tenth(BAR.left + index * cell)
    const lit = Math.max(0, Math.min(span, reach - index * cell))
    const day = ground.days?.[index]

    return [
      `<rect x="${x}" y="${BAR.top}" width="${tenth(span)}" height="6" rx="2" fill="${TRACK}" fill-opacity=".28"/>`,
      lit > 0 ? `<rect x="${x}" y="${BAR.top}" width="${tenth(lit)}" height="6" rx="2" fill="${fill}"/>` : '',
      day === undefined
        ? ''
        : `<text x="${tenth(x + span / 2)}" y="61" text-anchor="middle" font-size="10" font-family="Segoe UI, system-ui, sans-serif" fill="${TRACK}">${day}</text>`,
    ].join('')
  }).join('')
  // Now, in the window's own time: lit cells ahead of it are burning faster
  // than the time goes.
  const now =
    ground.gone === null
      ? ''
      : `<rect x="${tenth(BAR.left + (BAR.length * Math.min(100, Math.max(0, ground.gone))) / 100 - 1)}" y="35" width="2" height="16" rx="1" fill="${TRACK}"/>`

  return cells + now
}

// The crab on the usage bar: it stands where the usage is, having walked on
// from the left (`in`), and walks off to the right when its time is up
// (`out`). The bar is lit that far in the colour of its level. A window's
// notice stands on that window's ground; the weekly crab has its calendar.
export const stageSvg = (
  mood: Mood,
  percent: number,
  alt: string,
  palette: Palette = DEFAULTS,
  phase: 'in' | 'out' | 'still' = 'still',
  ground: Ground | null = null,
) => {
  const { wide, moves, art } = drawn(mood, palette)
  const hasLetters = ground !== null && ground.days !== null
  const hasCalendar = ground !== null && ground.cells === 7
  const width = STAGE_PX.width
  const height = STAGE_PX.height + (hasLetters ? LETTERS_PX : 0)
  const crab = wide * NEWS_SCALE
  const span = crab + (hasCalendar ? CALENDAR_PX : 0)
  const reach = (BAR.length * Math.min(100, Math.max(0, percent))) / 100
  // Its middle over the end of what is lit, and never off the stage.
  const at = tenth(Math.max(0, Math.min(width - span, BAR.left + reach - CRAB_PX.width / 2)))
  // Its feet, a block above the foot of its grid, on the bar.
  const top = BAR.top + NEWS_SCALE - CRAB_PX.height
  // The ground the crab comes up through: nothing below it is drawn.
  const surface = BAR.top + NEWS_SCALE
  const below = CRAB_PX.height
  // It comes: it peeks up out of the ground, looks left and right, pops up
  // with a squash, and sways on its feet until it leaves.
  const walk = {
    in:
      `.zw{transform-box:fill-box;transform-origin:50% 100%;animation:zw 1.6s cubic-bezier(.3,.7,.3,1) both}` +
      `@keyframes zw{0%{transform:translateY(${below}px)}35%{transform:translateY(${below / 2}px)}` +
      `50%{transform:translateY(${below / 2}px) rotate(-6deg)}65%{transform:translateY(${below / 2}px) rotate(6deg)}` +
      `80%{transform:translateY(-6px) scale(.96,1.06)}90%{transform:translateY(0) scale(1.06,.94)}100%{transform:none}}` +
      `.zh{transform-box:fill-box;transform-origin:50% 100%;animation:zh 1s ease-in-out 1.6s infinite}` +
      `@keyframes zh{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}`,
    out: `.zw{animation:zo .6s ease-in forwards}@keyframes zo{to{transform:translateX(${tenth(width - at + 4)}px)}}.zh{animation:zh .2s ease-in-out 3}@keyframes zh{50%{transform:translateY(-2px)}}`,
    still: '',
  }[phase]
  const page = hasCalendar
    ? `<g transform="translate(${tenth(at + crab + 2)} 19) scale(${NEWS_SCALE})" shape-rendering="crispEdges">${calendar(ground.gone, palette)}</g>`
    : ''

  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      styled(moves + walk),
      floor(reach, palette[tone(percent)], ground),
      phase === 'in'
        ? `<clipPath id="zc"><rect x="0" y="0" width="${width}" height="${surface}"/></clipPath><g clip-path="url(#zc)">`
        : '',
      `<g class="zw"><g class="zh"><g transform="translate(${at} ${top}) scale(${NEWS_SCALE})" shape-rendering="crispEdges">${art}</g>${page}</g></g>`,
      phase === 'in' ? '</g>' : '',
      '</svg>',
    ].join(''),
    alt,
    width,
    height,
  }
}

// The crab a terminal draws with its news where the band has the rows: half
// blocks, two pixels to a cell, so it stands twice as fine as the block
// characters, its body in the crab's colour and its eyes dark. `o` is the
// body, `e` an eye.
const PIXELS = [
  '....oooooooo....',
  '....oooooooo....',
  '...ooooooooooo..',
  '.ooooeeooeeoooo.',
  '.o.oooooooooo.o.',
  '...oooooooooo...',
  '....o.o..o.o....',
  '....o.o..o.o....',
] as const

export const SHARP_CRAB_ROWS = PIXELS.length / 2

export type CrabRun = { text: string; color: string | null; backgroundColor: string | null }

export const crabCells = (body: string = CRAB, eye: string = EYE): CrabRun[][] => {
  const paint = (pixel: string | undefined) => (pixel === 'o' ? body : pixel === 'e' ? eye : null)
  const rows: CrabRun[][] = []

  for (let y = 0; y < PIXELS.length; y += 2) {
    const runs: CrabRun[] = []

    for (let x = 0; x < (PIXELS[0]?.length ?? 0); x += 1) {
      const top = paint(PIXELS[y]?.[x])
      const low = paint(PIXELS[y + 1]?.[x])
      const cell: CrabRun =
        top === null && low === null
          ? { text: ' ', color: null, backgroundColor: null }
          : top === null
            ? { text: '▄', color: low, backgroundColor: null }
            : { text: '▀', color: top, backgroundColor: low }
      const before = runs.at(-1)

      if (before !== undefined && before.color === cell.color && before.backgroundColor === cell.backgroundColor) {
        before.text += cell.text
      } else {
        runs.push(cell)
      }
    }

    rows.push(runs)
  }

  return rows
}

// A subagent's crab, dressed for its job: the same crab, a hat for the job,
// and while it works the job's tool beside it, moving as the work goes.
// Done, a tick badge pops over the hat and the crab holds its tool up;
// after a while it sleeps in its hat; failed, it sweats, the hat askew.
export type Job = 'explorer' | 'architect' | 'builder' | 'reviewer' | 'scientist' | 'librarian' | 'other'
export type JobPhase = 'work' | 'done' | 'sleep' | 'fail'

// The job read off the agent's type by its words, the first that matches:
// `Explore` explores, `Plan` draws plans, `claude-code-guide` keeps books.
const JOBS: readonly (readonly [Job, RegExp])[] = [
  ['explorer', /explor|search|find|scout/i],
  ['architect', /plan|architect|design/i],
  ['reviewer', /review|audit|lint|critic/i],
  ['scientist', /test|verif|qa|eval|bench/i],
  ['librarian', /guide|doc|librar|writ/i],
  ['builder', /general|build|implement|code|engineer|dev|fix/i],
]

export const jobOf = (type: string): Job => JOBS.find(([, words]) => words.test(type))?.[0] ?? 'other'

// The colour a job's chip and bar take in the pane.
export const JOB_COLORS: Record<Job, string> = {
  explorer: '#7cc4ff',
  architect: '#c9a6ff',
  builder: '#ffcf6b',
  reviewer: '#86efac',
  scientist: '#9be7ff',
  librarian: '#c4b5fd',
  other: '#fca5a5',
}

const WOOD = '#8a6a3a'
const SAND = '#c8a165'
const PAPER = '#f4f1ea'
const GLASS = '#bfe9ff'
const GOLD = '#ffc107'
const outline = (x: number, y: number, wide: number, tall: number, stroke: string, width = 0.5) =>
  `<rect x="${x}" y="${y}" width="${wide}" height="${tall}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`
const faint = (x: number, y: number, wide: number, tall: number, fill: string, opacity: number, name = '') =>
  `<rect${name === '' ? '' : ` class="${name}"`} x="${x}" y="${y}" width="${wide}" height="${tall}" fill="${fill}" opacity="${opacity}"/>`

// What each job wears, over the body: a hat, or glasses where the face says it.
const HATS: Record<Job, string> = {
  explorer: block(5, 0.6, 6, 1.8, '#d8b779') + block(5, 1.9, 6, 0.5, WOOD) + block(3, 2.4, 10, 0.8, SAND),
  architect:
    outline(4.8, 4.6, 2.6, 2.6, '#e6e8ec', 0.45) +
    outline(8.6, 4.6, 2.6, 2.6, '#e6e8ec', 0.45) +
    block(7.4, 5.6, 1.2, 0.4, '#e6e8ec') +
    block(4, 0.8, 8, 0.6, '#3b82f6') +
    block(5, 0.4, 6, 0.6, '#60a5fa'),
  builder: block(4.5, 0.8, 7, 2, GOLD) + block(3, 2.6, 10, 0.7, '#e0a800') + block(7.5, 0.3, 1, 0.6, '#ffd54f'),
  reviewer: block(4, 2.1, 8, 0.9, '#2f8f5b') + block(4, 2.9, 9.5, 0.5, '#1f6b42'),
  scientist:
    block(4, 5.1, 8, 0.5, '#5a5f68') +
    faint(4.8, 4.5, 2.8, 2.6, '#9be7ff', 0.55) +
    faint(8.4, 4.5, 2.8, 2.6, '#9be7ff', 0.55) +
    outline(4.8, 4.5, 2.8, 2.6, '#5a5f68', 0.4) +
    outline(8.4, 4.5, 2.8, 2.6, '#5a5f68', 0.4),
  librarian:
    outline(4.8, 4.8, 2.6, 2.2, SAND, 0.45) +
    outline(8.6, 4.8, 2.6, 2.2, SAND, 0.45) +
    block(7.4, 5.6, 1.2, 0.4, SAND) +
    block(5.5, 1.6, 5, 1.4, '#7c3aed') +
    block(4.5, 2.6, 7, 0.5, '#5b21b6'),
  other: block(4, 3, 8, 0.9, '#e5484d') + block(12, 3.3, 1.6, 0.7, '#e5484d') + block(12.6, 4, 0.8, 1, '#c53035'),
}

// The tool beside the crab while it works, how wide the drawing then is,
// and how the tool moves.
const TOOLS: Record<Job, { art: (palette: Palette) => string; wide: number; moves: string }> = {
  explorer: {
    art: () => `<g class="tl">${outline(16.6, 2.6, 4.2, 4.2, IRON, 0.8)}${faint(17, 3, 3.4, 3.4, GLASS, 0.45)}${block(20.2, 6.2, 1, 3.2, WOOD)}</g>`,
    wide: 24,
    moves: '.tl{animation:mg 1.4s ease-in-out infinite}@keyframes mg{0%,100%{transform:none}50%{transform:translate(1.6px,.6px)}}',
  },
  architect: {
    art: () =>
      block(16, 2, 8, 7, '#1d4ed8') +
      [3.2, 5, 6.8].map(y => block(16.6, y, 6.8, 0.2, '#93c5fd')).join('') +
      block(16.8, 7.4, 6, 0.5, WHITE, 'ln') +
      `<g class="pc">${block(22.4, 6.2, 0.8, 1.6, GOLD)}${block(22.4, 7.8, 0.8, 0.4, EYE)}</g>`,
    wide: 24,
    moves:
      '.ln{transform-box:fill-box;transform-origin:0 50%;animation:ln 2.4s steps(6,jump-none) infinite}@keyframes ln{0%{transform:scaleX(0)}80%,100%{transform:scaleX(1)}}.pc{animation:pc 2.4s steps(6,jump-none) infinite}@keyframes pc{0%{transform:translateX(-5.6px)}80%,100%{transform:none}}',
  },
  builder: {
    art: () => block(16, 9.6, 7, 1, IRON) + block(19.3, 8.2, 0.5, 1.4, WHITE) + `<g class="hm">${block(18.6, 2.6, 1, 5.4, WOOD)}${block(17, 1.8, 4.2, 1.8, IRON)}</g>`,
    wide: 24,
    moves: '.hm{transform-origin:19.1px 8px;animation:hm .7s ease-in infinite}@keyframes hm{0%,100%{transform:rotate(-38deg)}55%{transform:rotate(4deg)}65%{transform:none}}',
  },
  reviewer: {
    art: palette =>
      block(16, 1.6, 7, 8.6, SAND) +
      block(16.7, 2.6, 5.6, 7, PAPER) +
      block(18.5, 1, 2, 1, IRON) +
      [3.6, 5.4, 7.2].map((y, index) => block(17.4, y, 2.6, 0.5, IRON) + block(20.6, y - 0.4, 1, 1, palette.success, `t${index + 1}`)).join(''),
    wide: 24,
    moves:
      '.t1,.t2,.t3{animation:2.4s steps(1,jump-none) infinite}.t1{animation-name:a1}.t2{animation-name:a2}.t3{animation-name:a3}@keyframes a1{0%{opacity:0}20%,100%{opacity:1}}@keyframes a2{0%,40%{opacity:0}45%,100%{opacity:1}}@keyframes a3{0%,65%{opacity:0}70%,100%{opacity:1}}',
  },
  scientist: {
    art: palette =>
      faint(18.4, 1, 1.8, 3, '#cfe8ff', 0.8) +
      faint(17, 4, 4.6, 5.4, '#cfe8ff', 0.7) +
      block(17.4, 6, 3.8, 3, palette.success) +
      block(18, 7, 0.8, 0.8, '#b6f5c4', 'bb') +
      block(19.6, 7.6, 0.6, 0.6, '#b6f5c4', 'bb b2'),
    wide: 24,
    moves: '.bb{animation:bb 1.3s ease-in infinite}.b2{animation-delay:.6s}@keyframes bb{0%{opacity:0;transform:none}30%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}',
  },
  librarian: {
    art: () =>
      block(16, 4, 4, 5, PAPER) +
      block(20.4, 4, 4, 5, PAPER) +
      block(20, 4, 0.4, 5, WOOD) +
      [5, 6.2, 7.4].map(y => block(16.6, y, 2.8, 0.3, IRON) + block(21, y, 2.8, 0.3, IRON)).join('') +
      block(20.4, 4, 4, 5, '#e7e1d3', 'pg'),
    wide: 24.5,
    moves:
      '.pg{transform-box:fill-box;transform-origin:0 50%;animation:pg 2.2s ease-in-out infinite}@keyframes pg{0%,40%{transform:scaleX(1)}70%{transform:scaleX(-1)}100%{transform:scaleX(-1);opacity:0}}',
  },
  other: {
    art: palette =>
      block(16, 2, 10, 7, IRON) +
      block(16.7, 2.7, 8.6, 5.6, SCREEN) +
      block(17.5, 3.5, 5, 0.8, palette.success, 'c1') +
      block(17.5, 5, 6.5, 0.8, WATER, 'c2') +
      block(14.5, 9, 13, 1.2, IRON),
    wide: 27.5,
    moves:
      '.c1,.c2{transform-box:fill-box;transform-origin:0 50%;animation:2.4s steps(5,jump-none) infinite}.c1{animation-name:t1}.c2{animation-name:t2}@keyframes t1{0%{transform:scaleX(0)}40%,100%{transform:scaleX(1)}}@keyframes t2{0%,40%{transform:scaleX(0)}80%,100%{transform:scaleX(1)}}',
  },
}

// The tool held up in the raised claw when the work is done.
const HELD: Record<Job, (palette: Palette) => string> = {
  explorer: () => `${outline(12.6, -2.6, 3.2, 3.2, IRON, 0.6)}${faint(13, -2.2, 2.4, 2.4, GLASS, 0.5)}${block(14.9, 0.4, 0.8, 1.6, WOOD)}`,
  architect: () => `${block(12.4, -2.8, 4, 3.6, '#1d4ed8')}${[-2, -0.8].map(y => block(12.8, y, 3.2, 0.2, '#93c5fd')).join('')}${block(12.8, 0.2, 3, 0.3, WHITE)}`,
  builder: () => `${block(13.8, -2, 0.8, 3.8, WOOD)}${block(12.6, -2.8, 3.2, 1.4, IRON)}`,
  reviewer: palette => `${block(12.4, -3, 4, 4.6, SAND)}${block(12.9, -2.4, 3, 3.6, PAPER)}${block(13.4, -1.6, 1, 1, palette.success)}${block(13.4, -0.2, 1, 1, palette.success)}`,
  scientist: palette => `${block(13.6, -3, 1.2, 1.6, '#cfe8ff')}${faint(12.8, -1.4, 2.8, 3, '#cfe8ff', 0.8)}${block(13, -0.2, 2.4, 1.6, palette.success)}`,
  librarian: () => `${block(12.2, -1.8, 2.2, 3, '#7c3aed')}${block(14.4, -1.8, 2.2, 3, '#7c3aed')}${block(14.2, -1.8, 0.4, 3, PAPER)}`,
  other: palette => `${block(12.2, -2, 4.6, 3, IRON)}${block(12.6, -1.6, 3.8, 2.2, SCREEN)}${block(13, -1, 2, 0.4, palette.success)}`,
}

const sparkle = (x: number, y: number, name: string) =>
  `<g class="${name}">${block(x, y + 0.5, 1.6, 0.5, GOLD)}${block(x + 0.55, y, 0.5, 1.6, GOLD)}</g>`

const JOB_MOVES: Record<JobPhase, string> = {
  work: '.all{animation:b .36s steps(2,jump-none) infinite}@keyframes b{50%{transform:translateY(.35px)}}',
  // The badge pops up and stays; the tool bobs in the claw; sparkles blink.
  done:
    '.bg{transform-box:fill-box;transform-origin:50% 100%;animation:bg 2.6s cubic-bezier(.3,1.6,.5,1) infinite}@keyframes bg{0%{transform:scale(0);opacity:0}16%,88%{transform:none;opacity:1}100%{transform:none;opacity:0}}.hd{animation:hd 1.6s ease-in-out infinite}@keyframes hd{50%{transform:translateY(-.6px)}}.sk{transform-box:fill-box;transform-origin:50% 50%;animation:sk 1.6s ease-in-out infinite}.s2{animation-delay:.8s}@keyframes sk{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:none}}',
  sleep:
    '.all{transform-origin:8px 11px;animation:br 2.4s ease-in-out infinite}@keyframes br{50%{transform:scale(1,.94)}}.sn{animation:sn 2.4s ease-in infinite}.so{animation-delay:1.2s}@keyframes sn{0%{opacity:0;transform:translate(-1px,1px)}40%{opacity:1}100%{opacity:0;transform:translate(1px,-1.5px)}}',
  fail:
    '.all{animation:s .22s linear infinite}@keyframes s{50%{transform:translateX(.3px)}}.dp{animation:f 1.1s ease-in infinite}@keyframes f{0%{opacity:0;transform:translateY(-1px)}30%{opacity:1}100%{opacity:0;transform:translateY(3px)}}',
}

// The badge of a job done: a green disc with a white tick, over the hat.
const badge = (palette: Palette) =>
  `<g class="bg"><rect x="5.2" y="-5.6" width="5.6" height="4.6" rx="2.3" fill="${palette.success}"/>${[
    [6.6, -3.4],
    [7.4, -2.6],
    [8.2, -3.4],
    [9, -4.2],
  ]
    .map(([x = 0, y = 0]) => block(x, y, 0.9, 0.9, WHITE))
    .join('')}</g>`

// The crab of a job in a phase, at the size it works at in the band.
export const jobCrabSvg = (job: Job, phase: JobPhase, alt: string, palette: Palette = DEFAULTS) => {
  const tool = TOOLS[job]
  const arms: readonly [keyof typeof ARMS, keyof typeof ARMS] =
    phase === 'done' ? ['down', 'up'] : phase === 'sleep' ? ['tucked', 'tucked'] : ['down', 'down']
  const eyes: keyof typeof EYES = phase === 'done' ? 'glad' : phase === 'sleep' ? 'flat' : phase === 'fail' ? 'wide' : 'tall'
  const hat = phase === 'fail' ? `<g transform="rotate(-10 8 3)">${HATS[job]}</g>` : HATS[job]
  const crab = `<g class="all">${ARMS[arms[0]]}<g transform="translate(${WIDE} 0) scale(-1 1)">${ARMS[arms[1]]}</g>${BODY}${EYES[eyes]}${LEGS}${hat}</g>`
  const wide = phase === 'work' ? tool.wide : phase === 'done' ? WIDE + 1.5 : WIDE
  const above = phase === 'done' ? 6 : 1
  const extra =
    phase === 'work'
      ? tool.art(palette)
      : phase === 'done'
        ? `${badge(palette)}<g class="hd">${HELD[job](palette)}</g>${sparkle(1, -1.5, 'sk')}${sparkle(15.6, 2.6, 'sk s2')}`
        : phase === 'fail'
          ? block(12.5, 1, 1, 1.5, WATER, 'dp')
          : zed(12.5, -0.4, 1, 'sn') + zed(10.4, 0.6, 0.6, 'sn so')
  const moves = phase === 'work' ? JOB_MOVES.work + tool.moves : JOB_MOVES[phase]
  const tall = TALL + above

  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${wide * WORK_SCALE}" height="${tall * WORK_SCALE}" viewBox="0 ${-above} ${wide} ${tall}" shape-rendering="crispEdges">`,
      styled(moves),
      crab,
      extra,
      '</svg>',
    ].join(''),
    alt,
    width: wide * WORK_SCALE,
    height: tall * WORK_SCALE,
  }
}
