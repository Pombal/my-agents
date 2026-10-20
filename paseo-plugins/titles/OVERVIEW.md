# Titles

Short agent-tab titles: one word (two only when one word means nothing), Title
Case. No workspace titles, no tab or workspace icons.

## Three situations, three instructions

Claude Haiku gets the same title rules in every situation plus one short task
per situation. All of it is in `server/prompts.ts`: edit `RULES` for what a good
title is, or one of `first` / `every` / `manual` for one situation. In all three
it also sees the workspace's other tabs (below).

| Situation | When | Task |
| --- | --- | --- |
| `first` | After a reply, while the tab still has Paseo's placeholder name | Name the subject, or keep the placeholder if there is none yet ("hi") |
| `every` | After a reply, on a title Titles chose | Keep it while it names the subject, even if a sibling's title is the same or similar; rename when the subject moved |
| `manual` | Stefan presses Retitle | Always a new title, different from the current one and up to five earlier rejected ones |

## Sibling tabs

Before each Haiku call Titles lists the other agents of the same workspace
(not archived, no sub-agents, not the tab being titled) and passes them as
`siblings`. Haiku is told: "Like a hand-named sibling would, your title must
make clear what sets this conversation apart from the tabs in "siblings": its
own subject or angle, not a synonym or near-twin of theirs." So a second
inventory tab about count drift becomes *Idempotency*, not *Inventory*.

Each sibling goes in as one of:

| Sibling's title | Passed as |
| --- | --- |
| Equals its `titles.named` label (a title Titles chose) | the bare title, `"Inventory"` |
| Paseo's placeholder: equals its `titles.unnamed` label or the first line of one of its opening prompts (user messages among its first 20 timeline items) | `{"title":"hi, quick question coming up","note":"placeholder: first prompt line, not a title"}` |
| Anything else, including a Titles title later renamed by hand | `{"title":"Supplier Import","note":"named by hand"}` |

Only the last kind of title needs the sibling's timeline. The first-prompt lines
are cached in memory by agent id, since a first prompt never changes, so each
sibling's timeline is read at most once per plugin run (again only after a
failed read). In `every` mode a sibling clash alone never renames a tab: the
task tells Haiku to keep a title that still names the subject, so two tabs
don't keep renaming each other. If the lookup fails, Titles logs
`titles: siblings of <id> unavailable: …` and titles without siblings.

## Automatic titles (Settings → Plugins → titles → Titles)

One setting, **Automatic titles**:

- **Off**: titles change only when you retitle a tab.
- **After the first reply** (default): a new tab is named once its conversation
  has a subject. If the first reply has none ("hi, quick question"), the next
  reply tries again.
- **After every reply**: as above, and a tab Titles named is checked after each
  reply and renamed when the subject moved on. One Claude Haiku call per reply
  (about 3–5 s, on the Claude subscription).

**Names you set by hand are never changed automatically.** Titles only manages
two kinds of names: Paseo's placeholder (the first prompt line: first nonblank
line, whitespace collapsed, cut to 60 characters) of a tab created while Titles
runs, and a title Titles set itself. It remembers the latter in agent labels
(`titles.named`, and `titles.unnamed` for a placeholder still waiting for a
subject), so this survives plugin reloads and daemon restarts. Renaming a tab
by hand, at creation or later, takes it out of automatic titling; Retitle hands
it back. Every rename is a compare-and-set, so a rename while Claude thinks
wins.

Not adopted: tabs that existed before Titles was loaded with this version
(until you Retitle them once), and agents started from the CLI (`paseo run`),
whose first prompt isn't in the timeline Titles reads.

## Retitle on demand

Three triggers:

- **Ctrl+Shift+Alt+T** (web and desktop): applies to the selected agent tab of the pane you last clicked or focused (or the only pane). Terminal tabs, open dialogs, AltGr and IME input are left alone.
- **Ctrl+K / ⌘K → Retitle this tab.** On phones the Command Center is ☰ → **Search**.
- **`/retitle`** in the composer. It's a plugin command, so nothing is sent to the agent.

Retitling always picks a new title: pressing it means you dislike the current
one, whatever it is. The new title names what the **latest user message** is
about, and differs from the current title and the tab's last five rejected
titles (remembered until the plugin reloads), so pressing again gives yet
another one.

### Feedback

Nothing goes into the conversation. While Claude thinks (2–5 s), the check
shows in the same tick as the trigger:

- **Web and desktop:** a small spinner replaces the agent tab's icon (in every
  pane that shows the tab), drawn in the theme's foreground color.
- **Where the tab isn't on screen** (phone layouts, the native apps): a
  **Retitling…** toast with a spinner at the top.

The indicator ends in the same frame as one Paseo toast that reports the
outcome (it replaces the Retitling… toast):

| Outcome | Toast |
| --- | --- |
| Renamed | ✓ `Renamed to Sky Scattering (was Rayleigh)` (the "was" part only for short old names) |
| Nothing to name | ⚠ `Couldn't retitle: Claude found no subject to name` |
| Claude repeated a rejected title | ⚠ `Couldn't retitle: Claude offered “Rayleigh” again` |
| Renamed by hand meanwhile | ⚠ `Couldn't retitle: The tab was renamed meanwhile; that name stays` |
| Claude CLI missing / slow / broken | ⚠ `Couldn't retitle: Claude CLI not found on the daemon's PATH` (or `took longer than 20 s`, or its first error line) |

Pressing a trigger again while a check is running does nothing; the spinner
shows that a check is already under way. Two clients retitling the same tab at
once get `Already retitling this tab`.

Toasts are a hook-only plugin API, so a composer pill's icon component lends
one. On web that pill is hidden by CSS (`button:has([data-testid="titles-retitling-pill"])`);
on native apps it can't be hidden, so a faint **Retitling…** pill also sits
above the composer there. The Retitling… toast's spinner uses the host's
`icon` toast option, which the plugin's `ToastOptions` type doesn't declare;
if a Paseo version drops it, the toast is text-only.

### Why Ctrl+Shift+Alt+T

On non-Mac systems Paseo binds **Ctrl+Alt+T to Cycle theme**, and its
keyboard listener runs before any plugin's, so a plugin can't take that combo
over (an earlier version tried; the theme switched as well). Paseo matches
shortcut modifiers exactly, so adding Shift avoids both Cycle theme and
Ctrl+Shift+T (new terminal). Chrome doesn't use Ctrl+Shift+Alt+T either.
Keyboard layouts where Ctrl+Alt acts as AltGr are skipped (AltGraph check).

## Model

The plugin runs the installed **Claude Code CLI** with `--model haiku` through
Stefan's subscription login, so no API keys are used: the
`ANTHROPIC_*`/`CLAUDE_CODE_USE_*` variables are stripped. If the daemon's service
PATH omits `~/.local/bin`, Titles adds it for this Claude subprocess so native
Claude installations still work. The call uses
`--safe-mode`, no tools, no MCP, no saved session, and a 20 s timeout, with no
retries. It takes about 2.5–5 s end to end, depending on CLI startup.

The rules (`server/prompts.ts`) ask for one distinctive noun that sets this
tab apart from the `siblings`, two words at most. They
rule out words that fit any tab (Help, Fix, Bug, Task, Features, Setup) and the
workspace name, and keep identifiers' own casing (iOS, eBPF). Answers are
strict JSON. Anything over two words, decorated, or otherwise malformed is
rejected rather than truncated.

Prompt trials (2026-10-20, 25 calls, all valid): first → *SD Card*,
*Inventory*, and "keep" for "hi, quick question"; every-reply → kept *SD Card*
for an overlayfs follow-up 3/3, renamed to *Cold Brew* after a coffee question
3/3; manual with *SD Card* rejected → *OverlayFS*; with *Overlayfs* and *SD
Card* rejected → *Read-Only Root* or *Brownout*. Two wording details mattered:
"A noun, not a phrase or sentence" and the "Never three" cap cut three-word
answers to zero, and "a hyphen only inside a compound like Read-Only" keeps
*Read-Only Root* valid without inviting *SD-Card*.

Sibling trials (2026-10-20, final wording, 42 calls, all valid, 3 runs each):
next to *Inventory*, *Stock Sync* and an inventory-drift placeholder, an
inventory-table conversation → *Sticky Header* / *Sorting* (alone:
*Inventory*); next to a hand-named *Inventory UI* → *Virtualization*, *Sticky
Header*, *Sorting*; "hi, quick question" → keep 3/3. Every-reply with a sibling
of the same or a similar title → keep 6/6; moved to CSV export next to *CSV
Import* → *Stock Export* (once bare *Export*), next to *Stock Export* → *CSV
Stream* / *CSV*. Manual retitles avoided the siblings too. Two wording details
mattered: as a rule bullet the sibling sentence pushed Haiku to three-word
answers ("SD Card Corruption", 2 of 3 rejected), so it opens the prompt
instead; and "Resemblance to a sibling alone is no reason to rename" still
renamed 3/3 when a sibling had the exact title, while "keep … even when a
sibling has the same or a similar title. "siblings" matter only for a new
title" kept 24/24 across all runs.

The model sees a provider-neutral excerpt of the Paseo timeline: the last 12
user and assistant messages. Each agentic turn's assistant messages are merged
into one entry, and each entry is capped at 1,200 characters, keeping its start
and end, so a long or tool-heavy turn can't push the user's request out.

Renaming uses the daemon SDK's local `updateAgent` RPC over the loopback
endpoint, which is the same call as `paseo agent update --name`. The public
plugin API has no rename operation.

## Live verification (2026-10-20, hosted web app, daemon 0.12.0)

One Haiku 5.5 agent in a throwaway workspace, driven from the web app:

1. First reply about SD-card corruption → *SDCard* (4.2 s).
2. Unrelated cold-brew question, setting *After the first reply* → unchanged.
3. Setting switched to *After every reply*; next reply → *SDCard* → *Cold Brew*
   (3.8 s). A same-subject follow-up → `kept "Cold Brew"`.
4. Renamed by hand to "My Coffee Notes", then a sky-colour question → name
   unchanged.
5. `/retitle` → *Rayleigh*; `/retitle` again → *Sky Scattering*, toast
   `Renamed to Sky Scattering (was Rayleigh)`.

A second agent opened with "hi, quick question coming up" → `no subject yet`;
its next message (SSH passphrases) → *SSH Agent*. The setting was restored to
*After the first reply*; test agents, workspace and project were deleted.

| Screenshot | Shows |
| --- | --- |
| `19-settings-automatic-menu.png` | Settings → Plugins → titles → Titles, the three choices. |
| `20-settings-first-reply.png` | The setting with its one-line explanation. |

Found on the way: agents started with `paseo run` have no user message in
their timeline, so their placeholder isn't recognised and they stay untouched.

### Sibling tabs (same day)

Four Haiku 5.5 agents in one throwaway workspace, from the web app:

1. Inventory table jumps on sort, sticky header overlaps → *Inventory* (no
   siblings yet).
2. Inventory counts drift after the nightly supplier import → *Idempotency*
   (sibling *Inventory*). Then renamed by hand to "Supplier Import".
3. "hi, quick question coming up" → `no subject yet`.
4. Arrow-key navigation in the inventory table → *Keyboard*, with siblings
   `[{"title":"hi, quick question coming up","note":"placeholder: first prompt line, not a title"},{"title":"Supplier Import","note":"named by hand"},"Inventory"]`.
5. Retitle (Ctrl+Shift+Alt+T) on tab 1 → *Sticky* (siblings *Keyboard*, the
   placeholder, Supplier Import); on tab 4, after overwriting tab 3's
   `titles.unnamed` label so its placeholder had to be recognised from its
   timeline, → *Focus*.

A temporary log line showed one timeline read for "Supplier Import" across
three lookups (cache), and a second only when tab 3 needed one. The setting
stayed *After the first reply*; test agents, workspace and project were deleted.

## Earlier verification (2026-10-19, hosted web app, daemon 0.11.4)

These predate the three situations: manual retitles could then answer
"still fits", which they no longer do.

| Screenshot | Shows |
| --- | --- |
| `01-first-turn-title.png` | New Haiku agent about Raspberry Pi SD-card corruption → **SD Card** after its first reply (3.0 s). |
| `03-ctrl-alt-t-renamed.png` | Previous shortcut (Ctrl+Alt+T) on a hand-named tab ("My Coffee Notes") whose latest question was about cold brew → **Cold Brew**, plus the since-removed Cycle-theme warning. |
| `04-command-center-item.png` | Ctrl+K → *Retitle this tab*. |
| `05-command-center-kept.png` | Same subject → `“Cold Brew” still fits`. |
| `06-slash-command.png`, `07-slash-result.png` | `/retitle` on desktop web → kept, nothing posted to the chat. |
| `08-renamed-meanwhile.png` | Renamed via CLI while the check ran → compare-and-set refused, hand name kept. |
| `09-phone-slash-command.png`, `11-phone-result.png` | 390×844 touch layout: `/retitle` completion, kept toast. |
| `12-hand-name-preserved.png` | Renamed to "Umbrella Keeper Notes" while the first turn was still running; after the turn the log reads `kept hand-chosen "Umbrella Keeper Notes"`. |
| `13-before-faint-pill.png` | Before (Ctrl+Alt+T, previous version): the only indicator was a disabled pill at 50 % opacity, grey 12 px text, above the composer, far from the tab and the toast. |
| `14-command-center-tab-spinner.png`, `15-slash-tab-spinner.png`, `16-ctrl-alt-t-tab-spinner.png` | Mid-check on desktop web (1440×900) for each trigger: spinner in place of the tab icon, no pill. |
| `17-tab-spinner-closeup.png` | The tab row mid-check (light theme). |
| `18-phone-slash-loading-toast.png` | 390×844 touch layout, `/retitle` mid-check: **Retitling…** toast with spinner. |

Also seen live: an earlier drift test renamed *Lockfile* → *Altitude* after a
question about Everest. Indicator latency, trigger to indicator, measured in
the page with a MutationObserver (includes the automation's key dispatch):
⌘K 6–10 ms, `/retitle` 10 ms, keyboard shortcut 44 ms (measured with the
previous Ctrl+Alt+T, while Paseo's theme cycle also ran), phone
`/retitle` toast 94 ms (includes the tap). At phone width the shortcut has no
tab to target; `/retitle` and ☰ → Search (the Command Center) work. A missing
CLI was checked by running `decideTitle` with an
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
paseo plugin logs titles        # one line per automatic decision and per retitle
paseo plugin disable titles
```

## Code layout and tests

- `shared/agent-titles.mjs`: pure agent-title policy (placeholder rule, which titles Titles manages, how a sibling tab is described to Haiku, short-title check, answer parsing, conversation excerpt). Workspace titles would get a sibling module with their own rules and lifecycle; nothing here assumes agents are the only target.
- `shared/settings.ts`: the *Automatic titles* setting (`off` / `first` / `every`).
- `server/prompts.ts`: the shared rules and the three situation tasks.
- `server/model.ts`: Claude CLI call.
- `server/rename.ts`: compare-and-set rename plus ownership labels over the local daemon RPC.
- `index.server.ts`: automatic titling after each reply, the `retitle` RPC, per-tab exclusivity, the sibling lookup with its first-prompt cache.
- `index.client.tsx`, `client/settings.tsx`: the three triggers, the tab spinner, the toasts, the settings screen.

`npm test` runs 9 tests on the pure policy: the placeholder rule, which titles
count as short, which titles automatic titling may touch (hand names never),
how siblings are described (Titles' own, placeholder, hand-named, including a
Titles title renamed by hand), keep-versus-rename parsing with identifier-safe
Title Case, rejection of bad answers, excerpt filtering, merging of agentic
turns, and bounds on long replies.
