import { expect, test } from 'claude-code/testing'

import { NO_PARTS, addStep, cellsOfSplit, heavyAdvice, splitOf, stoppedAdvice } from '../hooks/advice'
import { cacheRates } from '../hooks/cache'

// A heavy turn's notice: where the tokens went, why, and the choices that fit.

const step = (input: number, output: number, cacheRead: number, cacheWrite = 0) => ({ input, output, cacheRead, cacheWrite })
const none = { five: null, context: null, agentTypes: [] }
const keys = (advice: { choices: { key: string }[] }) => advice.choices.map(({ key }) => key)

test("a turn's tokens split by where they went, a subagent's apart", () => {
  const parts = addStep(addStep(NO_PARTS, step(1000, 500, 8000, 500), false), step(2000, 0, 0), true)

  expect(parts).toEqual({ reread: 8000, anew: 1500, output: 500, agents: 2000 })
  expect(splitOf(parts).map(({ name, share }) => [name, Math.round(share * 100)])).toEqual([
    ['context re-read', 67],
    ['subagents', 17],
    ['read anew', 13],
    ['output', 4],
  ])
  expect(cellsOfSplit(splitOf(parts), 20).reduce((sum, { text }) => sum + text.length, 0)).toBe(20)
})

test('the choices fit the situation, the gravest reason first, the best choice first', () => {
  const plain = addStep(NO_PARTS, step(100, 100, 9000), false)

  expect(keys(heavyAdvice(plain, { ...none, five: 91 }))).toEqual(['stop', 'keep'])
  expect(heavyAdvice(plain, { ...none, five: 91 }).reason).toBe('5-hour window is at 91%: this turn alone could reach the limit.')

  const helped = addStep(plain, step(20000, 0, 0), true)

  expect(keys(heavyAdvice(helped, { ...none, agentTypes: ['Explore', 'Explore', 'Plan'] }))).toEqual(['keep', 'agents', 'stop'])
  expect(heavyAdvice(helped, { ...none, agentTypes: ['Explore', 'Explore', 'Plan'] }).reason).toBe('Subagents took 68% of it: Explore, Plan.')
  expect(keys(heavyAdvice(plain, { ...none, context: 84 }))).toEqual(['compactAfter', 'stop', 'keep'])

  const lapsed = addStep(NO_PARTS, step(9000, 100, 1000), false)

  // The lapse is paid already: no stop, but a compaction for the next one.
  expect(keys(heavyAdvice(lapsed, none))).toEqual(['keep', 'compactAfter', 'raise'])
  expect(heavyAdvice(lapsed, none).reason).toMatch(/^The cache had lapsed: 89% of it was read anew, and that is paid already: stopping won't get it back\./)
  expect(keys(heavyAdvice(plain, none))).toEqual(['keep', 'stop', 'raise'])
  expect(heavyAdvice(plain, none).reason).toBe('Most of it is context re-read: 98%.')
})

test("after a lapse, Keep going says the cache's price at the model's own rate", () => {
  const lapsed = addStep(NO_PARTS, step(9000, 100, 1000), false)
  const keep = (read?: number) =>
    heavyAdvice(lapsed, read === undefined ? none : { ...none, read }).choices.find(({ key }) => key === 'keep')?.hint

  expect(keep()).toContain('read from the cache again, at a tenth of the price.')
  expect(keep(cacheRates('claude-sonnet-5-5', null).read)).toContain('at a twentieth of the price.')
  expect(keep(cacheRates('claude-opus-5-5', null).read)).toContain('at a twentieth of the price.')
  expect(keep(cacheRates('claude-fable-5-1', null).read)).toContain('at a fortieth of the price.')
  expect(keep(cacheRates('claude-haiku-5-5', null).read)).toContain('at a tenth of the price.')
})

test('after a stop, a full context is compacted first, a light one started fresh', () => {
  expect(stoppedAdvice(72, '1.2M')).toMatchObject({ title: 'Stopped after 1.2M tokens. What next?', choices: [{ key: 'compact' }, { key: 'fresh' }, { key: 'continue' }] })
  expect(stoppedAdvice(20, '')).toMatchObject({ title: 'Stopped. What next?', choices: [{ key: 'fresh' }, { key: 'continue' }, { key: 'compact' }] })
})
