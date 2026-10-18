import { mock, test } from 'claude-code/testing'

// Prints the trees the desktop band draws at every width, for sim.mjs to lay
// out. Not part of the suite: copy to tests/zz-dump.test.ts to run it, then
//   claude plugin test . > dump.txt
//   node tools/responsive/sim.mjs dump.txt preview/responsive-check.html 9.3 16
// and remove the copy. SCENE=calm keeps one scene, which keeps the page small.
const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SITE = { scroll: { offset: 0, bodyRows: 10 }, view: {} }
const reading = (fiveHour: number, sevenDay: number, context: number, usd: number) => ({
  context: { window: 200000, tokens: context * 2000, percent: context },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(NOW + 4 * HOUR + 20 * MINUTE).toISOString() },
    { kind: 'seven_day', percentUsed: sevenDay, resetsAt: new Date(NOW + 32 * HOUR).toISOString() },
  ],
  cost: { usd },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})

for (const scene of ['calm', 'near', 'calm thai', 'calm caps', 'near long'] as const) {
  test(`dump ${scene}`, { timeoutMs: 60000 }, async ($, on) => {
    const kept = new Map<string, unknown>()
    const clock = mock.clock(on, { now: NOW })

    on('store.get', (_, e) => ({ value: kept.get(e.key) }))
    on('store.set', (_, e) => {
      kept.set(e.key, e.value)

      return { value: undefined }
    })
    on('ui.toast', () => ({ value: undefined }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => {
      const { Text } = beneath.ui.resolve(e)

      return Text({ children: '' })
    })

    if (scene.startsWith('calm')) {
      await $.session.measure(reading(2, 27, 51, 20.08))
    } else {
      await $.session.measure(reading(71, 64, 78, 20.08))
      await clock.advance(10 * MINUTE)
      await $.session.measure(reading(88, 64, 78, 20.08))
    }

    const labels = scene.split(' ')[1] ?? 'auto'

    await $.command.run({ command: 'tokens', args: `labels ${labels}` })

    for (const layout of ['rings', 'bars', 'compact', 'frames', 'stack']) {
      await $.command.run({ command: 'tokens', args: `layout ${layout}` })

      for (let columns = 110; columns >= 6; columns -= 2) {
        const ui = await $.ui.mount({
          plugin: 'token-usage',
          surface: 'desktop',
          component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: columns, ...SITE },
        })
        const [root] = await ui.findAll({ type: 'Box' })

        console.log(`TREE ${JSON.stringify({ scene, layout, columns, root })}`)
        await ui.unmount()
      }
    }
  })
}
