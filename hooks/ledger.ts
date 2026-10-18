// The ledger and the counts on the disk: each session's own file, every
// session's summed, the budget's news, the context's breakdown, export, tidy.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Share } from '../types'
import {
  EMPTY,
  NO_SHARE,
  budgetNews,
  isPlanOf,
  saneMonthTold,
  saneWeekTold,
  monthNews,
  weekNews,
  exportCsv,
  dayOf,
  pool,
  saneLedger,
  saneShare,
  spend,
  projectNews,
  saneProjectTold,
} from './cost'
import { keepSetUp, setUpOf } from './context'
import { told } from './fit'
import {
  LEDGER_KEY,
  NOTIFY_MS,
  SET_UPS_KEY,
  SHARES_DIR,
  STALE_MS,
  WEEK_TOLD_KEY,
  MONTH_TOLD_KEY,
  others,
  saneBreakdown,
  saneSetUps,
  PROJECT_TOLD_KEY,
  scope,
} from './state'

const last = atom({ plugin: 'token-usage', key: 'last' } as const, null)

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

// Dollars by day, for every session, held here to draw; the store keeps what
// of the day's budget was told, and the days counted before sessions had
// files of their own.
const ledger = atom({ plugin: 'token-usage', key: 'ledger' } as const, EMPTY)
// The last reading: its windows say whether the session is on a subscription.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

const mine = atom({ plugin: 'token-usage', key: 'mine' } as const, NO_SHARE)

// The file `mine` belongs to. After /clear or a resume the process goes on
// under another id with no session.start: the share is then that id's own.
const mineName = atom({ plugin: 'token-usage', key: 'mineName' } as const, '')

// What the store counted before sessions had files of their own.
const before = atom({ plugin: 'token-usage', key: 'before' } as const, NO_SHARE)

// Tokens by day, by project, and the heaviest turns of the day: shared by
// every session, like the ledger. The pane counts in tokens; the band, in
// dollars.
const projects = atom({ plugin: 'token-usage', key: 'projects' } as const, {})

const models = atom({ plugin: 'token-usage', key: 'models' } as const, {})

// The subagents' tokens and runs by agent type, for every session.
const agents = atom({ plugin: 'token-usage', key: 'agents' } as const, { agents: {}, runs: {} })

const tokenDays = atom({ plugin: 'token-usage', key: 'tokenDays' } as const, {})

// What fills the context, as /context breaks it down.
const breakdown = atom({ plugin: 'token-usage', key: 'breakdown' } as const, null)

// The set-up of each day as last counted, for every session: the latest wins.
const setUps = atom({ plugin: 'token-usage', key: 'setUps' } as const, {})

// The last hook of this mod that failed, and when.
const failed = atom({ plugin: 'token-usage', key: 'failed' } as const, null)

// Asks the engine for the breakdown, counted the free way or exactly, and
// holds it for the panes.
export async function countContext($: EngineInterface, detail: 'summary' | 'full') {
  try {
    const usage = await $.session.usage({ breakdown: detail })
    const value = saneBreakdown(usage.context.breakdown)

    if (value !== null) {
      const at = await $.clock.now()
      const setUp = setUpOf(value.categories)

      await update($, breakdown, () => ({ detail, at, value }))
      await update($, setUps, held => keepSetUp(held, dayOf(at), setUp))

      // Kept for every session; a store that refuses leaves today's in hand.
      try {
        const kept = keepSetUp(saneSetUps(await $.store.get(SET_UPS_KEY)), dayOf(at), setUp)

        await $.store.set(SET_UPS_KEY, kept)
        await update($, setUps, () => kept)
      } catch {
        // Nothing to do: the next count tries again.
      }
    }

    return usage
  } catch {
    return null
  }
}

// The panes keep up by themselves: once one has asked for the breakdown, it
// is counted again, the free way, whenever the context moves. The band asks
// for it too (`isWanted`) while it draws the bar; a session that wants it
// nowhere counts nothing.
export async function recount($: EngineInterface, isWanted = false) {
  return !isWanted && (await read($, breakdown)) === null ? null : countContext($, 'summary')
}

// This session's own file, or null where there is no home folder or no id.
export async function ownFile($: EngineInterface) {
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const id = (await $.session.id()).replace(/[^A-Za-z0-9_-]/g, '')

    return typeof home === 'string' && home !== '' && id !== ''
      ? { dir: `${home}/${SHARES_DIR}`, name: `${id}.json` }
      : null
  } catch {
    return null
  }
}

// Makes `mine` the share of the session as it is now: one that changed its
// id starts over from the file of the new one, or from nothing.
export async function adopt($: EngineInterface) {
  const own = await ownFile($)

  if (own === null || own.name === (await read($, mineName))) {
    return
  }

  let share = NO_SHARE

  try {
    share = saneShare(JSON.parse(String(await $.fs.read(`${own.dir}/${own.name}`))))
  } catch {
    // A new session: it has no file yet.
  }

  await update($, mine, () => share)
  await update($, mineName, () => own.name)
}

// This session's share goes to its file. Where it cannot be written the
// share is still held, and the next write takes it all.
export async function keep($: EngineInterface) {
  const own = await ownFile($)

  if (own !== null) {
    try {
      await $.fs.write(`${own.dir}/${own.name}`, JSON.stringify(await read($, mine)))
    } catch {
      // Nothing to do: see above.
    }
  }
}

// Every session's share summed: the store's from before, this session's, and
// each other session's file. A file that cannot be read is passed over, or
// counts as it was last read.
export async function gather($: EngineInterface, at: number) {
  const own = await ownFile($)
  const theirs: Share[] = []

  if (own !== null) {
    try {
      const listed = new Set<string>()

      for (const entry of await $.fs.list(own.dir)) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json') || entry.name === own.name) {
          continue
        }

        if (entry.mtimeMs < at - STALE_MS) {
          continue
        }

        listed.add(entry.name)

        if (others.get(entry.name)?.mtimeMs !== entry.mtimeMs) {
          try {
            const text = String(await $.fs.read(`${own.dir}/${entry.name}`))

            others.set(entry.name, { mtimeMs: entry.mtimeMs, share: saneShare(JSON.parse(text)) })
          } catch {
            // Half written, or gone: read again once it changes.
          }
        }

        const held = others.get(entry.name)

        if (held !== undefined) {
          theirs.push(held.share)
        }
      }

      for (const name of [...others.keys()].filter(name => !listed.has(name))) {
        others.delete(name)
      }
    } catch {
      // No folder yet: no session has counted in one.
    }
  }

  const sum = pool([await read($, before), await read($, mine), ...theirs], at)

  await update($, ledger, held => ({ ...held, days: sum.days }))
  await update($, tokenDays, () => sum.tokens)
  await update($, projects, () => sum.projects)
  await update($, models, () => sum.models)
  await update($, agents, () => ({ agents: sum.agents ?? {}, runs: sum.runs ?? {} }))

  return sum
}

// What a reading cost goes on the day in this session's own share; the day
// is then read from every session's. Says what of the day's budget is news,
// noted in the store so that each line is said once a day by any session.
export async function pay(
  $: EngineInterface,
  at: number,
  amount: number,
  budget: number | null,
  weekBudget: number | null,
  projectBudgets: Readonly<Record<string, number>> = {},
  monthBudget: number | null = null,
) {
  await adopt($)
  await update($, mine, held => spend(held, at, amount, scope.project))
  await keep($)

  const sum = await gather($, at)
  const kept = saneLedger(await $.store.get(LEDGER_KEY))
  const isPlan = isPlanOf((await read($, snapshot))?.limits ?? [])
  const judged = budgetNews({ days: sum.days, told: kept.told }, at, budget, isPlan)

  await $.store.set(LEDGER_KEY, { days: kept.days, told: judged.ledger.told })
  await update($, ledger, () => judged.ledger)

  const weekly = weekNews(sum.days, at, weekBudget, saneWeekTold(await $.store.get(WEEK_TOLD_KEY)), isPlan)

  if (weekly.notices.length > 0) {
    await $.store.set(WEEK_TOLD_KEY, weekly.told)
  }

  const monthly = monthNews(sum.days, at, monthBudget, saneMonthTold(await $.store.get(MONTH_TOLD_KEY)), isPlan)

  if (monthly.notices.length > 0) {
    await $.store.set(MONTH_TOLD_KEY, monthly.told)
  }

  const projected = projectNews(sum.spent, at, projectBudgets, saneProjectTold(await $.store.get(PROJECT_TOLD_KEY)), isPlan)

  if (projected.notices.length > 0) {
    await $.store.set(PROJECT_TOLD_KEY, projected.told)
  }

  return [...judged.notices, ...weekly.notices, ...monthly.notices, ...projected.notices]
}

// The session files of the past: each session's stays on the disk, and one
// untouched for a month is no longer read. `/tokens tidy` says how many there
// are; with `now` it deletes them: only files of the sessions folder named as
// a session's id, never this session's own.
export const SESSION_FILE = /^[A-Za-z0-9_-]+\.json$/

export async function tidy($: EngineInterface, isNow: boolean) {
  const own = await ownFile($)

  if (own === null) {
    return 'Nothing to tidy: no home folder.'
  }

  const at = await $.clock.now()
  let stale: { name: string; size: number }[] = []

  try {
    stale = (await $.fs.list(own.dir)).filter(
      entry =>
        entry.kind === 'file' &&
        SESSION_FILE.test(entry.name) &&
        entry.name !== own.name &&
        entry.mtimeMs < at - STALE_MS,
    )
  } catch {
    // No folder: nothing kept yet.
  }

  if (stale.length === 0) {
    return 'Nothing to tidy: no session file is over 31 days old.'
  }

  const kb = Math.max(1, Math.round(stale.reduce((sum, entry) => sum + (entry.size ?? 0), 0) / 1024))
  const files = `${stale.length} session ${stale.length === 1 ? 'file' : 'files'}`

  if (!isNow) {
    return `${files} untouched for over 31 days (${kb} KB) are no longer read. /tokens tidy now deletes them.`
  }

  const paths = stale.map(({ name }) => `${own.dir}/${name}`)
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-Command', `Remove-Item -LiteralPath ${paths.map(path => `'${path.replaceAll("'", "''")}'`).join(',')}`]
    : ['rm', '-f', '--', ...paths]

  try {
    const done = await $.process.run(argv, { timeoutMs: NOTIFY_MS })

    return done.exitCode === 0
      ? `Deleted ${stale.length} old session ${stale.length === 1 ? 'file' : 'files'} (${kb} KB).`
      : `Tidy failed (exit ${done.exitCode}): ${done.stderr.trim().slice(0, 120)}`
  } catch (error) {
    return `Tidy failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

// Every session's counts, kept beside the mod's other files: the days as
// CSV, and everything as JSON. Says where, or why not.
export async function exported($: EngineInterface) {
  const own = await ownFile($)

  if (own === null) {
    return 'Nothing to export to: no home folder.'
  }

  const at = await $.clock.now()
  const sum = await gather($, at)
  const folder = own.dir.slice(0, -'/sessions'.length)
  const name = `${folder}/export-${dayOf(at)}`

  try {
    await $.fs.write(`${name}.csv`, exportCsv(sum))
    await $.fs.write(`${name}.json`, JSON.stringify(sum, null, 2))
  } catch (error) {
    return `Export failed: ${error instanceof Error ? error.message : String(error)}`
  }

  return `Exported the last 31 days to ${name}.csv and ${name}.json.`
}

// A subagent's agent type, read from the session's agents by its id, and
// whether this is the first of its turns counted. One the engine has
// already let go of, or cannot list, is `subagent`.
export async function agentOf($: EngineInterface, id: string, seen: Map<string, string>) {
  const held = seen.get(id)

  if (held !== undefined) {
    return { type: held, isNew: false }
  }

  let type = 'subagent'

  try {
    type = (await $.agent.list()).find(agent => agent.id === id)?.type ?? type
  } catch {
    // Nothing to do: it is counted under the plain name.
  }

  seen.set(id, type)

  return { type, isNew: true }
}
