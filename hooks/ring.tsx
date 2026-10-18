import type { ClientModule } from 'claude-code'

import type { RingProps } from '../types'

type Local = { phase: number; ref: { stop?: () => void } }

const TICK_MS = 120
const FRAMES = ['◴', '◷', '◶', '◵']

const Ring: ClientModule<RingProps, Local> = (props, surface) => {
  const { Text } = surface.elements
  let state = surface.state

  if (state === undefined) {
    state = { phase: 0, ref: {} }
    surface.setState(state)
  }

  // The clock runs only while a turn does: at rest nothing redraws.
  if (props.isWorking && state.ref.stop === undefined) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const current = surface.state

      if (current !== undefined) {
        surface.setState({ ...current, phase: current.phase + 1 })
      }
    })
  } else if (!props.isWorking && state.ref.stop !== undefined) {
    state.ref.stop()
    state.ref.stop = undefined
  }

  return (
    <Text color={props.color}>
      {props.isWorking ? FRAMES[state.phase % FRAMES.length] : props.glyph}
    </Text>
  )
}

export default Ring
