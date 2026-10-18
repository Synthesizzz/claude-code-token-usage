import type { On, SessionContextBreakdown } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { appOf, contextLine, contextNews, glyphOf, kindsOf, keepSetUp, mixOf, serverColor, servers, setUpOf, shortPath, trendLine } from '../hooks/context'
import { TYPED } from './kit'

// What fills the context, as /context breaks it down: the grid, the rows, and
// the MCP servers, memory files and skills beneath it.

const CATEGORIES = [
  { name: 'System prompt', tokens: 3100, color: 'promptBorder', isDeferred: false, kind: 'used' },
  { name: 'System tools', tokens: 14200, color: 'inactive', isDeferred: false, kind: 'used' },
  { name: 'MCP tools', tokens: 9800, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
  { name: 'MCP tools (deferred)', tokens: 61400, color: 'inactive', isDeferred: true, kind: 'deferred' },
  { name: 'Memory files', tokens: 1900, color: 'claude', isDeferred: false, kind: 'used' },
  { name: 'Messages', tokens: 110300, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
  { name: 'Free space', tokens: 27700, color: 'promptBorder', isDeferred: false, kind: 'free' },
  { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
] as const
const TOOLS = [
  { name: 'mcp__figma__get_design_context', serverName: 'claude.ai Figma', tokens: 2100, isLoaded: true },
  { name: 'mcp__figma__use_figma', serverName: 'claude.ai Figma', tokens: 2000, isLoaded: true },
  { name: 'mcp__figma__export_video', serverName: 'claude.ai Figma', tokens: 900, isLoaded: false },
  { name: 'mcp__supabase__execute_sql', serverName: 'supabase', tokens: 1200, isLoaded: true },
  { name: 'mcp__x__y', serverName: 'my-own-server', tokens: 300, isLoaded: false },
]

test('the rows used come most first; the buffer, the free space and what is deferred stand apart', () => {
  const kinds = kindsOf(CATEGORIES)

  expect(kinds.used.map(({ name }) => name)).toEqual(['Messages', 'System tools', 'MCP tools', 'System prompt', 'Memory files'])
  expect(kinds.free).toBe(27700)
  expect(kinds.buffer).toBe(33000)
  expect(kinds.deferred).toBe(61400)
})

test('the line for /tokens names the three that take the most', () => {
  expect(contextLine(CATEGORIES)).toBe('Messages 110k · System tools 14.2k · MCP tools 9.8k')
  expect(contextLine([])).toBeNull()
})

test("a square of the grid is drawn by its row's kind and how full it is", () => {
  const kinds = new Map([['Messages', 'used'], ['Free space', 'free'], ['Autocompact buffer', 'buffer']] as const)

  expect(glyphOf({ categoryName: 'Messages', squareFullness: 1, isFilled: true }, kinds)).toBe('■')
  expect(glyphOf({ categoryName: 'Messages', squareFullness: 0.4, isFilled: true }, kinds)).toBe('▪')
  expect(glyphOf({ categoryName: 'Free space', squareFullness: 0, isFilled: false }, kinds)).toBe('□')
  expect(glyphOf({ categoryName: 'Autocompact buffer', squareFullness: 1, isFilled: true }, kinds)).toBe('▨')
})

test("the MCP tools are summed by server, what is loaded apart from what is deferred, the most first", () => {
  expect(servers(TOOLS)).toEqual([
    {
      server: 'claude.ai Figma',
      tokens: 4100,
      loaded: 2,
      total: 3,
      deferred: 900,
      tools: ['mcp__figma__get_design_context', 'mcp__figma__use_figma', 'mcp__figma__export_video'],
    },
    { server: 'supabase', tokens: 1200, loaded: 1, total: 1, deferred: 0, tools: ['mcp__supabase__execute_sql'] },
    { server: 'my-own-server', tokens: 0, loaded: 0, total: 1, deferred: 300, tools: ['mcp__x__y'] },
  ])
})

test("a server takes its app's colour where the mod knows the app, and a colour of its own where not", () => {
  expect(serverColor('claude.ai Figma')).toBe('#a259ff')
  expect(serverColor('supabase')).toBe('#3ecf8e')
  expect(serverColor('Linear')).toBe('#5e6ad2')
  // A brand in black and white takes the page's own ink.
  expect(serverColor('vercel')).toBeNull()
  // The same unknown name always takes the same colour.
  expect(serverColor('my-own-server')).toBe(serverColor('my-own-server'))
  expect(serverColor('my-own-server')).toMatch(/^#[0-9a-f]{6}$/)
})

// A connector from claude.ai can come under an id in place of a name: the
// app is then read from what its tools are called.
const ID = 'a1000001-0000-4000-8000-000000000001'
const toolsOf = (id: string, names: string[]) => names.map(name => `mcp__${id.replaceAll('-', '_')}__${name}`)

test('a server under an id is named by the app its tools are for', () => {
  expect(appOf(ID, toolsOf(ID, ['create_deployment', 'list_deployments', 'get_project', 'list_projects']))).toEqual({
    name: 'Vercel',
    color: null,
  })
  expect(appOf('a1000002-0000-4000-8000-000000000002', toolsOf('a1000002', ['notion-search', 'notion-fetch']))).toEqual({
    name: 'Notion',
    color: null,
  })
  expect(appOf('a1000003-0000-4000-8000-000000000003', toolsOf('a1000003', ['create-design', 'export-design', 'list-brand-kits'])).name).toBe('Canva')
  expect(appOf('a1000004-0000-4000-8000-000000000004', toolsOf('a1000004', ['use_figma', 'get_figjam', 'get_screenshot']))).toEqual({
    name: 'Figma',
    color: '#a259ff',
  })
  expect(appOf('a1000005-0000-4000-8000-000000000005', toolsOf('a1000005', ['create_draft', 'search_threads', 'list_labels'])).name).toBe('Gmail')
  expect(appOf('a1000006-0000-4000-8000-000000000006', toolsOf('a1000006', ['create_event', 'list_calendars'])).name).toBe('Google Calendar')
  expect(appOf('a1000007-0000-4000-8000-000000000007', toolsOf('a1000007', ['download_file_content', 'get_file_permissions'])).name).toBe('Google Drive')
  expect(appOf('a1000008-0000-4000-8000-000000000008', toolsOf('a1000008', ['execute_sql', 'apply_migration'])).name).toBe('Supabase')
})

test('whole lists of tools, as the connectors ship them, point to their apps, words shared across apps and all', () => {
  const figma = ['add_code_connect_map', 'create_generative_plugin', 'create_new_file', 'create_shader', 'download_assets', 'export_video', 'generate_diagram', 'generate_image', 'get_code_connect_map', 'get_design_context', 'get_figjam', 'get_figma_skill', 'get_metadata', 'get_screenshot', 'search_design_system', 'send_code_to_figma', 'upload_assets', 'use_figma', 'whoami']
  const vercel = ['list_deployments', 'get_deployment', 'create_deployment', 'list_deployment_events', 'count_events', 'aggregate_events', 'list_user_events', 'get_toolbar_thread', 'list_toolbar_threads', 'reply_to_toolbar_thread', 'get_edge_config', 'get_edge_configs', 'get_vercel_ci_invocation', 'search_vercel_documentation', 'import-claude-design-from-url', 'list_projects']
  const canva = ['autofill-design', 'comment-on-design', 'create-brand-template-draft', 'create-design', 'export-design', 'list-brand-kits', 'help']

  expect(appOf('a1000004-0000-4000-8000-000000000004', toolsOf('a1000004', figma)).name).toBe('Figma')
  expect(appOf(ID, toolsOf(ID, vercel)).name).toBe('Vercel')
  expect(appOf('a1000003-0000-4000-8000-000000000003', toolsOf('a1000003', canva)).name).toBe('Canva')
})

test('a server named in words keeps its name, the claude.ai before it dropped; an id it cannot place is said short', () => {
  expect(appOf('claude.ai Figma', ['mcp__claude_ai_Figma__whoami'])).toEqual({ name: 'Figma', color: '#a259ff' })
  expect(appOf('my-own-server', ['mcp__my_own_server__ping']).name).toBe('my-own-server')
  expect(appOf(ID, toolsOf(ID, ['ping', 'pong']))).toEqual({ name: 'connector a1000001', color: serverColor(ID) })
})

// The set-up: what the context holds before any message. Kept a day at a
// time, so the pane can say how it has grown.

test('the set-up is every row used but the messages', () => {
  expect(setUpOf(CATEGORIES)).toEqual({ 'System prompt': 3100, 'System tools': 14200, 'MCP tools': 9800, 'Memory files': 1900 })
})

test('the set-up is kept a day at a time, the latest of the day, thirty days', () => {
  const kept = keepSetUp(keepSetUp({}, '2026-10-01', { a: 1 }), '2026-10-01', { a: 2 })

  expect(kept).toEqual({ '2026-10-01': { a: 2 } })
  expect(Object.keys(keepSetUp(kept, '2026-11-15', { a: 3 }))).toEqual(['2026-11-15'])
})

test('the trend says how the set-up has grown since the earliest day of the week, and by what most', () => {
  const history = {
    '2026-10-09': { 'System tools': 14200, 'MCP tools': 6600, 'Memory files': 1900 },
    '2026-10-12': { 'System tools': 14200, 'MCP tools': 8000, 'Memory files': 1900 },
    '2026-10-16': { 'System tools': 14200, 'MCP tools': 9800, 'Memory files': 2300 },
  }

  expect(trendLine(history, '2026-10-16')).toBe('Set-up 26.3k · was 22.7k on 10-09 (+3.6k: MCP tools +3.2k)')
  // A day that fell says so, with what fell most.
  expect(trendLine({ ...history, '2026-10-16': { 'System tools': 14200, 'MCP tools': 1000, 'Memory files': 1900 } }, '2026-10-16')).toBe(
    'Set-up 17.1k · was 22.7k on 10-09 (−5.6k: MCP tools −5.6k)',
  )
  // Nothing to compare with, or no change: the set-up alone.
  expect(trendLine({ '2026-10-16': history['2026-10-16'] }, '2026-10-16')).toBe('Set-up 26.3k')
  expect(trendLine({ '2026-10-15': history['2026-10-16'], '2026-10-16': history['2026-10-16'] }, '2026-10-16')).toBe('Set-up 26.3k · as on 10-15')
  // A day over a week old is not the week's.
  expect(trendLine({ '2026-10-01': { a: 1 }, '2026-10-16': { a: 2 } }, '2026-10-16')).toBe('Set-up 2')
  expect(trendLine({}, '2026-10-16')).toBeNull()
})

test('a path is said from the home folder, and cut to its last parts when long', () => {
  expect(shortPath('C:\\Users\\me\\.claude\\CLAUDE.md', 'C:\\Users\\me')).toBe('~/.claude/CLAUDE.md')
  expect(shortPath('/home/me/work/a/b/c/d/AGENTS.md', '/home/me')).toBe('~/…/c/d/AGENTS.md')
  expect(shortPath('/etc/claude/CLAUDE.md', '/home/me')).toBe('/etc/claude/CLAUDE.md')
})

// The pane.

const SITE = { scroll: { offset: 0, bodyRows: 40 }, view: {} }
const PANE = (requestId: string, bodyColumns = 44) =>
  ({
    component: 'Pane',
    requestId,
    props: { title: 'Token usage', isFocused: false, bodyColumns, placement: 'dock', ...SITE },
  }) as const
const square = (categoryName: string, color: string, squareFullness = 1) => ({
  color,
  isFilled: squareFullness > 0,
  categoryName,
  tokens: 0,
  percentage: 0,
  squareFullness,
})
const GRID = Array.from({ length: 10 }, (_, row) =>
  Array.from({ length: 10 }, (_, column) => {
    const at = row * 10 + column

    return at < 55
      ? square('Messages', 'purple_FOR_SUBAGENTS_ONLY')
      : at < 63
        ? square('System tools', 'inactive')
        : at < 84
          ? square('Free space', 'promptBorder', 0)
          : square('Autocompact buffer', 'inactive')
  }),
)
const BREAKDOWN: SessionContextBreakdown = {
  categories: [...CATEGORIES],
  totalTokens: 139300,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  autocompactSource: 'auto',
  percentage: 70,
  gridRows: GRID,
  model: 'claude-opus-5-5',
  memoryFiles: [
    { path: 'C:\\Users\\me\\.claude\\CLAUDE.md', type: 'User', tokens: 620 },
    { path: 'C:\\Users\\me\\AGENTS.md', type: 'Project', tokens: 410 },
  ],
  mcpTools: [...TOOLS],
  agents: [{ agentType: 'Explore', source: 'built-in', tokens: 300 }],
  skills: { totalSkills: 112, includedSkills: 98, tokens: 6300, skillFrontmatter: [{ name: 'release-notes', source: 'plugin', tokens: 410 }] },
  isAutoCompactEnabled: true,
  apiUsage: null,
}
const world = (on: On) => {
  const asked: unknown[] = []
  const opened: string[] = []

  mock.clock(on)
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, (beneath, e) => beneath.ui.resolve(e).Text({ children: '' }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('session.usage', (_, e) => {
    asked.push(e.breakdown)

    return {
      value: {
        startedAt: 0,
        context: {
          window: 200000,
          tokens: 139300,
          percent: 70,
          ...(e.breakdown === undefined ? {} : { breakdown: { ...BREAKDOWN, percentage: e.breakdown === 'full' ? 71 : 70 } }),
        },
        rateLimits: [],
      },
    }
  })

  return { asked, opened }
}
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const texts = async (ui: { findAll: (query: { type: 'Text' }) => Promise<readonly { text: string; props: Record<string, unknown> }[]> }) =>
  await ui.findAll({ type: 'Text' })

test('/tokens context opens a pane of what fills the context, counted the free way', async ($, on) => {
  const { asked, opened } = world(on)
  const said = await $.command.run({ ...TYPED, command: 'tokens', args: 'context' })

  expect(JSON.stringify(said)).toContain('context pane opened')
  expect(opened).toEqual(['tokens-context'])
  expect(asked).toEqual(['summary'])

  for (const surface of ['desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({ plugin: 'token-usage', surface, ...PANE('tokens-context') })
    const shown = await texts(pane)
    const words = shown.map(({ text }) => text)

    expect(words).toContain('Context')
    expect(words).toContain('139k / 200k')
    // The grid in the app's own colours, square by square.
    const squares = shown.filter(({ text }) => text === '■')

    // 63 squares of the grid, and one beside each of the five rows used.
    expect(squares.length).toBe(63 + 5)
    expect(squares[0]?.props.color).toBe('purple_FOR_SUBAGENTS_ONLY')
    expect(words.filter(text => text === '▨')).toHaveLength(16)
    // The servers by name, each in its app's colour.
    const figma = shown.find(({ text }) => text === 'Figma')

    expect(figma?.props.color).toBe('#a259ff')
    expect(figma?.props.weight).toBe('semibold')
    expect(words).toContain('~/.claude/CLAUDE.md')
    expect(words).toContain('2/3 tools')
    // Only the servers with tools in the window are listed; the rest are
    // said in one line, with what waits outside the window.
    expect(words).not.toContain('my-own-server')
    expect(words).toContain('+ 1 server not loaded · 61.4k deferred, outside the window')
    expect(words.filter(text => text.includes('deferred'))).toHaveLength(1)
    expect(words.some(text => text.includes('98 of 112 listed'))).toBe(true)
    expect(words).toContain('estimated')
    // The set-up of today, kept for the trend.
    expect(words).toContain('Set-up 29.0k')
    await pane.unmount()
  }
})

test('the pane counts exactly on a press, with the token-count API', async ($, on) => {
  const { asked } = world(on)

  await $.command.run({ ...TYPED, command: 'tokens', args: 'context' })

  const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE('tokens-context') })
  expect(await pane.find({ type: 'Button', text: 'Count exactly' })).toBeDefined()
  await pane.press({ key: 'context-full' })
  expect(asked).toEqual(['summary', 'full'])
  expect((await texts(pane)).map(({ text }) => text)).toContain('counted exactly')
})

test('once a pane has asked, what fills the context is counted again whenever it moves, the free way', async ($, on) => {
  const { asked } = world(on)
  const moved = { context: { window: 200000, tokens: 139300, percent: 70 }, rateLimits: [], changed: ['context' as const] }

  on('session.compact', () => ({ messages: [{ role: 'user', text: 'The summary.', toolUses: [] }], tokensAfter: 24000 }))
  // With the band's bar off and no pane asked yet, nothing is counted.
  await $.command.run({ ...TYPED, command: 'tokens', args: 'breakdown off' })
  await $.session.measure(moved)
  expect(asked).toEqual([])
  await $.command.run({ ...TYPED, command: 'tokens', args: 'context' })
  await $.session.measure(moved)
  // A window that moved alone leaves the context as it was counted.
  await $.session.measure({ ...moved, changed: ['rateLimits'] })
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'A long talk.', toolUses: [] }] })
  expect(asked).toEqual(['summary', 'summary', 'summary'])
})

test('the band counts what fills the context from the first turn, and draws it as a bar of the rows used', async ($, on) => {
  const { asked } = world(on)

  await $.session.measure({ context: { window: 200000, tokens: 139300, percent: 70 }, rateLimits: [], changed: ['context'] })
  expect(asked).toEqual(['summary'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'token-usage', surface, ...BAND })
    const cells = (await texts(band)).filter(({ text }) => /^[▆▬]+$/.test(text))
    const glyph = surface === 'terminal' ? '▆' : '▬'

    // The rows used by their share of what is used, each in its own colour.
    expect(cells.map(({ text }) => text.length).reduce((sum, count) => sum + count, 0)).toBe(surface === 'terminal' ? 10 : 8)
    expect(cells.every(({ text }) => text[0] === glyph)).toBe(true)
    expect(cells[0]?.props.color).toBe('purple_FOR_SUBAGENTS_ONLY')
    await band.unmount()
  }
})

test('the bar gives each row used its share of the cells, and the cells always add up', () => {
  expect(mixOf(CATEGORIES, 10)).toEqual([
    { name: 'Messages', color: 'purple_FOR_SUBAGENTS_ONLY', count: 8 },
    { name: 'System tools', color: 'inactive', count: 1 },
    { name: 'MCP tools', color: 'cyan_FOR_SUBAGENTS_ONLY', count: 1 },
  ])
  expect(mixOf(CATEGORIES, 8).reduce((sum, { count }) => sum + count, 0)).toBe(8)
  expect(mixOf([], 10)).toEqual([])
})

test('the band speaks of what fills the context only where there is something to do', () => {
  // A crowded context: how much the messages hold, beside Compact.
  expect(contextNews(CATEGORIES, 200000, true)).toEqual({ text: 'messages 110k', tone: 'error' })
  // A set-up of 29.0k is under a quarter of the 167k room: nothing.
  expect(contextNews(CATEGORIES, 200000, false)).toBeNull()
  // Past it, the set-up and what is biggest in it.
  expect(contextNews(CATEGORIES, 140000, false)).toEqual({ text: 'set-up 29.0k · System tools 14.2k', tone: 'warning' })
})

test('the word of a crowded context opens the pane of what fills it', async ($, on) => {
  const { opened } = world(on)

  await $.session.measure({ context: { window: 200000, tokens: 170000, percent: 85 }, rateLimits: [], changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'token-usage', surface, ...BAND })

    expect(await band.find({ type: 'Text', text: 'messages 110k' })).toBeDefined()
    await band.press({ key: 'context-news' })
    await band.unmount()
  }

  expect(opened).toEqual(['tokens-context', 'tokens-context'])
})

test('the bar and the word go with the breakdown part', async ($, on) => {
  world(on)

  await $.session.measure({ context: { window: 200000, tokens: 139300, percent: 70 }, rateLimits: [], changed: ['context'] })
  await $.command.run({ ...TYPED, command: 'tokens', args: 'breakdown off' })

  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND })

  expect((await texts(band)).filter(({ text }) => /^▆+$/.test(text))).toEqual([])
  expect(await band.find({ type: 'Button', key: 'context-news' })).toBeUndefined()
})

test('/tokens says in a line what takes the most, with a way to the details', async ($, on) => {
  const { opened } = world(on)

  await $.session.measure({ context: { window: 200000, tokens: 139300, percent: 70 }, rateLimits: [], changed: ['context'] })
  await $.command.run({ ...TYPED, command: 'tokens', args: '' })

  const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...PANE('tokens') })

  expect((await texts(pane)).map(({ text }) => text)).toContain('Messages 110k · System tools 14.2k · MCP tools 9.8k')

  expect(await pane.find({ type: 'Button', text: 'Details' })).toBeDefined()
  await pane.press({ key: 'context-details' })
  expect(opened).toEqual(['tokens', 'tokens-context'])
})
