# .Agents

> Prompts like pressed flowers  
> kept between markdown pages  
> blooming on demand

Icon: a single white four-pointed sparkle with a black outline on a transparent background ([SVG](assets/icon.svg), [favicon](assets/favicon.ico)).

## Skills

- [Dry Dev](skills/dry-dev) — Rehearse an implementation as exact commands and diffs, executing nothing.
- [Merge Main](skills/merge-main) — Bring a branch up to date while preserving main’s intent and patterns.
- [Pith](skills/pith) — Dense, plain writing that respects the reader’s attention.
- [PR Description](skills/pr-description) — Write concise PR descriptions and bylined PR comments from the reviewer’s seat (non-Nilo repos).
- [Spoiler Surfer](skills/spoiler-surfer) — Surf future-story spoilers a coy word or two at a time.

## Extensions

Symlink a folder into `~/.omp/agent/extensions/` (or a profile's) to enable it.

- [prose](.omp/extensions/prose) — `/prose` distills a conversation into readable prose in place; `/prose fork` writes it to a new session instead; `^N` keeps the last N turns verbatim and distills the rest.
- [pivot](.omp/extensions/pivot) — `/pivot` keeps one message verbatim and summarizes everything before it.
- [minimap](.omp/extensions/minimap) — `/minimap` opens a keyboard-driven outline of the session.
- [skill-directives](.omp/extensions/skill-directives) — `@imports` and `` !`shell` `` expansion in SKILL.md.
- [delay-message](.omp/extensions/delay-message) — `/delay` schedules a prompt, kept out of context until it fires.
- [usage-guard](.omp/extensions/usage-guard) — enforces provider usage thresholds with warnings, subagent draining, or a global pause.
- [session-id](.omp/extensions/session-id) — tells the model which session it is running in.
- [stage-note](.omp/extensions/stage-note) — `/stage` appends text to context without starting a turn.
- [strip-keywords](.omp/extensions/strip-keywords) — hides magic keywords from the model while keeping them in the session file.

### Usage Guard

Configure `$PI_CODING_AGENT_DIR/usage-guard.json` (normally `~/.omp/agent/usage-guard.json`). Inactive until `/usage-guard activate`. `/usage-guard deactivate` stops enforcement for this session. `status`, `reload`, and `resume [provider]` inspect, reload, or acknowledge.

A rule must name an exact `limit`, `window`, or both from `omp usage --json --provider <provider>`. Actions are `warn`, `drain-subagents`, and `pause`; the strongest crossed action wins. `drain-subagents` blocks new `task` calls and leaves running jobs. `pause` engages OMP's process-global pause gate. An acknowledgement lasts for the current quota window, so a reset re-arms the rule. Headless `pause` drains new subagents instead, because there is no resume UI. Missing fresh data for an enforcement rule blocks new `task` calls.

```json
{
  "pollSeconds": 60,
  "forceRefreshSeconds": 60,
  "staleAfterSeconds": 180,
  "commandTimeoutSeconds": 20,
  "rules": [
    {
      "provider": "openai-codex",
      "window": "7d",
      "thresholdPercent": 50,
      "action": "drain-subagents"
    },
    {
      "provider": "anthropic",
      "window": "5h",
      "thresholdPercent": 90,
      "action": "pause"
    }
  ]
}
```

### Strip Keywords

Configure `$PI_CODING_AGENT_DIR/strip-keywords.json` (normally `~/.omp/agent/strip-keywords.json`). Each keyword is a literal, case-sensitive string, removed from user messages only where it stands as its own whitespace-delimited token. Edits apply on the next request; a missing or invalid file disables stripping.

```json
{ "keywords": ["@@ping"] }
```

## Pi Extensions

For the regular Pi harness, not OMP. Symlink a folder into `~/.pi/agent/extensions/` to enable it.

- [prose](pi/extensions/prose) — `/prose` forks the conversation into readable prose, like the OMP version minus `N`/`^N`/`-sub`; the archive is a `<session>.prose.md` file beside the fork.

## Herdr Plugins

Link a folder with `herdr plugin link <path>` to enable it.

- [OMP Fork Pane](.herdr/plugins/omp-fork-pane) — `prefix+shift+f` forks into a right-hand pane; `prefix+f` opens an OMP sidecar tab.
- [PR Worktree](.herdr/plugins/pr-worktree) — `prefix+p` asks for a PR number/URL and lands you in a worktree workspace for it.
- [Tab Namer](.herdr/plugins/tab-namer) — names unnamed tabs from agent conversations; agentless tabs get live foreground-process labels.

## Themes

Copy or symlink a file into `~/.omp/agent/themes/` (or a profile's), then pick it with `/theme`.

- [nilo](.omp/themes/nilo.json) — Dark theme in Nilo's colors. User messages are white text on a brand-green block, so they're easy to spot when scrolling. Green-tinted neutrals and tool backgrounds, a sky-cyan accent, and green-leaning syntax highlighting with quiet comments.

## Tools

Standalone applications and background daemons.

- [shadow-agent](tools/shadow-agent) — Background observer generating structured journals, commits, or telemetry from active sessions.
- [omp-session-recap](tools/omp-session-recap) — `@omp-session-recap [dir]`: summarizes every OMP session recorded in a folder with OMP's compaction prompts, after dropping fork-inherited and repeated text, then offers to open OMP there with the recap already in context.

## Scripts

Single-file CLI utilities.

- [pr-triage](scripts/pr-triage) — Score and rank open GitHub pull requests by yield-vs-effort.
- [link-doctor](scripts/link-doctor) — Check and repair broken markdown links across doc trees.

## Tampermonkey

Tampermonkey scripts. [Install links](tampermonkey/README.md).

- [Discord Thread → Markdown](tampermonkey/discord-thread-markdown.user.js) — Copy a Discord conversation as markdown, with permalinks and attachment URLs.
- [Gmail Attachment Harvester](tampermonkey/gmail-attachment-harvester.user.js) — Bulk-download attachments from the current Gmail search, renamed "Sender - filename".
- [X Tweet Shot](tampermonkey/x-tweet-shot.user.js) — Capture a tweet and its own replies as one PNG, permalinks stamped in the footer.
