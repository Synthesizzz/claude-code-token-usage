import type { Alerted, Notice, Snapshot, Weight } from '../types'
import { shortTokens } from './cost'
import { FULL_AT, WARN_AT, WEIGHT, countdown, forecast, hasReset, remaining, title } from './usage'

// What in a reading is worth telling the person, given what they were told
// already. Each line is news once per window.

const LEVELS = [WARN_AT, FULL_AT, 100]
const CONTEXT_AT = 80
const CONTEXT = 'context'
const NOTHING = { levels: [], hasPace: false }

// Gravest first: of several notices at once, the one the crab brings.
const GRAVITY: readonly Notice['kind'][] = [
  'full',
  'spent',
  'near',
  'budget',
  'pace',
  'context',
  'back',
  'half',
]

export const loudest = (notices: readonly Notice[]) =>
  GRAVITY.map(kind => notices.find(notice => notice.kind === kind)).find(
    notice => notice !== undefined,
  ) ?? null

// A context is crowded at the full size, or at 80% of a window smaller than
// that, whichever comes first; with the weight off, at 80% alone.
export const isCrowded = (tokens: number | null, percent: number | null, weight: Weight | null) =>
  (weight !== null && tokens !== null && tokens >= weight.full) || (percent !== null && percent >= CONTEXT_AT)

export const review = (
  before: Snapshot | null,
  after: Snapshot,
  memory: Alerted,
  now: number,
  hasEarlyAlert: boolean,
  weight: Weight | null = WEIGHT,
) => {
  const next: Alerted = {}
  const notices: Notice[] = []

  for (const limit of after.limits) {
    const was = before?.limits.find(({ kind }) => kind === limit.kind)
    const name = `${title(limit.kind)} window`
    const percent = Math.round(limit.percentUsed)
    const left = remaining(limit, now)
    const reset = left === null ? null : countdown(left)
    const told = memory[limit.kind] ?? NOTHING
    const isNew = hasReset(was, limit)
    const held = isNew ? NOTHING : told
    const passed = LEVELS.filter(level => limit.percentUsed >= level)
    const top = passed.filter(level => !held.levels.includes(level)).at(-1)
    const eta = forecast(limit, now)
    const bar = {
      name,
      value: Math.min(1, percent / 100),
      label: `${percent}%`,
      status: reset === null ? '' : `resets in ${reset}`,
    }

    // A first reading is where the person came in: nothing in it is news.
    const isFirst = was === undefined

    if (isFirst) {
      next[limit.kind] = { levels: passed, hasPace: eta !== null }
      continue
    }

    if (isNew && told.levels.includes(FULL_AT)) {
      notices.push({
        kind: 'back',
        title: `${name} reset`,
        text: 'The full allowance is back.',
        line: `${name} reset: the full allowance is back`,
        bar,
        window: limit.kind,
      })
    } else if (top === 100) {
      notices.push({
        kind: 'full',
        title: `${title(limit.kind)} limit reached`,
        text: reset === null ? '' : `Back in ${reset}.`,
        line: `${title(limit.kind)} limit reached${reset === null ? '' : `, back in ${reset}`}`,
        bar,
        window: limit.kind,
      })
    } else if (top !== undefined && (top !== WARN_AT || hasEarlyAlert)) {
      notices.push({
        kind: top === WARN_AT ? 'half' : 'near',
        title: `${name} at ${percent}%`,
        text: reset === null ? '' : `Resets in ${reset}.`,
        line: `${name} at ${percent}%${reset === null ? '' : `, resets in ${reset}`}`,
        bar,
        window: limit.kind,
      })
    } else if (eta !== null && !held.hasPace) {
      notices.push({
        kind: 'pace',
        title: `${name} fills in ${countdown(eta)}`,
        text: `At this pace it is full before it resets${reset === null ? '' : `, in ${reset}`}.`,
        line: `${name} fills in ${countdown(eta)} at this pace`,
        bar,
        window: limit.kind,
      })
    }

    next[limit.kind] = {
      // A level stays told through a dip under it, until the window resets.
      levels: LEVELS.filter(level => held.levels.includes(level) || passed.includes(level)),
      hasPace: held.hasPace || eta !== null,
    }
  }

  if (after.percent !== null || after.tokens !== null) {
    const percent = Math.round(after.percent ?? 0)
    const wasTold = (memory[CONTEXT] ?? NOTHING).levels.includes(CONTEXT_AT)
    const isFull = isCrowded(after.tokens, after.percent, weight)
    // Said by its size where it is known, its share beside it.
    const size = after.tokens === null ? `${percent}%` : shortTokens(after.tokens)
    const said = after.tokens === null || after.percent === null ? size : `${size} (${percent}%)`

    if (isFull && !wasTold && before !== null) {
      notices.push({
        kind: 'context',
        title: `Context at ${size}`,
        text: 'Press Compact in the band, or run /compact.',
        line: `Context at ${said}: compact before the next long task`,
        bar: { name: 'Context', value: Math.min(1, percent / 100), label: size, status: '' },
      })
    }

    // Under the line again (a compaction): the next climb is news again.
    next[CONTEXT] = { levels: isFull ? [CONTEXT_AT] : [], hasPace: false }
  }

  return { notices, memory: next }
}
