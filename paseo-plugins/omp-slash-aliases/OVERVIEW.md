OMP slash commands for Paseo's `omp` provider: `/tan <work>`, `/omfg <correction>`, `/queue <message>` and `/btw <question>`. None of them cancels a running reply. All of them need the OMP extension `headless-builtins` (`~/workspace/my-agents/.omp/extensions/headless-builtins/`, symlinked into `~/.omp/agent/extensions/`).

## How

- `/tan`, `/omfg` and `/queue` are composer aliases. OMP receives the `/follow-up` form (`/follow-up /tan …`, `/follow-up /omfg …`, `/follow-up <message>`), which Paseo sends out of band. The extension's input hook then runs OMP's real controller.
- `/btw <question>` asks OMP's own /btw engine, the same one behind OMP's RPC `btw` command. It uses the native prompt and the chat's full memory, including a reply that is still streaming. Nothing is added to the conversation, and the main reply keeps running. The client calls the plugin's daemon side (`btw.ask`), which sends `/follow-up /btw …`. The extension streams the answer to `$PASEO_HOME/omp-btw/<agentId>/<id>.json`. `PASEO_AGENT_ID` is the routing key, so an answer can only reach its own chat. The daemon side reads those files, and clients poll them (0.6 s while something is open or running, 4 s otherwise).
- The answers show in a sheet that opens as soon as you send `/btw`: a centred dialog up to 600 px wide on wide layouts, a panel at the bottom on phones. The plugin draws this sheet itself with React Native's `Modal`, because Paseo's plugin `Modal` always adds a 64 px title row. The sheet's only header is one 24 px line: "/btw · 4 · from this chat's memory, not added to it" (shorter on phones) and a small ✕. Escape, the ✕ or a tap on the dimmed backdrop closes it. Each question and its answer form a card with its own surface and border, set off from the sheet (darker cards on the dark sheet, white cards on the light sheet):
  - A header strip holds the muted question, always cut to 2 lines, and the time. Tap a long question to show it in full under the strip, and tap again to hide it.
  - The answer is Markdown at Paseo's small text size (13/19 px, the same size as the question) with Paseo's 12 px code (headings, lists, code, tables, links). Wide code blocks and tables scroll sideways.
  - A footer strip shows the status on the left: "Sending…", "Thinking… 0:03" or "Writing… 0:07" with a spinner, "Answered in 6s", "Stopped", or the error in red. **Stop** stays visible on the right while an answer runs. A finished answer has icon-only Copy and Dismiss buttons (accessibility labels "Copy answer" and "Dismiss"; Copy turns into a tick). On desktop they appear only while the pointer is over the card or one of them has keyboard focus. On phones and native apps they are always shown.
  - On web (desktop and phone), while you scroll a long card, its header strip (still the 2-line question) sticks to the top of the sheet and its footer strip to the bottom. Native apps have no sticky positioning, so there the strips scroll with the card.
  - Newest cards come first. The newest card and any running one are open; older cards fold to their header (the question, then the start of the answer). Tap a folded card to open it, or tap the chevron of an open card to fold it.

  A `btw` pill in that chat's composer reopens the sheet (tooltip "By the way (/btw)"). While an answer runs, its icon spins and it counts up (`btw 0:07`). With several answers it reads `btw · 4 answers`. Dismissing an answer hides it on every client, and Stop cancels and removes a running answer. Answers are also saved in OMP's own /btw history for the session.
- The plugin hides the `/follow-up /btw …` message and Paseo 0.12's normalized `/btw …` echo from the timeline, because they are plumbing and not a conversation turn.
- Before sending, the plugin checks that the chat's live OMP process has the `/btw` handler. An agent started before the extension had `/btw` would otherwise pass the question to the model as an ordinary message. In that case you get: "This OMP agent started before /btw was installed. Reload or restart the agent" (`paseo agent reload <id>`, or close and reopen the chat).

Clients: web, desktop, iOS and Android. Only the public plugin API is used (slash commands, composer pills, `Modal`, a timeline transformer and plugin RPC), and the Markdown renderer is plain React Native. It was tested live on the web only. Refresh or reopen an open app after installing or updating the plugin.

Other providers get the original slash command unchanged. Plugin commands win collisions with provider commands, and Paseo's built-in client commands win over plugins. These commands do not run with attachments (a Paseo limit).

## Limits

- `/btw`: one question at a time per chat. This is OMP's own rule; a second question shows "A /btw question is still running; cancel it first". There are no follow-ups on an answer yet; OMP's engine supports them, but this UI does not. If an OMP process dies mid-answer, the answer shows as interrupted after 10 minutes. Answers and markers are kept for 7 days.
- Paseo's message-navigation rail (the small marks at the left edge) still counts the hidden `/follow-up /btw` message. Until a freshly loaded app has loaded its plugins, that message is briefly visible. `paseo logs` also shows it.
- Desktop web: once the sheet is open, the pill's "By the way (/btw)" tooltip can show next to it. The sheet is rendered inside the pill (the only per-chat plugin UI), so React passes hover events from the sheet up to the pill's tooltip trigger. The plugin cannot turn the tooltip off.
- The sheet is drawn by the plugin with React Native's `Modal`, not Paseo's sheet. On phones it is a plain panel without swipe-to-close, and it uses Paseo's default UI font, so a custom UI font set in Paseo's settings is not applied there.
- `/tan` has no MCP tools. Paseo 0.11.4 shows only the first line of the tangent's completion notice (`omp/system-notice.js`). The main agent receives the full result and usually acts on it, as in the screenshots below.
- `/omfg` shows OMP's save-location question but not its draft-rule panel; check the saved file. Generation can take a while.
- This depends on OMP internals (controller and `rpc-btw` modules) and on Paseo 0.11.4 behaviour (`/follow-up` out of band, `PASEO_AGENT_ID` in the provider environment).

Disable with `paseo plugin disable omp-slash-aliases`. To keep the plugin but drop the OMP side, remove the `headless-builtins` symlink from `~/.omp/agent/extensions/`. Without it, the commands reach the model as plain text.

## Development

`npm install`, `npm test` (vitest), `npm run typecheck`. The tests cover the Markdown parser and its one-line preview, ask/answer correlation and routing across chats, the timer and duration labels (`client/btw-store.test.ts`), the file contract with the extension's real writer (`server/btw-outbox.test.ts`), and the live-process readiness check. `paseo plugin reload omp-slash-aliases` applies edits.

## Dense card proof (2026-10-19, web app, OMP + Claude Haiku 5.5)

Throwaway agent "BTW dense test" (codeword VIOLET-HERON-42) in `~/tmp-archive/paseo-btw-test`. It was archived and deleted afterwards.

- Earlier designs: the first one (`btw-before-desktop-streaming.webp`, `btw-before-desktop-two-answers.webp`, `btw-before-phone.webp`), the bare one (`btw-v2-desktop-dark.webp`, `btw-v2-phone-dark.webp`), and the first card design inside Paseo's frame (`btw-v3-desktop-dark.webp`).
- Tested live:
  - `btw-dense-desktop-streaming-dark.webp`: a long answer streaming, with the question strip stuck at the top and "Writing… 0:04" with Stop at the bottom.
  - `btw-dense-desktop-long-question-dark.webp`: a long question tapped open in full under its 2-line strip.
  - `btw-dense-desktop-scrolled-dark.webp`: the same card scrolled. The stuck strip shows only the 2-line question, and the answer is not covered.
  - `btw-dense-desktop-several-dark.webp` and `btw-dense-desktop-several-light.webp`: six answers with five folded, hovered so Copy and Dismiss show.
  - `btw-dense-desktop-light.webp`: light theme, mid-answer.
  - `btw-dense-phone-light.webp` and `btw-dense-phone-several-dark.webp`: 390 px wide, with the icons always shown.
- Copy and Dismiss had opacity 0 until the pointer entered the card, then 1 (read from the page). Escape closed the sheet.

## Live proof (2026-10-19, web app, Claude Haiku 5.5 on Stefan's Anthropic subscription)

These were throwaway agents "BTW test A" (codeword AMBER-FALCON-31) and "BTW test B" (TEAL-OTTER-77) in `~/tmp-archive/paseo-btw-test`, archived afterwards.

- Idle: `/btw What is this chat's codeword? …` in B opened the sheet, showed the pending state, then rendered "**Codeword: TEAL-OTTER-77**" and a bullet list. Copy put the raw Markdown on the clipboard. `screenshots/btw-idle-answer.webp`
- Busy: during A's `sleep 25` tool call, `/btw While you work: …` answered "The codeword is AMBER-FALCON-31. I tried to run `sleep 25`…" while the reply was still running (`screenshots/btw-busy-answer.webp`). The main turn then finished `MAIN_DONE` after 28 s, uncancelled (`screenshots/btw-busy-conversation-after.webp`). A's OMP session file contains only the codeword turn, the sleep turn and `MAIN_DONE`, with no btw message.
- Two chats at once: `/btw PARALLEL: reply with only this chat's codeword.` was sent to A and B 19 ms apart. A's outbox got `AMBER-FALCON-31` and B's got `TEAL-OTTER-77`. B's sheet showed only B's two answers (`screenshots/btw-two-chats-chat-b.webp`). Dismiss removed an answer, and the pill went from `BTW · 2` to `BTW`.
- `/tan Reply with exactly TAN_REGRESSION_OK` from the composer dispatched `bg_1`, completed, and the main agent replied `TAN_REGRESSION_OK` (`screenshots/tan-regression.webp`, taken just after a reload, before plugins loaded, so the `/btw` sends are still visible there). `/omfg` and `/queue` were not retested after the rewrite. Their aliases send byte-identical text, and the extension runs the same controllers, now in the background.

Earlier proof of the aliases (before `/btw`): `composer-alias.png`, `composer-busy-results.png`, `omfg-busy-choice.png`, `omfg-idle-choice.png`.
