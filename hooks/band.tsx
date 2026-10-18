// The band above the prompt: the figures, the crab with its news, the
// Compact button, and under them what the plugins beneath draw.

import { atom, read } from 'claude-code'
import type { MatchedHook } from 'claude-code'
import type { Motion, RingProps } from '../types'
import { isCrowded } from './alerts'
import { EMPTY, budgetShare, isPlanOf, today, usd } from './cost'
import { cacheHints, cachePhase, cacheWord, hasLapsedActions, learnedTtl } from './cache'
import { contextNews, mixOf } from './context'
import { CRAB_ROWS, SHARP_CRAB_ROWS, WORK_PX, crabCells, crabSvg, daysOf, idleSvg, moodOf, napSvg, stageSvg, toneOf } from './crab'
import { RING_PX, fit, told } from './fit'
import type { Wish } from './fit'
import { paletteFor, words } from './style'
import { drawWindows } from './row'
import { ringSvg } from './svg'
import {
  barCellsFor,
  cellsOf,
  countdown,
  bandWidth,
  eighths,
  elapsed,
  isQuiet,
  layout,
  percentage,
  pie,
  remaining,
  tone,
  turnsLeft,
} from './usage'
import { note, trouble } from './measure'
import { act, cacheSaid as pricing, compact, heard, hush } from './notices'
import { cellsOfSplit, splitSvg } from './advice'
import type { ChoiceKey } from './advice'
import {
  BUDGET,
  COMPACT,
  CONTEXT_PANE,
  CRAB_MIN_COLUMNS,
  CRAB_MIN_ROWS,
  FRESH,
  HINT_MIN_ROWS,
  NEAR_MS,
  RESET_MS,
  SLEEP_MS,
  SOON_TURNS,
  saneBreakdown,
  scope,
  shown,
  styleOf,
} from './state'

// The hover groups that open a hint at the band's top: a pointer on the
// thing lights its group, which reveals the hint.
const HINT = 'hint-'
const HINT_FRESH = `${HINT}fresh`
const HINT_COMPACT = `${HINT}compact`
const HINT_CACHE = `${HINT}cache`

// Not `snapshot`: a session reloaded from 0.1.0 still holds that key in its old shape.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

// The windows that have just reset, while their reset plays.
const fresh = atom({ plugin: 'token-usage', key: 'fresh' } as const, {})

// The notice the crab is bringing; null once it has left or was sent away.
const saying = atom({ plugin: 'token-usage', key: 'saying' } as const, null)

// Dollars by day, for every session, held here to draw; the store keeps what
// of the day's budget was told, and the days counted before sessions had
// files of their own.
const ledger = atom({ plugin: 'token-usage', key: 'ledger' } as const, EMPTY)

// The context fill at the end of each turn, for its forecast; this many kept.
const growth = atom({ plugin: 'token-usage', key: 'growth' } as const, [])

// The prompt cache: the pause it counts down, and the pauses it was judged
// on, every session's (how long it lasts is the account's).
const idleSince = atom({ plugin: 'token-usage', key: 'idleSince' } as const, null)

// When the crab last had nothing to do: its nap counts from here.
const restSince = atom({ plugin: 'token-usage', key: 'restSince' } as const, null)

// Until when `/tokens alerts test lapsed` shows a lapsed cache.
const cacheTest = atom({ plugin: 'token-usage', key: 'cacheTest' } as const, 0)

const pauses = atom({ plugin: 'token-usage', key: 'pauses' } as const, [])

// What fills the context, as /context breaks it down.
const breakdown = atom({ plugin: 'token-usage', key: 'breakdown' } as const, null)

// The bar of what fills the context, in cells: the terminal's after CTX, the
// desktop's under the ring.
const TERMINAL_CELLS = 10
const DESKTOP_CELLS = 8
// Where a heavy turn's tokens went: a bar this wide on the desktop, this
// many cells in a terminal.
const SPLIT_PX = 220
const SPLIT_CELLS = 20
// The terminal's second row starts under the context's bar, and names it.
const SECOND_INDENT = 6
const MIX_WORD = ' context'

type DrawBandHook = MatchedHook<'ui.render', { component: 'AbovePrompt' }>

export async function drawBand($: Parameters<DrawBandHook>[0], e: Parameters<DrawBandHook>[1], next: Parameters<DrawBandHook>[2]) {
    const usage = await read($, snapshot)

    if (e.props.hasSurvey || usage === null) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const { percent } = usage
    const at = Math.max(usage.at, await read($, now))
    const style = await styleOf($, scope.base)
    // A context this full gets a way out beside it: one press compacts. One
    // that fills within a few turns gets it sooner, as the primary.
    const toGo = turnsLeft(await read($, growth))
    const isSoon = toGo !== null && toGo <= SOON_TURNS
    // While no turn runs, the cache counts down the pause since the last.
    const paused = e.props.isWorking ? null : await read($, idleSince)
    const ttl = learnedTtl(await read($, pauses)).ttl
    // A test of the lapse shows it for a minute, for the context as it is.
    const isTestLapse = !e.props.isWorking && (await read($, cacheTest)) > at
    // A resumed session the engine called lapsed is lapsed, where the cache's
    // time is not learned yet.
    const cachePart =
      isTestLapse || (paused?.lapsed === true && ttl === null)
        ? { phase: 'gone' as const, left: 0 }
        : paused === null
          ? null
          : cachePhase(at - paused.at, ttl)
    const idleTokens = paused?.tokens ?? (isTestLapse ? usage.tokens : null)
    // A large context whose cache has lapsed: the next turn re-reads all of
    // it, so the band offers to start fresh or compact first.
    const isLapsed = hasLapsedActions(cachePart, idleTokens)
    const hasCompact = isCrowded(percent) || isSoon || isLapsed
    const compactPress = (
      <Button
        key="compact"
        label={COMPACT}
        {...(isSoon ? { variant: 'primary' as const } : {})}
        {...(isLapsed ? { hover: { scope: HINT_COMPACT } } : {})}
        onPress={() => compact($, e.props.isWorking)}
      />
    )
    const press = !hasCompact ? null : isLapsed ? (
      <Box gap={1}>
        <Button key="fresh" label={FRESH} hover={{ scope: HINT_FRESH }} onPress={() => void $.command.run({ command: 'clear' })} />
        {compactPress}
      </Box>
    ) : (
      compactPress
    )
    const action = !hasCompact ? null : isLapsed ? `${FRESH}    ${COMPACT}` : COMPACT
    // In quiet hours the band says until when; the crab sleeps through them.
    const quiet =
      style.quiet !== null && isQuiet(style.quiet, at)
        ? `quiet until ${String(style.quiet.to).padStart(2, '0')}:00`
        : null
    const speaking = heard(await read($, saying), style, at)
    const talk = speaking?.notice ?? null
    // Sent away or out of time, the crab walks off alone: its words and
    // buttons go at once, so a press shows and cannot be pressed again.
    const isStaying = speaking?.phase === 'in'
    // Two minutes with nothing to do, since a turn ended or the session began
    // (a /clear too), put the crab to sleep where the ring is, as a turn puts
    // it to work there. News wakes it; quiet hours keep their own nap.
    const rested = e.props.isWorking ? null : await read($, restSince)
    const isAsleep =
      rested !== null && at - rested >= SLEEP_MS && talk === null && quiet === null && !style.hidden.includes('crab')
    // The desktop fits its own row: it is handed the band unnarrowed. A
    // terminal's row gives the button its room first: `[ Compact ]` and a gap,
    // and the sleeping crab the cell its second z takes past the ring's.
    const columns =
      e.surface === 'desktop'
        ? Number.POSITIVE_INFINITY
        : e.props.bodyColumns - (action === null ? 0 : action.length + 7) - (isAsleep ? 1 : 0)
    // The band says what the day has cost, in every session; the pane has
    // the session's own total.
    const kept = await read($, ledger)
    // On a subscription the dollars are the API's price, not a bill.
    const cost = usage.usd === null ? null : `${usd(today(kept, at))} ${isPlanOf(usage.limits) ? 'API today' : 'today'}`
    const band = shown(layout(usage, at, columns, cost), style)
    const cacheSaid =
      quiet !== null || cachePart === null
        ? null
        : {
            text: cacheWord(cachePart, idleTokens),
            color: cachePart.phase === 'gone' ? ('error' as const) : cachePart.phase === 'near' ? ('warning' as const) : null,
          }
    // The pointer on it says what a lapse costs, beneath the band's top.
    const cacheText = (said: { text: string; color: 'error' | 'warning' | null }) =>
      said.color === null ? (
        <Text dimColor hover={{ scope: HINT_CACHE, underline: true }}>
          {said.text}
        </Text>
      ) : (
        <Text color={said.color} hover={{ scope: HINT_CACHE, underline: true }}>
          {said.text}
        </Text>
      )
    const hasContext = !style.hidden.includes('context')
    // What fills the context, while the part is shown and a count is held: a
    // bar of its rows, and a word where there is something to do, which
    // opens the pane of it.
    const filled = style.hidden.includes('breakdown') ? null : await read($, breakdown)
    const held = filled === null ? null : saneBreakdown(filled.value)
    const news = held === null ? null : contextNews(held.categories, held.rawMaxTokens, isCrowded(percent))
    const mix = (cells: number, glyph: string) =>
      held === null || !hasContext
        ? null
        : mixOf(held.categories, cells).map(({ name, color, count }) => (
            <Text key={name} color={color}>
              {glyph.repeat(count)}
            </Text>
          ))
    const newsPress = news === null ? null : (
      <Button
        key="context-news"
        plain
        onPress={() => void $.ui.open({ id: CONTEXT_PANE, title: 'Token usage · context' })}
      >
        <Text color={news.tone}>{news.text}</Text>
      </Button>
    )
    const glyph = percent === null ? '○' : pie(percent)
    const color = percent === null ? 'inactive' : tone(percent)
    let fill = <Text color={color}>{glyph}</Text>

    // Only the terminal spins a glyph in a client region; elsewhere it rests.
    if (e.surface === 'terminal' && isAsleep) {
      fill = <Text dimColor>ᶻᶻ</Text>
    } else if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      const props: RingProps = { glyph, color, isWorking: e.props.isWorking }
      fill = <Client key="ctx" module="./ring.tsx" width={1} props={props} />
    }

    // The band is shared: draw the plugins beneath under the usage row.
    const beneath = await next(e)
    const problems = await trouble($, at)

    // The desktop draws vectors: the context as a ring, each window in the
    // layout the style names.
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const palette = paletteFor(style)
      const wished = words(style)
      const snug = words({ ...style, layout: 'compact' })
      const napped = napSvg(`Crab asleep: ${quiet ?? ''}`, palette)
      const hasCountdown = !style.hidden.includes('countdown')
      // While a turn runs the crab works at its laptop where the ring was;
      // until it sleeps it stands by there, unless it is out with news.
      const isAtWork = e.props.isWorking && !style.hidden.includes('crab')
      const isIdle = !e.props.isWorking && !isAsleep && talk === null && quiet === null && !style.hidden.includes('crab')
      const renewed = await read($, fresh)
      const limits = usage.limits.map(limit => {
        const left = remaining(limit, at)
        const reset = renewed[limit.kind]
        const motion: Motion | undefined =
          reset !== undefined && at - reset.at < RESET_MS
            ? { kind: 'reset', from: reset.from }
            : left !== null && left > 0 && left <= NEAR_MS
              ? { kind: 'near' }
              : undefined

        return {
          motion,
          name: wished.name(limit.kind),
          brief: snug.name(limit.kind),
          cells: cellsOf(limit.kind),
          percent: limit.percentUsed,
          used: percentage(limit.percentUsed).trim(),
          gone: elapsed(limit, at),
          // A window that names no reset has no countdown to draw.
          clock: hasCountdown && left !== null ? countdown(left) : null,
        }
      })
      const wish: Wish = {
        layout: style.layout,
        context: hasContext
          ? {
              used: percentage(percent).trim(),
              word: wished.context,
              figure: isAtWork ? WORK_PX.width : isAsleep || isIdle ? napped.width : RING_PX,
            }
          : null,
        windows: limits,
        usedWord: wished.used,
        leftWord: wished.left,
        eta: band.eta,
        cost: band.cost,
        ...(style.budget === null ? {} : { costFigure: RING_PX }),
        action,
        ...(quiet !== null
          ? { note: { text: [quiet, news?.text].filter(Boolean).join('     '), figure: style.hidden.includes('crab') ? 0 : napped.width } }
          : cacheSaid !== null || news !== null
            ? { note: { text: [cacheSaid?.text, news?.text].filter(Boolean).join('     '), figure: 0 } }
            : {}),
      }
      const fitted = fit(wish, e.props.bodyColumns)
      const isSnug = fitted.layout !== style.layout
      const named = isSnug ? snug : wished
      const ringed = ringSvg(percent, named.context, e.props.isWorking, palette)
      const asleep = napSvg(`${ringed.alt}, Crab asleep`, palette)
      const idle = idleSvg(`${ringed.alt}, Crab standing by`, palette)
      const context = isAtWork
        ? { drawn: crabSvg('work', `${ringed.alt}, working`, palette), ...WORK_PX }
        : isAsleep
          ? { drawn: asleep, width: asleep.width, height: asleep.height }
          : isIdle
            ? { drawn: idle, width: idle.width, height: idle.height }
            : { drawn: ringed, width: RING_PX, height: RING_PX }

      scope.fitting = told(wish, fitted, e.props.bodyColumns)
      const figure = (
        drawn: { source: string; alt: string },
        width: number,
        height: number,
      ) => <Svg source={drawn.source} alt={drawn.alt} width={width} height={height} />
      const windows = limits.slice(0, fitted.windows).map(window => ({
        ...window,
        name: isSnug ? window.brief : window.name,
        clock: fitted.hasClock ? window.clock : null,
      }))
      const { hasWords } = fitted
      // The crab stands on its window's own ground: the cells of the 5-hour or
      // the weekly window, with now marked, and the weekly days named.
      const walked = talk?.window === undefined ? undefined : talk.window
      const limit = walked === undefined ? undefined : usage.limits.find(({ kind }) => kind === walked)
      const stage =
        speaking === null || talk === null
          ? null
          : stageSvg(
              moodOf(talk.kind),
              talk.bar.value * 100,
              `Crab: ${talk.title}`,
              palette,
              speaking.phase,
              walked === undefined
                ? null
                : {
                    cells: cellsOf(walked),
                    gone: limit === undefined ? null : elapsed(limit, at),
                    days: walked === 'seven_day' ? daysOf(limit?.resetsAt ?? null, cellsOf(walked)) : null,
                  },
            )

      // What the crab offers: a button each, the best first, digits for keys.
      const offered = (talk?.choices ?? []).map(({ key, label, hint }, index) => (
        <Button
          key={`choice-${key}`}
          label={label}
          hotkey={String(index + 1)}
          {...(index === 0 ? { variant: 'primary' as const } : {})}
          {...(hint === undefined ? {} : { hover: { scope: `${HINT}choice-${key}` } })}
          onPress={() => act($, key as ChoiceKey, talk?.bar.label ?? '')}
        />
      ))
      const split = talk?.split ?? []
      // What a choice or the cache's word does and costs, each hidden until the
      // pointer rests on it. They open at the band's top: the band grows up
      // from the prompt, so what the pointer rests on stays where it is.
      const hints = cacheHints(idleTokens, await pricing($, ttl, paused?.usd ?? null))
      const hinted = [
        ...(isStaying
          ? (talk?.choices ?? []).flatMap(({ key, label, hint }) => (hint === undefined ? [] : [{ scope: `${HINT}choice-${key}`, label, hint }]))
          : []),
        ...(isLapsed
          ? [
              { scope: HINT_FRESH, label: FRESH, hint: hints.fresh },
              { scope: HINT_COMPACT, label: COMPACT, hint: hints.compactLapsed },
            ]
          : []),
        ...(cachePart === null
          ? []
          : [
              cachePart.phase === 'gone'
                ? { scope: HINT_CACHE, label: 'The cache has lapsed', hint: hints.gone }
                : { scope: HINT_CACHE, label: 'Why a big context costs', hint: hints.why },
            ]),
      ]

      // The row is fitted by estimate, so two guards stay: no group gives up
      // width (squeezed, its text spills over the next one), and a row still
      // too wide wraps.
      return (
        // A background of the person's own fills the band inside the app's frame:
        // to its sides, a column past the band's own each side, the padding giving
        // the row its width back. The engine clips rows at the band's top and
        // bottom, so the frame's strips there stay.
        <Box flexDirection="column" {...(style.background === null ? {} : { backgroundColor: style.background, marginX: -1, paddingX: 1, paddingY: 1 })}>
          {hinted.map(({ scope, label, hint }) => (
            <Box key={scope} flexDirection="column" display="none" hover={{ scope, display: 'flex' }} marginBottom={1}>
              <Text weight="semibold">{label}</Text>
              <Text dimColor wrap="wrap">
                {hint}
              </Text>
            </Box>
          ))}
          {stage !== null && talk !== null && (
            <Box gap={2} alignItems="center" flexWrap="wrap">
              <Box flexShrink={0}>{figure(stage, stage.width, stage.height)}</Box>
              {/* The words give way and wrap in a narrow band; the OK keeps its room. */}
              {isStaying && (
                <Box flexDirection="column" flexShrink={1} minWidth={0}>
                  <Text weight="semibold" wrap="wrap">
                    {talk.title}
                  </Text>
                  {talk.text !== '' && (
                    <Text wrap="wrap" {...(talk.tone === undefined || talk.tone === null ? { dimColor: true } : { color: talk.tone })}>
                      {talk.text}
                    </Text>
                  )}
                  {split.length > 0 && (
                    <Box flexDirection="column">
                      {figure(splitSvg(split, SPLIT_PX), SPLIT_PX, 6)}
                      <Text dimColor wrap="wrap">
                        {split.map(({ name, share }) => `${name} ${Math.round(share * 100)}%`).join(' · ')}
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
              {isStaying && (
                <Box flexShrink={0} gap={1} flexWrap="wrap">
                  {offered}
                  <Button key="crab-ok" label="OK" onPress={() => hush($)} />
                </Box>
              )}
            </Box>
          )}
          <Box columnGap={2} alignItems="center" flexWrap="wrap">
            {hasContext && (
              <Box flexDirection="column" flexShrink={0}>
                <Box gap={1} alignItems="center">
                  {figure(context.drawn, context.width, context.height)}
                  <Text weight="semibold">{percentage(percent).trim()}</Text>
                  {fitted.hasContextWord && <Text dimColor>{named.context}</Text>}
                </Box>
                {fitted.hasContextWord && held !== null && <Box>{mix(DESKTOP_CELLS, '▬')}</Box>}
              </Box>
            )}
            {press !== null && <Box flexShrink={0}>{press}</Box>}
            {drawWindows({ Box, Text, Svg }, fitted.layout, windows, palette, named, hasWords)}
            {fitted.hasEta && band.eta !== null && (
              <Box flexShrink={0}>
                <Text color="warning">{band.eta}</Text>
              </Box>
            )}
            {fitted.hasCost && band.cost !== null && (
              <Box gap={1} alignItems="center" flexShrink={0}>
                {style.budget !== null &&
                  figure(
                    ringSvg(budgetShare(kept, at, style.budget), BUDGET, false, palette),
                    RING_PX,
                    RING_PX,
                  )}
                <Text>{band.cost}</Text>
              </Box>
            )}
            {fitted.hasCost && quiet !== null && (
              <Box gap={1} alignItems="center" flexShrink={0}>
                {!style.hidden.includes('crab') && figure(napped, napped.width, napped.height)}
                <Text dimColor>{quiet}</Text>
              </Box>
            )}
            {fitted.hasCost && cacheSaid !== null && <Box flexShrink={0}>{cacheText(cacheSaid)}</Box>}
            {fitted.hasCost && newsPress !== null && <Box flexShrink={0}>{newsPress}</Box>}
          </Box>
          {problems.map(line => (
            <Text dimColor>{line}</Text>
          ))}
          {beneath}
        </Box>
      )
    }

    // A terminal row draws each figure as a bar of eighths in the room it has
    // left, the window's time gone marked in it; a row with none keeps the
    // glyphs.
    const terminalBand = band
    const barCells = barCellsFor(columns - bandWidth(band), band.limits.length)
    // With a second row to spare, what fills the context, the cache and the
    // word of what to do go beneath the figures; without, they go after them
    // where they fit, the most useful first.
    const hasSecondRow = e.props.maxRows >= 2
    const secondColumns = e.props.bodyColumns - SECOND_INDENT
    let taken = bandWidth(terminalBand) + (barCells === 0 ? 0 : barCells + 1 + (barCells - 1) * terminalBand.limits.length)
    let below = -3
    const room = (wide: number, gap = 3) => {
      if (hasSecondRow) {
        return below + gap + wide <= secondColumns ? ((below += gap + wide), true) : false
      }

      return taken + gap + wide <= columns ? ((taken += gap + wide), true) : false
    }
    const hasNews = news !== null && room(news.text.length)
    const hasCache = cacheSaid !== null && room(cacheSaid.text.length)
    const hasMix = held !== null && hasContext && room(TERMINAL_CELLS + (hasSecondRow ? MIX_WORD.length : 0), hasSecondRow ? 3 : 1)
    const barOf = (spent: number | null, gone: number | null, color: string) =>
      eighths(spent, gone, barCells).map(({ text, isNow }) => (
        <Text color={color} backgroundColor={isNow ? 'inactive' : 'subtle'}>
          {text}
        </Text>
      ))
    const hasCrabRows =
      e.props.maxRows >= CRAB_MIN_ROWS && e.props.bodyColumns >= CRAB_MIN_COLUMNS
    // The finer crab where the band has its rows and the two beneath it.
    const isSharp = e.props.maxRows >= SHARP_CRAB_ROWS + 2
    const crabDrawn = isSharp
      ? crabCells().map(runs => (
          <Box>
            {runs.map(({ text, color, backgroundColor }) => (
              <Text {...(color === null ? {} : { color })} {...(backgroundColor === null ? {} : { backgroundColor })}>
                {text}
              </Text>
            ))}
          </Box>
        ))
      : CRAB_ROWS.map(row => <Text color={talk === null ? undefined : toneOf(talk.kind)}>{row}</Text>)
    const second = hasSecondRow && (hasMix || hasCache || hasNews) ? (
      <Box gap={3} paddingLeft={SECOND_INDENT}>
        {hasMix && (
          <Box gap={1}>
            <Box>{mix(TERMINAL_CELLS, '▆')}</Box>
            <Text dimColor>{MIX_WORD.trim()}</Text>
          </Box>
        )}
        {hasCache && cacheSaid !== null && cacheText(cacheSaid)}
        {hasNews && newsPress}
      </Box>
    ) : null

    return (
      <Box flexDirection="column">
        {/* The words and buttons stand where the crab has no room beside them. */}
        {talk !== null && (hasCrabRows || isStaying) && (
          <Box gap={2}>
            {hasCrabRows && (
              <Box flexDirection="column" flexShrink={0}>
                {crabDrawn}
              </Box>
            )}
            {isStaying && (
              <Box flexDirection="column" flexShrink={1} minWidth={0} {...(isSharp ? { paddingTop: 1 } : {})}>
                <Text weight="semibold" wrap="wrap">
                  {talk.title}
                </Text>
                {talk.text !== '' && (
                  <Text wrap="wrap" {...(talk.tone === undefined || talk.tone === null ? { dimColor: true } : { color: talk.tone })}>
                    {talk.text}
                  </Text>
                )}
                {(talk.split ?? []).length > 0 && (
                  <Box columnGap={1} flexWrap="wrap">
                    <Box flexShrink={0}>
                      {cellsOfSplit(talk.split ?? [], SPLIT_CELLS).map(({ text, color: shade }) => (
                        <Text color={shade}>{text}</Text>
                      ))}
                    </Box>
                    <Box flexShrink={1} minWidth={0}>
                      <Text dimColor wrap="wrap">
                        {(talk.split ?? []).map(({ name, share }) => `${name} ${Math.round(share * 100)}%`).join(' · ')}
                      </Text>
                    </Box>
                  </Box>
                )}
                {(talk.choices ?? []).length > 0 && (
                  <Box columnGap={1} flexWrap="wrap">
                    {(talk.choices ?? []).map(({ key, label }, index) => (
                      <Button
                        key={`choice-${key}`}
                        label={`${index + 1} ${label}`}
                        hotkey={String(index + 1)}
                        {...(index === 0 ? { variant: 'primary' as const } : {})}
                        onPress={() => act($, key as ChoiceKey, talk.bar.label)}
                      />
                    ))}
                    <Button key="crab-ok" label="OK" onPress={() => hush($)} />
                  </Box>
                )}
                {/* Narrow, they would wrap the figures out of view. */}
                {e.props.maxRows >= HINT_MIN_ROWS && e.props.bodyColumns >= CRAB_MIN_COLUMNS &&
                  (talk.choices ?? []).map(({ key, label, hint }, index) =>
                    hint === undefined ? null : (
                      <Text key={`hint-${key}`} dimColor wrap="wrap">
                        {`${index + 1} ${label}: ${hint}`}
                      </Text>
                    ),
                  )}
              </Box>
            )}
          </Box>
        )}
        <Box gap={3}>
          {hasContext && (
            <Box gap={1}>
              {fill}
              <Text dimColor>CTX</Text>
              {barCells > 0 && <Box>{barOf(percent, null, color)}</Box>}
              <Text {...(barCells > 0 ? { weight: 'semibold' as const } : {})}>{barCells > 0 ? percentage(percent).trim() : percentage(percent)}</Text>
              {!hasSecondRow && hasMix && <Box>{mix(TERMINAL_CELLS, '▆')}</Box>}
            </Box>
          )}
          {press}
          {terminalBand.limits.map((limit, index) => (
            <Box gap={1}>
              {barCells === 0 && <Text color={limit.tone}>{limit.glyph}</Text>}
              <Text dimColor>{limit.label}</Text>
              {barCells > 0 && (
                <Box>
                  {barOf(
                    usage.limits[index]?.percentUsed ?? null,
                    usage.limits[index] === undefined ? null : elapsed(usage.limits[index], at),
                    limit.tone,
                  )}
                </Box>
              )}
              <Text {...(barCells > 0 ? { weight: 'semibold' as const } : {})}>{barCells > 0 ? limit.percent.trim() : limit.percent}</Text>
              {limit.left !== null && <Text dimColor>{limit.left}</Text>}
            </Box>
          ))}
          {terminalBand.eta !== null && <Text color="warning">{terminalBand.eta}</Text>}
          {terminalBand.cost !== null && <Text>{terminalBand.cost}</Text>}
          {quiet !== null && <Text dimColor>{quiet}</Text>}
          {!hasSecondRow && hasCache && cacheSaid !== null && cacheText(cacheSaid)}
          {!hasSecondRow && hasNews && newsPress}
        </Box>
        {second}
        {problems.map(line => (
          <Text dimColor>{line}</Text>
        ))}
        {beneath}
      </Box>
    )
}
