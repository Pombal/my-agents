# .agents

My agentic stuff.

<details><summary>OMP extensions that <a href=".omp/extensions/prose">turn a session into readable prose</a>, <a href=".omp/extensions/pivot">keep one message and summarize everything before it</a>, <a href=".omp/extensions/minimap">outline a session</a>, <a href=".omp/extensions/stage-note">add to context without starting a turn</a>, <a href=".omp/extensions/delay-message">schedule a prompt</a>, <a href=".omp/extensions/strip-keywords">hide magic words from the model</a>, and <a href=".omp/extensions/usage-guard">stop subagents when a quota runs low</a>.</summary>

`/prose` works in place or into a fork, for when a long session has become
mostly machinery and the conversation is the only part worth keeping. `/pivot`
is for when the agent's last message is the artifact and the research behind
it is dead weight. `/minimap` leaves the tool traffic out of the outline.
`/delay` keeps the scheduled prompt out of context until it fires;
`strip-keywords` strips them from what the model sees but the session file
keeps them. `usage-guard` warns, stops new subagents, or pauses the whole
process until you say resume. [`pi/extensions/`](pi/extensions) has a port of
`/prose` for plain Pi, bare fork only.

</details>

<details><summary><a href="scripts/@omp-find">Search every OMP session</a>, <a href="tools/omp-session-recap">recap a folder's sessions and open OMP with the recap loaded</a>, <a href="tools/shadow-agent">have cheap observer agents journal a live session</a>; in Paseo, <a href="paseo-plugins/past-sessions">reopen past sessions</a> and <a href="paseo-plugins/mentioned-links">list every link and file a chat mentioned</a>.</summary>

`@omp-find` searches reasoning and tool traffic too, and a session matches
only when every needle does. `past-sessions` includes OMP sessions no Paseo
agent owns anymore. Under several of these sits `omp-transcript`, which reads
OMP, Claude Code, Codex and T3 Code transcripts and lives, of all places, in
[`skills/tool-specific/omp-meta/scripts/`](skills/tool-specific/omp-meta/scripts).
[`scribe`](.omp/extensions/scribe) keeps a running ledger of a long planning
conversation, written by a cheap side model.

</details>

<details><summary>Inside Paseo: <a href=".omp/extensions/headless-builtins">/tan, /btw and /omfg over RPC</a>, <a href="paseo-plugins/omp-slash-aliases">drawn as rows and sheets instead of chat bubbles</a>; <a href="paseo-plugins/session-tree">OMP's /tree, to branch from any earlier message</a>; <a href="paseo-plugins/side-agent">/side for a child agent</a>; <a href="paseo-plugins/agent-commands">your prompt files one click away</a>; and <a href="paseo-plugins/sleeping-tabs">sleeping OMP chats</a> on <a href="tools/paseo-fork">my daemon fork</a>.</summary>

Some OMP built-ins only have a TUI handler, so over RPC `/tan`, `/btw` and
`/omfg` fell through to the model as plain prompts. `headless-builtins` runs
them headlessly; `omp-slash-aliases` draws them and adds `/queue`. The plugin
needs the extension. `session-tree` is two halves as well, an OMP extension and
a Paseo plugin. `side-agent` carries either Paseo's curated history or OMP's
full memory into the child. [`await-decision`](.omp/extensions/await-decision)
gives the model a tool that parks the session in Paseo's "needs input" state.

On the fork, an idle OMP chat gets closed and its memory (250–290 MB each)
freed. [`paseo-fork-sync`](tools/paseo-fork-sync) brings the fork up to each
upstream release, builds and tests it, and hands merge conflicts to a
non-interactive Opus resolver; `paseo-fork` refuses to deploy a commit the
sync didn't pass.

</details>

<details><summary>Paseo UI: <a href="paseo-plugins/tab-dots">dots for tabs that need you</a>, <a href="paseo-plugins/turn-status">a working indicator you pick</a>, <a href="paseo-plugins/titles">one-word tab titles</a>, <a href="paseo-plugins/provider-icons">your own provider icons</a>, <a href="paseo-plugins/filter-presets">sidebar filters by project group</a>, <a href="paseo-plugins/user-message-polish">tidier sent messages</a>, <a href="paseo-plugins/chat-diff-highlight">quieter diffs</a>, <a href="paseo-plugins/popular-themes">more themes</a>, <a href="paseo-plugins/style-overrides">my CSS tweaks</a>; all <a href="paseo-mock-base">mocked first</a>.</summary>

`style-overrides` keeps the tweaks in one file instead of spread across
plugins. New plugins start as a mock in `paseo-mock-base/`, a static copy of
Paseo's screen with a switch for flipping design variants; I review by link,
and only then does it become a plugin. On the OMP side there's
[one theme](.omp/themes), in Nilo's colours, with user messages white on brand
green so they're easy to spot when scrolling.

</details>

<details><summary>Skills that put several models on one problem: <a href="skills/hermes/council">fan a question to GPT, Claude and Gemini</a>, <a href="skills/hermes/adversarial-omp">adversarial sessions on the same task</a>, <a href="skills/unorganised/panel-review">a blind multi-model PR review</a>, <a href="skills/hermes/pr-review-two-omp">two independent reviewers and a synthesis</a>.</summary>

`/council` relays each answer as it lands. `panel-review` clusters, refutes
and reports. The counterweight is `usage-guard`, above.

</details>

<details><summary>Herdr plugins: <a href=".herdr/plugins/omp-fork-pane">fork a session into a pane</a>, <a href=".herdr/plugins/pr-worktree">PR number → worktree</a>, <a href=".herdr/plugins/tab-namer">name tabs from their conversation</a>, <a href=".herdr/plugins/pane-breakout">break a pane out into a tab</a>, <a href=".herdr/plugins/worktree-setup">run a hook in every new worktree</a>; plus <a href="scripts/restart-omp-sessions">restart settled OMP agents in their panes</a>.</summary>

Herdr is the terminal multiplexer I run agents in. One fork variant runs
`/prose` on the fork. Agentless tabs get their foreground process as a name.
The worktree hook is always read from the original checkout, so a branch can't
change how its own worktree gets prepared. `restart-omp-sessions` treats Herdr
as the only source of truth about what's where.
[`docs/herdr-plugin-ideas.md`](docs/herdr-plugin-ideas.md) is the parked
backlog; nothing in it is started.

</details>

<details><summary>Skills: <a href="skills/dev/dry-dev">rehearse an implementation without running it</a>, <a href="skills/dev/merge-main">merge main</a>, <a href="skills/dev/pr-description">write a PR description</a>, <a href="skills/misc/writing-for-agents">write for agents</a>, <a href="skills/misc/pith">write like Paul Graham</a>, <a href="skills/unorganised/ste100">write Simplified Technical English</a>, <a href="skills/generative-ai">generate images</a>, <a href="skills/fun/spoiler-surfer">get spoilers a word at a time</a>.</summary>

[`skills/`](skills) is by topic, loosely (!). `hermes/` and `t3-code/` are
named for the harness that gets them; `t3-code/` is for Claude Code and Codex,
kept out of OMP. `_archive/` is retired skills. `vendor-*` is gitignored, so
other people's skills don't get committed here. `spoiler-surfer` exists
because I love testing my wild theories against what's coming but don't want
the full answer dumped on me. [`skill-directives`](.omp/extensions/skill-directives)
adds `@imports` and `` !`shell` `` expansion to SKILL.md. When skills get
reorganized, [`link-doctor`](scripts/link-doctor) repairs the symlinks that
pointed at the old paths.

</details>

<details><summary>Tampermonkey: <a href="tampermonkey/discord-thread-markdown.user.js">Discord thread → markdown</a>, <a href="tampermonkey/x-tweet-shot.user.js">tweet → PNG</a>, <a href="tampermonkey/gmail-attachment-harvester.user.js">Gmail attachments → files</a>. <a href="tampermonkey/README.md">Install links</a>.</summary>

The markdown keeps permalinks and attachment URLs; the PNG is a tweet with its
own replies, permalinks in the footer; the files are named `Sender - filename`.
Two of them say "(for AI agents)" right in their name. Installs update from
this repo's `main`.

</details>

If a folder has an `OVERVIEW.md` or `README.md`, that's the doc. Otherwise
the source is.
