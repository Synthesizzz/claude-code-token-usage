// Every open session at a glance: what each one is doing, how warm its cache
// still is, and what its next turn would cost to wake. Each session keeps a
// small file of its own; these are the rules that read them.

import type { FleetEntry } from '../types'
import { cachePhase, cacheRates } from './cache'
import { shortTokens } from './cost'
import { NO_PROJECT } from './state'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

// A session counts as open while it has not ended and its last reply (or the
// start of the turn it runs) is this recent: one closed without a goodbye
// drops out after it.
export const OPEN_MS = 6 * HOUR_MS
// A cache whose time is not learned yet lasts the hour, a subscription's own.
export const FLEET_TTL = HOUR_MS
// The prompt's share of a label, in terminal cells.
export const LABEL_CELLS = 24
// The band draws this many sessions as dots at most, and says the rest.
export const MAX_DOTS = 6

export type FleetPhase = 'working' | 'warm' | 'near' | 'gone'

export type FleetRow = {
  id: string
  label: string
  phase: FleetPhase
  // Until the cache lapses (warm, near), or since it did (gone).
  left: number | null
  since: number
  // How long ago the cache lapsed; null while it holds.
  ago: number | null
  tokens: number | null
  wake: number | null
  isOwn: boolean
}

const ORDER: Record<FleetPhase, number> = { working: 0, near: 1, warm: 2, gone: 3 }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const numberOrNull = (value: unknown) => (isNumber(value) ? value : null)
const stringOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

// One session's file as it was read, or null where it is not one.
export const saneEntry = (value: unknown): FleetEntry | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const held = value as Record<string, unknown>

  if (typeof held.id !== 'string' || held.id === '' || !isNumber(held.at)) {
    return null
  }

  return {
    id: held.id,
    cwd: typeof held.cwd === 'string' ? held.cwd : '',
    label: typeof held.label === 'string' ? held.label : '',
    at: held.at,
    startedAt: numberOrNull(held.startedAt),
    tokens: numberOrNull(held.tokens),
    model: stringOrNull(held.model),
    ttl: numberOrNull(held.ttl),
    isWorking: held.isWorking === true,
    ended: numberOrNull(held.ended),
    hostId: stringOrNull(held.hostId),
  }
}

// How many terminal cells a character takes: none for a combining mark (a
// Thai vowel above or below, a tone mark), two for a wide one.
const cellOf = (char: string) => {
  const code = char.codePointAt(0) ?? 0

  if (/\p{M}/u.test(char)) {
    return 0
  }

  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
    ? 2
    : 1
}

export const cellWidth = (text: string) => [...text].reduce((sum, char) => sum + cellOf(char), 0)

// The text cut to at most `cells` cells, with an ellipsis where it was cut,
// never between a letter and the marks it carries.
export const clipCells = (text: string, cells: number) => {
  if (cellWidth(text) <= cells) {
    return text
  }

  let kept = ''
  let width = 0

  for (const char of text) {
    const size = cellOf(char)

    if (size > 0 && width + size > cells - 1) {
      break
    }

    kept += char
    width += size
  }

  return `${kept}…`
}

// A session another one started opens on the background it was handed, the
// same words for every such session: its task, below, is what names it.
const HANDED = /^\s*Background \(from the session that started this one\):[ \t]*\r?\n?/
const TASK_LINE = /\r?\n\s*Task:[ \t]*\r?\n/

const handedTask = (prompt: string) => {
  if (!HANDED.test(prompt)) {
    return prompt
  }

  const parts = prompt.split(TASK_LINE)

  return parts.length > 1 ? parts.slice(1).join('\n') : prompt.replace(HANDED, '')
}

// What a prompt says once the wrapping the harness adds is taken off: tagged
// blocks (a system reminder and the like) and leading [bracketed] notes. The
// tags go first, since the app puts a reminder before a handed background.
const spoken = (prompt: string) => {
  let text = handedTask(prompt.replace(/<([A-Za-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))

  for (let before = ''; before !== text; ) {
    before = text
    text = text.replace(/^\s*\[[^\]]*\]/, '')
  }

  return text.replace(/\s+/g, ' ').trim()
}

// A session's name: the folder it runs in and how its first prompt began.
export const labelOf = (cwd: string, prompt: string) => {
  const folder = cwd.split(/[\\/]/).filter(part => part !== '').at(-1) ?? NO_PROJECT
  const text = spoken(prompt)

  return text === '' ? folder : `${folder} · ${clipCells(text, LABEL_CELLS)}`
}

// Each session's name to show: one that two sessions share carries the first
// four characters of its id.
export const uniqueLabels = (entries: readonly FleetEntry[]) => {
  const named = entries.map(entry => [entry.id, entry.label === '' ? labelOf(entry.cwd, '') : entry.label] as const)
  const counts = new Map<string, number>()

  for (const [, label] of named) {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return new Map(named.map(([id, label]) => [id, (counts.get(label) ?? 0) > 1 ? `${label} ·${id.slice(0, 4)}` : label]))
}

export const isOpen = (entry: FleetEntry, now: number) =>
  entry.ended === null && now - (entry.isWorking && entry.startedAt !== null ? entry.startedAt : entry.at) <= OPEN_MS

// Working, or how its cache stands since its last reply.
export const phaseOf = (entry: FleetEntry, now: number): { phase: FleetPhase; left: number | null } => {
  if (entry.isWorking) {
    return { phase: 'working', left: null }
  }

  const ttl = entry.ttl ?? FLEET_TTL
  const said = cachePhase(now - entry.at, ttl)

  if (said === null) {
    return { phase: 'warm', left: Math.max(0, ttl - (now - entry.at)) }
  }

  return { phase: said.phase === 'calm' ? 'warm' : said.phase, left: said.phase === 'gone' ? null : said.left }
}

// What the session's next turn reads at full input price: its context at the
// cache's write price once the cache lapsed, at the read price while warm.
export const wakeTokens = (entry: FleetEntry, phase: FleetPhase) => {
  if (phase === 'working' || entry.tokens === null) {
    return null
  }

  const rates = cacheRates(entry.model, entry.ttl)

  return Math.round(entry.tokens * (phase === 'gone' ? rates.write : rates.read))
}

// The open sessions, the working first, then the nearest to lapse, the warm,
// and the lapsed; within each the latest reply first.
export const fleetRows = (entries: readonly FleetEntry[], now: number, ownId: string): FleetRow[] => {
  const open = entries.filter(entry => isOpen(entry, now))
  const labels = uniqueLabels(open)

  return open
    .map(entry => {
      const { phase, left } = phaseOf(entry, now)

      return {
        id: entry.id,
        label: labels.get(entry.id) ?? entry.label,
        phase,
        left,
        since: now - entry.at,
        ago: phase === 'gone' ? Math.max(0, now - entry.at - (entry.ttl ?? FLEET_TTL)) : null,
        tokens: entry.tokens,
        wake: wakeTokens(entry, phase),
        isOwn: entry.id === ownId,
        at: entry.at,
      }
    })
    .sort((one, other) => ORDER[one.phase] - ORDER[other.phase] || other.at - one.at)
    .map(({ at: _at, ...row }) => row)
}

// The dot each phase draws: a ring round the one at work, a hollow one once
// the cache has lapsed.
export const GLYPHS: Record<FleetPhase, string> = { working: '◉', warm: '●', near: '●', gone: '○' }

// A time said short: minutes under the hour, hours and minutes past it.
export const spanText = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS))

  return minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

export const phaseText = (row: FleetRow) =>
  row.phase === 'working'
    ? 'working'
    : row.phase === 'gone'
      ? `lapsed ${spanText(row.ago ?? 0)} ago`
      : row.phase === 'near'
        ? `lapses in ${spanText(row.left ?? 0)}`
        : `cache ${spanText(row.left ?? 0)}`

// One session as a line: its name, what it does, its context, and the price
// of its next turn.
export const rowText = (row: FleetRow) =>
  [
    `${row.label}${row.isOwn ? ' (this)' : ''}`,
    phaseText(row),
    row.tokens === null ? null : `context ${shortTokens(row.tokens)}`,
    row.wake === null ? null : `wake ~${shortTokens(row.wake)}`,
  ]
    .filter(part => part !== null)
    .join(' · ')

// The band's dots: none while this session is alone, at most MAX_DOTS, and
// how many more are open past them.
export const dotsOf = (rows: readonly FleetRow[]) =>
  rows.length < 2 ? { dots: [], more: 0 } : { dots: rows.slice(0, MAX_DOTS), more: Math.max(0, rows.length - MAX_DOTS) }

// The colour a dot draws in: the cache's own tones, dim once it has lapsed.
export const dotColor = (phase: FleetPhase) =>
  phase === 'gone' ? { dimColor: true as const } : { color: phase === 'near' ? ('warning' as const) : ('success' as const) }

// The hint under the pointer on a dot: the session's name, and the rest.
export const dotHint = (row: FleetRow) => ({
  label: `${row.label}${row.isOwn ? ' (this)' : ''}`,
  hint: [phaseText(row), row.tokens === null ? null : `context ${shortTokens(row.tokens)}`, row.wake === null ? null : `wake ~${shortTokens(row.wake)}`]
    .filter(part => part !== null)
    .join(' · '),
})

// What `/tokens fleet` says: a line a session, or that this one is alone.
export const fleetText = (rows: readonly FleetRow[]) => {
  if (rows.filter(row => !row.isOwn).length === 0) {
    return 'Fleet: only this session is open.'
  }

  return [
    `Fleet: ${rows.length} open sessions. Wake is what the next turn reads, at full input price.`,
    ...rows.map(row => `- ${GLYPHS[row.phase]} ${rowText(row)}`),
  ].join('\n')
}
