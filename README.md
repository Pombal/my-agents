# .agents

My agentic stuff. Sorted by what it does, not where it lives.

<details><summary>Things that rewrite the conversation while you're still in it.</summary>

Mostly OMP slash commands in [`.omp/extensions/`](.omp/extensions). `/prose`
distills a session into readable prose, in place or into a fork, for when a
long session has become mostly machinery and the conversation is the only part
worth keeping. `/pivot` keeps one message verbatim and summarizes everything
before it, for when the agent's last message is the artifact and the research
behind it is dead weight. `/minimap` is a keyboard outline of the session with
the tool traffic left out. `/stage` appends text to context without starting a
turn, `/delay` schedules a prompt and keeps it out of context until it fires,
and `strip-keywords` hides magic words from the model while the session file
keeps them. One just reads the last reply aloud. [`pi/extensions/`](pi/extensions)
has a port of `/prose` for plain Pi, bare fork only.

</details>

<details><summary>Things that dig through old sessions.</summary>

`scripts/@omp-find` searches every OMP session, reasoning and tool traffic
included; a session matches only when every needle does. `tools/omp-session-recap`
summarizes every session recorded in a folder, then offers to open OMP there
with the recap already in context. In Paseo, `past-sessions` lists a
workspace's past sessions, including OMP ones no agent owns anymore, and
reopens them; `mentioned-links` collects every link, image and file you or the
agents mentioned. Under several of these sits `omp-transcript`, which reads
OMP, Claude Code, Codex and T3 Code transcripts and lives, of all places, in
`skills/tool-specific/omp-meta/scripts/`. `scribe` keeps a running ledger of a
long planning conversation, written by a cheap side model, and
`tools/shadow-agent` goes further: observer agents that watch a live session
and write journals, commits or telemetry from it.

</details>

<details><summary>OMP inside Paseo. Several of these come in two halves.</summary>

Paseo runs OMP over RPC, and some OMP built-ins only have a TUI handler, so
over RPC `/tan`, `/btw` and `/omfg` fell through to the model as plain prompts.
The OMP extension `headless-builtins` runs them headlessly; the Paseo plugin
`omp-slash-aliases` draws them (a tangent as one row, not a chat bubble; `/btw`
answers in a sheet) and adds `/queue`. The plugin needs the extension.
`session-tree` is the same shape: an OMP extension and a Paseo plugin that
together put OMP's `/tree` in Paseo, so you can go back to any earlier message
and continue from there as a new branch. `side-agent` spawns a visible child of
the current agent with `/side`, carrying either Paseo's curated history or
OMP's full memory. `agent-commands` puts your `.agents/commands/*.md` prompts
one click away in any chat. `await-decision` gives the model a tool that parks
the session in Paseo's "needs input" state.

`sleeping-tabs` only works on my Paseo daemon fork, where an idle OMP chat gets
closed and its memory (250–290 MB each) freed. `tools/paseo-fork-sync` brings
that fork up to each upstream release, builds and tests it, and hands merge
conflicts to a non-interactive Opus resolver; `tools/paseo-fork` refuses to
deploy a commit the sync didn't pass.

</details>

<details><summary>Paseo, the way I want it to look.</summary>

Most of [`paseo-plugins/`](paseo-plugins) is small UI: dots on each workspace
row for tabs that are unread, running or waiting on you; a working indicator
you pick yourself; one-word tab titles, by Haiku; your own provider icons;
sidebar filters by project group; your own messages with pasted tag blocks
folded into one line and Markdown rendered; quieter diff colouring in agent
replies; more app themes; a composer with the rarely used controls hidden. You
get the idea. `style-overrides` holds my personal CSS tweaks in one file
instead of spread across plugins. New plugins start as a mock in
[`paseo-mock-base/`](paseo-mock-base), a static copy of Paseo's screen with a
switch for flipping design variants; I review by link, and only then does it
become a plugin. On the OMP side there's one theme, in Nilo's colours, with
user messages white on brand green so they're easy to spot when scrolling.

</details>

<details><summary>More than one model on a problem.</summary>

`/council` fans one question out to GPT, Claude and Gemini and relays each
answer as it lands. `adversarial-omp` runs separate sessions against the same
task for high-confidence reasoning. `panel-review` reviews a PR with a blind
multi-model panel that clusters, refutes and reports; `pr-review-two-omp` does
it with two independent reviewers and a written synthesis. These are skills,
in [`skills/hermes/`](skills/hermes) and `skills/unorganised/`. The
counterweight is `usage-guard` in `.omp/extensions/`: it watches provider
usage and, past a threshold, warns, stops new subagents, or pauses the whole
process until you say resume.

</details>

<details><summary>Herdr: panes, worktrees, and tabs that name themselves.</summary>

Herdr is the terminal multiplexer I run agents in. In
[`.herdr/plugins/`](.herdr/plugins): `prefix+shift+f` forks the focused OMP
session into a side pane (one variant forks and runs `/prose` on it);
`prefix+p` takes a PR number or URL and lands you in a worktree for it;
unnamed tabs get names from their agent's conversation, and agentless tabs
show their foreground process; a pane can break out into its own tab and fold
back; and a hook runs inside every new worktree, always read from the original
checkout, so a branch can't change how its own worktree gets prepared.
`scripts/restart-omp-sessions` exits and resumes settled OMP agents in their
panes, with Herdr as the only source of truth about what's where.
[`docs/herdr-plugin-ideas.md`](docs/herdr-plugin-ideas.md) is the parked
backlog; nothing in it is started.

</details>

<details><summary>Skills, loosely grouped.</summary>

[`skills/`](skills) is by topic, loosely (!). `hermes/` and `t3-code/` are
named for the harness that gets them; `t3-code/` is for Claude Code and Codex,
kept out of OMP. `_archive/` is retired skills. `vendor-*` is gitignored, so
other people's skills don't get committed here. The dev ones are things like
`dry-dev` (a rehearsal: exact commands and diffs, nothing executed),
`merge-main`, `pr-description`, `grill-me`, and `writing-for-agents`, which is
what you read before writing one. Some are writing styles: `pith` channels
Paul Graham, `ste100` writes Simplified Technical English. A couple generate
images through fal or OpenRouter. And `spoiler-surfer` answers questions about
where a story is going with a coy word or two, because I love testing my wild
theories against what's coming but don't want the full answer dumped on me.
The OMP extension `skill-directives` adds `@imports` and `` !`shell` ``
expansion to SKILL.md. When skills get reorganized, `scripts/link-doctor`
repairs the symlinks that pointed at the old paths.

</details>

<details><summary>Userscripts, written for agents.</summary>

[`tampermonkey/`](tampermonkey) turns web pages into things an agent can take:
a Discord channel or thread as markdown with permalinks and attachment URLs, a
tweet and its own replies as one PNG with permalinks in the footer, the
attachments of a Gmail search as files named `Sender - filename`. Two of them
say "(for AI agents)" right in their name. [Install links](tampermonkey/README.md);
installs update from this repo's `main`.

</details>

If a folder has an `OVERVIEW.md` or `README.md`, that's the doc. If it has
neither, the source is the doc, and it's usually one file.
