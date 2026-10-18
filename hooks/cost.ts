import type { Costly, Ledger, Notice, Projects, Share, Tone, TurnTokens } from '../types'

// What the days have cost. A session knows only its own running total, so
// each session keeps a share of its own, dollars a day, and adds to it what
// each reading costs over the one before; the day is the sum of every
// session's share. The dollars are Claude Code's own estimate at API prices:
// on a subscription they are not a bill.

const DAY_MS = 24 * 60 * 60_000
// Days kept in the ledger; the pane draws the last seven.
// A month's days at the most, so the month so far is always whole.
const KEPT_DAYS = 31
const WEEK_DAYS = 7
const BUDGET_LEVELS = [80, 100]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SPARKS = '▁▂▃▄▅▆▇█'
const BUDGET = "Today's budget"
// Projects the pane names, and turns of the day it keeps.
const TOP = 5

export const EMPTY: Ledger = { days: {}, told: { day: '', levels: [] } }

export const usd = (amount: number) => `$${amount.toFixed(2)}`

const pad = (value: number) => String(value).padStart(2, '0')
const named = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

// A day is the person's own: the local date, not the one in Greenwich.
export const dayOf = (at: number) => named(new Date(at))

// A ledger read back from the store, whatever was kept there.
export const saneLedger = (value: unknown): Ledger => {
  const { days, told } = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const { day, levels } = (typeof told === 'object' && told !== null ? told : {}) as Record<
    string,
    unknown
  >

  return {
    days: Object.fromEntries(
      Object.entries(typeof days === 'object' && days !== null ? days : {}).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    ),
    told: {
      day: typeof day === 'string' ? day : '',
      levels: Array.isArray(levels) ? BUDGET_LEVELS.filter(level => levels.includes(level)) : [],
    },
  }
}

const isSum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
// To a hundredth of a cent: sums of fractions drift otherwise.
const cents = (amount: number) => Math.round(amount * 10_000) / 10_000

// A project ledger read back from the store, whatever was kept there.
export const saneProjects = (value: unknown): Projects =>
  Object.fromEntries(
    Object.entries(isRecord(value) ? value : {})
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .map(([day, sums]) => [
        day,
        Object.fromEntries(Object.entries(sums).filter((entry): entry is [string, number] => isSum(entry[1]))),
      ]),
  )

export const addProject = (projects: Projects, at: number, name: string, amount: number): Projects => {
  const day = dayOf(at)
  const oldest = dayOf(at - KEPT_DAYS * DAY_MS)
  const sums = projects[day] ?? {}

  return Object.fromEntries(
    Object.entries({ ...projects, [day]: { ...sums, [name]: cents((sums[name] ?? 0) + amount) } }).filter(
      ([kept]) => kept >= oldest,
    ),
  )
}

// The last seven days by project, most first.
export const byProject = (projects: Projects, at: number) => {
  const now = new Date(at)
  const sums: Record<string, number> = {}

  for (let index = 0; index < WEEK_DAYS; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index)

    for (const [name, amount] of Object.entries(projects[named(date)] ?? {})) {
      sums[name] = cents((sums[name] ?? 0) + amount)
    }
  }

  return Object.entries(sums)
    .map(([name, sum]) => ({ name, total: sum }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP)
}

// The heaviest turns read back from the store, whatever was kept there.
export const saneTurns = (value: unknown): Costly[] =>
  (Array.isArray(value) ? value : []).flatMap(entry => {
    if (!isRecord(entry) || typeof entry.at !== 'number' || !Number.isFinite(entry.at)) {
      return []
    }

    if (!isSum(entry.tokens) || typeof entry.project !== 'string') {
      return []
    }

    const tools = isRecord(entry.tools) ? entry.tools : {}

    return [
      {
        at: entry.at,
        tokens: entry.tokens,
        project: entry.project,
        tools: Object.fromEntries(
          Object.entries(tools).filter(
            (pair): pair is [string, number] => Number.isInteger(pair[1]) && (pair[1] as number) > 0,
          ),
        ),
      },
    ]
  })

// The day's heaviest turns with one more: five at most, other days let go.
export const keepTurn = (turns: readonly Costly[], turn: Costly, now: number) =>
  [...turns.filter(({ at }) => dayOf(at) === dayOf(now)), turn]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, TOP)

// What a reading adds: its cost over the reading before. With no reading
// before, this is where the person came in and nothing is added; a session
// that had no cost yet began at nothing; a cost that fell was started over.
export const spentSince = (before: { usd: number | null } | null, after: number | null) => {
  if (before === null || after === null) {
    return 0
  }

  const held = before.usd ?? 0

  return after >= held ? after - held : after
}

export const add = (ledger: Ledger, at: number, amount: number): Ledger => {
  const day = dayOf(at)
  const oldest = dayOf(at - KEPT_DAYS * DAY_MS)
  // To a hundredth of a cent: sums of fractions drift otherwise.
  const total = Math.round(((ledger.days[day] ?? 0) + amount) * 10_000) / 10_000

  return {
    ...ledger,
    days: Object.fromEntries(
      Object.entries({ ...ledger.days, [day]: total }).filter(([kept]) => kept >= oldest),
    ),
  }
}

export const today = (ledger: Ledger, at: number) => ledger.days[dayOf(at)] ?? 0

// The last seven days of a count by day, oldest first, today last.
export const week = (days: Readonly<Record<string, number>>, at: number) => {
  const now = new Date(at)

  return Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (WEEK_DAYS - 1 - index))

    return { name: WEEKDAYS[date.getDay()] ?? '', value: days[named(date)] ?? 0 }
  })
}

export const total = (days: readonly { value: number }[]) =>
  days.reduce((sum, day) => sum + day.value, 0)

// The week as a row of blocks, for a surface that draws no picture.
export const spark = (days: readonly { value: number }[]) => {
  const top = Math.max(...days.map(day => day.value), 0)

  return days
    .map(day => SPARKS[top === 0 ? 0 : Math.round((day.value / top) * (SPARKS.length - 1))])
    .join('')
}

// A count of tokens as the pane says it: as it is under a thousand, then in
// thousands (to a tenth below a hundred thousand), then in millions.
export const shortTokens = (count: number) =>
  count < 1000
    ? String(Math.round(count))
    : count < 100_000
      ? `${(count / 1000).toFixed(1)}k`
      : count < 1_000_000
        ? `${Math.floor(count / 1000)}k`
        : `${(count / 1_000_000).toFixed(1)}M`

// A count by day read back from the store, whatever was kept there.
export const saneDays = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).filter((entry): entry is [string, number] => isSum(entry[1])),
  )

export const addDay = (days: Readonly<Record<string, number>>, at: number, amount: number) => {
  const day = dayOf(at)
  const oldest = dayOf(at - KEPT_DAYS * DAY_MS)

  return Object.fromEntries(
    Object.entries({ ...days, [day]: (days[day] ?? 0) + amount }).filter(([kept]) => kept >= oldest),
  )
}

export const NO_SHARE: Share = { days: {}, tokens: {}, projects: {}, models: {}, spent: {} }
export const NO_MODEL = '(unknown model)'

// A share read back from its file, whatever was kept there. A share kept
// before models were counted has none.
export const saneShare = (value: unknown): Share => {
  const { days, tokens, projects, models, spent, agents, runs } = isRecord(value) ? value : {}

  return {
    days: saneDays(days),
    tokens: saneDays(tokens),
    projects: saneProjects(projects),
    models: saneProjects(models),
    spent: saneProjects(spent),
    ...(agents === undefined ? {} : { agents: saneProjects(agents) }),
    ...(runs === undefined ? {} : { runs: saneProjects(runs) }),
  }
}

// The days as CSV, a row a day, oldest first: what each cost and counted.
export const exportCsv = (share: Share) => {
  const days = [...new Set([...Object.keys(share.days), ...Object.keys(share.tokens)])].sort()

  return [
    'day,usd,tokens',
    ...days.map(day => `${day},${(share.days[day] ?? 0).toFixed(4)},${share.tokens[day] ?? 0}`),
    '',
  ].join('\n')
}

// A model as the pane names it: no `claude-` before it, no date after it.
export const modelName = (model: string) =>
  model === '' ? NO_MODEL : model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

// What a reading cost goes on the day in the session's own share, and on the
// day under the project it was spent in.
export const spend = (share: Share, at: number, amount: number, project?: string): Share => ({
  ...share,
  days: add({ ...EMPTY, days: share.days }, at, amount).days,
  spent: project === undefined ? (share.spent ?? {}) : addProject(share.spent ?? {}, at, project, amount),
})

// A turn's tokens go on the day, and on the day under its project and the
// model that answered; a subagent's under its agent type too, with a run
// counted on its first turn.
export const counted = (
  share: Share,
  at: number,
  project: string,
  tokens: number,
  model = NO_MODEL,
  agent?: { type: string; isNew: boolean },
): Share => ({
  ...share,
  tokens: addDay(share.tokens, at, tokens),
  projects: addProject(share.projects, at, project, tokens),
  models: addProject(share.models, at, model, tokens),
  ...(agent === undefined
    ? {}
    : {
        agents: addProject(share.agents ?? {}, at, agent.type, tokens),
        runs: agent.isNew ? addProject(share.runs ?? {}, at, agent.type, 1) : (share.runs ?? {}),
      }),
})

// Every session's share summed: what the days have cost and counted, the
// last thirty-one days of it.
export const pool = (shares: readonly Share[], at: number): Share => {
  const oldest = dayOf(at - KEPT_DAYS * DAY_MS)
  const sum = (into: Record<string, number>, from: Readonly<Record<string, number>>, round: boolean) => {
    for (const [key, value] of Object.entries(from)) {
      const next = (into[key] ?? 0) + value

      into[key] = round ? cents(next) : next
    }
  }
  const days: Record<string, number> = {}
  const tokens: Record<string, number> = {}
  const projects: Projects = {}
  const models: Projects = {}
  const spent: Projects = {}
  const agents: Projects = {}
  const runs: Projects = {}
  const byDay = (into: Projects, from: Projects = {}) => {
    for (const [day, sums] of Object.entries(from)) {
      into[day] = into[day] ?? {}
      sum(into[day], sums, true)
    }
  }

  for (const share of shares) {
    sum(days, share.days, true)
    sum(tokens, share.tokens, false)
    byDay(projects, share.projects)
    byDay(models, share.models)
    byDay(spent, share.spent)
    byDay(agents, share.agents)
    byDay(runs, share.runs)
  }

  const recent = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([day]) => day >= oldest))

  return {
    days: recent(days),
    tokens: recent(tokens),
    projects: recent(projects),
    models: recent(models),
    spent: recent(spent),
    ...(Object.keys(agents).length === 0 ? {} : { agents: recent(agents), runs: recent(runs) }),
  }
}

// The last seven days of the subagents by agent type, the most tokens
// first, five at most: each with its runs, and the share of every token
// counted that they took.
export const bySubagent = (share: Pick<Share, 'agents' | 'runs'>, all: number, at: number) => {
  const tokens = byProject(share.agents ?? {}, at)
  const runs = new Map(byProject(share.runs ?? {}, at).map(({ name, total }) => [name, total]))
  const sum = tokens.reduce((held, { total }) => held + total, 0)

  return {
    rows: tokens.map(({ name, total }) => ({ name, total, runs: runs.get(name) ?? 0 })),
    share: all <= 0 ? 0 : Math.round((sum / all) * 100),
  }
}

// On a subscription no dollar is billed: a figure is the API's price of the
// tokens, which a session tells by the 5-hour and weekly windows it reads.
export const isPlanOf = (limits: readonly unknown[]) => limits.length > 0

// What a dollar figure is called, and what a budget it has filled is.
const worthOf = (isPlan: boolean) => (isPlan ? 'API worth' : 'cost')
const usedUp = (isPlan: boolean) => (isPlan ? 'is used at API prices' : 'is spent')

export const budgetShare = (ledger: Ledger, at: number, budget: number) =>
  (today(ledger, at) / budget) * 100

// What of the day's budget is news: each line once a day, for every session,
// so what was said is noted in the ledger itself.
export const budgetNews = (ledger: Ledger, at: number, budget: number | null, isPlan = false) => {
  if (budget === null) {
    return { notices: [], ledger }
  }

  const day = dayOf(at)
  const spent = today(ledger, at)
  const share = Math.round(budgetShare(ledger, at, budget))
  const held = ledger.told.day === day ? ledger.told.levels : []
  const passed = BUDGET_LEVELS.filter(level => share >= level)
  const top = passed.filter(level => !held.includes(level)).at(-1)
  const left = usd(Math.max(0, budget - spent))
  const notices: Notice[] =
    top === undefined
      ? []
      : top === 100
        ? [
            {
              kind: 'spent',
              title: `${BUDGET} of ${usd(budget)} ${usedUp(isPlan)}`,
              text: `Today so far: ${usd(spent)}.`,
              line: `${BUDGET} of ${usd(budget)} ${usedUp(isPlan)}: ${usd(spent)} so far`,
              bar: { name: BUDGET, value: 1, label: `${share}%`, status: `${usd(spent)} so far` },
            },
          ]
        : [
            {
              kind: 'budget',
              title: `Today's ${worthOf(isPlan)} at ${share}% of ${usd(budget)}`,
              text: `${left} left today.`,
              line: `Today's ${worthOf(isPlan)} at ${share}% of ${usd(budget)}, ${left} left`,
              bar: { name: BUDGET, value: share / 100, label: `${share}%`, status: `${left} left` },
            },
          ]

  return {
    notices,
    ledger: {
      ...ledger,
      told: { day, levels: BUDGET_LEVELS.filter(level => held.includes(level) || passed.includes(level)) },
    },
  }
}

// The week a moment is in, named by its Monday: the local date.
export const weekOf = (at: number) => {
  const date = new Date(at)

  return named(new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)))
}

// What the week has cost so far: Monday to today.
export const weekSpent = (days: Readonly<Record<string, number>>, at: number) => {
  const monday = weekOf(at)
  const now = dayOf(at)

  return cents(Object.entries(days).reduce((sum, [day, amount]) => (day >= monday && day <= now ? sum + amount : sum), 0))
}

// The month a moment is in, as `2026-10`: the local date.
export const monthOf = (at: number) => dayOf(at).slice(0, 7)

// What the month has cost so far: its first day to today.
export const monthSpent = (days: Readonly<Record<string, number>>, at: number) => {
  const month = monthOf(at)
  const now = dayOf(at)

  return cents(Object.entries(days).reduce((sum, [day, amount]) => (day.startsWith(month) && day <= now ? sum + amount : sum), 0))
}

// The month so far in a line: its dollars, its days, a day's on average.
export const monthLine = (days: Readonly<Record<string, number>>, at: number) => {
  const spent = monthSpent(days, at)
  const gone = new Date(at).getDate()

  return { spent, line: `${gone} ${gone === 1 ? 'day' : 'days'} · ${usd(spent / gone)} a day` }
}

export type MonthTold = { month: string; levels: number[] }

export const saneMonthTold = (value: unknown): MonthTold => {
  const { month, levels } = isRecord(value) ? value : {}

  return {
    month: typeof month === 'string' ? month : '',
    levels: Array.isArray(levels) ? BUDGET_LEVELS.filter(level => levels.includes(level)) : [],
  }
}

// What of the month's budget is news: each line once a month, for every
// session, as the week's is.
export const monthNews = (days: Readonly<Record<string, number>>, at: number, budget: number | null, told: MonthTold, isPlan = false) => {
  if (budget === null) {
    return { notices: [], told }
  }

  const month = monthOf(at)
  const said = spanNews(monthSpent(days, at), budget, told.month === month ? told.levels : [], 'month', isPlan)

  return { notices: said.notices, told: { month, levels: said.levels } }
}

// A budget over a span of days, the week or the month: news at 80% and when
// spent, each once a span.
const spanNews = (spent: number, budget: number, held: readonly number[], span: 'week' | 'month', isPlan: boolean) => {
  const share = Math.round((spent / budget) * 100)
  const passed = BUDGET_LEVELS.filter(level => share >= level)
  const top = passed.filter(level => !held.includes(level)).at(-1)
  const left = usd(Math.max(0, budget - spent))
  const name = `This ${span}'s budget`
  const notices: Notice[] =
    top === undefined
      ? []
      : top === 100
        ? [
            {
              kind: 'spent',
              title: `${name} of ${usd(budget)} ${usedUp(isPlan)}`,
              text: `This ${span} so far: ${usd(spent)}.`,
              line: `${name} of ${usd(budget)} ${usedUp(isPlan)}: ${usd(spent)} so far`,
              bar: { name, value: 1, label: `${share}%`, status: `${usd(spent)} so far` },
            },
          ]
        : [
            {
              kind: 'budget',
              title: `This ${span}'s ${worthOf(isPlan)} at ${share}% of ${usd(budget)}`,
              text: `${left} left this ${span}.`,
              line: `This ${span}'s ${worthOf(isPlan)} at ${share}% of ${usd(budget)}, ${left} left`,
              bar: { name, value: share / 100, label: `${share}%`, status: `${left} left` },
            },
          ]

  return { notices, levels: BUDGET_LEVELS.filter(level => held.includes(level) || passed.includes(level)) }
}

export type WeekTold = { week: string; levels: number[] }

export const saneWeekTold = (value: unknown): WeekTold => {
  const { week, levels } = isRecord(value) ? value : {}

  return {
    week: typeof week === 'string' ? week : '',
    levels: Array.isArray(levels) ? BUDGET_LEVELS.filter(level => levels.includes(level)) : [],
  }
}

// What of the week's budget is news: each line once a week, for every
// session, so what was said is kept beside the ledger.
export const weekNews = (days: Readonly<Record<string, number>>, at: number, budget: number | null, told: WeekTold, isPlan = false) => {
  if (budget === null) {
    return { notices: [], told }
  }

  const week = weekOf(at)
  const said = spanNews(weekSpent(days, at), budget, told.week === week ? told.levels : [], 'week', isPlan)

  return { notices: said.notices, told: { week, levels: said.levels } }
}

export type ProjectTold = { day: string; levels: Record<string, number[]> }

export const saneProjectTold = (value: unknown): ProjectTold => {
  const { day, levels } = isRecord(value) ? value : {}

  return {
    day: typeof day === 'string' ? day : '',
    levels: Object.fromEntries(
      Object.entries(isRecord(levels) ? levels : {}).map(([name, held]) => [
        name,
        Array.isArray(held) ? BUDGET_LEVELS.filter(level => held.includes(level)) : [],
      ]),
    ),
  }
}

// What of each project's budget is news: each line once a day per project,
// for every session, so what was said is kept beside the ledger.
export const projectNews = (
  spent: Readonly<Projects>,
  at: number,
  budgets: Readonly<Record<string, number>>,
  told: ProjectTold,
  isPlan = false,
) => {
  const day = dayOf(at)
  const held = told.day === day ? told.levels : {}
  const notices: Notice[] = []
  const levels: Record<string, number[]> = { ...held }

  for (const [name, budget] of Object.entries(budgets)) {
    const used = spent[day]?.[name] ?? 0
    const share = Math.round((used / budget) * 100)
    const before = held[name] ?? []
    const passed = BUDGET_LEVELS.filter(level => share >= level)
    const top = passed.filter(level => !before.includes(level)).at(-1)
    const left = usd(Math.max(0, budget - used))
    const label = `${name}'s budget`

    if (top === 100) {
      notices.push({
        kind: 'spent',
        title: `${label} of ${usd(budget)} ${usedUp(isPlan)}`,
        text: `Today so far: ${usd(used)}.`,
        line: `${label} of ${usd(budget)} ${usedUp(isPlan)}: ${usd(used)} so far`,
        bar: { name: label, value: 1, label: `${share}%`, status: `${usd(used)} so far` },
      })
    } else if (top !== undefined) {
      notices.push({
        kind: 'budget',
        title: `${isPlan ? `${name}'s API worth` : name} today at ${share}% of ${usd(budget)}`,
        text: `${left} left today.`,
        line: `${isPlan ? `${name}'s API worth` : name} today at ${share}% of ${usd(budget)}, ${left} left`,
        bar: { name: label, value: share / 100, label: `${share}%`, status: `${left} left` },
      })
    }

    if (passed.length > 0) {
      levels[name] = BUDGET_LEVELS.filter(level => before.includes(level) || passed.includes(level))
    }
  }

  return notices.length === 0 ? { notices, told } : { notices, told: { day, levels } }
}

// A turn's tokens, read field by field: one it cannot read counts nothing,
// and `isWhole` says whether every one was read. A turn with none readable
// has none.
export const turnTokens = (usage: unknown) => {
  const fields = isRecord(usage) ? usage : {}
  const fieldOf = (name: string) => (isSum(fields[name]) ? (fields[name] as number) : null)
  const read = [
    fieldOf('input_tokens'),
    fieldOf('output_tokens'),
    fieldOf('cache_read_input_tokens'),
    fieldOf('cache_creation_input_tokens'),
  ]
  const [input, output, cacheRead, cacheWrite] = read.map(value => value ?? 0)

  return read.every(value => value === null)
    ? null
    : {
        input: input ?? 0,
        output: output ?? 0,
        cacheRead: cacheRead ?? 0,
        cacheWrite: cacheWrite ?? 0,
        isWhole: read.every(value => value !== null),
      }
}

// What a session that ends counted and spent, beside the average of the
// other sessions that counted anything in the last seven days; nothing for
// a session that counted nothing.
export const sessionSummary = (own: Share, others: readonly Share[], at: number, isPlan = false) => {
  const sumOf = (record: Readonly<Record<string, number>>, from = '') =>
    Object.entries(record).reduce((sum, [day, value]) => (day >= from ? sum + value : sum), 0)
  const tokens = sumOf(own.tokens)
  const spent = cents(sumOf(own.days))

  if (tokens === 0 && spent === 0) {
    return null
  }

  const from = dayOf(at - (WEEK_DAYS - 1) * DAY_MS)
  const weeks = others.map(share => sumOf(share.tokens, from)).filter(sum => sum > 0)
  const average = weeks.length === 0 ? 0 : weeks.reduce((sum, value) => sum + value, 0) / weeks.length
  const beside =
    average === 0 || tokens === 0
      ? ''
      : `, ${(tokens / average).toFixed(1)}× your average session this week (${shortTokens(average)})`

  return `This session: ${shortTokens(tokens)} tokens, ${usd(spent)}${isPlan ? ' at API prices' : ''}${beside}.`
}

// A turn far heavier than usual: past five times the median of the last
// turns, never under a floor; with fewer than three turns to go by, a higher
// floor stands alone.
const HEAVY_TIMES = 5
const HEAVY_FLOOR = 300_000
const HEAVY_ALONE = 500_000
const HEAVY_KNOWN = 3

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export const heavyThreshold = (past: readonly number[]) =>
  past.length < HEAVY_KNOWN ? HEAVY_ALONE : Math.max(HEAVY_FLOOR, HEAVY_TIMES * median(past))

export const heavyLine = (running: number, past: readonly number[]) => {
  const usual = past.length < HEAVY_KNOWN ? 0 : median(past)

  return {
    title: `This turn has used ${shortTokens(running)} tokens`,
    text: usual === 0 ? 'Esc stops it.' : `${Math.round(running / usual)}× a usual turn (${shortTokens(usual)}). Esc stops it.`,
  }
}

// Tips from what the counts already say, the most pressing first, two at
// most: a full context, a turn that missed the cache, a day far above the
// week. `days` is the week, oldest first, today last.
const TIPS = 2
const TIP_CONTEXT = 70
const TIP_CACHE = 50
const TIP_INPUT = 20_000
const TIP_RATIO = 2

export const tips = (seen: { turn: TurnTokens | null; percent: number | null; days: readonly { value: number }[] }) => {
  const cache = cacheShare(seen.turn)
  const input = seen.turn === null ? 0 : seen.turn.input + seen.turn.cacheRead + seen.turn.cacheWrite
  const before = seen.days.slice(0, -1)
  const average = before.length === 0 ? 0 : total(before) / before.length
  const now = seen.days.at(-1)?.value ?? 0
  const ratio = average === 0 ? 0 : now / average

  return [
    seen.percent !== null && seen.percent >= TIP_CONTEXT
      ? `Context at ${Math.round(seen.percent)}%: /compact before a big task, so the turns after it read less.`
      : null,
    cache !== null && cache < TIP_CACHE && input >= TIP_INPUT
      ? `Only ${cache}% of the last turn's input came from the cache: a long pause, or a change early in the conversation, makes a turn pay for its whole input again.`
      : null,
    ratio >= TIP_RATIO
      ? `Today is ${ratio.toFixed(1)}× your daily average of the last six days (${shortTokens(average)}).`
      : null,
  ]
    .filter(line => line !== null)
    .slice(0, TIPS)
}

// What of a turn's input was read from the cache, in percent: the higher,
// the less the turn cost.
// The colour a share read from the cache is said in: calm from half, a
// warning from a fifth, an error under it.
export const shareTone = (share: number) => (share >= 50 ? 'success' : share >= 20 ? 'warning' : 'error') as Tone

export const cacheShare = (turn: TurnTokens | null) => {
  const input = turn === null ? 0 : turn.input + turn.cacheRead + turn.cacheWrite

  return turn === null || input === 0 ? null : Math.round((turn.cacheRead / input) * 100)
}
