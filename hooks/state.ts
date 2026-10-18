// What the mod holds: the store's keys and the sizes it draws by, the
// readers of what the store and the engine hand back, and the scope. Each
// module declares the atoms it reads: the same plugin and key are one value.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Band, RingCell, Share, Style } from '../types'
import { saneDays } from './cost'
import { defaults } from './style'
import { percentage } from './usage'

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

// The style `/tokens` chose; null while the options' own stand.
const chosen = atom({ plugin: 'token-usage', key: 'style' } as const, null)

export const PANE = 'tokens'

export const STYLE_PANE = 'tokens-style'

export const CONTEXT_PANE = 'tokens-context'

export const AGENTS_PANE = 'tokens-agents'

// While a subagent runs, the agents pane reads how each stands this often.
export const CREW_TICK_MS = 2000

export const STYLE_KEY = 'style'

export const TICK_MS = 30_000

// A palette's picture in the style picker.
export const CHIP_PX = { width: 42, height: 15 }

// The crab stays with a notice this long, unless it is sent away sooner.
export const SAY_MS = 8000

// A notice with choices stands this long, for a choice to be made.
export const CHOICE_MS = 45_000

// Then it walks off the stage for this long before its row goes.
export const LEAVE_MS = 600

// Where the script that notifies outside the app is told on or off, under
// the person's home folder.
export const SWITCH_FILE = '.claude/token-usage/notify.json'

export const LEDGER_KEY = 'ledger'

// What the last session that ended counted, for the next one's pane.
export const LAST_SESSION_KEY = 'lastSession'

// What of the week's budget was told, for every session.
export const WEEK_TOLD_KEY = 'weekTold'
// What of the month's budget was told, for every session.
export const MONTH_TOLD_KEY = 'monthTold'

// Each session counts what it spends and its tokens in a file of its own,
// under the person's home folder, and reads every session's file: no two
// sessions ever write the same file, so none is written over.
export const SHARES_DIR = '.claude/token-usage/sessions'

// A file untouched this long holds no day still kept.
export const STALE_MS = 31 * 24 * 60 * 60_000

// The other sessions' files as last read, by name, with when each was
// written: a file read once is read again only once it has changed.
export const others = new Map<string, { mtimeMs: number; share: Share }>()

export const PROJECTS_KEY = 'projectTokens'

export const TURNS_KEY = 'heavyTurns'

export const TOKEN_DAYS_KEY = 'tokenDays'

export const GROWTH_KEPT = 10

// Compact is pressed for where the context fills within this many turns.
export const SOON_TURNS = 3

// What a session in no folder is counted under.
export const NO_PROJECT = '(no folder)'

export const BUDGET = "Today's budget"

// The budgets the picker offers; any other is typed: `/tokens budget 12.5`.
export const BUDGETS = [5, 10, 20, 50]
// What of each project's budget was told today, for every session.
export const PROJECT_TOLD_KEY = 'projectTold'
// The budgets the picker offers the session's own project.
export const PROJECT_BUDGETS = [1, 2, 5, 10]
// The weekly budgets the picker offers, and its quiet hours.
export const WEEK_BUDGETS = [25, 50, 100, 200]
// The budgets the picker offers a month.
export const MONTH_BUDGETS = [100, 200, 500, 1000]
export const QUIET_HOURS = ['22-8', '23-7', '0-8']

// A terminal draws the crab when the band has rows for it and room beside it.
export const CRAB_MIN_ROWS = 5

export const CRAB_MIN_COLUMNS = 40

// A terminal has no pointer to rest on a choice: with this many rows, and
// the crab's columns, what each choice does and costs is written under the
// buttons.
export const HINT_MIN_ROWS = 8

export const COMPACT = 'Compact'

export const FRESH = 'Start fresh'

export const NOTIFY_MS = 20_000

// The heaviest turns' table: cells for the time and the tokens, and the
// pane's width from which the tools have a column of their own.
export const TIME_CELLS = 9

export const TOKEN_CELLS = 6

export const TOOLS_COLUMNS = 38
// The share of the table's free cells the project may take before the tools.
export const PROJECT_SHARE = 0.55

// The context pane draws its grid beside its rows from this width.
export const BESIDE_COLUMNS = 44

export const SQUARE_CELLS = 2

// A window breathes in its last five minutes; its reset plays for three seconds.
export const NEAR_MS = 5 * 60_000

export const RESET_MS = 3000

export const SET_UPS_KEY = 'setUps'

export type Breakdown = {
  categories: { name: string; tokens: number; color: string; kind: string }[]
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  gridRows: { color: string; isFilled: boolean; categoryName: string; squareFullness: number }[][]
  memoryFiles: { path: string; type: string; tokens: number }[]
  mcpTools: { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents: { tokens: number }[]
  skills?: { totalSkills: number; includedSkills: number; tokens: number; skillFrontmatter: { name: string; tokens: number }[] }
}

// A breakdown read with care, as every reading is: one without its rows or
// its grid is none; a list it lacks is empty.
export const saneBreakdown = (value: unknown): Breakdown | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const held = value as Record<string, unknown>
  const list = (key: string) => (Array.isArray(held[key]) ? (held[key] as unknown[]) : [])

  if (!Array.isArray(held.categories) || !Array.isArray(held.gridRows)) {
    return null
  }

  return {
    ...(held as unknown as Breakdown),
    memoryFiles: list('memoryFiles') as Breakdown['memoryFiles'],
    mcpTools: list('mcpTools') as Breakdown['mcpTools'],
    agents: list('agents') as Breakdown['agents'],
  }
}

// The set-ups read back from the store, whatever was kept there.
export const saneSetUps = (value: unknown) =>
  Object.fromEntries(
    Object.entries(typeof value === 'object' && value !== null ? value : {})
      .filter(([day, rows]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && typeof rows === 'object' && rows !== null)
      .map(([day, rows]) => [day, saneDays(rows)]),
  )

export const PAUSES_KEY = 'cachePauses'

// Kept once a quiet Keep warm ping was seen not to hold the cache.
export const FORK_SHORT_KEY = 'forkShort'

// While a pause is counted down the band redraws this often.
export const CACHE_TICK_MS = 5000

// After a pause this long the crab sleeps where the context ring is.
export const SLEEP_MS = 2 * 60_000

export const TYPICAL_KEPT = 20

export const TYPICAL_KEY = 'typicalTurns'

export const saneTypical = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > 0,
  ).slice(-TYPICAL_KEPT)

// The last session that ended, read back from the store, or nothing.
export const saneLast = (value: unknown) => {
  const { line, project: where, at } = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >

  return typeof line === 'string' && typeof where === 'string' && typeof at === 'number' && Number.isFinite(at)
    ? { line, project: where, at }
    : null
}

// Whether a turn's usage names the model that answered.
export const isModel = (usage: unknown): usage is { model: string } =>
  typeof usage === 'object' && usage !== null && typeof (usage as { model?: unknown }).model === 'string' &&
  (usage as { model: string }).model !== ''

export async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
}

export const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// Neighbouring cells of one kind draw as one Text.
export const runs = (cells: readonly RingCell[]) =>
  cells.reduce<RingCell[]>((merged, cell) => {
    const before = merged.at(-1)

    return before !== undefined && before.kind === cell.kind
      ? [...merged.slice(0, -1), { ...before, text: before.text + cell.text }]
      : [...merged, cell]
  }, [])

// What the parts switched off take out of a band already fitted to its width.
export const shown = (band: Band, style: Style): Band => ({
  limits: style.hidden.includes('countdown')
    ? band.limits.map(limit => ({ ...limit, left: null }))
    : band.limits,
  eta: style.hidden.includes('forecast') ? null : band.eta,
  cost: style.hidden.includes('cost') ? null : band.cost,
})

export async function styleOf($: EngineInterface, base: Style) {
  return (await read($, chosen)) ?? base
}

// What the band and the panes read of the registration: the style before any
// choice, where the session is drawn, and what the desktop band last fitted.
export type Scope = {
  base: Style
  surface: string | undefined
  fitting: string | undefined
  // The folder the session runs in, by its last name.
  project: string
}

export const scope: Scope = { base: defaults({}), surface: undefined, fitting: undefined, project: '(no folder)' }
