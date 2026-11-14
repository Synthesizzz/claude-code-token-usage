// The fleet on the disk: this session's own file, every session's read back,
// and the summary other programs read.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { FleetEntry } from '../types'
import { learnedTtl } from './cache'
import { isOpen, phaseOf, saneEntry, uniqueLabels, wakeTokens } from './fleet'
import { FLEET_DIR, FLEET_JSON, scope } from './state'

const fleet = atom({ plugin: 'token-usage', key: 'fleet' } as const, [])
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)
const cacheModel = atom({ plugin: 'token-usage', key: 'cacheModel' } as const, null)
const pauses = atom({ plugin: 'token-usage', key: 'pauses' } as const, [])
const replyTtl = atom({ plugin: 'token-usage', key: 'replyTtl' } as const, null)

// The files read already, by name, with the time they were changed: a file
// is read again only once it changes.
const seen = new Map<string, { mtimeMs: number; entry: FleetEntry }>()

async function homeOf($: EngineInterface) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return typeof home === 'string' && home !== '' ? home : null
}

// The app's own id for this session (the desktop app says it), or null.
export async function hostIdOf($: EngineInterface) {
  try {
    const id = await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')

    return typeof id === 'string' && id !== '' ? id : null
  } catch {
    return null
  }
}

// This session's fleet file, or null where there is no home folder or no id.
export async function fleetFile($: EngineInterface) {
  try {
    const home = await homeOf($)
    const id = (await $.session.id()).replace(/[^A-Za-z0-9_-]/g, '')

    return home !== null && id !== '' ? { id, dir: `${home}/${FLEET_DIR}`, path: `${home}/${FLEET_DIR}/${id}.json`, home } : null
  } catch {
    return null
  }
}

export type FleetPatch = Partial<Omit<FleetEntry, 'id'>> | ((held: FleetEntry) => Partial<Omit<FleetEntry, 'id'>>)

// Writes this session's file: what it held, with the patch on top. Every
// write but the one at the end says the session is open again, so a resumed
// one comes back. A disk that refuses changes nothing else.
export async function keepFleet($: EngineInterface, cwd: string, patch: FleetPatch, isEnd = false) {
  try {
    const file = await fleetFile($)

    if (file === null) {
      return null
    }

    let held: FleetEntry | null = null

    try {
      held = saneEntry(JSON.parse(String(await $.fs.read(file.path))))
    } catch {
      // A new session: it has no file yet.
    }

    const at = await $.clock.now()
    const base: FleetEntry = held ?? {
      id: file.id,
      cwd,
      label: '',
      at,
      startedAt: null,
      tokens: null,
      model: null,
      ttl: null,
      isWorking: false,
      ended: null,
      hostId: null,
    }
    const more = typeof patch === 'function' ? patch(base) : patch
    const entry: FleetEntry = { ...base, cwd: cwd === '' ? base.cwd : cwd, ...more, id: file.id, ...(isEnd ? {} : { ended: null }) }

    scope.fleetId = file.id
    await $.fs.write(file.path, JSON.stringify(entry))
    // Read afresh next time: two writes within one tick of the clock keep the
    // same time of change.
    seen.delete(`${file.id}.json`)
    await update($, fleet, list => [...list.filter(other => other.id !== entry.id), entry])

    return entry
  } catch {
    return null
  }
}

// What the turn that ended leaves in the file: its reply's time, the context
// it left, the model, how long its cache lasts.
export async function turnEnded($: EngineInterface, cwd: string) {
  const at = await $.clock.now()
  const tokens = (await read($, snapshot))?.tokens ?? null
  const model = await read($, cacheModel)
  const ttl = learnedTtl(await read($, pauses), await read($, replyTtl)).ttl

  return keepFleet($, cwd, { at, tokens, model, ttl, isWorking: false, startedAt: null })
}

// Every session's file read back, this session's too; one half written or
// gone is passed over until it changes.
export async function refreshFleet($: EngineInterface) {
  const file = await fleetFile($)

  if (file === null) {
    return []
  }

  const entries: FleetEntry[] = []

  try {
    const listed = new Set<string>()

    for (const item of await $.fs.list(file.dir)) {
      if (item.kind !== 'file' || !item.name.endsWith('.json')) {
        continue
      }

      listed.add(item.name)

      if (seen.get(item.name)?.mtimeMs !== item.mtimeMs) {
        try {
          const entry = saneEntry(JSON.parse(String(await $.fs.read(`${file.dir}/${item.name}`))))

          if (entry !== null) {
            seen.set(item.name, { mtimeMs: item.mtimeMs, entry })
          }
        } catch {
          // Half written, or gone: read again once it changes.
        }
      }

      const held = seen.get(item.name)

      if (held !== undefined) {
        entries.push(held.entry)
      }
    }

    for (const name of [...seen.keys()].filter(name => !listed.has(name))) {
      seen.delete(name)
    }
  } catch {
    // No folder yet: no session has written one.
    return read($, fleet)
  }

  await update($, fleet, () => entries)

  return entries
}

// The summary of every open session, for a program to read: each one's phase
// and what waking it costs, as they stood when written.
export const fleetSummary = (entries: readonly FleetEntry[], now: number) => {
  const open = entries.filter(entry => isOpen(entry, now))
  const labels = uniqueLabels(open)

  return {
    writtenAt: now,
    sessions: open.map(entry => {
      const { phase } = phaseOf(entry, now)

      return {
        id: entry.id,
        label: labels.get(entry.id) ?? entry.label,
        cwd: entry.cwd,
        at: entry.at,
        tokens: entry.tokens,
        ttl: entry.ttl,
        isWorking: entry.isWorking,
        phase,
        wakeTokens: wakeTokens(entry, phase),
        hostId: entry.hostId,
      }
    }),
  }
}

// Writes the summary from the fleet as held: nothing is read here, so a
// session that ends stays fast.
export async function keepSummary($: EngineInterface) {
  try {
    const home = await homeOf($)

    if (home !== null) {
      await $.fs.write(`${home}/${FLEET_JSON}`, JSON.stringify(fleetSummary(await read($, fleet), await $.clock.now()), null, 2))
    }
  } catch {
    // Nothing to do: the next turn writes it again.
  }
}
