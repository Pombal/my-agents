# Titles

Short agent-tab titles: one word (two only when one word means nothing), Title
Case. No workspace titles, no tab or workspace icons.

## What happens on its own

A **new** agent (created while Titles is running, without an explicit name) gets
one title attempt after its **first completed turn**, but only if its name is
still Paseo's default, the first prompt line. Paseo 0.11.4 derives that default by
taking the first nonblank line, collapsing whitespace and cutting it to 60
characters; Titles mirrors that rule exactly. Anything else counts as a name
chosen by hand and is left alone: a creation name, a rename before the turn
ends, or a rename while Claude is thinking (the rename is a compare-and-set
against the default).

That's all it does on its own. There are no re-checks, timers or retries.
Agents that already existed (or were mid-first-turn) when the plugin was
loaded, reloaded or enabled are never adopted. A failed or cancelled turn
doesn't count as the first completed turn. If the first conversation has no
subject yet ("hi", "quick question"), the default stays.

## Retitle on demand

Three triggers run the same check:

- **Ctrl+Alt+T** (web and desktop): applies to the selected agent tab of the pane you last clicked or focused (or the only pane). Terminal tabs, open dialogs, AltGr and IME input are left alone.
- **Ctrl+K / ⌘K → Retitle this tab.**
- **`/retitle`** in the composer (phones too). It's a plugin command, so nothing is sent to the agent.

Claude Haiku decides whether the current title still names what the **latest
user message** is about. Earlier messages only provide context. If the title
still fits, it stays, even when Claude would have worded it differently; if the
subject has moved on, the tab is renamed. A title longer than two words, such as
Paseo's default or a hand-written phrase, is always replaced, because explicit
triggers may override hand-chosen names.

### Feedback

Nothing goes into the conversation. While Claude thinks (2–5 s), a small
**Retitling…** pill with a spinner sits above the composer. Then one Paseo
toast reports the outcome:

| Outcome | Toast |
| --- | --- |
| Renamed | ✓ `Renamed to Cold Brew` |
| Kept | ⓘ `“Swallow” still fits` |
| No subject yet | ⓘ `No clear subject yet; title unchanged` |
| Renamed by hand meanwhile | ⚠ `Couldn't retitle: The tab was renamed meanwhile; that name stays` |
| Claude CLI missing / slow / broken | ⚠ `Couldn't retitle: Claude CLI not found on the daemon's PATH` (or `took longer than 20 s`, or its first error line) |

Pressing a trigger again while a check is running does nothing; the pill shows
that a check is already under way. Two clients retitling the same tab at once
get `Already retitling this tab`.

### Ctrl+Alt+T and Paseo's "Cycle theme"

On non-Mac systems Paseo binds **Ctrl+Alt+T to Cycle theme**. Its keyboard
listener is registered before any plugin's, so a plugin **cannot shadow it**:
pressing Ctrl+Alt+T retitles the tab *and* switches the theme. (The previous
version of this plugin claimed to shadow it; it didn't.) Titles notices when
that happened and says so once per session:

- **Desktop app:** open Settings → Shortcuts, find *Cycle theme* and choose **Clear**. After that, Ctrl+Alt+T only retitles.
- **Browser (app.paseo.sh):** shortcuts can't be edited there, so Ctrl+Alt+T keeps cycling the theme. Use Ctrl+K → *Retitle this tab* or `/retitle` instead.
- **Mac:** no clash, because Paseo uses Cmd+Alt+T for the theme.

Many Linux desktops also bind Ctrl+Alt+T to "open terminal". Their window
manager gets the key before the app does.

## Model

The plugin runs the installed **Claude Code CLI** with `--model haiku` through
Stefan's subscription login, so no API keys are used: the
`ANTHROPIC_*`/`CLAUDE_CODE_USE_*` variables are stripped. The call uses
`--safe-mode`, no tools, no MCP, no saved session, and a 20 s timeout, with no
retries. It takes about 2.5–5 s end to end, depending on CLI startup.

The prompt (`server/model.ts`) asks for one distinctive noun that tells this
tab apart from the other tabs in the same workspace. It rules out generic words
(Help, Question, Fix, Bug, Task…) and the workspace or project name itself,
since every tab there shares it. It also keeps identifiers' own casing (iOS,
eBPF). Live examples: *Lockfile*, *SD Card*, *Cold Brew*, *Altitude*. In
offline prompt trials it produced *Sourdough*, *Flicker*, *Reconnect* and
*Rsync*, and kept *Volcanoes* for a follow-up about Vesuvius. Answers are
strict JSON. Anything over two words, decorated, or otherwise malformed is
rejected rather than truncated.

The model sees a provider-neutral excerpt of the Paseo timeline: the last 12
user and assistant messages. Each agentic turn's assistant messages are merged
into one entry, and each entry is capped at 1,200 characters, keeping its start
and end, so a long or tool-heavy turn can't push the user's request out.

Renaming uses the daemon SDK's local `updateAgent` RPC over the loopback
endpoint, which is the same call as `paseo agent update --name`. The public
plugin API has no rename operation.

## Live verification (2026-10-19, hosted web app, daemon 0.11.4)

| Screenshot | Shows |
| --- | --- |
| `01-first-turn-title.png` | New Haiku agent about Raspberry Pi SD-card corruption → **SD Card** after its first reply (3.0 s). |
| `02-retitling-pill.png` | The **Retitling…** pill while Claude thinks. |
| `03-ctrl-alt-t-renamed.png` | Ctrl+Alt+T on a hand-named tab ("My Coffee Notes") whose latest question was about cold brew → **Cold Brew**, plus the one-time Cycle-theme warning. |
| `04-command-center-item.png` | Ctrl+K → *Retitle this tab*. |
| `05-command-center-kept.png` | Same subject → `“Cold Brew” still fits`. |
| `06-slash-command.png`, `07-slash-result.png` | `/retitle` on desktop web → kept, nothing posted to the chat. |
| `08-renamed-meanwhile.png` | Renamed via CLI while the check ran → compare-and-set refused, hand name kept. |
| `09…11-phone-*.png` | 390×844 touch layout: `/retitle` completion, pill, kept toast. |
| `12-hand-name-preserved.png` | Renamed to "Umbrella Keeper Notes" while the first turn was still running; after the turn the log reads `kept hand-chosen "Umbrella Keeper Notes"`. |

Also seen live: an earlier drift test renamed *Lockfile* → *Altitude* after a
question about Everest. The keyboard test confirmed Paseo's theme cycle fires
too (see above). A missing CLI was checked by running `decideTitle` with an
empty `PATH`, which gave `Claude CLI not found on the daemon's PATH`. The
desktop app and the native phone app weren't driven. Native uses the same
slash-command, pill and toast APIs, with no DOM code. All test agents were
archived.

Haiku isn't fully deterministic. In one of about 15 checks it renamed a
fitting title (*Monty Python* → *Swallow*, also reasonable).

## Install, reload, disable

```sh
paseo plugin install ~/workspace/my-agents/paseo-plugins/titles
paseo plugin reload titles      # after edits; then refresh the app
paseo plugin logs titles        # one line per first-turn attempt and per retitle
paseo plugin disable titles
```

## Code layout and tests

- `shared/agent-titles.mjs`: pure agent-title policy (default-title rule, short-title check, answer parsing, conversation excerpt). Workspace titles would get a sibling module with their own rules and lifecycle; nothing here assumes agents are the only target.
- `server/model.ts`: prompt and Claude CLI call.
- `server/rename.ts`: compare-and-set rename over the local daemon RPC.
- `index.server.ts`: first-turn lifecycle, the `retitle` RPC, per-tab exclusivity.
- `index.client.tsx`: the three triggers, the pill and the toast.

`npm test` runs 7 tests on the pure policy: the default-title rule, which
titles count as short, keep-versus-rename parsing with identifier-safe Title
Case, rejection of bad answers, excerpt filtering, merging of agentic turns,
and bounds on long replies.
