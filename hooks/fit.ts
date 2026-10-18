import type { Layout } from '../types'

// What of the desktop band fits the width it is given. A surface lays the
// row out in pixels and tells a hook only its width in cells, so the row is
// sized here by estimate: figures by their pixels, text by its length.

// The cell is the advance of the desktop's code font. Read off the app at its
// default size, where a gap of one cell came to about 9.3 CSS pixels.
const CELL_PX = 9.3
// Text is set in a proportional face, so a character is not a cell. These
// are advances in pixels at the app's default text size, by kind of
// character, read off the app. The narrowest rows are all figures and a
// percent sign, so one average per character sizes them too small.
const NARROW_PX = 4.5
const WIDE_PX = 13.5
const FIGURE_PX = 8.8
const CAPITAL_PX = 10.5
const DASH_PX = 5.5
const LETTER_PX = 8.2
const NARROW = new Set("iljtfr.,:;'!| ")
const WIDE = new Set('mwMW%↗')
// Bold runs this much wider than plain; the margin covers a face a little
// wider than the one measured.
const BOLD = 1.07
const MARGIN = 1.05
const GAP = 1
const GROUP_GAP = 2
// The figures' sizes in pixels: the band draws them at these, so the fit
// sizes by the same.
export const RING_PX = 22
export const PACE_PX = 34
export const BAR_PX = 80
export const WIDE_BAR_PX = 160
export const DOT_PX = 8
// A frame's border and padding, both sides; the stack's column of names; a
// button's padding, both sides.
const FRAME = 4
const NAMES = 7
const BUTTON = 3

export type Wish = {
  layout: Layout
  // null while the context is switched off. `figure` is the width in pixels
  // of what is drawn for it, where that is not the ring.
  context: { used: string; word: string; figure?: number } | null
  // `brief` is the name the tight layout draws when the wished one is too wide.
  windows: readonly { name: string; brief: string; used: string; clock: string | null }[]
  usedWord: string
  leftWord: string
  eta: string | null
  cost: string | null
  // The width in pixels of a figure drawn before the cost, where there is one.
  costFigure?: number
  // A button drawn after the context, or none. It is never given up.
  action: string | null
  // A word drawn last, after a figure this wide in pixels; it goes with the
  // cost.
  note?: { text: string; figure: number }
}

export type Fitted = {
  layout: Layout
  hasContextWord: boolean
  // The words beside the figures: a window's name where its figure tells it
  // apart already, "left", "used".
  hasWords: boolean
  hasClock: boolean
  windows: number
  hasEta: boolean
  hasCost: boolean
}

const figure = (px: number) => px / CELL_PX
const advance = (character: string) => {
  if (NARROW.has(character)) {
    return NARROW_PX
  }

  if (WIDE.has(character)) {
    return WIDE_PX
  }

  if ((character >= '0' && character <= '9') || character === '$') {
    return FIGURE_PX
  }

  if (character === '-') {
    return DASH_PX
  }

  return character >= 'A' && character <= 'Z' ? CAPITAL_PX : LETTER_PX
}
const plain = (shown: string) =>
  ([...shown].reduce((sum, character) => sum + advance(character), 0) * MARGIN) / CELL_PX
const bold = (shown: string) => plain(shown) * BOLD
// Parts side by side in one group, a gap between each two.
const row = (parts: readonly number[]) =>
  parts.reduce((sum, part) => sum + part, 0) + GAP * Math.max(0, parts.length - 1)

const windowWidth = (
  wish: Wish,
  fitted: Fitted,
  window: Wish['windows'][number],
) => {
  const name = fitted.layout === wish.layout ? window.name : window.brief
  const clock = fitted.hasClock ? window.clock : null
  const named = fitted.hasWords ? [plain(name)] : []
  const used = bold(window.used)
  // The countdown is bold everywhere but in the tight layout.
  const timed = clock === null ? [] : [fitted.layout === 'compact' ? plain(clock) : bold(clock)]
  const left = clock !== null && fitted.hasWords ? [plain(wish.leftWord)] : []

  switch (fitted.layout) {
    case 'rings':
      return row([
        figure(PACE_PX),
        Math.max(
          row([...timed, ...left]),
          plain(
            fitted.hasWords
              ? `${name}, ${window.used} ${wish.usedWord}`
              : `${name} ${window.used}`,
          ),
        ),
      ])
    case 'bars':
      return row([...named, used, figure(BAR_PX), ...timed])
    case 'compact':
      return row([...named, figure(DOT_PX), used, ...timed])
    case 'frames':
      return (
        FRAME +
        row([figure(RING_PX), plain(name), used, ...left, ...timed])
      )
    case 'stack':
      return row([
        Math.max(NAMES, plain(name)),
        figure(WIDE_BAR_PX),
        used,
        ...timed,
        ...left,
      ])
  }
}

// The stack's bars in a room narrower than the band, as a pane draws its
// look: as wide as the room leaves beside the widest window's words, up to the
// band's own, down to a floor; under that floor "left" goes first.
const STACK_FLOOR_PX = 56

export const stackFor = (
  columns: number,
  windows: readonly { name: string; used: string; clock: string | null }[],
  leftWord: string,
) => {
  const words = (hasWords: boolean) =>
    Math.max(
      0,
      ...windows.map(({ name, used, clock }) =>
        row([Math.max(NAMES, plain(name)), bold(used), ...(clock === null ? [] : [bold(clock)]), ...(clock !== null && hasWords ? [plain(leftWord)] : [])]),
      ),
    )
  const barOf = (hasWords: boolean) => Math.floor((columns - words(hasWords) - GAP) * CELL_PX)
  const hasWords = barOf(true) >= STACK_FLOOR_PX

  return { bar: Math.max(STACK_FLOOR_PX, Math.min(WIDE_BAR_PX, barOf(hasWords))), hasWords }
}

// The width of the row in cells, as drawn.
export const widthOf = (wish: Wish, fitted: Fitted) => {
  const windows = wish.windows
    .slice(0, fitted.windows)
    .map(window => windowWidth(wish, fitted, window))
  const groups = [
    ...(wish.context === null
      ? []
      : [
          row([
            figure(wish.context.figure ?? RING_PX),
            bold(wish.context.used),
            ...(fitted.hasContextWord ? [plain(wish.context.word)] : []),
          ]),
        ]),
    ...(wish.action === null ? [] : [BUTTON + bold(wish.action)]),
    // The stack is one group, as wide as its widest row.
    ...(fitted.layout === 'stack' && windows.length > 0 ? [Math.max(...windows)] : windows),
    ...(fitted.hasEta && wish.eta !== null ? [plain(wish.eta)] : []),
    ...(fitted.hasCost && wish.cost !== null
      ? [
          row([
            ...(wish.costFigure === undefined ? [] : [figure(wish.costFigure)]),
            plain(wish.cost),
          ]),
        ]
      : []),
    ...(fitted.hasCost && wish.note !== undefined
      ? [row([figure(wish.note.figure), plain(wish.note.text)])]
      : []),
  ]

  return groups.reduce((sum, group) => sum + group, 0) + GROUP_GAP * Math.max(0, groups.length - 1)
}

// What a narrowing band gives up, in order. The countdown outlasts the
// layout: a layout too wide for it falls back to the tight one first. The
// context is never one of the steps.
const steps = (wish: Wish): Fitted[] => {
  const full: Fitted = {
    layout: wish.layout,
    hasContextWord: true,
    hasWords: true,
    hasClock: true,
    windows: wish.windows.length,
    hasEta: true,
    hasCost: true,
  }
  const lean: Fitted = { ...full, hasCost: false, hasEta: false, hasContextWord: false }
  const tight: Fitted = { ...lean, layout: 'compact' }
  const bare: Fitted = { ...tight, hasWords: false, hasClock: false }

  // The forecast is the one warning in the row: it outlasts the cost and the
  // word beside the context.
  return [
    full,
    { ...full, hasCost: false },
    { ...full, hasCost: false, hasContextWord: false },
    lean,
    { ...lean, hasWords: false },
    tight,
    { ...tight, hasWords: false },
    bare,
    ...wish.windows.map((_, index) => ({
      ...bare,
      windows: wish.windows.length - 1 - index,
    })),
  ]
}

export const fit = (wish: Wish, columns: number): Fitted => {
  const ladder = steps(wish)

  // The last step stands when nothing fits: there is nothing left to give up.
  return ladder.find(
    (step, index) => index === ladder.length - 1 || widthOf(wish, step) <= columns,
  ) as Fitted
}

// One line for `/tokens list`: the width the band was given and what it cost.
export const told = (wish: Wish, fitted: Fitted, columns: number) => {
  const gone = wish.windows.length - fitted.windows
  const hasClocks = wish.windows.some(window => window.clock !== null)
  const left = [
    wish.cost !== null && !fitted.hasCost ? 'cost' : null,
    wish.context !== null && !fitted.hasContextWord ? 'the context word' : null,
    wish.eta !== null && !fitted.hasEta ? 'forecast' : null,
    fitted.hasWords ? null : 'words',
    hasClocks && !fitted.hasClock ? 'countdowns' : null,
    gone > 0 ? `${gone} window${gone === 1 ? '' : 's'}` : null,
  ].filter(part => part !== null)
  const layout =
    fitted.layout === wish.layout
      ? fitted.layout
      : `${fitted.layout} (${wish.layout} is too wide)`

  return `Band: ${columns} columns wide, drawn as ${layout}${left.length === 0 ? ' in full' : ` without ${left.join(', ')}`}.`
}
