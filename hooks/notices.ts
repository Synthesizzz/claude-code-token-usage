// Notices: the crab in the band, toasts and the notification outside the
// app; and the /tokens words that change the style.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'
import type { Notice, Saying, Style } from '../types'
import { loudest } from './alerts'
import { spoken, toastArgv, toastEnv } from './notify'
import { apply } from './style'
import { CACHE_WARN_MS, WARM_TEXT, cacheNotice, cacheRates, isHeavyPing, isWarmPing, learnedTtl } from './cache'
import { shortTokens } from './cost'
import { isQuiet } from './usage'
import { AGENTS_PANE, CACHE_TICK_MS, CHOICE_MS, FORK_SHORT_KEY, LEAVE_MS, NOTIFY_MS, SAY_MS, STYLE_KEY, SWITCH_FILE, scope, styleOf, tick } from './state'
import { stoppedAdvice } from './advice'
import type { ChoiceKey } from './advice'

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

// The style `/tokens` chose; null while the options' own stand.
const chosen = atom({ plugin: 'token-usage', key: 'style' } as const, null)

// The notice the crab is bringing; null once it has left or was sent away.
const saying = atom({ plugin: 'token-usage', key: 'saying' } as const, null)

// A notice outside the app. A desktop session cannot start a program from
// here: the notice goes to the notification hooks, where the mod's own
// command hook raises it in Windows with the crab. A terminal on Windows
// raises it through PowerShell; elsewhere the person's own channel takes it.
// Says how it went.
export async function raise($: EngineInterface, notice: Notice, surface: string | undefined) {
  if (surface === 'desktop') {
    const sent = await $.ui.notify(notice.text === '' ? notice.title : notice.text, {
      title: notice.title,
    })

    return sent.isSent ? 'sent' : 'handed to the notification hooks'
  }

  if ((await $.env.get('OS')) !== 'Windows_NT') {
    const sent = await $.ui.notify(spoken(notice), { title: 'token-usage' })

    return sent.isSent ? 'sent' : `not sent (${sent.reason})`
  }

  const done = await $.process.run(toastArgv, {
    env: toastEnv(notice),
    timeoutMs: NOTIFY_MS,
  })

  return done.exitCode === 0 ? 'sent' : `not sent (PowerShell exit ${done.exitCode})`
}

// A notice to wherever the style sends notices. Says how the one outside
// the app went, or nothing when none was sent there. Where the crab brings
// the notice in the app, the toast would say it twice.
export async function announce(
  $: EngineInterface,
  style: Style,
  notice: Notice,
  hasCrab: boolean,
  surface: string | undefined,
) {
  if (style.notify !== 'windows' && !hasCrab) {
    $.ui.toast(notice.line)
  }

  if (style.notify === 'app') {
    return undefined
  }

  // Quiet hours keep a notice in the app.
  if (isQuiet(style.quiet, await $.clock.now())) {
    return 'held for quiet hours'
  }

  try {
    return await raise($, notice, surface)
  } catch (error) {
    return `not sent (${error instanceof Error ? error.message : String(error)})`
  }
}

// What `/tokens alerts test` raises: a notice as a real one reads.
export const SAMPLE: Notice = {
  kind: 'near',
  title: 'Test alert: 5-hour window at 86%',
  text: 'Resets in 2h14m. Nothing is wrong: this is a test.',
  line: 'Test alert: 5-hour window at 86%, resets in 2h14m',
  bar: { name: '5-hour window', value: 0.86, label: '86%', status: 'resets in 2h14m' },
  window: 'five_hour',
}

// What `/tokens alerts test week` raises: the same for the weekly window.
export const SAMPLE_WEEK: Notice = {
  kind: 'near',
  title: 'Test alert: Weekly window at 86%',
  text: 'Resets in 1d 8h. Nothing is wrong: this is a test.',
  line: 'Test alert: Weekly window at 86%, resets in 1d 8h',
  bar: { name: 'Weekly window', value: 0.86, label: '86%', status: 'resets in 1d 8h' },
  window: 'seven_day',
}

// The main loop's running turn, a compaction asked for when it ends, and
// how far the heavy-turn line was raised for the session.
const turnNow = atom({ plugin: 'token-usage', key: 'turnNow' } as const, null)

const compactAfter = atom({ plugin: 'token-usage', key: 'compactAfter' } as const, false)

const heavyBoost = atom({ plugin: 'token-usage', key: 'heavyBoost' } as const, 1)

// The reading the band draws from: the context's fill for what to do after a stop.
const usage = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

// The pause's own: the idle time and the context it began with.
const idleSince = atom({ plugin: 'token-usage', key: 'idleSince' } as const, null)

const cacheModel = atom({ plugin: 'token-usage', key: 'cacheModel' } as const, null)

const forkShort = atom({ plugin: 'token-usage', key: 'forkShort' } as const, false)

const pauses = atom({ plugin: 'token-usage', key: 'pauses' } as const, [])

// The pause the cache counts down: the band's redraws, and its one warning.
const pausing: { ticking?: Timer; warning?: Timer } = {}

export function endPause() {
  pausing.ticking?.cancel()
  pausing.warning?.cancel()
  pausing.ticking = undefined
  pausing.warning = undefined
}

// A pause begins: at a turn's end, at a quiet Keep warm ping, or long since,
// on a resumed session. The band counts the cache down, more often near its
// end, until it has lapsed; the crab warns once, two minutes before, of a
// cache that lasts longer than that.
export async function beginPause(
  $: EngineInterface,
  base: Style,
  at: number,
  tokens: number | null,
  extra: { afterFork?: boolean; usd?: number; lapsed?: boolean } = {},
) {
  await update($, idleSince, () => ({ at, tokens, ...extra }))
  endPause()

  const ttl = learnedTtl(await read($, pauses)).ttl

  if (ttl === null) {
    return
  }

  const left = at + ttl - (await $.clock.now())
  const ticker = $.clock.every(CACHE_TICK_MS, () => void tick($))

  pausing.ticking = ticker
  $.clock.after(Math.max(0, left) + CACHE_TICK_MS * 4, () => ticker.cancel())

  if (ttl > CACHE_WARN_MS && left > CACHE_WARN_MS) {
    pausing.warning = $.clock.after(left - CACHE_WARN_MS, () => void warnCache($, base, at, ttl))
  }
}

// Keep warm reads the cache with a fork of the main thread's last request:
// no turn, nothing in the conversation. A busy API is tried once more, half a
// minute on, while the cache still has the time; one ping is out at a time.
const PING = 'Reply with the single word: warm'
const RETRY_MS = 30_000
const pinging = { isOut: false }

export async function keepWarm($: EngineInterface, isRetry = false) {
  const held = await read($, idleSince)

  if (pinging.isOut) {
    return
  }

  // A turn runs, or none has ended yet: there is no pause to keep warm.
  if (held === null) {
    $.ui.toast('Nothing to keep warm now: Keep warm works in a pause after a reply.')

    return
  }

  pinging.isOut = true

  const reply = await $.model.fork({ prompt: PING }).catch(() => null)
  const at = await $.clock.now()

  pinging.isOut = false

  // A turn began meanwhile: the cache is that turn's now. A read hands back a
  // copy, so the pause is told by when it began.
  if ((await read($, idleSince))?.at !== held.at) {
    return
  }

  if (reply === null) {
    $.ui.toast('Keep warm failed: the engine did not send the ping.')

    return
  }

  if (!reply.isAnswered) {
    const ttl = learnedTtl(await read($, pauses)).ttl
    const isBusy = reply.reason === 'api-error' && (reply.status === null || reply.status === 429 || reply.status >= 500)

    if (isBusy && !isRetry && ttl !== null && at + RETRY_MS < held.at + ttl) {
      $.ui.toast('The API is busy: Keep warm tries again in 30 seconds.')
      $.clock.after(RETRY_MS, () => void keepWarm($, true))

      return
    }

    $.ui.toast(
      reply.reason === 'nothing-to-fork'
        ? 'Nothing to keep warm yet: this conversation has no reply.'
        : reply.reason === 'api-error'
          ? `Keep warm failed: the API call failed${reply.status === null ? '' : ` (${reply.status})`}.`
          : reply.reason === 'aborted'
            ? 'Keep warm was interrupted.'
            : 'Keep warm failed: the ping came back empty.',
    )

    return
  }

  const read_ = reply.usage.cache_read_input_tokens
  const written = reply.usage.cache_creation_input_tokens

  if (!isWarmPing(read_)) {
    $.ui.toast(`The cache had already lapsed: the ping wrote ${shortTokens(written)}.`)

    return
  }

  const rates = cacheRates(await read($, cacheModel), learnedTtl(await read($, pauses)).ttl)
  // A first ping writes a block of its own, once: said, so its cost is seen.
  const besides = isHeavyPing(read_, written) ? `, wrote ${shortTokens(written)} once (about ${shortTokens(written * rates.write)})` : ''

  $.ui.toast(`Cache kept warm: read ${shortTokens(read_)} (about ${shortTokens(read_ * rates.read)} at full price)${besides}.`)
  // The cache's time starts over from the ping; the pause after it is told
  // apart, so it never teaches how long the cache lasts.
  await beginPause($, scope.base, at, held.tokens, { afterFork: true })
}

// A pause begun at a ping lapsed before the cache's learned time: the ping
// did not hold it. Keep warm sends a turn that shows from now on.
export async function forkFellShort($: EngineInterface) {
  if (await read($, forkShort)) {
    return
  }

  await update($, forkShort, () => true)
  await $.store.set(FORK_SHORT_KEY, true).catch(() => undefined)
  $.ui.toast("Keep warm's quiet ping did not hold the cache: from now on it sends a short turn, which shows in the conversation.")
}

// What the cache's words are priced by: the model's read, the learned time's
// write, a resumed session's own dollars, and how Keep warm goes.
export async function cacheSaid($: EngineInterface, ttl: number | null, usd: number | null = null) {
  return { rates: cacheRates(await read($, cacheModel), ttl), usd, isWarmShown: await read($, forkShort) }
}

// Until when `/tokens alerts test lapsed` has the band show a lapsed cache.
const cacheTest = atom({ plugin: 'token-usage', key: 'cacheTest' } as const, 0)

const TEST_LAPSE_MS = 60_000
const FALLBACK_TTL = 5 * 60_000

// `/tokens alerts test cache`: the warning as it comes two minutes before a
// lapse, for the context as it is now, its buttons standing as long.
export async function testCache($: EngineInterface, base: Style, ttl: number | null) {
  const style = await styleOf($, base)
  const notice = cacheNotice(CACHE_WARN_MS, ttl ?? FALLBACK_TTL, (await read($, usage))?.tokens ?? null, await cacheSaid($, ttl))

  if (style.hidden.includes('crab') || style.hidden.includes('alerts')) {
    $.ui.toast(notice.line)
  } else {
    await say($, notice, CACHE_WARN_MS)
  }
}

// `/tokens alerts test lapsed`: the band shows a lapsed cache for a minute.
export async function testLapse($: EngineInterface) {
  const until = (await $.clock.now()) + TEST_LAPSE_MS

  await update($, cacheTest, () => until)
  await tick($)
  $.clock.after(TEST_LAPSE_MS, () => void tick($))
}

// Once a pause, two minutes before the cache lapses, the crab says so in the
// app alone: a reply now keeps the context cached, which only someone at the
// app can give. Where the pause has ended since, or alerts are off, nothing.
export async function warnCache($: EngineInterface, base: Style, began: number, ttl: number) {
  const held = await read($, idleSince)
  const style = await styleOf($, base)

  if (held === null || held.at !== began || style.hidden.includes('alerts')) {
    return
  }

  const left = Math.max(0, began + ttl - (await $.clock.now()))
  const notice = cacheNotice(left, ttl, held.tokens, await cacheSaid($, ttl, held.usd ?? null))

  // Its choices stand until the cache lapses, when they no longer help.
  if (style.hidden.includes('crab')) {
    $.ui.toast(notice.line)
  } else {
    await say($, notice, Math.max(SAY_MS, left))
  }
}

// The crab comes with a notice; the clock has it walk off, and then go.
export async function say($: EngineInterface, notice: Notice, stay = SAY_MS) {
  const at = await $.clock.now()

  await update($, saying, () => ({ notice, at, stay }))
  $.clock.after(stay, () => void tick($))
  $.clock.after(stay + LEAVE_MS, () => void tick($))
}

// Sent away: its time counts as up from now, so it walks off before it goes;
// a question's longer time as much as a word's.
export async function hush($: EngineInterface) {
  const at = await $.clock.now()

  await update($, saying, held => (held === null ? null : { ...held, at: at - (held.stay ?? SAY_MS) }))
  await update($, now, () => at)
  $.clock.after(LEAVE_MS, () => void tick($))
}

// The notice the crab is bringing at a moment, and whether it is still
// standing with it (`in`) or walking off (`out`); null when it has gone.
export const heard = (held: Saying | null, style: Style, at: number) => {
  if (held === null || style.hidden.includes('crab') || style.hidden.includes('alerts')) {
    return null
  }

  const age = at - held.at
  const stay = held.stay ?? SAY_MS

  if (age >= stay + LEAVE_MS) {
    return null
  }

  return { notice: held.notice, phase: age < stay ? ('in' as const) : ('out' as const) }
}

// The script that notifies outside the app cannot see the mod's state: it
// reads this file. Where the file cannot be written the script stays on.
export async function tell($: EngineInterface, style: Style) {
  try {
    const home = await $.env.get('USERPROFILE')

    if (typeof home === 'string' && home !== '') {
      await $.fs.write(
        `${home}/${SWITCH_FILE}`,
        JSON.stringify({
          isOn: !style.hidden.includes('crab') && !style.hidden.includes('alerts'),
          isPrivate: style.isPrivate,
          quiet: style.quiet,
          hasPopup: style.hasPopup,
        }),
      )
    }
  } catch {
    // Nothing to do: the script's own default is on.
  }
}

// A notice goes out: the crab brings the gravest where it is switched on,
// and on the desktop it stands in for the toast. Says how the last notice
// outside the app went, or nothing when none was sent there.
export async function bring(
  $: EngineInterface,
  style: Style,
  notices: readonly Notice[],
  surface: string | undefined,
) {
  const hasCrab = !style.hidden.includes('crab')
  const first = loudest(notices)
  let raised: string | undefined

  if (hasCrab && first !== null) {
    await say($, first, first.choices === undefined ? SAY_MS : CHOICE_MS)
  }

  for (const notice of notices) {
    raised =
      (await announce($, style, notice, hasCrab && surface === 'desktop', surface)) ?? raised
  }

  return raised
}

// The band's Compact button. The engine refuses while a turn runs, so the
// button says so without asking. A headless session (the desktop app runs
// one) cannot compact from a hook: there the button runs the person's own
// `/compact`, which the session takes as a turn of its own. Any other
// refusal, and a hook's veto, is said as the engine gave it.
export async function compact($: EngineInterface, isWorking: boolean) {
  if (isWorking) {
    $.ui.toast('Claude is still working: press Compact again when the turn ends.')

    return
  }

  try {
    const done = await $.session.compact({})

    if ('skip' in done && typeof done.skip === 'string') {
      $.ui.toast(`Compact skipped: ${done.skip}`)
    }
  } catch {
    try {
      await $.command.run({ command: 'compact', args: '' })
    } catch (error) {
      $.ui.toast(`Compact did not run: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// One path for a typed word and a pressed button: the state redraws the band
// now, the store keeps the choice for the next session.
export async function choose($: EngineInterface, base: Style, args: string) {
  // `here` in a project's budget is the folder the session runs in.
  const outcome = apply(await styleOf($, base), args.replace(/^(\s*budget\s+project\s+)here\b/i, `$1${scope.project}`))

  if ('reset' in outcome) {
    await update($, chosen, () => null)
    await $.store.delete(STYLE_KEY)
    await tell($, base)
  } else if ('style' in outcome) {
    const { style } = outcome

    await update($, chosen, () => style)
    await $.store.set(STYLE_KEY, style)
    await tell($, style)
  }

  return outcome
}

// What a choice the crab offers does. The crab goes first, whatever it was;
// a stop ends the running turn at once and asks what next.
export async function act($: EngineInterface, key: ChoiceKey, tokens: string) {
  await hush($)

  switch (key) {
    case 'stop': {
      const turnId = await read($, turnNow)

      if (turnId !== null) {
        try {
          await $.turn.abort({ turnId })
        } catch {
          // It had ended already: what next is still the question.
        }
      }

      const next = stoppedAdvice((await read($, usage))?.percent ?? null, tokens)

      await say(
        $,
        {
          kind: 'half',
          title: next.title,
          text: next.text,
          line: `${next.title} ${next.text}`,
          bar: { name: 'This turn', value: 1, label: '', status: '' },
          choices: next.choices,
        },
        CHOICE_MS,
      )

      return
    }
    case 'compactAfter':
      await update($, compactAfter, () => true)
      $.ui.toast('Compacting when this turn ends.')

      return
    case 'raise':
      await update($, heavyBoost, held => held * 2)
      $.ui.toast('The heavy-turn line is twice as high for this session.')

      return
    case 'agents':
      await $.ui.open({ id: AGENTS_PANE, title: 'Token usage · agents' })

      return
    case 'compact':
      // A compaction outlasts a press's budget: it runs once the press has answered.
      $.clock.after(COMPACT_SOON_MS, () => void compact($, false))

      return
    case 'fresh':
      await $.command.run({ command: 'clear' })

      return
    case 'continue':
      await $.prompt.submit({ text: 'Continue where you stopped.', asUser: true })

      return
    case 'warm':
      // Quietly, where a ping has been seen to hold the cache; else with a
      // turn that shows.
      if (await read($, forkShort)) {
        await $.prompt.submit({ text: WARM_TEXT, asUser: true })
      } else {
        await keepWarm($)
      }

      return
    default:
      return
  }
}

// How soon after a press its compaction starts.
const COMPACT_SOON_MS = 100

// A compaction asked for while the turn ran, once the turn has ended.
export async function compactIfAsked($: EngineInterface) {
  if (await read($, compactAfter)) {
    await update($, compactAfter, () => false)
    await compact($, false)
  }
}
