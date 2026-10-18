import type { Notice } from '../types'
import { shortTokens } from './cost'
import type { Choice } from './advice'

// How long the prompt cache lasts, learned from the pauses themselves: after
// each, the next turn's first response says how much of its input it read
// from the cache. Most of it, and the cache outlasted the pause; little of
// it, and the pause outlasted the cache. The cache lasts past every pause
// that kept it and short of the shortest that lapsed it past those.
//
// That range is wide when the pauses are few or far apart (kept through 24m,
// lapsed after 4h31m), and the cache lasts one of two times: 5 minutes, or
// an hour. So the learned time is the one of those the range holds, the
// shorter where it holds both: a warning early beats one too late. Where it
// holds neither, the range's own end stands; with no lapse seen yet, only a
// range that rules out the one leaves the other.

export type Pause = { gap: number; isKept: boolean; at: number }
type Read = { input: number; cacheRead: number; cacheWrite: number }

const KEPT_SHARE = 0.5
const LAPSED_SHARE = 0.2
// A context this small says little; one that shrank this far was compacted
// or cleared, and its prefix is new whatever the time.
const MIN_CONTEXT = 20_000
const SHRUNK = 0.5
const KEPT_PAUSES = 50
// Just after a turn the band says nothing of the cache; near its end, for two
// minutes or the last 40% of a short one, it warns.
const QUIET_MS = 15_000
const NEAR_MS = 2 * 60_000
const NEAR_SHARE = 0.4
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const TTLS = [5 * MINUTE_MS, HOUR_MS]

export const judgePause = (gap: number, before: number | null, read: Read, at: number): Pause | null => {
  const input = read.input + read.cacheRead + read.cacheWrite

  if (before === null || before < MIN_CONTEXT || input < before * SHRUNK) {
    return null
  }

  const share = read.cacheRead / Math.max(1, input)

  return share >= KEPT_SHARE ? { gap, isKept: true, at } : share < LAPSED_SHARE ? { gap, isKept: false, at } : null
}

export const keepPauses = (pauses: readonly Pause[], pause: Pause) => [...pauses, pause].slice(-KEPT_PAUSES)

// The pauses read back from the store, whatever was kept there.
export const sanePauses = (value: unknown): Pause[] =>
  (Array.isArray(value) ? value : []).flatMap(entry => {
    const { gap, isKept, at } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>

    return typeof gap === 'number' && Number.isFinite(gap) && gap >= 0 && typeof isKept === 'boolean' && typeof at === 'number'
      ? [{ gap, isKept, at }]
      : []
  })

export const learnedTtl = (pauses: readonly Pause[]) => {
  const kept = Math.max(0, ...pauses.filter(({ isKept }) => isKept).map(({ gap }) => gap))
  // A lapse under a pause that kept the cache was something else: a change
  // early in the conversation, not the time.
  const lapses = pauses.filter(({ isKept, gap }) => !isKept && gap > kept).map(({ gap }) => gap)
  const lapsed = lapses.length === 0 ? null : Math.min(...lapses)
  const held = TTLS.filter(ttl => ttl >= kept && (lapsed === null || ttl <= lapsed))
  const ttl = lapsed === null ? (held.length === 1 && kept > 0 ? (held[0] ?? null) : null) : (held[0] ?? lapsed)

  return { ttl, kept, pauses: pauses.length }
}

// A time said short: minutes under the hour, hours and minutes past it.
const span = (ms: number) => {
  const minutes = Math.round(ms / MINUTE_MS)

  return minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

export const cachePhase = (idle: number, ttl: number | null) => {
  if (ttl === null || idle < QUIET_MS) {
    return null
  }

  const left = Math.max(0, ttl - idle)

  if (left === 0) {
    return { phase: 'gone' as const, left: 0 }
  }

  return { phase: left <= Math.min(NEAR_MS, ttl * NEAR_SHARE) ? ('near' as const) : ('calm' as const), left }
}

// Minutes while there is time; seconds in the last two minutes.
const clock = (ms: number) => {
  const seconds = Math.ceil(ms / 1000)

  if (ms >= NEAR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`
  }

  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}

export const cacheWord = (said: { phase: 'calm' | 'near' | 'gone'; left: number }, context: number | null) =>
  said.phase === 'gone'
    ? `cache lapsed${context === null ? '' : ` · next turn re-reads ${shortTokens(context)}`}`
    : said.phase === 'near'
      ? `cache lapses in ${clock(said.left)}`
      : `cache ${clock(said.left)}`

// A context this large is worth compacting before a break: the compaction
// reads it from the cache while it lasts, and the next turn re-writes only
// the summary. A smaller one costs less to keep warm with a short turn.
export const COMPACT_WORTH = 60_000

// What the API charges for the cache, as shares of the model's input price:
// a read at the model's own rate, a write by how long the entry lasts, a
// quarter more for five minutes and twice the price for an hour. Where the
// time is not learned yet, the hour: a subscription's own, and the dearer.
// A read is a tenth, but a twentieth on Opus 5.5 and Sonnet 5.5 and a
// fortieth on Fable 5.1 and Mythos 5.1 (the models overview, 2026-10-18); a
// model not named here, or none seen yet, reads at the tenth.
const READS: readonly (readonly [string, number])[] = [
  ['fable-5-1', 0.025],
  ['mythos-5-1', 0.025],
  ['opus-5-5', 0.05],
  ['sonnet-5-5', 0.05],
]
const READ_SHARE = 0.1
const WRITE_SHORT = 1.25
const WRITE_HOUR = 2
const SHARES: Readonly<Record<number, string>> = { 10: 'a tenth', 20: 'a twentieth', 40: 'a fortieth' }

export type Rates = { read: number; write: number }

export const cacheRates = (model: string | null, ttl: number | null): Rates => {
  const id = (model ?? '').toLowerCase().replace(/[\s.]+/g, '-')

  return {
    read: READS.find(([family]) => id.includes(family))?.[1] ?? READ_SHARE,
    write: ttl === TTLS[0] ? WRITE_SHORT : WRITE_HOUR,
  }
}

// A read's share of the price in words: a tenth, a twentieth, a fortieth.
export const shareOf = (rate: number) => {
  const parts = Math.round(1 / rate)

  return SHARES[parts] ?? `1/${parts}`
}

type Said = {
  rates?: Rates
  // What the engine reckons re-writing the cache costs in dollars, where it
  // said: on resuming a session.
  usd?: number | null
  // Keep warm sends a turn that shows, where its quiet ping did not hold the
  // cache.
  isWarmShown?: boolean
}

// What each way out does and costs, said while the pointer rests on it. The
// figures are the API's price in tokens at the full input price.
export const cacheHints = (context: number | null, { rates = cacheRates(null, null), usd = null, isWarmShown = false }: Said = {}) => {
  const n = context === null ? 'the context' : shortTokens(context)
  const dollars = usd === null ? '' : `, $${usd.toFixed(2)} at API price`
  const at = (price: number, isPriced = false) =>
    context === null ? '' : ` (about ${shortTokens(context * price)} at full price${isPriced ? dollars : ''})`

  return {
    compact: `Compacts while ${n} is still cached, so it is read at ${shareOf(rates.read)} of the price. The next turn starts from a short summary. Cost: earlier turns live on only in the summary.`,
    warm: isWarmShown
      ? `Sends a one-line turn now: Claude reads ${n} from the cache${at(rates.read)} and the cache's time starts over. It shows in the conversation: a quiet ping did not hold this cache. For a long break, Compact now costs less.`
      : `Reads ${n} from the cache once${at(rates.read)}, without a turn: nothing shows in the conversation, and the cache's time starts over. For a long break, Compact now costs less.`,
    lapse: `Nothing is sent. Your next turn writes ${n} to the cache again${at(rates.write, true)}.`,
    why: `Every step of a turn reads all ${n} again${at(rates.read)}. Once the cache lapses, the next turn writes it all again${at(rates.write, true)}, ${Math.floor(rates.write / rates.read)} times a cached step. A smaller context makes every step and every lapse cheaper.`,
    fresh: 'A new conversation (/clear): nothing is re-read, but Claude forgets this one. For something new.',
    compactLapsed: `Reads ${n} once more to summarise it${at(1)}. The turns after it read the summary, not ${n}. Worth it if you'll carry on for a while.`,
    gone: `Your next turn writes all ${n} again${at(rates.write, true)}. Start fresh re-reads nothing; Compact pays once so the turns after it read less.`,
  }
}

// What the crab says once a pause, two minutes before the cache lapses, and
// what it offers: compact while the cache holds, keep it warm, or let it go.
export const cacheNotice = (left: number, ttl: number, context: number | null, said: Said = {}): Notice => {
  const kept = context === null ? 'the context' : shortTokens(context)
  const isLarge = context !== null && context >= COMPACT_WORTH
  const hints = cacheHints(context, said)
  const compactNow: Choice = { key: 'compact', label: 'Compact now', hint: hints.compact }
  const warm: Choice = { key: 'warm', label: 'Keep warm', hint: hints.warm }
  const lapse: Choice = { key: 'lapse', label: 'Let it lapse', hint: hints.lapse }

  return {
    kind: 'cache',
    title: `Cache lapses in ${clock(left)}`,
    text: isLarge
      ? `Leaving? Compact now while it's cached: the next turn re-reads a summary, not ${kept}.`
      : said.isWarmShown === true
        ? `Keep warm sends a short turn now, so ${kept} stays cached.`
        : `Keep warm reads the cache once, so ${kept} stays cached.`,
    line: `Cache lapses in ${clock(left)}: reply now to keep ${kept} cached`,
    bar: { name: 'Prompt cache', value: Math.min(1, Math.max(0, 1 - left / ttl)), label: clock(left), status: 'left' },
    choices: isLarge ? [compactNow, warm, lapse] : [warm, lapse, compactNow],
  }
}

// A ping that read from the cache kept it: what it read starts its time over.
// What it wrote besides is not a lapse: the first fork after a turn writes a
// block of its own (seen live: 32k beside a 77k context, 30 seconds on), and
// the next one reads that too.
export const isWarmPing = (read: number) => read > 0

// The ping wrote enough besides its read to be worth saying: a tenth of the
// read or more.
export const isHeavyPing = (read: number, written: number) => written >= 0.1 * read

// What Keep warm sends where its quiet ping fell short: a turn as short as
// one can be, read from the cache.
export const WARM_TEXT = 'Keeping the prompt cache warm: reply with only "ok".'

// While the cache has lapsed, a context this large gets the band's ways out:
// start fresh, or compact before the turns that would re-read it.
export const LAPSED_WORTH = 50_000

export const hasLapsedActions = (said: { phase: 'calm' | 'near' | 'gone' } | null, context: number | null) =>
  said?.phase === 'gone' && context !== null && context >= LAPSED_WORTH

// The cache is warned of this long before it lapses, where it lasts longer.
export const CACHE_WARN_MS = NEAR_MS

export const cacheLine = (learned: { ttl: number | null; kept: number; pauses: number }) => {
  if (learned.pauses === 0) {
    return null
  }

  const plural = `${learned.pauses} ${learned.pauses === 1 ? 'pause' : 'pauses'}`

  return learned.ttl !== null
    ? `cache lapses after ~${span(learned.ttl)} idle · learned from ${plural}`
    : `cache kept through ${span(learned.kept)} idle so far · ${plural}`
}
