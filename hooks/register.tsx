import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import type { Costly, Notice, TurnTokens } from '../types'
import {
  EMPTY,
  NO_SHARE,
  NO_MODEL,
  counted,
  heavyLine,
  heavyThreshold,
  turnTokens,
  keepTurn,
  saneLedger,
  saneDays,
  saneProjects,
  saneTurns,
  shortTokens,
  isPlanOf,
  sessionSummary,
} from './cost'
import { cacheRates, judgePause, keepPauses, learnedTtl, sanePauses } from './cache'
import { NO_PARTS, addStep, heavyAdvice, splitOf } from './advice'
import type { TurnParts } from './advice'
import { defaults, sane } from './style'
import { drawBand } from './band'
import { adopt, agentOf, countContext, exported, gather, keep, recount, tidy } from './ledger'
import { compacted, measure, note, trouble } from './measure'
import { SAMPLE, SAMPLE_WEEK, beginPause, bring, choose, compactIfAsked, endPause, forkFellShort, tell, testCache, testLapse } from './notices'
import { drawAgentsPane, refreshCrew, watchCrew } from './pane-agents'
import { drawContextPane } from './pane-context'
import { joined, newTurn, spent, stepped, used } from './crew'
import { drawStylePane } from './pane-style'
import { drawUsagePane } from './pane-usage'
import {
  AGENTS_PANE,
  CONTEXT_PANE,
  FORK_SHORT_KEY,
  GROWTH_KEPT,
  LAST_SESSION_KEY,
  LEDGER_KEY,
  NO_PROJECT,
  PANE,
  PAUSES_KEY,
  PROJECTS_KEY,
  STYLE_KEY,
  STYLE_PANE,
  TICK_MS,
  TOKEN_DAYS_KEY,
  TURNS_KEY,
  TYPICAL_KEPT,
  TYPICAL_KEY,
  isModel,
  others,
  saneLast,
  saneTypical,
  scope,
  styleOf,
  tick,
} from './state'

// Not `snapshot`: a session reloaded from 0.1.0 still holds that key in its old shape.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

const last = atom({ plugin: 'token-usage', key: 'last' } as const, null)

// The style `/tokens` chose; null while the options' own stand.
const chosen = atom({ plugin: 'token-usage', key: 'style' } as const, null)

// Dollars by day, for every session, held here to draw; the store keeps what
// of the day's budget was told, and the days counted before sessions had
// files of their own.
const ledger = atom({ plugin: 'token-usage', key: 'ledger' } as const, EMPTY)

const lastSession = atom({ plugin: 'token-usage', key: 'lastSession' } as const, null)

const mine = atom({ plugin: 'token-usage', key: 'mine' } as const, NO_SHARE)

// What the store counted before sessions had files of their own.
const before = atom({ plugin: 'token-usage', key: 'before' } as const, NO_SHARE)

// Tokens by day, by project, and the heaviest turns of the day: shared by
// every session, like the ledger. The pane counts in tokens; the band, in
// dollars.
const projects = atom({ plugin: 'token-usage', key: 'projects' } as const, {})

const models = atom({ plugin: 'token-usage', key: 'models' } as const, {})

const turns = atom({ plugin: 'token-usage', key: 'turns' } as const, [])

const sessionTokens = atom({ plugin: 'token-usage', key: 'sessionTokens' } as const, 0)

// The context fill at the end of each turn, for its forecast; this many kept.
const growth = atom({ plugin: 'token-usage', key: 'growth' } as const, [])

// The prompt cache: the pause it counts down, and the pauses it was judged
// on, every session's (how long it lasts is the account's).
const idleSince = atom({ plugin: 'token-usage', key: 'idleSince' } as const, null)

// When the crab last had nothing to do: the band's crab naps two minutes on.
const restSince = atom({ plugin: 'token-usage', key: 'restSince' } as const, null)

// The model of the main thread's last response: what a cache read costs.
const cacheModel = atom({ plugin: 'token-usage', key: 'cacheModel' } as const, null)

// Whether a quiet Keep warm ping was seen not to hold the cache.
const forkShort = atom({ plugin: 'token-usage', key: 'forkShort' } as const, false)

// The subagents of the turn, by id, for the agents pane.
const crew = atom({ plugin: 'token-usage', key: 'crew' } as const, {})

// The main turn running now, and how far the heavy-turn line was raised.
const turnNow = atom({ plugin: 'token-usage', key: 'turnNow' } as const, null)

const heavyBoost = atom({ plugin: 'token-usage', key: 'heavyBoost' } as const, 1)

// A compaction asked for while a turn ran waits this long after it ends.
const COMPACT_AFTER_MS = 500

const pauses = atom({ plugin: 'token-usage', key: 'pauses' } as const, [])

// The tokens of the last main turns, every session's: what a usual turn is.
// Kept in the store, so a new session goes by the ones before it.
const typical = atom({ plugin: 'token-usage', key: 'typical' } as const, [])

// Whether the last turn's tokens were all read.
const turnRead = atom({ plugin: 'token-usage', key: 'turnRead' } as const, true)

// How soon after a /clear the new session is set up.
const CLEARED_MS = 500

// What a session starts from: the look, the counts and the windows the store
// kept, and a first measure. A /clear starts a session no session.start
// comes for, so it is set up from session.end as well.
async function setUp($: EngineInterface) {
  const kept = sane(await $.store.get(STYLE_KEY))

  if (kept !== null) {
    await update($, chosen, () => kept)
  }

  await tell($, kept ?? scope.base)

  const usage = await $.session.usage()
  const days = saneLedger(await $.store.get(LEDGER_KEY))
  const sums = saneProjects(await $.store.get(PROJECTS_KEY))
  const heavy = saneTurns(await $.store.get(TURNS_KEY))
  const tokens = saneDays(await $.store.get(TOKEN_DAYS_KEY))
  const judged = sanePauses(await $.store.get(PAUSES_KEY).catch(() => undefined))
  const usual = saneTypical(await $.store.get(TYPICAL_KEY).catch(() => undefined))

  await update($, pauses, () => judged)
  // Read apart: a store that cannot answer leaves Keep warm quiet.
  const isForkShort = (await $.store.get(FORK_SHORT_KEY).catch(() => undefined)) === true

  await update($, forkShort, () => isForkShort)
  await update($, typical, () => usual)
  const ended = await $.store.get(LAST_SESSION_KEY)

  await update($, ledger, () => days)
  await update($, turns, () => heavy)
  await update($, lastSession, () => saneLast(ended))
  // What the store counted before is kept apart, and no longer added to.
  await update($, before, () => ({ days: days.days, tokens, projects: sums, models: {} }))
  // A session started again goes on from its own file.
  await adopt($)
  await gather($, await $.clock.now())
  await measure($, usage.context, usage.rateLimits, usage.cost, false, null)
  // A session begun, or begun anew by a /clear, has the crab standing by.
  const begun = await $.clock.now()

  await update($, restSince, () => begun)
}

export const register: Register = (on, options) => {
  const base = defaults(options)

  // The band and the panes read the registration through the scope.
  scope.base = base
  let ticking: Timer | undefined
  // The clock that reads the crew's list while a subagent runs.
  const crewWatch: { ticker?: Timer } = {}
  // The subagents of this session already counted, by id, with their type.
  const seenAgents = new Map<string, string>()
  // How the last notice outside the app went, for `/tokens list` to say.
  let raising: string | undefined
  // The folder the session runs in, by its last name, and the tools the
  // turn running now has called.
  let project = NO_PROJECT
  let tools: Record<string, number> = {}
  // The tokens of the turn running now, its subagents' with them.
  let pending = 0
  // The running turn's tokens, step by step, and whether it was said heavy.
  let running = 0
  let isHeavyTold = false
  // Where the running turn's tokens went, for the heavy turn's notice.
  let parts: TurnParts = NO_PARTS
  // The main turn running now, and the one the crew was gathered in.
  let mainTurn: string | null = null
  let crewTurn: string | null = null

  on('session.start', async ($, e, next) => {
    scope.surface = e.surface ?? undefined
    project = e.cwd.split(/[\\/]/).filter(part => part !== '').at(-1) ?? NO_PROJECT
    scope.project = project
    await $.command.register({
      name: 'tokens',
      description: 'Show token usage in a pane, or change how the band looks',
      argumentHint:
        '[help | style | agents | context | list | reset | <preset> | layout <name> | palette <name> | color <ok|warn|full> <#hex> | color background <#hex|off> | labels <name> | show|hide <part> | alerts <on|off|both|app|windows> | alerts popup|privacy on|off | alerts quiet <22-8|off> | budget <$|off> | budget week|month <$|off> | export | tidy [now]]',
    })
    await setUp($)
    // A countdown moves while nothing is measured: the clock redraws it.
    ticking?.cancel()
    ticking = $.clock.every(TICK_MS, () => void tick($))

    return next(e)
  }).catch(async ($, e, next) => {
    await note($, 'session.start', next.error)

    return next.called ? undefined : next(e)
  })

  // A resumed session says how long since its last reply, how much it held,
  // and what re-writing that would cost: the cache's pause counts from that
  // reply, before any turn of the session runs.
  on('classic.SessionStart', async ($, e, next) => {
    const done = await next(e)

    if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const at = (await $.clock.now()) - e.seconds_since_last_response * 1000
      const tokens = typeof e.context_tokens === 'number' && e.context_tokens > 0 ? e.context_tokens : null

      await beginPause($, base, at, tokens, {
        ...(typeof e.estimated_cache_write_usd === 'number' ? { usd: e.estimated_cache_write_usd } : {}),
        ...(e.prompt_cache_likely_expired === true ? { lapsed: true } : {}),
      })
    }

    return done
  }).catch(async ($, e, next) => {
    await note($, 'classic.SessionStart', next.error)

    return next.called ? undefined : next(e)
  })

  on('session.measure', async ($, e, next) => {
    const style = await styleOf($, base)
    const notices = await measure(
      $,
      e.context,
      e.rateLimits,
      e.cost,
      style.hasEarlyAlert,
      style.hidden.includes('alerts') ? null : style.budget,
      style.hidden.includes('alerts') ? null : style.weekBudget,
      style.hidden.includes('alerts') ? {} : style.projectBudgets,
      style.hidden.includes('alerts') ? null : style.monthBudget,
    )

    if (!style.hidden.includes('alerts')) {
      raising = (await bring($, style, notices, scope.surface)) ?? raising
    }

    // What fills the context moved with it: the panes show it without Refresh.
    if (e.changed.includes('context')) {
      await recount($, !style.hidden.includes('breakdown'))
    }

    return next(e)
  }).catch(async ($, e, next) => {
    await note($, 'session.measure', next.error)

    return next.called ? undefined : next(e)
  })

  // The main conversation compacted: the band shows the size it left now,
  // not after the next turn. One ahead of time changes nothing yet.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined && e.trigger !== 'precompute' && done.skip === undefined) {
      await compacted($, done.tokensAfter)
    }

    return done
  }).catch(async ($, e, next) => {
    await note($, 'session.compact', next.error)

    return next.called ? undefined : next(e)
  })

  // A session that ends says what it counted beside the week's sessions, and
  // leaves it for the next one's pane. Exits stay fast: only what is held is
  // read, and the other sessions as last read.
  on('session.end', async ($, e, next) => {
    // A /clear starts a conversation anew: its first turn reads no cache,
    // whatever the time.
    await update($, idleSince, () => null)
    endPause()

    try {
      const at = await $.clock.now()
      const isPlan = isPlanOf((await read($, snapshot))?.limits ?? [])
      const line = sessionSummary(await read($, mine), [...others.values()].map(({ share }) => share), at, isPlan)

      if (line !== null) {
        const ended = { line, project, at }

        $.ui.toast(line)
        await update($, lastSession, () => ended)
        await $.store.set(LAST_SESSION_KEY, ended)
      }
    } catch {
      // Nothing to do: the session ends all the same.
    }

    const done = await next(e)

    // A /clear goes on under a new session, which no session.start sets up.
    if (e.reason === 'clear') {
      $.clock.after(CLEARED_MS, () => void setUp($))
    }

    return done
  }).catch(async ($, e, next) => {
    await note($, 'session.end', next.error)

    return next.called ? undefined : next(e)
  })

  // A turn far heavier than usual is said while it runs: each response's
  // tokens, a subagent's too, go toward the turn, and past five times a usual
  // turn the crab says so, once a turn. The response passes through as it
  // came: nothing is read from it until it has all arrived.
  on('turn.step', async function* ($, e, next) {
    // The first request of a main turn ends a pause: what it reads from the
    // cache says whether the cache outlasted the pause.
    const isFirst = e.agentId === undefined && e.index === 0
    const since = isFirst ? await read($, idleSince) : null
    const startedAt = isFirst ? await $.clock.now() : 0

    if (isFirst) {
      await update($, idleSince, () => null)
      await update($, restSince, () => null)
      endPause()
    }

    // The stream beneath, forwarded as it comes; what it returns, at its end.
    const result = yield* next(e)
    const used = turnTokens(result?.usage)

    if (e.agentId === undefined && isModel(result?.usage)) {
      const model = result.usage.model

      await update($, cacheModel, () => model)
    }

    if (since !== null && used !== null) {
      const pause = judgePause(startedAt - since.at, since.tokens, used, startedAt)
      const ttl = learnedTtl(await read($, pauses)).ttl

      // A pause begun at a quiet ping teaches nothing of how long the cache
      // lasts; lapsed short of that time, it says the ping did not hold it.
      if (since.afterFork === true) {
        if (pause !== null && !pause.isKept && ttl !== null && pause.gap < ttl) {
          await forkFellShort($)
        }
      } else if (pause !== null) {
        try {
          const kept = keepPauses(sanePauses(await $.store.get(PAUSES_KEY)), pause)

          await $.store.set(PAUSES_KEY, kept)
          await update($, pauses, () => kept)
        } catch {
          await update($, pauses, held => keepPauses(held, pause))
        }
      }
    }

    if (used !== null) {
      parts = addStep(parts, used, e.agentId !== undefined)
    }

    // A subagent's card counts each of its responses as it ends, and the
    // context it read; its turn's own sum takes their place.
    if (used !== null && e.agentId !== undefined) {
      const subagent = e.agentId
      const read = used.input + used.cacheRead + used.cacheWrite
      const at = await $.clock.now()

      await update($, crew, held => stepped(held, subagent, read + used.output, read, at))
    }

    if (used !== null && !isHeavyTold) {
      running += used.input + used.output + used.cacheRead + used.cacheWrite

      const past = await read($, typical)

      if (running >= heavyThreshold(past) * (await read($, heavyBoost))) {
        const style = await styleOf($, base)
        const { title: said, text: usual } = heavyLine(running, past)
        const seen = await read($, snapshot)
        const advice = heavyAdvice(parts, {
          five: seen?.limits.find(({ kind }) => kind.startsWith('five_hour'))?.percentUsed ?? null,
          context: seen?.percent ?? null,
          agentTypes: Object.values(await read($, crew)).map(({ type }) => type),
          read: cacheRates(await read($, cacheModel), null).read,
        })
        const title = usual === 'Esc stops it.' ? said : `${said} · ${usual.replace(/\. Esc stops it\.$/, '')}`

        isHeavyTold = true

        if (!style.hidden.includes('alerts')) {
          const notice: Notice = {
            kind: 'near',
            title,
            text: advice.reason,
            line: `${title}. ${advice.reason}`,
            bar: { name: 'This turn', value: 1, label: shortTokens(running), status: advice.reason },
            choices: advice.choices,
            split: splitOf(parts),
            tone: advice.tone,
          }

          raising = (await bring($, style, [notice], scope.surface)) ?? raising
        }
      }
    }

    return result
  }).catch(async function* ($, e, next) {
    await note($, 'turn.step', next.error)

    // A response already read stands as it came; one not yet asked for is
    // asked for as though this hook were not here.
    if (!next.called) {
      return yield* next(e)
    }
  })

  // A subagent's tools are counted in its own turn, not the person's.
  // The main loop's turn: its id is what a stop ends.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      mainTurn = e.turnId
      await update($, turnNow, () => e.turnId)
    }

    return next(e)
  }).catch(async ($, e, next) => {
    await note($, 'turn.start', next.error)

    return next.called ? undefined : next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const done = await next(e)

    if ('agentId' in done && typeof done.agentId === 'string') {
      const subagent = done.agentId
      const at = await $.clock.now()

      // The pane keeps the last turn that had subagents: the first spawn of a
      // new turn lets the settled ones of the turn before go.
      if (crewTurn !== mainTurn) {
        crewTurn = mainTurn
        await update($, crew, newTurn)
      }

      await update($, crew, held => joined(held, subagent, e.subagentType, e.description, at))
      watchCrew($, crewWatch)
    }

    return done
  }).catch(async ($, e, next) => {
    await note($, 'agent.spawn', next.error)

    return next.called ? undefined : next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      tools = { ...tools, [e.tool]: (tools[e.tool] ?? 0) + 1 }
    } else {
      const subagent = e.agentId
      const at = await $.clock.now()

      await update($, crew, held => used(held, subagent, e.tool, at))
      watchCrew($, crewWatch)
    }

    return next(e)
  }).catch(async ($, e, next) => {
    await note($, 'tool.call', next.error)

    return next.called ? undefined : next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Read field by field: a field it cannot read counts nothing, and the
    // band says so.
    const usage = e.usage === undefined ? null : turnTokens(e.usage)

    if (e.usage !== undefined) {
      await update($, turnRead, () => usage?.isWhole ?? false)
    }

    // Every turn's tokens count, a subagent's too: by day, by project, for
    // the session, and toward the turn it ran in.
    if (usage !== null) {
      const count = usage.input + usage.output + usage.cacheRead + usage.cacheWrite

      await update($, sessionTokens, held => held + count)
      pending += count

      if (e.agentId !== undefined) {
        const subagent = e.agentId
        const at = await $.clock.now()

        await update($, crew, held => spent(held, subagent, count, at))
      }

      // The count goes on the day and the project in this session's own
      // share; a disk that refuses leaves the turn still taken in.
      try {
        const at = await $.clock.now()

        await adopt($)
        const model = isModel(e.usage) ? e.usage.model : NO_MODEL
        // A subagent's turn goes under its agent type as well: the first of
        // its turns is a run.
        const agent = e.agentId === undefined ? undefined : await agentOf($, e.agentId, seenAgents)

        await update($, mine, held => counted(held, at, project, count, model, agent))
        await keep($)
        await gather($, at)
      } catch {
        // Nothing to do: the share is held, and the next turn writes it.
      }
    }

    if (e.agentId === undefined) {
      const called = tools
      const heft = pending
      const fill = (await read($, snapshot))?.percent ?? null

      tools = {}
      pending = 0
      running = 0
      isHeavyTold = false
      parts = NO_PARTS
      // A compaction asked for while it ran, now that it has ended.
      $.clock.after(COMPACT_AFTER_MS, () => void compactIfAsked($))

      // The pause begins: the band counts the cache down, and the crab warns.
      const endedAt = await $.clock.now()

      await beginPause($, base, endedAt, (await read($, snapshot))?.tokens ?? null)
      await update($, restSince, () => endedAt)

      if (heft > 0) {
        // Read afresh: another session may have added its own meanwhile.
        try {
          const kept = [...saneTypical(await $.store.get(TYPICAL_KEY)), heft].slice(-TYPICAL_KEPT)

          await $.store.set(TYPICAL_KEY, kept)
          await update($, typical, () => kept)
        } catch {
          await update($, typical, held => [...held, heft].slice(-TYPICAL_KEPT))
        }
      }

      if (fill !== null) {
        await update($, growth, held => [...held, fill].slice(-GROWTH_KEPT))
      }

      if (heft > 0) {
        try {
          const at = await $.clock.now()
          const entry: Costly = { at, tokens: heft, project, tools: called }
          const kept = keepTurn(saneTurns(await $.store.get(TURNS_KEY)), entry, at)

          await $.store.set(TURNS_KEY, kept)
          await update($, turns, () => kept)
        } catch {
          // As above: the turn is still taken in.
        }
      }
    }

    if (usage !== null && e.agentId === undefined) {
      const turn: TurnTokens = {
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
      }

      await update($, last, () => turn)
    }

    return next(e)
  }).catch(async ($, e, next) => {
    await note($, 'turn.complete', next.error)

    return next.called ? undefined : next(e)
  })

  on('command.run', { command: 'tokens' }, async ($, e) => {
    const outcome = await choose($, base, e.args)

    if ('export' in outcome) {
      return { text: await exported($) }
    }

    if ('tidy' in outcome) {
      return { text: await tidy($, outcome.tidy) }
    }

    if (!('open' in outcome)) {
      if ('isCache' in outcome) {
        await testCache($, base, learnedTtl(await read($, pauses)).ttl)
      } else if ('isLapsed' in outcome) {
        await testLapse($)
      } else if ('isTest' in outcome) {
        const sample = 'isWeek' in outcome ? SAMPLE_WEEK : SAMPLE

        raising = (await bring($, await styleOf($, base), [sample], scope.surface)) ?? raising
      }

      const hasOutside = (await styleOf($, base)).notify !== 'app'
      // The cache's tests stay in the app: nothing went outside it.
      const extra =
        'isTest' in outcome && !('isCache' in outcome) && !('isLapsed' in outcome)
          ? hasOutside && raising !== undefined
            ? [`Last notification outside the app: ${raising}.`]
            : []
          : 'isList' in outcome
          ? [
              scope.fitting,
              ...(await trouble($, await $.clock.now())),
              raising === undefined ? undefined : `Last notification outside the app: ${raising}.`,
            ].filter(line => line !== undefined)
          : []

      return { text: [outcome.text, ...extra].join(' ') }
    }

    if (outcome.open === 'context') {
      await countContext($, 'summary')

      const opened = await $.ui.open({ id: CONTEXT_PANE, title: 'Token usage · context' })

      return {
        text: opened.isPlaced ? 'Token usage context pane opened.' : `Token usage context pane is waiting: ${opened.reason}`,
      }
    }

    if (outcome.open === 'agents') {
      if (await refreshCrew($)) {
        watchCrew($, crewWatch)
      }

      const opened = await $.ui.open({ id: AGENTS_PANE, title: 'Token usage · agents' })

      return {
        text: opened.isPlaced ? 'Token usage agents pane opened.' : `Token usage agents pane is waiting: ${opened.reason}`,
      }
    }

    if (outcome.open === 'style') {
      const opened = await $.ui.open({
        id: STYLE_PANE,
        title: 'Token usage style',
        focus: true,
      })

      return {
        text: opened.isPlaced
          ? 'Token usage style pane opened.'
          : `Token usage style pane is waiting: ${opened.reason}`,
      }
    }

    // The pane says in a line what fills the context: counted the free way.
    const usage = (await countContext($, 'summary')) ?? (await $.session.usage())
    await measure($, usage.context, usage.rateLimits, usage.cost, false, null)
    const opened = await $.ui.open({ id: PANE, title: 'Token usage' })

    return {
      text: opened.isPlaced
        ? 'Token usage pane opened.'
        : `Token usage pane is waiting: ${opened.reason}`,
    }
  }).catch(async ($, e, next) => {
    await note($, 'command.run', next.error)

    return { text: `token-usage could not do that: ${next.error.message ?? next.error.kind}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, drawBand).catch(async ($, e, next) => {
    await note($, 'band', next.error)

    const beneath = await next(e)

    try {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text dimColor>token-usage could not draw the band: {next.error.message ?? next.error.kind}</Text>
          {beneath}
        </Box>
      )
    } catch {
      return beneath
    }
  })

  // The picker: every choice a button, the one in force drawn as the primary.
  // A press goes the way the typed word does.
  on('ui.render', { component: 'Pane', requestId: STYLE_PANE }, drawStylePane).catch(async ($, e, next) => {
    await note($, 'style pane', next.error)

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>token-usage could not draw this pane: {next.error.message ?? next.error.kind}</Text>
  })

  // What fills the context, as /context draws it: the grid in the app's own
  // colours beside its rows, then the MCP servers in their apps' colours, the
  // memory files, the skills and the agents. Counted the free way; a press
  // counts it exactly with the token-count API.
  on('ui.render', { component: 'Pane', requestId: AGENTS_PANE }, drawAgentsPane).catch(async ($, e, next) => {
    await note($, 'agents pane', next.error)

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>token-usage could not draw this pane: {next.error.message ?? next.error.kind}</Text>
  })

  on('ui.render', { component: 'Pane', requestId: CONTEXT_PANE }, drawContextPane).catch(async ($, e, next) => {
    await note($, 'context pane', next.error)

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>token-usage could not draw this pane: {next.error.message ?? next.error.kind}</Text>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, drawUsagePane).catch(async ($, e, next) => {
    await note($, 'pane', next.error)

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>token-usage could not draw this pane: {next.error.message ?? next.error.kind}</Text>
  })
}
