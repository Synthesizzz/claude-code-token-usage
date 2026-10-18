import { shortTokens } from './cost'

// What fills the context, as /context breaks it down. The engine hands the
// rows, the grid and the lists beneath it; this says them as the pane does:
// the rows used most first, the grid square by square, the MCP tools summed
// by server in the colour of the app each one is for.

type Category = { name: string; tokens: number; kind: string }
type Square = { categoryName: string; squareFullness: number; isFilled: boolean }
type Tool = { serverName: string; tokens: number; isLoaded: boolean }

// The rows used, most first; and what stands apart from them.
export const kindsOf = <Row extends Category>(categories: readonly Row[]) => {
  const sum = (kind: string) =>
    categories.filter(category => category.kind === kind).reduce((total, category) => total + category.tokens, 0)

  return {
    used: categories.filter(({ kind, tokens }) => kind === 'used' && tokens > 0).sort((a, b) => b.tokens - a.tokens),
    free: sum('free'),
    buffer: sum('buffer'),
    deferred: sum('deferred'),
  }
}

// The three rows that take the most, for a line in /tokens.
export const contextLine = (categories: readonly Category[]) => {
  const used = kindsOf(categories).used.slice(0, 3)

  return used.length === 0 ? null : used.map(({ name, tokens }) => `${name} ${shortTokens(tokens)}`).join(' · ')
}

// A square of the grid: full, partly full (as /context draws it hollow under
// 0.7), the compaction buffer, or free.
export const glyphOf = (square: Square, kinds: ReadonlyMap<string, string>) => {
  const kind = kinds.get(square.categoryName)

  if (kind === 'buffer') {
    return '▨'
  }

  if (kind === 'free' || !square.isFilled) {
    return '□'
  }

  return square.squareFullness < 0.7 ? '▪' : '■'
}

// The MCP tools summed by server: what is in the window, and what waits to
// be searched for, the most first.
export const servers = (tools: readonly (Tool & { name: string })[]) => {
  const by = new Map<
    string,
    { server: string; tokens: number; loaded: number; total: number; deferred: number; tools: string[] }
  >()

  for (const tool of tools) {
    const held = by.get(tool.serverName) ?? { server: tool.serverName, tokens: 0, loaded: 0, total: 0, deferred: 0, tools: [] }

    by.set(tool.serverName, {
      ...held,
      tokens: held.tokens + (tool.isLoaded ? tool.tokens : 0),
      loaded: held.loaded + (tool.isLoaded ? 1 : 0),
      total: held.total + 1,
      deferred: held.deferred + (tool.isLoaded ? 0 : tool.tokens),
      tools: [...held.tools, tool.name],
    })
  }

  return [...by.values()].sort((a, b) => b.tokens - a.tokens || b.deferred - a.deferred)
}

// The colour of the app a server is for, by a word in its name; null for an
// app whose mark is black and white, which takes the page's own ink.
const BRANDS: readonly [string, string | null][] = [
  ['figma', '#a259ff'],
  ['supabase', '#3ecf8e'],
  ['linear', '#5e6ad2'],
  ['slack', '#e01e5a'],
  ['stripe', '#635bff'],
  ['gmail', '#ea4335'],
  ['calendar', '#4285f4'],
  ['drive', '#1fa463'],
  ['canva', '#00c4cc'],
  ['atlassian', '#2684ff'],
  ['jira', '#2684ff'],
  ['asana', '#f06a6a'],
  ['hubspot', '#ff7a59'],
  ['sentry', '#8d5bd8'],
  ['zapier', '#ff4f00'],
  ['vercel', null],
  ['notion', null],
  ['github', null],
]
// A server the mod does not know: one of these, the same for the same name.
const OWN = ['#7c8cff', '#4eba65', '#d97757', '#5aa9e6', '#c084fc', '#f472b6', '#e8a33d']

export const serverColor = (server: string) => {
  const name = server.toLowerCase()
  const known = BRANDS.find(([word]) => name.includes(word))

  if (known !== undefined) {
    return known[1]
  }

  let hash = 0

  for (const letter of name) {
    hash = (hash * 31 + (letter.codePointAt(0) ?? 0)) >>> 0
  }

  return OWN[hash % OWN.length] ?? OWN[0] ?? null
}

// The apps the pane knows: the name it says, the colour of the app's mark
// (null for a mark in black and white, which takes the page's own ink), and
// the words in what its tools are called.
const APPS: readonly { name: string; color: string | null; tools: readonly string[] }[] = [
  { name: 'Figma', color: '#a259ff', tools: ['figma', 'figjam'] },
  { name: 'Supabase', color: '#3ecf8e', tools: ['supabase', 'execute_sql', 'apply_migration', 'edge_function'] },
  { name: 'Vercel', color: null, tools: ['vercel', 'deployment', 'edge_config'] },
  { name: 'Notion', color: null, tools: ['notion'] },
  { name: 'Canva', color: '#00c4cc', tools: ['canva', 'design', 'brand-template', 'brand-kit'] },
  { name: 'Gmail', color: '#ea4335', tools: ['gmail', 'draft', 'thread', 'label'] },
  { name: 'Google Calendar', color: '#4285f4', tools: ['calendar', 'event'] },
  { name: 'Google Drive', color: '#1fa463', tools: ['drive', 'file_content', 'file_permission', 'file_metadata'] },
  { name: 'Linear', color: '#5e6ad2', tools: ['linear'] },
  { name: 'Slack', color: '#e01e5a', tools: ['slack', 'channel'] },
  { name: 'Stripe', color: '#635bff', tools: ['stripe'] },
  { name: 'GitHub', color: null, tools: ['github', 'pull_request'] },
  { name: 'Jira', color: '#2684ff', tools: ['jira', 'confluence'] },
]
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

// What a server is called in the pane, and its colour. A server named in
// words keeps its name, less a `claude.ai` before it. A connector that comes
// under an id is named by the app its tools are for: the app most of its
// tools' names point to, by two at least where it has more than three; one
// the pane cannot place is said by the id's first part.
export const appOf = (server: string, tools: readonly string[]) => {
  if (!ID.test(server)) {
    return { name: server.replace(/^claude\.ai\s+/i, ''), color: serverColor(server) }
  }

  const named = tools.map(tool => (tool.split('__').at(-1) ?? tool).toLowerCase())
  const scores = APPS.map(app => ({
    app,
    score: named.filter(name => app.tools.some(word => name.includes(word))).length,
  })).sort((a, b) => b.score - a.score)
  const [best, next] = scores
  const enough = named.length <= 3 ? 1 : 2

  return best !== undefined && best.score >= enough && best.score > (next?.score ?? 0)
    ? { name: best.app.name, color: best.app.color }
    : { name: `connector ${server.slice(0, 8)}`, color: serverColor(server) }
}

// The set-up: what the context holds before any message, row by row.
export const setUpOf = (categories: readonly Category[]) =>
  Object.fromEntries(
    kindsOf(categories)
      .used.filter(({ name }) => name !== 'Messages')
      .map(({ name, tokens }) => [name, tokens]),
  )

type SetUps = Readonly<Record<string, Readonly<Record<string, number>>>>

const DAY_MS = 24 * 60 * 60 * 1000
const KEPT_DAYS = 30
const WEEK_DAYS = 7
const dayBefore = (day: string, days: number) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const back = new Date(year, month - 1, date - days)

  return `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}-${String(back.getDate()).padStart(2, '0')}`
}

// The set-up kept a day at a time: the latest of each day, thirty days.
export const keepSetUp = (kept: SetUps, day: string, setUp: Readonly<Record<string, number>>) =>
  Object.fromEntries(
    Object.entries({ ...kept, [day]: setUp }).filter(([held]) => held >= dayBefore(day, KEPT_DAYS)),
  )

const sumOf = (setUp: Readonly<Record<string, number>>) => Object.values(setUp).reduce((sum, value) => sum + value, 0)
const signed = (value: number) => `${value < 0 ? '−' : '+'}${shortTokens(Math.abs(value))}`

// Today's set-up beside the earliest day of the last week: how it has grown,
// and the row that moved most; nothing where today has none.
export const trendLine = (kept: SetUps, today: string) => {
  const now = kept[today]

  if (now === undefined) {
    return null
  }

  const said = `Set-up ${shortTokens(sumOf(now))}`
  const earliest = Object.keys(kept)
    .filter(day => day < today && day >= dayBefore(today, WEEK_DAYS))
    .sort()[0]
  const then = earliest === undefined ? undefined : kept[earliest]

  if (earliest === undefined || then === undefined) {
    return said
  }

  const change = sumOf(now) - sumOf(then)
  const label = earliest.slice(5)

  if (change === 0) {
    return `${said} · as on ${label}`
  }

  const [row, moved] =
    [...new Set([...Object.keys(now), ...Object.keys(then)])]
      .map(name => [name, (now[name] ?? 0) - (then[name] ?? 0)] as const)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] ?? []

  return `${said} · was ${shortTokens(sumOf(then))} on ${label} (${signed(change)}${row === undefined || moved === undefined ? '' : `: ${row} ${signed(moved)}`})`
}

// A path said from the home folder, and cut to its last three parts when long.
export const shortPath = (path: string, home: string | null) => {
  const slashed = path.replaceAll('\\', '/')
  const root = home === null ? null : home.replaceAll('\\', '/').replace(/\/$/, '')
  const said = root !== null && slashed.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? `~${slashed.slice(root.length)}` : slashed
  const parts = said.split('/')

  return parts.length > 5 ? `${parts[0]}/…/${parts.slice(-3).join('/')}` : said
}

// The band's bar of what fills the context: the rows used, by their share of
// what is used, as so many cells, each row a run in its own colour. Shares
// are cut by the largest remainder, so the cells always add up and a row
// with a share at all keeps the cells it is owed.
export const mixOf = (categories: readonly (Category & { color: string })[], cells: number) => {
  const used = kindsOf(categories).used
  const total = used.reduce((sum, { tokens }) => sum + tokens, 0)

  if (total <= 0 || cells <= 0) {
    return []
  }

  const owed = used.map(({ name, tokens }) => ({ name, exact: (tokens / total) * cells }))
  const counts = owed.map(({ exact }) => Math.floor(exact))
  const order = owed
    .map(({ exact }, index) => ({ index, rest: exact - Math.floor(exact) }))
    .sort((a, b) => b.rest - a.rest)

  for (const { index } of order.slice(0, cells - counts.reduce((sum, count) => sum + count, 0))) {
    counts[index] = (counts[index] ?? 0) + 1
  }

  const colorOf = new Map(categories.map(({ name, color }) => [name, color]))

  return used
    .map(({ name }, index) => ({ name, color: colorOf.get(name) ?? 'inactive', count: counts[index] ?? 0 }))
    .filter(({ count }) => count > 0)
}

// The set-up is heavy when it takes this much of the window it may fill.
const HEAVY_SET_UP = 0.25

// What the band says of what fills the context, only where there is
// something to do: a context past 80% says how much the messages hold (the
// Compact beside it clears them); a set-up past a quarter of the room says
// what is biggest in it (a server or skill not used can go). Otherwise nothing.
export const contextNews = (
  categories: readonly Category[],
  rawMaxTokens: number,
  isCrowded: boolean,
): { text: string; tone: 'error' | 'warning' } | null => {
  const { used, buffer } = kindsOf(categories)
  const messages = used.find(({ name }) => name === 'Messages')

  if (isCrowded) {
    return messages === undefined ? null : { text: `messages ${shortTokens(messages.tokens)}`, tone: 'error' }
  }

  const setUp = used.filter(({ name }) => name !== 'Messages')
  const total = setUp.reduce((sum, { tokens }) => sum + tokens, 0)
  const top = setUp[0]

  return top !== undefined && total >= HEAVY_SET_UP * (rawMaxTokens - buffer)
    ? { text: `set-up ${shortTokens(total)} · ${top.name} ${shortTokens(top.tokens)}`, tone: 'warning' }
    : null
}
