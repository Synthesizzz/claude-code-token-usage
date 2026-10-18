// The /tokens agents pane: the subagents of the turn, a card each, with a
// crab dressed for its job at work, done, asleep or failing.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, MatchedHook, Timer } from 'claude-code'
import { JOB_COLORS, jobCrabSvg, jobOf } from './crab'
import { shortTokens } from './cost'
import { countOf, isBusy, lineUp, meterSvg, phaseOf, settled, toolLine, workedFor } from './crew'
import { paletteFor } from './style'
import { eighths } from './usage'
import { CREW_TICK_MS, scope, styleOf, tick } from './state'

// The subagents of the turn, by id.
const crew = atom({ plugin: 'token-usage', key: 'crew' } as const, {})

// The terminal's bar of a subagent's share, in cells.
const TERMINAL_CELLS = 10
const METER_PX = 260

// How each stands by the engine's own list; says whether any still runs.
export async function refreshCrew($: EngineInterface) {
  try {
    const listed = await $.agent.list()
    const at = await $.clock.now()
    let isRunning = false

    await update($, crew, held => {
      const next = settled(held, listed, at)

      isRunning = isBusy(next)

      return next
    })
    await tick($)

    return isRunning
  } catch {
    return false
  }
}

// Reads the crew's list every few seconds while any of it runs: from a spawn,
// a subagent's tool call, or the pane opening on one at work. One watch at a
// time, its clock held in `watch`, which the module's own load makes: a
// reload stops the clock and starts the holder over with it, so no watch is
// left thought running with no clock behind it. It ends when nothing runs.
export function watchCrew($: EngineInterface, watch: { ticker?: Timer }) {
  if (watch.ticker !== undefined) {
    return
  }

  const ticker = $.clock.every(CREW_TICK_MS, () => {
    void refreshCrew($).then(isRunning => {
      if (!isRunning) {
        ticker.cancel()
        watch.ticker = undefined
      }
    })
  })

  watch.ticker = ticker
}

type DrawAgentsPaneHook = MatchedHook<'ui.render', { component: 'Pane'; requestId: string }>

export async function drawAgentsPane($: Parameters<DrawAgentsPaneHook>[0], e: Parameters<DrawAgentsPaneHook>[1]) {
  const { Box, Text } = $.ui.resolve(e)
  const at = await $.clock.now()
  const mates = lineUp(await read($, crew))

  if (mates.length === 0) {
    return (
      <Text dimColor wrap="wrap">
        No subagent has run yet in this session. When Claude starts one (Explore, Plan, ...), its card shows here, and the last turn that had some stays.
      </Text>
    )
  }

  const most = Math.max(1, ...mates.map(countOf))
  const running = mates.filter(mate => phaseOf(mate, at) === 'work').length
  const total = mates.reduce((sum, mate) => sum + countOf(mate), 0)
  const head = (
    <Box justifyContent="space-between" gap={1}>
      <Text weight="semibold">Subagents · this turn</Text>
      <Text dimColor>{`${running} running · ${shortTokens(total)}`}</Text>
    </Box>
  )
  const says = (mate: (typeof mates)[number]) => {
    const phase = phaseOf(mate, at)
    const tools = toolLine(mate)

    return [tools === '' ? '…' : tools, workedFor(mate, at), ...(phase === 'fail' ? [mate.status] : [])].join(' · ')
  }
  // The context its last response read, which is what Claude Code counts as
  // its tokens; beside its figure, where a long tool line cannot cut it off.
  const contextOf = (mate: (typeof mates)[number], word: string) =>
    (mate.context ?? null) === null ? null : `${word} ${shortTokens(mate.context ?? 0)}`

  // The terminal draws no picture: a mark of how it stands, its job's colour
  // and a bar of eighths.
  if (e.surface === 'terminal') {
    return (
      <Box flexDirection="column">
        {head}
        {mates.map(mate => {
          const phase = phaseOf(mate, at)
          const color = JOB_COLORS[jobOf(mate.type)]

          return (
            <Box flexDirection="column">
              <Box gap={1}>
                <Text color={phase === 'fail' ? 'error' : phase === 'work' ? 'success' : 'inactive'}>
                  {phase === 'fail' ? '✕' : phase === 'work' ? '●' : '✓'}
                </Text>
                <Box flexShrink={1} minWidth={0}>
                  <Text color={color} wrap="truncate-end">
                    {mate.type}
                  </Text>
                </Box>
                <Box flexShrink={0}>
                  {eighths((countOf(mate) / most) * 100, null, TERMINAL_CELLS).map(({ text }) => (
                    <Text color={color} backgroundColor="subtle">
                      {text}
                    </Text>
                  ))}
                </Box>
                <Text weight="semibold">{shortTokens(countOf(mate))}</Text>
                {contextOf(mate, 'ctx') === null ? null : (
                  <Box flexShrink={1} minWidth={0}>
                    <Text dimColor wrap="truncate-end">
                      {contextOf(mate, 'ctx')}
                    </Text>
                  </Box>
                )}
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor wrap="truncate-end">
                  {[mate.description, says(mate)].filter(part => part !== '').join(' · ')}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  }

  const table = $.ui.resolve(e)

  if (!('Svg' in table)) {
    return <Text dimColor>The agents pane draws on the desktop and in a terminal.</Text>
  }

  const { Svg } = table
  const palette = paletteFor(await styleOf($, scope.base))
  const wide = Math.max(120, Math.min(METER_PX, Math.round(e.props.bodyColumns * 9.3) - 160))

  return (
    <Box flexDirection="column" gap={1}>
      {head}
      {mates.map(mate => {
        const phase = phaseOf(mate, at)
        const job = jobOf(mate.type)
        const color = JOB_COLORS[job]
        const crab = jobCrabSvg(job, phase, `${mate.type} crab, ${phase === 'work' ? 'at work' : phase}`, palette)
        const meter = meterSvg(countOf(mate) / most, phase === 'fail' ? palette.error : color, wide, `${shortTokens(countOf(mate))} tokens`)

        return (
          <Box gap={1} alignItems="center">
            <Box width={6} flexShrink={0} justifyContent="center">
              <Svg source={crab.source} alt={crab.alt} width={crab.width} height={crab.height} />
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <Box gap={1}>
                <Box flexShrink={0}>
                  <Text weight="semibold" color={color}>
                    {mate.type}
                  </Text>
                </Box>
                <Box flexShrink={1} minWidth={0}>
                  <Text wrap="truncate-end" {...(phase === 'work' ? {} : { dimColor: true })}>
                    {mate.description}
                  </Text>
                </Box>
              </Box>
              <Text wrap="truncate-end" {...(phase === 'fail' ? { color: 'error' } : { dimColor: true })}>
                {says(mate)}
              </Text>
              <Svg source={meter.source} alt={meter.alt} width={wide} height={4} />
            </Box>
            <Box flexDirection="column" flexShrink={0} alignItems="flex-end">
              <Text weight="semibold">{shortTokens(countOf(mate))}</Text>
              <Text dimColor>processed</Text>
              {contextOf(mate, 'context') === null ? null : <Text dimColor>{contextOf(mate, 'context')}</Text>}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
