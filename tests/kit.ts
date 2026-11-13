import type { On } from 'claude-code'

// What a typed command carries beside its words: where it came from and the
// screen it was typed on. The tests type theirs at the prompt of an
// 80-column main screen.
export const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

// A tool call as the engine raises it, through one plain signature: the
// checker gives up weighing every tool's overload for each call in a long file.
export const callOf = ($: { tool: { call: unknown } }) => $.tool.call as (input: Record<string, unknown>) => Promise<unknown>

// What the hooks beneath the band draw, as a test sets it: `children` under
// the mod's row. Up to 2.1.322 the engine asks the band as one chain with no
// plugin named, so a hook that names none sits beneath the mod. From 2.1.323
// each plugin's row is asked alone, `e.plugin` naming it, and a hook that
// names none hears the test's own row: drawn there, it stacks as a second row
// after the band instead of beneath it. So the stand-in names the mod, and on
// the test's own row it passes.
//
// The declarations up to 2.1.322 know neither `e.plugin` nor a `plugin` key
// in the band's matcher, so both stay out of the static types: the name is
// read off any object, and the matcher carries the key at run time under the
// type of the plain one. An engine without per-plugin rows never fires it.
const pluginOf = (e: object) => ('plugin' in e ? e.plugin : undefined)
const BAND_ROW = { component: 'AbovePrompt' } as const
const MOD_ROW: typeof BAND_ROW = Object.assign({ plugin: 'token-usage' }, BAND_ROW)

export const beneathBand = (on: On, children = '') => {
  on('ui.render', BAND_ROW, (beneath, e, next) =>
    pluginOf(e) === undefined ? beneath.ui.resolve(e).Text({ children }) : next(e),
  )
  on('ui.render', MOD_ROW, (beneath, e) => beneath.ui.resolve(e).Text({ children }))
}
