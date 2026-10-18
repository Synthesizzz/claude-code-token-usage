# Changelog

What each version of token-usage added or changed, newest first. Versions before 0.5.2 came before the repository, and 0.10 to 0.12 have no commit of their own: their work is in 0.13.0.

## 0.46.2

- Keep warm judges its ping by what it read: a ping that read from the cache kept it. The first fork after a turn writes a block of its own besides its read (seen live: read 44.4k, wrote 32.4k, 30 seconds after a turn on Sonnet 5.5), which 0.46.0 took for a lapse: it said `The cache had already lapsed` and left the countdown where it was. Now the toast says what was kept and what the ping wrote once, and the cache's time starts over.
- Keep warm with no pause to keep (a turn runs, or none has ended yet) says so in a toast, where it did nothing.
- A terminal writes each cache choice's hint under the buttons, numbered as its hotkey, where the band has eight rows and forty columns: a terminal has no pointer to rest on a button.
- A terminal narrower than forty columns, or with fewer than five rows, brings an alert's words and buttons without the crab, where it brought nothing: the cache warning's buttons could not be pressed there.

## 0.46.1

- A cache read on Sonnet 5.5 is priced at a twentieth of the input price, as on Opus 5.5. Before, 0.46.0 priced it at a tenth, so its hints said twice the read's cost and half the times a lapse costs over a cached step.
- After a lapse, the heavy-turn notice's Keep going hint says the cache's read price at the model's own rate, where it always said a tenth.
- Every `Text` drawn bold says `weight="semibold"`, the weight Claude Code 2.1.299 reads `bold` as, in place of the `bold` it deprecated. Nothing looks different.

## 0.46.0

- Keep warm reads the cache once with a fork of the conversation's last request: no turn, nothing in the conversation. A toast says how it went, a busy API is tried once more half a minute on, and the cache's time starts over from the ping. A ping seen not to hold the cache (its pause lapsed short of the learned time) turns Keep warm back to a short turn that shows, and a toast says so once. After cache-tax's keepwarm.
- The cache's prices are the API's: a write is twice the input price for an hour's cache (a quarter more for five minutes), and a read is a tenth, a twentieth on Opus 5.5 or a fortieth on Fable 5.1 and Mythos 5.1. Before, every write was a quarter more, so a lapse said about 0.6 of its cost on an hour's cache.
- A resumed session counts its cache from its last reply before any turn runs, from what Claude Code says on resuming, with the engine's dollar estimate in the hints. After cache-tax.
- `/tokens`' hint in the command list names the words of 0.42.0: `show|hide <part>`, `alerts popup|privacy|quiet`.

## 0.45.1

- In the style pane a palette's colour bars stand 6 pixels above its name, no longer touching it.

## 0.45.0

- Every palette now reads on a light theme as on a dark one, at a contrast of 3 to 1 or more on each. Classic, ocean, sunset and mono were made for a dark theme: their colours are deeper now. Classic is the default, so the band's own green, amber and red change too, and so do the defaults of the colour options.
- A new palette, `okabe`: bluish green, reddish purple and vermilion, after Okabe and Ito, told apart with every common colour blindness, blue and yellow's too. It joins `safe` in the picker's colour-blind group.
- The picker groups the palettes by kind: colour, grey, colour-blind safe.

## 0.44.1

- In a narrow style pane the look's stack fits: its bars give way to the room, and under a floor the word "left" goes first. Before, the figures after the bars were cut off at the pane's edge.
- A look no preset makes says only its layout and palette. Before, it said "the undefined preset".

## 0.44.0

- The style pane draws the band at its top in the look in force, with your own figures, as the band draws it. The pointer resting on a layout or a palette shows the band in that look, under the buttons, before you press.
- Layouts are buttons with their names; each palette has its three colours above its name, and the palettes go by where they read: both themes, colour-blind safe, dark theme. The presets come after them. The small pictures of each layout are gone.
- On a subscription the style pane has no budgets: the plan bills no dollars. With an API key they are there as before, and `/tokens budget` sets one either way.

## 0.43.0

- On the desktop the crab stands by where the context ring was, between a turn and its nap: it looks ahead, then up at the figures, blinks between, and taps its feet now and then. Before, the ring came back for the two minutes until it slept, and the crab seemed to vanish.
- A session begun, or begun anew with Start fresh (`/clear`), starts with the crab standing by, asleep two minutes on. Before, it showed nowhere until a turn had ended there.
- With the crab on, the desktop ring is not drawn at all; `/tokens hide crab` brings it back.

## 0.42.0

- The notification outside the app is set under alerts: `/tokens alerts popup off`, `alerts privacy off`, `alerts quiet 22-8`. So `/tokens quiet` is only ever the preset, and quiet hours no longer share its word.
- A part is shown or hidden with `/tokens show|hide <part>`: `/tokens hide context`. So `/tokens context` is only ever its pane. The style pane's buttons use these words.
- The words from before still work: `popup off`, `privacy off`, `quiet 22-8`, and `<part> on|off`.
- `/tokens help` and the README put the six words of every day first (`/tokens`, `style`, `agents`, `context`, `list`, `help`), then the settings, then the checks (`alerts test`).

## 0.41.0

- `/tokens alerts test cache` brings the cache warning at once, for the context as it is, and `/tokens alerts test lapsed` shows the band of a lapsed cache for a minute: their buttons and hover hints can be seen without waiting for the cache. A press does what it says.

## 0.40.0

- On the desktop, resting the pointer on a cache choice opens a hint at the band's top: what it does and what it costs, with the figures at the API's price (`Nothing is sent. Your next turn writes 148k to the cache again (about 185k at full price).`). So do the band's Start fresh and Compact while the cache has lapsed, the cache's own word (why a big context costs, or what the lapse will cost), and the choices of a heavy turn whose cache had lapsed.

## 0.39.0

- The cache warning offers what to do. Two minutes before the lapse the crab offers **Compact now** (compacts while the cache is still cheap to read), **Keep warm** (a short turn that starts the cache's time over) and **Let it lapse**, Compact now first for a context of 60k or more. Its buttons stand until the lapse.
- Once the cache has lapsed, a context of 50k or more gets **Start fresh** and **Compact** in the band.
- A heavy turn whose cache had lapsed no longer offers **Stop now**: that cost was paid at the turn's first step. It offers **Compact after** in its place and says so.

## 0.38.6

- The desktop band's background reaches out to the sides of the app's frame. Its strips above and below stay: the engine clips the band's rows there.

## 0.38.5

- `/tokens color background #1f3b2d` fills the desktop band behind everything it shows, inside the app's own frame; `/tokens color background off` takes it away. None by default. A colour white text reads poorly on (below 4.5:1) is set all the same, and the answer says so. The terminal band draws none.

## 0.38.4

- On a subscription (a session that reads 5-hour and weekly windows), every dollar figure says it is the API's price: `$275.41 API today` in the band, "API worth" and "used at API prices" in budget notices, "at API prices" when a session ends, and the pane's month says the plan does not bill it. With an API key, where the figures are what is billed, nothing changes.

## 0.38.3

- A notice's words and buttons go the moment one is pressed, and the crab walks off alone. Before, they stood through the walk-off, so in the desktop app a press looked like nothing, and each further press started the walk-off over.

## 0.38.2

- A heavy turn's question goes away as soon as a choice is pressed, rather than standing its full 45 seconds still pressable.
- Compact, pressed from that question, runs once the press has answered, so a long compaction no longer has the press skipped for running past its budget.
- After Start fresh (a /clear), the band is set up again for the new session, which no session start comes for.
- An agent's card says its tokens are processed ones, re-reads included, and beneath them the context its last response read (`context 75k`; `ctx 75k` beside the figure in a terminal), which is the figure Claude Code gives the same agent.

## 0.38.1

- The agents pane counts a subagent's tokens as each of its responses ends, so a card at work no longer reads 0; its turn's own sum takes their place when it ends.
- A subagent the mod did not see start (it loaded later, or reloaded) joins the pane from the agent list while it runs; one of a turn before, which the list keeps a while, no longer comes back as a new card.
- The watch that reads the agent list is held by the module's own load, so a reload while a subagent runs cannot leave its card stuck at work.

## 0.38.0

- A heavy turn's notice says why it is heavy and where its tokens went, and offers the choices that fit, the best first, pressed with 1–3: Stop now, Keep going, See agents, Compact after, Warn at 2×.
- Stop now ends the turn at once and asks what next: Compact, Start fresh, or Continue where it stopped.
- The agents pane keeps the last turn that had subagents, and says plainly when none has run yet.

## 0.37.0

- `/tokens agents`: a pane of the turn's subagents, a card each with its type, task, tools, time and tokens, read live from the session's agent list.
- Each card has a crab dressed for its job (explorer, architect, builder, reviewer, scientist, librarian, or a bandana for any other), its tool moving while it works; done, a tick badge pops over its hat and it holds its tool up, then it sleeps; failed, it sweats.

## 0.36.0 (2026-10-16)

- Terminal band: where the row has room left once all it says fits, each figure is a bar filled by eighths of a cell, and a window's bar marks the cell of the time gone.
- Terminal band: with a second row to spare, what fills the context, the cache countdown and the word of what to do go beneath the figures, so a narrow row keeps them.
- With six rows, the crab of a notice is drawn in half blocks, two pixels to a cell, with dark eyes.

## 0.35.0

- Two minutes before the learned cache lapses, once a pause, the crab says so in the app.
- The pane shows the month so far in dollars, with a day on average; `/tokens budget month` sets a monthly budget, with alerts at 80% and when it is spent. The ledger keeps 31 days, so a month is always whole.
- A subagent's tokens go under its agent type (`Explore`, `Plan`, ...), with its runs counted; the pane has a "By subagent" split.

## 0.34.1

- `npm run check` type-checks the hooks and the tests with TypeScript, then validates and runs the tests. Five type errors in the hooks were fixed, one of them an `Svg` read from a surface that may not have it.

## 0.34.0

- Two minutes after a turn, the crab falls asleep where the context ring is; a terminal shows `ᶻᶻ`.

## 0.33.1

- The learned cache TTL snaps to 5 minutes or an hour, the one the pauses leave room for, so a few far-apart pauses no longer count down from hours.

## 0.33.0

- The band shows what fills the context: a bar of its rows, and a word when there is something to do (`messages 110k` past 80%, or a heavy set-up and what is biggest in it). A press on the word opens the context pane. `/tokens breakdown off` turns both off.

## 0.32.2

- The context panes count again by themselves after every turn and every compaction, with no press of Refresh.

## 0.32.1

- The band redraws the context right after a compaction, without waiting for the next turn.
- The three budgets sit together in the style pane.

## 0.32.0

- A daily budget for a project: `/tokens budget project <name|here> <dollars|off>`.

## 0.31.1

- `/tokens help` lists the words by what they do.

## 0.31.0

- The style pane has a button for every choice.

## 0.30.3

- The hooks module is split into modules; a review of every pane at four widths fixed a crab overflowing, the cache share's colour, the project column and an indent.

## 0.30.2

- A heavy turn is judged against the usual turn of earlier sessions too, so a new session does not start at the 500k floor.

## 0.30.1

- The cache share's words stay on one line in a narrow pane.

## 0.30.0

- While no turn runs, the band counts down to the prompt cache's lapse, learned from how much each turn after a pause read from the cache.
- Tests for the `.catch` of every hook that fails.

## 0.29.0

- `/tokens tidy` deletes session files no longer read.

## 0.28.0

- The context pane says how the set-up has grown over the week.

## 0.27.0

- While a turn runs, the crab says when it is far heavier than a usual turn.

## 0.26.0

- The weekly window is forecast at the week's own pace.

## 0.25.0 – 0.25.2

- `/tokens context` shows what fills the context, as `/context` breaks it down, with the grid in the app's colours and MCP servers named and coloured by their app.
- A connector is named by its app, not by its id; only the servers with tools in the context are listed.

## 0.24.0

- The heaviest turns of the day are a table that fits the pane's width.

## 0.23.0

- The `/tokens` pane is a dashboard on the desktop.

## 0.22.0

- A session sums itself up when it ends, beside the sessions of the week.

## 0.21.0

- The pane gives tips from the counts.

## 0.20.0

- A weekly budget beside the daily one.

## 0.19.0

- `/tokens export` writes the days to CSV and JSON.

## 0.18.0

- Tokens are counted by the model that answered.

## 0.17.0 – 0.17.1

- The band says what it cannot read when Claude Code changes.
- A session is counted once after `/clear`.

## 0.16.0

- Each session keeps its dollars and tokens in a file of its own, summed for the band, so two sessions never overwrite each other.

## 0.15.0

- News outside the app comes in the crab's own window.

## 0.14.0

- The pane counts in tokens; the band keeps its dollars.
- An MCP tool is named by its last name in the costliest turns.

## 0.13.0 (2026-10-14)

- The day's cost, Windows notifications with the crab, and six usage features.

## 0.9.0

- A crab brings each alert and works at a laptop during a turn.

## 0.8.0

- A window near its reset, and at its reset, is animated.

## 0.7.0

- Every alert is raised in the app and in Windows; a Compact button in the band.

## 0.6.0

- The desktop band fits its width; alerts and six palettes.

## 0.5.2 (2026-10-13)

- The first version in the repository.
