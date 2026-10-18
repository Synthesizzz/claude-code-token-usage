// The /tokens context pane: what fills the context, as /context breaks it down.

import { atom, read } from 'claude-code'
import type { MatchedHook, RenderChildren } from 'claude-code'
import { counted, dayOf, shortTokens, total } from './cost'
import { appOf, glyphOf, kindsOf, servers, shortPath, trendLine } from './context'
import { tone } from './usage'
import { countContext } from './ledger'
import { BESIDE_COLUMNS, SQUARE_CELLS, saneBreakdown } from './state'

// What fills the context, as /context breaks it down.
const breakdown = atom({ plugin: 'token-usage', key: 'breakdown' } as const, null)

// The set-up of each day as last counted, for every session: the latest wins.
const setUps = atom({ plugin: 'token-usage', key: 'setUps' } as const, {})

type DrawContextPaneHook = MatchedHook<'ui.render', { component: 'Pane'; requestId: string }>

export async function drawContextPane($: Parameters<DrawContextPaneHook>[0], e: Parameters<DrawContextPaneHook>[1]) {
    const { Box, Text, Button } = $.ui.resolve(e)
    const held = await read($, breakdown)
    const value = held === null ? null : saneBreakdown(held.value)

    if (held === null || value === null) {
      return <Text dimColor>Nothing counted yet: run /tokens context.</Text>
    }

    const kinds = kindsOf(value.categories)
    const kindOf = new Map(value.categories.map(({ name, kind }) => [name, kind]))
    const trend = trendLine(await read($, setUps), dayOf(held.at))
    const home = await $.env.get('USERPROFILE').catch(() => undefined) ?? (await $.env.get('HOME').catch(() => undefined))
    const row = (label: RenderChildren, figure: string) => (
      <Box justifyContent="space-between" gap={1}>
        <Box flexShrink={1} minWidth={0}>
          {label}
        </Box>
        <Text>{figure}</Text>
      </Box>
    )
    const share = (tokens: number) => `${Math.round((tokens / Math.max(1, value.rawMaxTokens)) * 100)}%`
    const grid = (
      <Box flexDirection="column" flexShrink={0}>
        {value.gridRows.map(squares => (
          <Box>
            {squares.map(square => {
              const glyph = glyphOf(square, kindOf)

              // Each square in a cell of its own: the glyphs are not one width
              // in a proportional face.
              return (
                <Box width={SQUARE_CELLS} flexShrink={0}>
                  {glyph === '■' || glyph === '▪' ? <Text color={square.color}>{glyph}</Text> : <Text dimColor>{glyph}</Text>}
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
    const legend = (
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        {kinds.used.map(({ name, tokens, color }) => (
          <Box justifyContent="space-between" gap={1}>
            <Box gap={1} flexShrink={1} minWidth={0}>
              <Text color={color}>■</Text>
              <Text wrap="truncate-end">{name}</Text>
            </Box>
            <Text dimColor>{`${shortTokens(tokens)} ${share(tokens)}`}</Text>
          </Box>
        ))}
        <Box justifyContent="space-between" gap={1}>
          <Text dimColor>▨ Autocompact buffer</Text>
          <Text dimColor>{shortTokens(kinds.buffer)}</Text>
        </Box>
        <Box justifyContent="space-between" gap={1}>
          <Text dimColor>□ Free space</Text>
          <Text dimColor>{shortTokens(kinds.free)}</Text>
        </Box>
      </Box>
    )
    const isBeside = e.props.bodyColumns >= BESIDE_COLUMNS
    // Only the servers with tools in the window are listed: the rest wait to
    // be searched for, and are said in one line.
    const mcp = servers(value.mcpTools)
    const inWindow = mcp.filter(({ loaded }) => loaded > 0)
    const waiting = mcp.length - inWindow.length
    const files = [...value.memoryFiles].sort((a, b) => b.tokens - a.tokens)
    const skills = value.skills
    const agents = value.agents.reduce((sum, agent) => sum + agent.tokens, 0)

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" gap={1}>
          <Box gap={1}>
            <Text weight="semibold">Context</Text>
            <Text dimColor>{`${shortTokens(value.totalTokens)} / ${shortTokens(value.rawMaxTokens)}`}</Text>
          </Box>
          <Text color={tone(value.percentage)} weight="semibold">{`${Math.round(value.percentage)}%`}</Text>
        </Box>
        {trend !== null && (
          <Text dimColor wrap="wrap">
            {trend}
          </Text>
        )}
        <Text> </Text>
        <Box flexDirection={isBeside ? 'row' : 'column'} gap={2}>
          {grid}
          {legend}
        </Box>
        {(inWindow.length > 0 || kinds.deferred > 0) && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="semibold">MCP servers</Text>
            {inWindow.map(({ server, tokens, loaded, total: all, deferred, tools: called }) => {
              const { name, color } = appOf(server, called)

              // The name gives way first; the count of tools and the tokens
              // keep their room, on one line.
              return (
                <Box justifyContent="space-between" gap={1}>
                  <Box gap={1} flexShrink={1} minWidth={0}>
                    <Box flexShrink={1} minWidth={0}>
                      {color === null ? (
                        <Text weight="semibold" wrap="truncate-end">
                          {name}
                        </Text>
                      ) : (
                        <Text weight="semibold" color={color} wrap="truncate-end">
                          {name}
                        </Text>
                      )}
                    </Box>
                    <Box flexShrink={0}>
                      <Text dimColor>{`${loaded}/${all} tools`}</Text>
                    </Box>
                  </Box>
                  <Box flexShrink={0}>
                    {tokens > 0 ? (
                      <Text>{shortTokens(tokens)}</Text>
                    ) : (
                      <Text dimColor>{deferred > 0 ? `${shortTokens(deferred)} deferred` : '–'}</Text>
                    )}
                  </Box>
                </Box>
              )
            })}
            {waiting > 0 || kinds.deferred > 0 ? (
              <Text dimColor wrap="wrap">
                {[
                  waiting > 0 ? `+ ${waiting} ${waiting === 1 ? 'server' : 'servers'} not loaded` : '+',
                  kinds.deferred > 0 ? `${shortTokens(kinds.deferred)} deferred, outside the window` : null,
                ]
                  .filter(part => part !== null)
                  .join(waiting > 0 ? ' · ' : ' ')}
              </Text>
            ) : null}
          </Box>
        )}
        {files.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="semibold">Memory files</Text>
            {files.map(({ path, type, tokens }) =>
              row(
                <Box gap={1} minWidth={0}>
                  <Text wrap="truncate-start">{shortPath(path, typeof home === 'string' ? home : null)}</Text>
                  <Text dimColor>{type}</Text>
                </Box>,
                shortTokens(tokens),
              ),
            )}
          </Box>
        )}
        {skills !== undefined && (
          <Box flexDirection="column">
            <Text> </Text>
            {row(<Text weight="semibold">Skills</Text>, shortTokens(skills.tokens))}
            <Text dimColor wrap="wrap">
              {`${skills.includedSkills} of ${skills.totalSkills} listed · most: ${[...skills.skillFrontmatter]
                .sort((a, b) => b.tokens - a.tokens)
                .slice(0, 3)
                .map(({ name, tokens }) => `${name} ${shortTokens(tokens)}`)
                .join(', ')}`}
            </Text>
          </Box>
        )}
        {value.agents.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            {row(<Text weight="semibold">{`Custom agents · ${value.agents.length}`}</Text>, shortTokens(agents))}
          </Box>
        )}
        <Text> </Text>
        <Box gap={1} alignItems="center" flexWrap="wrap">
          <Text dimColor>{held.detail === 'full' ? 'counted exactly' : 'estimated'}</Text>
          {held.detail === 'summary' && (
            <Button key="context-full" label="Count exactly" variant="secondary" onPress={() => void countContext($, 'full')} />
          )}
          <Button key="context-refresh" label="Refresh" variant="secondary" onPress={() => void countContext($, held.detail)} />
        </Box>
      </Box>
    )
}
