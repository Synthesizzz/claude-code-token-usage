// The /tokens style pane: every choice a button, the one in force primary.

import type { MatchedHook, RenderChildren } from 'claude-code'
import type { Style } from '../types'
import { atom, read } from 'claude-code'
import { isPlanOf } from './cost'
import {
  LABEL_SETS,
  LAYOUTS,
  NOTIFY,
  PALETTES,
  PALETTE_GROUPS,
  PALETTE_NAMES,
  PARTS,
  PRESETS,
  presetOf,
} from './style'
import { chipSvg } from './thumb'
import { lookRow } from './row'
import { layout } from './usage'
import { exported, tidy } from './ledger'
import { SAMPLE, SAMPLE_WEEK, bring, choose } from './notices'
import { BUDGETS, CHIP_PX, MONTH_BUDGETS, PROJECT_BUDGETS, QUIET_HOURS, WEEK_BUDGETS, scope, styleOf } from './state'

// The last reading: the figures the look is drawn with, and whether the
// session is on a subscription.
const snapshot = atom({ plugin: 'token-usage', key: 'usage' } as const, null)

const now = atom({ plugin: 'token-usage', key: 'now' } as const, 0)

// The hover groups of the looks not chosen: a pointer on a choice's button
// lights its group, which reveals the band drawn in that look.
const PEEK = 'peek-'
// The look's frame takes this many columns of the pane: a border and a
// column of padding each side.
const FRAMED = 4

type DrawStylePaneHook = MatchedHook<'ui.render', { component: 'Pane'; requestId: string }>

export async function drawStylePane($: Parameters<DrawStylePaneHook>[0], e: Parameters<DrawStylePaneHook>[1]) {
    const { Box, Text, Button } = $.ui.resolve(e)
    const style = await styleOf($, scope.base)
    const preset = presetOf(style)
    // A subscription bills no dollars: its picker has no budgets to set. The
    // words still set one.
    const usage = await read($, snapshot)
    const isPlan = isPlanOf(usage?.limits ?? [])
    const at = usage === null ? 0 : Math.max(usage.at, await read($, now))
    const pick = (group: string, name: string, isOn: boolean, args: string, label = name, peek?: string) => (
      <Button
        key={`${group}-${name}`}
        label={label}
        variant={isOn ? 'primary' : 'secondary'}
        {...(peek === undefined ? {} : { hover: { scope: peek } })}
        onPress={() => choose($, scope.base, args)}
      />
    )
    // A Button holds text alone: its picture sits above it, on the surfaces
    // that draw vectors.
    const pictured = (
      drawn: { source: string; alt: string },
      size: { width: number; height: number },
      button: RenderChildren,
    ): RenderChildren => {
      if (e.surface === 'terminal') {
        return button
      }

      const { Svg } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Svg source={drawn.source} alt={drawn.alt} width={size.width} height={size.height} />
          {button}
        </Box>
      )
    }
    const group = (heading: string, picks: RenderChildren) => (
      <Box flexDirection="column">
        <Text dimColor>{heading}</Text>
        <Box gap={1} flexWrap="wrap" alignItems="flex-end">
          {picks}
        </Box>
      </Box>
    )
    // A look drawn as the band draws it, from the last reading, where vectors
    // are drawn and something has been read.
    const hasLook = e.surface !== 'terminal' && usage !== null
    const look = (shown: Style): RenderChildren => {
      if (e.surface === 'terminal' || usage === null) {
        return null
      }

      const { Svg } = $.ui.resolve(e)

      return (
        <Box borderStyle="round" borderDimColor paddingX={1}>
          {lookRow({ Box, Text, Svg }, usage, at, shown, e.props.bodyColumns - FRAMED)}
        </Box>
      )
    }
    // Each look not chosen, hidden until the pointer rests on its button. It
    // opens under the buttons, so what the pointer rests on stays put.
    const peek = (group: string, title: string, shown: Style) => (
      <Box key={group} flexDirection="column" display="none" hover={{ scope: group, display: 'flex' }}>
        <Text dimColor>{title}</Text>
        {look(shown)}
      </Box>
    )
    const peekOf = (kind: string, name: string, isOn: boolean) => (hasLook && !isOn ? `${PEEK}${kind}-${name}` : undefined)
    const hasAlerts = !style.hidden.includes('alerts')

    return (
      <Box flexDirection="column" gap={1}>
        {/* The look in force, as the band draws it. */}
        {hasLook && (
          <Box flexDirection="column">
            <Text dimColor>{`Look: ${style.layout} · ${style.palette}${preset === undefined ? '' : `, the ${preset} preset`}`}</Text>
            {look(style)}
          </Box>
        )}
        <Box flexDirection="column">
          {group(
            'Layout',
            LAYOUTS.map(name => pick('layout', name, style.layout === name, `layout ${name}`, name, peekOf('layout', name, style.layout === name))),
          )}
          {LAYOUTS.filter(name => hasLook && name !== style.layout).map(name =>
            peek(`${PEEK}layout-${name}`, `${name} · ${style.palette}, not chosen yet`, { ...style, layout: name }),
          )}
        </Box>
        {/* The palettes by where they read, each its three colours above it. */}
        <Box flexDirection="column">
          <Text dimColor>Palette</Text>
          {PALETTE_GROUPS.map(({ heading, names }) => (
            <Box key={heading} flexDirection="column" paddingLeft={1}>
              <Text dimColor>{heading}</Text>
              <Box gap={1} flexWrap="wrap" alignItems="flex-end">
                {names.map(name =>
                  pictured(
                    chipSvg(PALETTES[name], name),
                    CHIP_PX,
                    pick('palette', name, style.palette === name, `palette ${name}`, name, peekOf('palette', name, style.palette === name)),
                  ),
                )}
              </Box>
            </Box>
          ))}
          {PALETTE_NAMES.filter(name => hasLook && name !== style.palette).map(name =>
            peek(`${PEEK}palette-${name}`, `${style.layout} · ${name}, not chosen yet`, { ...style, palette: name, colors: {} }),
          )}
        </Box>
        {group(
          'Preset',
          Object.keys(PRESETS).map(name => pick('preset', name, preset === name, name)),
        )}
        {group(
          'Labels',
          LABEL_SETS.map(name => pick('labels', name, style.labels === name, `labels ${name}`)),
        )}
        {group(
          'Show',
          PARTS.filter(name => name !== 'alerts').map(name => {
            const isShown = !style.hidden.includes(name)

            return pick('part', name, isShown, `${isShown ? 'hide' : 'show'} ${name}`)
          }),
        )}
        {isPlan ? null : group('Budget a day', [
          pick('budget', 'off', style.budget === null, 'budget off'),
          ...BUDGETS.map(amount =>
            pick('budget', `$${amount}`, style.budget === amount, `budget ${amount}`),
          ),
        ])}
        {isPlan ? null : group(`Budget a day for ${scope.project}`, [
          pick('projectBudget', 'off', style.projectBudgets[scope.project] === undefined, 'budget project here off'),
          ...PROJECT_BUDGETS.map(amount =>
            pick(
              'projectBudget',
              `$${amount}`,
              style.projectBudgets[scope.project] === amount,
              `budget project here ${amount}`,
              `$${amount} for ${scope.project}`,
            ),
          ),
        ])}
        {isPlan ? null : group('Budget a week', [
          pick('weekBudget', 'off', style.weekBudget === null, 'budget week off'),
          ...WEEK_BUDGETS.map(amount =>
            pick('weekBudget', `$${amount}`, style.weekBudget === amount, `budget week ${amount}`, `$${amount} a week`),
          ),
        ])}
        {isPlan ? null : group('Budget a month', [
          pick('monthBudget', 'off', style.monthBudget === null, 'budget month off'),
          ...MONTH_BUDGETS.map(amount =>
            pick('monthBudget', `$${amount}`, style.monthBudget === amount, `budget month ${amount}`, `$${amount} a month`),
          ),
        ])}
        {group('Alerts', [
          pick('alerts', 'on', hasAlerts, `alerts ${hasAlerts ? 'off' : 'on'}`),
          ...NOTIFY.map(name => pick('alerts', name, style.notify === name, `alerts ${name}`)),
          <Button
            key="alerts-60"
            label="60%"
            variant={style.hasEarlyAlert ? 'primary' : 'secondary'}
            onPress={() => choose($, scope.base, `alerts 60 ${style.hasEarlyAlert ? 'off' : 'on'}`)}
          />,
          // A sample of each window's notice, to see the two side by side.
          <Button
            key="alerts-test"
            label="test 5h"
            onPress={async () => bring($, await styleOf($, scope.base), [SAMPLE], scope.surface)}
          />,
          <Button
            key="alerts-test-week"
            label="test week"
            onPress={async () => bring($, await styleOf($, scope.base), [SAMPLE_WEEK], scope.surface)}
          />,
        ])}
        {/* The notification outside the app: its window, what it says, and
            when it holds its peace. */}
        {group('Outside the app', [
          <Button
            key="popup"
            label="popup"
            variant={style.hasPopup ? 'primary' : 'secondary'}
            onPress={() => choose($, scope.base, `alerts popup ${style.hasPopup ? 'off' : 'on'}`)}
          />,
          <Button
            key="privacy"
            label="privacy"
            variant={style.isPrivate ? 'primary' : 'secondary'}
            onPress={() => choose($, scope.base, `alerts privacy ${style.isPrivate ? 'off' : 'on'}`)}
          />,
          pick('quiet', 'off', style.quiet === null, 'alerts quiet off', 'no quiet hours'),
          ...QUIET_HOURS.map(hours => {
            const [from, to] = hours.split('-').map(Number)
            const isOn = style.quiet !== null && style.quiet.from === from && style.quiet.to === to

            return pick('quiet', hours, isOn, `alerts quiet ${hours}`, hours.replace('-', '–'))
          }),
        ])}
        {/* What is kept on the disk: each press says how it went. */}
        {group('Data', [
          <Button key="export" label="export" onPress={async () => $.ui.toast(await exported($))} />,
          <Button key="tidy" label="old files" onPress={async () => $.ui.toast(await tidy($, false))} />,
        ])}
      </Box>
    )
}
