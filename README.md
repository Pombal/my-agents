# .agents

My agentic stuff.

## OMP extensions

- [Turn a session into readable prose](.omp/extensions/prose), in place or into a fork. Ported to [plain Pi](pi/extensions/prose) too.
- [Keep one message verbatim and summarize everything before it](.omp/extensions/pivot)
- [Outline a session](.omp/extensions/minimap), tool traffic left out
- [Add to context without starting a turn](.omp/extensions/stage-note)
- [Schedule a prompt](.omp/extensions/delay-message), kept out of context until it fires
- [Hide magic words from the model](.omp/extensions/strip-keywords); the session file keeps them
- [Warn, stop subagents, or pause when a provider quota runs low](.omp/extensions/usage-guard)
- [Keep a running ledger of a long planning conversation](.omp/extensions/scribe), written by a cheap side model
- [`@imports` and `` !`shell` `` expansion in SKILL.md](.omp/extensions/skill-directives)
- [One theme](.omp/themes), in Nilo's colours; user messages white on brand green so they're easy to spot when scrolling

## Old sessions

- [Search every OMP session](scripts/@omp-find), reasoning and tool traffic included
- [Recap every session in a folder, then open OMP with the recap loaded](tools/omp-session-recap)
- [Cheap observer agents that journal a live session](tools/shadow-agent)
- [Reopen past sessions in Paseo](paseo-plugins/past-sessions), including OMP ones no agent owns anymore
- [Every link, image and file a chat mentioned](paseo-plugins/mentioned-links)

Several of these shell out to `omp-transcript`, which lives, of all places, in [`skills/tool-specific/omp-meta/scripts/`](skills/tool-specific/omp-meta/scripts).

## OMP inside Paseo

- [`/tan`, `/btw` and `/omfg` over RPC](.omp/extensions/headless-builtins), where they used to fall through to the model as plain prompts
- [Those three drawn as rows and sheets instead of chat bubbles, plus `/queue`](paseo-plugins/omp-slash-aliases). Needs the extension above.
- [OMP's `/tree`: go back to any earlier message and branch from there](paseo-plugins/session-tree). Also two halves, [OMP side here](.omp/extensions/session-tree).
- [`/side`: a visible child agent](paseo-plugins/side-agent) with Paseo's curated history or OMP's full memory
- [Your `.agents/commands/*.md` prompts one click away](paseo-plugins/agent-commands)
- [A tool that parks the session in Paseo's "needs input" state](.omp/extensions/await-decision)
- [Sleeping OMP chats](paseo-plugins/sleeping-tabs): idle ones closed, 250–290 MB each freed. Only on my daemon fork.
- [Build and test the fork against each upstream release](tools/paseo-fork-sync), conflicts to a non-interactive Opus resolver; [deploy it](tools/paseo-fork), but only a commit the sync passed

## Paseo UI

- [Dots on workspace rows for tabs that need you](paseo-plugins/tab-dots)
- [Pick the working indicator](paseo-plugins/turn-status)
- [One-word tab titles](paseo-plugins/titles), by Haiku
- [Your own provider icons](paseo-plugins/provider-icons)
- [Sidebar filters by project group](paseo-plugins/filter-presets)
- [Tidier sent messages](paseo-plugins/user-message-polish): pasted tag blocks fold, Markdown renders
- [Quieter diff colouring](paseo-plugins/chat-diff-highlight)
- [More app themes](paseo-plugins/popular-themes), and [T3 Chat's](paseo-plugins/t3-chat-theme)
- [Hide the composer controls you never use](paseo-plugins/composer-declutter)
- [My CSS tweaks, in one file](paseo-plugins/style-overrides)

New plugins start as a mock in [`paseo-mock-base/`](paseo-mock-base), a static copy of Paseo's screen with a switch for flipping design variants. I review by link; only then does it become a plugin.

## Several models on one problem

- [Fan a question to GPT, Claude and Gemini](skills/hermes/council), each answer relayed as it lands
- [Adversarial sessions on the same task](skills/hermes/adversarial-omp)
- [Blind multi-model PR review](skills/unorganised/panel-review): cluster, refute, report
- [Two independent reviewers and a synthesis](skills/hermes/pr-review-two-omp)

## Herdr

Herdr is the terminal multiplexer I run agents in.

- [Fork the focused OMP session into a pane](.herdr/plugins/omp-fork-pane); one variant runs `/prose` on the fork
- [PR number → worktree workspace](.herdr/plugins/pr-worktree)
- [Name tabs from their conversation](.herdr/plugins/tab-namer); agentless tabs show their foreground process
- [Break a pane out into a tab and back](.herdr/plugins/pane-breakout)
- [Run a hook in every new worktree](.herdr/plugins/worktree-setup), read from the original checkout so a branch can't change how its own worktree gets prepared
- [Restart settled OMP agents in their panes](scripts/restart-omp-sessions)
- [Parked plugin ideas](docs/herdr-plugin-ideas.md); nothing in there is started

## Skills

Loosely (!) by topic. `hermes/` and `t3-code/` are named for the harness that gets them. `_archive/` is retired. `vendor-*` is gitignored, so other people's skills don't get committed here.

- [Rehearse an implementation without running anything](skills/dev/dry-dev)
- [Merge main](skills/dev/merge-main)
- [Write a PR description](skills/dev/pr-description)
- [Write for agents](skills/misc/writing-for-agents), read before writing a skill
- [Write like Paul Graham](skills/misc/pith)
- [Write Simplified Technical English](skills/unorganised/ste100)
- [Generate images](skills/generative-ai) through fal or OpenRouter
- [Get spoilers a word at a time](skills/fun/spoiler-surfer), because I love testing my wild theories against what's coming but don't want the full answer dumped on me
- [Repair symlinks after a reorganization](scripts/link-doctor)

## Tampermonkey

[Install links](tampermonkey/README.md). Installs update from this repo's `main`.

- [Discord thread → markdown](tampermonkey/discord-thread-markdown.user.js), permalinks and attachment URLs kept
- [Tweet and its replies → one PNG](tampermonkey/x-tweet-shot.user.js), permalinks in the footer
- [Gmail search attachments → files](tampermonkey/gmail-attachment-harvester.user.js), named `Sender - filename`

---

If a folder has an `OVERVIEW.md` or `README.md`, that's the doc. Otherwise the source is.
