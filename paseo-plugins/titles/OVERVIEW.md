# Titles

Short agent/tab titles. No workspace-title rules and no tab/workspace icons.

## What happens automatically

For a **new agent created while this plugin is running**, after its first completed turn, Titles makes one title-generation attempt. It aims for **one subject word**, permitting two only for an inseparable concept, and normalizes Title Case. It checks the current title against Paseo 0.11.4's exact default-title rule: first nonblank prompt line, whitespace collapsed, trimmed to 60 characters.

Explicit creation names and hand-renamed tabs are protected. Title changes observed before/during generation permanently disqualify that automatic attempt, even if the name is changed back. The name is fetched again immediately before applying a generated title. Internal agents are excluded by Paseo's lifecycle hooks; known metadata-generator names are also excluded. The model calls made by this plugin never create Paseo agents.

**No automatic re-checks, timers or retries.** Failed/canceled turns do not count as the first completed turn. Agents predating installation/enable/reload are not adopted. An unfinished agent's automatic eligibility is intentionally not restored across plugin reloads/restarts; use a manual trigger instead.

## Manual triggers

All three run the same keep-or-rename check against the current title and recent conversation. These explicit actions may replace a hand-written name.

- **Ctrl+Alt+T** in a focused agent pane on web/desktop. The listener prevents the browser's default action and propagation, preserves the composer draft, ignores repeat/IME/AltGr events, and does nothing for terminals, dialogs or an ambiguous unfocused split layout. It remembers the last clicked/focused pane and targets its selected agent tab, not an arbitrary sidebar selection.
- **Command Center** (⌘K / Ctrl+K): **Retitle this tab**.
- **`/retitle`** in the agent composer, including phones. Select the completion if shown, then submit. It is a plugin command, **not a user message sent to the coding agent**.

Feedback is a brief web toast plus a durable, plugin-rendered conversation notice: `Title kept: X` / `Renamed: X → Y`, with elapsed seconds. Native clients use the same public slash-command, RPC and timeline-renderer APIs; no DOM dependency in those paths. Command Center requires a built-in glyph, so its item uses `Type`; this does not introduce tab icons.

### Shortcut conflicts — checked, not assumed

The running app's **Keyboard shortcuts** panel lists **Cycle theme — Ctrl+Alt+T** on non-Mac. The fork agrees (`packages/app/src/keyboard/keyboard-shortcuts.ts`, theme-cycle bindings): non-Mac Ctrl+Alt+T; Mac **Cmd+Alt+T**.

To honor the requested key, Titles **deliberately shadows non-Mac theme cycling only when an agent pane can be identified**. Use the Appearance settings to change themes, or disable Titles to restore the built-in shortcut there. Mac Ctrl+Alt+T does not conflict with Paseo's Cmd+Alt+T theme key.

Many Linux desktops reserve Ctrl+Alt+T for opening a terminal. A compositor/window-manager shortcut can consume it before Paseo receives it: rebind that OS shortcut, or use Command Center or `/retitle`. Browsers do not generally reserve this exact combination, but browser extensions/custom bindings can intercept it. AltGr layouts are left alone to avoid consuming text input.

## Model and context

Uses the installed **Claude Code CLI**, `--model haiku` (resolved live here as **Claude Haiku 5.5**), through Stefan's existing Claude subscription login. Haiku is the low-cost fast Claude option available on this installation. The public plugin API does not expose Paseo's internal structured-generation service, so a direct no-tools CLI call avoids visible/archived helper agents altogether.

Calls run with `--safe-mode`, `--no-session-persistence`, no tools, no MCP servers, an explicit metadata-only system prompt, and no inherited Anthropic API-key/third-party-routing environment. No usage-billed API keys, OpenRouter or Cursor. No persistent helper chat is written to Claude history. CLI startup/subscription availability still affect latency; the call times out after 20 seconds and never automatically retries.

Conversation comes from the **provider-neutral Paseo daemon timeline**, not OMP files. A manual check fetches up to five 100-item pages until it finds six user turns, removes tools/reasoning/plugin notices, then includes up to 16 recent user/assistant messages and 12,000 characters. Each message is bounded so a long assistant reply cannot crowd out the newest user subject. Recent user turns explicitly outweigh earlier subjects. Very long conversations are intentionally summarized by this bounded excerpt, not fully reread. Automatic generation uses the completed-turn lifecycle timeline.

Malformed model decisions and titles longer than two words are rejected rather than silently truncated. Whether a two-word concept is necessary is a model judgment; one-word preference is strongly prompted, not a semantic rule the parser can prove.

Renaming uses the installed daemon SDK's local authenticated `updateAgent` RPC because the public `PaseoApi` lacks rename. Local-loopback daemon configurations are supported. Disable stops new actions and prevents in-flight generation from applying a title after shutdown; a request already accepted by the daemon cannot be undone.

## Live acceptance evidence

Verified in the hosted web app against installed Paseo 0.11.4 on 2026-10-19:

| Screenshot | Proof |
| --- | --- |
| `screenshots/01-automatic-one-word.png` | A new Haiku agent's first reply resulted in **Photosynthesis**. |
| `screenshots/02-shortcut-kept.png` | Ctrl+Alt+T kept **Photosynthesis**, with **2.0 s** feedback. |
| `screenshots/03-shortcut-drift-renamed.png` | After switching the conversation to volcanoes, title stayed unchanged until Ctrl+Alt+T renamed **Photosynthesis → Volcanoes**, **2.3 s**. |
| `screenshots/04-command-center-item.png` | Registered **Retitle this tab** item in Ctrl+K. |
| `screenshots/05-command-center-result.png` | Command Center kept **Volcanoes**, **2.1 s**. |
| `screenshots/06-slash-command.png` | `/retitle` plugin completion. |
| `screenshots/07-slash-result.png` | `/retitle` kept **Volcanoes**, **2.0 s**; the command did not appear as a user/assistant exchange. |
| `screenshots/08-manual-name-preserved.png` | Renamed the default to **My Galaxy Notes** while its first turn deliberately paused; after its completed first reply the manual name remained. |
| `screenshots/09-built-in-shortcut-conflict.png` | Running app lists Ctrl+Alt+T as Cycle theme. |
| `screenshots/10-final-automatic-composting.png` | Final-code automatic generation produced **Composting**, **2.517 s** from completed-turn handling through rename. |
| `screenshots/11-phone-width-slash-result.png` | 390×844 touch/mobile web layout: tapped Send on `/retitle`, kept **Composting**, **2.0 s**, and no agent message was sent. |

Manual check timings include timeline fetch, model generation and rename when needed, measured by the plugin. The first automatic examples were captured before total automatic timing logging was added (their logged 27/139 ms were rename RPC time only, not generation latency); the final **Composting** automatic check took **2.517 s** end to end. An additional shortcut check confirmed the unsent composer draft stayed exactly `Unsent draft must survive` (2.1 s). Desktop and native-phone hardware were not separately driven; phone-width touch web was exercised, and native uses the public command/notice APIs rather than the DOM shortcut. All four temporary acceptance agents were archived after screenshots.

## Install, reload, disable

Installed directly from this directory and running. **Refresh the Paseo app** to load the client contribution.

```sh
paseo plugin install ~/workspace/my-agents/paseo-plugins/titles
paseo plugin reload titles
paseo plugin logs titles
paseo plugin disable titles
```

Re-enable with `paseo plugin enable titles`, then refresh the app. Disabling leaves existing names and old feedback notices intact. It does not rename anything back.

## Tests and layout

```sh
cd ~/workspace/my-agents/paseo-plugins/titles
npm test
```

Final `npm test`: **7 tests passed, 0 failed**. Covers exact default detection, irreversible manual-rename detection (including rename-back), keep-versus-rename parsing, title word/character constraints, provider-neutral context filtering/bounds, newest-user preservation under verbose replies, and metadata-agent exclusion.

`shared/agent-titles.mjs` owns agent-specific naming policy and pure tests; `server/model.ts` owns the subscription call; `server/rename.ts` owns the missing public rename operation; `index.server.ts` owns agent lifecycle/manual orchestration; `index.client.tsx` owns triggers and feedback. A future workspace policy can live alongside the agent policy without mixing its lifecycle or title rules into this one. No workspace generation is implemented.
