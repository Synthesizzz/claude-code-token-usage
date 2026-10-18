// A measurement taken in: read with care, judged against the one before; and
// what the band says when a reading or a hook went wrong.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Snapshot } from '../types'
import { review } from './alerts'
import { spentSince, usd } from './cost'
import { failedLine, readReading, record, resets, unreadLine } from './usage'
import type { Reading } from './usage'
import { countContext, pay, recount } from './ledger'
import { RESET_MS, tick } from './state'

// Not `snapshot`: a session reloaded from 0.1.0 still holds that key in its old shape.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

// What the person was told already, so a notice is not raised twice.
const alerted = atom({ plugin: 'token-usage', key: 'alerted' } as const, {})

// The windows that have just reset, while their reset plays.
const fresh = atom({ plugin: 'token-usage', key: 'fresh' } as const, {})

// Whether the last turn's tokens were all read.
const turnRead = atom({ plugin: 'token-usage', key: 'turnRead' } as const, true)

// The last hook of this mod that failed, and when.
const failed = atom({ plugin: 'token-usage', key: 'failed' } as const, null)

// A part the reading could not read keeps what was shown before.
export const toSnapshot = (held: Snapshot | null, at: number, reading: Reading): Snapshot => ({
  at,
  tokens: reading.context?.tokens ?? held?.tokens ?? null,
  window: reading.context?.window ?? held?.window ?? 0,
  percent: reading.context === null ? (held?.percent ?? null) : reading.context.percent,
  // A measurement with no reading of the windows says nothing of them: the
  // windows held stand until their reset passes.
  limits:
    reading.limits === null || reading.limits.length === 0
      ? (held?.limits ?? []).filter(
          limit => limit.resetsAt === null || Date.parse(limit.resetsAt) > at,
        )
      : reading.limits.map(({ kind, percentUsed, resetsAt }) => ({
          kind,
          percentUsed,
          resetsAt,
          samples: record(
            held?.limits.find(limit => limit.kind === kind)?.samples ?? [],
            { at, percent: percentUsed },
          ),
        })),
  usd: reading.unread.includes('cost') ? (held?.usd ?? null) : reading.usd,
  unread: reading.unread,
})

// The engine skips a hook that fails and goes on beneath it, leaving no
// trace: this notes it, so the band can say so.
export async function note($: EngineInterface, event: string, error: { kind: string; message?: string }) {
  try {
    const at = await $.clock.now()

    await update($, failed, () => ({ event, message: error.message ?? error.kind, at }))
  } catch {
    // Nothing to do: the engine reports the failure by name all the same.
  }
}

// What the band says of what went wrong, or nothing: the parts a reading
// could not read, and a hook that failed in the last ten minutes.
export async function trouble($: EngineInterface, at: number) {
  const usage = await read($, snapshot)
  const unread = [...(usage?.unread ?? []), ...((await read($, turnRead)) ? [] : ['turn usage'])]

  return [unreadLine(unread), failedLine(await read($, failed), at)].filter(line => line !== null)
}

// `budget` is null where the caller will not raise the notices: the budget is
// then not judged, so its news is still news to the next caller.
export async function measure(
  $: EngineInterface,
  context: unknown,
  rateLimits: unknown,
  cost: unknown,
  hasEarlyAlert: boolean,
  budget: number | null,
  weekBudget: number | null = null,
  projectBudgets: Readonly<Record<string, number>> = {},
  monthBudget: number | null = null,
) {
  const reading = readReading(context, rateLimits, cost)
  const at = await $.clock.now()
  const told = await read($, alerted)
  let judged: ReturnType<typeof review> = { notices: [], memory: told }
  let renewed: ReturnType<typeof resets> = []
  let spent = 0

  // Judged against the very reading it replaces, so two measurements close
  // together cannot both call the same climb news.
  await update($, snapshot, held => {
    const after = toSnapshot(held ?? null, at, reading)

    judged = review(held ?? null, after, told, at, hasEarlyAlert)
    renewed = resets(held ?? null, after)
    spent = spentSince(held ?? null, after.usd)

    return after
  })
  await update($, alerted, () => judged.memory)

  if (renewed.length > 0) {
    await update($, fresh, held => ({
      ...held,
      ...Object.fromEntries(renewed.map(({ kind, from }) => [kind, { at, from }])),
    }))
    // The reset plays once: when it is over the band is drawn at rest again.
    $.clock.after(RESET_MS, () => void tick($))
  }

  return spent > 0 ? [...judged.notices, ...(await pay($, at, spent, budget, weekBudget, projectBudgets, monthBudget))] : judged.notices
}

// A compaction is no turn, so no measurement follows it and the band would
// hold the size from before until the next turn. The size it left goes in
// now: the count the compaction gives, else the free local count of the
// window. Only the context moves; the cost and the windows wait for the
// next measurement, so what the compaction cost is still paid there.
export async function compacted($: EngineInterface, tokensAfter: number | undefined) {
  const usage =
    tokensAfter === undefined ? await countContext($, 'summary') : ((await recount($)) ?? (await $.session.usage()))
  const window = usage?.context.window ?? 0
  const tokens = tokensAfter ?? usage?.context.breakdown?.totalTokens

  if (usage === null || tokens === undefined || window <= 0) {
    return
  }

  const at = await $.clock.now()

  await update($, snapshot, held =>
    held === null ? held : { ...held, at, tokens, window, percent: Math.min(100, Math.round((tokens / window) * 100)) },
  )
}
