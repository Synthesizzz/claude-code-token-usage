export type Sample = { at: number; percent: number }

export type Limit = {
  kind: string
  percentUsed: number
  resetsAt: string | null
  samples: Sample[]
}

export type Snapshot = {
  at: number
  tokens: number | null
  window: number
  percent: number | null
  limits: Limit[]
  usd: number | null
  // The parts of the last measurement this mod could not read.
  unread: string[]
}

export type TurnTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// Dollars by local day, for every session, and which lines of the day's
// budget were said already.
export type Ledger = {
  days: Record<string, number>
  told: { day: string; levels: number[] }
}

// What one session alone has spent and counted, by local day: dollars,
// tokens, and tokens by project and by model. Each session writes only its own.
export type Share = {
  days: Record<string, number>
  tokens: Record<string, number>
  projects: Record<string, Record<string, number>>
  models: Record<string, Record<string, number>>
  // Dollars by day, then by the project they were spent in.
  spent: Record<string, Record<string, number>>
  // A subagent's tokens by day, then by its agent type (Explore, Plan, ...),
  // and how many of each ran; absent while none has.
  agents?: Record<string, Record<string, number>>
  runs?: Record<string, Record<string, number>>
}

export type Tone = 'success' | 'warning' | 'error'

export type Palette = Record<Tone, string>

export type Layout = 'rings' | 'bars' | 'compact' | 'frames' | 'stack'

export type PaletteName =
  | 'classic'
  | 'ocean'
  | 'sunset'
  | 'mono'
  | 'forest'
  | 'berry'
  | 'ice'
  | 'ember'
  | 'mint'
  | 'safe'
  | 'okabe'

export type LabelSet = 'auto' | 'short' | 'long' | 'caps' | 'thai'

export type Part = 'context' | 'countdown' | 'forecast' | 'cost' | 'alerts' | 'crab' | 'breakdown'

// Where a notice goes: the app's own toast, the system's notifications, or both.
export type Notify = 'both' | 'app' | 'windows'

// Hours of the day, local, from the first up to the last: 22 to 8 runs
// across midnight.
export type Quiet = { from: number; to: number }

export type Style = {
  layout: Layout
  palette: PaletteName
  colors: Partial<Palette>
  labels: LabelSet
  hidden: Part[]
  notify: Notify
  hasEarlyAlert: boolean
  // Dollars a day the person means to stay under; null while none is set.
  budget: number | null
  // Dollars a week, Monday to Sunday; null while none is set.
  weekBudget: number | null
  // Dollars a month, its first day to its last; null while none is set.
  monthBudget: number | null
  // Dollars a day for a project, by the project's name.
  projectBudgets: Record<string, number>
  // A notification outside the app names no command and no question.
  isPrivate: boolean
  // Hours when nothing goes out to Windows; null while none are set.
  quiet: Quiet | null
  // News outside the app comes in the crab's own window, where Windows takes
  // notifications; off, it is a plain notification.
  hasPopup: boolean
  // A fill behind the desktop band, inside the app's own frame; null draws none.
  background: string | null
}

// Tokens by local day, then by project, for every session.
export type Projects = Record<string, Record<string, number>>

// A turn of the day: when it ended, its tokens (with its subagents'), where,
// and the tools it called, by how often.
export type Costly = { at: number; tokens: number; project: string; tools: Record<string, number> }

export type Notice = {
  kind: 'half' | 'near' | 'full' | 'pace' | 'back' | 'context' | 'budget' | 'spent' | 'cache'
  title: string
  text: string
  // The same in one line, for a place that draws no more.
  line: string
  bar: { name: string; value: number; label: string; status: string }
  // The rate-limit window the notice is about (`five_hour`, `seven_day`), so
  // the crab stands on that window's own ground; absent for the context and
  // the budget.
  window?: string
  // Buttons the crab offers with it, the one that fits best first; a split
  // of where the turn's tokens went; and the colour its words take.
  choices?: readonly { key: string; label: string; hint?: string }[]
  split?: readonly { name: string; share: number; color: string }[]
  tone?: 'error' | 'warning' | null
}

// The crab's poses: one for each kind of notice, one at its laptop while a
// turn runs, one standing by between turns, and four for news that calls the
// person back to the app: a task done, a question, leave needed to go on,
// and a long wait.
export type Mood =
  | 'half'
  | 'near'
  | 'jail'
  | 'pace'
  | 'back'
  | 'context'
  | 'work'
  | 'done'
  | 'ask'
  | 'allow'
  | 'idle'
  | 'sleep'

// The notice the crab is bringing, and when it came.
// `stay` is how long it stands before it leaves, where that is not the usual.
export type Saying = { notice: Notice; at: number; stay?: number }

// How a window's figure moves: breathing in its last minutes, or playing its
// reset once, from how full it was.
export type Motion = { kind: 'near' } | { kind: 'reset'; from: number }

// The windows that have just reset: when, and how full each was.
export type Fresh = Record<string, { at: number; from: number }>

// What the person was told already, by window: the levels passed and whether
// its pace was named.
export type Alerted = Record<string, { levels: number[]; hasPace: boolean }>

export type BandLimit = {
  label: string
  glyph: string
  tone: Tone
  percent: string
  left: string | null
}

export type Band = { limits: BandLimit[]; eta: string | null; cost: string | null }

export type RingCell = { text: string; kind: 'on' | 'off' | 'label' }

export type RingProps = { glyph: string; color: string; isWorking: boolean }

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      usage: Snapshot | null
      last: TurnTokens | null
      now: number
      style: Style | null
      alerted: Alerted
      fresh: Fresh
      saying: Saying | null
      // The main loop's running turn, a stop asked for when it ends, and the
      // heavy-turn line raised for the session.
      turnNow: string | null
      compactAfter: boolean
      heavyBoost: number
      // Until when `/tokens alerts test lapsed` has the band show a lapsed cache.
      cacheTest: number
      ledger: Ledger
      projects: Projects
      // Tokens by day, then by the model that answered, for every session.
      models: Projects
      // The subagents' tokens and runs by day, then by agent type.
      agents: { agents: Projects; runs: Projects }
      // The subagents of the turn, by id, for the agents pane.
      crew: Record<string, { id: string; type: string; description: string; status: string; tokens: number; live: number; context: number | null; tools: Record<string, number>; startedAt: number; endedAt: number | null }>
      turns: Costly[]
      // Tokens by local day, for every session; and this session's own.
      tokenDays: Record<string, number>
      // This session's own share, and what the store counted before shares.
      mine: Share
      mineName: string
      before: Share
      // Whether the last turn's tokens were all read; the last hook that failed.
      turnRead: boolean
      // The tokens of the last main turns, every session's, the latest last.
      typical: number[]
      // When the last main turn ended and how full the context was then:
      // the pause the cache is counting down; null while a turn runs.
      // `afterFork`: the pause began at a quiet Keep warm ping, not a turn.
      // `usd`: what the engine reckoned re-writing the cache costs, on resuming;
      // `lapsed`: the engine said the cache had lapsed by then.
      idleSince: { at: number; tokens: number | null; afterFork?: boolean; usd?: number; lapsed?: boolean } | null
      // The model of the main thread's last response: what a cache read costs.
      cacheModel: string | null
      // A quiet Keep warm ping was seen not to hold the cache: Keep warm sends
      // a turn that shows instead. Kept in the store.
      forkShort: boolean
      // When the crab last had nothing to do: a turn ended, or the session
      // began (a /clear too); null while a turn runs. Its nap counts from here.
      restSince: number | null
      // The pauses the cache was judged on, every session's.
      pauses: { gap: number; isKept: boolean; at: number }[]
      // The context's set-up by local day, as last counted: every session's.
      setUps: Record<string, Record<string, number>>
      // What fills the context as /context breaks it down, how it was counted,
      // and when; null until the pane or /tokens asks.
      breakdown: { detail: 'summary' | 'full'; at: number; value: unknown } | null
      // What the last session that ended counted, where, and when it ended.
      lastSession: { line: string; project: string; at: number } | null
      failed: { event: string; message: string; at: number } | null
      sessionTokens: number
      // The context fill at the end of each turn of this session.
      growth: number[]
    }
  }
}
