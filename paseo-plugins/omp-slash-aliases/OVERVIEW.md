OMP slash commands for Paseo's `omp` provider: `/tan <work>`, `/omfg <correction>`, `/queue <message>` and `/btw <question>`. None of them cancels a running reply. All of them need the OMP extension `headless-builtins` (`~/workspace/my-agents/.omp/extensions/headless-builtins/`, symlinked into `~/.omp/agent/extensions/`).

## How

- `/tan`, `/omfg` and `/queue` are composer aliases. OMP receives the `/follow-up` form (`/follow-up /tan …`, `/follow-up /omfg …`, `/follow-up <message>`), which Paseo sends out of band. The extension's input hook then runs OMP's real controller.
- `/btw <question>` asks OMP's own side-question engine, the same one behind OMP's RPC `btw` command. It uses the native prompt and the chat's full memory, including a reply that is still streaming. Nothing is added to the conversation, and the main reply keeps running. The client calls the plugin's daemon side (`btw.ask`), which sends `/follow-up /btw …`. The extension streams the answer to `$PASEO_HOME/omp-btw/<agentId>/<id>.json`. `PASEO_AGENT_ID` is the routing key, so an answer can only reach its own chat. The daemon side reads those files, and clients poll them (0.6 s while something is open or running, 4 s otherwise).
- The answer shows in a sheet that opens as soon as you send `/btw`: a centred dialog on wide layouts, a bottom sheet on phones. It has no title, only Paseo's close button. Your question sits on the right as a small chat bubble; the answer below it is Paseo chat Markdown at chat size (15 px prose, 12 px code; headings, lists, code, tables, links). While it runs, one muted line under the question shows a spinner, "Sending…" or "Thinking…" until text arrives, and **Stop**, so Stop stays in reach while a long answer streams below. Copy, Dismiss and the time sit in a row of small icons under a finished answer: on desktop they appear while the pointer is over that answer or a button has keyboard focus, and on phones and native apps they stay visible. Copy shows a tick and puts the raw Markdown on the clipboard. Newest answers come first. With several answers, the newest one (and any still running) is open and the older ones collapse to two lines (the question, then the start of the answer). Tap a collapsed one to open it, or tap an open question to collapse it. A `btw` pill in that chat's composer reopens the sheet: its icon spins while an answer runs, and it reads `btw n` when there are several answers. Dismissing an answer hides it on every client. Answers are also saved in OMP's own /btw history for the session.
- The plugin hides the `/follow-up /btw …` message from the timeline, because it is plumbing and not a conversation turn.
- Before sending, the plugin checks that the chat's live OMP process has the `/btw` handler. An agent started before the extension had `/btw` would otherwise pass the question to the model as an ordinary message. In that case you get: "This OMP agent started before /btw was installed. Reload or restart the agent" (`paseo agent reload <id>`, or close and reopen the chat).

Clients: web, desktop, iOS and Android. Only the public plugin API is used (slash commands, composer pills, `Modal`, a timeline transformer and plugin RPC), and the Markdown renderer is plain React Native. It was tested live on the web only. Refresh or reopen an open app after installing or updating the plugin.

Other providers get the original slash command unchanged. Plugin commands win collisions with provider commands, and Paseo's built-in client commands win over plugins. These commands do not run with attachments (a Paseo limit).

## Limits

- `/btw`: one question at a time per chat. This is OMP's own rule; a second question shows "A /btw question is still running; cancel it first". There are no follow-ups inside a side conversation yet; OMP's engine supports them, but this UI does not. If an OMP process dies mid-answer, the answer shows as interrupted after 10 minutes. Answers and markers are kept for 7 days.
- Paseo's message-navigation rail (the small marks at the left edge) still counts the hidden `/follow-up /btw` message. Until a freshly loaded app has loaded its plugins, that message is briefly visible. `paseo logs` also shows it.
- Desktop web: once the sheet is open, the pill's "Side questions (/btw)" tooltip can show next to it. The sheet is rendered inside the pill (the only per-chat plugin UI), so React passes hover events from the sheet up to the pill's tooltip trigger. The plugin cannot turn the tooltip off.
- The desktop dialog is Paseo's standard plugin dialog, at most 520 px wide. A plugin cannot widen it.
- `/tan` has no MCP tools. Paseo 0.11.4 shows only the first line of the tangent's completion notice (`omp/system-notice.js`). The main agent receives the full result and usually acts on it, as in the screenshots below.
- `/omfg` shows OMP's save-location question but not its draft-rule panel; check the saved file. Generation can take a while.
- This depends on OMP internals (controller and `rpc-btw` modules) and on Paseo 0.11.4 behaviour (`/follow-up` out of band, `PASEO_AGENT_ID` in the provider environment).

Disable with `paseo plugin disable omp-slash-aliases`. To keep the plugin but drop the OMP side, remove the `headless-builtins` symlink from `~/.omp/agent/extensions/`. Without it, the commands reach the model as plain text.

## Development

`npm install`, `npm test` (vitest), `npm run typecheck`. The tests cover the Markdown parser and its one-line preview, ask/answer correlation and routing across chats (`client/btw-store.test.ts`), the file contract with the extension's real writer (`server/btw-outbox.test.ts`), and the live-process readiness check. `paseo plugin reload omp-slash-aliases` applies edits.

## Redesign proof (2026-10-19, web app, OMP + Claude Haiku 5.5)

Throwaway agent "BTW redesign test" (codeword VIOLET-HERON-42) in `~/tmp-archive/paseo-btw-test`. It was archived and deleted afterwards.

- Before: `btw-before-desktop-streaming.webp`, `btw-before-desktop-two-answers.webp`, `btw-before-phone.webp`.
- After, tested live: `btw-after-desktop-streaming-dark.webp` (an answer streaming under its question, with a spinner and Stop, and older answers collapsed), `btw-after-desktop-answers-dark.webp` (eight answers, the newest open and hovered to show its actions), `btw-after-desktop-markdown-light.webp` (an older answer expanded: numbered list, code block, inline code), `btw-after-phone-dark.webp` and `btw-after-phone-light.webp` (390 px bottom sheet with the icons always shown).
- Copy put the raw Markdown on the clipboard (read back from the page) and the icon turned into a tick. Dismissing two answers took the pill from `btw 5` to `btw 3`. The X closed the sheet, and it did not reopen.

## Live proof (2026-10-19, web app, Claude Haiku 5.5 on Stefan's Anthropic subscription)

These were throwaway agents "BTW test A" (codeword AMBER-FALCON-31) and "BTW test B" (TEAL-OTTER-77) in `~/tmp-archive/paseo-btw-test`, archived afterwards.

- Idle: `/btw What is this chat's codeword? …` in B opened the sheet, showed the pending state, then rendered "**Codeword: TEAL-OTTER-77**" and a bullet list. Copy put the raw Markdown on the clipboard. `screenshots/btw-idle-answer.webp`
- Busy: during A's `sleep 25` tool call, `/btw While you work: …` answered "The codeword is AMBER-FALCON-31. I tried to run `sleep 25`…" while the reply was still running (`screenshots/btw-busy-answer.webp`). The main turn then finished `MAIN_DONE` after 28 s, uncancelled (`screenshots/btw-busy-conversation-after.webp`). A's OMP session file contains only the codeword turn, the sleep turn and `MAIN_DONE`, with no btw message.
- Two chats at once: `/btw PARALLEL: reply with only this chat's codeword.` was sent to A and B 19 ms apart. A's outbox got `AMBER-FALCON-31` and B's got `TEAL-OTTER-77`. B's sheet showed only B's two answers (`screenshots/btw-two-chats-chat-b.webp`). Dismiss removed an answer, and the pill went from `BTW · 2` to `BTW`.
- `/tan Reply with exactly TAN_REGRESSION_OK` from the composer dispatched `bg_1`, completed, and the main agent replied `TAN_REGRESSION_OK` (`screenshots/tan-regression.webp`, taken just after a reload, before plugins loaded, so the `/btw` sends are still visible there). `/omfg` and `/queue` were not retested after the rewrite. Their aliases send byte-identical text, and the extension runs the same controllers, now in the background.

Earlier proof of the aliases (before `/btw`): `composer-alias.png`, `composer-busy-results.png`, `omfg-busy-choice.png`, `omfg-idle-choice.png`.
