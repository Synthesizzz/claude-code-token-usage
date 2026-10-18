import type {
  LabelSet,
  Layout,
  Notify,
  Palette,
  PaletteName,
  Part,
  Quiet,
  Style,
  Tone,
} from '../types'
import { DEFAULTS, isHex, paletteOf } from './svg'
import { brief, short, title } from './usage'

// How the band looks, and the words of `/tokens` that change it.

export const LAYOUTS: readonly Layout[] = ['rings', 'bars', 'compact', 'frames', 'stack']
// Every palette holds a contrast of 3 to 1 on a light page as on a dark one.
export const PALETTES: Record<PaletteName, Palette> = {
  classic: DEFAULTS,
  ocean: { success: '#1d8fc4', warning: '#9a62e6', error: '#e03c6e' },
  sunset: { success: '#c17d0e', warning: '#e5583f', error: '#d0447f' },
  // Two greys and a red: only a window at its limit takes a colour.
  mono: { success: '#727b88', warning: '#858b95', error: '#e04f63' },
  forest: { success: '#2f9e5f', warning: '#b8860b', error: '#d9482b' },
  berry: { success: '#8b6fe8', warning: '#d457b0', error: '#e0385a' },
  ice: { success: '#1b9bc2', warning: '#5b84e6', error: '#e0524f' },
  ember: { success: '#bd8210', warning: '#dd6b20', error: '#d63a3a' },
  mint: { success: '#139c93', warning: '#b98309', error: '#e05574' },
  // Blue, amber and vermilion: told apart with the common colour blindnesses.
  safe: { success: '#3d8fd1', warning: '#b98309', error: '#d55e00' },
  // Bluish green, reddish purple and vermilion, after Okabe and Ito: told
  // apart with every common colour blindness, blue and yellow's too.
  okabe: { success: '#0f9270', warning: '#c35d97', error: '#cf5f00' },
}
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]
// The palettes by kind, for the picker: each is in one group.
export const PALETTE_GROUPS: readonly { heading: string; names: readonly PaletteName[] }[] = [
  { heading: 'Colour', names: ['classic', 'ocean', 'sunset', 'forest', 'berry', 'ice', 'ember', 'mint'] },
  { heading: 'Grey', names: ['mono'] },
  { heading: 'Colour-blind safe', names: ['safe', 'okabe'] },
]
export const LABEL_SETS: readonly LabelSet[] = ['auto', 'short', 'long', 'caps', 'thai']
export const PARTS: readonly Part[] = ['context', 'countdown', 'forecast', 'cost', 'alerts', 'crab', 'breakdown']
// Not part of a look: a preset neither sets these nor is unmade by them.
const APART: readonly Part[] = ['alerts', 'crab', 'breakdown']
export const NOTIFY: readonly Notify[] = ['both', 'app', 'windows']
// A preset is a look: where alerts go is not part of one.
export const PRESETS: Record<string, Pick<Style, 'layout' | 'palette' | 'labels' | 'hidden'>> = {
  classic: { layout: 'rings', palette: 'classic', labels: 'auto', hidden: [] },
  timeline: { layout: 'bars', palette: 'classic', labels: 'short', hidden: [] },
  quiet: { layout: 'compact', palette: 'mono', labels: 'short', hidden: ['cost'] },
  neon: { layout: 'rings', palette: 'ocean', labels: 'long', hidden: [] },
  split: { layout: 'stack', palette: 'sunset', labels: 'long', hidden: [] },
}

const LEVELS: Record<string, Tone> = { ok: 'success', warn: 'warning', full: 'error' }
const TONES: readonly Tone[] = ['success', 'warning', 'error']
const THAI = [
  { prefix: 'five_hour', name: '5 ชม.' },
  { prefix: 'seven_day', name: 'สัปดาห์' },
]
// The notification outside the app, set under `alerts`: `alerts popup off`.
const OUTSIDE = ['popup', 'privacy', 'quiet'] as const
// The words of /tokens: the few used every day first, then the settings by
// what they do, a line each, then the checks.
const HELP = [
  '/tokens words:',
  '  main: (nothing) for the usage pane, style for its buttons, agents, context, list, help',
  'settings, most also a button in /tokens style:',
  `  look: a preset (${Object.keys(PRESETS).join(', ')}), layout <${LAYOUTS.join('|')}>, palette <${PALETTE_NAMES.join('|')}>, color <${Object.keys(LEVELS).join('|')}> <#hex>, color background <#hex|off>, labels <${LABEL_SETS.join('|')}>`,
  `  parts: show|hide <${PARTS.join('|')}>`,
  `  alerts: alerts <on|off|${NOTIFY.join('|')}>, alerts 60 <on|off>, alerts popup <on|off>, alerts privacy <on|off>, alerts quiet <from-to|off>`,
  '  budgets: budget <dollars a day|off>, budget week <dollars|off>, budget month <dollars|off>, budget project <name|here> <dollars|off>',
  '  data: export, tidy [now], reset',
  'checks:',
  '  alerts test [week|cache|lapsed]',
].join('\n')
const POINTER = '/tokens help lists the words'

const among = <T extends string>(names: readonly T[], word: unknown): word is T =>
  typeof word === 'string' && names.some(name => name === word)

export const defaults = (options: Readonly<Record<string, unknown>>): Style => {
  const chosen = paletteOf(options)

  return {
    layout: among(LAYOUTS, options.style) ? options.style : 'rings',
    palette: 'classic',
    // Only what the options change: an untouched level follows the palette.
    colors: Object.fromEntries(
      TONES.filter(level => chosen[level] !== DEFAULTS[level]).map(level => [
        level,
        chosen[level],
      ]),
    ),
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
  }
}

const isHour = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23

const quietOf = (value: unknown): Quiet | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { from, to } = value as Record<string, unknown>

  return isHour(from) && isHour(to) && from !== to ? { from, to } : null
}

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

// How far white text stands out from a hex colour, as WCAG reckons it; below
// 4.5:1 it reads poorly.
const READABLE = 4.5

const contrastWithWhite = (hex: string) => {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits
  const channel = (at: number) => {
    const value = parseInt(full.slice(at, at + 2), 16) / 255

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)

  return 1.05 / (luminance + 0.05)
}

const isBudget = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

// What the store hands back is anything at all: a style, or nothing.
export const sane = (value: unknown): Style | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { layout, palette, colors, labels, hidden, notify, hasEarlyAlert, budget, weekBudget, monthBudget, projectBudgets, isPrivate, quiet, hasPopup, background } =
    value as Record<string, unknown>

  if (!among(LAYOUTS, layout) || !among(PALETTE_NAMES, palette) || !among(LABEL_SETS, labels)) {
    return null
  }

  const held = (typeof colors === 'object' && colors !== null ? colors : {}) as Record<
    string,
    unknown
  >

  return {
    layout,
    palette,
    colors: Object.fromEntries(
      TONES.filter(level => isHex(held[level])).map(level => [level, held[level]]),
    ),
    labels,
    hidden: Array.isArray(hidden) ? PARTS.filter(part => hidden.includes(part)) : [],
    // A style kept before alerts had a place has neither: the defaults stand.
    notify: among(NOTIFY, notify) ? notify : 'both',
    hasEarlyAlert: hasEarlyAlert === true,
    // A style kept before budgets had a place has none.
    budget: isBudget(budget) ? budget : null,
    weekBudget: isBudget(weekBudget) ? weekBudget : null,
    monthBudget: isBudget(monthBudget) ? monthBudget : null,
    projectBudgets: Object.fromEntries(
      Object.entries(typeof projectBudgets === 'object' && projectBudgets !== null ? projectBudgets : {}).filter(
        (entry): entry is [string, number] => isBudget(entry[1]),
      ),
    ),
    // A style kept before privacy and quiet hours had a place has the defaults.
    isPrivate: isPrivate !== false,
    quiet: quietOf(quiet),
    // A style kept before the popup had a place has it on.
    hasPopup: hasPopup !== false,
    // A style kept before backgrounds had a place has none.
    background: isHex(background) ? background : null,
  }
}

export const paletteFor = (style: Style): Palette => ({
  ...PALETTES[style.palette],
  ...style.colors,
})

export const presetOf = (style: Style) =>
  Object.keys(PRESETS).find(name => {
    const preset = PRESETS[name]

    return (
      preset !== undefined &&
      preset.layout === style.layout &&
      preset.palette === style.palette &&
      preset.labels === style.labels &&
      preset.hidden.join() === style.hidden.filter(part => !APART.includes(part)).join() &&
      Object.keys(style.colors).length === 0
    )
  })

// The words a drawing uses: a window's name by the label set, and the three
// words beside the figures. `auto` is the short set where a layout is tight.
export const words = (style: Style) => {
  const set =
    style.labels !== 'auto'
      ? style.labels
      : style.layout === 'bars' || style.layout === 'compact'
        ? 'short'
        : 'long'
  const name = (kind: string) => {
    if (set === 'thai') {
      return THAI.find(({ prefix }) => kind.startsWith(prefix))?.name ?? kind
    }

    if (set === 'caps') {
      const known = short(kind)

      return known === kind ? kind : known.toUpperCase()
    }

    return set === 'short' ? brief(kind) : title(kind)
  }

  return {
    name,
    context: set === 'caps' ? 'CTX' : 'context',
    used: set === 'thai' ? 'ใช้ไป' : 'used',
    left: set === 'thai' ? 'เหลือ' : 'left',
  }
}

const describe = (style: Style) => {
  const preset = presetOf(style)
  const custom = Object.keys(style.colors).length > 0 ? ' with custom colours' : ''

  return [
    preset === undefined ? null : `preset ${preset}`,
    `layout ${style.layout}`,
    `palette ${style.palette}${custom}`,
    `labels ${style.labels}`,
    style.hidden.length === 0 ? 'all parts shown' : `hidden ${style.hidden.join(', ')}`,
    style.hidden.includes('alerts')
      ? null
      : `alerts to ${style.notify}${style.hasEarlyAlert ? ' from 60%' : ''}`,
    style.budget === null ? null : `budget $${style.budget.toFixed(2)} a day`,
    style.weekBudget === null ? null : `budget $${style.weekBudget.toFixed(2)} a week`,
    style.monthBudget === null ? null : `budget $${style.monthBudget.toFixed(2)} a month`,
    ...Object.entries(style.projectBudgets).map(([name, amount]) => `budget $${amount.toFixed(2)} a day for ${name}`),
    style.isPrivate ? null : 'privacy off',
    style.quiet === null ? null : `quiet ${hour(style.quiet.from)} to ${hour(style.quiet.to)}`,
    style.hasPopup ? null : 'popup off',
    style.background === null ? null : `background ${style.background}`,
  ]
    .filter(line => line !== null)
    .join(', ')
}

export type Outcome =
  | { style: Style; text: string }
  | { reset: true; text: string }
  | { open: 'usage' | 'style' | 'context' | 'agents' }
  | { text: string; isList?: true; isTest?: true; isWeek?: true; isCache?: true; isLapsed?: true }
  | { export: true }
  | { tidy: boolean }

// What `/tokens <args>` asks for, given the style in force.
export const apply = (style: Style, args: string): Outcome => {
  const [first = '', second = '', third = ''] = args.trim().split(/\s+/)
  const word = first.toLowerCase()
  const value = second.toLowerCase()
  const unknown = { text: `Unknown: "${args.trim()}". ${POINTER}; /tokens style has a button for each.` }

  if (word === '') {
    return { open: 'usage' }
  }

  if (word === 'style') {
    return { open: 'style' }
  }

  // `context` alone opens the pane of what fills it; `hide context` (or, as
  // before, `context off`) hides the part.
  if (word === 'context' && value === '') {
    return { open: 'context' }
  }

  if (word === 'agents') {
    return { open: 'agents' }
  }

  if (word === 'help') {
    return { text: HELP }
  }

  if (word === 'export') {
    return { export: true }
  }

  if (word === 'tidy' && (value === '' || value === 'now')) {
    return { tidy: value === 'now' }
  }

  if (word === 'list') {
    return { text: `Now: ${describe(style)}. ${POINTER}.`, isList: true }
  }

  if (word === 'reset') {
    return { reset: true, text: 'Style reset to the defaults.' }
  }

  const preset = Object.hasOwn(PRESETS, word) ? PRESETS[word] : undefined

  if (preset !== undefined && value === '') {
    return {
      // Alerts and the crab switched off stay off: a look does not turn them back on.
      style: {
        ...style,
        ...preset,
        hidden: PARTS.filter(
          part => preset.hidden.includes(part) || (APART.includes(part) && style.hidden.includes(part)),
        ),
        colors: {},
      },
      text: `Style: ${word}.`,
    }
  }

  const layout = word === 'layout' ? value : value === '' ? word : ''

  if (among(LAYOUTS, layout)) {
    return { style: { ...style, layout }, text: `Layout: ${layout}.` }
  }

  if (word === 'palette' && among(PALETTE_NAMES, value)) {
    return { style: { ...style, palette: value, colors: {} }, text: `Palette: ${value}.` }
  }

  if ((word === 'color' || word === 'colour') && value === 'background') {
    if (third === 'off') {
      return { style: { ...style, background: null }, text: 'Background: off.' }
    }

    if (!isHex(third)) {
      return { text: 'A background is a hex colour, or off: color background #1f3b2d.' }
    }

    const ratio = contrastWithWhite(third)

    return {
      style: { ...style, background: third },
      text:
        ratio < READABLE
          ? `Background: ${third}. White text reads poorly on it (${ratio.toFixed(1)}:1); a darker colour reads better.`
          : `Background: ${third}.`,
    }
  }

  if (word === 'color' || word === 'colour') {
    const level = Object.hasOwn(LEVELS, value) ? LEVELS[value] : undefined

    if (level === undefined || !isHex(third)) {
      return { text: 'A colour is a level and a hex colour: color warn #c084fc.' }
    }

    return {
      style: { ...style, colors: { ...style.colors, [level]: third } },
      text: `Colour ${value}: ${third}.`,
    }
  }

  if (word === 'labels' && among(LABEL_SETS, value)) {
    return { style: { ...style, labels: value }, text: `Labels: ${value}.` }
  }

  if (word === 'alerts' && value === 'test') {
    const which = third.toLowerCase()

    // The cache's own notices, to see their buttons and hints at once: a
    // press does what it says.
    if (which === 'cache') {
      return { text: 'Test cache warning raised: its buttons stand for two minutes, and a press does what it says.', isTest: true, isCache: true }
    }

    if (which === 'lapsed') {
      return { text: 'The band shows a lapsed cache for a minute: its buttons do what they say.', isTest: true, isLapsed: true }
    }

    return which === 'week'
      ? { text: 'Test alert raised for the weekly window.', isTest: true, isWeek: true }
      : { text: 'Test alert raised.', isTest: true }
  }

  if (word === 'alerts' && among(NOTIFY, value)) {
    return { style: { ...style, notify: value }, text: `Alerts go to: ${value}.` }
  }

  if (word === 'alerts' && value === '60' && (third === 'on' || third === 'off')) {
    return {
      style: { ...style, hasEarlyAlert: third === 'on' },
      text: `Alert at 60%: ${third}.`,
    }
  }

  // `budget project <name> <dollars|off>`: the name may have spaces, and
  // `here` is the session's own folder, put in before the words come here.
  if (word === 'budget' && value === 'project') {
    const rest = args.trim().split(/\s+/).slice(2)
    const last = (rest.at(-1) ?? '').toLowerCase()
    const name = rest.slice(0, -1).join(' ')
    const amount = Number(last)
    const others = Object.fromEntries(Object.entries(style.projectBudgets).filter(([held]) => held !== name))

    if (name === '' || (last !== 'off' && !isBudget(amount))) {
      return { text: 'A project budget is a name and dollars a day, or off: budget project here 5.' }
    }

    return last === 'off'
      ? { style: { ...style, projectBudgets: others }, text: `budget for ${name}: off.` }
      : { style: { ...style, projectBudgets: { ...others, [name]: amount } }, text: `budget: $${amount.toFixed(2)} a day for ${name}.` }
  }

  if (word === 'budget' && value === 'month') {
    const amount = Number(third)

    if (third.toLowerCase() === 'off') {
      return { style: { ...style, monthBudget: null }, text: 'monthly budget: off.' }
    }

    return third !== '' && isBudget(amount)
      ? { style: { ...style, monthBudget: amount }, text: `budget: $${amount.toFixed(2)} a month.` }
      : { text: 'A monthly budget is dollars a month, or off: budget month 200.' }
  }

  if (word === 'budget' && value === 'week') {
    const amount = Number(third)

    if (third.toLowerCase() === 'off') {
      return { style: { ...style, weekBudget: null }, text: 'weekly budget: off.' }
    }

    return third !== '' && isBudget(amount)
      ? { style: { ...style, weekBudget: amount }, text: `budget: $${amount.toFixed(2)} a week.` }
      : { text: 'A weekly budget is dollars a week, or off: budget week 50.' }
  }

  if (word === 'budget') {
    const amount = Number(value)

    if (value === 'off') {
      return { style: { ...style, budget: null }, text: 'budget: off.' }
    }

    return value !== '' && isBudget(amount)
      ? { style: { ...style, budget: amount }, text: `budget: $${amount.toFixed(2)} a day.` }
      : { text: 'A budget is dollars a day, or off: budget 10.' }
  }

  // `alerts popup off`; the word on its own, as before, still works.
  const [outside, setting] = word === 'alerts' && among(OUTSIDE, value) ? [value, third.toLowerCase()] : [word, value]

  if (outside === 'privacy') {
    return setting === 'on' || setting === 'off'
      ? { style: { ...style, isPrivate: setting === 'on' }, text: `privacy: ${setting}.` }
      : { text: 'Privacy is on or off: alerts privacy off.' }
  }

  if (outside === 'popup') {
    return setting === 'on' || setting === 'off'
      ? { style: { ...style, hasPopup: setting === 'on' }, text: `popup: ${setting}.` }
      : { text: 'The popup is on or off: alerts popup off.' }
  }

  // `quiet` alone is the preset, met above; with hours it is quiet hours.
  if (outside === 'quiet') {
    if (setting === 'off') {
      return { style: { ...style, quiet: null }, text: 'quiet: off.' }
    }

    const [, from, to] = /^(\d{1,2})-(\d{1,2})$/.exec(setting) ?? []
    const quiet = quietOf({ from: Number(from), to: Number(to) })

    return from !== undefined && quiet !== null
      ? { style: { ...style, quiet }, text: `quiet: ${hour(quiet.from)} to ${hour(quiet.to)}.` }
      : { text: 'Quiet hours run from one hour of the day to another, or off: alerts quiet 22-8.' }
  }

  // `show|hide <part>`; `<part> on|off`, as before, still works.
  const [part, state] = word === 'show' || word === 'hide' ? [value, word === 'show' ? 'on' : 'off'] : [word, value]

  if (among(PARTS, part) && (state === 'on' || state === 'off')) {
    const others = style.hidden.filter(held => held !== part)

    return {
      // Kept in the order the parts are listed, so two styles compare alike.
      style: {
        ...style,
        hidden: state === 'on' ? others : PARTS.filter(held => held === part || others.includes(held)),
      },
      text: `${part}: ${state}.`,
    }
  }

  return unknown
}
