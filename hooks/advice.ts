// What a heavy turn's notice says and offers: where its tokens went, why it
// is heavy, and the choices that fit, the one that fits best first.

import { cacheRates, shareOf } from './cache'

export type ChoiceKey = 'stop' | 'keep' | 'agents' | 'compactAfter' | 'raise' | 'compact' | 'fresh' | 'continue' | 'warm' | 'lapse'

// A hint says what the choice does and costs, while the pointer rests on it.
export type Choice = { key: ChoiceKey; label: string; hint?: string }

// A turn's tokens by where they went: the context read again from the cache
// at each step, what was read anew, what was written, and its subagents'.
export type TurnParts = { reread: number; anew: number; output: number; agents: number }

export const NO_PARTS: TurnParts = { reread: 0, anew: 0, output: 0, agents: 0 }

type Step = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const addStep = (parts: TurnParts, used: Step, isSubagent: boolean): TurnParts =>
  isSubagent
    ? { ...parts, agents: parts.agents + used.input + used.output + used.cacheRead + used.cacheWrite }
    : {
        ...parts,
        reread: parts.reread + used.cacheRead,
        anew: parts.anew + used.input + used.cacheWrite,
        output: parts.output + used.output,
      }

const PARTS: readonly { key: keyof TurnParts; name: string; color: string }[] = [
  { key: 'reread', name: 'context re-read', color: '#a59be0' },
  { key: 'anew', name: 'read anew', color: '#ff6b80' },
  { key: 'output', name: 'output', color: '#e3a008' },
  { key: 'agents', name: 'subagents', color: '#7cc4ff' },
]

const totalOf = (parts: TurnParts) => parts.reread + parts.anew + parts.output + parts.agents

// The split as the notice draws it: each part with a share, the largest first.
export const splitOf = (parts: TurnParts) => {
  const total = totalOf(parts)

  return total <= 0
    ? []
    : PARTS.map(({ key, name, color }) => ({ name, color, share: parts[key] / total }))
        .filter(({ share }) => share > 0)
        .sort((a, b) => b.share - a.share)
}

const LIMIT_AT = 85
const AGENTS_SHARE = 0.5
const CONTEXT_AT = 70
const ANEW_SHARE = 0.5
const percent = (share: number) => `${Math.round(share * 100)}%`

const STOP: Choice = { key: 'stop', label: 'Stop now' }
const KEEP: Choice = { key: 'keep', label: 'Keep going' }

// Why the turn is heavy and what to do, from the gravest reason down: a
// 5-hour window near its limit, subagents doing most of it, a context near
// full, a cache that had lapsed, or else what most of it was. A cache read's
// share of the price is the model's (cacheRates), a tenth where none is said.
export const heavyAdvice = (
  parts: TurnParts,
  seen: { five: number | null; context: number | null; agentTypes: readonly string[]; read?: number },
): { reason: string; tone: 'error' | 'warning' | null; choices: Choice[] } => {
  const total = Math.max(1, totalOf(parts))
  const share = (key: keyof TurnParts) => parts[key] / total

  if (seen.five !== null && seen.five >= LIMIT_AT) {
    return {
      reason: `5-hour window is at ${Math.round(seen.five)}%: this turn alone could reach the limit.`,
      tone: 'error',
      choices: [STOP, KEEP],
    }
  }

  if (share('agents') >= AGENTS_SHARE) {
    const kinds = [...new Set(seen.agentTypes)]
    const named = kinds.length === 0 ? '' : `: ${kinds.slice(0, 3).join(', ')}`

    return {
      reason: `Subagents took ${percent(share('agents'))} of it${named}.`,
      tone: 'warning',
      choices: [KEEP, { key: 'agents', label: 'See agents' }, STOP],
    }
  }

  if (seen.context !== null && seen.context >= CONTEXT_AT) {
    return {
      reason: `The context is at ${Math.round(seen.context)}%: each step reads all of it again.`,
      tone: 'warning',
      choices: [{ key: 'compactAfter', label: 'Compact after' }, STOP, KEEP],
    }
  }

  // The lapse was paid at the turn's first step: a stop gets none of it back,
  // so the way out is a smaller context for the next lapse to re-read.
  if (share('anew') >= ANEW_SHARE) {
    return {
      reason: `The cache had lapsed: ${percent(share('anew'))} of it was read anew, and that is paid already: stopping won't get it back. Compact after, and the next lapse re-reads less.`,
      tone: null,
      choices: [
        { ...KEEP, hint: `The re-read is paid already. From here on the steps read from the cache again, at ${shareOf(seen.read ?? cacheRates(null, null).read)} of the price.` },
        {
          key: 'compactAfter',
          label: 'Compact after',
          hint: 'This turn finishes, then the context is compacted. The next lapse re-reads a summary, not the whole conversation. Earlier turns live on only in the summary.',
        },
        { key: 'raise', label: 'Warn at 2×', hint: 'A turn must be twice as heavy before this notice comes again, for this session. Nothing else changes.' },
      ],
    }
  }

  const [most] = splitOf(parts)

  return {
    reason: most === undefined ? 'Many steps, each reading the context again.' : `Most of it is ${most.name}: ${percent(most.share)}.`,
    tone: null,
    choices: [KEEP, STOP, { key: 'raise', label: 'Warn at 2×' }],
  }
}

const STOPPED_AT = 50

// After a stop, what to do next: with the context half full or more, compact
// it; with less, start fresh; or go on where it stopped.
export const stoppedAdvice = (context: number | null, tokens: string) => {
  const compact: Choice = { key: 'compact', label: 'Compact' }
  const fresh: Choice = { key: 'fresh', label: 'Start fresh' }
  const goOn: Choice = { key: 'continue', label: 'Continue' }
  const isFull = context !== null && context >= STOPPED_AT

  return {
    title: tokens === '' ? 'Stopped. What next?' : `Stopped after ${tokens} tokens. What next?`,
    text: isFull
      ? `The context is at ${Math.round(context ?? 0)}%: Compact keeps a summary and frees it; Start fresh clears it.`
      : 'Start fresh clears the conversation for a new start; Continue goes on where it stopped.',
    choices: isFull ? [compact, fresh, goOn] : [fresh, goOn, compact],
  }
}

type Part = { name: string; share: number; color: string }

// The split as a bar of colours, for the desktop.
export const splitSvg = (split: readonly Part[], width: number) => {
  let at = 0
  const runs = split.map(({ share, color }) => {
    const wide = share * width
    const run = `<rect x="${at.toFixed(1)}" width="${wide.toFixed(1)}" height="6" fill="${color}"/>`

    at += wide

    return run
  })

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="6" viewBox="0 0 ${width} 6"><rect width="${width}" height="6" rx="3" fill="#8b919c" fill-opacity=".25"/>${runs.join('')}</svg>`,
    alt: split.map(({ name, share }) => `${name} ${Math.round(share * 100)}%`).join(', '),
  }
}

// The split as runs of cells, for a terminal: each part as many cells as its
// share, the cells always adding up.
export const cellsOfSplit = (split: readonly Part[], cells: number) => {
  const counts = split.map(({ share }) => Math.floor(share * cells))
  const order = split.map(({ share }, index) => ({ index, rest: share * cells - Math.floor(share * cells) })).sort((a, b) => b.rest - a.rest)

  for (const { index } of order.slice(0, Math.max(0, cells - counts.reduce((sum, count) => sum + count, 0)))) {
    counts[index] = (counts[index] ?? 0) + 1
  }

  return split.map(({ color }, index) => ({ text: '█'.repeat(counts[index] ?? 0), color })).filter(({ text }) => text !== '')
}
