OMP slash commands for Paseo's `omp` provider: `/tan <work>`, `/omfg <correction>`, `/queue <message>` and `/btw <question>`. None of them cancels a running reply. All of them need the OMP extension `headless-builtins` (`~/workspace/my-agents/.omp/extensions/headless-builtins/`, symlinked into `~/.omp/agent/extensions/`).

## How

- `/tan`, `/omfg` and `/queue` are composer aliases. OMP receives the `/follow-up` form (`/follow-up /tan …`, `/follow-up /omfg …`, `/follow-up <message>`), which Paseo sends out of band. The extension's input hook then runs OMP's real controller.
- `/btw <question>` asks OMP's own /btw engine, the same one behind OMP's RPC `btw` command. It uses the native prompt and the chat's full memory, including a reply that is still streaming. Nothing is added to the conversation, and the main reply keeps running. The client calls the plugin's daemon side (`btw.ask`), which sends `/follow-up /btw …`. The extension streams the answer to `$PASEO_HOME/omp-btw/<agentId>/<id>.json`. `PASEO_AGENT_ID` is the routing key, so an answer can only reach its own chat. The daemon side reads those files, and clients poll them (0.6 s while something is open or running, 4 s otherwise).
- The answers show in a sheet that opens as soon as you send `/btw`: a centred dialog on wide layouts, a bottom sheet on phones. Its header is one small muted line, "/btw · 4 · from this chat's memory, not added to it" (shorter on phones), next to Paseo's close button. Each question and its answer form a card:
  - A muted header strip holds your question, cut to 2 lines (tap it to show it all), and the time.
  - The answer is Paseo chat Markdown at chat size (15 px prose, 12 px code; headings, lists, code, tables, links). Wide code blocks and tables scroll sideways.
  - A footer strip has the status on the left: "Sending…", "Thinking… 0:03" or "Writing… 0:07" with a spinner, "Answered in 6s", "Stopped", or the error in red. The actions are on the right: **Stop** while it runs, otherwise **Copy** (shows "Copied") and **Dismiss**. On desktop, Copy and Dismiss are half-faded until the pointer is over the card or a button has keyboard focus; on phones and native apps they are always at full strength.
  - On web (desktop and phone), while you scroll a long card, its header strip sticks to the top of the sheet and its footer strip to the bottom, so the question, status and Stop stay in reach. Native apps have no sticky positioning, so there the strips scroll with the card.
  - Newest cards come first. The newest card and any running one are open; older cards fold to their header (the question, then the start of the answer). Tap a folded card to open it, or tap the chevron of an open card to fold it.

  A `btw` pill in that chat's composer reopens the sheet (tooltip "By the way (/btw)"). While an answer runs, its icon spins and it counts up (`btw 0:07`). With several answers it reads `btw · 4 answers`. Dismissing an answer hides it on every client, and Stop cancels and removes a running answer. Answers are also saved in OMP's own /btw history for the session.
- The plugin hides the `/follow-up /btw …` message from the timeline, because it is plumbing and not a conversation turn.
- Before sending, the plugin checks that the chat's live OMP process has the `/btw` handler. An agent started before the extension had `/btw` would otherwise pass the question to the model as an ordinary message. In that case you get: "This OMP agent started before /btw was installed. Reload or restart the agent" (`paseo agent reload <id>`, or close and reopen the chat).

Clients: web, desktop, iOS and Android. Only the public plugin API is used (slash commands, composer pills, `Modal`, a timeline transformer and plugin RPC), and the Markdown renderer is plain React Native. It was tested live on the web only. Refresh or reopen an open app after installing or updating the plugin.

Other providers get the original slash command unchanged. Plugin commands win collisions with provider commands, and Paseo's built-in client commands win over plugins. These commands do not run with attachments (a Paseo limit).

## Limits

- `/btw`: one question at a time per chat. This is OMP's own rule; a second question shows "A /btw question is still running; cancel it first". There are no follow-ups on an answer yet; OMP's engine supports them, but this UI does not. If an OMP process dies mid-answer, the answer shows as interrupted after 10 minutes. Answers and markers are kept for 7 days.
- Paseo's message-navigation rail (the small marks at the left edge) still counts the hidden `/follow-up /btw` message. Until a freshly loaded app has loaded its plugins, that message is briefly visible. `paseo logs` also shows it.
- Desktop web: once the sheet is open, the pill's "By the way (/btw)" tooltip can show next to it. The sheet is rendered inside the pill (the only per-chat plugin UI), so React passes hover events from the sheet up to the pill's tooltip trigger. The plugin cannot turn the tooltip off.
- The sheet's frame belongs to Paseo: the desktop dialog is at most 520 px wide, and the header row (about 64 px, with the close button) has a fixed height. A plugin can only fill the header's leading slot, which is where the small /btw line goes.
- `/tan` has no MCP tools. Paseo 0.11.4 shows only the first line of the tangent's completion notice (`omp/system-notice.js`). The main agent receives the full result and usually acts on it, as in the screenshots below.
- `/omfg` shows OMP's save-location question but not its draft-rule panel; check the saved file. Generation can take a while.
- This depends on OMP internals (controller and `rpc-btw` modules) and on Paseo 0.11.4 behaviour (`/follow-up` out of band, `PASEO_AGENT_ID` in the provider environment).

Disable with `paseo plugin disable omp-slash-aliases`. To keep the plugin but drop the OMP side, remove the `headless-builtins` symlink from `~/.omp/agent/extensions/`. Without it, the commands reach the model as plain text.

## Development

`npm install`, `npm test` (vitest), `npm run typecheck`. The tests cover the Markdown parser and its one-line preview, ask/answer correlation and routing across chats, the timer and duration labels (`client/btw-store.test.ts`), the file contract with the extension's real writer (`server/btw-outbox.test.ts`), and the live-process readiness check. `paseo plugin reload omp-slash-aliases` applies edits.

## Card design proof (2026-10-19, web app, OMP + Claude Haiku 5.5)

Throwaway agent "BTW cards test" (codeword VIOLET-HERON-42) in `~/tmp-archive/paseo-btw-test`. It was archived and deleted afterwards.

- Earlier designs: the first one (`btw-before-desktop-streaming.webp`, `btw-before-desktop-two-answers.webp`, `btw-before-phone.webp`) and the bare one that followed it (`btw-v2-desktop-dark.webp`, `btw-v2-phone-dark.webp`).
- Cards, tested live:
  - `btw-cards-desktop-streaming-long-dark.webp`: a long question and a long answer streaming, scrolled into the middle. The question strip is stuck at the top, and "Writing… 0:09" with Stop is stuck at the bottom.
  - `btw-cards-desktop-long-question-dark.webp`: the same question tapped open in full.
  - `btw-cards-desktop-several-dark.webp`: four answers, with three folded.
  - `btw-cards-desktop-long-light.webp`: light theme.
  - `btw-cards-phone-long-light.webp` and `btw-cards-phone-several-dark.webp`: the 390 px bottom sheet, with sticky strips and actions always shown.
  - `btw-cards-desktop-after-stop-dark.webp`: after Copy, which shows "Copied".
- The pill read `btw 0:04` while an answer ran. Stop cancelled that answer, and the pill went back to `btw · 4 answers`. Copy put the raw Markdown on the clipboard (read back from the page).

## Live proof (2026-10-19, web app, Claude Haiku 5.5 on Stefan's Anthropic subscription)

These were throwaway agents "BTW test A" (codeword AMBER-FALCON-31) and "BTW test B" (TEAL-OTTER-77) in `~/tmp-archive/paseo-btw-test`, archived afterwards.

- Idle: `/btw What is this chat's codeword? …` in B opened the sheet, showed the pending state, then rendered "**Codeword: TEAL-OTTER-77**" and a bullet list. Copy put the raw Markdown on the clipboard. `screenshots/btw-idle-answer.webp`
- Busy: during A's `sleep 25` tool call, `/btw While you work: …` answered "The codeword is AMBER-FALCON-31. I tried to run `sleep 25`…" while the reply was still running (`screenshots/btw-busy-answer.webp`). The main turn then finished `MAIN_DONE` after 28 s, uncancelled (`screenshots/btw-busy-conversation-after.webp`). A's OMP session file contains only the codeword turn, the sleep turn and `MAIN_DONE`, with no btw message.
- Two chats at once: `/btw PARALLEL: reply with only this chat's codeword.` was sent to A and B 19 ms apart. A's outbox got `AMBER-FALCON-31` and B's got `TEAL-OTTER-77`. B's sheet showed only B's two answers (`screenshots/btw-two-chats-chat-b.webp`). Dismiss removed an answer, and the pill went from `BTW · 2` to `BTW`.
- `/tan Reply with exactly TAN_REGRESSION_OK` from the composer dispatched `bg_1`, completed, and the main agent replied `TAN_REGRESSION_OK` (`screenshots/tan-regression.webp`, taken just after a reload, before plugins loaded, so the `/btw` sends are still visible there). `/omfg` and `/queue` were not retested after the rewrite. Their aliases send byte-identical text, and the extension runs the same controllers, now in the background.

Earlier proof of the aliases (before `/btw`): `composer-alias.png`, `composer-busy-results.png`, `omfg-busy-choice.png`, `omfg-idle-choice.png`.
