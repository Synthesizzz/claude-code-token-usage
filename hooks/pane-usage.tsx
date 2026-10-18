// The /tokens pane: a dashboard on a surface that draws pictures, the same
// in text on a terminal.

import { atom, read } from 'claude-code'
import type { MatchedHook } from 'claude-code'
import type { Costly, Limit, TurnTokens } from '../types'
import { SHARE_PX, WEEK_PX, shareSvg, weekSvg } from './chart'
import {
  NO_SHARE,
  byProject,
  bySubagent,
  cacheShare,
  dayOf,
  modelName,
  shareTone,
  shortTokens,
  spark,
  tips,
  today,
  total,
  week,
  EMPTY,
  isPlanOf,
  monthLine,
  usd,
} from './cost'
import { cacheLine, learnedTtl } from './cache'
import { contextLine } from './context'
import { dashWidth, figuresSvg, ringsSvg, splitSvg } from './dash'
import { paletteFor } from './style'
import { clockAt, countdown, forecast, percentage, remaining, ring, short, tone } from './usage'
import {
  CONTEXT_PANE,
  PROJECT_SHARE,
  TIME_CELLS,
  TOKEN_CELLS,
  TOOLS_COLUMNS,
  grouped,
  runs,
  saneBreakdown,
  scope,
  styleOf,
} from './state'

// Not `snapshot`: a session reloaded from 0.1.0 still holds that key in its old shape.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

const last = atom({ plugin: 'token-usage', key: 'last' } as const, null)

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

const lastSession = atom({ plugin: 'token-usage', key: 'lastSession' } as const, null)

// Dollars by day, for every session: the month is summed from it.
const ledger = atom({ plugin: 'token-usage', key: 'ledger' } as const, EMPTY)

const mine = atom({ plugin: 'token-usage', key: 'mine' } as const, NO_SHARE)

// Tokens by day, by project, and the heaviest turns of the day: shared by
// every session, like the ledger. The pane counts in tokens; the band, in
// dollars.
const projects = atom({ plugin: 'token-usage', key: 'projects' } as const, {})

const models = atom({ plugin: 'token-usage', key: 'models' } as const, {})

const turns = atom({ plugin: 'token-usage', key: 'turns' } as const, [])

const tokenDays = atom({ plugin: 'token-usage', key: 'tokenDays' } as const, {})

// The subagents' tokens and runs by agent type, for every session.
const agents = atom({ plugin: 'token-usage', key: 'agents' } as const, { agents: {}, runs: {} })

const sessionTokens = atom({ plugin: 'token-usage', key: 'sessionTokens' } as const, 0)

// What fills the context, as /context breaks it down.
const breakdown = atom({ plugin: 'token-usage', key: 'breakdown' } as const, null)

const pauses = atom({ plugin: 'token-usage', key: 'pauses' } as const, [])

// Said beneath the month's dollars on a subscription.
const NOT_BILLED = 'Your plan does not bill these.'

type DrawUsagePaneHook = MatchedHook<'ui.render', { component: 'Pane'; requestId: string }>

export async function drawUsagePane($: Parameters<DrawUsagePaneHook>[0], e: Parameters<DrawUsagePaneHook>[1]) {
    const { Box, Text } = $.ui.resolve(e)
    const usage = await read($, snapshot)
    const turn = await read($, last)
    const row = (label: string, value: string) => (
      <Box justifyContent="space-between">
        <Text dimColor>{label}</Text>
        <Text>{value}</Text>
      </Box>
    )
    const dial = (percent: number | null, name: string, lines: string[]) => (
      <Box gap={1}>
        <Box flexDirection="column">
          {ring(percent).map(cells => (
            <Box>
              {runs(cells).map(({ text, kind }) =>
                kind === 'on' ? (
                  <Text color={tone(percent ?? 0)}>{text}</Text>
                ) : (
                  <Text dimColor={kind === 'off'}>{text}</Text>
                ),
              )}
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          <Box gap={1}>
            <Text weight="semibold">{name}</Text>
            <Text>{percentage(percent).trim()}</Text>
          </Box>
          {lines.map(line => (
            <Text dimColor>{line}</Text>
          ))}
        </Box>
      </Box>
    )

    if (usage === null) {
      return <Text dimColor>No usage measured yet.</Text>
    }

    const at = Math.max(usage.at, await read($, now))
    const style = await styleOf($, scope.base)
    const palette = paletteFor(style)
    const counted = await read($, tokenDays)
    const mine = await read($, sessionTokens)
    const days = week(counted, at)
    const spread = byProject(await read($, projects), at)
    const answered = byProject(await read($, models), at)
    const subagents = bySubagent(await read($, agents), total(days), at)
    const helpers = subagents.rows.map(({ name, total: sum, runs }) => ({ name: `${name} ×${runs}`, total: sum }))
    const advice = tips({ turn, percent: usage.percent, days })
    const learned = cacheLine(learnedTtl(await read($, pauses)))
    const previous = await read($, lastSession)
    // The month so far in dollars, and against its budget where one is set.
    const month = monthLine((await read($, ledger)).days, at)
    const monthShare = style.monthBudget === null ? null : Math.round((month.spent / style.monthBudget) * 100)
    const monthTone = monthShare === null ? 'success' : monthShare >= 100 ? 'error' : monthShare >= 80 ? 'warning' : 'success'
    const hasMonth = month.spent > 0 || monthShare !== null
    // On a subscription the month's dollars are the API's price, not a bill.
    const isPlan = isPlanOf(usage.limits)
    const monthName = isPlan ? 'this month at API prices' : 'this month'
    const clockOf = (ended: number) => {
      const date = new Date(ended)

      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    const heavy = (await read($, turns)).filter(({ at: ended }) => dayOf(ended) === dayOf(at))
    const turnTotal = (held: TurnTokens) => held.input + held.output + held.cacheRead + held.cacheWrite
    const toolsOf = (called: Costly['tools']) =>
      Object.entries(called)
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
        // An MCP tool (`mcp__server__tool`) goes by its own last name.
        .map(([tool, count]) => [tool.startsWith('mcp__') ? (tool.split('__').at(-1) ?? tool) : tool, count] as const)
        .map(([tool, count]) => (count === 1 ? tool : `${tool}×${count}`))
        .join(' ')
    const share = cacheShare(turn)
    // A terminal draws no picture: the same is said there in text.
    const hasPictures = e.surface !== 'terminal'
    const picture = (
      drawn: { source: string; alt: string },
      size: { width: number; height: number },
    ) => {
      // Only a surface that draws vectors has Svg in its table.
      const table = $.ui.resolve(e)

      return 'Svg' in table ? (
        <table.Svg source={drawn.source} alt={drawn.alt} width={size.width} height={size.height} />
      ) : null
    }

    // Each window's reset in clock time, and when it fills at its pace.
    const said = (limit: Limit) => {
      const left = remaining(limit, at)
      const eta = forecast(limit, at)
      const clock = left === null ? '' : `, at ${clockAt(at + left, at)}`

      return [`reset ${left === null ? '--' : countdown(left)}${clock}`, ...(eta === null ? [] : [`full in ${countdown(eta)}`])]
    }
    const fill = usage.tokens === null ? [] : [`${grouped(usage.tokens)} / ${grouped(usage.window)}`]
    // What takes the most of the context, in a line, and the way to the rest.
    const filled = await read($, breakdown)
    const fills = filled === null ? null : contextLine(saneBreakdown(filled.value)?.categories ?? [])
    const { Button } = $.ui.resolve(e)
    const fillsDrawn = fills !== null && (
      <Box flexDirection="column">
        <Text> </Text>
        <Box justifyContent="space-between" gap={1}>
          <Text weight="semibold">What fills the context</Text>
          <Button
            key="context-details"
            label="Details"
            variant="secondary"
            onPress={() => void $.ui.open({ id: CONTEXT_PANE, title: 'Token usage · context' })}
          />
        </Box>
        <Text dimColor wrap="wrap">
          {fills}
        </Text>
      </Box>
    )
    const tipsDrawn = advice.length > 0 && (
      <Box flexDirection="column">
        {advice.map(line => (
          <Box gap={1}>
            <Text color="warning">●</Text>
            <Text wrap="wrap">{line}</Text>
          </Box>
        ))}
      </Box>
    )
    // The heaviest turns as a table: time, project, tools, tokens. A pane too
    // narrow for the tools leaves them out; a name too long is cut short.
    const hasTools = e.props.bodyColumns >= TOOLS_COLUMNS
    // The project has its room before the tools: as wide as the longest, up
    // to a little over half of what the time and the tokens leave.
    const free = e.props.bodyColumns - TIME_CELLS - TOKEN_CELLS - 3
    const projectCells = Math.min(
      Math.max(7, ...heavy.map(({ project: where }) => where.length)),
      Math.floor(free * PROJECT_SHARE),
    )
    const cells = (time: string, where: string, called: string, tokens: string, isHead: boolean) => (
      <Box gap={1}>
        <Box width={TIME_CELLS} flexShrink={0}>
          <Text dimColor>{time}</Text>
        </Box>
        <Box {...(hasTools ? { width: projectCells, flexShrink: 0 } : { flexGrow: 1, flexShrink: 1, minWidth: 0 })}>
          <Text dimColor={isHead} wrap="truncate-end">
            {where}
          </Text>
        </Box>
        {hasTools && (
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text dimColor wrap="truncate-end">
              {called}
            </Text>
          </Box>
        )}
        <Box width={TOKEN_CELLS} flexShrink={0} justifyContent="flex-end">
          <Text dimColor={isHead} {...(!isHead ? { weight: 'semibold' as const } : {})}>
            {tokens}
          </Text>
        </Box>
      </Box>
    )
    const heavyDrawn = heavy.length > 0 && (
      <Box flexDirection="column">
        <Text> </Text>
        <Text weight="semibold">Heaviest turns today</Text>
        {cells('time', 'project', 'tools', 'tokens', true)}
        {heavy.map(entry =>
          cells(clockAt(entry.at, at), entry.project, toolsOf(entry.tools) || '–', shortTokens(entry.tokens), false),
        )}
      </Box>
    )
    const lastDrawn = previous !== null && (
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor wrap="wrap">
          {`${hasPictures ? '' : '  '}Last session (${previous.project}, ${clockOf(previous.at)}): ${previous.line.replace(/^This session: /, '')}`}
        </Text>
      </Box>
    )

    // A terminal draws no picture: the same is said there in text, the
    // rings in braille, the counts row by row.
    if (!hasPictures) {
      return (
        <Box flexDirection="column">
          {dial(usage.percent, 'CTX', fill)}
          {usage.limits.map(limit => dial(limit.percentUsed, short(limit.kind).toUpperCase(), said(limit)))}
          {tipsDrawn !== false && <Text> </Text>}
          {tipsDrawn}
          {fillsDrawn}
          <Text> </Text>
          <Text weight="semibold">Last turn</Text>
          {turn === null && <Text dimColor>  no turn yet</Text>}
          {turn !== null && row('  input', grouped(turn.input))}
          {turn !== null && row('  output', grouped(turn.output))}
          {turn !== null && row('  cache read', grouped(turn.cacheRead))}
          {turn !== null && row('  cache write', grouped(turn.cacheWrite))}
          <Text> </Text>
          <Text weight="semibold">Tokens</Text>
          {row('  this session', shortTokens(mine))}
          {row('  last turn', turn === null ? '--' : shortTokens(turnTotal(turn)))}
          {row('  today', shortTokens(counted[dayOf(at)] ?? 0))}
          {row('  last 7 days', shortTokens(total(days)))}
          <Text dimColor>{spark(days)}</Text>
          {hasMonth && row(`  ${monthName}`, usd(month.spent))}
          {hasMonth && <Text dimColor wrap="wrap">{`  ${month.line}`}</Text>}
          {hasMonth && isPlan && <Text dimColor>{`  ${NOT_BILLED}`}</Text>}
          {monthShare !== null && style.monthBudget !== null && (
            <Box justifyContent="space-between">
              <Text dimColor>  budget a month</Text>
              <Text color={monthTone}>{`${monthShare}% of ${usd(style.monthBudget)}`}</Text>
            </Box>
          )}
          {share !== null && (
            <Box justifyContent="space-between">
              <Text dimColor>  read from cache</Text>
              <Text color={shareTone(share)}>{`${share}% of input`}</Text>
            </Box>
          )}
          {learned !== null && <Text dimColor wrap="wrap">{`  ${learned}`}</Text>}
          {spread.length > 0 && (
            <Box flexDirection="column">
              <Text> </Text>
              <Text weight="semibold">Last 7 days by project</Text>
              {spread.map(({ name, total: sum }) => row(`  ${name}`, shortTokens(sum)))}
            </Box>
          )}
          {answered.length > 0 && (
            <Box flexDirection="column">
              <Text> </Text>
              <Text weight="semibold">Last 7 days by model</Text>
              {answered.map(({ name, total: sum }) => row(`  ${modelName(name)}`, shortTokens(sum)))}
            </Box>
          )}
          {helpers.length > 0 && (
            <Box flexDirection="column">
              <Text> </Text>
              <Text weight="semibold">Last 7 days by subagent</Text>
              {helpers.map(({ name, total: sum }) => row(`  ${name}`, shortTokens(sum)))}
              <Text dimColor wrap="wrap">{`  ${subagents.share}% of every token counted`}</Text>
            </Box>
          )}
          {heavyDrawn}
          {lastDrawn}
        </Box>
      )
    }

    // The dashboard: what is large is drawn, the rest is said beneath it.
    const gauges = [
      { name: 'CTX', percent: usage.percent, lines: fill },
      ...usage.limits.map(limit => ({ name: short(limit.kind).toUpperCase(), percent: limit.percentUsed, lines: said(limit) })),
    ]
    const drawn = (made: { source: string; alt: string; width: number; height: number }) => picture(made, made)
    const wide = dashWidth(e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {drawn(ringsSvg(gauges, palette, wide))}
        {tipsDrawn !== false && <Text> </Text>}
        {tipsDrawn}
        {fillsDrawn}
        <Text> </Text>
        {drawn(
          figuresSvg([
            { name: 'this session', value: shortTokens(mine) },
            { name: 'today', value: shortTokens(counted[dayOf(at)] ?? 0) },
            { name: 'last 7 days', value: shortTokens(total(days)) },
          ], wide),
        )}
        {picture(weekSvg(days, wide), { width: wide, height: WEEK_PX.height })}
        {hasMonth && (
          <Box flexDirection="column">
            <Box justifyContent="space-between" gap={1}>
              <Text>{monthName}</Text>
              <Text weight="semibold">{usd(month.spent)}</Text>
            </Box>
            <Text dimColor wrap="wrap">{month.line}</Text>
            {isPlan && <Text dimColor>{NOT_BILLED}</Text>}
            {monthShare !== null && style.monthBudget !== null && (
              <Box flexDirection="column">
                <Box justifyContent="space-between" gap={1}>
                  <Text dimColor>budget a month</Text>
                  <Text color={monthTone}>{`${monthShare}% of ${usd(style.monthBudget)}`}</Text>
                </Box>
                {picture(shareSvg(monthShare, palette, wide, monthTone), { width: wide, height: SHARE_PX.height })}
              </Box>
            )}
          </Box>
        )}
        {/* The share on a line of its own, its bar beneath as wide as the pane:
            beside a bar, its words wrapped where the pane is narrow. */}
        {share !== null && (
          <Box flexDirection="column">
            <Box justifyContent="space-between" gap={1}>
              <Text dimColor>read from cache</Text>
              <Text color={shareTone(share)}>{`${share}%`}</Text>
            </Box>
            {picture(shareSvg(share, palette, wide, shareTone(share)), { width: wide, height: SHARE_PX.height })}
          </Box>
        )}
        {learned !== null && <Text dimColor wrap="wrap">{learned}</Text>}
        {turn !== null && (
          <Text dimColor wrap="wrap">
            {`last turn ${shortTokens(turnTotal(turn))} · in ${grouped(turn.input)} · out ${grouped(turn.output)} · cache read ${grouped(turn.cacheRead)} · write ${grouped(turn.cacheWrite)}`}
          </Text>
        )}
        {(spread.length > 0 || answered.length > 0 || helpers.length > 0) && <Text> </Text>}
        {spread.length > 0 && drawn(splitSvg('By project', spread, wide))}
        {answered.length > 0 &&
          drawn(splitSvg('By model', answered.map(({ name, total: sum }) => ({ name: modelName(name), total: sum })), wide))}
        {helpers.length > 0 && drawn(splitSvg('By subagent', helpers, wide))}
        {helpers.length > 0 && <Text dimColor wrap="wrap">{`subagents took ${subagents.share}% of every token counted`}</Text>}
        {heavyDrawn}
        {lastDrawn}
      </Box>
    )
}
