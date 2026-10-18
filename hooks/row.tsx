// The windows of the desktop band in a layout: drawn by the band, and by the
// style pane's preview of a look, so the two cannot drift apart.

import type { Elements, RenderChildren } from 'claude-code'
import type { Layout, Motion, Palette, Snapshot, Style } from '../types'
import { BAR_PX, DOT_PX, PACE_PX, RING_PX, WIDE_BAR_PX, stackFor } from './fit'
import { paletteFor, words } from './style'
import { barSvg, dotSvg, paceSvg, ringSvg } from './svg'
import { cellsOf, countdown, elapsed, percentage, remaining } from './usage'

type Drawing = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg'>

// A window as a layout draws it.
export type Drawn = {
  name: string
  cells: number
  percent: number
  used: string
  gone: number | null
  clock: string | null
  motion?: Motion
}

export const drawWindows = (
  { Box, Text, Svg }: Drawing,
  layout: Layout,
  windows: readonly Drawn[],
  palette: Palette,
  named: { left: string; used: string },
  hasWords: boolean,
  wideBar = WIDE_BAR_PX,
): RenderChildren => {
  const figure = (drawn: { source: string; alt: string }, width: number, height: number) => (
    <Svg source={drawn.source} alt={drawn.alt} width={width} height={height} />
  )

  switch (layout) {
    case 'rings':
      return windows.map(({ name, percent: spent, used, gone, clock, motion }) => (
        <Box gap={1} alignItems="center" flexShrink={0}>
          {figure(paceSvg(spent, gone, name, palette, motion), PACE_PX, PACE_PX)}
          <Box flexDirection="column">
            {clock !== null && (
              <Box gap={1}>
                <Text weight="semibold">{clock}</Text>
                {hasWords && <Text dimColor>{named.left}</Text>}
              </Box>
            )}
            <Text dimColor>{hasWords ? `${name}, ${used} ${named.used}` : `${name} ${used}`}</Text>
          </Box>
        </Box>
      ))
    case 'bars':
      return windows.map(({ name, cells, percent: spent, used, gone, clock, motion }) => (
        <Box gap={1} alignItems="center" flexShrink={0}>
          {hasWords && <Text dimColor>{name}</Text>}
          <Text weight="semibold">{used}</Text>
          {figure(barSvg(cells, spent, gone, name, palette, BAR_PX, motion), BAR_PX, RING_PX)}
          {clock !== null && <Text weight="semibold">{clock}</Text>}
        </Box>
      ))
    case 'compact':
      return windows.map(({ name, percent: spent, used, clock }) => (
        <Box gap={1} alignItems="center" flexShrink={0}>
          {hasWords && <Text dimColor>{name}</Text>}
          {figure(dotSvg(spent, name, palette), DOT_PX, DOT_PX)}
          <Text weight="semibold">{used}</Text>
          {clock !== null && <Text dimColor>{clock}</Text>}
        </Box>
      ))
    case 'frames':
      return windows.map(({ name, percent: spent, used, clock }) => (
        <Box gap={1} alignItems="center" flexShrink={0} borderStyle="round" borderDimColor paddingX={1}>
          {figure(ringSvg(spent, name, false, palette), RING_PX, RING_PX)}
          <Text dimColor>{name}</Text>
          <Text weight="semibold">{used}</Text>
          {clock !== null && hasWords && <Text dimColor>{named.left}</Text>}
          {clock !== null && <Text weight="semibold">{clock}</Text>}
        </Box>
      ))
    // One row per window, so the two never read as one line.
    case 'stack':
      return (
        <Box flexDirection="column" flexShrink={0}>
          {windows.map(({ name, cells, percent: spent, used, gone, clock, motion }) => (
            <Box gap={1} alignItems="center">
              <Box minWidth={7}>
                <Text dimColor>{name}</Text>
              </Box>
              {figure(barSvg(cells, spent, gone, name, palette, wideBar, motion), wideBar, RING_PX)}
              <Text weight="semibold">{used}</Text>
              {clock !== null && <Text weight="semibold">{clock}</Text>}
              {clock !== null && hasWords && <Text dimColor>{named.left}</Text>}
            </Box>
          ))}
        </Box>
      )
  }
}

// The band's figures in a look, from the last reading: the context ring and
// the windows, as the band draws them, the stack's bars fitted to `columns`.
export const lookRow = (drawing: Drawing, usage: Snapshot, at: number, style: Style, columns: number): RenderChildren => {
  const { Box, Text, Svg } = drawing
  const palette = paletteFor(style)
  const named = words(style)
  const ring = ringSvg(usage.percent, named.context, false, palette)
  const windows = usage.limits.map(limit => {
    const left = remaining(limit, at)

    return {
      name: named.name(limit.kind),
      cells: cellsOf(limit.kind),
      percent: limit.percentUsed,
      used: percentage(limit.percentUsed).trim(),
      gone: elapsed(limit, at),
      clock: !style.hidden.includes('countdown') && left !== null ? countdown(left) : null,
    }
  })

  const stacked = style.layout === 'stack' ? stackFor(columns, windows, named.left) : { bar: WIDE_BAR_PX, hasWords: true }

  return (
    <Box columnGap={2} rowGap={1} alignItems="center" flexWrap="wrap">
      {!style.hidden.includes('context') && (
        <Box gap={1} alignItems="center" flexShrink={0}>
          <Svg source={ring.source} alt={ring.alt} width={RING_PX} height={RING_PX} />
          <Text weight="semibold">{percentage(usage.percent).trim()}</Text>
          <Text dimColor>{named.context}</Text>
        </Box>
      )}
      {drawWindows(drawing, style.layout, windows, palette, named, stacked.hasWords, stacked.bar)}
    </Box>
  )
}
