// The usage card's fold (Decisions 2026-11-14, "ย่อการ์ดใน band ที่บังจอ" and
// "รายละเอียดการพับการ์ดใน band"): the rule and the card's news. What the
// desktop band draws folded and open is in cache.test.ts, beside its world.
import { expect, test } from 'claude-code/testing'

import { foldedOf, newsOf, pressed } from '../hooks/fold'

const NONE = { crab: null, lapsed: null, context: null, quiet: false, trouble: [] } as const

test('the rule: no press, a card with no news folds and one with news opens; a press holds for its news alone', () => {
  expect(foldedOf(null, null)).toBe(true)
  expect(foldedOf('quiet', null)).toBe(false)
  expect(foldedOf('quiet', pressed('quiet', false))).toBe(true)
  expect(foldedOf(null, pressed(null, true))).toBe(false)
  expect(foldedOf('cache:gone:5', pressed('quiet', false))).toBe(false)
  expect(foldedOf(null, pressed('quiet', false))).toBe(true)
})

test('the news: none for the figures alone; each kind named with when it came, never a moving figure', () => {
  expect(newsOf(NONE)).toBeNull()
  expect(newsOf({ ...NONE, crab: { kind: 'cache', at: 100 } })).toBe('crab:cache:100')
  // The same kind raised again is new news: it opens a card folded on the first.
  expect(newsOf({ ...NONE, crab: { kind: 'cache', at: 200 } })).not.toBe(newsOf({ ...NONE, crab: { kind: 'cache', at: 100 } }))
  expect(newsOf({ ...NONE, lapsed: 5 })).toBe('cache:gone:5')
  expect(newsOf({ ...NONE, lapsed: 'test' })).toBe('cache:gone:test')
  expect(newsOf({ ...NONE, context: 'warning' })).toBe('context:warning')
  expect(newsOf({ ...NONE, quiet: true })).toBe('quiet')
  expect(newsOf({ ...NONE, trouble: ['a', 'b'] })).toBe('trouble:a|b')
  expect(newsOf({ ...NONE, quiet: true, lapsed: 5 })).toBe('cache:gone:5 quiet')
})
