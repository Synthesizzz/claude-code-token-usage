// The band's one next move: what to do now, with the context, the cache, the
// hour and the session's own turns weighed, and why, in a line. No move means
// carry on.

import type { Quiet, Weight } from '../types'
import { isCrowded } from './alerts'
import { LAPSED_WORTH } from './cache'
import { shortTokens } from './cost'
import { COMPACT, HANDOFF } from './state'
import { isQuiet } from './usage'

export type MoveKey = 'compact' | 'compactAfter' | 'fresh' | 'park'

// Why the move: the case alone, and the case with what the move does.
export type Move = { key: MoveKey; label: string; why: string; reason: string; isPrimary: boolean }

// A compaction's price in tokens at the full input price, and the context it
// leaves: medians of 164 compactions measured from transcripts (2026-10-20 to
// 2026-11-10). Most of the price is the next step writing the new context to
// the cache.
export const COMPACT_COST = 200_000
export const AFTER_COMPACT = 130_000
// Steps a turn takes where the session has none of its own yet: the median
// of 7,186 main-thread turns.
export const STEPS_PER_TURN = 3
// Compact is the move where it pays back within this many turns.
export const PAYBACK_TURNS = 3
// The steps per turn kept, the latest last.
export const KEPT_TURNS = 5
// Park is offered this long before quiet hours begin.
export const QUIET_SOON_MS = 30 * 60_000
// Hand off and Park are offered only from this context on; under it the band
// compacts (Decisions 2026-11-13: a fresh session that reads the last handoff
// starts near 140k, so handing off earlier gains little).
export const HANDOFF_AT = 250_000

const HEAVY_AT = 70
const HOUR_MS = 60 * 60_000

export const PARK = 'Park'
export const COMPACT_AFTER = 'Compact after'

// Heavy past the warning size, or at 70% of a window smaller than that; with
// the weight off, at 70% alone. As a heavy turn's notice judges it.
export const isHeavy = (tokens: number | null, percent: number | null, weight: Weight | null) =>
  (weight !== null && tokens !== null && tokens >= weight.warn) || (percent !== null && percent >= HEAVY_AT)

// Whether quiet hours begin within the time given. Inside them already, no:
// the person has left by then.
export const quietSoon = (quiet: Quiet | null, at: number, within = QUIET_SOON_MS) => {
  if (quiet === null || isQuiet(quiet, at)) {
    return false
  }

  const start = new Date(at)

  start.setHours(quiet.from, 0, 0, 0)

  const begins = start.getTime() <= at ? start.getTime() + 24 * HOUR_MS : start.getTime()

  return begins - at <= within
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length === 0
    ? null
    : sorted.length % 2 === 1
      ? (sorted[middle] ?? null)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

// The steps per turn as kept: whole positive counts only, the latest few.
export const saneSteps = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((count): count is number => Number.isInteger(count) && count > 0).slice(-KEPT_TURNS)
    : []

export const keepSteps = (kept: readonly number[], count: number) => saneSteps([...kept, count])

// In how many turns a compaction pays back: what each turn saves reading the
// summary instead of the context, against what the compaction costs. Null
// where the context is no larger than what a compaction leaves.
export const payback = (tokens: number | null, steps: readonly number[], read: number) => {
  if (tokens === null || tokens <= AFTER_COMPACT || read <= 0) {
    return null
  }

  const perTurn = median(saneSteps(steps)) ?? STEPS_PER_TURN

  return Math.max(1, Math.ceil(COMPACT_COST / ((tokens - AFTER_COMPACT) * read * perTurn)))
}

export type Seen = {
  tokens: number | null
  percent: number | null
  weight: Weight | null
  isWorking: boolean
  cache: { phase: 'calm' | 'near' | 'gone' } | null
  quietSoon: boolean
  isSoon: boolean
  handoff: string
  // The handoff mod's /handoff is there: its card hands off from 250k, so the
  // band offers no move there, and Hand off and Park nowhere.
  hasCommand: boolean
  payback: number | null
}

const turns = (count: number) => `${count} turn${count === 1 ? '' : 's'}`

// What `/tokens next` says: the move and why, then the figures it was weighed
// on. Plain words only: the desktop renders the reply as markdown.
export const nextText = (
  move: Move | null,
  seen: Seen,
  said: { perStep: string | null; steps: readonly number[]; cache: string | null; quiet: Quiet | null },
) => {
  const perTurn = median(saneSteps(said.steps))
  const figures = [
    `context ${seen.tokens === null ? 'unknown' : shortTokens(seen.tokens)}${seen.percent === null ? '' : ` (${Math.round(seen.percent)}%)`}`,
    said.perStep === null ? 'per step: no model seen yet' : `per step ${said.perStep.replace('/step', '')}`,
    seen.payback === null
      ? 'compact pays back: not at this size'
      : `compact pays back in ${turns(seen.payback)} (${perTurn === null ? `${STEPS_PER_TURN} steps a turn, none of this session's yet` : `${perTurn} steps a turn`})`,
    `cache: ${said.cache ?? 'not counting'}`,
    said.quiet === null
      ? 'quiet hours: off'
      : `quiet hours ${String(said.quiet.from).padStart(2, '0')}-${String(said.quiet.to).padStart(2, '0')}${seen.quietSoon ? ', soon' : ''}`,
  ]

  return [
    move === null ? 'Next: carry on. Nothing here is worth acting on now.' : `Next: ${move.label}. ${move.reason}`,
    `Weighed on: ${figures.join(' · ')}.`,
  ].join('\n')
}

// Gravest first; the first that fits is the move.
export const nextMove = (seen: Seen): Move | null => {
  const { tokens, percent, weight, handoff } = seen
  const size = tokens === null ? `${Math.round(percent ?? 0)}%` : shortTokens(tokens)
  const isHandOffSize = tokens !== null && tokens >= HANDOFF_AT

  // From 250k the handoff mod's card is the one move (Decisions 2026-11-14):
  // the band offers none, not even Compact.
  if (seen.hasCommand && isHandOffSize) {
    return null
  }

  // A hand-off message, no handoff mod, and a context worth it.
  const isHanded = handoff !== '' && !seen.hasCommand && isHandOffSize
  const handsOff = 'Hand off sends your hand-off message for a fresh session.'
  const parks = `Park sends your hand-off message, then compacts: the next turn reads a summary, not ${size}.`
  const isFull = isCrowded(tokens, percent, weight)
  const move = (key: MoveKey, label: string, why: string, then: string, isPrimary = false): Move => ({
    key,
    label,
    why,
    reason: `${why} ${then}`,
    isPrimary,
  })
  const handOff = (why: string) =>
    isHanded
      ? move('fresh', HANDOFF, why, handsOff)
      : move('compact', COMPACT, why, 'Compact keeps a summary in its place.')

  // A running turn: nothing can start until it ends, so a full context
  // compacts after it.
  if (seen.isWorking) {
    return isFull ? move('compactAfter', COMPACT_AFTER, `The context is ${size}.`, 'Compact once this turn ends.') : null
  }

  if (seen.cache?.phase === 'gone' && tokens !== null && tokens >= LAPSED_WORTH) {
    return handOff(`The cache lapsed: the next turn writes all ${size} to it again.`)
  }

  if (seen.isSoon) {
    return move('compact', COMPACT, `The context fills within a few turns at this pace: ${size} now.`, 'Compact keeps a summary in its place.', true)
  }

  if (!isHeavy(tokens, percent, weight)) {
    return null
  }

  if (seen.quietSoon || seen.cache?.phase === 'near') {
    const why = seen.quietSoon ? 'Quiet hours begin soon.' : 'The cache lapses soon.'

    return isHanded
      ? move('park', PARK, why, parks)
      : move('compact', COMPACT, why, `Compact now, and the next turn reads a summary, not ${size}.`)
  }

  if (isFull) {
    return handOff(`Each step reads all ${size} again.`)
  }

  if (seen.payback !== null && seen.payback <= PAYBACK_TURNS) {
    return move('compact', COMPACT, `Each step reads all ${size} again.`, `Compact pays back in ${turns(seen.payback)}.`)
  }

  return null
}
