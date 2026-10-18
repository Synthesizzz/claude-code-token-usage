// The subagents of a turn, the crew the agents pane draws: who each is, what
// it has called and counted, and how it stands. Read field by field from
// what the engine says at a spawn, a tool call, a turn and its agent list.

import type { JobPhase } from './crab'

export type Mate = {
  id: string
  type: string
  description: string
  status: string
  tokens: number
  // What its responses have counted in the turn it runs now, until that
  // turn's own sum stands in its place.
  live: number
  // The context its last response read, what Claude Code calls its tokens;
  // null until one has ended.
  context: number | null
  tools: Record<string, number>
  startedAt: number
  endedAt: number | null
}

export type Crew = Record<string, Mate>

// A subagent stands done this long after it ends, then sleeps.
export const DONE_MS = 14_000

const SETTLED = ['completed', 'failed', 'killed']

export const isSettled = (status: string) => SETTLED.includes(status)

const fresh = (id: string, at: number, type = 'subagent', description = ''): Mate => ({
  id,
  type,
  description,
  status: 'running',
  tokens: 0,
  live: 0,
  context: null,
  tools: {},
  startedAt: at,
  endedAt: null,
})

// A subagent the engine has just started.
export const joined = (crew: Crew, id: string, type: string, description: string, at: number): Crew => ({
  ...crew,
  [id]: { ...(crew[id] ?? fresh(id, at)), type, description },
})

// A tool it called; one not seen start joins the crew here.
export const used = (crew: Crew, id: string, tool: string, at: number): Crew => {
  const mate = crew[id] ?? fresh(id, at)

  return { ...crew, [id]: { ...mate, tools: { ...mate.tools, [tool]: (mate.tools[tool] ?? 0) + 1 } } }
}

// The tokens of one of its responses, while its turn runs, and the context
// that response read.
export const stepped = (crew: Crew, id: string, tokens: number, context: number, at: number): Crew => {
  const mate = crew[id] ?? fresh(id, at)

  return { ...crew, [id]: { ...mate, live: (mate.live ?? 0) + tokens, context } }
}

// The tokens of one of its turns, which take the place of its responses'.
export const spent = (crew: Crew, id: string, tokens: number, at: number): Crew => {
  const mate = crew[id] ?? fresh(id, at)

  return { ...crew, [id]: { ...mate, tokens: mate.tokens + tokens, live: 0 } }
}

// All it has counted: its turns', and its responses' in the turn it runs now.
export const countOf = (mate: Mate) => mate.tokens + (mate.live ?? 0)

type Listed = { id: string; type?: unknown; description?: unknown; status?: unknown }

// How each stands by the engine's agent list. One the list has let go of
// while it ran has ended; one that settles now ends now. One the list has and
// the crew does not, still running, a spawn the mod did not see (it loaded
// after, or was reloaded), joins as the list tells it; one that has ended is
// a turn before's, which the list keeps a while after a new turn lets it go.
export const settled = (crew: Crew, listed: readonly Listed[], at: number): Crew =>
  Object.fromEntries(
    [
      ...Object.values(crew),
      ...listed
        .filter(({ id, status }) => crew[id] === undefined && !(typeof status === 'string' && isSettled(status)))
        .map(({ id, type, description }) => fresh(id, at, typeof type === 'string' ? type : 'subagent', typeof description === 'string' ? description : '')),
    ].map(mate => {
      const seen = listed.find(({ id }) => id === mate.id)
      const status = seen === undefined ? (isSettled(mate.status) ? mate.status : 'completed') : typeof seen.status === 'string' ? seen.status : mate.status
      const type = mate.type === 'subagent' && typeof seen?.type === 'string' ? seen.type : mate.type
      const description = mate.description === '' && typeof seen?.description === 'string' ? seen.description : mate.description

      return [mate.id, { ...mate, type, description, status, endedAt: mate.endedAt ?? (isSettled(status) ? at : null) }]
    }),
  )

export const isBusy = (crew: Crew) => Object.values(crew).some(({ status }) => !isSettled(status))

// A new turn begins: those still running stay, the rest are the last turn's.
export const newTurn = (crew: Crew): Crew => Object.fromEntries(Object.entries(crew).filter(([, mate]) => !isSettled(mate.status)))

export const phaseOf = (mate: Mate, at: number): JobPhase =>
  mate.status === 'failed' || mate.status === 'killed'
    ? 'fail'
    : !isSettled(mate.status)
      ? 'work'
      : mate.endedAt !== null && at - mate.endedAt < DONE_MS
        ? 'done'
        : 'sleep'

// Those at work first, by when they started; then the rest, the latest ended first.
export const lineUp = (crew: Crew) =>
  Object.values(crew).sort((a, b) =>
    isSettled(a.status) !== isSettled(b.status)
      ? isSettled(a.status)
        ? 1
        : -1
      : isSettled(a.status)
        ? (b.endedAt ?? 0) - (a.endedAt ?? 0)
        : a.startedAt - b.startedAt,
  )

// The tools it called, the most first, three at most.
export const toolLine = (mate: Mate) =>
  Object.entries(mate.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name.startsWith('mcp__') ? (name.split('__').at(-1) ?? name) : name}${count > 1 ? `×${count}` : ''}`)
    .join(' · ')

// How long it has worked, or worked: seconds, then minutes and seconds.
export const workedFor = (mate: Mate, at: number) => {
  const seconds = Math.max(0, Math.round(((mate.endedAt ?? at) - mate.startedAt) / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

// A thin bar of its share of the most any of them counted, in its colour.
export const meterSvg = (share: number, color: string, width: number, alt: string) => {
  const filled = Math.max(0, Math.min(1, share)) * width

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="4" viewBox="0 0 ${width} 4"><rect width="${width}" height="4" rx="2" fill="#8b919c" fill-opacity=".25"/><rect width="${filled.toFixed(1)}" height="4" rx="2" fill="${color}"/></svg>`,
    alt,
  }
}
