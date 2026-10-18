// What a typed command carries beside its words: where it came from and the
// screen it was typed on. The tests type theirs at the prompt of an
// 80-column main screen.
export const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

// A tool call as the engine raises it, through one plain signature: the
// checker gives up weighing every tool's overload for each call in a long file.
export const callOf = ($: { tool: { call: unknown } }) => $.tool.call as (input: Record<string, unknown>) => Promise<unknown>
