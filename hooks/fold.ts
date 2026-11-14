// Whether the usage card in the band above the prompt is folded to its
// figures, on the desktop.
//
// A card has news: a key naming what it has for the person to look at now, or
// null when it has nothing beyond its usual line. The key names the kind of
// news and when it came, never a figure that moves, so a counting clock does
// not change it. With no press held, a card with no news folds and a card with
// news opens. A press of its fold button holds what it chose for as long as
// the news is the one it was pressed on; new news lets it go, and the card
// folds or opens on its own again.
//
// The rule is copied from handoff, and into hub-pulse: each mod keeps its own
// press, and none reads another's.

/** A press of the fold button: the news it was pressed on and what it chose. */
export type Held = { news: string | null; folded: boolean }

/** Whether the card is folded, from its news and the press held, if any. */
export function foldedOf(news: string | null, held: Held | null): boolean {
  if (held !== null && held.news === news) return held.folded

  return news === null
}

/** The press of the fold button on a card that is `folded` now: it chooses the other. */
export function pressed(news: string | null, folded: boolean): Held {
  return { news, folded: !folded }
}

/**
 * What the usage card has beyond its figures. The cache's countdown and the
 * move's button are not news: the one shows in every pause between turns and
 * the other changes with every turn, so either would open the card after each.
 */
export type NewsParts = {
  /** The crab's notice while it is out: its kind and when it was raised. */
  crab: { kind: string; at: number } | null
  /** The cache has lapsed: when the pause it lapsed in began ('test' for `/tokens alerts test lapsed`). */
  lapsed: number | 'test' | null
  /** What the context holds says there is something to do: its tone. */
  context: string | null
  /** Quiet hours hold. */
  quiet: boolean
  /** The lines that say the mod cannot read a figure, or a hook of it failed. */
  trouble: readonly string[]
}

/** The usage card's news, or null where it has its figures alone. */
export function newsOf(p: NewsParts): string | null {
  const parts = [
    ...(p.crab === null ? [] : [`crab:${p.crab.kind}:${p.crab.at}`]),
    ...(p.lapsed === null ? [] : [`cache:gone:${p.lapsed}`]),
    ...(p.context === null ? [] : [`context:${p.context}`]),
    ...(p.quiet ? ['quiet'] : []),
    ...(p.trouble.length === 0 ? [] : [`trouble:${p.trouble.join('|')}`]),
  ]

  return parts.length === 0 ? null : parts.join(' ')
}
