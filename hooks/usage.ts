import type { Band, Limit, Quiet, RingCell, Sample, Snapshot } from '../types'

// What a measurement says, read with care: the hook API is early access and
// what Claude Code hands a mod changes between releases. What is not in the
// shape this mod knows is left out and named in `unread`, never drawn as NaN;
// a part left out (null) keeps what was shown before.
export type Reading = {
  context: { tokens: number | null; window: number; percent: number | null } | null
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[] | null
  usd: number | null
  unread: string[]
}

const isFigure = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
// A figure that may be absent: absent is null, anything else unreadable.
const optional = (value: unknown) => (value === undefined || value === null ? null : isFigure(value) ? value : undefined)

const readContext = (context: unknown): Reading['context'] => {
  if (!isObject(context) || !isFigure(context.window) || context.window === 0) {
    return null
  }

  const tokens = optional(context.tokens)
  const percent = optional(context.percent)

  return tokens === undefined || percent === undefined ? null : { tokens, window: context.window, percent }
}

const readLimits = (limits: unknown) => {
  if (!Array.isArray(limits)) {
    return { limits: null, isWhole: false }
  }

  const read = limits.flatMap(limit =>
    isObject(limit) && typeof limit.kind === 'string' && isFigure(limit.percentUsed)
      ? [
          {
            kind: limit.kind,
            percentUsed: limit.percentUsed,
            resetsAt:
              typeof limit.resetsAt === 'string' && Number.isFinite(Date.parse(limit.resetsAt))
                ? limit.resetsAt
                : null,
          },
        ]
      : [],
  )

  return { limits: limits.length > 0 && read.length === 0 ? null : read, isWhole: read.length === limits.length }
}

export const readReading = (context: unknown, rateLimits: unknown, cost: unknown): Reading => {
  const known = readContext(context)
  const windows = readLimits(rateLimits)
  // A cost that is there says its dollars; one without them is a shape unknown.
  const usd = cost === undefined ? null : isObject(cost) && isFigure(cost.usd) ? cost.usd : undefined

  return {
    context: known,
    limits: windows.limits,
    usd: usd ?? null,
    unread: [
      known === null ? 'context' : null,
      windows.isWhole ? null : 'rateLimits',
      usd === undefined ? 'cost' : null,
    ].filter(name => name !== null),
  }
}

// What the band says of the parts it could not read, or nothing.
export const unreadLine = (unread: readonly string[]) =>
  unread.length === 0
    ? null
    : `token-usage can't read ${unread.join(', ')} from this Claude Code: figures may be old`

// A hook of this mod that failed: which, why, and when.
export type Failure = { event: string; message: string; at: number }

// Said for ten minutes after a hook failed, then let go.
const FAILED_MS = 10 * 60_000
const SAID_CHARS = 80

export const failedLine = (failure: Failure | null, at: number) =>
  failure === null || at - failure.at > FAILED_MS
    ? null
    : `token-usage: ${failure.event} failed: ${failure.message}`.slice(0, SAID_CHARS)

const MINUTE_MS = 60_000
const WINDOW_MS = 30 * MINUTE_MS
const MIN_SPAN_MS = 5 * MINUTE_MS
const MAX_SAMPLES = 60
// Half an hour of slope says little about a day: no forecast further out.
const HORIZON_MS = 5 * 60 * MINUTE_MS
const GAP = 3
// The two levels a window passes on its way up: `tone` paints by them and a
// climb past one is what an alert reports.
export const WARN_AT = 60
export const FULL_AT = 85
// How long each window is, and what it is counted in; a kind not listed here
// has no known length.
const WINDOWS = [
  { prefix: 'five_hour', ms: 5 * 60 * MINUTE_MS, cells: 5, title: '5-hour', brief: '5h' },
  { prefix: 'seven_day', ms: 7 * 24 * 60 * MINUTE_MS, cells: 7, title: 'Weekly', brief: 'Week' },
]
const PIES = ['○', '◔', '◑', '◕', '●']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The climbs of the context a forecast of it is read from.
const CLIMBS = 3
// The rim, clockwise from the top left: row, then cell within the row.
const RIM = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [2, 3],
  [2, 2],
  [2, 1],
  [2, 0],
  [1, 0],
] as const

const clamp = (percent: number) => Math.min(100, Math.max(0, percent))

export const pie = (percent: number) =>
  PIES[Math.round(clamp(percent) / 25)] ?? '○'

export const countdown = (ms: number) => {
  const minutes = Math.floor(ms / MINUTE_MS)

  if (minutes < 1) {
    return '<1m'
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

const pad = (value: number) => String(value).padStart(2, '0')

// A moment as the clock of the day says it, with its weekday where that is
// not the day of `now`.
export const clockAt = (at: number, now: number) => {
  const date = new Date(at)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  return date.toDateString() === new Date(now).toDateString()
    ? clock
    : `${WEEKDAYS[date.getDay()] ?? ''} ${clock}`
}

export const isQuiet = (quiet: Quiet | null, at: number) => {
  if (quiet === null) {
    return false
  }

  const hour = new Date(at).getHours()

  return quiet.from < quiet.to
    ? hour >= quiet.from && hour < quiet.to
    : hour >= quiet.from || hour < quiet.to
}

// How many more turns the context takes before it is full, by its last
// climbs; null with too few turns to say, or none climbing. A fall is a
// compaction: only the turns after it count.
export const turnsLeft = (percents: readonly number[]) => {
  const fell = percents.findLastIndex(
    (percent, index) => index > 0 && percent < (percents[index - 1] ?? 0),
  )
  const recent = (fell === -1 ? percents : percents.slice(fell)).slice(-(CLIMBS + 1))
  const first = recent[0]
  const last = recent.at(-1)

  if (first === undefined || last === undefined || recent.length < 2) {
    return null
  }

  const climb = (last - first) / (recent.length - 1)

  return climb <= 0 ? null : Math.max(0, Math.floor((100 - last) / climb))
}

export const record = (samples: readonly Sample[], next: Sample): Sample[] => {
  const last = samples.at(-1)

  // A lower reading is a new window: the old slope says nothing about it.
  if (last !== undefined && next.percent < last.percent) {
    return [next]
  }

  if (last !== undefined && next.percent === last.percent) {
    return [...samples]
  }

  return [...samples, next]
    .filter(sample => sample.at >= next.at - WINDOW_MS)
    .slice(-MAX_SAMPLES)
}

export const etaMs = (samples: readonly Sample[], now: number) => {
  const recent = samples.filter(sample => sample.at >= now - WINDOW_MS)
  const first = recent[0]
  const last = recent.at(-1)

  if (first === undefined || last === undefined || last.percent >= 100) {
    return null
  }

  const span = now - first.at
  const growth = last.percent - first.percent

  if (span < MIN_SPAN_MS || growth < 1) {
    return null
  }

  return Math.round(((100 - last.percent) * span) / growth)
}

const label = (percent: number | null) => {
  if (percent === null) {
    return '--'
  }

  return percent >= 100 ? '!!' : String(Math.round(percent)).padStart(2)
}

export const ring = (percent: number | null): RingCell[][] => {
  const lit = Math.round(clamp(percent ?? 0) / 10)
  const rows: RingCell[][] = [
    [...'⢀⠤⠤⡀'].map(text => ({ text, kind: 'off' })),
    [
      { text: '⡇', kind: 'off' },
      { text: label(percent), kind: 'label' },
      { text: '⢸', kind: 'off' },
    ],
    [...'⠈⠒⠒⠁'].map(text => ({ text, kind: 'off' })),
  ]

  for (const [row, cell] of RIM.slice(0, lit)) {
    const target = rows[row]?.[cell]

    if (target !== undefined) {
      target.kind = 'on'
    }
  }

  return rows
}

export const tone = (percent: number) =>
  percent >= FULL_AT ? 'error' : percent >= WARN_AT ? 'warning' : 'success'

export const short = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind

const windowOf = (kind: string) =>
  WINDOWS.find(({ prefix }) => kind.startsWith(prefix))

export const title = (kind: string) => windowOf(kind)?.title ?? kind

export const brief = (kind: string) => windowOf(kind)?.brief ?? kind

export const cellsOf = (kind: string) => windowOf(kind)?.cells ?? 1

export const percentage = (percent: number | null) =>
  (percent === null ? '--' : `${Math.round(percent)}%`).padStart(4)

export const remaining = (limit: Limit, now: number) =>
  limit.resetsAt === null ? null : Date.parse(limit.resetsAt) - now

// The share of its window a limit has spent, from the time left to its reset.
export const elapsed = (limit: Limit, now: number) => {
  const left = remaining(limit, now)
  const length = windowOf(limit.kind)?.ms

  return left === null || length === undefined
    ? null
    : clamp(100 - (left / length) * 100)
}

// A reading this far under the one before is a new window, not a correction.
const RESET_DROP = 10

export const hasReset = (was: Limit | undefined, limit: Limit) =>
  was !== undefined && limit.percentUsed < was.percentUsed - RESET_DROP

// The windows that reset between two readings, with how full each had been.
export const resets = (before: Snapshot | null, after: Snapshot) =>
  after.limits.flatMap(limit => {
    const was = before?.limits.find(({ kind }) => kind === limit.kind)

    return was !== undefined && hasReset(was, limit)
      ? [{ kind: limit.kind, from: was.percentUsed }]
      : []
  })

// A window a day long or more, read at its own pace so far: what it has used
// over the share of it gone. Half a day in, the pace is one to go by.
const LONG_MS = 24 * 60 * MINUTE_MS
const SETTLED_MS = 12 * 60 * MINUTE_MS

const windowPace = (limit: Limit, now: number) => {
  const length = windowOf(limit.kind)?.ms
  const left = remaining(limit, now)

  if (length === undefined || length < LONG_MS || left === null || limit.percentUsed <= 0) {
    return null
  }

  const gone = length - left

  if (gone < SETTLED_MS) {
    return null
  }

  const eta = ((100 - limit.percentUsed) / limit.percentUsed) * gone

  return eta < left ? Math.round(eta) : null
}

export const forecast = (limit: Limit, now: number) => {
  const eta = etaMs(limit.samples, now)
  const left = remaining(limit, now)

  if (eta === null || eta >= HORIZON_MS || (left !== null && eta >= left)) {
    // Half an hour of slope says little about a week: its own pace says more.
    return windowPace(limit, now)
  }

  return eta
}

// The columns a terminal band takes, as drawn.
export const bandWidth = (band: Band) => width(band)

const width = ({ limits, eta, cost }: Band) =>
  [
    1 + 1 + 3 + 1 + 4,
    ...limits.map(
      ({ label, left }) =>
        1 + 1 + label.length + 1 + 4 + (left === null ? 0 : 1 + left.length),
    ),
    ...(eta === null ? [] : [eta.length]),
    ...(cost === null ? [] : [cost.length]),
  ].reduce((sum, part) => sum + part + GAP, -GAP)

// `cost` is what the band says of money, where that is not the session's
// own total.
export const layout = (
  usage: Snapshot,
  now: number,
  columns: number,
  cost?: string | null,
): Band => {
  const urgent = usage.limits
    .map(limit => ({ limit, eta: forecast(limit, now) }))
    .filter(({ eta }) => eta !== null)
    .sort((a, b) => (a.eta ?? 0) - (b.eta ?? 0))[0]
  // A 5-hour window this full says when a big task can start, in the
  // forecast's place: by then the forecast says little more.
  const crowded = usage.limits.find(
    limit => limit.kind.startsWith('five_hour') && limit.percentUsed >= FULL_AT,
  )
  const back = crowded === undefined ? null : remaining(crowded, now)
  const full: Band = {
    limits: usage.limits.map(limit => {
      const left = remaining(limit, now)

      return {
        label: short(limit.kind).toUpperCase(),
        glyph: pie(limit.percentUsed),
        tone: tone(limit.percentUsed),
        percent: percentage(limit.percentUsed),
        // Held at one width, known or not, so a reading never shifts the row.
        left: (left === null ? '--' : countdown(left)).padEnd(5),
      }
    }),
    eta:
      back !== null && back > 0
        ? `big task? after ${clockAt(now + back, now)}`
        : urgent === undefined || urgent.eta === null
          ? null
          : `↗ ${short(urgent.limit.kind).toUpperCase()} full in ${countdown(urgent.eta)}`,
    cost: cost !== undefined ? cost : usage.usd === null ? null : `$${usage.usd.toFixed(2)}`,
  }
  // What a narrowing band gives up, in order; the context fill is never one.
  const steps: ((band: Band) => Band)[] = [
    band => ({ ...band, cost: null }),
    band => ({ ...band, eta: null }),
    band => ({
      ...band,
      limits: band.limits.map(limit => ({ ...limit, left: null })),
    }),
    ...usage.limits.map(() => (band: Band) => ({
      ...band,
      limits: band.limits.slice(0, -1),
    })),
  ]
  let band = full

  for (const step of steps) {
    if (width(band) <= columns) {
      break
    }

    band = step(band)
  }

  return band
}

// A terminal bar of eighths: each cell as full as its share of the
// percentage, and the cell of the time gone in the window marked (none
// where that time is unknown). Neighbouring cells of one kind go as one run.
const EIGHTHS = ' ▏▎▍▌▋▊▉█'

export const eighths = (percent: number | null, gone: number | null, cells: number) => {
  const filled = ((percent ?? 0) / 100) * cells
  const at = gone === null ? -1 : Math.min(cells - 1, Math.max(0, Math.floor((gone / 100) * cells)))
  const each = Array.from({ length: cells }, (_, index) => {
    const part = Math.max(0, Math.min(1, filled - index))

    return { text: EIGHTHS[Math.round(part * 8)] ?? ' ', isNow: index === at }
  })

  return each.reduce<{ text: string; isNow: boolean }[]>((merged, cell) => {
    const before = merged.at(-1)

    return before !== undefined && before.isNow === cell.isNow
      ? [...merged.slice(0, -1), { ...before, text: before.text + cell.text }]
      : [...merged, cell]
  }, [])
}

// How many cells a terminal bar takes in the room a row has left once all
// it says fits: the bars come last, so they never cost a figure or a word.
// A bar stands for the context's glyph and beside it, and in place of each
// window's glyph; none where even the shortest does not fit.
export const barCellsFor = (spare: number, windows: number) =>
  [10, 8, 6].find(cells => cells + 1 + (cells - 1) * windows <= spare) ?? 0
