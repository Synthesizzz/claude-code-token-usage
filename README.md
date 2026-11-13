# token-usage

A mod for Claude Code that keeps your usage in view: a band above the prompt with the context fill, the 5-hour and weekly windows, a countdown to each reset, a burn-rate forecast and what the day has cost.

It is a plugin of function hooks. That API is early access and changes between Claude Code releases; this mod was written and tested against Claude Code 2.1.295 and 2.1.296 on Windows 11.

## Install

In a terminal session of Claude Code, at the prompt:

```
/plugin install token-usage --marketplace Synthesizzz/claude-code-token-usage
```

Answer `y` to add the marketplace, then pick a scope. Installed at the user scope, the mod also loads in sessions the desktop app starts.

## What it draws

| Where | What you see |
| --- | --- |
| Terminal | A row of the context by its size (`374k`), and the 5-hour and weekly figures with their percentages; countdowns, forecast and cost while there is room. Where the row has room left, each figure is a bar filled by eighths of a cell (10, 8 or 6 cells), and a window's bar lights the cell of the time gone, so a bar past it is spending faster than the clock; with no room, ring glyphs. With a second row to spare, what fills the context, the cache countdown and the word of what to do go beneath, where a narrow row still has them. The context glyph spins while a turn runs. |
| Desktop app | The same figures as vector drawings, in one of five layouts, fitted to the width of the window. Beside the context's size, what each step reads again: `374k context · 18.7k/step`. A small crab brings each alert in a row of its own, and lives where the context ring would be: at a laptop while a turn runs, standing by between turns, asleep after two minutes. |
| `/tokens` | A pane with a dial per figure, the reset and forecast for each window, the tokens of the last turn, and tokens counted: this session, the last turn, today, the last seven days as a chart, how much of the last turn's input was read from the cache, the last seven days by project, by model and by subagent, the month so far in dollars, and the heaviest turns of the day. |

The band is drawn on the terminal and the desktop app. VS Code and the mobile app do not draw a band; `/tokens` still opens its pane there.

The context is said by its weight, not its share of the window. Each step of a turn reads the whole context again from the cache, so 374k costs the same on a 1M window as on any other, and a share of 1M says little (374k is 37%, which read as calm). Its colour turns yellow from 200k and red from 400k, or at 60% and 85% of a window smaller than that, whichever comes first; `/tokens weight` sets the sizes, and `weight off` colours it by its share as before. The 5-hour and weekly windows keep their percentages and colours.

On the desktop `· 18.7k/step` is the context at the cache's read price of the model of the last response: tokens at the full input price, a twentieth of 374k on Opus 5.5 and Sonnet 5.5, a fortieth on Fable 5.1 and Mythos 5.1, a tenth on the others. It is not drawn until a response has named its model, and it is the first part to go when the band is narrow. The share of the window is in the ring's alt text and in the hint the pointer opens on the size (`Context 374k of 1.0M (37%)`). A terminal says the size alone, held at five cells. Before a size is known (the start of a session) the band says the share.

On the desktop the pane is a dashboard: the context and the windows as rings inside one another with their figures written large, the tips under them, this session, today and the last seven days as large counts above the week's chart, and the month so far in dollars under it (against its budget, where one is set), and where the week's tokens went as one bar by project, one by model and one by subagent. A terminal says the same in text, the rings in braille. The pictures' words take a dark ink on a light page and a light one on a dark page; each says what it shows in its alt text. The pictures take the pane's width; in a narrow pane the rings stand above their words and the counts go one under another.

## Commands

Seven words for every day:

| Type | Result |
| --- | --- |
| `/tokens` | Opens the usage pane |
| `/tokens style` | Opens a pane of buttons for most settings below. At its top the band is drawn in the look in force, from your own figures; the pointer resting on a layout or a palette shows the band in it, under the buttons, before you press. Palettes go by kind: colour, grey, colour-blind safe. Then the parts shown, the daily, weekly and monthly budgets (with an API key; a subscription bills no dollars, so its pane has none), alerts, the notification outside the app (popup, privacy, quiet hours), and export and old files |
| `/tokens agents` | Opens a pane of the subagents of the turn, a card each with a crab dressed for its job |
| `/tokens context` | Opens a pane of what fills the context, as `/context` breaks it down: the grid, its rows, the MCP servers, memory files, skills and agents |
| `/tokens next` | Says the band's next move and why, with the figures it weighed: the context, what a step reads, what a compaction pays back in, the cache and quiet hours (see [The next move](#the-next-move)) |
| `/tokens fleet` | Says every open session, a line each: working or its cache, its context, what waking it costs (see [The fleet](#the-fleet)) |
| `/tokens list` | Says what is chosen, how wide the band is, and what it left out |
| `/tokens help` | Lists every word: these eight, then the settings a line for each kind (look, parts, alerts, budgets, hand off, context, data), then the checks |

### Settings

Most have a button in `/tokens style` too; colour levels, the background, other projects' budgets and reset are typed.

| Type | Result |
| --- | --- |
| `/tokens classic` · `timeline` · `quiet` · `neon` · `split` | Switches to a preset |
| `/tokens layout rings\|bars\|compact\|frames\|stack` | Changes the desktop layout (the layout's name alone works too) |
| `/tokens palette classic\|ocean\|sunset\|mono\|forest\|berry\|ice\|ember\|mint\|safe\|okabe` | Changes the colours; every palette reads on a light theme as on a dark one, and `safe` and `okabe` are told apart with colour blindness |
| `/tokens color ok\|warn\|full #38bdf8` | Sets one level's colour |
| `/tokens labels auto\|short\|long\|caps\|thai` | Changes the words beside the figures |
| `/tokens show\|hide context\|countdown\|forecast\|cost\|alerts\|crab\|breakdown` | Shows or hides one part; `breakdown` is what fills the context in the band: the bar of its rows and the word of what to do |
| `/tokens alerts on\|off` | Switches alerts |
| `/tokens alerts both\|app\|windows` | Where an alert shows |
| `/tokens alerts 60 on\|off` | Also alert at 60% |
| `/tokens alerts popup on\|off` | Whether news outside the app comes in the crab's own window (on to start with) or as a plain Windows notification |
| `/tokens alerts privacy on\|off` | Whether a Windows notification keeps commands and questions out (on to start with) |
| `/tokens alerts quiet 22-8` · `alerts quiet off` | Sets hours when nothing goes out to Windows, or drops them |
| `/tokens budget 10` · `budget off` | Sets a budget in dollars a day, or drops it |
| `/tokens budget week 50` · `budget week off` | Sets a budget in dollars a week, Monday to Sunday, or drops it |
| `/tokens budget month 200` · `budget month off` | Sets a budget in dollars a calendar month, or drops it |
| `/tokens budget project here 5` · `budget project shop off` | Sets a budget in dollars a day for a project (`here` is the folder the session runs in), or drops it |
| `/tokens weight 200k 400k` · `weight off` | Sets the context sizes that turn it yellow and red (200k and 400k to start with; `250000 500000` and `1.5m 3m` work too, the first under the second), or colours it by its share of the window, at 60% and 85%. They also set when Compact and the context's alert come (at the second size) and when a heavy turn says to compact after (at the first). `weight` alone says what is set, `weight on` puts the sizes back |
| `/tokens handoff Hand off now` · `handoff off` | Sets the message Hand off and Park send as your own, and the message the crab's Start fresh sends in place of `/clear`. Off to start with: the band's move is then Compact where it would hand off or park (see [Hand off](#hand-off-instead-of-start-fresh)) |
| `/tokens export` | Writes the last 31 days of every session to `~/.claude/token-usage/export-<day>.csv` (a row a day: dollars, tokens) and `.json` (with tokens by project and by model) |
| `/tokens tidy` · `tidy now` | Says how many session files are over 31 days old and no longer read; `now` deletes them |
| `/tokens reset` | Back to the defaults |

The words from before 0.42.0 still work: `/tokens context off` (and `<part> on|off` for every part), `/tokens popup off`, `/tokens privacy off` and `/tokens quiet 22-8`. `/tokens quiet` alone is the preset.

### Checks

| Type | Result |
| --- | --- |
| `/tokens alerts test` · `alerts test week` | Raises a sample alert for the 5-hour or the weekly window, and says how it went |
| `/tokens alerts test cache` · `alerts test lapsed` | Brings the cache warning now, for the context as it is (its buttons stand two minutes), or shows the band of a lapsed cache for a minute; their buttons do what they say, and the pointer on them opens their hints |

A choice takes effect at once and is kept across sessions.

Layout, palette and labels apply to the desktop band. Showing or hiding a part applies on the terminal too.

## Alerts

Each is raised once per window:

- a window passes 85%, or reaches its limit
- a window will be full before it resets, at the pace of the last half hour
- a window that was near its limit resets
- the context passes 400k, or 80% of a window smaller than that, whichever comes first (the second size of `/tokens weight`; with the weight off, 80%); said by its size, `Context at 412k (41%)`. The band's next move is then Compact or Hand off (see [The next move](#the-next-move)). A context that falls back under it (a compaction) is news again the next time it passes
- a turn, while it runs, passes five times a usual turn (the median of the last twenty main turns, every session's, so a new session goes by the ones before it), and never under 300k tokens; with fewer than three turns to go by, at 500k. A subagent's tokens count toward the turn it runs in. Said once a turn, with why it is heavy, a bar of where its tokens went (the context re-read, read anew, output, subagents), and buttons for what fits, the best first, pressed with 1, 2, 3 even from an empty prompt: near the 5-hour limit, **Stop now**; subagents doing most of it, **Keep going** or **See agents**; a context past 200k, or 70% of its window (the first size of `/tokens weight`), **Compact after** (the turn finishes, then it compacts); a lapsed cache, **Keep going**, **Compact after** or **Warn at 2×** (twice as high for the session), and no stop: the lapse was paid at the turn's first step, so stopping gets none of it back. **Stop now** ends the turn at once, as Esc does, and asks what next: **Compact** where the context is half full or more, **Start fresh** (`/clear`, or **Hand off** where one is set) where it is light, or **Continue**, which sends "Continue where you stopped." as your own message.
- a window passes 60%, if you switch that on
- the day's cost passes 80% of your budget, or all of it, if you set one
- the week's cost, Monday to today, passes 80% of your weekly budget, or all of it, if you set one
- the month's cost, its first day to today, passes 80% of your monthly budget, or all of it, if you set one
- a project's cost today passes 80% of its own budget, or all of it, if you set one for it (each session counts what it spends under the folder it runs in)

### The crab

In the app an alert is brought by a crab, in a row above the band, with the alert's words beside it. It peeks up out of the ground, looks left and right, pops up and sways on its feet; it leaves after eight seconds, or when you press `OK`. Its pose is the news:

| Alert | Pose |
| --- | --- |
| past 60% | waves a claw |
| past 85% | wide eyes, a drop of sweat, a shiver |
| limit reached | behind bars, shaking them now and then |
| filling too fast | runs |
| window reset | both claws up, jumping |
| context past 400k, or 80% of its window | squeezed between two walls |
| budget nearly spent | wide eyes, a drop of sweat, a shiver |
| budget spent | behind bars |

While a turn runs, the crab sits at a laptop where the context ring was, and code types out on the screen; the size stays beside it. This widens the band by about three and a half columns for as long as the turn runs, so a narrow window may drop its last part meanwhile.

When the turn ends the crab stands by in the same place: it breathes, looks ahead, then up at the figures beside it, blinks between, and taps its feet now and then. A session begun, or begun anew with Start fresh (`/clear`), starts with it standing by too. While it is out bringing news, or in quiet hours, the ring is there instead.

Two minutes with nothing to do, after a turn or since the session began, the crab falls asleep in the same place, breathing, with z's rising (up to half a minute later: the band's clock moves at least each half minute). The percentage stays beside it, standing or asleep, and the band is a column wider than with the ring. News wakes it, a new turn puts it back at the laptop, and in quiet hours it keeps the nap it has by the words. A terminal shows `ᶻᶻ` in place of the ring glyph meanwhile; standing by, it keeps the glyph.

With the crab on, the desktop band no longer draws the context ring: the size and the bar of what fills the context say how full it is. `/tokens hide crab` brings the ring back.

A terminal draws the crab beside the alert when the band has forty columns to spare: with six rows, in half blocks, two pixels a cell, its body in the crab's colour and its eyes dark, four rows tall; with five, in block characters, three rows, in the colour of its news. It does not move there, and there is no laptop. Narrower than forty columns, or with fewer rows, the alert's words and buttons stand without the crab.

The crab is drawn on your machine by the mod: it adds nothing to the conversation and costs no tokens. `/tokens hide crab` sends it away; alerts then show as before.

### When the app is not in front

On Windows the mod also calls you back to Claude when it is minimised or behind another window, with a Windows notification that has the crab in it:

| News | Pose |
| --- | --- |
| a task is done (every turn's end) | beside a green tick sign |
| Claude asks you to choose | scratching its head under a question mark |
| Claude needs leave to use a tool | waiting at a barrier |
| ten minutes after a task, still unanswered | asleep |
| a usage alert, unless `/tokens alerts app` keeps alerts in the app | the alert's own pose |

It stays quiet while the window in front is the Claude desktop app or the program the session runs in, and the reminder ten minutes on looks again at that moment. `/tokens hide crab` or `/tokens alerts off` silences it too: the mod writes `~/.claude/token-usage/notify.json`, which the script reads.

- **Privacy**, on to start with: a request for leave names only its tool (`Bash`), and a question says only to open Claude. With `/tokens alerts privacy off` the command or the question is shown, but what looks like a secret (a Bearer token, a key such as `sk-…` or `ghp_…`, a `KEY=value`, a `--password=…`) is put out of sight as `•••` before the line is cut short.
- **The crab's own window**, on to start with: where Windows takes notifications, the news comes in a small card of the mod's own that bounces out of the bottom-right corner, with the crab bobbing in it and confetti, for six seconds. It never takes the focus or shows in the task switcher; a click on it brings Claude to the front. The same notification goes quietly to the notification centre (Win+N), so it is still there later. Where Windows holds notifications back (Do not disturb, a presentation, a full-screen app) it is a plain notification, and so is any card that cannot be drawn. `/tokens alerts popup off` keeps to plain notifications.
- **Quiet hours** (`/tokens alerts quiet 22-8`): nothing goes out to Windows from the first hour up to the last, across midnight too. Alerts still show in the app, and the band says `quiet until 08:00` beside the crab asleep.
- **Sounds of your own**: put a `.wav` for a kind of news in `~/.claude/token-usage/sounds/`, named `done.wav`, `ask.wav`, `allow.wav` or `wait.wav` (still waiting), or an alert's pose (`near.wav`, `jail.wav`, `pace.wav`, `back.wav`, `context.wav`). It plays in place of the Windows sound, only when the notification shows; a kind with no file keeps the Windows sound. A notification from PowerShell cannot play a file itself, so the script mutes it and plays the file. Only `.wav` plays.

To be called back only when Claude needs you, keep the four kinds about the work and leave usage in the app, where the band and the crab show it:

1. `/tokens alerts app`: usage alerts (context, limits, pace, resets, budget) stay in the app. Done, still waiting, a question and a request for leave still go to Windows: they come through the command hooks, not the alerts.
2. In the desktop app, Settings → Claude Code: set Task complete, Question and Permission request notifications to Off, so each piece of news comes once, with the crab.

It is made of command hooks in `hooks/hooks.json` that run `tools/notify/toast.ps1` with PowerShell (with `-ExecutionPolicy Bypass` for that one script), each in the background, so Claude never waits on them. The pictures are `assets/crab/*.png`, made by `node tools/crab-art/make.mjs`. For a try-out, `TOKEN_USAGE_NOTIFY_DRY=1` prints what the script would do, `TOKEN_USAGE_NOTIFY_FORCE=1` shows it even with the session in front (the ten-minute reminder a forced `stop` starts is forced too), `TOKEN_USAGE_NOTIFY_FILE` names a switch file in place of the mod's, `TOKEN_USAGE_NOTIFY_STATE` a folder for the log in place of the one below, `TOKEN_USAGE_NOTIFY_SOUNDS` a folder of sounds in place of yours, and `TOKEN_USAGE_NOTIFY_POPUP=0` or `=1` keeps to plain notifications or shows the crab's window even where Windows holds notifications back, whatever `/tokens alerts popup` says. Its log is `%TEMP%\token-usage-notify\log.txt`.

Windows shows nothing while notifications are off in Settings > System > Notifications. With Do not disturb on, a notification goes to the notification centre (Win+N) with no banner.

### Where an alert shows

An alert shows in the app (by the crab on the desktop app, by the crab and a toast in a terminal, by a toast alone with the crab off) and, outside it, as a system notification. From the desktop app it goes to the notification hooks, where `tools/notify/toast.ps1` raises it on Windows with the crab in the alert's pose; from a terminal on Windows it is a notification with a progress bar, raised through PowerShell; elsewhere it goes through Claude Code's own notification channel. Windows shows it only while notifications are on in Settings.

## Cost and tokens

The band counts in dollars, the pane in tokens. The dollars are Claude Code's own estimate at API prices. On a subscription they are not a bill: they are what the same work would have cost by the token.

A session knows only its own running total, so each session keeps a ledger of its own, dollars a day, in `~/.claude/token-usage/sessions/<session>.json`, and adds to it what each reading costs over the one before. The day's total is the sum of every session's file: each session writes only its own, so two that spend at the same moment both count. The band shows the day's total (`$6.20 today`).

- The ledger starts the day the mod is installed, or updated to 0.10.0. Nothing earlier is known.
- A session's first reading is where the mod came in, and adds nothing. From then on everything is counted.
- A day is your local date. The ledger keeps thirty-one days. A session's file stays on your machine after the session ends, a few hundred bytes; one untouched for a month is no longer read, and `/tokens tidy now` deletes those (only files of that folder named as a session's id, never the running session's own; with PowerShell on Windows, `rm` elsewhere). What was counted before 0.16.0, when one ledger was shared by every session, is still read and still counts.
- With a budget set (`/tokens budget 10`, or a button in `/tokens style`), a ring before the cost shows how much of it the day has used, and the crab says when 80% and all of it are spent, once a day each, whichever session notices first.
The pane counts tokens, which say more than dollars on a subscription: every token of a turn, input, output, cache read and cache write, a subagent's turns too. They are kept by day for every session, on your machine, for thirty-one days, from 0.14.0 on; from 0.16.0 each session keeps its own in its file beside its dollars, by day and by project.

- Tokens: this session, the last turn, today, the last seven days as a chart, and the share of the last turn's input read from the cache. Counts are said short (`950`, `11.3k`, `412k`, `1.2M`).
- The last seven days by project, a project being the last name of the folder a session runs in, five at most, the most first.
- The last seven days by the model that answered (`opus-5-5`, `haiku-5-5`), a subagent's turns under its own model, five at most.
- When a session ends, a toast says what it counted and spent beside the average session of the week (`This session: 412k tokens, $1.20, 1.4× your average session this week (300k).`), and the next session's pane shows it as the last session. The toast is seen after `/clear`; on exit the window may already be gone.
- Tips, two at most, from what the counts already say: the context past 70% (compact before a big task), a large turn that read less than half its input from the cache, a day at twice or more the average of the six before it.
- The five heaviest turns of the day, across sessions, as a table: when each ended, its project, the tools it called and its tokens with its subagents'. A pane narrower than 38 columns leaves the tools out, and a long name is cut short. The tools are named short (`Bash×2 Edit`; an MCP tool by its last name, `set_setting` for `mcp__ccd_settings__set_setting`). A subagent's tools are not counted in the turn.

## Context and resets

- Compact turns into the primary button when the context, at the rate its last three turns climbed, fills within three more turns, even before it is past 400k or 80%. A fall in the context is taken as a compaction, and only the turns after it count. After a compaction the band shows the size it left at once, without waiting for the next turn: the count the compaction reports, else the free local count of the window.
- The weekly window is forecast at the week's own pace: what it has used over the share of the week gone, from half a day in. Where that fills it before its reset, the pane, the band and an alert say when (`full in 1d 12h`). Half an hour of slope, which the 5-hour window goes by, says little about a week.
- The pane gives each reset in clock time too (`reset 2h14m, at 14:14`, with the weekday where it is not today).
- Past 85% of the 5-hour window, the band says when a big task can start (`big task? after 15:20`), in the place of the forecast.
- A measurement that brings no reading of the windows (as at the start of a session) keeps the windows already shown, each until its reset passes.

## What fills the context

`/tokens context`, or `Details` beside the line in `/tokens`, opens a pane of what the context holds, as `/context` counts it:

- The grid of the window, square by square, in the app's own colours, beside its rows: each row's tokens and share, the buffer kept for compaction (`▨`) and the free space (`□`). In a pane under 44 columns the rows go beneath the grid.
- MCP servers, each with its tools summed and named in the colour of the app it is for (Figma, Supabase, Linear, Slack and others; one the mod does not know takes a colour of its own, the same each time). A connector from claude.ai can come under an id in place of a name: the pane then names it by the app its tools are for (Vercel for `create_deployment`, Gmail for `create_draft`), or `connector a1000001` where it cannot tell. Only the servers with tools in the window are listed; the rest are said in one line with what waits outside the window (`+ 5 servers not loaded · 61.4k deferred`): tools loaded only when searched for.
- Memory files from your home folder (`~/.claude/CLAUDE.md`), the skills listed and how many, and the custom agents.

Under its figure the pane says the set-up, what the context holds before any message (every row but the messages), and how it has grown since the earliest day of the last week, with the row that moved most (`Set-up 26.3k · was 22.7k on 10-09 (+3.6k: MCP tools +3.2k)`). Each day's set-up is the latest counted that day by any session, kept thirty days.

In the band, what fills the context is drawn small. Under the context ring on the desktop, and after `CTX` in a terminal, a bar splits what is used into its rows, each in the pane's colour (8 cells on the desktop, 10 in a terminal). Beside the cost a word says what to do, only when there is something to do: past 400k, or 80% of a smaller window, how much the messages hold (`messages 110k`, beside Compact), or, where the set-up takes a quarter of the room the window leaves before its buffer, what is biggest in it (`set-up 55.3k · System tools 34.2k`), so a server or a skill not used can go. A press on the word opens this pane. A terminal with a second row puts them there, under the context's bar; on one row, the word goes in first, then the cache, then the bar; on the desktop the bar goes with the word "context". The band counts the context from the first turn, the free way; `/tokens hide breakdown` stops both.

The pane keeps up by itself: once it or `/tokens` has counted the context, the context is counted again, the free way, after every turn that moves it and after every compaction, so `Refresh` is needed only to count now. An exact count (`Count exactly`) stays until the next turn, then the free count takes its place.

It is counted the free way, estimated on your machine; `Count exactly` counts it with the token-count API, one request a tool and a memory file, as `/context` does. `/tokens` says the three rows that take the most in a line beneath the tips.

## Subagents at work

`/tokens agents` opens a pane of the subagents of the session, a card each: its agent type and the task it was given, the tools it called (`Read×3 · Grep`), how long it has worked, a bar of its tokens against the busiest of them, and the tokens. Those at work come first. The pane reads how each stands from the session's agent list every two seconds while any runs, and keeps every subagent the session has run, each turn's.

Each card has a crab dressed for the job its type names: an explorer in a pith helmet with a magnifier (`Explore`, search), an architect in glasses drawing a blueprint (`Plan`, design), a builder in a hard hat with a hammer (`general-purpose`, build), a reviewer in an eyeshade ticking a clipboard (review, audit), a scientist in goggles with a bubbling flask (test, verify), a librarian turning a book's pages (guide, docs), and a crab in a red bandana at a laptop for any other name. While it works its tool moves; when it is done a tick badge pops over its hat and it holds its tool up, then after fourteen seconds it sleeps in its hat; one that failed or was stopped sweats, its hat askew. A terminal draws a mark (`●` at work, `✓`, `✕`), the type in the job's colour and a bar of eighths.

## When Claude Code changes

The hook API this mod is built on is early access, and what Claude Code hands a mod changes between releases. So the mod reads every figure with care:

- A figure in a shape it does not know is left out, never drawn as `NaN`. The part keeps what it showed before: the context, a window, the cost. A turn's tokens are read field by field.
- The band then says what it could not read, under the figures: `token-usage can't read rateLimits from this Claude Code: figures may be old`. The line goes at the next reading it knows. `/tokens list` says it too.
- A hook of the mod that fails anyway is skipped by Claude Code, which goes on without it. The band then says which one failed and why, for ten minutes; if the band itself fails, the plugins beneath it still draw, under a line that says so.

If you see one of these lines, the mod needs an update for that release of Claude Code.

## The prompt cache

Claude Code caches the conversation's prefix: a turn that comes soon after the last reads most of its input from the cache. After a long enough pause the cache lapses, and the next turn reads its whole input again. How long it lasts depends on the account, so the mod learns it:

- After each pause, the first response of the next turn says how much of its input came from the cache. Half or more, and the cache outlasted the pause; under a fifth, and the pause outlasted it. A context under 20k tokens, or one that shrank by half (compacted or cleared), is not judged.
- The cache lasts past every pause that kept it and short of the shortest that lapsed it past those. The cache lives 5 minutes or an hour, so the learned time is the one of those the range holds (kept through 24m, lapsed after 4h31m: an hour), the shorter where it holds both, since an early warning beats a late one. A range that holds neither keeps its own end. With no lapse yet, a pause kept past 5 minutes already says an hour; one kept for less says nothing until a lapse is seen. Until the pauses say, the cache lasts the default hour, the time a subscription's responses write (a hook's usage gives the cache write's total, not its time), so the band counts down and the crab warns from the first turn; the first pause that lapsed sooner replaces it with 5 minutes. The last fifty pauses are kept for every session.
- While no turn runs, the band counts the pause down in its own row, no taller: a clock, `cache 58:00`, a thin bar that empties as the pause runs on, and **Keep warm**, all the pause long. It is green, then in the warning colour for the last two minutes (or the last 40% of a short cache). It changes once a minute, `58:00` then `57:00`, and each second in the last two minutes, `01:59`, so the band redraws once a minute for most of an hour. In a terminal the bar is cells, `cache 30:00 ▰▰▰▰▱▱▱▱ [ Keep warm ]`. Where the band is narrow the bar narrows first and then goes; the time and the button stay. Once the cache has lapsed the band says `cache lapsed · next turn re-reads 148k`, which goes with the cost when the band is narrow; quiet hours come first.
- The band's **Keep warm** does what the crab's does (below). While the crab's notice stands with its own Keep warm, the band's is not drawn, so there is one. It is never the band's next move either: the move is Compact, Compact after, Hand off or Park.
- On the desktop the pointer on the countdown says how long the cache lasts and where that came from, the default hour (`Cache lapses after ~1h idle · the default until a pause says otherwise`) or the pauses (`Cache lapses after ~5m idle · learned from 9 pauses`), and why a big context costs; on Keep warm, what it does and costs.
- Two minutes before the cache lapses, once a pause, the crab says so in the app and offers what to do, its buttons standing until the lapse: **Compact now** compacts while the cache still holds, so the compaction reads the context cheaply and the next turn re-reads only the summary; **Keep warm** reads the cache once with a fork of the conversation's last request (`$.model.fork`): no turn, nothing in the conversation, and the cache's time starts over from the ping. A toast says how it went: `Cache kept warm: read 148k (about 15k at full price).`, or that the cache had already lapsed (the ping read nothing), or why the ping failed, or that there is nothing to keep warm (a turn runs, or none has ended yet). The first ping after a turn writes a block of its own besides its read, once, and the toast says so: `Cache kept warm: read 44.4k (about 2.2k at full price), wrote 32.4k once (about 64.7k).` (seen live on Sonnet 5.5 with a 77k context); the next ping reads that block too; a busy API (429 or 5xx) is tried once more half a minute on while the cache still has the time. A pause begun at a ping never teaches how long the cache lasts, and one that lapses short of the learned time (not the default hour) says the ping did not hold the cache: from then on Keep warm sends a short turn instead (`Keeping the prompt cache warm: reply with only "ok".`, shown as your own message), and a toast says so once; **Let it lapse** sends the crab away. A context of 60k tokens or more has Compact now first (`Leaving? Compact now while it's cached: the next turn re-reads a summary, not 84.0k.`), a smaller one Keep warm. With the crab off, a toast says it, with no buttons. It stays in the app, since only someone at the app can act in time, and it says nothing of a cache shorter than two minutes, of a pause a turn has ended, or with alerts off.
- Once the cache has lapsed, a context of 50k tokens or more gets one way out in the band beside `cache lapsed · next turn re-reads 148k`: **Hand off** at 250k or more where a hand-off message is set or the handoff mod's `/handoff` is there, else **Compact**, so the turns after it re-read less. The band no longer offers `/clear` on its own.
- On the desktop, the pointer on any of these, or on the cache's word itself, opens a hint at the band's top: what it does and what it costs, the figures at the API's price in tokens at the full input price. A cache read costs a tenth of it, a twentieth on Opus 5.5 and Sonnet 5.5 and a fortieth on Fable 5.1 and Mythos 5.1, by the model of the last response; a write a quarter more for a five-minute cache and twice the price for an hour's, which is also the price where the time is not learned yet (a subscription's cache lasts an hour). On the cache's word it says why a big context costs: every step re-reads it, and a lapse writes it all again at twenty times a cached step on an hour's cache, forty on Opus 5.5 and Sonnet 5.5, eighty on Fable 5.1 and Mythos 5.1. The hint opens above the row so nothing under the pointer moves. A terminal has no pointer: with eight rows and forty columns, each choice's hint is written under the buttons, numbered as its hotkey.
- A resumed session (`--resume`, or one forked) says how long since its last reply, how much it held and what re-writing that costs: the band counts the pause from that reply before any turn runs, so `cache lapsed · next turn re-reads 148k` and its ways out stand from the start, and the hints add the engine's dollars (`about 296k at full price, $4.01 at API price`). Where the cache's time is not learned yet, the engine's word that it lapsed stands; where it did not say so, the default hour is counted down.
- Keep warm and the resumed session's countdown come from [cache-tax](https://github.com/karanb192/cache-tax) (MIT, Karan Bansal), rewritten here. Do not install both: each would ping and warn on its own.
- The pane says what was learned under the share read from the cache (`cache lapses after ~5m idle · learned from 9 pauses`), or that the hour is the default (`cache lapses after ~1h idle · the default until a pause says otherwise`).

## The next move

The band holds at most one button beside the context: the move that fits now, or none while carrying on is best. It weighs the context, the cache, the hour and this session's own turns, gravest first:

1. A turn runs: a full context gets **Compact after** (the turn finishes, then it compacts); else nothing until it ends.
2. The cache has lapsed and the context is 50k or more: **Hand off**, or **Compact**.
3. The context fills within three turns at its pace: **Compact**, as the primary button.
4. The context is under the warning size (200k, or 70% of a smaller window): nothing.
5. Quiet hours begin within 30 minutes, or the cache lapses within two: **Park**, which sends your hand-off message and compacts once its turn ends, so the next turn reads a summary; or **Compact**.
6. The context is full (400k, or 80% of a smaller window): **Hand off**, or **Compact**.
7. A compaction pays back within three turns: **Compact**.

**Hand off** and **Park** come only with a context of 250k or more, and only with a way to hand off: a hand-off message (see [Hand off](#hand-off-instead-of-start-fresh)) or the `/handoff` of the handoff mod, a separate mod. Under 250k each of those steps is **Compact**: a fresh session that reads the last handoff starts near 140k, so handing off earlier gains little. Where `/handoff` is there, Hand off and Park run it in place of sending the message: it writes the handoff, saves it and offers Start fresh on its own card. A press while a turn runs says to press again when it ends.

On the desktop the pointer on the button opens why, at the band's top. `/tokens next` says the same with its figures, on any surface.

What a compaction pays back in: what each turn saves reading a summary in place of the context, against its price. Both come from 164 compactions measured in transcripts: a compaction leaves about 130k (the setup and the summary), and costs about 200k tokens at the full input price, most of it the next step writing the new context to the cache. A turn takes the median of this session's last five turns' steps, or 3 until it has one. At 400k and 3 steps a turn a compaction pays back in about 5 turns, so the size alone (step 6) is what brings it there; step 7 comes in sessions whose turns are long.

## The fleet

Each session keeps a small file of its own in `~/.claude/token-usage/fleet/`: its folder, how its first prompt began, when it last replied, its context, its model, how long its cache lasts, whether a turn runs, and when it ended. Every session reads them all, at the end of a turn and each half minute.

A session is open until it ends, or for six hours past its last reply (or past the start of a turn that never ended, its process gone). The band draws a dot for each open session once there are two or more: `◉` at work, a green `●` while its cache holds, a yellow `●` near the lapse, a dim `○` once it has lapsed. Six at most, then `+n`. On the desktop the pointer on a dot names the session and says its figures; `/tokens fleet` says them all. `/tokens hide fleet` hides the dots.

Waking a session costs its next turn's read of the context: at the cache's read price while it holds, at its write price once it has lapsed, said in tokens at the full input price. A lapsed 200k context on Opus 5.5 costs about 400k to wake, a warm one about 10k.

A name is the folder the session runs in and how its first prompt began, cut at 24 cells. Two sessions with one name carry the first four characters of their ids. The app's own titles are not open to a mod.

`~/.claude/token-usage/fleet.json` holds the open sessions for another program, rewritten at the end of each turn and as a session ends:

```json
{ "writtenAt": 0, "sessions": [{ "id": "", "label": "", "cwd": "", "at": 0, "tokens": 0, "ttl": 3600000, "isWorking": false, "phase": "warm", "wakeTokens": 0, "hostId": "local_…" }] }
```

`hostId` is the desktop app's own id for the session, the one its session tools take, and `null` where the app gives none. `phase` and `wakeTokens` are as they stood at `writtenAt`: work the phase out again from `at` and `ttl`. Sessions write it in turn, so a read may find it half written: read it again.

## Hand off instead of Start fresh

Start fresh runs `/clear`, which drops the conversation. If you would rather carry the work over to a new session by a message of your own (a hand-off note, a command that writes one), set that message:

```
/tokens handoff Hand off now
```

The band's next move can then be **Hand off** and **Park** at 250k or more (see [The next move](#the-next-move)), and where the crab offers Start fresh (what next after **Stop now**) the button says **Hand off**. A press sends your text as your own message, the way **Continue** sends its words. The mod sends plain text through `$.prompt.submit` with `asUser`: the model reads it bare, as if you had typed it, and the transcript still names the plugin. `@file` mentions and pasted images in it are not expanded, so write the message in plain words.

- A press while a turn runs does nothing but say `Claude is still working: press Hand off again when the turn ends.`, as Compact does; the crab's notice stays for the second press.
- The hint on the lapsed band's button says what it sends: `Sends your hand-off message as your own turn: "Hand off now". The conversation is not cleared.` A hand-off is a turn of its own, so on a lapsed cache it writes the cache once.
- `/tokens handoff` alone says what is set. `/tokens handoff off` puts Compact back in the band and Start fresh in the crab's choices, and so does `/tokens reset`. `/tokens list` names it.
- It is kept with the style across sessions, as typed: its case and the spaces inside it stand.

## The desktop band and its width

The desktop app tells a mod its width in character cells, not pixels, so the band sizes itself by estimate. When the window is too narrow it gives up, in order: the price per step, the cost, the word "context", the forecast, the words beside the figures; then it falls back to the `compact` layout; then names, countdowns, and the weekly window. The context is never dropped. `/tokens list` reports the width and what was left out.

In a window's last five minutes its figure breathes slowly; at the reset the old fill drains away. This, and the crab's movement, are switched off for a reader whose system asks for reduced motion.

## Options

Set them with `/plugin configure token-usage`, or `/config`:

| Option | Meaning |
| --- | --- |
| Desktop band layout | The layout the desktop starts with. A layout chosen with `/tokens` wins until `/tokens reset`. |
| Colour below 60%, from 60%, from 85% | Hex colours for the three levels on the desktop |

## Known limits

- The per-model weekly window (such as a Fable allowance) is not shown: Claude Code does not hand it to a mod.
- The fit to the window's width is an estimate, calibrated on one machine. A row can still wrap on another font or zoom.
- The first four palettes are weak on a light theme. `forest`, `berry`, `ice`, `ember`, `mint` and `safe` hold a contrast of 3:1 on both.
- A usage alert raised from a terminal on Windows is a notification with a progress bar and no crab: the crab's pictures come with the command hooks, which the desktop app's alerts go through.
- The heaviest turns of the day, and the last twenty turns a usual turn is judged by, are lists shared by every session: two sessions that end a turn in the same instant can lose one of the two from them. Dollars and tokens are kept per session and are not lost this way.
- Tokens are split by model, dollars are not: Claude Code hands a mod only the session's total cost.
- A subagent goes under the agent type it was spawned as (`Explore`, `Plan`, `general-purpose`), read from the session's agents on its first turn; one the engine has let go of by then counts as `subagent`. Its first turn counts a run (`Explore ×14`), and the pane says what share of every token the subagents took in the last seven days.
- The month so far is summed from the dollars kept by day, thirty-one days of them, so a month is always whole; there is no month before it to compare with.
- Notifications while away are Windows only. On another system the command hooks cannot start PowerShell; Claude Code reports that and goes on.
- The band and the crab make no sound: Claude Code plays none in a Windows or Linux terminal. Only the Windows notifications have one.

## Changes

What each version added is in [CHANGELOG.md](CHANGELOG.md).

## Develop

```
npm install
npm run check
powershell -NoProfile -ExecutionPolicy Bypass -File tools/notify/toast.test.ps1
```

`npm run check` type-checks the hooks and the tests with TypeScript (`npm run typecheck`), then runs `claude plugin validate .` and `claude plugin test .`. The type check reads the declarations the engine writes into `.claude-plugin/types/` when a session loads the mod from this folder (`claude --plugin-dir .`). That folder is git-ignored, so in a fresh clone `npm run typecheck` says it is skipped and the rest of the check still runs; after one such session it type-checks for real. It never writes `.js` files. `package.json` holds only these tools: the engine loads the mod without them. The tests type a `/tokens` command with `TYPED` from `tests/kit.ts`, the origin and screen a command carries.

`hooks/register.tsx` is the hooks module: what each event does, and where the band and the panes are drawn. They are drawn by `band.tsx`, `pane-usage.tsx`, `pane-context.tsx` and `pane-style.tsx`; what they share is in `state.ts` (keys, sizes, the scope of the registration), `ledger.ts` (the files on the disk, the ledger, export, tidy), `measure.ts` (a reading taken in) and `notices.ts` (the crab, toasts, Windows). A function given `$` past an import is a function declaration, and each file declares the atoms it reads: the engine's scan of a module asks both. The rest of `hooks/` is pure and tested on its own: `usage.ts` (figures and the terminal's narrowing), `fit.ts` (what fits the desktop's width), `style.ts` (the `/tokens` words), `alerts.ts` (what is news), `cost.ts` (the ledger, each session's share of it, the budget), `svg.ts`, `thumb.ts`, `crab.ts`, `chart.ts` and `dash.ts` (drawings), `context.ts` (what fills the context), `notify.ts` (the Windows notification).

`tools/responsive/` lays the band out in a browser at every width, from the trees the mod really draws; see the comment at the top of `band-dump.ts`.

After a change to `version` in `.claude-plugin/plugin.json`, run `claude plugin update token-usage@<marketplace>` so sessions read the new version.

## License

MIT, in [LICENSE](LICENSE).
